# Tour quality rubric

This rubric defines **commercially good** tours. Pipeline health metrics are useful,
but they do not prove that a visitor will receive a coherent, memorable experience.

## Publication rule

A tour is publishable when it:

1. passes every hard gate;
2. scores at least 80/100; and
3. has evidence for every scored dimension. Missing evidence is not a pass.

## Hard gates

| Gate | Requirement | Evidence |
|---|---|---|
| Factual safety | Zero contradicted critical claims | Aggregated `claimCheck` |
| Route identity | No duplicate POI/Wikidata identity | Final route |
| Theme | No known off-theme negative | City/theme oracle |
| Duration | Estimated duration is 85–115% of requested duration | Route diagnostics |
| Narration | No fallback or generic stop narration | Narration quality metadata and text |
| Completeness | Every stop has a name, coordinates, source material, and narration | Persisted tour/snapshot |

## Scorecard (100 points)

### Route and place selection — 25

- 10: expected flagship coverage;
- 5: walkable geographic continuity, with no implausible outlier;
- 5: category diversity (largest category share at most 60%);
- 5: duration coverage within 90–110% (the hard gate remains 85–115%).

### Whole-tour story — 25

Human review against the frozen output:

- 10: one clear promise or question connects the complete tour;
- 5: the order creates progression rather than an interchangeable list;
- 5: opening establishes the route and closing resolves it;
- 5: transitions explain why the next stop follows.

### Stop experience — 25

Review every stop; the tour score is the average:

- 5: directs attention to something the visitor can observe;
- 5: supplies place-specific historical context;
- 5: explains why the place matters to the tour theme;
- 5: contains one memorable, source-supported idea;
- 5: avoids repeating facts or framing used at other stops.

### Spoken narration — 15

- 5: natural spoken language in the requested locale;
- 4: specific rather than generic or encyclopedic;
- 3: varied rhythm and openings across stops;
- 3: appropriate length, without padding or abrupt fragments.

### Factual quality — 10

- 5: at least 80% of extracted factual claims verified;
- 3: unverified claims are qualified or removed;
- 2: source attribution is present for each stop.

## Evaluation protocol

Use the same frozen inputs for every comparison:

1. Capture `pools`, `candidates`, and `sources` fixtures.
2. Generate a baseline tour and save the complete output.
3. Score automated criteria, then perform the two human-review sections.
4. Change one part of the pipeline.
5. Regenerate from the same fixtures, without external enrichment calls.
6. Compare scores and keep the change only when hard gates still pass and the
   total score improves without hiding missing evidence.

Run the automated part against an exported tour with:

```bash
cd backend
npm run quality:audit -- path/to/tour.json path/to/manual-review.json
```

The manual review file contains the five bounded scores that cannot be inferred
honestly from metadata alone: `routeContinuity` (0–5), `wholeTourStory` (0–25),
`stopExperience` (0–25), `spokenNaturalness` (0–5), and
`factualQualification` (0–3). Without that review or any required runtime
evidence, the evaluator returns `score: null` and the relevant gate as `missing`.

## Madrid/history baseline (fixture captured 2026-05-30)

The current 240-minute fixture composes this route:

1. Museo del Prado
2. Museo Nacional Centro de Arte Reina Sofía
3. Palacio de Cristal
4. Puerta de Alcalá
5. Puerta del Sol
6. Plaza de Oriente
7. Palacio Real
8. Templo de Debod

Evidence available today:

| Criterion | Result |
|---|---|
| Duplicate identities | Pass: 0 |
| Expected flagship coverage | 6/8 (75%) |
| Largest category share | Pass: museums 3/8 (37.5%) |
| Duration | **Fail: 180.05/240 minutes (75%)** |
| Whole-tour story | Not verifiable: no frozen generated narration |
| Stop experience | Not verifiable: no frozen generated narration |
| Factual quality | Not verifiable: no frozen generated `claimCheck` |

Therefore the current fixture proves that route construction is broadly healthy,
but it does **not** prove that Madrid/history is a good tour under this rubric.
