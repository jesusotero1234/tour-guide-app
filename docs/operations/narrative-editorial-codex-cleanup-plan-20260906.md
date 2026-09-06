# Edición final, autoría con Codex y limpieza recuperable

## Alcance y orden

1. Conservar el canario original de Madrid y crear una edición separada para lectura. Corregir las tres observaciones factuales y la inferencia sobre la habitabilidad del Palacio; mejorar oralidad y variedad sin añadir hechos ni ajustar palabras artificialmente. Recontar y comparar con los objetivos originales. No equivale a validar navegación o audio real.
2. Introducir una herramienta local de autoría que invoque Codex CLI con `gpt-6-astra` y razonamiento `low`, usando la sesión de ChatGPT. Sin OpenRouter, fallback de pago, escritura del modelo en el repositorio, ni cambios a producción/RAG. Conservar prompt, respuesta, resultado y errores. Comprobar autenticación, ejecución acotada y pruebas simuladas. La cuota de Codex sí se consume; no describirla como ilimitada o gratuita.
3. Inventariar POI, ejemplos y canarios. Mover únicamente artefactos históricos identificados a un archivo local recuperable con manifiesto. Conservar la referencia exitosa, sus entradas y fuentes, pruebas de regresión y todo código importado. No confundir V6/V8 con obsoleto ni borrar cambios ajenos.

## Decisiones

- Edición acotada, no otra búsqueda de modelos ni reconstrucción del pipeline.
- La nueva herramienta es para autoría editorial local; no convierte una suscripción personal en infraestructura del backend comercial.
- No iniciar solicitudes OpenRouter en esta tarea. La auditoría pagada anterior sigue como evidencia del original, no como certificación del texto editado.
- La limpieza no necesita una migración masiva de servicios. Los archivos con consumidores se conservan; cualquier reorganización semántica que aparezca necesaria se explica por separado.
- Qwen recoge hechos y ejecuta tareas mecánicas; Codex decide edición, contrato y qué es seguro archivar.

## Aceptación

- MD de lectura separado y registro de correcciones; original intacto.
- Invocación real de Astra low vía Codex verificada, sin acceso a OpenRouter; errores visibles y ninguna respuesta parcial presentada como éxito.
- Tests focalizados de transporte y evidencia de limpieza/restauración, sin afectar RAG, código activo ni fixtures utilizados.
- Informe final distingue trabajo terminado, material archivado y límites pendientes.
