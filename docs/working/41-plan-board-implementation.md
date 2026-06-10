# 41 — Plan de implementación del veredicto del Board

Fecha: `2026-06-10`
Estado: `design-only`
Scope: `backend` + `pods/llm-pod` + `tests` + `docs`

## Objetivo

Convertir el veredicto unánime del Board sobre el Plan 40 en una secuencia de implementación concreta, verificable y acotada al código real actual.

## Supuestos de trabajo

- No se cambia la arquitectura macro: el `llm-pod` sigue generando narración por stop y el `backend` sigue orquestando y cacheando.
- El punto de entrada narrativo principal ya es `pods/llm-pod/src/routes/narrativeLong.ts`.
- El `NarrativeBrief` ya existe en `pods/llm-pod/src/prompts/narrative/narrativeBrief.ts`, pero hoy no se inyecta en prompts.
- El quality gate de tour ya existe en `backend/src/services/tourQuality/TourQualityGate.ts`, pero hoy no está conectado al flujo de generación.
- Los fixtures dorados están definidos en `docs/working/golden-fixtures.md`, pero hoy no viven como tests automatizados.

## Orden global recomendado

1. Item 1: integrar `NarrativeBrief` con flag.
2. Item 2: rehacer fallback narrativo mínimo.
3. Item 7: bans por regex/raíces.
4. Item 5: normalización/lematización española.
5. Item 4: soft weak-phrase scoring.
6. Item 6: refinar quality gate y conectar backend.
7. Item 9: hash de bans en caché.
8. Item 10: manejo de Ollama caído a nivel tour.
9. Item 3: fixtures dorados como CI gate.
10. Item 8: telemetría agregada.
11. Item 11: revisión humana pre-release.

La razón del orden es simple: primero se corrige la calidad intrínseca de generación y fallback, luego se endurece la validación, después se conecta persistencia/caché, y finalmente se automatiza control y operación.

---

## 1. Integrar `NarrativeBrief` en el pipeline con flag `NARRATIVE_BRIEF_ENABLED`

### Archivos a modificar

- `pods/llm-pod/src/config/env.ts`
- `pods/llm-pod/src/prompts/narrative/types.ts`
- `pods/llm-pod/src/prompts/narrative/arrival.ts`
- `pods/llm-pod/src/prompts/narrative/history.ts`
- `pods/llm-pod/src/prompts/narrative/significance.ts`
- `pods/llm-pod/src/prompts/narrative/transition.ts`
- `pods/llm-pod/src/prompts/narrative/narrativeBrief.ts`
- `pods/llm-pod/src/routes/narrativeLong.ts`

### Cambios específicos

- `pods/llm-pod/src/config/env.ts`
  - Añadir `narrativeBriefEnabled: process.env.NARRATIVE_BRIEF_ENABLED === 'true'` junto a `narrativeMaxConcurrency`.

- `pods/llm-pod/src/prompts/narrative/types.ts`
  - Extender `LongNarrativePromptInput` para aceptar `narrativeBriefText?: string` y opcionalmente `narrativeBriefSeedQuality?: 'rich' | 'medium' | 'thin'`.
  - No mover lógica editorial aquí; solo ampliar el contrato de entrada del prompt.

- `pods/llm-pod/src/routes/narrativeLong.ts`
  - En imports iniciales, sumar `buildNarrativeBrief` y `formatBriefForPrompt`.
  - En `router.post('/stop/long'...)`, justo después de `policyFor(input)` y antes de construir `promptBuilders`, calcular:
    - `const brief = env.narrativeBriefEnabled ? buildNarrativeBrief(input) : null`
    - `const briefText = brief ? formatBriefForPrompt(brief) : undefined`
  - Guardar `briefText` en `input` o en un `basePromptInput` compartido por `generateSection`.
  - Si `NARRATIVE_DEBUG=true`, añadir el brief al `debugTrace` para poder comparar prompt antiguo vs. prompt con brief.

