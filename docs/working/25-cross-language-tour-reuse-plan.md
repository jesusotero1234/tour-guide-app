# Cross-Language Tour Reuse Plan

Status: drafted, ready for implementation.

## Goal

When a user requests a tour for a city/theme/duration/language, avoid regenerating the full itinerary if the same itinerary already exists in another language.

Example:

Existing:
Madrid / ES / history / fr / 240

New request:
Madrid / ES / history / es / 240

Expected behavior:
Reuse the same stops, order, route, coordinates, and images. Generate Spanish narration and Spanish audio only.

## Current Facts

- Exact-language reuse already exists in `OrchestrationService.findReusableTour()`.
- Current exact reuse key is `city + countryCode + theme + language + durationMinutes`.
- Exact reuse only returns a tour if every place has `audioUrl`.
- Prisma already has `Place.metadata Json @default("{}")`.
- Domain `Place` does not currently expose `metadata`.
- `PostgresTourRepository` does not currently read/write `Place.metadata`.
- `Tour.metadata` already exists and is mapped.
- `PoiNarrationCache` is keyed by `poiId + language + theme`.
- `PoiEnrichmentCache` is keyed by `cacheKind + cacheKey + language`.
- `buildNarration()` can regenerate native narration in the target language if we can reconstruct an `EnrichedPoi`.
- Existing old persisted tours may not have enough POI source metadata to regenerate high-quality native narration.

## Desired Behavior

Request handling order:

1. Look for exact existing tour in target language.
2. If exact tour exists and has complete audio, return it.
3. If exact tour exists but audio is incomplete, repair/generate missing target-language audio for that tour and return it.
4. If no usable exact-language tour exists, search for a base itinerary in any other language with same city/country/theme/duration.
5. If a base itinerary exists and has source POI metadata, create a new localized tour from it.
6. If base itinerary lacks source POI metadata, use fallback behavior.
7. If no base itinerary exists, run the full generation pipeline.

## Reuse Keys

Exact localized tour key:

`city + countryCode + theme + language + durationMinutes`

Cross-language itinerary key:

`city + countryCode + theme + durationMinutes`

Do not include language in the itinerary key.

## Data Model Plan

No Prisma migration is required for the first implementation because `places.metadata` and `tours.metadata` already exist.

Add domain metadata support.

Files:

- `backend/src/domain/entities/Place.ts`
- `backend/src/infrastructure/postgres/PostgresTourRepository.ts`
- `backend/src/types/api.ts` if API exposure is needed

Add optional `metadata` to `Place`:

```ts
metadata?: PlaceMetadata;
```

Recommended `PlaceMetadata` shape:

```ts
export interface PlaceMetadata {
  sourcePoi?: {
    osmType: 'node' | 'way' | 'relation';
    osmId: number;
    wikidata?: string;
    wikipedia?: string;
    osmName?: string;
    localName?: string;
    category?: string;
    landmarkTier?: string;
    fameScore?: number;
    osmTags?: Record<string, string>;
  };
  localizedFromPlaceId?: string;
  localizedFromTourId?: string;
  localizedFromLanguage?: string;
}
```

Recommended `Tour.metadata` additions:

```ts
{
  itineraryKey: string;
  localizedFromTourId?: string;
  localizedFromLanguage?: string;
  generationMode: 'full' | 'exact-reuse' | 'cross-language-localization' | 'audio-repair';
}
```

## Persist Source POI Metadata

When saving a newly generated full tour, store enough POI identity in each place.

Current full generation path builds `StructuralTourPlace`, which includes:

- `poi`
- `name`
- `coordinates`
- `category`
- `importance_score`
- `fameScore`
- `landmarkTier`

Persist the relevant POI identity into `Place.metadata.sourcePoi`.

This makes future cross-language localization possible without rerunning Overpass/ranking/routing.

Required change:

In `generateCompleteTour()`, when building `tourToSave.places`, include:

```ts
metadata: {
  sourcePoi: {
    osmType: p.poi?.osmType,
    osmId: p.poi?.osmId,
    wikidata: p.poi?.tags?.wikidata,
    wikipedia: p.poi?.tags?.wikipedia,
    osmName: p.poi?.tags?.name,
    localName: p.name,
    category: p.category,
    landmarkTier: p.landmarkTier,
    fameScore: p.fameScore,
    osmTags: p.poi?.tags,
  }
}
```

Also update `PostgresTourRepository.save()` to write `place.metadata`.

Also update `mapPlace()` to read `p.metadata`.

## Repository Changes

Update `ListToursOptions`:

```ts
export type ListToursOptions = {
  city?: string;
  countryCode?: string;
  theme?: string;
  language?: string;
  durationMinutes?: number;
  limit?: number;
  offset?: number;
};
```

Update repository implementations:

- `PostgresTourRepository.list()`
- `SupabaseTourRepository.list()` if still needed

Postgres filtering should support:

- `city`
- `countryCode`
- `theme`
- `language`
- `durationMinutes`

## New Orchestration Helpers

Add these private methods to `OrchestrationService`.

### `findExactTour(request)`

Purpose:
Find same city/country/theme/language/duration.

