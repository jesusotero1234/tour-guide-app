# Plan técnico — saneamiento forense y publicación Narrative V8

## Objetivo

Eliminar de forma general los falsos bloqueos observados en el run 31 y cerrar
los dos gates de publicación todavía incompletos, sin añadir excepciones para
Madrid ni cambiar de modelo.

Este plan es independiente del plan activo de Madoz en `tasks/plan.md`.

## Decisiones cerradas

- La lógica de producción no contendrá QID, frases ni nombres específicos de Madrid.
- V6 conservará su contrato actual. Los anclajes factuales estrictos serán una
  extensión compatible y se exigirán al ejecutar la política V8.
- Un hallazgo factual V8 solo podrá bloquear si identifica la versión actual de
  la frase, un fragmento literal vigente, evidencia del dossier y un conflicto
  estructurado.
- `unclear` requerirá corroboración independiente sobre la misma frase y el
  mismo fragmento; una duda aislada seguirá siendo candidata, no bloqueo.
- La detección de nombres resolverá primero nombres autorizados completos y
  tratará coordinaciones españolas fuera de esos nombres como fronteras.
- La respuesta estructurada del writer se conservará en diagnostics para que el
  gate de trazabilidad pueda evaluarla.
- Los snapshots forenses de llamadas se clonarán al capturarse.
- Las repeticiones mecánicas deterministas se incorporarán al ciclo existente de
  reparación y reauditoría; no se harán sustituciones ciegas.
- No se ejecutará un canario externo hasta aprobar replay offline, tests y build.

## Tareas y dependencias

### T1 — Fixtures forenses y anclaje factual vigente (M)

**Archivos previstos**

- `backend/src/services/poi/NarrativeEditorialV6.ts`
- `backend/src/services/poi/NarrativeEditorialAgentsV6.ts`
- sus tests existentes

**Trabajo**

- Extender el finding compatible con fingerprint de frase, fragmento literal,
  passage IDs y tipo de conflicto.
- Proyectar esos campos en el schema de auditoría.
- Filtrar en V8 hallazgos sin anclaje vigente y exigir consenso para `unclear`.
- Reproducir offline los casos fantasma e inestable del run 31.

**Aceptación**

- Un fragmento ausente de la frase actual nunca llega a adjudicación ni publica
  un hard issue.
- Un `unclear` aislado no bloquea; dos auditores independientes y coincidentes sí.
- V6 mantiene el comportamiento existente.

**Dependencias:** ninguna.

### T2 — Detector general de nombres coordinados (S)

**Archivos previstos**

- `backend/src/services/poi/NarrativeEditorialV6.ts`
- `backend/src/services/poi/NarrativeEditorialV6.test.ts`

**Trabajo**

- Resolver primero coincidencias exactas de nombres/proposiciones autorizados.
- Dividir candidatos no reconocidos por `y/e/o/u` sin romper nombres completos
  expresamente autorizados.
- Añadir el caso de dos entidades coordinadas y controles negativos.

**Aceptación**

- Dos nombres autorizados unidos por una conjunción no producen warning.
- Una entidad realmente desconocida sigue produciendo warning duro.
- Un nombre autorizado que contiene conjunción se conserva completo.

**Dependencias:** ninguna.

### Checkpoint A

- Tests focalizados de auditoría, policy y detector verdes.
- El replay de Q112/Q114/Q970 no contiene hard issues falsos.

### T3 — Trazabilidad del writer y snapshots forenses (S)

**Archivos previstos**

- `backend/src/services/poi/NarrativeEditorialAgentsV6.ts`
- `backend/src/services/poi/EditorialStructuredLlmV6.ts`
- tests de contrato y diagnostics

**Trabajo**

- Preservar propiedades estructuradas devueltas por el contrato V8 además de
  `text`, manteniendo el retorno mínimo de V6.
- Clonar `input` y `value` en cada resultado diagnóstico para impedir mutación
  retroactiva.

**Aceptación**

- `segments`, `coverage` y `wordCount` llegan al quality gate.
- Modificar el input o value original después de la llamada no cambia el snapshot.

**Dependencias:** ninguna.

### T4 — Citation closure del dossier (M)

**Archivos previstos**

- `backend/src/services/poi/NarrativeDossierV8.ts`
- `backend/src/services/poi/NarrativeDossierV8.test.ts`

**Trabajo**

- Exigir que nombres y números de proposiciones `direct/high` estén presentes
  en sus pasajes citados, con normalización conservadora.
- Mantener el fallo cerrado y pedir proposiciones atómicas o spans adicionales.

**Aceptación**

- Una proposición cuyo nombre solo aparece fuera de sus citas se rechaza.
- Variantes tipográficas ya admitidas no generan falsos rechazos.
- No se amplía `authorizedNames` para ocultar ausencia de soporte.

**Dependencias:** ninguna.

### Checkpoint B

- Tests de writer, diagnostics, dossier y publication quality verdes.
- Build TypeScript verde.

### T5 — Reparación segura de estilo (M)

**Archivos previstos**

- `backend/src/services/poi/NarrativeTourStyleV8.ts`
- `backend/src/services/poi/NarrativeEditorialWorkflowV6.ts`
- tests de workflow/estilo

**Trabajo**

- Convertir repeticiones mecánicas deterministas V8 en issues localizados para el
  ciclo de reparación ya existente.
- Deduplicarlas respecto del auditor global.
- Reauditar factualmente cualquier frase cambiada y recalcular el estilo final.

**Aceptación**

- Una repetición mecánica bloqueante activa una reparación localizada.
- Un motivo intencional no activa reparación.
- Una reparación no puede saltarse la reauditoría factual final.

**Dependencias:** T1 y T3.

### T6 — Replay y cierre local (S)

**Trabajo**

- Ejecutar los tests narrativos afectados, la suite backend y el build.
- Ejecutar replay offline de los artefactos del run 31.
- Revisar el diff en corrección, simplicidad, seguridad y coste de ejecución.
- Preparar el comando del siguiente canario; no ejecutarlo sin una validación
  local completamente verde.

**Aceptación**

- Los tres falsos blockers del run 31 desaparecen offline.
- `traceabilityPassed` deja de ser `null` con un writer V8 válido.
- El gate de estilo se recalcula después de cualquier reparación.
- No hay lógica específica de ciudad ni llamadas externas en tests.

**Dependencias:** T1–T5.

## Fuera de alcance de esta intervención

- Cambiar Qwen, GPT-5.4 mini u OpenRouter.
- Añadir cache persistente o reauditoría incremental por ventana. Se abordará
  después de conseguir una publicación correcta; es rendimiento, no corrección.
- Ejecutar automáticamente un canario con gasto externo.
- Modificar el corpus Madoz o sus planes activos.

## Riesgos y mitigación

- **Schema más exigente:** se mantiene compatible en V6 y se prueba el contrato
  V8 con respuestas válidas e inválidas.
- **Falso negativo factual:** `unsupported/distorted` anclados siguen bloqueando;
  únicamente `unclear` exige consenso adicional.
- **Reparación de estilo altera hechos:** toda frase reparada vuelve a auditoría
  factual antes de poder publicar.
- **Citation closure demasiado rígido:** se limita inicialmente a nombres y
  números de proposiciones `direct/high` y se cubren variantes tipográficas.

## Secuencia de commits

1. `fix: anchor V8 factual objections to current evidence`
2. `fix: separate coordinated authorized names in V8 audits`
3. `fix: preserve V8 writer traceability snapshots`
4. `fix: enforce V8 proposition citation closure`
5. `fix: route V8 style failures through repair`
6. `test: replay Madrid run 31 editorial regressions`
