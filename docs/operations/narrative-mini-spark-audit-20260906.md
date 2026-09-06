# GPT-5.4 mini y Codex Spark: auditoría focalizada

Fecha: 2026-09-06. Se repitieron Palacio Real y Puerta de Alcalá con el texto, evidencia y prompt baseline usados para Opus. No se regeneró el tour ni se cambió producción. Razonamiento low en ambos modelos. Muestra de dos paradas, no evaluación general.

| Modelo | Palacio | Alcalá | Resultado en los dos detalles sin respaldo | Coste API reportado |
|---|---:|---:|---|---:|
| openai/gpt-5.4-mini | 12,130 s | 12,222 s | Ambos aceptados | 0,034569 USD |
| gpt-5.3-codex-spark | 10,894 s | 8,612 s | Ambos aceptados | Sin llamada API de pago; cuota ChatGPT/Codex |

Las cuatro respuestas pasaron el esquema completo y el parser, sin normalización ni reparación. Esto verifica el contrato, no la exactitud de la auditoría. Mini se ejecutó mediante OpenRouter con proveedor reportado OpenAI; Spark mediante el CLI autenticado con ChatGPT, sesión efímera, herramientas y búsqueda deshabilitadas, sandbox read-only y esquema de salida. Los eventos de Spark contienen únicamente respuestas del agente, sin ejecución de herramientas. Sus tiempos incluyen arranque del proceso; los de Mini son latencia de llamada, por lo que no constituyen una comparación de rendimiento estrictamente idéntica.

## Hallazgo compartido

- `Q171517-S013`: aceptan toda la frase porque el pasaje respalda bóvedas sin madera, sin justificar la cláusula sobre visibilidad desde el exterior.
- `Q1140634-S028`: aceptan toda la frase porque el pasaje respalda que Bretón de los Herreros perdió un ojo, sin justificar el calificativo «escritor».

Los detalles no se declaran históricamente falsos: no están respaldados por la evidencia suministrada. GPT-5.4 es referencia comparativa, no verdad establecida.

Spark funciona efectivamente con la sesión disponible. Su consumo reportado fue 23.030 tokens de entrada y 11.248 de salida, de estos 6.598 de razonamiento. No se conoce el porcentaje de cuota que representa ni se convierte a un coste monetario hipotético.

## Decisión

Ninguno resuelve los dos casos difíciles con el contrato actual. Spark queda como candidato accesible para experimentar sin gasto API adicional, no como auditor aprobado. Sigue pendiente probar descomposición explícita de afirmaciones con comprobación de cobertura, redondeos y falsos positivos. Esta prueba no modifica código de implementación ni configuración de producción.

## Evidencia y presupuesto

Artefactos bajo `backend/tmp/narrative-v8/`:

- `madrid-mini54-palacio-20260906`: entradas, respuesta, comparación y gasto.
- `madrid-mini54-alcala-20260906`: entradas, respuesta, comparación y gasto.
- `madrid-spark53-focused-20260906`: esquemas, eventos originales, respuestas validadas y resultados. Las entradas son los casos guardados de `madrid-opus48-palacio-20260906/inputs.private.json` y `madrid-opus48-alcala-20260906/inputs.private.json`; se añadió sólo la instrucción de devolver JSON sin conocimiento externo ni herramientas.

Acumulado conservador tras Mini: 1,504696510828 USD de un límite de 2 USD. Incluye exposición anterior no confirmada de 0,3301206 USD. Gasto reportado acumulado excluyendo esa exposición: 1,174575910828 USD. Spark usa cuota de Codex y no forma parte de ese contador API.
