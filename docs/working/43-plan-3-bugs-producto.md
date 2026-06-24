# 43 — Plan de implementación de 3 bugs de producto

Fecha: `2026-06-10`
Estado: `design-only`
Scope: `backend` + `pods/llm-pod`

## Objetivo

Traducir el veredicto unánime del Board sobre Barcelona FR en un plan de implementación concreto, acotado al código actual, sin rediseñar todavía la arquitectura completa.

## Veredicto operativo

1. Prioridad 1: `CONTEXTO VACÍO`
2. Prioridad 2: `LANGUAGE DRIFT`
3. Prioridad 3: `IMÁGENES`
4. Añadir `PRE-FLIGHT CHECK` obligatorio antes de generar cualquier tour.

## Estado actual relevante

- La generación estructural ocurre en `backend/src/services/orchestrationService.ts`, principalmente en `generateFullTour()`, `generateStructuralTourData()` y `buildNarratedPlaces()`.
- El enrichment RAG hoy es best-effort y ocurre por stop dentro de `backend/src/services/narrative/NarrativeBuilder.ts`, vía `enrichSeeds()` y `enrichContext()`.
- El fallback narrativo del pod vive en `pods/llm-pod/src/routes/narrativeLong.ts`, en `buildFallbackEvidence()`, `buildFallbackObservation()` y `fallbackSection()`.
- El readiness actual mide solo el texto ya generado en `backend/src/services/tourReadiness/contentReadiness.ts`; no existe una compuerta previa que valide si un stop es narrable antes de invocar LLM.
- La selección de imágenes ya intenta `Wikidata -> Wikipedia -> Commons search`, pero `fetchImageFromWikidata()` devuelve la primera `P18` utilizable sin rankearla semánticamente.
- Barcelona puede estar fallando por configuración en `CityKnowledgeBase`: `isCityEnabled()` depende de `ENRICHMENT_ENABLED_CITIES` y `cityIndexExists()` exige `index.npy` + `texts.json`.

## Orden recomendado de implementación

1. Crear compuerta `pre-flight` y endurecer viabilidad de contexto.
2. Aplicar recorte/sustitución de POIs no narrables antes de `buildNarratedPlaces()`.
3. Arreglar fallback multilingue para evitar drift inmediato en FR/DE/IT.
4. Reordenar selección de imágenes `P18` con scoring semántico.
5. Ejecutar validación dirigida sobre Barcelona FR.

---

## 1. Nueva compuerta obligatoria: `PRE-FLIGHT CHECK`

### Objetivo

Bloquear la generación narrativa cuando el tour o sus stops no tienen contexto mínimo verificable y forzar reparación estructural antes de llamar al pod narrativo.

### Archivos a tocar

- `backend/src/services/orchestrationService.ts`
- `backend/src/services/tourReadiness/contentReadiness.ts`
- `backend/src/services/tourQuality/TourQualityGate.ts`
- `backend/src/services/enrichment/CityKnowledgeBase.ts`
- `backend/src/services/poi/PoiEnrichmentPipeline.ts`

### Funciones exactas

- `OrchestrationService.generateFullTour()`
- `OrchestrationService.generateStructuralTourData()`
- `OrchestrationService.buildNarratedPlaces()`
- `evaluateTourContentReadiness()`
- `evaluateTourQuality()`
- `enrichContext()`
- `enrichShortlistedPois()`

### Cambios específicos

- `contentReadiness.ts`
  - Añadir una evaluación previa de narrabilidad estructural, separada de la evaluación del texto final.
  - Propuesta mínima: exportar `evaluateStopPreflightReadiness()` y `evaluateTourPreflightReadiness()`.
  - Cada stop debe evaluar, como mínimo:
    - `hasWikidataClaims`
    - `hasWikipediaLeadOrBody`
    - `hasEnrichedContext`
    - `hasMeaningfulOsmTags`
    - `isNarratable`
    - `reasons`
  - Regla del Board: un POI sin datos mínimos no entra a narración; primero se sustituye o se elimina.

