# Plan práctico: tours con DeepSeek que sean suficientemente buenos

Fecha: 16 de septiembre de 2026. Estado: plan preparado; nueva ejecución pendiente.

## Objetivo y decisión

Producir con DeepSeek historias claras, con hechos respaldados y agradables de escuchar, tomando como referencia los guiones que el usuario ya considera que funcionan. Empezamos con un proceso supervisado: DeepSeek redacta; Codex prepara un encargo breve y revisa el resultado. La calidad que buscamos es la de las muestras aceptadas, sin exigir un narrador excepcional ni autonomía completa.

**Creo que este alcance tiene posibilidades razonables de funcionar porque ya obtuvimos una variante de Madrid escrita y corregida por DeepSeek que el usuario considera útil.** La hipótesis práctica es que ejemplos completos, evidencia seleccionada y una parada por encargo permitirán repetir ese nivel con una revisión pequeña. Esa repetición es lo que falta comprobar.

Este plan recoge la nueva prioridad del usuario: «no tratemos de ser lo mejor del mundo, solo que funcione y sea suficiente». Define una prueba nueva; los [resultados del método anterior](metodo-editorial-deepseek-20260916.md) y de la [regla temporal](ejecucion-regla-fechas-deepseek-20260916.md) conservan sus fallos y criterios originales. No se modifican controles de producción ni se reclasifican aquellos ensayos como aprobados.

## La base que vamos a reutilizar

La [variante de Madrid con menos fechas](madrid-austrias-fechas-deepseek-20260916.md) será nuestra referencia principal. Su texto final procede de DeepSeek; Codex aportó instrucciones y revisión. El usuario confirma ahora que los guiones anteriores funcionaban: es una referencia de aceptación para este trabajo, sin convertirla en un estudio formal de oyentes.

Usaremos tres piezas completas, conservadas en el [guion original estructurado](../../backend/tmp/madrid-austrias-fechas-20260916/master.json):

| Referencia | Qué queremos repetir |
| --- | --- |
| «Una corte que decide quedarse» — `alcazar` | Una fecha importante sitúa el cambio; el edificio actual se distingue del desaparecido. |
| «El concejo busca casa» — `casa_villa` | Una necesidad cotidiana y una espera documentada dan interés al episodio. |
| «Una sede para juzgar y encerrar» — `carcel_corte` | Explicar la función de un edificio permite entenderlo sin acumular fechas. |

Son ejemplos de voz, selección y desarrollo. Los hechos de cada nueva parada proceden exclusivamente de su propia evidencia admitida. No copiaremos comienzos o cierres por obligación ni trasladaremos acontecimientos de Madrid a otra ciudad.

La [primera versión de Madrid](madrid-austrias-escucha-deepseek-20260916.md) queda como referencia válida de un estilo más cronológico. Tener más fechas no es un defecto si ayudan a entender el episodio.

## Flujo mínimo

**Ficha breve existente → DeepSeek escribe una parada → revisión concreta → corrección si hace falta → audio.**

- Preparar para cada parada el tema del tour, una frase sobre la historia que queremos contar, de tres a cinco hechos útiles con sus pasajes y las precauciones necesarias. Las fuentes, versiones y créditos se conservan en los registros existentes.
- Resolver la selección antes de redactar. Un dato contradictorio y prescindible queda fuera del material utilizable; no encargamos al redactor resolverlo. Si la duda afecta al episodio principal, revisar la evidencia o escoger otro episodio.
- Entregar dos de los guiones completos de referencia, eligiendo los más próximos al encargo. La tercera referencia queda disponible para evitar que todas las paradas tengan la misma estructura.
- Pedir a DeepSeek solamente el guion en el formato mínimo existente. No añadir una ficha de razonamiento, un registro de citas por frase ni una autoevaluación como condición para escribir.
- Redactar las paradas de una en una, con su posición y el texto de la anterior cuando exista. Escribir la bienvenida al final, a partir de las paradas aceptadas, para evitar promesas y repeticiones innecesarias.
- Empezar con la configuración usada en la adaptación útil de Madrid: `deepseek-flash`, sin razonamiento adicional. No necesitamos comparar modelos o modos para esta primera prueba; al ejecutar se confirma la disponibilidad y se registra el modelo realmente devuelto.

La revisión seguirá comprobando el respaldo histórico contra los pasajes originales aunque no obliguemos al redactor a devolver un segundo documento de citas. Se reutilizan cliente, control de gasto, registros, fuentes y voz existentes; no se construye otro motor.

