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