Return:
`TourResponse | null`

Behavior:
Return complete tour only if every place has audio.

### `repairExactTourAudio(request, existingTour)`

Purpose:
If exact target-language tour exists but missing audio, generate audio for its places instead of creating a duplicate tour.

Return:
`TourResponse`

Behavior:
Use existing places and call `generateAudio(places, targetLanguage)`.
Do not create a new tour row.
Audio assets are saved against existing place IDs.

### `findBaseItinerary(request)`

Purpose:
Find same city/country/theme/duration in any language.

Return:
`Tour | null`

Behavior:
Exclude the target language.
Prefer the most recent completed tour.
Prefer tours whose places all contain `metadata.sourcePoi`.
Fallback to most recent tour if no metadata-rich tour exists.

### `canLocalizeFromSourceMetadata(baseTour)`

Purpose:
Check if every base place has enough source metadata to reconstruct POI seeds.

Minimum required:

- `sourcePoi.osmType`
- `sourcePoi.osmId`
- coordinates
- place name

Preferred:

- `wikidata`
- `wikipedia`
- `osmTags`
- `category`
- `landmarkTier`
- `fameScore`

### `buildLocalizedTourFromBase(request, baseTour)`

Purpose:
Create a target-language tour using the base itinerary.

Steps:
1. Reconstruct `RawPoi[]` from base place metadata.
2. Call `enrichShortlistedPois(rawPois, targetLanguage, poiEnrichmentCache, 4)`.
3. Preserve the original base route order.
4. Build `StructuralTourPlace[]` from enriched POIs and base place order.
5. Call `buildNarratedPlaces(...)` with target language.
6. Reuse `imageUrl` from base places.
7. Save new tour with `language = targetLanguage`.
8. Add `metadata.localizedFromTourId`.
9. Generate target-language audio with VoxCPM.
10. Return the new localized tour.

## Cross-Language Flow

Replace current beginning of `generateCompleteTour()` with this decision flow:

```ts
const exactTour = await this.findExactTour(request);
if (exactTour?.completeAudio) return exactTour.response;

if (exactTour?.incompleteAudio) {
  return await this.repairExactTourAudio(request, exactTour.tour);
}

const baseTour = await this.findBaseItinerary(request);
if (baseTour && this.canLocalizeFromSourceMetadata(baseTour)) {
  return await this.buildLocalizedTourFromBase(request, baseTour);
}

return await this.generateFullTour(request);
```

Implementation detail:
Current `generateCompleteTour()` is large. Prefer extracting current full-generation body into:

```ts
private async generateFullTour(request: TourRequest): Promise<TourResponse>
```

Then `generateCompleteTour()` becomes the routing/orchestration entrypoint.

## Fallback For Old Tours Without Metadata

Old tours may not have `Place.metadata.sourcePoi`.

Recommended first behavior:
If base tour lacks source POI metadata, do not localize from it. Run full generation.

Reason:
Translation-only fallback could create lower-quality narration and may carry factual or language artifacts.

Optional later behavior:
Add a translation-based fallback only after native localization works.

Translation fallback would:
- reuse place order, coordinates, image URLs
- translate/rewrite descriptions to target language
- generate target-language audio
- mark tour metadata as `generationMode: "cross-language-translation-fallback"`

## Why Native Regeneration Is Preferred

Native target-language narration is better than direct translation because:

- It can use target-language Wikidata/Wikipedia cache.
- It avoids literal translated phrasing.
- It preserves the existing persona/tour-guide prompting.
- It uses the current narration quality controls.
- It benefits from `PoiNarrationCache` per `poiId/language/theme`.

## Audio Behavior

For localized tours:

- Always generate fresh audio in the target language.
- Do not reuse audio from the base language.
- Keep VoxCPM as primary.
- Use Kokoro only if VoxCPM fatal fallback is needed.

Exact target-language incomplete tour behavior:

- Generate missing audio for existing places.
- Store new `audio_assets`.
- Return the repaired existing tour.
- Do not create a duplicate tour.

## Image Behavior

For cross-language localized tour:

- Reuse `imageUrl` from base places.
- Do not call Wikimedia again.
- Images are language-independent enough for this phase.

## Quality Gate Behavior

For cross-language localization:

- Do not rerun route confidence checks from scratch.
- Copy relevant `qualityStatus`, `confidence`, and `repair` metadata from the base tour.
- Add localization metadata.

Recommended metadata:

```ts
{
  qualityStatus: baseTour.metadata?.qualityStatus,
  confidence: baseTour.metadata?.confidence,
  repair: baseTour.metadata?.repair,
  localizedFromTourId: baseTour.id,
  localizedFromLanguage: baseTour.language,
  generationMode: 'cross-language-localization'
}
```

## Tests

Add tests in `backend/src/services/orchestrationService.test.ts`.

Test 1:
Exact target-language complete tour is returned.

Expected:
- no `generateStructuralTourData`
- no `buildNarratedPlaces`
- no `generateAudio`

Test 2:
Exact target-language incomplete tour repairs audio.

Expected:
- calls `generateAudio`
- does not call `tourRepository.save`
- returns same tour ID

