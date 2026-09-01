# Plan 67 — Checkpoints y reanudación del canary V8

Fecha: 2026-09-01
Estado: implementación completada; validación live pendiente del usuario
Responsable técnico: Codex
Ejecución mecánica: qwen_worker

## 0. Resumen de implementación completada

La implementación está completada y validada estáticamente. Los hechos establecidos son:

- Checkpoints privados atómicos con permisos `0600`.
- Soporte de `--resume-checkpoint` y `--resume-from` para saltar fases anteriores.
- Reutilización de guiones editoriales parciales válidos con auditorías, adjudicación, reparaciones y tour audit reejecutados de forma coherente.
- El writer V8 realiza un tercer intento únicamente cuando los intentos anteriores terminan en 429/rate limit.
- No se ejecuta Scorecard ni Markdown tras un resultado Editorial incompleto.
- Los IDs de issues abiertos finales de V8, los registros estructurados de issues y el resumen de issues persisten a través de ejecuciones nuevas, checkpoints, reanudaciones, artefactos privados y revisión pública.

Evidencia exacta de validación estática:

- 9 suites / 133 tests pasaron.
- `backend npx tsc --noEmit` pasó.
- La comprobación TypeScript directa del canary pasó.
- La regresión enfocada de Research/canary (2 suites / 31 tests) pasó.
- La revisión de Qwen no produjo hallazgos Required.
- `NarrativeUserCanaryCheckpointV8` y `NarrativeEditorialWorkflowV8` pasaron 73 tests en 2 suites.
- La comprobación de diff acotada (`git diff --check`) pasó.

El canary live completo de Málaga no fue ejecutado por Codex de forma intencional y permanece como validación final del usuario. No se declara `Approve` ni `publicationPassed`.

## 1. Objetivo

Evitar repetir las fases costosas del canary de usuario V8 cuando una fase posterior falla, y representar los fallos editoriales con precisión.

El canary debe poder guardar y reanudar de forma determinista desde:

1. candidatos;
2. ruta;
3. research y boundary;
4. Arc;
5. Editorial;
6. Scorecard.

La investigación de por qué las siete paradas de Málaga se clasifican como C queda fuera de este plan.

## 2. Problema demostrado

El run `malaga-v8-boundary-final-20260901-3` demostró:

- siete resultados Research `sufficient`, tier C y `routeEligible=true`;
- un boundary ready;
- un Arc válido con las siete paradas;
- tres guiones editoriales completos;
- dos respuestas upstream 429 al escribir `Q3849447`;
- cancelación de los writers restantes;
- `editorial.run.status=protocol_failed` dentro de un wrapper V8 con status `complete`;
- ejecución posterior incorrecta de Markdown con solo tres guiones.

La causa operacional fue el 429. El defecto del canary fue interpretar únicamente el status exterior y perder el fallo interior y su resultado parcial.

## 3. Decisiones cerradas

### 3.1 Checkpoint único, privado e incremental

Cada run escribe un único artefacto privado:

```text
tmp/narrative-v8/<run-id>/checkpoint.private.json
```

El checkpoint:

- se escribe atómicamente;
- usa permisos `0600`;
- no contiene API keys, cabeceras Authorization, respuestas LLM crudas ni secretos;
- conserva resultados normalizados suficientes para reanudar;
- registra la última fase completada;
- se actualiza después de cada fase terminada y también tras un fallo posterior recuperable;
- permanece ignorado por Git.

El checkpoint fuente nunca se modifica durante un resume. El nuevo run lee el artefacto anterior y escribe su propio checkpoint.

### 3.2 CLI

Se añaden dos argumentos que siempre deben aparecer juntos:

```text
--resume-checkpoint=<path>
--resume-from=route|research|arc|editorial|scorecard
```

Reglas:

- usar solo uno es error de CLI;
- `--resume-checkpoint` es incompatible con `--core-artifact` y `--route-artifact`;
- el checkpoint debe contener la fase inmediatamente anterior que necesita `--resume-from`;
- el run nuevo conserva su propio `--run-id` y directorio;
- el perfil, ciudad, QID, idioma y parámetros de ruta deben coincidir;
- el gasto acumulado del checkpoint es el nuevo baseline;
- `--prior-spend-usd` no puede ser menor que el gasto guardado.

