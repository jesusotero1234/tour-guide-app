# Plan: que DeepSeek llegue antes a la historia

Fecha: 16 de septiembre de 2026. Estado: **ejecución cerrada con resultado parcial; comparación entregada y valoración de escucha pendiente**.

## Resultado que buscamos

Conseguir que DeepSeek presente pronto el acontecimiento que da interés a una parada y lo desarrolle sin repetirlo al cerrar. El objetivo sigue siendo una audioguía clara y suficiente, con hechos respaldados. La prueba debe mostrar cuánto consigue el modelo con un encargo breve y cuánto trabajo editorial sigue necesitando.

Partimos del [método práctico](plan-practico-tours-deepseek-20260916.md) y de las [dos entregas de Valencia](plan-valencia-ampliacion-y-seda-20260916.md). Este paso conserva su preparación supervisada de fuentes. La selección del episodio sigue siendo de Codex; DeepSeek escribe. No estamos probando que el modelo investigue o seleccione por sí solo una buena historia.

## Qué aprendimos del texto real

En el Colegio de la Seda, el acontecimiento útil ya estaba en la ficha: los sederos solicitaron reconocimiento como artistas y consiguieron un título. Aun así, el borrador tardó en presentarlo, repitió la petición y el reconocimiento e incorporó advertencias editoriales al guion. La reparación dejó parte de esos problemas; el texto entregado necesitó una precisión sobre el lugar y un recorte humano de 75 palabras. Véanse el [borrador](../../backend/tmp/valencia-seda-20260916/colegio-draft.result.json), la [reparación](../../backend/tmp/valencia-seda-20260916/colegio-repair.result.json) y las [ediciones declaradas](../../backend/tmp/valencia-seda-20260916/master.json).

En San Pío V, la sucesión de funciones aparece en el desarrollo y vuelve a enumerarse al final. Su [versión entregada](../../backend/tmp/valencia-ampliada-20260916/master.json) también recibió una edición humana para distinguir el hospital militar del depósito de arte de Serranos.

**Hipótesis:** señalar el acontecimiento que debe abrir la pieza, separar los hechos de las precauciones y pedir que el cierre aporte una consecuencia ayudará más que añadir instrucciones genéricas sobre emoción. La prueba comprobará ese conjunto de cambios; no aislará el efecto de cada frase del encargo.

## Cómo convertiría mis decisiones editoriales en un encargo

| Decisión al preparar el relato | Qué recibirá DeepSeek |
| --- | --- |
| Encontrar el cambio que merece contarse. | Una frase factual sobre el episodio, sin escribirle la primera frase del guion. |
| Identificar quién hizo qué. | Personas, colectivos o instituciones documentados y su acción. Si solo conocemos un cambio de uso, eso basta. |
| Separar lo que ocurrió de lo que imaginamos. | Tres a cinco hechos útiles con sus pasajes admitidos. Los motivos desconocidos quedan fuera. |
| Dar prioridad a la historia. | La petición, decisión o transformación debe entenderse en las dos primeras frases; el lugar se sitúa en el primer párrafo. |
| Usar el tiempo para orientar. | Una nota sobre qué fecha sitúa el cambio y qué puede expresarse como siglo o relación temporal. Sin cuotas de años. |
| Parar cuando el episodio está contado. | Un resultado o efecto documentado para cerrar; evitar repetir la misma lista de acontecimientos. |

La estructura orientativa será **acontecimiento → contexto necesario y lugar → desarrollo → consecuencia**. Cuando exista una petición documentada, puede adoptar la forma «qué querían → qué hicieron → qué consiguieron». No se exige ese esquema a historias cuyas fuentes solo documentan transformaciones.

La ficha cabe en un bloque breve dentro del encargo existente: **núcleo del episodio, hechos y pasajes, vínculo con el lugar, orientación temporal y precauciones**. No hace falta otra llamada para producir un esquema ni pedir al modelo explicaciones de su proceso. Su salida seguirá siendo únicamente el guion.

### Aplicación a las dos piezas

| Pieza | Núcleo factual que preparará Codex | Qué debe permanecer fuera |
| --- | --- | --- |
| Colegio del Arte Mayor de la Seda | Petición de los sederos a Carlos II para que su oficio se considerara arte; concesión del título en 1686; regulación de los tejidos. La fecha de la primera solicitud puede quedar como referencia interna y expresarse mediante la espera documentada. | Motivos personales, diálogo con el rey, creación desde cero de la organización, fechas del edificio deducidas a partir del título. |
| San Pío V / Museo de Bellas Artes | Un colegio destinado a formar sacerdotes tuvo otros usos, fue hospital militar durante la Guerra Civil y después albergó el museo. Priorizar esa transformación; los datos arquitectónicos son secundarios para este episodio. | Inventar por qué se decidió cada cambio, atribuir el hospital a Serranos o presentar la llegada del museo como su fundación. |

Las precauciones son límites para la redacción, no evidencia adicional. Por ejemplo, «no afirmar que el edificio se construyó en 1686» tampoco permite afirmar que no se construyó entonces: la cronología del inmueble necesita su propia fuente. No hay que narrar al visitante esa advertencia.

