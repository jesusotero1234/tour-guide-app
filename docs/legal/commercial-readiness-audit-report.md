# Commercial Readiness Audit Report

Status: **initial report generated from repository inventory**.

Date: 2026-05-31

This report is not legal advice. It is the engineering-side audit snapshot for deciding whether the current repository is ready for commercial launch.

## Executive Summary

Current status: **not yet commercially ready**.

The main blockers are not the core application frameworks. The main blockers are:

- the app currently uses public OpenStreetMap tiles directly in frontend code
- Wikimedia image attribution is not yet implemented at image level
- LLM and TTS model weight licenses are not yet verified in this repo-level report
- Nominatim and Overpass public-service usage policy still needs explicit production review

Commercial launch recommendation today: **do not launch until the red items below are resolved**.

## Status Legend

- Green: low-risk / permissive / acceptable pending notices
- Yellow: probably acceptable but still needs explicit confirmation or product work
- Red: launch blocker until resolved
- Unknown: insufficient evidence collected yet

## Dependency Findings

### Frontend direct dependencies

| Package | Version | Observed license | Status | Notes |
|---|---:|---|---|---|
| `@types/leaflet` | `^1.9.16` | MIT | Green | dev/type package, low risk |
| `leaflet` | `^1.9.4` | BSD-2-Clause | Green | permissive |
| `leaflet-geosearch` | `^3.11.1` | MIT | Green | permissive |
| `next` | `15.2.2` | MIT | Green | permissive |
| `react` | `^19.0.0` | MIT | Green | permissive |
| `react-dom` | `^19.0.0` | MIT | Green | permissive |
| `zustand` | `^5.0.3` | MIT | Green | permissive |

### Backend direct dependencies

| Package | Version | Observed license | Status | Notes |
|---|---:|---|---|---|
| `@prisma/client` | `^5.22.0` | Apache-2.0 | Green | permissive |
| `axios` | `^1.8.4` | MIT | Green | permissive |
| `cors` | `^2.8.5` | MIT | Green | permissive |
| `dotenv` | `^16.4.5` | BSD-2-Clause | Green | permissive |
| `express` | `^4.18.3` | MIT | Green | permissive |
| `express-rate-limit` | `^7.2.0` | MIT | Green | permissive |
| `helmet` | `^7.1.0` | MIT | Green | permissive |

### LLM pod direct dependencies

| Package | Version | Observed license | Status | Notes |
|---|---:|---|---|---|
| `axios` | `^1.6.0` | MIT | Green | permissive |
| `cors` | `^2.8.5` | MIT | Green | permissive |
| `dotenv` | `^16.0.3` | BSD-2-Clause | Green | permissive |
| `express` | `^4.18.2` | MIT | Green | permissive |
| `express-rate-limit` | `^7.1.5` | MIT | Green | permissive |

### TTS / support pod direct dependencies

| Pod | Package | Version | Observed license | Status |
|---|---|---:|---|---|
| `tts-pod` | `cors` | `^2.8.5` | MIT | Green |
| `tts-pod` | `express` | `^4.18.3` | MIT | Green |
| `tts-pod` | `fs-extra` | `^11.2.0` | MIT | Green |
| `tts-pod` | `winston` | `^3.17.0` | MIT | Green |
| `supabase-pod` | `@supabase/supabase-js` | `^2.40.0` | MIT | Green |
| `supabase-pod` | `cors` | `^2.8.5` | MIT | Green |
| `supabase-pod` | `dotenv` | `^16.4.1` | BSD-2-Clause | Green |
| `supabase-pod` | `express` | `^4.18.2` | MIT | Green |
| `supabase-pod` | `helmet` | `^7.1.0` | MIT | Green |
| `supabase-pod` | `winston` | `^3.12.0` | MIT | Green |
| `description-pod` | `axios` | `^1.6.0` | MIT | Green |
| `description-pod` | `cors` | `^2.8.5` | MIT | Green |
| `description-pod` | `dotenv` | `^16.3.1` | BSD-2-Clause | Green |
| `description-pod` | `express` | `^4.18.2` | MIT | Green |
| `description-pod` | `helmet` | `^7.1.0` | MIT | Green |
| `description-pod` | `winston` | `^3.10.0` | MIT | Green |
| `description-pod` | `node-cache` | `^5.1.2` | MIT | Green |
| `verification-pod` | `@types/string-similarity` | `^4.0.2` | MIT | Green |
| `verification-pod` | `axios` | `^1.6.5` | MIT | Green |
| `verification-pod` | `cors` | `^2.8.5` | MIT | Green |
| `verification-pod` | `dotenv` | `^16.4.1` | BSD-2-Clause | Green |
| `verification-pod` | `express` | `^4.18.2` | MIT | Green |
| `verification-pod` | `express-rate-limit` | `^7.1.5` | MIT | Green |
| `verification-pod` | `express-validator` | `^7.2.1` | MIT | Green |
| `verification-pod` | `node-fetch` | `^2.7.0` | MIT | Green |
| `verification-pod` | `string-similarity` | `^4.0.4` | ISC | Green |
| `verification-pod` | `zod` | `^3.22.4` | MIT | Green |

