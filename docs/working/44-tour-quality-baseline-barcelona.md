# Barcelona/history/fr — quality baseline

Date audited: 2026-06-22  
Persisted tour: `83c180d1-d899-45c6-8d36-6d72eb7a5cf8`  
Generated: 2026-06-10  
Request: Barcelona / history / French / 240 minutes

## Frozen evidence

- Complete persisted output: `backend/fixtures/tours/barcelona-history-fr-baseline.json`
- Wikipedia/Wikidata input: `backend/fixtures/sources/barcelona-history-fr.json`
- Manual review: `backend/fixtures/reviews/barcelona-history-fr-baseline.manual.json`
- Candidate and pool fixtures: `backend/fixtures/candidates/barcelona-history.json` and
  `backend/fixtures/pools/barcelona-history.json`

The source snapshot contains 40 Wikidata and 40 Wikipedia payloads copied from
`poi_enrichment_cache`. The replay test enriches all 40 shortlisted POIs from this
file and asserts that neither external enricher is called.

## Automated result

The tour is **not publishable**.

| Gate | Result | Evidence |
|---|---|---|
| Factual safety | Missing | `claimCheck` persisted for 0/8 stops |
| Route identity | Missing | `sourcePoi` persisted for 0/8 stops |
| Theme | Missing | POI identities were discarded before persistence |
| Duration | Fail | 186.14/240 minutes: 77.6% |
| Narration | Fail | 5/8 stops contain generic/multilingual fallback fragments |
| Completeness | Fail | 8/8 stops lack persisted source identity |

The formal score is `null`, deliberately. A numeric score would imply factual and
source evidence that the old persisted output does not contain.

## Route diagnosis

The route is geographically plausible: approximately 6.14 km straight-line total,
with no leg longer than 1.37 km. It contains 5 of the 7 expected Barcelona/history
anchors and its largest category occupies 3 of 8 stops. However, it underfills the
requested duration by more than an hour.

Manual route-continuity review: **4/5**.

## Editorial diagnosis

### Whole-tour story — 7/25

There is enough material for a strong idea — medieval civic/religious Barcelona
evolving into modernisme — but the order begins with a modernist concert hall,
returns to the medieval city, jumps to contemporary art, and only then resumes
modernisme. The narration never names or develops that arc. Most stops behave as
independent encyclopedia cards.

### Stop experience — 8/25

Some sections direct attention to façades, mosaics, ironwork, or urban context.
The useful observations are weakened by repeated introductions, invented visible
details and transitions that describe the current stop again instead of motivating
the walk to the next one.

### Spoken naturalness — 1/5

The requested language is French, but the tour repeatedly emits English templates
and Spanish connective grammar, for example `You've arrived at ... es un ... en
Barcelona` and `From here, continue toward ...`. Several sections sound translated
or malformed rather than spoken French.

### Factual qualification — 0/3

Claims are stated with certainty and the persisted tour contains no claim-check
evidence or qualification.

## Critical examples

1. **Palau de la Música Catalana**: its transition relocates the building to Poble
   Sec/Montjuïc, calls the façade gilded wood, and says Rudy Ricciotti built it in
   1997. The frozen source says Sant Pere, Lluís Domènech i Montaner, 1905–1908;
   1997 is the UNESCO inscription year.
2. **Santa Maria del Mar**: one section correctly gives 1329–1383 and Berenguer de
   Montagut; the transition then contradicts it with an early-20th-century building
   by Josep Maria Jujol.
3. **MACBA**: the narration places it near Parc de la Ciutadella despite correctly
   identifying El Raval elsewhere in the same stop.
4. **Casa Batlló**: a transition moves it to Gran Via even though the frozen source
   and another section correctly place it at 43 Passeig de Gràcia.
5. **Transitions**: several transitions reintroduce the same monument; they do not
   explain why the next stop follows in the tour's argument.

## Root causes exposed by this baseline

- Fallback section generation is accepted when the total narration is long.
- Validation checks isolated claims but does not reject contradictions between
  sections of the same stop.
- Language consistency is not a publication gate.
- A transition is not required to mention or lead toward the next stop.
- `sourcePoi` and narration `meta.claimCheck` were removed before persistence.
- Existing duration acceptance (`coverageRatio >= 0.7`) is too permissive for a
  commercial four-hour product.

The persistence loss is fixed for future generations in this work. The baseline
remains unchanged so it can serve as honest before/after evidence.
