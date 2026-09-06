# Resultado: contexto de autor con DeepSeek Pro, Kimi K3 y GLM 5.3

Fecha: 2026-09-06. **Comparación ejecutada en una parada, La Malagueta; no es un canario de Madrid ni un tour completo aprobado.** No se modificaron producción, RAG ni modelos por defecto. Los tres textos se conservan sin reparación.

## Veredicto

Los tres escritores completaron la narración en una sola petición y entraron en las bandas de extensión existentes. Ya no observamos el déficit de palabras de las pruebas anteriores en estas tres muestras. **Todavía hay añadidos sin respaldo o cambios de significado: no recomendaría publicar ninguna sin edición.**

Mi preferencia editorial en estas muestras es DeepSeek V4 Pro 0813: desarrolla el contraste con menos enumeración que Kimi y GLM, terminó su escritura en 29 segundos y quedó próximo al objetivo. Es una lectura subjetiva, no ciega, pendiente de la valoración del usuario. No prueba que ese modelo sea universalmente mejor.

## Datos observados

Objetivo: 562 palabras / 281 segundos estimados a 120 palabras por minuto. Bandas conservadas: local ±20% y agregado ±10% para esta única parada. No se midió TTS ni duración del paseo.

| Escritor | Palabras | Pasa extensión | Objeciones automáticas | Escritura USD | Auditoría USD | Escritura + auditoría |
| --- | ---: | :---: | ---: | ---: | ---: | ---: |
| DeepSeek V4 Pro 0813 | 574 | Sí | 2 | 0.00877615 | 0.09973750 | 72.3 s |
| GLM 5.3 | 618 | Sí | 3 | 0.00784100 | 0.08258250 | 75.0 s |
| Kimi K3 | 608 | Sí | 5 | 0.02838150 | 0.11213000 | 131.3 s |

“Objeciones” no equivale a “errores históricos confirmados”. Hay falsos positivos, afirmaciones no sustentadas que podrían comprobarse con otras fuentes y defectos que el auditor no señaló. El estado review_required del piloto es deliberado y no es por sí solo una medida de calidad.

Cada escritor realizó una petición y cada texto recibió una auditoría GPT-5.4 independiente de la conversación del escritor, con razonamiento medio y hasta 8.000 tokens. No hubo reparación ni regeneración de esos tres textos.

## Lectura factual y editorial de las muestras

### DeepSeek V4 Pro 0813

Dos objeciones automáticas pertinentes:
- Asegura que el ladrillo visible estuvo presente en todas las etapas. Recuperar una fachada original no demuestra esa continuidad material completa.
- Enlaza la protección patrimonial con la restauración mediante “Ese reconocimiento tuvo consecuencias prácticas”, una causalidad que los extractos no acreditan.

Mi revisión encuentra además detalles no autorizados por el corpus: “cornisas” y “remates” no figuran en los siete pasajes, y afirmar que el ladrillo no es un simple revestimiento introduce una interpretación material no sustentada. El cierre sobre reapertura como espacio cultural también puede hacer parecer consumado un proyecto que el pasaje formula en futuro. No he comprobado externamente si esos detalles son verdaderos: el defecto aquí es añadirlos sin la evidencia entregada.

Es el texto que más se acerca al tono buscado en mi lectura, pero el número dos no debe interpretarse como una lista exhaustiva de cambios necesarios.

### Kimi K3

El problema más claro es convertir el edificio hexadecagonal en un “ruedo de dieciséis lados”. También introduce arcos no descritos en los pasajes.

Dos objeciones requieren matiz: “No sabemos en qué parte exacta…” convierte una limitación del material en una frase del guía; puede leerse como desconocimiento general, además de romper la inmersión. “Última transformación documentada” excede lo que una selección de extractos permite asegurar.

Una objeción es un falso positivo respecto del encargo: cuestiona que sea la última parada, aunque el escritor sí recibió ese dato. Mi revisión añade cautela con “El resto del calendario, el edificio espera”: la condición de recinto taurino de temporada no prueba ausencia de otras actividades.

