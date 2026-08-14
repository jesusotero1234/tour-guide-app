# Plan técnico P0: tour end-to-end V8 con ruta, evidencia y guion final

Fecha: 2026-08-14

Estado: **especificación de implementación; canary únicamente; no activar todavía en producción**

Prioridad: **P0 — el producto selecciona una ruta, pero no consigue producir el tour narrado**

Documentos relacionados:

- [`62-seleccion-esencial-busqueda-v8-plan.md`](./62-seleccion-esencial-busqueda-v8-plan.md)
- [`62-seleccion-esencial-busqueda-v8-qa.md`](./62-seleccion-esencial-busqueda-v8-qa.md)
- Artefacto del fallo: [`review.json`](../../backend/tmp/narrative-v6/malaga-user-canary-openrouter-1/review.json)
- Diagnóstico privado del fallo: [`diagnostics.private.json`](../../backend/tmp/narrative-v6/malaga-user-canary-openrouter-1/diagnostics.private.json)

## 1. Objetivo y definición exacta de éxito

El objetivo inmediato no es demostrar que se pueden seleccionar monumentos ni que los proveedores responden por separado. El objetivo es ejecutar una petición real como la de Málaga y obtener, en una sola cadena verificable:

1. Una ruta estructural con identidades Wikidata válidas.
2. Cobertura completa del núcleo editorial obligatorio.
3. Una geometría válida de uno o dos bloques caminables.
4. Evidencia suficiente y trazable para cada parada final.
5. Un dossier factual consumible por el arquitecto y los escritores existentes.
6. Un arco completo.
7. Un guion escrito y auditado para cada parada.
8. Un `tour.md` que contenga el recorrido y todos los textos, no solo una lista de paradas.
9. Un `review.json` público y un `diagnostics.private.json` que permitan saber qué ocurrió en cada fase.

Se distinguen dos resultados:

- **Éxito operativo end-to-end:** se escribieron y auditaron todos los guiones; el resultado puede ser `approved` o `request_changes` por calidad editorial.
- **Aprobación editorial:** además, el scorecard final devuelve `Approve` y no quedan advertencias duras.

Un run que solo produce paradas, spans o dossiers **no** es un tour end-to-end y no se puede declarar completado.

## 2. Supuestos cerrados y límites

Estos supuestos no deben reinterpretarse durante la implementación:

- V8 seguirá siendo un canary. No cambiar el flujo productivo por defecto.
- No añadir listas de monumentos, QIDs, dominios ni reglas específicas de Málaga, Barcelona o cualquier otra ciudad.
- No reparar V6 añadiendo Málaga a `CITY_PRIMARY_PUBLISHERS_V6`.
- No enviar páginas de Wikipedia o Wikidata a Firecrawl.
- SearXNG y Firecrawl deben ser instancias self-hosted.
- Firecrawl Cloud queda deshabilitado.
- No implementar planificación de transporte.
- Un tour de 120 minutos admite como máximo dos bloques y un `self_transfer`.
- El tiempo de `self_transfer` no forma parte de la duración guiada.
- No eliminar una identidad editorialmente requerida para hacer que la ruta parezca caminable.
- No relajar silenciosamente los gates de evidencia de V6.
- No modificar artefactos V6 congelados ni su semántica de replay.
- No ejecutar TTS ni persistir el tour durante el canary.
- No hacer reintentos vivos repetidos hasta “tener suerte”. Cada ejecución debe tener un propósito, un límite y artefactos propios.
- El worktree ya contiene cambios de otros trabajos. Tocar solo los archivos enumerados en este documento y conservar cualquier cambio ajeno.

## 3. Diagnóstico probado del run de Málaga

### 3.1 Qué sí funcionó

El comando real fue:

```powershell
node -r ts-node/register scripts/validation/narrative-user-canary-v6.ts `
  --generate --allow-external `
  --profile=balanced_openrouter `
  --prior-spend-usd=0 `
  --city=Málaga --country=España --country-code=ES `
  --theme=history --language=es --duration=120 `
  --run-id=malaga-user-canary-openrouter-1
```

La fase estructural produjo ocho paradas reales:

1. Alcazaba de Málaga — `Q3127243`
2. Teatro romano — `Q3849447`
3. Palacio de los Condes de Buenavista — `Q969308`
4. Iglesia Catedral de la Encarnación — `Q1582758`
5. Palacio de la Aduana — `Q4155876`
6. Muralla nazarí y muro portuario — `Q6032873`
7. Plaza de toros de La Malagueta — `Q523311`
8. Castillo de Gibralfaro — `Q1049197`

La ruta reportó aproximadamente 2.843 metros y 116,61 minutos. Esto demuestra que la adquisición de POIs y la selección estructural de ese run funcionaron. No demuestra que la selección esencial V8, la investigación V8 ni los escritores funcionaran.

### 3.2 Qué falló exactamente

El estado final fue `research_failed`:

- Siete paradas terminaron en `source_capture_failed`.
- Teatro Romano terminó en `evidence_review_required`.
- El arquitecto, los escritores, los auditores y el scorecard no se ejecutaron.
- `tour.md` solo pudo mostrar la ruta y el estado “no aprobado”.

Datos observados:

| Métrica | Resultado |
|---|---:|
| Paradas estructurales | 8 |
| Consultas fijas | 48, seis por parada |
| Consultas de las siete paradas sin resultados web | 42 |
| Capturas útiles en esas siete paradas | 0 |
| Intentos mínimos de Wikimedia mediante Firecrawl en esas siete paradas | 14 |
| Respuestas 403 de esas identidades | 14 |
| Capturas en Teatro Romano | 8 |
| Dossiers suficientes | 0 |
| Guiones escritos | 0 |

### 3.3 Cadena causal

El fallo no es un timeout único ni falta de paciencia. Es una incompatibilidad arquitectónica:

1. [`narrative-user-canary-v6.ts`](../../backend/scripts/validation/narrative-user-canary-v6.ts) llama directamente a `researchNarrativeStopsV6` y a `FirecrawlNarrativeSourceProviderV6`.
2. Ese comando **no llama** a `NarrativeCanaryV8`, `NarrativeSourcesV7`, `NarrativeAuthoritiesV7` ni `NarrativeSpansV7`.
3. `createNarrativeSearchPlannerV6` exige exactamente seis consultas y recibe los dominios de `narrativePrimaryAuthorityDomainsV6(city)`.
4. Málaga no existe en el registro V6. El fallback contiene principalmente autoridades de Madrid.
5. El LLM obedeció el contrato y produjo consultas como `site:madrid.es`, `site:esmadrid.com` y `site:memoriademadrid.es` para monumentos de Málaga.
6. Al no haber resultados, `identityResults` añadió únicamente las URLs HTML de Wikidata y Wikipedia.
7. V6 intentó capturar ambas mediante Firecrawl `/scrape`.
8. Wikimedia respondió 403 al scraper.
9. Sin capturas no hubo dossier; sin dossier no se lanzaron escritores.

