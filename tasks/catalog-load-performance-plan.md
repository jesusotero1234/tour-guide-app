# Plan: carga más rápida del catálogo y de la ficha de tour

## 1. Contexto y alcance

- Fecha: 2026-10-02. Rama de trabajo actual: `plan/20261001-fase0` (tiene muchos
  cambios sin commitear que NO forman parte de este plan; no tocarlos ni
  revertirlos).
- Objetivo: que `/tours` (catálogo) y `/tours/[id]` (ficha) carguen más rápido y
  con menos saltos visuales. El cuello de botella principal está en el backend,
  no en el frontend.
- Estado: **pendiente de ejecución**.
- Modo de producción relevante: **pilot** (`pilotEnabled()` = true). El frontend
  llama a `/api/backend/tours…` (route handlers de Next) → `proxyBackend` →
  backend `GET /api/v1/pilot/tours…`. El router no-pilot (`tours.ts`) no se toca.
- Fuera de alcance: cambiar el diseño, el contenido, la lógica de admisión al
  piloto (`admittedToPilot`, `released`), la autenticación, o las rutas de audio.

### Diagnóstico (ya verificado leyendo el código)

| # | Problema | Dónde |
|---|----------|-------|
| 1 | `GET /pilot/tours` carga los candidatos y luego, **en serie**, llama a `released(id)` por cada uno. `released` vuelve a hacer `tours.findById` (el tour ya está cargado), `bases.isCurrent`, `bases.findById` y `audio.get`. ~4 consultas × N tours, secuenciales. | `backend/src/api/routes/pilot.ts:83-99` y `:47-75` |
| 2 | Ese cálculo completo se repite en **cada página**: el endpoint calcula todo el catálogo y luego hace `slice(offset, offset+limit)`. | `pilot.ts:99` |
| 3 | El frontend pide páginas de 50 en bucle hasta agotar (mínimo 2 peticiones si hay ≥50 tours, y siempre ≥1 vuelta extra cuando el total es múltiplo de 50). | `frontend/src/components/tours/ToursList.tsx:30-50` |
| 4 | Nada se cachea: `proxyBackend` usa `cache: 'no-store'` + `Cache-Control: private, no-store`; el router pilot también fuerza `private, no-store`. | `frontend/src/lib/backendProxy.ts`, `pilot.ts:39` |
| 5 | La ficha es `'use client'` y pide el tour en `useEffect`: el usuario ve el esqueleto de `loading.tsx`, luego el texto "Cargando…", luego el contenido (dos estados de carga distintos). | `frontend/src/app/tours/[id]/page.tsx` |
| 6 | Las fotos de portada son `<img loading="lazy">` sin `fetchpriority`, sin `width/height`. La primera tarjeta (lo más visible) también va en lazy. | `frontend/src/components/tour/TourPhoto.tsx:43-48`, `TourCover.tsx` |

## 2. Reglas de ejecución

- Cambio mínimo suficiente por fase. No refactorizar lo que no se pide.
- Cada fase se valida de forma independiente antes de pasar a la siguiente.
- No commitear ni hacer push: el usuario decide. Dejar los cambios en el worktree.
- Medir **antes y después** de la fase 1 (ver §3.0). Si el "antes" ya es < 150 ms
  con el catálogo real, avisar y preguntar antes de seguir: el diagnóstico
  estaría mal y las fases 1-2 no merecerían la pena.
- Al terminar cada fase, escribir un resumen breve: qué cambió, medidas, tests.

## 3. Fases

### 3.0 Medición base (obligatoria, sin cambios de código)

1. Arrancar backend y frontend en local con el modo piloto activo (ver
   `docs/preview-local.md` y `run-dev.sh`). Si no se puede arrancar la BD real,
   decirlo y medir con la que haya.
2. Medir con `curl -w '%{time_total}\n' -o /dev/null -s -H "X-API-Key: $PILOT_API_KEY"
   "http://localhost:3001/api/v1/pilot/tours?language=es&limit=50&offset=0"`
   5 veces; anotar mediana. Repetir con `offset=50`.
3. Medir también `GET /tours/:id` de un tour publicado.
4. Anotar el número de tours publicados (campo `total` de la respuesta).
5. Guardar las cifras en `tasks/catalog-load-performance-todo.md` (crearlo).

### Fase 1 — Backend: `GET /pilot/tours` deja de hacer N×4 consultas en serie

Archivo: `backend/src/api/routes/pilot.ts` (único archivo a editar en esta fase,
más un test nuevo o ampliado en `pilot.test.ts`).

Cambios:

1. **Reutilizar el tour ya cargado.** Extraer de `released(id)` la parte que
   trabaja sobre un `Tour` ya en memoria: nueva función interna
   `releasedTour(tour: Tour)` con el mismo cuerpo desde `if (localReviewIds && tour.status === 'published')`
   en adelante. `released(id)` pasa a ser: validar uuid y `localReviewIds`,
   `findById`, y delegar en `releasedTour`. El comportamiento de `released(id)`
   (usado por `/tours/:id` y el resto de rutas) **no cambia**.
2. **Paralelizar en la lista.** En `router.get('/tours')`, sustituir el `for…await`
   por `Promise.all(candidates.map(releasedTour))` y filtrar los `null`.
   Conservar el orden de `candidates` (Promise.all lo garantiza).
   - Añadir un límite de concurrencia simple (p. ej. lotes de 10 con un bucle
     sobre `chunks`) para no abrir N conexiones a Postgres/disco a la vez. No
     añadir dependencias nuevas (`p-limit` etc.).
3. **Caché en memoria del catálogo admitido.** Mantener dentro de
   `createPilotRouter` un `Map<string, { at: number; admitted: PresentedTour[] }>`
   indexado por la clave de filtros (`JSON.stringify` de `filters` ordenado).
   TTL: 60 s, configurable con `PILOT_CATALOG_CACHE_MS` (0 desactiva). La
   paginación (`slice`) se aplica **sobre el resultado cacheado**, así `offset=50`
   no recalcula nada.
   - No cachear cuando `localReviewIds` está definido (modo revisión local: el
     revisor quiere ver cambios al instante).
   - Comentario en el código explicando por qué la caché es segura: `released`
     solo admite tours con `pilotRelease.status === 'approved'` y fingerprint
     vigente; publicar un tour nuevo tarda como mucho 60 s en aparecer.
   - **No cachear `/tours/:id`**: una ficha debe reflejar el estado al momento
     (y es una sola llamada barata).
4. `audio.get(id, true)` se llama hasta tres veces en caminos distintos de
   `released`; no cambiar eso en esta fase (cada camino es excluyente).

Criterios de aceptación:

- `GET /pilot/tours` devuelve exactamente los mismos tours, en el mismo orden,
  que antes (comprobar con un `diff` de las respuestas JSON antes/después con
  la BD local).
- Segunda llamada con los mismos filtros dentro de 60 s: no se invoca
  `tours.list` ni `audio.get` (test con mocks en `pilot.test.ts`:
  contar llamadas).
- Con `PILOT_CATALOG_CACHE_MS=0` cada llamada recalcula (test).
- `offset=50` sobre un catálogo cacheado no dispara consultas (test).
- Medida: tiempo del `curl` de §3.0 reducido de forma clara; anotar cifras.

Validación:

```bash
cd backend && npx jest src/api/routes/pilot --silent
cd backend && npm run typecheck
cd backend && npx eslint src/api/routes/pilot.ts
```

### Fase 2 — Frontend: una sola petición para el catálogo

Archivos: `frontend/src/components/tours/ToursList.tsx`,
`frontend/src/lib/api.ts`, y `backend/src/api/routes/pilot.ts` (solo la
constante de límite).

Cambios:

1. Backend: subir el máximo de `limit` en `/pilot/tours` de 50 a 200. Actualizar
   el test de `INVALID_PAGINATION` si comprueba el valor 51.
2. `listTours` en `api.ts`: devolver también `total` (`{ tours, total }`) sin
   romper a otros llamadores: buscar usos con `grep -rn "listTours(" frontend/src`
   y adaptar cada uno (se espera que solo sea `ToursList`).
3. `ToursList.tsx`: sustituir el bucle de páginas por **una** petición con
   `limit: 200`. Si `total > tours.length`, pedir el resto en un segundo bucle
   (mantener el comportamiento correcto por si el catálogo supera 200); en la
   práctica debe ser una sola llamada. Eliminar la deduplicación por `Set` si
   ya no hace falta.
4. Quitar los `console.log` de `listTours`/`getTour` en `api.ts` (ruido en
   producción, y el log del listado serializa `params` en cada llamada).

Criterios de aceptación:

- En la pestaña Network del navegador, cargar `/tours` genera **una** llamada a
  `/api/backend/tours?…`.
- Cambiar de idioma en el selector sigue recargando el listado y muestra los
  tours del nuevo idioma.
- `npm run lint` y `npx tsc --noEmit` en `frontend` sin errores nuevos.

### Fase 3 — Ficha `/tours/[id]`: datos desde el servidor, sin doble "Cargando"