## Encargo reutilizable propuesto

Este bloque sustituye las instrucciones editoriales anteriores en la copia del experimento. Se conservan las reglas existentes sobre idioma, hechos admitidos, ejemplos y formato.

> Escribe una parada para escuchar a partir de esta ficha. En las dos primeras frases presenta la petición, decisión o transformación documentada que pone en marcha el episodio. Sitúa el lugar en el primer párrafo. Continúa con los hechos necesarios para entender qué ocurrió y qué cambió; no necesitas usar todos los datos.
>
> Si las fuentes no explican una intención o una causa, cuenta únicamente el cambio que documentan. Las precauciones son límites del encargo: no las conviertas en hechos ni en explicaciones para el visitante.
>
> Conserva las fechas que orienten un cambio importante y usa relaciones temporales claras para las demás, sin cuotas. Termina con una consecuencia documentada o con lo que esa historia permite entender del lugar. Si el desenlace ya está contado, termina ahí: no añadas otro resumen ni una moraleja. Cada párrafo debe hacer avanzar el episodio.
>
> Sigue la voz y la extensión aproximada de los ejemplos. Sus hechos no pertenecen a esta parada. No inventes escenas, diálogos, emociones ni motivos. Habla de tú en español y escribe los números como se pronuncian. Devuelve solo JSON con `id` y `text`, sin esquema, autoevaluación ni explicación del proceso.

## Experimento pequeño y reproducible

Primero se prueba **Colegio de la Seda**. Si cumple tras la generación inicial o una reparación, se aplica el mismo encargo a **San Pío V**, que comprueba una historia de transformación sin necesidad de inventar una petición. Si el primer caso sigue fallando, se registra el fallo y se conserva lo producido; no se amplía la ejecución buscando una muestra favorable.

Antes de llamar al modelo se fijan las fichas de ambas piezas, el encargo, los criterios y los límites. Se reutilizan los mismos pasajes, posición en el tour, contexto anterior y dos ejemplos completos de las solicitudes originales: **Casa de la Villa y Cárcel de Corte**. Se conservan las referencias, versiones y decisiones de uso de las fuentes. Se reduce y organiza la ficha, manteniendo identificable qué evidencia procede del material anterior.

La reescritura humana del Colegio mostrada en la conversación sirve para explicar la intención al usuario; **no se entrega a DeepSeek como ejemplo ni como borrador de esa misma pieza**. Tampoco se le entregan sus guiones previos. El modelo recibirá los hechos y la orientación, y redactará de nuevo. Durante una reparación recibirá solo su propio borrador y los defectos concretos, sin frases de sustitución escritas por Codex.

Se compararán por separado el borrador anterior sin editar, la nueva salida del modelo y la versión anterior entregada con ediciones humanas. No se vuelve a pagar por generar el control. Es una comparación práctica con resultados guardados, no un ensayo A/B simultáneo ni una prueba de fiabilidad general.

### Qué cuenta como resultado suficiente

La revisión contrastará el texto completo con los pasajes y anotará cuatro respuestas breves, con el fragmento que justifica cada una:

1. **Historia al principio:** en las dos primeras frases se entiende qué petición, decisión o transformación vamos a seguir. Un saludo o un adjetivo atractivo no bastan.
2. **Desarrollo comprensible:** se entiende qué ocurrió y qué cambió, se reconoce el lugar, la cronología es coherente y no se ha reducido todo a una frase llamativa.
3. **Sin vueltas innecesarias:** los párrafos aportan información; el cierre no vuelve a enumerar lo ya contado. Repetir un nombre para aclarar una referencia no es un fallo por sí mismo.
4. **Respaldo histórico:** las afirmaciones tienen apoyo, se conservan los hechos necesarios y no se convierten precauciones en hechos, sucesiones en causas ni desconocimiento en intenciones.

Se permite una reparación que señale todos los defectos concretos encontrados en esa revisión. El prompt común y los criterios permanecen fijos entre los dos casos. Se registra si una pieza pasa al primer intento o tras reparar.

Durante esta medición **Codex no edita la narración**. Si para dejarla utilizable hay que recortarla o reescribirla manualmente, se anota que el método aún necesita esa intervención y no se cuenta como reproducción conseguida. Esto acota la prueba; no invalida los tours anteriores, que se entregaron expresamente con revisión editorial.

## Tareas para ejecutarlo

### T1. Preparar las entradas y el ejecutor local

- [x] Guardar fichas, encargo y referencias anteriores en `backend/tmp/deepseek-episodio-inicio-20260916/`, con sus huellas antes de las llamadas. Comprobar que no se ha incluido el guion humano del caso evaluado.
- [x] Reutilizar el [ejecutor de la seda](../../backend/tmp/valencia-seda-20260916/run.cjs), adaptando únicamente identidad de ejecución, las dos piezas admitidas y el máximo de cuatro solicitudes físicas. Mantener los controles de consumo, respuestas e integridad.

