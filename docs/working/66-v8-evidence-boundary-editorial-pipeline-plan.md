# Plan 66 — Boundary de evidencia y pipeline editorial V8

Fecha: 2026-09-01
Estado: implementado y validado estáticamente; canary live de Málaga ejecutado; migración de boundary y Arc completada; publicación no completada por fallo upstream y control flow post-editorial; trabajo de resume pendiente en Plan 67
Responsable técnico: Codex
Ejecución mecánica: qwen_worker

## Registro de implementación (2026-09-01)

- Boundary determinista V8 implementado.
- Fixtures reales implementadas.
- Arc V8 implementado.
- Proyección de request y Agents V8 implementados.
- Core editorial compartido y Workflow V8 implementados.
- Scorecard V8 implementado.
- Handoff canary inyectable implementado.
- Handoff canary ejecutable implementado.
- Persistencia de manifest implementada.
- Tipo de Research estrechado.

### Evidencia de validación

- 11 suites enfocadas, 77 tests pasados.
- tsc de backend/src pasó.
- tsc estricto directo de scripts/validation/narrative-user-canary-v8.ts pasó.
- Entrypoints públicos V6 de Arc y Editorial permanecen estrictos y sus suites de regresión pasaron.

### Auditoría de hard gates

- Los consumidores V8 post-ready no gatean B/C sobre isSufficient, publisher count o writerReady.
- Las comprobaciones de suficiencia legacy restantes son gates de wrapper V6 o comprobaciones de igualdad de integridad.

### Definition of Done

- Items 1-16: satisfechos en implementación/estática solo en la medida soportada por los tests registrados; no se marca comportamiento live como observado.
- Item 17 (progresión de Arc de Málaga): pendiente explícito.
- Item 18 (Approve de scorecard): pendiente explícito.

### Canary de Málaga

- El canary completo de Málaga fue ejecutado.
- El boundary admitió las 7 paradas como route-eligible tier C.
- Se produjo un Arc con las 7 paradas.
- La publicación no se completó porque el cuarto writer recibió un 429 upstream.
- El canary expuso un control flow post-editorial engañoso.
- No se declara completado el tour, la aprobación del scorecard ni la Definition of Done de release.
- El trabajo de checkpoint/resume, recuperación editorial parcial y gating de fallos correcto continúa en docs/working/67-v8-canary-checkpoint-resume-plan.md.

### git diff --check

- git diff --check a nivel de repositorio no está limpio debido a espacios en blanco preexistentes en backend/scripts/validation/narrative-user-canary-v6.ts.
- Las comprobaciones de diff acotadas al alcance de Plan 66 pasan.
- No se implica que el archivo no relacionado haya sido cambiado o corregido.

## Modo de uso

- Ejecutar la sección 17 en orden.
- Revisar cada diff del worker antes de continuar.
- Las secciones 4 y 22 son las autoridades de invariancia y aceptación final.

## 1. Objetivo

Permitir que una ruta V8 con paradas de evidencia A, B o C atraviese Arc, Editorial, scorecard y generación de artefactos sin falsear ni relajar los contratos estrictos de V6.

El resultado debe mantener dos rutas explícitas:

    V6 caller
      → gates estrictos V6
      → Arc V6
      → Editorial V6

    V8 Research
      → Evidence Boundary V8 determinista
      ├─ D o fallo técnico → bloqueo antes de modelos posteriores
      └─ A, B o C → admitted stops + manifest
                         → Arc V8
                         → Editorial V8
                         → scorecard y artefacto V8

La solución no puede convertir artificialmente un dossier C en suficiente para V6. La elegibilidad V8 vive en un envelope explícito que acompaña al dossier original, sin mutarlo.

## 2. Incidente que motiva el cambio

Artefacto observado:

    backend/tmp/narrative-v8/malaga-v8-phase1-20260901-14

Hechos verificados:

- Research terminó las siete paradas.
- La clasificación final fue 2 A y 5 C.
- Hubo 11 llamadas al curador.
- No hubo llamadas a Arc, Editorial ni scorecard.
- El run terminó en el gate real de Arc con:

      arc cannot be built from an insufficient dossier

- El artefacto público perdió estado útil: indicó preflight, dejó completedStage en null y no conservó adecuadamente ruta ni Research.

La causa no está en adquisición. Research V8 considera A, B y C routeEligible, pero el handoff reduce los resultados a dossiers V6 desnudos. Arc V6 y Editorial V6 vuelven a exigir dossier.sufficiency.isSufficient, que es false para B y C por diseño.

## 3. Decisión arquitectónica

### 3.1 Contratos separados

- V6 conserva su entrada, comportamiento, prompts, payloads, fingerprints y gates.
- V8 introduce un boundary determinista antes de Arc.
- A, B y C cruzan el pipeline únicamente como NarrativeAdmittedStopV8.
- D nunca puede representarse como una parada admitida.
- Un fallo técnico o contractual nunca se convierte en D.
- El mismo manifest creado por código gobierna Arc, Editorial, scorecard y artefactos.

### 3.2 Dos identidades distintas

