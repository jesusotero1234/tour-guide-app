# 01 - Architecture Diagnosis (Audio & Narration Deep Dive)

## 1. Tour Generation Flow

### Entry Point
- **File**: `frontend/src/components/form/TourForm.tsx`
- User fills form → calls `POST /api/v1/tours/generate` via `frontend/src/lib/api.ts`

### Backend Controller
- **File**: `backend/src/api/controllers/tours.ts` (line 6-33)
- Validates request (`backend/src/api/middleware/validation.ts`)
- Delegates to `orchestrationService.generateCompleteTour(request)`

### Core Orchestration: `generateCompleteTour()`
- **File**: `backend/src/services/orchestrationService.ts` (line 70-164)

**Step-by-step flow:**

1. **Geocode city** (line 491-503)
   - `geocodeCity(city)` → `backend/src/infrastructure/geocoder/NominatimGeocoder.ts`
   - Calls Nominatim API: `https://nominatim.openstreetmap.org/search`
   - Returns lat/lng/bbox/displayName

2. **Fetch POIs from Overpass** (line 506-513)
   - `fetchPoisForTheme(geocoded, osmTheme)` → `backend/src/infrastructure/poi/OverpassPoiFetcher.ts`
   - Queries Overpass API with theme-specific tags (see `backend/src/domain/poi/themeTags.ts`)
   - Results cached in Postgres `poi_cache` table (city + theme key)

3. **Enrich POIs** (line 516-566)
   - For each POI with `wikidata` tag → `enrichFromWikidata()` (name translations)
   - For each POI with `wikipedia` tag → `enrichFromWikipedia()` (description + body text)
   - For each POI → `enrichFromWikidataClaims()` (structured claims)
   - Produces `EnrichedPoi[]`

4. **Rank POIs** (line 568-571)
   - `rankPois(enriched, lat, lng, topN)` → `backend/src/services/poi/PoiRanker.ts`
   - Scores by importance (Wikidata claims, Wikipedia presence, OSM tags)
   - Filters to top N candidates

5. **Compose walking route** (line 578-591, then line 410-483)
   - `composeWalkingTour(routeCandidates, requestedDuration)` 
   - Nearest-neighbor ordering from centroid anchor
   - Estimates walking time (4.2 km/h, 1.3x distance multiplier, 7 min/stop experience)
   - Selects best prefix fitting within 75%-115% of requested duration
   - Rejects segments > 1200m

6. **Generate narration** (line 595-618)
   - For each selected stop, calls `buildNarration()` → `backend/src/services/narrative/NarrativeBuilder.ts`
   - Calls **llm-pod** `POST /narrative/stop/long` (line 58-78 of NarrativeBuilder.ts)
   - Falls back to `POST /narrative/stop` (short endpoint), then to generic "Visit {name}."
   - Caches middle-stop narrations in `poi_narration_cache` (line 86-92)

7. **Fetch images** (line 125-128)
   - `wikimediaService.fetchImageForPlace()` → `backend/src/services/wikimediaService.ts`
   - Queries Wikimedia Commons API

8. **Save tour to DB** (line 116-117)
   - `tourRepository.save(tourToSave)` → Postgres (tours + places)

9. **Generate audio** (line 125-128, then line 834-925)
   - `generateAudio()` iterates places
   - Calls **tts-pod** `POST /tts/generate`
   - Stores WAV bytes locally, records metadata in Postgres
   - See Section 2 below for details

### Request/Response Types
- **File**: `backend/src/types/api.ts`
- `TourRequest`: city, country, countryCode, theme, language, durationMinutes
- `TourResponse`: id, city, country, countryCode, theme, language, durationMinutes, places[], route[], createdAt

---

## 2. Audio (TTS) Pipeline

### Active Path: TTS Pod (Kokoro ONNX)

**Entry**: `backend/src/services/orchestrationService.ts` line 870-879
```typescript
const ttsResponse = await axios.post(`${this.ttsServiceUrl}/tts/generate`, {
  text: place.description,   // Full narration text — NOT chunked
  language,
  metadata: { position, isFirst, isLast, placeName }
});
```

**TTS Pod Route**: `pods/tts-pod/src/routes/tts.ts` (line 29-48)
- Accepts `POST /tts/generate` → delegates to `kokoroService.generateSpeech()`

**Kokoro Service**: `pods/tts-pod/src/services/kokoro.ts` (line 55-140)
- **Model**: Kokoro ONNX (`kokoro-v1.0.onnx`) — local, no API key needed
- **Voice**: `af_sarah` (hardcoded default, line 58)
- **Speed**: 1.0 (no speed variation per stop position)
- **Format**: WAV
- **Process**:
  1. Sanitize text (remove markdown, special chars) — `sanitizeTextForPython()` lines 13-53
  2. Build a Python script string with text interpolated via triple quotes
  3. Spawn `python3 -c <script>` as child process (lines 98-113)
  4. Read generated WAV file, convert to base64
  5. Return `{ success, audioData (base64), format }`

**⚠️ Critical fragility**: The entire narration text is interpolated into a Python string. If the text contains unescaped triple quotes or other Python-breaking characters, the spawned process will fail. The sanitize function handles markdown but does NOT escape Python string delimiters.

**Backend Storage**: `backend/src/services/orchestrationService.ts` lines 892-905
```typescript
const storageResult = await this.audioStorage.save(
  place.id, language, format, ttsResponse.data.audioData
);
await this.audioAssetRepository.save({
  placeId, language, format, storagePath: storageResult.storagePath
});
```

**Local File Storage**: `backend/src/infrastructure/local-storage/LocalFileAudioStorage.ts`
- File: `./data/audio/{placeId}-{language}.wav` (e.g., `8d0c2fa1-...-en.wav`)
- URL: `http://localhost:3001/audio/{filename}` (served by Express static)

**Audio Metadata**: `backend/src/infrastructure/postgres/PostgresAudioAssetRepository.ts`
- Table: `audio_assets` (id, place_id, language, format, storage_path, created_at)

### Audio Proxy (Frontend)
- **File**: `frontend/src/app/api/audio/[id]/route.ts`
- Proxies audio from backend to avoid CORS (Next.js → Express on different ports)
- Supports both `.wav` filename proxy and legacy place-id catalog lookup
- **PlaceCard** resolves appropriate URL: `frontend/src/components/tour/PlaceCard.tsx` lines 13-38

### Primary TTS: VoxCPM Pod (ACTIVE — port 3006)
- **File**: `pods/voxcpm-pod/src/services/voxcpm.py`
- Model: `openbmb/VoxCPM2` (HuggingFace, runs on CUDA GPU)
- **DOES chunk text** at 420 chars: `pods/voxcpm-pod/src/utils/sanitize.py` `chunk_text()` lines 22-34
- Uses voice descriptions per language (lines 17-23 of voxcpm.py):
  - en: "A warm, friendly adult museum guide, calm baritone voice..."
  - es, fr, de, it: localized equivalents
- Supports two generation modes:
  - **Voice Design** (default): `f"({desc}){chunk}"` prompt per chunk
  - **Reference Audio** (if `referenceId`/`referenceWavPath` provided): conditions all chunks on a reusable speaker reference WAV
- Concatenates WAV chunks with crossfade + configurable silence: `join_audio_chunks()` (lines 56-85)
- Normalizes final audio to peak 0.95
- Active issues documented in Phase 15 of implementation roadmap

---

## 3. Voice Assignment

### Current state: NO multi-voice / caster system

The system has **no concept of different voices for different roles** (narrator, character quotes, different stops, etc.).

