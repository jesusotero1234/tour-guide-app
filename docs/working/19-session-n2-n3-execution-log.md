# 19 — Session N+2/N+3 Execution Log

Date: 2026-05-20

## Fixes Applied

- Verified `backend/src/services/orchestrationService.ts` already generates narration after `composeWalkingTour()`, so first/last position metadata reflects final displayed stop order.
- Verified `pods/llm-pod/src/routes/narrativeLong.ts` already includes `transition` for thin-seed final stops.
- Verified final-stop transition fallback in `narrativeLong.ts` is localized and contains regex-friendly goodbye terms: `Thank you`, `Gracias`, `Merci`, `Danke`.
- Patched `pods/llm-pod/src/prompts/narrative/transition.ts` last-stop branch to request approximately `targetWords` instead of saying `Keep it warm and short`.
- Patched `backend/src/services/narrative/NarrativeBuilder.ts` to bypass narration cache for `first` and `last` positions, while keeping cache reads/writes for `middle` stops only. This avoids reusing middle-stop cached narration where welcome/goodbye text is required without a Prisma migration.
- Patched `backend/src/infrastructure/postgres/PostgresNarrationCacheRepository.ts` default model version to `qwen3:4b-long-v3`.
- Noted prior product-policy change remains in place: short tours now select exactly 5 stops for the Phase 4 60-minute validation path.

## Commands Run

- `npx tsc --noEmit` in `backend/` — passed.
- `npx tsc --noEmit` in `pods/llm-pod/` — passed.
- `curl -sS -m 5 http://localhost:3001/health` — passed: `{"status":"ok"}`.
- `curl -sS -m 5 http://localhost:3002/health` — passed: llm-pod healthy, narrative model `qwen3:4b`.
- `curl -sS -m 10 http://localhost:3006/healthz` — passed: VoxCPM pod healthy on CUDA.
- `printf "%s" "DELETE FROM poi_narration_cache WHERE model_version = 'qwen3:4b-long-v3';" | npx prisma db execute --stdin --schema prisma/schema.prisma` in `backend/` — passed.
- Phase 4 E2E POST to `http://localhost:3001/api/v1/tours/generate` with API key `development-api-key` and body `{"city":"Valencia","country":"Spain","countryCode":"ES","theme":"history","language":"en","durationMinutes":60}` — passed.
- GET generated tour `518d3f43-f57d-4dfd-8d2a-c9b482576d11` — passed.
- HEAD checks for all generated audio URLs — passed; all returned HTTP 200 `audio/wav`.

## Phase 4 Assertion Results

- HTTP success: passed (`201`).
- Stops: passed (`places.length = 5`).
- Audio URLs: passed (5/5 non-empty; 5/5 returned HTTP 200).
- First description welcome regex `/^welcome to.*valencia/i`: passed.
  - Evidence starts: `Welcome to this history walking tour of Valencia. This tour has five stops and takes about 60 minutes...`
- Last description goodbye regex `/thank you|farewell|goodbye/i`: passed.
  - Evidence ends: `Goodbye! Thank you for walking with me through Valencia. I hope you enjoyed seeing the city's history...`
- Wall-clock for POST: ~101 seconds.

## Remaining Caveats

- Audio files were HTTP-checked, but not manually listened to in a player during this run.
- Cache key still omits position by schema design; the MVP-safe mitigation is intentional cache bypass for first/last stops.

## Phase 5 — Multi-language Cold Validation

### Service health

- `curl -sS -m 5 http://localhost:3001/health` — passed: `{"status":"ok"}`.
- `curl -sS -m 5 http://localhost:3002/health` — passed: llm-pod healthy, generation model `gemma4:26b`, narrative model `qwen3:4b`.
- `curl -sS -m 10 http://localhost:3006/healthz` — passed: VoxCPM pod healthy on CUDA.

### Cache state

- Cleared v3 narration cache before cold validation from `backend/`:
  - `printf "DELETE FROM poi_narration_cache WHERE model_version = 'qwen3:4b-long-v3';\n" | npx prisma db execute --stdin --schema prisma/schema.prisma`
  - Result: `Script executed successfully.`

### Validation results

