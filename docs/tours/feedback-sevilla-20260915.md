# Feedback del primer paseo por Sevilla

## Cambios locales preparados

- **Voz baja:** el ajuste anterior solo atenuaba picos. El renderizador de tours ahora amplifica hasta cuatro veces, limitado por un pico de 0,95. No cambia las referencias de voz. En cuatro archivos franceses guardados de Sevilla había entre 8 y 10 dB de margen de pico. La muestra del Alcázar aumenta 8,07 dB.
- **Final seco:** se conservan las muestras de voz, salvo una caída de 10 ms para evitar un clic al terminar, y se añaden 900 ms de silencio. Es una primera prueba de cierre; no corrige una frase truncada por el sintetizador ni sustituye un cierre musical o narrativo.
- **Años en francés:** los enteros independientes de tres o cuatro cifras se convierten a palabras antes de dividir el texto para TTS. Por ejemplo, `1248` pasa a `mille deux cent quarante-huit`. El texto visible se conserva. Se protegen identificadores, decimales y cifras agrupadas. Los siglos romanos quedan fuera de este cambio.
- El registro de cada nuevo audio conserva el texto pronunciado y los parámetros de volumen y cierre.

## Recorrido: propuesta pendiente de implementación

La ubicación actual solo dibuja la posición en el mapa. La selección y el botón de siguiente parada siguen el orden guardado. Ya se puede elegir una parada manualmente.

Primer paso propuesto: ofrecer la parada cercana al iniciar, con ubicación voluntaria y elección explícita «Empezar aquí». Esto facilita entrar al tour desde donde está la persona. No resuelve por sí solo el orden del resto del paseo.

Para adaptar el recorrido completo hay que ordenar las paradas pendientes según distancias caminables, conservar todo el progreso y revisar frases que mencionan la parada anterior o siguiente. Conviene calcular el orden al elegirlo, sin cambiar de audio ni reorganizarlo continuamente con cada lectura del GPS. No basta con rotar una lista: puede provocar un regreso largo del final al principio.

## Comparación y comprobaciones

Muestras de los últimos 24 segundos del Alcázar, en `backend/tmp/sevilla-feedback-20260915/`:

- `antes.wav` y `volumen-y-cierre.wav`, con registros de procedencia verificados.
- `measurements.json`: volumen y duración antes y después.
- `french-years.json`: conversión de los 58 años distintos encontrados en el texto francés guardado de Sevilla.

Las muestras de volumen y cierre transforman una grabación existente: **no demuestran la nueva pronunciación de los años**. No se ha añadido música; se puede comparar después una coda breve, posterior a la última palabra.

Para revisar los años se generaron dos audios nuevos aislados en `years-preview/audio/`: `11111111-1111-4111-8111-111111111111.mp3` conserva 1356, 1364 y 1987 en cifras (17,07 s), y `22222222-2222-4222-8222-222222222222.mp3` los envía al sintetizador escritos en francés (17,60 s). Ambos usan la misma referencia, semilla, velocidad y procesamiento de audio. Se verificaron archivos y registros de procedencia; la aceptación auditiva queda pendiente del usuario. El supervisor terminó y restauró Qwen con código 0. Se adjuntaron las cuatro muestras de audio en la conversación.

Validación: 10 pruebas de preparación del texto, 4 de volumen y cierre, 3 de párrafos y 18 del servicio de audio. Todas pasan. Las pruebas del servicio usan un renderizador simulado.

## Revisión de la textura de voz

El usuario describe el defecto como textura metálica o robótica, no como un soplido o zumbido continuo. No se ha confirmado todavía la causa ni aplicado reducción de ruido.

Se preparó una prueba aislada en `backend/tmp/sevilla-feedback-20260915/texture-preview/`: se generó una única locución con los años corregidos y el mismo preset francés, cambiando solo la velocidad a 1,0 en un preset temporal. De esa grabación común se derivan `velocidad-natural.mp3` (15,94 s) y `ralentizado-10-por-ciento.mp3` (17,59 s). El segundo usa el procesamiento `atempo` de 0,9 utilizado actualmente. Ambos conservan 900 ms de pausa final y tienen el mismo RMS de voz antes de codificar; sus picos decodificados quedan por debajo de 1. No se ha filtrado el timbre.

