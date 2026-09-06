# VoxCPM2: voz A y pausas entre párrafos

El usuario eligió la muestra española A y prefirió la narración por bloques porque la toma completa hablaba demasiado rápido. También pidió una pausa perceptible entre párrafos y señaló pequeñas variaciones de voz entre bloques.

## Elección y preparación

La selección queda guardada en [guide-es-a.json](/home/jesusotero/coding/tour-guide-app/pods/voxcpm-pod/presets/guide-es-a.json). Utiliza la referencia `0880582a-949f-4c27-bd10-cd94cdf26d6c.wav`, de 8,96 segundos, y el texto original con que se creó: «Bienvenidos. Soy su guía local para este recorrido; hablaré con claridad, calma y un ritmo constante». La transcripción automática de la muestra coincide en las palabras.

Para reforzar la continuidad, cada bloque recibe el mismo audio tanto como referencia de voz como de continuación, junto a su transcripción. Se fija la misma semilla 42 en todos los bloques. En este modo se omite la descripción adicional de barítono y se deja que la muestra A establezca la voz. Esto sigue el [modo de clonación con audio y transcripción de VoxCPM2](https://huggingface.co/openbmb/VoxCPM2#ultimate-cloning); la continuidad perceptiva debe valorarse escuchando.

Se mantiene el límite de 360 caracteres, cortando por frases. Entre bloques del mismo párrafo se insertan 220 ms de silencio; entre párrafos, 750 ms. Estas pausas se añaden a los silencios propios del audio que permanezcan tras el recorte de bordes. La muestra nueva conserva los 11 párrafos de Reales Alcázares y produce 19 bloques, con 10 separaciones de párrafo.

El texto fuente tiene 601 palabras. La versión hablada tiene 609 al escribir fechas y ordinales como se pronuncian: «Pedro primero», «Alfonso décimo», «siglo once», «siglo catorce» y las fechas correspondientes. Se conservan el texto original, el hablado y sus hashes por separado. Las sustituciones respetan límites de palabra para no convertir «Pedro II» al sustituir «Pedro I».

## Corrección de los párrafos

Se encontró que [sanitize.py](/home/jesusotero/coding/tour-guide-app/pods/voxcpm-pod/src/utils/sanitize.py) eliminaba dobles saltos de línea al recortar espacios con `\s`. Se corrigió para recortar espacios horizontales y preservar las separaciones de párrafo, incluidas líneas en blanco con espacios y entradas CRLF. Los saltos simples de línea mantienen su tratamiento como continuación de una frase.

Las comprobaciones previas verificaron que se conservan todas las palabras del texto hablado, que los diez cambios de párrafo llegan al divisor y que el ensamblado inserta los 750/220 ms correspondientes sin solapar las frases de esas uniones.

## Uso local

El [ejecutor de narraciones](/home/jesusotero/coding/tour-guide-app/pods/voxcpm-pod/scripts/compare-long-narration.py) admite `--preset`, `--case chunked` y `--prepare-only`. Guarda también cada bloque WAV para permitir revisar o volver a unir el audio sin regenerarlo entero. La reserva de GPU y la restauración de Qwen siguen a cargo de [with-tts-gpu.py](/home/jesusotero/coding/tour-guide-app/scripts/with-tts-gpu.py).

Desde la raíz del proyecto, con una carpeta de salida nueva:

```bash
OMP_NUM_THREADS=4 MKL_NUM_THREADS=4 PYTHONUNBUFFERED=1 python3 scripts/with-tts-gpu.py \
  --report backend/tmp/tts-voxcpm2/sevilla-voice-a-repeat/gpu-handoff.json --timeout 1800 -- \
  pods/voxcpm-pod/.venv/bin/python pods/voxcpm-pod/scripts/compare-long-narration.py \
  --source backend/tmp/narrative-v8/sevilla-20260906-162916/tour.md --section 1 \
  --preset pods/voxcpm-pod/presets/guide-es-a.json --case chunked \
  --model /home/jesusotero/.cache/huggingface/hub/models--openbmb--VoxCPM2/snapshots/bffb3df5a29440629464e5e839f4d214c8714c3d \
  --output backend/tmp/tts-voxcpm2/sevilla-voice-a-repeat
```

Este documento recoge la prueba local original. La voz A y las pausas de 750/220 ms se conectaron después al botón de audio de los tours guardados; véase [integración con la UI](voxcpm2-tour-ui-20260906.md). La referencia aprobada también se conserva ahora dentro de `presets/guide-es-a.wav`, sin depender de la caché.

## Resultado de la muestra

- [Sevilla con voz A y pausas, MP3](/home/jesusotero/coding/tour-guide-app/backend/tmp/tts-voxcpm2/sevilla-voice-a-20260906/chunked.mp3): **259,686 segundos, aproximadamente 4:20**.
- Generación de los 19 bloques y ensamblado: 164,260 s. Pico de memoria asignada por PyTorch: 6,121 GiB; reservada: 7,441 GiB. La carga del modelo tardó 113,592 s y el calentamiento 5,399 s; la carga inicial fue bastante más lenta que en el primer piloto.
- Se detectaron diez silencios continuos entre párrafos de 1,079 a 1,087 s: incluyen los 750 ms insertados y los silencios conservados de los fragmentos. La prueba de ensamblado verificó por separado las inserciones de 750 y 220 ms.
- La transcripción local con Whisper small en CPU conserva la narración hasta «Nuestra siguiente parada es la Giralda». Recupera fechas y ordinales como cifras o números romanos. Las discrepancias restantes son puntuales —nombres, grafías y una preposición—, sin la desviación grande que presentaba la antigua toma completa. Esta comprobación no sustituye la escucha para valorar timbre, acento y continuidad.

[Mediciones](/home/jesusotero/coding/tour-guide-app/backend/tmp/tts-voxcpm2/sevilla-voice-a-20260906/metrics.json), [auditoría y pausas medidas](/home/jesusotero/coding/tour-guide-app/backend/tmp/tts-voxcpm2/sevilla-voice-a-20260906/transcript-audit.json), [bloques guardados](/home/jesusotero/coding/tour-guide-app/backend/tmp/tts-voxcpm2/sevilla-voice-a-20260906/chunks).

El lote terminó con código 0. Qwen se restauró automáticamente en 101,612 s y su comprobación de salud devolvió `ok`; el ciclo completo registrado duró 392,761 s. No se invocó el trabajador Qwen durante la reserva de TTS. Se añadieron y pasaron tres pruebas de regresión sobre conservación de párrafos, saltos de línea y límites de bloque en [test-sanitize.py](/home/jesusotero/coding/tour-guide-app/pods/voxcpm-pod/scripts/test-sanitize.py).