No se puede asumir que routeStopId y entityQid sean iguales.

- routeStopId identifica una parada dentro de la ruta. Lo usan Arc, scripts, puentes y navegación.
- entityQid identifica la entidad Wikidata investigada. Lo usan Research, resolución de identidad y el dossier.
- dossier.stopId sigue conteniendo entityQid por el contrato actual.

Ejemplo obligatorio en tests:

    routeStopId = malaga-history-stop-03
    entityQid = Q3849447
    dossier.stopId = Q3849447

Arc y los scripts deben usar malaga-history-stop-03. El manifest debe conservar Q3849447 como entityQid.

### 3.3 El boundary no confía en datos derivados

El boundary reconstruye el dossier con el builder V6 y las captures originales antes de admitirlo. Después recompone gates y tier. Esto evita admitir:

- una suficiencia V6 manipulada;
- una captura primaria fabricada con un sourceId existente;
- publisher counts incorrectos;
- passages que no proceden de las captures;
- proposiciones debatable que incumplen el contrato V6;
- tiers o gates escritos manualmente por un caller o fixture.

## 4. Invariantes no negociables

1. buildNarrativeDossierV6 no cambia su fórmula de suficiencia.
2. Una proposición V6 debatable con un solo publisher continúa rechazada.
3. createNarrativeArcArchitectV6().build continúa rechazando cualquier dossier V6 insuficiente antes del proveedor.
4. runNarrativeEditorialWorkflowV6 continúa rechazándolo antes de todos los agentes.
5. Ningún código cambia dossier.sufficiency.isSufficient de false a true.
6. Ningún flag genérico como allowInsufficient o prevalidated puede abrir una puerta V6.
7. Los inputs públicos V6 no reciben campos opcionales de evidencia V8.
8. A, B y C viajan unidos al dossier en un objeto atómico, nunca en arrays paralelos.
9. D no se elimina silenciosamente de una ruta. Mientras no exista sustitución, cualquier D bloquea toda la ruta.
10. routeStopId gobierna Arc y Editorial; entityQid gobierna Research e identidad.
11. El manifest lo crea el código una vez. Ningún modelo lo genera, modifica ni reinterpreta.
12. El dossier original y su fingerprint permanecen intactos.
13. Scorecard y publicación V8 no vuelven a usar isSufficient o publisherCount como gate.

## 5. Contratos V8

Crear backend/src/services/poi/NarrativeEvidenceBoundaryV8.ts.

Los nombres pueden adaptarse únicamente si ya existe una convención equivalente, pero no debe cambiarse la semántica:

    export interface NarrativeResearchHandoffStopV8 {
      routeStopId: string;
      entityQid: string;
      result: NarrativeResearchStopResultV8;
    }

    export type NarrativeAdmittedTierV8 = 'A' | 'B' | 'C';

    export interface NarrativeEvidenceContextV8 {
      schemaVersion: 'narrative-evidence-context-v8';
      routeStopId: string;
      entityQid: string;
      evidenceTier: NarrativeAdmittedTierV8;
      routeEligible: true;
      gates: NarrativeEvidenceGatesV8;
      dossierFingerprint: string;
      legacyV6IsSufficient: boolean;
    }

    export interface NarrativeAdmittedStopV8 {
      routeStopId: string;
      entityQid: string;
      dossier: NarrativeDossierV6;
      evidence: NarrativeEvidenceContextV8;
    }

    export interface NarrativeEvidenceManifestStopV8 {
      routeStopId: string;
      entityQid: string;
      evidenceTier: NarrativeAdmittedTierV8;
      routeEligible: true;
      gates: NarrativeEvidenceGatesV8;
      dossierFingerprint: string;
      legacyV6IsSufficient: boolean;
    }

    export interface NarrativeEvidenceManifestV8 {
      schemaVersion: 'narrative-evidence-manifest-v8';
      routeFingerprint: string;
      stops: NarrativeEvidenceManifestStopV8[];
      fingerprint: string;
    }

    export type NarrativeEvidenceBoundaryResultV8 =
      | {
          status: 'ready';
          admittedStops: NarrativeAdmittedStopV8[];
          manifest: NarrativeEvidenceManifestV8;
        }
      | {
          status: 'blocked';
          stopIds: string[];
          reasons: string[];
        }
      | {
          status: 'protocol_failed';
          reason: string;
        };

legacyV6IsSufficient es solo diagnóstico. Nunca participa en una decisión V8.

## 6. Algoritmo exacto del boundary

Implementar buildNarrativeEvidenceBoundaryV8(route, handoffStops) en este orden.

### 6.1 Cardinalidad y orden

1. Verificar routeStopId únicos en la ruta.
2. Verificar routeStopId únicos en el handoff.
3. Rechazar resultados faltantes, extra o duplicados como protocol_failed.
4. Ordenar admittedStops y manifest.stops según route.stops.

### 6.2 Correspondencia de identidades

Para cada parada:

    routeStop.stopId === handoff.routeStopId
    routeStop.wikidataId === handoff.entityQid
    result.stopId === handoff.entityQid
    result.dossier.stopId === handoff.entityQid

