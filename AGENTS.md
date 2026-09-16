# Fast, Focused Coding Guidelines

## Priorities

Finish the requested task correctly with the minimum sufficient change. Optimize
for elapsed time first, while avoiding unnecessary Codex tokens and rework.
Do not expand scope, add speculative abstractions, or disturb unrelated changes.

## Choose the shortest route

- Codex handles small, obvious edits, exact substitutions, known file reads,
  simple searches, and routine commands directly. Worker routing is optional.
- Prefer Qwen for substantial, bounded implementation or investigation when a
  short handoff can replace significant Codex work. Do not delegate a tiny
  operation when explaining and reviewing it costs more than doing it.
- Decide the route once per coherent task; do not reclassify every edit.
- Batch related edits and independent reads. Avoid one call per replacement
  when one patch can express the whole change. Keep dependent writes sequential.
- Do not write a complete implementation in Codex merely to have a worker copy
  it. When delegating generation, supply the contract and let Qwen write it.

## Decisions and delegation

Codex owns requirements, architecture, behavior, compatibility, important
tradeoffs, validation strategy, and final review. Resolve material ambiguity
before delegating; use reasonable defaults for routine implementation details.
Codex writes decision documents directly.

Give Qwen one coherent responsibility with explicit writable paths, the minimum
relevant context, observable acceptance criteria, and focused validation when
applicable. Respect the tool's limits (normally 1-3 writable files). Group related
changes within those limits; split only when scope, dependencies, or limits
require it. Do not pass full conversation history or unrelated background.

When choosing Qwen Worker:

- `semantic_patch`: semantic edits to existing files.
- `create_files`: new files generated from a decided contract.
- `create_literal` / `replace_literal`: optional exact writes when convenient;
  these do not call Qwen and do not offload code generation.
- `research`: bounded investigation that benefits from model-assisted search.
- `inspect_literal` / `validate`: optional deterministic inspection / checks.
- Do not use the legacy `delegate` entry point for new work.

If mini-SWE-agent is available and suited to a bounded task, it may execute the
implementation and checks using the same scope and decision boundaries. Use it
as an alternative execution route, not an extra layer for each worker operation.
Do not add or configure tools unless the task requires it.

## Review, validation, and recovery

- Treat worker summaries as evidence. Inspect the diff and relevant source for
  correctness, scope, and material risks; verify decision-critical claims.
  Do not repeat reads already supported by sufficient evidence.
- Run checks appropriate to the change, directly or through the worker. Reuse
  successful validation; repeat only after relevant changes, failures, or a
  concrete unresolved concern. Documentation-only edits need diff review.
- On worker/protocol failure, fix an obvious invocation error or take over
  directly. Do not spend repeated round trips repairing the delegation.
- On implementation failure, diagnose the defect and choose the shortest fix:
  one focused worker correction or direct Codex work. Split truncated tasks.
- Keep writes within the authorized scope. Never write to the same files while
  a worker is editing them. Preserve unrelated worktree changes.
- Stop when requested behavior and relevant checks are satisfied. Report the
  result and any real blocker briefly.

## Token and speed evidence

Keep handoffs, tool output, and review notes focused. Avoid duplicate generation
and repetitive planning. Worker call counts are not token savings: compare
elapsed time, Codex usage when available, and correction effort on comparable
completed tasks. Do not claim savings without measurements or build telemetry
infrastructure solely to justify a routing choice.
