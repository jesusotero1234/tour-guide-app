# Audio Playback And Leaflet Runtime Fix Plan

## Problem Statement

Two dev runtime issues need a small, documented fix path:

1. Audio playback logged `Audio error: {}` and did not expose the actual media failure.
2. Leaflet threw `Map container is already initialized` on the tour detail page in dev.
3. Windows Chrome could not reach WSL services through `localhost` on this machine.

Status: **completed for the local MVP runtime**.

## Current Architecture Facts

### Audio

- VoxCPM on `:3006` generates WAV audio and returns base64 `audioData`.
- Backend on `:3001` stores generated audio through `LocalFileAudioStorage`.
- Generated audio files are stored under `backend/data/audio/`.
- Backend serves audio statically from `/audio`.
- The canonical generated audio URL is currently `http://localhost:3001/audio/<placeId>-<language>.wav`.
- `frontend/src/components/tour/PlaceCard.tsx` now proxies local backend `.wav` filenames through `/api/audio/<filename>` to avoid browser same-origin blocking between `:3000` and `:3001`.
- `frontend/src/app/api/audio/[id]/route.ts` is now part of the local generated-audio path. It serves full `.wav` filenames from the backend static `/audio` route and keeps the Supabase lookup as legacy fallback for non-`.wav` ids.

### Map

- Frontend uses Next.js `15.2.2`, React `19`, and `react-leaflet` `4.2.1`.
- `frontend/src/app/tours/[id]/page.tsx` dynamically imports `TourMap` with `ssr: false`.
- `frontend/src/components/tour/map/TourMap.tsx` no longer renders `react-leaflet` `MapContainer`. It uses the Leaflet imperative API (`L.map`, `L.marker`, `L.polyline`) with explicit `map.remove()` cleanup.
- The Leaflet error was caused by `react-leaflet` `MapContainer` container reuse under React Strict Mode / Next dynamic loading in dev.

### Local Networking

- In WSL, Windows Chrome could not reach WSL services through `localhost` even though WSL-side `curl http://localhost:3000` returned `200`.
- `scripts/dev-up.sh` now detects WSL and prints a browser-visible WSL IP URL such as `http://172.24.204.140:3000`.
- `NEXT_PUBLIC_API_URL` is set to the browser-visible backend URL in WSL so frontend fetches use the same reachable network boundary.

## Scope

### In Scope

- Improve audio error diagnostics so the real media failure is visible.
- Keep generated audio bytes served by the backend static `/audio` route, but proxy browser playback through same-origin Next.js `/api/audio/<filename>`.
- Replace the problematic `react-leaflet` `MapContainer` runtime boundary with manual Leaflet lifecycle management.
- Keep changes minimal and reversible.

### Non-Goals

- No broad audio storage architecture rewrite.
- No dependency upgrades.
- No production database/storage redesign.
- No removal of legacy Supabase fallback code in Phase 1.

## Phase 1 - Minimal Fixes

### 1. Improve Audio Error Diagnostics

Likely file:

- `frontend/src/components/tour/AudioPlayer.tsx`

Checklist:

- [x] Read media diagnostics from `audio.error`, not from the event object.
- [x] Log the requested `audioUrl`.
- [x] Log `audio.error.code` and a mapped error label.
- [x] Log `audio.error.message`, `audio.networkState`, `audio.readyState`, and `audio.currentSrc`.
- [x] Keep the user-facing message concise.

### 2. Replace TourMap Runtime Boundary

Likely file:

- `frontend/src/components/tour/map/TourMap.tsx`

Checklist:

- [x] Remove `react-leaflet` `MapContainer` from the runtime path.
- [x] Create the Leaflet map manually with `L.map()`.
- [x] Add explicit cleanup with `map.remove()`.
- [x] Recreate route polyline and markers when stops/current index changes.
- [x] Verify page refresh does not trigger `Map container is already initialized`.

### 3. Confirm Audio URL Behavior

Likely file:

- `frontend/src/components/tour/PlaceCard.tsx`

Checklist:

- [x] Confirm generated tours use `http://localhost:3001/audio/<placeId>-<language>.wav`.
- [x] Confirm direct backend audio returns HTTP 200 `audio/wav`.
- [x] Route browser playback through `/api/audio/<placeId>-<language>.wav` to avoid CORS / CORP blocking.
- [x] Fix filename extraction so language suffixes such as `-fr.wav` are not truncated to `-f`.

## Phase 2 - Cleanup / Compatibility

### 1. Review Frontend Audio Proxy

Likely file:

- `frontend/src/app/api/audio/[id]/route.ts`

Checklist:

- [x] Decided the route is needed for local browser playback because backend audio is served from a different port.
- [x] Reworked the route to proxy full `.wav` filenames from the backend static `/audio` route.
- [x] Preserved Supabase pod lookup as a legacy fallback for non-`.wav` ids.

### 2. Optional Backend Compatibility Route

Potential backend route:

- `GET /audio/place/:placeId`

Checklist:

- [ ] Add only if existing dev data still stores `/audio/place/:id` style URLs.
- [ ] Route should look up `audio_assets` and redirect to `/audio/<storagePath>`.

## Verification Checklist

### Audio

- [x] Load a generated tour.
- [x] Confirm generated backend audio URL shape: `http://localhost:3001/audio/<placeId>-<language>.wav`.
- [x] Confirm backend static URL returns HTTP `200` and `audio/wav`.
- [x] Confirm Next proxy URL returns HTTP `200` and `audio/wav`.
- [x] Confirm Windows browser-visible proxy URL returns HTTP `200`.
- [x] Confirm app playback works.
- [x] If playback fails, logs now include error label, `networkState`, `readyState`, `currentSrc`, and `audioUrl`.

### Map

- [x] Load a tour detail page.
- [x] Refresh the page.
- [x] Confirm no `Map container is already initialized` error after moving away from `react-leaflet` `MapContainer`.
- [x] Confirm markers, route polyline, and fit bounds still render correctly.
- [ ] Complete mobile browser walkthrough for touch/scroll behavior.

## Dev Database Reset Notes

The user is open to deleting bad dev data, but database deletion/reset is destructive and should be confirmed immediately before running commands.

Before resetting dev data:

- [ ] Identify whether dev uses native Postgres, Docker, or Podman.
- [ ] Confirm `DATABASE_URL` target.
- [ ] Confirm the reset should delete all local tours, places, audio metadata, and generated audio files.
- [ ] Prefer documented migration/seed commands over manual deletion.

## Rollback / Safety Notes

- Audio diagnostics can be reverted without backend impact.
- `key={tour.id}` can be removed if it causes unexpected remount behavior.
- Do not remove `frontend/src/app/api/audio/[id]/route.ts` in Phase 1.
- Do not upgrade React, Next.js, Leaflet, or `react-leaflet` as part of this fix.
- Do not delete dev database or audio files without final explicit confirmation.

## Resolved Questions

- Current generated dev records store backend static `/audio/<placeId>-<language>.wav` URLs.
- The tested generated WAV file was reachable through backend and Next proxy with HTTP `200`.
- The Leaflet error was a dev runtime boundary problem involving React Strict Mode / Next dynamic loading and `react-leaflet` `MapContainer`.
- Local dev uses a script-managed stack with Postgres on `:5432`; WSL browser access should use the URL printed by `dev-up.sh`.

## Remaining Open Items

- Add a true browser/mobile smoke test when Playwright/browser automation is available.
- Consider `touchEvents: false` or equivalent mobile tuning if Leaflet scroll/touch behavior feels rough on phones.
- Clean up legacy Supabase naming in the audio proxy after confirming no older records need `/audio/place/:id` compatibility.
