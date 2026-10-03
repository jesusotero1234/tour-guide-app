# Nomuvia: arquitectura

Estado a 2 de octubre de 2026. Describe el sistema que sirve nomuvia.com. El pipeline anterior (generación desde la app con Ollama y
Kokoro) está archivado en [`docs/archive/`](docs/archive/root/ARCHITECTURE-pipeline-anterior.md).

## Qué es

Audioguías para pasear: **216 tours** publicados (es 52; en, fr, de e it 41 cada uno), **1.653 paradas** en unas 41 ciudades de España y Europa,
con texto, fotos verificadas de Wikimedia, mapa y audio con voz generada por IA (VoxCPM2). Todo el contenido se genera **por lotes, en local**;
producción solo lo sirve, y es de solo lectura.

## Mapa del sistema

```
EQUIPO LOCAL (GPU, claves, datos de trabajo)                 SERVIDOR (Hetzner, Ubuntu 24.04)
┌───────────────────────────────────────────────┐            ┌────────────────────────────────────────────┐
│ Pipeline de lote  (backend/scripts/admin)     │            │ Caddy :443  (HTTPS, cabeceras, Umami)      │
│  prepare → text → translate → audio →         │            │   │                                        │
│  publication                                  │  paquete   │   ▼                                        │
│  Overpass · Wikidata · Wikipedia · DeepSeek   │ ─────────► │ Next.js :3000  (frontend, proxy piloto)    │
│  VoxCPM2 en GPU (pods/voxcpm-pod)             │  rsync +   │   │  /api/backend/*  solo GET, lista cerrada   │
│ Herramienta de regeneración (catalog-         │  importador│   ▼                                        │
│  regeneration)                                │            │ Express :3001  (API piloto, solo lectura)  │
└───────────────────────────────────────────────┘            │   │                                        │
                                                             │   ▼                                        │
                                                             │ PostgreSQL  +  audio en disco (MP3)        │
                                                             └────────────────────────────────────────────┘
```

- **Frontend** (`frontend/`): Next.js 15. En producción, `PILOT_MODE`: cada petición al backend pasa por `lib/backendProxy.ts`, que solo permite
  `GET` y una lista cerrada de rutas (`lib/pilotPaths.ts`) y añade la clave que el navegador nunca ve.
- **Backend** (`backend/`): Express y Prisma. En modo piloto (`PILOT_MODE=true` o `NODE_ENV=production`) solo expone `/api/v1/pilot/*`, de lectura.
  Los endpoints antiguos de generación no están activos en producción.
- **Voz** (`pods/voxcpm-pod/`): VoxCPM2 con presets fijos por idioma. Se usa como entorno virtual local, no como contenedor.
- **Servidor**: releases en `/srv/tour-guide/releases/<nombre>` con `current` como enlace; reinicio con systemd. Véase
  [`deployment/pilot/hetzner-status.md`](deployment/pilot/hetzner-status.md).

## El contenido de un tour

| Tabla | Qué guarda |
|---|---|
| `tours` | Ciudad, idioma, tema, introducción (`introduction`) y su texto hablado (`introduction_spoken_text`), y `metadata` |
| `places` | Las paradas: `description` (lo que se **ve**), `spoken_text` (lo que se **dice**) y `metadata` (fuentes, fotos) |
| `audio_assets` | El MP3 de cada parada; `metadata` lleva `rendererKey`, `sourceHash` y `fileSha256` |
| `tour_introduction_audio` | El MP3 de la introducción, atado a la primera parada |
| `tour_cue_audio` | Los clips cortos que enlazan una parada con la siguiente (`first`, `next`, `finish`) |
| `tour_walking_legs` | Tiempo, distancia y geometría a pie entre **todas** las parejas de paradas |

**Texto en pantalla y texto hablado** son distintos: la pantalla conserva las cifras («1248», «siglo IV») y la voz lee el texto normalizado
(«mil doscientos cuarenta y ocho»). El normalizador y su puerta de comprobación están en `pods/voxcpm-pod/src/utils/speech/`. El texto hablado
no sale por la API pública.

**Huella de publicación (`pilotFingerprint`)**: un hash del contenido aprobado (texto, fotos, fuentes, versiones de audio, enlaces y tramos).
Un tour solo se sirve si `metadata.pilotRelease.fingerprint` coincide con la huella recalculada (`admittedToPilot`, `PilotRelease.ts`). Los campos
nuevos entran en el hash **solo cuando tienen valor**; si no, cada tour ya publicado dejaría de servirse al desplegar. Las pruebas de regresión fijan
las huellas de referencia.

