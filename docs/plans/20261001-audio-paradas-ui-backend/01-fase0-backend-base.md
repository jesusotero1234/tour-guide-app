# 01 · Fase 0 del backend: dejar el pipeline real versionado y aislado

Estado: **hecho en local** el 1 de octubre; informe en [`resultados/01-fase0.md`](resultados/01-fase0.md) · Sin dependencias · Bloquea: [02](02-texto-hablado.md), [03](03-paradas-sin-orden.md), [04](04-regeneracion-y-publicacion.md)

Antes de tocar el audio hay que poder confiar en el código que lo produce. El pipeline
que generó los 216 tours publicados se confirmó en git el 1 de octubre de 2026 (commits
`b3c3b34`, `c8f65fa`, `ef302ab`, `abe0eef` y siguientes), pero todavía:

- depende de archivos dentro de `backend/tmp`, que git ignora;
- tiene rutas absolutas de una máquina;
- su importador de producción vive fuera del repo.

Esta fase deja una base mínima y segura. La limpieza grande se hace en
[07](07-backend-limpieza.md).

## 1. Situación (auditoría del 1 de octubre de 2026)

### Estado en git (actualizado)

- Todo lo que el análisis inicial encontró sin seguimiento o modificado (scripts de `backend/scripts/admin/`, `editorial_runtime/`, `OverpassCoordinator*`, `SourceAcquisition`, `StaticOsmPoiFallback`, `NarrativeRoutePlanningV8`, `WikidataEntityDataV8`, `render-tour.py`, `LocalVoxCpmRenderer.ts`…) ya está confirmado en `master`.
- Queda por **comprobar** que lo confirmado es autosuficiente: que compila y pasa las pruebas en una copia limpia (§3.2).

### Riesgos

- **Código y datos dentro de `backend/tmp`:**
  - `deepseek-europe-audio.cjs:15` ejecuta `tmp/pilot-batch-europe-20260920/assemble.py`;
  - la lista de ciudades (`manifest.json`) solo está en esa carpeta;
  - `deepseek-batch-text.py` ya importa de `editorial_runtime/`, que está versionado, y no de `tmp/`.
- **Rutas y valores fijos:**
  - binario de Node `/home/jesusotero/.nvm/versions/node/v22.19.0/bin/node`: `deepseek-europe-supervise.py:19`, `phase_receipts.py:9`, `complete-europe-and-translate.py:20`, `recover-europe-final.py:19`, `regenerate-berlin-tour.py:21`;
  - carpeta de lote `tmp/pilot-batch-europe-20260920`: 13 archivos;
  - carpeta `pilot-batch-spain-20260912`: 5;
  - recuentos fijos (30 ciudades, 150/1170/1320): `prepare-europe-publication.cjs:166-169,194,342,352,368` y otros;
  - `editorial_runtime/client.py:18-28`: constantes sin uso que apuntan a `tmp/astra-replacement-sandbox`;
  - `editorial_runtime/run.py:31`: calcula el hash de `PLAN.md` y `test_pilot.py`, que no existen.
- **El importador de producción no está en el repo.** Vive en `~/.local/share/tour-guide/nomuvia/europe-launch-20260922/`: `transfer.sh`, `install.sh`, `remote-import.cjs`, `remote-rollback.cjs`, `verify.cjs`, `smoke.cjs`, `build.sh`, `fingerprint-repair.sql` y `fingerprint-rollback.sql`.
- **Producción expone más de lo que usa:**
  - `server.ts:54-56` monta `/api/v1/tours` (generación antigua y en la app), `/cities` y `/passes` también en modo piloto. Solo los protegen la API key, la escucha en loopback y el proxy.
  - Los singletons antiguos se construyen al cargar el módulo (`orchestrationService.ts:2486`, `ConceptDiscoveryService.ts:564`). Eso cuesta memoria, y la memoria fue la causa del incidente de catálogo lento del 1 de octubre (`docs/operations/nomuvia-catalogo-lento-20261001.md`).
- **Línea base de pruebas** (backend):
  - `tsc --noEmit` pasa en `src` y en `tsconfig.generation-worker.json`;
  - Jest: 218 suites, de las que 210 pasan, 7 fallan y 1 se omite; 2.177 de 2.198 pruebas pasan. Las 7 que fallan:
    - del núcleo de producción: `NarrativeEditorialAgentsV6`, `EditorialStructuredLlmV6` y `LandmarkTiering`;
    - del camino de desarrollo: `CodexTourGenerator`;
    - de módulos muertos: `AutonomousNarrativePilotV1`, `NarrativePilotDeepSeekV1` y `NarrativeCalibrationV6`;
  - Python `scripts/admin` (`python3 -m unittest discover -p 'test_*.py'`): 69 de 69;
  - `node --test` de `scripts/validation/*.test.cjs` y `scripts/admin/test_preparation_attempt.cjs`: 11 de 11;
  - no hay CI, aunque existe el remoto `github.com/jesusotero1234/tour-guide-app`.