| City/theme/lang/duration | HTTP | Tour ID | Stops | Audio URLs | Audio HTTP 200 | Welcome regex | Goodbye/thanks regex | Time |
|---|---:|---|---:|---:|---:|---|---|---:|
| Madrid / art / es / 60 | 201 | `1ef02e8a-bd28-4775-bf49-b99629451bc3` | 5 | 5/5 | 5/5 | `/\b(bienvenid[oa]s?|bienvenida|bienvenido)\b/i` — passed | `/\b(gracias|ad[ií]os|despedida|hasta pronto|hasta luego)\b/i` — passed | 195,936 ms |
| Paris / history / fr / 60 | 201 | `30ac6d4a-21f4-49fb-876a-3339c76a7e6e` | 5 | 5/5 | 5/5 | `/\b(bienvenue)\b/i` — passed | `/\b(merci|au revoir|adieu|à bientôt|a bient[oô]t)\b/i` — passed | 188,465 ms |
| München / history / de / 60 | 201 | `05534baa-71ec-4d63-849a-800e9f0310c8` | 5 | 5/5 | 5/5 | `/\b(willkommen)\b/i` — passed | `/\b(danke|auf wiedersehen|tschüss|lebewohl|abschied|bis bald)\b/i` — passed (`Bis bald`) | 181,419 ms |

### Request bodies

- Madrid: `{"city":"Madrid","country":"Spain","countryCode":"ES","theme":"art","language":"es","durationMinutes":60}`
- Paris: `{"city":"Paris","country":"France","countryCode":"FR","theme":"history","language":"fr","durationMinutes":60}`
- München: `{"city":"München","country":"Germany","countryCode":"DE","theme":"history","language":"de","durationMinutes":60}`

### Snippet evidence

- Madrid first: `¡Bienvenido a este recorrido artístico por Madrid! En este tour de 60 minutos, visitaremos 5 puntos clave. ¡Ahora llegamos a Mariblanca, Madrid!...`
- Madrid last: `...¡Hasta pronto! Gracias por haber caminado conmigo por Madrid. Espero que hayas disfrutado de cada rincón y obra que hemos explorado...`
- Paris first: `Bienvenue sur ce tour historique de Paris ! Ce parcours vous propose 5 arrêts en environ 60 minutes. Notre premier point d’arrivée...`
- Paris last: `...Que votre journée reste pleine de découvertes et de bonheur. À bientôt, et à l’inverse, je vous souhaite une belle journée !`
- München first: `Willkommen auf dieser historischen Wanderung durch München! Wir haben fünf Stationen und die Tour dauert etwa 60 Minuten. Unsere erste Station...`
- München last: `...Es war ein Vergnügen, Sie zu begleiten. Wünsche Ihnen viel Freude und Erfolg in Ihren weiteren Abenteuern. Bis bald!`

### Audio URL checks

- Madrid audio URLs returned HTTP 200 `audio/wav`:
  - `http://localhost:3001/audio/9a07715d-9da8-448d-a9ec-f40f05fee047-es.wav`
  - `http://localhost:3001/audio/408036db-deba-4096-86f7-a334da28f473-es.wav`
  - `http://localhost:3001/audio/4c075ac1-2d6e-49e9-b868-93f30d193cb5-es.wav`
  - `http://localhost:3001/audio/80e72ca3-6bc8-4e37-872a-5e658713d157-es.wav`
  - `http://localhost:3001/audio/ae3f2c40-016d-4943-8c5a-1db440557135-es.wav`
- Paris audio URLs returned HTTP 200 `audio/wav`:
  - `http://localhost:3001/audio/256e2aa7-6944-4552-acad-3f46e3a959f9-fr.wav`
  - `http://localhost:3001/audio/d70b5729-3209-466d-8965-82daaf7833aa-fr.wav`
  - `http://localhost:3001/audio/dc788e5b-9d03-440d-8482-6cd16601e4ff-fr.wav`
  - `http://localhost:3001/audio/caf14a00-e66f-4559-8bb5-aa3305d3a0f3-fr.wav`
  - `http://localhost:3001/audio/9c4eade9-1ecd-42ef-bb42-24b8db1abb1d-fr.wav`
- München audio URLs returned HTTP 200 `audio/wav`:
  - `http://localhost:3001/audio/9b3a2122-f983-4741-b587-5e90743f6e86-de.wav`
  - `http://localhost:3001/audio/ef55fc4a-2e36-43c3-9b27-f53b5f44a751-de.wav`
  - `http://localhost:3001/audio/012526b0-4262-4395-bfc8-ea8613dcb4262-de.wav`
  - `http://localhost:3001/audio/8a271d3b-d9cb-4447-9779-e7f483c52076-de.wav`
  - `http://localhost:3001/audio/20c7f8ed-6175-43e5-a547-0ba937cdda88-de.wav`

