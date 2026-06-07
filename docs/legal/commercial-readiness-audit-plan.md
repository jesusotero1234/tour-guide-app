# Commercial Readiness Audit Plan

Status: **created and initialized**.

## Purpose

This document is the implementation plan and working inventory for making the product commercially safe to launch from a licensing, attribution, and third-party dependency perspective.

This is not legal advice. It is the technical and operational checklist the engineering side should complete before selling the product.

## Goal

Confirm that:

- code dependencies allow commercial use
- fonts allow commercial use
- LLM and TTS models allow commercial use
- map data and encyclopedic sources are properly attributed
- map tile usage is production-safe
- product pages and notices cover the obligations we inherit from third-party software, data, and media

## Repo-Specific Starting Facts

These facts were verified from the current repository.

### Frontend

- Framework: Next.js `15.2.2`
- UI runtime: React `19`
- Maps: `leaflet`, `react-leaflet`, `leaflet-geosearch`
- State: `zustand`
- Fonts in use: `Ibarra Real Nova`, `Literata` via `next/font/google`
- Existing attribution footer: `frontend/src/components/layout/AttributionFooter.tsx`
- Existing data-sources page: `frontend/src/app/data-sources/page.tsx`
- Current map tile URL in code: `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`

### Backend

- Runtime: Node + Express + Prisma
- External data/services referenced in code:
  - OpenStreetMap
  - Nominatim
  - Overpass API
  - Wikipedia
  - Wikidata
  - Wikimedia Commons

### LLM / TTS Pods

- LLM runtime: Ollama-backed local services
- Narration models referenced in repo:
  - `llama3.1:8b`
  - `gemma4:26b`
- Primary TTS path: `VoxCPM`
- Fallback TTS path: `Kokoro ONNX`
- VoxCPM package in repo: `voxcpm==2.0.3`
- Kokoro package in repo: `kokoro-onnx>=0.4.5`

### Existing Attribution Already Present

- Footer credits OpenStreetMap and Wikipedia CC BY-SA
- Data sources page already lists:
  - OpenStreetMap
  - Nominatim
  - Overpass API
  - Wikipedia
  - Wikidata

### Known Gaps Already Visible

- No explicit per-image attribution path is visible in the current frontend
- Wikimedia Commons is not yet explicitly listed on the data sources page
- Map tiles still use the public OpenStreetMap tile server in frontend code
- No `THIRD_PARTY_NOTICES.md` is present at the repo root
- No dedicated legal pages such as `terms`, `privacy`, or `licenses` are present yet
- No committed machine-readable dependency license inventory exists yet

## Risk Summary

The biggest commercial-readiness risks are not React/Next/Node.

The biggest risks are:

- Wikimedia image attribution and image-level license handling
- using public OSM tiles in a commercial production workload
- assuming model weights are commercially reusable without reading their actual terms
- relying on Wikipedia-derived content without confirming attribution/share-alike implications
- relying on public Nominatim/Overpass endpoints beyond their intended operational policy

## Audit Deliverables

Before launch, the repo should contain at minimum:

- `docs/legal/commercial-readiness-audit-plan.md`
- `docs/legal/commercial-readiness-audit-report.md`
- `THIRD_PARTY_NOTICES.md`
- product-facing `Data Sources` page updated with final obligations
- product-facing image/media attribution solution
- product-facing `Terms` and `Privacy` pages

## Execution Phases

### Phase 1 - Dependency Inventory

Goal:
Build a complete inventory of code dependencies and their licenses.

Scope:

- frontend npm dependencies
- backend npm dependencies
- pod npm dependencies
- Python dependencies
- Docker base images where relevant

Tasks:

1. Enumerate direct dependencies from:
   - `frontend/package.json`
   - `backend/package.json`
   - `pods/llm-pod/package.json`
   - `pods/tts-pod/package.json`
   - `pods/supabase-pod/package.json`
   - `pods/description-pod/package.json`
   - `pods/verification-pod/package.json`
   - `pods/voxcpm-pod/requirements.txt`
   - `pods/tts-pod/requirements.txt`
2. Generate a license inventory for npm dependencies.
3. Generate a license inventory for Python dependencies.
4. Record any GPL, AGPL, SSPL, or unclear licenses as red flags.

Output:

- a dependency section in `docs/legal/commercial-readiness-audit-report.md`
- `THIRD_PARTY_NOTICES.md` draft

Success criteria:

- every shipped dependency is listed with a license
- no unknown licenses remain unresolved

### Phase 2 - Fonts Audit

Goal:
Confirm that all bundled fonts allow commercial use.

Fonts currently in use:

- `Ibarra Real Nova`
- `Literata`

Tasks:

1. Record source and license for each font.
2. Confirm commercial use rights.
3. Record attribution/notice obligations if any.

Expected likely result:

- Google Fonts open-source fonts, usually under SIL Open Font License

Success criteria:

- fonts are documented as commercially safe to use

### Phase 3 - Data Sources And Attribution Audit

Goal:
Confirm that every data source used in tours has the required attribution and operational treatment.

Sources already known:

- OpenStreetMap
- Nominatim
- Overpass API
- Wikipedia
- Wikidata
- Wikimedia Commons

Tasks:

1. Document the legal/data terms for each source.
2. Confirm whether current attribution is sufficient.
3. Add Wikimedia Commons explicitly to the user-facing data-sources page.
4. Confirm whether any product output should carry share-alike attribution because of Wikipedia-derived text.
5. Decide whether generated tour descriptions are treated as sufficiently transformed or whether explicit Wikipedia attribution should remain attached to each tour.

Success criteria:

- every source used by the app is explicitly documented
- user-facing attribution is complete and visible

### Phase 4 - Wikimedia Images And Media Attribution

Goal:
Make image usage commercially safe and operationally traceable.

Problem:

- Wikimedia Commons images are not all under the same license
- some require attribution by author/title/license
- a generic footer is not enough for image-specific obligations

Tasks:

1. Inspect the image-fetch path in `backend/src/services/wikimediaService.ts`.
2. Extend stored image metadata so each image can preserve:
   - source URL
   - Wikimedia file title
   - author
   - license name
   - license URL
   - attribution text
3. Add frontend rendering path for image attribution.
4. Reject or skip images with unclear or non-commercially safe licensing.

Success criteria:

- each displayed image has enough metadata to attribute correctly
- no unknown-license image is shown in the commercial product

### Phase 5 - Map Tile Production Readiness

Goal:
Remove dependence on public OSM tiles for production.

Current state:

- frontend uses `tile.openstreetmap.org` directly

Tasks:

1. Treat public OSM tiles as dev-only.
2. Add configurable tile provider env vars.
3. Choose one production path:
   - commercial tile provider
   - self-hosted tile stack
4. Keep attribution compliant for the chosen provider.

Success criteria:

- production build no longer assumes public OSM tile infrastructure

### Phase 6 - LLM Model License Audit

Goal:
Verify that the actual language models used by the app are commercially acceptable.

Models referenced in repo:

- `llama3.1:8b`
- `gemma4:26b`

Tasks:

1. Identify the exact deployed models for each route.
2. Record their official license terms.
3. Confirm commercial-use rights and any restrictions.
4. Record any obligations in the final report.

Success criteria:

- the chosen production LLM is explicitly approved in the report

### Phase 7 - TTS Model License Audit

Goal:
Verify that the TTS stack and model weights are commercially safe.

Components referenced in repo:

- `VoxCPM`
- `openbmb/VoxCPM2`
- `Kokoro ONNX`
- Kokoro voice assets used by the app

Tasks:

1. Audit `voxcpm` package license.
2. Audit `openbmb/VoxCPM2` code and weights license.
3. Audit `kokoro-onnx` package license.
4. Audit the specific Kokoro voice assets used by the app.
5. Confirm whether generated audio can be used commercially.

Success criteria:

- primary and fallback TTS are explicitly approved or rejected for production

### Phase 8 - Product Legal Surface

Goal:
Add the minimum legal/product-facing pages needed for a commercial launch.

Tasks:

1. Keep `Data Sources` page.
2. Add a `Licenses` page.
3. Add `Terms` page.
4. Add `Privacy` page.
5. Add or expose image/media attribution where needed.
6. Add AI-generated-content disclosure if product positioning requires it.

Success criteria:

- product has visible legal and attribution surfaces

### Phase 9 - Operational Policy Audit

Goal:
Confirm that public upstream endpoints are not being used in ways that violate policy.

Tasks:

1. Review Nominatim usage volume assumptions.
2. Review Overpass usage and caching strategy.
3. Review Wikimedia request headers and user-agent handling.
4. Decide which public endpoints must be replaced for commercial production.

Success criteria:

- no production dependency remains on an upstream endpoint whose public policy conflicts with launch plans

### Phase 10 - Release Gate

Goal:
Define a final go/no-go checklist for launch.

Checklist:

- dependency licenses inventoried
- fonts approved
- LLM license approved
- TTS license approved
- Wikimedia images traceable and attributable
- OSM attribution visible
- production tile strategy in place
- legal pages published
- `THIRD_PARTY_NOTICES.md` committed
- no unresolved red-flag licenses remain

## Immediate Next Actions

These are the first concrete tasks to execute after this plan document exists.

1. Create `docs/legal/commercial-readiness-audit-report.md`.
2. Generate dependency license inventories for npm and Python.
3. Add Wikimedia Commons to `frontend/src/app/data-sources/page.tsx`.
4. Open an implementation track for image-level attribution metadata.
5. Open an implementation track for production tile provider configuration.

## Initial Repo Inventory Snapshot

This is the initial, non-exhaustive inventory captured at document creation time.

### Frontend direct dependencies

- `next`
- `react`
- `react-dom`
- `leaflet`
- `react-leaflet`
- `leaflet-geosearch`
- `zustand`

### Backend direct dependencies

- `@prisma/client`
- `axios`
- `cors`
- `dotenv`
- `express`
- `express-rate-limit`
- `helmet`

### LLM pod direct dependencies

- `axios`
- `cors`
- `dotenv`
- `express`
- `express-rate-limit`

### VoxCPM pod Python dependencies

- `fastapi`
- `uvicorn`
- `voxcpm`
- `soundfile`
- `numpy`
- `python-dotenv`

### Kokoro pod Python dependencies

- `kokoro-onnx`
- `numpy`
- `onnxruntime`
- `soundfile`

## Notes

- Open source does not mean zero obligations.
- The code side of this repo is likely lower risk than the data/media/model side.
- This plan should be treated as a release blocker for a commercial launch, not optional polish.