Nunca exigir:

    result.dossier.stopId === routeStop.stopId

### 6.3 Separar evidencia insuficiente de fallos técnicos

- status evidence_review_required con evidenceTier D y routeEligible false produce boundary blocked.
- status failed con evidenceTier null produce protocol_failed.
- evidence_review_required con tier null representa una evaluación inválida y produce protocol_failed.
- status sufficient solo admite tier A, B o C, routeEligible true y dossier presente.
- Cualquier combinación distinta produce protocol_failed.

### 6.4 Reconstruir el dossier

Para cada resultado sufficient:

1. Llamar a buildNarrativeDossierV6 con los campos fuente del dossier recibido y result.captures.
2. Comparar el dossier reconstruido con el recibido.
3. Exigir igualdad de fingerprint y, al menos, sources, sufficiency, propositions y passages.
4. Si falla la reconstrucción o la igualdad, devolver protocol_failed.

La reconstrucción debe reutilizar el builder real, no duplicar sus reglas.

### 6.5 Recomponer gates y tier

    const gates = assessNarrativeEvidenceGatesV8(
      rebuiltDossier,
      handoff.entityQid,
    );

    const tier = classifyEvidenceTierV8(
      rebuiltDossier,
      gates,
      result.captures,
    );

Después:

- comparar gates con result.gates;
- comparar tier con result.evidenceTier;
- exigir gates.minimumEvidenceReady;
- admitir solo A, B o C;
- comprobar que el dossier recibido no cambió durante el proceso.

### 6.6 Crear el manifest

El fingerprint del manifest debe depender de:

- routeFingerprint;
- routeStopId;
- entityQid;
- evidenceTier;
- gates;
- dossierFingerprint;
- legacyV6IsSufficient.

El orden de stops forma parte de la identidad. El mismo manifest se pasa a todos los consumidores posteriores.

## 7. Semántica de los tiers

| Tier | Cobertura y autoridad | Estado legacy esperado | Resultado |
|---|---|---:|---|
| A | writerReady, dos fuentes autorizadas y dos publishers soportando el dossier | true | Admitido |
| B | writerReady y primary authority específica realmente soportando claims | false | Admitido |
| C completo | writerReady, pero no cumple A ni B | false | Admitido con redacción conservadora |
| C parcial | minimumEvidenceReady true, writerReady false y faltan solo roles no mínimos | false | Admitido; roles ausentes son prohibiciones |
| D | minimumEvidenceReady false | false | Nunca admitido |

La clasificación la decide código determinista sobre el dossier validado y las captures. El curador solo evalúa contenido, roles y supportIds.

## 8. Estrechar el resultado de Research

No cambiar adquisición, discovery, ranking, budgets ni classifyEvidenceTierV8.

Estrechar únicamente el tipo de salida para impedir estados contradictorios:

    sufficient
      evidenceTier: A | B | C
      routeEligible: true
      minimumEvidenceReady: true
      dossier presente

    evidence_review_required
      evidenceTier: D | null
      routeEligible: false

    failed
      evidenceTier: null
      routeEligible: false

Un null no representa evidencia D: representa que no existe una evaluación válida.

## 9. Arc V6 y Arc V8

### 9.1 Preservar V6

Antes de refactorizar:

- añadir una prueba real de createNarrativeArcArchitectV6().build;
- demostrar que un dossier insuficiente falla antes del requester;
- congelar request, system prompt, input serializado, tool, schema y fingerprint observables;
- conservar firma y comportamiento públicos de validateNarrativeArcV6.

Separar internamente:

- validación común de forma y cobertura de route stops;
- correspondencia estricta V6 entre dossier.stopId y route.stopId.

El wrapper V6 debe seguir aplicando ambas.

### 9.2 Crear NarrativeArcArchitectV8

Archivo nuevo:

    backend/src/services/poi/NarrativeArcArchitectV8.ts

Entrada:

    {
      route,
      admittedStops,
      manifest
    }

Antes del requester:

- verificar route fingerprint;
- verificar correspondencia exacta manifest ↔ admittedStops;
- verificar cobertura completa y única por routeStopId;
- verificar todos los dossier fingerprints;
- rechazar cualquier tier distinto de A, B o C.

La proyección enviada al modelo contiene:

    {
      routeStopId,
      entityQid,
      evidence: {
        evidenceTier,
        gates,
        dossierFingerprint
      },
      dossier: {
        ...campos factuales
      }
    }

La proyección elimina del dossier:

- stopId, para evitar ambigüedad con routeStopId;
- sufficiency, porque es un contrato legacy V6;
- fingerprint, porque el modelo no lo interpreta.

El objeto original no se modifica.

El prompt V8 debe declarar:

- todas las paradas recibidas ya fueron admitidas determinísticamente;
- A, B y C son routeEligible;
- solo pueden usarse propositions, passages y limits suministrados;
- un C no permite completar roles ausentes;
- no se pueden introducir hechos externos;
- la contribución al Arc se basa solo en roles presentes.

La salida continúa usando NarrativeArcV6 y sus stopId son routeStopId. El resultado devuelve el mismo manifest recibido; el modelo no puede producirlo ni cambiarlo.