- `pods/llm-pod/src/prompts/narrative/arrival.ts`, `history.ts`, `significance.ts`, `transition.ts`
  - Insertar `input.narrativeBriefText` en el `user` prompt, antes de las instrucciones específicas de sección y después del bloque de contexto principal.
  - No sustituir todavía `Wikipedia` ni `formatStructuredFacts`; el brief entra como capa determinística adicional, no como reemplazo inicial.
  - Añadir una instrucción única y explícita del estilo: `Use the NARRATIVE BRIEF as the primary editorial contract; use the raw evidence only to expand safely within it.`

- `pods/llm-pod/src/prompts/narrative/narrativeBrief.ts`
  - Ajustar `extractVisibleCues` y `extractAllowedFacts` para que los fixtures 1-4 sean alcanzables de verdad.
  - Hoy `extractVisibleCues` solo saca hints de materiales OSM y `ubicación`; eso no alcanza el diseño esperado en `golden-fixtures.md`.
  - Añadir extracción mínima desde `wikipediaLead` y `wikipediaBody` para cues visibles y facts frecuentes:
    - números de arcos/torres
    - materiales citados
    - nombres de arquitectos/creadores múltiples
    - estilos ya presentes en `wikidataClaims`
  - Mantenerlo determinístico y de bajo alcance; no introducir NLP pesado aquí.

### Orden de implementación

1. Flag en `env.ts`.
2. Extensión de `LongNarrativePromptInput`.
3. Cálculo del brief en `narrativeLong.ts`.
4. Inyección del brief en los 4 prompt builders.
5. Ajustes menores de `narrativeBrief.ts` para que el contenido sea útil.

### Verificación

- Test unitario nuevo en `pods/llm-pod/src/prompts/narrative/narrativeBrief.test.ts`.
- Test de integración de prompts en `pods/llm-pod/src/prompts/narrative/*.test.ts` o uno consolidado `promptPipeline.test.ts`.
- Caso mínimo:
  - con flag `false`, el prompt no contiene `=== NARRATIVE BRIEF ===`
  - con flag `true`, sí lo contiene
  - `buildNarrativeBrief` para Puerta de Alcalá incluye `1778`, `Francesco Sabatini`, `neoclásico`

---

## 2. Reescribir el fallback Fact Card para que sea narrativa mínima aceptable

### Archivos a modificar

- `pods/llm-pod/src/routes/narrativeLong.ts`
- `backend/src/services/narrative/NarrativeBuilder.ts`
- `backend/src/services/narrative/NarrativeBuilder.quality.test.ts`

### Cambios específicos

- `pods/llm-pod/src/routes/narrativeLong.ts`
  - Reemplazar `fallbackSection()` actual, líneas actuales ~1244-1311.
  - Problema actual:
    - `arrival` y `history` son plantillas genéricas.
    - `history` puede devolver líneas crudas tipo `Arquitecto: X.`.
    - `significance` usa meta-frases como `parada relevante de este recorrido`.
  - Crear helpers privados cercanos a `fallbackSection()`:
    - `buildFallbackEvidenceSummary(input)`
    - `buildFallbackObservation(input, section)`
    - `buildFallbackHistoricalSentence(input)`
  - Regla nueva:
    - si hay `wikidataClaims` o `wikipediaLead`, construir 1-2 frases cortas y naturales con esos hechos;
    - si solo hay OSM, describir tipo de lugar, función observable y posición urbana, sin inventar historia;
    - nunca emitir `classified as`, `Arquitecto:`, ni meta-comentarios del sistema.
  - Asegurar que todo fallback siga pasando por `validateSection()` antes de aceptarse; si no pasa, usar un fallback final ultra conservador por idioma.

- `backend/src/services/narrative/NarrativeBuilder.ts`
  - Revisar `buildGroundedFallbackNarration()` líneas actuales ~105-191.
  - Eliminar frases que el propio validador o la línea editorial penalizan, por ejemplo:
    - `Bienvenidos a esta caminata`
    - `merece una mirada atenta`
    - `ofreciendo un cierre con sentido`
  - Alinear backend fallback con el nuevo estilo mínimo del pod para que no reintroduzca prosa genérica cuando falle todo el pod.

