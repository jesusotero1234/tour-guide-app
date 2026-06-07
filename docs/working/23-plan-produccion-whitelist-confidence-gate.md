# 23 — Plan: producción segura con confidence gate progresivo

> **Propósito.** Documento ejecutable para pasar de un pipeline que genera tours
> “best effort” a un sistema de producción que solo entrega tours cuando puede
> defender su calidad.
>
> Meta de producto: un usuario puede pedir cualquier ciudad, pero el sistema debe
> hacer una de dos cosas:
>
> - entregar un tour bueno
> - no entregar el tour si la confianza es insuficiente
>
> Este plan continúa el trabajo de:
>
> - `docs/working/21-handoff-fixtures-y-defectos.md`
> - `docs/working/22-plan-calidad-tematica-fixtures-performance.md`
>
> Estado de entrada esperado:
>
> - `npx jest --runInBand` verde en `backend/`
> - aceptación activa para `Madrid`, `Berlin`, `Paris`, `Roma`, `Amsterdam`,
>   `Barcelona`, `Toulouse`, `Toledo`, `Valencia`, `Malaga`
> - `London` todavía skip
> - cache persistente de enrichment ya implementado
> - fixes de `P31` y filtros temáticos ya aplicados
>
> Decisiones del usuario ya tomadas para este plan:
>
> - No bloquear ciudades no verificadas desde el principio.
> - Primero correr el confidence gate en shadow mode.
> - No mostrar lista de ciudades disponibles en el rechazo.
> - Cuando el gate esté calibrado, la regla final debe ser: si no hay confianza,
>   no se entrega tour.
> - El gate debe poder decidir **antes** de imágenes, DB, audio y otros costes
>   tardíos evitables cuando el modo sea `enforce`.
> - La identidad de ciudad no debe depender solo del nombre textual; debe poder
>   desambiguarse con `countryCode` y, cuando exista, con identidad geocodificada
>   estable.
>
> Mantener este documento en español, tono honesto/crítico. No hardcodear landmarks
> en `src/`.

---

## 1. Contexto

La app no puede salir a producción confiando ciegamente en cualquier ciudad.

Si un usuario pone `Berlin`, `Paris` o `Madrid`, hoy tenemos más confianza porque
hay fixtures, anchors y aceptación verde.

Pero si un usuario pone una ciudad nueva, por ejemplo `Naples`, `Granada`,
`Bruges`, `Lima`, `Kyoto` o `Castellon de la Plana`, el pipeline puede:

- generar algo bueno
- generar algo mediocre
- generar basura temática
- generar una ruta técnicamente válida pero pobre como producto

La visión correcta no es “soportamos todo siempre”.

La visión correcta es:

> Podemos intentar cualquier ciudad, pero solo publicamos el tour si el sistema
> puede defender su calidad.

---

## 2. Decisión de producto

### 2.1 Decisión principal

Implementar un sistema de admisión progresiva:

1. **Verified cities** como baseline de confianza.
2. **Confidence gate en shadow mode** para toda ciudad no verificada.
3. **Review queue** para aprender de solicitudes reales.
4. **Confidence gate obligatorio** cuando esté calibrado.
5. **Promoción progresiva** de ciudades auto-aprobadas a verified.

### 2.2 Qué NO hacer

- No abrir todas las ciudades con un disclaimer tipo “experimental” para justificar
  tours malos.
- No implementar un gate de 4 etapas con señales no instrumentadas desde el día uno.
- No permitir que el rechazo ocurra después de pagar imágenes, DB y audio.

Razón:

- Un usuario no piensa “era experimental”. Piensa “el producto es malo”.
- Un gate demasiado complejo sin datos reales se sobreajusta y complica más de lo
  que protege.

### 2.3 Qué SÍ hacer

Al inicio:

- ciudades verificadas salen normal
- ciudades no verificadas pueden correr, pero quedan marcadas internamente
- el confidence gate se calcula en shadow mode
- el sistema registra señales y razones

A mediano plazo:

