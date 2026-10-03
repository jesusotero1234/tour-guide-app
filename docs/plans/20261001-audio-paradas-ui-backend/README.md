# Plan: audio hablado correcto, paradas sin orden fijo, UI del paseo y saneamiento del backend

- **Fecha:** 1 de octubre de 2026.
- **Estado:** 1–6 ejecutados en local el 1 y el 2 de octubre (informes en `resultados/`); 7 en curso. Nada confirmado en git ni desplegado. Lo que falta necesita tu autorización: ver el informe de cada paquete.
- **Origen:** análisis de la UI en producción (nomuvia.com), del código y del catálogo publicado, más dos problemas que planteó el usuario.
- **Destinatario:** el LLM que lo ejecute. Cada documento es un paquete de trabajo con contexto, decisiones, tareas, contratos, pruebas y criterios de aceptación.

## Problemas que resuelve

1. **El audio lee mal fechas, siglos, reyes, abreviaturas y cifras** («siglo IV», «1876», «Jaime I», «d. C.», «15.800»). El TTS (VoxCPM2) no normaliza el texto, y casi todas las paradas tienen cifras.
2. **Los tours obligan a empezar por la parada 1.** Si ya estás en la ciudad, junto a la parada 5, no tiene sentido ir a la 1. Hoy no se puede reordenar porque cada audio termina anunciando la parada siguiente.
3. **Carencias de la UI para quien camina:** la ubicación está escondida, no se muestra la distancia, la pantalla bloqueada no tiene controles de parada, el reproductor en alemán e italiano está a medio traducir, entre otras.
4. **Backend desordenado:** medio pipeline de producción fuera de git, tres caminos de generación, unas 38.000 líneas muertas, documentación obsoleta y sin CI.

## Datos medidos (1 de octubre de 2026)

### Catálogo publicado

| | |
|---|---|
| Tours | 216 (es 52; en, fr, de e it 41 cada uno) |
| Paradas | 1.653 |
| Introducciones | 216 |
| Ciudades | 41 |
| Paradas por tour | 5–10 (media 7,65) |
| Caracteres por parada | ~2.900 de media |
| Origen | 150 del lote Europa, 55 del lote España y 11 temáticos |

### Texto

Tiene años en cifras el **97 %** de las paradas en en/fr/de/it y el 87 % en es. Además:

- siglos en romanos: 60–68 % (es, fr, it); en alemán, el 86 % lleva ordinales con punto («19. Jahrhundert», «25. März»);
- reyes o papas con romano: 38–46 %;
- abreviaturas: 10–13 %;
- millares con separador: 12–14 %.

**Consecuencia:** hay que regenerar todo el audio una vez.

### Orden

- La última frase de cada parada nombra la siguiente. Solo el 69–83 % sigue una fórmula detectable; el resto son variantes libres.
- La mayoría de las introducciones dicen por dónde se empieza.
- Unas tres cuartas partes de las últimas paradas en español cierran el recorrido.

### Audio

- La pasada de traducciones (21–22 de septiembre) generó 51,4 h de audio en ~8 h de GPU, es decir, ≈6,5× tiempo real.
- Regenerar todo son unas **84 h de audio**. Con las recargas del modelo por trabajo y ~3.500 enlaces cortos, serán **~18–24 h de GPU**, a confirmar con una prueba de tiempos ([04](04-regeneracion-y-publicacion.md) §7).

### Producción

- La API pública es de solo lectura, en modo piloto.
- La huella de publicación (`pilotFingerprint`) cubre textos, audio e imágenes.
- El importador actual solo sabe **crear** tours.

## Decisiones globales (no reabrir sin preguntar al usuario)

1. **El texto de pantalla y el hablado se separan.** `description` conserva las cifras; se persiste un `spokenText` normalizado; el audio y su hash usan `spokenText`. → [02](02-texto-hablado.md)
2. **El normalizador es determinista** (Python, por idioma, `num2words`). El LLM solo repara los residuos, bajo una guarda de diff. **Una puerta impide renderizar** texto con cifras, romanos, abreviaturas o símbolos. → [02](02-texto-hablado.md)
3. **Parada = cuerpo independiente del orden + clips de enlace por destino.** Los clips (`first:X`, `next:X`, `finish`) salen de plantillas, sin LLM, en formato «Siguiente parada: X». → [03](03-paradas-sin-orden.md)
4. **El orden lo decide el reproductor.** El orden actual es el «recomendado»; «Empezar aquí» reoptimiza con una matriz de tiempos a pie precalculada. Nada se reproduce solo al llegar. → [05](05-reproductor-empezar-cerca.md)
5. **Una sola regeneración** del catálogo para 1 + 3:
   - parte de un **snapshot de producción**, porque los tres orígenes son distintos;
   - se revisa primero una muestra (Valencia, 5 idiomas);
   - se publica con un **importador de actualización** nuevo, por tour, compatible en ambos sentidos y con reversión. → [04](04-regeneracion-y-publicacion.md)
