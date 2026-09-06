# Astra low y Opus 5: resultados del mismo encargo

Fecha: 2026-09-06. Caso: La Malagueta, Málaga. **No es un canario de Madrid ni un tour completo.**

## Resultado ejecutivo

**Opus 5 medium completó 575 palabras en una escritura y recibió cero objeciones del auditor. Astra low no terminó: Azure interrumpió ambos intentos con un error de proveedor.**

Opus es un candidato útil, pero el cero del auditor no equivale a texto publicable sin revisión. Mi lectura encuentra una explicación causal no documentada y lenguaje del proceso de investigación dentro del audio. No hay evidencia suficiente para sustituir por defecto a Sol ni para descartar la capacidad narrativa de Astra: de este último no obtuvimos una muestra completa.

## Datos observados

| Modelo y configuración | Resultado | Palabras | Escritura | Escritura + auditoría | Coste reportado total |
| --- | --- | ---: | ---: | ---: | ---: |
| Sol medium, prueba anterior | Completo; 2 objeciones automáticas | 569 | 16,3 s | 63,5 s | $0,15775 |
| Astra low, intento 1 | Error 502 de Azure; sin auditoría | 59, fragmento | 4,0 s | No aplica | $0 reportados |
| Astra low, intento 2 | Error 502 de Azure; sin auditoría | 366, fragmento | 119,3 s | No aplica | $0 reportados |
| Opus 5 medium | Completo; 0 objeciones automáticas | 575 | 28,6 s | 73,4 s | $0,17600 |

Objetivo: aproximadamente 562 palabras. Opus cumple las bandas locales y agregadas existentes, sin ajustar ni regenerar la narración. Las palabras de Astra son fragmentos interrumpidos, **no borradores que el modelo haya entregado como terminados**.

Estas son observaciones de una muestra conocida por configuración, no promedios repetidos ni una clasificación general de modelos. Tampoco se ha medido el audio TTS.

## Condiciones y comparación