- ciudades verificadas salen directo
- ciudades no verificadas pasan por confidence gate
- si pasan, se entrega el tour
- si fallan, no se entrega el tour

---

## 3. Definiciones

### 3.1 Verified city

Ciudad con:

- fixture de pool
- fixture de candidates
- anchors positivos curados
- aceptación verde
- sin defectos conocidos abiertos para ese theme

La llave operativa no debe ser solo `city + theme` si eso permite colisiones.

Base mínima aceptable:

- `canonicalCity + countryCode + theme`

Mejor aún, cuando ya se tenga identidad estable del geocoder:

- `wikidataId + theme`
- o `osmType/osmId + theme`

Ejemplos actuales para `history`:

- Madrid
- Berlin
- Paris
- Roma
- Amsterdam
- Barcelona
- Toulouse
- Toledo
- Valencia
- Malaga

### 3.2 Unverified city

Ciudad solicitada por un usuario que no está en la lista verified para esa
identidad geográfica y ese theme.

Importante:

- `Berlin/history` puede estar verificada.
- `Berlin/architecture` no queda automáticamente verificada.
- `Toledo, ES/history` no implica `Toledo, US/history`.
- La verificación no debe depender solo del nombre visible de la ciudad.

### 3.3 Shadow-evaluated city

Ciudad no verificada para la que se ejecutó el confidence gate, pero sin bloquear
todavía el resultado.

Metadata sugerida:

```json
{
  "qualityStatus": "shadow_evaluated",
  "confidence": {
    "passed": false,
    "stage": "output",
    "score": 0.58,
    "reasons": ["category_collapse"]
  }
}
```

### 3.4 Auto-approved city

Ciudad no verificada manualmente que pasó el confidence gate estructural cuando
el gate ya está activo.

### 3.5 Rejected city

Ciudad que no pasó el confidence gate cuando el gate ya está activo.

No se entrega tour.

Respuesta sugerida:

```json
{
  "error": {
    "code": "CITY_QUALITY_NOT_AVAILABLE",
    "message": "Todavía no podemos generar un tour de calidad suficiente para esta ciudad.",
    "details": {
      "city": "Example City",
      "theme": "history",
      "reasons": ["insufficient_raw_pool"]
    }
  }
}
```

No incluir lista de ciudades disponibles en esta respuesta.

### 3.6 Review queue

Registro interno de ciudades pedidas que:

- fallaron el gate
- pasaron borderline
- pasaron pero no son verified
- fueron pedidas varias veces

Objetivo:

- saber qué ciudades priorizar
- detectar patrones de fallo
- decidir qué fixtures capturar después

---

## 4. Arquitectura propuesta

### 4.1 Capas

La solución debe tener estas capas:

1. **Verified city registry**
2. **Confidence gate**
3. **Shadow logging**
4. **Structured refusal**
5. **Review queue**
6. **Promotion workflow**

### 4.2 Flujo inicial recomendado

Primera versión, sin bloquear desde el principio:

```text
User request
  ↓
Normalize/geocode city
  ↓
Is verified city/theme?
  ↓ yes
Generate tour normally
Attach qualityStatus=verified
  ↓ no
Generate tour normally for now
Compute confidence gate in shadow mode
Attach/log qualityStatus=shadow_evaluated
Persist review queue event
Return tour while gate is non-blocking
```

### 4.3 Flujo final deseado

Cuando el gate esté calibrado:

```text
User request
  ↓
Normalize/geocode city
  ↓
Is verified city/theme?
  ↓ yes
Generate tour normally
Attach qualityStatus=verified
  ↓ no
Run structural pipeline
Compute confidence gate
  ↓ pass
Generate narration/images and finish pipeline
Return tour with qualityStatus=auto_approved
  ↓ fail
Return structured refusal
Persist review queue event
```

### 4.4 Regla estructural de coste

Cuando el modo sea `enforce`, el gate debe poder decidir **antes** de:

- `buildNarration(...)`
- `fetchImagesForPlaces(...)`
- `tourRepository.save(...)`
- `generateAudio(...)`