### Orden de implementación

1. Cambiar fallback por sección en `narrativeLong.ts`.
2. Ajustar fallback de tour/stop en `NarrativeBuilder.ts`.
3. Agregar tests de regresión de weak fallback.

### Verificación

- Tests unitarios:
  - thin seed de fuente: no inventa siglo, arquitecto ni realeza.
  - fallback con `P571` y `P84`: convierte esos facts en 2 frases naturales.
  - no aparecen patrones `Architect:` o `classified as`.
- Verificación manual con fixture 6.

---

## 3. Convertir golden fixtures en tests automatizados (CI gate)

### Archivos a crear

- `pods/llm-pod/jest.config.js`
- `pods/llm-pod/src/routes/narrativeLong.golden.test.ts`
- `pods/llm-pod/src/prompts/narrative/narrativeBrief.golden.test.ts`
- `pods/llm-pod/src/routes/__fixtures__/goldenNarrativeFixtures.ts`

### Archivos a modificar

- `pods/llm-pod/package.json`
- `docs/working/golden-fixtures.md`

### Cambios específicos

- `pods/llm-pod/package.json`
  - Añadir dependencias dev necesarias para `jest` en TypeScript, equivalentes al backend: `jest`, `ts-jest`, opcionalmente `@jest/globals`.
  - Mantener script `test`, pero ya funcional.

- `pods/llm-pod/jest.config.js`
  - Igualar la convención del backend: `preset: 'ts-jest'`, `testEnvironment: 'node'`, `roots: ['<rootDir>/src']`, `testMatch: ['**/*.test.ts']`.

- `pods/llm-pod/src/routes/__fixtures__/goldenNarrativeFixtures.ts`
  - Traducir los 10 fixtures del markdown a objetos TypeScript estáticos.
  - No parsear el markdown en runtime; el fixture de CI debe ser estable y explícito.

- `pods/llm-pod/src/prompts/narrative/narrativeBrief.golden.test.ts`
  - Para fixtures con `Expected NarrativeBrief`, validar subconjuntos obligatorios:
    - `allowedFacts`
    - `visibleCues`
    - `tone`
  - No exigir igualdad completa si el brief puede tener facts extra válidos.

- `pods/llm-pod/src/routes/narrativeLong.golden.test.ts`
  - Testear al menos estas funciones internas, exportándolas solo si hace falta vía módulo utilitario pequeño:
    - `validateSection`
    - `validateNarrativeClaims`
    - `hasBannedPhrase`
  - Cada fixture debe verificar:
    - PASS del ejemplo aceptable
    - FAIL del ejemplo no aceptable
    - presencia del motivo esperado, no necesariamente string exacto completo si se migra a regex codes.

- `docs/working/golden-fixtures.md`
  - Añadir nota al inicio: “source of truth editorial”, con referencia a que la versión ejecutable vive en `goldenNarrativeFixtures.ts`.

### Orden de implementación

1. Activar harness de tests en `llm-pod`.
2. Congelar fixtures en TypeScript.
3. Escribir tests de validator y brief.
4. Enlazar el job de CI que ejecute backend + llm-pod tests.

### Verificación

- `npm test` en `pods/llm-pod` pasa offline.
- Los 10 fixtures pasan en CI.
- Un cambio que reintroduzca `hidden gem`, `atmósfera` o `testimonio tangible` rompe CI.

---

## 4. Añadir soft weak-phrase scoring (capa editorial que penaliza sin bloquear)

### Archivos a modificar

- `pods/llm-pod/src/routes/narrativeLong.ts`
- `backend/src/services/tourQuality/TourQualityGate.ts`

### Archivos a crear

- `pods/llm-pod/src/routes/narrativeEditorialScore.test.ts`
- `backend/src/services/tourQuality/TourQualityGate.editorial.test.ts`

### Cambios específicos

