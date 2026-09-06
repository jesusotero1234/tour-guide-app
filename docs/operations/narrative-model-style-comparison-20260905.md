# Referencia de estilo: Qwen local, Gemini 2.5 Pro y control Mini

## Veredicto

Los dos modelos solicitados se probaron en La Malagueta, con las fuentes y el ejemplo de Plaza Mayor ya usados con GPT-5.4 Mini. **Ninguno produjo una primera versión que cumpla duración y experiencia narrativa.** Gemini es el más limpio editorialmente en esta muestra, pero sigue siendo un resumen corto. No se promueve ningún modelo ni se inicia fine-tuning.

| Escritor | Palabras / objetivo 562 | Objeciones del mismo auditor GPT-5.4 | Tiempo del comando, escritura + auditoría | Coste reportado del par, USD |
| --- | ---: | ---: | ---: | ---: |
| GPT-5.4 Mini, control histórico | 339 | 0 | 32,870 s | 0,05314600 |
| Qwen local, variante cuantizada instalada | 452 | 1 | 52,463 s | 0,07873250 |
| Gemini 2.5 Pro | 376 | 0 | 41,149 s | 0,07792500 |

Los tres fallan el indicador agregado de narración ±10%, calculado sobre esta única parada. Qwen sí entra en el margen local ±20%; los otros dos no. No se usa el objetivo estrecho del writer como una barrera adicional. No es una medición de un tour completo ni de TTS.

## Leer los originales sin editar

- [Qwen local: 452 palabras](../../backend/tmp/narrative-writer-briefing-pilot-v8/editorial-first-malagueta-qwen-style-20260905-1/Q523311-editorial_packet.md).
- [Gemini 2.5 Pro: 376 palabras](../../backend/tmp/narrative-writer-briefing-pilot-v8/editorial-first-malagueta-gemini-style-20260905-3/Q523311-editorial_packet.md).
- [GPT-5.4 Mini: 339 palabras, control previo](../../backend/tmp/narrative-writer-briefing-pilot-v8/editorial-first-malagueta-style-20260905-1/Q523311-editorial_packet.md).
- [Referencia de Plaza Mayor aceptada por el usuario](narrative-plaza-mayor-reference-20260905.md).

## Qué mantuvimos y qué cambió

Misma parada Q523311, mismo checkpoint de Málaga, ocho fichas seleccionadas y siete pasajes, mismas exclusiones, instrucciones editoriales, ejemplo completo y objetivo de 562 palabras / 281 segundos estimados. Auditor GPT-5.4, razonamiento medio y máximo 8.000 tokens, en ambos casos nuevos y en el control Mini. Ningún auditor recibe el ejemplo de Madrid como evidencia. Sin investigación nueva ni RAG nuevo.

El perfil existente de Gemini también cambia el auditor a Mini; para evitar ese factor se añadió selección de escritor **solo en el piloto**, manteniendo `qwen38_hybrid` como perfil base. No se alteraron los perfiles de producción.

- Qwen: alias `qwen-local`, endpoint local existente; fichero servido `/home/jesusotero/Models/Qwen3.8-27B-GSQ/Qwen3.8-27B-GSQ-RCO-IQ3_XXS.gguf`. El servidor informa unos 26,9B parámetros y tipo `IQ3_S - 3.4375 bpw`; esa diferencia con el nombre del archivo se registra sin reinterpretarla. Es la variante instalada, no una evaluación de todos los pesos Qwen3.8 ni de un ajuste nuevo. Temperatura solicitada 0,7, semilla 42 por el cliente, máximo 4.000 tokens. El helper declara razonamiento `none`; el cliente local no envía un override explícito de thinking, por lo que no se presenta como una prueba separada de modos de razonamiento del servidor.
- Gemini: `google/gemini-2.5-pro`, proveedor real Google vía OpenRouter, razonamiento bajo, máximo 4.000 tokens; sin temperatura explícita, igual que el perfil existente. Se preservó su configuración de retención cero.

No son parámetros de muestreo idénticos entre proveedores. Se evalúan estas configuraciones concretas, una salida por modelo, con un control histórico; no se demuestra una tasa de éxito general ni una diferencia estadística.

## Compatibilidad de Gemini y contabilidad de intentos

1. Run Gemini `...-1`: rechazo local antes de HTTP porque la cota conservadora calculada (0,169038 USD) superaba la subreserva inicial de 0,15 USD. No hubo gasto ni exposición. Se ajustó la asignación interna a 0,20 USD sin cambiar el techo total autorizado.
2. Run Gemini `...-2`: HTTP 400 de Google. El proveedor rechazó la complejidad del esquema, indicando demasiados estados del autómata de restricciones. No generó narración. No reportó uso, de modo que se conservaron **0,169038 USD como exposición no verificada**, no como coste facturado confirmado.
3. Qwen `...-1`: una escritura válida, seguida de una auditoría; sin reparación.
4. Gemini `...-3`: una escritura válida y una auditoría, tras adaptar el esquema de transporte; sin reparación del texto.

La adaptación elimina **solo `paragraphs.maxItems` del esquema enviado a Gemini**. El parser del backend sigue rechazando más de 40 párrafos; se conservan referencias, IDs, texto no vacío y los criterios de duración/factualidad. Esquemas original y de transporte quedan guardados. La documentación de Google identifica límites largos de arrays entre las causas de complejidad de esquemas: [salida estructurada](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/control-generated-output). No se afirma que Gemini no admita `maxItems` en general.

