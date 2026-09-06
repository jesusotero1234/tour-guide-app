# Wikivoyage opcional cuando la página no existe

## Cambio aplicado

La recopilación de señales de relevancia ya no aborta cuando MediaWiki confirma
que la guía de la ciudad en Wikivoyage no existe. Solo se acepta como ausencia
una respuesta de revisión con una página, título válido y `missing: true`, sin
marcadores de página inválida ni revisiones contradictorias.

- Wikivoyage queda como `null` (desconocido), no como `false` (guía consultada sin mención).
- El progreso informa `city_wikivoyage_revision unavailable`.
- No se solicitan secciones, ni se fabrican revisiones, menciones o citas.
- Se conservan las otras señales y la exigencia de soporte propio por candidato.
- El evaluador recibe una aclaración para no interpretar el dato desconocido
  como falta de interés. No se añaden llamadas de modelos.
- Los errores HTTP, timeout, errores de API y respuestas malformadas siguen
  siendo errores. Wikipedia no se ha convertido en opcional en este cambio.

## Compatibilidad

Los snapshots anteriores con booleanos conservan sus campos y fingerprints.
El validador acepta además el valor nulo, pero rechaza asociarle secciones,
revisiones o soporte de Wikivoyage. El prompt nuevo solo se aplica a requests
con ese valor nulo; ejecución y replay usan la misma selección de prompt.
No cambia la selección geográfica, los modelos, el presupuesto ni el RAG.

## Comprobaciones

- 37 tests enfocados pasaron entre captura, fuente ausente, construcción de
  inputs y workflow/replay del core, incluyendo OpenRouter simulado.
- TypeScript del backend y carga con tipos del canario completados.
- Prueba real de recopilación con los 8 candidatos del checkpoint
  `albarracin-codex-20260906-114854`: completada, 12 revisiones de fuentes,
  input del core de 3346 caracteres y señales nulas conservadas.
- Se usaron las APIs públicas de Wikimedia; cero inferencias LLM y cero USD
  en OpenRouter. No se ejecutó un canario completo ni se modificó el checkpoint.

## Observación fuera del arreglo

Los ocho candidatos guardados de Albarracín son abrigos de arte rupestre.
Los ocho tienen señal de patrimonio y sitelinks; tres tienen métricas de visitas
a Wikipedia en esta captura. Ninguno obtuvo señal de enlace desde el artículo
de la localidad. Esto explica qué soporte permanece sin Wikivoyage, pero no
certifica que la selección represente el tour urbano que espera el usuario.

Conviene revisar ese conjunto antes de volver a pagar un canario completo si
el objetivo es recorrer el casco histórico. Este parche resuelve la dependencia
indebida de Wikivoyage; no pretende resolver ni ocultar ese posible sesgo de selección.
