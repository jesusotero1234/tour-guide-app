# Implementation Plan: Editorial selector v7 profile-constrained

## Overview

Build v7 beside the frozen v5 and failed v6 experiment. A reviewed city profile and explicit visit scenes define the product; an exact deterministic optimizer fixes the route; one bounded narrative plan may describe but never alter it. Offline snapshots must reproduce every decision and must fail closed when profile, matrix, text, audio, or evidence changes.

## Architecture decisions

- Keep v5/v6 untouched and expose v7 through new modules and fixtures only.
- Separate mandatory identities, required chapters with alternative carriers, and diagnostic reference routes.
- Treat `VisitSceneV1` as the only boundary that may combine evidence from multiple exact identities, preserving the owner on every fact.
- Enumerate all feasible orders for at most eight effective scenes and rank lexicographically by hard coverage, arc, dominance, walking, longest leg, and comfort.
- Compute duration only from OSRM walking, narration words or real audio, and explicit observations; never fixed stop dwell or hidden buffers.
- Human review and street audit are explicit persisted gates. Code cannot synthesize approval.

## Task list

### Phase 1: Contracts and evidence

- [x] Task 1: Define and validate benchmark, profile, scene, evidence, and review contracts.
- [x] Task 2: Preserve up to four complete 280-character owned facts selected by role and novelty.

### Checkpoint: Product boundary

- [x] Unapproved proposals cannot be verified.
- [x] Reference routes cannot become mandatory requirements.
- [x] Composite scenes cannot borrow facts without explicit reviewed membership.

### Phase 2: Exact selector

- [x] Task 3: Implement exhaustive selection/order search for up to eight scenes with hard requirements, chapters, arc, conflicts, and deterministic tie-breaking.
- [x] Task 4: Add dominance, honest duration bands, extension diagnostics, and distinct-contribution rules.

### Checkpoint: Deterministic route

- [x] Candidate permutation does not change the result.
- [x] Madrid resolves to the seven-scene 3,067.6 m route (or approved reverse), never `f01`.

### Phase 3: Narrative, time, and snapshots

- [x] Task 5: Define the bounded route-locked story-plan contract and grounding validator.
- [x] Task 6: Calculate pre-TTS and post-TTS duration without implicit dwell; semantic/model failures require review.
- [x] Task 7: Fingerprint profile, scenes, matrix, plan text, and audio independently and replay an exact snapshot.

### Phase 4: Offline Madrid workbench

- [x] Task 8: Freeze Madrid's proposed profile, composite Cibeles scene, official-source excerpts, matrix, route, and Phase-0 blind cards.
- [x] Task 9: Add a replay command and document gates that remain human/external.

### Phase 5: First calibration proposals

- [x] Task 10: Freeze and replay source-grounded `draft_only` proposals for Berlin and Paris.
- [x] Task 11: Report honest duration and route-comfort diagnostics without promoting either city to `verified`.
- [ ] Task 12: Complete human editorial review and extend calibration to the remaining seven cities.

### Checkpoint: Complete offline delivery

- [x] Focused v7 tests and unchanged v5/v6 tests pass.
- [x] TypeScript build passes; full backend suite and lint outcomes are reported honestly.
- [x] Five-axis review has no unresolved v7 blocker.
- [x] No commit, push, or merge occurred while blind review, real audio duration, calibration/holdouts, and Madrid street audit remain pending.
- [x] The live legacy/v7 status mismatch for new and hard-coded cities is documented rather than silently treated as solved.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A type-only profile is mistaken for editorial approval | High | Require reviewer metadata and a matching approval fingerprint before `verified`. |
| Exact enumeration expands unexpectedly | Medium | Reject more than eight effective scenes and keep search offline and bounded. |
| LLM output mutates route or repeats evidence | High | Validate exact scene order, owned fact IDs, unique primary facts, and fail semantically to `review_required`. |
| Duration is inflated | High | Sum only walking, computed/real audio, and explicit observation seconds. |
| Oracle leaks into product selection | High | Keep reference routes diagnostic and add static import/payload boundary tests. |

## Open questions

- None for the offline implementation. Human review, real TTS files, nine-city calibration, sealed holdouts, and street audit are intentionally unresolved external gates.
