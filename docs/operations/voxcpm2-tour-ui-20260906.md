# Audio de VoxCPM2 desde un tour guardado

La página de un tour incluye «Create tour audio» después de disponer del texto. La acción crea las narraciones de sus paradas con VoxCPM2 y la voz A; no vuelve a escribir el recorrido. El audio se reproduce desde la misma página y se conserva al recargarla.

## Comportamiento

- Abrir un tour no inicia ninguna generación. El botón envía una petición explícita y devuelve inmediatamente su estado.
- El servidor espera a que terminen los trabajos de texto. Durante el audio, rechaza nuevos trabajos de texto y otras solicitudes de audio; los clics repetidos sobre el mismo tour reutilizan el trabajo activo.
- El supervisor reserva la GPU, espera a que Qwen esté inactivo, lo detiene, ejecuta un único proceso VoxCPM2 para todas las paradas y restaura Qwen si estaba encendido. Si el proceso del backend desaparece, detiene también el render y restaura Qwen.
- Cada narración se divide en bloques de hasta 360 caracteres. Se usa la misma referencia, transcripción y semilla 42 en todos los bloques, con pausas configuradas de 750 ms entre párrafos y 220 ms entre frases. Los silencios naturales de la voz pueden aumentar la pausa perceptible.
- La referencia aprobada está incluida en `pods/voxcpm-pod/presets/guide-es-a.wav`; ya no depende de conservar un archivo de caché.
- El recorrido original permanece intacto. Solo el texto hablado recibe los ajustes de pronunciación del preset, y solo para español. El flujo acepta los idiomas actuales del generador, español y francés; la audición aprobada y la prueba real son en español.
- Los MP3 se registran en `AudioAsset` cuando el render y la restauración han terminado. La caché exige coincidencia de texto, idioma y preset, y que el archivo exista. Los audios antiguos de otros proveedores no se usan en este panel.
- No hay alternativa de Kokoro. Se retiró del generador antiguo y del arranque local. Si VoxCPM2 falla, la página mantiene el texto y ofrece reintentar.

## Integración y configuración local

El flujo está pensado para el backend ejecutado en WSL junto a los modelos locales. No se ejecuta un servidor VoxCPM residente. `scripts/dev-up.sh` conserva la preparación de su entorno Python y deja la carga de la voz al backend.

Rutas autenticadas del backend:

- `POST /api/v1/tours/:id/audio`: crear o reutilizar una generación.
- `GET /api/v1/tours/:id/audio`: progreso y enlaces de las narraciones válidas.
- `GET /api/v1/tours/:id/audio/:placeId`: servir el MP3, incluidas peticiones Range.

La interfaz utiliza sus rutas `/api/backend/...`; los audios atraviesan el proxy del mismo origen. La clave del backend permanece en el servidor.

Configuración opcional: `TOUR_PROJECT_ROOT`, `VOXCPM_PYTHON`, `VOXCPM_MODEL_PATH`, `VOXCPM_PRESET_PATH`, `AUDIO_STORAGE_PATH`, `AUDIO_JOBS_PATH` y `VOXCPM_BATCH_TIMEOUT_SECONDS` (por defecto, 7200 segundos). El modelo se busca exclusivamente en la caché local; no se descarga al pulsar el botón.

Los estados persistentes y registros del trabajo se guardan en `backend/data/audio-jobs/`; los MP3 en `backend/data/audio/voxcpm2/`. Tras reiniciar el backend, un trabajo incompleto aparece como interrumpido y permite reintentar. Esta cola local admite un backend por instalación; el bloqueo de GPU evita que un segundo proceso de render compita con el primero.

El supervisor requiere los comandos locales `~/bin/qwen-stop`, `qwen-start` y `qwen-ensure`, con el bloqueo `~/.local/state/qwen/gpu-tts.lock` instalado en el controlador de esta máquina. Esa modificación externa ya se verificó durante la preparación del ejemplo de voz A.

## Validación

- TypeScript del backend y frontend: correcto.
- Lint de los componentes y clientes modificados: correcto.
- Ocho pruebas del servicio: generación explícita, duplicados, coordinación con texto, errores, cambios de narración, archivos perdidos, recuperación tras reinicio y lotes de varias paradas con reintento selectivo.
- Cuatro pruebas de preparación: párrafos, pronunciación, aislamiento por idioma, entradas inválidas y preparación sin CUDA.
- Tres pruebas del supervisor sin tocar la GPU real: salida del backend, fallo del render y conservación de Qwen apagado cuando así estaba inicialmente.
- Prueba de navegador en escritorio y móvil: no genera al abrir, bloquea doble clic, conserva el error de inicio y no desborda horizontalmente.

La prueba real pasó desde la UI sobre una copia marcada para revisión de la narración completa de Reales Alcázares de Sevilla (601 palabras): 19 bloques, MP3 de 258,622 segundos (4:19), 325,588 segundos hasta completar la comprobación de navegador. El supervisor terminó el render a los 216,033 segundos y restauró Qwen a los 316,137 segundos, con salida 0. Se verificaron la reproducción tras recargar, las peticiones Range (206), la reutilización de la petición duplicada y el bloqueo de un nuevo trabajo de texto mientras sonaba el render. La auditoría de transcripción en CPU conserva el cierre hasta la siguiente parada, la Giralda.

Resultados y capturas: `backend/tmp/tts-voxcpm2/ui-integration/result.json`, `transcript-audit.json`, `mobile-ready.png` y `desktop-ready.png`. Registro del intercambio de GPU: `backend/data/audio-jobs/dc930097-739a-440b-a741-19b208b0d7fc/gpu-handoff.json`. Prueba visible: `http://127.0.0.1:8186/tours/bd3df63c-7e74-4ed6-917f-273c95ef937b`.

Para esta comprobación se han usado los puertos 8186 y 8187. Los puertos habituales 3000/3001 están reservados en Windows por reglas antiguas de `portproxy` que apuntan a `172.24.204.140`; esas reglas no se han cambiado. Este conflicto de arranque es independiente del flujo de audio.