Test 3:
Cross-language base tour with source metadata creates localized tour.

Request:
Madrid / ES / history / es / 240

Existing:
Madrid / ES / history / fr / 240

Expected:
- no Overpass/ranking/route composition
- calls enrichment for target language
- calls `buildNarratedPlaces` in `es`
- saves a new tour with `language: 'es'`
- generates audio in `es`
- metadata contains `localizedFromTourId`

Test 4:
Cross-language base tour without source metadata falls back to full generation.

Expected:
- calls `generateStructuralTourData`
- does not try to localize from incomplete metadata

Test 5:
No base tour falls back to full generation.

Expected:
- existing current full flow still works

## Implementation Phases

### Phase 1: Persist POI Source Metadata

Files:
- `backend/src/domain/entities/Place.ts`
- `backend/src/infrastructure/postgres/PostgresTourRepository.ts`
- `backend/src/services/orchestrationService.ts`

Tasks:
- Add `metadata` to domain `Place`.
- Map Prisma `Place.metadata` in `PostgresTourRepository`.
- Save `metadata.sourcePoi` for new full-generation tours.
- Typecheck.

Verification:
- Generate one new tour.
- Inspect DB place rows.
- Confirm each place has `metadata.sourcePoi`.

### Phase 2: Exact Tour Audio Repair

Files:
- `backend/src/services/orchestrationService.ts`
- `backend/src/services/orchestrationService.test.ts`

Tasks:
- Split exact-language lookup into complete vs incomplete.
- If incomplete, call `generateAudio()` for existing places.
- Return same tour ID.
- Add tests.

Verification:
- Create a tour with missing audio.
- Request same language again.
- Confirm no duplicate tour is created.

### Phase 3: Cross-Language Base Lookup

Files:
- `backend/src/domain/repositories/TourRepository.ts`
- `backend/src/infrastructure/postgres/PostgresTourRepository.ts`
- `backend/src/infrastructure/supabase-adapter/SupabaseTourRepository.ts`
- `backend/src/services/orchestrationService.ts`

Tasks:
- Add `countryCode` and `durationMinutes` filters.
- Add `findBaseItinerary()`.
- Prefer metadata-rich base tours.
- Add tests.

Verification:
- Existing French Madrid tour should be found for Spanish Madrid request.

### Phase 4: Native Localization From Source Metadata

Files:
- `backend/src/services/orchestrationService.ts`

Tasks:
- Add `buildLocalizedTourFromBase()`.
- Reconstruct `RawPoi[]`.
- Call `enrichShortlistedPois()` in target language.
- Preserve base route order.
- Reuse base images.
- Save localized target-language tour.
- Generate target-language audio.

Verification:
- Request Madrid Spanish after Madrid French exists.
- Confirm no Overpass full route pipeline.
- Confirm new tour language is Spanish.
- Confirm stops/order/images match base tour.
- Confirm audio files are Spanish target-language files.

### Phase 5: Metadata And Observability

Files:
- `backend/src/services/orchestrationService.ts`
- docs/logging if desired

Tasks:
- Log `generationMode`.
- Log base tour ID when localizing.
- Log target language.
- Log whether path was exact-reuse, audio-repair, cross-language-localization, or full-generation.

Verification:
- Logs clearly show:
  `Reusing itinerary from tour <id> for target language es`

## Acceptance Criteria

- Requesting an existing exact-language complete tour returns it without regeneration.
- Requesting an existing exact-language incomplete tour repairs audio instead of creating a duplicate.
- Requesting a new language for an existing itinerary creates a new localized tour.
- Cross-language localization does not call Overpass/ranking/routing.
- Cross-language localized tour preserves stop count, order, coordinates, and images.
- New localized tour has narration and audio in target language.
- If source metadata is missing, system safely falls back to full generation.
- Tests cover exact reuse, audio repair, cross-language localization, and fallback.

## Risks

Risk:
Old tours lack `Place.metadata.sourcePoi`.

Mitigation:
Fallback to full generation for old tours.

Risk:
Persisted metadata may be too large if storing all OSM tags.

Mitigation:
Store only useful tags first: `name`, `wikidata`, `wikipedia`, `tourism`, `historic`, `building`, `architect`, `museum`, `amenity`, `shop`, `man_made`, `start_date`, `heritage`.

Risk:
Localized generated narration differs in stop transitions if next stop names are not translated.

Mitigation:
Use enriched target-language names before calling `buildNarration()`.

Risk:
Duplicate tours already exist.

Mitigation:
Do not add DB unique constraints in first phase. Clean dev data manually with `dev-reset-all.sh`. Add uniqueness later after duplicates are handled.

## Non-Goals For First Implementation

- No new itinerary table.
- No hard DB unique constraint yet.
- No translation-only fallback yet.
- No frontend changes required.
- No audio reuse across languages.
- No deletion or migration of old duplicate tours.

## Future Improvement

Introduce an explicit `Itinerary` table:

- `itineraries`: city, countryCode, theme, durationMinutes, route structure
- `tour_localizations`: itineraryId, language, narration, audio

This would be cleaner long-term, but the first implementation should use existing `tours`, `places`, and JSON metadata to keep the change small.