**Verificación:** pasajes presentes en sus capturas, ejemplos y contexto conservados, revisión de las diferencias del encargo y comprobación local del formato y los límites sin API. **Dependencias:** ninguna. **Alcance:** pequeño; entradas/protocolo y ejecutor local, sin cambios en producción.

### T2. Probar Colegio de la Seda

- [x] Generar la pieza, revisarla con los cuatro criterios y pedir una única reparación si hay defectos concretos.
- [x] Guardar las salidas sin editar y la comparación con el borrador y la versión entregada anteriores, separando el trabajo de DeepSeek de la preparación editorial.

**Verificación:** los cuatro criterios cumplidos sin edición humana, o fallo documentado con la causa. **Dependencias:** T1. **Alcance:** pequeño; una pieza y sus registros. **Punto de control:** solo una pieza que cumple permite pasar a T3; no se exige otra aprobación del usuario durante una ejecución autorizada.

### T3. Comprobar la transferencia a San Pío V

- [x] Aplicar el encargo ya fijado a la segunda ficha; permitir una reparación bajo las mismas condiciones.
- [x] Comprobar especialmente que cuenta cambios de uso sin inventar sus motivos y que no enumera dos veces la misma sucesión.

**Verificación:** los mismos cuatro criterios, con revisión de la evidencia. **Dependencias:** T2 superada. **Alcance:** pequeño; una pieza y sus registros. Si falla, el resultado queda como mejora limitada al primer caso; no se declara que la regla funciona de forma general.

### T4. Entregar comparación de escucha y decisión

- [x] Generar audio solo para las piezas nuevas que cumplen, reutilizando VoxCPM2, la voz y las fotografías existentes. Mostrar antes y después por parada, con sus textos; la versión anterior se etiqueta como entrega con edición humana. Conservar los tours completos originales.
- [x] Documentar llamadas, consumo estimado, reparaciones, tiempo registrado y resultado editorial.
- [ ] Registrar la impresión del usuario cuando llegue; estado actual: «comparación entregada, valoración de escucha pendiente». Esta respuesta no bloquea el cierre de la ejecución técnica.

**Verificación:** audio reproducible, correspondencia con el texto enviado al sintetizador, misma identidad de voz y enlaces funcionales. **Dependencias:** T2 y, si procede, T3. **Alcance:** pequeño; comparación local y un informe en `docs/tours`. El cierre documental procede también si una pieza falla, sin sintetizar un guion con errores pendientes.

## Límites y decisión posterior

- Máximo **cuatro solicitudes físicas de DeepSeek** en todo el experimento y **dos por pieza**, incluidos errores y reparaciones. Sin reintentos ocultos. Tope de exposición de **1 USD de API** mediante el control existente; es un límite, no una previsión de coste total.
- Mantener inicialmente la configuración anterior: `deepseek-flash`, razonamiento adicional desactivado y temperatura cero. Al ejecutar, comprobar disponibilidad y tarifas oficiales y registrar el modelo realmente devuelto; cualquier cambio de configuración queda explícito.
- La escucha se evalúa aparte de la exactitud factual. Contar palabras o años puede describir el resultado, pero no sustituye los cuatro criterios ni impone cuotas.
- Si las dos piezas cumplen, la instrucción queda como candidata para las siguientes paradas bajo revisión. Si solo una cumple, se registra ese alcance. La valoración del usuario puede motivar un ajuste concreto posterior; no se inventa aceptación ni se abren rondas ilimitadas.

El plan y sus tareas quedan juntos en `docs/tours`, siguiendo la ubicación acordada. La ejecución se recoge a continuación; el redactor de la app conserva su configuración.

## Resultado de ejecución

Cuatro llamadas, cero ediciones humanas de las narraciones nuevas y un resultado parcial: Colegio aceptado después de una reparación; San Pío V sigue repitiendo el hospital y el museo después de su reparación. Ninguna pieza pasó al primer intento. El Colegio pasó de 164 a 112 palabras respecto a la entrega anterior, y de unos 63 a 42 segundos. Solo se sintetizó esa variante. La fecha completa se mantiene y la localización en Velluters requirió contraste con la captura original completa, como detalla el informe. No se afirma cumplimiento perfecto del encargo ni transferencia consistente entre episodios.

[Comparación con fotografías y audio](../../backend/tmp/deepseek-episodio-inicio-20260916/index.html) · [Resultado completo y guiones](resultado-deepseek-episodio-desde-el-inicio-20260916.md). Consumo estimado de DeepSeek: 0,001771536 USD de API; no es el coste total de producción. Imágenes, reproducción, integridad y vista móvil comprobadas. Valoración del oyente pendiente.

Revisión posterior solicitada por el usuario: el Colegio quedó utilizable mediante contraste de una localización con la captura completa, pero esa localización no estaba en los pasajes enviados. La aceptación práctica original no demuestra cumplimiento estricto de la ficha: bajo ese criterio, el resultado es cero piezas sobre dos. Se mantienen los registros originales y se documenta la precisión en el [diagnóstico del encargo](diagnostico-encargo-deepseek-20260916.md), junto con una propuesta de entrada más coherente. No se hicieron nuevas llamadas de generación en esta revisión.
