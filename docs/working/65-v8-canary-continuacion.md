# V8 canary — handoff para continuar (2026-08-15)

Estado: **en curso**. Rama `feature/narrative-v8-end-to-end`, worktree limpio,
commits pusheados: `0bcb6ef` (Plan 64: SearXNG fiable) y `f527969`
(generalización de investigación y robustez del curador).

## Qué se hizo (último lote)

### Plan 64 — `0bcb6ef`

- Motores SearXNG: solo **Bing activo** (keyless). Mojeek sirve CAPTCHA desde
  esta IP, Marginalia exige API key en esta versión y Wikipedia queda desactivado
  (redundante con la API directa). Ver `scripts/searxng-settings.yml`.
- Throttle por hostname (~1,5 s) en `SearxngNarrativeDiscoveryProviderV7`
  (`createHostnameThrottleV7`, wait inyectable para tests).
- Fix `/map`: se quitó `ignoreInvalidURLs` del body (el schema de Firecrawl
  v2.8.0 lo rechaza con 400).

### Generalización — `f527969`

- **Curador con ChatGPT mini**: `openai/gpt-5.4-mini` vía OpenRouter, reasoning
  `low`, 16k tokens, en el perfil `balanced_openrouter`. El canary le pasa
  `openRouterApiKey` + pricing del preflight. Antes usaba `deepseek-v4-flash`
  (violaba el contrato en cada run).
- **Queries deterministas**: nombre completo desambiguado (título de Wikipedia
  cuando es más largo) **sin comillas** + ciudad de la petición. Bing ignora la
  ciudad suelta y las frases entrecomilladas (devolvía teatros/palacios
  genéricos).
- **Orden de captura**: a igual prioridad, los resultados de búsqueda
  determinista se capturan antes que los enlaces de `/map` (las páginas de
  delegación agotaban el presupuesto).
- **Reintento único** de una URL registrada cuyo scrape transitorio falla la
  comprobación de identidad.
- **Normalización del dossier** (genérica, sin fabricar evidencia):
  - dedupe de `authorizedNames`/`authorizedNumbers`/`discrepancies`/`limits`;
  - `debatable` sin dos publishers → se acepta como `direct`;
  - spans no contiguos → se conserva el prefijo contiguo desde el primero;
  - nombres/números listados sin anclaje en citas o identidad → se filtran.
- `cityName` añadido al contrato `NarrativeResearchStopInputV8` y a los tres
  callers (canary script, `NarrativeCanaryV8`, `NarrativeUserCanaryV8`).

## Resultados de los runs de Málaga (replay 11-22)

| Run | Fallo | Fix |
|---|---|---|
| 11 | `curator_contract_failed`: debatable con 1 publisher | rebaja a `direct` |
| 12 | `authority_insufficient` (map consumía presupuesto) | orden búsqueda antes que map |
| 13 | mismo fallo de curador debatable | prompt + rebaja determinista |
| 14 | scrape transitorio sin identidad | reintento único |
| 15-16 | queries sin desambiguar (Bing genérico) | nombre completo + ciudad, sin comillas |
| 17 | `authorized name not in evidence` | filtro de nombres sin evidencia |
| 18-19 | OpenAI mini truncado (`finish_reason=length`) | maxTokens 16k |
| 20-22 | modelo mini low + normalización | paradas 1-2 `sufficient` |

Último run: `narrative-v8-malaga-replay-22` → paradas 1 (Alcazaba) y 2
(Teatro romano) `sufficient`; parada 3 bloquea.

## Problema actual (exacto)

Parada 3: **Q969308 Palacio de los Condes de Buenavista** →
`authority_insufficient: fewer than two independent publishers`.

- Wikipedia API funciona (publisher 1, `wikimedia`). Falta el **segundo
  publisher** (dominio oficial).
- La parada **no tiene P856 propio**; solo hereda dominios genéricos
  (`malaga.eu`, `malaga.es`, `juntadeandalucia.es`, `administracion.gob.es`).