Teatro Romano no contradice el diagnóstico. Sus resultados procedían de dominios estáticos que V6 marcó como autoridades por pertenecer al allowlist, aunque las páginas no fueran pertinentes para esa identidad. El curador rechazó correctamente la evidencia. Esto prueba que:

- una autoridad estática no garantiza relevancia de entidad;
- contar resultados no equivale a tener evidencia;
- añadir más dominios al allowlist repetiría el problema en la próxima ciudad.

### 3.4 Por qué “cambiar el proveedor” no basta

El V8 actual todavía no puede alimentar al flujo editorial final:

- `NarrativeCanaryV8` devuelve roles, spans y citas, pero no el texto factual completo de cada proposición.
- El curador actual se invoca captura por captura; dos fuentes deben inventar de forma independiente el mismo `propositionId` para corroborarse.
- Wikipedia capturada por API sigue clasificada inicialmente como `discovery_only` y puede ser rechazada aunque su QID sea exacto.
- `NarrativeDossierV6` exige proposiciones, pasajes, nombres, números, discrepancias y límites.
- El flujo editorial V6 bloquea cualquier dossier cuya `sufficiency.isSufficient` sea falsa.
- El canary V8 termina antes del arquitecto y de los escritores.
- El artefacto V8 no demuestra todavía que las piernas de la ruta y el texto fijo de `self_transfer` lleguen al tour renderizado.

Por tanto, no se debe sustituir una llamada y hacer casts para satisfacer TypeScript. Hay que construir explícitamente el puente de evidencia a dossier.

## 4. Arquitectura objetivo

```text
Petición del usuario
  -> preflight de servicios
  -> candidatos vivos con QID
  -> núcleo editorial requerido
  -> selección esencial V8
  -> geometría V8
  -> investigación V8 por parada
       -> identidad y autoridades: APIs Wikidata/Wikibase
       -> descubrimiento: SearXNG self-hosted
       -> mapa/captura web: Firecrawl self-hosted
       -> Wikipedia: MediaWiki Action API
       -> spans estables
       -> una curación agregada por ronda
  -> validación y construcción de dossier
  -> adaptador V8 -> NarrativeDossierV6 validado
  -> arquitecto V6 existente
  -> escritores/auditores V6 existentes
  -> inserción determinista de self_transfer
  -> review.json + diagnostics.private.json + tour.md
```

Regla de dependencia: ninguna fase posterior puede ejecutarse si su gate anterior no pasó. En particular, los escritores no se lanzan si la ruta final, la geometría final o un dossier final son insuficientes.

## 5. Contratos que se deben implementar

### 5.1 Identidad canónica

En V8, todo candidato que pueda entrar en una ruta debe tener un QID real:

```ts
interface EssentialRouteCandidateV8 extends RouteCandidate {
  wikidataId: string; // debe cumplir /^Q\d+$/
  narrativeContribution?: number;
  evidenceScore?: number;
  role?: string;
}
```

No convertir `canonicalId` a `wikidataId` mediante cast. `canonicalId` puede ser `osm:node:...`.

Para candidatos con `wikipedia` pero sin `wikidata`:

1. Resolver el título por MediaWiki API.
2. Leer `pageprops.wikibase_item`.
3. Aceptarlo solo si cumple el formato QID.
4. Conservar la relación OSM -> Wikipedia -> QID en diagnósticos.
5. Excluir de la ruta V8 cualquier candidato que siga sin QID y registrar `identity_unresolved`; no inventar un QID.

El identificador interno de una parada V8 será el QID. El nombre y un slug son propiedades de presentación, no identidad.

### 5.2 Ciudad y país

Separar siempre:

```ts
interface NarrativeLocationV8 {
  cityName: string;
  cityQid: string;
  countryName: string;
  countryCode: string; // ISO 3166-1 alpha-2, mayúsculas
  language: string;
}
```

`resolveCityQidV7` no puede devolver el primer resultado si se proporcionó país y ningún candidato coincide. Cambiar el algoritmo:

1. `wbsearchentities` obtiene hasta diez candidatos.
2. `wbgetentities` obtiene en lote sus labels, aliases y `P17`.
3. Se obtienen en lote los países referenciados y su `P297`.
4. Se conserva únicamente la entidad cuyo `P17.P297` coincide exactamente con `countryCode` y cuyo label o alias coincide con `cityName` normalizado.
5. Cero o más de una coincidencia devuelven `city_identity_review_required`; nunca elegir la primera silenciosamente.

Si una entidad de ciudad no declara `P17` directamente, seguir `P131` de forma acotada hasta tres niveles y resolver allí `P17`. No inferir el país a partir de una descripción libre si los claims estructurados no lo confirman.

### 5.3 Ruta y geometría

Conservar la implementación V8 existente como base, con estas correcciones de integración:

- Usar el resultado real del resolver editorial para `requiredCanonicalIds`.
- Validar que todos los QIDs requeridos existen entre los candidatos antes de seleccionar opcionales.
- Otro flagship no satisface un QID requerido.
- Si el número de requeridos supera el objetivo de paradas, conservar todos y dejar que geometría/duración devuelvan revisión.
- Para el objetivo normal de paradas, reutilizar `getDurationPlan(durationMinutes)`; no usar `Math.min(10, candidates.length)` para todos los tours.
- Calcular la geometría antes de investigar.
- Tras una sustitución opcional, recalcular ruta, orden, bloques, piernas, duración y vecinos.

El resultado público debe incluir:

```ts
interface PublicTourGeometryV8 {
  status: 'walkable' | 'route_review_required';
  reason: 'too_many_self_transfers' | 'guided_duration_infeasible' | null;
  blocks: Array<{ stopIds: string[] }>;
  legs: TourLegV8[];
  guidedDurationMinutes: number;
  externalTransferTimeIncluded: false;
  durationCopy: string;
  transferCount: number;
}
```

Para 120 minutos:

- `blocks.length <= 2`;
- `transferCount <= 1`;
- cada `self_transfer.durationSeconds === null`;
- ningún `self_transfer` incluye línea, vehículo, proveedor, navegación o tiempo estimado;
- el texto se genera exclusivamente con `selfTransferInstructionV8(nextStopName)`;
- la copia visible se genera exclusivamente con `guidedDurationCopyV8(guidedDurationMinutes)`.

### 5.4 Fuente capturada V8

Crear un contrato que añada identidad de fuente al contrato V7 sin romperlo:

```ts
type NarrativeSourceKindV8 =
  | 'official_web'
  | 'wikipedia_api'
  | 'wikidata_api'
  | 'other_web';

interface NarrativeCapturedSourceV8 extends NarrativeCapturedSourceV7 {
  sourceKind: NarrativeSourceKindV8;
  entityQid: string | null;
  publisherKey: string;
}
```

Reglas:

- Un dominio derivado de `P856` puede ser `primary_authority`.
- Wikipedia solo puede ser `established_source` cuando `pageprops.wikibase_item` coincide exactamente con el QID esperado.
- Wikidata se usa para identidad, labels, aliases, claims y revisión. No se captura su HTML.
- Todas las ediciones de Wikipedia y Wikidata comparten `publisherKey: 'wikimedia'`; no cuentan como dos publicaciones independientes.
- Una URL no registrada sigue siendo `discovery_only` aunque aparezca en SearXNG.
- Una redirección fuera del dominio registrado degrada la captura a `discovery_only`.
- Una página oficial cuyo título y contenido inicial no contienen el nombre, un label o un alias normalizado de la parada se degrada a `discovery_only`.
- Las fuentes `discovery_only` pueden explicar cómo se descubrió una URL, pero nunca respaldan una proposición del dossier.

Conservar tanto el dominio como la URL HTTPS exacta de cada claim `P856`. La URL exacta del lugar es una captura semilla; el dominio se usa para clasificación y `/map`. No reducir `P856` a un dominio con `url: null`.

La captura Wikipedia debe aceptar el QID esperado y usar una petición equivalente a:

```text
action=query
prop=extracts|pageprops|revisions
explaintext=1
exsectionformat=plain
rvprop=ids|timestamp
redirects=1
converttitles=1
titles=<título exacto del sitelink>
maxlag=5
format=json
formatversion=2
```

Usar el extracto de texto plano como contenido, `pageprops.wikibase_item` como identidad y `revisions[0]` como revisión. No entregar wikitext crudo al curador.

Para la coincidencia de entidad, normalizar con NFKD, minúsculas, eliminación de diacríticos y puntuación, y espacios colapsados. Comparar contra `stopName`, `registry.labels` y `registry.aliases`, no solo aliases.

### 5.5 Curador agregado y proposiciones

No conservar el contrato actual que solo devuelve un `propositionId`, un rol y spans por captura. Sustituirlo por:

```ts
type NarrativeRoleV8 =
  | 'visible_observation'
  | 'chronology_or_transformation'
  | 'human_agency_or_lived_function'
  | 'tension_or_contrast'
  | 'distinctive_trait';

interface NarrativeEvidenceSupportV8 {
  sourceId: string;
  evidenceSpanIds: string[]; // entre 1 y 3, contiguos y de la misma fuente
}

interface NarrativeCuratorPropositionV8 {
  text: string;
  role: NarrativeRoleV8;
  certainty: 'high' | 'medium' | 'low';
  interpretation: 'direct' | 'debatable';
  supports: NarrativeEvidenceSupportV8[];
}

interface NarrativeCuratorOutputV8 {
  propositions: NarrativeCuratorPropositionV8[];
  authorizedNames: string[];
  authorizedNumbers: string[];
  discrepancies: string[];
  limits: string[];
}
```

El LLM no asigna `propositionId`. El backend lo crea de forma determinista a partir de `role + texto normalizado`, evitando que la corroboración dependa de que dos llamadas inventen el mismo ID.

El curador recibe simultáneamente todas las capturas aceptables de la ronda. Cada proposición discutible contiene en una misma respuesta sus dos o más `supports`.

Para no desbordar el contexto, segmentar todo pero construir un packet de máximo 30.000 caracteres y 40 spans completos. Garantizar primero un span por fuente autorizada; ordenar el resto de forma determinista por coincidencia con nombre/aliases y vocabulario del rol, autoridad, URL e índice. No cortar el texto dentro de un span y registrar qué spans quedaron fuera del packet.

El backend valida, en este orden:

1. El rol pertenece al enum.
2. El texto no está vacío y respeta el límite de longitud.
3. Cada `sourceId` existe y no es `discovery_only`.
4. Cada span existe, pertenece a esa fuente, no está duplicado y la selección contiene de uno a tres spans contiguos.
5. La cita se reconstruye con `content.slice(start, end)`; el LLM nunca proporciona la cita literal.
6. Cada `authorizedName` y `authorizedNumber` aparece literalmente en una cita aceptada o procede de la identidad Wikidata confirmada.
7. Una proposición `direct` necesita al menos un soporte autorizado.
8. Una proposición `debatable` necesita al menos dos `publisherKey` distintos dentro de sus soportes.
9. `wikimedia` cuenta una sola vez aunque existan Wikipedia y Wikidata o varios idiomas.
10. IDs, fuentes, pasajes, nombres y números no contienen duplicados.

Cualquier violación invalida la respuesta completa de esa ronda con `curator_contract_failed`. No conservar parcialmente una respuesta malformada.

### 5.6 Dos gates de suficiencia, sin falsear V6

Mantener dos conceptos separados:

```ts
interface NarrativeEvidenceGatesV8 {
  minimumEvidenceReady: boolean;
  writerReady: boolean;
  missingMinimumRoles: string[];
  missingWriterRoles: NarrativeRoleV8[];
}
```

`minimumEvidenceReady` conserva el contrato original V8:

- identidad QID confirmada;
- `visible_observation`;
- `chronology_or_transformation`;
- al menos uno de `human_agency_or_lived_function`, `tension_or_contrast` o `distinctive_trait`.

`writerReady` es deliberadamente más estricto mientras se reutiliza el workflow V6:

- identidad confirmada;
- los cinco roles de `NarrativeDossierV6` cubiertos;
- al menos dos fuentes autorizadas;
- al menos dos publishers independientes;
- todas las proposiciones discutibles corroboradas por proposición.

El canary end-to-end solo continúa si cada dossier final tiene `writerReady: true`.

No construir a mano un objeto V6 con `isSufficient: true`. El adaptador debe:

1. Convertir los supports verificados en `passages` literales.
2. Derivar `sourceIds` y `passageIds` de esos supports.
3. Crear `NarrativeDossierProposalV6`.
4. Llamar a `buildNarrativeDossierV6(proposal, captures)` como validador final.
5. Comprobar que el dossier devuelto tiene `sufficiency.isSufficient === true`.

Así se reutilizan sin cambios el arquitecto, escritores, auditores, reparaciones y scorecard V6. La relajación futura de requisitos editoriales exige un workflow V8 propio y queda fuera de este P0.

## 6. Política única para MediaWiki y red externa

### 6.1 User-Agent

Eliminar el placeholder `https://github.com/example/...`. Centralizar un User-Agent real, por ejemplo:

```text
TourGuideApp/1.0 (https://github.com/jesusotero1234/tour-guide-app; contact: jesusoteo1234@gmail.com)
```

Permitir override mediante `NARRATIVE_HTTP_USER_AGENT`, pero nunca enviar un placeholder. Enviar también `Accept-Encoding: gzip`.

### 6.2 Retry permitido

Reintentar únicamente:

- timeout explícito de Axios: `ECONNABORTED`, `ETIMEDOUT` o `ESOCKETTIMEDOUT`;
- HTTP 429;
- HTTP 500–599;
- error MediaWiki `maxlag` dentro de una respuesta JSON, aunque el HTTP sea 200.

No reintentar:

- 400, 401, 403, 404 ni otros 4xx salvo 429;
- `ENOTFOUND`, `EAI_AGAIN`, `ENETUNREACH`;
- `ECONNREFUSED`;
- errores TLS o certificados;
- errores genéricos sin código ni status.

### 6.3 `Retry-After` y `maxlag`

Modificar `MediaWikiRequestPolicyV8` para recibir también headers:

```ts
interface MediaWikiHttpResponseV8<T> {
  data: T;
  status?: number;
  headers?: Record<string, string | number | string[] | undefined>;
}
```

Para `maxlag`:

- mantener `maxlag=5`; no subirlo para forzar respuestas;
- máximo seis intentos;
- máximo 180.000 ms de espera total;
- leer `Retry-After` en segundos o fecha HTTP;
- esperar `max(5.000 ms, Retry-After, lag reportado)`;
- si la espera requerida no cabe en el presupuesto restante, fallar sin hacer una espera parcial seguida de una petición prematura;
- nunca hacer busy loop aunque `lag` sea 0;
- emitir `maxlag_exhausted` con `attempts`, `totalWaitMs`, `lastLagSeconds` y `lastRetryAfterMs`.

