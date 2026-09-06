# Ejecución editorial-first — 2026-09-05

Estado: preparación terminada y comparación cerrada con resultado insuficiente; **sin promoción a producción ni canario completo nuevo**.

Actualización posterior: se comprobó la identidad canónica, se probó la referencia aceptada con Mini, Qwen local y Gemini 2.5 Pro, y después un encargo de texto libre con Gemini. La entrega narrativa sigue siendo insuficiente. El saldo vigente es **1,07401285 USD**. Los importes de las etapas anteriores se conservan como históricos. Véase [el contraste de escritura libre más reciente](narrative-plain-writer-result-20260905.md), [la comparación de modelos](narrative-model-style-comparison-20260905.md), además del seguimiento al final y [la prueba inicial de transferencia de estilo](narrative-style-transfer-result-20260905.md).

## Veredicto

El paquete editorial + párrafos libres **no demostró la mejora necesaria**. En Mayor evitó dos problemas conocidos, pero apareció una identidad de transición incorrecta y siguió una afirmación espacial sin respaldo. En Málaga ambos brazos quedaron demasiado cortos y el candidato mantuvo tono de ficha. No se reescribieron los textos hasta hacerlos pasar.

Sí produjo un hallazgo técnico concreto: el contrato confundía nombres mencionables del dossier con identidad del siguiente POI. Se corrigió en el arnés y se probó localmente. Esa corrección no se presenta como una nueva generación exitosa ni como un arreglo ya desplegado en producción.

[Leer los cuatro textos originales](../../backend/tmp/narrative-editorial-first-v8/preparation-20260905-1/comparison-readable.md). Son dos comparaciones de paradas, no un tour terminado.

| Caso | Control | Paquete editorial | Lectura del resultado |
| --- | --- | --- | --- |
| Plaza Mayor, objetivo 600 | 564 palabras; 3 objeciones del auditor | 543 palabras; 1 objeción del auditor y otra material detectada por Codex | Ambos caben en duración; candidato no gana por la identidad errónea y el soporte espacial |
| La Malagueta, objetivo 562 | 434 palabras; 0 objeciones | 436 palabras; 0 objeciones | Ambos incumplen duración; cero objeciones no significa buena audioguía |

Las cuatro salidas se leyeron íntegramente. Mi evaluación no es humana ni ciega: conozco los brazos. La versión de lectura usa Texto 1 para el candidato y Texto 2 para el control, por si el usuario desea comparar primero sin etiquetas.

## Autoridad y presupuesto

El usuario autorizó ejecutar el plan y **2 USD nuevos**. Acumulado previo comprobado: 7,471549350000001 USD. Techo de esta campaña: **9,47154935 USD**. No se incorpora al nuevo límite el saldo no utilizado de la campaña anterior. Goal anterior sin reactivar.

Preflight sin generación: GPT-5.4 máximo de entrada 0,00001 USD/token, salida 0,000045; Mini entrada 0,0000015, salida 0,000009. Seis auditorías con máximo 8000 tokens exigirían 2,16 USD solo en salida. Por tanto, los tres pares completos no caben en una reserva conservadora de 2 USD.

Adaptación comunicada: preparar los tres casos, pero ejecutar primero un único par A/B de Plaza Mayor si su reserva conjunta cabe. No reducir límites del auditor ni presentar un caso como validación multicidad. Se podrán ejecutar pares adicionales únicamente si su reserva completa cabe en el saldo, sin pedir más presupuesto.

## Estado inicial y alcance

HEAD `ef55a94ddbd58fb95b77b7e99f55f66d86303ed1`, rama `codex/narrative-v8-prototype-clean`. Cambios previos y trabajo ajeno preservados. Solo arnés experimental, su test nuevo y artefactos/documentación de esta campaña.

Limitación encontrada antes de generar: el `diagnostics.private.json` del último Madrid fallido no conserva `privateDiagnostics`. El checkpoint sí conserva dossiers, arco y ruta. Para ambos brazos se reconstruirá la entrada factual desde esos mismos objetos, usando la selección de puentes de producción (solo proposiciones admitidas de la siguiente parada referenciadas por el arco). No se cambiará el checkpoint ni se reutilizará un veredicto antiguo.

## Criterios fijados antes de generar