- `PoiEnrichmentPipeline.ts`
  - Extender el resultado de `enrichShortlistedPois()` para dejar trazable si el POI trae facts mínimos reales.
  - No hace falta cambiar el dominio completo: basta con enriquecer `enriched` con señales derivadas o dejar listo un helper local en este archivo para clasificar POIs en `viable` / `thin` / `empty`.
  - Criterio recomendado de viabilidad mínima:
    - `wikidataClaims` no vacío, o
    - `wikipediaLead` o `wikipediaBody` con contenido, o
    - `enrichedContext` posterior con al menos un pasaje `similarity > 0.25`, o
    - OSM suficiente para observación exterior muy básica.

- `CityKnowledgeBase.ts`
  - Mantener `enrichContext()` como fuente determinística de contexto previo y hacer explícitos los motivos de vacío.
  - Añadir telemetría estructurada para distinguir:
    - ciudad no habilitada en `ENRICHMENT_ENABLED_CITIES`
    - índice inexistente
    - query sin resultados
    - resultados descartados por `similarity` o por cuotas
  - Esto es importante para el caso Barcelona: hoy todo eso colapsa a `[]` y la causa real se pierde.

- `orchestrationService.ts`
  - Insertar el `pre-flight` después de `generateStructuralTourData()` y antes de `buildNarratedPlaces()` dentro de `generateFullTour()`.
  - Flujo propuesto:
    - evaluar viabilidad stop por stop
    - intentar sustituir stops no viables con candidatos de `structuralTour.routeCandidates`
    - si no hay sustitutos, recortar el tour
    - si tras el recorte el stop count cae por debajo del mínimo aceptable del request, fallar antes de narración
  - No rellenar con stops huecos solo para cumplir cupo.
  - `buildNarratedPlaces()` debe asumir que recibe solo stops viables; si detecta uno no viable, debe loguearlo como error de pipeline, no resolverlo con fallback silencioso.

- `TourQualityGate.ts`
  - Extender `QualityEvaluationInput` con metadata de `preflight`, por ejemplo:
    - `preflight: { passed: boolean; stopCountBefore: number; stopCountAfter: number; droppedStopIds: string[]; reasons: string[] }`
  - La compuerta nueva no reemplaza el quality gate narrativo; lo precede.
  - Si `preflight.passed === false`, el tour debe quedar `blocked` antes de persistir narración comercial.

### Verificación

- Test unitario en `contentReadiness`:
  - POI con `wikidataClaims` pasa.
  - POI sin wiki, sin claims y sin contexto enriquecido falla con `missing_minimum_context`.
- Test de integración de orquestación:
  - si 2 stops son inviables y hay sustitutos, se reemplazan antes de narrar.
  - si no hay sustitutos, el tour sale con menos stops.
  - si queda por debajo del mínimo de producto, se lanza error antes de LLM.
- Verificación manual Barcelona:
  - log claro de por qué Barcelona no recibe enrichment: `disabled_city`, `missing_index` o `no_results`.

---

## 2. Bug #2: `CONTEXTO VACÍO`

### Decisión del Board

El enrichment debe ocurrir siempre pre-generación. Los POIs sin datos mínimos se sustituyen. Si no hay suficientes stops viables, el tour se acorta; nunca se rellena con stops vacíos.

### Archivos a tocar

- `backend/src/services/narrative/NarrativeBuilder.ts`
- `backend/src/services/orchestrationService.ts`
- `backend/src/services/enrichment/CityKnowledgeBase.ts`
- `backend/src/services/poi/PoiEnrichmentPipeline.ts`
- `backend/src/services/tourReadiness/contentReadiness.ts`

### Funciones exactas

- `buildNarration()`
- `generateStructuralTourData()`
- `generateFullTour()`
- `enrichSeeds()`
- `enrichContext()`
- `enrichShortlistedPois()`