**TTS Pod (active)**:
- `pods/tts-pod/src/services/kokoro.ts` line 58: `voice = 'af_sarah'` — single hardcoded voice
- The `voice` parameter is accepted in the request but never forwarded from the backend
- `backend/src/services/orchestrationService.ts` line 870-878: The TTS request body does NOT include a `voice` field

**VoxCPM Pod (active primary)**:
- Voice is language-dependent via text description (voxcpm.py lines 17-23)
- Also supports reference-audio mode for voice consistency across chunks
- Still a single voice per generation call, just localized

**Why voices might sound like they "change" or are "garbled"**:
- With the active tts-pod, there should NOT be voice changes mid-file because it's one TTS call generating one flat file.
- However, **between stops**, the voice is technically re-initialized per stop (new Python process spawned each time). If the random seed varies, slight tonal differences can occur.
- The **VoxCPM pod** chunks text at 600 chars and concatenates — each chunk is a separate `model.generate()` call. This can cause audible seams/pitch discontinuities between chunks.

---

## 4. Data Model

### Domain Entities

**Tour** (`backend/src/domain/entities/Tour.ts`):
```typescript
interface Tour {
  id: string; city: string; country: string; countryCode: string;
  theme: string; language: string; durationMinutes: number;
  places: Place[]; createdAt: string; updatedAt: string;
}
```

**Place** (`backend/src/domain/entities/Place.ts`):
```typescript
interface Place {
  id: string; tourId: string; name: string; description: string;
  descriptionSections?: Record<string, string>;
  latitude: number; longitude: number; position: number;
  importanceScore?: number; imageUrl?: string; audioUrl?: string;
  createdAt?: string; updatedAt?: string;
}
```

**AudioAsset** (`backend/src/domain/entities/AudioAsset.ts`):
```typescript
interface AudioAsset {
  id: string; placeId: string; language: string; format: string;
  storagePath: string; audioUrl?: string; createdAt: string; updatedAt?: string;
}
```

### Prisma Schema (`backend/prisma/schema.prisma`)
- **Tour**: id(UUID), city, country, country_code, theme, language, duration_minutes, status, metadata(JSON), created_at, updated_at
- **Place**: id(UUID), tour_id(FK), name, description, lat, lng, position, importance_score, image_url, metadata(JSON), created_at, updated_at
  - `@@unique([tourId, position])` ensures ordered positions
- **AudioAsset**: id(UUID), place_id(FK), language, format, storage_path, duration_seconds(?), metadata(JSON), created_at, updated_at
  - `@@map("audio_assets")`
- **PoiCache**: id, city, theme, fetched_at, payload(JSON) — `@@unique([city, theme])`
- **PoiNarrationCache**: poi_id, language, theme, sections(JSON), narration, model_version — composite PK `@@id([poiId, language, theme])`
- **GenerationJob**: id, tour_id(FK?), status, step, error_code/message/details, timestamps

### API Transport Types

**Backend** (`backend/src/types/api.ts`):
- `TourRequest`: city, country, countryCode, theme, language, durationMinutes, duration? (legacy)
- `TourResponse`: id, city, country, countryCode, theme, language, durationMinutes, places[], route[], createdAt
- `Place`: id, tourId?, name, nameInTourLanguage?, description, descriptionSections?, position, latitude, longitude, coordinates? (legacy), importanceScore?, audioUrl?, imageUrl?

**Frontend** (`frontend/src/types/api.ts`):
- Mirrors backend types but with stricter `Theme` union: `'architecture' | 'history' | 'food'`
- `Language` union: `'en' | 'es' | 'fr' | 'de' | 'it'`

**TTS Pod** (`pods/tts-pod/src/types/api.ts`):
- `TTSRequest`: text, language? (KokoroLanguage), voice?, speed?, format? (wav|mp3)
- `TTSResponse`: success, audioUrl, audioData (base64), format
- `KokoroLanguage`: `'en-us' | 'en-gb' | 'fr-fr' | 'it' | 'ja' | 'cmn'`

### Narration Data Flow Types

**NarrativeBuilder** (`backend/src/services/narrative/NarrativeBuilder.ts`):
```typescript
interface BuiltNarration { narration: string; sections: NarrativeSections | null; }
interface NarrativeSections { arrival?: string; history?: string; significance?: string; transition?: string; }
```

**LLM Pod Long Narrative** (`pods/llm-pod/src/prompts/narrative/types.ts`):
```typescript
interface LongNarrativePromptInput {
  localName: string; seeds: LongNarrativeSeeds; theme: string; language: string;
  nextStopName?: string; position: 'first' | 'middle' | 'last';
  retry?: boolean; seedQuality?: 'rich' | 'thin'; targetWords?: string;
  cityName?: string; totalStops?: number; tourDurationMinutes?: number;
}
interface LongNarrativeSeeds {
  wikipediaLead?, wikipediaBody?, wikidataClaims?, osmTags?, wikivoyage?
}
```

---

## 5. Current Problems

### 5a. Narration Quality Issues

1. **Small local model**: Narration uses `qwen3:4b` via Ollama (pods/llm-pod/src/routes/narrativeLong.ts line 10). This is a very small 4B parameter model. Quality ceiling is low compared to GPT-4, Claude, or even larger open models.

2. **Thin seed data → formulaic output**: When Wikipedia/Wikidata data is sparse (total seed chars < 500), the system enters "thin" mode (narrativeLong.ts line 73-88): target drops to 35-55 words, and the tone becomes explicitly cautious ("Public sources are limited..."). Most non-major-city POIs will have thin data.

3. **Fallback texts are generic**: When LLM generation fails entirely, the fallback is `"Visit {name}, a notable location in this area."` (NarrativeBuilder.ts line 6, 108, 129). The narrativeLong.ts fallbacks (lines 138-206) are slightly better but still formulaic.

4. **No descriptive richness from description-pod**: The description-pod has richer prompt templates (conversational guide persona, "As you can see", "Look at") but is NOT used in the active path. The active path uses the llm-pod's narrative endpoint which produces more encyclopedic, less conversational text.

5. **Position awareness is minimal**: First/last stops get welcome/goodbye framing, but middle stops all get the same structural template (arrival → history → significance → transition). No neighborhood progression, no thematic arc building.

6. **Language for non-English may degrade**: The section system prompt requests specific language output, but the validation only checks for stop-word presence (narrativeLong.ts lines 44-53). A model switching to English mid-response would only be caught if English stop words outnumber target-language ones.

### 5a(i). Narration Degradation at Tour End — Root Cause Analysis

**User-visible symptom**: Narration starts well but near the last 1-3 stops, output becomes generic template text:
- *"We arrive at X, a history stop in Y. Public sources are limited, so the best approach is to observe carefully and stay grounded in the available facts."*
- *"For this walk, X works as a concrete clue in the local fabric. Its public data is modest..."*

#### Exact Code-Path Trace

Both outputs come from `fallbackSection()` in `pods/llm-pod/src/routes/narrativeLong.ts`:

| User Output | Code Location | Section |
|---|---|---|
| "We arrive at... Public sources are limited..." | `narrativeLong.ts:197` | `fallbackSection('arrival', ...)` English branch |
| "For this walk... works as a concrete clue..." | `narrativeLong.ts:203` | `fallbackSection('significance', ...)` English branch |

These are reached when `generateSection()` (lines 208-243) fails **all 2 validation attempts** for a given section. The full chain:

```
backend/orchestrationService.ts:520-570   → POI enrichment (may produce thin data)
backend/orchestrationService.ts:595-614   → Route composition, per-stop narration dispatch
backend/NarrativeBuilder.ts:58-78         → POST /narrative/stop/long with seeds
pods/llm-pod/narrativeLong.ts:68-70      → totalSeedChars(input) < 500 → 'thin'
pods/llm-pod/narrativeLong.ts:72-88      → policyFor(): targetWords='35 to 55', max_tokens=180
pods/llm-pod/narrativeLong.ts:214-240    → 2 attempts with llama3.1:8b via Ollama
pods/llm-pod/narrativeLong.ts:115-125    → validateSection() rejects output
pods/llm-pod/narrativeLong.ts:242        → fallbackSection() returns template text
```

#### Validation Rules That Cause Rejection (narrativeLong.ts:115-125)

| Rule | Line | Condition | Likelihood for thin-seed POIs |
|---|---|---|---|
| Word count | 117 | `< 25` or `> 130` words | **HIGH** — LLM with `num_predict: 180` may generate < 25 words when told "records are limited" |
| Generic shape | 118 | Starts with "Visit X, a notable..." | Low — LLM rarely matches exactly |
| Repetition | 119 | Same 3-word sequence > 3 times | Very low for 35-55 word texts |
| Language signal | 120 | < 2 target-language stop words | **Medium** — Short text may lack enough "the/is/was/of/and" |
| Coordinates | 121 | Contains `\d{1,3}\.\d{3,}` pattern | Very low |
| Unsupported drift | 122-123 | WWII/France terms not in seed data (thin only) | **Medium** — LLM commonly hallucinates war/geopolitical references |

**Most likely failure modes for the user's reported POI (Monument to Federico García Lorca):**

1. **Word count too low**: LLM is told "If records are sparse, say so honestly" (history prompt, line 11) and thin-guard says "say that clearly" (types.ts:43). The model produces ~15-20 words of honest thin-data acknowledgment → rejected.
2. **`num_predict: 180` causes truncated JSON**: Ollama's `format: 'json'` mode with tight token budgets can produce unclosed JSON objects. `parseSection()` (line 127-136) returns `null` → falls back with reason `json-parse`.
3. **`hasUnsupportedDrift` false positive**: LLM knows Lorca = Spanish Civil War, might hallucinate "World War II" or "France" context terms. The drift list (lines 90-102) blocks these but is **too narrow** — it does NOT include "Spanish Civil War", "Guerra Civil", "Renaissance", "Baroque", or any culturally-specific historical terms.

#### Root Cause: Why It Happens at the END of Tours

**Cause 1 — Geographic routing pushes data-poor POIs to the end**

- `PoiRanker.ts:20-41`: POIs with `wikidata` (+3), `wikipedia` (+2), and description (+2) score 5+ points higher than POIs with only OSM tags. The top-N filter picks the highest-scoring POIs.
- `orchestrationService.ts:354-411`: `orderVerifiedPlaces()` uses nearest-neighbor routing from the most important POI near the centroid. Peripheral POIs (geographically further from center) land at the end of the route.
- Peripheral POIs are statistically more likely to be small/local landmarks with less Wikipedia/Wikidata coverage → thin seed data.

**Cause 2 — Last stop bypasses cache, regenerates every time**

- `NarrativeBuilder.ts:47`: `const shouldUseCache = position === 'middle'`. First and last stops **always** hit the LLM pod fresh, never serve from `poi_narration_cache`.
- If a thin-data POI at position `last` fails validation every time, there's no opportunity for a successful generation to be cached. The user experiences the fallback on every tour creation.
- Second-to-last and third-to-last stops (`position === 'middle'`) would use cache — but if they were never successfully generated (always fell back), the cached version IS the bad fallback text, perpetuating the problem.

**Cause 3 — Thin-mode generation parameters create a self-defeating feedback loop**

The thin-mode design assumes data-poor POIs need less text (35-55 words vs 70-90), so it reduces `num_predict` (180 vs 260). But:
- The system prompt is the same length regardless of seed quality (~150-200 tokens)
- The `thinGuard` instruction adds ~40 more tokens of "be honest about limitations"
- The JSON format wrapper consumes output tokens
- With only 180 tokens to generate, the model is squeezed between "be honest and say data is limited" and "produce 35-55 words" — it often produces a short honest acknowledgment that fails the 25-word minimum

**Cause 4 — Retry strategy is identical for both attempts**

`generateSection()` (lines 214-240) retries with the same prompt structure, only adding: "Previous output failed quality checks. Rewrite in English, be specific, avoid generic tourist filler, avoid repetition, and stay close to the requested word range." (types.ts:57). Temperature drops from 0.4 to 0.25. But if the problem is structural (too little seed data to reach 25 words), a second identical attempt with slightly lower temperature won't help.

#### Additional Inconsistencies Found

1. **`MODEL_VERSION` cache mismatch**: `NarrativeBuilder.ts:8` hardcodes `MODEL_VERSION = 'qwen3:4b-long-v3'` for cache keys, but `narrativeLong.ts:10` uses `NARRATIVE_MODEL = 'llama3.1:8b'` for actual generation. Cache key doesn't reflect the generating model — if model changes, stale cache entries persist.

2. **`wikipediaLead` naming confusion**: `orchestrationService.ts:558` sets `wikipediaLead: description`, where `description` is actually a 3-sentence Wikipedia extract (`WikipediaEnricher.ts:38-39`: `exintro: true, exsentences: 3`). The name implies it's the lead paragraph, but it's the same short extract stored as `description`. In `narrativeLong.ts:59`, `seedText()` includes `seeds.wikipediaLead` thinking it's additional content — but for POIs without Wikipedia tags, both `wikipediaLead` and `wikipediaBody` are null.

3. **`hasUnsupportedDrift` term list is geographically narrow** (narrativeLong.ts:90-102): Only blocks: France, French, WWII terms (English/Spanish/French/German), WWI terms in Spanish. Missing: any Mediterranean, Asian, African, or American historical terms. A monument in Madrid that triggers LLM hallucination of "Spanish Civil War" passes the drift check.

4. **`droppedReasons` are returned but never logged**: `narrativeLong.ts:272-288` includes `meta.droppedReasons` in the response, but `NarrativeBuilder.ts:80-93` does not inspect or log `meta`. The validation failure reason is silently discarded.

### 5b. Audio Splicing / Garbling Issues

1. **No text chunking in active TTS path**: The `tts-pod` (Kokoro) receives the FULL narration text as one blob (orchestrationService.ts line 871). Kokoro ONNX processes it in one Python call (kokoro.ts lines 72-93). Very long texts could exceed Kokoro's effective processing window, causing degradation at the end of long narrations.

2. **Python string interpolation risk**: The sanitized text is placed inside Python triple quotes (kokoro.ts line 84: `text="""${sanitizedText}"""`). The sanitizer removes markdown but does NOT escape `"""` sequences or other Python-breaking characters that could appear in legitimate text.

3. **Separate Python processes per stop**: Each TTS call spawns a new `python3 -c` process (kokoro.ts line 98). This means:
   - Model reload overhead each time (Kokoro initialization at the top of the script)
   - Potential slight voice variation between stops due to separate random initializations
   - No warm-start optimization

4. **VoxCPM chunk concatenation artifacts** (if ever wired): `voxcpm-pod/src/services/voxcpm.py` lines 54-60 chunk text at 600 chars, generate each separately, then `np.concatenate()` them. Each chunk gets a fresh voice prompt, which can cause:
   - Slight pitch/timbre shifts at chunk boundaries
   - Audible "clicks" or discontinuities where numpy arrays join
   - Different pacing between chunks