- Bing devuelve el **Palacio Real de Madrid** para el nombre completo.
- Firecrawl `/map` sobre `juntadeandalucia.es` con el nombre → **0 enlaces**.
- El presupuesto de 12 capturas se agota con homepages P856 y delegaciones de
  `/map`; las queries adaptativas ni llegan a ejecutarse.

**Riesgo general (no es solo Málaga):** Bing es el único motor sin API key y no
es fiable para todas las paradas → **en cualquier ciudad habrá paradas sin
segundo publisher descubrible**.

## Pendientes / decisiones para la siguiente sesión

1. **Opción B** (recomendada para generalizar): motor de descubrimiento con API
   key (Tavily/Serper/Brave/Marginalia), documentado pero no activado en
   `scripts/searxng-settings.yml`.
2. Validar con **otra ciudad** (hay artefacto de ruta de Barcelona) para
   demostrar que no depende de Málaga.
3. Mejora posible: reservar presupuesto para las queries adaptativas (hoy el
   bucle de captura agota los 12 intentos antes de llegar a ellas).
4. Decidir si el curador mini en `low` + normalización es suficiente o hace
   falta subir a reasoning `medium`/`high` (con `high` se truncaba; ya se subió
   maxTokens a 16k, se puede reintentar).

## Cómo continuar

```bash
cd backend
npx tsc --noEmit
npx jest src/services/poi/NarrativeSourcesV7.test.ts \
  src/services/poi/NarrativeResearchV8.test.ts \
  src/services/poi/NarrativeDossierV8.test.ts \
  src/services/poi/NarrativeCanaryV8.test.ts \
  src/services/poi/NarrativeUserCanaryV8.test.ts --runInBand

# Relanzar Málaga (run nuevo; cuesta <= 2 USD):
node -r ts-node/register scripts/validation/narrative-user-canary-v8.ts \
  --generate --allow-external --profile=balanced_openrouter \
  --prior-spend-usd=0 --city=Málaga --country=España --country-code=ES \
  --theme=history --language=es --duration=120 --city-qid=Q8851 \
  --run-id=narrative-v8-malaga-replay-XX \
  --route-artifact=tmp/narrative-v6/malaga-user-canary-openrouter-1/review.json
```

Artefactos por run (privados, gitignored):
`backend/tmp/narrative-v8/narrative-v8-malaga-replay-XX/`
(`review.json`, `diagnostics.private.json`, `progress.private.jsonl`,
`spend.private.jsonl`, `tour.md`).

Nota: sin la opción B, el resultado esperado es que las paradas sin dominio
oficial descubrible queden en `authority_insufficient` con diagnóstico claro
(eso es un resultado válido del Plan 64, no "motores suspendidos").

## Addendum de estado de implementación (2026-09-01)

**Nota histórica:** Los fallos de publisher/curador/Arc documentados en este plan son evidencia histórica que motivó la creación del Plan 66. No representan el resultado actual post-implementación.

**Estado actual:** La implementación del Plan 66 ha completado la migración de la frontera de evidencia V8, separando la suficiencia estricta V6 de la elegibilidad de ruta A/B/C V8 mediante una frontera determinista, Arc V8, Editorial V8 y scorecard/artefactos conscientes del manifiesto. La implementación del Plan 67 de checkpoint/resume está ahora completa, proporcionando checkpoints privados atómicos, reanudación de fase, reutilización parcial de scripts y prevención de Scorecard/Markdown en Editorial incompleto (ver [Plan 67](67-v8-canary-checkpoint-resume-plan.md)).

**Evidencia de validación completada:**
- 9 suites, 133 tests pasados.
- Backend `src` TypeScript pasó (`tsc --noEmit`).
- Verificación TypeScript directa de `narrative-user-canary-v8.ts` pasó.

**Pendiente:** La ejecución completa del canary de Málaga en vivo permanece intencionalmente pendiente para el usuario; no se reclama aprobación de publicación.