- Modelo escritor y auditor iguales entre brazos; un intento de escritura y una auditoría por brazo, sin reparaciones.
- Misma evidencia original para el auditor, con contradicciones visibles. El candidato recibe selección editorial y párrafos libres; el control conserva su contrato.
- Objetivos sin alterar: Mayor y Palacio 600 palabras; Malagueta 562. Entrega local ±20%, suma comparada ±10%, con desvío exacto registrado.
- Mayor: no aceptar el encargo en 1560 como fecha fiable; no añadir 1790 a un pasaje que no lo incluye; no atribuir a Villanueva todas las arcadas actuales ni inventar hechos de la siguiente parada.
- Se revisarán interés, concreción, repetición y continuidad aparte del resultado del auditor. Mi revisión es de Codex, no se atribuirá a un humano.
- Una mejora en un solo par no satisface el criterio de promoción de al menos dos casos ni sustituye la aceptación narrativa del usuario.

La fase de preparación asistida se contará como trabajo editorial, no como capacidad automática de curación.

## Ajustes de implementación previos a generar

El runner Jest del repositorio limita sus roots a `src`; el test nuevo vive en `backend/src/services/poi/NarrativeEditorialPacketPilotV8.test.ts`, no junto al script como sugería el plan. No se cambia configuración del runner.

La delegación semántica de integración completa se truncó sin modificar archivos; se dividió por responsabilidades. En revisión se corrigió una confusión del worker entre `route.stops` y `research`: la ruta aporta orden e identidad, `research[].result.dossier` aporta fuentes. Los tests comprueban esa separación. Son correcciones del arnés antes del experimento, no reparaciones de textos generados.

## Primeras solicitudes

Mayor control: 564 palabras, duración de entrega válida, tres objeciones del auditor; 0,08364025 USD, 41,764 s. Reproduce 1560, exceso de alcance en la intervención de Villanueva y transición factual no respaldada.

Primer intento del candidato: HTTP 400 del proveedor por `uniqueItems` no permitido en su esquema estricto. Sin texto ni uso reportado. Se conserva **0,05167950 USD de exposición conservadora**; no se asume coste cero ni se borra el intento. Se retiró esa palabra clave del esquema remoto, manteniendo la comprobación de duplicados en el parser y añadiendo regresión local. Se autoriza una repetición técnica, no una búsqueda de mejor redacción. Acumulado antes de ella: 7,606869100000001 USD.

Candidato Mayor tras corregir transporte: 543 palabras, entrega dentro del margen, 0,07425175 USD y 40,770 s. Omite 1560/1790 y delimita las esquinas de Villanueva. Pero sitúa actos públicos «bajo esos mismos soportales» y termina «La siguiente parada es Franco». El auditor solo objetó la primera afirmación; la lectura de Codex detecta ambas. Además filtra expresiones «El pasaje recuerda» y «la fuente sitúa» en el audio. No ha ganado el caso.

Acumulado tras el par y el intento fallido: 7,681120850000001 USD; campaña contabilizada 0,20957150 USD; saldo 1,79042850 USD. Se conserva el mismo candidato sin retocar el prompt y se decide ejecutar el par ya preparado de La Malagueta para contraste fuera de Madrid. Su reserva conjunta es 1,70 USD (0,15 escritor + 0,70 auditor por brazo), comprobada antes de comenzar. El máximo de tokens/modelo no cambia; si una petición supera su asignación monetaria se rechaza antes de HTTP.

## Hallazgo de contrato confirmado

El checkpoint dice `route.stops[Q2193218].name = plaza de Oriente`. Sin embargo, la proyección de producción de identidad del puente usa `nextDossier.authorizedNames`, que en ese dossier contiene Franco, alcaldes, arquitectos y edificios, y NO contiene «plaza de Oriente». El piloto reutiliza ese mismo campo; al quitar el arco antiguo del candidato, desapareció la otra pista textual de identidad. El auditor aprobó expresamente «La siguiente parada es Franco» porque ese nombre figuraba en `nextStop`.

No es una preferencia de estilo ni una conclusión deducida solo de un score: entrada guardada, salida y motivo del auditor muestran la cadena causal. Es un defecto de representación: nombres mencionables en el dossier no son alias de identidad del POI. El plan pedía identidad canónica, pero esta implementación inicial heredó la ambigüedad del contrato existente. Se conserva como resultado fallido; no se corrigen los inputs después de generar ni se oculta en la comparación.

## Málaga y cierre de la comparación

Control La Malagueta: 434 palabras para 562; 0,093987 USD y 55,786 s. Candidato: 436 palabras; 0,055295 USD y 34,320 s. Ambos pasan auditoría sin objeciones, pero fallan los márgenes local y agregado de narración. No se bajó el objetivo ni se añadieron palabras después.

El candidato distingue mejor el contexto de los detenidos de 1939 y los refugiados de 1943. Sin embargo, conserva formulaciones como «la fuente formula» y «la fuente sitúa», y un comienzo abstracto sobre geometría y ornamento. No está demostrado que sea la experiencia oral inmersiva que buscamos. En el control también hay abstracciones y un cierre que vuelve a acumular tipos de monumentos del recorrido. Ninguno se declara listo para vender.

