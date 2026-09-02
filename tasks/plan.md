# Implementation Plan: V6 multimodelo y benchmark económico

## Objetivo

Completar la investigación V6 con Firecrawl local, añadir un candidato
OpenRouter estrictamente fijado por modelo/proveedor, paralelizar con límites
pequeños y producir un benchmark reproducible con tope conjunto de 2 USD. El
perfil predeterminado permanece `deepseek_control` y el estado automático máximo
permanece `ready_for_human_gate`.

## Decisiones

- Firecrawl `v2.8.0` se clona sin modificar en runtime ignorado y solo publica
  `127.0.0.1:3007`.
- Un perfil central asigna modelo, endpoint, reasoning, temperatura y
  concurrencia por fase. OpenRouter no admite fallbacks, plugins ni healing.
- JSON Schema se valida tanto en el proveedor como localmente; metadata, modelo
  y endpoint reales también forman parte del contrato.
- Capturas y diagnósticos completos son privados. Los reportes compartibles solo
  incluyen métricas, fingerprints y extractos breves.
- Toda llamada reserva primero su coste máximo dentro del presupuesto del run.

## Fases y verificación

1. Firecrawl local y runbook.
   - Verificar checkout exacto, puerto único, Compose, search, Markdown, PDF y SSRF.
2. Adaptador y perfiles.
   - Verificar requests exactos, schemas estrictos, metadata y preflight sin gasto.
3. Curación, scheduler y telemetría.
   - Verificar escalamiento único, límites por fase y reauditoría con contexto limpio.
4. Benchmark y snapshots.
   - Verificar presupuesto duro, percentiles/fingerprints y ausencia de red en replay.
5. Gates e informe.
   - Ejecutar Gate A/B en orden, Madrid integrado y Toledo solo si los anteriores pasan.

## Riesgos

- Fire-engine no está disponible en self-hosted: fallar explícitamente por fuente.
- Los catálogos y endpoints de OpenRouter cambian: preflight obligatorio antes de
  cualquier llamada facturable.
- El worktree contiene cambios ajenos: staging por rutas explícitas en cada commit.
- El benchmark consume dinero: sin `--allow-external` y reserva presupuestaria no
  puede emitir llamadas.

## Addendum 2026-09-02: Qwen base audit and final repair pass

### Objective

Make the `qwen38_hybrid` canary consistently use its selected model profile for
the canonical base audit, and give V8 one bounded repair opportunity when the
post-repair global audit discovers a new accepted issue.

### Decisions

- The canary base-audit provider defaults to the selected profile's
  `auditor_a` provider. An explicit `--provider`/`--model` override remains
  available for controlled comparisons.
- The canary forwards the configured Qwen local base URL to canonical-core
  requests, so the profile-derived provider uses the same validated endpoint as
  the rest of the run.
- A newly accepted issue from the post-repair global audit may consume remaining
  `maximumRepairCalls` budget exactly once. Repaired stops are factually
  re-audited, and the tour receives one final global audit; no recursive repair
  loop is introduced.

### Tasks and acceptance criteria

1. Profile-driven canonical base audit (small, runtime helper + canary wiring).
   - `qwen38_hybrid` defaults to `qwen-local`, not DeepSeek.
   - Explicit provider/model overrides preserve the existing comparison path.
   - A focused runtime test covers both cases.
2. Bounded final repair pass (medium, workflow + focused test).
   - A newly accepted issue from the second global audit is repaired when budget
     remains.
   - The repair is followed by factual checks and one final global audit.
   - Exhausted repair budgets still leave the issue open for human review.
3. Verification checkpoint.
   - Focused runtime, workflow, provider-profile tests and backend build pass.
   - Only the intended hunks are attributed to this increment in the dirty
     worktree.

### Risks and mitigations

- Extra model cost: the pass only runs when an accepted issue exists and repair
  budget remains.
- Infinite repair loop: the new opportunity is single-pass and budget-bound.
- A repair introduces another defect: paired factual audits and the final global
  audit still fail closed to human review.
