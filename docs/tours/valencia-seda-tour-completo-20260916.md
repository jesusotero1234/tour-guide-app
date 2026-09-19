# Valencia de la seda: tour completo para escuchar

Entrega local del 16 de septiembre de 2026. Un paseo exterior desde el barrio de los tejedores hasta el comercio de la seda, con tres paradas, fotografías, mapa, capítulos y un MP3 continuo.

- [Abrir el tour](../../backend/tmp/valencia-seda-completo-20260916/index.html).
- [Escuchar o descargar el MP3 completo](../../backend/tmp/valencia-seda-completo-20260916/valencia-de-la-seda.mp3).
- [Ver el mapa del paseo](../../backend/tmp/valencia-seda-completo-20260916/mapa.html).

El audio dura **6:33**. La ruta calculada tiene **614 metros**, unos **8 minutos caminando**: aproximadamente **15 minutos con la escucha**, más las pausas del visitante. Las tres paradas se escuchan desde el exterior.

| Capítulo | Inicio en el MP3 | Duración aproximada | Lugar de escucha |
| --- | --- | --- | --- |
| Bienvenida | 0:00 | 0:37 | Al comenzar el paseo |
| Tamarit: el barrio de los tejedores | 0:39 | 1:40 | Roger de Flor 13, esquina con Vinatea |
| Colegio del Arte Mayor de la Seda | 2:21 | 2:05 | Calle Hospital 7, frente al Colegio |
| Lonja de la Seda | 4:28 | 1:45 | Plaza del Mercado, frente a la fachada |
| Despedida | 6:15 | 0:17 | Al terminar en la Lonja |

El MP3 incorpora cuatro separaciones de dos segundos. No incluye el tiempo de desplazamiento: para hacer el paseo, conviene reproducir cada parada al llegar; para escuchar en casa, sirve el audio continuo. Los guiones completos están disponibles bajo cada reproductor.

## Generación y revisión

DeepSeek escribió la bienvenida, Tamarit y la despedida. Se conservaron exactamente los textos y audios del Colegio y la Lonja que el usuario había aprobado en la [entrega anterior](valencia-dos-paradas-desarrolladas-20260916.md). Las cinco piezas mantienen la misma identidad de voz.

Hubo cuatro llamadas nuevas a `deepseek-flash`: tres borradores y una corrección de pronunciación en Tamarit, de «Pedro IV» a «Pedro cuarto». No se hicieron modificaciones manuales a los textos narrados. Codex preparó el encargo, seleccionó las fuentes, revisó los resultados y montó la presentación. Este resultado demuestra un flujo asistido que reutiliza material aprobado; no prueba una generación autónoma desde cero.

El coste estimado de estas cuatro llamadas fue **0,0020472 USD**, calculado con los tokens registrados y las [tarifas de DeepSeek consultadas durante la ejecución](https://api-docs.deepseek.com/quick_start/pricing/). Excluye las generaciones anteriores reutilizadas, la voz y el trabajo editorial.

Las fuentes ya seleccionadas se revisaron para esta versión. Tamarit distingue el palacio del siglo XVIII de la historia anterior del barrio y atribuye las cifras de talleres y telares a la ciudad. Se mantienen las correcciones históricas del Colegio y la Lonja. La página incluye atribución de las adaptaciones de Wikipedia bajo CC BY-SA 4.0 y créditos y licencias de las tres fotografías de Wikimedia Commons. Las páginas institucionales del Museo de la Seda se usaron para contrastar hechos.

## Comprobaciones y alcance

Se verificaron las peticiones y respuestas reales, los guiones enviados a voz, la conservación exacta de los dos audios aprobados, la duración del montaje y su procedencia. En navegador se comprobaron los seis reproductores, los saltos de capítulo, las tres fotos, los marcadores y la presentación móvil, sin errores de ejecución. También se inspeccionaron las capturas de escritorio, móvil y mapa.

La ruta reutiliza el recorrido calculado y revisado sobre el mapa; no se ha comprobado caminando sobre el terreno. La comprobación técnica de reproducción no sustituye una escucha humana completa, que queda pendiente junto con la opinión del usuario.

Es una entrega local, sin publicación ni cambios en el catálogo de producción. Las fotos y el fondo del mapa necesitan conexión. La página reutiliza dos archivos de audio de la entrega anterior; el MP3 completo es independiente y puede descargarse por separado. Los artefactos están en `backend/tmp`, fuera del seguimiento de Git.

Evidencias: [guiones y procedencia](../../backend/tmp/valencia-seda-completo-20260916/master.json), [revisión de fuentes](../../backend/tmp/valencia-seda-completo-20260916/source-review.json), [evaluación](../../backend/tmp/valencia-seda-completo-20260916/evaluation.json), [montaje y capítulos](../../backend/tmp/valencia-seda-completo-20260916/listening-result.json) y [comprobación de navegador](../../backend/tmp/valencia-seda-completo-20260916/browser-check.json).
