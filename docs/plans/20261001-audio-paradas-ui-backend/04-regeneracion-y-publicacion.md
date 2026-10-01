# 04 · Regeneración única del catálogo y publicación

Estado: propuesto · Depende de: [01](01-fase0-backend-base.md), [02](02-texto-hablado.md), [03](03-paradas-sin-orden.md) · Habilita: [05](05-reproductor-empezar-cerca.md)

## 1. Objetivo

Aplicar a los **216 tours publicados** dos cambios en **una sola pasada de render**:

- texto hablado normalizado ([02](02-texto-hablado.md));
- paradas independientes del orden: cuerpo, enlaces y matriz de caminata ([03](03-paradas-sin-orden.md)).

Después se publican con un importador de **actualización** que permite revertir.

## 2. Hechos que condicionan el diseño

1. **Hay tres orígenes distintos del contenido publicado.** No existe un único JSON fuente de verdad:

   | Origen | Tours | Paradas | Dónde está la verdad |
   |---|---|---|---|
   | Lote Europa (30 ciudades × 5) | 150 | 1.170 | `backend/tmp/pilot-batch-europe-20260920/<city>/final/<lang>.json` |
   | Historia España (11 ciudades × 5) | 55 | 425 | **BD local** (`backend/tmp/pilot-batch-spain-20260912/` + revisión de textos en `~/.local/share/tour-guide/nomuvia/revision-publicacion-20260919/`) |
   | Temáticos es | 11 | 58 | `backend/tmp/tours-tematicos-20260917` + `thematic-launch-20260919/prepare.py` |

   → **Decisión:** la regeneración parte de un **snapshot de lo publicado en producción**, no de los JSON de lote.
2. **El importador actual solo crea.** `remote-import.cjs` solo hace `createMany`, comprueba los recuentos previos exactos y que los ids no existan. → Hace falta un **importador de actualización nuevo**.
3. **La huella de publicación** (`backend/src/services/PilotRelease.ts:75-91`) cubre:
   - de la introducción: el texto y el audio (`introductionAudio{version,text}`);
   - de cada parada: `description`, `transcript`, `audioVersion`, `images` y `sources`.

   Además, `validatePilotMaterial` exige `tourImages.sourceText === description` (`:55`). → Al cambiar textos hay que recalcular `tourImages` y `pilotRelease.fingerprint`; si no, el tour **desaparece de la API** (`admittedToPilot`).
4. **Selección de audio:**
   - `TourAudioService.assets()` (`:113-129`) elige el `AudioAsset` más reciente cuyo `rendererKey` y `sourceHash` coincidan. Con [02](02-texto-hablado.md) §7, `sourceHash` pasa a ser sha(lang + rendererKey + spokenText).
   - → Los audios nuevos se seleccionan solos cuando cambian los textos, y los antiguos siguen en disco y en la BD.
   - → **Revertir equivale a restaurar los textos anteriores** (y las huellas).
   - Introducción: `IntroductionAudio.activeIntroduction` (`:33-46`) exige `metadata.introductionAudioId`, un archivo verificado y que `firstAudioAssetId` coincida con el hash de la parada 0 (`firstHash`, `TourAudioService.ts:91`, que [02](02-texto-hablado.md) §7.3 pasa a calcular sobre `spokenText`). Hay que actualizar esos tres campos.
   - **Los presets de voz no cambian** ([02](02-texto-hablado.md) §2.5). Por eso `rendererKey` es el mismo antes y después, y la reversión funciona en todos los idiomas.
5. **Producción** (patrón de `~/.local/share/tour-guide/nomuvia/europe-launch-20260922/`, que también contiene `remote-rollback.cjs`, `smoke.cjs`, `build.sh`, `fingerprint-repair.sql` y `fingerprint-rollback.sql`; estos dos últimos son el precedente de cómo se actualizaron huellas en producción):
   - `transfer.sh` sube con rsync excluyendo el audio;
   - el audio va aparte y se comprueba con `sha256sum -c audio.sha256`;
   - `install.sh` hace `pg_dump`, copia con `cp -al` a `shared/voxcpm2/<jobId>` (y se niega si ya existe), importa, verifica, cambia `current` de forma atómica y revierte con un `trap`.
   - Almacenamiento de audio en producción: `/srv/tour-guide/shared/audio` (`AUDIO_STORAGE_PATH`).
   - **Acceso:** el host SSH y la ruta de la clave están en `deployment/pilot/release-audio-cache-20261001.sh` (`HOST`, `KEY`).
   - **Entornos de BD en el servidor:** `/etc/tour-guide/backend.env` para leer, como usuario `nomuvia_app`, **que solo tiene SELECT** (`deployment/pilot/hetzner-status.md:163`); `/etc/tour-guide/migration.env` para escribir y migrar, como hace `install.sh`. Los secretos **nunca** se copian al repo ni a los informes.