Se verificaron archivos y procedencia, y Qwen quedó restaurado. Las dos muestras se adjuntaron para comparar escuchando si la ralentización contribuye al defecto. Si persiste en la versión natural, la referencia o la síntesis son otras causas a investigar; no se ha demostrado cuál. Los tours y presets activos permanecen sin cambios en esta revisión y sigue pendiente la confirmación del usuario.

## Prueba de ritmo documental generado de forma nativa

El usuario prefiere la muestra sin ralentización porque suena mejor, pero considera excesivamente rápida su cadencia y pide un estilo documental. Se mantiene pendiente su aprobación antes de actualizar tours.

La documentación oficial de VoxCPM distingue la continuación con referencia y transcripción, que conserva también el ritmo, del modo de clonación controlable, que permite orientar ritmo y expresión con una referencia de timbre: https://github.com/OpenBMB/VoxCPM. El adaptador activo utiliza continuación; esta prueba usa clonación controlable en un script aislado, sin modificarlo.

Se generaron dos variantes dirigidas, ambas con la referencia francesa actual, semilla 42, CFG 2, diez pasos y el mismo texto con los años en palabras. No se aplicó `atempo` ni otro estiramiento posterior. Los archivos están en `backend/tmp/sevilla-feedback-20260915/documentary-preview/`:

- `documental-sereno.mp3`: 19,30 segundos; instrucción de documental histórico sobrio, cálido y deliberado.
- `documental-muy-pausado.mp3`: 20,58 segundos; instrucción de entrega muy lenta y contemplativa, con frases espaciadas.
- La muestra anterior de continuación a velocidad natural duraba 15,94 segundos. Esta comparación cambia modo e indicación de estilo; no aísla por separado el efecto de cada factor.
- `render.py`, `progress.json`, WAV originales y registros de procedencia conservan configuración, entradas y resultados. `review.py` y `review.json` recogen comprobación local con faster-whisper-small en CPU.

La transcripción automática recupera 1356, 1364 y 1987 en ambas variantes y no incluye las instrucciones de estilo. Los picos decodificados quedan por debajo de 1; Qwen quedó restaurado. Esto verifica contenido básico y ejecución, no naturalidad ni conservación exacta del timbre. Se adjuntan las dos muestras para valoración del usuario, sin aplicar cambios a los tours.

## Sereno elegido y comparación de compresión

El usuario elige «documental sereno», pero describe un eco o falta de nitidez residual. Queda seleccionada esa dirección de voz; la revisión de calidad continúa antes de aplicar cambios a los tours.

Se encontró que `compression_level=0.8` significa compresión alta, no calidad alta, según SoundFile 0.13.1: https://python-soundfile.readthedocs.io/en/latest/#controlling-bitrate-mode-and-compression-level. La muestra serena de 19,30 s ocupa 119.088 bytes (aproximadamente 49,4 kbit/s incluyendo cabeceras).

Se reexportó **la misma toma original WAV**, con idénticos volumen, cierre y duración, sin nueva generación ni filtrado. Artefactos en `backend/tmp/sevilla-feedback-20260915/clarity-preview/`:

- `sereno-alta-calidad.mp3`: VBR, `compression_level=0.0`, 353.112 bytes, aproximadamente 146,4 kbit/s.
- `sereno-sin-compresion.wav`: PCM de 24 bits, 2.779.244 bytes.
- `comparison.json`: mismo número de muestras en las tres versiones, picos decodificados inferiores a 1; relación entre señal y error de codificación de 23,34 dB en el MP3 anterior y 42,68 dB en el MP3 de menor compresión. Este indicador compara muestras, no demuestra por sí solo mejora perceptiva ni eliminación de eco.
- `export.py` y registros de procedencia verificables conservan el procesamiento y la vinculación a la toma original.

Se adjunta el MP3 de mayor calidad y se facilita el WAV como comparación. Si el defecto también está en el WAV, precede a la exportación MP3; la referencia recuperada de una grabación sintética enviada por WhatsApp y la propia síntesis siguen como hipótesis, no diagnósticos confirmados. No se han cambiado el preset, el codificador de producción ni los tours.