5. **No audio post-processing**: Neither TTS pod applies crossfade, silence padding, normalization, or any post-processing. Raw model output is written directly to WAV.

6. **Single file per stop**: The frontend AudioPlayer (`frontend/src/components/tour/AudioPlayer.tsx`) loads one `<Audio>` element per place. There's no mechanism for crossfading between stops or gapless playback. User must manually advance.

### 5c. Voice Consistency

1. **Single voice throughout**: `af_sarah` (Kokoro) is the only voice used. There's no variation between narrator vs. quoted speech, no gender variation, no character voices.

2. **No voice selection mechanism**: The TTS request type accepts `voice` but the backend never sends it. There's no per-position, per-theme, or per-language voice mapping.

3. **VoxCPM voice descriptions**: Even the VoxCPM pod only varies by language, not by role or position. The descriptions are identical in tone ("warm, friendly adult guide").

### 5e. Frontend UX Issues

1. **State-locked create flow** (`frontend/src/app/page.tsx:23`): Home page gates form visibility on `!currentTour`. After tour creation, `currentTour` is set (`TourForm.tsx:87`) and never cleared — `clearTour()` exists in Zustand store (`store.ts:21,49`) but has zero call sites. The Header's "Generate New Tour" button links to `/` but can't show the form. User must refresh browser.

2. **No progress visibility**: `generateCompleteTour()` is fully synchronous (geocode → POI → enrich → rank → compose → narrate → save → audio → return). Frontend shows one spinner for the entire pipeline. User has no indication of which step is running or how long remains.

3. **Silent per-place audio failures**: `generateAudio()` (`orchestrationService.ts:838-961`) sets `audioUrl: ''` on TTS failure and continues. User discovers missing audio only when reaching that stop in the detail view.

### 5d. Architecture / Flow Issues

1. **VoxCPM as primary, Kokoro as fallback (now wired)**: `backend/src/services/orchestrationService.ts` lines 917-920 attempt VoxCPM first (port 3006), then Kokoro (port 3005). VoxCPM pod is the active primary TTS provider. Kokoro is fallback but often not running.

2. **Description pod is dead code in active path**: The active OSM pipeline calls `buildNarration()` → llm-pod directly, completely bypassing the description-pod. The `generateDescriptions()` method in orchestrationService.ts (lines 745-829) is never called from `generatePlacesFromOsm()`.

3. **LLM pod place generation is also dead code**: `generateInitialPlaces()` method (lines 626-651) calls `POST /generate/places` on the llm-pod but is only used in the old (non-OSM) flow.

4. **Language code mismatch**: Backend sends app language codes (e.g., `'en'`, `'fr'`) but the TTS pod expects Kokoro-specific codes (`'en-us'`, `'fr-fr'`). The mapping is implicit and incomplete.

5. **No streaming audio**: All audio is generated as complete files. There's no streaming TTS for real-time playback during tour generation. Users must wait for full audio generation before playback.

---

## Architecture Diagram (Text-Based)

```
                            TOUR GENERATION FLOW
                            
  FRONTEND                    BACKEND                         PODS                    STORAGE
  ────────                    ───────                         ────                    ───────
                                                                                     
  TourForm ──POST────────► tours controller                                          
   (city,theme,            (controllers/tours.ts:6)                                  
    lang,duration)              │                                                     
                                ▼                                                     
                         orchestrationService                                       
                         .generateCompleteTour()                                     
                         (orchestrationService.ts:70)                                
                                │                                                     
              ┌─────────────────┼─────────────────┐                                  
              ▼                 ▼                   ▼                                 
         Nominatim          Overpass API       Wikimedia Commons                      
         (geocode)          (POI fetch)        (images)                              
              │                 │                   │                                 
              │         ┌───────┴───────┐           │                                 
              │         ▼               ▼           │                                 
              │    Wikidata Enrich  Wikipedia Enrich │                                 
              │    (name trans)     (descriptions)   │                                 
              │         │               │           │                                 
              │         └───────┬───────┘           │                                 
              │                 ▼                   │                                 
              │           PoiRanker                 │                                 
              │           (score + topN)            │                                 
              │                 │                   │                                 
              │                 ▼                   │                                 
              │      composeWalkingTour()           │                                 
              │      (route order +                 │                                 
              │       duration fit)                 │                                 
              │                 │                   │                                 
              │                 ▼                   │                                 
              │      ┌─────────────────────┐        │                                 
              │      │  buildNarration()    │        │                                 
              │      │  (NarrativeBuilder)  │───────►│  llm-pod:3002                  
              │      │                      │        │  POST /narrative/stop/long    
              │      │  per stop:           │        │  (qwen3:4b via Ollama)        
              │      │  - arrival section   │        │                               
              │      │  - history section   │        │  Sections joined with \n\n    
              │      │  - significance      │        │  → single narration text       
              │      │  - transition        │        │                               
              │      └─────────────────────┘        │                                 
              │                 │                   │                                 
              │                 ▼                   │                                 
              │      tourRepository.save() ─────────────────────► Postgres           
              │      (tours + places)                              tours, places      
              │                 │                                                        
              │                 ▼                                                        
              │      ┌─────────────────────┐                                             
              │      │  generateAudio()     │                                             
              │      │  per stop:           │───────►│  tts-pod:3005                 
              │      │  - POST /tts/generate│        │  Kokoro ONNX (af_sarah)       
              │      │  - full narration    │        │  Single voice, single call     
              │      │    text as one blob  │        │  → base64 WAV                 
              │      │  - no chunking       │        │                               
              │      └─────────────────────┘        │                                 
              │                 │                   │                                 
              │                 ├──► audioStorage.save()                               
              │                 │    (LocalFileAudioStorage)                           
              │                 │    ./data/audio/{id}-{lang}.wav  ──► local disk     
              │                 │                                                      
              │                 └──► audioAssetRepository.save()                       
              │                      (PostgresAudioAssetRepository)                    
              │                      audio_assets row  ──► Postgres                    
              │                                                                        
              ▼                                                                        
         TourResponse                                                                  
         {places w/ audioUrls}                                                         
              │                                                                        
              ▼                                                                        
  FRONTEND: TourDetailPage                                                            
  ─────────────────────────                                                           
  PlaceCard ──► AudioPlayer                                                           
                 (native <Audio>)                                                     
                      │                                                               
                      ▼                                                               
              /api/audio/[id] proxy ──► backend /audio/{file}.wav                     
```

---

## Summary of Key Findings

| Area | Finding | Severity |
|------|---------|----------|
| Narration | Uses qwen3:4b (small local model), thin data → generic output | High |
| Narration | Description pod (richer prompts) not used in active path | Medium |
| Audio | Full text sent as one blob to Kokoro, no chunking | Medium |
| Audio | Python string interpolation of narration text is fragile | High |
| Audio | VoxCPM chunks + concatenates → audible seams (if wired) | Low |
| Voice | Single hardcoded voice (af_sarah), no role system | Low |
| Voice | No voice variation between narrator, quotes, or stops | Low |
| Architecture | Two TTS pods running, one wired | Low |
| Architecture | Description pod + LLM place gen are dead code | Medium |
| Language | App codes vs Kokoro codes mismatch | Medium |
| Playback | No gap-between-stops handling in frontend | Low |

---

## 6. Frontend UX Issues — Tour Creation & Navigation (2026-05-24)

### 6a. Tour Shown Before Audio Ready