6. **Capacidad de GPU medida:** la pasada de traducciones del 21–22 de septiembre generó 1.056 piezas (51,4 h de audio) en unas 8 h, es decir, ≈6,5× tiempo real.
7. **Trabajo concurrente:** otro agente publicó el 1 de octubre la release `20261001-audio-cache` (commit `766286f`, que caché los hashes de audio por identidad de archivo en `TourAudioService.ts`/`IntroductionAudio.ts`; ver `docs/operations/nomuvia-catalogo-lento-20261001.md`). Partir de esa base y no deshacerla.
8. **El render recarga el modelo en cada trabajo** (`render-tour.py:220`), con un máximo de 40 piezas por trabajo (`tour_audio_input.py:72-73`). Cada generación tiene además un coste fijo que pesa mucho en clips de 2–3 s.

## 3. Herramienta: `catalog-regeneration`

- **Archivo:** `backend/scripts/admin/catalog-regeneration.cjs`, con ayudantes en Python donde haga falta (normalizador y neutralización).
- **Patrón:** copia el de `backend/scripts/admin/tour-audio-batch.cjs` (documentado en `docs/tours/plan-introduccion-independiente.md`):
  - manifiesto cerrado (`wx`);
  - `flock` en `run.lock`;
  - `state.json` ligado al `manifestSha256`;
  - verificación por pieza y reanudación;
  - GPU vía `scripts/with-tts-gpu.py` (raíz del repo).
- **Directorio de trabajo** (fuera del repo, como las demás etapas): `~/.local/share/tour-guide/nomuvia/regeneracion-20261001/`, configurable con `REGEN_STAGE`. **Nada de rutas absolutas en el código** (ver [01](01-fase0-backend-base.md)).

```
node -r ts-node/register/transpile-only scripts/admin/catalog-regeneration.cjs <subcomando> [--stage DIR] [--tours id,id] [--languages es,fr]
```

| # | Subcomando | Qué hace | Facturable / GPU / Prod |
|---|---|---|---|
| 1 | `snapshot` | Exporta lo publicado (§4) | Lectura de prod (autorización SSH) |
| 2 | `neutralize` | Pasada de [03](03-paradas-sin-orden.md) §6 | **Facturable** |
| 3 | `cues` | Rellena las plantillas de enlace de [03](03-paradas-sin-orden.md) §3 | — |
| 4 | `speech` | Normalización + puerta + reparación de residuos ([02](02-texto-hablado.md) §6) | **Facturable** (solo residuos) |
| 5 | `legs` | Matriz y tramos a pie ([03](03-paradas-sin-orden.md) §7) | Router público (≤1 req/s) |
| 6 | `review-pack` | Genera el paquete de revisión para el usuario (§6) | — |
| 7 | `render` | Render de todas las piezas (§7) | **GPU ~18–24 h** (autorización) |
| 8 | `images` | Recalcula `tourImages` contra el nuevo `description` | — |
| 9 | `stage-local` | Aplica los cambios a una copia local de la BD y calcula las huellas con el código del backend (§8) | — |
| 10 | `package` | Construye el paquete de actualización con las huellas calculadas (§8) | — |
| 11 | `verify` | Verificación local de punta a punta, incluida la reversión (§9) | — |
| 12 | `publish` | Importador de actualización en prod (§10) | **Producción** |
| — | `status` | Resumen por fase, tour, idioma y pieza | — |
| — | `rollback` | Revierte desde el bloque `previous` del paquete (§11) | **Producción** |

Cada subcomando:

- es **idempotente y reanudable**;
- escribe un recibo `receipts/<fase>.json` con los hashes de sus entradas y salidas, siguiendo el patrón de `phase_receipts.py`;
- se niega a ejecutarse si el recibo de la fase anterior no coincide.

Se admiten `--tours` y `--languages` para trabajar con muestras: Valencia primero.

## 4. `snapshot`

- **Origen:** la BD de producción, en solo lectura.
  - Script `remote-snapshot.cjs` (versionado en `deployment/pilot/catalog/`, ver [01](01-fase0-backend-base.md) §3.2), ejecutado en el servidor con `/etc/tour-guide/backend.env`: Prisma `findMany` de los tours publicados con sus places, audioAssets, introductionAudios y metadata.
  - Se copia de vuelta por scp.
  - **Requiere autorización del usuario para el acceso SSH.**
