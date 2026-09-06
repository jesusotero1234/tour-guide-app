# Mini versus Nano en preparación — 2026-09-06

## Decisión

No sustituir GPT-5.4 Mini globalmente por Nano con esta evidencia. Nano es un candidato económico para el curador, sujeto a auditoría semántica y validación adicional. No queda aprobado para seleccionar el núcleo ni para construir el arco. Astra low vía Codex sigue siendo la opción elegida para sustituir al auditor GPT-5.4; esta prueba no modifica la configuración de producción.

## Alcance y resultados

Se usaron capturas guardadas del canario `codex-Q2807-20260906-115441`, sin repetir investigación web. Curación: seis comparaciones nuevas con la misma entrada para Mini y Nano, ejecutadas en paralelo por parada. Núcleo: tres ejecuciones Nano frente a respuestas Mini históricas con huella de prompt comprobada. Arco: entrada fija con los dossiers originales Mini para aislar esa etapa. Razonamiento `none`, máximo 6000 tokens, un intento, sin reparación semántica automática. No es un canario completo ni una reproducción de las ocho rondas originales del curador.

| Curación, seis paradas | Mini | Nano |
| --- | ---: | ---: |
| Coste informado USD | 0.03369120 | 0.01016881 |
| Proposiciones propuestas/admitidas | 72/71 | 63/63 |
| Mínimo de evidencia superado | 6/6 | 6/6 |
| `writerReady` automático | 2/6 | 6/6 |
| Latencia sumada de llamadas | 47.185 s | 53.739 s |

Nano ahorra aproximadamente 69.8 % en estas llamadas, pero no fue más rápido en conjunto. Mini careció de `tension_or_contrast` en Plaza Mayor, Cibeles, Alcalá y Colón. Nano quedó dentro del intervalo solicitado de proposiciones en cada parada. Las compuertas comprueban estructura/cobertura y no certifican fidelidad semántica.

Revisión puntual: Nano asignó a la transformación de Cibeles una cita que sí describe el cambio de uso, pero no contiene la fecha 1895 incluida en su proposición. Esto limita la interpretación de sus 63 admisiones como prueba de calidad. Mini tampoco es una verdad de referencia: su dossier de Plaza Mayor conserva una cronología incoherente presente en la fuente (1560 después de 1561). Algunas etiquetas de tensión de Nano son hechos históricos sin un contraste explícito. No se realizó una auditoría semántica exhaustiva de las 134 proposiciones admitidas.

## Núcleo y arco

Nano produjo tres respuestas estructuralmente válidas, por USD 0.00970765. Sus conjuntos obligatorios fueron:

- A: Q1140634, Q171517, Q849711.
- B: Q171517, Q1123493.
- C: Q171517, Q2473884, Q1140634, Q1123493.

Solo Q171517 aparece en los tres. Mini histórico tampoco fue perfectamente estable, pero mantuvo Q171517, Q1140634 y Q1123493 en sus tres respuestas. No se ejecutó el resolutor agregado de Nano ni se aprobó una ruta alternativa; esta diferencia impide afirmar equivalencia de comportamiento.

El arco Nano falló la validación semántica: utilizó `plaza de Colón` como `bridgePropositionId`, inexistente en los dossiers. Coste USD 0.00325410. La llamada Mini equivalente fue bloqueada antes de empezar por la reserva conservadora de gasto. Por tanto, la comparación de arco está incompleta; el fallo Nano sí es real y no de transporte.

## Presupuesto e incidencias

La primera ejecución rechazó incorrectamente los identificadores fechados del proveedor; fue un error del arnés, no de calidad del modelo. Se interrumpió y se admitieron únicamente los alias verificados en el catálogo del proveedor. Esa ejecución informó USD 0.08499860 y dejó USD 0.01067726 de exposición conservadora no verificada. No se utilizaron sus respuestas para evaluar calidad.

La ejecución corregida informó USD 0.05682176, con 16 llamadas realizadas. El gasto conservador acumulado de la serie queda en USD 1.896082210828 sobre el límite USD 2. El saldo no bastó para la reserva máxima de la llamada Mini del arco; no se amplió el límite. Coste informado de esta ronda incluyendo la incidencia: USD 0.14182036, más la exposición no verificada indicada.

## Evidencia y cambios

Resultados y entradas privados: `backend/tmp/narrative-v8/mini-nano-preparation-fixed-20260906/{results,inputs}.private.json`, más las respuestas individuales. Los hashes SHA-256 de checkpoint y core originales se comprobaron sin cambios después de la ejecución. Estado global: `incomplete`, `publicationPassed: false`.

Se añadió únicamente un arnés de comparación (`backend/scripts/validation/narrative-mini-nano-prep-replay-v8.cjs`) y este informe, además de artefactos locales de ejecución. No se cambiaron perfiles de producción. La validación de importación/preparación del arnés pasó; la ejecución real terminó con el bloqueo de presupuesto descrito. Los resultados fueron agregados y revisados por Codex después de las comprobaciones deterministas del worker.
