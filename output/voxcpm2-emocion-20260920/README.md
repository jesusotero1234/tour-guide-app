# Experimento de estilo VoxCPM2 — 20 de septiembre de 2026

Parada «Una corte que decide quedarse», Madrid de los Austrias. Español; 129 palabras del guion existente. Tres muestras nuevas con el mismo texto, referencia española A, semilla 42, división en tres fragmentos y tratamiento de audio.

| Muestra | Instrucción / modo | Duración |
|---|---|---|
| [Voz habitual](a-habitual/0d392d17-22f9-5839-a476-4d2ee61bdeac.mp3) | Continuación con referencia y transcripción, como el preset habitual. | 55.25 s |
| [Control de estilo: neutro](b-neutra/0d392d17-22f9-5839-a476-4d2ee61bdeac.mp3) | Neutral, matter-of-fact historical narration. Clear articulation at a natural, steady pace. | 50.7 s |
| [Control de estilo: calidez y curiosidad](c-expresiva/0d392d17-22f9-5839-a476-4d2ee61bdeac.mp3) | Warm, curious and expressive historical storytelling. Convey fascination and a sense of discovery, with lively intonation and natural emphasis. Keep a natural, steady pace and clear articulation. | 48.24 s |

La comparación B–C mantiene el modo de clonación y cambia la instrucción de estilo. A–B también cambia el modo de generación. El estilo se antepone entre paréntesis a cada fragmento. No se aplicó cambio de velocidad posterior; las diferencias de duración proceden de la síntesis.

Se verificaron las huellas de fuente, preset y referencia; el texto enviado a cada generación; la procedencia; la decodificación y señal de los tres MP3 de 48 kHz. Una transcripción independiente con Whisper small recuperó el contenido: A y C coinciden al normalizar las cifras y números romanos; B presenta «mirar» frente a «mira» al inicio. Esta diferencia puede proceder del reconocimiento y queda pendiente de escucha. Las instrucciones en inglés no aparecen en las transcripciones.

No se ha realizado valoración auditiva humana ni se ha demostrado la misma calidad en otros idiomas. Es una generación por condición. La documentación admite español, francés, inglés, alemán e italiano, con instrucciones de control en inglés o chino; no garantiza un resultado emocional idéntico en todos los idiomas.

Documentación: [modelo oficial](https://huggingface.co/openbmb/VoxCPM2) · [control de estilo](https://voxcpm.readthedocs.io/en/latest/usage_guide.html#controllable-voice-cloning).

[Texto](texto.txt) · [Condiciones y fuente](manifest.json) · [Verificación y transcripciones](verification.json) · [Relevo de GPU](gpu-handoff.json).

Generación local completada y Qwen restaurado con código 0. El experimento se guarda íntegramente en este directorio.