Palacio Real queda preparado y comprobado en dry-run, sin generación pagada. No se ejecuta su par: la regresión material de Mayor y la duración fallida en Málaga ya impiden cumplir el criterio de promoción de esta intervención. Otra parada favorable no eliminaría esos resultados. Se conserva el resto del dinero; no se atribuye esta parada pendiente a agotamiento del presupuesto.

## Qué se implementó y comprobó

- Variante experimental `editorial_packet`, que valida correspondencia con dossier/objetivos y permite párrafos sin molde fijo.
- Entrada factual del auditor reconstruida desde checkpoint, con los conflictos originales visibles y sin depender de diagnósticos ausentes.
- Reserva previa de todas las llamadas de cada tanda y máximo por fase comprobado antes de HTTP, además del control acumulado existente.
- Registro de intentos fallidos, respuestas, datos y Markdown, sin reparar las salidas del experimento.
- Corrección **posterior** de identidad solo en el arnés: `nextStop.name` y sus nombres autorizados salen del nombre canónico de `route.stops`, no de todos los personajes del dossier. Rechaza nombre canónico ausente. La prueba usa personajes ajenos en el dossier y confirma que no se transfieren como identidad.

Esta última corrección tiene tests y dry-run reales con Madrid; **no se pagó otra generación con ella**. Los inputs y veredictos de las comparaciones anteriores permanecen intactos. El pipeline de producción y el RAG no se modificaron en esta campaña.

Validación: 15 tests del piloto y 26 de contrato/duración aprobados (41 en total entre las ejecuciones enfocadas); compilación del script mediante ts-node y dry-runs de los tres paquetes; `git diff --check` sin errores. El `tsc` general no cubre por sí solo scripts de validación: la comprobación relevante aquí fue el test que importa el script y su ejecución real.

Archivos de implementación: `backend/scripts/validation/narrative-writer-briefing-pilot-v8.ts` y `backend/src/services/poi/NarrativeEditorialPacketPilotV8.test.ts`. Artefactos de preparación/lectura: `backend/tmp/narrative-editorial-first-v8/preparation-20260905-1/`.

## Coste exacto y llamadas

| Concepto | USD |
| --- | ---: |
| Coste nuevo reportado | 0,30717400 |
| Exposición nueva no verificada, HTTP 400 | 0,05167950 |
| Total nuevo contabilizado | **0,35885350** |
| Saldo del presupuesto nuevo de 2 USD | **1,64114650** |

Acumulado vigente: **7,830402850000001 USD**, techo **9,47154935 USD**, reservas pendientes cero. No se borra la exposición anterior ni se cuenta dos veces como gasto nuevo.

Hubo **9 intentos HTTP**: cuatro escrituras útiles para comparar, cuatro auditorías y un rechazo técnico de esquema. Cero reparaciones de narración. Los cinco comandos pagados sumaron 174,866 segundos, aproximadamente 2 min 55 s; no incluye preparación, desarrollo ni revisión de esta sesión. El tiempo editorial asistido no se instrumentó por separado: no inventamos un coste laboral ni lo presentamos como producción automática. Revisión humana pendiente.

Las entradas de escritura se redujeron aproximadamente de 27,3 a 6,8 KB en Mayor y de 21,9 a 5,7 KB en Málaga. Eso abarató estas escrituras, pero **menos contexto y menos coste no equivalieron a mejor producto**. El coste incluye el intento técnico fallido mediante su exposición conservadora.

## Decisión y pendientes

1. **No promover esta variante ni activar un goal de canarios repetidos.** No pasó los criterios del plan.
2. La identidad canónica del POI debe separarse de los nombres de personas/edificios mencionados. El hallazgo merece una corrección específica del contrato productivo, pero esa integración no se realizó bajo la promoción condicionada de este piloto.
3. El briefing preparado por Codex no basta como demostración de una buena preparación editorial humana. Parte de las notas de fuente acaba en la voz, y la estructura flexible sigue produciendo abstracciones. No afirmar que queda descartado cualquier enfoque editorial-first: queda descartada la promoción de **esta implementación y estos paquetes** con la evidencia disponible.
4. Para el producto reutilizable, sigue pendiente una referencia de experiencia oral aceptada por el usuario/revisor y después una comparación contra ella. No gastar el saldo automáticamente en variantes de prompt.
5. RAG on/off, canario completo de Madrid, recorrido completo fuera de Madrid, TTS y evaluación humana comercial quedan pendientes; no se sustituyen por estos tests ni por dos paradas.

No se ha logrado el tour final ni el one-shot de calidad solicitado. Se entrega un experimento reproducible, una mejora local de representación comprobada y una decisión negativa explícita, sin cambiar el criterio para llamar éxito al resultado.

