# Mobile Tour Experience Plan

## Goal

Transform the app from a tour display website into a real mobile walking-tour experience.

The user should feel:

> I am on a route, this is my current stop, I can listen, walk to the next place, check the map when needed, and continue without thinking too much.

## Product Context

The app generates AI-powered walking tours with:

- city selection,
- theme selection,
- route generation,
- verified points of interest,
- AI-written narration,
- generated audio,
- map support.

The primary usage context is mobile: a person walking through a city while listening to the tour.

## Current UI Assessment

The current visual direction is good:

- warm editorial palette,
- premium travel-guide feeling,
- better consistency after the UI unification work.

However, the experience still feels more like a web page than an active mobile tour guide.

Main gaps:

- no real tour mode,
- map appears too early on mobile,
- audio is not dominant enough,
- no current user location,
- no distance to next stop,
- no offline or PWA flow despite the product docs mentioning offline capabilities.

## UX Principles

1. Audio first.
2. Mobile first.
3. One-hand operation.
4. Minimal screen attention.
5. Map as support, not the main product.
6. Clear current stop and next action.
7. No paid APIs unless explicitly approved.

## Phase 1: Real Mobile Tour Mode

### Goal

Make the tour detail page behave like an active walking-tour interface.

### Changes

- Put current stop and audio before the map on mobile.
- Add a sticky bottom action bar.
- Keep `Next stop` visible and easy to tap.
- Show current stop progress clearly.
- Make the map compact or expandable on mobile.
- Center the main `Play/Pause` control in the audio player.
- Keep `-10s` and `+10s` as secondary controls around the main play button.
- Reduce the visual weight of playback speed so audio start/stop remains the dominant action.

### Files

- `frontend/src/app/tours/[id]/page.tsx`
- `frontend/src/components/tour/PlaceCard.tsx`
- `frontend/src/components/tour/AudioPlayer.tsx`
- `frontend/src/components/tour/map/TourMap.tsx`

### Success Criteria

- On mobile, the first useful thing is the current stop and audio, not the map.
- User can play, pause, and go to the next stop without scrolling too much.
- Tour detail feels like a guided experience, not a content page.
- The audio player makes `Play` visually obvious at a glance during one-hand walking use.

## Phase 2: GPS And Current Location

### Goal

Make the map useful while walking.

### Changes

- Ask for location permission with clear copy.
- Show current user position on map.
- Add a `Center me` control.
- Handle denied permissions gracefully.

### Files

- `frontend/src/components/tour/map/TourMap.tsx`
- possible new hook: `frontend/src/hooks/useCurrentLocation.ts`

### Success Criteria

- User can see where they are relative to tour stops.
- App remains usable if location permission is denied.

## Phase 3: Distance To Next Stop

### Goal

Give the user simple orientation without paid routing APIs.

### Changes

- Calculate straight-line distance to current and next stop.
- Show labels like `250m away` and `1.2km away`.
- Optionally show `You are near this stop` within a threshold.

### Files

- possible new utility: `frontend/src/lib/geo.ts`
- `frontend/src/app/tours/[id]/page.tsx`
- `frontend/src/components/tour/map/TourMap.tsx`

### Success Criteria

- User knows if they are close to the current or next stop.
- No paid APIs are required.

## Phase 4: Persist Tour Progress

### Goal

Do not reset the user to stop 1 after refresh.

### Changes

- Store current stop per tour id in `localStorage`.
- Restore stop index on page load.
- Reset only when user chooses or the tour changes.

### Files

- `frontend/src/app/tours/[id]/page.tsx`
- possible new utility: `frontend/src/lib/tourProgress.ts`

### Success Criteria

- User can leave and return to the tour without losing their place.

## Phase 5: Better Generation Progress

### Goal

Make long generation feel trustworthy.

### Changes

Display stages while generating:

- Finding landmarks
- Building walking route
- Writing narration
- Generating audio
- Preparing your tour

### Files

- `frontend/src/components/form/TourForm.tsx`
- possibly store or API contracts if backend exposes real progress later

### Success Criteria

- User understands why generation takes time.
- Loading state feels intentional, not frozen.

## Phase 6: Share And Open In Maps

### Goal

Add useful mobile actions without paid services.

### Changes

- Add Web Share API support for tour links.
- Add `Open in Maps` link for the current stop using lat/lng.
- Use standard Apple Maps and Google Maps URL patterns.

### Files

- `frontend/src/app/tours/[id]/page.tsx`
- `frontend/src/components/tour/PlaceCard.tsx`

### Success Criteria

- User can share a tour.
- User can open a stop in their native maps app.

## Phase 7: PWA And Offline Foundation

### Goal

Align implementation with documented offline ambition.

### Changes

- Add app manifest.
- Add installable mobile web app basics.
- Cache generated tour metadata.
- Later: cache audio files and map-relevant data.

### Files

- `frontend/public/manifest.json`
- `frontend/src/app/layout.tsx`
- service worker setup if approved

### Success Criteria

- App can be installed.
- Tour metadata can be revisited more reliably.
- Offline audio can be planned as a later milestone.

## Phase 8: Safety And Trust

### Goal

Make the product feel responsible.

### Changes

Add light safety copy:

- Stay aware of your surroundings.
- Follow local signage and crossings.
- AI-generated content may contain mistakes.
- Routes may not reflect closures or restricted areas.

### Files

- home page
- tour detail page
- README files

### Success Criteria

- App feels more trustworthy and production-ready.

## Implementation Order

1. Real mobile tour mode.
2. Sticky audio and action bar.
3. Current location.
4. Distance to next stop.
5. Persist progress.
6. Better generation loading.
7. Share and open in maps.
8. PWA and offline foundation.
9. Safety and trust copy.

## Non-Goals

- No paid map APIs.
- No full turn-by-turn navigation in the first pass.
- No complex animations before core walking UX is solved.
- No desktop-first redesign.

## Implementation Status

- Phase 1: initial mobile tour mode shipped.
  - Current stop now appears before the map on mobile.
  - Sticky mobile action bar added.
- Phase 4: initial persisted progress shipped.
  - Current stop index is restored per tour id via `localStorage`.
- Remaining phases are still pending.
