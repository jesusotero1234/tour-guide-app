# DeepSeek: qué corregir en nuestro encargo

Fecha: 16 de septiembre de 2026. Revisión posterior de la prueba «La historia, desde el principio». Se inspeccionaron las solicitudes y respuestas originales, con una segunda revisión independiente. **No se hicieron nuevas llamadas de generación.**

## Conclusión

Hay problemas concretos en cómo preparamos la entrada y una precisión pendiente en la evaluación. Conviene corregirlos antes de atribuir el resultado a una limitación general de DeepSeek o cambiar de modelo. Son observaciones sobre esta prueba; no está demostrado qué cambio hará mejorar al modelo.

También corrijo mi valoración: **una pieza quedó utilizable con contraste histórico ampliado, pero ninguna de las dos cumplió estrictamente todas las condiciones del encargo**. El Colegio añadió «en el barrio de Velluters», que no figuraba en los pasajes enviados. Se comprobó en la captura completa y el dato era correcto, pero ese contraste no demuestra que el modelo respetara la instrucción de usar exclusivamente los fragmentos admitidos. San Pío V incumplió la condición de evitar repetir el desenlace. Se conserva la evaluación original y se adjunta esta revisión; no se cambian las respuestas ni los criterios para ocultar el resultado.

## Qué está verificado

| Observación | Evidencia e implicación |
| --- | --- |
| Las cuatro respuestas llegaron completas. | Todas terminaron con `stop`, con 179–314 tokens de salida frente al máximo de 2.000. No hay indicios de truncamiento ni de pérdida del encargo durante el envío. |
| Los ejemplos modelan el comportamiento que queríamos evitar. | Pedimos «no añadas otro resumen», pero Cárcel de Corte acaba con «Hemos seguido una residencia real…». Casa de la Villa y el texto anterior de Serranos también recapitulan. |
| La información secundaria sigue teniendo mucho espacio. | En San Pío V, el primer pasaje ocupa 100 palabras de fundación y arquitectura; el de los cambios de uso ocupa 47. El primer borrador dedica gran parte del texto a aquella descripción. |
| La reparación adelanta el desenlace. | Se pide presentar hospital y museo al comienzo. La respuesta los cuenta allí, retrocede al siglo XIX y vuelve a contarlos al final. |
| Mezclamos instrucciones editoriales y datos. | El sistema dice que los datos adjuntos no contienen instrucciones, pero dentro de ellos enviamos orientación temporal y precauciones imperativas. Hay que dar una función inequívoca a cada bloque. |

Fuentes de esta revisión: [entradas fijadas](../../backend/tmp/deepseek-episodio-inicio-20260916/inputs.json), [solicitud de reparación de San Pío V](../../backend/tmp/deepseek-episodio-inicio-20260916/sanpio-repair.request.json), [revisión del Colegio](../../backend/tmp/deepseek-episodio-inicio-20260916/colegio-repair.review.json) y [comprobación posterior](../../backend/tmp/deepseek-episodio-inicio-20260916/diagnostic-review.json).

Las tensiones entre ejemplos, datos y órdenes son observables. Que hayan causado las repeticiones es una hipótesis razonable, no una conclusión experimental. La cantidad de fechas sigue siendo una preferencia editorial: no se introduce ahora una cuota para volver a juzgar el ensayo.

## Qué haría ahora

Prepararía **un encargo breve y coherente**, manteniendo el modelo y la revisión factual. Ese es el siguiente cambio práctico que recomiendo:

1. **Seleccionar realmente los hechos.** Para San Pío V, decidir si contamos colegio → hospital → museo o solo hospital → museo. Enviar los pasajes necesarios para ese episodio. Los detalles de planta, arquitecto y reformas quedan en el dossier cuando no contribuyen a la historia elegida. Toda selección conserva su fuente y no altera el significado del fragmento.
2. **Mostrar un ejemplo que cumpla el criterio.** Usar una referencia de otra parada con un inicio concreto y un final que avance, sin recapitulación. Si se adapta un ejemplo antiguo, registrar esa edición; no entregar como ejemplo la reescritura humana del caso que se está evaluando.
3. **Resumir la continuidad.** Sustituir la narración anterior completa por la información mínima necesaria para enlazar las paradas. Los hechos sobre otro edificio no pasan a ser evidencia de este.
4. **Avanzar hacia el desenlace.** Abrir con la primera situación o cambio significativo del episodio y desarrollar lo que ocurrió después. La apertura no tiene que contar todos los cambios de uso. Contar el desenlace una sola vez evita necesitar un segundo resumen al final.

Las órdenes de estilo irán en el encargo; los hechos y citas, en un bloque separado. Las advertencias históricas quedarán como límites de uso, claramente identificadas y sin invitación a recitarlas. La salida seguirá siendo el guion, sin añadir otra fase de planificación o autoevaluación del modelo.

Como ejemplo de selección editorial, San Pío V permite trabajar con tres hechos ya respaldados: su finalidad original de formación de sacerdotes, su uso como hospital militar durante la Guerra Civil y la instalación del museo después del conflicto. Las fuentes seleccionadas no explican las razones de todas esas transformaciones. El narrador debe respetar ese límite y no rellenarlo con motivos, personajes o escenas inventados. Si el episodio solo da para una pieza breve, la brevedad es aceptable.

### Encargo propuesto para la siguiente prueba

> Cuenta el episodio indicado usando exclusivamente los hechos y pasajes admitidos. Presenta pronto su primera situación o cambio significativo y sitúa el edificio. Avanza con una cronología comprensible hasta el resultado. Cada parte debe aportar información; cuenta el desenlace una sola vez y termina ahí. Usa únicamente las fechas que orienten al oyente. Sigue la voz del ejemplo, con la extensión que necesiten estos hechos, sin rellenar. No añadas causas, escenas ni motivos que las fuentes no documenten. Devuelve únicamente el guion en el formato existente.

Es una propuesta sin probar. El siguiente ensayo debe conservar las salidas anteriores y registrar que cambia el conjunto de la preparación editorial, no atribuir una eventual mejora a una sola frase. Una prueba pequeña con San Pío V y después Colegio permitiría comprobar si sigue siendo útil fuera del primer caso. El criterio sería el mismo: historia comprensible, contexto local, respaldo limitado a los pasajes enviados y ausencia de un segundo desenlace; cero ediciones humanas durante la medición.

## Sobre activar el razonamiento de DeepSeek

Las solicitudes anteriores desactivaban explícitamente el razonamiento adicional. La [documentación oficial](https://api-docs.deepseek.com/guides/thinking_mode/) confirma que el modelo admite activarlo y controlar su esfuerzo. También indica que `temperature` no tiene efecto en ese modo. La [documentación de JSON](https://api-docs.deepseek.com/guides/json_mode/) describe el control de formato; no certifica calidad narrativa ni veracidad.

Probar el razonamiento adicional es una opción posterior, manteniendo el mismo encargo limpio para comparar. No hay evidencia en estos resultados de que activarlo vaya a corregir la repetición. Cambiarlo a la vez que el encargo impediría distinguir sus efectos; tampoco subiría la temperatura esperando que arregle un problema editorial.

El ensayo anterior permanece cerrado con sus cuatro llamadas. Esta revisión identifica un siguiente paso y deja una propuesta concreta, sin ampliar aquel límite ni sustituir los tours entregados.