El esquema remoto, por tanto, no es idéntico entre todos los brazos; el contrato de aceptación del backend sí se mantiene. Aserciones locales comprobaron igualdad de contenido, prompt de escritura, esquema original, corpus y prompt del auditor entre Mini, Qwen y Gemini. Para Gemini comprobaron también que el único cambio de esquema remoto fue quitar ese máximo.

Hubo cinco solicitudes de generación/verificación en esta tanda: una local Qwen y cuatro en OpenRouter, incluyendo el HTTP 400. El rechazo anterior a HTTP no cuenta como solicitud enviada. Los trabajos mecánicos del worker local no forman parte del conteo narrativo. No se incluyen como si fueran llamadas de escritores o auditores del tour.

## Lectura de calidad

Codex leyó los textos completos, el corpus local y las respuestas del auditor, sin edición posterior de las salidas.

### Qwen

La escritura tardó **17,276 segundos**. Terminó con `stop`, 1.055 tokens de salida sobre un máximo de 4.000: no se truncó por ese límite.

El auditor objetó «el interior, por ahora, no se deja ver desde fuera». La precaución de no prometer visibilidad no autoriza afirmar invisibilidad. Persiste además lenguaje como «La fuente menciona…», «según la fuente» y «Son datos de contexto»; parte del briefing acaba en la voz del guía. Su desarrollo sigue la enumeración de fichas más que una historia oral.

Hay otra cautela relevante en la lectura de Codex, no incluida en la única objeción del auditor: «No es un hecho consumado hoy» y «ahora, en proyecto, centro cultural» convierten el futuro expresado por un pasaje guardado en una afirmación sobre el estado actual. Que el corpus no demuestre un uso vigente no demuestra que ese uso no exista. No debe publicarse esa certeza inversa sin evidencia actual.

### Gemini

La escritura válida tardó **15,872 segundos**. Terminó con `stop`, 1.738 tokens de salida contabilizados, incluidos 797 de razonamiento, sobre el máximo de 4.000: tampoco se truncó.

No incorpora «la fuente» ni hechos reconocibles de Madrid. Separa los episodios de 1939 y 1943 y explica hexadecágono como dieciséis lados. La voz es más limpia que en Qwen o Mini, pero abre como ficha, enumera calendario y medidas y acaba en una conclusión abstracta. Sus 376 palabras no desarrollan suficientemente el objetivo.

El auditor no encontró objeciones. La lectura no identificó un nuevo error material claro equivalente al de visibilidad de Qwen. «Más cercana a como fue concebido» es una interpretación del aspecto restaurado, no una reconstrucción histórica demostrada de todo el edificio; «finalizó en 2019» deriva de la apertura descrita y no aporta verificación independiente de todas las obras. Cero objeciones no equivale a certeza absoluta ni a buena experiencia oral.

## Costes y saldo vigente

| Concepto nuevo de esta tanda | USD |
| --- | ---: |
| Escritura local Qwen, coste API reportado | 0 |
| Auditoría de Qwen | 0,07873250 |
| Escritura válida Gemini | 0,02095500 |
| Auditoría de Gemini | 0,05697000 |
| Total nuevo reportado | **0,15665750** |
| Exposición no verificada del HTTP 400 | **0,16903800** |
| Total nuevo contabilizado | **0,32569550** |

La inferencia local consume equipo, electricidad y tiempo; cero coste API no significa operación gratuita. La auditoría explica casi todo el coste del par Qwen.

De la autorización original de 2 USD: **0,82271090 USD contabilizados**, saldo **1,17728910 USD**. Acumulado histórico del guard **8,29426025 USD**, techo **9,47154935 USD**, reservas pendientes cero. No se han reiniciado contadores ni descontado la exposición sin comprobación.

## Cambios y validación

Solo implementación experimental en `backend/scripts/validation/narrative-writer-briefing-pilot-v8.ts` y sus tests en `backend/src/services/poi/NarrativeEditorialPacketPilotV8.test.ts`: selección de escritor sin cambiar auditor, precios requeridos solo para proveedor remoto, temperatura del escritor aislada y adaptación de esquema Gemini con trazabilidad.

**17 tests enfocados pasan**, incluidos selección sin mutar perfiles, conservación del auditor, adaptación sin mutar el esquema y rechazo de 41 párrafos. Dry-runs, ejecuciones reales, comprobación de inputs y `git diff --check` completados. Los errores locales de compilación y una aserción mal escrita durante la preparación se corrigieron antes de usar sus resultados como evidencia; no se ocultan como éxitos iniciales.

No se modificaron producción ni RAG ni se relajaron los objetivos para hacer pasar salidas. No hay un canario completo nuevo, fine-tuning o proceso de esta tanda en ejecución.

## Decisión

Si hubiera que elegir solo entre estos borradores, preferiría Gemini por limpieza y prudencia frente a Qwen, pero **no alcanza todavía el objetivo completo**. El resultado no justifica promoverlo como solución de one-shot ni entrenar Qwen inmediatamente.

La repetición de textos cortos y de lenguaje editorial en varios modelos apunta a revisar cómo se presenta y se prioriza el encargo, además de la capacidad narrativa real del material. Es una hipótesis, no una causa probada: este experimento no aísla formato, instrucciones, estilo aprendido ni selección de contenido. No se gastará automáticamente el saldo en más variantes ni se atribuirá todo a un modelo incapaz de contar palabras.