**Audio**: `rendererKey` identifica la voz (modelo, preset y audio de referencia); `sourceHash = sha256(idioma + rendererKey + texto hablado)`. El
backend sirve, para cada parada, el archivo más reciente cuyo hash coincide con el texto y cuyo `sha256` coincide con el archivo. Los archivos viven
en `voxcpm2/<jobId>/<id>.mp3` y no se borran nunca. Con `?v=<hash>.<sha>` la respuesta es `immutable`.

## Paradas sin orden fijo

Cada parada se entiende sola: no anuncia la siguiente. Entre paradas suenan clips breves por **destino** («Siguiente parada: X»), no por
procedencia. Un tour que lo permite lleva `metadata.orderFlexible`, `cueManifest` y `walkingLegsSha256`; la admisión solo lee `metadata` y nunca
consulta `tour_cue_audio` ni `tour_walking_legs` (la lista del catálogo no puede cargarlas). En el frontend, el visitante elige dónde empezar y la
app reordena el resto con el camino abierto más corto (`lib/routeOrder.ts`); el orden activo se guarda por huella (`lib/tourOrder.ts`).
`PILOT_FLEXIBLE_ORDER=off` apaga todo esto sin tocar datos.

## API piloto

`GET /api/v1/pilot/tours` (listado, lo paginan 50 a 50), `/tours/:id`, `/walking-route`, `/walking-legs`, `/audio` (estado, versiones, textos y clips),
`/audio/:placeId`, `/audio/introduction`, `/cue/{first,next}/:placeId`, `/cue/finish` y `/provenance`. Todas exigen `X-API-Key`, y nada escribe.

## Cómo se crea el contenido

```
prepare ──► text ──► translate ──► audio ──► publication
```

Cinco etapas locales y reanudables, con recibos de contenido. Mapa del código en
[`backend/scripts/admin/README.md`](backend/scripts/admin/README.md). Todo lo facturable (DeepSeek) y la GPU se piden con una bandera explícita.

**Regeneración del catálogo**: `catalog-regeneration` (`backend/src/services/regeneration/`) rehace el texto hablado, los enlaces y los tramos de lo ya
publicado, con muestra revisada por una persona, importador de actualización y reversión. Plan:
[`docs/plans/20261001-audio-paradas-ui-backend/04-regeneracion-y-publicacion.md`](docs/plans/20261001-audio-paradas-ui-backend/04-regeneracion-y-publicacion.md).

## Publicación

1. **Release de código** (`deployment/pilot/release-*.sh`): copia de `current`, compilación sin root, comprobación pública y reversión automática.
2. **Datos** (`deployment/pilot/catalog/`): paquete con el audio aparte, `pg_dump`, importador transaccional, verificación y reversión.
3. **Migraciones**: aditivas, con SQL inverso junto a cada una; se aplican antes de cambiar `current`.

## Frontend

- `/tours` catálogo; `/tours/:id` ficha; `?listen=1` reproductor. Páginas SEO por ciudad y ruta (`/{idioma}/{ciudad}`).
- **Un solo `<audio>` por paseo** (`hooks/useTourAudioEngine.ts`): encadena los clips, guarda la posición y registra la Media Session una vez.
- Todo lo del visitante vive en `localStorage`: parada, progreso, orden, velocidad y preferencia de ubicación (nunca coordenadas). Se borra desde Privacidad.
- Analítica (Umami) solo con consentimiento (`lib/consent.ts`, `hooks/useTourAnalytics.ts`).

## Datos de trabajo

`backend/tmp/` guarda datos vivos (~18 GB), no temporales: caché de OSM, lotes y ejecuciones. `TOUR_DATA_DIR` (ruta absoluta) los mueve juntos.

## Pruebas

`scripts/check-all.sh` ejecuta todo lo que no necesita GPU ni red: tipos, Jest, Python y Node del pipeline, pruebas de CPU de la voz y el
frontend. Los fallos que ya existían están en `scripts/check-all.known-failures.txt`. Las pruebas de navegador del frontend (Playwright) se
describen en los informes de [`docs/plans/20261001-audio-paradas-ui-backend/resultados/`](docs/plans/20261001-audio-paradas-ui-backend/resultados/).
