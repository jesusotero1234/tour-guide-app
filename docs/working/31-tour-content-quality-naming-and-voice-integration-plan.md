# Tour Content Quality, Naming, And Voice Integration Plan

## Status

Ready for implementation.

## Context

We are working in:

`/mnt/c/Users/Jesus/Desktop/Coding/tour-guide-app`

Current branch:

`feature/city-intelligence-foundation`

There is a separate voice worktree:

`/mnt/c/Users/Jesus/Desktop/Coding-voxcpm-voice-styles/tour-guide-app`

Do not merge the voice worktree directly. It was based before the City Intelligence work and will overwrite or conflict with concept-first generation.

## Core Problem

Madrid now has enough tours with audio to unlock Flexible Pass, but some "eligible" tours are not product-ready.

Example bad narration:

```txt
Visit Puerta del Sol.
Visit Plaza Mayor de Madrid.
Visit plaza de Chueca.
```

Audio completeness alone is not a valid readiness signal. A tour can have full audio and still be commercially weak.

## Goals

- Prevent tours with poor narration from appearing as pass-ready.
- Keep sellable two-hour audio walks at five or more stops.
- Replace generic tour titles like `Art`, `Historical`, `Markets` with localized, customer-facing titles.
- Improve Browse and Pass UX so we sell "audio walks", not raw internal themes.
- Preserve and display richer narration content.
- Keep VoxCPM pacing improvements.
- Later port `voiceStyle` correctly, without breaking concept-first generation or reuse.

## Non-Goals

- Do not add checkout or real payment.
- Do not merge `feature/voxcpm-voice-styles` directly.
- Do not relax Flexible Pass eligibility just to show more inventory.
- Do not remove existing user or unrelated worktree changes.
- Do not overbuild a full CMS.

## Implementation Order

1. Add content readiness evaluator.
2. Apply readiness gate to Flexible Pass eligibility and exact reuse.
3. Persist/retrieve narration sections.
4. Strengthen narrative fallback so `Visit X.` never becomes product content.
5. Add localized concept display copy.
6. Update Browse, Passes, ConceptPicker, and PlaceCard UX.
7. Regenerate Madrid bad inventory.
8. Verify Madrid pass.
9. Port voice styles later as a separate phase.

## Phase 1: Content Readiness Evaluator

Create:

`backend/src/services/tourReadiness/contentReadiness.ts`

Add tests:

`backend/src/services/tourReadiness/contentReadiness.test.ts`

Export:

```ts
export interface StopContentReadiness {
  ready: boolean;
  wordCount: number;
  paragraphCount: number;
  fallbackLike: boolean;
  reasons: string[];
}

export interface TourContentReadiness {
  ready: boolean;
  averageWords: number;
  shortStopCount: number;
  fallbackStopCount: number;
  stopCount: number;
  reasons: string[];
  stops: Array<{
    placeId?: string;
    name: string;
    wordCount: number;
    paragraphCount: number;
    fallbackLike: boolean;
    reasons: string[];
  }>;
}

export function evaluateStopContentReadiness(place: {
  id?: string;
  name: string;
  description?: string | null;
}): StopContentReadiness;

export function evaluateTourContentReadiness(places: Array<{
  id?: string;
  name: string;
  description?: string | null;
}>): TourContentReadiness;
```

Suggested thresholds:

```ts
const MIN_STOP_WORDS = 90;
const MIN_AVERAGE_STOP_WORDS = 160;
const MAX_SHORT_STOPS = 1;
const MIN_DESCRIPTION_CHARS = 350;
```

Fallback-like patterns:

```ts
/^Visit\s+.+\.$/i
/^Visit\s+.+,\s+a notable/i
/^Visit\s+.+,\s+a notable (location|stop|place)/i
/^Visita\s+.+\.$/i
/^Llegamos a .+\.$/i
```

Important nuance:

- Do not hard-fail only because text says sources are limited.
- "Sources are limited" is acceptable if the narration is still long, useful, and grounded.
- Hard-fail obvious one-line fallback shapes and very short descriptions.

A tour is content-ready when:

```ts
fallbackStopCount === 0
shortStopCount <= MAX_SHORT_STOPS
averageWords >= MIN_AVERAGE_STOP_WORDS
stopCount > 0
```

For Flexible Pass eligibility, content readiness is necessary but not sufficient. A pass tour must also have at least five stops. The concept-first MVP currently uses `120` minutes for city concepts; four stops over two hours feels sparse for a paid audio walk.

## Phase 2: Apply Readiness Gate To Flexible Pass

Update:

`backend/src/services/orchestrationService.ts`

In `getEligibleFlexiblePassTours`, eligibility should require:

```ts
const hasCompleteAudio = hydrated.places.length > 0 && hydrated.places.every((place) => Boolean(place.audioUrl));
const contentReadiness = evaluateTourContentReadiness(hydrated.places);

if (!hasCompleteAudio || !contentReadiness.ready) {
  continue;
}
```

Log skipped tours:

```ts
console.log('[flexible_pass_readiness]', JSON.stringify({
  tourId: tour.id,
  city: tour.city,
  conceptSlug: tour.metadata?.conceptSlug ?? null,
  hasCompleteAudio,
  contentReady: contentReadiness.ready,
  reasons: contentReadiness.reasons,
}));
```

## Phase 3: Prevent Bad Exact Reuse

Current reuse can return a complete-audio tour even if the content is bad.

Update:

`backend/src/services/orchestrationService.ts`

Apply readiness checks in:

- `findExactTour`
- `findExactConceptTour`

Behavior:

- If a matching tour has complete audio but fails content readiness, do not reuse it.
- Continue searching other candidates.
- If no candidate is ready, generate a fresh tour.
- Log why reuse was skipped.

## Phase 4: Persist Narration Sections

Problem:

`descriptionSections` are generated in memory but not persisted in Postgres. After retrieve, the app only has `description`.

Use minimal approach without a Prisma migration.

Update:

`backend/src/domain/entities/Place.ts`

Extend metadata:

```ts
export interface PlaceMetadata {
  sourcePoi?: PlaceSourcePoiMetadata;
  localizedFromPlaceId?: string;
  localizedFromTourId?: string;
  localizedFromLanguage?: string;
  descriptionSections?: Record<string, string>;
  nameInTourLanguage?: string;
}
```

Update:

`backend/src/infrastructure/postgres/PostgresTourRepository.ts`

When saving a place, fold `descriptionSections` and `nameInTourLanguage` into `metadata`.

When mapping a place, hydrate those fields back onto the entity.

## Phase 5: Strengthen Narrative Fallback

Problem:

The worst fallback path can still produce `Visit X.`.

Update:

`backend/src/services/narrative/NarrativeBuilder.ts`

Add helpers:

```ts
function countWords(text: string): number;
function isFallbackLikeNarration(text: string): boolean;
function buildGroundedFallbackNarration(...): BuiltNarration;
```

Use the robust fallback when:

- `/narrative/stop/long` returns empty narration.
- `/narrative/stop` returns empty narration.
- `/narrative/stop` returns a fallback-like or too-short narration.
- both endpoints fail.

Minimum fallback requirements:

- 3 paragraphs.
- At least 100 words.
- Uses place name, city, theme, position, and available OSM/Wikidata cues.
- No invented dates, people, events, countries, or wars.
- Works in Spanish and English at minimum.

Also update:

- `pods/llm-pod/src/routes/narrative.ts`
- `pods/llm-pod/src/routes/narrativeLong.ts`

so pod-level fallbacks are no longer one-line generic output.

## Phase 6: Localized Display Copy

Create:

`backend/src/services/cityIntelligence/conceptDisplayCopy.ts`

Export:

```ts
export interface ConceptDisplayCopy {
  title: string;
  subtitle: string;
  label: string;
}
```

