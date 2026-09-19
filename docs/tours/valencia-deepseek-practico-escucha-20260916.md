# Valencia: edificios que cambiaron de oficio — escucha con DeepSeek

Fecha: 16 de septiembre de 2026. Estado: **muestra de audio aceptada por el usuario; solicita imágenes de los edificios**.

Se ejecutó el [plan práctico](plan-practico-tours-deepseek-20260916.md) hasta entregar la muestra para escuchar: bienvenida, Palacio de la Generalidad y Torres de Serranos. **DeepSeek escribió las tres piezas a la primera; no hubo llamadas de corrección ni edición manual de sus frases.** Codex seleccionó la evidencia, preparó los encargos y revisó los textos completos.

![Escuchar Valencia: edificios que cambiaron de oficio](/home/jesusotero/coding/tour-guide-app/backend/tmp/valencia-deepseek-practico-20260916/valencia-edificios-que-cambiaron-de-oficio.mp3)

**Duración: 3:18.** 479 palabras, con la misma voz española A de VoxCPM2 usada en Madrid. Es una muestra compacta de narración, sin nueva validación del recorrido peatonal ni publicación en la app.

## Qué se hizo

Se utilizaron ejemplos completos de los guiones de Madrid que el usuario considera útiles. Para el palacio se eligieron Casa de la Villa y Alcázar; para Serranos, Cárcel de Corte y Alcázar. La bienvenida recibió el ejemplo de bienvenida de Madrid y las dos paradas de Valencia ya revisadas. Los ejemplos aportaron estilo; los hechos proceden de los pasajes de Valencia.

Codex preparó cuatro hechos por parada, con extractos admitidos y precauciones breves. La fecha discutida de inicio del palacio quedó fuera del material utilizable antes de redactar. También se excluyeron detalles secundarios y usos actuales innecesarios. Las paradas se escribieron por separado, Serranos recibió el texto anterior y la bienvenida se redactó al final. Las instrucciones generales fueron al mensaje de sistema y el material al mensaje de tarea.

La revisión comprobó hechos y comprensión, sin exigir una cuota de palabras o fechas. El palacio conserva tres años completos y Serranos dos; la bienvenida no los repite. Se aceptaron su extensión y las aperturas similares porque no requerían una corrección importante para esta muestra. La selección previa y el encargo breve forman parte de la intervención editorial: el resultado no es investigación ni publicación autónoma de DeepSeek.

## Resultado y esfuerzo

| Medida | Resultado |
| --- | --- |
| Modelo devuelto | `deepseek-flash` |
| Configuración | Razonamiento adicional desactivado, temperatura cero |
| Solicitudes físicas | 3 |
| Correcciones de DeepSeek | 0 |
| Retoques manuales del guion | 0 |
| Revisión | Codex, las tres piezas completas contra la evidencia |
| Texto | 479 palabras: 75 de bienvenida, 220 del palacio y 184 de Serranos |
| Tiempo acumulado de API | 6.4 segundos |
| Proceso local de voz, incluida preparación y restitución del servicio de GPU | 83.4 segundos |
| Consumo estimado de DeepSeek | 0.001181 USD |