6. **Producción sigue siendo de solo lectura:** nada se genera en el servidor.
7. **Backend:** primero se versiona y aísla el pipeline real (fase 0); la limpieza grande va después de la regeneración. → [01](01-fase0-backend-base.md), [07](07-backend-limpieza.md)

## Documentos

| # | Documento | Qué entrega |
|---|---|---|
| 01 | [Fase 0 del backend](01-fase0-backend-base.md) | Línea base de pruebas, pipeline en git, sin rutas fijas ni código en `tmp`, un único punto de preparación de texto TTS y rutas antiguas cerradas en producción |
| 02 | [Texto hablado](02-texto-hablado.md) | Normalizador por idioma, puerta, reparación de residuos, `spokenText`, arreglo de `sanitize` y control con Whisper |
| 03 | [Paradas sin orden](03-paradas-sin-orden.md) | Contrato cuerpo + enlace, plantillas, detector de referencias al orden, prompts nuevos, pasada de neutralización y matriz de caminata |
| 04 | [Regeneración y publicación](04-regeneracion-y-publicacion.md) | Herramienta `catalog-regeneration` (snapshot → neutralización → texto hablado → enlaces → tramos → revisión → render → paquete → verificación → publicación o reversión) |
| 05 | [Reproductor: empezar cerca](05-reproductor-empezar-cerca.md) | Orden activo, optimizador, «Empezar aquí», distancia y llegada, cuerpo + enlace y pantalla bloqueada |
| 06 | [Mejoras de UI](06-ui.md) | Todos los hallazgos de UI salvo la carga del catálogo, priorizados |
| 07 | [Limpieza del backend](07-backend-limpieza.md) | Código muerto, camino antiguo, mover el pipeline fuera de `validation/`, unificar lotes, documentación, pods y CI |
| — | [anexos/](anexos/) | Listas de alcanzabilidad del código y el script `reach.py` para regenerarlas |

## Orden de ejecución

```
Pista backend/audio:  01 ──► 02 ┐
                             03 ┴─► 04: muestra de Valencia ─► aprobación del usuario ─► catálogo completo ─► publicar
Pista frontend:       06 (prioridad 1, desde el primer día) ──► 05 (con fixtures; tras los contratos de 03) ──► desplegar tras publicar 04
Pista limpieza:       07.1 y 07.9 tras 01 ──► resto de 07 tras 04
```

- 02 y 03 pueden programarse en paralelo. Comparten **una sola migración Prisma**, cuyo responsable es 02 (§7.1) y que incluye los modelos de 03.
- **Regla de oro para desplegar:** nada de lo nuevo puede cambiar la huella ni los hashes de audio de los tours actuales mientras no se regeneren. Hay pruebas de regresión byte a byte en [02](02-texto-hablado.md) §7.5 y §10, y los presets de voz no se tocan ([02](02-texto-hablado.md) §2.5).
- 05 se desarrolla contra fixtures. En producción se activa por tour (`orderFlexible`), así que no rompe nada si los datos aún no están.
- El despliegue de backend con migraciones aditivas va **antes** de publicar los datos de 04, y el frontend de 05 **después** ([04](04-regeneracion-y-publicacion.md) §10.2).

## Reglas para quien ejecute

1. **Lee primero `AGENTS.md`**, que fija el reparto Codex/Qwen, cuándo delegar y cómo validar. Este plan no lo sustituye.
2. **Puede haber otros agentes trabajando a la vez.**
   - Comprobar `git status` antes de empezar y antes de cada commit.
   - Añadir archivos por nombre; nada de `git add -A`, `stash`, `checkout -- .` ni formateos masivos.
   - El **rendimiento del catálogo** (`ToursList.tsx` y el endpoint `/tours`; commits `766286f`, `8c629e9`) es de otro agente: **no tocarlo** y no añadir trabajo caro al listado.
   - **El repositorio es público:** no confirmar nunca secretos, `.env`, volcados de BD ni datos personales.