- **Comprobación cruzada:** para cada tour, `GET https://nomuvia.com/api/backend/tours/:id` debe coincidir con el snapshot en `introduction`, `description` por parada, `audioVersion` por parada y `pilot.version` (la huella). Si algo no cuadra, se aborta.
- **Salida:** `manifest.json` (abierto con `wx`), con, por tour:
  - `tourId`, `language`, `city`, `countryCode`, `baseKey` y `fingerprint`;
    - `baseKey` es la ruta base compartida entre idiomas, por `group` de `frontend/src/lib/seoInventory.ts`; son ~52 entre los publicados;
    - además: el `rendererKey` vigente por idioma;
  - por parada: `placeId`, `position`, `name`, `nameInTourLanguage`, `description`, `lat`/`lng`, `metadata.sourceCredits` y `metadata.tourImages`, más el `AudioAsset` vigente (id, `storagePath`, `metadata`);
  - de la introducción: `introduction`, el `TourIntroductionAudio` vigente y `metadata.introductionAudioId`/`firstAudioAssetId`;
  - `pilotWalkingRoute`.
- **Recuentos esperados** (comprobar y no fijar en el código: se comparan con la API): **216 tours** (es 52, en/fr/de/it 41), **1.653 paradas** y **216 introducciones**.

## 5. `neutralize`, `cues`, `speech`, `legs`

Se aplican exactamente como en [03](03-paradas-sin-orden.md) §6, §3 y §7 y en
[02](02-texto-hablado.md) §3–§6. Salidas en `neutral/`, `cues/`, `speech/` y `legs/`,
un archivo por tour.

Políticas comunes:

- **Ejecución gradual:** se procesa primero la muestra (`--tours` de Valencia en los 5 idiomas), se genera `review-pack` y se espera la aprobación del usuario antes del resto.
- **Fallos:** una pieza en `needs_manual` marca su tour como `excluded` en `state.json`. Ese tour no se publica en esta regeneración y conserva su contenido actual, válido y con orden fijo.

## 6. `review-pack` (revisión humana)

- **Contenido:** HTML estático en `review/index.html` con, por tour:
  - el original frente al cuerpo, en diff por palabras y con las ediciones resaltadas;
  - `spokenText` con los cambios de normalización resaltados;
  - los enlaces generados;
  - y, tras el render, un reproductor con el audio nuevo.
- **Filtros:** idioma, ciudad, piezas con reparación LLM y piezas en `needs_manual`.
- **Aprobación:** el usuario registra la decisión en `approvals.json`; el ejecutor **no** la escribe en nombre del usuario. Es obligatoria la muestra de Valencia (5 idiomas) antes del lote completo, y antes de publicar, un muestreo final de 1 tour por idioma.
- **Esquema de `approvals.json`:** el ejecutor puede crear el archivo vacío (`{"approvals": []}`), y cada entrada la añade el usuario o se transcribe **literalmente** de un mensaje suyo:
  ```json
  { "approvals": [ { "scope": "sample-valencia | full-catalog | cue-templates | publish",
      "tours": ["<tourId>", "..."], "decision": "approved | rejected | changes-requested",
      "notes": "...", "authorizationReference": "<cita literal del mensaje del usuario>", "at": "<ISO 8601>" } ] }
  ```
- **La `pilotRelease.authorizationReference` del paquete** (§8.2) se copia **literalmente** de la entrada `publish` de `approvals.json`. Sin esa entrada, `package` se niega a ejecutarse.

## 7. `render`

- **Piezas:**
  - 1.653 cuerpos de parada;
  - 216 introducciones (el texto hablado lleva delante el aviso de voz IA, como hoy);
  - unos 3.500 clips de enlace (216 × (2N+1)).

  El audio total estimado es de ~84 h (paradas de ~175 s de media), más ~3 h de enlaces.
- **Agrupación:** por idioma, en trabajos de ≤40 piezas (límite en `tour_audio_input.py:72-73` y `TourAudioService.ts:100`), con `runLocalVoxCpm` y `--resume`.
  - Son ~48 trabajos de paradas, 6 de introducciones y ~88 de enlaces: unos 140 en total.
  - Cada trabajo recarga el modelo (`render-tour.py:220`).
  - Si la prueba de tiempos lo justifica, se puede proponer, como cambio aparte y con pruebas, un modo de render que mantenga el modelo cargado entre trabajos.
