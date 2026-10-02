# Entrega: carga del catálogo y de la ficha (2026-10-02)

Plan: `tasks/catalog-load-performance-plan.md`. Nada commiteado.

## Medidas (BD local real: 67 tours publicados, 11 admitidos al piloto)

| Caso | Tiempo |
|------|--------|
| Antes (reconstruido: findById + isCurrent + findById + audio.get en serie por candidato) | ~4 540 ms |
| Después, sin caché (`PILOT_CATALOG_CACHE_MS=0`) | 109–246 ms |
| Después, con caché (60 s) | 1–4 ms (primera llamada ~142 ms) |

El "antes" es una reconstrucción de la lógica anterior, no una medición del endpoint
antiguo. La medición va por la ruta real `createPilotRouter` con repositorios Postgres.

## Fases

- **F1 backend** (`backend/src/api/routes/pilot.ts`): `releasedTour(tour)` evita releer cada
  tour; comprobaciones en lotes de 10 con `Promise.all`; caché en memoria por filtros
  (`PILOT_CATALOG_CACHE_MS`, 60 s por defecto, 0 la desactiva; desactivada por defecto bajo
  `NODE_ENV=test` y en revisión local; fallos no se cachean; máx. 50 entradas).
  Tests nuevos: `pilot.catalogue.test.ts` (5). Suites pilot: 15/15 OK. `npm run typecheck` OK.
- **F2**: `limit` máximo del piloto 50 → 200; `listTours` devuelve `{ tours, total }`;
  `ToursList` hace una petición (bucle solo si `total` > recibidos); quitados los
  `console.log` de listado/ficha. `tsc --noEmit` y `next lint` OK.
- **F3**: `app/tours/[id]/page.tsx` ahora es Server Component (usa `proxyBackend`, con la
  misma puerta del piloto); nuevo `components/tours/TourDetailClient.tsx`. Verificado:
  el `<h1>` viene en el HTML inicial; id inexistente muestra el 404 de Next.
- **F4**: prop `priority` en `TourPhoto`/`TourCover`/`TourCard`; primera tarjeta y portada de la
  ficha con `loading="eager"` y `fetchPriority="high"` (verificado en el HTML). No hizo falta
  tocar CSS: `.tour-cover img` ya tiene altura fija (205/220 px).
- `next build` de producción OK.

## Desviaciones y avisos

1. **Caché y retirada de tours**: un tour retirado puede seguir en el listado hasta 60 s
   (su ficha y audio se cortan al instante). Bajar `PILOT_CATALOG_CACHE_MS` si importa.
2. **HTTP 200 en id inexistente**: con `loading.tsx` la respuesta ya empezó a enviarse, así que
   el 404 se ve en la página pero el código HTTP es 200 (lleva `noindex`). Antes tampoco era 404.
3. **Pulsar "Empezar"** (`?listen=1`) hace una petición `_rsc`, igual que antes (~320 ms en
   dev en ambos casos); sin regresión.
4. No se midió el catálogo `/tours` en el navegador: en modo no piloto local el listado
   sale vacío (`readyOnly`), y no hay modo piloto configurado en local.
5. El puerto 3001 estaba ocupado por algo ajeno; las pruebas usaron 3011 (backend) y 3010 (frontend).
6. `npm run dev` del backend ejecuta `predev`, que levanta Firecrawl/SearXNG con podman.
   Se lanzó por error, se interrumpió y no queda ningún contenedor.
7. `eslint` del backend no tiene fichero de configuración en el repo; no se pudo lintear.
8. Fase 5 (opcional) no ejecutada.

## Archivos tocados
backend: `src/api/routes/pilot.ts`, `src/api/routes/pilot.catalogue.test.ts` (nuevo)
frontend: `src/lib/api.ts`, `src/components/tours/{ToursList,TourCard,TourCover,TourOverview}.tsx`,
`src/components/tours/TourDetailClient.tsx` (nuevo), `src/app/tours/[id]/page.tsx`,
`src/components/tour/TourPhoto.tsx`