## Confirmación de calidad y configuración integrada

El usuario aclara que **ambos archivos mejoran mucho** y que no percibe diferencia entre el MP3 de alta calidad y el WAV. La respuesta anterior «no noto diferencia» comparaba los dos formatos, no negaba la mejora frente al audio anterior. Quedan elegidos el estilo documental sereno, la velocidad nativa y el MP3 de alta calidad.

La configuración se conserva en `pods/voxcpm-pod/presets/guide-fr-documentary-serene.json`, seleccionable mediante `VOXCPM_PRESET_PATH`. El renderizador habitual admite ahora clonación controlable con la referencia francesa y la instrucción aprobada, repetida por fragmento, sin transcripción de continuación ni `atempo` a velocidad 1,0. El preset fija la compresión MP3 en 0,0. Los presets anteriores mantienen sus parámetros y el modo de continuación. El registro conserva modo, estilo, compresión, voz de referencia y texto pronunciado por separado.

Pasan 12 pruebas de preparación, las pruebas del adaptador Nano (incluida la alternancia entre los dos modos y el rechazo de transcripciones vacías) y 4 de volumen/cierre. La prueba integrada usa el fragmento de los años con el script habitual `render-tour.py`, el preset guardado y el supervisor GPU; sus artefactos están en `backend/tmp/sevilla-feedback-20260915/integrated-serene/`.

La prueba integrada terminó correctamente y produjo un MP3 **idéntico byte por byte a la muestra de alta calidad aprobada**: SHA-256 `4b4556ab7d06e1e0f38e70dbe79456e473910505ea9c3b9c147fcab51a00273e`, 353.112 bytes y 19,30 s. La transcripción automática recupera 1356, 1364 y 1987, sin leer la instrucción de estilo. Se verificaron el registro de procedencia, referencia sin continuación, velocidad 1,0, compresión 0,0, pausa final y pico inferior a 1. El supervisor restauró Qwen con código 0. Esto confirma la integración de la muestra elegida; no verifica todavía narraciones completas.

## Publicación

La selección de voz y formato está confirmada. Después, el usuario autoriza generar todos los tours franceses, sustituir y borrar sus versiones anteriores, y pide lanzar el trabajo en segundo plano para consultar él mismo el resultado. También se conserva el orden de paradas por las transiciones de los audios actuales.

La revisión 3 se fija ahora en el preset francés nuevo; los presets anteriores conservan la revisión 2 para mantener disponibles los otros idiomas. El servicio local se reinició con esta selección por preset y respondió HTTP 200. Antes del lote, 55 tours servían su audio completo; el antiguo tour español de Madrid `b1fbcc6c-22ca-4795-9ee2-b1292fc3dfb0` ya estaba sin audio disponible y queda fuera del alcance.

Lote lanzado: `backend/tmp/french-audio-replacement-20260915/`, **11 tours / 96 piezas** (85 paradas y 11 introducciones), Sevilla primero. `manifest.json` fija fuentes, preset, versiones antiguas y una huella de los registros de otros idiomas; `state.json`, `batch.log` y `deployment.json` permiten consultar generación, activación y borrado. Se ejecuta desacoplado de la conversación y utiliza el supervisor GPU habitual. No se ha programado ninguna notificación.

El lote prepara todas las piezas antes de cambiar el preset predeterminado y activar las parejas introducción/primera parada. Verifica archivos, huellas y disponibilidad de los 11 tours antes de borrar exclusivamente los registros franceses anteriores capturados en el manifiesto y sus archivos sin referencias. No borra directorios. Un fallo de generación o validación impide el borrado; el lote es reanudable. La ejecución está iniciada, no se declara terminada en este registro.

Comprobaciones previas: 18 pruebas del servicio de audio; validación de sintaxis de los scripts; simulación del finalizador (borrado francés exclusivo, rechazo de reemplazos ausentes y registros antiguos modificados, reintento); inventario y ejecución en seco de las 96 piezas, ninguna reutilizable.