Si no, el rechazo llega demasiado tarde y quema coste inútil.

Nota crítica del estado actual:

- hoy `generatePlacesFromOsm(...)` ya hace enrich + ranking + route + narración
  antes de devolver
- por eso, mover el gate solo dentro de `generateCompleteTour(...)` no resuelve el
  problema de coste
- hace falta separar el pipeline en un tramo estructural evaluable por el gate y
  otro tramo de presentación/finalización

---

## 5. Fase 0 — Refactor para rechazo temprano

### Objetivo

Preparar `generateCompleteTour(...)` para que, cuando el gate pase a `enforce`, pueda
rechazar antes de la cola cara del pipeline.

Pero el seam real no debe quedar solo antes de imágenes/DB/audio.

Debe quedar también antes de narración, porque hoy esa parte ya consume coste y
latencia.

### Archivos a revisar

- `backend/src/services/orchestrationService.ts`
- `backend/src/types/api.ts`

### Punto exacto del cambio

Hoy el flujo aproximado es:

```text
generatePlacesFromOsm
  -> buildNarration
  -> fetchImagesForPlaces
  -> save tour
  -> generateAudio
```

Debe poder quedar así:

```text
generateStructuralTourData
  -> computeTourConfidence
  -> if enforce && unverified && !passed: reject here
  -> buildNarration
  -> fetchImagesForPlaces
  -> save tour
  -> generateAudio
```

### Resultado esperado

- shadow mode no cambia comportamiento
- enforce puede rechazar antes de narración/imágenes/DB/audio

### Validación

- ningún test actual debe romperse
- no debe cambiar la respuesta de ciudades verified mientras `mode=shadow`
- debe existir un seam testeable donde un gate futuro pueda cortar antes de
  narración/imágenes/DB/audio

---

## 6. Fase 1 — Verified city registry sin bloqueo inicial

### Objetivo

Crear una fuente única de ciudades verificadas sin bloquear todavía ciudades no verificadas.

### Archivo nuevo sugerido

`backend/src/services/tourQuality/VerifiedCities.ts`

### Reglas

- La verificación debe ser por identidad geográfica + `theme`.
- Como mínimo usar `canonicalCity + countryCode + theme`.
- No basta con ciudad.
- Usar aliases para normalización básica.
- Esta lista debe ser **fuente única de verdad**. Tests y otros módulos no deben
  mantener una lista paralela distinta.

### Funciones sugeridas

```ts
export function normalizeCityName(city: string): string
export function isVerifiedCityTheme(city: string, countryCode: string, theme: string): boolean
export function getCanonicalVerifiedCity(city: string, countryCode: string, theme: string): string | null
```

### Integración inicial

No rechazar todavía.

Solo añadir metadata:

```json
{ "qualityStatus": "verified" }
```

o:

```json
{ "qualityStatus": "unverified" }
```

### Persistencia recomendada

- Guardar `qualityStatus` y luego `confidence` dentro de `Tour.metadata`.
- Exponer ambos también en `TourResponse` como campos opcionales.
- No abrir una migración de schema nueva solo para esto mientras `metadata` ya existe.

Pero esto requiere cambios reales en backend, porque hoy `metadata` existe en Prisma
pero no está modelada ni mapeada de forma útil en `Tour`, `PostgresTourRepository`,
`retrieveTour(...)` y `listTours(...)`.

### Tests obligatorios

- `Madrid/ES/history` es verified
- `Madrid/ES/architecture` no es verified si no está en la lista
- `Rome/IT/history` resuelve a `Roma/IT/history`
- `Málaga/ES/history` resuelve a `Malaga/ES/history`
- `Toledo/ES/history` y `Toledo/US/history` no colisionan
- ciudad desconocida no es verified
- casing distinto no rompe normalización

---

## 7. Fase 2a — Calibración obligatoria

### Objetivo

Antes de fijar thresholds, medir señales reales sobre las ciudades ya protegidas.

### Archivo nuevo sugerido

`backend/scripts/validation/calibrate-confidence-gate.ts`