## 2. Reglas de esta fase

- **El repositorio es público.** No confirmar secretos: claves, `.env`, contraseñas, tokens, volcados de BD ni datos personales. Antes de cada commit, revisar el diff (por ejemplo con `git diff --cached | grep -iE "key|token|secret|password|BEGIN .*PRIVATE"`).
- **Puede haber otros agentes trabajando a la vez.** Comprobar `git status` antes de empezar. Añadir archivos **por nombre**: nada de `git add -A`, `git stash`, `git checkout -- .`, formateos masivos ni reverts de trabajo ajeno.
- **Confirmar en git y subir a GitHub** se hace solo cuando el usuario lo pida o lo autorice.
- No cambiar el comportamiento del pipeline en esta fase, salvo lo indicado en §3.4–§3.6.

## 3. Tareas

### 3.1 Línea base

1. Ejecutar y guardar los resultados en `resultados/01-linea-base.md`, dentro de esta carpeta:
   - `cd backend && npx tsc --noEmit && npx tsc --noEmit -p tsconfig.generation-worker.json`
   - `cd backend && npx jest --json --outputFile=<scratch>/jest.json`. Omitir `OverpassCoordinator.integration`, que escribe en `backend/tmp`.
   - `cd backend/scripts/admin && python3 -m unittest discover -p 'test_*.py'`
   - `cd backend && node -r ts-node/register/transpile-only --test scripts/validation/*.test.cjs scripts/admin/test_preparation_attempt.cjs`. Ojo: `scripts/validation/__tests__/` contiene pruebas Jest `.ts`, no estas.
   - `cd pods/voxcpm-pod && .venv/bin/python scripts/test-tour-audio-input.py && .venv/bin/python scripts/test-sanitize.py`
   - `cd frontend && npx tsc --noEmit && npm run lint`
2. Crear `scripts/check-all.sh` en la raíz con esos comandos (sin GPU, sin red y sin escritura fuera de un temporal). Es la comprobación común de todas las fases.
   - Incluye una lista de **fallos conocidos** (`scripts/check-all.known-failures.txt`, con las 7 suites de §1).
   - Sale con código distinto de 0 si aparece un fallo **nuevo** o si una suite de la lista empieza a pasar sin haberla quitado, para que la lista no quede obsoleta.
   - «Verde» en todo el plan significa: sin fallos fuera de esa lista.

### 3.2 Comprobar que lo versionado es autosuficiente y traer los scripts de producción

1. `git worktree add <scratch>/wt-check master` y, en esa copia limpia:
   - `npm ci` en `backend/` y `frontend/`;
   - `tsc`;
   - las pruebas de §3.1.

   Si algo falla por un archivo que falta en git, **informar al usuario** con la lista. No confirmar por cuenta propia archivos que puedan ser de otro trabajo en curso.
2. Copiar al repo, en `deployment/pilot/catalog/`, los scripts de producción que hoy viven fuera:
   - de `~/.local/share/tour-guide/nomuvia/europe-launch-20260922/`: `transfer.sh`, `install.sh`, `remote-import.cjs`, `remote-rollback.cjs`, `verify.cjs`, `smoke.cjs` y `build.sh`;
   - **no** los volcados, catálogos ni audio.

   Antes de proponer el commit, revisar que no contengan claves, contraseñas ni tokens. **El repo es público.** Si los contienen, pasarlos a variables de entorno. Las rutas como `/etc/tour-guide/*.env` sí pueden quedar, porque no son secretos.
3. Los SQL de reparación de huellas (`fingerprint-repair.sql` y `fingerprint-rollback.sql`) se documentan como precedente en el `README.md` de §3.7. Solo se versionan si no contienen datos que no deban publicarse.

### 3.3 Sacar el código de `backend/tmp`

1. Mover `tmp/pilot-batch-europe-20260920/assemble.py` a `backend/scripts/admin/europe_assemble.py` y que `deepseek-europe-audio.cjs:15` lo invoque desde ahí.
2. Copiar la lista de ciudades (`manifest.json` de esa carpeta) a `backend/scripts/admin/manifests/europe-20260920.json`, versionada. Los scripts la leen de ahí o de `--manifest`.
3. Comprobar con grep que ningún script de `scripts/admin` o `src` **ejecuta o importa** código de `tmp/`. Leer **datos** de una carpeta de etapa sí está permitido, siempre que se configure como en §3.4.

