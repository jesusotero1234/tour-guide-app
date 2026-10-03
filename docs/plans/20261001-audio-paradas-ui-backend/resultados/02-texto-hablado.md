# 02 · Texto hablado: informe

Hecho el 1 de octubre de 2026 en la rama `plan/20261001-fase0`, sin confirmar en git ni desplegar.

## Resultado

| Entregable | Estado |
|---|---|
| Normalizador `speech.normalize` + puerta `speech.gate` para es, en, fr, de, it | Hecho (`pods/voxcpm-pod/src/utils/speech/`) |
| `prepare_input` con `spokenText`: punto fijo de `sanitize`, puerta y sin reemplazos | Hecho, con `speechSource` y `speechVersion` en el registro de procedencia |
| Migración Prisma única (texto hablado, enlaces, tramos) | Hecha y **aplicada en la base local**, con su SQL inverso |
| `TourAudioService`, `pilotFingerprint`, entidades y repositorio | Hecho; los hashes heredados no cambian |
| Reparación con LLM de residuos | Hecha y probada con un DeepSeek simulado; **no ejecutada** (facturable) |
| Pipeline de lote: texto hablado, ids de audio, recibos, prompts de traducción | Hecho |
| Control con Whisper | Hecho y probado con transcripción simulada; **no ejecutado** (necesita audio nuevo) |
| Objetivo de ≥ 97 % de piezas limpias sin LLM | **No cumplido: 89,1 %** (ver abajo) |
| Muestra de escucha por el usuario | **Pendiente** (necesita audio regenerado y tu escucha) |

## Corpus real

Texto publicado, descargado de la API pública (1.869 piezas: 1.653 paradas y 216 introducciones).

| Idioma | Piezas | Limpias | % | Residuos (número de infracciones) |
|---|---|---|---|---|
| es | 429 | 398 | 92,8 | 64 dígitos, 10 romanos, 3 símbolos |
| en | 360 | 333 | 92,5 | 51 dígitos, 10 romanos, 3 símbolos |
| fr | 360 | 331 | 91,9 | 50 dígitos, 8 romanos, 3 símbolos |
| de | 360 | 280 | 77,8 | 65 dígitos, 63 romanos, 3 símbolos |
| it | 360 | 324 | 90,0 | 79 dígitos, 9 romanos, 4 símbolos |
| **Total** | **1.869** | **1.666** | **89,1** | |

La primera medición, con solo las reglas del plan, dio entre el 39 % y el 84 %. Subió ajustando contra el texto real: lista de gobernantes ampliada con los nombres que aparecen (Julio, Pablo, Eugenio, August, Amedeo, Honorio…), siglos sin la palabra «siglo» («del XIX»), rangos abreviados («1644-45»), horas, números de calle, listas encadenadas de años, rangos de días y fechas, y la declinación alemana (ver más abajo).

**Qué queda y por qué no se arregla con reglas:** códigos («L1», «A7», «VV15»), leyes («Ley 16/1985»), direcciones con un nombre propio delante («Burg 2», «Via Roma 3»), proporciones («6,5 a 1») y, en alemán, gobernantes en una posición cuyo caso gramatical no se deduce («an Albrecht IV.», nominativos tras una coma). El plan pide expresamente no adivinar la declinación, y lo mantengo.

**Reparación con LLM de lo que queda** (estimación sin red, tarifas de pico de `editorial_runtime/budget.py`):

| Idioma | Piezas con residuo | Frases a reparar | Coste máximo |
|---|---|---|---|
| es | 31 | 37 | 0,013 USD |
| en | 27 | 33 | 0,011 USD |
| fr | 29 | 33 | 0,012 USD |
| de | 80 | 99 | 0,032 USD |
| it | 36 | 42 | 0,015 USD |
| **Total** | **203** | **244** | **≈ 0,09 USD** |

El coste es despreciable. Lo que de verdad está por medir es cuántas piezas acaban en `needs_manual`, y solo se sabe ejecutando la reparación sobre la muestra de Valencia, con tu autorización.

## Decisiones y correcciones al plan

