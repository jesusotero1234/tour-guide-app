# 05 · Reproductor: empezar en la parada más cercana y orden dinámico

Estado: **hecho en local** el 1 y 2 de octubre; falta probarlo en un iPhone y un Android reales; informe en [`resultados/05-reproductor.md`](resultados/05-reproductor.md) · Depende de: los contratos de API de [03](03-paradas-sin-orden.md) §5 y §7. Para desarrollar basta con fixtures; los datos reales llegan con [04](04-regeneracion-y-publicacion.md).

Todas las rutas son relativas a `frontend/src/` salvo que se indique otra cosa.

## 1. Objetivo de producto

- Quien llega de fuera sigue el orden recomendado, como hoy.
- Quien ya está en la ciudad puede **empezar en la parada que tiene más cerca**, o en cualquier otra, y la app **reordena el resto** para caminar lo menos posible.
- Con la ubicación activada, la app dice **a qué distancia está la siguiente parada** y avisa **al llegar**, sin reproducir nada automáticamente.
- Con el móvil en el bolsillo se puede pasar de parada desde la **pantalla bloqueada**.

## 2. Estado actual relevante

- **Orden:** el reproductor usa el array `tour.places` tal cual llega y la siguiente parada es `tour.places[currentIndex+1]` (`components/tour/TourExperience.tsx:72`).
  - El repositorio ya ordena por `position` (`backend/src/infrastructure/postgres/PostgresTourRepository.ts:96,158`) y `presentPilotTour` (`backend/src/services/PilotRelease.ts:119`) conserva ese orden.
  - `getTour` (`lib/api.ts:197`) no vuelve a ordenar: añadir una ordenación defensiva en el frontend.
- **Selección:**
  - `lib/tourSelection.ts` guarda en la clave `tour-selection:{tourId}` → `{kind:'introduction'} | {kind:'stop', placeId}`.
  - El progreso de escucha (`lib/tourProgress.ts`) usa la clave `tour-listening:{tourId}:{placeId|'introduction'}:{version}` → `{position, duration, completed}`.
  - `components/legal/ClearProgressButton.tsx:10` borra por prefijos con una regex: **hay que añadir ahí cualquier clave nueva**.
- **Audio:**
  - `components/tour/AudioPlayer.tsx` tiene un único `<audio preload=metadata>` (`:141`) y `src` se asigna en un efecto (`:45-101`).
  - `TourAudioPanel.tsx:98` remonta el reproductor por `segmentId+audioUrl`.
  - Media Session (`:119-126`): solo `title`, y acciones play/pause/seek. Sin anterior/siguiente.
  - Analítica: `attachAudioAnalytics` (`:36-43`, `lib/analytics.ts:120`) etiqueta el elemento con `place_id`.
- **Ubicación:**
  - `watchPosition` (`TourExperience.tsx:136-151`), solo si el usuario lo pide.
  - El botón está escondido en `<details>` «Opciones del mapa» (`:350-360`, botón en `:358`).
  - `lib/geo.ts` (haversine, `formatDistance`, `getDistanceLabel`, `getMapsUrl`) no lo importa nadie, y sus textos están en inglés.
- **Mapa:**
  - `components/tour/map/TourMap.tsx` dibuja `pilotWalkingRoute` (vía `GET /tours/:id/walking-route`, `lib/api.ts:219-245`).
  - Al pulsar un marcador solo cambia `destinationIndex` (`TourExperience.tsx:348`).
- **Proxy:** en modo piloto la lista permitida está en `lib/backendProxy.ts:14`. Las rutas de audio tienen archivos propios: `app/api/backend/tours/[id]/audio/[placeId]/route.ts` y `.../audio/introduction/route.ts`, modificados en el commit `766286f` para abortar el fetch cuando el oyente se desconecta: **copiar ese patrón**.
- **Trabajo reciente de otros:** los cambios de SEO y analítica (`TourExperience.tsx:78-98`, `AudioPlayer.tsx:36-43`, `middleware.ts`, `app/layout.tsx`, `app/tours/page.tsx`) ya están confirmados (commits `a930e58`, `4db0a30`). Partir de ellos sin reescribirlos.

