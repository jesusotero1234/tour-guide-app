# Implementation Plan: Autonomous narrative v2

## Overview

Prove Spanish historical-tour narrative generalization across Paris, Madrid, and Berlin before freezing any content. Keep the v1 replay unchanged and add a fail-closed v2 pipeline with grounded claim plans, local verdict calculation, reproducible fingerprints, and a closed benchmark.

## Architecture decisions

- Preserve `NarrativeScriptRequestV1`, evidence facts, final scene scripts, and every v1 module/fixture.
- Load versioned city snapshots through one generic case contract; the engine contains no city names or branches.
- Generate and ground an atomic claim plan before generating prose. Code, not either model, owns canonical IDs, evidence assignment, transitions, and word counts.
- Treat malformed transport/protocol responses separately from one allowed content repair per plan/prose stage.
- Calculate both critic verdicts locally from validated findings and scores.
- Stage both freeze outputs first and publish neither unless the closed benchmark passes.

## Task list

### Phase 1: Contracts and cases

- [x] Define raw/canonical claim-plan contracts, dynamic evidence validation, and strict-compatible schemas.
- [x] Define generic source snapshots and load Paris, Madrid, Berlin, plus a synthetic unknown city.

### Checkpoint: Grounded plan boundary

- [x] Every fact is used, no cross-scene reference is possible, and block/evidence limits are runtime-enforced.
- [x] Fact order and unknown city IDs do not affect the engine.

### Phase 2: Critics and orchestration

- [x] Define grounding/final critic requests and finding-only reports with local gates.
- [x] Implement plan generation, grounding, prose generation, final criticism, repairs, protocol retries, and fail-closed artifacts.
- [x] Fingerprint route, evidence/provenance, plan, text, four prompts, models/digest, parameters, policies, and two reports.

### Checkpoint: Autonomous v2 flow

- [x] Direct approval, both repair paths, protocol retry, second failure, and Gemma outage are covered.
- [x] V2 has only `machine_approved | rejected`; no human-review state exists.

### Phase 3: Closed benchmark and freeze

- [x] Run three candidates per city sequentially and score the 8/9 plus 2/3-per-city gates.
- [x] Require valid factual rejection of four mutations per city and fully-GPU sub-180-second critiques.
- [ ] Freeze benchmark and lowest-index approved Paris candidate only after all gates pass.

### Checkpoint: Delivery

- [ ] Existing 26 v1 tests, all v2 tests, three v7 replays, Paris v1 replay, and TypeScript pass (Paris v1 has no frozen artifact).
- [x] Diff and secret scan are clean.
- [ ] Create the additive refactor commit; create the content commit only after a live passing benchmark.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Strict schemas reject unsupported keywords | High | Restrict DeepSeek schemas to documented types and validate cardinality/references at runtime. |
| Model verdict contradicts findings | High | Do not request a verdict; compute gates locally. |
| City-specific prompt tuning leaks into engine | High | Generic case loader plus synthetic unknown-city tests and no city literals in engine modules. |
| Partial/failed benchmark overwrites approved content | High | Stage outputs only after pass and atomically rename both prepared files. |

## Closed qualification

- The 2026-08-10 live batch failed at 0/9 approvals. No benchmark or content fixture was written, prompts were not adjusted, and a future iteration requires an unused holdout.
