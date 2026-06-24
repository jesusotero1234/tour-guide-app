# Scalable history canonicality plan

Date: 2026-06-24  
Goal: make `history` tours feel like places where history happened, not a list
of museums that contain historical material.

## Product definition

For a default city `history` tour, the route should prefer:

1. Places where public history happened: gates, walls, parliaments, palaces,
   memorials, squares, checkpoints, battle/war memory sites, civic power sites.
2. Places users expect in a first-time city history walk.
3. Museums only when they are also the site of history, or when they support a
   route that already has strong outdoor/civic anchors.
4. Compact walkability over artificial duration filling. A 240-minute tour
   should add good nearby stops, not jump across the metro area.

## Scalable approach

The system cannot rely on hardcoded city lists. The scalable architecture is:

- Overpass remains the base POI source.
- Wikidata adds a canonical fallback layer for high-sitelink, coordinate-backed
  historical landmarks near the city center.
- Candidate ranking computes a `HistoryPlaceProfile` from OSM/Wikidata signals:
  event-place, civic-power-site, memory-site, public-square, power-site,
  museum-container, etc.
- Route selection reserves 2-3 high-scoring lived-history anchors before filling
  with general fame/diversity.
- Route repair prevents overlong routes from solving duration by adding remote
  outliers.

This should scale to other countries because it uses general entity types and
labels, not city-specific rules:

- gate / puerta / porte / porta / Tor
- wall / muro / mur / Mauer
- parliament / congress / senate / Bundestag / Reichstag
- memorial / monument / Denkmal
- palace / castle / château / Schloss
- square / plaza / place / piazza / Platz

## Implemented changes

- Added Wikidata canonical POI fallback for history:
  - searches by city center/radius;
  - keeps high-sitelink, coordinate-backed historical places;
  - filters abstract events like "Reichstag fire";
  - merges canonical Wikidata signals into existing OSM POIs.
- Added `HistoryPlaceProfile` scoring.
- Added `civic_power` POI category for parliaments/government/courthouses.
- Updated ranking so history favors lived-history sites over museum containers.
- Updated route selection so history reserves high-value anchors before generic
  fame filling.
- Added overlong-route repair to avoid using remote outliers as fake duration.
- Added structural probe script:
  `backend/scripts/validation/probe-history-route-canonicality.ts`.

## Berlin structural probe

Command:

```bash
node -r ts-node/register scripts/validation/probe-history-route-canonicality.ts Berlin history 240
```

Canonical anchors found:

- Berlin Wall
- Brandenburg Gate
- Reichstag
- Bundesrat
- Potsdamer Platz
- Checkpoint Charlie
- Memorial to the Murdered Jews of Europe
- Soviet War Memorial
- Neue Wache

Selected structural route after the changes:

1. Alexanderplatz
2. Berlin Palace
3. Palace of the Republic
4. Berliner Dom
5. Neue Wache
6. Gendarmenmarkt
7. Checkpoint Charlie
8. Potsdamer Platz
9. Reichstag
10. Sowjetisches Ehrenmal Tiergarten
11. Denkmal für die ermordeten Juden Europas
12. Brandenburg Gate
13. Pariser Platz

Diagnostics:

- estimated duration: 234.7 minutes
- requested duration: 240 minutes
- coverage ratio: 97.8%
- no degraded route

Human read: this is much closer to a default Berlin history tour. It still lacks
a clean Berlin Wall stop because the existing OSM pool merges `Q5086` into a
remote wall fragment. That is the next data-quality issue: when a Wikidata item
represents a citywide feature, the system should prefer the canonical central
visitor point or a better local instance rather than a random fragment.

## Next implementation steps

1. Regenerate Berlin/de from the new structural candidates and audit text.
2. Add canonical visitor-point handling for distributed landmarks:
   Berlin Wall, Roman Forum, city walls, riverside fortifications, old town
   districts.
3. Add a route promise/profile:
   - default `history`: canonical first-time historical walk;
   - `history/museums`: museum-heavy historical collections;
   - `history/war`: conflict/memory route;
   - `history/royal`: palaces/monarchy route.
4. Extend the audit rubric with canonical-route expectation:
   a tour can be factual and still fail product expectations if it misses obvious
   anchors.
5. Re-run the multi-city batch and compare scores/routes before regenerating
   audio.

## Test status note

The new core tests pass:

- `PoiRanker.test.ts`
- `RouteSelection.test.ts`
- `WikidataCanonicalPoiFetcher.test.ts`
- backend TypeScript build

The broader `TourQuality.acceptance.test.ts` currently needs a follow-up update.
It still encodes the older assumption that some museums are mandatory history
anchors, e.g. Prado/Reina Sofía, Neue Nationalgalerie, Anne Frank Huis, Musée
Saint-Raymond and Museo Picasso Málaga. Under the new product definition, those
can still be good stops, but they should not automatically outrank places where
public history happened. The acceptance oracle should be split into:

- canonical lived-history anchors;
- acceptable supporting museums;
- profile-specific anchors for `history/museums`.