### Audio listening caveat

- Audio files were validated as reachable WAV files over HTTP, but this CLI session has no available audio playback/browser output for manual listening. First/final WAVs per language were therefore not audibly sampled.

## Phase 6 — Frontend Map + Walking Flow

### Implementation

- Added `frontend/src/components/tour/map/TourMap.tsx` as a client Leaflet map with OSM tiles, numbered markers, active marker styling, stop-click selection, route polyline, and fit-bounds behavior.
- Added `frontend/src/components/tour/map/markerIcons.ts` and `frontend/src/components/tour/map/types.ts` for the minimal map boundary.
- Updated `frontend/src/app/tours/[id]/page.tsx` to dynamically import `TourMap` with `ssr: false`, keep existing fetch/store/error/loading behavior, reset `currentIndex` on tour load, render map + current `PlaceCard` + `Next stop` controls, and show a final end-of-tour state.
- Added a minimal `Tap to start tour` button to provide a mobile user gesture before interacting with audio.
- Updated `frontend/src/components/form/TourForm.tsx` so successful generation redirects to `/tours/{tour.id}`.
- Added Leaflet CSS via `frontend/src/app/globals.css`.
- Extended the existing local `frontend/src/types/leaflet.d.ts` shim only enough for the used Leaflet/react-leaflet APIs.

### Verification

- `npx tsc --noEmit` in `frontend/` — failed first because the existing local Leaflet shim omitted `Polyline`, `Tooltip`, `divIcon`, `latLngBounds`, `scrollWheelZoom`, marker children, and `Map.fitBounds`; fixed by extending the shim.
- `npx tsc --noEmit` in `frontend/` — passed after the shim update.
- `npm run lint` in `frontend/` — failed first due the known pre-existing `no-explicit-any` errors in `TourForm.tsx` and `api.ts`, plus one new `no-empty-object-type` issue in the Leaflet shim. Fixed the touched `TourForm.tsx` `any` and the new shim lint issue.
- `npm run lint` in `frontend/` — still fails only on known pre-existing `src/lib/api.ts:42 no-explicit-any`; it also reports the pre-existing `PlaceCard.tsx` `<img>` warning.

## Phase 7 — Final Walkthrough Evidence

### Service status

- Backend: `curl -sS -m 5 http://localhost:3001/health` — passed: `{"status":"ok"}`.
- llm-pod: `curl -sS -m 5 http://localhost:3002/health` — passed: `{"status":"ok","env":"development","model":"gemma4:26b","narrativeModel":"qwen3:4b"}`.
- VoxCPM pod: `curl -sS -m 10 http://localhost:3006/healthz` — passed: `{"ok":true,"model":"openbmb/VoxCPM2","device":"cuda"}`.
- Frontend: started with `npm run dev` in `frontend/`; Next reported ready on `http://localhost:3000`.

### Route/static walkthrough

- `curl -sS -I -m 10 http://localhost:3000/tours/518d3f43-f57d-4dfd-8d2a-c9b482576d11` — passed with HTTP 200.
- `curl -sS -m 30 http://localhost:3000/tours/518d3f43-f57d-4dfd-8d2a-c9b482576d11` — passed; returned 39,812 bytes of Next HTML.
- Next dev log evidence: `/tours/[id]` compiled successfully in 9.8s with 879 modules and served the Valencia tour route with HTTP 200.
- Static/code evidence confirms the tour page renders the dynamically imported map, current stop text, current `PlaceCard`, `Next stop` button, final end-of-tour message, and mobile-first map sizing (`h-[50vh]`, desktop `lg:h-[70vh]`).

### Browser automation limitation

- Browser automation was attempted with Playwright, but Playwright browsers are not installed in this environment:
  - `npx -p playwright playwright screenshot --viewport-size=375,812 ...` failed with missing executable at `/home/jesusotero/.cache/ms-playwright/chromium_headless_shell-1223/...` and requested `npx playwright install`.
- Because browser binaries and audio output are unavailable, I could not complete a true rendered browser/mobile viewport walkthrough or manually listen to audio. Evidence is therefore CLI/static plus Next successful compilation/route serving.