Tiene desarrollo suficiente, pero enumera el calendario y reutiliza algunos contrastes. Su escritura tardó 83 segundos en esta petición.

### GLM 5.3

El auditor señala la ubicación “al borde de la playa”, la afirmación “siglos de tradición” y la frase de desconocimiento sobre la localización de los detenidos. Las dos primeras no aparecen en los pasajes; la tercera requiere el mismo matiz editorial que en Kimi.

Mi lectura detecta además añadidos no señalados: ladrillo escondido detrás de “añadidos y capas”, estado visual “limpio y ordenado” y la autocorrección inicial “hexágono, o mejor dicho…”. Aunque después dice dieciséis lados, esa vacilación no es una entrada lista para grabar. Algunas formulaciones presentan el calendario como vigente sin una comprobación actual.

Es muy barato por petición, pero en esta muestra resulta más enumerativo y no cumple el objetivo factual por sí solo.

## Lo que encontramos en la evaluación, no solo en los escritores

El auditor recibe language, propositions, passages, discrepancies, limits y bridgeEvidence. En este caso bridgeEvidence solo contiene propositions y passages: no recibe una identidad/posición final de la parada.

Por eso puede cuestionar un dato operativo que sí entregamos al escritor. Kimi recibió una objeción por cerrar la última parada; los otros cierres equivalentes no recibieron la misma objeción. **No es una comparación limpia de calidad si se trata cada flag como verdad sin revisión.**

La acción técnica que se desprende es revisar por separado el contrato de contexto del auditor para incluir datos canónicos de ruta, sin convertir instrucciones de estilo en evidencia histórica ni debilitar el control factual. No se implementó ese cambio durante esta comparación: habría cambiado la evaluación entre candidatos.

A la vez, hay falsos negativos, como los detalles decorativos de DeepSeek y los añadidos sobre la fachada de GLM. Resolver el dato de última parada no convertiría estos borradores en aprobados.

## Controles y límites del experimento

- Mismo archivo de encargo, mismos siete pasajes, misma referencia y mismo cuerpo de petición salvo model. SHA-256 del encargo: 023aece5b25e69a910119614a067b7890d9a2d849dd92bfb20e342bdea3547e0.
- Mismo corpus y prompt de auditoría que el piloto anterior, comprobados por igualdad exacta.
- Escritura en texto libre, sin esquema, tools ni temperatura explícita; reasoning medium y max_tokens 5000 para todos. Todos los textos completos terminaron con finish_reason=stop. El modelo controla su razonamiento real; medium no implica igual número de tokens entre proveedores.
- Proveedores observados: DeepSeek/Novita, Kimi/Makora, GLM/Reka. Los identificadores reales de respuesta coincidieron con los solicitados. Los resultados son del modelo servido por ese proveedor en esa petición.
- Se mantuvieron require_parameters=true, allow_fallbacks=false, data_collection=deny y zdr=true. No se relajaron para obtener respuestas.
- Una muestra por modelo y una parada conocida: no hay tasa de éxito ni demostración en otras ciudades. El encargo incorpora advertencias aprendidas de errores anteriores.
- Aún falta la valoración del usuario. Mi comparación editorial no fue ciega.
- El control GPT-5.4 Mini con esta misma entrada recibió HTTP 404 sin narración. No es un fracaso de escritura ni permite aislar contexto frente a modelo. La respuesta guardada no permite afirmar la causa exacta del 404; no se reintentó.
- GPT-5.4 completo no se ejecutó como escritor. Su preparación inicial se detuvo antes de HTTP por reserva insuficiente; después se priorizaron los tres modelos solicitados. Sí se utilizó como auditor.