## 3. Contratos nuevos

### 3.1 API

- **`GET /tours/:id/audio`** (`backend/src/api/routes/pilot.ts:100-105`) añade `cues`:
  ```ts
  cues?: {
    first: Record<string /*placeId*/, Cue>;
    next: Record<string /*placeId*/, Cue>;
    finish?: Cue;
  }
  type Cue = { text: string; audioUrl: string; version: string; durationSeconds?: number };
  ```
- **`GET /tours/:id/cue/:kind/:placeId?v=…`** y **`GET /tours/:id/cue/finish?v=…`** sirven el MP3 (409 si la `v` no coincide, como el audio de parada).
- **`GET /tours/:id/walking-legs`** devuelve `{ data: WalkingLegs }` (forma en [03](03-paradas-sin-orden.md) §7).
- **El DTO del tour** (`presentPilotTour`) expone `orderFlexible?: boolean`, tomado de `metadata.orderFlexible` y solo si es `true`. Las paradas ya llegan ordenadas por `position`.
- **Rendimiento:** los enlaces solo se calculan en `GET /tours/:id/audio`, nunca en el listado `/tours`, que es terreno del agente del catálogo ([03](03-paradas-sin-orden.md) §5.1).

### 3.2 Frontend: tipos y proxy

- `types/api.ts`: añadir `Cue`, `WalkingLegs`, `Tour.orderFlexible?` y `TourAudioState.cues?` (`lib/tourAudio.ts`).
- `lib/api.ts`: `getWalkingLegs(tourId)`, memoizado como `getWalkingRoute`. Además, `getTour` ordena `places` por `position` como medida defensiva.
- Proxy: en modo piloto la ruta comodín `app/api/backend/[...path]/route.ts` devuelve 404, así que cada endpoint nuevo necesita **su propio archivo de ruta**, además de ampliar la regex de `lib/backendProxy.ts:14`:
  - `app/api/backend/tours/[id]/walking-legs/route.ts`, copiando el de `walking-route`;
  - `app/api/backend/tours/[id]/cue/[...slug]/route.ts`, con streaming y aborto como `audio/[placeId]/route.ts`.

### 3.3 Capacidad por tour

```ts
const flexible = tour.orderFlexible === true && !!audio.cues && !!legs;
```

Si `flexible` es falso, el comportamiento es **idéntico al actual**: sin «empezar aquí» y sin enlaces. Es lo que garantiza la compatibilidad de [04](04-regeneracion-y-publicacion.md) §10.3. El backend puede apagarlo todo con `PILOT_FLEXIBLE_ORDER=off` ([04](04-regeneracion-y-publicacion.md) §10.4); el frontend no necesita ningún indicador propio.

## 4. Orden activo

### 4.1 Almacenamiento: `lib/tourOrder.ts` (nuevo)

```ts
type TourOrder = { version: 1; mode: 'recommended' | 'custom'; placeIds: string[]; startPlaceId: string; createdAt: string };
// clave: `tour-order:{tourId}:{pilotVersion}`
```

- Si la huella del tour cambia (`tour.pilot.version`), el orden personalizado se descarta.
- Añadir los prefijos `tour-order:` y `tour-location:` a la regex de `components/legal/ClearProgressButton.tsx:10`.
- Cuando no hay orden guardado, el orden activo es `recommended`, es decir, por `position`.

### 4.2 Optimizador: `lib/routeOrder.ts` (nuevo, puro y probado)

```ts
export function bestOpenPath(start: string, ids: string[], cost: (a: string, b: string) => number): string[];
```

