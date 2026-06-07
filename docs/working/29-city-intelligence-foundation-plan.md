# 29 - City Intelligence Foundation Plan

Status: draft

Date: 2026-05-31

## Goal

Move the product from generic tour generation toward city-driven concept discovery:

1. audit how much route variety the current system actually produces,
2. precompute recommended tour concepts per city and language,
3. generate tours from validated concepts,
4. use those tours as the basis for flexible and fixed passes.

This plan assumes product quality matters more than pricing at this stage.

## Locked Decisions

- Concept discovery is precomputed per city and language.
- If a city has no cached concepts yet, the backend computes them on first request and caches them.
- Only `high` and `medium` confidence concepts are exposed to users.
- `low` confidence concepts remain internal for review or logging.
- `folklore` and myth routes are out of the first version.
- Public OSRM is acceptable for initial validation-only walkability checks.
- Real payments are out of scope until the product proves route quality and concept quality.
- Flexible passes come before curated fixed passes.

## Out Of Scope

- TTS and narration pipeline changes.
- Wikimedia image attribution work.
- Commercial tile provider migration.
- User accounts.
- Production payment flow.

## Phase A - Multi-Route Audit

### Objective

Measure how distinct the current tours already are for the same city across themes and durations.

### Why first

Before adding concept discovery, the project needs evidence about current route overlap. If the existing pipeline already produces meaningfully different routes by theme, flexible passes can start earlier. If not, concept-driven generation becomes mandatory.

### Deliverables

- `backend/scripts/audit/multi-route-overlap.ts`
- JSON audit report under `backend/scripts/audit/output/`
- brief console summary of overlap by pair of tours

### Inputs to audit

- Madrid / es / history / 60, 120, 240
- Madrid / es / architecture / 120
- Madrid / es / food / 120
- Valencia / es / history / 120, 240
- Valencia / es / architecture / 120

### Measurements

- shared stops by normalized name
- shared stops by `metadata.sourcePoi.wikidata` when present
- overlap percentage relative to the smaller route
- stop counts
- route diagnostics when available

### Success criteria

- script runs against the current system with no production changes
- overlap matrix is persisted as JSON
- summary identifies whether current tours are distinct enough for product use

### Decision gate

- if cross-theme overlap is generally below 40%, current variety is already usable for early flexible passes
- if same-theme duration variants overlap above 70%, duration alone is not a strong differentiator
- if overlap is broadly high, move directly into concept-driven route generation

## Phase B - City Intelligence Discovery Layer

### Objective

Add a backend layer that analyzes a city and recommends 5 to 8 sellable tour concepts before any route is generated.

### Core product behavior

User flow target:

1. user chooses a city,
2. backend analyzes the city,
3. backend returns recommended concepts,
4. user chooses one concept,
5. backend generates a tour from that concept.

### Data model additions

Add cache and concept persistence models:

- `CityConceptCache`
- `TourConcept`

Each stored concept should capture:

- city
- country code
- language
- slug
- title
- route type
- angle
- icon key
- estimated stops
- suggested duration
- confidence
- anchor POIs
- supporting POIs
- validation signals
- status

### Concept output shape

Public response should follow a stable structure similar to:

```ts
type ConceptRouteType =
  | 'historical'
  | 'architecture'
  | 'royal'
  | 'religious'
  | 'markets'
  | 'literature'
  | 'art'
  | 'general';

type ConceptConfidence = 'high' | 'medium' | 'low';

interface ConceptPoiRef {
  wikidata?: string;
  osmType: 'node' | 'way' | 'relation';
  osmId: number;
  name: string;
  lat: number;
  lng: number;
  category: string;
  landmarkTier: string;
  fameScore: number;
}

interface TourConcept {
  slug: string;
  title: string;
  routeType: ConceptRouteType;
  angle: string;
  iconKey: string;
  estimatedStops: number;
  suggestedDurationMinutes: number;
  confidence: ConceptConfidence;
  reason: string;
  anchorPois: ConceptPoiRef[];
  supportingPois: ConceptPoiRef[];
  signals: {
    poiCount: number;
    flagshipCount: number;
    majorCount: number;
    spreadMeters: number;
    overlapWithOthers: Record<string, number>;
    walkabilityOk: boolean;
  };
}
```

### Discovery pipeline

1. geocode city
2. fetch broad POI pools across `history`, `architecture`, `food`, and `art`
3. dedupe POIs across themes by OSM identity
4. enrich candidate subsets with landmark metadata and selected Wikipedia bodies
5. apply pool filters L1, L2, L3
6. generate concept candidates by route type
7. validate walkability of anchors with OSRM
8. compute overlap between concepts and discard weaker duplicates
9. assign confidence and persist cache

### Pool rules

#### Pool L1 - identifiable candidate

- valid name
- valid coordinates
- not low-value for history
- not excluded by semantic history filters

#### Pool L2 - notable candidate

At least one of:

- Wikidata tag
- Wikipedia tag
- heritage tag
- historic palace/castle/manor/city gate/city walls
- cathedral/palace/castle building tag
- attraction with historical/notability support

If Wikidata exists, require sitelinks >= 3.

#### Pool L3 - concept anchor

- `landmarkTier` is `flagship` or `major`
- sitelinks >= 8
- `wikipediaBody` length >= 500
- category is known and not `other`

### Initial route types in scope

- `historical`
- `architecture`
- `royal`
- `religious`
- `markets`
- `art`
- `general`

### Route type rules

#### historical

- at least 2 L3 anchors
- at least 4 L2 supporting POIs
- at least 3 POIs with `inception` or heritage evidence

#### architecture