Antes de las inferencias, la reserva conservadora de la propuesta de 8.000 tokens de escritura excedió la asignación inicial. Se fijaron 5.000 tokens para estas narraciones de aproximadamente 562 palabras, manteniendo razonamiento medio, cálculo conservador de tarifas y detección de truncamiento. Ese límite fue suficiente en las tres respuestas observadas; no se propone para escribir el tour completo.

## Gasto y llamadas

- Tres escrituras y tres auditorías completadas: **0,339448652 USD reportados**.
- Una solicitud Mini fallida sin uso confirmado: **0,070449 USD de exposición conservadora**, no coste confirmado ni cero supuesto.
- Total contabilizado en esta tanda: **0,409897652 USD**.
- Saldo restante de la campaña autorizada de 2 USD: **0,664115198 USD**. No se reinició el contador y no quedaron reservas abiertas.
- Siete solicitudes de inferencia HTTP en total; ninguna reparación. Las consultas de catálogo y los tests locales no fueron inferencias pagadas. La parada previa al HTTP de GPT-5.4 no cuenta como una inferencia.

Las auditorías consumieron 0,29445 USD, aproximadamente el 87% del gasto reportado de las tres pruebas completas. Los tres escritores juntos costaron 0,044998652 USD. Esto describe esta tanda; no es una estimación general de producción.

## Qué haría con estos resultados

Conservaría DeepSeek como candidato editorial, no como nuevo valor por defecto. Hemos demostrado primeras versiones suficientemente largas en estas muestras, no publicación autónoma fiable.

Antes de otra campaña de modelos, revisaría el contexto operativo que recibe el auditor y haría la lectura del mejor texto con el usuario. La arquitectura no debe tomar ni el conteo de palabras ni la aprobación de otro LLM como sustituto de esa calidad.

No se lanzó Madrid: esta prueba no acredita sus 120 minutos ni la capacidad de escribir las siete paradas de una vez. El paquete de Madrid sigue disponible como siguiente experimento, con presupuesto y evaluación propios.

## Cambios y verificación

Solo se amplió el piloto experimental narrative-plain-writer-pilot-v8.ts y su test: entrada Markdown opt-in, modelos permitidos, preflight de sus endpoints y registro del razonamiento real solicitado. Sin alteración de perfiles de producción.

Pasaron 16 tests locales. Se verificaron después los textos originales, identidad real de modelos, fin de respuesta, igualdad de entrada/auditoría, conteos, ausencia de reservas abiertas y límites de gasto. Las fuentes del paquete no cambiaron. git diff --check pasó.

## Evidencia original

- DeepSeek V4 Pro 0813: [texto original](../../backend/tmp/narrative-plain-writer-pilot-v8/malagueta-author-deepseek-pro-20260906-1/narration.md), [entrada exacta](../../backend/tmp/narrative-plain-writer-pilot-v8/malagueta-author-deepseek-pro-20260906-1/inputs.private.json), [auditoría](../../backend/tmp/narrative-plain-writer-pilot-v8/malagueta-author-deepseek-pro-20260906-1/audit.private.json), [resultado y gasto](../../backend/tmp/narrative-plain-writer-pilot-v8/malagueta-author-deepseek-pro-20260906-1/results.private.json).
- GLM 5.3: [texto original](../../backend/tmp/narrative-plain-writer-pilot-v8/malagueta-author-glm53-20260906-1/narration.md), [entrada exacta](../../backend/tmp/narrative-plain-writer-pilot-v8/malagueta-author-glm53-20260906-1/inputs.private.json), [auditoría](../../backend/tmp/narrative-plain-writer-pilot-v8/malagueta-author-glm53-20260906-1/audit.private.json), [resultado y gasto](../../backend/tmp/narrative-plain-writer-pilot-v8/malagueta-author-glm53-20260906-1/results.private.json).
- Kimi K3: [texto original](../../backend/tmp/narrative-plain-writer-pilot-v8/malagueta-author-kimi-k3-20260906-1/narration.md), [entrada exacta](../../backend/tmp/narrative-plain-writer-pilot-v8/malagueta-author-kimi-k3-20260906-1/inputs.private.json), [auditoría](../../backend/tmp/narrative-plain-writer-pilot-v8/malagueta-author-kimi-k3-20260906-1/audit.private.json), [resultado y gasto](../../backend/tmp/narrative-plain-writer-pilot-v8/malagueta-author-kimi-k3-20260906-1/results.private.json).
- [Fallo y presupuesto del control Mini](../../backend/tmp/narrative-plain-writer-pilot-v8/malagueta-author-mini-20260906-1/failure.private.json).
- [Encargo exacto enviado](narrative-author-context-pack-20260906/malagueta-oneshot.md).