3. **Necesitan autorización explícita del usuario,** pedida con detalle (qué, cuánto y cómo se revierte):
   - confirmar en git ([01](01-fase0-backend-base.md) §3.2) y subir a GitHub ([07](07-backend-limpieza.md) §7.9);
   - acceder a producción por SSH (snapshot) y **cualquier escritura o despliegue en producción**;
   - llamadas facturables a DeepSeek (neutralización y residuos), con el presupuesto calculado;
   - ocupar la GPU más de 1 h, porque detiene Qwen;
   - borrar código, tablas o datos.
4. **Las aprobaciones de contenido las registra el usuario.** El ejecutor nunca las inventa. En `approvals.json` (esquema en [04](04-regeneracion-y-publicacion.md) §6) solo transcribe literalmente lo que el usuario haya dicho, y `authorizationReference` se copia de ahí.
5. **Cada paquete de trabajo termina con:**
   - `scripts/check-all.sh` en verde, es decir, sin fallos fuera de la lista de fallos conocidos ([01](01-fase0-backend-base.md) §3.1);
   - sus pruebas nuevas en verde;
   - un informe breve en `resultados/NN-<tema>.md` dentro de esta carpeta, con lo hecho, las mediciones, lo que quedó pendiente y los motivos.
6. **Idiomas:** documentación en español; código, identificadores y mensajes de commit en inglés, siguiendo el estilo del repo.
7. **Si algo de este plan resulta falso** al ejecutarlo (por ejemplo, una línea citada que ya cambió), verificar en el código, adaptar y anotarlo en el informe. **No forzar el plan.**

## Acceso, entorno y secretos (dónde está cada cosa; no copiar valores al repo)

| Qué | Dónde |
|---|---|
| Host SSH y ruta de la clave de producción | `deployment/pilot/release-audio-cache-20261001.sh` (`HOST`, `KEY`) |
| BD de producción, lectura (usuario `nomuvia_app`, solo SELECT) | `/etc/tour-guide/backend.env` en el servidor |
| BD de producción, escritura y migraciones | `/etc/tour-guide/migration.env` en el servidor (como `install.sh`) |
| Audio en producción | `/srv/tour-guide/shared/audio` (`AUDIO_STORAGE_PATH`) |
| Scripts de la última publicación (fuera del repo) | `~/.local/share/tour-guide/nomuvia/europe-launch-20260922/` |
| Clave de DeepSeek | `DEEPSEEK_API_KEY` en `backend/.env` (no versionado), leída por `backend/scripts/admin/editorial_runtime/client.py` |
| Venv del TTS | `pods/voxcpm-pod/.venv` (Python 3.10). `num2words==0.5.14` está **por instalar** |
| Playwright (no es dependencia del frontend) | Variables `PLAYWRIGHT_MODULE`, `CHROMIUM_PATH` y `BASE_URL` de los `frontend/scripts/test-*.cjs` |
| GPU | `scripts/with-tts-gpu.py` (en la raíz del repo), que toma el cerrojo y detiene y restaura Qwen |
| Postgres local para verificar | [04](04-regeneracion-y-publicacion.md) §9.1 |

## Decisiones pendientes del usuario

| # | Decisión | Dónde | Propuesta |
|---|---|---|---|
| 1 | Textos de las plantillas de enlace (5 idiomas) | [03](03-paradas-sin-orden.md) §3 | Formato «Siguiente parada: X.» |
| 2 | Aprobar la muestra de Valencia (neutralización + texto hablado + audio) | [04](04-regeneracion-y-publicacion.md) §6 | Obligatoria antes del lote |
| 3 | Activar la regla editorial de fechas en los tours nuevos | [02](02-texto-hablado.md) §8.4 | Prueba A/B de escucha primero |
| 4 | Origen del título del tour en la ficha | [06](06-ui.md) B1 | `catalogTitle` en la regeneración |
| 5 | Portadas por ruta base | [06](06-ui.md) B8 | Hoja de candidatas para elegir |
| 6 | Tipografía web | [06](06-ui.md) D2 | 2 combinaciones con capturas |
| 7 | Rutas heredadas del frontend | [06](06-ui.md) F | Eliminar `/`, `/generation`, `/passes` y `/pilot/madrid-history` |
| 8 | Camino antiguo y generación con Codex CLI | [07](07-backend-limpieza.md) §7.2 | Eliminar ambos (opción A) |
| 9 | Modo sin conexión (fase 2) | [06](06-ui.md) A6 | Después de la caché HTTP |
| 10 | Archivar las 60 entradas sin uso de `backend/tmp` | [07](07-backend-limpieza.md) §7.6 | Archivar fuera del repo |
| 11 | Frase de los clips de enlace si VoxCPM2 produce artefactos con textos de 2–3 s | [04](04-regeneracion-y-publicacion.md) §7 | Primero relleno de silencio; si no basta, frase completa |