## 10. Editorial V6 y Editorial V8

### 10.1 Congelar observables V6

Antes de extraer coordinación, crear goldens o snapshots para:

- Arc architect;
- writer;
- factual audit;
- adjudicate;
- factual repair;
- tour repair;
- tour audit.

Capturar al menos:

- systemPrompt;
- input serializado;
- toolName;
- schema;
- request o prompt fingerprint.

La suite V6 posterior debe producir exactamente los mismos valores.

### 10.2 Extraer un core interno

No duplicar el workflow completo. Mantener el core de coordinación dentro del módulo actual o en un módulo interno mínimo si el tamaño lo exige.

Su unidad normalizada es:

    interface NarrativeEditorialCoreStop {
      routeStopId: string;
      dossier: NarrativeDossierV6;
      evidenceContext?: NarrativeEvidenceContextV8;
    }

El mapa interno se indexa por routeStopId, nunca por dossier.stopId para V8.

El core coordina:

- write;
- audits;
- adjudication;
- repair;
- reaudit;
- tour audit;
- review.

El core no decide elegibilidad.

### 10.3 Entrada V6

runNarrativeEditorialWorkflowV6:

1. conserva el gate actual de isSufficient;
2. si falla, no llama a ningún agente;
3. si pasa, normaliza cada dossier como routeStopId = dossier.stopId;
4. llama al core sin evidenceContext;
5. conserva payloads, prompts, fingerprints, concurrencia, cancelación, orden de repairs, resume y review.

No añadir evidence opcional a las interfaces públicas V6.

### 10.4 Entrada V8

Crear una entrada explícita:

    runNarrativeEditorialWorkflowV8({
      runId,
      createdAt,
      route,
      admittedStops,
      arcBundle,
      voiceProfile,
      privateArtifactPath
    })

Debe validar admittedStops y el fingerprint del manifest antes de llamar al core.

Usar adaptadores de request V8 separados de los adapters públicos V6. Cada operación recibe el mismo NarrativeEvidenceContextV8:

- write;
- audit inicial;
- adjudicación factual inicial;
- repair factual;
- reaudit factual;
- adjudicación de tour;
- repair de tour;
- audit factual posterior al repair global;
- tour audit.

Tour audit recibe además una proyección evidenceByStop del manifest completo.

Para C parcial:

- missingWriterRoles son prohibiciones;
- writer y repair no intentan completarlos;
- auditores no penalizan su ausencia como si fuera un error;
- cualquier hecho sigue necesitando soporte del dossier.

Los requests V8 proyectan el dossier sin stopId, sufficiency ni fingerprint y añaden routeStopId, entityQid y evidenceContext de forma explícita.

Resume debe conservar el evidenceContext durante todas las operaciones posteriores.

## 11. Política de D y concurrencia

Mientras no exista sustitución automática, cualquier D bloquea toda la ruta, sea la parada requerida u opcional.

Al detectar D:

1. dejar de programar nuevas investigaciones;
2. abortar trabajos activos si aceptan AbortSignal;
3. esperar su terminación controlada;
4. ignorar resultados tardíos para admisión;
5. no ejecutar Arc, writer, audit, adjudicate, repair, tour audit ni scorecard.

Con concurrencia dos, otra investigación puede estar ya en vuelo. Los tests no deben exigir cero llamadas Research; deben exigir cero consumidores posteriores.

Crear pruebas separadas para D requerido y D opcional.

## 12. Manifest, scorecard y artefactos

No modificar buildNarrativeReviewPackageV6.

El artefacto efectivo del user canary V8 debe incluir:

    {
      schemaVersion: 'narrative-user-canary-v8',
      evidenceManifest,
      arc,
      editorial,
      scorecard,
      boundaryMigrationPassed,
      publicationPassed
    }

Reglas:

- persistir manifest desde que el boundary queda ready;
- si falla una fase posterior, conservar el manifest;
- conservar resumen público de ruta y Research;
- registrar correctamente activeStage y completedStage;
- hacer depender el fingerprint del artefacto V8 del manifest;
- el scorecard recibe y verifica el mismo manifest;
- scorecard no bloquea C por isSufficient o publisher count;
- publicationPassed solo es true con decisión Approve.

No crear un builder genérico sin consumidor real.

## 13. Fixtures de prueba reales

Crear una factory de test compartida, adyacente a los tests V8, que:

1. construya captures reales;
2. construya passages y propositions;
3. llame a buildNarrativeDossierV6;
4. calcule gates con assessNarrativeEvidenceGatesV8;
5. calcule tier con classifyEvidenceTierV8;
6. devuelva tipos mediante satisfies;
7. no use as NarrativeResearchStopResultV8 para fabricar estados.

Matriz mínima:

| Caso | Roles | Fuentes | Resultado |
|---|---|---|---|
| A | 5 de 5 | 2 publishers autorizados | isSufficient true, writerReady true, A |
| B | 5 de 5 | 1 publisher primary soportado | isSufficient false, writerReady true, B |
| C completo | 5 de 5 | 1 publisher established | isSufficient false, writerReady true, C |
| C parcial | mínimos presentes; falta tension_or_contrast | 2 publishers | isSufficient false, writerReady false, C |
| D | falta visible_observation o chronology_or_transformation | cualquiera | minimum false, routeEligible false, D |