Esto sigue la documentación oficial de [maxlag](https://www.mediawiki.org/wiki/Manual%3AMaxlag_parameter) y la [etiqueta de la API](https://www.mediawiki.org/wiki/API%3AEtiquette/en).

### 6.4 Integración obligatoria de la política

La misma política debe cubrir todos estos caminos:

- búsqueda de QID de ciudad;
- `wbgetentities` de candidatos;
- labels y aliases;
- revisiones;
- `P856`, `P131`, `P17` y `P297`;
- batches de Wikipedia del loader vivo;
- captura de Wikipedia para investigación.

No basta con integrarla en `LiveCityCandidatesV8`.

Usar batches de hasta 50 QIDs y una caché por run. Las ramas de `P131` mayores de 50 se procesan por chunks; no iterar el cursor completo después de haber descargado solo `slice(0, 50)`.

Serializar las peticiones MediaWiki por host mediante un coordinador compartido por run. El scheduler puede investigar dos paradas a la vez, pero no debe crear dos ráfagas independientes contra el mismo host.

## 7. Algoritmo exacto de investigación por parada

Implementar el algoritmo en un módulo reutilizable, no dentro del script CLI.

Entrada mínima:

```ts
interface NarrativeResearchStopInputV8 {
  runId: string;
  stopId: string;       // QID
  stopName: string;
  cityQid: string;
  countryCode: string;
  language: string;
  required: boolean;
}
```

Secuencia:

1. Resolver identidad exacta, labels, aliases, sitelink de Wikipedia y revisión Wikidata.
2. Resolver `P856` del lugar, ciudad y hasta tres niveles de `P131`.
3. Capturar por MediaWiki API la página Wikipedia derivada del sitelink exacto, si existe.
4. Generar, sin LLM, hasta cuatro consultas:
   - `"{nombre}" historia cronología`
   - `"{nombre}" arquitectura elementos visibles`
   - `"{nombre}" función uso transformación`
   - `"{nombre}" conflicto contraste rasgo distintivo`
5. Enviar a SearXNG el `language` y `countryCode` reales.
6. Ejecutar `/map` en un máximo de tres dominios oficiales, usando el nombre y aliases más específicos.
7. Unificar los resultados, normalizar URLs y deduplicar por URL final normalizada.
8. Priorizar para captura:
   - página Wikipedia con QID exacto;
   - páginas del `P856` del lugar;
   - páginas del dominio oficial de ciudad/ancestros cuya identidad coincide;
   - el resto queda como descubrimiento.
9. Intentar como máximo doce URLs únicas. Un 403 cuenta como intento y no se reintenta.
10. Segmentar capturas válidas en spans estables.
11. Ejecutar una sola curación agregada con todas las fuentes válidas de la ronda.
12. Construir y validar el dossier.
13. Si `writerReady`, detener inmediatamente toda búsqueda, mapping y captura de esa parada.
14. Si faltan roles y queda presupuesto, pedir al LLM hasta cuatro consultas adaptativas, pasando únicamente nombre, aliases, idioma, país, dominios oficiales, consultas ya usadas y roles faltantes.
15. Rechazar consultas vacías, duplicadas o de más de 500 caracteres.
16. Ejecutar las consultas adaptativas dentro del presupuesto de doce capturas total.
17. Curar de nuevo **todas** las capturas acumuladas; no mezclar parcialmente dos outputs.
18. Devolver `sufficient`, `evidence_review_required` o un fallo tipado.

La llamada adaptativa no ocurre si ya hay evidencia suficiente. Una búsqueda vacía no es un error por sí sola: activa `/map`, la captura Wikimedia y, si hacen falta, las consultas adaptativas.

## 8. Sustitución de paradas opcionales

Aplicar estas reglas literalmente:

- Una parada requerida nunca se sustituye por falta de evidencia; devuelve revisión con sus huecos.
- Para una parada opcional insuficiente, elegir como máximo una reserva no usada del mismo bloque.
- Retirar la reserva del pool antes de investigarla; no puede reutilizarse en otra posición.
- Registrar el intento aunque falle.
- Adoptar la reserva solo si `writerReady` es verdadero y la geometría recalculada sigue siendo válida.
- Si la reserva rompe la caminabilidad, no ocultar el problema: registrar `too_many_self_transfers` o `guided_duration_infeasible` según corresponda.
- Después de adoptar una reserva, reconstruir posiciones, `previousStopId`, `nextStopId`, bloques, piernas y duración.
- Calcular los flags globales únicamente a partir de las paradas finales. No arrastrar `captureBlocked`, `parseEmpty` o `curatorContractFailed` de una parada sustituida con éxito.
- Sí conservar los fallos de todos los intentos en diagnósticos históricos.

Al terminar, verificar:

```text
route.stopIds == geometry.stopIds == dossier.stopIds == arc.stopIds == script.stopIds
```

La igualdad es de conjunto y el orden de ruta, dossier y scripts también debe coincidir.

## 9. Canary end-to-end V8

### 9.1 Nuevo comando

Crear [`narrative-user-canary-v8.ts`](../../backend/scripts/validation/narrative-user-canary-v8.ts) y un script npm separado. No convertir el script V6 en V8 ni seguir modificándolo.

Argumentos:

```text
--generate
--allow-external
--profile=balanced_openrouter
--prior-spend-usd=<número>
--city=<nombre visible>
--country=<nombre visible>
--country-code=<ISO alpha-2>
--theme=<history|architecture|food|art>
--language=<código>
--duration=<minutos>
--run-id=<id único>
--route-artifact=<opcional>
--evidence-artifact=<opcional>
--core-artifact=<opcional>
```

No mantener mensajes de validación que digan “Barcelona” cuando la ciudad es dinámica.

### 9.2 Replays controlados

`--route-artifact` sirve para desacoplar la reparación de investigación de Overpass y Wikidata:

- aceptar inicialmente el `review.json` del run de Málaga;
- validar schema, request, QIDs, coordenadas y fingerprint;
- convertir los IDs internos a QID;
- recalcular geometría V8;
- marcar `routeSource: 'replay'` y `coreCoverageVerified: false` si el artefacto no contiene el core V8.

Un replay de ruta puede demostrar investigación + escritores, pero no constituye la validación live final de selección esencial.

`--evidence-artifact` permite repetir arquitecto/escritores/auditores sin volver a buscar ni capturar:

- validar fingerprints de ruta, fuentes y dossiers;
- rechazar evidencia de otra ruta, idioma o QID;
- no modificar el artefacto de entrada;
- registrar `evidenceSource: 'replay'`.

### 9.3 Preflight

Antes de gastar en LLM:

1. SearXNG responde JSON local.
2. Firecrawl `/map` y `/scrape` responden localmente.
3. La URL de Firecrawl es loopback, IP privada, nombre Docker de un label o dominio interno permitido; cualquier host público se rechaza, no solo `api.firecrawl.dev`.
4. MediaWiki responde a una consulta pequeña con el User-Agent real o devuelve un fallo tipado.
5. OpenRouter y el perfil solicitado están disponibles.
6. Las claves requeridas existen, pero nunca se imprimen.
7. El presupuesto acumulado sigue por debajo de 2 USD.

Si falla el preflight, escribir artefacto y no iniciar ruta ni LLM.

### 9.4 Estados y artefactos

Usar etapas explícitas:

```ts
type NarrativeUserCanaryStageV8 =
  | 'preflight'
  | 'candidate_loading'
  | 'city_identity'
  | 'core_selection'
  | 'route_selection'
  | 'geometry'
  | 'authority_resolution'
  | 'discovery'
  | 'capture'
  | 'curation'
  | 'dossier_boundary'
  | 'arc'
  | 'editorial_workflow'
  | 'scorecard'
  | 'artifact_write';
```

Conservar las razones V8 existentes y añadir únicamente las necesarias:

- `preflight_failed`
- `route_load_failed`
- `city_identity_review_required`
- `core_disagreement`
- `required_identity_missing`
- `too_many_self_transfers`
- `guided_duration_infeasible`
- `no_results`
- `maxlag_exhausted`
- `capture_blocked`
- `parse_empty`
- `authority_insufficient`
- `curator_contract_failed`
- `evidence_review_required`
- `editorial_protocol_failed`
- `deadline_exceeded`
- `spend_limit_exceeded`

El directorio será `backend/tmp/narrative-v8/<run-id>/` y contendrá siempre, incluso al fallar:

- `review.json`
- `diagnostics.private.json`
- `progress.private.jsonl`
- `spend.private.jsonl`
- `tour.md`

`review.json` debe incluir como mínimo:

```ts
{
  schemaVersion: 'narrative-user-canary-v8';
  runId: string;
  request: NarrativeLocationV8 & { theme: string; durationMinutes: number };
  status: 'approved' | 'request_changes' | 'blocked' | 'failed';
  completedStage: NarrativeUserCanaryStageV8 | null;
  failure: null | {
    stage: NarrativeUserCanaryStageV8;
    code: string;
    message: string;
    retryableLater: boolean;
  };
  core: { requiredIds: string[]; coverageRatio: number; disagreement: boolean };
  route: { stops: unknown[]; source: 'live' | 'replay' } | null;
  geometry: PublicTourGeometryV8 | null;
  research: Array<{
    stopId: string;
    status: string;
    minimumEvidenceReady: boolean;
    writerReady: boolean;
    missingRoles: string[];
    queryCount: number;
    mappedUrlCount: number;
    attemptedUrlCount: number;
    capturedSourceCount: number;
    publisherCount: number;
    substitutedFrom?: string;
  }>;
  editorial: null | {
    workflowStatus: string;
    scriptStopIds: string[];
    scorecardDecision: string | null;
  };
  budget: unknown;
}
```

`diagnostics.private.json` debe registrar por petición:

- fase y parada;
- proveedor;
- idioma y país;
- query;
- cantidad de resultados;
- URL solicitada y URL final;
- clase de fuente;
- autoridad antes y después de redirección/identity check;
- HTTP final;
- clasificación del error;
- número de intento y espera;
- cache hit;
- revisión Wikimedia;
- huecos antes y después de cada ronda;
- sustituciones;
- cobertura del core;
- número de self-transfers;
- diagnósticos de LLM y coste, con secretos redactados.

### 9.5 Render de `tour.md`

En éxito operativo, `tour.md` debe mostrar:

1. Estado editorial.
2. Ciudad, tema, idioma y duración solicitada.
3. `≈{guidedDurationMinutes} min de experiencia guiada + traslado libre` cuando aplique.
4. Lista ordenada de paradas.
5. Guion completo de cada parada.
6. El texto fijo de `self_transfer` entre los dos bloques, si existe.
7. Fuentes resumidas por parada.
8. Resultado del scorecard y cuestiones abiertas.
9. Nota de que no se ejecutaron TTS ni persistencia.

El LLM no redacta el traslado. El renderer lo inserta a partir de la pierna V8.

## 10. Mapa de cambios por archivo

### Archivos nuevos

- `backend/src/services/poi/NarrativeResearchV8.ts`
  - orquestación reutilizable por parada y por ruta;
  - presupuesto, parada temprana, rondas determinista/adaptativa;
  - resultado aislado por parada.
- `backend/src/services/poi/NarrativeDossierV8.ts`
  - contratos de curator V8;
  - validación agregada de supports;
  - generación determinista de IDs;
  - gates `minimumEvidenceReady` y `writerReady`;
  - adaptador validado a `NarrativeDossierV6`.
- `backend/src/services/poi/NarrativeResearchV8.test.ts`
- `backend/src/services/poi/NarrativeDossierV8.test.ts`
- `backend/scripts/validation/narrative-user-canary-v8.ts`
- `backend/scripts/validation/narrative-user-canary-v8.test.ts` o un test del orquestador puro extraído del script.

### Archivos que se pueden modificar

- `MediaWikiRequestPolicyV8.ts` y su test.
- `LiveCityCandidatesV8.ts` y su test.
- `NarrativeAuthoritiesV7.ts` y su test.
- `NarrativeSourcesV7.ts` y su test.
- `NarrativeSpansV7.ts` y su test, solo si el nuevo builder encuentra un defecto reproducible.
- `NarrativeCanaryV8.ts` y su test para delegar investigación al módulo V8 y corregir estados finales.
- `NarrativeRunStateV8.ts` y su test.
- `EssentialRouteSelectionV8.ts` y su test para hacer obligatorio/validar QID.
- `TourGeometryV8.ts` y su test solo para integración o un defecto reproducible.
- `backend/package.json` para añadir el comando.
- `docs/working/62-seleccion-esencial-busqueda-v8-qa.md` al finalizar, con evidencia real.

### Archivos congelados para este P0

- `NarrativeResearchV6.ts`
- `NarrativeSourcesV6.ts`
- `NarrativeDossierV6.ts`
- `NarrativeEditorialWorkflowV6.ts`
- `NarrativeEditorialAgentsV6.ts`
- `NarrativeArcArchitectV6.ts`
- `narrative-user-canary-v6.ts`
- artefactos V6 existentes

Se permite importar y llamar a los builders/agentes V6; no se permite cambiar sus gates para hacer pasar V8.

## 11. Orden de implementación obligatorio

No implementar todas las fases y probar al final. Cada fase se cierra con tests antes de pasar a la siguiente.

### Fase 0 — Baseline y reproducción congelada

Cambios: ninguno.

Tareas:

1. Copiar al QA los paths y métricas del run de Málaga.
2. Documentar mediante referencias de código que el script V6 invoca el stack V6; no añadir lógica ni tests nuevos al script congelado.
3. Guardar el fingerprint de la ruta de Málaga para el replay.
4. Registrar el estado actual de `tsc`, tests V7/V8 y suite completa.
5. No crear ni limpiar worktrees que compartan o borren `backend/node_modules`.

Gate: la reproducción identifica `research_failed` antes de escritores y los artefactos originales no cambian.

### Fase 1 — Política externa correcta

Tareas:

1. Ampliar el contrato de respuesta para headers.
2. Corregir clasificación de errores sin status.
3. Implementar `Retry-After` en formato segundos y fecha.
4. Corregir espera mínima de maxlag.
5. Centralizar User-Agent.
6. Integrar la política en todos los call sites Wikimedia.

Gate: todos los tests de retry de la sección 12 pasan con reloj/espera falsos; ningún test duerme realmente.

### Fase 2 — Identidad y autoridades

Tareas:

1. Resolver ciudad con `P17/P297` y fail closed.
2. Resolver QID faltante desde Wikipedia `pageprops`.
3. Hacer obligatorio el QID en candidatos V8.
4. Batch de entidades/revisiones y caché por run.
5. Procesar todos los chunks de `P131` hasta tres niveles.
6. Usar labels + aliases en coincidencia.
7. Clasificar Wikipedia exacta como `established_source`, publisher `wikimedia`.

Gate: no existe ningún fallback al primer resultado ni ningún `canonicalId as wikidataId`.

### Fase 3 — Dossier V8 aislado

Tareas:

1. Implementar contratos de curator agregado.
2. Validar supports y reconstruir citas.
3. Generar IDs deterministas.
4. Validar nombres/números.
5. Aplicar corroboración por proposición.
6. Calcular ambos gates.
7. Convertir a propuesta V6 y llamar a `buildNarrativeDossierV6`.

Gate: un dossier construido por V8 entra en los agentes V6 sin `as unknown as`, sin mutar `sufficiency` y sin citas copiadas por el LLM.

### Fase 4 — Investigación V8 reutilizable

Tareas:

1. Extraer la investigación que hoy está dentro de `NarrativeCanaryV8`.
2. Capturar Wikimedia primero por API.
3. Ejecutar consultas deterministas, `/map` y capturas con presupuesto.
4. Curar agregado.
5. Ejecutar adaptación solo si faltan roles.
6. Detenerse en `writerReady` para el modo end-to-end.
7. Devolver métricas y fallos tipados.

Gate: el escenario unitario equivalente a Málaga produce fuentes API aunque SearXNG devuelva cero resultados y Firecrawl simule 403 para Wikimedia HTML.

### Fase 5 — Ruta final y sustituciones

Tareas:

1. Integrar núcleo, selección y geometría.
2. Investigar requeridas sin sustitución.
3. Investigar opcionales y una reserva cuando corresponda.
4. Recalcular geometría y todos los IDs después de reemplazar.
5. Calcular razones desde el estado final, no desde intentos descartados.

Gate: no hay divergencia entre ruta, geometría y dossiers.

### Fase 6 — Vertical slice con replay de Málaga

Tareas:

1. Crear el nuevo script V8.
2. Cargar la ruta existente con `--route-artifact`.
3. Investigar con V8.
4. Construir dossiers V6 válidos.
5. Ejecutar arquitecto, escritores y auditores existentes.
6. Renderizar el tour completo.

Gate: con proveedores simulados en test, ocho entradas de ruta producen ocho dossiers, ocho guiones y un `tour.md` completo. En vivo, esta fase puede fallar por evidencia real, pero nunca por volver a usar planner V6 o scraping HTML Wikimedia.

### Fase 7 — Canary live desde cero

Tareas:

1. Cargar candidatos vivos.
2. Resolver ciudad y núcleo.
3. Ejecutar selección esencial y geometría.
4. Ejecutar investigación y editorial.
5. Escribir artefactos en éxito o fallo.

Gate: el comando sin replay llega hasta guiones o devuelve un bloqueo externo específico y acotado. No puede devolver un falso `ready_for_human_gate` sin scripts.

### Fase 8 — QA y cierre

Tareas:

1. Ejecutar matriz completa de tests.
2. Ejecutar smokes locales.
3. Ejecutar los canaries autorizados en la sección 13.
4. Revisar diffs para hardcodes de ciudad y URLs cloud.
5. Actualizar QA con comandos, resultados, costes y paths.
6. Solicitar revisión por otro LLM con respuesta `Approve` o `Request changes`.

Gate: toda afirmación de completitud tiene una evidencia enlazada.

## 12. Matriz de pruebas obligatoria

### 12.1 Ruta e identidad

- Un QID requerido alejado permanece ante un flagship céntrico.
- Un flagship no satisface un QID requerido distinto.
- El contador legacy cuenta flagships reales.
- Un candidato `osm:*` no se presenta como QID.
- Wikipedia `pageprops.wikibase_item` puede resolver un QID faltante.
- Un mismatch de QID en Wikipedia degrada la fuente y no confirma identidad.
- Ciudad y país correctos seleccionan el QID correcto.
- País sin coincidencia devuelve `city_identity_review_required`.
- Ambigüedad de ciudad devuelve revisión, no el primer resultado.

### 12.2 Geometría

- 120 minutos permiten como máximo dos bloques y un `self_transfer`.
- `self_transfer.durationSeconds` es `null`.
- El JSON y Markdown no contienen modo de transporte ni tiempo de traslado.
- `externalTransferTimeIncluded` es siempre `false`.
- Más de un traslado devuelve revisión y conserva requeridas.
- Sustituir una opcional recalcula geometría y vecinos.
- Una sustitución que rompe geometría no se adopta como éxito.

### 12.3 Retry y MediaWiki

- 429 se reintenta y respeta `Retry-After` numérico.
- 429 respeta una fecha HTTP válida.
- 500, 502, 503 y 504 se reintentan.
- Timeout explícito se reintenta.
- 403 y 404 no se reintentan.
- `ENOTFOUND`, `EAI_AGAIN`, `ECONNREFUSED`, TLS y error genérico no se reintentan.
- `maxlag` HTTP 200 espera al menos cinco segundos con wait falso.
- `Retry-After` mayor que `lag` prevalece.
- `lag: 0` no produce busy loop.
- Agotar seis intentos devuelve todos los campos diagnósticos.
- Todas las clases que llaman Wikimedia usan la política compartida.
- 51 ancestros se procesan en dos batches; ninguno desaparece.

### 12.4 Proveedores y autoridad

- SearXNG recibe `language` y `countryCode` reales.
- Una búsqueda vacía activa los siguientes pasos.
- Evidencia suficiente detiene nuevas búsquedas/capturas.
- Firecrawl Cloud y cualquier base URL pública se rechazan antes de una petición.
- `/map` valida SSRF y solo acepta el origen oficial esperado.
- Una redirección fuera del dominio registrado se degrada.
- Una página oficial sin match de identidad se degrada.
- Labels también sirven para match, no solo aliases.
- Wikipedia funciona aunque su HTML simule 403, porque la API responde.
- Wikipedia y Wikidata no cuentan como publishers independientes.

### 12.5 Spans, curator y dossier

- Un span literal válido se acepta.
- Span inventado, duplicado, no contiguo o de otra fuente se rechaza.
- La cita reconstruida es substring exacto del contenido.
- El curator recibe múltiples capturas en la misma llamada.
- Una proposición directa con una fuente autorizada se acepta.
- Una proposición debatible con un publisher se rechaza.
- La misma proposición debatible con dos publishers se acepta y conserva ambas citas.
- La corroboración no depende de flags diferentes entre llamadas.
- Un nombre o número no presente en evidencia se rechaza.
- `parse_empty` no llama al curator.
- Error del curator es `curator_contract_failed`, no `capture_blocked`.
- `buildNarrativeDossierV6` es quien confirma el dossier final.

### 12.6 Sustituciones y estado final

- Una requerida insuficiente bloquea y nunca se sustituye.
- Una opcional insuficiente prueba una reserva una sola vez.
- La reserva se retira antes de investigarla.
- Reserva válida reemplaza ruta, stop, dossier y geometría.
- Los fallos de la parada descartada quedan solo en diagnósticos.
- Los flags públicos proceden de la parada final.
- Ruta vacía devuelve `no_results` y nunca `ready_for_human_gate`.

### 12.7 End-to-end sin red

Con fakes deterministas:

- ruta de dos bloques;
- una captura Wikipedia API y una oficial por parada;
- cinco roles por parada;
- dos publishers;
- arquitecto válido;
- escritores válidos;
- auditores sin objeciones;
- scorecard `Approve`.

Verificar que:

- scripts count = stops count;
- cada parada aparece una vez;
- el traslado fijo aparece exactamente una vez;
- no se llama a Firecrawl con dominios Wikimedia;
- no se llama al escritor antes de completar todos los dossiers;
- `review.json`, diagnósticos y Markdown se escriben;
- un fallo inyectado en cada fase también produce los tres artefactos principales.

### 12.8 Regresión

Ejecutar:

```bash
cd backend
npx tsc --noEmit
npx jest \
  src/services/poi/MediaWikiRequestPolicyV8.test.ts \
  src/services/poi/LiveCityCandidatesV8.test.ts \
  src/services/poi/NarrativeAuthoritiesV7.test.ts \
  src/services/poi/NarrativeSourcesV7.test.ts \
  src/services/poi/NarrativeSpansV7.test.ts \
  src/services/poi/NarrativeDossierV8.test.ts \
  src/services/poi/NarrativeResearchV8.test.ts \
  src/services/poi/NarrativeCanaryV8.test.ts \
  src/services/poi/EssentialRouteSelectionV8.test.ts \
  src/services/poi/TourGeometryV8.test.ts \
  --runInBand
npm test -- --runInBand
```

Si `NarrativeSourcesV7.test.ts` falla por el binario Prisma de Windows dentro de WSL, regenerar Prisma para el entorno actual de forma explícita y documentarlo. No clasificar automáticamente ese fallo como “preexistente”.

Comparar la suite completa con un baseline registrado antes de esta implementación. No afirmar “sin regresiones” solo porque las suites fallidas no importan directamente los archivos modificados.

## 13. Experimento vivo, en orden y con límite

### Experimento A — Smoke local

Ejecutar una vez:

- SearXNG JSON.
- Firecrawl `/map`.
- Firecrawl HTML.
- Firecrawl PDF.
- SSRF bloqueado.
- Wikimedia API con QID exacto.
- Verificación de que no hay petición a Firecrawl Cloud.

Si falla, corregir el proveedor; no lanzar el tour.

### Experimento B — Málaga con ruta congelada

Usar el `review.json` ya generado como `--route-artifact`. Objetivo: probar desde investigación hasta `tour.md` sin repetir Overpass ni selección.

Criterios:

- cero consultas `site:madrid.es`, `site:esmadrid.com` o `site:memoriademadrid.es` salvo que el monumento esté realmente en Madrid, lo que no aplica a este run;
- cero `/scrape` para `wikipedia.org` o `wikidata.org`;
- ocho resultados de investigación finales o una razón específica por parada;
- si los ocho son `writerReady`, se ejecutan arquitecto y escritores;
- ocho guiones en el artefacto;
- `tour.md` deja de ser una mera lista de paradas.

Este experimento prueba el bloqueo P0, pero no valida la selección esencial V8 live.

### Experimento C — Málaga live completo

Ejecutar una sola vez sin `--route-artifact` cuando A y B hayan pasado.

Criterios:

- candidatos con QID real;
- core resuelto sin desacuerdo;
- requeridas cubiertas;
- geometría válida;
- dossiers `writerReady` para la ruta final;
- guion por parada;
- estado operativo `approved` o `request_changes`;
- coste acumulado menor de 2 USD;
- ningún secreto en artefactos.

Si Wikidata devuelve `maxlag_exhausted`, el run queda `blocked`, con `retryableLater: true`. No relanzar automáticamente. Ese resultado prueba el manejo acotado del fallo externo, no el éxito end-to-end.

### Experimento D — Generalización

Solo después de Málaga:

- tres ciudades sin snapshots de paradas concretas;
- una ejecución final de Barcelona;
- assertions genéricas de identidad, core, geometría, evidencia y scripts;
- en Barcelona, inspección manual de que Sagrada Família aparece si el resolver editorial la marca requerida;
- si el resolver no la marca requerida, `core_disagreement`/revisión para QA; nunca hardcode.

No declarar soporte end-to-end multilingüe mientras el prompt de escritor siga fijado a español de España. Este P0 valida `language=es`; una generalización a otros idiomas requiere versionar el prompt y añadir canaries específicos.

## 14. Condiciones de parada para DeepSeek

DeepSeek debe detenerse y reportar, sin improvisar una solución distinta, si ocurre cualquiera de estos casos:

- necesita modificar los gates V6 para que el adaptador pase;
- considera añadir un dominio o QID específico de Málaga/Barcelona;
- no puede confirmar el QID de una parada;
- la ruta requiere más de un traslado libre;
- una requerida carece de evidencia suficiente;
- el presupuesto vivo se agotó;
- el deadline se agotó;
- MediaWiki agotó maxlag;
- una dependencia solo funciona mediante Firecrawl Cloud;
- un cambio pisa modificaciones ajenas del worktree.

En esos casos debe entregar: fase, código, evidencia, diff realizado, tests ejecutados y corrección mínima propuesta. No debe declarar “plan aplicado por completo”.

## 15. Definition of Done

El P0 solo está terminado cuando se cumplen todos estos puntos:

- [ ] Existe un módulo de investigación V8 reutilizable fuera del CLI.
- [ ] Existe un dossier V8 con proposiciones textuales y supports verificables.
- [ ] Las citas se reconstruyen en backend.
- [ ] La corroboración se valida por proposición y publisher.
- [ ] Wikipedia/Wikidata usan API, nunca Firecrawl.
- [ ] MediaWiki retry/maxlag está integrado en todos los call sites V7/V8.
- [ ] No quedan placeholders de User-Agent en los archivos tocados.
- [ ] Ciudad y país se resuelven fail closed.
- [ ] Todos los candidatos de ruta V8 tienen QID real.
- [ ] Las requeridas sobreviven a ranking, geometría y sustituciones.
- [ ] El resultado final incluye piernas, duración guiada y transferencia externa excluida.
- [ ] El adaptador llama a `buildNarrativeDossierV6`; no falsea suficiencia.
- [ ] Ningún escritor se ejecuta antes de pasar ruta y evidencia.
- [ ] Un test end-to-end sin red produce todos los guiones.
- [ ] El replay de Málaga llega al flujo editorial o identifica una falta real de evidencia, nunca el planner Madrid-only/403 Wikimedia.
- [ ] El canary live de Málaga produce guiones o un bloqueo externo específico y acotado.
- [ ] `tsc` y tests focalizados pasan.
- [ ] La suite completa se compara con baseline y cualquier diferencia se explica.
- [ ] Los smokes locales pasan y no hay tráfico a Firecrawl Cloud.
- [ ] V6 y sus artefactos permanecen inmutables.
- [ ] El QA contiene comandos, conteos, costes, artefactos y diffs reales.
- [ ] Otro LLM devuelve `Approve` o `Request changes` con evidencia concreta.

## 16. Formato de entrega requerido al implementador

Al terminar cada fase, responder con:

```text
Fase:
Archivos modificados:
Comportamiento implementado:
Tests nuevos:
Comandos ejecutados:
Resultado exacto:
Riesgos o pendientes:
Próxima fase:
```

La entrega final debe incluir además:

- `git diff --stat`;
- lista de archivos nuevos/modificados;
- resultado de `tsc`;
- resultado de tests focalizados y suite completa;
- resultado de smoke;
- paths de todos los canaries;
- número de paradas, dossiers y guiones;
- gasto total;
- confirmación explícita de cero lógica específica de ciudad;
- confirmación explícita de cero llamadas a Firecrawl Cloud;
- confirmación explícita de que el tiempo de traslado no forma parte de `guidedDurationMinutes`.

No hacer commit, merge, push ni activar producción salvo autorización separada del usuario.