**Encargo base para el redactor**, acompañado de los ejemplos, la ficha de esta parada y su contexto en el paseo:

> Escribe una parada de audioguía con una voz y un desarrollo parecidos a los ejemplos. Cuenta el episodio indicado usando solo los hechos de esta ficha. Ayuda a entender qué ocurrió y qué cambió; no necesitas mencionar todos los datos disponibles. Conserva las fechas que sitúan un cambio importante y usa siglos o relaciones temporales claras para las demás. No inventes escenas, motivos ni conversaciones. Escribe para escuchar, con una extensión parecida a las referencias. Entrega el guion completo en el formato solicitado, sin explicar tu proceso editorial.

Esta instrucción breve sustituye el encargo experimental anterior para esta nueva muestra. No se le concatenan los protocolos, tablas de evaluación o contratos de fichas de los ensayos fallidos.

## Qué significa «suficiente»

| Aspecto | Criterio práctico |
| --- | --- |
| Historia correcta | No quedan afirmaciones históricas sin apoyo, acontecimientos confundidos o motivos y diálogos inventados. Una duda relevante se resuelve con evidencia o se excluye. |
| Comprensión | Se entiende qué ocurrió, qué cambió y su relación con el lugar. La cronología no induce a error. |
| Experiencia | Suena como una explicación que escucharíamos durante el paseo; desarrolla una idea reconocible sin repeticiones pesadas ni frases difíciles de seguir. No tiene que sorprender en cada párrafo. |
| Fechas | Se conservan las que ayudan. No hay mínimo ni máximo obligatorio de años pronunciados. Una lista pesada se señala como problema de escucha, no por superar una cifra. |
| Longitud | Tomar las piezas aceptadas como escala: aproximadamente uno o dos minutos por parada y una bienvenida corta. Es orientativo; no se rechaza una pieza por diez palabras de diferencia ni se añade relleno para llegar a una cuota. |
| Fuentes y audio | Material ya admitido, créditos conservados y audio que corresponde al texto final y se puede reproducir. Se mantienen las condiciones de uso y los controles existentes. |

No se retoca una frase únicamente porque el editor podría escribirla de otra manera. Un estilo sencillo, alguna fecha adicional o una transición poco original son aceptables si el conjunto funciona.

## Primera prueba concreta

**Valencia: edificios que cambiaron de oficio. Dos paradas y una bienvenida.** Aprovechamos el [dossier ya disponible](../../backend/tmp/editorial-method-deepseek-20260916/case.json); no hace falta volver a investigar una ciudad ni regenerar los audios de Madrid que ya sirven.

| Parada | Episodio elegido | Precaución concreta |
| --- | --- | --- |
| Palacio de la Generalidad | De buscar dependencias para reunirse a adaptar el palacio para la Audiencia; el edificio fue creciendo por etapas. | El alquiler no demuestra el comienzo de toda la construcción. Excluir la fecha de inicio discutida. Distinguir la decisión de traslado de su ejecución. |
| Torres de Serranos | Una puerta fortificada se convirtió en prisión y, durante la Guerra Civil, en depósito de obras del Prado. | Distinguir cambios de función. El refuerzo pretendía proteger las obras; no demuestra protección infalible. No afirmar usos actuales sin verificarlos. |

El paso del palacio a las torres debe situar el regreso a la época medieval. Los ejemplos de Madrid y estas decisiones editoriales se seleccionan antes de generar. Valencia ya se utilizó para diagnosticar problemas: esta es una prueba práctica sobre un caso conocido, no una validación independiente de generalización.

Se mantiene el orden relativo del recorrido guardado. La muestra es de narración y escucha, sin prometer accesos, giros ni una nueva validación del paseo.

## Tareas y entregables

El plan y su lista de tareas quedan juntos en este documento de `docs/tours`, siguiendo la ubicación solicitada para este trabajo y conservando los planes de otras tareas.

### T1. Preparar el encargo breve

- [ ] Extraer literalmente las referencias elegidas del guion aceptado; mantener sus créditos y separarlas de la evidencia de Valencia.
- [ ] Preparar las dos fichas breves con los episodios anteriores, sus pasajes utilizables y los detalles descartados. Conservar el dossier completo para revisión.

**Verificación:** lectura de las fichas contra las fuentes; el texto del ejemplo no aparece como evidencia de otra parada. **Dependencias:** ninguna. **Alcance:** pequeño, un paquete de entrada dentro de una nueva carpeta de ejecución en `backend/tmp/`, sin cambios de aplicación.

