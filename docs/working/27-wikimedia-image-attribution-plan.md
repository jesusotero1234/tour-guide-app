# Wikimedia Image Attribution Plan

Status: **drafted for implementation**.

## Goal

Make Wikimedia Commons image usage commercially safer by preserving image-level license metadata and exposing attribution in the product UI.

## Problem

- The app currently fetches Wikimedia images for places.
- A generic footer attribution is not enough for Wikimedia Commons images.
- Each image can have its own license, author, title, and attribution requirements.
- The current frontend does not visibly expose per-image attribution.

## Desired Outcome

Every displayed Wikimedia image should be traceable back to:

- source URL
- Wikimedia file title
- author or credit line
- license name
- license URL
- attribution text suitable for UI display

## Scope

### In Scope

- backend metadata capture for Wikimedia images
- storage of image attribution data alongside places or image assets
- frontend rendering of image credits
- user-facing link to the source file/license

### Out Of Scope

- replacing Wikimedia as an image source
- moderating all image suitability issues
- automated legal interpretation of every possible Commons license variant

## Current Code Areas

- `backend/src/services/wikimediaService.ts`
- `backend/src/services/orchestrationService.ts`
- `backend/src/domain/entities/Place.ts`
- `backend/src/infrastructure/postgres/PostgresTourRepository.ts`
- `frontend/src/components/tour/PlaceCard.tsx`

## Recommended Data Shape

Add place-level image attribution metadata:

```ts
imageAttribution?: {
  source: 'wikimedia-commons';
  sourceUrl: string;
  fileTitle?: string;
  author?: string;
  licenseName?: string;
  licenseUrl?: string;
  attributionText?: string;
}
```

This can live inside `Place.metadata` for the first implementation.

## Backend Plan

1. Extend Wikimedia fetch logic to capture more than just the image URL.
2. When possible, preserve:
   - file title
   - description URL
   - author/artist/credit
   - license short name
   - license URL
3. Pass this data through the orchestration flow when images are selected.
4. Persist it in `Place.metadata`.

## Frontend Plan

1. Render a compact attribution block under place images.
2. Show a short line such as:
   `Image: Wikimedia Commons · CC BY-SA 4.0`
3. Link to:
   - source file page
   - license URL
4. Hide the block when the place has no image attribution metadata.

## Fallback Rules

- If an image lacks clear attribution metadata, treat it as unsafe for commercial launch.
- Prefer skipping that image over displaying an unattributed image.

## Acceptance Criteria

- every Wikimedia-sourced image shown in the product has visible attribution
- attribution includes at least source and license
- backend stores enough metadata to regenerate credits on page load
- images with missing or ambiguous attribution can be filtered out

## Follow-Up

- optionally expose a dedicated `Image credits` section on the tour detail page
- optionally add an attribution export/report for legal review
