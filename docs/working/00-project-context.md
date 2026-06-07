# 00 - Project Context

## What the project does

Tour Guide App generates AI-powered city walking tours. Users select city, country, theme, language, and duration. The system finds real places via OpenStreetMap, enriches them with Wikipedia/Wikidata, generates narrative audio, and returns a playable tour with text + per-stop audio.

## Current architecture summary (updated 2026-05-24)

The active runtime flow is:

```
Frontend (Next.js)
  │ POST /api/v1/tours/generate {city, country, countryCode, theme, language, durationMinutes}
  ▼
Backend (Express, port 3001)
  │ orchestrationService.generateCompleteTour()
  │
  ├─► generatePlacesFromOsm()
  │     ├── Nominatim geocode (city → lat/lng/bbox)
  │     ├── Overpass API (fetch POIs by theme tags, cached in Postgres PoiCache)
  │     ├── Wikidata + Wikipedia enrichment (name translations, descriptions, claims)
  │     ├── PoiRanker (score + deduplicate)
  │     ├── composeWalkingTour (nearest-neighbor route ordering + duration fitting)
  │     └── buildNarration() per stop ──► llm-pod POST /narrative/stop/long (qwen3:4b)
  │
  ├─► wikimediaService.fetchImageForPlace() per stop
  │
  ├─► tourRepository.save(tour) → Postgres (tours, places)
  │
  └─► generateAudio() per stop
        ├── tts-pod POST /tts/generate (Kokoro ONNX, voice: af_sarah)
        ├── audioStorage.save() → local .wav file
        └── audioAssetRepository.save() → Postgres audio_assets
```

**Key architectural facts:**
- The **description-pod** and **LLM pod /generate/places** route exist in the codebase but are **NOT called** in the active tour generation path. The OSM pipeline replaced them.
- **Two TTS pods exist**: `tts-pod` (Node/Kokoro ONNX, active) and `voxcpm-pod` (Python/VoxCPM, alternative, not wired).
- The **verification-pod** is also not called in the active OSM path (OSM data is treated as ground truth).
- Persistence is **Postgres (Prisma)** for metadata + **local filesystem** for audio .wav files.

## Main components

### Frontend (`frontend/`)
- Next.js 15 App Router
- Zustand store for tour state
- Leaflet map (manual lifecycle, not react-leaflet)
- AudioPlayer uses native `<Audio>` element
- Audio proxied through `/api/audio/[id]` route to avoid CORS

### Backend (`backend/`)
- Express server on port 3001
- `orchestrationService.ts` is the central brain (~945 lines)
- Serves static audio from `./data/audio/`
- DB: Postgres via Prisma (`prisma/schema.prisma`)

### Pods (`pods/`)
| Pod | Port | Status | Purpose |
|-----|------|--------|---------|
| `llm-pod` | 3002 | Active | Narration generation via Ollama (qwen3:4b, gemma4:26b) |
| `verification-pod` | 3003 | Dormant | Place/route verification (not in active path) |
| `description-pod` | 3004 | Dormant | LLM description generation (not in active path) |
| `tts-pod` | 3005 | Active | TTS via Kokoro ONNX (local model) |
| `voxcpm-pod` | 3006 | Alternative | TTS via VoxCPM (Python/FastAPI, not wired) |
| `supabase-pod` | — | Legacy | Old persistence adapter (not in active path) |

### Database & Storage
- **Postgres tables**: `tours`, `places`, `audio_assets`, `generation_jobs`, `poi_cache`, `poi_narration_cache`
- **Audio storage**: local filesystem `./data/audio/` → served by backend Express static route `/audio/`
- **Audio metadata**: `audio_assets` table (place_id, language, format, storage_path)
- **⚠️ Dead table**: `generation_jobs` exists in the Prisma schema with full fields (status, step, error_code, timestamps) but is **never read or written by any application code**. Also `tours.status` column defaults to `"created"` but is never updated during generation. The async job model was designed but never implemented — the generation pipeline is fully synchronous.

## Architectural intent vs current state

**Intent**: Modular AI pipeline generating rich guided tours.

**Current state**: The OSM pipeline works end-to-end but produces relatively simple output: ranked stops with LLM narration and single-voice TTS audio. Narrative cohesion is limited, there is no true multi-voice casting, and the audio is one flat WAV file per stop.
