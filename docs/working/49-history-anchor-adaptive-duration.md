# Iteración 49: anchors históricos y duración recomendable

Fecha: 2026-06-24  
Rama: `codex/history-anchor-adaptive-duration`

## Qué se implementó

- Se añadió una evaluación de capacidad histórica por ciudad.
- Se añadió un error API específico para duración no recomendable: `TOUR_DURATION_NOT_RECOMMENDED`.
- Si un tour `history` se pide con una duración mayor que la recomendable, el backend puede generar un borrador de menor duración sin audio y devolver el `draftTourId`.
- La selección de ruta ahora protege anchors históricos fuertes y prioriza los anchors top que también son caminables, evitando perseguir fama remota.

## Resultado de ruta

Málaga mejora en el punto más importante: la ruta ahora incluye Alcazaba y Gibralfaro. Esto corrige el fallo de producto más evidente de la auditoría anterior, donde una ruta histórica de Málaga no pasaba por la Alcazaba.

Toulouse queda más estable, pero no resuelto comercialmente. El sistema mantiene una ruta caminable con Saint-Sernin, Capitole y Notre-Dame de la Daurade, pero todavía puede sentirse genérica y con relleno. No conviene venderlo todavía como tour premium de 240 minutos.

Madrid volvió a pasar aceptación después de ajustar la protección de anchors para no elegir lugares famosos pero demasiado remotos, como Moncloa, por encima del centro histórico.

## Decisión importante

No se commiteó la regeneración nueva de Málaga porque el LLM produjo una versión peor:

- 1 fallback detectado;
- 1 contradicción crítica;
- score bajó a 74.4.

La conclusión es útil: la ruta mejoró, pero regenerar texto sigue necesitando control de calidad. Para producto, no basta con que la ruta sea mejor si una parada sale con narración débil.

## Validación

- TypeScript backend: OK.
- Tests focalizados: 154 passed, 1 skipped.
- Acceptance de calidad/ruta: OK.

## Próximo paso

La siguiente iteración debería hacer dos cosas:

1. Añadir repair de narración por parada cuando el auditor detecte fallback/contradicción.
2. Reintentar Málaga desde la ruta mejorada hasta que el tour supere 80 sin fallos críticos.

La duración adaptativa queda implementada a nivel backend, pero estas 6 ciudades no disparan todavía el bloqueo porque sus fixtures sí tienen suficiente densidad histórica. Ese mecanismo será más útil para ciudades pequeñas o con fuentes pobres.