Los textos siguientes son las primeras respuestas originales, sin corregir. Sus errores se conservan para revisar la prueba.

## Texto original — DeepSeek V4 Pro 0813

Delante de ti hay un edificio pensado para la fiesta, con su ladrillo visto y su silueta de dieciséis lados. Y, sin embargo, en dos momentos concretos del siglo XX este mismo recinto sirvió para retener personas. ¿Cómo se pasa de un uso a otro sin cambiar de muros? Vamos a mirarlo despacio.

Si te fijas en la fachada, verás que el ladrillo no es un simple revestimiento. Durante una restauración iniciada en 2017 y terminada dos años después, se recuperó ese acabado original junto con los elementos decorativos exteriores. Mira las cornisas, los remates, las líneas que dibujan el contorno del edificio. Es una plaza de estilo clasicista con forma de hexadecágono, una palabra técnica que solo significa que su planta se compone de dieciséis lados.

Ahora separa por un momento la imagen del coso. Un ruedo de cincuenta y dos metros de diámetro, corrales, chiqueros, caballerizas. Todo eso sigue respondiendo a su función taurina. Pero en 1939, durante los últimos meses de la Guerra Civil, el campo de concentración de Málaga se saturó. Estaba en la fábrica y cuartel de La Aurora, y la presión llevó a los militares sublevados a usar también esta plaza de toros con el mismo fin. No es un detalle menor: un lugar pensado para que miles de personas miraran hacia el ruedo pasó a tener otro uso, impuesto por la urgencia.

Cuatro años después, en 1943, volvió a albergar detenidos. Esta vez eran refugiados extranjeros que habían huido de Francia durante la Segunda Guerra Mundial. Escúchalo con cuidado: no hablamos de un refugio elegido, sino de personas detenidas. El edificio no cambió de función por decisión propia. Fue ocupado, vaciado de su sentido original y cargado con otro completamente distinto.

Pero La Malagueta no se quedó anclada en esos episodios. En 1976, coincidiendo con el centenario de su inauguración, fue declarada conjunto histórico-artístico. Y en 1981, bien de interés cultural. Lo que antes había sido espacio de festejos y también lugar de detención fue reconocido como patrimonio. No se trata de borrar ninguna capa: el ladrillo que miras hoy ha estado presente en todas ellas.

Ese reconocimiento tuvo consecuencias prácticas. La restauración de 2017 no solo devolvió la fachada original. Incluyó una reorganización del espacio interior para albergar nuevos espacios expositivos y salas de congresos. El objetivo era convertir La Malagueta en un centro cultural con actividad durante todo el año. No te prometo que cada sala esté abierta ni que el proyecto haya culminado exactamente como se anunció. Pero sí puedes comprobar una transformación: lo que nació ligado a la temporada taurina fue pensado para no depender de un calendario fijo.

Y aun así, el coso sigue siendo un recinto taurino de temporada. Guarda ese contraste. Las corridas de Semana Santa, las de la Feria de Agosto, la de septiembre. Un edificio con esta historia no se explica eligiendo entre tradición y cambio. Se entiende mejor cuando aceptamos que ha sido muchas cosas, a veces al mismo tiempo.

