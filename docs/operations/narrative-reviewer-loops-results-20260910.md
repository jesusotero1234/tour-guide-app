# Experimento de revisores y correcciones — resultado tras la recarga

La prueba se reanudó el 10 de septiembre de 2026 y ya no está bloqueada por saldo. **Este flujo todavía no justifica sustituir Astra.** Sonnet redujo más objeciones de la auditoría independiente, pero las tres variantes siguieron incumpliendo requisitos de extensión y contenido. Persistieron dos respuestas inválidas de Sonnet tras reintentarlas; son resultados negativos del ensayo, no solicitudes pendientes por falta de saldo.

La generación de producción se conserva: DeepSeek directo en preparación y Astra en escritura/auditoría mediante Codex. Solo se añadieron el ejecutor experimental, su comprobación local y este informe. No se generó audio ni se publicaron tours.

Se compararon tres variantes sobre **los mismos siete borradores de DeepSeek**: seis paradas de Madrid y una bienvenida, en español, con fuentes congeladas. Cada variante podía pedir como máximo dos correcciones, también a DeepSeek. El corrector devolvía la narración completa con instrucciones de hacer cambios mínimos; se revisaba toda la nueva versión.

| Revisor de DeepSeek | Coste acumulado del intento, incluida escritura | Solicitudes, incluida escritura | Tiempo acumulado del bucle |
| --- | ---: | ---: | ---: |
| DeepSeek | US$0,06548 | 37: 7 escrituras + 18 revisiones + 12 correcciones | 3 min 38 s |
| Sonnet 5 | US$1,05595 | 39: 7 escrituras + 21 revisiones + 11 correcciones | 10 min 51 s |
| Gemini 3.8 Flash | US$0,36765 | 42: 7 escrituras + 22 revisiones + 13 correcciones | 7 min 20 s |

Son costes de **intentos, no precios de tours listos**. Incluyen las llamadas fallidas y reintentadas de cada variante; excluyen investigación/preparación de fuentes, audio, calibración y evaluación independiente con Astra. Sonnet conserva dos revisiones inválidas pese al reintento.

Los siete borradores costaron US$0,010335 y tardaron unos 16,3 segundos con tres llamadas simultáneas. Se generaron una sola vez y se compartieron; cada fila los cuenta una vez para representar su propio intento. Los tiempos de la tabla suman los bucles de ambas ejecuciones, excluyen la espera de recarga y la escritura inicial, y no representan una prueba de latencia aislada. Las variantes se ejecutaron a la vez, con una cola por revisor.

**Calibración con respuestas conocidas.** Se reutilizaron seis grupos con 29 frases etiquetadas: 15 aceptables y 14 problemáticas. Las etiquetas no se enviaron a los modelos. Incluyen cronologías, cantidades, identidad del sujeto, visibilidad de interiores, acceso, contexto histórico, transiciones y órdenes incrustadas en fuentes.

DeepSeek y Gemini acertaron 29/29 en el primer intento. Sonnet pasó de 26 frases evaluables a **29/29** tras repetir el grupo cuya respuesta se había descartado por una etapa adicional del proveedor. Los controles evaluables no tuvieron falsas alarmas ni falsas aceptaciones. Esta batería pequeña ya existente se parece a ejemplos del prompt y no demuestra generalización a textos largos.

**Calidad en las narraciones completas.** Astra evaluó los borradores y todos los finales distintos sin conocer el nombre de la variante ni las opiniones de los revisores: 24 textos únicos, con revisión factual y de lenguaje. En la reanudación se reutilizaron las 20 evaluaciones existentes y se hicieron solo cuatro nuevas.

| Texto evaluado | Objeciones factuales automáticas | Piezas dentro de extensión local | Piezas con defectos de formato |
| --- | ---: | ---: | ---: |
| Borradores iniciales | 36 | 1/7 | 0/7 |
| Final de autorrevisión DeepSeek | 35 | 1/7 | 3/7 |
| Final disponible con Sonnet | 30 | 2/7 | 4/7 |
| Final con Gemini | 33 | 1/7 | 6/7 |

Estas son **objeciones de un modelo, no errores confirmados**. Cambiaron la redacción y la segmentación. Por ejemplo, Astra objetó «seis paradas» al interpretar una posición almacenada como cinco, aunque la ruta canónica contiene seis lugares. La reducción de objeciones indica una mejora parcial según ese auditor; no prueba por sí sola una mejora global o estadísticamente significativa.