- `pods/llm-pod/src/routes/narrativeLong.ts`
  - Insertar una capa nueva después de `hasBannedPhrase()` y antes del retorno de `validateSection()`.
  - Crear tipos y helpers cerca de la lógica de bans, no al final del archivo:
    - `interface EditorialScoreResult { score: number; hits: string[]; severity: 'none' | 'soft' | 'heavy' }`
    - `scoreWeakPhrases(section: string, input: LongNarrativePromptInput): EditorialScoreResult`
  - Esta función no debe fallar `validateSection()` por sí sola.
  - Debe detectar redacción floja que no llega a ban duro, por ejemplo:
    - `merece una mirada atenta`
    - `conecta espacio, uso y memoria`
    - `ofrece un cierre con sentido`
    - equivalentes en inglés si ya aparecen en fallback/backend.
  - En `generateSection()`, al validar una sección exitosa, añadir el score editorial al log `section-attempt` y a la `meta` final por sección.

- `backend/src/services/tourQuality/TourQualityGate.ts`
  - Extender `QualityEvaluationInput` con un agregado editorial, por ejemplo:
    - `editorial?: { weakPhraseHits: number; heavySections: number; sectionScores: ... }`
  - Ajustar el status:
    - weak phrases nunca bloquean solas;
    - pueden empujar `ready` a `review_required` si superan umbral razonable por tour.

### Orden de implementación

1. Definir diccionario soft y score en `llm-pod`.
2. Propagarlo en `meta` de `/narrative/stop/long`.
3. Consumirlo en `TourQualityGate`.

### Verificación

- Fixture aceptable sigue pasando.
- Texto con frase editorial floja pero factual no cae a fallback.
- Tour con demasiadas frases blandas pasa a `review_required`, no `blocked`.

---

## 5. Lematización/normalización española para cerrar bug `gótico/góticos` y `testimonio*`

### Archivos a modificar

- `pods/llm-pod/src/routes/narrativeLong.ts`

### Archivos a crear

- `pods/llm-pod/src/routes/narrativeNormalization.test.ts`

### Cambios específicos

- `pods/llm-pod/src/routes/narrativeLong.ts`
  - Aprovechar la zona ya existente de normalización y raíces:
    - `normalizeNFD()` líneas ~245-249
    - `KNOWN_ARCHITECTURAL_STYLES` líneas ~619-636
    - `STYLE_CANONICAL_MAP` líneas ~983-995
  - Extraer un helper genérico nuevo cerca de `normalizeNFD()`:
    - `normalizeSpanishTokenRoot(token: string): string`
  - Reusar ese helper en dos sitios:
    - detección de estilos en `extractStyles()`
    - detección de bans por raíz en item 7
  - Objetivo funcional:
    - `gótico`, `gótica`, `góticos`, `góticas` deben mapear al mismo root
    - `testimonio`, `testimonios`, `testimonio de`, `testimonio tangible` deben compartir raíz detectable
  - No introducir librería externa de lematización; aquí basta normalización determinística de raíces frecuentes españolas.

### Orden de implementación

1. Extraer helper de raíces.
2. Aplicarlo a estilos.
3. Aplicarlo a bans relacionados con `testimonio*`.
4. Cubrir con tests.

### Verificación

- Test: un corpus con `gótico` verifica `góticos`.
- Test: una frase con `testimonios de` dispara el ban de la familia `testimonio*`.
- No romper fixtures existentes de estilo.

---

## 6. Refinar quality gate: 25% degraded, per-stop, pesos por tipo de sección, contradicción=blocker

### Archivos a modificar

- `backend/src/services/tourQuality/TourQualityGate.ts`
- `backend/src/services/narrative/NarrativeBuilder.ts`
- `backend/src/services/orchestrationService.ts`

### Archivos a crear

- `backend/src/services/tourQuality/TourQualityGate.test.ts`

### Cambios específicos