### Qué debe hacer

- cargar fixtures ya activos
- calcular señales candidatas del gate por ciudad
- imprimir distribución de valores
- mostrar pass/fail provisional por threshold

Y además distinguir:

- qué señales ya existen de forma confiable
- qué señales todavía requieren instrumentación nueva

### Ciudades mínimas a usar

- Madrid
- Berlin
- Paris
- Roma
- Amsterdam
- Barcelona
- Toulouse
- Toledo
- Valencia
- Malaga

### Objetivo real

- no inventar thresholds “bonitos”
- saber qué señales discriminan de verdad
- detectar señales irrelevantes antes de construir gate complejo

---

## 8. Fase 2b — Confidence gate puro (versión mínima)

### Objetivo

Implementar una función pura que pueda evaluar calidad sin depender de HTTP,
base de datos ni frontend.

### Principio rector

- Primera versión: **2 etapas**, no 4.
- Reutilizar señales y thresholds ya probados por `TourQuality.acceptance.test.ts`.
- Diferir señales nuevas hasta tener datos de shadow mode.
- No prometer señales que hoy todavía no emite el pipeline sin añadir antes la
  instrumentación correspondiente.

### Archivo sugerido

`backend/src/services/tourQuality/TourConfidenceGate.ts`

### Output sugerido

```ts
export interface TourConfidenceResult {
  passed: boolean;
  stage: 'input' | 'output';
  score: number;
  reasons: string[];
  signals: Record<string, number | string | boolean | null>;
}
```

### Razones estándar

```ts
'insufficient_raw_pool'
'low_wikidata_coverage'
'weak_absolute_landmark_signal'
'excessive_theme_rejections'
'no_strong_flagships'
'duplicate_landmarks'
'category_collapse'
'route_degraded'
'coverage_ratio_too_low'
'coverage_ratio_too_high'
'insufficient_spatial_spread'
'off_theme_entity_leaked'
```

### Gate 1 — Input adequacy

Señales:

- `rawPoolSize`
- `postThemeFilterPoolSize`
- `wikidataTaggedCount`
- `sitelinksResolvedRatio`
- `maxSitelinks`
- `maxFameScore`
- `p31RejectedCount`
- `p31RejectedRatio`

Nota:

- `p31RejectedCount` y `p31RejectedRatio` no salen hoy de una API explícita del
  pipeline; si se quieren usar en v1, primero hay que instrumentar el descarte
  temático en `LandmarkTiering` para emitir esos conteos.

Thresholds iniciales sugeridos:

```ts
rawPoolSize >= 30
postThemeFilterPoolSize >= 20
wikidataTaggedCount >= 10
sitelinksResolvedRatio >= 0.65
maxSitelinks >= 5
maxFameScore >= 12
p31RejectedRatio <= 0.35
```

### Gate 2 — Output adequacy

Señales:

- `shortlistSize`
- `flagshipCount`
- `majorCount`
- `absoluteStrongCandidateCount`
- `duplicateWikidataCount`
- `maxCategoryShare`
- `negativeLeakCount`
- `degraded`
- `coverageRatio`
- `stopCount`
- `routeDuplicateWikidataCount`
- `routeMaxCategoryShare`
- `routeFlagshipCount`

Thresholds iniciales sugeridos:

```ts
shortlistSize >= 20
flagshipCount >= 2
majorCount >= 5
absoluteStrongCandidateCount >= 3
duplicateWikidataCount === 0
maxCategoryShare <= 0.7
negativeLeakCount === 0
degraded === false
coverageRatio >= 0.7
coverageRatio <= 1.2
stopCount >= minStops
routeDuplicateWikidataCount === 0
routeMaxCategoryShare <= 0.7
routeFlagshipCount >= 2 for duration >= 180
```

### Señales diferidas explícitamente

No entran en la primera versión:

- `spatialConcentrationRatio`
- `descriptionCoverageRatio`
- `wikipediaBodyCoverageRatio`
- `wikidataClaimsCoverageRatio`
- `imageCoverageRatio`
- `translatedNameCoverageRatio`

