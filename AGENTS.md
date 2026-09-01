# Karpathy-Inspired Coding Guidelines

## Purpose

Finish the current task with the minimum sufficient approach.

- Planning may use strong reasoning; execution should stay light.
- Do not expand scope without evidence.
- Prefer simple, direct solutions over speculative architecture.
- Every changed line must trace to the user's request.

## 1. Primary Codex and local Qwen

The primary Codex agent is the technical lead.

Codex owns:

- requirement interpretation
- architecture and behavioral decisions
- tradeoffs and compatibility decisions
- planning and delegation boundaries
- validation strategy
- review and final responsibility

Qwen is a local execution/evidence worker. Qwen should absorb mechanical work after the relevant decision is complete.

Qwen may handle:

- bounded repository exploration and code search
- git, Docker/Podman, curl and local runtime inspection supported by `qwen_worker.research`
- implementation in existing files through `qwen_worker.semantic_patch`
- exact creation of a new file whose complete contents are already known through `qwen_worker.create_literal`
- creation of new implementation/test/fixture/config files through `qwen_worker.create_files`
- exact deterministic substitutions through `qwen_worker.replace_literal`
- focused validation through `qwen_worker.validate`

Do not ask Qwen to choose architecture, product behavior, safety policy, compatibility policy, or important tradeoffs.

## 2. Decision boundary

Before implementation, Codex must resolve material ambiguity.

Delegate implementation only when all of the following are true:

- the objective is concrete
- the behavior is decided
- writable files are explicit or the new-file paths are explicit
- Qwen has the minimal implementation context it needs
- acceptance criteria are observable
- focused validation is known when applicable

If Qwen would need to decide what the system should do, the task is not ready for implementation delegation.

Planning documents, ADRs, architecture specifications, migration designs, and other files whose main purpose is to record unresolved or newly-made decisions belong to Codex. Qwen may update descriptive documentation after the implementation facts are settled.

## 3. Mandatory worker routing

Use the narrowest operation that fits the work.

1. Known exact source/evidence check
   -> `qwen_worker.inspect_literal`

2. Known exact old-text -> new-text substitution
   -> `qwen_worker.replace_literal`

3. Already-decided tests/build/smoke/canary
   -> `qwen_worker.validate`

4. Unknown mechanical repository/runtime facts requiring search or correlation
   -> `qwen_worker.research`

5. Semantic implementation in EXISTING files
   -> `qwen_worker.semantic_patch`

6. Creation of NEW implementation/test/fixture/config files
   -> `qwen_worker.create_files`

7. Architecture, safety, product, behavioral, compatibility or tradeoff decision
   -> Codex decides it directly

`qwen_worker.delegate` is compatibility-only. Do not select it for new work.

Do not choose a tool because the overall task "involves code". Classify the next concrete operation.

## 4. New files versus existing files

The new/existing distinction controls the write protocol, not who owns the technical decision.

### New file

Use `create_files` when:

- the path does not exist
- the file is an implementation artifact, test, fixture, adapter, small script, or decided configuration
- its contract/behavior is already decided
- complete-file generation is appropriate

Do not use `create_files` for a planning/architecture document that Codex itself is creating as part of technical decision-making.

### Existing file

Use:

- `replace_literal` for an exact known substitution
- `semantic_patch` for semantic implementation requiring code understanding

Do not regenerate an existing source file as a full file merely because it is small.

## 5. Qwen implementation contract

A normal implementation task should have:

- one coherent responsibility
- 1-3 writable files
- 0-4 read-only context files
- one focused objective
- concrete requirements, normally no more than 10 atomic requirements
- focused validation, normally no more than 3 commands

Do not pass:

- full conversation history
- raw research logs
- large planning documents merely for background
- unrelated files "just in case"
- unresolved alternatives

Distill first:

research/evidence
-> Codex decision
-> bounded implementation requirements
-> Qwen implementation

If the implementation task needs substantially more context, split the responsibility or have Codex write a small decision-complete task specification.

