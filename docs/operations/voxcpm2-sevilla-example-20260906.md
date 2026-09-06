# VoxCPM2: ejemplo largo de Sevilla — 6 de septiembre de 2026

VoxCPM2 funciona en esta RTX 5080 de 16 GB con Qwen descargado de la GPU. Para la narración probada, recomiendo generar por bloques de frases con una referencia de voz constante. La toma de 601 palabras en una sola petición produjo audio, pero la comprobación automática encontró una desviación importante al final: producir un WAV no basta para considerar correcta una narración.

## Instalación verificada

- Modelo: [openbmb/VoxCPM2 oficial](https://huggingface.co/openbmb/VoxCPM2), arquitectura `voxcpm2`, salida a 48 kHz.
- Los pesos ya estaban descargados. Se creó el entorno local del pod y se instalaron sus requisitos, incluido `voxcpm==2.0.3`; la generación real confirmó que funciona.
- Se calcularon los SHA256 completos de `model.safetensors` y `audiovae.pth`: coinciden con los pesos de la revisión oficial actual `32279effe8c19989596f05d353d1447f51d9e915`. Configuración y tokenizador también coinciden, aunque el directorio local tenga una revisión anterior.
- La caché de Hugging Face revisada contiene un único repositorio VoxCPM, `models--openbmb--VoxCPM2`. No se encontraron versiones antiguas de VoxCPM que borrar. Las referencias de voz y los audios anteriores no son otras versiones del modelo.
- Entorno efectivo: Torch 2.14.0/CUDA 13.0, torchaudio 2.11.0, transformers 5.16.1. `pip check` pasó después de instalar también la herramienta de transcripción usada para revisar los audios.

Evidencia: [verificación de pesos](/home/jesusotero/coding/tour-guide-app/backend/tmp/tts-voxcpm2/sevilla-20260906-pilot/model-verification.json), [dependencias efectivas](/home/jesusotero/coding/tour-guide-app/backend/tmp/tts-voxcpm2/sevilla-20260906-pilot/runtime-freeze.txt).

## Ejemplo y mediciones

Se utilizó la primera parada completa, **Reales Alcázares**, del [último tour de Sevilla localizado](/home/jesusotero/coding/tour-guide-app/backend/tmp/narrative-v8/sevilla-20260906-162916/tour.md): 601 palabras, 3.695 caracteres. Se excluyeron los pies de auditoría y las fuentes. La referencia fue la voz española `guide_es` existente, de 7,04 segundos.

Ambas variantes usan los mismos pesos y referencia, CFG 2, 10 pasos, sin denoiser, sin compilación y sin reintentos automáticos. La toma completa aplana el texto en un párrafo. La otra usa el divisor actual de la aplicación, con máximo de 360 caracteres: 12 bloques que terminan en frase. Se verificó que la división conserva todas las palabras de entrada.

| Variante | Generación | Duración del audio | Pico asignado por PyTorch |
| --- | ---: | ---: | ---: |
| Texto completo | 167,075 s | 246,240 s | 13,785 GiB |
| 12 bloques | 147,047 s | 235,351 s | 6,146 GiB |

Son tiempos de generación con el modelo ya preparado. Descargar Qwen de la GPU tardó 5,097 s; cargar VoxCPM2, 18,899 s; el calentamiento, 12,055 s. La carga inicial añade además importaciones y otras operaciones menores. No se midió el modo compilado de producción.

La memoria indicada es el máximo de tensores asignados por PyTorch, no todo el consumo físico de la tarjeta. El contador de memoria reservada registró 24,34 GiB en ambos casos; la segunda medición heredó reservas de la primera. Ese contador no debe interpretarse como 24 GB de VRAM física ni usarse para comparar estas variantes. El script ahora vacía la caché entre casos para futuras pruebas; no se alteraron las mediciones originales.

- [Audio por bloques, MP3](/home/jesusotero/coding/tour-guide-app/backend/tmp/tts-voxcpm2/sevilla-20260906-pilot/chunked.mp3)
- [Audio de una sola toma, MP3](/home/jesusotero/coding/tour-guide-app/backend/tmp/tts-voxcpm2/sevilla-20260906-pilot/whole.mp3)
- [Texto utilizado](/home/jesusotero/coding/tour-guide-app/backend/tmp/tts-voxcpm2/sevilla-20260906-pilot/source.txt)
- [Mediciones completas](/home/jesusotero/coding/tour-guide-app/backend/tmp/tts-voxcpm2/sevilla-20260906-pilot/metrics.json)

## Comprobación del contenido

Se transcribieron ambos WAV localmente con [faster-whisper](https://github.com/SYSTRAN/faster-whisper), modelo small, español, CPU int8, beam 5, sin VAD. No se utilizó Qwen para esta revisión ni se enviaron los audios a una API externa.

La transcripción de la toma completa se desvía ampliamente a partir de la zona de la palabra 565 y no recupera la despedida original. También presenta una lectura problemática de las fechas. La transcripción por bloques conserva el recorrido completo hasta «Nuestra siguiente parada es la Giralda», con discrepancias puntuales en nombres, cifras, una preposición y «Pedro I». La posible pronunciación de este último debe revisarse escuchando; conviene preparar «Pedro primero» como texto hablado.

Una transcripción automática puede equivocarse: estas diferencias no prueban por sí solas cada defecto del sintetizador. Tampoco evalúan naturalidad, timbre o continuidad entre bloques. Por eso la toma completa queda como comparación experimental y la de bloques como candidata para escuchar, no como audio editorial aprobado.

[Auditoría y segmentos](/home/jesusotero/coding/tour-guide-app/backend/tmp/tts-voxcpm2/sevilla-20260906-pilot/transcript-audit.json).

## Estrategia decidida

1. Terminar la narración con Qwen y guardar el texto. Preparar una versión hablada de cifras, ordinales y abreviaturas sin cambiar su significado; por ejemplo, «Pedro primero» y «siglo catorce».
2. Reservar la GPU y esperar a que termine cualquier petición local de Qwen. Descargar Qwen una sola vez para el lote de audio.
3. Cargar VoxCPM2 una vez. Recibir la narración completa como entrada de la aplicación y dividirla internamente por frases, empezando con el límite actual de 360 caracteres. Usar la misma referencia de voz para todos los bloques.
4. Generar secuencialmente, unir los bloques con las pausas y transiciones existentes y revisar contenido y pronunciación. Para una integración posterior, guardar cada bloque permitiría repetir solo el defectuoso; este piloto guarda los audios finales y sus mediciones.
5. Descargar TTS de la GPU y restaurar Qwen. Mantener la voz ya generada en caché para reproducción.

Esto permite enviar un texto largo a la aplicación sin exigir una única inferencia larga al modelo. La evidencia de este ejemplo favorece los bloques por memoria, tiempo y fidelidad del cierre. No se ha cambiado el proveedor predeterminado ni conectado este ciclo automáticamente al backend.

## Coordinación con Qwen y reproducción

Se añadió [el ejecutor de lotes con reserva de GPU](/home/jesusotero/coding/tour-guide-app/scripts/with-tts-gpu.py) y [el comparador de narraciones](/home/jesusotero/coding/tour-guide-app/pods/voxcpm-pod/scripts/compare-long-narration.py). El ejecutor tiene limpieza al finalizar, por error o por interrupción normal, y comprueba memoria libre antes de arrancar TTS.

El controlador local [qwenctl](/home/jesusotero/bin/qwenctl) respeta la misma reserva: `qwen-start` y `qwen-ensure` devuelven código 75 durante TTS. Se verificaron ambos bloqueos. El proceso de Qwen no hereda ese bloqueo. Hay copia previa del controlador en `/home/jesusotero/.local/state/qwen/qwenctl.before-tts-lock-20260906`.

El primer reinicio agotó el límite anterior de espera. Se amplió de 60 a 180 intentos y se separó la sesión del proceso de recuperación. Una recuperación posterior terminó correctamente en 12,260 s y `/health` confirmó Qwen disponible. El primer fallo se conserva en el registro original; no se repitió el lote entero tras estos ajustes. Los 12 segundos corresponden a la recuperación posterior, no garantizan el tiempo de un arranque frío.

[Registro del lote](/home/jesusotero/coding/tour-guide-app/backend/tmp/tts-voxcpm2/sevilla-20260906-pilot/gpu-handoff.json) y [recuperación confirmada](/home/jesusotero/coding/tour-guide-app/backend/tmp/tts-voxcpm2/sevilla-20260906-pilot/qwen-recovery.json).

Para repetir la comparación desde la raíz del proyecto, elegir una carpeta de salida nueva:

```bash
OMP_NUM_THREADS=4 MKL_NUM_THREADS=4 PYTHONUNBUFFERED=1 python3 scripts/with-tts-gpu.py \
  --report backend/tmp/tts-voxcpm2/sevilla-repeat/gpu-handoff.json --timeout 1800 -- \
  pods/voxcpm-pod/.venv/bin/python pods/voxcpm-pod/scripts/compare-long-narration.py \
  --source backend/tmp/narrative-v8/sevilla-20260906-162916/tour.md --section 1 \
  --reference pods/voxcpm-pod/cache/voice_references/f3bb0318-257e-43dc-8da7-79e4a7e6c49c.wav \
  --model /home/jesusotero/.cache/huggingface/hub/models--openbmb--VoxCPM2/snapshots/bffb3df5a29440629464e5e839f4d214c8714c3d \
  --output backend/tmp/tts-voxcpm2/sevilla-repeat
```

El script conserva por defecto el texto original para que la comparación sea reproducible; la normalización de ordinales propuesta arriba aún no se ha incorporado al flujo de producción. La comprobación sintáctica de ambos scripts y la compatibilidad de dependencias pasaron. Los MP3 se exportaron y se confirmó su duración y formato. Los cambios de otras tareas presentes en el árbol de trabajo se conservaron.