Razón:

- hoy no están instrumentadas de forma uniforme
- no hay datos de shadow mode para calibrarlas
- introducirlas ahora aumenta complejidad sin evidencia

---

## 9. Fase 3 — Shadow mode

### Objetivo

Calcular el gate sin bloquear todavía.

### Integración sugerida

En `orchestrationService.ts`, después de tener:

- raw pool
- shortlist
- candidates
- route diagnostics

y antes de tener:

- narración final
- imágenes
- persistencia DB
- audio

calcular:

```ts
const confidence = computeTourConfidence({ ...signals });
```

### Flag de control

```text
TOUR_CONFIDENCE_GATE_MODE=off|shadow|enforce
```

Default recomendado:

- development: `shadow`
- test: `off` o función pura testeada directamente
- production inicial: `shadow`
- production futuro: `enforce`

### Requisito crítico

- shadow mode no debe cambiar comportamiento visible
- solo adjunta metadata/logs y persiste review queue cuando aplique

---

## 10. Fase 4 — Review queue

### Objetivo

No perder datos de ciudades rechazadas o auto-aprobadas.

### Implementación recomendada

- Tabla `tour_quality_review_queue`
- Crear con SQL perezoso (`CREATE TABLE IF NOT EXISTS`)
- Seguir el patrón de `poi_enrichment_cache`
- No crear modelo Prisma nuevo todavía salvo necesidad operativa posterior
- Mantenerla inicialmente como log append-only, pero con campos suficientes para
  resumir demanda por ciudad/theme.

### Campos sugeridos

```text
id
city
normalized_city
country
country_code
theme
language
duration_minutes
quality_status
confidence_score
reasons jsonb
signals jsonb
stops jsonb
created_at
reviewed_at
review_status
review_notes
request_fingerprint
```

### Cuándo insertar

- ciudad no verificada falla gate en shadow mode
- ciudad no verificada pasa gate en shadow mode
- ciudad verificada produce señales borderline
- usuario pide repetidamente una ciudad no soportada

Nota:

- “usuario pide repetidamente” requiere o bien eventos repetidos agregables por query,
  o bien un mecanismo explícito de deduplicación/resumen

---

## 11. Fase 5 — Gate activo para no verificadas

### Objetivo

Activar la regla final:

> Si no hay confianza, no se entrega tour.

### Flujo

```text
city/theme verified
  → generar directo

city/theme not verified
  → correr pipeline
  → calcular gate
  → si gate pasa: devolver tour
  → si gate falla: rechazo estructurado
```

### Código de error sugerido

- HTTP status: `422`
- code: `CITY_QUALITY_NOT_AVAILABLE`

Esto no debe reutilizar silenciosamente `CITY_NOT_AVAILABLE`, porque son fallos de
producto distintos:

- `CITY_NOT_AVAILABLE`: no hubo base mínima técnica para construir tour
- `CITY_QUALITY_NOT_AVAILABLE`: hubo ejecución suficiente para evaluar, pero la
  confianza final fue insuficiente

No incluir sugerencias de otras ciudades.

---

## 12. Fase 6 — Promoción progresiva

### Criterio para promover

Una ciudad puede pasar a verified si:

- pasa confidence gate consistentemente
- se revisa manualmente al menos una vez
- se capturan fixtures
- se curan anchors positivos
- si aplica, se curan anchors negativos
- aceptación queda verde

### Workflow

1. Revisar ciudad en review queue.
2. Inspeccionar con `inspect-osm-tours-batch.ts`.
3. Capturar fixtures.
4. Curar `anchors.json`.
5. Activar ciudad en aceptación.
6. Correr `npx jest src/services/poi/TourQuality.acceptance.test.ts --runInBand`.
7. Correr `npx jest --runInBand`.
8. Agregar ciudad a `VerifiedCities.ts`.

---

## 13. Tests obligatorios

### 13.1 Verified cities

- ciudad verificada exacta pasa
- alias pasa
- theme distinto falla
- ciudad desconocida falla
- casing/acentos razonables