### Cambios específicos

- `NarrativeBuilder.ts`
  - Hoy `buildNarration()` hace enrichment dentro del propio paso de narración y lo trata como best-effort.
  - Mover la responsabilidad de “tener contexto suficiente” fuera de esta función.
  - `buildNarration()` debe recibir POIs ya saneados por pre-flight y mantener solo un enrichment complementario, no decidir viabilidad del stop.
  - Si el enrichment complementario falla, no debe rescatar POIs estructuralmente vacíos con fallback genérico.

- `CityKnowledgeBase.ts`
  - Asegurar que `enrichContext()` se use de forma sistemática para evaluar viabilidad antes de narrar, no solo como adorno de prompt.
  - Mantener `applyLevelQuotas()` y `deduplicatePassages()`, pero devolver también señal útil para distinguir “hay contexto local útil” de “solo quedó contexto regional débil”.
  - Regla recomendada: un stop no cuenta como viable si solo tiene contexto `province/region` sin facts del POI ni `city` suficientemente parecido.

- `PoiEnrichmentPipeline.ts`
  - Extender la fase actual de `enrichShortlistedPois()` para producir una clasificación explícita por POI:
    - `rich`
    - `thin`
    - `empty`
  - `empty` debe significar: sin `wikidataClaims`, sin Wikipedia útil y sin facts externos mínimos.
  - Esta clasificación debe ser la base del pre-flight en orquestación.

- `orchestrationService.ts`
  - En `generateStructuralTourData()`, tras `enrichShortlistedPois()` y antes de `rankPois()`, calcular un score o filtro de viabilidad para evitar que suban POIs vacíos al top N.
  - En `generateFullTour()`, tras seleccionar `selectedStructuralPlaces`, correr una segunda validación de viabilidad sobre la ruta final y hacer sustitución desde `routeCandidates`.
  - Regla concreta:
    - primero intentar reemplazo 1:1 con candidato no usado y viable
    - si no existe reemplazo, remover el stop
    - reestimar la ruta y mantener orden caminable
  - No añadir fallback textual para compensar falta de facts. La reparación es estructural, no literaria.

### Verificación

- Caso con POI vacío mezclado en top route: queda fuera antes de narración.
- Caso con 6 stops solicitados y solo 4 viables: se genera tour de 4, no de 6 con relleno.
- Caso Barcelona FR: confirmar si el problema real es que `ENRICHMENT_ENABLED_CITIES` sigue en `madrid` por defecto o si falta el índice `barcelona_index`.

---

## 3. Bug #1: `LANGUAGE DRIFT`

### Decisión del Board

Parche inmediato en fallback: plantillas FR/DE/IT en `fallbackSection()` y `buildFallbackObservation()`, con diccionario de conectores por idioma. Rediseño profundo después: `language` debe ser contrato obligatorio end-to-end.

### Archivos a tocar

- `pods/llm-pod/src/routes/narrativeLong.ts`
- `pods/llm-pod/src/prompts/narrative/types.ts`
- `backend/src/services/narrative/NarrativeBuilder.ts`

### Funciones exactas

- `buildFallbackEvidence()`
- `buildFallbackObservation()`
- `fallbackSection()`
- `sectionSystem()`
- `buildNarration()`

### Cambios específicos

- `narrativeLong.ts`
  - `buildFallbackEvidence()` hoy produce español fijo: `construido en`, `obra de`, `de estilo`, `declarado`.
  - Convertirlo en builder por idioma con diccionario para `es`, `fr`, `de`, `it`, `en`.
  - `buildFallbackObservation()` hoy produce español fijo: `${localName} es un ... en ...`.
  - Reescribirlo con plantillas nativas por idioma, no traducción híbrida.
  - `fallbackSection()` hoy solo distingue `es` vs resto y el resto cae a inglés.
  - Añadir ramas explícitas para `fr`, `de`, `it` en `arrival`, `history`, `significance`, `transition`.
  - Extraer conectores/acciones de cierre a un diccionario por idioma, por ejemplo:
    - arrival: `Has llegado`, `Vous arrivez`, `Du bist angekommen`, `Sei arrivato`, `You've arrived`
    - transition: `continúa hacia`, `continuez vers`, `geh weiter zu`, `prosegui verso`, `continue toward`
  - Mantener el parche pequeño: no rehacer aún el contrato completo de idioma en todo el pod.

