# Pipeline de lotes de tours (mapa del código real)

Estado a 1 de octubre de 2026. Describe lo que generó los 216 tours publicados. Plan de trabajo:
[`docs/plans/20261001-audio-paradas-ui-backend/`](../../../docs/plans/20261001-audio-paradas-ui-backend/README.md).
Para publicar en producción, véase [`deployment/pilot/catalog/README.md`](../../../deployment/pilot/catalog/README.md).

Todo se ejecuta **en local**. Producción es de solo lectura: nada de esto corre en el servidor.
Los comandos se lanzan desde `backend/`. Los `.cjs` con TypeScript necesitan `node -r ts-node/register/transpile-only`.

## Las cinco etapas

```
prepare ──► text ──► translate ──► audio ──► publication
fuentes     guion es   en/fr/de/it   MP3 VoxCPM2   paquete + importador
y ruta      (editorial)               por pieza     (deployment/pilot/catalog)
```

| Etapa | Script | Coste | Se reanuda |
|---|---|---|---|
| prepare | `deepseek-europe-prepare.cjs` (`--setup`, `--all` o un slug) con `preparation_attempt.cjs`, `overpass_control.py` y `diagnose-overpass.cjs`. España: `deepseek-batch-prepare.cjs` | Red (Overpass, Wikidata, Wikipedia); sin LLM de pago | Sí: congela entradas en `inputs.json` y valida el recibo de fase |
| text | `deepseek-batch-text.py --city-dir D --languages=es --execute [--resume]`. España: `deepseek-batch-run-text.py` | **DeepSeek (facturable)**, tope de 0,50 USD por ciudad (`editorial_runtime/budget.py`) | `--resume`, ligado a `text-inputs-lock.json` (sha del prompt y de las entradas) |
| translate | `translate-europe-batch.py` (cola) y `translate-europe-audio.cjs --prepare \| --check \| --execute`; `assemble-europe-translations.py en\|fr\|de\|it` | **DeepSeek (facturable)** y GPU | Sí, por idioma y ciudad |
| audio | `deepseek-europe-audio.cjs <slug> [--prepare-only] [--resume]` y `europe_assemble.py <slug> \| --index \| --check [--stage D]`. Lotes de audio sueltos: `tour-audio-batch.cjs` | **GPU** (VoxCPM2 local, vía `scripts/with-tts-gpu.py`, que detiene y restaura Qwen) | `--resume`: conserva los clips verificados; ensamblado idempotente |
| publication | `prepare-europe-publication.cjs --prepare \| --verify \| --refresh-fingerprints` | — | Sí; calcula `pilotFingerprint` con el código del backend |

Supervisión y recuperación de la cadena de Europa: `deepseek-europe-supervise.py` (cola desacoplada, con
`--check`, `--start-pilots`, `--all-after-pilots`, `--all-texts-first`, `--resume-sources`),
`complete-europe-and-translate.py`, `recover-europe-final.py`, `restart-europe-batch.py`,
`regenerate-berlin-tour.py`, `phase_guard.py` (arrendamiento por fase), `phase_receipts.py` (recibos con hash)
y `deepseek-europe-page.py` (página de progreso de solo lectura). Otros: `backfill-published-tour-images.cjs`
(fotos de Wikimedia sin tocar texto ni audio), `french-audio-replacement.cjs`, `verify_audio_recovery_copy.py`,
`pilot-tours.ts` (CLI de personal: `audit`, `prepare`, `review`, `withdraw`; nunca aprueba sin un archivo de revisión humana),
`overpass-cache.ts` y `seed-flexible-pass-inventory.ts` (camino antiguo de pases; desaparece con la opción A del paquete 07).

## Dónde viven los datos de una etapa

- La carpeta de etapa está en `backend/tmp/` (ignorada por git): `tmp/pilot-batch-europe-20260920` (Europa) y
  `tmp/pilot-batch-spain-20260912` (España). Tiene `manifest.json`, una carpeta por ciudad con `final/<idioma>.json`,
  `master.json`, `audio/`, y los estados de cola y recibos.
- **Código y datos están separados:** ningún script ejecuta ni importa código desde `tmp/` (lo vigila
  `test_script_portability.py`). `tmp/` solo contiene datos.