Ninguna variante superó la tolerancia agregada de extensión. Se mantuvieron los criterios existentes: 80–120 % del objetivo por parada, 90–110 % en conjunto y 140–220 palabras para la bienvenida. Ninguna de las siete piezas finales de cada variante superó conjuntamente todas las comprobaciones independientes utilizadas en este ensayo.

Ejemplos que explican el resultado:

- **Plaza Mayor:** 894 palabras iniciales para un objetivo de 600. Después de dos correcciones de autorrevisión quedaron 847, todavía fuera de tolerancia.
- **Cronología 1560/1561:** la fuente fecha un encargo en 1560 y lo sitúa después de un traslado de 1561. DeepSeek pasó por alto el problema en sus primeras revisiones largas, pese a acertar el control corto equivalente.
- **Corrección incompleta:** Gemini detectó esa contradicción, pero DeepSeek terminó conservando «El salto llega en 1560» y eliminó la referencia que hacía visible el conflicto. La fecha dudosa seguía sin resolverse.
- **Reconstrucciones:** las versiones de Plaza Mayor mantuvieron la afirmación de que se reconstruyeron los mismos arcos y balcones, aunque los extractos entregados no acreditan esa continuidad.
- **Colón:** Sonnet consiguió que las objeciones de Astra pasaran de 10 a 4. Aun así, quedaron afirmaciones sin soporte, como atribuir el interés de los arquitectos a la visibilidad del cruce o situar una estructura literalmente bajo los pies del oyente.
- **Formato:** algunas correcciones devolvieron otro objeto JSON convertido en texto, con envoltura y secuencias literales de salto de línea. La validación estructural externa las admitió como cadenas; la comprobación posterior de formato y lenguaje las detectó. Arreglar ese formato no resolvería los problemas factuales y de extensión observados.
- **Sonnet:** Plaza Mayor volvió a fallar por una referencia de evidencia inexistente. La última revisión de Palacio Real se descartó por una etapa adicional de OpenRouter. Se mantuvieron las comprobaciones del adaptador y no se inventaron correspondencias entre fuentes para aprobar las respuestas.
- **Falsas alarmas de los revisores:** algunas transiciones autorizadas por el recorrido se clasificaron como hechos respaldados pero sin cita. El adaptador las convirtió en pendientes y provocó correcciones innecesarias.

La conclusión práctica es que detectar un problema y corregirlo son capacidades distintas. Las rondas produjeron algunas mejoras factuales, pero también defectos nuevos y textos excesivamente largos. Este resultado se refiere a estos prompts y configuraciones, no a una incapacidad general de los modelos.

Como referencia histórica, el ensayo previo de Astra sobre este mismo material entregó las siete piezas dentro de extensión y registró tres objeciones en la variante de escritura separada. Tampoco estaba aprobado para publicación. Es una referencia reutilizada, no una nueva comparación aleatoria. [Resultado anterior](/home/jesusotero/coding/tour-guide-app/docs/operations/narrative-astra-tour-batching-results-20260910.md).

**Coste total y reanudación.** El primer intento registró US$0,883870032 en 97 solicitudes. Después de la recarga se hicieron **26 llamadas nuevas por US$0,658979882**, reutilizando exactamente 88 respuestas válidas. Las nuevas llamadas dieron 24 resultados estructuralmente válidos y dos errores de respuesta; ningún rechazo por saldo.

El total registrado de ambas ejecuciones fue **US$1,542849914 en 123 solicitudes de API**: 67 a DeepSeek directo, 28 a Sonnet y 28 a Gemini. Incluye la calibración, que costó US$0,074440166, y cuenta los borradores compartidos una sola vez. El límite conjunto del experimento fue US$5.

El contador conservador conserva US$0,8426695 de exposición no verificada para los seis rechazos HTTP 402 originales, que no reportaron uso. Esa reserva no es una factura ni debe presentarse como gasto cobrado. El presupuesto contable final fue US$2,385519414, sin reservas activas; la reanudación no añadió exposición no verificada.

Las 24 evaluaciones de Astra mediante Codex registraron 381.509 tokens de entrada y 58.679 de salida. No tienen un cargo de API atribuido en este ensayo. La primera ventana de medición de la cuenta pasó de 88 % a 91 % semanal; la de la reanudación pasó de 93 % a 94 %. Son medidas de toda la cuenta, redondeadas, que incluyen esta conversación y cualquier otra actividad. No permiten asignar esos cambios exclusivamente a las auditorías ni calcular el consumo exacto de un tour.

**Modelo y método.** DeepSeek usó `deepseek-flash` directamente en `https://api.deepseek.com`, sin thinking. Sonnet usó `anthropic/claude-sonnet-5` y Gemini `google/gemini-3.8-flash` por la conexión de OpenRouter disponible, ambos con reasoning low y sin fallback. El catálogo y los endpoints con precios y alias permitidos están guardados en los manifiestos.