1. **El rango «1657-1658» del plan contradecía su propia regla.** La regla dice «de A a B» y la fila lo daba sin «de». Se sigue la regla, y la fila del plan queda corregida.
2. **Alemán, gobernantes:** el plan dejaba como residuo todo lo que no fuera preposición + nombre. Eso daba 85 piezas con residuo por esa causa. Ahora el caso sale del elemento que gobierna, saltando títulos y sustantivos en mayúscula («der Doge Pietro I.», «vom Erzbischof Stefano I.», «des Kaisers Friedrich II.»), de «als», de las conjunciones y de un verbo en pretérito. Lo no deducible sigue siendo residuo. Un error de caso es una falta gramatical, no un número sin leer.
3. **Alemán, guarda de nombres propios desactivada:** el alemán escribe todos los sustantivos con mayúscula, así que «Kirche 1437» no es un nombre propio.
4. **Inglés, «I»:** el plan dejaba la «I» sin tocar salvo tras un gobernante. Eso rompía «Napoleon I was crowned» y habría marcado el pronombre de «John I think». Ahora solo se descarta como pronombre ante verbos de pensamiento y estado, y la puerta aplica la misma prueba.
5. **Léxico:** el plan lo daba vacío, pero su propia tabla exige «15th USAAF → Fifteenth U S A A F». Se añadió esa entrada al léxico inglés.
6. **Puerta:** lista blanca global de romanos válidos que son siglas (`roman-allow.json`), y `²`, `³` y más símbolos.
7. **Presets sin tocar.** Los `textReplacements` del español siguen ahí y solo se aplican a piezas sin `spokenText`.

## Regresión: lo heredado no cambia

- **Datos reales:** se calcularon con el código anterior la huella, las versiones de audio, las transcripciones y la introducción de los **68 tours de la base local**, y otra vez con el código nuevo. Resultado **idéntico**. Los 11 tours admitidos conservan su huella guardada.
- **Constantes de huella** (`PilotRelease.regression.test.ts`): dos fixtures completos con huellas fijadas con el código anterior; campos nuevos ausentes, nulos o vacíos no cambian el hash.
- **Identidad de voz** (`VoiceIdentity.regression.test.ts`): sha256 de los 5 presets y sus referencias fijados con HEAD. Si falla, se cambió un archivo de voz.
- **`firstHash`:** se calcula sobre el texto hablado de la primera parada. La prueba falla si se vuelve al cálculo antiguo (comprobado).
- La API pública no expone `spokenText` (prueba).

## Despliegue: lo que importa

- **La migración debe ir antes de cambiar `current`.** El cliente de Prisma nuevo consulta las columnas nuevas y falla sin ellas; se comprobó en local. Es el orden que el plan fija en 04 §10.2.
- Tras migrar en producción: `GRANT SELECT ON tour_cue_audio, tour_walking_legs TO nomuvia_app;`. Está anotado en la migración.
- **Reversión:** `prisma/migrations/20261001220000_spoken_text_cues_legs/down.sql`. Perdería las dos columnas y las dos tablas nuevas, por eso va tras un `pg_dump`.
- En local se hizo una copia de seguridad previa de la base (`pg_dump -Fc`, 2,7 MB).

## Pruebas nuevas

| Qué | Cuántas |
|---|---|
| Normalizador y puerta (`test-speech-normalize.py`): doradas ≥ 25 por idioma, negativos, idempotencia, punto fijo de `sanitize`, CLI | 25 |
| `prepare_input` con `spokenText` y paridad byte a byte del camino heredado | 10 |
| Reparación con LLM (guarda, reintentos, `needs_manual`, estimación, CLI) | 10 |
| Etapa de texto hablado del lote y prompts de traducción | 5 |
| Control con Whisper (WER, ambos lados normalizados, muestreo) | 6 |
| Módulo compartido de los scripts de audio (Node) | 3 |
| `TourAudioService` con texto hablado | 6 |
| Huella y voz (Jest) | 11 |

## Pendiente y motivos

1. **Ejecutar la reparación con DeepSeek** sobre la muestra de Valencia: facturable, necesita tu autorización (≈ 0,09 USD en total).
2. **Muestra de escucha** (1 tour por idioma con al menos 10 fechas o romanos) y **control con Whisper**: necesitan el audio regenerado, que sale de 04.
3. **Aprobar el uso de la regla editorial de fechas en tours nuevos** (decisión pendiente 3 del README): no se activó.
4. **Cambio de memoria del catálogo:** `spokenText` duplica el texto por parada en cada lectura del catálogo (~5 MB transitorios en 216 tours). No se midió en producción; conviene hacerlo en la verificación de 04.
5. **Confirmar en git** y **desplegar**: ambos necesitan tu autorización.