### 3.3 Semántica de las fases

| `--resume-from` | Datos reutilizados | Primera fase ejecutada |
|---|---|---|
| `route` | candidatos normalizados | selección de ruta |
| `research` | candidatos y ruta | investigación por parada |
| `arc` | ruta y resultados Research | reconstrucción/validación del boundary y creación del Arc |
| `editorial` | boundary, manifest y Arc | workflow editorial, reutilizando guiones completos |
| `scorecard` | Editorial completo | scorecard y Markdown final |

El boundary y el manifest nunca se aceptan ciegamente desde disco. Se reconstruyen o revalidan determinísticamente usando los datos guardados.

### 3.4 Reanudación editorial parcial

Si Editorial falla después de producir algunos guiones:

- el checkpoint conserva solo los guiones estructuralmente válidos;
- cada guion se relaciona por `routeStopId`;
- no se conservan como completas las auditorías parciales ni decisiones intermedias;
- al reanudar, los guiones válidos se pasan mediante `options.scripts`;
- el writer se omite para esos stops;
- auditorías, adjudicación, reparaciones y tour audit se vuelven a ejecutar de forma coherente;
- IDs duplicados, desconocidos o fuera de la ruta invalidan el checkpoint.

### 3.5 Política de reintentos

Se mantiene DeepSeek/OpenRouter. No se añade fallback de modelo.

El request editorial conserva dos intentos para:

- errores de contrato;
- JSON/schema inválido;
- errores semánticos;
- 5xx retryable.

Solo el writer V8 dispone de hasta tres intentos cuando los intentos anteriores terminan específicamente en 429/rate limit.

La tercera llamada no debe ocurrir para 5xx, schema, semantic error ni errores no retryable. V6 conserva exactamente su comportamiento observable y su máximo actual.

### 3.6 Gating posterior a Editorial

El canary debe inspeccionar el resultado editorial efectivo, no solo el wrapper V8.

Si Editorial no produce un resultado publicable y completo:

- persiste checkpoint con los guiones válidos disponibles;
- escribe review/diagnóstico con razón precisa, por ejemplo `editorial_rate_limited`;
- marca `retryableLater=true` solo para un fallo recuperable como 429;
- no ejecuta Scorecard;
- no genera Markdown;
- no informa que faltan scripts como si fuese el error primario;
- termina con error explícito y comando de resume sugerido.

## 4. Contrato de checkpoint

Crear un módulo dedicado con un discriminante de versión:

```ts
schemaVersion: 'narrative-user-canary-checkpoint-v8'
```

Contenido mínimo:

```ts
interface NarrativeUserCanaryCheckpointV8 {
  schemaVersion: 'narrative-user-canary-checkpoint-v8';
  run: {
    runId: string;
    createdAt: string;
    profile: string;
    city: string;
    cityQid: string;
    language: string;
    requestFingerprint: string;
    priorSpendUsd: number;
  };
  completedPhase:
    | 'candidates'
    | 'route'
    | 'research'
    | 'arc'
    | 'editorial'
    | 'scorecard';
  candidates?: unknown;
  route?: unknown;
  research?: unknown;
  evidenceManifest?: NarrativeEvidenceManifestV8;
  arc?: NarrativeArcV6;
  editorial?: {
    status: string;
    scripts: NarrativeStopScriptV6[];
    failureReason?: string;
    retryableLater?: boolean;
  };
  scorecard?: unknown;
  fingerprint: string;
}
```

Los tipos concretos existentes deben sustituir los `unknown` cuando estén disponibles. El fingerprint se calcula sobre contenido canónico sin el propio campo `fingerprint`.

## 5. Validación al cargar

Antes de reanudar:

1. parsear y validar `schemaVersion`;
2. verificar el fingerprint del checkpoint;
3. comprobar compatibilidad del request y del perfil;
4. comprobar que existen las fases previas requeridas;
5. verificar route fingerprint y cobertura exacta de stop IDs;
6. reconstruir el boundary desde Research y comparar el manifest;
7. validar que el Arc cubre exactamente la ruta;
8. validar que los scripts parciales pertenecen exactamente a stops conocidos y no están duplicados;
9. impedir Scorecard si Editorial no contiene siete scripts válidos;
10. no mutar el checkpoint fuente.