**Finding**: The UX flow is misleading — the frontend shows a spinner during a single blocking POST, but the backend generates audio synchronously before returning. If the request succeeds, audio IS ready. If it times out, the user gets an error. There is no intermediate state where the tour is shown without audio.

**However**, the real UX problem is threefold:

1. **No progress visibility**: The user sees one spinner for the entire generation pipeline (geocoding → POI fetch → enrichment → ranking → narration → image fetch → audio generation). This can take **minutes** (each place has a 3-minute TTS timeout at `orchestrationService.ts:897`). The user has no idea what step is happening.

2. **Silent audio failures**: If TTS fails for a place, the backend sets `audioUrl: ''` (empty string) and continues (`orchestrationService.ts:917-921`). The frontend `PlaceCard` handles this gracefully with an error message, but the user isn't told *during generation* that audio failed — they discover it when they reach that place.

3. **No async job model used**: The `GenerationJob` table exists in the Prisma schema (`schema.prisma:63-78`) with fields `status`, `step`, `error_code`, etc. — but **it is never read or written by any application code** (zero occurrences in `backend/src/`). Similarly, the `Tour.status` column defaults to `"created"` but is never updated to `"generating"` or `"completed"`. The entire generation is a single synchronous request.

**Files & lines:**

| File | Lines | Role |
|------|-------|------|
| `frontend/src/components/form/TourForm.tsx` | 82–101 | Single `fetch()` POST, sets tour+nav on success, spinner during wait |
| `frontend/src/lib/api.ts` | 13–45 | `generateTour()` — plain `fetch()` with no timeout, no streaming, no polling |
| `backend/src/services/orchestrationService.ts` | 74–168 | `generateCompleteTour()` — synchronous: geocode → POI → enrich → rank → compose → narrate → save → audio → return |
| `backend/src/services/orchestrationService.ts` | 838–961 | `generateAudio()` — serial per-place TTS with 180s timeout, empty `audioUrl` on failure |
| `backend/prisma/schema.prisma` | 63–78 | `GenerationJob` model — **dead schema, never used in runtime** |
| `backend/prisma/schema.prisma` | 18 | `Tour.status` default `"created"` — **never updated during generation** |

**Root cause**: The architecture was designed with an async job model in mind (the `GenerationJob` table and `Tour.status` field), but the implementation never materialized. The backend blocks on the entire pipeline. The frontend has no polling, no SSE, and no mechanism to show per-step progress.

---

### 6b. Navigation After Tour Creation — User Cannot Create a New Tour

**Finding**: After a tour is created and the user navigates to the tour detail page, they **cannot return to the tour creation form** without refreshing the page.

**The bug chain:**

1. **Form submission** (`TourForm.tsx:87-89`): `setTour(tour)` sets `currentTour` in the Zustand store, then `router.push('/tours/${tour.id}')` navigates to the detail page.

2. **Home page gate** (`page.tsx:23`): The home page renders the `TourForm` **only if** `!currentTour`; otherwise it renders `PlaceList`. Since `currentTour` is set, the form is hidden.

3. **`clearTour()` is never called**: The store defines `clearTour` (`store.ts:21,49`) but **no component ever invokes it**. Searched entire `frontend/src/` — zero call sites.

4. **Header's "Generate New Tour" button** (`Header.tsx:38-42`): Links to `/`, but since `currentTour` is still set, the home page shows `PlaceList`, not the form. **The button is a no-op**.

5. **Tour detail page navigation** (`tours/[id]/page.tsx:65-73`): Has only a "Back to Tours" link (→ `/tours`). No "Create New Tour" button on the detail page itself.

**Result**: The user is stuck. The only way to see the tour form again is to **refresh the browser** (which clears the in-memory Zustand store).

**Files & lines:**

| File | Lines | Role |
|------|-------|------|
| `frontend/src/app/page.tsx` | 23 | `!currentTour` gate — hides form when any tour is in store |
| `frontend/src/lib/store.ts` | 21,49 | `clearTour()` defined but **never called** |
| `frontend/src/components/form/TourForm.tsx` | 87–89 | Sets `currentTour` on submit, never clears it |
| `frontend/src/components/layout/Header.tsx` | 38–42 | "Generate New Tour" links to `/` — broken because store retains old tour |
| `frontend/src/app/tours/[id]/page.tsx` | 65–73 | "Back to Tours" link only — no way to create a new tour |

**Root cause**: Zustand store `currentTour` is set on form submission and never cleared. The home page uses `currentTour` presence as the sole condition to show/hide the form. The fix is trivial: either call `clearTour()` from the Header's "Generate New Tour" button, or add a "Create New Tour" button that clears the store and navigates to `/`.

---

### 6c. Generation Job Status Tracking — Dead Data Model

**Finding**: The `GenerationJob` table in the Prisma schema is a fully-designed async job tracking model that is **completely unused at runtime**.

**Evidence:**
- `GenerationJob` model in `prisma/schema.prisma` (lines 63–78): Has `id`, `tourId` (FK), `status`, `step`, `errorCode`, `errorMessage`, `errorDetails`, `createdAt`, `updatedAt`, `startedAt`, `finishedAt`
- **Grep for `GenerationJob|generationJob|generation_job` in `backend/src/`**: **Zero results**
- **Grep for `GenerationJob` in entire project (`.ts` files)**: Only found in `backend/prisma/seed.ts` (a hardcoded seed row, not application logic)
- `Tour.status` column (default `"created"`): Never updated to `"generating"` or `"completed"` during actual generation
- `Tour.status` is not even present in the domain entity `backend/src/domain/entities/Tour.ts` — it's only a database column, invisible to the application code

**The frontend has no async awareness at all:**
- No `useSWR` (zero occurrences)
- No `EventSource` / SSE (zero occurrences)
- No `setInterval` / polling (zero occurrences)
- The entire flow is: `await generateTour(request)` → single blocking `fetch()` → navigate

**What the intended architecture likely was** (inferred from schema design):
```
POST /tours/generate → return tour with status="generating" + generationJobId
Frontend polls GET /tours/{id}/status or listens on SSE
Backend updates generation_jobs row: step="fetching_pois" → "generating_narration" → "generating_audio" → status="completed"
When status="completed", frontend shows the tour with audio ready
```

**What actually happens:**
```
POST /tours/generate → blocks for 2–10 minutes → returns complete tour (or error)
Frontend shows spinner → gets tour → navigates to detail page
```

**Files & lines:**

| File | Lines | Role |
|------|-------|------|
| `backend/prisma/schema.prisma` | 63–78 | `GenerationJob` model — designed but unused |
| `backend/prisma/schema.prisma` | 18 | `Tour.status` — exists in DB, ignored in code |
| `backend/src/domain/entities/Tour.ts` | 1–14 | Domain entity — no `status` field |
| `backend/prisma/seed.ts` | 55–64 | Hardcoded `generationJob` seed — only runtime reference |

**Root cause**: The `GenerationJob` table was created alongside the Prisma schema baseline (Phase 2.1, per agent log entry `2026-05-17T18:40:19Z`), but the async generation flow was never implemented. The backend remained synchronous, and the frontend never added polling/SSE. The data model and the runtime behavior diverged.

**Impact**: Not a current bug (the synchronous flow works), but a **capability gap**. Without async job tracking:
- The frontend can't show per-step progress
- Failed generations leave no trace (no error record in `generation_jobs`)
- The system can't support long-running generations that exceed HTTP timeouts
- No observability into generation pipeline health

---

## 7. Narration Logging/Observability Audit (2026-05-24)

### Purpose