### 3.4 Configuración en lugar de rutas fijas

Cambio mecánico y probado. **Sin cambios de comportamiento.**

- **Binario de Node:** usar `os.environ.get('NODE_BIN') or shutil.which('node')` en Python y `process.execPath` en Node, en los 5 archivos del §1.
- **Carpeta de lote:** argumento `--stage` o variable `BATCH_STAGE`, cuyo valor por defecto es la carpeta actual, para no romper la reanudación de lotes existentes. Afecta a los 13 + 5 archivos del §1.
- **`editorial_runtime/client.py`:**
  - `REPO` se deriva de `__file__`;
  - se eliminan las constantes `:18-28` que no se usan;
  - `:145` lee `backend/.env` de forma relativa.
- **`editorial_runtime/run.py:31`:** quitar los archivos que no existen del cálculo del hash, o fallar con un mensaje claro.
- **Recuentos fijos** (`prepare-europe-publication.cjs` y demás): dejarlos como parámetros con el valor actual por defecto. La herramienta nueva de [04](04-regeneracion-y-publicacion.md) no debe copiarlos.
- Añadir pruebas mínimas que importen cada script con `--help` o en modo `--dry-run`, para detectar rutas rotas.

### 3.5 Un único punto de preparación de texto para TTS

- **Hay dos caminos:**
  - el de producción: `render-tour.py` → `tour_audio_input.prepare_input`;
  - el antiguo por HTTP: `orchestrationService.ts:1829` (`buildAudioNarrationText`) → `:2376` POST `/tts/generate` → `pods/voxcpm-pod/src/services/voxcpm.py:246-252`, que solo aplica `sanitize` y troceado.
- **Cambio:** extraer en `tour_audio_input.py` la función `prepare_piece_text(text, lang, preset, *, spoken_text=None) -> str`, con el paso por pieza actual (reemplazos, `sanitize`, años franceses). Que **ambos** caminos la usen. Así [02](02-texto-hablado.md) cambia un solo sitio.
  - **Camino de producción:** debe producir **byte a byte** el mismo texto que hoy. Lo garantizan las pruebas actuales de `test-tour-audio-input.py`, que no se tocan.
  - **Camino HTTP** (solo desarrollo, no se usa en producción): puede adoptar el comportamiento del de producción. La diferencia se anota en el informe.
- Si [07](07-backend-limpieza.md) elimina antes el camino antiguo, este punto se reduce a crear la función.

### 3.6 Reducir lo expuesto en producción

- **`backend/src/server.ts:54-56`:** si `pilotEnabled()` es verdadero, **no montar** `/api/v1/tours`, `/cities` ni `/passes`.
- **Construcción perezosa** de los singletons `orchestrationService` (`:2486`) y `ConceptDiscoveryService` (`:564`): crear una función `get…()` en lugar de exportar una instancia.
- **Prueba:** en modo piloto, `GET /api/v1/tours/generate` devuelve 404 y el servidor arranca sin construir esos servicios (con un `jest.mock` que falle si se construyen).
- **Medida:** memoria residente del backend en reposo antes y después (local, `NODE_ENV=production`, modo piloto). Anotarla en el informe.
- **El despliegue de este cambio a producción requiere autorización del usuario.** Usar el patrón de releases de `deployment/pilot/release-audio-cache-20261001.sh`.

### 3.7 Mapa del pipeline actual

Crear `backend/scripts/admin/README.md` (≤ 150 líneas) con el pipeline real y sus comandos:

- prepare → text → translate → audio → publication;
- dónde viven las etapas;
- qué es facturable o necesita GPU;
- cómo se reanuda.

Debe enlazar este plan. El `ARCHITECTURE.md` antiguo se corrige en [07](07-backend-limpieza.md).

## 4. Criterios de aceptación

- [ ] `scripts/check-all.sh` y su lista de fallos conocidos existen. La línea base está documentada en `resultados/01-linea-base.md`.
- [ ] `master` compila y pasa las pruebas en una copia limpia (`git worktree`), o el usuario tiene la lista de lo que falta.
- [ ] Los scripts de producción están versionados en `deployment/pilot/catalog/`, sin secretos.
- [ ] Ningún script de producción ejecuta código de `backend/tmp`. Nada depende de `/home/jesusotero/.nvm/...`.
- [ ] Hay una sola función de preparación de texto para TTS.
- [ ] En modo piloto, el servidor no monta las rutas antiguas ni construye sus servicios.
- [ ] Existe `backend/scripts/admin/README.md`.
- [ ] Informe en `resultados/01-fase0.md` (además de `resultados/01-linea-base.md`).