Un checkpoint corrupto o incompatible es `protocol_failed`, no evidencia tier D.

## 6. Implementación incremental para Qwen

Cada tarea debe recibir solo los archivos indicados y ejecutar como máximo tres validaciones enfocadas.

### Tarea 1 — Contrato y persistencia del checkpoint

Crear:

- `backend/src/services/poi/NarrativeUserCanaryCheckpointV8.ts`
- `backend/src/services/poi/NarrativeUserCanaryCheckpointV8.test.ts`

Responsabilidad:

- tipos del checkpoint;
- fingerprint determinista;
- validación pura;
- lectura privada;
- escritura JSON atómica con modo `0600`;
- helpers de compatibilidad y de scripts parciales.

### Tarea 2 — Tercer intento exclusivo para 429

Modificar:

- `backend/src/services/poi/EditorialStructuredLlmV6.ts`
- `backend/src/services/poi/EditorialStructuredLlmV6.test.ts`

Responsabilidad:

- añadir un límite separado `rateLimitAttempts`;
- mantener `requestAttempts` en dos;
- demostrar `429, 429, success` con límite tres;
- demostrar que 5xx/schema/semantic no usan el tercer intento;
- mantener el default V6 en dos.

### Tarea 3 — Activación solo en writer V8

Modificar:

- `backend/src/services/poi/NarrativeModelProfilesV6.ts`
- `backend/src/services/poi/NarrativeEditorialAgentsV6.ts`
- `backend/src/services/poi/NarrativeEditorialAgentsV8.ts`

Responsabilidad:

- propagar la opción sin cambiar payloads/prompts V6;
- hacer que el adapter V8 use tres rate-limit attempts solo en writer;
- mantener audit/adjudicate/repair/tour-audit en dos.

### Tarea 4 — Checkpoints incrementales y gating correcto

Modificar:

- `backend/scripts/validation/narrative-user-canary-v8.ts`
- `backend/src/services/poi/NarrativeUserCanaryV8.test.ts`

Responsabilidad:

- persistir cada fase;
- detectar el status editorial interior;
- conservar scripts parciales;
- impedir Scorecard y Markdown tras fallo editorial;
- registrar razón y resume sugerido.

Si el cambio supera el límite práctico del worker, separar primero persistencia/gating y después CLI/resume.

### Tarea 5 — CLI y branching de resume

Modificar:

- `backend/scripts/validation/narrative-user-canary-v8.ts`
- tests enfocados del canary o checkpoint.

Responsabilidad:

- parsear y validar los dos flags;
- cargar el checkpoint;
- saltar fases anteriores de acuerdo con la tabla;
- reconstruir boundary/manifest;
- reusar scripts editoriales parciales;
- producir un checkpoint nuevo sin modificar el anterior.

### Tarea 6 — Documentación final

Modificar:

- `docs/working/65-v8-canary-continuacion.md`
- este Plan 67.

Responsabilidad:

- documentar comandos exactos de run limpio y resume;
- registrar validaciones ejecutadas;
- marcar completado solo tras los tests estáticos;
- dejar el canary live completo para ejecución del usuario.

## 7. Tests obligatorios

### Checkpoint

- round-trip válido y fingerprint determinista;
- rechazo por fingerprint alterado;
- rechazo por request/perfil/ciudad incompatible;
- escritura atómica y permisos `0600`;
- checkpoint fuente no mutado;
- scripts parciales duplicados o desconocidos rechazados.

### Reintentos

- `429 -> 429 -> success` realiza tres llamadas solo con opt-in;
- `500 -> 500` realiza dos;
- semantic/schema inválido realiza como máximo dos;
- V6 sin opt-in realiza como máximo dos;
- operaciones V8 distintas del writer realizan como máximo dos.

### Canary

