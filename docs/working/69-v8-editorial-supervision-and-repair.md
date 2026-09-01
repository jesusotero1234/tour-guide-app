# Plan 69 — Supervisión editorial V8 con contexto completo y reparación por parada

Fecha: 2026-09-02
Estado: implementación y validación estática completadas; canary live pendiente
Responsable técnico: Codex
Ejecución mecánica y validación: qwen_worker

## Objetivo

Conseguir que Editorial no se limite a acumular objeciones y detener el tour. El supervisor debe evaluar cada guion con el contexto validado necesario, devolver incidencias localizables y permitir una única reparación conjunta por parada antes de decidir el estado final.

El canary `malaga-v8-qwen38-live-20260901-1` demostró que Research, boundary, Arc y los siete writers funcionan. Editorial terminó en `draft_review_required` con trece bloqueos: diez literales numéricos presentes exactamente en proposiciones, una reformulación `años 40` → `1940` que debe repararse y dos objeciones sobre bridges interparada.

## Mapa de capacidades

| Módulo | Responsabilidad | Depende de |
|---|---|---|
| `numeric-authorization` | Reconocer números presentes en proposiciones admitidas | — |
| `supervisor-context` | Dar al supervisor contexto completo actual/siguiente sin ampliar el permiso del writer | Arc V8 y evidence manifest existentes |
| `per-stop-repair` | Permitir una reparación conjunta por cada parada afectada | issue policy V8 existente |

Orden: `numeric-authorization` → `supervisor-context` → `per-stop-repair`.

## Arquitectura

### Dos alcances distintos

`authorizedEvidence` sigue siendo el contrato del writer y del repair:

- proposiciones locales admitidas;
- proposiciones de contribución citadas por Arc;
- proposiciones de bridge citadas por Arc, limitadas a la parada actual o siguiente;
- nunca pasajes completos ni conocimiento general del modelo.

`reviewEvidence` es el contrato adicional del supervisor:

- el dossier completo validado actual permanece en el campo `dossier` ya existente;
- `current` conserva `routeStopId`, `entityQid` y fingerprint sin duplicar el dossier;
- `next` incorpora el dossier completo validado de la parada siguiente, cuando exista;
- identidad de propietario por `routeStopId` y `entityQid`;
- Arc, evidence manifest y `authorizedEvidence` ya existentes.

Para `auditTour`, `reviewEvidenceByStop` contiene cada dossier admitido una sola vez y en orden de ruta. Así el supervisor ve el tour completo sin duplicar cada dossier como current/next.

El supervisor debe distinguir:

1. `sourceSupported`: la afirmación está respaldada por el contexto validado.
2. `writerAuthorized`: la afirmación pertenece al alcance que el writer podía utilizar.

Una afirmación puede ser verdadera pero no autorizada. En ese caso se devuelve una objeción reparable; no se declara alucinación ni se aprueba silenciosamente.

### Ciclo editorial

```text
write
  → deterministic audit + paired factual audit
  → adjudicate factual objections
  → tour audit + adjudicate tour issues
  → group accepted deterministic/factual/tour targets by stop
  → at most one repair call per affected stop
  → deterministic + paired factual re-audit
  → final tour audit + adjudication
  → derive open issues only from final script fingerprints
```

La mayor parte de este ciclo ya existe en `NarrativeEditorialIssuePolicyV8.ts` y `NarrativeEditorialWorkflowV6.ts`. Este plan no lo reescribe; corrige los huecos observados y activa el presupuesto adecuado en el canary.

## Contratos decididos

### Autorización numérica V8

El auditor determinista V8 debe construir su allow-list numérica con la unión de:

- `dossier.authorizedNumbers`;
- literales numéricos extraídos de `authorizedPropositionTexts`.

Ambos pasan por la misma canonicalización ya usada para rangos, separadores de miles y decimales. V6 sin `policy: 'v8'` permanece idéntico.

### Contexto del supervisor

`createNarrativeEditorialRequestProjectorV8()` añade `reviewEvidence` únicamente a:

- `audit`;
- `adjudicate`;
- `auditTour` mediante la colección por parada.

Writer y repair no reciben el dossier siguiente ni sus pasajes completos. Repair conserva el mismo scope autorizado que writer y recibe las razones/IDs aceptados para corregir.

### Presupuesto de reparación

El canary configura:

```ts
maximumRepairCalls: route.stops.length
```

