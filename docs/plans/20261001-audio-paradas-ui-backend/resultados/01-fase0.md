# 01 · Fase 0 del backend: informe

Hecho el 1 de octubre de 2026 en la rama local `plan/20261001-fase0`. **Nada está confirmado en git ni desplegado**: ambas cosas requieren tu autorización. Todo el trabajo queda en el árbol de trabajo.

## Resultado por tarea

| Tarea | Estado |
|---|---|
| 3.1 Línea base y `scripts/check-all.sh` | Hecho. Verde en 46 s. Detecta fallos nuevos y también fallos conocidos que ya pasan. Ver [01-linea-base.md](01-linea-base.md) |
| 3.2 Copia limpia de `master` | Hecho: `npm ci`, `tsc` y todas las pruebas pasan en un `git worktree` aparte, ya retirado |
| 3.2 Scripts de producción en el repo | Hecho en `deployment/pilot/catalog/` (7 scripts y README). Sin secretos; solo la IP del servidor, que ya era pública en el repo |
| 3.2 Procedimiento de migraciones de esquema | **Pendiente, necesita SSH.** Ver «Pendiente» |
| 3.3 Código fuera de `backend/tmp` | Hecho, y con una dependencia que el plan no veía (ver abajo) |
| 3.4 Configuración en lugar de rutas fijas | Hecho: `NODE_BIN`, `BATCH_STAGE`, `EXPECTED_CITIES`, `EXPECTED_STOPS`, `BATCH_MANIFEST` |
| 3.5 Un solo punto de preparación de texto | Hecho: `prepare_piece_text` |
| 3.6 Menos superficie en producción | Hecho en código; **sin desplegar** |
| 3.7 `backend/scripts/admin/README.md` | Hecho (74 líneas) |

## Lo que el plan no veía

- **`assemble.py` cargaba otro código de `tmp/`.** La ensambladora de Europa importaba por ruta `tmp/sicilia-20260919/assemble.py`. Mover solo la primera habría dejado el pipeline roto. Se extrajo la función a `tour_compilation.py` y `europe_assemble.py` la usa. Comprobado de solo lectura sobre París, una ciudad ya ensamblada: verifica los hashes de entrada, el audio y la procedencia, y no modifica la etapa.
- **El `manifest.json` de Europa se creó a mano**, no lo genera ningún script. Está versionado en `manifests/europe-20260920.json` y `deepseek-europe-prepare.cjs` siembra desde ahí las etapas nuevas, sin sustituir nunca uno existente.
- **Había más recuentos fijos de 30 ciudades** (supervisor, recuperación, traducción, página de progreso). Todos usan ahora `EXPECTED_CITIES`.
- **`run.py` calculaba el hash de archivos que no existen.** `prepare()` no lo usa el flujo de producción; ahora solo incluye los que existen.

## Mediciones de §3.6

Servidor compilado, `NODE_ENV=production`, en reposo, 3 repeticiones:

| | Antes | Después |
|---|---|---|
| Módulos cargados | 364 | 302 |
| Servicios antiguos cargados (orquestación, descubrimiento de conceptos, controladores) | Sí | **No** |
| Memoria residente | 87–88 MiB | 86–87 MiB |
| `POST /api/v1/tours/generate`, `/cities`, `/passes` | 401 | 404 |

**La mejora de memoria es de ~1 MiB, no la que el plan esperaba.** El beneficio real es de superficie, no de memoria: ya no existe ninguna ruta de generación en producción. El grueso de los 87 MiB viene del cliente de base de datos y de otros 302 módulos; el recorte grande depende de 07 §7.5 (los 38 archivos de `poi` que carga `TourBlueprint`).

Desviación del plan: en lugar de convertir los singletons en funciones perezosas, `app.ts` carga las rutas antiguas con `require` solo fuera del modo piloto. Así esos módulos ni se cargan, que es más fuerte. En desarrollo siguen montadas y protegidas por clave (401 con clave incorrecta).

## Cambios de código

- **Backend:** `src/app.ts` (nuevo, `createApp()` sin `listen`), `src/server.ts` y `src/app.test.ts` (2 pruebas, con control negativo comprobado).
- **Pipeline de lote:** 17 scripts de `backend/scripts/admin` (rutas y recuentos), `europe_assemble.py`, `tour_compilation.py`, `manifests/` y `test_script_portability.py` (10 pruebas que fallan sobre el código original).
- **Pod de voz:** `prepare_piece_text` en `tour_audio_input.py`, usada por `prepare_input` y por el servicio HTTP. 4 pruebas nuevas, entre ellas la paridad byte a byte con la lógica anterior sobre textos reales de los 5 idiomas.
- **Comprobación común:** `scripts/check-all.sh` y `scripts/check-all.known-failures.txt`.

## Pruebas

219 suites de Jest (211 pasan, 7 fallos conocidos, 1 omitida), 79 pruebas de Python de administración, 11 de Node y 22 del pod de voz con su único fallo conocido. `check-all.sh` termina en verde.

## Pendiente y motivos

1. **Confirmar en git.** Necesita tu visto bueno con la lista de archivos. Sugiero tres commits: pipeline y pruebas, `app.ts` y su prueba, y `deployment/pilot/catalog/`.
2. **Desplegar §3.6 a producción.** Necesita tu autorización. Se haría con el patrón de `release-audio-cache-20261001.sh`.
3. **Migraciones de esquema en producción.** Ningún script del repo ejecuta `prisma migrate deploy`, y la migración `20260912190000_tour_introduction_audio` consta como aplicada. Hay que leer `_prisma_migrations` por SSH para saber cómo se hizo. El paquete 04 §10.2 depende de ello.
4. **`prepare_piece_text` no lleva todavía el parámetro `spoken_text`.** Se añade en 02, que es quien lo usa.
5. **`--stage` solo en `europe_assemble.py`.** El resto de scripts usa `BATCH_STAGE`. No hay `--help` que probar en los scripts de lote, que ejecutan trabajo al importarse; los cubre `test_script_portability.py`.