## Estimaciones

| Paquete | Esfuerzo de desarrollo | Recursos |
|---|---|---|
| 01 | 1–2 días | — |
| 02 | 3–5 días (las reglas por idioma son lo largo) | Céntimos de LLM para residuos |
| 03 | 2–3 días | — |
| 04 | 4–6 días de herramienta + ejecución | Unos pocos USD de DeepSeek, ~18–24 h de GPU, ~40 min de router |
| 05 | 5–8 días (el motor de audio persistente es lo delicado) | Pruebas en un iPhone y un Android reales |
| 06 | 5–8 días (prioridad 1: 2–3) | — |
| 07 | 4–7 días | — |

## Glosario

- **Cuerpo:** texto y audio de una parada sin referencias al orden.
- **Enlace (*cue*):** clip corto por destino: `first:<placeId>`, `next:<placeId>` o `finish`.
- **`spokenText`:** el texto exacto que se sintetiza: normalizado, sin cifras ni romanos.
- **Puerta:** comprobación que bloquea el render si el texto hablado contiene cifras, romanos, abreviaturas o símbolos.
- **Orden recomendado / activo:** el del tour publicado, frente al que usa el reproductor en ese momento.
- **Tour flexible:** `metadata.orderFlexible === true`, con enlaces y `walkingLegs` completos.
- **Huella:** `pilotFingerprint`, el hash del contenido aprobado. Si no coincide, el tour no se sirve.
- **Snapshot:** exportación de solo lectura de lo publicado en producción, punto de partida de la regeneración.

## Revisión cruzada (1 de octubre de 2026, 21:30)

Segunda verificación contra el código en HEAD (`6aa4bc1`), hecha después de la revisión de las 21:22. Lo que esa revisión ya cubría (estado de git, huella condicional con prueba de regresión, presets intactos, `firstHash`, migración única con `migrate deploy`, clips sin hash de archivo en la admisión, tramos fuera de la fila del tour, ids UUID, `stage-local`) se deja como está. Añadido:

1. **Admisión sin consultas extra:** `metadata.cueManifest` y `metadata.walkingLegsSha256`, para que `admittedToPilot` y la huella no consulten `TourCueAudio` ni `TourWalkingLegs` en el listado. Las tablas solo las leen `/audio`, `/cue` y `/walking-legs`. [03](03-paradas-sin-orden.md) §5.1 y §7; [04](04-regeneracion-y-publicacion.md) §8.3.
2. **Comprobación «backend nuevo + datos viejos»** en local, antes de aplicar el paquete, con medición de la latencia del catálogo y presupuesto de +30 %. [04](04-regeneracion-y-publicacion.md) §8.2 y §9.2.
3. **Copia completa del audio de producción** (~2,7 GB) en el snapshot, porque sin los archivos `verify` no puede admitir los tours. [04](04-regeneracion-y-publicacion.md) §4, §9.1 y §12.
4. **Precondiciones de `publish`:** esquema migrado, release correcta y espacio en disco (el servidor tiene 40 GB). [04](04-regeneracion-y-publicacion.md) §10.1.
5. **Interruptor `PILOT_FLEXIBLE_ORDER`**, primera palanca de reversión sin tocar datos. [04](04-regeneracion-y-publicacion.md) §10.4; [05](05-reproductor-empezar-cerca.md) §3.3.
6. **Progreso de escucha:** las claves llevan la versión del audio y la regeneración las cambia todas; el motor traslada la marca «escuchada». [05](05-reproductor-empezar-cerca.md) §4.4; [04](04-regeneracion-y-publicacion.md) §10.3.
7. **Detalles:** `playbackRate` al encadenar el enlace ([05](05-reproductor-empezar-cerca.md) §5.3); `²`, `³` y otros símbolos en la puerta y lista blanca global de romanos ([02](02-texto-hablado.md) §5); decisión pendiente 11.