Archivos: `frontend/src/app/tours/[id]/page.tsx` (convertir en Server
Component), nuevo `frontend/src/components/tours/TourDetailClient.tsx` (lo que
hoy es el cuerpo cliente), `frontend/src/lib/pilotServer.ts` (ver si ya ofrece
una función para pedir un tour al backend desde el servidor; si existe,
reutilizarla; si no, añadir `fetchTourServer(id)` que use la misma base URL y
clave que `proxyBackend`, con `cache: 'no-store'`).

Cambios:

1. `page.tsx` pasa a ser `async`, lee `params.id` y `searchParams.listen`,
   llama al backend **desde el servidor** y renderiza
   `<TourDetailClient tour={tour} listen={listen} />`. Si el backend devuelve
   404 → `notFound()`. Si falla (5xx/red) → renderizar el estado de error actual
   con el botón de reintento (ese botón puede hacer `router.refresh()`).
2. `TourDetailClient` recibe el tour por props, hace `setTour(tour)` en el
   store de Zustand en un `useEffect` (mismo efecto que hoy) y decide entre
   `TourExperience` y `TourOverview` igual que ahora. Desaparece el estado
   "Cargando…" de texto: el único estado de carga es `loading.tsx` (esqueleto).
3. Comprobar que `TourExperience` y `TourOverview` no dependen de que el tour
   llegue "después" del primer render (buscar `useEffect` con `[tour]` que
   asuman un `null` previo; con `key={tour.id}` ya se remontan).
4. Mantener `export const dynamic = 'force-dynamic'` del layout raíz: la ficha
   debe ser siempre fresca (admisión al piloto puede cambiar).

Criterios de aceptación:

- Al abrir `/tours/<id>` con la red limitada ("Slow 3G" en DevTools) se ve el
  esqueleto y después directamente la ficha; nunca el texto "Cargando…".
- `/tours/<id>?listen=1` abre el reproductor como antes.
- Un id inexistente muestra 404 de Next.
- Navegar de `/tours` a una ficha y volver atrás conserva el funcionamiento del
  botón "← Todas las rutas".
- El HTML inicial (`curl -s http://localhost:3000/tours/<id> | grep -c "<h1"`)
  contiene el título del tour (prueba de SSR real).

### Fase 4 — Imágenes de portada

Archivos: `frontend/src/components/tour/TourPhoto.tsx`,
`frontend/src/components/tours/TourCover.tsx`,
`frontend/src/components/tours/ToursList.tsx`.

Cambios:

1. `TourPhoto` acepta `priority?: boolean`. Con `priority`, el `<img>` del
   render principal usa `loading="eager"` y `fetchPriority="high"`; sin él,
   sigue en `lazy`. El `<img>` del modal no cambia.
2. `TourCover` acepta y propaga `priority`.
3. `ToursList` pasa `priority` solo a la **primera** tarjeta visible
   (`index === 0`). `TourOverview` (ficha) pasa `priority` a su portada.
4. Evitar saltos de layout: comprobar en `MobileTours.css` que `.tour-cover`
   tiene `aspect-ratio` fijo; si no, añadirlo (valor coherente con el diseño
   actual, no cambiar el aspecto visible).
5. No añadir `next/image` para estas fotos (son URLs externas de Wikimedia; el
   proyecto ya usa `<img>` deliberadamente con `unoptimized`/eslint-disable).

Criterios de aceptación:

- Lighthouse móvil en `/tours`: LCP mejora o se mantiene; el elemento LCP es
  la portada de la primera tarjeta y se solicita con prioridad alta (ver
  Network → columna Priority).
- No hay CLS nuevo (puntuación CLS ≤ la anterior).

### Fase 5 (opcional, solo si el usuario lo pide después)

- Renderizar `/tours` también en el servidor con `revalidate: 60`.
- Respuesta "resumen" para tarjetas (sin `places[].description` ni créditos).
  Requiere que `TourCard`, `TourCover` (`getVerifiedTourImages` sobre
  `places[].metadata.tourImages`) y `TourSample` (`introductionAudio`,
  `places`) sigan recibiendo lo que usan. No ejecutar sin decisión explícita.

## 4. Orden y dependencias

1. §3.0 medición → Fase 1 → medir de nuevo → Fase 2 → Fase 3 → Fase 4.
2. Fases 3 y 4 son independientes entre sí; 1 y 2 van juntas.
3. Si una fase falla la validación, no pasar a la siguiente; reportar.

## 5. Entrega

- `tasks/catalog-load-performance-todo.md` con: cifras antes/después por fase,
  tests ejecutados y resultado, archivos tocados, y cualquier desviación del
  plan con su motivo.
- `git status` final limitado a los archivos listados en este plan más los
  cambios preexistentes de la rama (sin tocar estos últimos).