Madrid Spanish copy:

```ts
'es': {
  'madrid-art': {
    title: 'El Paseo del Arte Sin Prisa',
    subtitle: 'Museos, esculturas y colecciones para mirar Madrid con otros ojos.',
    label: 'Arte y museos',
  },
  'madrid-religious': {
    title: 'Cupulas, Santos y Poder',
    subtitle: 'Un recorrido por iglesias, catedrales y simbolos sagrados de la ciudad.',
    label: 'Madrid sagrado',
  },
  'madrid-historical': {
    title: 'Kilometro Cero y Memoria de Madrid',
    subtitle: 'Plazas, instituciones y lugares donde la historia urbana se vuelve visible.',
    label: 'Historia urbana',
  },
  'madrid-markets': {
    title: 'Plazas, Mercados y Vida de Barrio',
    subtitle: 'Un paseo por los espacios donde Madrid compra, charla y se encuentra.',
    label: 'Vida local',
  },
}
```

Use display copy in:

- Concept discovery API responses.
- Flexible Pass tour summaries.
- Browse tour summaries.

Do not rely only on stored DB titles, because existing `TourConcept` rows already have old generic names.

## Phase 7: Frontend UX

Update:

- `frontend/src/app/tours/page.tsx`
- `frontend/src/components/tours/SearchBox.tsx`
- `frontend/src/components/tours/TourCard.tsx`
- `frontend/src/app/passes/page.tsx`
- `frontend/src/app/passes/flexible/[city]/page.tsx`
- `frontend/src/components/form/ConceptPicker.tsx`
- `frontend/src/components/form/TourForm.tsx`
- `frontend/src/components/tour/PlaceCard.tsx`

Goals:

- Browse should lead with audio-walk language, not raw theme tags.
- Pass cards should show localized, cool titles and helpful labels.
- ConceptPicker should feel like selecting an experience, not an internal confidence model.
- Place detail should show full narration by default instead of hiding most paragraphs.

## Phase 8: VoxCPM Pacing Safety

Current pacing changes are useful and should remain.

Important risk:

`VOXCPM_SILENCE_THRESHOLD` default is currently `8`.

If VoxCPM returns float audio between `-1` and `1`, threshold `8` is too high. It can trim up to `120ms` at edges even when the audio is not silence.

Update:

`pods/voxcpm-pod/src/services/voxcpm.py`

Change silence threshold handling to support float audio safely.

## Phase 9: Regenerate Madrid Inventory

After backend gates and fallback fixes:

```bash
cd backend
npm run inventory:seed-flexible-pass -- "Madrid|ES|es|Spain"
```

Expected:

- Madrid appears.
- At least 3 eligible tours.
- `madrid-markets` only appears if regenerated with strong content.
- No pass-eligible stop has `Visit X.`.
- Titles are Spanish display titles.

## Phase 10: Voice Styles Later

Do not apply the existing voice-style branch directly.

Port manually after content/naming is stable.

Correct design:

- Add `voiceStyle?: VoiceStyle` to `TourRequest` and `ConceptTourRequest`.
- Resolve default voice style from concept route type, not just theme.
- Persist `metadata.voiceStyle`.
- Include `voiceStyle` in itinerary identity.
- Reuse existing tours only when stored `metadata.voiceStyle` matches resolved style.
- Do not skip all reuse just because `voiceStyle` is present.

## Acceptance Criteria

- Browse no longer leads with raw theme tags.
- Flexible Pass cards show localized, cool titles.
- Concept picker feels like choosing an experience, not an internal category.
- Tour detail shows full narration by default.
- Full audio is not enough for pass eligibility.
- `Visit X.` cannot enter Flexible Pass inventory.
- Bad exact cached tours are not silently reused.
- New fallback narrations are multi-paragraph and useful.
- VoxCPM paragraph pacing remains active.
- Madrid Flexible Pass exposes at least 3 high-quality Spanish audio walks.
