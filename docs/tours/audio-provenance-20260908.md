# Procedencia de los audios VoxCPM2

Implementado el 8 de septiembre de 2026. Estos registros documentan procedencia; no son una certificación legal. No aprueban derechos, revisión humana ni apertura del piloto.

## Flujo nuevo

El servicio de VoxCPM, el renderizador de tours y el comparador de narraciones comparten `pods/voxcpm-pod/src/utils/audio_provenance.py`.

- `capture_generation` observa los argumentos reales: texto, descripción y presencia de `reference_wav_path` o `prompt_wav_path`. Recoge los parámetros efectivos, incluidos los valores predeterminados de la versión instalada.
- Registra inicio y fin reales en UTC. La fecha de escritura del registro (`recordedAt`) es distinta de la de generación (`generatedAt`).
- Exige una revisión exacta del modelo antes de generar. El servicio conserva el snapshot realmente cargado. Un directorio sin revisión identificable no puede usarse para una nueva generación documentada.
- Las semillas fijadas por los scripts quedan registradas por segmento. El servicio no reinicia la semilla entre llamadas: conserva `seed: null` y `seedPolicy: not_reset_for_call`; no inventa una semilla reproducible.
- Cada audio persistido tiene identificador, nombre y SHA-256. Los WAV intermedios y los MP3 tienen registros distintos. Se conserva también el procesamiento posterior.
- Las voces creadas como referencia usan `kind: voice_reference`; las narraciones usan `kind: narration`. Sus entradas enlazan el audio de referencia y su registro por identificador y huellas.
- Si falla la referencia y el servicio vuelve a generar solo con texto, el registro final refleja las llamadas que produjeron la narración entregada.
- No se sobrescriben audios ni registros existentes. Un registro existente se comprueba antes de reutilizarlo.

Las pruebas manuales futuras deben pasar por estos flujos o utilizar `capture_generation` y `write_audio_record` juntos. Una llamada ad hoc a `model.generate` fuera de ellos no queda instrumentada automáticamente.

## Dónde se guardan

- Servicio, referencias y comparaciones: junto al audio, como `nombre.wav.provenance.json` o `nombre.mp3.provenance.json`.
- Renderizador de tours: conserva el nombre compatible `id-parada.provenance.json`, junto a `id-parada.mp3`, y los manifiestos de progreso existentes.
- Referencias permanentes: `pods/voxcpm-pod/presets/`.
- Caché histórica: `pods/voxcpm-pod/cache/`.
- Pilotos: `backend/tmp/audio-pilot*/` y `backend/tmp/tts-voxcpm2/`.
- Narraciones antiguas de la aplicación: `backend/data/audio/`.
- Inventario comprobado: `backend/tmp/audio-provenance-20260908/verification-complete.json`.

Las entradas reservan `origin`, `sourceUrl`, `license` y `permission`. Solo se rellenan con procedencia documentada. La licencia del modelo no se utiliza como licencia del WAV.

El original `pods/voxcpm-pod/presets/guide-es-a.provenance.json` se revisó y se conserva intacto. Su observación se enlaza como evidencia con huella; el nuevo registro por archivo mantiene desconocidos el método y la fecha original de creación de esa referencia.

## Recuperación histórica

`pods/voxcpm-pod/scripts/record-audio-provenance.py` registra directorios de trabajos ya terminados. Reutiliza resultados, métricas, manifiestos y huellas existentes. Conserva la declaración del responsable como declaración, no como verificación independiente.

No convierte fechas del sistema de archivos, nombres de carpetas, tiempos transcurridos, configuración actual ni transcripciones reconocidas en fechas o parámetros originales de generación. Las asociaciones por nombre de archivo, sin una huella original guardada, indican esa limitación.

| Método documentado | Archivos |
| --- | ---: |
| Audio de referencia | 160 |
| Solo texto | 18 |
| Recorte o transformación | 6 |
| Método desconocido | 70 |
| Total | 254 |

Los 254 archivos conservaron sus huellas. En los 254 falta una fecha original exacta documentada; en 108 falta la revisión original del modelo. Algunos registros conservan texto, descripción o semilla parcial; los valores no documentados permanecen desconocidos.

La grabación francesa suministrada por el usuario está enlazada al OGG original y a su recorte WAV mediante SHA-256. Se conserva exclusivamente la petición de prueba local. No se afirma consentimiento del locutor, licencia comercial ni permiso más amplio. No se ha cambiado el preset francés seleccionado.

Los archivos y evidencias de `backend/tmp` deben conservarse junto con los audios: borrar esas carpetas elimina parte del historial enlazado. Para trasladarlos, conservar la estructura relativa y los registros de las referencias; las rutas absolutas de evidencias históricas requieren conservar también su ubicación o documentar el traslado. No editar registros ya enlazados por hash; nueva evidencia debe quedar en una observación adicional.

## Comprobaciones reproducibles

Desde la raíz del repositorio, sin modelo cargado ni GPU:

~~~sh
pods/voxcpm-pod/.venv/bin/python pods/voxcpm-pod/scripts/test-audio-provenance.py
pods/voxcpm-pod/.venv/bin/python pods/voxcpm-pod/scripts/test-service-provenance.py
pods/voxcpm-pod/.venv/bin/python pods/voxcpm-pod/scripts/record-audio-provenance.py \
  --verify-only pods/voxcpm-pod/presets pods/voxcpm-pod/cache \
  backend/tmp/audio-pilot* backend/tmp/tts-voxcpm2 backend/data/audio
~~~

La prueba de vinculación comprueba la huella del resultado, la del WAV de entrada y el identificador y huella del registro enlazado; detecta alteraciones del resultado o de la referencia. La prueba del servicio usa un modelo simulado para comprobar creación de referencia, narración, alternativa de solo texto y rechazo de sobrescritura. No valida calidad acústica ni derechos.