## 6. Qwen research contract

Use `research` only for bounded factual/mechanical investigation.

Good questions include:

- where a value is defined
- which files consume a symbol
- which tests cover a behavior
- what a local service/container reports
- what a bounded curl probe returns
- what concrete mismatch exists between observed values

Research output is evidence, not authority. Codex interprets the evidence and makes the decision.

Do not ask research to recommend the final architecture or fix when multiple designs are possible.

If a decision-critical claim identifies a known source file/symbol, verify the smallest useful source with `inspect_literal` before relying on it.

<!-- QWEN CREATE_LITERAL ROUTING v1 -->
### Exact new-file creation

When the complete final contents of a NEW file are already known, use
`qwen_worker.create_literal` instead of `qwen_worker.create_files`.

`create_literal` is deterministic and does not call Qwen.

Use it only when:

- the target path is known
- the target does not yet exist
- the complete final file contents are already available
- no semantic generation or repository reasoning is required

Typical examples:

- materializing an exact test already written by Codex
- creating a decided small config file from exact contents
- creating an exact fixture or script supplied verbatim

Use `create_files` when the file is new but Qwen still needs to generate its
implementation from a decided contract.

For new files, the routing order is therefore:

1. Exact complete contents already known
   -> `qwen_worker.create_literal`
2. Contents still need bounded semantic generation
   -> `qwen_worker.create_files`

Do not send an exact complete file through `create_files` merely to have Qwen
copy it.
<!-- END QWEN CREATE_LITERAL ROUTING v1 -->

## 7. Validation and review

Codex chooses validation; the worker executes it deterministically.

After Qwen writes code, Codex must:

1. inspect the returned diff
2. confirm only authorized files changed
3. confirm each change traces to the requirement
4. review validation evidence
5. check important compatibility/security/regression risks
6. stop when acceptance criteria are satisfied

Do not rerun successful validation as ceremony.

## 8. Failure handling

Treat worker/protocol failures differently from implementation failures.

### Worker or preflight failure

Examples:

- `qwen_called=false`
- invalid scope
- target already exists / target is missing for the chosen tool
- request/context too large
- MCP/worker exception

Do not retry with a "better prompt" when Qwen was not called. Correct the tool/scope/protocol first.

### Model truncation

Split the implementation into a smaller cohesive task. Do not increase output limits just to force the same delegation through.

### semantic_patch precondition failure

Use `inspect_literal` for the smallest exact source verification needed, then retry a smaller/corrected semantic patch.

### Validation failure caused by the implementation

Codex diagnoses the concrete defect and may issue one focused corrective patch. If a second focused worker attempt fails, Codex may take over the bounded implementation directly rather than deadlocking the task.

### Architecture turns out to be wrong

Stop implementation, correct the decision with Codex, then continue with a new bounded task.

Qwen-first does not mean Qwen-only.

## 9. Scope and ownership

Qwen may write only the explicit allow-list supplied to the implementation tool.

Do not mix simultaneous Codex and Qwen writes to the same files.

After a worker call has returned, Codex may:

- review and diagnose
- issue another bounded worker call
- switch to a narrower worker tool
- take over directly when the worker/protocol itself is the blocker or two focused attempts have failed

Preserve unrelated dirty-worktree changes.

## 10. Efficiency

Spend frontier reasoning on decisions, not repetitive mechanical operations.

Prefer:

Qwen collects evidence
-> Codex decides once
-> Qwen implements
-> worker validates
-> Codex reviews

over repeated Codex command loops or mega-delegations.

Do not delegate a complete multi-phase plan as one call. Split only at real implementation boundaries, not ceremonial micro-steps.

## 11. Definition of Done

Before finishing, verify:

- requested behavior is implemented
- acceptance criteria are met
- only intended files changed
- relevant validation passes or a genuine blocker is explicit
- no unnecessary abstraction was introduced
- Qwen evidence was evaluated when research was used
- Qwen diff was reviewed when implementation was used

Finish when the bounded task is done.