Al menos una fixture de cada suite integrada usa routeStopId distinto de entityQid.

## 14. Cobertura de tests obligatoria

### 14.1 NarrativeArcArchitectV6.test.ts

Conservar los tests estructurales actuales y añadir:

- build rechaza dossier insuficiente antes del requester;
- build acepta un dossier V6 realmente suficiente;
- duplicate arc stop;
- unknown arc stop;
- duplicate dossier stop;
- missing dossier;
- extra dossier;
- golden del request V6.

### 14.2 NarrativeEvidenceBoundaryV8.test.ts

Cubrir:

- A, B, C completo y C parcial se admiten en orden de ruta;
- A conserva isSufficient true;
- B y C conservan isSufficient false;
- D devuelve blocked;
- fallo técnico devuelve protocol_failed;
- sufficient con D se rechaza;
- tier manual incorrecto se rechaza;
- gates manuales incorrectos se rechazan;
- captura inconsistente con el dossier se rechaza;
- routeStopId y entityQid distintos funcionan;
- resultado faltante, extra o duplicado se rechaza;
- no hay mutación;
- fingerprint del manifest es determinista.

### 14.3 NarrativeArcArchitectV8.test.ts

Cubrir:

- A, B y ambos C llegan al payload;
- cada stop incluye routeStopId, entityQid, tier, gates y dossier fingerprint;
- los dossiers C originales continúan insufficient;
- la proyección no incluye stopId, sufficiency ni fingerprint internos;
- el prompt no contiene el gate legacy V6;
- D o manifest inconsistente bloquean antes del requester;
- el Arc cubre exactamente routeStopId;
- vuelve el mismo manifest fingerprint.

### 14.4 NarrativeEditorialWorkflowV6.test.ts

Mantener toda la suite existente. Fortalecer el caso insuficiente para demostrar cero llamadas a:

- write;
- audit;
- adjudicate;
- repair;
- auditTour.

Demostrar también que el flujo V6 normal no envía evidenceContext y que los goldens no cambian.

### 14.5 NarrativeEditorialWorkflowV8.test.ts

Cubrir:

- ruta mixta A + B + C completo + C parcial;
- un script por routeStopId;
- propagation de evidenceContext a todas las operaciones;
- C parcial conserva missingWriterRoles;
- no mutación de dossier;
- resume conserva evidenceContext;
- manifest de Arc inconsistente bloquea antes de agentes;
- una entrada corrupta con D bloquea antes de agentes.

### 14.6 NarrativeUserCanaryV8.test.ts

Eliminar el falso C creado mediante cast y sustituirlo por fixtures reales.

Mantener:

- baseline all-A;
- máximo dos Research concurrentes;
- fail-fast ante D;
- un script por parada.

Renombrar el test basado en not writerReady para que exprese tier D o routeEligible false.

Añadir:

- C completo real;
- C parcial real;
- ruta A + B + C completo + C parcial;
- callback recibe admittedStops y evidenceManifest, no dossiers desnudos;
- tier o gates fabricados terminan en protocol_failed;
- routeStopId distinto de entityQid.

### 14.7 Test integrado V8

Flujo sin reemplazar el handoff por un runEditorial artificial:

    resultados Research sintéticos reales
      → Evidence Boundary V8
      → Arc V8
      → Editorial V8
      → agentes V8 falsos
      → review V8

Escenario uno:

    A + B + C completo + C parcial

Debe producir cuatro paradas en Arc, cuatro scripts, manifest preservado y cero gates legacy sobre B/C.

Escenario dos:

    A + D + C

Debe producir cero llamadas a Arc, writer, audit, adjudicate, repair, tour audit y scorecard.

## 15. Auditoría obligatoria de hard gates

Al finalizar la implementación:

    rg -n 'sufficiency\.isSufficient|authoritySourceCount|independentPublisherCount|writerReady|routeEligible|evidenceTier' backend/src backend/scripts

Clasificar cada coincidencia en el informe final:

| Categoría | Permitido |
|---|---|
| Construcción estricta de dossier V6 | Sí |
| Gate de Arc o Editorial V6 | Sí |
| Research y classifier V8 | Sí |
| Evidence Boundary V8 | Sí |
| Diagnóstico o reporting | Sí |
| Arc V8 usando isSufficient como gate | No |
| Editorial V8 usando isSufficient como gate | No |
| Scorecard V8 bloqueando C por counts legacy | No |
| Resume V8 perdiendo el manifest | No |

## 16. Protocolo obligatorio para ejecutar con qwen_worker

El agente principal decide arquitectura, revisa diffs y aprueba cada fase. El worker ejecuta cambios y validaciones mecánicas.

Elegir siempre la operación más estrecha:

1. inspect_literal para evidencia exacta conocida.
2. replace_literal para sustitución exacta conocida.
3. validate para tests, TypeScript, smoke o canary ya decididos.
4. research solo para hechos mecánicos desconocidos.
5. semantic_patch para cambios semánticos en archivos existentes.
6. delegate para archivos nuevos o reescrituras pequeñas completas.

Reglas por delegación:

- máximo tres archivos escribibles;
- objetivo único y cohesivo;
- incluir solo contexto de implementación indispensable;
- dry_run false salvo riesgo concreto;
- preservar cambios ajenos y line endings;
- ejecutar solo validación enfocada;
- revisar diff y evidencia antes de la siguiente tarea;
- si semantic_patch falla por precondition, usar inspect_literal, no adivinar;
- si delegate falla o trunca un archivo existente, usar semantic_patch;
- si un test falla por el cambio, mandar una corrección acotada al mismo worker;
- no continuar a la siguiente fase si la regresión V6 está roja.

### Plantilla mínima de cada tarea

Cada llamada a qwen_worker debe contener exactamente:

- objetivo ya decidido por Codex;
- archivos escribibles, máximo tres;
- contexto readonly mínimo indispensable;
- requisitos concretos y no-objetivos explícitos;
- comandos de validación enfocados;
- dry_run false;
- revisión de archivos cambiados, diff, códigos de salida de comandos y evidencia antes de continuar.

Un resultado BLOCKED o un fallo a nivel de herramienta detiene esa tarea y no debe provocar implementación directa por Codex.

## 17. Secuencia de implementación para el agente

Cada tarea siguiente es una unidad de delegación. No combinar tareas para ahorrar llamadas.

### Tarea 0 — Congelar observables V6

Dependencias: ninguna.

Archivos escribibles, máximo tres:

- backend/src/services/poi/NarrativeArcArchitectV6.test.ts
- backend/src/services/poi/NarrativeEditorialAgentsV6.test.ts
- backend/src/services/poi/NarrativeEditorialWorkflowV6.test.ts

Herramienta: semantic_patch.

Implementar:

- build gate real de Arc;
- cero agentes tras fallo V6 editorial;
- goldens de requests/prompts/fingerprints V6.

Validar:

    cd backend
    npx jest src/services/poi/NarrativeArcArchitectV6.test.ts src/services/poi/NarrativeEditorialAgentsV6.test.ts src/services/poi/NarrativeEditorialWorkflowV6.test.ts --runInBand

Parar si los tests no describen el comportamiento preexistente sin cambiar producción.

### Tarea 1 — Fixtures V8 reales

Dependencias: Tarea 0 verde.

Archivos escribibles:

- un archivo nuevo de test-support adyacente a las suites Narrative V8;
- su test unitario si la factory necesita aserciones propias.

Herramienta: delegate para archivos nuevos.

Implementar la matriz A/B/C completo/C parcial/D y el caso routeStopId distinto de entityQid usando builders reales y satisfies.

Validar el test nuevo. Revisar expresamente que no exista cast a NarrativeResearchStopResultV8.

### Tarea 2A — Boundary V8 y tests

Dependencias: Tarea 1.

Archivos escribibles:

- backend/src/services/poi/NarrativeEvidenceBoundaryV8.ts
- backend/src/services/poi/NarrativeEvidenceBoundaryV8.test.ts

Herramienta: delegate porque ambos son nuevos.

Implementar exactamente el algoritmo de la sección 6.

Validar:

    cd backend
    npx jest src/services/poi/NarrativeEvidenceBoundaryV8.test.ts --runInBand

### Tarea 2B — Estrechar Research

Dependencias: Tarea 2A.

Archivos escribibles:

- backend/src/services/poi/NarrativeResearchV8.ts
- backend/src/services/poi/NarrativeResearchV8.test.ts

Herramienta: semantic_patch.

Cambiar solo el contrato discriminado y los tests necesarios. No tocar adquisición, discovery, budgets ni classifier.

Validar:

    cd backend
    npx jest src/services/poi/NarrativeResearchV8.test.ts src/services/poi/NarrativeEvidenceBoundaryV8.test.ts --runInBand

### Tarea 3A — Separar validación común de Arc

Dependencias: Tarea 0.

Archivos escribibles:

- backend/src/services/poi/NarrativeArcArchitectV6.ts
- backend/src/services/poi/NarrativeArcArchitectV6.test.ts

Herramienta: semantic_patch.

Extraer únicamente forma/cobertura común. El wrapper V6 y sus observables quedan idénticos.

Validar la suite Arc V6 y sus goldens.

### Tarea 3B — Crear Arc V8

Dependencias: Tareas 2A y 3A.

Archivos escribibles:

- backend/src/services/poi/NarrativeArcArchitectV8.ts
- backend/src/services/poi/NarrativeArcArchitectV8.test.ts

Herramienta: delegate.

Implementar input admittedStops + manifest, proyección V8, prompt V8 y validación pre-request.

Validar ambas suites Arc V6 y V8.

### Tarea 4 — Extraer core editorial sin cambiar V6

Dependencias: Tarea 0.

Archivos escribibles:

- backend/src/services/poi/NarrativeEditorialWorkflowV6.ts
- backend/src/services/poi/NarrativeEditorialWorkflowV6.test.ts
- backend/src/services/poi/NarrativeEditorialAgentsV6.test.ts, solo si el golden exige ajuste mecánico.

Herramienta: semantic_patch.

Mantener el core en el módulo Workflow V6 salvo que exista una razón concreta para un archivo interno. Normalizar a NarrativeEditorialCoreStop e indexar por routeStopId.

Validar inmediatamente toda la suite editorial V6. No avanzar con ninguna diferencia en payloads, prompts, fingerprints, orden, concurrencia, cancelación, resume o review.

### Tarea 5A — Adaptadores editoriales V8

Dependencias: Tareas 2A y 4.

Archivos escribibles:

- backend/src/services/poi/NarrativeEditorialAgentsV8.ts
- backend/src/services/poi/NarrativeEditorialAgentsV8.test.ts

Herramienta: delegate.

Crear adaptadores explícitos V8. No extender interfaces públicas V6.

Validar suites V6 y V8 de agentes.

### Tarea 5B — Workflow editorial V8

Dependencias: Tareas 3B, 4 y 5A.

Archivos escribibles:

- backend/src/services/poi/NarrativeEditorialWorkflowV8.ts
- backend/src/services/poi/NarrativeEditorialWorkflowV8.test.ts

Herramienta: delegate.

Validar manifest, adaptar admittedStops al core y propagar evidenceContext a todas las fases.

Validar suites Workflow V6 y V8.

### Tarea 6A — Handoff del user canary

Dependencias: Tareas 2A, 3B y 5B.

Archivos escribibles:

- backend/scripts/validation/narrative-user-canary-v8.ts
- backend/scripts/validation/narrative-user-canary-v8.test.ts

Herramienta: semantic_patch.

Implementar:

- handoff con routeStopId + entityQid + result;
- política de D con semántica concurrente;
- boundary construido una vez;
- Arc V8 y Editorial V8;
- admittedStops + manifest sin reducción a dossiers desnudos.

No añadir lógica específica de Málaga.

### Tarea 6B — Manifest en scorecard y artefacto real

Dependencias: Tarea 6A.

Primero usar inspect_literal o research acotado solo si no está identificado el consumidor exacto del scorecard o del artefacto.

Máximo tres archivos escribibles por delegación. Usar semantic_patch para existentes y delegate solo para un helper V8 nuevo con consumidor inmediato.

Implementar:

- persistencia del manifest;
- stage correcto en fallos posteriores al boundary;
- boundaryMigrationPassed;
- publicationPassed;
- mismo manifest en scorecard;
- ningún gate legacy.

Validar los tests del canary y scorecard relevantes.

### Tarea 7 — Integración V8

Dependencias: Tarea 6B.

Archivo escribible:

- un test integrado V8 nuevo junto al canary o pipeline Narrative V8.

Herramienta: delegate.

Implementar los escenarios A+B+C completo+C parcial y A+D+C descritos en 14.7.

### Tarea 8 — Auditoría y documentación final

Dependencias: todas las anteriores y validación estática verde.

Archivos escribibles, una delegación independiente:

- docs/working/63-narrative-v8-implementation-plan.md
- docs/working/64-narrative-v8-technical-specification.md
- docs/working/65-narrative-v8-operations-runbook.md

Herramienta: semantic_patch.

Actualizar únicamente después de tener evidencia real. Documentar:

- separación V6/V8;
- contratos boundary/manifest;
- política de D;
- comandos;
- resultados del canary;
- inventario final de hard gates.

No tocar DOCKER-SETUP.md, tasks/plan.md ni tasks/todo.md.

## 18. Validación estática y enfocada

Desde backend:

    npx jest src/services/poi/NarrativeEvidenceBoundaryV8.test.ts --runInBand
    npx jest src/services/poi/NarrativeArcArchitectV6.test.ts src/services/poi/NarrativeArcArchitectV8.test.ts --runInBand
    npx jest src/services/poi/NarrativeEditorialAgentsV6.test.ts src/services/poi/NarrativeEditorialAgentsV8.test.ts --runInBand
    npx jest src/services/poi/NarrativeEditorialWorkflowV6.test.ts src/services/poi/NarrativeEditorialWorkflowV8.test.ts --runInBand
    npx jest scripts/validation/narrative-user-canary-v8.test.ts --runInBand
    npx tsc --noEmit

Desde la raíz:

    git diff --check

No repetir tests exitosos sin una razón concreta. Ejecutar la suite conjunta final una vez después de integrar todos los componentes.

## 19. Runtime local

Desde la raíz:

    bash scripts/firecrawl-local.sh up
    env -u BRAVE_SEARCH_API_KEY bash scripts/searxng-local.sh up
    bash scripts/firecrawl-local.sh smoke
    bash scripts/searxng-local.sh status

SearXNG debe responder en:

    http://127.0.0.1:18081

El puerto interno del contenedor continúa siendo 8080.

## 20. Canary de Málaga

