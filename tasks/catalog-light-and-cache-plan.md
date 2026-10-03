# Plan: caché del catálogo y catálogo ligero

## 1. Contexto

- Fecha: 2026-10-02. Release en producción: `20261002-catalog-load` (rama
  `perf/catalog-load`, worktree `/home/jesusotero/coding/tour-guide-app-perf`,
  commits `361083c` y `16f113f`). Base para este plan: esa rama.
- Medido en producción tras esa release: `GET /api/backend/tours?language=es&limit=200`
  tarda 1,3–2,2 s y pesa ~500 KB (52 tours completos con todas sus paradas).
  El HTML de `/tours` responde en 0,25 s; la espera es la petición del catálogo.
- Dos causas, dos remedios:
  - **El backend recalcula la admisión de cada tour en cada petición** (lee audio,
    base y créditos). Remedio A: caché en memoria ya implementada, apagada por
    defecto; solo hay que activarla.
  - **La respuesta lleva el tour entero** cuando la tarjeta solo usa ~10 campos.
    Remedio B: una vista "resumen" del catálogo.
- Mockup aprobado/revisado: artefacto "Catálogo ligero Nomuvia"
  (https://claude.ai/artifact/VT7iAnXrgM7UFBauxtkCAA). Las tarjetas no cambian
  de aspecto; cambia cuándo aparecen.

### Reglas

- Cambio mínimo. No tocar diseño ni copy. No commitear en `plan/20261001-fase0`;
  trabajar en el worktree `tour-guide-app-perf` sobre `perf/catalog-load`.
- Nada se despliega sin confirmación explícita del usuario; el despliegue sigue el
  patrón de `deployment/pilot/release-catalog-load-20261002.sh` (copia de la
  release activa, sustitución de archivos verificados por SHA-256, build sin root,
  activación atómica, comprobaciones públicas y reversión automática).
- Medir antes y después en producción con `curl -w '%{time_total} %{size_download}'`
  sobre el catálogo `es`, 3 veces, y anotar en `tasks/catalog-light-and-cache-todo.md`.

## 2. Fase A — Activar la caché del catálogo (solo configuración)

Objetivo: que solo una visita cada 5 minutos pague el cálculo completo.

1. En el servidor, drop-in de systemd para `nomuvia-backend.service`:
   `/etc/systemd/system/nomuvia-backend.service.d/catalog-cache.conf` con
   `[Service]` / `Environment=PILOT_CATALOG_CACHE_MS=300000`.
   Leer antes cómo se definen las demás variables (fichero de entorno en
   `/etc/tour-guide/` o `Environment=` en el unit) y usar el mismo mecanismo si
   ya existe uno; no mezclar dos.
2. `systemctl daemon-reload && systemctl restart nomuvia-backend`; comprobar
   `systemctl is-active` y que el catálogo responde 200 con el mismo `total`.
3. Reflejar el cambio en el repo: `deployment/pilot/nomuvia-backend.service`
   (o el fichero de entorno de ejemplo) y una línea en
   `deployment/pilot/hetzner-status.md`.
4. Medir: segunda y tercera llamada dentro de 5 min deben bajar a decenas de ms
   (el transporte de 500 KB seguirá costando algo hasta la Fase B).

Riesgo aceptado por el usuario (sin usuarios reales aún): un tour retirado puede
seguir listado hasta 5 min; su ficha y su audio se cortan al instante.

Reversión: borrar el drop-in, `daemon-reload`, reiniciar.

## 3. Fase B — Catálogo ligero

### B1. Contrato de la respuesta resumen

`GET /api/v1/pilot/tours?view=summary` (mismos filtros y paginación). Cada
elemento (`TourSummary`) lleva exactamente lo que usan `TourCard`, `TourCover`
y `TourSample`:

```
id, city, cityNames, country, countryCode, theme, language, durationMinutes,
title?, subtitle?, introduction (recortada a 320 caracteres, en límite de palabra),
localReview, orderFlexible?,
stopCount: number,
cover?: TourImage  (la primera imagen `role: 'primary'` verificada, con sus créditos),
sampleAudioUrl?: string  (introductionAudio.audioUrl o el audioUrl de la primera parada)
```

Sin `places`, sin `pilot`, sin `createdAt/updatedAt`. Sin `view=summary` la
respuesta no cambia (compatibilidad con el frontend desplegado).

### B2. Backend (`backend/src/api/routes/pilot.ts`, `backend/src/services/PilotRelease.ts`)

1. `presentPilotTourSummary(tour, state, localReview)` en `PilotRelease.ts`,
   derivado de `presentPilotTour` (reutilizar la misma selección de imagen
   verificada que hace el frontend en `getVerifiedTourImages`: mover ese criterio
   al backend o duplicarlo con un test que compare ambos sobre un tour fixture).
2. En `/tours`: leer `req.query.view`; si es `'summary'`, mapear la lista admitida
   (cacheada o no) con el presentador resumen. La caché guarda los tours completos
   y el resumen se deriva al responder, así una sola entrada sirve ambas vistas.
3. Test en `pilot.catalogue.test.ts`: la vista resumen no contiene `places`, trae
   `stopCount`, `cover` y `sampleAudioUrl`, y respeta la misma admisión que la
   vista completa (un tour retirado desaparece de ambas).

### B3. Frontend

1. `frontend/src/types/api.ts`: tipo `TourSummary`.
2. `frontend/src/lib/api.ts`: `listTourSummaries(params, signal)` →
   `{ tours: TourSummary[]; total? }` (añade `view=summary`).
3. `frontend/src/lib/pilotPaths.ts`: el regex ya admite `tours?…`; comprobar que
   `view=summary` pasa (lo hace: `\?[^#]*`).
4. `TourCard`, `TourCover`, `TourSample`: aceptar `TourSummary | Tour`. Para no
   duplicar lógica, un helper `cardData(tour)` que devuelva
   `{ stopCount, cover, sampleAudioUrl, ... }` desde cualquiera de los dos tipos.
   `SeoLanding` y `TourOverview` siguen pasando `Tour` completo.
5. `ToursList`: usar `listTourSummaries`. Los filtros locales (ciudad, tema,
   cercanía) usan campos presentes en el resumen; "cerca de ti" necesita la
   coordenada de la primera parada → añadir `start?: { latitude, longitude }`
   al resumen (B1) en vez de `places[0]`.
6. Abrir una ficha sin espera: en `TourCard`, `<Link prefetch>` del detalle cuando
   la tarjeta entra en pantalla (Next lo hace por defecto para rutas dinámicas
   solo hasta `loading.tsx`; poner `prefetch={true}` en las 6 primeras tarjetas y
   dejar el resto por defecto). Si la persona toca antes de que termine la
   precarga, ve el esqueleto de `loading.tsx` un instante (frame 3 del mockup).

### B4. Aceptación

- Catálogo `es` en producción: tamaño < 60 KB (antes ~500 KB); tiempo de la
  primera carga claramente inferior, y con caché caliente < 150 ms.
- Las tarjetas se ven idénticas a las actuales (comparar capturas antes/después
  de `/tours` en 390 px).
- "Escuchar muestra" funciona desde la tarjeta; "Ver paseo" abre la ficha completa.
- Buscador, chips de ciudad, filtro de tema y "cerca de ti" siguen funcionando.
- Tests backend del piloto en verde; `tsc`, `next lint`, `next build` en verde.
- SEO: `/{locale}/{city}` y las rutas no usan el resumen; sin cambios.

### B5. Orden

A primero (5 min, sin build). B en un commit propio, con script de release
`deployment/pilot/release-catalog-summary-<fecha>.sh` generado a partir del de
20261002, que compruebe además `size_download < 100000` en el catálogo `es`.

## 4. Fuera de alcance

- Renderizar `/tours` en el servidor.
- Paginar "6 primero, resto después": no hace falta si el resumen pesa poco.
- Cambios en el reproductor o en la ficha.
