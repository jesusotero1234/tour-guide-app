# Plan 64 — SearXNG fiable para el canary (Mojeek + Wikipedia API + pacing)

Fecha: 2026-08-15

Estado: **plan de implementación; solo afecta al canary V8; el flujo productivo por defecto permanece intacto**

Documentos relacionados:

- [`63-tour-end-to-end-v8-implementation-plan.md`](./63-tour-end-to-end-v8-implementation-plan.md)
- [`62-seleccion-esencial-busqueda-v8-plan.md`](./62-seleccion-esencial-busqueda-v8-plan.md)
- [`scripts/searxng-settings.yml`](../../scripts/searxng-settings.yml)
- [`backend/src/services/poi/NarrativeSourcesV7.ts`](../../backend/src/services/poi/NarrativeSourcesV7.ts)
- [`backend/src/services/poi/NarrativeResearchV8.ts`](../../backend/src/services/poi/NarrativeResearchV8.ts)

## Objetivo

Que el descubrimiento local no dependa de motores suspendidos (Brave/Google/DDG con 429 y 180 s de suspensión). Con motores tolerantes + pacing, el canary debe poder conseguir un segundo publisher vía SearXNG de forma consistente, o fallar por falta real de dominio oficial (no por motores caídos).

## Diagnóstico (evidencia ya recogida)

- Los logs del contenedor muestran `SearxEngineTooManyRequestsException` (Brave, Google CSE, Wikipedia) y `httpx.ConnectError` (DuckDuckGo) → los motores de arriba bloquean/limitan nuestra IP de datacenter.
- Es un problema de infra/motores, no de nuestra petición (`format=json`, `language=es-ES` correctos).
- Mojeek y Marginalia son los fallbacks sin API key más tolerantes a IPs de datacenter; DDG usa CAPTCHA; Brave/Google sin key son los que más 429 dan.

## Cambios propuestos

### 1. `scripts/searxng-settings.yml` — definir los motores general explícitamente

- Activar: `mojeek` (HTML, sin key), `marginalia` (API de texto, tolerante a datacenter), `bing` (secundario, sin key).
- Desactivar: `brave`, `google` / `google cse`, `duckduckgo`, `startpage`, `qwant` (los que más bloquean sin key).
- Mantener `wikipedia` desactivado en SearXNG: es redundante, ya capturamos Wikipedia por su API directa con UA + `maxlag` correctos.
- Ajustar `outgoing.request_timeout` y prioridades (`weight`) para que Mojeek/Marginalia sean los principales.
- Dejar documentado en el mismo fichero cómo habilitar Brave/Tavily con API key (opción B), sin activarla.

### 2. `backend/src/services/poi/NarrativeSourcesV7.ts` — pacing en `SearxngNarrativeDiscoveryProviderV7`

- Throttle por hostname (mínimo ~1,5 s entre requests al mismo SearXNG), centralizado y reutilizable.
- Reduce la probabilidad de disparar 429 aunque los motores sean tolerantes.

### 3. `backend/src/services/poi/NarrativeResearchV8.ts` — sin cambios de gates

Solo aprovechar que el throttle hace las 4 búsquedas deterministas menos agresivas.

## Validación

- Comando local: `curl 'http://127.0.0.1:8080/search?q=Alcazaba+de+M%C3%A1laga&format=json'` → `results >= 1` en 3 de 5 intentos consecutivos.
- Smoke: `scripts/smoke-v8-providers.sh` sigue verde y la respuesta de SearXNG no muestra `unresponsive_engines` en las queries reales.
- Test backend: el throttle del provider registra esperas (con wait falso, sin dormir de verdad).
- Replay Málaga (una ejecución): si hay dominio oficial real, se captura un segundo publisher; si no, el bloqueo es `authority_insufficient` con diagnóstico claro (no por motores suspendidos).

## Rollback

Revertir `scripts/searxng-settings.yml` y reiniciar el contenedor SearXNG (`bash scripts/searxng-local.sh down && up`). Ningún cambio toca gates de evidencia, V6 ni Firecrawl Cloud.

## Riesgos / límites

- Mojeek también puede rate-limitar desde IP de datacenter; si ocurre, la opción garantizada es una API key (Brave/Tavily/Serper) — opción B del plan, documentada pero no activada.
- Wikipedia por API ya es fiable; este cambio solo mejora el descubrimiento de páginas oficiales.

## Definición de listo

- El curl de validación devuelve resultados en ≥3/5 intentos.
- Smoke verde; throttle testeado.
- Un replay de Málaga captura un segundo publisher vía SearXNG, o el bloqueo es `authority_insufficient` con diagnóstico que no es "motores suspendidos".

## Fuera de alcance

- No se tocan gates de evidencia, el contrato del curador, V6 ni el flujo productivo.

## Ajuste aplicado durante la implementación (evidencia 2026-08-15)

La validación en vivo modificó la selección inicial de motores:

- **Mojeek se desactiva**: `curl -A "searxng/..."` a `www.mojeek.com` devuelve una
  página CAPTCHA (altcha, JS obligatorio); SearXNG lo suspende con
  `Suspended: access denied`. Con un UA de navegador normal responde 200, pero
  el motor de SearXNG no puede pasar el reto.
- **Marginalia se desactiva**: en esta versión de SearXNG el motor
  (`searx/engines/marginalia.py`) exige `api_key` (`require_api_key: True` y
  `init()` devuelve `False` sin clave); la API responde
  `Missing API-Key header`. El valor `public` se rechaza expresamente.
- **Bing queda como único motor activo**: es keyless y devuelve resultados
  estables desde esta IP, incluidos dominios oficiales de Málaga
  (`malaga.es`, `alcazabaygibralfaro.malaga.eu`, `alcazabamalaga.com`).
- La opción B (API key: Brave/Tavily/Serper/Marginalia) queda documentada en
  `scripts/searxng-settings.yml` para añadir un segundo motor garantizado si
  Bing empieza a limitar; no se activa.

## Resultado de la validación (2026-08-15)

- `curl 'http://127.0.0.1:8080/search?q=Alcazaba+de+M%C3%A1laga&format=json&language=es-ES'`:
  **5/5 intentos con `results >= 1`** (10 resultados por intento) y **cero
  `unresponsive_engines`**. Antes del cambio: 0 resultados y 3 motores
  suspendidos (duckduckgo, google cse, startpage).
- Smoke: `scripts/smoke-v8-providers.sh` **11 passed, 0 failed**; sin
  `unresponsive_engines` en queries reales.
- Throttle: `createHostnameThrottleV7` espacia por hostname; test con wait
  falso registra dos esperas de 1.450 ms sin dormir de verdad.
- `tsc --noEmit` y suite focalizada V7/V8 (6 ficheros, 67 tests) en verde.
- Replay Málaga (`narrative-v8-malaga-replay-11`, una ejecución): la Alcazaba
  capturó **dos fuentes y dos publishers independientes** vía SearXNG:
  `source-wiki-es` (Wikipedia API, publisher `wikimedia`) y
  `https://www.malaga.es/.../alcazaba-de-malaga` (publisher `www.malaga.es`,
  tier `primary_authority`, `registered_p856:admin_level_1`). El run se
  detiene después en `curator_contract_failed` (proposición debatible sin dos
  publishers dentro de sus supports), un bloqueo del contrato del curador que
  queda fuera del alcance de este plan.
