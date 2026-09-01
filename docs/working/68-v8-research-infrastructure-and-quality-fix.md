# Plan 68 — Research V8: infraestructura, calidad y diagnóstico editorial

Fecha: 2026-09-01
Estado: implementación y validación estática completadas; canary live pendiente
Responsable técnico: Codex
Apoyo mecánico y validación: qwen_worker

## Objetivo

Evitar que una caída de SearXNG o Firecrawl se clasifique como evidencia C legítima, mejorar la reparación de cobertura narrativa y conservar el fallo editorial real antes de ejecutar Scorecard o Markdown.

Este trabajo se desarrolló en paralelo con el [Plan 67](67-v8-canary-checkpoint-resume-plan.md). La implementación de Research se mantuvo separada; la integración en `narrative-user-canary-v8.ts` se realizó después de estabilizar checkpoint/resume. Las reanudaciones desde `arc`, `editorial` o `scorecard` no vuelven a exigir proveedores de Research que ya no se utilizarán.

## Implementación completada

### P0 — Infraestructura y estado editorial

- El canary calcula una sola configuración efectiva de SearXNG y Firecrawl, la registra y la reutiliza tanto en el preflight como en los providers.
- El preflight de Research ocurre antes del gasto en modelos y devuelve `research_infrastructure_unavailable`, `stage=research_preflight` y `retryableLater=true` cuando un endpoint no responde.
- Research distingue intentos, respuestas y fallos de proveedor. Si la adquisición externa cae durante el run y solo queda Wikimedia, devuelve `failed`, tier `null` y no fabrica un C.
- Los fallos de search, map o captura se registran como `provider_failed`.
- El resumen del canary diferencia `C_FULL` y `C_PARTIAL`, e incluye `writerReady`, roles ausentes, fuentes, publishers y fallos de proveedor.
- El conjunto editorial se valida por IDs esperados, ausentes, duplicados, desconocidos y desalineados antes de Scorecard o Markdown.
- El estado y los IDs devueltos por Editorial se persisten antes del renderer. El error global conserva la etapa real del pipeline.

### P1 — Reparación de cobertura

- El curador recibe definiciones operativas compartidas de los roles y `priorityRoles` durante la reparación.
- CURATE #2 puede reutilizar los mismos spans cuando faltan roles.
- Una reparación fallida o peor no descarta la mejor ronda válida anterior.
- La búsqueda adaptativa solo se ejecuta cuando falta cobertura semántica.
- Las búsquedas deterministas priorizan dominios oficiales registrados y después consultas de historia/transformación y arquitectura/función.
- `tension_or_contrast` se interpreta como contraste histórico documentado, no únicamente como controversia contemporánea.

### P2 — Robustez

- HTTP y HTTPS se canonicalizan antes de consumir presupuesto de captura.
- La comprobación de identidad inspecciona hasta 8.000 caracteres.
- `primary_authority` tiene prioridad sobre `established_source` al construir el packet del curador.
- Las estadísticas separan intentos, éxitos, respuestas y fallos de infraestructura.

## Validación completada

Con `TMPDIR=/tmp` para que la prueba de permisos `0600` use un filesystem POSIX:

- 10 suites / 156 tests pasaron.
- `backend` TypeScript completo pasó con `tsc --noEmit`.
- La comprobación TypeScript directa de `scripts/validation/narrative-user-canary-v8.ts` pasó.
- La validación mecánica enfocada de Qwen para `NarrativeUserCanaryRuntimeV8.test.ts` pasó.

Las suites conjuntas cubren Research, runtime/preflight, canary, boundary, Arc, workflow editorial y checkpoint/resume.

## Validación live pendiente

En el entorno actual, SearXNG no responde en `127.0.0.1:18081` y Firecrawl rechaza la conexión en `127.0.0.1:3007`. El arranque local queda bloqueado porque no existe el runtime rootless de Podman `/run/user/1000` y crearlo requiere privilegios del usuario.

No se ejecutó un canary pagado ni se declara `Approve` o `publicationPassed`. Una vez restaurado el runtime y levantados ambos servicios, el siguiente canary comprobará el comportamiento end-to-end; el nuevo preflight abortará antes de gastar si siguen caídos.
