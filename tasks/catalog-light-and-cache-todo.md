# Estado: caché, compresión y catálogo ligero (2026-10-02)

Rama `perf/catalog-load` (worktree `/home/jesusotero/coding/tour-guide-app-perf`). Nada subido a GitHub.

## Hecho en código (commits, probado en local)
- `329d6a4` Fase B: `view=summary` en `/pilot/tours`, `PilotCatalogSummary.ts`, `ToursList` usa el resumen,
  precarga de las 6 primeras fichas. Tests backend 36/36, `tsc`, `next lint`, `next build` en verde;
  navegador (Playwright) con datos reales: 1 petición, tarjetas con portada, muestra y paradas correctas.
- `b19b703` `encode zstd gzip` en `deployment/pilot/Caddyfile.nomuvia-public`.
- `361083c`/`16f113f` (ya desplegados): paralelización del listado y ficha desde el servidor.
- Scripts: `deployment/pilot/release-catalog-summary-20261002.sh` (código, con reversión).

## Medido
- Local (11 tours): respuesta completa 377 KB → resumen 38 KB (≈10×).
- Producción hoy, catálogo `es`: **3,47 MB**, 1,3–2,2 s, sin comprimir (la estimación de 500 KB del plan era errónea).
  Resumen esperado: unos 180 KB sin comprimir (≈3,5 KB por tour × 52) y bastante menos con gzip.

## Desplegado (2026-10-02)
- Fase A (`apply-catalog-cache-and-compression-20261002.sh`): `encode zstd gzip` en Caddy y `PILOT_CATALOG_CACHE_MS=300000`.
  Copias: `/etc/caddy/Caddyfile.before-encode-20261002`, `/etc/tour-guide/backend.env.before-cache-20261002`.
- Fase B (`release-catalog-summary-20261002.sh`): release `20261002-catalog-summary`; anterior `20261002-catalog-load`.

## Resultado en producción, catálogo `es` (52 tours)
| | Antes de hoy | Ahora |
|---|---|---|
| Tamaño recibido | 3,47 MB | **41,8 KB** (resumen + gzip) |
| Tiempo (caché caliente) | 1,3–2,2 s | **~0,25 s** |
| Catálogo completo con gzip (compatibilidad) | 3,47 MB | 637 KB |
La primera petición tras reiniciar el backend o pasados 5 min sigue pagando el cálculo (~1,3–2,6 s).

## Reversión
- Código: `/srv/tour-guide/current` → `20261002-catalog-load`, reiniciar backend y frontend.
- Fase A: restaurar las dos copias, `systemctl reload caddy`, `systemctl restart nomuvia-backend`.

## Sin verificar
- La precarga de las 6 primeras fichas (en desarrollo Next no precarga): comprobar en el móvil que abrir una ficha es inmediato.