This section audits **every log statement** (or lack thereof) across the full narration pipeline to determine whether the system can trace **why narration quality degrades at the end of tours**. The audit covers five files plus the cache layer and prompt builders.

---

### 7a. File-by-File Log Inventory

#### File 1: `backend/src/services/narrative/NarrativeBuilder.ts` (131 lines)

| Line | Statement | Type | What It Logs | What It Does NOT Log |
|------|-----------|------|--------------|----------------------|
| 57 | `console.log('[NarrativeBuilder] calling', url, 'for', localName)` | `log` | URL + localName | Seed quality/size, theme, language, position, nextStopName, tourMeta (totalStops, duration) |
| 96 | `console.warn('[NarrativeBuilder] Empty long narration for "${localName}", trying short endpoint')` | `warn` | localName, that fallback is happening | **Why** it was empty (did longResponse return 200 with empty narration? Did sections exist but narration was empty string? Was it `undefined`?) |
| 107 | `console.warn('[NarrativeBuilder] Empty narration for "${localName}", using fallback')` | `warn` | localName, generic fallback | Which endpoint failed (long → short → generic), what the short response looked like |
| 112 | `console.warn('[NarrativeBuilder] Failed to generate long narration for "${localName}": ${axiosErr.message}')` | `warn` | localName, axios message | HTTP status code, response body, timeout vs network error distinction |
| 126 | `console.warn('[NarrativeBuilder] Failed to generate short narration for "${localName}": ${shortAxiosErr.message}')` | `warn` | localName, axios message | Same as line 112 |

**Critical missing logs in NarrativeBuilder.ts:**
1. **Seed data size/quality before sending** — never logged. Cannot determine if a POI had thin seeds without inferring from downstream.
2. **`meta` field from llm-pod response** — lines 80-93 extract `narration` and `sections` but never inspect `longResponse.data.meta` (which contains `droppedReasons`, `seedQuality`, `totalSeedChars`). The validation failure reasons are silently discarded.
3. **Cache hit/miss** — logged in `PostgresNarrationCacheRepository` (Lines 32, 36, 58), but cached content quality is never inspected (e.g., "cached version uses fallback text").
4. **Section count in response** — never logged. A response with 0 sections is treated the same as one with 4.

---

#### File 2: `pods/llm-pod/src/routes/narrativeLong.ts` (301 lines)

| Line | Statement | Type | What It Logs |
|------|-----------|------|--------------|
| 292 | `console.error('[narrativeLong] generation error:', error)` | `error` | Uncaught exception in handler |

**That is the ONLY log statement in this entire 301-line file.**

Every single decision point is silent:

| Code Location (Line) | Decision Point | Currently Logged? | What Should Be Logged |
|----------------------|----------------|--------------------|-----------------------|
| 72-88 | `policyFor()` — seed quality classification, targetWords, sectionNames | **NO** | `seedQuality`, `totalSeedChars`, `targetWords`, which sections are included/excluded |
| 214-240 | `generateSection()` — per-section generation loop | **NO** | Section name, attempt number, model used, seed quality, position in tour |
| 225-228 | LLM call failure (`!response.success \|\| !response.content`) | **NO** | The `response.error` value (e.g., 'Ollama chat error: ...', 'Empty chat response') |
| 231-235 | `parseSection()` failure — JSON parse failed | **NO** | The raw `response.content` that failed to parse; was it truncated? Empty? Non-JSON? |
| 237-239 | `validateSection()` passes — output accepted | **NO** | Which section, word count, what passed validation |
| 237-239 | `validateSection()` **rejects** — which rule? | **NO** | The **specific** rejection reason string (e.g., `'word-count-18'`, `'language-drift'`, `'unsupported-drift-World War II'`), the word count, the offending content excerpt |
| 242 | `fallbackSection()` invoked | **NO** | Which section name, the `lastReason` string, the position/first/last context |
| 127-136 | `parseSection()` logic | **NO** | Whether JSON was extracted from the response, the parsed value |
| 245-299 | Route handler — request received | **NO** | Seed sizes per field (wikipediaLead chars, wikipediaBody chars, wikidataClaims key count, osmTags key count), model used, position, language |
| 275-278 | Final `narration` assembly | **NO** | How many sections were successful vs fallback, the final word count |

**The only information that makes it back to the caller** is `meta.droppedReasons` in the JSON response (line 288), but as noted above, NarrativeBuilder.ts **never inspects or logs it**.

---

#### File 3: `pods/llm-pod/src/llm/model.ts` (228 lines)

This file is the only place with relatively comprehensive logging, but it has structural problems.

**`complete()` method (lines 87-146):**

| Line | Statement | Type | Coverage |
|------|-----------|------|----------|
| 89-90 | `console.log('\n=== LLM Request ===')` + `'Prompt:', options.prompt` | `log` | Full prompt text logged — **VERY verbose**, could be thousands of chars |
| 111-112 | `console.log('\n=== Raw Response ===')` + `'done:', ..., 'done_reason:', ...` | `log` | Only `done` boolean and `done_reason` |
| 129, 132 | `console.error('\n=== LLM Error ===')` + `'Response:', axiosError.response?.data` | `error` | Error response body |

**`chat()` method (lines 167-225):**

| Line | Statement | Type | Coverage |
|------|-----------|------|----------|
| 169-171 | `console.log('\n=== LLM Chat Request ===')` + `'System:', ...` + `'User:', ...` | `log` | **Logs the FULL system and user prompt** — extremely verbose, system prompts are ~300 words each |
| 194-195 | `console.log('\n=== LLM Chat Response ===')` + `'done_reason:', ..., 'eval_count:', ...` | `log` | `done_reason` and `eval_count` (token count generated) |
| 209, 212 | `console.error('\n=== LLM Chat Error ===')` + `'Response:', ...` | `error` | Error response body |

**Critical missing logs in model.ts:**

| Missing Information | Why It Matters |
|---------------------|----------------|
| **Model name** in the chat request log | The chat method accepts `options.model` but the log only shows prompts. Cannot tell which model (llama3.1:8b vs qwen3:4b) handled which request. |
| **Temperature and num_predict** in the chat request log | Cannot verify that thin-mode is actually sending `num_predict: 180` and that retry sends `temperature: 0.25`. |
| **Request-to-response timing** | No timestamp before request or after response. Cannot measure LLM latency per section. |
| **`format: 'json'` flag** | Not logged. Cannot verify JSON mode was enabled. |
| **`think` flag** | Not logged. Cannot verify think mode was disabled (set to `false` in narrativeLong.ts line 222). |
| **Raw response content** for chat | For `complete()`, the raw response content IS the return value (line 32 of narrativeLong: `response.content`). For `chat()`, the content is logged only indirectly via narrative.ts line 62. narrativeLong.ts **never logs the raw chat response content** — it's passed directly to `parseSection()`. |
| **Structured/unstructured logging** | All logs are bare `console.log` with ASCII-art separators. No JSON, no timestamps, no request IDs, no correlation IDs. |

---

#### File 4: `pods/llm-pod/src/prompts/narrative/*.ts` (5 files)

**All five files log NOTHING.** These are pure functions that construct prompt objects.

| File | Lines | Does It Log? |
|------|-------|--------------|
| `types.ts` | 1-67 | **No** |
| `arrival.ts` | 1-27 | **No** |
| `history.ts` | 1-14 | **No** |
| `significance.ts` | 1-16 | **No** |
| `transition.ts` | 1-26 | **No** |