Se verificaron los identificadores del catálogo de OpenRouter y sus capacidades: [Astra](https://openrouter.ai/openai/gpt-6-astra) y [Opus 5](https://openrouter.ai/anthropic/claude-opus-5). No se sustituyó Opus 5 por Opus 4.8.

- Mismos mensajes del encargo, siete pasajes originales, ejemplo de voz y objetivo que en Sol, DeepSeek, Kimi y GLM.
- SHA-256 del encargo: `023aece5b25e69a910119614a067b7890d9a2d849dd92bfb20e342bdea3547e0`.
- Astra: razonamiento **low**, como pidió el usuario. Opus: **medium**, anunciado antes de ejecutarlo y coincidente con las pruebas anteriores.
- Mismo límite numérico de 5.000 tokens. Astra envió `max_completion_tokens`; Opus, `max_tokens`, según las capacidades anunciadas de los endpoints.
- Se conservaron `require_parameters: true`, `allow_fallbacks: false`, `data_collection: deny` y `zdr: true`.
- Astra añadió una restricción explícita a Azure. Es una diferencia de routing documentada: permite reservar según los endpoints que realmente se autorizan, incluyendo sus tarifas de caché y niveles de precio, sin contar proveedores no permitidos.
- Proveedores observados: Astra/Azure y Opus/Amazon Bedrock, **ambos mediante OpenRouter**, no una integración directa nueva.
- Opus recibió la misma auditoría GPT-5.4 medium, máximo 8.000 tokens, con corpus y prompt iguales por comparación exacta.
- Se ejecutaron secuencialmente para no duplicar disponibilidad del presupuesto.

## Astra: fallo de entrega del proveedor, no de conteo

Las respuestas conservaron el modelo exacto `openai/gpt-6-astra`, pero finalizaron con `finish_reason: error`. En el objeto de error de la respuesta, Azure devolvió código 502 y `error_type: provider_unavailable`.

El segundo intento mantuvo exactamente la configuración y el encargo del primero. Fue una repetición por error de proveedor, no una reparación semántica. No se hizo un tercer intento, no se aceptó un fragmento como narración ni se llamó al auditor sobre texto incompleto.

El segundo fragmento terminó a mitad de una frase y usó 687 tokens de salida, muy por debajo del límite de 5.000. **No hay base para atribuir el fallo a una cuota de palabras o al límite de tokens.** Tampoco demuestra que todos los proveedores de Astra fallen: solo se probó esta ruta privada hacia Azure.

Las dos respuestas contienen `usage.cost: 0`. Sus costes internos `upstream_inference_cost` son 0,04175 y 0,07155 USD, respectivamente; se conservan en la evidencia, pero no se confunden con el coste reportado al cliente. No se dedujo gratuidad simplemente del error: aquí sí hubo un campo de coste explícito. No quedaron reservas ni exposición desconocida nuevas.

## Opus: lectura editorial y factual

### Lo que hizo bien

- Completó la extensión de una vez y mantuvo un hilo entre fachada, forma, funciones e historia.
- Separó los episodios de 1939 y 1943 sin convertir la detención en acogida voluntaria.
- Asignó correctamente los dieciséis lados al edificio, no al ruedo.
- Usó preguntas y retomó al final el detalle del ladrillo.
- No hizo falta otra llamada para ampliar o comprimir la narración.

### Lo que no daría por aprobado solo porque el auditor diga cero

**Causalidad añadida.** «Guarda ese detalle, porque explica una parte incómoda de su historia» conecta corrales, dependencias y atención médica con el uso como lugar de detención. Luego afirma que el recinto resultaba útil para ello precisamente por cómo había sido construido. El material documenta la saturación de La Aurora y el uso de la plaza, pero no esa explicación sobre por qué se eligió el edificio. El auditor la aceptó como inferencia autorizada. Yo la quitaría o la formularía sin presentarla como explicación histórica demostrada.

Además, no debe convertirse el aforo posterior a 2010 en una prueba sobre la capacidad o las condiciones del recinto de 1939. Esto importa más que pequeñas diferencias de palabras.

**Lenguaje del proceso dentro del audio.** «Es un proyecto formulado así, en futuro» y «la intención está documentada; el calendario de hoy, no te lo voy a inventar» muestran al visitante cómo estamos gestionando las fuentes. Puede ser una precaución metodológica sensata, pero no es la voz inmersiva que buscamos. Se puede contar el proyecto sin explicar el prompt ni prometer su estado actual.

Otros puntos de edición, de menor prioridad:

- La lista completa de instalaciones y la frase larga sobre festejos tienen un tono de inventario.
- «Algo que casi nunca se cuenta» presupone un conocimiento de otras narraciones que no tenemos. Es un recurso de autoridad que no aporta un hecho necesario.
- «Hoy rodean también salas…» debe distinguir espacios documentados de una comprobación de actualidad. No equivale necesariamente a afirmar que haya actividad cultural hoy, pero eliminar esa ambigüedad sería sencillo.
- El pasaje de restauración habla de una demora de dos años; «dos años más de lo previsto» añade una interpretación sobre el plazo previsto. Preferiría limitarme a inicio en 2017 y reapertura en 2019, sin convertir esa ambigüedad en otro bloqueo de todo el guion.

No reescribí el original ni lancé una reparación para mejorar artificialmente su resultado.

## Qué dice esto de nuestro enfoque

Tenemos otra narración completa en una sola escritura. Eso es una buena señal para un proceso de borrador completo más revisión ligera.

Lo que **no** hemos demostrado es publicación factual autónoma. El mismo auditor que objetó la referencia contextual de Sol a Europa en la Segunda Guerra Mundial aceptó aquí una explicación causal más específica sobre el uso del recinto. Los flags no son una clasificación fiable por sí solos.

Mi decisión por ahora sería conservar Sol y Opus como candidatos, sin cambiar el modelo de producción. Opus muestra más intención de guía en algunos enlaces; Sol cuesta algo menos y fue más rápido en esta muestra. La diferencia económica total es de unos **1,8 céntimos por parada**, demasiado pequeña para elegir sin que el usuario valore antes cuál le apetece escuchar. Ninguno justifica volver a un bucle de decenas de reparaciones.

Astra queda pendiente de una prueba con entrega estable. No merece una puntuación de calidad basada en fragmentos cortados por el proveedor.

## Gasto y saldo

Se hicieron cuatro peticiones de inferencia en este turno: dos escrituras fallidas de Astra, una escritura de Opus y una auditoría de Opus.

Opus:

- 6.061 tokens de entrada y 1.888 de salida, incluidos 493 de razonamiento.
- Escritor: **0,077505 USD**.
- Auditor: **0,0984975 USD**; 4.293 tokens de entrada y 5.851 de salida, incluidos 3.884 de razonamiento.
- Total: **0,1760025 USD**.

Astra: cero reportado al cliente en ambas respuestas, con los costes internos separados como se explica arriba.

De la autorización adicional de **2 USD**, Sol había utilizado 0,1577475 USD y esta tanda añade 0,1760025 USD. Total reportado de esa autorización: **0,33375 USD**. Saldo: **1,66625 USD**. No se reinició el histórico ni se liberaron las exposiciones desconocidas de campañas previas.

## Cambios y comprobación

Solo se ampliaron el piloto experimental `narrative-plain-writer-pilot-v8.ts` y su test. Se añadieron los dos modelos, el razonamiento low de Astra, su transporte moderno y su restricción de proveedor; las reservas de los nuevos modelos incorporan las tarifas de caché anunciadas y todos los niveles de precio elegibles. No se modificaron producción, RAG, fuentes ni infraestructura.

Pasaron **28 tests locales** y `git diff --check`. Se revisó el diff y se corrigieron los defectos de la primera implementación del worker antes de cualquier inferencia. Después se verificaron los mensajes originales, la configuración, los modelos devueltos, las condiciones de cierre, las llamadas realmente ejecutadas y los presupuestos asentados.

## Evidencia y textos

- Astra: [respuesta parcial del intento 1](../../backend/tmp/narrative-plain-writer-pilot-v8/malagueta-author-astra-low-20260906-1/writer-response.private.json) y [respuesta parcial del intento 2](../../backend/tmp/narrative-plain-writer-pilot-v8/malagueta-author-astra-low-20260906-2/writer-response.private.json).
- Opus: [narración original](../../backend/tmp/narrative-plain-writer-pilot-v8/malagueta-author-opus5-medium-20260906-1/narration.md), [entrada](../../backend/tmp/narrative-plain-writer-pilot-v8/malagueta-author-opus5-medium-20260906-1/inputs.private.json), [auditoría](../../backend/tmp/narrative-plain-writer-pilot-v8/malagueta-author-opus5-medium-20260906-1/audit.private.json), [resultado y presupuesto](../../backend/tmp/narrative-plain-writer-pilot-v8/malagueta-author-opus5-medium-20260906-1/results.private.json).
- [Sol y su narración original](narrative-author-sol-success-20260906.md).
- [DeepSeek, Kimi y GLM](narrative-author-context-results-20260906.md).

## Narración original de Opus 5 — sin editar

Empecemos por el ladrillo. Ese aparejo que recorre el exterior no es un revestimiento cualquiera: es la fachada original, recuperada en una restauración que arrancó en 2017, se alargó dos años más de lo previsto y acabó abriendo al público en 2019. Con ella volvieron a la vista los elementos decorativos exteriores. Y aquí viene la pregunta que quiero dejarte: si hubo que recuperar la cara de este edificio, ¿cuántas cosas distintas ha sido por dentro?

Vamos por partes. Lo primero es lo que anuncia su forma. La plaza es de estilo clasicista y tiene planta de hexadecágono: dieciséis lados. Si sigues el contorno con la mirada, verás que no es un círculo perfecto, sino una sucesión de tramos rectos que se van cerrando sobre sí mismos. Ese perímetro encierra un ruedo de cincuenta y dos metros de diámetro y un aforo que, tras la reforma de 2010, quedó en 9.032 espectadores. Nueve mil personas en una tarde: piénsalo un momento, porque es una cifra de ciudad, no de barrio.

Detrás de ese ruedo hay algo que casi nunca se cuenta: una maquinaria. Cuatro corrales, diez chiqueros, caballerizas, una corraleta para probar caballos, sala de toreros, enfermería. Es decir, un edificio pensado para alojar animales, personal y atención médica dentro de sus muros. Guarda ese detalle, porque explica una parte incómoda de su historia.

En 1939, en los últimos meses de la Guerra Civil, el campo de concentración de prisioneros de Málaga, que estaba en la fábrica y cuartel de La Aurora, se saturó. Los militares sublevados recurrieron entonces a esta plaza de toros para ese mismo fin. No hablamos de gente que buscara aquí cobijo: hablamos de prisioneros. Y un recinto amurallado, con dependencias y capacidad para miles de cuerpos, resultaba útil para eso precisamente por lo que había sido construido.

Cuatro años después, en 1943, el edificio volvió a albergar detenidos, y esta vez el contexto era otro: refugiados extranjeros que habían huido de Francia durante la Segunda Guerra Mundial. Dos episodios distintos, dos guerras distintas, y en ambos casos personas retenidas. No hace falta imaginar escenas ni poner nombres a nadie; basta con saber que ocurrió aquí, entre estos dieciséis lados, para que el edificio deje de ser solo un coso.

Luego llegó el reconocimiento. En 1976, coincidiendo con el centenario de su inauguración, fue declarada conjunto histórico-artístico; en 1981, bien de interés cultural. Y su vida taurina siguió: es una plaza de primera categoría, de temporada, con dos corridas en Semana Santa —una de ellas llamada Corrida Picassiana—, la Corrida de la Prensa en junio, por los santos patronos San Ciriaco y Santa Paula, los festejos de la Feria de Agosto y una corrida en septiembre, por la festividad de la Patrona malagueña.

Volvamos entonces al ladrillo del principio. Aquella restauración no se limitó a la piel: reorganizó el espacio interior para acoger nuevos espacios expositivos y salas de congresos, con la idea declarada de convertir La Malagueta en un centro cultural con uso durante todo el año. Es un proyecto formulado así, en futuro, y así te lo cuento: la intención está documentada; el calendario de hoy, no te lo voy a inventar.

Si te quedas con una sola imagen de esta parada, que sea esa: dieciséis lados de ladrillo que han rodeado un ruedo, han rodeado a personas detenidas y hoy rodean también salas pensadas para congresos y exposiciones. El mismo perímetro; usos que no se parecen en nada.

