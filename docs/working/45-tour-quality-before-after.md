# Barcelona narrative quality — before/after

Date: 2026-06-23  
Route: Barcelona / history / French / 240 minutes  
Source inputs: frozen `barcelona-history-fr.json` snapshot (40 Wikipedia + 40 Wikidata payloads)

## Experiment contract

Both outputs use the same frozen candidate pool and source material. Route
composition is part of the experiment: the candidate extends the original eight
stops to eleven to meet the requested duration without introducing an overlong
walking segment. Regeneration bypasses PostgreSQL narration cache, RAG and
external Wikipedia/Wikidata calls. Audio and images are not generated.

## Results

| Measure | Real baseline | Candidate |
|---|---:|---:|
| Mixed-language/generic fallback stops | 5/8 | **0/11** |
| Generated fallback sections | Unknown in old metadata | **0/44** |
| Stops with persisted source identity | 0/8 | **11/11** |
| Stops with persisted `claimCheck` | 0/8 | **11/11** |
| Critical contradicted claims reported | Unknown | **0** |
| Average verified-claim rate | Unknown | **80.0%** |
| Duration coverage | 77.6% | **95.4%** |
| Formal rubric score | `null` (evidence missing) | **85.1/100** |
| Publishable | No | **Yes** |

Manual-review dimensions improved using the same rubric:

| Dimension | Baseline | Candidate |
|---|---:|---:|
| Route continuity | 4/5 | 5/5 |
| Whole-tour story | 7/25 | 22/25 |
| Stop experience | 8/25 | 19/25 |
| Spoken naturalness | 1/5 | 4/5 |
| Factual qualification | 0/3 | 2/3 |

## Defects demonstrably removed

- English/Spanish templates no longer leak into French narration.
- Palau de la Música is no longer reassigned to Rudy Ricciotti in 1997.
- Santa Maria del Mar is no longer rebuilt by Josep Maria Jujol in the 20th century.
- MACBA is no longer moved from El Raval to the Eixample.
- Every stop now preserves its source POI and factual-validation metadata.
- Transitions no longer receive the current stop's factual brief, preventing them
  from inventing dates, architects and styles while trying to bridge to the next stop.

## Changes that produced the improvement

1. Native fallbacks for Spanish, French, German, Italian and English.
2. Fallback facts read both normalized claim names and Wikidata property IDs.
3. Multilingual architect and neighborhood extraction.
4. Construction-date relation validation against Wikidata `inception`.
5. Post-generation source guard for dates, architects, styles and locations.
6. A third low-temperature repair attempt and more tolerant JSON/prose parsing.
7. A transition-specific prompt and 25–70 word validation range.
8. Route context and an editorial role for every stop: opening, foundations,
   transformation, culmination or closing synthesis.
9. Sequential section generation, so history hears the arrival and significance
   hears both instead of restarting the stop in parallel.
10. Section-specific briefs: each section sees only its own editorial job.
11. Heavy phrase bans apply on repair attempts rather than defining the guide's
    first voice.
12. Grounded fallbacks now use natural sentences instead of database-like fact
    cards; French output also receives enough token room to close valid JSON.
13. Duration repair extends a good route with nearby candidates instead of
    rebuilding it or manufacturing time through a walking detour.
14. One shared route question and explicit stop-to-stop handoffs give the tour a
    beginning, progression and resolved closing.
15. Deterministic surface repairs remove isolated source-language leaks,
    unsupported years and unsupported visual sentences before replacing a whole
    section.
16. `gemma4:26b` is now the narrative default; it produced more coherent section
    roles and fewer relation errors than `qwen2.5:14b` on the frozen comparison.

## Remaining quality debt

The candidate now passes the publication rubric. Remaining product debt still
matters before treating one fixture as proof of general quality:

- flagship coverage remains 5/7;
- several visual observations remain weakly supported or formulaic;
- some sections still repeat a framing idea such as transformation, identity or
  continuity more often than a human editor would;
- the 26B model improves quality but raises generation latency;
- spoken naturalness was reviewed as text; an audio/listening field test remains
  necessary before commercial release.

The follow-up multi-city/multi-language run is tracked in
`docs/working/46-multicity-quality-audit.md`. Barcelona remains publishable
after the restart, but the next commercial-risk items are still route
canonicality, repeated conceptual framing and a real audio/listening test.
