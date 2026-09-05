# Goal narrativo: calidad suficiente, duración e inmersión

Activado el 2026-09-05. Objetivo completo acordado en la conversación: tour factual, inmersivo, completo y suficientemente bueno para revisión humana; no perfección ilimitada. Madrid es un caso de prueba, nunca una excepción en producción. Comprobar otra ciudad y evidencia escasa. RAG opcional, sin alterar infraestructura ajena. Se permiten métodos distintos si un experimento acotado los justifica.

## Presupuesto de esta ejecución

- El canario anterior `madrid-v8-sentence-local-final-20260905-2` terminó antes de activar el goal, a las 13:47:17 UTC. No hay generación pendiente que atribuir al presupuesto nuevo.
- Acumulado histórico inicial exacto del checkpoint: `3.0026370499999997` USD.
- Nuevo presupuesto autorizado: **5 USD adicionales**, sin obligación de agotarlo.
- Límite acumulado de nuevos experimentos: **8.00263705 USD**. Pasar siempre el gasto previo real y reservar antes de iniciar solicitudes.
- Si el saldo no alcanza para el siguiente experimento útil, finalizar las pruebas pagadas y entregar resultados; no solicitar ampliación ni declarar éxito artificial.
- Gasto de este goal al registrar este documento: **0 USD**.

## Plan de ejecución

1. Commit del estado narrativo actual, fuentes, tests y adaptadores necesarios. Excluir credenciales, archivos privados, ZIP, backups y cambios de infraestructura ajenos. Este commit es una referencia recuperable, no una declaración de calidad.
2. Referencia congelada: leer el último tour y separar defectos factuales materiales, falsas alarmas del auditor, problemas narrativos y duración. Reutilizar investigación y respuestas para evitar pagar por diagnosticar.
3. Experimentos pequeños: probar una modificación cada vez, con la misma evidencia, frente al contrato actual. Priorizar un briefing concreto que no fuerce hechos inadecuados para cada función narrativa y un auditor que distinga hechos de transiciones. Considerar escritura conjunta de varias paradas si demuestra menos repetición y llamadas, sin perder trazabilidad ni recuperación; no implementar arquitectura nueva antes de la prueba.
4. Mantener únicamente variantes que mejoren la lectura y conserven los controles de errores materiales. Las métricas del LLM son señales, no la verdad de referencia. Pequeñas desviaciones y preferencias no deben convertirse en bloqueos universales.
5. Canario final de Madrid sobre el código entregado y comprobación fuera de Madrid, priorizando una segunda ciudad real dentro del presupuesto. Validar evidencia escasa y modos RAG con pruebas gratuitas.
6. Entregar Markdown del tour y evaluación honesta con llamadas, coste, tiempo, duración, errores pendientes y recomendación comercial. No afirmar publicación automática ni ausencia absoluta de errores.

## Invariantes

Sin hardcodes de ciudades; preservar evidencia y permisos RAG, control de gasto, checkpoints y recuperación. No inventar ni repetir para rellenar; no compensar falta de narración con pausas ficticias. Usar duración total y por audio con márgenes razonables, no perseguir dos palabras. One-shot (orientativamente seis de siete paradas sin reparación material) está subordinado a calidad y fiabilidad. Ningún fallo recuperable destruye el borrador y ninguna aprobación del juez sustituye leerlo.
