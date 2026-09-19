# Prueba: la historia desde el principio — resultado y escucha

Fecha: 16 de septiembre de 2026. Estado: **ejecución cerrada con resultado parcial; valoración de escucha pendiente**.

**Precisión tras revisar de nuevo el encargo:** el resultado original de una pieza utilizable sobre dos no equivale a cumplimiento estricto. El Colegio incorporó una localización ausente de los pasajes enviados, aunque se contrastó en la fuente completa. Bajo la instrucción original de limitarse a esos pasajes, ninguna de las dos piezas cumple todas las condiciones. Los registros y las narraciones originales se conservan. Véase el [diagnóstico posterior y la propuesta de ajuste](diagnostico-encargo-deepseek-20260916.md).

[Abrir comparación con fotografías y audio](/home/jesusotero/coding/tour-guide-app/backend/tmp/deepseek-episodio-inicio-20260916/index.html) · [Plan ejecutado](plan-deepseek-episodio-desde-el-inicio-20260916.md)

**El Colegio de la Seda quedó utilizable tras una corrección de DeepSeek. San Pío V siguió repitiendo su desenlace después de la corrección y no recibió audio nuevo.** Ninguno pasó al primer intento. Los guiones nuevos conservan exactamente el texto del modelo: cero recortes, sustituciones o reescrituras humanas.

## Qué produjo la prueba

| Pieza | Borrador nuevo | Después de corregir | Entrega anterior → texto nuevo |
| --- | --- | --- | --- |
| Colegio de la Seda | Petición en la segunda frase, pero afirmaciones no respaldadas y cierre repetitivo. | Se retiraron los problemas históricos señalados y el resumen redundante. | 164 → 112 palabras; unos 63 → 42 segundos. |
| San Pío V | El proyecto arquitectónico y su descripción desplazan los cambios de uso al final. | Abre con el hospital y el museo, pero los vuelve a contar al cerrar. No cumple el criterio de evitar repetición. | 215 → 109 palabras; variante nueva sin audio. |

Las cantidades anteriores corresponden a las versiones entregadas con edición humana, no a los borradores crudos. La página muestra también esos borradores anteriores por separado. Acortar el texto no es por sí solo un criterio de aceptación.

## Colegio de la Seda: comparación de escucha

![Antes: versión entregada con edición humana](/home/jesusotero/coding/tour-guide-app/backend/tmp/valencia-seda-20260916/audio/c0316eaa-4091-5c8d-ae12-a900af368325.mp3)

![Nueva versión de DeepSeek sin retoques humanos](/home/jesusotero/coding/tour-guide-app/backend/tmp/deepseek-episodio-inicio-20260916/audio/9dfa6b84-b6b4-547a-a0c0-7c1521b6d64c.mp3)

Estás ante la sede del Colegio del Arte Mayor de la Seda, en el barrio de Velluters. Los sederos enviaron una primera solicitud al rey Carlos segundo para que el oficio de velluter, el terciopelero, se considerara un arte. No fue una respuesta inmediata: pasaron nueve años hasta que, el treinta y uno de octubre de mil seiscientos ochenta y seis, les concedieron el título de Colegio de artistas. Desde entonces pasaron a denominarse Colegio del Arte de la Seda. La tarea del colegio incluía determinar el ancho, la cuenta y el peso de los tejidos, y regular el oficio y la producción de tejidos de seda en la ciudad de Valencia.

La apertura aún presenta primero el edificio: cumple la regla fijada de introducir el acontecimiento dentro de las dos primeras frases. Conserva el día y el mes del reconocimiento, pese a la preferencia editorial por simplificarlos; no había una cuota de fechas. Son detalles a valorar escuchándolo, sin declarar que el modelo imitó exactamente la reescritura humana.

La ubicación en Velluters se contrastó en la captura completa original de la fuente, congelada antes de la prueba; no figuraba en los tres pasajes abreviados del encargo. Por tanto, el resultado acredita una narración utilizable sin edición de texto, con revisión histórica, y no una adhesión perfecta a la selección breve de hechos.

## San Pío V: variante que no superó la revisión

El Colegio de San Pío V, actual sede del Museo de Bellas Artes de Valencia, cambió de función a lo largo del tiempo hasta convertirse en hospital militar durante la Guerra Civil. Tras el conflicto, el edificio pasó a albergar el Museo de Bellas Artes de Valencia.

Antes de esos usos, entre mil ochocientos veinte y mil ochocientos veintiséis, fue sede de la Beneficencia. En mil ochocientos treinta y cinco pasó a depender del Estado, que lo dedicó a almacén de provisiones del ejército. Durante la Guerra Civil fue hospital militar. Después de la guerra, el edificio se convirtió en la sede del Museo de Bellas Artes de Valencia.