El usuario ejecutará el canary si así lo prefiere; qwen_worker.validate puede ejecutarlo cuando el runtime y las credenciales estén disponibles.

    cd backend
    set -o pipefail

    npx tsx scripts/validation/narrative-user-canary-v8.ts \
      --generate \
      --allow-external \
      --profile=balanced_openrouter \
      --prior-spend-usd=0.58 \
      --city='Málaga' \
      --city-qid=Q8851 \
      --run-id=malaga-v8-boundary-20260901-15 \
      --core-artifact=tmp/narrative-v8/malaga-v8-final-20260831-7/core.private.json \
      2>&1 | tee /tmp/malaga-v8-boundary-15.log

No cambiar adquisición para hacer pasar este run.

## 21. Gates de aceptación

### 21.1 Gate arquitectónico

boundaryMigrationPassed es true cuando:

- Research devuelve siete resultados;
- el boundary queda ready;
- el manifest se persiste;
- Arc se genera;
- Editorial produce siete scripts;
- scorecard se ejecuta;
- ningún dossier cambia isSufficient;
- ningún consumidor V8 bloquea B o C por gates legacy;
- routeStopId y entityQid se conservan correctamente;
- el artefacto permite auditar tier y gates por parada.

La distribución esperada basada en el run anterior es aproximadamente 2 A y 5 C, pero el criterio no fija esos números si la evidencia real cambia. Sí exige que el tier provenga del dossier recompuesto.

### 21.2 Gate de producto

publicationPassed es true cuando:

- scorecardDecision es Approve;
- existen siete scripts;
- tour.md es usable;
- no hay claims sin soporte ni roles inventados.

Si hay siete scripts y scorecard devuelve Request changes:

- la migración arquitectónica puede considerarse correcta;
- el release todavía no está aprobado;
- diagnosticar únicamente la objeción editorial concreta;
- no reabrir acquisition ni relajar el boundary sin evidencia.

## 22. Criterios finales de Definition of Done

La tarea completa exige:

1. Toda la suite V6 relevante permanece verde y sus observables no cambian. [Implementación/estática satisfecha según tests registrados]
2. El boundary reconstruye dossier, gates y tier. [Implementación/estática satisfecha según tests registrados]
3. A, B y C viajan en un envelope atómico. [Implementación/estática satisfecha según tests registrados]
4. D y fallos técnicos tienen resultados distintos. [Implementación/estática satisfecha según tests registrados]
5. B y C conservan isSufficient false. [Implementación/estática satisfecha según tests registrados]
6. Arc V8 usa routeStopId y recibe evidence context. [Implementación/estática satisfecha según tests registrados]
7. Editorial V8 propaga el mismo context a todas las operaciones. [Implementación/estática satisfecha según tests registrados]
8. Resume y repairs conservan el manifest. [Implementación/estática satisfecha según tests registrados]
9. Scorecard y artefacto conservan el mismo fingerprint de manifest. [Implementación/estática satisfecha según tests registrados]
10. Fixtures incoherentes son rechazadas. [Implementación/estática satisfecha según tests registrados]
11. Existe cobertura real para A, B, C completo, C parcial y D. [Implementación/estática satisfecha según tests registrados]
12. Existe cobertura con routeStopId distinto de entityQid. [Implementación/estática satisfecha según tests registrados]
13. La ruta mixta atraviesa el pipeline integrado. [Implementación/estática satisfecha según tests registrados]
14. La ruta con D realiza cero llamadas posteriores a Research. [Implementación/estática satisfecha según tests registrados]
15. La auditoría global no encuentra hard gates legacy dentro de consumidores V8. [Implementación/estática satisfecha según auditoría registrada]
16. git diff --check, TypeScript y tests enfocados pasan. [Implementación/estática satisfecha según validación registrada; git diff --check acotado a Plan 66 pasa]
17. El canary de Málaga supera el antiguo error de Arc. [COMPLETADO: boundary admitió 7 paradas tier C y Arc generado con 7 paradas]
18. El gate de producto termina en Approve antes de declarar el tour publicable. [NO COMPLETADO: publicación interrumpida por 429 upstream y control flow post-editorial; trabajo de resume en Plan 67]

## 23. Fuera de alcance

No incluir:

- MediaWiki external links;
- cambios P856;
- nuevos budgets de red;
- cambios de ranking o discovery;
- cambios en classifyEvidenceTierV8;
- sustitución automática de paradas;
- lógica específica de Málaga;
- cambios en la normalización preexistente debatable-to-direct;
- cambios en SearXNG o Firecrawl;
- relajación de contratos V6.

## 24. Regla de cierre para el agente principal

Después de cada delegación:

1. revisar únicamente el diff autorizado;
2. comprobar la evidencia de validación;
3. identificar cualquier desviación concreta;
4. enviar una corrección pequeña al worker si es necesaria;
5. no implementar directamente archivos ya delegados;
6. no ampliar alcance por fallos editoriales no relacionados;
7. avanzar solo cuando la fase anterior cumple su gate.

El trabajo no termina en implementation complete. Termina cuando el pipeline V8 produce evidencia observable de Arc, siete scripts, scorecard y un tour aprobado, conservando intactas las garantías V6.