- `backend/src/services/tourQuality/TourQualityGate.ts`
  - Cambiar thresholds actuales:
    - `DEGRADED_THRESHOLD` de `0.40` a `0.25`
  - Redefinir `sectionDetails` para incluir `stopIndex` y distinguir `stop-level`.
  - Añadir pesos por sección, por ejemplo:
    - `arrival: 1.0`
    - `history: 1.25`
    - `significance: 1.0`
    - `transition: 0.5`
  - Cambiar cálculo de `fallbackRate` por `weightedFallbackRate`.
  - Añadir una vista por stop en `metadata`, por ejemplo `stops: Record<string, { weightedFallbackRate, blocked, degraded }>`.
  - Regla nueva:
    - si `claimCheck.criticalFailCount > 0` o `contradictedCount > 0`, `status = 'blocked'`
    - si un stop pierde `history` y `significance`, ese stop queda `degraded` aunque el tour global no esté en 25%
  - Mantener `shouldPublish`, `shouldHide`, `shouldReEvaluate`, pero recalculados con la nueva semántica.

- `backend/src/services/narrative/NarrativeBuilder.ts`
  - En la respuesta de `/narrative/stop/long`, ya llega `meta.claimCheck` y `meta.droppedReasons`.
  - Normalizar ese `meta` por stop para que la capa tour pueda consolidarlo sin parseos frágiles.
  - Si hace falta, ampliar `BuiltNarration.meta` con un shape interno documentado.

- `backend/src/services/orchestrationService.ts`
  - En `buildNarratedPlaces()`, acumular metadata stop a stop.
  - Tras `Promise.all`, construir `QualityEvaluationInput` y llamar `evaluateTourQuality(...)`.
  - Adjuntar el resultado al objeto final del tour persistible/API, no solo al log.

### Orden de implementación

1. Rediseñar `TourQualityGate.ts`.
2. Propagar metadata stop-level desde `NarrativeBuilder`.
3. Integrar la evaluación en `orchestrationService`.

### Verificación

- Test unitario de gate:
  - `contradictedCount > 0` => `blocked`
  - `weightedFallbackRate > 0.25` => `degraded`
  - fallback sólo en `transition` no degrada igual que fallback en `history`
- Test de integración de orquestación: el tour final expone `narrationQuality`.

---

## 7. Expandir bans a regex con raíces (no strings exactos)

### Archivos a modificar

- `pods/llm-pod/src/routes/narrativeLong.ts`
- `pods/llm-pod/src/prompts/narrative/types.ts`

### Archivos a crear

- `pods/llm-pod/src/routes/narrativeBans.test.ts`

### Cambios específicos

- `pods/llm-pod/src/routes/narrativeLong.ts`
  - Sustituir `HARD_META_BANS` y `HARD_CLICHE_BANS` de arrays de strings por estructuras más ricas:
    - `Array<{ code: string; pattern: RegExp; family: string }>`
  - Hacer lo mismo con `EVIDENCE_AWARE_VISUAL`, manteniendo `evidenceKeys` pero con `pattern` regex.
  - Reescribir `hasBannedPhrase()` para iterar regex y devolver `code` estable, por ejemplo:
    - `banned-cliche:majestuos*`
    - `banned-cliche:testimoni*`
    - `unsupported-visual:atmosfer*`
  - Cubrir variantes acentuadas, género, número y pequeñas flexiones.

- `pods/llm-pod/src/prompts/narrative/types.ts`
  - Reducir el bloque de `BANNED_PHRASES` duplicado para que el prompt refleje familias de frases, no una lista infinita de variantes exactas.
  - No intentar compartir runtime entre prompt y validator en esta fase; basta con alinear vocabulario editorial.

### Orden de implementación

1. Migrar catálogo de bans a regex/familias.
2. Reescribir `hasBannedPhrase()`.
3. Simplificar lista visible del prompt.

### Verificación

- `majestuoso`, `majestuosa`, `majestuosamente` fallan con la misma familia.
- `testimonio`, `testimonios`, `testimonio tangible` fallan.
- Los fixtures siguen siendo legibles aunque cambie el código interno exacto del ban.

---

## 8. Telemetría agregada: bans más frecuentes, fallback rate por modelo/región

### Archivos a modificar

- `pods/llm-pod/src/routes/narrativeLong.ts`
- `backend/src/services/narrative/NarrativeBuilder.ts`
- `backend/src/services/orchestrationService.ts`

