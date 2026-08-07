# Implementation Plan: Editorial selector v6 core-constrained

## Overview

Build v6 alongside the reproducible v5 baseline. Resolve and freeze a small canonical tour core before route search, require every finalist to cover that core, and ask one compact LLM jury to compare only routes that are already deterministically valid. The Madrid core experiment is eliminatory: optimizer and jury work only proceed if the frozen three-audit protocol reaches exact consensus and covers all seven Madrid anchors without importing the oracle.

## Architecture decisions

- Reuse v5 canonical identities, own evidence, and frozen OSRM matrices; do not modify v5 code or snapshots.
- Keep Wikimedia context, core artifacts, and selector modules outside `fixtures/oracle`; the oracle remains evaluation-only.
- Validate every third-party and LLM response at its boundary and fail closed on semantic errors.
- Treat requested duration as a ceiling and canonical core coverage as a hard constraint.
- Generate only 3–5 non-dominated, core-complete finalists; the LLM cannot change their stops or order.

## Task list

### Phase 1: Eliminatory Madrid experiment

- [x] Task 1: Define and test Wikimedia prominence snapshot and core-audit contracts.
- [x] Task 2: Implement deterministic Wikimedia capture with revision IDs, dates, provenance, and fingerprints.
- [x] Task 3: Implement three seeded core audits, consensus/review results, compact schemas, and snapshot replay.
- [x] Task 4: Capture Madrid context and run the frozen three-audit protocol; evaluate the oracle only after all core artifacts are saved. **Executed; gate failed.**

### Checkpoint: Madrid core

- [ ] All three responses are schema-valid and within 18,000 input / 8,000 schema characters.
- [ ] The required sets are identical, contain Madrid 7/7, contain 1–8 identities, and cite only owned evidence.
- [x] If any item fails, stop v6 route implementation and record the model-comparison requirement.

Checkpoint result (2026-08-07): exact consensus and Madrid 7/7 failed. The stop condition was applied; Qwen failed semantic validation and the second remote provider had an expired credential. See `docs/working/56-editorial-selector-v6-core-experiment.md`.

### Phase 2: Reproducible core and constrained routes

- [ ] Task 5: Add reviewed disputed-ID overrides, core artifact validation, and anti-oracle import/payload tests.
- [ ] Task 6: Implement core-complete exact-order search, support insertion for small cores, duration extensions, infeasibility diagnostics, dominance, and finalist diversity.
- [ ] Task 7: Add optimizer unit/metamorphic tests, including Madrid 93.78-minute validity and compact-route dominance.

### Checkpoint: Deterministic selector

- [ ] Focused v6 suites pass and v5 suites remain unchanged and green.
- [ ] Every finalist covers 100% of the approved core and all physical constraints.

### Phase 3: Compact jury and workflow

- [ ] Task 8: Implement the single-call route-jury-v6 request, schema, validator, retry policy, and character budgets.
- [ ] Task 9: Implement live/snapshot selection workflow and exact replay with immutable route order and winner-plan validation.
- [ ] Task 10: Add the v6 workbench, separate core/oracle reporting, persisted provenance, discard diagnostics, and package command.

### Checkpoint: Complete implementation

- [ ] Focused v5/v6 tests, full backend tests, lint, and TypeScript build pass.
- [ ] Madrid and multi-city snapshots replay exactly; live gates are recorded separately from human-review gates.
- [ ] A five-axis code review finds no unresolved blocker.
- [ ] Commit/push/merge only if automated, live, holdout, and human gates required by the source plan have actually passed.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| DeepSeek fails the compact Madrid protocol | High | Stop before optimizer work; compare the identical frozen contract with another model. |
| Wikimedia content changes | Medium | Persist revision IDs, capture dates, request/response data, and fingerprints; replay offline. |
| Exact core-order enumeration grows | Medium | Core is capped at eight; use exact permutation only for the core and bounded support insertion. |
| Oracle leaks into selection | High | Separate files/directories plus static import and serialized-payload boundary tests. |
| Human/holdout gates cannot be automated in this session | High | Report them as unmet and do not merge or push `master`. |

## Open questions

- None for implementation. The source plan is treated as the reviewed specification; any failed eliminatory or human gate is a stop condition, not an invitation to tune.