## Seguimiento: identidad canónica, una escritura y una auditoría

El usuario pidió continuar después del estado de situación. Se ejecutó `editorial-first-mayor-identity-20260905-1` usando el saldo existente, sin renovar ni reiniciar el presupuesto. Se mantuvieron checkpoint, paquete editorial, objetivos, modelos y configuración. La entrada de transición usa ahora el nombre canónico de la ruta para escritor y auditor. No se alteraron los resultados anteriores ni hubo nuevas modificaciones de código en este seguimiento.

- Caso: Plaza Mayor, Q1123493; objetivo congelado de 600 palabras / 300 segundos estimados.
- Escritor: `openai/gpt-5.4-mini`, razonamiento bajo, máximo 4.000 tokens.
- Auditor: `openai/gpt-5.4`, razonamiento medio, máximo 8.000 tokens.
- Dos solicitudes, ambas válidas al primer intento; ninguna reparación o ajuste de longitud.
- Reserva máxima previa del par: 0,85 USD; gasto real reportado: **0,08501590 USD**. Reservas finales: cero; exposición nueva no verificada: cero.
- Duración del comando: **40,247 segundos**.

[Leer el nuevo guion original completo](../../backend/tmp/narrative-writer-briefing-pilot-v8/editorial-first-mayor-identity-20260905-1/Q1123493-editorial_packet.md).

### Qué quedó comprobado

Ambas entradas guardadas contienen «plaza de Oriente» como identidad de la siguiente parada. El texto termina «La siguiente parada es plaza de Oriente» y el auditor la admite por ese nombre. Esto verifica la corrección en este caso real; no demuestra generalización del pipeline ni constituye integración productiva.

La salida tiene **500 palabras**. Pasa el margen local de ±20%, pero falla el indicador agregado de ±10% aplicado a esta única parada. La diferencia respecto al objetivo es de 100 palabras, unos 50 segundos bajo el supuesto de 120 palabras por minuto: no son dos o tres palabras ni una medida TTS. No se confundió el objetivo estrecho de 575–660 del writer con el criterio de entrega. Tampoco se extrapola el indicador de una parada a un tour completo que no se ha generado.

El auditor señaló dos frases:

1. «un marco de piedra y ladrillo» añade materiales de las fachadas que los pasajes seleccionados no acreditan. Que se documenten pilares de granito no respalda esos materiales para el conjunto.
2. «una geometría pensada para reunir actividad» atribuye intención de diseño no documentada. Es posible describir el uso sin atribuir esa intención.

Codex leyó íntegramente la salida y los ocho pasajes seleccionados. Las dos objeciones son razonables dentro del corpus disponible, no una demostración de que los materiales sean falsos en el mundo. Persiste además «El pasaje menciona el auto de fe…», impropio de la voz del guía y contrario a las instrucciones. El desarrollo sigue recurriendo a abstracciones sobre memoria, vida pública y geometría. La frase «Después de esa etapa de daños» deja poco precisa la relación temporal de Villanueva con los incendios mencionados; no se da por resuelta una cronología solo porque el auditor no la objete.

No se atribuye al cambio de identidad la bajada de 543 a 500 palabras ni el cambio de objeciones: son generaciones diferentes y una observación por condición no permite esa inferencia causal. La cobertura declarada de fichas es 1, pero eso tampoco demuestra una audioguía satisfactoria.

### Decisión y saldo vigente

No lanzar un canario completo con esta variante: la prueba satisface la identidad, no la entrega narrativa. No se cambiaron tolerancias, no se añadió una cadena de reparación y no se gastó el saldo en repetir prompts hasta obtener un caso favorable. Producción y RAG permanecen sin cambios de esta campaña.

El siguiente hito útil es una referencia editorial de experiencia oral, con duración suficiente y revisión del usuario, antes de otra comparación pagada. Los resultados no demuestran que falte información en toda Wikipedia, que el RAG sea inútil ni que un cambio de modelo lo solucione; solo delimitan el fallo de este paquete y esta redacción con los modelos probados.

Contabilidad acumulada de la autorización nueva de 2 USD:

- Coste reportado nuevo: **0,39218990 USD**.
- Exposición conservadora del rechazo HTTP anterior: **0,05167950 USD**.
- Total contabilizado: **0,44386940 USD**.
- Saldo: **1,55613060 USD**.
- Acumulado histórico vigente del guard: **7,9154187500000015 USD**, techo **9,47154935 USD**.

La campaña suma ahora 11 intentos HTTP: cinco escrituras, cinco auditorías y el rechazo técnico original. No queda un canario o una llamada de este seguimiento corriendo.