### Archivos a crear

- `docs/working/42-narrative-telemetry-process.md`

### Cambios específicos

- `pods/llm-pod/src/routes/narrativeLong.ts`
  - En logs `section-attempt`, `section-fallback`, `claim-check` y `summary`, añadir campos agregables y estables:
    - `banCode`
    - `editorialWeakHits`
    - `fallbackReasonFamily`
    - `model`
    - `language`
    - `theme`
    - `cityName`
    - indicador `hasRegionalRag`
  - No loggear texto completo en producción salvo `NARRATIVE_DEBUG`.

- `backend/src/services/narrative/NarrativeBuilder.ts`
  - En logs `long-response`, `long-request-failed`, `short-request-failed`, añadir:
    - `modelVersion`
    - `cityName`
    - `position`
    - `fallbackSource`
    - `cacheHit`

- `backend/src/services/orchestrationService.ts`
  - Emitir un log agregado por tour con:
    - `narrationQuality.status`
    - `weightedFallbackRate`
    - `contradictedClaims`
    - `editorialWeakHits`
    - `city`, `theme`, `language`

### Orden de implementación

1. Normalizar códigos de error/bans.
2. Añadir campos de logging en `llm-pod`.
3. Añadir agregado final en backend.
4. Documentar consultas operativas.

### Verificación

- Logs permiten contar top bans sin parsear lenguaje natural.
- Se puede segmentar fallback por `modelVersion` y por ciudad/región.

---

## 9. Hash de bans para invalidar caché de narraciones

### Archivos a modificar

- `pods/llm-pod/src/routes/narrativeLong.ts`
- `backend/src/services/narrative/NarrativeBuilder.ts`
- `backend/src/infrastructure/postgres/PostgresNarrationCacheRepository.ts`

### Cambios específicos

- `pods/llm-pod/src/routes/narrativeLong.ts`
  - Añadir helper `computeNarrativePolicyHash()` cerca del bloque de bans.
  - El hash debe incluir al menos:
    - catálogo hard bans
    - catálogo weak phrases
    - versión del brief
    - versión del validador
  - Devolver `policyHash` en `meta` del endpoint `/narrative/stop/long`.

- `backend/src/services/narrative/NarrativeBuilder.ts`
  - Incluir `policyHash` al decidir cache write.
  - Si el cache repo no encuentra hash compatible, tratar como miss.

- `backend/src/infrastructure/postgres/PostgresNarrationCacheRepository.ts`
  - Extender firma de `get()` y `set()` para incluir `policyHash`.
  - Query actual filtra por `poi_id`, `language`, `theme`, `model_version`.
  - Debe pasar a filtrar también por `policy_hash`.
  - Si la columna aún no existe en DB, esta tarea requiere migración Prisma/SQL aparte; dejarla explícita en la implementación real.

### Orden de implementación

1. Definir `policyHash` en `llm-pod`.
2. Propagarlo al backend.
3. Cambiar repo de caché y migración DB.

### Verificación

- Si cambia una regex de ban, el cache anterior deja de ser hit.
- Si no cambia política ni modelo, el cache sigue funcionando.

---

## 10. Manejo de Ollama caído (tour a medio generar)

### Archivos a modificar

- `pods/llm-pod/src/llm/model.ts`
- `pods/llm-pod/src/routes/narrativeLong.ts`
- `backend/src/services/narrative/NarrativeBuilder.ts`
- `backend/src/services/orchestrationService.ts`

### Archivos a crear

- `backend/src/services/narrative/NarrativeBuilder.resilience.test.ts`

### Cambios específicos

- `pods/llm-pod/src/llm/model.ts`
  - Normalizar errores de Ollama con códigos operativos, por ejemplo:
    - `ollama-unreachable`
    - `ollama-timeout`
    - `ollama-5xx`
    - `ollama-empty-response`
  - Incluir el código en `LLMResponse.error` o metadata.