Antes de irte, mira de nuevo la fachada de ladrillo. Piensa en los que la construyeron para la fiesta, en quienes fueron retenidos allí sin elegirlo y en quienes decidieron, décadas después, que este lugar merecía ser protegido y reabierto como espacio cultural. Eso es lo que tienes delante: no una simple plaza de toros, sino un recinto donde se cruzan la celebración, la memoria y el esfuerzo por darle nuevos usos.

Hasta aquí llega nuestro recorrido.

## Texto original — GLM 5.3

Fíjate en la fachada de ladrillo que tienes delante. Es un hexágono, o mejor dicho, un polígono de dieciséis lados, y ese ladrillo que ahora ves limpio y ordenado estuvo tiempo escondido detrás de añadidos y capas. Cuando la plaza se restauró, entre 2017 y 2019, uno de los logros fue precisamente ese: recuperar el ladrillo original y sus elementos decorativos exteriores. Quédate con ese detalle, porque nos va a servir para mirar el edificio de otra manera.

¿Qué clase de edificio es este? La respuesta corta sería: una plaza de toros. El ruedo mide 52 metros de diámetro, y tras la reforma de 2010 el aforo llega a 9.032 espectadores. Tiene corrales, chiqueros, caballerizas, sala de toreros, enfermería. Y cada año, en temporada, aquí se celebran festejos que los malagueños reconocen por su nombre: las corridas de Semana Santa, con la llamada Corrida Picassiana; la Corrida de la Prensa en junio, por la festividad de los santos patronos San Ciriaco y Santa Paula; los festejos de la Feria de Agosto; y la corrida de septiembre, coincidiendo con la festividad de la patrona de Málaga.

Pero esa respuesta corta se queda corta. Y aquí viene la pregunta que da sentido a esta parada: ¿cuántas vidas puede tener un mismo recinto?

Piensa en 1939, en los últimos meses de la Guerra Civil. El campo de concentración de prisioneros de Málaga, instalado en la fábrica y cuartel de La Aurora, estaba saturado. Ante ese colapso, los militares sublevados usaron la plaza de toros con el mismo fin: retener prisioneros. No hace falta recrear nada. Basta con situar la escena: un edificio pensado para miles de espectadores de una fiesta, empleado para retener a personas capturadas en una guerra.

Y hubo una segunda vez. En 1943, con Europa en plena Segunda Guerra Mundial, la plaza volvió a albergar detenidos. En esta ocasión eran refugiados extranjeros que habían huido de Francia. Detente un momento en esa diferencia: primero prisioneros de una guerra civil; después, personas que cruzaban una frontera escapando de otra guerra. El mismo edificio, la misma condición de detención, dos historias distintas. No sabemos, a partir de lo que queda, en qué parte exacta del recinto se encontraban; el detalle no hace falta para entender lo esencial: un espacio de fiesta convertido en espacio de encierro.

Después, la vida del edificio siguió transformándose. En 1976 fue declarada conjunto histórico-artístico, coincidiendo con el centenario de su inauguración, y en 1981, bien de interés cultural. Y luego llegó esa restauración que mencionaba al principio. Comenzó en 2017, se retrasó dos años, y abrió al público en 2019, coincidiendo con el 145 aniversario del inicio de su construcción. No fue solo una limpieza: incluyó la reorganización del espacio para albergar nuevos espacios expositivos y salas de congresos, con la intención de convertir La Malagueta en un centro cultural con uso durante todo el año. Un recinto de temporada, que fue también prisión dos veces, y que se proyecta hacia algo más permanente.

Vuelve ahora a mirar ese ladrillo recuperado. Cuando llegaste, era una fachada bonita al borde de la playa. Ahora sabes que esas mismas paredes han contenido una fiesta con siglos de tradición, prisioneros de una guerra, refugiados de otra, y después proyectos de salas y exposiciones. El ladrillo es el mismo; lo que ha cambiado es lo que la ciudad ha ido poniendo detrás de él.