La estimación usa el consumo de las tres respuestas y las [tarifas oficiales consultadas el 16/09/2026](https://api-docs.deepseek.com/quick_start/pricing/). Quedó dentro del tope de exposición de 1 USD y no quedaron reservas abiertas. No es una factura ni incluye Codex, preparación editorial, revisión, infraestructura, electricidad o impuestos. Los tiempos no representan todo el trabajo editorial de la sesión.

**Evaluación editorial: apto para esta escucha supervisada, sin errores importantes detectados pendientes. Valoración del usuario: usable como muestra de audio, con imágenes solicitadas.** Este caso era conocido y la evidencia fue seleccionada por Codex. El resultado no demuestra fiabilidad general ni ahorro total frente a otro flujo.

## Capítulos

| Inicio | Capítulo | Duración |
| --- | --- | --- |
| 0:00 | Bienvenida | 0:30 |
| 0:32 | Un lugar para reunirse | 1:31 |
| 2:05 | De puerta a prisión y depósito de arte | 1:12 |

Hay dos segundos de separación entre capítulos. La duración del archivo corresponde al audio, no al paseo.

## Fotografías para acompañar la escucha

Se localizaron fotografías reales mediante el buscador de Commons que ya existe en la aplicación. Las fichas identifican los edificios y conservan autoría y licencia. La vista previa remota falló; se entregan enlaces a las fotografías, sin dar por verificado visualmente el encuadre ni por completada su integración en la app.

| Capítulo | Fotografía | Crédito y licencia declarados en Commons |
| --- | --- | --- |
| 0:32 · Palacio de la Generalidad | [Ver fotografía del palacio](https://commons.wikimedia.org/wiki/File:Palau_del_la_Generalitat_P1390956.JPG) | Pere López · [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
| 2:05 · Torres de Serranos | [Ver fotografía de las torres](https://commons.wikimedia.org/wiki/File:Puerta_de_los_Serranos,_Valencia,_Espa%C3%B1a,_2014-06-30,_DD_86.JPG) | Diego Delso, [delso.photo](https://delso.photo) · [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |

No se han editado estas imágenes. La selección y sus metadatos quedan disponibles en el [registro de candidatos](../../backend/tmp/valencia-deepseek-practico-20260916/photo-candidates.json). Para la presentación del tour, usar una vista reconocible del edificio con crédito junto a la imagen; una fotografía actual no representa necesariamente el aspecto que tenía en el episodio narrado.

## Guion y créditos

Adaptación con IA de material de colaboradores de Wikipedia, bajo [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.es). Cambios: selección de pasajes y nueva narración. Bases de Valencia:

- [Palacio de la Generalidad Valenciana, revisión 173450230](https://es.wikipedia.org/w/index.php?title=Palacio_de_la_Generalidad_Valenciana&oldid=173450230); [historial de colaboradores](https://es.wikipedia.org/w/index.php?title=Palacio_de_la_Generalidad_Valenciana&action=history).
- [Torres de Serranos, revisión 173134642](https://es.wikipedia.org/w/index.php?title=Torres_de_Serranos&oldid=173134642); [historial de colaboradores](https://es.wikipedia.org/w/index.php?title=Torres_de_Serranos&action=history).

Se conservan también las [referencias de estilo y créditos de Madrid](madrid-austrias-fechas-deepseek-20260916.md#guion-y-créditos). La voz mantiene la identidad y procedencia del preset de la escucha anterior. Esta ejecución local no amplía las condiciones de uso ya documentadas ni modifica el catálogo de la aplicación.

### Bienvenida

Bienvenidos a este paseo por Valencia, donde seguiremos la historia de dos edificios que cambiaron de oficio. Empezaremos ante el Palacio de la Generalidad, para ver cómo una necesidad concreta hizo que una institución echara raíces en un lugar. Después, retrocederemos a la época medieval ante las Torres de Serranos, para descubrir cómo una puerta defensiva acabó teniendo otras funciones. Son dos paradas que nos hablan de decisiones y transformaciones a lo largo del tiempo.

### Un lugar para reunirse

Mira hacia el Palacio de la Generalidad. Esta historia empieza con una necesidad muy concreta: los diputados de la Generalidad querían un lugar fijo para sus reuniones periódicas. En mil cuatrocientos dieciocho decidieron buscarlo, y en mil cuatrocientos veintiuno alquilaron al notario Jaume Desplà dos dependencias de una casa, un alberch, en la actual calle Caballeros. Allí instalaron las salas de reuniones y la escribanía. Ese alquiler no marca el inicio de todo el palacio, pero sí el momento en que la institución echó raíces en este lugar. Con el tiempo, el edificio fue creciendo y adaptándose. Su arquitectura es una mezcla compleja de estilos: del gótico al herreriano, pasando por el renacentista de varias épocas. Un cambio importante llegó en mil setecientos cincuenta, cuando se decidió trasladar la Audiencia al palacio. Para adecuarlo a ese nuevo uso se hizo una reforma, y el maestro de obras fue Vicente Clemente. Esa decisión no significa que el traslado se completara ese mismo año, pero sí que el edificio empezó a prepararse para otra institución. Ya en el siglo veinte, en los años cincuenta, se construyó un torreón nuevo, obra de Luis Albert Ballesteros, que logró compenetrar lo nuevo con lo antiguo. Así, lo que nació como sede de reuniones y escribanía terminó siendo un palacio que creció y cambió de oficio.

### De puerta a prisión y depósito de arte

Mira ahora hacia las Torres de Serranos. Después de la parada anterior, aquí retrocedemos a la época medieval. El conjunto está formado por dos torres poligonales unidas por un cuerpo central, donde se abre la puerta propiamente dicha. A finales del siglo catorce, los jurados de Valencia vieron necesario reforzar ese sector de la muralla y encomendaron la construcción de las torres al maestro Pere Balaguer. Lo que empezó siendo una puerta defensiva no conservó siempre esa función. En mil quinientos ochenta y seis, después del incendio de la ciudad, las torres se reconvirtieron en prisión de nobles y caballeros. Mucho después, durante la Guerra Civil, sirvieron de depósito para las obras evacuadas del Museo del Prado. En diciembre de mil novecientos treinta y seis se construyó una bóveda de hormigón armado sobre el primer piso, destinada a evitar que las obras alojadas en el piso inferior sufrieran daños en caso de bombardeo y derrumbe. Así, un edificio que nació como puerta de muralla pasó a ser prisión y, siglos más tarde, refugio de obras de arte. Las funciones cambiaron aunque el edificio permaneciera.

## Verificación y archivos

Se verificaron las entradas congeladas, los extractos literales y los ejemplos exactos, la identidad y respuesta del modelo y la coincidencia de todos los textos finales con sus salidas. Los tres capítulos y la unión se decodifican, tienen señal y conservan huellas y procedencia vinculada. La identidad de voz coincide con Madrid. El consumo coincide con el registro de gasto y el servicio que ocupaba la GPU quedó restaurado.

La correspondencia verificada es la del texto enviado al sintetizador y su procedencia; no se ha hecho transcripción automática ni una auditoría humana palabra por palabra del audio generado. El usuario ya ha valorado positivamente la muestra.

- [Entradas, selección y referencias](../../backend/tmp/valencia-deepseek-practico-20260916/inputs.json) y [protocolo de esta ejecución](../../backend/tmp/valencia-deepseek-practico-20260916/protocol.json).
- [Guion final](../../backend/tmp/valencia-deepseek-practico-20260916/master.json) y [evaluación, consumo y audio](../../backend/tmp/valencia-deepseek-practico-20260916/evaluation.json).
- [Revisión del palacio](../../backend/tmp/valencia-deepseek-practico-20260916/palacio-review.json), [de Serranos](../../backend/tmp/valencia-deepseek-practico-20260916/serranos-review.json) y [de la bienvenida](../../backend/tmp/valencia-deepseek-practico-20260916/bienvenida-review.json).
- [Comprobación reproducible sin API](../../backend/tmp/valencia-deepseek-practico-20260916/verify.cjs) y [registro del proceso de voz](../../backend/tmp/valencia-deepseek-practico-20260916/render/gpu-handoff.json).

Los artefactos locales de ejecución y audio están fuera de Git; hay que conservar esa carpeta para mantener los enlaces y reproducir la inspección. El cambio de esta entrega se limita a documentación y artefactos locales; no se modificó código de la app.

## Valoración del usuario y decisión

El usuario respondió: «me gusta full solo q tendria q tener los edificios en imagenes pero esta cool, me gusta». Se registra como **usable como muestra de audio**, con fotografías como mejora solicitada, sin petición de reescritura. T1–T4 están completadas. Esta valoración no equivale a respuestas separadas a todas las preguntas orientativas ni a una evaluación de otros oyentes.

Los archivos originales de evaluación y guion conservan el estado que tenían al entregar el audio, cuando aún no había respuesta. Esta sección registra la valoración posterior; no se cambian el audio, sus huellas ni los resultados de experimentos anteriores.

Las fotografías se han enlazado arriba; su presentación integrada sigue pendiente. Las [propuestas siguientes](propuestas-tours-historicos-20260916.md) reutilizan el mismo método supervisado.