- `prompts/narrative/types.ts`
  - Endurecer `sectionSystem()` con una instrucción redundante final del tipo: `CRITICAL: every output sentence must be in ${targetLanguage}. Do not mix languages.`
  - No resuelve el bug de raíz, pero reduce drift cuando el modelo cae a fallback parcial o a seed multilingue.

- `NarrativeBuilder.ts`
  - Revisar `buildGroundedFallbackNarration()` para alinear FR/DE/IT con el mismo criterio.
  - Hoy ya hay textos por idioma ahí, pero conviene revisar que no reintroduzcan fórmulas genéricas cuando el pod falla y el backend entra al fallback de emergencia.

### Verificación

- Tests unitarios del pod:
  - `fallbackSection('arrival', ..., language='fr')` devuelve francés puro.
  - idem `de` e `it`.
  - `buildFallbackObservation()` no contiene español ni inglés cuando el idioma es `fr`, `de` o `it`.
- Smoke test manual en Barcelona FR:
  - forzar fallback y confirmar que no aparecen segmentos `is part of`, `You've arrived`, `es un` o `construido en`.

### Trabajo posterior explícitamente fuera de este parche

- Rediseñar `language` como contrato obligatorio en todos los payloads y caches.
- Auditar seeds multilingues mixtas y normalización por idioma base.

---

## 4. Bug #3: `IMÁGENES`

### Decisión del Board

`Wikidata P18` pasa a ser la fuente primaria real, no solo la primera que responde. Debe filtrarse por nombre/metadata premiando exterior representativo y penalizando interiores y detalles. No integrar Google Places ahora.

### Archivos a tocar

- `backend/src/services/wikimediaService.ts`
- `backend/src/services/orchestrationService.ts`

### Funciones exactas

- `fetchImageForPlace()`
- `fetchImageFromWikidata()`
- `fetchCommonsFileImage()`
- `getImageScore()`
- `getRelevanceMultiplier()`
- `fetchImagesForPlaces()`

### Cambios específicos

- `wikimediaService.ts`
  - `fetchImageFromWikidata()` hoy devuelve la primera `P18` usable.
  - Cambiarlo para:
    - obtener todas las `P18`
    - resolver cada una a `ImageDetails`
    - rankearlas con el mismo scoring semántico del resto
    - elegir la mejor, no la primera
  - Extender `getRelevanceMultiplier()` con señales explícitas del Board.
  - Penalizaciones duras en `title`, `descriptionText`, `categoriesText`, `objectNameText`:
    - `interior`
    - `detail`
    - `ceiling`
    - `chair`
    - `monogram`
    - `rail`
  - Bonos positivos:
    - `facade`
    - `exterior`
    - `front`
  - Recomendación práctica:
    - penalización multiplicativa fuerte para interiores/detalles en categorías no artwork
    - bonus aditivo o multiplicativo moderado para exteriores representativos
  - Reusar `looksLikeRepresentativePlacePhoto()` y `looksLikeIrrelevantArtworkForPlace()` en lugar de abrir un segundo sistema paralelo.
  - Mantener `Wikipedia page image` y `Commons search` como fallback, pero solo después de rankear correctamente las `P18`.

- `orchestrationService.ts`
  - `fetchImagesForPlaces()` no necesita cambio de flujo; solo debe preservar logs que indiquen si la imagen vino de `wikidata`, `wikipedia` o `search` para verificar el rollout.

