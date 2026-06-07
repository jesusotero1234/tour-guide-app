# 24 — Plan de trabajo: auto-repair mínimo para tours fallidos por quality gate

## Problema

El confidence gate ya detecta casos donde la ruta estructural falla por `category_collapse`, pero hoy el sistema solo tiene dos salidas: dejar pasar el tour en shadow o rechazarlo en enforce.

Eso deja valor sobre la mesa en un caso concreto: a veces el pool sí tiene suficiente material, pero la primera composición eligió demasiadas paradas de una misma categoría.

## Objetivo

Implementar una primera versión ejecutable de auto-repair que:

- sea mínima
- no hardcodee ciudades
- opere antes de narración/imágenes/DB/audio
- intente recomponer solo cuando el fallo incluye `category_collapse`
- permita rescatar algunos tours en `enforce` sin abrir una capa nueva de complejidad

## Arquitectura mínima

Piezas nuevas o ampliadas:

1. `TourQualityRepair` puro en backend.
2. Nuevo modo por entorno: `TOUR_QUALITY_REPAIR_MODE=off|shadow|enforce`.
3. Ampliación mínima del seam estructural para conservar `routeCandidates` y permitir recomposición.
4. Metadata mínima de repair en `Tour.metadata` y `TourResponse`.

Flujo v1:

```text
generateStructuralTourData
  -> computeTourConfidence
  -> if failure includes category_collapse
       -> TourQualityRepair.category_diversity_recompose
       -> recompute confidence on repaired route
  -> shadow: solo registrar metadata/logs
  -> enforce: aplicar repair solo si el gate original falla y el repair pasa
```

## Estrategia v1

### `category_diversity_recompose`

Condiciones de activación:

- confidence stage `output`
- `reasons` incluye `category_collapse`

Comportamiento:

1. Detectar la categoría dominante de la ruta actual.
2. Reordenar el pool penalizando implícitamente esa categoría dominante.
3. Rehacer una selección con una restricción de diversidad más agresiva.
4. Reordenar la ruta y recalcular métricas.
5. Recalcular `computeTourConfidence`.
6. Aceptar el repair solo si:
   - pasa el confidence gate
   - mejora el score respecto al tour fallido
   - ya no tiene `category_collapse`
   - no introduce duplicados de landmark por Wikidata
   - no queda degradado

## Decisiones de alcance

Sí entra en esta iteración:

- un único repairer mínimo
- una única estrategia: `category_diversity_recompose`
- wiring en `orchestrationService`
- tests unitarios y de orquestación

No entra en esta iteración:

- ML
- perfiles persistentes por ciudad
- promoción automática de ciudades
- admin UI
- múltiples estrategias de repair
- hardcodes por ciudad

## Criterios de éxito

- Existe documento de trabajo ejecutado, no solo idea.
- `shadow` calcula repair y lo deja trazable sin cambiar la respuesta final visible.
- `enforce` intenta repair antes del rechazo final solo para `category_collapse`.
- Si el repair pasa, el tour continúa con `qualityStatus=auto_repaired`.
- Si el repair falla, el rechazo final se mantiene.
- `npm run build` en `backend` pasa.
- `npx jest --runInBand` en `backend` pasa.

## Estado tras esta iteración

Estado: **fase v1 mínima implementada y validada**

### Qué sí quedó implementado

- Nuevo documento de trabajo creado y ejecutado en esta misma iteración.
- Nuevo módulo `TourQualityRepair` en backend.
- Nuevo modo `TOUR_QUALITY_REPAIR_MODE=off|shadow|enforce` con default seguro `off`.
- Única estrategia implementada: `category_diversity_recompose`.
- Activación solo cuando el failure incluye `category_collapse`.
- Reutilización del seam estructural existente sin hardcodes por ciudad.
- Ampliación mínima de `generateStructuralTourData(...)` para devolver `routeCandidates` además de la ruta seleccionada.
- Integración en `orchestrationService` antes de narración/imágenes/DB/audio.
- `shadow`: calcula repair, lo loguea como `[tour_quality_repair]`, y puede persistir metadata mínima del intento en el tour, pero no cambia la ruta final ni la decisión visible.
- `enforce`: si el gate falla y el repair pasa, el tour sigue con `qualityStatus=auto_repaired`; si no pasa, se mantiene el rechazo final.
- Metadata mínima de repair añadida a `Tour.metadata` y `TourResponse`.
- Review queue ampliada con estado `auto_repaired`.
- Tests unitarios del repair y tests del orquestador para repaired pass / repaired fail.

### Qué no quedó implementado

- No se implementaron estrategias adicionales aparte de `category_diversity_recompose`.
- No se persistieron rutas reparadas ni detalles extensos del repair en una tabla aparte.
- No se añadieron city profiles, promotion workflow, admin UI ni ML.
- No se cambió frontend.

### Verificación ejecutada

- `npx jest --runInBand src/services/tourQuality/TourQualityRepair.test.ts` en `backend` — pasó.
- `npx jest --runInBand src/services/orchestrationService.test.ts` en `backend` — pasó.
- `npm run build` en `backend` — pasó.
- `npx jest --runInBand` en `backend` — pasó.

### Riesgos y limitaciones reales

- Esta v1 solo intenta rescatar colapsos de categoría; otros motivos de fallo siguen rechazando normal.
- La recomposición todavía es heurística y no usa una búsqueda más profunda con swaps múltiples dedicados al repair.
- En `shadow`, la metadata de repair ya puede aparecer en la respuesta/backend aunque no cambie la ruta final; eso es útil para observabilidad, pero no es una capa separada “solo interna”.
- El cálculo de repair reutiliza helpers existentes con casts mínimos de tipos para no reabrir una refactorización mayor del seam estructural.

### Siguiente paso exacto

Implementar v1.1 de repair con una segunda pasada de recomposición más fuerte solo si `category_diversity_recompose` falla, idealmente reutilizando la lógica de swap/evaluación de `RouteSelection` sin duplicarla y manteniendo el mismo gate de aceptación final.
