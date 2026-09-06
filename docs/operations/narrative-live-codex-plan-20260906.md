# Canario desde ciudad nueva con Codex

## Decisión y alcance

Añadir `--writer-transport=codex` al canario V8 existente. Mantener la ruta,
investigación, RAG opcional, admisión de evidencia, reconciliación de duración y
arco actuales. El perfil inicial admitido es `qwen38_hybrid`; no cambiar los
modelos de preparación ni auditoría durante la comparación entre ciudades.

Después del arco, usar el encargo en prosa que funcionó en el experimento Astra:
una respuesta Codex/Astra low por parada y una auditoría OpenRouter por texto.
No reconstruir segmentos ni citas ficticias para atravesar el antiguo contrato.
No ejecutar reparaciones automáticas, fallback de escritor ni publicación.

## Contrato operativo

- Verificar login ChatGPT y archivos de instrucciones antes de consumir API.
- Mantener un único SpendGuard desde preparación hasta auditoría. Codex consume
  cuota de ChatGPT, no dólares de OpenRouter; registrar ambas actividades aparte.
- Preservar cada texto antes de auditarlo y actualizar el Markdown y la revisión
  con resultados parciales. Una incidencia no borra lo ya escrito.
- Los hallazgos factuales y la desviación de duración se muestran, no se ocultan.
  Completar un canario no equivale a autorizar su publicación.
- Heredar el plazo y la cancelación del canario. Una llamada por fase y parada,
  sin bucles de longitud ni reintentos editoriales en este modo.
- Primera integración para ejecuciones nuevas: rechazar resume explícitamente
  antes de gastar. El modo existente queda compatible y sin cambios de contrato.
- Sin reglas particulares de Madrid. Las localidades con poca evidencia pueden
  requerir menos duración o no resultar elegibles; no fabricar relleno.

## Verificación

Tests offline con una, dos y tres paradas, conservación de resultados ante fallo,
conteos writer/auditor, presupuesto compartido, cancelación y duración fuera de
banda. Revisión de tipos y regresiones enfocadas. El usuario ejecutará los
canarios de ciudades nuevas con un límite explícito por ejecución; esta tarea
no autoriza nuevas llamadas pagadas del asistente.
