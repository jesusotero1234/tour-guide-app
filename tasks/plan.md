# Implementation Plan: Madrid autonomous narrative pilot v4

## Goal

Produce one autonomous, Spanish, seven-stop Madrid history tour from the existing
editorial V7 route. The result is safe to test only when its official evidence,
deterministic claim plan, prose, critic reports, mutation qualification, replay
fingerprints, public preview, and prepared pilot manifest all validate together.

The CLI may create `machine_approved`, `review`, and `prepared` outputs. It must
never publish a tour, imply demand, or overwrite outputs after a failed run.

## Locked product

- Route: Palacio Real, Catedral de la Almudena, Plaza de la Villa, Plaza Mayor,
  Puerta del Sol, Cibeles, Puerta de Alcalá.
- Copy: `Madrid: de villa a capital`, fixed subtitle, label, promise, and question.
- Experience: text plus map, seven scenes, about 60 minutes, no audio, checkout,
  forms, telemetry, persistence, participants, or demand claims.
- Page: `/pilot/madrid-history`, disabled by default and returning 404 unless
  `ENABLE_NARRATIVE_PILOT=true`.
- V1, V2, V3, and the multicity V3 benchmark remain unchanged.

## Architecture

1. Official offline evidence
   - A generic `NarrativeEvidenceCaseV4` contains seven ordered scenes and exactly
     four explicitly typed atomic facts per scene.
   - Only observable facts can have an on-site cue. Source excerpts, revisions,
     capture dates, URLs, and all fingerprints are frozen before generation.
   - Editorial contributions, the central question, and closing interpretations
     remain separate from factual evidence.

2. Deterministic factual boundary
   - Code maps `tension_or_contrast`, `observable`, `human_agency`, and
     `historical_change` into the five fixed block kinds.
   - Code owns IDs, evidence, relations, transitions, destinations, counts,
     durations, opening types, proper nouns, numbers, and allowed events.
   - DeepSeek receives the plan but returns only the introduction and prose.

3. Closed autonomous flow
   - Gemma grounds the deterministic plan.
   - DeepSeek writes one of three fixed tone variants with strict tool output,
     temperature zero, no thinking, and one whole-route content repair.
   - Deterministic validation runs before the final Gemma critique.
   - Protocol retry is independent from content repair and every error fails
     closed without retaining approved text.

4. Madrid-only qualification
   - Prepare pinned GPU-only Gemma once, run all three variants sequentially,
     select by minimum scene score, aggregate score, then fixed variant order.
   - Re-criticize the winner and reject four valid factual mutations.
   - Freeze only a fully passed qualification, staging every file before atomic
     rename and cross-linking outputs with mutual fingerprints.

5. Public pilot preview
   - Serialize the selected narrative as seven standard `Place` values with
     exact V7 coordinates, five description sections, and verified narration
     metadata.
   - A Server Component validates the frozen fixture; a focused Client Component
     owns `?stop=N`, focus movement, announcements, and native navigation buttons.
   - Reuse `TourMap` and provide an equivalent textual stop list.

## Incremental execution and verification

### Phase 0: baseline

- [x] Confirm HEAD `713fb31` and a clean worktree.
- [x] Run the existing backend suite/build and frontend typecheck/build.
- [x] Record only the two preexisting failures: `LandmarkTiering.test.ts` ordering
  and `tours.test.ts` missing expected `signals`.

### Phase 1: evidence and deterministic plan

- [x] Write failing tests for route order, four roles, visual cues, provenance,
  fingerprints, fact permutation, one-time assignment, model-free metadata, and
  a synthetic unknown-city case.
- [x] Implement the generic contracts, offline Madrid fixture, validator, and
  deterministic plan builder.
- [x] Verify focused tests and backend TypeScript.

### Phase 2: prose, critics, and lifecycle

- [x] Write failing tests for direct approval, grounding rejection, one prose
  repair, protocol retry, second content failure, deterministic prose validation,
  Gemma warm-up/digest/GPU checks, eviction recovery, and fail-closed output.
- [x] Implement the strict V4 writer, critic contracts, Gemma lifecycle manager,
  and `AutonomousNarrativeV4` orchestration.
- [x] Verify focused tests and backend TypeScript.

### Phase 3: qualification and freeze

- [x] Write failing tests for 1/3 and 0/3 gates, exact tie-breaks, four mutations,
  invalid mutation reports, non-empty metrics, atomic output, and replay tampering.
- [x] Implement fingerprints, Madrid qualification, mutations, replay, CLI,
  selected artifact, public preview, and prepared manifest.
- [x] Verify offline replay and failure atomicity.

### Phase 4: pilot experience

- [x] Write tests for preview validation, seven exact places, duration, feature
  gating, URL navigation, and invalid/missing fixtures.
- [x] Implement the responsive accessible page and reuse `TourMap`.
- [ ] Verify keyboard, focus, live announcements, and console with DevTools in a
  real browser. The textual equivalent and 320/768/1024/1440 layouts were checked
  in isolated headless Chrome; the DevTools connector was unavailable.

### Phase 5: release checks

- [x] Run backend full suite/build plus route V7 and narrative V2/V3/V4 replays.
- [x] Run frontend typecheck/build and headless layout checks.
- [x] Review the diff across correctness, simplicity, architecture, security, and
  performance; scan for secrets and public prompt/raw-output leakage.
- [x] Create additive code/UI commits. Create the content commit only if one live
  external qualification passes and freezes in that same execution.

## Live-run rule

The external batch is attempted once only after all offline and browser gates pass,
`DEEPSEEK_API_KEY` exists, and the configured Ollama host exposes the exact pinned
Gemma digest fully in VRAM. A failed batch remains diagnostic evidence; its text is
never manually edited or frozen.

## Official live result (2026-08-10)

The single official `--generate --allow-external --freeze-pilot` run completed with
the pinned Gemma digest fully in VRAM and valid critic latency, but failed safely:
all three variants exhausted their one content repair while still violating the
deterministic prose contract. The result was `failed`, `0/3` candidates were
approved, and no qualification, artifact, preview, or manifest file was created.
The run was not repeated and no generated prose was edited or frozen.

The inherited V2 replay also remains unavailable because the current repository
does not contain `fixtures/narrative-benchmark-v2/approved-benchmark.json`; V7, V3,
and Madrid V4 offline validation pass.