- cada fase completa actualiza el checkpoint;
- resume desde cada fase no llama a fases anteriores;
- research guardado reconstruye el mismo boundary/manifest;
- resume editorial omite writers con scripts válidos;
- fallo editorial 429 conserva scripts parciales;
- fallo editorial realiza cero llamadas a Scorecard y Markdown;
- resume desde scorecard exige Editorial completo;
- checkpoint incompatible falla antes de llamadas externas.

## 8. Validación estática final

Comandos ejecutados:

```bash
cd backend
npm test -- --runInBand \
  src/services/poi/NarrativeUserCanaryCheckpointV8.test.ts \
  src/services/poi/NarrativeUserCanaryRuntimeV8.test.ts \
  src/services/poi/EditorialStructuredLlmV6.test.ts \
  src/services/poi/NarrativeEditorialAgentsV6.test.ts \
  src/services/poi/NarrativeEditorialWorkflowV6.test.ts \
  src/services/poi/NarrativeEditorialWorkflowV8.test.ts \
  src/services/poi/NarrativeUserCanaryV8.test.ts \
  src/services/poi/NarrativeArcArchitectV8.test.ts \
  src/services/poi/NarrativeEvidenceBoundaryV8.test.ts

npx tsc --noEmit

npx tsc --noEmit --target es2020 --module commonjs \
  --moduleResolution node --esModuleInterop --skipLibCheck \
  scripts/validation/narrative-user-canary-v8.ts
```

## 9. Comandos de validación live

El canary live completo de Málaga no fue ejecutado por Codex de forma intencional y permanece como validación final del usuario. No se declara `Approve` ni `publicationPassed`.

Los artefactos de ejecución anteriores no son checkpoints compatibles; el checkpoint fuente debe ser creado por esta implementación.

Primer run post-implementación, usando el gasto acumulado aproximado observado:

```bash
cd backend
set -o pipefail
npx tsx scripts/validation/narrative-user-canary-v8.ts \
  --generate \
  --allow-external \
  --profile=balanced_openrouter \
  --prior-spend-usd=0.52 \
  --city='Málaga' \
  --city-qid=Q8851 \
  --run-id=malaga-v8-checkpoint-20260901-1 \
  2>&1 | tee /tmp/malaga-v8-checkpoint-20260901-1.log
```

Ejemplo de recuperación editorial:

```bash
cd backend
set -o pipefail
npx tsx scripts/validation/narrative-user-canary-v8.ts \
  --generate \
  --allow-external \
  --profile=balanced_openrouter \
  --prior-spend-usd=<SPEND_DEL_CHECKPOINT> \
  --city='Málaga' \
  --city-qid=Q8851 \
  --run-id=malaga-v8-checkpoint-resume-20260901-1 \
  --resume-checkpoint=tmp/narrative-v8/malaga-v8-checkpoint-20260901-1/checkpoint.private.json \
  --resume-from=editorial \
  2>&1 | tee /tmp/malaga-v8-checkpoint-resume-20260901-1.log
```

## 10. Criterios de aceptación

1. El run guarda un checkpoint privado después de cada fase completada.
2. El resume no repite fases anteriores.
3. El checkpoint fuente nunca se sobrescribe.
4. Boundary, manifest, Arc y scripts se revalidan al cargar.
5. Un writer V8 puede realizar un tercer intento solo tras 429.
6. V6 y las demás operaciones editoriales mantienen dos intentos.
7. Un fallo editorial conserva scripts válidos y la causa primaria.
8. Scorecard y Markdown no se ejecutan con Editorial incompleto.
9. Resume editorial reutiliza scripts completos y rehace auditorías.
10. Los tests enfocados, TypeScript y `git diff --check` pasan.
11. El usuario puede reanudar un canary live desde el checkpoint sin repetir POIs, ruta, Research ni Arc.

## 11. Fuera de alcance

- investigar o cambiar por qué las paradas resultan tier C;
- modificar acquisition, SearXNG, P856, MediaWiki o budgets de captura;
- sustituir paradas D;
- cambiar DeepSeek o fijar otro endpoint OpenRouter;
- añadir fallback de proveedor/modelo;
- cambiar la semántica de suficiencia V6;
- declarar `Approve` sin ejecutar el scorecard real.
