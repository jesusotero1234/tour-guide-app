# Resultado: DeepSeek con una entrada más clara

Fecha: 16 de septiembre de 2026. Estado: **ejecución cerrada; el usuario considera insuficiente la duración para una historia**.

**Las dos piezas cumplieron los cuatro criterios fijados al primer intento, con dos llamadas a DeepSeek y cero ediciones humanas de las narraciones.** El resultado acredita claridad y fidelidad en estos dos casos. San Pío V quedó como una cápsula factual de veinte segundos: todavía no acredita el atractivo de un cuento histórico.

[Abrir comparación con fotos y audio](/home/jesusotero/coding/tour-guide-app/backend/tmp/deepseek-entrada-limpia-20260916/index.html) · [Plan ejecutado](plan-deepseek-entrada-limpia-20260916.md)

## Valoración recibida sobre la duración

El usuario considera que la duración es insuficiente para contar una historia. San Pío V, con veinte segundos, quedó como un resumen factual. Pasar los cuatro criterios técnicos no satisfizo el objetivo narrativo; esta conclusión se añade sin alterar el protocolo ni las respuestas originales. No se presupone una escucha detallada ni una valoración individual del Colegio.

La siguiente revisión debería recuperar el desarrollo de las versiones anteriores que funcionaban: seleccionar un episodio con contexto, cambio y consecuencias respaldadas, y darle una duración útil de escucha. Una referencia provisional sería noventa a ciento veinte segundos por parada; aún no es una preferencia de duración confirmada por el usuario. No se han generado nuevas variantes.

## Resultado por pieza

| Pieza | Borrador anterior, palabras | Entrega anterior con edición humana | Nueva respuesta intacta | Audio anterior → nuevo | Intento aceptado |
| --- | --- | --- | --- | --- | --- |
| Colegio de San Pío V · Museo de Bellas Artes de Valencia | 224 | 215 | 49 | 84 → 20 s | Primero |
| Colegio del Arte Mayor de la Seda | 241 | 164 | 116 | 63 → 44 s | Primero |

La página conserva por separado el borrador anterior, su corrección por el modelo, la entrega con edición humana y la respuesta de esta prueba. Acortar no era un criterio de éxito.

En San Pío V, la primera frase presenta la finalidad docente y el edificio. Sigue el hospital durante la Guerra Civil y termina con la instalación del museo. No afirma una transición directa de colegio a hospital ni una continuidad docente hasta la guerra. La identificación inicial del museo actual no vuelve a narrar su instalación; esta distinción estaba permitida antes de generar.

En el Colegio, la primera frase identifica y sitúa la sede; la segunda introduce la petición. El relato avanza hasta el reconocimiento y explica después las tareas de regulación. Ubicación, nombre histórico y nombre actual tienen respaldo dentro de la ficha. Conserva día, mes y año del título: es un dato admitido, pero sigue pendiente valorar si tanta precisión ayuda al escuchar.

## Audios y textos intactos

### San Pío V · veinte segundos

[Escuchar el audio nuevo](/home/jesusotero/coding/tour-guide-app/backend/tmp/deepseek-entrada-limpia-20260916/audio/54ff9c63-996d-5ac0-a3e7-fb552872d3ab.mp3)

El Colegio de San Pío V, actual sede del Museo de Bellas Artes de Valencia, fue fundado por el arzobispo Juan Tomás de Rocabertí para formar sacerdotes. Durante la Guerra Civil, el edificio fue hospital militar. Tras el conflicto, pasó a albergar el Museo de Bellas Artes de Valencia.

### Colegio de la Seda · cuarenta y cuatro segundos

[Escuchar el audio nuevo](/home/jesusotero/coding/tour-guide-app/backend/tmp/deepseek-entrada-limpia-20260916/audio/755b257a-98db-5c74-813f-6a51fc3d7fc3.mp3)

Estás ante el Colegio del Arte Mayor de la Seda, en la calle del Hospital número siete, en el barrio de Velluters. En mil seiscientos setenta y siete, los sederos enviaron una primera solicitud al rey Carlos segundo para que el oficio de velluter, terciopelero, se considerara un arte. Nueve años después, el treinta y uno de octubre de mil seiscientos ochenta y seis, les concedieron el título de Colegio de artistas y pasaron a denominarse Colegio del Arte de la Seda. Su función principal era regular el oficio y la producción de tejidos de seda en la ciudad de Valencia, incluida la tarea de determinar el ancho, la cuenta y el peso de los tejidos.

## Intervención y límites de la prueba

Codex seleccionó tres hechos por caso, comprobó sus extractos contra las capturas guardadas, añadió identidad y ubicación respaldadas, separó las instrucciones editoriales y adaptó un ejemplo de Casa de la Villa eliminando su recapitulación final. Ambas fichas, el ejemplo, el encargo y los criterios quedaron fijados antes de la primera llamada.