- **Contrato:** `ids` **no** incluye `start`. El resultado es `[start, ...ids reordenados]`, de longitud `ids.length + 1`.
- Es un recorrido abierto (no vuelve al inicio) que visita todas las `ids` empezando en `start` y minimiza la suma de costes.
- **Algoritmo:**
  - N ≤ 12: Held-Karp exacto (≈ 590.000 operaciones con N = 12, inmediato);
  - N > 12 (hasta 40, el límite de validación): vecino más cercano + 2-opt.
- **Coste:** `legs.durationsSeconds[i][j]`. Si falta, haversine / 1,3 m/s × 1,3 (factor de rodeo).
- **Resultado del catálogo real** (Valencia esencial, línea recta, para la prueba): empezando en Torres de Serranos, rotar el orden original da 3,15 km y optimizar da 2,51 km. Desde la parada 1, el orden original ya es óptimo (2,70 km).

### 4.3 Reglas de reordenación

- **«Empezar en X»:** `placeIds = [...bestOpenPath(X, pendientes sin X), ...completadas]`. Las paradas ya escuchadas (`completed`) se añaden al final con la marca «ya escuchada».
- **Saltar a otra parada** desde el selector durante el paseo, cuando no es la siguiente:
  - se pregunta «¿Seguir desde aquí? Reordenaremos las paradas que faltan.», con las opciones [Sí, reordenar] y [Solo escuchar esta];
  - «Solo escuchar esta» no cambia el orden.
- **«Volver al orden recomendado»** está en el menú de información del tour.
- La reordenación **nunca** es automática.

### 4.4 Traslado del progreso al cambiar la versión del audio

La clave de progreso lleva la versión (`lib/tourProgress.ts:7`: `tour-listening:{tourId}:{placeId}:{version}`). La regeneración de [04](04-regeneracion-y-publicacion.md) cambia todas las versiones, así que, sin más, cada usuario perdería la posición y la marca «escuchada» de todas las paradas. Cambio en `lib/tourProgress.ts`:

- al leer una clave que no existe, buscar `tour-listening:{tourId}:{placeId}:*` con otra versión; si alguna tiene `completed: true`, crear la clave nueva con `{ position: 0, duration: 0, completed: true }` y borrar las antiguas de ese `placeId`;
- la posición no se traslada, porque el audio nuevo no mide lo mismo;
- prueba unitaria con `node --test`.

## 5. Experiencia

### 5.1 Ficha del tour (`components/tours/TourOverview.tsx`)

- La lista de paradas (`:60-63`, hoy `<li>` inertes) pasa a ser pulsable. Cada parada ofrece «Empezar aquí» si el tour es flexible.
- Botón secundario **«Usar mi ubicación»**, que pide permiso solo al pulsarlo:
  - si la parada más cercana está a ≤ 400 m y no es la primera, muestra la tarjeta «Estás a 150 m de Torres de Serranos (parada 3). ¿Empezar ahí?» con [Empezar ahí] y [Desde el principio];
  - si está a > 400 m, muestra «La primera parada está a 1,2 km · 15 min a pie» y [Cómo llegar].
- Se recuerda la **preferencia** de ubicación (`tour-location:v1 = 'granted'`), nunca las coordenadas, para no volver a preguntar dentro de la app.

### 5.2 Reproductor (`components/tour/TourExperience.tsx`)

- **Cabecera:** «Parada 3 de 9». El número es la posición en el **orden activo**. En modo `custom` se muestra el nombre y no el número canónico.
- **Introducción:**
  - El botón «Ir a la primera parada» (`:372`) pasa a «Ir a {nombre de la primera del orden activo}».
  - Al terminar el audio de la introducción, si el tour es flexible, suena `cues.first[firstId]`.