- **Ids nuevos:** `uuid(regenRunId | tourId | kind | pieceId | sha256(spokenText))`, siempre **UUID** (también el `jobId`), con ruta `voxcpm2/<jobId>/<id>.mp3` y su sidecar `.provenance.json`.
- **Prueba previa con clips muy cortos:** antes del lote, renderizar 20 enlaces de 2–3 s por idioma y escucharlos. Si VoxCPM2 produce artefactos con textos tan cortos, hay dos alternativas:
  - añadir silencio inicial y final en el posproceso: un relleno nuevo y explícito, porque `trimEdgeSilenceMs` (`render-tour.py:96,265`) **recorta** silencio, no lo añade;
  - o renderizar el enlace como frase completa («Siguiente parada: X. Te esperamos allí.»), cambio que valida el usuario.
- **Verificación por pieza:**
  - se decodifica (SoundFile);
  - duración > 0; para los enlaces, entre 0,8 y 10 s;
  - el sha del archivo coincide con el registrado;
  - `spokenText` coincide con el sidecar.

  Hasta 3 intentos con espera progresiva.
- **Prueba de tiempos (obligatoria):** con la muestra de Valencia (5 idiomas: ~45 paradas, 5 introducciones y ~95 enlaces), medir el tiempo por trabajo, por recarga, por pieza larga y por enlace. Con eso se extrapola el total y se informa al usuario.
- **Tiempo estimado** a priori: ~13–15 h de render de paradas e introducciones (≈6,5× tiempo real), más las recargas y el coste fijo de ~3.500 enlaces. En total, **~18–24 h de GPU**, a confirmar con la prueba.
  - Se puede lanzar por idioma en días distintos.
  - `with-tts-gpu.py` detiene y restaura Qwen.
  - **Pedir autorización al usuario** antes de cada bloque de más de 1 h, indicando su duración estimada.
- **Control de calidad:** Whisper sobre la muestra ([02](02-texto-hablado.md) §9).

## 8. `images`, `stage-local` y `package`

### 8.1 `images`

Para cada parada:

- `tourImages.sourceText = nuevo description`;
- reasignar `paragraphIndex` y `paragraphText` por coincidencia exacta y, si no la hay, por máxima similitud (Jaccard de tokens ≥ 0,6);
- si alguna imagen no encuentra párrafo, se queda sin `paragraph*` y con el rol original.

Reutilizar la lógica de `backend/scripts/admin/backfill-published-tour-images.cjs`.
Después, comprobar en local `validatePilotMaterial` (no debe lanzar `PILOT_IMAGE_CREDITS_PENDING`).

### 8.2 `stage-local`

La huella solo se puede calcular con el código real del backend, que necesita una BD
y el almacenamiento de audio. Por eso el paquete se construye **después** de aplicar
los cambios en local:

1. Preparar el Postgres local (§9.1) con un `pg_dump` de producción reciente, restaurado, más la migración única ([02](02-texto-hablado.md) §7.1).
2. Comprobar que el `rendererKey` local de cada idioma (presets y referencias de `pods/voxcpm-pod/presets/`) es **igual** al del snapshot. Si no lo es, se aborta: los hashes no coincidirían en producción.
3. Aplicar los cambios con el **mismo código** del importador de §10, en modo local.
4. Calcular, por tour, `pilotFingerprint(tour, await audio.get(id, true))` con el código del backend. Guardar las huellas y el estado en `stage-local/<tourId>.json`.

### 8.3 `package`

Genera `package/catalog-update.json` con las huellas de §8.2:

```json
{ "version": 1, "regenRunId": "...", "basedOnSnapshotSha256": "...",
  "tours": [ {
    "tourId": "...", "expectedCurrentFingerprint": "<huella del snapshot>",
    "update": {
      "introduction": "...", "introductionSpokenText": "...",
      "metadata": { "orderFlexible": true, "introductionAudioId": "...",
                    "catalogTitle": "<si se decide, ver 06 §B1>", "pilotRelease": { ...nueva, "fingerprint": "..." } },
      "walkingLegs": { "data": {...}, "sha256": "..." },
      "places": [ { "placeId": "...", "description": "<cuerpo>", "spokenText": "...", "metadata": { "tourImages": {...} } } ],
      "audioAssets": [ { "id": "...", "placeId": "...", "storagePath": "voxcpm2/<job>/<id>.mp3", "durationSeconds": 0, "metadata": {...} } ],
      "introductionAudio": { "id": "...", "storagePath": "...", "metadata": { "firstAudioAssetId": "...", ... } },
      "cues": [ { "id": "...", "kind": "next", "placeId": "...", "text": "...", "spokenText": "...", "storagePath": "...", "metadata": {...} } ]
    },
    "previous": { "introduction": "...", "introductionSpokenText": null, "metadata": { ...los campos que cambian... },
                  "places": [ { "placeId": "...", "description": "...", "spokenText": null, "metadata": { "tourImages": {...} } } ] }
  } ] }
```