## Fonts

| Font | Source | Expected license family | Status | Notes |
|---|---|---|---|---|
| `Ibarra Real Nova` | Google Fonts / `next/font/google` | likely SIL OFL | Yellow | confirm exact license record in final report |
| `Literata` | Google Fonts / `next/font/google` | likely SIL OFL | Yellow | confirm exact license record in final report |

Assessment:

- both fonts are likely commercially safe
- final audit should record exact OFL references instead of probable status

## Python / Model Package Audit

Current repository-level status:

| Package / Model | Current status | Notes |
|---|---|---|
| `fastapi` | Unknown in this report | license metadata not extracted by current local command |
| `uvicorn` | Unknown in this report | same as above |
| `voxcpm` | Unknown in this report | package license and model-weight terms must be confirmed |
| `kokoro-onnx` | Unknown in this report | package and voice asset terms must be confirmed |
| `onnxruntime` | Unknown in this report | likely permissive, still confirm |
| `openbmb/VoxCPM2` | Unknown | model-weight commercial terms still unverified |
| `llama3.1:8b` | Unknown | must confirm Meta license/usage terms for deployed route |
| `gemma4:26b` | Unknown | must confirm Google Gemma license/usage terms |

Assessment:

- this section remains a launch blocker until model and TTS licenses are explicitly confirmed

## Data Sources And Media Audit

### OpenStreetMap data

Status: Yellow

Notes:

- attribution is already visible in the footer
- data page already references OSM and ODbL
- final report still needs a decision on whether the product output is treated purely as a produced work or whether any deeper ODbL handling is needed for persisted derivatives/caches

### Nominatim

Status: Yellow

Notes:

- current repo uses the public Nominatim endpoint
- commercial launch must review acceptable use, traffic volume, caching, and user-agent requirements

### Overpass API

Status: Yellow

Notes:

- public Overpass should not be assumed as permanent commercial production infrastructure
- current app does cache POIs, which helps, but infrastructure policy review still needed

### Wikipedia

Status: Yellow

Notes:

- current footer already references CC BY-SA
- app uses Wikipedia text as factual input and also surfaces data-source attribution
- still needs final decision on whether per-tour or per-output attribution should be stronger

### Wikidata

Status: Green/Yellow

Notes:

- currently documented as CC0 on the data sources page
- low concern compared with Wikipedia/Wikimedia, but still include in final notices

### Wikimedia Commons images

Status: **Red**

Notes:

- current repo fetches Wikimedia images but does not yet expose image-level attribution metadata in the frontend
- a generic footer is not enough for image-specific obligations
- image license filtering and attribution UI are required before commercial launch

## Map Tile Audit

Status: **Red**

Current code path:

- `frontend/src/components/tour/map/TourMap.tsx` uses public `tile.openstreetmap.org`

Assessment:

- acceptable for local development
- not acceptable as assumed production commercial tile infrastructure without policy review/replacement

Required action:

- move to configurable production tile provider or self-hosted strategy before launch

## Existing Product-Side Compliance Surface

Current positives:

- attribution footer exists
- data-sources page exists

Current gaps:

- no `Terms` page
- no `Privacy` page
- no `Licenses` page
- no `THIRD_PARTY_NOTICES.md`
- no image attribution UI

## Launch Blockers

The following items should be treated as blockers for a paid commercial launch:

1. replace public OSM tile usage for production
2. implement image-level Wikimedia attribution metadata and UI
3. confirm commercial terms for deployed LLM models
4. confirm commercial terms for deployed TTS models and voice assets
5. review public Nominatim and Overpass usage against production traffic expectations

## Recommended Immediate Engineering Actions

1. Add Wikimedia Commons explicitly to `frontend/src/app/data-sources/page.tsx`.
2. Create `THIRD_PARTY_NOTICES.md` and keep it committed.
3. Add `NEXT_PUBLIC_TILE_URL` and related provider config.
4. Add image-source license metadata storage and rendering.
5. Create `Terms`, `Privacy`, and `Licenses` pages.

## Current Go / No-Go Assessment

Assessment: **No-Go** for commercial launch today.

Reason:

- at least one dependency license is a red flag
- media attribution is incomplete
- production map-tile strategy is not yet commercial-ready
- model license review is incomplete

## What Looks Good Already

- most JavaScript server/client dependencies are MIT, BSD, Apache, or ISC
- `react-leaflet` has been removed from the frontend dependency set and no longer appears in runtime source references
- OSM and Wikipedia attribution are already conceptually acknowledged in the product
- typography stack is likely commercially safe
- the repo already has a good structure for adding legal pages and notices