Las dos primeras frases cuentan el hospital militar y la instalación del museo. Las dos últimas vuelven a contar esos mismos cambios. Se conserva la respuesta para inspección; no se recortó para convertirla en un resultado aprobado. La versión anterior del tour y su audio permanecen disponibles.

## Cómo se hizo y qué quedó comprobado

Las fichas de ambas piezas y el mismo encargo se fijaron antes de las llamadas. Se conservaron los pasajes, la posición, el contexto anterior y los ejemplos de Casa de la Villa y Cárcel de Corte. DeepSeek no recibió la reescritura humana del Colegio ni las versiones anteriores de la pieza que debía redactar. Las reparaciones señalaron defectos concretos y adjuntaron su propio borrador; no incluían frases humanas de sustitución.

Codex preparó las fichas y realizó la revisión semántica de los cuatro criterios. La segunda prueba comenzó después de aceptar la corrección de la primera. La comparación usa resultados anteriores guardados; no es un ensayo A/B simultáneo ni una medida de fiabilidad general.

Se realizaron **4 solicitudes físicas**, dos por pieza, con `deepseek-flash`, temperatura cero y razonamiento adicional desactivado. Coste estimado de API: **0.001771536 USD**, conciliado con el registro de gasto y las [tarifas oficiales consultadas](https://api-docs.deepseek.com/quick_start/pricing/). No incluye preparación, revisión, voz ni impuestos. No quedaron reservas abiertas ni se hicieron reintentos ocultos.

Se generó únicamente el nuevo audio del Colegio con la misma identidad de voz VoxCPM2. La generación y el relevo de GPU tardaron unos 42 segundos; el servicio que utilizaba la GPU quedó restaurado. Las versiones anteriores reutilizan sus archivos originales.

La comprobación local verificó huellas de entradas y fuentes, respuestas reales, igualdad entre el texto devuelto y el mostrado, identidad de voz, audio decodificable y con señal, imágenes cargadas y reproducción de los tres elementos de audio. Se inspeccionaron las vistas de escritorio y móvil; no hubo desbordamiento ni errores de ejecución. No se realizó una transcripción ni una auditoría auditiva palabra por palabra.

Registros: [evaluación](/home/jesusotero/coding/tour-guide-app/backend/tmp/deepseek-episodio-inicio-20260916/evaluation.json), [decisiones editoriales](/home/jesusotero/coding/tour-guide-app/backend/tmp/deepseek-episodio-inicio-20260916/decisions.json), [revisión del Colegio](/home/jesusotero/coding/tour-guide-app/backend/tmp/deepseek-episodio-inicio-20260916/colegio-repair.review.json), [revisión de San Pío V](/home/jesusotero/coding/tour-guide-app/backend/tmp/deepseek-episodio-inicio-20260916/sanpio-repair.review.json), [audio](/home/jesusotero/coding/tour-guide-app/backend/tmp/deepseek-episodio-inicio-20260916/audio-check.json) y [navegador](/home/jesusotero/coding/tour-guide-app/backend/tmp/deepseek-episodio-inicio-20260916/browser-check.json).

## Decisión

El nuevo encargo es útil como orientación, pero estos dos casos no justifican darlo por una regla que DeepSeek aplique consistentemente. El caso del Colegio mejora después de una corrección; la transferencia a San Pío V no cumple todos los criterios. Se cerró la prueba al alcanzar las cuatro llamadas previstas.

La siguiente decisión puede apoyarse en la escucha del Colegio. No se sustituyeron las narraciones de los tours completos ni se cambió el redactor de la app. La valoración del usuario se añadirá cuando llegue.

## Fuentes y créditos

Adaptación de textos de colaboradores de Wikipedia bajo [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/): selección de pasajes y nueva narración. Las fotos mantienen sus licencias, autores y enlaces originales en la comparación.

- [Colegio del Arte Mayor de la Seda, versión utilizada](https://es.wikipedia.org/wiki/Colegio_del_Arte_Mayor_de_la_Seda?oldid=174632164) · [Historial de colaboradores](https://es.wikipedia.org/wiki/Colegio_del_Arte_Mayor_de_la_Seda?action=history).
- [Museo de Bellas Artes de Valencia, versión utilizada](https://es.wikipedia.org/wiki/Museo_de_Bellas_Artes_de_Valencia?oldid=175147247) · [Historial de colaboradores](https://es.wikipedia.org/wiki/Museo_de_Bellas_Artes_de_Valencia?action=history).

Los audios y los registros son locales. Las fotografías necesitan conexión. Conservar la carpeta de esta prueba y las de las entregas anteriores, de las que se reutilizan los audios.
