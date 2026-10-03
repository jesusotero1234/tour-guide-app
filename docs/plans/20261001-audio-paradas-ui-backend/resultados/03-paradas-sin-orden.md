# 03 · Paradas independientes del orden: informe

Hecho el 1 de octubre de 2026 en la rama `plan/20261001-fase0`, sin confirmar en git ni desplegar.

## Resultado

| Entregable | Estado |
|---|---|
| Plantillas de enlace en un único archivo de datos (`tour-cue-templates.json`) y `cueText` | Hecho. **Los textos esperan tu validación** (decisión 1) |
| `TourAudioService.cues()` y `cueFile()`: cada clip debe casar con el manifiesto del tour, la voz vigente y el archivo | Hecho |
| API: clips en `GET /tours/:id/audio`, `GET /cue/...`, `GET /walking-legs`, `orderFlexible` | Hecho |
| Interruptor de emergencia `PILOT_FLEXIBLE_ORDER=off` | Hecho (plan 04 §10.4) |
| Admisión de tours flexibles sin consultar tablas | Hecho: la admisión lee solo `metadata` |
| Tramos: modelo, códec de polilíneas, cálculo por pares, validación y hash | Hecho (`WalkingLegs.ts`); **no ejecutado** contra el router público |
| Detector de referencias al orden (`order_neutral.py`) en los 5 idiomas | Hecho y calibrado con el catálogo real |
| Neutralización con guarda determinista (`neutralize.py`) | Hecha y probada con un modelo simulado; **no ejecutada** (facturable) |
| Prompts de tours nuevos (autor, bienvenida, editor) y `nextPieceId` | Hecho; el hash de `prompts.py` queda ligado al candado de cada ciudad |
| Comprobación del maestro en español en el lote | Hecha: una pieza que aún dependa del orden no se acepta |
| Muestra de neutralización de Valencia (5 idiomas) aprobada por ti | **Pendiente** (necesita ejecutar el modelo) |
| Una ciudad nueva de punta a punta con el detector en verde | **Pendiente** (necesita DeepSeek y GPU) |

## Calibración con el catálogo real

El detector se midió sobre los 216 tours publicados, descargados de la API pública.

| Idioma | Paradas no finales marcadas | Introducciones marcadas |
|---|---|---|
| es | 275 de 325 (84,6 %) | 44 de 52 |
| en | 273 de 278 (98,2 %) | 27 de 41 |
| fr | 266 de 278 (95,7 %) | 36 de 41 |
| de | 272 de 278 (97,8 %) | 40 de 41 |
| it | 271 de 278 (97,5 %) | 40 de 41 |

Las paradas sin marcar son, en su gran mayoría, frases de contenido sin referencia al orden. Los textos reales usaban mucho más que la fórmula del plan («Notre prochain arrêt est…», «let's head to…», «Quando proseguiremo, ci attende…», «el paseo continúa hacia…»); esos patrones se añadieron. Dos ajustes importantes:

- **«Prima di cominciare» no es un comienzo.** La enumeración ordenada exige ahora que el marcador sea un abridor de lista (`prima,`).
- **Nombrar la parada siguiente en la última frase cuenta como anuncio** aunque no use ninguna fórmula, como pide el plan.

**¿Es satisfacible la guarda?** Se simuló un modelo ingenuo que solo borra la frase marcada. Con eso la guarda acepta del 94 % al 97 % de las piezas en los cinco idiomas (por ejemplo, el francés pasó del 17 % al 97 % al corregir un fallo propio: la guarda quitaba el espacio antes de `:`, `;`, `!` y `?`, que es tipografía francesa correcta, y contaba cada frase como cambiada). Un modelo que reformule debería igualarlo o mejorarlo. Las piezas que fallan son sobre todo las que dejan un último párrafo casi vacío.

## Coste de la neutralización

| | Piezas con referencia | Coste máximo |
|---|---|---|
| es | 338 | 0,38 USD |
| en | 309 | 0,35 USD |
| fr | 315 | 0,36 USD |
| de | 314 | 0,36 USD |
| it | 322 | 0,37 USD |
| **Total** | **1.598** | **≈ 1,83 USD** |

Tarifas de pico de `editorial_runtime/budget.py`, con dos intentos por pieza. Coincide con el «unos pocos dólares» del plan.

## Decisiones y desviaciones

1. **Criterio de «≥ 85 % de las frases intactas».** Es inalcanzable en textos cortos: quitar el anuncio de un texto de 5 frases ya deja el 80 %. Se permiten siempre al menos dos frases cambiadas. En una parada real (~25 frases) equivale a tres.
2. **El maestro en español se comprueba y se rechaza, no se repara solo.** El plan decía «va a reparación». Reparar tras la revisión editorial cambiaría los textos después de revisarlos y rompería la verificación de citas del recibo de fase. Si el detector encuentra algo, la ciudad falla con un mensaje claro y se rehace con los prompts nuevos.
3. **Ciudades antiguas no se reanudan.** `text-inputs-lock.json` liga ahora el hash de `prompts.py`. Una ciudad sin ese campo se niega a reanudar con «use un directorio nuevo». Ninguna ciudad está en curso, así que no hay pérdida.
4. **`canonicalContext` ya no lleva `nextStop`.** El auditor tampoco lo recibe. La prueba que lo afirmaba se actualizó.
5. **Los metadatos del tour guardan el manifiesto de clips y el hash de los tramos** (`cueManifest`, `walkingLegsSha256`). Así la admisión, que se ejecuta por cada tour en cada petición del listado, no consulta ninguna tabla. Hay una prueba que lo exige: listar el catálogo no llama nunca a `cues()` ni a la tabla de tramos.

## Pruebas nuevas

| Qué | Cuántas |
|---|---|
| Códec de polilíneas (con el ejemplo de referencia del algoritmo), plantillas, manifiesto y tramos | 8 |
| Router para tours flexibles: clips, tramos, versiones, interruptor, admisión y exposición | 7 |
| `TourAudioService.cues()` y `cueFile()` con archivos reales y cada motivo de rechazo | 10 |
| Detector de referencias al orden | 12 |
| Neutralización: ediciones, cada criterio de la guarda, reintentos, roles por tour, estimación | 18 |
| Lote: comprobación del maestro, candado de prompts, prompts sin conservar el orden | 4 |

## Pendiente y motivos

1. **Validar las plantillas de enlace** (decisión 1): «Siguiente parada: X.» y las de los otros idiomas.
2. **Ejecutar la neutralización sobre Valencia** (≈ 0,4 USD) y revisar el resultado con el paquete de revisión de 04. Necesita tu autorización.
3. **Calcular los tramos** con el router público (~2.000 peticiones a ≤ 1 por segundo) es parte de 04 (`legs`).
4. **Las rutas del frontend** para `walking-legs` y `cue/...` y la ampliación del proxy se hacen en 05.
5. **Confirmar en git y desplegar**: necesitan tu autorización.