Esta es la última parada del recorrido. No hace falta que recuerdes las fechas. Quédate con la idea de que un edificio no es solo lo que parece en el momento en que lo miras: es también todo lo que ha acogido, y eso, en La Malagueta, abarca mucho más que una tarde de toros.

## Texto original — Kimi K3

Mira la fachada que tienes delante. Ese ladrillo visto, con sus arcos y su decoración exterior, no siempre estuvo así de visible: fue una restauración reciente, comenzada en 2017 y terminada en 2019, la que lo recuperó. Así que lo primero que puedes hacer aquí no es entrar en la historia, sino simplemente mirar un edificio que ha vuelto a enseñar su piel original.

Y ahora, una pregunta: ¿cuántas vidas puede tener un mismo recinto? Porque esta plaza de toros, La Malagueta, ha sido mucho más que un coso taurino.

Empecemos por su forma. Si recorres el contorno con la vista, verás que no es un círculo perfecto: es un hexadecágono, un polígono de dieciséis lados, construido en estilo clasicista. Dentro, el ruedo mide 52 metros de diámetro, y tras la reforma de 2010 caben algo más de nueve mil espectadores. Es una plaza de primera categoría, pero de temporada: los toros llegan en momentos concretos del año. Dos corridas en Semana Santa, entre ellas la llamada Corrida Picassiana. La Corrida de la Prensa, en junio. Los festejos de la Feria de Agosto. Y una corrida en septiembre, coincidiendo con la festividad de la patrona de Málaga. El resto del calendario, el edificio espera.

O no. Porque hubo años en que este recinto se usó para algo completamente distinto, y conviene contarlo con calma.

En 1939, durante los últimos meses de la Guerra Civil, el campo de concentración de prisioneros de Málaga, instalado en la fábrica y cuartel de La Aurora, quedó saturado. Ante esa situación, los militares sublevados utilizaron la plaza de toros para albergar detenidos. No hace falta recrear la escena; basta con saber que este recinto, pensado para el espectáculo, sirvió entonces como lugar de reclusión forzada.

Unos años después, en 1943, el episodio se repitió con otras personas y otro contexto. Esta vez fueron refugiados extranjeros, gente que había huido de Francia durante la Segunda Guerra Mundial, quienes fueron detenidos aquí. Dos momentos distintos, dos guerras distintas, un mismo edificio convertido en prisión. No sabemos en qué parte exacta del recinto fueron retenidos, y no vamos a imaginarlo. Pero sí podemos quedarnos con el contraste: un espacio diseñado para que miles de personas miraran hacia un ruedo, usado dos veces para encerrar.

La historia siguió. En 1976, coincidiendo con el centenario de su inauguración, la plaza fue declarada conjunto histórico-artístico, y en 1981, bien de interés cultural. El edificio que había sido prisión era ya patrimonio protegido.

Y luego llegó la última transformación documentada. La restauración que se inició en 2017 sufrió un retraso de dos años y abrió al público en 2019, justo cuando se cumplían 145 años del inicio de la construcción. Además de recuperar la fachada de ladrillo que estás viendo, las obras reorganizaron el interior para crear espacios expositivos y salas de congresos. El proyecto apuntaba a convertir La Malagueta en un centro cultural con actividad durante todo el año, más allá de la temporada taurina. Cómo vive hoy ese propósito es algo que puedes comprobar paseando por sus alrededores; lo que sí sabemos es que el edificio fue preparado para ello.

Fíjate otra vez en el ladrillo de la fachada antes de irte. Cuando llegaste era solo la piel de una plaza de toros. Ahora sabes que detrás de ella hubo un ruedo de dieciséis lados, dos episodios de detención en dos guerras diferentes y una restauración que quiso darle una segunda vocación. Esta era la última parada del recorrido, y quizá sea buena idea terminar aquí: frente a un edificio que demuestra que un lugar no tiene una sola historia, sino todas las que fue capaz de contener.