- at least 2 POIs with `architect` or `architecturalStyle`
- at least 2 L3 anchors

#### royal

- at least 2 `palace_castle` POIs with sitelinks >= 10
- at least 1 flagship anchor

#### religious

- at least 3 `religious` POIs with heritage or sitelinks >= 5
- spread within reasonable walking bounds

#### markets

- at least 2 notable `market` POIs
- at least 4 supporting L2 POIs nearby

### Walkability validation

Use public OSRM only for final concept validation:

- route anchors only, not the full raw pool
- retry with backoff on transient failures
- mark `walkabilityOk` false when actual walking is materially worse than the estimated straight-line route

### Confidence rules

#### high

- 3 or more L3 anchors
- walkability OK
- low overlap with other accepted concepts
- strong enrichment and category cohesion

#### medium

- concept clears minimum thresholds but some signals are weaker

#### low

- below minimum thresholds or too repetitive
- never exposed in the public API

### API

Add:

- `GET /api/v1/cities/:city/concepts?language=es&country=ES`
- `GET /api/v1/cities/:city/concepts/all?language=es`

The public route returns only `high` and `medium` concepts.

### Tests

- unit tests for L1/L2/L3 rules
- unit tests for concept generation from fixtures
- tests for overlap-based rejection
- API controller tests for public vs internal responses

### Decision gate

- if Madrid and Valencia produce coherent, distinct concepts, continue
- if concepts are generic or duplicated, adjust rules before moving on

## Phase C - Generate Tour From Concept

### Objective

Generate a real tour using a selected concept instead of a broad theme-only request.

### Deliverables

- `POST /api/v1/tours/generate-from-concept`
- persistence of `conceptSlug` in tour metadata
- reuse logic for exact concept-language-duration matches

### Generation behavior

1. load selected concept
2. reuse an exact existing concept tour if available
3. otherwise build route candidates from concept anchors and supporting POIs
4. compose a walking route
5. continue through the existing narration, image, and audio pipeline
6. save the tour with `generationMode: 'from-concept'`

### Tests

- generate from concept returns a tour anchored to concept POIs
- repeated generation of the same concept reuses the existing tour when possible

### Decision gate

- if the generated routes reflect the concept clearly, continue
- if concept identity is lost during composition, composer constraints need to improve first

## Phase D - Frontend Concept Picker

### Objective

Replace the broad theme selector with a city-first concept discovery flow.

### UX target

1. user picks city
2. app loads concept recommendations
3. user selects a concept card
4. user adjusts language and optional duration
5. app generates the tour from the concept

### Deliverables

- `ConceptPicker` component
- frontend concept types
- API client helpers for concept discovery and generation from concept
- updated `TourForm`

### UI requirements

- clear concept card title
- route type / duration / stop count summary
- confidence label
- loading state for first-time city analysis
- mobile-first layout

### Decision gate

- if users understand the concept-first flow, continue
- if confusion remains high, keep a fallback generic generation path

## Phase E - Flexible Pass

### Objective

Offer a same-city, same-language bundle of 3 tours before adding real payments.

### Deliverables

- backend config for flexible passes
- pass options endpoint
- quote endpoint
- `/passes` and `/passes/flexible/[city]` frontend pages
- fake-door CTA and interest tracking

### Rules

- same city
- same country code
- same language
- only tours with complete audio
- fixed required count, initially 3

### Decision gate

- if pass interest exists, continue toward real checkout later
- if no interest exists, improve concept and route quality before pricing work

## Phase F - Fixed Passes

### Objective

Create curated bundles of strong concept tours per city.

### Deliverables

- `FixedPass` and `FixedPassTour` persistence
- proposal script that groups non-overlapping concept tours
- LLM-assisted copy generation for pass title and description
- pass detail page

### Important constraint

The LLM may write copy, but it does not choose which tours belong in the pass. Tour selection remains rule-based.

### Decision gate

- compare click interest of fixed vs flexible passes

## Phase G - Access And Payments

### Objective

Add real checkout and entitlement-based access once the product is ready.

### Pre-conditions

- legal and commercial blockers must be resolved first
- map tile, media attribution, and policy work must be completed first

### Deliverables

- order persistence
- entitlement persistence
- Stripe checkout session and webhook handling
- preview vs unlocked tour response logic
- frontend success flow and token storage

### Decision gate

- if preview-to-purchase conversion is real, continue
- if not, revisit product value first

## Phase H - Deeper Historical Routes

### Objective

Support sharper concept identity such as old court, royal power, markets, or old town rather than broad generic history.

### Likely additions

- concept-specific spatial bounds
- preferred and penalized categories
- concept angle passed into narration
- stronger composer bias toward concept identity

## Phase I - Pass Recommendation Assistant

### Objective

Recommend the best pass using the validated catalog rather than inventing new products.

### Principle

Rules choose the actual pass or flexible combination. AI only explains the recommendation.

## Phase J - Small Commercial Launch

### Objective

Launch in one strong city once route quality, concepts, and legal blockers are in place.

### Focus metrics

- preview to purchase conversion
- average order value
- tour completion
- individual vs pass demand

## Execution Order

1. Phase A - multi-route audit
2. Phase B - city intelligence discovery layer
3. Phase C - generate tour from concept
4. Phase D - frontend concept picker
5. Phase E - flexible pass
6. Phase F - fixed passes
7. Phase G - payments and access
8. Phase H - deeper historical routes
9. Phase I - pass recommendation assistant
10. Phase J - launch

## Immediate Next Step

Execute Phase A first and let the overlap audit decide whether current route variety is enough for early product packaging or whether concept-driven route generation must happen before passes.
