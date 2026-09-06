# Última comparación: GPT-5.6 Luna low por Codex

Fecha: 2026-09-06. Modelo seleccionado: `gpt-5.6-luna`, razonamiento `low`, sesión ChatGPT mediante Codex CLI. Se ejecutaron las seis paradas de Madrid, una llamada por parada, sin reintentos ni reparación. Las entradas, prompts, esquemas y reglas coinciden con el replay anterior de Astra; se comprobó igualdad de casos y hashes originales sin cambios.

## Resultado

**5/6 auditorías válidas**, correspondientes a **189 frases**. La sexta devolvió los 36 checks esperados, pero el parser la rechazó por una cita duplicada. Tiempo acumulado: **320,851 s (5,35 min)**. Astra completó 6/6 en 492,010 s y GPT-5.4 original registró 256,447 s. Estos tiempos son observaciones de ejecuciones individuales; Codex incluye arranque de proceso.

| Caso | Luna | Evaluación de la evidencia |
|---|---|---|
| Plaza Mayor S007, «mercado principal de Madrid» | distorted | Falso positivo: «la villa» se refiere a Madrid en el contexto suministrado. No cambia el alcance territorial. |
| Palacio S013, visibilidad exterior | unsupported | Detecta la falta de evidencia específica. Coincide con GPT-5.4; Astra la había analizado como inferencia prudente. |
| Plaza de España S004, «Hoy» | unsupported | Falso positivo: los pasajes describen la plaza en presente y sus proposiciones son visible_observation, no exclusivamente contexto histórico. |
| Cibeles S032, equivalencia de nombres del palacio | unsupported | Objeción fundada bajo el contrato: los pasajes no explicitan que Palacio de Comunicaciones y Palacio de Cibeles sean el mismo edificio. |
| Cibeles S033, cambio de función | Aceptada | No señala la falta de documentación del uso anterior que detectó Astra. |
| Alcalá S028, «escritor» | supported | Omisión: cita la pérdida del ojo, pero no respalda la profesión. Astra y GPT-5.4 sí lo señalaron. |

La auditoría de Colón falla en `Q970525-S034`: `p-8e1b8afd92e50ad3ca98` aparece dos veces en passageIds. El esquema JSON pasó; la validación semántica exige citas únicas y rechazó el resultado. **No es una referencia inventada** ni una omisión de frases. No se deduplicó ni se volvió a llamar al modelo para mantener el mismo criterio sin reparación aplicado a Astra. No se consideran aceptados los resultados de esa parada.

## Conclusión

**Mi elección sigue siendo Astra low por Codex para este caso.** Luna es más rápido en esta ejecución y aporta una objeción útil sobre la identidad del edificio, pero introduce dos rechazos injustificados y deja pasar el calificativo sin respaldo de Alcalá. La preferencia se basa principalmente en esos errores de contenido, no en la duplicación de una cita, que es un defecto de formato menor aunque el contrato la rechace.

No es un ranking general ni una estimación de precisión: es un único tour, sin réplicas, y GPT-5.4 no constituye verdad establecida. El caso de visibilidad del Palacio sigue siendo una diferencia de criterio entre inferencia prudente y exigencia de soporte específico. El escritor del tour también fue Astra, por lo que su auditoría no representa diversidad de modelo. Ningún resultado habilita publicación automática.

## Coste, cambios y validación

Gasto API adicional: **0 USD**; se utilizó cuota ChatGPT/Codex. Uso reportado de las seis llamadas, incluida la inválida: **72.961 tokens de entrada**, **16.672 de salida**, de ellos **2.705 de razonamiento**. No se convierte a porcentaje de cuota ni a dólares hipotéticos. El contador API conservador sigue en 1,504696510828 USD, incluida exposición anterior no confirmada de 0,3301206 USD.

Se amplió únicamente `backend/scripts/validation/narrative-astra-audit-replay-v8.ts` con `--model=gpt-5.6-luna`; el valor predeterminado sigue siendo Astra. El helper de argumentos verifica selección de modelo y preserva las restricciones del transporte. Se revisó el diff de Qwen, se corrigió la validación del valor de `-m` y pasaron las comprobaciones offline de selección, preservación de argumentos, opciones inválidas, duplicados y dry-run sin escrituras. No se modificó producción, el tour ni el transporte compartido.

Artefactos completos: `backend/tmp/narrative-v8/madrid-luna-low-audit-20260906/`, con entradas, resultados, comparación y eventos privados por parada. La ejecución conserva estado `incomplete` por el rechazo de Colón, aunque las seis llamadas terminaron.
