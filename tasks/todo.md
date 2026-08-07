# Editorial selector v6 checklist

- [x] T1 Core context/audit contracts have failing tests, then pass.
- [x] T2 Wikimedia capture is validated, fingerprinted, and snapshot-ready.
- [x] T3 Three-audit consensus, review states, budgets, and replay pass tests.
- [x] T4 Madrid experiment executed; exact consensus and Madrid 7/7 failed, so the stop condition applies.
- [ ] T5 Overrides and anti-oracle boundary pass tests.
- [ ] T6 Core-constrained optimizer passes route invariants.
- [ ] T7 Madrid compactness, dominance, permutation, and extension tests pass.
- [ ] T8 Compact route jury passes schema and semantic tests.
- [ ] T9 One-call workflow and snapshot replay pass.
- [ ] T10 Workbench reports and replays core/portfolio/winner exactly.
- [x] Focused v5 suites pass unchanged (7 suites, 27 tests).
- [ ] Full backend test, lint, and build pass.
- [ ] Live multi-city, blind review, and sealed holdout gates are complete.
- [x] Code review complete for the phase-1 experiment; no unresolved v6 code blocker.
- [ ] Final feature branch commit and push only after all gates pass.
- [ ] `master` merged, reverified, and pushed only after human approval/gates pass.

Stop recorded 2026-08-07: do not implement T5–T10, push, or merge unless the failed Madrid checkpoint is resolved without post-oracle tuning.