- **Fusión de `metadata`:** el importador **nunca** sustituye `metadata` entero. Solo asigna, en primer nivel, las claves listadas en `update.metadata` (y `place.metadata.tourImages`). El resto (`sourceCredits`, `codexAuthor`, `pilotWalkingRoute`, `nameInTourLanguage`…) se conserva intacto. `previous.metadata` guarda el valor anterior **de esas mismas claves**; una clave ausente se registra como `null` para borrarla al revertir.
- **`pilotRelease` nueva:**
  - `approvalMode: 'owner-authorized'`, con `authorizationReference` copiada literalmente de `approvals.json` (§6);
  - `reviewedAt` (fecha real);
  - `changes: "Regeneración 2026-10: texto hablado normalizado; paradas independientes del orden; enlaces por destino"`;
  - `fingerprint = pilotFingerprint(tour actualizado, estado de audio actualizado)`, calculado **con el mismo código del backend**, sin reimplementarlo.
- **Audio:** se generan `audio.sha256` y `audio/` con enlaces duros a los MP3 nuevos.

## 9. `verify` (local, obligatorio antes de publicar)

### 9.1 Entorno local

- **Postgres** en contenedor (podman o docker, como en `docker-compose.dev.yml`). `pg_restore` de un `pg_dump` de producción obtenido con autorización. `DATABASE_URL` apunta a esa BD.
- **`AUDIO_STORAGE_PATH`**: un directorio con los audios actuales de producción y los nuevos. Se pueden usar enlaces duros a una copia descargada, que necesita autorización y espacio, o, como mínimo, los de la muestra.
- **Modo piloto:** `NODE_ENV=production` (o equivalente para `pilotEnabled()`), `PILOT_API_KEY` local de ≥ 32 caracteres, y `PILOT_NOTICE_FILE` apuntando a un aviso con `launchReview.acceptedForPilot: true` (formato en `deployment/pilot/notice.example.json`; lo comprueba `backend/src/config/pilotLaunch.ts:13`), para que `pilotLaunchReady` lo permita.
- **No definir nunca `LOCAL_REVIEW_TOUR_ID`:** ese modo se salta la admisión (`backend/src/api/routes/pilot.ts:40-42`) y la verificación no valdría.

### 9.2 Comprobaciones

1. Partir del estado de §8.2 (paquete aplicado en local) o reaplicar el paquete final con el **mismo** importador de §10.
2. Arrancar el backend en modo piloto contra esa BD y comprobar:
   - `/api/v1/pilot/tours` devuelve los 216 tours, menos los `excluded`, que siguen como antes;
   - cada tour pasa `admittedToPilot`;
   - todas las URL de audio, introducción y enlaces responden 200 con la `v` correcta;
   - `walking-legs` es válido;
   - en `transcripts` ya no queda ninguna frase de enlace (pasar el detector de [03](03-paradas-sin-orden.md) §5.2 sobre las `description` nuevas).
3. Frontend: `frontend/scripts/test-tour-listening.cjs` y `test-tour-entry.cjs` contra esa instancia (con las variables `PLAYWRIGHT_MODULE`, `CHROMIUM_PATH` y `BASE_URL`, porque Playwright no es dependencia del frontend), con el reproductor nuevo de [05](05-reproductor-empezar-cerca.md) si ya está listo y con el actual en cualquier caso: los dos deben funcionar (§10.3).

## 10. `publish`: importador de actualización

### 10.1 Script `remote-update.cjs` (nuevo, versionado en el repo)