### 13.2 Confidence gate unitario

- buen input pasa
- pool pequeño falla
- baja cobertura Wikidata falla
- ciudad con flagships relativos débiles falla
- duplicados fallan
- categoría colapsada falla
- route degraded falla
- coverageRatio bajo falla
- leakage negativo falla

### 13.3 Acceptance regression

- todas las ciudades verified actuales deben dar `confidence.passed === true`
- Toulouse debe pasar post-fix
- Toledo debe pasar post-fix
- negativos no deben aparecer

### 13.4 Shadow/enforce integration

- gate pass inserta evento si ciudad no verified
- gate fail inserta evento con reasons
- ciudad verified no se bloquea por shadow mode
- rechazo devuelve `CITY_QUALITY_NOT_AVAILABLE` cuando `mode=enforce`
- rechazo ocurre antes de narración/imágenes/DB/audio cuando `mode=enforce`

---

## 14. Observabilidad

Cada decisión del gate debe loguear un evento estructurado `tour_quality_gate` con:

- city
- theme
- qualityStatus
- stage
- score
- reasons
- signals

No loguear secretos ni blobs grandes innecesarios.

---

## 15. Riesgos

### Riesgo 1 — Falso positivo

El gate acepta una ciudad y el tour es malo.

Mitigación:

- shadow mode antes de `enforce`
- review queue
- señales estructurales
- fixtures para ciudades promovidas

### Riesgo 2 — Falso negativo

El gate rechaza una ciudad que podía tener un tour aceptable.

Mitigación:

- razones claras
- logging
- revisión de ciudades demandadas
- thresholds calibrados con evidencia

### Riesgo 3 — Overfitting

Calibrar demasiado contra ciudades actuales.

Mitigación:

- probar ciudades fuera de fixtures
- incluir ciudades pequeñas, medianas, capitales y no europeas
- no usar anchors de producción

### Riesgo 4 — Mala UX de rechazo

Mitigación:

- mensaje no técnico
- no decir “error interno”
- guardar la solicitud para expansión futura

### Riesgo 5 — Latencia

Mitigación:

- rechazo temprano antes de cola cara
- cache persistente
- shadow/offline review

### Riesgo 6 — Fuente de verdad duplicada

Mitigación:

- `VerifiedCities.ts` debe ser la fuente única de ciudades verificadas

---

## 16. Orden recomendado de implementación

### Paso 0 — Refactor de rechazo temprano

Permitir que el gate decida antes de imágenes/DB/audio.

### Paso 1 — Verified city registry

Implementar `VerifiedCities.ts`.

No bloquear todavía.

### Paso 2a — Script de calibración

Implementar y correr script de calibración sobre las ciudades ya protegidas.

### Paso 2b — Confidence gate puro

Implementar función pura `computeTourConfidence(...)` con 2 etapas.

### Paso 3 — Integrar gate en scripts de validación

Actualizar `inspect-osm-tours-batch.ts` para imprimir confidence.

### Paso 4 — Gate en shadow mode

Conectarlo al orquestador. No bloquear todavía.

### Paso 5 — Review queue

Persistir decisiones de gate.

### Paso 6 — Gate activo para no verified

Solo después de shadow mode y calibración.

### Paso 7 — Promoción progresiva

Crear flujo para pasar ciudades de `auto_approved` a `verified`.

---

## 17. Estado actual del repo

Ya está implementado en backend:

- seam estructural antes de narración/imágenes/DB/audio
- `VerifiedCities.ts` como fuente única por `city + countryCode + theme`
- `qualityStatus` persistido en `Tour.metadata` y expuesto en `TourResponse`
- `computeTourConfidence(...)` mínimo con 2 etapas
- `TOUR_CONFIDENCE_GATE_MODE=off|shadow|enforce`
- shadow mode para ciudades no verified con `qualityStatus=shadow_evaluated`
- enforce con rechazo temprano vía `CITY_QUALITY_NOT_AVAILABLE`
- review queue append-only en Postgres con SQL perezoso
- logging estructurado `tour_quality_gate`