### Verificación

- Test unitario de scoring:
  - imagen con `facade exterior front` gana a otra `interior ceiling detail` del mismo POI.
- Test con múltiples `P18`:
  - no se devuelve automáticamente la primera si la segunda es mejor exterior.
- Verificación manual:
  - revisar 5-10 POIs de Barcelona y confirmar que baja la tasa de interiores no representativos.

---

## 5. Cambios concretos por archivo

| Archivo | Funciones a tocar | Cambio principal |
| --- | --- | --- |
| `backend/src/services/orchestrationService.ts` | `generateFullTour()`, `generateStructuralTourData()`, `buildNarratedPlaces()`, `fetchImagesForPlaces()` | Insertar `pre-flight`, sustitución/recorte de stops, logs de origen de imagen |
| `backend/src/services/tourReadiness/contentReadiness.ts` | `evaluateTourContentReadiness()` + nuevos helpers | Separar readiness de texto final vs viabilidad pre-generación |
| `backend/src/services/tourQuality/TourQualityGate.ts` | `evaluateTourQuality()` | Añadir metadata y fail temprano de `preflight` |
| `backend/src/services/enrichment/CityKnowledgeBase.ts` | `enrichContext()`, `enrichSeeds()` | Enrichment obligatorio para evaluar viabilidad, telemetría de vacío |
| `backend/src/services/poi/PoiEnrichmentPipeline.ts` | `enrichShortlistedPois()` | Clasificación `rich/thin/empty` o equivalente |
| `backend/src/services/narrative/NarrativeBuilder.ts` | `buildNarration()` | Dejar de usar enrichment best-effort como rescate de stops vacíos |
| `pods/llm-pod/src/routes/narrativeLong.ts` | `buildFallbackEvidence()`, `buildFallbackObservation()`, `fallbackSection()` | Fallback multilingue real FR/DE/IT + conectores por idioma |
| `pods/llm-pod/src/prompts/narrative/types.ts` | `sectionSystem()` | Refuerzo anti-mixing de idioma |
| `backend/src/services/wikimediaService.ts` | `fetchImageFromWikidata()`, `getRelevanceMultiplier()`, `getImageScore()` | Rankear todas las `P18` y premiar exterior representativo |

---

## 6. Criterios de aceptación

- Ningún tour nuevo entra a narración sin pasar `pre-flight`.
- Un stop sin contexto mínimo no se rellena con texto genérico; se sustituye o se elimina.
- Barcelona FR deja trazabilidad suficiente para saber si el fallo es de configuración o de recuperación.
- El fallback de `narrativeLong` no mezcla idiomas en `fr`, `de` o `it`.
- La imagen primaria de `P18` se elige por representatividad, no por orden de llegada.

## 7. Riesgos y decisiones explícitas

- El mayor cambio de comportamiento está en aceptar tours con menos stops. Eso es deseado por producto y debe tratarse como mejora, no regresión.
- La clasificación `rich/thin/empty` debe ser mínima y determinística; no conviene introducir NLP nuevo para esta fase.
- El parche de idioma es deliberadamente táctico. El rediseño profundo del contrato `language` queda fuera de este documento.
- No conviene mezclar este trabajo con integración de nuevas fuentes de imagen; `Google Places` queda explícitamente fuera.

## 8. Verificación final recomendada

1. Ejecutar tests unitarios de `contentReadiness`, `wikimediaService` y fallback del `llm-pod`.
2. Generar tour Barcelona FR con logs completos.
3. Confirmar en logs:
   - resultado de `pre-flight`
   - stops sustituidos o eliminados
   - motivo exacto de enrichment vacío si aplica
   - idioma final de fallback por sección
   - fuente/origen de cada imagen y score relativo
4. Revisar manualmente el tour final para asegurar que el producto prefiere menos stops buenos sobre más stops huecos.
