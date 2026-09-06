# Identidades Wikidata y redirecciones verificadas

Fecha: 2026-09-06. Estado: implementado y validado localmente; sin commit ni push en esta tarea.

## Problema

El canario `castellon-20260906-162521` se detuvo antes de consumir modelos porque OSM conservaba `Q9055843`, mientras Wikidata devolvía el Parque Ribalta con `id=Q117786961` y una redirección explícita. La captura de prominencia exigía que el ID solicitado y el devuelto fueran iguales.

## Estrategia aplicada

1. Resolver la identidad con un único lector de respuestas Wikibase, compartido por candidatos, prominencia y autoridades. Solo se aceptan equivalencias explícitas de la API; nunca coincidencias de nombres ni decisiones de un modelo.
2. Normalizar los QID antes de construir candidatos editoriales. La agrupación existente reúne los alias bajo una entidad y conserva los identificadores OSM de origen.
3. Guardar ID solicitado, ID canónico, cadena de redirección, instante de resolución y revisión disponible. Las redirecciones resueltas requieren una revisión válida.
4. Excluir antes de seleccionar únicamente entidades marcadas explícitamente como inexistentes y registrar ID, origen y motivo. Una respuesta omitida, incongruente, un error de API o de red sigue provocando un fallo; no equivale a una entidad inexistente.
5. No reescribir identidades ni huellas de rutas o checkpoints ya congelados. La captura puede consultar un alias antiguo usando la revisión canónica, pero conserva la identidad del candidato recibido. Una entidad seleccionada que haya desaparecido exige revisión.
6. Rechazar ciclos, destinos contradictorios y cadenas de más de ocho saltos. Contar enlaces desde la página de la ciudad solo cuando el enlace realmente existe, incluyendo alias verificados.

El checkpoint del canario guarda las resoluciones y exclusiones incluso si no quedan candidatos utilizables. El mensaje de preflight identifica correctamente a Astra low mediante Codex como escritor y auditor.

## Validación

- 136 pruebas aprobadas en 11 suites: resolución de identidad, carga de candidatos, prominencia y Wikivoyage opcional, autoridades, destinos e idiomas, fuentes, canario y selección/reparación editorial.
- Comprobación de tipos y compilación de `tsconfig.generation-worker.json` correctas.
- Reconsulta real de los 17 QID del checkpoint fallido: ninguno inexistente; redirección de Parque Ribalta confirmada.
- Sitelink y captura de prominencia reales del Parque Ribalta completados con el ID antiguo, sin modificar el candidato original. Fuente Wikidata canónica y revisión `2531424245` verificadas.
- Carga completa de Castellón: 51 POI obtenidos, 17 candidatos preparados, cero exclusiones. Resolvió `Q9055843 → Q117786961` y también `Q116255768 → Q117793105`.
- Parque Ribalta queda una sola vez como `Q117786961`, conserva `way:693822147` y sus hechos Wikidata apuntan al ID canónico.
- Gasto en modelos de estas comprobaciones: **0 USD**. No se ejecutó un canario narrativo completo.

## Límites y siguiente uso

No se ha introducido una caché persistente de identidades ni una migración masiva. Tampoco se ha modificado la política de reintentos de Overpass; durante la prueba hubo 504/429 recuperados por los reintentos existentes.

Para verificar el flujo narrativo completo, repetir Castellón con un `run-id` nuevo permite reconstruir los candidatos con las identidades normalizadas. Madrid y Sevilla utilizan la misma protección; no se han generado sus narraciones en esta tarea.

Se han preservado los cambios ajenos presentes en el repositorio.