El esquema enviado se simplificó para compatibilidad; se validaron localmente el esquema completo, los identificadores de evidencia y la cobertura de frases. El bucle terminaba por aceptación del revisor y extensión válida, agotamiento de rondas, ausencia de cambios o fallo de la llamada. Una aceptación del revisor no equivale a autorización de publicación.

Para reutilizar una respuesta se exige el mismo contenido y configuración mediante la huella completa de solicitud. Los resultados fallidos se reintentaron una vez tras la recarga. Las auditorías de Astra se reutilizan solo para el mismo lugar y texto. No se ampliaron las dos rondas de corrección ni se modificaron prompts, modelos o criterios para conseguir mejores puntuaciones.

Solo se usaron fuentes congeladas. El SHA-256 del archivo de entrada es `359ffbc988df41db55a7a57560c97a1fae79d1021cb8d9ad40c9b1bb269c11a6` y se verificó sin cambios.

- [Métricas finales](/home/jesusotero/coding/tour-guide-app/backend/tmp/narrative-v8/reviewer-loops-20260910-2/analysis.private.json).
- Solicitudes: [primer intento](/home/jesusotero/coding/tour-guide-app/backend/tmp/narrative-v8/reviewer-loops-20260910-1/calls.private.jsonl), [reanudación](/home/jesusotero/coding/tour-guide-app/backend/tmp/narrative-v8/reviewer-loops-20260910-2/calls.private.jsonl) y [respuestas reutilizadas](/home/jesusotero/coding/tour-guide-app/backend/tmp/narrative-v8/reviewer-loops-20260910-2/reused.private.jsonl).
- [Manifiesto de reanudación](/home/jesusotero/coding/tour-guide-app/backend/tmp/narrative-v8/reviewer-loops-20260910-2/manifest.private.json), [versiones de cada variante](/home/jesusotero/coding/tour-guide-app/backend/tmp/narrative-v8/reviewer-loops-20260910-2/arms.private.json) y [evaluaciones de Astra](/home/jesusotero/coding/tour-guide-app/backend/tmp/narrative-v8/reviewer-loops-20260910-2/judges.private.json).
- Textos finales disponibles: [DeepSeek](/home/jesusotero/coding/tour-guide-app/backend/tmp/narrative-v8/reviewer-loops-20260910-2/tour-deepseek.private.md), [Sonnet](/home/jesusotero/coding/tour-guide-app/backend/tmp/narrative-v8/reviewer-loops-20260910-2/tour-sonnet.private.md), [Gemini](/home/jesusotero/coding/tour-guide-app/backend/tmp/narrative-v8/reviewer-loops-20260910-2/tour-gemini.private.md).
- [Ejecutor experimental](/home/jesusotero/coding/tour-guide-app/backend/scripts/validation/narrative-reviewer-loops-v8.cjs) y [comprobaciones locales](/home/jesusotero/coding/tour-guide-app/backend/scripts/validation/narrative-reviewer-loops-v8.test.cjs).

Las comprobaciones locales se ejecutaron primero fallando y después pasaron. Cubren el límite de rondas, la conservación de versiones, el bloqueo ante revisiones inválidas y la reutilización exclusiva de solicitudes idénticas y válidas. Las ejecuciones reales terminaron correctamente como procesos; sus resultados de contenido no superaron los requisitos de entrega.

Para reproducir la reanudación en una carpeta nueva, desde `backend`:

```sh
node -r ts-node/register scripts/validation/narrative-reviewer-loops-v8.cjs --out-dir=tmp/narrative-v8/reviewer-loops-NUEVA --reuse-run=tmp/narrative-v8/reviewer-loops-20260910-1
node -r ts-node/register scripts/validation/narrative-reviewer-loops-v8.cjs --out-dir=tmp/narrative-v8/reviewer-loops-NUEVA --reuse-run=tmp/narrative-v8/reviewer-loops-20260910-1 --execute
node -r ts-node/register scripts/validation/narrative-reviewer-loops-v8.cjs --out-dir=tmp/narrative-v8/reviewer-loops-NUEVA --reuse-run=tmp/narrative-v8/reviewer-loops-20260910-1 --judge
```

La primera orden solo describe el ensayo. La segunda crea llamadas nuevas para los fallos y pasos posteriores, sin repetir las respuestas válidas. La tercera reutiliza las evaluaciones del mismo texto. La reutilización admite una ejecución original, no cadenas recursivas de reanudaciones.
