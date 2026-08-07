# Iteración 50: preflight histórico y canary multi-ciudad

Fecha: 2026-06-24  
Rama: `codex/history-anchor-adaptive-duration`

## Objetivo

Antes de generar narración o audio, el backend debe saber si una ciudad puede sostener un tour histórico vendible para la duración pedida.

Esto prepara la futura UI donde mostraremos algo como: “para esta ciudad recomendamos 120 minutos; 240 sería relleno”.

## Qué se añadió

- `HistoryTourPreflight`: decisión reusable para ciudades nuevas.
- Decisiones posibles:
  - `generate`;
  - `recommend_shorter_duration`;
  - `needs_review`;
  - `block`.
- Tiers posibles:
  - `strong_history_city`;
  - `solid_history_city`;
  - `compact_history_city`;
  - `weak_history_city`;
  - `insufficient_data`.
- Metadata `historyPreflight` guardada en tours generados.
- Runner sin audio:
  - `npm run quality:preflight:history -- --cities=Prague --duration=240`
  - por defecto prueba un set canary de 21 ciudades.

## Resultado con Praga

El primer canary detectó un problema real: Praga salía como ciudad fuerte, pero la ruta no incluía Charles Bridge.

La causa no era Praga en sí, sino una señal general: puentes históricos no estaban suficientemente marcados como anchors de historia vivida.

Se corrigió el scoring para tratar puentes históricos como event sites. Después del ajuste, Praga queda:

- decision: `generate`;
- tier: `strong_history_city`;
- recommendedDuration: `240`;
- top anchor: Charles Bridge;
- ruta incluye Charles Bridge, Old Town Square, Prague Castle, Powder Tower y Wenceslas Square.

## Qué significa

Esto no garantiza que cualquier ciudad del mundo sea vendible automáticamente, pero sí nos da un filtro previo mucho más honesto:

- ciudades fuertes como Praga pueden avanzar a generación;
- ciudades con poca densidad histórica pueden recomendar menor duración;
- ciudades sin señal suficiente pueden bloquearse antes de gastar LLM/audio.

## Próximo paso

La siguiente mejora debería ser repair de narración por parada:

1. Generar sin audio.
2. Auditar fallback/contradicciones.
3. Regenerar solo las paradas malas.
4. Publicar solo si queda sin fallos críticos.

Después de eso, la UI puede mostrar las recomendaciones de duración con confianza.
