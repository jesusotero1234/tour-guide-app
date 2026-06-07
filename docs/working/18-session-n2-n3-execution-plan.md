# 18 — Sessions N+2 and N+3 Execution Plan

**Date drafted:** 2026-05-20
**Parent docs:** `docs/working/16-osm-first-multilingual-plan.md`, `docs/working/17-mvp-roadmap.md`
**Executor:** another LLM, no human-in-loop expected. Read this doc top-to-bottom, follow phases in order.
**Engine choice (locked):** VoxCPM2 (https://github.com/OpenBMB/VoxCPM) replaces Kokoro. Apache-2.0. 30 languages including en/es/fr/de/it. No fallback engine needed — Phase 0 is verification-only, not branch selection.

---

## 0. Operating Rules for the Executor

1. Read `16-osm-first-multilingual-plan.md` and `17-mvp-roadmap.md` before touching code. This doc expands their Sessions N+2 and N+3.
2. Honor `AGENTS.md`: surgical changes, simplicity-first, do not "improve" adjacent code.
3. Do not propose features outside Sessions N+2 and N+3.
4. If reality contradicts this plan, write findings into a "Discoveries" section in `docs/working/19-session-n2-n3-execution-log.md` and continue with the corrected understanding. Do not silently work around it.
5. Run `npx tsc --noEmit` after each phase that touches TypeScript. Halt and fix on error.
6. Cold-generation runs in Phase 5 are **mandatory proof**. Do not declare done without them.

---

## 1. Goal & Non-Goals

### Goal
A solo traveler picks a city, language, theme, duration, gets a guided walking tour with a map, numbered stops, audio narration in their language, a welcome on stop 1, a goodbye on the final stop, and a "Next stop" button.

### MVP success criteria (from doc 17, restated as assertions)
- Tour generates for Valencia/Madrid/Paris/München cold-cache.
- Every stop has a non-null `audioUrl` pointing to a playable WAV.
- First stop's narration starts with a welcome substring matching the language.
- Last stop's narration ends with a goodbye substring matching the language.
- Frontend `/tours/[id]` shows a Leaflet map + current-stop card + Next button.
- Mobile viewport (375x812) is usable.

### Non-goals (do not implement)
- Real-time geolocation / "you are here"
- Offline audio download
- Multi-day itineraries
- City autocomplete in form
- User accounts / saved tours / sharing
- Photo galleries beyond a single image per stop
- Voice cloning, voice design (VoxCPM features we will not use)

---

## 2. Discoveries (audit results, 2026-05-20)

These contradict or refine doc 17. The plan below is corrected accordingly.

| Item | Doc 17 said | Reality | Plan impact |
|---|---|---|---|
| Map module | "exists, needs audit" | `frontend/src/components/tour/map/{components,hooks,providers,types,utils}/` are **empty directories**. No Leaflet code exists. | N+3 is build-from-scratch (minimally), not patch. |
| Tour page composition | implied to show map | `frontend/src/app/tours/[id]/page.tsx` renders only `<PlaceList tour={tour}/>`. No map, no progression, no autoplay. | Wiring is greenfield, not a tweak. |
| TTS engine | Kokoro (en/fr/it/ja/zh) at `:3005` | Confirmed: `pods/tts-pod/src/services/kokoro.ts` spawns `python3 -c "..."` with `kokoro_onnx`. Output: WAV file → base64. | VoxCPM swap can mirror the spawn pattern OR live in a dedicated Python pod. Plan picks **dedicated Python pod** for clarity (see Phase 1 rationale). |
| Narrative prompts | welcome/goodbye missing | Confirmed: `arrival.ts` has no first-stop branch; `transition.ts` has no last-stop branch. `LongNarrativePromptInput` lacks `cityName`, `totalStops`, `tourDurationMinutes`. | Phase 3 work is exactly as described in doc 17. |
| Tour-metadata flow | needs threading | `orchestrationService.ts:582` already passes `position` and `nextStopName`. Adding 3 more fields is a 1-line call-site change + matching builder/prompt extensions. | Lower risk than doc 17 suggested. |
| `MODEL_VERSION` | bump to `qwen3:4b-long-v3` | Currently `qwen3:4b-long-v2` at `NarrativeBuilder.ts:7`. | Direct bump. |
| VoxCPM language coverage | "must verify in Phase 0" | Verified via repo README: 30 languages including English, Spanish, French, German, Italian. Apache-2.0. | Phase 0 reduced to a model-download dry-run; no fallback engine needed. |

---

## 3. Architecture After This Plan

```
Frontend (Next.js 15, :3000)
  └── /tours/[id]
        ├── <Header/>
        ├── <TourMap/>            (NEW — dynamic import, ssr:false)
        ├── <CurrentStopCard/>    (NEW — wraps existing PlaceCard)
        └── <NextStopButton/>     (NEW)

Backend (:3001)
  └── orchestrationService → buildNarration(... cityName, totalStops, duration)
                                    │
                                    ▼
llm-pod (:3002)  /narrative/stop/long
  └── prompts/narrative/{arrival,transition}.ts  (welcome / goodbye branches)

voxcpm-pod (:3006, NEW, Python/FastAPI)
  ├── POST /tts/generate  → {success, audioData(base64), audioUrl, format}
  └── POST /tts/audio     → text/plain URL

backend → voxcpm-pod   (env: TTS_POD_URL)
backend → tts-pod      (legacy Kokoro, kept on :3005, switch via env only)
```

The contract `{success, audioData, audioUrl, format}` is preserved exactly so the backend swap is **one env var**.

---

## Phase 0 — VoxCPM Capability Verification (no code)

**Goal:** confirm VoxCPM2 runs on the target machine before pod scaffolding.

### Steps

1. Check GPU availability:
   ```bash
   nvidia-smi || echo "NO GPU — CPU fallback path"
   ```
2. Decide hardware path:
   - **GPU present (≥8GB VRAM):** standard install.
   - **No GPU:** still proceed; VoxCPM2 runs on CPU at lower RTF. Document expected cold-gen time (~10–30s per 100-word chunk).
3. Smoke-install in a throwaway venv:
   ```bash
   python3.10 -m venv /tmp/voxcpm-spike
   source /tmp/voxcpm-spike/bin/activate
   pip install voxcpm soundfile
   ```
4. One-shot synthesis test for each MVP language. Save script as `/tmp/voxcpm-spike/test.py`:
   ```python
   from voxcpm import VoxCPM
   import soundfile as sf
   m = VoxCPM.from_pretrained("openbmb/VoxCPM2", load_denoiser=False)
   for lang, text in [
       ("en", "Welcome to this history walking tour of Valencia."),
       ("es", "Bienvenido a este recorrido por la historia de Valencia."),
       ("fr", "Bienvenue dans cette promenade historique à Paris."),
       ("de", "Willkommen zu diesem historischen Spaziergang durch München."),
   ]:
       wav = m.generate(text=text, cfg_value=2.0, inference_timesteps=10)
       sf.write(f"/tmp/voxcpm-spike/{lang}.wav", wav, m.tts_model.sample_rate)
   ```
5. Listen to all four WAVs. Acceptance: intelligible speech in each language (not perfect — adequate).
6. Record findings (model size on disk, RAM peak, per-language wall-clock) into `docs/working/19-session-n2-n3-execution-log.md`.

### Halt conditions
- Install fails irrecoverably → halt, write status, ask human.
- Any of {en,es,fr,de} produces silence or nonsense → halt, write status, ask human.

### Pass condition
- Four playable WAVs, intelligible per language. Proceed to Phase 1.

---

## Phase 1 — VoxCPM Pod Scaffold

**Goal:** standalone Python service at `:3006` exposing the same HTTP contract as the existing tts-pod.

### Why a dedicated pod (not embedding in tts-pod)
- VoxCPM is heavy Python (PyTorch + 2B model). The current tts-pod is Node + a tiny Python subprocess. Embedding inflates the Node pod's footprint and couples lifecycles.
- Dedicated pod = clean rollback (revert env var → traffic returns to Kokoro on `:3005`).
- Mirrors the existing `pods/llm-pod` separation pattern.

### Directory layout (new)

```
pods/voxcpm-pod/
  ├── README.md
  ├── pyproject.toml          # voxcpm, fastapi, uvicorn, soundfile
  ├── requirements.txt        # pinned versions, mirror pyproject for pip workflows
  ├── .env.example            # PORT=3006, MODEL_ID=openbmb/VoxCPM2, AUDIO_CACHE=./cache, DEVICE=cuda|cpu
  ├── Dockerfile              # python:3.10-slim base; copy code; uvicorn entrypoint
  ├── scripts/
  │   ├── setup-dev.sh        # venv + pip install + model warmup
  │   └── quick-test.sh       # curl smoke test
  ├── cache/                  # .gitignore'd; output WAVs
  └── src/
      ├── server.py           # FastAPI app, mounts routes, /audio static dir
      ├── routes/
      │   └── tts.py          # POST /tts/generate, POST /tts/audio
      ├── services/
      │   └── voxcpm.py       # singleton VoxCPM model + generate_speech()
      ├── utils/
      │   ├── sanitize.py     # markdown stripping, identical rules to kokoro.ts
      │   └── logger.py
      └── config/
          └── env.py
```

### HTTP contract (must match tts-pod exactly)

**POST `/tts/generate`**
- Request JSON: `{ text: string, language: string, voice?: string, speed?: number, format?: "wav"|"mp3" }`
- Response JSON on success: `{ success: true, audioUrl: "/audio/<file>.wav", audioData: "<base64>", format: "wav" }`
- Response JSON on failure: `{ success: false, error: string }`

**POST `/tts/audio`**
- Same request shape.
- Response: `text/plain` body containing absolute URL `http://localhost:3006/audio/<file>.wav`.

**GET `/audio/<file>.wav`**
- Static file serving from the cache directory.

**GET `/healthz`**
- Returns `{ ok: true, model: "openbmb/VoxCPM2", device: "cuda"|"cpu" }`.

### Language routing inside `services/voxcpm.py`

VoxCPM2 auto-detects language from text content; no language tag is required. The `language` field is recorded for logging and cache keys but not passed to the model. (Source: VoxCPM2 README "no language tag needed".)

### Voice selection

For MVP: a single fixed voice description per language, baked into a small map. Use **Voice Design** (description-only, no reference clip) so we ship no audio assets:

```python
VOICE_DESCRIPTIONS = {
    "en": "A warm, friendly adult guide voice, calm and clear",
    "es": "Una voz cálida y clara de guía adulto, tono amable",
    "fr": "Une voix chaleureuse de guide adulte, calme et claire",
    "de": "Eine warme, ruhige Erwachsenenstimme eines Reiseführers",
    "it": "Una voce calda e chiara di guida adulto",
}
```

Inside `generate_speech()`:
```python
desc = VOICE_DESCRIPTIONS.get(language[:2], VOICE_DESCRIPTIONS["en"])
prompt = f"({desc}){sanitized_text}"
wav = model.generate(text=prompt, cfg_value=2.0, inference_timesteps=10)
```

### Chunking long narrations

Long narrations (300+ words) may exceed practical synthesis lengths. Split on sentence boundaries:

```python
import re
def chunk(text: str, max_chars: int = 600) -> list[str]:
    sentences = re.split(r'(?<=[\.\!\?])\s+', text)
    out, buf = [], ""
    for s in sentences:
        if len(buf) + len(s) + 1 > max_chars and buf:
            out.append(buf); buf = s
        else:
            buf = (buf + " " + s).strip()
    if buf: out.append(buf)
    return out
```

Concatenate audio with `numpy.concatenate(chunks)` before writing the WAV.

### Acceptance for Phase 1

- `pods/voxcpm-pod/scripts/setup-dev.sh` brings the pod up on `:3006`.
- `curl -s http://localhost:3006/healthz` returns `{"ok": true, ...}`.
- Four `curl -X POST http://localhost:3006/tts/generate` calls (en/es/fr/de) all return `success: true` with non-empty `audioData`.
- WAV files exist on disk at `pods/voxcpm-pod/cache/`.
- No backend changes yet.

---

## Phase 2 — Backend Integration (env var swap)

**Goal:** point the backend at voxcpm-pod with one env change. Keep tts-pod alive for fast rollback.

### Files to inspect / touch

1. `backend/src/services/audioService.ts` (or wherever the TTS HTTP call lives — search for `localhost:3005` or `tts-pod`).
   - Read first; record exact function name(s) doing the call.
   - Replace hard-coded `http://localhost:3005` with `process.env.TTS_POD_URL ?? 'http://localhost:3005'`.
2. `backend/.env` and `backend/.env.example`: add `TTS_POD_URL=http://localhost:3006`.
3. **Do not delete** anything in `pods/tts-pod/`. It remains as the rollback path.

### Acceptance for Phase 2
- `npx tsc --noEmit` passes in `backend/`.
- Backend smoke: generating audio for one stop succeeds and the resulting WAV plays.
- Reverting `TTS_POD_URL` to `:3005` restores Kokoro behavior unchanged.

### Rollback for Phase 2
- Unset `TTS_POD_URL` in `.env`. Backend defaults back to `:3005`. No code revert needed.

---

## Phase 3 — Welcome and Goodbye Narration Beats

**Goal:** stop 1 opens with a welcome; final stop closes with a goodbye. Other stops unchanged.

### File-by-file changes

#### 3.1 `pods/llm-pod/src/prompts/narrative/types.ts`

Extend `LongNarrativePromptInput`:

```ts
export interface LongNarrativePromptInput {
  localName: string;
  seeds: LongNarrativeSeeds;
  theme: string;
  language: string;
  nextStopName?: string;
  position: 'first' | 'middle' | 'last';
  retry?: boolean;
  seedQuality?: 'rich' | 'thin';
  targetWords?: string;
  // NEW (all optional for backward compat):
  cityName?: string;
  totalStops?: number;
  tourDurationMinutes?: number;
}
```

#### 3.2 `pods/llm-pod/src/prompts/narrative/arrival.ts`

Add a first-stop branch. Keep the existing branch identical for `middle`/`last`:

```ts
import { compactRecord, LongNarrativePromptInput, sectionSystem, SectionPrompt } from './types';

export function arrivalPrompt(input: LongNarrativePromptInput): SectionPrompt {
  const isFirst = input.position === 'first';
  const welcomeBeat = isFirst
    ? [
        `IMPORTANT: This is the FIRST stop of the tour. Begin the section with a warm welcome.`,
        `Open with a sentence like: "Welcome to this ${input.theme} walking tour of ${input.cityName ?? 'this city'}."`,
        input.totalStops ? `Mention there are ${input.totalStops} stops.` : '',
        input.tourDurationMinutes ? `Mention the tour takes about ${input.tourDurationMinutes} minutes.` : '',
        `Then say "Our first stop is ${input.localName}." and continue with arrival narration.`,
      ].filter(Boolean).join(' ')
    : '';

  return {
    system: sectionSystem(input.language, input.retry, input.seedQuality, input.targetWords),
    user: [
      welcomeBeat,
      `Section: arrival opening for ${input.localName}.`,
      `Tour theme: ${input.theme}.`,
      `OSM visual/type cues: ${compactRecord(input.seeds.osmTags)}.`,
      `Wikipedia lead: ${input.seeds.wikipediaLead || 'none'}.`,
      'Write what the visitor is arriving at and why it feels relevant now. If records are sparse, say so honestly and use only the available cues.',
    ].filter(Boolean).join('\n'),
  };
}
```

The system prompt already enforces target language — the LLM will translate "Welcome to this history walking tour..." into Spanish/French/German automatically.

#### 3.3 `pods/llm-pod/src/prompts/narrative/transition.ts`

Replace the user prompt entirely when `position === 'last'`:

```ts
import { LongNarrativePromptInput, sectionSystem, SectionPrompt } from './types';

export function transitionPrompt(input: LongNarrativePromptInput): SectionPrompt {
  const nextStop = input.nextStopName || 'the next stop';
  const isLast = input.position === 'last';

  const userBlock = isLast
    ? [
        `Section: GOODBYE — this is the final stop of the tour.`,
        `Do not guide to a next stop. Do not mention walking onward.`,
        `Thank the visitor for walking with you through ${input.cityName ?? 'this city'}.`,
        `Reflect briefly on what they have seen during this ${input.theme} tour.`,
        `Wish them well. Keep it warm and short.`,
      ].join('\n')
    : [
        `Section: walking-tour transition from ${input.localName}.`,
        `Tour position: ${input.position}.`,
        `Next stop: ${nextStop}.`,
        'Write a reflective closing beat and guide the visitor onward. Do not add new historical facts. Do not mention distance, coordinates, or street names.',
      ].join('\n');

  return {
    system: sectionSystem(input.language, input.retry, input.seedQuality, input.targetWords),
    user: userBlock,
  };
}
```

#### 3.4 `backend/src/services/narrative/NarrativeBuilder.ts`

- Bump `MODEL_VERSION`:
  ```ts
  const MODEL_VERSION = 'qwen3:4b-long-v3';
  ```
- Extend `buildNarration` signature with optional tour metadata:
  ```ts
  export async function buildNarration(
    poi: EnrichedPoi,
    theme: string,
    language: string,
    llmServiceUrl: string,
    position: 'first' | 'middle' | 'last' = 'middle',
    nextStopName?: string,
    tourMeta?: { cityName?: string; totalStops?: number; tourDurationMinutes?: number }
  ): Promise<BuiltNarration>
  ```
- Pass through to the POST body (after the existing `position` field):
  ```ts
  cityName: tourMeta?.cityName,
  totalStops: tourMeta?.totalStops,
  tourDurationMinutes: tourMeta?.tourDurationMinutes,
  ```

#### 3.5 `backend/src/services/orchestrationService.ts`

Single call site at line ~582. Pass the tour metadata:

```ts
const builtNarration = await buildNarration(
  poi,
  theme,
  language,
  this.llmServiceUrl,
  position,
  nextStopName,
  {
    cityName: city,                 // already in scope at this method
    totalStops: ranked.length,
    tourDurationMinutes: requestedDuration,
  }
);
```

(Verify variable names match the surrounding scope — `city` and `requestedDuration` are present per the audit; if they have different names locally, use those.)

#### 3.6 llm-pod request handler

Locate where `/narrative/stop/long` reads its body (search `pods/llm-pod/src` for `localName` and `position`). Confirm the JSON body fields are forwarded into `LongNarrativePromptInput`. Add the three new fields.

### Acceptance for Phase 3
- `npx tsc --noEmit` passes in `backend/` and `pods/llm-pod/`.
- Cache is invalidated by the version bump (rows with `model_version='qwen3:4b-long-v2'` become unreachable; new generations write `v3`).
- A fresh tour generation in en shows a stop-1 narration starting with a welcome substring.

### Rollback for Phase 3
- Revert the three prompt files and `NarrativeBuilder.ts`.
- Re-bump `MODEL_VERSION` (e.g., `qwen3:4b-long-v3-rollback`) to invalidate any v3 entries cached during the broken window.

---

## Phase 4 — End-to-End Smoke (single tour)

**Goal:** prove the chain works on one cold tour before the language matrix.

### Steps
1. Restart all services: llm-pod (`:3002`), voxcpm-pod (`:3006`), backend (`:3001`).
2. Generate Valencia / history / en / 60 cold (clear narration cache for that POI set first):
   ```bash
   curl -X POST http://localhost:3001/tours \
     -H 'Content-Type: application/json' \
     -d '{"city":"Valencia","theme":"history","language":"en","duration":60}'
   ```
3. Inspect response JSON:
   - `places.length >= 5`
   - `places[0].audioUrl` is non-null and HTTP-200s.
   - `places[places.length-1].audioUrl` is non-null and HTTP-200s.
   - `places[0].description` matches `/^welcome to.*valencia/i` (after stripping markdown).
   - `places[places.length-1].description` matches `/(thank you|farewell|goodbye)/i`.
4. Open the WAV files in a player. Confirm intelligible English speech.

### Acceptance
- All four assertions hold. Otherwise halt and debug.

---

## Phase 5 — Multi-Language Cold Validation

**Goal:** confirm the four MVP languages work end-to-end.

### Test matrix

| City | Theme | Language | Duration | Welcome regex | Goodbye regex |
|---|---|---|---|---|---|
| Valencia | history | en | 60 | `/welcome to.*valencia/i` | `/thank you|farewell|goodbye/i` |
| Madrid | art | es | 60 | `/bienvenid[oa]s? a.*madrid/i` | `/gracias|adiós|hasta pronto/i` |
| Paris | history | fr | 60 | `/bienvenue.*paris/i` | `/merci|au revoir|adieu/i` |
| München | history | de | 60 | `/willkommen.*münchen/i` | `/danke|auf wiedersehen|tsch(ü|u)ss/i` |

### Procedure
For each row:
1. Cold-generate (clear narration cache for the city/theme).
2. Assert `places.length >= 5`.
3. Assert `audioUrl` non-null on every stop, and each WAV file exists in `backend/data/audio/`.
4. Assert welcome regex on `places[0].description`.
5. Assert goodbye regex on `places[places.length-1].description`.
6. Spot-listen to stop 1 and final-stop WAVs — intelligible in target language.

### Pass/fail table — executor fills in
```
| Tour                       | stops | audio  | welcome | goodbye | listen-ok |
|----------------------------|-------|--------|---------|---------|-----------|
| Valencia/history/en        |       |        |         |         |           |
| Madrid/art/es              |       |        |         |         |           |
| Paris/history/fr           |       |        |         |         |           |
| München/history/de         |       |        |         |         |           |
```

### Acceptance
- All cells pass. Document timings and any anomalies in the execution log doc.

### Halt condition
- If welcome/goodbye regex fails for any language, the LLM is not honoring the new prompt. Inspect the raw `/narrative/stop/long` response. Do not patch around in the frontend — fix the prompt.

---

## Phase 6 — Frontend Map (build minimal)

**Goal:** Leaflet map + numbered markers + ordered polyline on `/tours/[id]`. SSR-safe.

### Important reality check
`frontend/src/components/tour/map/{components,hooks,providers,types,utils}/` are empty. Do **not** spend time auditing them. Build the minimal set of files below.

### New files

```
frontend/src/components/tour/map/
  ├── TourMap.tsx              # client component, dynamic-imported leaflet
  ├── markerIcons.ts           # numbered marker DivIcons
  └── types.ts                 # MapStop = { name, lat, lng, index }
```

### TourMap.tsx contract

```tsx
'use client';
import { MapContainer, TileLayer, Marker, Polyline, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { numberedIcon, currentIcon } from './markerIcons';
import type { MapStop } from './types';

export function TourMap({
  stops,
  currentIndex,
  onSelectStop,
}: {
  stops: MapStop[];
  currentIndex: number;
  onSelectStop: (i: number) => void;
}) {
  if (stops.length === 0) return null;
  const center: [number, number] = [stops[currentIndex].lat, stops[currentIndex].lng];
  const polyline = stops.map((s) => [s.lat, s.lng] as [number, number]);
  return (
    <MapContainer center={center} zoom={15} style={{ height: '50vh', width: '100%' }}
      attributionControl={true}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Polyline positions={polyline} />
      {stops.map((s, i) => (
        <Marker
          key={i}
          position={[s.lat, s.lng]}
          icon={i === currentIndex ? currentIcon(i + 1) : numberedIcon(i + 1)}
          eventHandlers={{ click: () => onSelectStop(i) }}
        >
          <Popup>{s.name}</Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
```

### Dependencies to install in `frontend/`
```
npm install leaflet react-leaflet
npm install -D @types/leaflet
```

### Modify `frontend/src/app/tours/[id]/page.tsx`

- Replace `<PlaceList tour={tour} />` with a composition:
  - Local state `currentIndex` (starts at 0).
  - Dynamic import `TourMap` with `ssr: false`:
    ```ts
    const TourMap = dynamic(() => import('@/components/tour/map/TourMap').then(m => m.TourMap), { ssr: false });
    ```
  - Render order on mobile (stack): `<TourMap/>` then `<PlaceCard/>` for the current stop then a "Next stop" button.
  - On desktop (`md:`), side-by-side: map left, card right.
  - "Next stop" button: `disabled={currentIndex >= stops.length-1}`; on click → `setCurrentIndex(i => i+1)` and recenter handled by re-render of `TourMap` because `center` derives from `currentIndex`.
- `stops` is built from `tour.places` mapping `(p, i) => ({ name: p.name, lat: p.coordinates.lat, lng: p.coordinates.lng, index: i })`.

### Autoplay handling

- Inside the existing `AudioPlayer` (or a thin wrapper): on `currentIndex` change, call `audio.play()`.
- Browsers block first-load autoplay. Add a one-time overlay button "Tap to start tour" on mount; clicking it calls `audio.play()` once (which unlocks audio on iOS Safari) and dismisses.

### Form → tour redirect

Search `frontend/src/components/` for the tour-generation form. After successful POST to `/tours`, `router.push(`/tours/${tour.id}`)`. If already implemented, leave it alone.

### Mobile sanity
- Chrome DevTools device mode at 375x812.
- Map ~50vh, card scrolls beneath.
- Audio play button is at least 44x44px (WCAG touch target).

### Acceptance for Phase 6
- `/tours/[id]` shows the map with numbered markers and polyline.
- Current marker is visually distinct (different color or larger).
- "Next stop" advances index and re-centers the map.
- Audio plays per stop; first stop's audio contains the welcome; last stop's contains the goodbye.
- No console errors on page load.
- Mobile viewport is usable.
- `npx tsc --noEmit` and `npm run lint` pass in `frontend/` (note: doc 17 records pre-existing `no-explicit-any` issues in `TourForm.tsx` and `api.ts` — do not "fix" those; they are out of scope).

### Rollback for Phase 6
- Revert `frontend/src/app/tours/[id]/page.tsx`.
- Delete `frontend/src/components/tour/map/TourMap.tsx`, `markerIcons.ts`, `types.ts`.
- Uninstall `leaflet`, `react-leaflet`, `@types/leaflet`.

---

## Phase 7 — Final Walkthrough (no code)

**Goal:** the executor walks one full tour in a real browser end-to-end as the final proof.

### Steps
1. Start all services: voxcpm-pod, llm-pod, backend, frontend.
2. Open `http://localhost:3000` in Chrome (desktop) and in mobile-emulation (375x812).
3. Submit form: Valencia / history / English / 60 minutes.
4. Wait for generation (cold, several minutes acceptable per doc 17).
5. On `/tours/[id]`:
   - See map with markers + polyline.
   - Tap "Tap to start tour".
   - Stop 1 audio plays; transcript shows welcome.
   - Click "Next stop" through to the end.
   - Final stop audio plays; transcript shows goodbye.
6. Repeat with es, fr, de tours (Madrid/Paris/München).

### Capture into `docs/working/19-session-n2-n3-execution-log.md`
- Cold gen wall-clock per tour.
- Any console error or audio glitch.
- Mobile viewport screenshots (4 tours × 1 screenshot each is enough).

---

## 4. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| VoxCPM CPU-only is too slow for cold tour (>10 min) | Medium | Document; if blocking, ship MVP with audio generated lazily on first play instead of upfront. Note this is a Phase 5+ decision, not Phase 1. |
| VoxCPM2 model download is large (~4–8GB) | High | First-run setup script pre-downloads; cache in `pods/voxcpm-pod/cache/models/`. Document disk requirement in pod README. |
| Spanish/German voice quality from "Voice Design" prompts is uneven | Medium | Acceptable for MVP; revisit in N+5 with a reference clip per language. |
| LLM ignores the welcome/goodbye instruction in non-English | Medium | Phase 5 regex assertions catch this. If it fails, strengthen the prompt with an example sentence in the target language rather than a generic instruction. |
| Leaflet SSR error in App Router | Low | `dynamic({ ssr: false })` is the standard fix and is in the plan. |
| iOS Safari autoplay block | High (expected) | "Tap to start tour" overlay handles it; the tap unlocks the audio context for the rest of the session. |
| Pre-existing lint failures in `TourForm.tsx`/`api.ts` block CI | Low | Out of scope; do not touch. If CI is hard-blocking, narrow the lint rule to error-only on changed files. |
| TTS_POD_URL env var not picked up | Low | Confirm `.env` is loaded (look for `dotenv.config()` in backend bootstrap). |

---

## 5. Open Questions Parked for Human

- Voice timbre per language: stay with description-only Voice Design, or curate one reference clip per language for cloning?
- Audio format: WAV (current, ~10MB per stop) vs MP3 (smaller, needs an encode step in voxcpm-pod).
- Long-narration chunking threshold: 600 chars is a guess. Tune after Phase 5.
- TTS pod long-term: keep Kokoro tts-pod alive as a hot-swap fallback indefinitely, or delete after N+5?
- Audio caching by `(poi_id, language, theme, model_version)` — same as narration. Should be added in N+5 to avoid regenerating audio on cold starts.

---

## 6. Executor Handoff Checklist

Before starting:
- [ ] Read `docs/working/16-osm-first-multilingual-plan.md`
- [ ] Read `docs/working/17-mvp-roadmap.md`
- [ ] Read this doc end-to-end
- [ ] Confirm services currently running: backend `:3001`, llm-pod `:3002`, tts-pod `:3005` (Kokoro). Stop the frontend if running.
- [ ] Create `docs/working/19-session-n2-n3-execution-log.md` for findings.

Per-phase:
- [ ] Phase 0: VoxCPM smoke install passes; four languages produce intelligible WAVs.
- [ ] Phase 1: voxcpm-pod up at `:3006`; healthz green; four-language curl smokes pass.
- [ ] Phase 2: backend swapped via `TTS_POD_URL`; smoke generation works; tts-pod still works on env revert.
- [ ] Phase 3: prompt files updated; `MODEL_VERSION` bumped; tsc green in backend and llm-pod.
- [ ] Phase 4: Valencia/history/en cold tour passes all assertions.
- [ ] Phase 5: 4-row matrix all green; pass/fail table filled in.
- [ ] Phase 6: frontend builds; map renders; next-stop advances; audio plays.
- [ ] Phase 7: walkthrough screenshots captured.

Rules of engagement:
- Ask **no clarifying questions** to the user mid-execution. If blocked, write a HALT entry in the execution log and stop.
- If Phase 0 fails on language coverage despite VoxCPM2's claimed 30 languages, halt — do not silently fall back to Piper without explicit human approval.
- Update doc 17's tracking table at the end (Phases N+2 and N+3 → completed with dated evidence).

---

## 7. File Change Summary (planned)

### New files
- `pods/voxcpm-pod/**` (entire pod)
- `frontend/src/components/tour/map/TourMap.tsx`
- `frontend/src/components/tour/map/markerIcons.ts`
- `frontend/src/components/tour/map/types.ts`
- `docs/working/19-session-n2-n3-execution-log.md`

### Edited files
- `backend/.env`, `backend/.env.example` — add `TTS_POD_URL`
- `backend/src/services/audioService.ts` (or equivalent) — read env var
- `backend/src/services/narrative/NarrativeBuilder.ts` — version bump + signature extension
- `backend/src/services/orchestrationService.ts` — pass tour metadata at call site
- `pods/llm-pod/src/prompts/narrative/types.ts` — extend input
- `pods/llm-pod/src/prompts/narrative/arrival.ts` — first-stop welcome branch
- `pods/llm-pod/src/prompts/narrative/transition.ts` — last-stop goodbye branch
- `pods/llm-pod/src/<route handler>` — forward 3 new fields
- `frontend/src/app/tours/[id]/page.tsx` — add map + current-stop progression
- `frontend/package.json` — add leaflet deps
- `docs/working/17-mvp-roadmap.md` — mark N+2/N+3 done with evidence

### Untouched
- `pods/tts-pod/**` — kept intact as rollback path.
- `frontend/src/components/tour/AudioPlayer.tsx`, `PlaceCard.tsx`, `PlaceList.tsx` — leave alone; reuse `PlaceCard` as the current-stop card content. Only minimal wiring at the page level.

---

## 8. Definition of Done

This document's plan is fully executed when:

1. All seven phase checklists in §6 are checked.
2. Doc 17's tracking table marks N+2 and N+3 completed with the dates and evidence references.
3. The execution log doc 19 contains: VoxCPM verification timings, the Phase 5 pass/fail table filled in, and four mobile-viewport screenshots.
4. `git status` is clean (committed) and the four cold tours can be regenerated from a fresh cache.

End of plan.
