# 03 · Paradas independientes del orden: cuerpo + enlaces

Estado: **hecho en local** el 1 de octubre; falta ejecutar la neutralización (facturable); informe en [`resultados/03-paradas-sin-orden.md`](resultados/03-paradas-sin-orden.md) · Depende de: [01](01-fase0-backend-base.md). Se programa en paralelo a [02](02-texto-hablado.md); usa su migración única (02 §7.1) y su normalizador solo para el texto hablado de los enlaces, en [04](04-regeneracion-y-publicacion.md) · Lo usan: [04](04-regeneracion-y-publicacion.md), [05](05-reproductor-empezar-cerca.md)

## 1. Problema

Si el usuario ya está en la ciudad y cerca de la parada 5, no tiene sentido mandarlo
a la 1. Pero hoy el orden está grabado en el texto y en el audio:

- Cada parada termina con una frase que nombra la siguiente. La impone el prompt
  `backend/scripts/validation/narrative-author-canary-material-v8.ts:49-51`: «Esta no es la última parada. Enlaza brevemente hacia X por su nombre…».
  - La parada siguiente se pasa en `:46-47` (`nextStop`).
  - La línea «Anterior/Siguiente» está en `:56`.
- La bienvenida recorre la ruta en orden y termina llevando a la primera parada (`narrative-tour-welcome-v8.ts:24`, «preview route in its supplied order», y `:25`, «End by leading into the first named stop»).
- El editor y el reparador exigen conservarlo (`backend/scripts/admin/editorial_runtime/prompts.py:5`, «Conserva el orden de la ruta y las transiciones por nombre»; `:9`, «Conserva navegación, nombres de próximas paradas»).
- El MP3 de cada parada incluye esa frase.

Medido el 1 de octubre de 2026 sobre el catálogo publicado (216 tours, 1.653 paradas):

