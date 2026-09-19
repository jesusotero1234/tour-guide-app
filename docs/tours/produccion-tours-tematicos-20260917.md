# Producción de once tours temáticos con audio

**Actualización, 19 de septiembre de 2026:** los once tours se integraron y publicaron
en español por indicación del responsable. Véase
[la entrega publicada](publicacion-tematicos-20260919.md). El resto del documento
conserva el historial de producción.

Fecha: 17 de septiembre de 2026. Estado: en ejecución, autorizado por el usuario.

Alcance: un tour por cada ciudad del lote local, con los temas recomendados en [la selección editorial](propuestas-tours-ciudades-actuales-20260917.md). Primera colección en español, como las muestras aceptadas. DeepSeek redacta; Codex selecciona y revisa la evidencia. Se reutilizan guiones y audios aprobados cuando encajen. Entrega local conjunta con imágenes reales acreditadas, mapa, capítulos y MP3 continuo por ciudad.

Objetivo: cinco o seis historias distintas y desarrolladas por recorrido, alrededor de dos minutos por parada. La duración y distancia se informan tras calcularlas; no se fuerzan con relleno. Escucha exterior, identificando lo que no es visible desde la calle. Sin modificación ni publicación de los tours anteriores.

## Trabajo y comprobación por ciudad

Cada ciudad sigue estas tareas dependientes: (1) completar evidencia y seleccionar episodios; (2) fijar puntos exteriores, fotos y ruta; (3) DeepSeek redacta las piezas nuevas y se revisan contra las fuentes; (4) sintetizar con la voz habitual, reutilizando clips compatibles; (5) montar y comprobar página, mapa, audio y procedencia. Se conserva el progreso para reanudar sin repetir piezas completas.

Criterios de entrega: historia documentada y comprensible, cinco o seis episodios que no dupliquen la misma historia, textos y audio correspondientes, fotos con créditos y enlace, mapa y duración real disponibles. Una diferencia pequeña respecto a la duración orientativa no invalida una historia útil. La inspección sobre mapa y la comprobación técnica de audio no se presentan como un recorrido presencial o una escucha humana completa.

- [ ] Murcia: la ciudad que hubo que rehacer.
- [ ] Málaga: recuperar una ciudad escondida.
- [ ] Castellón: mercados, campanas y decisiones de la villa.
- [ ] Madrid de los Austrias.
- [ ] Valencia: edificios que cambiaron de oficio.
- [ ] Zaragoza: vivir en Caesaraugusta.
- [ ] Barcelona y el mar.
- [ ] Sevilla, puerto de Indias.
- [ ] Palma de reyes y mercaderes.
- [ ] Las Palmas bajo ataque.
- [ ] Alicante, 1938–1939.
- [ ] Índice conjunto y comprobación final de las once entregas.

## Reutilización y límites

Se reutilizan el control de gasto de DeepSeek, la voz VoxCPM2, la procedencia de audio, el servicio de rutas peatonales, las capturas y fotografías existentes y el formato de escucha ya entregado. Se añade únicamente la coordinación local necesaria para producir esta colección. Los archivos de ejecución se guardan en `backend/tmp/tours-tematicos-20260917/`.

Las llamadas nuevas de redacción tienen exposición máxima conjunta de 3 USD; hasta dos intentos por pieza, sin reintentos automáticos ocultos. Las correcciones editoriales se registran. Una duda factual se resuelve o se excluye; no se completa con escenas inventadas. Si una ruta supera la duración prevista, se informa su duración real o se ajusta el recorrido manteniendo el tema.

## Envío a generación, 19 de septiembre

El usuario pidió dejar los audios generándose y avisará cuando terminen. Se inicia una cola local independiente de esta conversación: 11 ciudades, 58 historias, 79 capítulos contando bienvenidas y despedidas; 69 capítulos nuevos y 10 reutilizados. Madrid conserva sus seis clips anteriores; Valencia conserva cuatro historias (San Pío V en la versión desarrollada). Valencia mantiene Generalidad → Serranos → San Pío V → Quart → Dos Aguas para conservar las referencias entre clips.

El proceso redacta y revisa las piezas nuevas con DeepSeek (dos llamadas por pieza, exposición conjunta máxima 3 USD), sintetiza con VoxCPM2, comprueba procedencia y archivos decodificables y monta el MP3 de cada ciudad. Esta revisión automática **no equivale a una revisión humana final**; los resultados se identifican como borradores de escucha. Los errores quedan registrados y no se fuerzan reintentos. Las fotos, los mapas y la revisión final de la colección siguen pendientes.

Página de escucha: `backend/tmp/tours-tematicos-20260917/escuchar.html`. Estado: `status.json`; registro: `queue.log`; resultados por ciudad: `<ciudad>/listening-result.json` y `<ciudad>/tour.mp3`. El proceso actualiza la página al terminar cada ciudad; hay que recargarla para ver los cambios. No se programa vigilancia ni notificaciones: se retoma cuando avise el usuario.

## Comprobación y recuperación del lote

La primera ejecución terminó con cinco tours montados. Murcia, Málaga y Palma tenían todos los clips, pero el montaje rechazaba las sustituciones de pronunciación del preset (por ejemplo, Alfonso X → Alfonso décimo). Se corrigió la comprobación verificando el preset y sus sustituciones, sin regenerar audio ni aceptar cambios de hechos. Los ocho MP3 montados quedan disponibles en la página de escucha.

Zaragoza y Sevilla devolvieron revisiones truncadas; Barcelona cambió el identificador de una pieza. Se conservaron las respuestas originales y se registraron tres recuperaciones revisadas por Codex, vinculadas mediante hashes. En Zaragoza y Sevilla se editaron los borradores de DeepSeek contra las fuentes guardadas; esos textos no se atribuyen íntegramente a DeepSeek. Se relanzó la cola solo para completar trabajo pendiente, sin repetir llamadas ni clips terminados. La revisión editorial global, fotos, mapas y escucha final siguen pendientes.

## Los once audios completados

Se completó la cola y se comprobaron los once MP3 continuos y la procedencia de sus capítulos: 79 piezas, correspondientes a 58 paradas más bienvenidas y despedidas. Los tres últimos archivos también se decodificaron y comprobaron sin silencio completo, valores inválidos ni discrepancias de duración. Los ocho anteriores conservan sus verificaciones. No se ha realizado escucha humana ni revisión semántica completa del audio.

| Ciudad | Audio continuo |
| --- | --- |
| Murcia | 12:21 |
| Málaga | 13:16 |
| Castellón de la Plana | 15:49 |
| Valencia | 8:30 |
| Madrid | 5:11 |
| Zaragoza | 9:26 |
| Barcelona | 10:18 |
| Sevilla | 11:26 |
| Palma | 9:41 |
| Las Palmas de Gran Canaria | 14:26 |
| Alicante | 11:00 |

Todos pueden escucharse y descargarse desde `backend/tmp/tours-tematicos-20260917/escuchar.html`. Esto completa la generación de audio solicitada en esta fase. Las imágenes, los mapas y la revisión editorial final de la colección siguen pendientes; no se han publicado los tours.