- `pods/llm-pod/src/routes/narrativeLong.ts`
  - En `generateSection()`, distinguir entre fallo editorial/validator y fallo infra Ollama.
  - Si el error es infra, marcar la sección con razón específica, no como simple fallback editorial.
  - En la respuesta `meta`, añadir `generationState` por stop:
    - `full`
    - `partial_fallback`
    - `infra_failed`

- `backend/src/services/narrative/NarrativeBuilder.ts`
  - Hoy, si falla el endpoint largo, cae a endpoint corto y luego a fallback local.
  - Nuevo comportamiento:
    - devolver además metadata explícita de degradación infra por stop;
    - no ocultar que el resultado fue una recuperación de resiliencia.

- `backend/src/services/orchestrationService.ts`
  - En `buildNarratedPlaces()`, capturar stops con `infra_failed`.
  - Si el tour queda a medias por caída de Ollama:
    - no persistirlo como `ready`
    - marcar `review_required` o `degraded` según cobertura final
    - permitir que el resto de stops sobreviva si son utilizables

### Orden de implementación

1. Codificar errores infra en `model.ts`.
2. Propagar `generationState` desde `llm-pod`.
3. Consumirlo en `NarrativeBuilder` y `orchestrationService`.

### Verificación

- Test con timeout del endpoint largo: el tour final existe, pero queda marcado como no listo.
- Test con 1 stop fallido de 8: no se rompe toda la generación.
- Test con mayoría de stops fallidos por infra: `degraded`.

---

## 11. Revisión humana pre-release (documentación de proceso)

### Archivos a crear

- `docs/working/43-pre-release-narrative-review.md`

### Cambios específicos

- Documentar un proceso corto y operativo de revisión antes de activar `enforce`:
  - ciudades mínimas: una con RAG fuerte, una sin RAG, una con thin seeds
  - idiomas mínimos: `es` y `en`
  - revisar 10 fixtures automáticos + 3 tours reales completos
  - checklist editorial:
    - no bans
    - no meta
    - no fallback crudo
    - no contradicciones
    - tono consistente
  - criterio de salida:
    - 0 blockers
    - fallback rate por sección bajo objetivo
    - quality gate sin falsos positivos graves

### Orden de implementación

1. Crear checklist.
2. Ejecutarlo en shadow mode.
3. Registrar resultados antes de `enforce`.

### Verificación

- Existe documento de proceso.
- Hay registro reproducible de qué tours/revisores aprobaron el release.

---

## Conexiones críticas entre items

- Item 1 depende de item 3 para demostrar mejora objetiva.
- Items 5 y 7 deben salir juntos o muy cerca: normalización sin regex-familias deja huecos, y regex-familias sin normalización vuelve frágil el español.
- Item 4 no debe bloquear por sí solo; su destino natural es item 6.
- Item 9 debe entrar antes de rollout amplio, o el caché seguirá sirviendo narraciones validadas con políticas viejas.
- Item 10 debe estar conectado al gate del item 6, o la resiliencia ocultará tours mediocres como si fueran correctos.

## Definición de terminado

- `NarrativeBrief` activable por flag y visible en prompts/debug.
- Fallback ya no emite Fact Cards crudas ni meta-narrativa.
- Los 10 golden fixtures corren offline en CI.
- Los bans funcionan por familias/raíces, no por coincidencia exacta.
- El quality gate opera por stop y por peso de sección, con contradicción como blocker.
- El caché se invalida cuando cambia la política editorial.
- Un fallo de Ollama deja rastro explícito y no publica tours como `ready`.
- Existe checklist de revisión humana previo a `enforce`.

## Riesgos de implementación

- `narrativeLong.ts` ya está muy grande; al implementar conviene extraer utilidades a módulos pequeños sin reescribir el archivo completo.
- `PostgresNarrationCacheRepository` probablemente requerirá cambio de esquema en `poi_narration_cache` para `policy_hash`.
- El `llm-pod` hoy no tiene configuración de `jest`; el item 3 debe resolver eso primero o no habrá CI gate real.
- El backend hoy no muestra uso explícito del quality gate narrativo en persistencia/API; esa integración debe definirse de forma visible en `orchestrationService` y en el contrato final del tour.
