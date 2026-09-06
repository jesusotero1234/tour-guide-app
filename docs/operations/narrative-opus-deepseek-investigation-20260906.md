# Opus 4.8 y diagnóstico de DeepSeek — 2026-09-06

## Conclusión

Opus no resolvió los dos casos difíciles seleccionados. DeepSeek sin razonamiento adicional reduce mucho el tiempo de respuesta, pero no queda validado como auditor estricto. Reforzar el prompt mejora los controles sintéticos en una ejecución, no la fiabilidad del tour real. No se cambia producción.

## Método y resultados

Texto y evidencia guardados del canario `backend/tmp/narrative-v8/codex-Q2807-20260906-115441`; hashes del checkpoint y revisión original comprobados sin cambios. No se regeneró el tour. GPT-5.4 es referencia comparativa, no verdad establecida. `valid` significa cumplimiento del contrato, no exactitud factual.

| Prueba | Resultado | Coste reportado USD |
|---|---|---:|
| Opus 4.8 low, Palacio | Válida, 29,8 s; deja pasar S013 | 0.127705 |
| Opus 4.8 low, Alcalá | Válida, 33,8 s; deja pasar S028 | 0.120625 |
| DeepSeek none, tour baseline | 3 válidas; cuarta falla formato; últimas 2 no ejecutadas | 0.002183006448 |
| DeepSeek none, primer prompt de cobertura | Primera válida; segunda devuelve array raíz incorrecto | 0.001209685932 |
| DeepSeek none, primeros controles de cobertura | 6 válidas, 28/29 etiquetas correctas | 0.000460625676 |
| DeepSeek none, cobertura y formato explícito, tour | 3 válidas; cuarta falla; últimas 2 no ejecutadas | 0.002382366672 |
| DeepSeek none, controles finales baseline | 6 válidas, 28/29 correctas | 0.000391153476 |
| DeepSeek none, controles finales cobertura | 6 válidas, 29/29 correctas | 0.000431237436 |

Modelos solicitados: `anthropic/claude-opus-4.8` y `deepseek/deepseek-v4-flash-0731`. La muestra de Opus son dos paradas, no el tour completo ni un ranking general. Los controles son seis casos pequeños con 29 frases; los resultados no estiman precisión en producción. Sus etiquetas esperadas no se enviaron al modelo. Las variantes intermedias y final tienen prompts distintos conservados en sus snapshots.

### Casos reales

- Palacio, Q171517-S013: la evidencia respalda bóvedas sin madera, pero no la afirmación adicional sobre lo que no puede apreciarse desde el exterior. Opus y DeepSeek la aceptan centrándose en el hecho principal.
- Alcalá, Q1140634-S028: la evidencia respalda que Bretón de los Herreros perdió un ojo, no el calificativo «escritor». Opus la acepta. No se considera demostrado que estos detalles sean falsos: falta respaldo en los pasajes suministrados.
- La variante final de DeepSeek sigue aceptando el caso del Palacio y rechaza incorrectamente «unos ciento veintiún metros ... por noventa y tres», aunque la evidencia dice 120,9 por 93,06. Este falso positivo desaconseja promover el prompt.
- En los controles finales baseline se rechaza indebidamente `bridge-S002`; cobertura acierta las 29 etiquetas. El contraste con Madrid demuestra la insuficiencia de estos controles para aprobar el cambio.

### Formato y velocidad

DeepSeek baseline con `reasoning=none` tardó 7,6–10,2 s por llamada en las cuatro llamadas realizadas. No basta para afirmar que completa las seis paradas: la cuarta devolvió JSON envuelto en Markdown. Esa respuesta concreta pudo recuperarse offline y pasó esquema completo y parser.

Se añadió al replay una normalización optativa y estrecha: retirar únicamente una envoltura completa de JSON, preservar la respuesta original y volver a aplicar todas las validaciones. No repara arrays raíz, truncamientos ni referencias inválidas. En la cuarta llamada del tour con el prompt final, retirar Markdown reveló una referencia ajena a los pasajes permitidos (`checks[36].passageIds[1]`); esquema y parser la rechazaron. Por tanto, ese fallo no es meramente cosmético.

## Cambios y validación

Sólo se amplió el script experimental `backend/scripts/validation/narrative-codex-audit-replay-v8.ts` y se añadió este informe. No se modificó el auditor de producción ni su configuración. Se conservaron los cambios ajenos del árbol de trabajo.

El replay incorpora selección optativa de controles, variante de cobertura y normalización de envoltura JSON, con valores predeterminados conservadores. Validación ejecutada: compilación/carga TypeScript durante las pruebas, casos positivos y negativos del normalizador, recuperación de la respuesta baseline con esquema/parser completos, rechazo de referencias ajenas y comprobación de hashes originales. No se ha ejecutado la suite completa de la aplicación, al no cambiar producción.

## Siguiente experimento propuesto, no implementado

Separar explícitamente cada frase en afirmaciones verificables, comprobar cada una contra pasajes concretos y agregar el resultado de forma determinista. La cobertura de esa separación también debe comprobarse: omitir «escritor» o la cláusula de visibilidad repetiría el mismo defecto. Incorporar controles de calificativos, visibilidad, identidad entre nombres, redondeos y enlaces narrativos antes de repetir las seis paradas. Mantener rechazos por referencias ajenas y medir falsos positivos además de omisiones.

## Artefactos y gasto

Directorios bajo `backend/tmp/narrative-v8/`: `madrid-opus48-palacio-20260906`, `madrid-opus48-alcala-20260906`, `madrid-deepseek-none-baseline-20260906`, `madrid-deepseek-claim-coverage-20260906`, `deepseek-controls-coverage-20260906`, `madrid-deepseek-coverage-json-20260906`, `deepseek-controls-final-baseline-20260906` y `deepseek-controls-final-claim-coverage-20260906`. Cada uno conserva entradas, resultados, progreso y gasto privados.

Gasto reportado de esta investigación: **0.25538807564 USD**, de los cuales **0.24833 USD** corresponden a Opus. Acumulado conservador de la comparación: **1.470127510828 USD** sobre límite de 2 USD; incluye **0.3301206 USD** de exposición anterior no confirmada, no facturación demostrada. El acumulado reportado sin esa exposición es **1.140006910828 USD**.