El límite es global pero la policy existente emite como máximo un plan por parada. El spend guard de USD permanece independiente y sin cambios.

## Tareas de implementación

### Tarea 1 — Autorización numérica desde proposiciones

Estado: completada.

Archivos:

- `backend/src/services/poi/NarrativeEditorialV6.test.ts`
- `backend/src/services/poi/NarrativeEditorialV6.ts`

Pruebas RED:

- `1340`, `1487`, `40`, `1940`, `1930`, `16`, `1972`, `11`, `1874` y `1876` no generan warnings si aparecen en proposiciones autorizadas.
- Un número ausente de listas y proposiciones sigue generando `unauthorized_number` hard.
- El comportamiento V6 legacy no cambia.

### Tarea 2 — Panorama completo para supervisión

Estado: completada.

Archivos:

- `backend/src/services/poi/NarrativeEditorialEvidenceProjectionV8.test.ts`
- `backend/src/services/poi/NarrativeEditorialEvidenceProjectionV8.ts`

Pruebas RED:

- audit y adjudicate reciben `reviewEvidence.current` y `reviewEvidence.next`.
- el siguiente dossier conserva sources/passages para verificación.
- writer y repair no reciben `reviewEvidence.next`, sources ni passages.
- la última parada tiene `next: null`.
- IDs/fingerprints desalineados fallan antes del modelo.

### Tarea 3 — Una reparación por parada afectada

Estado: completada.

Archivo:

- `backend/scripts/validation/narrative-user-canary-v8.ts`

Pruebas RED:

- una ruta de siete paradas permite hasta siete llamadas lógicas de repair;
- la policy sigue garantizando una como máximo por parada;
- el spend guard sigue siendo el límite monetario;
- no se reutiliza `maximumAdditionalRepairs: 1`.

La garantía de una sola reparación por parada ya estaba cubierta por `NarrativeEditorialIssuePolicyV8.test.ts` y `NarrativeEditorialWorkflowV8.test.ts`; el cambio del canary es una sustitución determinista de configuración.

## Criterios de aceptación

- Los números presentes literalmente en proposiciones dejan de ser falsos positivos.
- Reformulaciones numéricas no literales, como `años 40` → `1940`, siguen siendo reparables y no se autorizan automáticamente.
- Un número realmente ajeno a la evidencia sigue bloqueando.
- Supervisor y adjudicador ven contexto validado actual y siguiente.
- Writer y repair no reciben pasajes completos ni evidencia no autorizada.
- Las objeciones deterministas, factuales y de tour de una parada se agrupan en una sola reparación.
- Cada parada puede repararse como máximo una vez; varias paradas distintas pueden repararse en el mismo run.
- Tras reparar se auditan los scripts finales y `openIssueIds` se deriva únicamente del estado final.
- V6 conserva payloads, prompts y gates históricos.
- No se altera Research, evidence tiers, SearXNG, Firecrawl ni ranking de fuentes.

## Validación

```bash
cd backend
npm test -- --runInBand \
  src/services/poi/NarrativeEditorialV6.test.ts \
  src/services/poi/NarrativeEditorialEvidenceProjectionV8.test.ts \
  src/services/poi/NarrativeEditorialIssuePolicyV8.test.ts \
  src/services/poi/NarrativeEditorialWorkflowV8.test.ts \
  src/services/poi/NarrativeUserCanaryRuntimeV8.test.ts
npx tsc --noEmit --pretty false
cd ..
git diff --check
```

Resultado:

- 5 suites / 44 tests pasaron.
- TypeScript completo de `backend` pasó.
- `git diff --check` pasó.
- El test RED numérico reprodujo diez literales válidos más un número realmente ajeno antes del fix y quedó verde después.
- El test RED de supervisión confirmó que `reviewEvidence` no existía antes del nuevo boundary y quedó verde después.

## Canary final

El canary completo lo ejecutará el usuario después de la validación estática. Para iniciar una ventana experimental local nueva usa `--prior-spend-usd=0`, un `run-id` nuevo y ningún checkpoint anterior. Esto no borra ni altera la facturación real del proveedor.

## Fuera de alcance

- cambiar modelos o perfiles;
- relajar el soporte factual;
- permitir conocimiento general del writer;
- modificar Research o clasificación A/B/C/D;
- aumentar el límite monetario de 2 USD;
- ejecutar el canary completo desde Codex.