DeepSeek escribió los dos textos. Codex revisó los cuatro criterios y aceptó San Pío V antes de ejecutar el Colegio. No hubo correcciones del modelo ni edición, recorte o sustitución de sus respuestas. La selección y revisión previas sí requieren trabajo editorial: esto no demuestra autonomía completa.

Se usó `deepseek-flash`, con razonamiento adicional desactivado, temperatura cero y salida JSON. El catálogo confirmó el identificador antes de empezar; la documentación lo identificaba como DeepSeek-V4.1-Flash. Hubo **2 solicitudes físicas de generación de las 4 permitidas**, una por pieza, sin reintentos. El coste estimado fue **0.000527484 USD**, conciliado con el registro y las [tarifas oficiales consultadas](https://api-docs.deepseek.com/quick_start/pricing/). No incluye preparación, revisión, voz ni impuestos. No quedaron reservas abiertas.

Los dos audios nuevos usan la misma identidad de voz VoxCPM2 que las entregas anteriores. La síntesis y el relevo de GPU tardaron unos 43 segundos; el servicio anterior quedó restaurado. Se comprobó la igualdad entre respuesta, guion mostrado y texto enviado a voz; integridad de entradas y fuentes; audio decodificable con señal; las dos fotos cargadas y reproducción de los cuatro audios. Las vistas de escritorio y móvil se inspeccionaron sin desbordamientos ni errores de ejecución. No se hizo una auditoría auditiva palabra por palabra ni una transcripción automática.

## Valoración y decisión

**El encargo sirve para producir estas dos piezas breves y fieles con supervisión. Falta decidir si suenan suficientemente interesantes.** Mi reserva principal es San Pío V: enumera tres hechos correctamente, pero apenas desarrolla la historia. No lo daría todavía por resuelto como “cuento de cosas que pasaron”. El Colegio conserva mejor la petición, la espera y el reconocimiento, aunque mantiene un tono informativo.

No conviene gastar las llamadas restantes solo para perseguir otra variante: ambos textos cumplen el protocolo. La decisión pendiente es de escucha, comparando si la brevedad mejora la experiencia o deja la parada demasiado vacía.

Son dos casos sin repetición experimental. Cambiaron conjuntamente la selección, el ejemplo y el encargo; además, esta prueba permite abrir con la situación inicial significativa. Por eso no puede atribuirse el resultado a una frase aislada ni presentar el cambio de cero sobre dos a dos sobre dos como una medida controlada de fiabilidad. La [evaluación anterior](resultado-deepseek-episodio-desde-el-inicio-20260916.md) conserva sus fallos y su revisión posterior.

Se recibió valoración sobre la extensión: insuficiente para una historia. La escucha detallada sigue sin confirmarse. No se incorporaron las variantes al catálogo ni se sustituyeron los tours completos.

## Registros, fuentes y créditos

[Entradas fijadas](/home/jesusotero/coding/tour-guide-app/backend/tmp/deepseek-entrada-limpia-20260916/inputs.json), [selección de fuentes](/home/jesusotero/coding/tour-guide-app/backend/tmp/deepseek-entrada-limpia-20260916/source-review.json), [evaluación](/home/jesusotero/coding/tour-guide-app/backend/tmp/deepseek-entrada-limpia-20260916/evaluation.json), [revisión de San Pío V](/home/jesusotero/coding/tour-guide-app/backend/tmp/deepseek-entrada-limpia-20260916/sanpio-draft.review.json), [revisión del Colegio](/home/jesusotero/coding/tour-guide-app/backend/tmp/deepseek-entrada-limpia-20260916/colegio-draft.review.json), [audio](/home/jesusotero/coding/tour-guide-app/backend/tmp/deepseek-entrada-limpia-20260916/audio-check.json) y [navegador](/home/jesusotero/coding/tour-guide-app/backend/tmp/deepseek-entrada-limpia-20260916/browser-check.json).

Adaptación de textos de colaboradores de Wikipedia bajo [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/): selección de pasajes y nueva narración. Las fotografías conservan sus autores, licencias y enlaces originales en la comparación.

- [Museo de Bellas Artes de Valencia, versión utilizada](https://es.wikipedia.org/wiki/Museo_de_Bellas_Artes_de_Valencia?oldid=175147247) · [Historial de colaboradores](https://es.wikipedia.org/wiki/Museo_de_Bellas_Artes_de_Valencia?action=history).
- [Colegio del Arte Mayor de la Seda, versión utilizada](https://es.wikipedia.org/wiki/Colegio_del_Arte_Mayor_de_la_Seda?oldid=174632164) · [Historial de colaboradores](https://es.wikipedia.org/wiki/Colegio_del_Arte_Mayor_de_la_Seda?action=history).

La comparación es local y sus fotos necesitan conexión. Conservar esta carpeta y las carpetas de las entregas anteriores, cuyos audios se reutilizan.
