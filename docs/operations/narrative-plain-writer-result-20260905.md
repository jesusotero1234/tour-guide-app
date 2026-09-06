# Contraste de escritura libre — La Malagueta

## Resultado

Una escritura con Gemini 2.5 Pro y una auditoría con GPT-5.4, ambas válidas al primer intento. **La voz mejora parcialmente, pero no alcanza el objetivo de duración y aparece una distorsión factual material.** No se modifica el original ni se lanza otra generación para conseguir aprobación.

[Leer el guion generado completo, sin editar](../../backend/tmp/narrative-plain-writer-pilot-v8/malagueta-plain-gemini-20260905-1/narration.md).

| Medida | Gemini con paquete y esquema | Gemini con encargo y texto libres |
| --- | ---: | ---: |
| Palabras, objetivo 562 | 376 | 445 |
| Objeciones del auditor GPT-5.4 | 0 | 2 |
| Tiempo escritura + auditoría | 41,149 s | 56,316 s |
| Coste reportado escritura + auditoría, USD | 0,07792500 | 0,10327625 |

Ambos fallan la entrega de narración. La versión libre queda 117 palabras por debajo del objetivo: aproximadamente 58,5 segundos menos bajo el supuesto de 120 palabras/minuto. El margen local ±20% se supera por poco, pero el problema no se reduce a unas pocas palabras en el borde: también falla el indicador agregado ±10% de esta parada y hay errores de contenido. No se extrapola esta medida a un tour completo ni se presenta como duración TTS.

## Intervención y controles

Run `malagueta-plain-gemini-20260905-1`, carpeta `backend/tmp/narrative-plain-writer-pilot-v8/`.

Se tomó el caso guardado de Gemini anterior y se enviaron sus **siete pasajes originales completos** como texto, sin IDs. No se añadió historia nueva ni se consultó el RAG. Se conservó la referencia íntegra de Plaza Mayor y el objetivo de 562 palabras / 281 segundos. El encargo nuevo está guardado en [el briefing en lenguaje natural](narrative-malagueta-plain-brief-20260905.md).

El escritor recibe dos mensajes de texto; la solicitud no contiene `response_format`, herramientas, funciones ni un esquema de salida. No recibe las fichas estructuradas ni sus instrucciones anteriores: el nuevo encargo resume las precauciones relevantes en lenguaje editorial. Por eso esta prueba cambia presentación y redacción del encargo a la vez; **no aísla el efecto exclusivo de quitar JSON**.

El auditor recibe exactamente el corpus y prompt anteriores, con las nuevas frases. No ve la referencia de Madrid como evidencia. Aserciones locales comprobaron identidad de pasajes y del input/prompt factual del auditor, presencia literal de cada pasaje en el mensaje del escritor, ausencia de sus IDs y ausencia de herramientas o `response_format`.

Gemini: `google/gemini-2.5-pro`, vía OpenRouter, razonamiento bajo, máximo 4.000 tokens y temperatura sin override, como el control. Se mantuvieron `data_collection: deny`, `zdr: true`, `allow_fallbacks: false` y `require_parameters: true`. Auditor: GPT-5.4, razonamiento medio y máximo 8.000 tokens. Sin reescritor, fitter ni reintento semántico.

## Lectura editorial y factual

Codex leyó el texto completo y las dos objeciones, comparándolos con los pasajes guardados y el borrador estructurado anterior.

La voz presenta una mejora: aparece una pregunta de curiosidad, se habla al visitante y los episodios de 1939 y 1943 reciben párrafos separados. Ya no enumera tantos datos de aforo y calendario. Aun así, mantiene abstracciones y frases de trabajo como «No hace falta imaginar escenas». No se ha recogido una nueva aprobación del usuario para este guion.

El auditor marcó:

1. «Era un reconocimiento a su valor arquitectónico y a su papel en la ciudad»: atribuye razones de la declaración patrimonial que el pasaje no explica. La declaración en sí está documentada; esa justificación añadida no.
2. «sirvió como refugio improvisado»: distorsiona el uso como **lugar de detención** descrito en la evidencia. Que algunos detenidos fueran refugiados no transforma el recinto en un refugio. Es una alteración del sentido, no una preferencia estilística.

La revisión propia identifica además una precisión no demostrada en «este mismo ruedo y estas mismas gradas» como lugares donde estuvieron los detenidos. La fuente identifica el recinto, no esas zonas concretas; el auditor no señaló esa parte. No se declara factualidad completa por contar únicamente dos objeciones.

La salida finalizó normalmente con `stop`: 1.281 tokens de salida contabilizados, incluidos 670 de razonamiento, lejos del máximo de 4.000. La brevedad no se debe a ese límite de transporte. La escritura tardó 13,363 segundos; el comando completo 56,316 segundos, sin incluir preparación y revisión.

## Coste y presupuesto

La reserva previa máxima del par fue de 0,85 USD, dentro del saldo existente. Se verificaron tarifas antes de la solicitud y se mantuvo el control acumulado de gasto. No hubo rechazos HTTP ni nueva exposición sin verificar en esta prueba.

- Escritor: **0,01515125 USD**.
- Auditor: **0,08812500 USD**.
- Total nuevo: **0,10327625 USD**.
- Total contabilizado de la autorización de 2 USD: **0,92598715 USD**.
- Saldo vigente: **1,07401285 USD**; reservas pendientes: cero.
- Acumulado histórico del guard: **8,397536500000001 USD**, techo **9,47154935 USD**.

El total de la autorización incluye las exposiciones conservadoras anteriores; no se borraron ni se volvieron a contar como gasto de esta prueba.

## Implementación y validación

Se creó un arnés aislado, `backend/scripts/validation/narrative-plain-writer-pilot-v8.ts`. Envía prosa real por HTTP, guarda petición y respuesta sin envolver la narración como JSON del modelo, conserva la contabilidad con `NarrativeProgressSpendGuardV6` y reutiliza el auditor existente. No cambia el cliente de producción ni el pipeline, el RAG o los perfiles.

Siete tests nuevos en `backend/src/services/poi/NarrativePlainWriterPilotV8.test.ts` pasan: cuerpo sin esquema, evidencia mínima, reserva antes de HTTP, una sola petición, coste desconocido no convertido a cero, errores sanitizados sin reintento y rechazo de truncamiento/modelo inesperado después de registrar el coste. Dry-run y ejecución real con Node 22 completados; igualdad de evidencia comprobada y revisión de cambios efectuada.

## Decisión

No promover esta variante ni declararla one-shot resuelto. Simplificar la interfaz de escritura no bastó en esta muestra: mejoró algunos rasgos de voz y extensión, pero no entregó la duración ni conservó todos los hechos correctamente. No demuestra que cualquier escritura libre vaya a fallar, ni que la estructura anterior fuera la causa única.

La comparación solicitada queda terminada, con sus salidas intactas. No hay otra generación o canario corriendo. Con esta evidencia no se justifica iniciar fine-tuning ni reconstruir toda la arquitectura. Para un producto reutilizable, la alternativa inmediata sigue siendo publicación con revisión editorial explícita, sin presentarla como automatización ya resuelta.