| | es | en | fr | de | it |
|---|---|---|---|---|---|
| Paradas no finales | 325 | 278 | 278 | 278 | 278 |
| …última frase con fórmula detectable («La siguiente parada es», «Next stop», «Prochaine étape», «Nächste Station», «Prossima tappa», «nos espera»…) | 72 % | 83 % | 69 % | 82 % | 81 % |
| …variantes libres («Continuamos en X», «Ahora vamos hacia X», «Il nous reste X», «Camminando verso l'Arena, tieni a mente…») | 28 % | 17 % | 31 % | 18 % | 19 % |
| Paradas que nombran otra parada en el cuerpo (casi siempre contexto válido: «la otra puerta, las Torres de Quart») | ~10 % | ~10 % | ~10 % | ~10 % | ~10 % |
| Referencias explícitas «en la parada anterior…» | 2 | 2 | 1 | 1 | 1 |
| Introducciones que dicen dónde se empieza («donde empezamos», «Nuestra primera parada es…») | 18/52 | 19/41 | ~41/41 | ~39/41 | ~33/41 |
| Última parada con cierre del recorrido («Terminamos aquí el recorrido») | 38/52 | 18/41 | 24/41 | 13/41 | 23/41 |

Conclusiones:

- El acoplamiento está casi todo en **la última frase**, la introducción y el cierre final.
- No basta una expresión regular para separarlo (entre el 17 % y el 31 % son variantes) → hace falta una pasada LLM con guardas para el contenido publicado (§6).
- Para tours nuevos basta cambiar los prompts (§4).

## 2. Decisiones (no reabrir sin el usuario)

1. **Una parada = cuerpo + enlace.**
   - El **cuerpo** es el texto y audio de la parada, sin referencias al orden.
   - El **enlace** es un clip corto que solo nombra el destino.
2. **Los enlaces dependen del destino, no del origen**, así que hay un clip por parada de destino. Por tour e idioma:
   - `first:<placeId>`: «Primera parada: X.», tras la introducción;
   - `next:<placeId>`: «Siguiente parada: X.», tras el cuerpo de cualquier otra parada;
   - `finish`: cierre del paseo.

   Total: 2N+1 clips por tour (media 7,65 paradas → ~16 clips de 2–3 s).
3. **Los enlaces salen de plantillas por idioma (§3), sin LLM.** El formato «Etiqueta: Nombre» evita los problemas de artículo y género («hacia el Palacio…», «zur Frauenkirche»). Es determinista y no necesita revisión editorial. Se admite un texto de enlace editorial opcional por parada (`override`), que al principio no se usará.
4. **El texto de pantalla de la parada es el cuerpo.** La pestaña «Leer» ya no muestra «La siguiente parada es X»; la interfaz ya enseña «Después, sigue hacia X».
5. **La introducción es neutra:** presenta la ciudad y el conjunto de lugares, sin decir por cuál se empieza. A continuación suena `first:<placeId>`.
6. **El orden lo decide el reproductor** ([05](05-reproductor-empezar-cerca.md)) con una matriz de tiempos a pie precalculada (§7). El orden actual pasa a ser el «orden recomendado».
7. **Sin direcciones de giro** («gira a la izquierda»), como hasta ahora. La navegación es el mapa y «Abrir en Mapas».

## 3. Plantillas de enlace

Viven en **un único archivo de datos**, `backend/src/services/tour-cue-templates.json`
(`{ "<lang>": { "first": "...", "next": "...", "finish": "..." } }`), que leen tanto
TypeScript (`backend/src/services/TourCues.ts`, que exporta `cueText(kind, lang, name)`)
como Python, sin copias. `{name}` es `place.nameInTourLanguage ?? place.name`
(`nameInTourLanguage` se guarda en `Place.metadata`, `PostgresTourRepository.ts:64,138`).

| | first | next | finish |
|---|---|---|---|
| es | Primera parada: {name}. | Siguiente parada: {name}. | Aquí termina el paseo. Gracias por caminar con nosotros. |
| en | First stop: {name}. | Next stop: {name}. | This is the end of the walk. Thank you for walking with us. |
| fr | Première étape : {name}. | Prochaine étape : {name}. | C'est la fin de la promenade. Merci de nous avoir accompagnés. |
| de | Erste Station: {name}. | Nächste Station: {name}. | Hier endet der Spaziergang. Danke, dass du dabei warst. |
| it | Prima tappa: {name}. | Prossima tappa: {name}. | Qui finisce la passeggiata. Grazie per averci accompagnato. |

- Las narraciones alemanas tutean, por eso «du».
- **El usuario debe validar estos textos** antes del render (§8). Están en un solo sitio para poder cambiarlos sin tocar código.
- El texto del enlace pasa por el normalizador y la puerta de [02](02-texto-hablado.md); los nombres pueden llevar romanos, como «Puerta de Carlos III».

## 4. Contrato editorial para tours nuevos (pipeline de lote)

### 4.1 Reglas

- **Cuerpo de parada:**
  - se entiende solo, en cualquier orden;
  - no nombra la parada siguiente ni la anterior **como tales**;
  - no usa «siguiente», «anterior», «próxima parada», «más adelante veremos», «como vimos en», «terminamos aquí», «donde empezamos» ni sus equivalentes;
  - puede mencionar otros lugares (también otras paradas) como contexto histórico.
- **Introducción:** presenta la ciudad y el hilo del paseo; puede nombrar los lugares como conjunto, sin decir cuál va primero ni enumerarlos en orden de visita; no termina «llevando» a ninguna parada.
- **Última parada:** sin cierre del recorrido (lo pone el clip `finish`).

### 4.2 Cambios concretos

- **Lo que liga `text-inputs-lock.json`** (`deepseek-batch-text.py:636-639`): `combined-prompt.md` e `inputs.json`.
  - Cambiar los prompts de autor o de bienvenida (que acaban en `combined-prompt.md`) obliga a usar un directorio de ciudad nuevo.
  - `editorial_runtime/prompts.py` **no** está ligado: editarlo cambiaría en silencio los lotes que se reanuden.
- **Antes de tocar `prompts.py`:** añadir su sha256 al lock (y al recibo de fase), de modo que un lote antiguo se niegue a reanudar con prompts distintos.

| Archivo | Cambio |
|---|---|
| `backend/scripts/validation/narrative-author-canary-material-v8.ts:46-47` | Dejar de pasar `nextStop` al material de la parada. |
| `backend/scripts/validation/narrative-author-canary-material-v8.ts:49-51` | Sustituir `ending` por: «Esta parada debe poder escucharse en cualquier orden. No nombres la parada anterior ni la siguiente, no anuncies adónde vamos y no cierres el recorrido. Puedes mencionar otros lugares solo como contexto histórico.» Lo mismo para la última parada. |
| `…canary-material-v8.ts:56` | Quitar la línea «Anterior/Siguiente», o dejarla como contexto con «no la menciones como siguiente/anterior». Recomendado: quitarla. |
| `backend/scripts/validation/narrative-tour-welcome-v8.ts:24-25` | Sustituir «preview route in its supplied order» y «End by leading into the first named stop» por: «Presenta la ciudad y el hilo del paseo. Puedes nombrar los lugares como conjunto, sin indicar cuál es el primero ni seguir el orden de visita. No termines llevando a ninguna parada.» |
| `backend/scripts/admin/editorial_runtime/prompts.py:3,5,7,9` | Primero, ligar su sha al lock (ver arriba). Después, sustituir las instrucciones que conservan transiciones y navegación por: «Cada parada debe entenderse en cualquier orden: elimina menciones a la parada siguiente o anterior, cierres del recorrido y anuncios de lo que veremos después; conserva el contenido.» |
| `backend/scripts/admin/deepseek-batch-text.py:297,304` (`build_case`) | Dejar de pasar `nextPieceId`. `routeOrder` puede quedarse como contexto. |
| `deepseek-batch-text.py` (revisión) | Añadir el detector de §5.2 como comprobación. Si encuentra algo, va a reparación y, si persiste, la pieza no se acepta. |

## 5. Modelo de datos y detector

### 5.1 Persistencia (migración Prisma aditiva)

Se añade el modelo `TourCueAudio` en `backend/prisma/schema.prisma`, **dentro de la
migración única de [02](02-texto-hablado.md) §7.1**, siguiendo la pauta de
`TourIntroductionAudio` (`:68-82`). También se añade la relación inversa
`cueAudios TourCueAudio[]` en `Tour`.

```prisma
model TourCueAudio {
  id              String   @id @default(uuid()) @db.Uuid
  tourId          String   @map("tour_id") @db.Uuid
  kind            String   // 'first' | 'next' | 'finish'
  placeId         String?  @map("place_id") @db.Uuid   // null solo para 'finish'
  language        String
  text            String   // texto de pantalla (plantilla rellena)
  spokenText      String   @map("spoken_text")
  format          String   @default("mp3")
  storagePath     String   @map("storage_path")
  durationSeconds Float?   @map("duration_seconds")
  metadata        Json     @default("{}")   // { rendererKey, sourceHash, fileSha256, identity, speechVersion }
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @default(now()) @updatedAt @map("updated_at")
  tour            Tour     @relation(fields: [tourId], references: [id], onDelete: Cascade)
  @@index([tourId, kind, placeId])
  @@map("tour_cue_audio")
}
```

- **Ids:**
  - `id` y el `<jobId>` de `storagePath` (`voxcpm2/<jobId>/<id>.mp3`) son **UUID**, porque `TourAudioService.ts:123` valida la ruta y `tour_audio_input.py:123` valida los ids;
  - `version = sourceHash + '.' + fileSha256`, en hexadecimal; debe casar con `[a-f0-9.]+`, como el audio de parada.
- **Selección del clip vigente:** el más reciente cuyo `rendererKey` y `sourceHash` (= sha(lang + rendererKey + spokenText)) coincidan, igual que `TourAudioService.assets()` (`:113-129`).
- **Rendimiento:** el listado `/tours` ya provocó el incidente del 1 de octubre, y `released()` (`pilot.ts:35-63`) valida los 216 tours en **cada** petición del listado, sin caché (descartada por diseño, `docs/operations/nomuvia-catalogo-lento-20261001.md`). Por eso la admisión y la huella **no consultan `TourCueAudio`**:
  - el importador escribe en `Tour.metadata.cueManifest` la lista ordenada por (kind, placeId) de `{kind, placeId, text, version}` (`version = sourceHash + '.' + fileSha256`; ~2 KB por tour), en la misma transacción que las filas;
  - `validatePilotMaterial` y `pilotFingerprint` leen solo el manifiesto, que ya viene con el tour, como hoy `pilotWalkingRoute` y `tourImages`;
  - `TourAudioService.cues(tourId)` (solo en `GET /tours/:id/audio`) lee las filas, descarta las que no casen con el manifiesto y verifica el archivo con la caché por inodo del commit `766286f`; `GET /cue/...` comprueba `v` contra el manifiesto antes de servir;
  - la latencia del listado se mide en [04](04-regeneracion-y-publicacion.md) §8.2 y §9.2, con un presupuesto de +30 % sobre la línea base.
- **`TourAudioService`:** nuevo método `cues(tourId)` que devuelve `{ first: Record<placeId, Cue>, next: Record<placeId, Cue>, finish?: Cue }` con `Cue = { text, audioUrl, version, durationSeconds }`.
  - Solo lo usa `GET /tours/:id/audio`; `get()` y el listado no.
  - La URL es `/api/backend/tours/:id/cue/:kind/:placeId?v=…` y, para `finish`, `/cue/finish?v=…`.
- **`PilotRelease.pilotFingerprint`:** añadir **solo si existen** (regla de [02](02-texto-hablado.md) §7.5, para no cambiar las huellas heredadas):
  - `orderFlexible: true`;
  - `cues`: `metadata.cueManifest` tal cual (lista ordenada por (kind, placeId) de `{kind, placeId, text, version}`), sin consultar `TourCueAudio`;
  - `walkingLegsSha256`: `metadata.walkingLegsSha256` (§7), sin consultar `TourWalkingLegs`.
- **`validatePilotMaterial`:** si el tour declara `metadata.orderFlexible === true`, exigir en `metadata.cueManifest` el conjunto completo de clips (N `first`, N `next`, 1 `finish`, cada uno con `version` y `text` no vacíos) y `metadata.walkingLegsSha256` presente. La validación profunda de los tramos (§7) se hace al servirlos y en `verify` ([04](04-regeneracion-y-publicacion.md) §9), no en el listado. Si no lo declara, el tour sigue siendo válido con el comportamiento actual, lo que permite una migración gradual por tour.

### 5.2 Detector de referencias al orden

Archivo: `backend/scripts/admin/editorial_runtime/order_neutral.py`. Lo comparten el
pipeline de lote y la migración (§6).

```python
def find_order_references(text: str, lang: str, *, stop_names: list[str], role: str) -> list[Finding]
# role: 'stop' | 'last_stop' | 'introduction'
# Finding = {kind, sentence_index, match}
```

Tipos y patrones iniciales, ampliables con los ejemplos del snapshot:

- `NEXT_STOP`:
  - **es:** `siguiente parada`, `próxima parada`, `nuestra siguiente`, `nos espera`, `seguimos hacia`, `continuamos (en|hacia)`, `ahora vamos hacia`, `vamos (ahora )?a`
  - **en:** `next stop`, `we('ll)? (now )?head`, `awaits us`, `we continue (to|toward)`, `further on, the tour`, `we still have`
  - **fr:** `prochaine (étape|halte)`, `nous attend`, `nous continuons vers`, `il nous reste`, `le parcours nous mènera`
  - **de:** `nächste (Station|Halt)`, `erwartet uns`, `weiter (zu|zur|zum)`, `führt uns der Rundgang`, `es bleibt uns`
  - **it:** `prossima (tappa|fermata)`, `ci aspetta`, `proseguiamo`, `camminando verso`
  - Además, en cualquier idioma: la **última frase** nombra la parada siguiente del orden canónico.
- `PREVIOUS_STOP`:
  - **es:** `parada anterior`, `como (ya )?(vimos|hemos visto)`, `acabamos de (ver|dejar)`, `después de la parada anterior`
  - **en:** `previous stop`, `as we (saw|have seen)`, `what we saw at`
  - **fr:** `étape précédente`, `comme nous l'avons vu`
  - **de:** `vorherigen Station`, `wie wir gesehen haben`
  - **it:** `tappa precedente`, `come abbiamo visto`
- `FINISH` (solo `last_stop`):
  - **es:** `terminamos`, `termina (aquí|el recorrido)`, `final del recorrido`, `llegas al final`
  - **en:** `we end`, `ends here`, `end of (the|our) (tour|walk)`
  - **fr:** `nous terminons`, `se termine ici`, `fin de (la|notre) (visite|promenade|balade|parcours)`
  - **de:** `endet hier`, `Ende (des|unseres) (Rundgangs|Spaziergangs)`
  - **it:** `terminiamo`, `finisce qui`, `fine del (percorso|giro)`, `concludiamo`
- `START` (solo `introduction`):
  - **es:** `donde empezamos`, `empezamos (en|por)`, `nuestra primera parada`, `comenzamos`
  - **en:** `we (start|begin)`, `our first stop`
  - **fr:** `nous commençons`, `première étape`, `commençons`
  - **de:** `wir beginnen`, `erste Station`, `beginnen wir`
  - **it:** `cominciamo`, `iniziamo`, `partiamo`, `prima tappa`
  - Además, cualquier enumeración ordenada de las paradas («primero…, luego…, después…»).

## 6. Migración del contenido publicado: pasada de neutralización

La ejecuta la herramienta de [04](04-regeneracion-y-publicacion.md) (`neutralize`).
**Es facturable y cambia texto publicado: requiere autorización del usuario y una
muestra revisada antes del lote completo.**

### 6.1 Alcance

- 1.653 paradas.
- 216 introducciones.
- 5 idiomas, cada uno por separado: no se retraduce, porque las traducciones ya están revisadas.

### 6.2 Contrato con el LLM: solo ediciones, nunca el texto completo

Entrada por pieza:

```json
{ "language": "es", "role": "stop|last_stop|introduction",
  "placeName": "Torres de Serranos", "otherStops": ["Plaza de la Virgen", "..."],
  "findings": [ {"kind":"NEXT_STOP","sentence_index":31,"match":"La siguiente parada es"} ],
  "text": "<texto completo actual>" }
```

Prompt (borrador):

> Este texto es una parada de un paseo con audio. A partir de ahora las paradas pueden escucharse en cualquier orden. Devuelve SOLO las ediciones mínimas para que el texto no dependa del orden: elimina la frase que anuncia la siguiente parada; elimina o reformula las referencias a la parada anterior o posterior, los cierres del recorrido y, en la introducción, la indicación de por dónde se empieza o el orden de visita. Conserva todo lo demás palabra por palabra. Si una frase mezcla contenido valioso con el anuncio, reformúlala conservando el contenido. Formato JSON: `{"edits":[{"before":"<fragmento literal del original>","after":"<sustitución, puede ser vacía>","reason":"NEXT_STOP|PREVIOUS_STOP|FINISH|START"}]}`.

### 6.3 Guarda determinista (todas obligatorias)

1. Cada `before` aparece **exactamente una vez** en el original.
2. Aplicar las ediciones en orden produce el `body`. Se normalizan los espacios y los párrafos vacíos que queden.
3. Caracteres eliminados o cambiados ≤ max(400, 15 % del original).
4. `find_order_references(body) == []`.
5. Al menos el 85 % de las frases del original sigue presente, idéntico, en el `body`.
6. El `body` no queda vacío y el último párrafo conserva contenido (no solo un cierre).
7. Si se incumple alguna, se reintenta hasta 2 veces con el motivo. Si sigue fallando, la pieza pasa a `needs_manual`, y su tour no se publica en la regeneración: se queda con el contenido actual y en orden fijo.

### 6.4 Salida

`neutral/<tourId>.json`:

```json
{ "pieces": [ { "pieceId": "<placeId>|introduction", "role": "...", "original": "...",
  "body": "...", "edits": [...], "findingsBefore": [...], "status": "ok|needs_manual",
  "model": "...", "attempts": 1 } ] }
```

### 6.5 Imágenes

`place.metadata.tourImages` va ligado al texto:

- `sourceText` debe ser igual a `description` (`PilotRelease.ts:55`);
- cada imagen apunta a `paragraphIndex` y `paragraphText`.

La herramienta de [04](04-regeneracion-y-publicacion.md) recalcula `sourceText`,
reasigna `paragraphIndex` por coincidencia de `paragraphText` y, si un párrafo cambió,
lo asigna al más parecido. Hay lógica reutilizable en
`backend/scripts/admin/backfill-published-tour-images.cjs`.

### 6.6 Coste y revisión

- **Coste:** solo se devuelven ediciones. Unos 5,1 M de caracteres de entrada (~1,5 M tokens) y salida pequeña. Con `deepseek-v4-flash` es del orden de unos pocos dólares; calcular el presupuesto exacto con las tarifas vigentes antes de pedir autorización.
- **Muestra obligatoria:** 1 ciudad × 5 idiomas (Valencia, recomendada porque el usuario la conoce). El usuario la revisa con el paquete de revisión de [04](04-regeneracion-y-publicacion.md) antes del lote.

## 7. Matriz de caminata y tramos

El reproductor necesita costes y geometría entre **cualquier** par de paradas.

### Cálculo

Lo hace la herramienta de [04](04-regeneracion-y-publicacion.md), subcomando `legs`.

- **Por ruta base:** las versiones por idioma de un tour comparten paradas y coordenadas. Los 216 tours publicados son ~52 rutas base (41 generales + 11 temáticas). `seoInventory` tiene más entradas porque incluye rutas no publicadas.
- **Peticiones:** una petición `/route` a pie del router FOSSGIS OSRM por cada par no ordenado (≤ 45 por base con N ≤ 10; ~2.000 en total), a ≤ 1 petición/s, con caché en disco y reintentos.
  - Cada respuesta trae duración, distancia y geometría, así que `/table` es opcional.
  - `backend/src/services/WalkingRouteService.ts` solo llama a `/route` y devuelve GeoJSON: reutilizarlo y añadir la codificación polyline (precisión 5) en la herramienta.
- **Validación:** la geometría del orden recomendado debe coincidir con `metadata.pilotWalkingRoute`, con un 10 % de tolerancia en distancia.

### Almacenamiento

**Fuera de la fila del tour**, para no inflar las lecturas del listado. Tabla
`TourWalkingLegs`, en la migración única de [02](02-texto-hablado.md) §7.1:

```prisma
model TourWalkingLegs {
  tourId    String   @id @map("tour_id") @db.Uuid
  data      Json     // forma de abajo
  sha256    String   // huella canónica (ver abajo)
  createdAt DateTime @default(now()) @map("created_at")
  tour      Tour     @relation(fields: [tourId], references: [id], onDelete: Cascade)
  @@map("tour_walking_legs")
}
```

```json
{ "version": 1, "provider": "FOSSGIS/OSRM foot", "computedAt": "...",
  "stopIds": ["<placeId>", ...],
  "durationsSeconds": [[0, 210, ...], ...],
  "distancesMeters": [[0, 260, ...], ...],
  "geometries": { "<idA>|<idB>": "<polyline codificada, precisión 5, sentido A→B>" } }
```

- Una clave por par no ordenado, con `idA < idB` en orden lexicográfico. La geometría B→A es la inversa de A→B.
- Los ids son los de las paradas de **ese** tour: se mapean desde la ruta base.
- **Huella canónica:** `sha256` de `JSON.stringify` con claves ordenadas de `{version, stopIds, durationsSeconds, distancesMeters, geometries}`. Se excluyen `provider` y `computedAt`, para que un recálculo idéntico no cambie la huella.

### Validación, API y huella

- **`validWalkingLegs(data, tour.places)`:**
  - matriz cuadrada N×N con diagonal 0 y valores finitos ≥ 0;
  - `stopIds` igual al conjunto de ids de las paradas;
  - todas las geometrías de pares presentes y decodificables;
  - `sha256` recalculado coincide.
- **Backend:** `GET /tours/:id/walking-legs` en `backend/src/api/routes/pilot.ts`, junto a `walking-route` (`:93-99`), con la misma comprobación `released()`. Es el **único** lector de `TourWalkingLegs`: carga la fila, comprueba que su `sha256` coincide con `metadata.walkingLegsSha256` y, si no, responde 503 `WALKING_LEGS_UNAVAILABLE`.
- **Frontend:** en modo piloto la ruta comodín `app/api/backend/[...path]/route.ts` devuelve 404. Hace falta un **archivo de ruta propio**, `frontend/src/app/api/backend/tours/[id]/walking-legs/route.ts`, copiando el de `walking-route`, además de ampliar la regex de `frontend/src/lib/backendProxy.ts:14`.
- **Huella:** `Tour.metadata.walkingLegsSha256`, copia del `sha256` de la fila que el importador escribe en la misma transacción, entra en `pilotFingerprint` solo si existe. Así la admisión y la huella no consultan la tabla (§5.1).

## 8. Pruebas y aceptación

- **Pruebas unitarias del detector:** cada patrón con un ejemplo positivo y otro negativo, incluyendo los ejemplos reales de §1.
- **Prueba de la guarda de §6.3** con ediciones inválidas: `before` inexistente, `before` duplicado, recorte excesivo, ediciones que dejan referencias.
- **Pruebas de `TourAudioService.cues()`** y de `validatePilotMaterial` con `orderFlexible` en `true` o `false`.
- **Corpus de los prompts nuevos:** 1 ciudad nueva generada de punta a punta con el detector en verde (cuando se generen tours nuevos).

Criterios de aceptación:

- [ ] Plantillas de enlace validadas por el usuario.
- [ ] Modelos incluidos en la migración única y aplicados en local. API `cues` y `walking-legs` con pruebas, incluidas las rutas propias del proxy del frontend.
- [ ] Prueba de regresión: un tour sin `orderFlexible`, enlaces ni tramos mantiene byte a byte su huella actual.
- [ ] `admittedToPilot` de un tour flexible no hace ninguna consulta a `TourCueAudio` ni a `TourWalkingLegs` (prueba con un cliente Prisma simulado que falle si se consultan).
- [ ] Informe en `resultados/03-paradas-sin-orden.md`.
- [ ] Prompts de lote cambiados y detector integrado en la revisión.
- [ ] Detector, guarda y prompt de neutralización implementados como módulos que usa [04](04-regeneracion-y-publicacion.md), y probados con los ejemplos reales de §1, descargados de la API pública. La muestra de Valencia y su aprobación se hacen dentro de 04 (§5–§6).