- **Pie «Después, sigue hacia» (`:374`):** usa el orden activo. Con ubicación, añade la distancia y el tiempo: «Torres de Serranos · 350 m · 5 min». La distancia es haversine desde la posición actual; el tiempo sale de la matriz desde la parada actual o, si no hay matriz, de la distancia / 1,3 m/s.
- **Llegada:** con ubicación activa, si la distancia a la siguiente parada del orden activo es ≤ max(35 m, precisión) en **2 lecturas seguidas**, se muestra el aviso «Has llegado a X» con [Escuchar] y una vibración corta (`navigator.vibrate?.(200)`). **No hay reproducción automática.**
- **Junto a otra parada:** si estás a ≤ 35 m de otra parada no escuchada que no es la siguiente, se muestra «Estás junto a Y. ¿Escucharla ahora?». Si aceptas, se aplica la regla de §4.3.
- **Mapa:**
  - marcadores numerados según el orden activo;
  - polilínea: en orden recomendado, `pilotWalkingRoute`; en orden personalizado, la concatenación de `legs.geometries` según el orden activo. Si falta un tramo, se dibuja una línea recta discontinua.
  - Al pulsar un marcador aparece la opción «Ver esta parada» además de la de destino (hoy solo cambia el destino, `:348`).
- **Selector de paradas** (`:304-323`): refleja el orden activo, marca las ya escuchadas e integra la pregunta de §4.3.

### 5.3 Reproducción cuerpo + enlace: un motor de audio persistente

**Por qué no basta una prop `tail` en el reproductor actual:**

- `TourAudioPanel.tsx:98` **remonta** `AudioPlayer` en cada parada, y su limpieza (`AudioPlayer.tsx:130-136`) borra la Media Session. Así `nexttrack` desde la pantalla bloqueada no es fiable.
- Al cargar otro `src`, el manejador de `loadedmetadata` (`AudioPlayer.tsx:73-76`) busca la posición guardada **del cuerpo**.
- `sync` sobrescribiría el progreso del cuerpo con el del enlace, y un error del enlace mostraría la interfaz de fallo.

**Diseño:**

1. **`hooks/useTourAudioEngine.ts`** (o un proveedor de contexto en `TourExperience`) posee **un único `<audio>` persistente** durante todo el paseo. No se remonta al cambiar de parada.
2. **Segmentos:** el motor reproduce `{ kind: 'body' | 'cue', placeId, url, version, progressKey? }`.
   - Solo los segmentos `body` restauran y guardan la posición (`lib/tourProgress.ts`, misma clave que hoy) y marcan `completed`.
   - Los `cue` no buscan posición, no guardan progreso y, si fallan, se ignoran en silencio.
3. **Al terminar un `body`:**
   1. marcar `completed`;
   2. si hay enlace (`cues.next[siguienteId]` del orden activo, `cues.finish` en la última y `cues.first[primeraId]` tras la introducción), hacer `audio.src = cue.url; audio.playbackRate = <velocidad elegida>; audio.play()` en el **mismo** elemento. Cambiar `src` restablece `playbackRate` (el mismo fallo de [06](06-ui.md) A4), así que el motor la reaplica en cada segmento.
4. **Interfaz:**
   - `AudioPlayer` pasa a ser solo presentación, leyendo el estado del motor: tiempo, duración, reproducción y error del cuerpo.
   - Durante el enlace se muestra «Siguiente: X» en lugar del tiempo.
   - «Parada escuchada» (`stop-finished`, `TourExperience.tsx:368-371`) se activa al terminar el **cuerpo**.
5. **Analítica:** el motor vuelve a etiquetar el elemento por segmento (`place_id`, `segment: 'body' | 'cue'`) para que los segundos de enlace no cuenten como escucha. Mantener los eventos actuales (`lib/analytics.ts:120`, `AudioPlayer.tsx:36-43`).
6. **Media Session:** los manejadores se registran **una vez** en el motor y solo se limpian al salir del paseo (§5.4).
7. Si el usuario pulsa «Siguiente» durante el enlace, se navega sin más.
8. **Tours no flexibles:** el mismo motor, sin enlaces, con el comportamiento actual.

**Riesgo:** es la parte más delicada del frontend. Probarla en un iPhone real (Safari) y en un Android real (Chrome), con la pantalla bloqueada, antes de darla por buena; no basta con Playwright.

### 5.4 Pantalla bloqueada (Media Session, `AudioPlayer.tsx:119-126`, que pasa al motor)