- La lista de ciudades de Europa está versionada en `manifests/europe-20260920.json`. Una etapa nueva se siembra
  desde ahí; un `manifest.json` existente no se sustituye nunca.

## Configuración (variables de entorno)

| Variable | Efecto | Valor por defecto |
|---|---|---|
| `BATCH_STAGE` | Carpeta de etapa de todos los scripts de lote | La de Europa o la de España, según el script |
| `NODE_BIN` | Binario de Node que lanzan los scripts de Python | `node` del `PATH` |
| `BATCH_MANIFEST` | Lista de ciudades con la que se siembra una etapa nueva | `manifests/europe-20260920.json` |
| `EXPECTED_CITIES`, `EXPECTED_STOPS` | Recuentos que comprueban la cola y la publicación | 30 y 1170 |
| `EUROPE_PUBLICATION_STAGE` | Salida de `prepare-europe-publication.cjs` | `~/.local/share/tour-guide/nomuvia/europe-launch-20260922` |
| `DEEPSEEK_API_KEY` | Clave de DeepSeek (`backend/.env`, no versionado) | — |

## Cómo se reanuda

1. Cada fase escribe un recibo con los hashes de sus entradas y salidas, y la siguiente se niega si no coinciden.
2. `--resume` solo es válido si las entradas congeladas no cambiaron. Si cambian, hay que usar una carpeta de ciudad nueva.
3. Un trabajo de audio interrumpido conserva sus clips (`tts-job/progress.json`); sin `--resume` se niega a empezar encima.

## Pruebas

```bash
cd backend/scripts/admin && python3 -m unittest discover -p 'test_*.py'
cd backend && node -r ts-node/register/transpile-only --test scripts/validation/*.test.cjs scripts/admin/test_preparation_attempt.cjs
./scripts/check-all.sh   # desde la raíz: todo lo anterior, Jest, TTS y frontend
```

## Pendiente conocido

- Los scripts de España y de Europa son casi copias y se unifican en el paquete 07 del plan.
- `translate-europe-audio.cjs` sigue con 120 tours (30 ciudades × 4 idiomas) fijados en su comprobación `--check`.
- El procedimiento de migraciones de esquema en producción no está escrito (ver el README de `deployment/pilot/catalog/`).

## `catalog-regeneration.cjs`: regeneración única del catálogo publicado

Plan: [`docs/plans/20261001-audio-paradas-ui-backend/04-regeneracion-y-publicacion.md`](../../../docs/plans/20261001-audio-paradas-ui-backend/04-regeneracion-y-publicacion.md).
Código en `backend/src/services/regeneration/`. Ayuda y opciones: `node -r ts-node/register/transpile-only scripts/admin/catalog-regeneration.cjs help`.

- Carpeta de trabajo: `--stage DIR` o `REGEN_STAGE` (por omisión `~/.local/share/tour-guide/nomuvia/regeneracion-20261001`). Contiene `manifest.json`, `state.json`, un archivo por tour y fase, `receipts/` y `approvals.json`.
- Fases, en orden: `snapshot`, `neutralize`, `cues`, `speech`, `legs`, `review-pack`, `render`, `images`, `stage-local`, `package`, `verify`, `publish`; más `status` y `rollback`.
- **Gasto y producción:** `neutralize --execute`, `speech --repair` y `render --execute` son los únicos que gastan (DeepSeek o GPU). `publish` solo imprime el comando salvo con `--confirm-production`. La herramienta **no escribe nunca** `approvals.json`.
- `stage-local`, `verify` y `rollback` solo escriben en una base de datos cuyo nombre termine en `_rehearsal`, `_stage` o `_regen`.
- Variables: `VOXCPM_PYTHON` (intérprete con `num2words` y `soundfile`), `REGEN_NEUTRALIZE_SCRIPT` y `REGEN_REPAIR_SCRIPT` (sustituyen a `neutralize.py` y `speech_repair.py`; solo para ensayos).
- **Ensayo sin gasto:** `node -r ts-node/register/transpile-only scripts/admin/rehearse-regeneration.cjs` crea `<bd>_rehearsal` desde `DATABASE_URL`, enlaza el audio con hard links y recorre todas las fases con un modelo y un renderizador simulados (`rehearsal/neutralize_double.py`). No lo ejecuta `scripts/check-all.sh` porque necesita Postgres local.