### T2. Escribir y revisar las dos paradas

- [ ] DeepSeek escribe el palacio; Codex revisa hechos y comprensión. Después se escribe Serranos con el contexto de la parada anterior.
- [ ] Si hay un problema real, pedir una corrección concreta de la pieza afectada, como máximo una por pieza. Comprobar la corrección y conservar las partes que ya sirven.

**Verificación:** textos completos, episodio reconocible y sin errores históricos pendientes. La revisión señala qué frase cambia el significado y qué evidencia lo demuestra; no devuelve una lista de gustos personales. **Dependencia:** T1. **Alcance:** pequeño, reutilización del cliente y de los registros existentes; como mucho un ejecutor local breve si el actual no permite este encargo.

### T3. Cerrar el texto y generar audio

- [ ] DeepSeek escribe una bienvenida breve usando las dos paradas aceptadas; revisar que no añada hechos ni prometa algo ausente. Una corrección si hace falta, con el mismo criterio.
- [ ] Generar los capítulos y su unión con VoxCPM2 y la misma voz de Madrid. Entregar audio reproducible y guion final; verificar correspondencia, integridad y duración real.

**Verificación:** bienvenida y dos paradas completas, sin errores pendientes, con créditos y procedencia. **Dependencia:** T2. **Alcance:** pequeño, archivos de texto y audio en la carpeta de ejecución; sin integración nueva.

**Punto de entrega:** llegar a una muestra que puedas escuchar. No se exige completar antes una batería de ciudades ni una comparación de estilos. Si una pieza sigue teniendo un error importante, se informa cuál; las piezas válidas se conservan.

### T4. Decidir con la escucha y cerrar la prueba

- [ ] Recoger tu impresión: «¿me sirve como audioguía?», «¿se entiende qué pasó?» y «¿hay algún tramo pesado o confuso?». Tu pareja puede aportar su preferencia; no exigimos unanimidad sobre las fechas.
- [ ] Registrar una decisión sencilla: usable, necesita un cambio concreto o no sirve. Conservar número de llamadas, consumo, correcciones e intervención humana real.

**Verificación:** un comentario real del oyente y una decisión asociada. **Dependencia:** T3 y la respuesta del usuario; mientras no llegue, estado «audio entregado, valoración pendiente», sin inventar aceptación. **Alcance:** pequeño, un informe junto a este plan.

## Límites de esfuerzo y correcciones

- Primera prueba: tres piezas, hasta seis solicitudes físicas de DeepSeek en total, incluidas correcciones y fallos. Sin reintentos automáticos ocultos. Tope de exposición de API de 1 USD mediante el control existente; confirmar tarifas al ejecutar y registrar el consumo, no prometer un precio final.
- Una revisión editorial por pieza y una comprobación tras cambios. No se encadenan rondas buscando una versión ideal.
- Se permite un retoque humano puntual si deja listo un texto útil: como orientación, una o dos frases por parada. Debe quedar registrado y la autoría se describe como asistida y revisada. Si hace falta rehacer gran parte de la pieza, no se considera que el procedimiento esté funcionando con poca supervisión.
- Un retoque no añade hechos sin fuente ni resuelve incertidumbres inventando. Si falta evidencia del episodio principal, esa pieza queda pendiente; no se oculta el problema detrás de un buen estilo.
- La escucha puede señalar un cambio concreto para una siguiente versión. No convierte cada preferencia en un defecto que obligue a regenerar todo el tour.

## Cuándo damos este paso por conseguido

Cuando tengamos las dos paradas y la bienvenida en audio, sin errores históricos pendientes, que tú consideres utilizables y que hayan necesitado como mucho correcciones pequeñas. Eso basta para **continuar creando tours con DeepSeek bajo revisión editorial**. No necesitamos demostrar autonomía para empezar a producir contenido útil.

Si funciona, el siguiente paso es ampliar ese mismo concepto aprovechando más fichas admitidas y repetir el procedimiento. La integración como redactor en la app es una entrega posterior, acotada al camino real de narración y reutilizando su revisión: este piloto por sí solo no cambia el modelo por defecto.

Para tours actuales, conservar los guiones que ya funcionan. La misma referencia de estilo servirá para corregir únicamente los pasajes que resulten pesados o confusos; no se prevé una reescritura masiva.

La nueva prueba aún no se ha ejecutado. Este encargo termina con el plan y deja como siguiente tarea concreta preparar las dos fichas y redactar la primera parada.