- **Metadata:** `{ title: nombre de la parada, artist: 'Nomuvia · {ciudad}', album: título del tour, artwork: [{ src: miniatura de la portada, sizes: '512x512', type: 'image/jpeg' }] }`.
- **Acciones nuevas:**
  - `nexttrack`: ir a la siguiente parada del orden activo y reproducir. Está permitido porque la acción de Media Session cuenta como gesto del usuario.
  - `previoustrack`: si van < 5 s, ir a la parada anterior; si no, volver al inicio de la parada.
- Mantener `setPositionState` (`:66-71`) solo para los segmentos `body`.

### 5.5 Textos

Todas las cadenas nuevas en los 5 idiomas, en `components/tour/listeningCopy.ts` y
`lib/mobileTourCopy.ts`. **Completar a la vez de/it en `listeningCopy.ts`**, que hoy
solo tiene 5 claves (`:79-80`, ver [06](06-ui.md)). Las distancias se formatean con
`Intl.NumberFormat(lang, { maximumFractionDigits: 1 })`: «350 m», «1,2 km».

## 6. Fixtures y pruebas

- **Fixture:** `frontend/src/fixtures/flexible-tour.json`, un tour de 4 paradas con `orderFlexible`, `cues` y `walkingLegs`, más 4 MP3 de 2 s de silencio y 9 enlaces de 1 s en `frontend/public/test-audio/`. Se sirve con un modo de desarrollo, o se intercepta en Playwright con `page.route`.
- **Unitarias** (script `.cjs` con `node --test`, como los existentes en `frontend/scripts/`):
  - `bestOpenPath`: exacto contra fuerza bruta para N ≤ 8, estable, y con N = 1 y N = 2;
  - `tourOrder`: guardado, descarte al cambiar la versión y limpieza en `ClearProgressButton`;
  - `tourProgress`: traslado de `completed` entre versiones (§4.4).
- **Playwright** (ampliar `frontend/scripts/test-tour-listening.cjs`). Playwright no es dependencia del frontend; los scripts usan las variables `PLAYWRIGHT_MODULE`, `CHROMIUM_PATH` y `BASE_URL`:
  1. Con la geolocalización simulada junto a la parada 3, aparece la tarjeta de §5.1 → «Empezar ahí» → la cabecera muestra «Parada 1 de 4 · {nombre de la 3}».
  2. Termina el cuerpo → suena el enlace correcto (`next` de la siguiente del orden activo): comprobar el `src` del `<audio>`.
  3. Simular la llegada (2 lecturas a ≤ 35 m) → aparece el aviso y no hay reproducción automática.
  4. Con un tour **no** flexible, la experiencia es igual que hoy (regresión).
  5. Recargar la página conserva el orden personalizado y la parada actual.
- **Accesibilidad:** las nuevas tarjetas y avisos usan `role="status"`; los botones miden ≥ 44 px y tienen etiquetas en los 5 idiomas.

## 7. Criterios de aceptación

- [ ] Con un tour flexible se puede empezar en cualquier parada y el resto se reordena; el orden persiste.
- [ ] Al terminar cada cuerpo suena el enlace correcto según el orden activo, y al final suena `finish`.
- [ ] Con la ubicación activa se ven la distancia y el tiempo a la siguiente parada y el aviso de llegada, sin reproducción automática.
- [ ] Desde la pantalla bloqueada funcionan siguiente y anterior, con título, ciudad y carátula.
- [ ] Los tours no flexibles funcionan exactamente como antes.
- [ ] Tras cambiar la versión del audio de un tour, las paradas ya escuchadas siguen marcadas.
- [ ] Las pruebas unitarias y de Playwright están en verde, con capturas a 390×844 y 360×740 adjuntas al informe.
- [ ] Probado en un iPhone y en un Android reales, con la pantalla bloqueada: enlace, siguiente y anterior.
- [ ] Informe en `resultados/05-reproductor.md`.