None of the prompt builders log:
- The final prompt string length (system + user combined)
- Which seeds were included/excluded (e.g., wikivoyage: `'none'`, wikipediaLead null → skipped)
- The `retry` flag state (whether the retry-specific prompt suffix was included)
- The `thinGuard` message presence
- The `compactRecord` truncation (osmTags or wikidataClaims exceeding 1200 char limit — silently truncated)

---

#### File 5: `backend/src/services/orchestrationService.ts` (981 lines)

The orchestration service is the most-logged file, but all narration-quality-specific information is missing from the `generatePlacesFromOsm()` method (lines 493-625) that calls `buildNarration()`.

| Line | Narration-Related Log | Issue |
|------|----------------------|-------|
| 595-614 | `selectedRoute.map(... buildNarration(...))` | **No per-stop narration logging at all.** The orchestration service delegates entirely to NarrativeBuilder's own logging. It never logs: which POI had which position, whether narration succeeded, narration word count, sections generated. |
| 619 | `description: builtNarration.narration` | The final narration is stored on the place object, but the orchestration service never summarizes or audits narration quality across all stops. |

**What the orchestration service DOES log (for context):**

| Lines | Content | Quality |
|-------|---------|---------|
| 507 | `[OSM] Geocoded city: ${displayName}` | Good |
| 517 | `[OSM] Raw POIs: ${count}` | Good, but doesn't log how many had wikidata/wikipedia tags |
| 575 | `[OSM] Ranked POIs: ${count}` | Good |
| 416 | `Verified candidate count: ${count}` | Good |
| 482-485 | Selected stop count, walking meters, estimated minutes, rejection reasons | **Good** — this is useful for diagnosing why certain stops were selected |
| 62-67 | Service URLs at startup | Good |

---

#### Bonus: `backend/src/infrastructure/postgres/PostgresNarrationCacheRepository.ts` (60 lines)

| Line | Statement | Type |
|------|-----------|------|
| 32 | `console.log('[NarrationCache] miss for ${poiId}/${language}/${theme}')` | `log` |
| 36 | `console.log('[NarrationCache] hit for ${poiId}/${language}/${theme}')` | `log` |
| 58 | `console.log('[NarrationCache] write for ${poiId}/${language}/${theme}')` | `log` |

**Missing:** The cache logs don't indicate:
- Whether the cached content is a fallback/generic text or a successful LLM generation
- The section count in the cached content
- The age of the cached entry (when it was created)

---

### 7b. The End-of-Tour Degradation Trace: What Current Logs CAN and CANNOT Tell You

Here is the exact code path that produces degraded end-of-tour narration, annotated with what current logs reveal at each step.

```
Step 1: POI enrichment (orchestrationService.ts:520-570)
  LOG: [OSM] Raw POIs: N          — tells total POI count
  GAP: No per-POI enrichment result log (how many got wikidata? wikipedia? claims?)
  GAP: No log of seed data size per POI (wikipediaLead chars, wikidataClaims count, osmTags count)

Step 2: POI ranking (orchestrationService.ts:572-575)
  LOG: [OSM] Ranked POIs: N       — tells how many passed the rank filter
  GAP: No per-POI score breakdown (why did score drop for certain POIs?)
  GAP: No indication of seed data distribution (how many ranked POIs are thin vs rich?)

Step 3: Route composition (orchestrationService.ts:595-614)
  LOG: Selected stop count, walking meters, estimated minutes, rejection reasons
  GAP: No per-stop position annotation (which POIs ended up at first/middle/last?)
  GAP: No per-stop seed quality indicator

Step 4: per-stop Narration dispatch (orchestrationService.ts:599-614)
  Each stop calls buildNarration() which calls:
  
  4a. Cache check (NarrativeBuilder.ts:49-54)
      LOG (from PostgresNarrationCacheRepository): hit/miss for poiId/lang/theme
      GAP: No indication if cached content is a fallback vs successful generation

  4b. POST /narrative/stop/long (NarrativeBuilder.ts:57-78)
      LOG: [NarrativeBuilder] calling ... for {localName}
      GAP: No log of seeds sent (size of each seed field)
      GAP: No log of position/first/last/nextStopName/tourMeta
      
      → llm-pod receives request (narrativeLong.ts:245)
        GAP: NO LOG AT ALL at request receipt — seed sizes, model, policy unknown
        
        4b-i. policyFor() determines seedQuality (line 72-88)
              GAP: NO LOG — cannot tell if this POI is 'rich' or 'thin'
        
        4b-ii. Each section generated via generateSection() (line 214-243)
               GAP: NO LOG — no per-section attempt/result logging
        
        4b-iii. LLM call via model.chat() (line 216-224)
                LOG (from model.ts): Full system+user prompts, done_reason, eval_count
                GAP: No timing, no model name, no temperature, no num_predict
        
        4b-iv. parseSection() extracts JSON (line 231)
               GAP: NO LOG — if parse fails, raw content is lost
        
        4b-v. validateSection() checks output (line 237)
              GAP: NO LOG — which check failed? word count? language drift?
              GAP: NO LOG — what was the rejected content?
        
        4b-vi. fallbackSection() returns template (line 242)
               GAP: NO LOG — which section fell back? what was the final reason?
      
      → llm-pod returns response (line 280-289)
        includes meta.droppedReasons, meta.seedQuality, meta.totalSeedChars
        GAP: NarrativeBuilder IGNORES meta entirely (lines 80-93)
        GAP: NO LOG of droppedReasons, seedQuality, or totalSeedChars

  4c. Cache write (NarrativeBuilder.ts:87-92)
      LOG: [NarrationCache] write for poiId/lang/theme
      GAP: No log of WHAT was cached (fallback text vs successful generation)

Step 5: Final assembly (orchestrationService.ts:616-622)
  GAP: NO LOG per stop of final narration word count
  GAP: NO LOG of which stops used fallback vs successful generation
  GAP: NO summary log: "Tour narration: 3/7 stops succeeded, 4 used fallback"
```

---

### 7c. Gap Analysis: Critical Missing Observability Data

Organized by diagnostic question — if you want to answer "why is narration bad at the end?", here's what you need and where it's missing.

#### Gap 1: Seed Data Distribution Across Tour Stops

**Question**: Are the last 1-3 stops systematically data-poor compared to the first stops?

| What data is needed | Where it should be logged | Currently logged? |
|---------------------|---------------------------|-------------------|
| Per-POI seed total character count | `orchestrationService.ts` after enrichment (line 569) | **NO** |
| Which seed fields are populated (wikipediaLead, wikipediaBody, wikidataClaims, osmTags) | Same location | **NO** |
| Per-POI PoiRanker score breakdown (wikidata +3, wikipedia +2, description +2, etc.) | `PoiRanker.ts:53` | **NO** — only final score stored, not component breakdown |
| Per-stop position in route (which POI is first, middle, last) | `orchestrationService.ts:599-614` | **NO** — positions are computed but not logged |

**Impact**: Without this, you cannot prove or disprove Cause 1 (geographic routing pushes data-poor POIs to route end).

#### Gap 2: Policy Decision Trace (rich vs thin)

**Question**: Is the thin-policy being correctly assigned, and is it the right policy?

| What data is needed | Where it should be logged | Currently logged? |
|---------------------|---------------------------|-------------------|
| `totalSeedChars(input)` value | `narrativeLong.ts:72` before `policyFor()` call | **NO** |
| `seedQuality` (`'rich'` / `'thin'`) | `narrativeLong.ts:73` | **NO** — only returned in response meta, which is discarded |
| `targetWords` value | `narrativeLong.ts:77` or `:85` | **NO** |
| Which `sectionNames` are included (e.g., transition excluded for thin+last?) | `narrativeLong.ts:78-80` check for `input.position === 'last'` with thin | **NO** |
| Per-seed-field breakdown (wikipediaLead chars, wikipediaBody chars, wikidataClaims chars, osmTags chars) | `narrativeLong.ts:56-65` `seedText()` | **NO** |