Esto cambia la prioridad del trabajo restante: ya no estamos en diseño base del gate,
sino en endurecimiento, calibración y operatividad.

---

## 18. Lo que falta

### 18.1 Calibración real del gate

Ya existe una base inicial:

- `backend/scripts/validation/calibrate-confidence-gate.ts`
- `inspect-osm-tours-batch.ts` ya imprime `confidence`

Pero sigue faltando:

- medir distribución real de señales sobre ciudades buenas y ciudades dudosas
- revisar si los thresholds iniciales están demasiado estrictos o demasiado laxos
- convertir esa salida en decisión operativa de rollout

Sin esto, `enforce` existe técnicamente, pero todavía no está suficientemente
calibrado para rollout amplio en producción.

Resultado inicial ya observado en muestra manual:

- las 10 ciudades verified actuales pasan con los thresholds actuales
- una muestra de ciudades plausibles no verified (`Sevilla`, `Granada`, `Lisbon`,
  `Prague`, `Vienna`, `Kyoto`, `Bruges`, `Naples`) también pasa
- `Lima` falla por `category_collapse`, lo cual parece coherente con la ruta
  observada

Conclusión provisional:

- no hay evidencia suficiente todavía para endurecer o relajar thresholds
- el siguiente paso útil es ampliar la muestra con más ciudades medianas y algunos
  themes distintos de `history`

### 18.2 Integración en scripts de inspección

Ya está hecho:

- `inspect-osm-tours-batch.ts` imprime `confidence`

Lo que falta ahora es usarlo de verdad para revisión comparativa y tuning.

### 18.3 Tests HTTP del rechazo estructurado

Ya existe cobertura de controller para asegurar:

- status `422`
- payload con `code`
- payload con `message`
- payload con `details`

Si luego hace falta más confianza todavía, el siguiente nivel sería testear la ruta
Express completa con middleware real.

### 18.4 Señales todavía no instrumentadas

La v1 del gate no usa todavía:

- `p31RejectedCount`
- `p31RejectedRatio`
- `negativeLeakCount` real en runtime
- señales espaciales
- señales de cobertura de enrichment/descripciones/imágenes

Eso está bien para una primera versión, pero sigue siendo deuda técnica del gate.

### 18.5 Índices y explotación de review queue

La queue ya existe, pero aún falta operatividad:

- índices por `created_at`
- índices por `normalized_city, country_code, theme`
- queries o script de resumen de demanda/fallos

Ahora mismo la queue sirve como log persistente, no todavía como herramienta cómoda
de priorización.

### 18.6 Identidad geográfica más estable

El paso actual `city + countryCode + theme` es mejor que solo `city`, pero la forma
más robusta sigue siendo migrar en el futuro a identidad estable de geocoder:

- `wikidataId + theme`
- o `osmType/osmId + theme`

### 18.7 Runbook de rollout

Falta documentar operación real:

- cuánto tiempo correr `shadow`
- qué métricas mirar
- criterio para activar `enforce` por entorno
- rollback si aparecen falsos negativos

---

## 19. Criterio de éxito

Este plan está funcionando si:

- producción no entrega tours de baja confianza conocidos
- ciudades verified siguen verdes
- ciudades no verified tienen pass/fail explicable
- el usuario recibe rechazo claro cuando no hay calidad suficiente
- las ciudades demandadas alimentan una cola de mejora
- el sistema mejora sin depender de revisar manualmente cada solicitud
- los rechazos en `enforce` ocurren antes de la cola cara del pipeline

---

## 20. Próximo prompt recomendado

```text
Implementa los siguientes pendientes del documento docs/working/23-plan-produccion-whitelist-confidence-gate.md:
1) tests HTTP para `CITY_QUALITY_NOT_AVAILABLE`,
2) `backend/scripts/validation/calibrate-confidence-gate.ts`,
3) integrar confidence en `inspect-osm-tours-batch.ts`,
4) sin tocar frontend ni promoción a verified todavía.
```