1. **Precondición por tour:** la huella actual en BD es igual a `expectedCurrentFingerprint`. Si un tour cambió desde el snapshot, ese tour se omite y se informa (concurrencia optimista).
2. Hacer `pg_dump` completo antes de tocar nada.
3. Copiar el audio con `cp -al` a `shared/audio/voxcpm2/<jobId>` y **negarse si ya existe**. Comprobar `sha256sum -c audio.sha256`.
4. Se ejecuta con `/etc/tour-guide/migration.env`, porque el usuario de la app solo puede leer.
5. **Una transacción por tour:**
   - actualizar `Tour.introduction`, `introductionSpokenText` y las claves de `metadata` (fusión de §8.3);
   - actualizar `Place.description`, `spokenText` y `metadata.tourImages`;
   - insertar `AudioAsset`, `TourIntroductionAudio`, `TourCueAudio` y `TourWalkingLegs`.

   **No borrar** ningún audio ni fila antigua. Hacer `COMMIT`.
6. **Verificación tras cada tour, fuera de la transacción:** `TourAudioService` usa su propio cliente y no ve filas sin confirmar.
   - Tras el `COMMIT`, leer el tour de nuevo y comprobar `admittedToPilot` y que la huella es la esperada del paquete.
   - Si falla, aplicar **en el acto** la compensación de ese tour (bloque `previous`, la misma lógica de `--rollback`) y marcarlo como fallido.
7. **Informe final:** tours actualizados, omitidos, fallidos y compensados.

### 10.2 Orden de despliegue

1. **Backend + migración única aditiva** ([02](02-texto-hablado.md) §7.1). Es compatible con los datos actuales porque:
   - `spokenText` null usa el texto actual;
   - sin `orderFlexible` no se piden enlaces;
   - las huellas no cambian (regla de [02](02-texto-hablado.md) §7.5, comprobada con su prueba de regresión).

   **El script de release actual no basta:** `release-audio-cache-20261001.sh` solo ejecuta `tsc`. Hay que ampliarlo en un script nuevo:
   - `npx prisma generate`;
   - `npx prisma migrate deploy` con `/etc/tour-guide/migration.env`, después de un `pg_dump`;
   - `GRANT SELECT ON tour_cue_audio, tour_walking_legs TO nomuvia_app`;
   - comprobar que la API sigue sirviendo los 216 tours **antes** de cambiar `current`.
2. **Datos:** `publish`.
3. **Frontend** de [05](05-reproductor-empezar-cerca.md).

Se usa el mismo mecanismo de releases que `deployment/pilot/release-audio-cache-20261001.sh` (nueva release, cambio atómico de `current`, comprobaciones públicas y reversión automática).

### 10.3 Compatibilidad cruzada (obligatoria)

- **Frontend antiguo con datos nuevos:** reproduce los cuerpos sin enlaces y en el orden recomendado. Es aceptable.
- **Frontend nuevo con datos antiguos o tours `excluded`:** detecta la ausencia de `orderFlexible`, enlaces o `walking-legs` y se comporta como hoy, sin «empezar aquí».

## 11. `rollback`

- **`remote-update.cjs --rollback <package>`:** por tour, restaura los campos del bloque `previous` y la `pilotRelease` anterior. El audio nuevo deja de seleccionarse porque los hashes vuelven a los del texto anterior. Los ficheros nuevos se quedan en disco.
- **Último recurso:** `pg_restore` del dump del paso 2.
- **Comprobación obligatoria:** probar el rollback en el entorno local de §9 antes de publicar.

## 12. Tiempos y costes estimados

| Fase | Duración | Coste |
|---|---|---|
| snapshot + comprobación cruzada | < 30 min | — |
| neutralize (1.869 piezas) | 1–3 h | unos pocos USD con deepseek-v4-flash (calcular con las tarifas vigentes y pedir autorización) |
| speech (normalizador) + residuos | < 1 h | céntimos (solo el ~3 % de las piezas) |
| legs (~52 bases, ~2.000 geometrías) | ~40 min | — |
| revisión de la muestra por el usuario | según el usuario | — |
| render (con prueba de tiempos previa) | ~18–24 h de GPU | electricidad |
| images + stage-local + package + verify | 2–4 h (más la preparación del Postgres local) | — |
| publish | < 30 min | — |

## 13. Criterios de aceptación

- [ ] Snapshot de 216 tours coherente con la API pública.
- [ ] Muestra de Valencia (5 idiomas) aprobada por el usuario en `approvals.json`.
- [ ] Todas las piezas renderizadas y verificadas, o su tour marcado `excluded` con el motivo.
- [ ] `verify` en verde, con el rollback probado en local.
- [ ] Publicado en producción con la autorización explícita del usuario. La API pública sirve los 216 tours (menos los `excluded`, que siguen visibles con el contenido anterior).
- [ ] Informe en `resultados/04-regeneracion.md` con recuentos, tiempos, coste real, piezas excluidas y enlaces a las muestras.