**Impact**: Cannot determine if the thin/rich boundary (500 chars) is appropriate or if individual seed fields are unusually large/small.

#### Gap 3: Per-Section Generation Attempt Details

**Question**: Why did validation reject this section? What did the LLM actually produce?

| What data is needed | Where it should be logged | Currently logged? |
|---------------------|---------------------------|-------------------|
| Attempt number (1 or 2) | `narrativeLong.ts:214` | **NO** |
| Temperature and num_predict used per attempt | `narrativeLong.ts:220-221` | **NO** (model.ts logs prompts but NOT these params) |
| Raw LLM response content (before JSON parse) | `narrativeLong.ts:226` after `response.content` | **NO** (model.ts logs system+user prompt but NOT the response content for chat calls) |
| JSON parse success/failure + raw JSON string | `narrativeLong.ts:231-235` | **NO** |
| Parsed section text (if parse succeeded) | `narrativeLong.ts:231` | **NO** |
| Word count of parsed section | `narrativeLong.ts:237` before `wordCount(section)` | **NO** |
| Specific rejection reason string (e.g., `'word-count-18'`, `'language-drift'`, `'unsupported-drift-World War II'`) | `narrativeLong.ts:238` | **NO** |
| Whether retry succeeded or also failed | `narrativeLong.ts:239` (loop end) | **NO** |
| Fallback section text and the `lastReason` | `narrativeLong.ts:242` | **NO** |

**Impact**: Literally ZERO visibility into why any individual section was rejected. The most common failure modes (word count too low, language drift, unsupported drift) are completely invisible.

#### Gap 4: LLM Request/Response Diagnostics

**Question**: Is the LLM timing out? Producing truncated JSON? Running out of tokens?

| What data is needed | Where it should be logged | Currently logged? |
|---------------------|---------------------------|-------------------|
| Model name used for this request | `model.ts:167` chat method | **NO** — model name is only in the request body, not logged |
| `num_predict` (max_tokens) in request | `model.ts:184` | **NO** |
| `temperature` in request | `model.ts:183` | **NO** |
| `format: 'json'` flag | `model.ts:181` | **NO** |
| Request-to-response latency (ms) | `model.ts:188` before/after `axios.post` | **NO** |
| Prompt token count (if available from Ollama) | — | **NO** |
| `eval_count` (tokens generated) | `model.ts:195` | **YES** — only thing logged |
| `done_reason` (e.g., `'stop'`, `'length'`, `'load'`) | `model.ts:195` | **YES** |
| Raw `message.content` from chat response | `model.ts:197` | **NO** — returned to caller but not logged in model.ts for chat; caller (narrativeLong.ts) also doesn't log it |

**Impact**: If the LLM generates truncated JSON because `num_predict: 180` is too tight, the only evidence is `done_reason: 'length'` — but `done_reason` cannot be cross-referenced with `num_predict` because neither narrativeLong.ts logs the params nor model.ts logs them clearly. The raw content that failed JSON parse is also lost.

#### Gap 5: End-to-End Correlation

**Question**: Which tour generation attempt produced which narration failures?

| What data is needed | Where it should be logged | Currently logged? |
|---------------------|---------------------------|-------------------|
| Tour-level request ID / correlation ID | At entry in `orchestrationService.ts:75` and propagated to all downstream calls | **NO** |
| Per-stop narration summary (succeeded/failed, sections count, word count) | `orchestrationService.ts:616-622` | **NO** |
| Aggregated tour narration quality metrics | After all stops processed in `orchestrationService.ts:616-622` | **NO** |
| Tour-level summary: "7 stops, 4 rich/3 thin, 2 fallback sections, avg words: X" | End of `generatePlacesFromOsm()` or `generateCompleteTour()` | **NO** |

**Impact**: With no correlation IDs and no aggregated metrics, logs from parallel tour generation requests are interleaved and un-traceable. If two users generate tours simultaneously, you cannot reconstruct which log line belongs to which tour.

#### Gap 6: Cache Quality Blindness

**Question**: Is the cache helping or hurting? Are we caching failed generations?

| What data is needed | Where it should be logged | Currently logged? |
|---------------------|---------------------------|-------------------|
| Whether cached content is a fallback text | `PostgresNarrationCacheRepository.ts:36` (on hit) | **NO** |
| Cached section count | Same | **NO** |
| Age of cached entry | Same | **NO** |
| Whether cache write was for a successful or fallback generation | `NarrativeBuilder.ts:87-92` | **NO** |
| Whether cache key model_version matches actual generation model | `NarrativeBuilder.ts:8` vs `narrativeLong.ts:10` | **NO** — the mismatch (qwen3:4b-long-v3 cache key vs llama3.1:8b generation) is invisible in logs |

**Impact**: Cache could be pernicious — a failed generation cached once means `position: 'middle'` stops always serve the bad output, while `position: 'first'/'last'` stops always regenerate (and fail again). No log distinguishes cached-quality from fresh-quality.

---

### 7d. Summary of Logging Severity

| Severity | Count | Description |
|----------|-------|-------------|
| **CRITICAL** | 8 gaps | Zero visibility into per-section validation failures, policy decisions, or seed quality — the core decision points that determine narration quality |
| **HIGH** | 6 gaps | No correlation IDs, no per-stop narration summary, no timing, cache quality blind |
| **MEDIUM** | 4 gaps | Prompt builder seed tracing, model parameter logging, structured log format, retry attempt differentiation |
| **LOW** | 2 gaps | Verbose prompt logging (security/performance concern), stale cache model version mismatch |

### 7e. Quickest Wins (Minimal Log Statements to Add)

If implementing full structured logging is out of scope, adding just these 6 log statements would give 80% visibility into end-of-tour degradation:

1. **`narrativeLong.ts` line 72** (after `policyFor()` call):
   ```ts
   console.log(`[narrativeLong] policy: ${policy.seedQuality} (${totalSeedChars(input)} chars), target: ${policy.targetWords}, sections: [${policy.sectionNames}]`)
   ```

2. **`narrativeLong.ts` line 238** (when validation rejects):
   ```ts
   console.warn(`[narrativeLong] ${name} validation failed: ${validationError} (word count: ${wordCount(section)})`)
   ```

3. **`narrativeLong.ts` line 242** (when fallback is used):
   ```ts
   console.warn(`[narrativeLong] ${name} → fallback (reason: ${lastReason})`)
   ```

4. **`NarrativeBuilder.ts` line 82** (after receiving long response):
   ```ts
   console.log(`[NarrativeBuilder] long response for "${localName}": meta=${JSON.stringify(longResponse.data?.meta)}`)
   ```

5. **`orchestrationService.ts` line 616** (after all narrations built):
   ```ts
   console.log(`[orchestration] Narration summary: ${adapted.filter(p => p.descriptionSections).length}/${adapted.length} stops with sections, avg description length: ${Math.round(adapted.reduce((s,p) => s + p.description.length, 0) / adapted.length)} chars`)
   ```

6. **`model.ts` line 194** (add model/temp/numpredict to existing chat response log):
   ```ts
   console.log('model:', options.model || this.model, 'temp:', options.temperature, 'num_predict:', options.max_tokens, 'done_reason:', ..., 'eval_count:', ...)
   ```
