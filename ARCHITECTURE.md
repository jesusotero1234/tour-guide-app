# Tour Guide App — Arquitectura del Pipeline

## Resumen

Pipeline de generación automática de audioguías turísticas con RAG semántico coordinate-first, validador factual 3-tier y generación de narración vía LLM.

**Escala a cualquier ciudad con índice pre-construido (build del corpus ~5s, tour completo 30-120s).** | **Benchmark Vilalba: 61% claims verificados, 0 contradicciones críticas.**

---

## Runtime Flow

```
Cliente (curl / frontend)
  │
  ▼
POST /api/v1/tours/generate  { city, theme, language, ... }
  │
  ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. OSM Pipeline         (~2-100s, según Overpass)           │
│    Geocode → Overpass → Wikidata enrich → Rank → Route       │
│    Salida: 5-7 POIs con wikidata + Wikipedia + osmTags      │
├─────────────────────────────────────────────────────────────┤
│ 2. Quality Gate         (instantáneo, shadow mode)          │
│    Evalúa rawPoolSize, wikidataTaggedCount, sitelinks...    │
│    shadow_failed → tour se genera igual (no bloquea)        │
├─────────────────────────────────────────────────────────────┤
│ 3. RAG Enrichment       (~0.5s por POI, best-effort)       │
│    CityKnowledgeBase → enrichment_server :11435             │
│    Nivel 2: geosearch corpus (ciudad + artículos cercanos)  │
│    Fallback si no hay índice: sin RAG (usa Wikipedia sola)  │
├─────────────────────────────────────────────────────────────┤
│ 4. Narración            (~5-30s por parada)                 │
│    NarrativeBuilder → LLM Pod :3002 → Ollama/OpenAI          │
│    4 secciones por stop: arrival, history, significance,    │
│    transition. Validador 3-tier post-generación.            │
├─────────────────────────────────────────────────────────────┤
│ 5. Imágenes             (~1s por POI, best-effort)         │
│    Wikipedia Commons API → fallback si no encuentra          │
├─────────────────────────────────────────────────────────────┤
│ 6. Persistencia         (PostgreSQL)                        │
│    Guarda tour + places + metadata → Devuelve JSON           │
├─────────────────────────────────────────────────────────────┤
│ 7. Audio                (asíncrono, opcional)               │
│    VoxCPM :3006 (primario) → Kokoro :3005 (fallback)        │
│    SKIP_AUDIO=true → devuelve sin audio                     │
└─────────────────────────────────────────────────────────────┘
  │
  ▼
Respuesta JSON con tour completo
```

---

## Diagrama de Servicios

```
┌──────────────────────────────────────────────────────────────────┐
│                    BACKEND (Express :3001)                       │
│                                                                  │
│  ┌─────────┐   ┌──────────┐   ┌────────────┐   ┌─────────────┐ │
│  │   OSM   │──▶│Enrichment│──▶│ Narrative  │──▶│   Audio     │ │
│  │Pipeline │   │  (RAG)   │   │  Builder   │   │ Generation  │ │
│  └────┬────┘   └────┬─────┘   └─────┬──────┘   └──────┬──────┘ │
│       │             │               │                  │        │
└───────┼─────────────┼───────────────┼──────────────────┼────────┘
        ▼             ▼               ▼                  ▼
   Overpass API  ┌──────────────────────────┐     ┌──────────────┐
                 │   LLM POD (Express :3002) │     │  TTS Pods    │
                 │                          │     │ :3005 Kokoro │
                 │  /narrative/stop/long    │     │ :3006 VoxCPM │
                 │  /enrichment/search      │     └──────────────┘
                 └────────┬─────────────────┘
                          │ proxy HTTP
                          ▼
                 ┌──────────────────┐
                 │ Enrichment       │
                 │ Sidecar :11435   │
                 │ Python + MiniLM  │
                 │ + turbovec       │
                 └──────────────────┘
            ┌─────────────────────────────┐
            │      PostgreSQL             │
            │  tours, places, caches      │
            └─────────────────────────────┘
```

---

## 1. OSM Pipeline (Selección de POIs)

**Entrada**: ciudad, tema, idioma, duración

1. **Geocode**: ciudad → coordenadas vía Nominatim (~200ms)
2. **Overpass API**: fetch POIs del tema. Historia → castillos, iglesias, museos. Con reintentos 429/504. Cachea en `poi_cache`
3. **Enriquecimiento Wikidata**: sitelinks, claims (fechas P571, estilos P149, arquitectos P84). Cachea en `poi_enrichment_cache`
4. **Ranking**: fame score (sitelinks + Wikidata claims) + walking route → top N stops

**Salida**: 5-7 POIs ordenados por walking route con nombre, coordenadas, wikidataClaims, wikipediaLead/Body, osmTags

---

## 2. Quality Gate

**Modo**: shadow (no bloquea, solo registra). Configurable vía `TOUR_CONFIDENCE_GATE_MODE`.

Señales evaluadas:
- `rawPoolSize`: POIs totales en la ciudad
- `wikidataTaggedCount`: POIs con datos estructurados
- `sitelinksResolvedRatio`: proporción con sitelinks de Wikidata
- `maxSitelinks`: máximo sitelinks entre los POIs
- `routeFlagshipCount`: POIs flagship en la ruta
- `routeDuplicateWikidataCount`: POIs duplicados
- `routeMaxCategoryShare`: concentración en una sola categoría

**Resultado**: `shadow_passed` (score ≥ 0.6) o `shadow_failed` (<0.6). Vilalba: shadow_failed (0.45).

---

## 3. RAG Enrichment (Enriquecimiento Semántico)

### Stack
- **Embeddings**: `paraphrase-multilingual-MiniLM-L12-v2` (384-dim, multilingüe, 470MB)
- **Índice**: `turbovec.TurboQuantIndex` (4-bit cuantizado, ~400 bytes/vector)
- **Servidor**: Python sidecar HTTP en `:11435` (proceso independiente, proxy vía llm-pod)

### Construcción de Corpus — Coordinate-First

```bash
python3 build_city_corpus.py Vilalba --lang es -o corpus.json
```

1. **Geocode** ciudad → (lat, lon)
2. **Wikipedia geosearch**: artículos en radio 5-10km (gslimit=50, score + rank)
3. **Filtrado**: descartar estaciones, molinos, parkings, autopistas, ríos
4. **Fetch extracts**: ~1500 chars por chunk
5. **Indexar**: `python3 enrich.py build corpus.json vilalba_index/`

Funciona para cualquier idioma de Wikipedia (`--lang es/de/fr...`). Requiere índice pre-construido (~5s por ciudad).

⚠️ **El índice no versiona por idioma**: `--lang de` y `--lang es` para la misma ciudad pisan el mismo índice. Si necesitas corpus multilingüe, usa nombres de índice distintos (ej: `vilalba_es_index`, `vilalba_de_index`).

### Fallback si no hay índice

Si no existe `{city}_index/` en `ENRICHMENT_INDEX_BASE_DIR`, el RAG se omite silenciosamente y el POI usa solo Wikipedia/Wikidata como semillas. El tour se genera igual, con calidad reducida para thin seeds.

### Búsqueda con Quotas por Nivel

```
POI thin (<300 chars seed)?
  → enrichment_server.search(city, query, k=8)
  → deduplicatePassages (Jaccard < 0.55)
  → applyLevelQuotas:
      poi=2, city=2, comarca=1, province=1, region=1
      orden: poi > city > comarca > province > region
      cap: 3 total
```

### Formato del Corpus Enriquecido (con Level Labels)

```
--- DATOS DEL POI (fuente verificada sobre este lugar) ---
✅ PUEDES usar estos datos para afirmar hechos sobre este lugar.
[texto de Wikipedia del POI]

--- CONTEXTO LOCAL — ciudad ---
⚠️ Usa para atmósfera/orientación local. NO atribuyas fechas, arquitectos...
[texto de artículos cercanos al POI]
```

---

## 4. Generación de Narración

### Modelos
- **Orquestación**: `gemma4:26b` (tour-level decisions). Configurable: `OLLAMA_MODEL`
- **Narración**: `llama3.1:8b` (section-level generation). Configurable: `NARRATIVE_MODEL`

### API Contract — POST /narrative/stop/long

```json
// Request
{
  "traceId": "uuid",
  "localName": "Pazo de Meire",
  "seeds": {
    "wikipediaLead": "...",
    "wikipediaBody": "...",
    "wikidataClaims": { "P571": "1290" },
    "osmTags": { "historic": "manor" },
    "enrichedContext": "--- DATOS DEL POI ---\n..."
  },
  "theme": "history",
  "language": "es",
  "position": "middle",
  "seedQuality": "rich",
  "targetWords": "70 to 90"
}

// Response
{
  "sections": {
    "arrival": "La fachada de piedra gris...",
    "history": "En el siglo XV...",
    "significance": "Lo que hace único...",
    "transition": "Ahora caminemos hacia..."
  },
  "narration": "...",
  "meta": {
    "claimCheck": {
      "verifiedRate": 0.61,
      "contradictedRate": 0,
      "criticalFailCount": 0
    }
  }
}
```

### Política Thin-Seed (Fase A)
Cuando el POI tiene <500 chars de datos:
- ❌ PROHIBIDO: fechas, arquitectos, estilos, eventos históricos
- ✅ PERMITIDO: descripción visible, atmósfera, materiales
- Ejemplo: "The public record on this place is sparse, but standing here you can feel..."

---

## 5. Validador 3-Tier

### Clasificación de Claims

| Tipo | Extracción | Severidad UNVERIFIED | Severidad CONTRADICTED |
|------|-----------|---------------------|----------------------|
| date | Años 300-2030 + siglos | warning | critical |
| style | gótico, barroco, mudéjar... | warning | critical |
| architect | "por X", "obra de X" | warning | critical |
| material | granito, ladrillo, mármol... | info | warning |
| measurement | "60 metros", "35 ha" | info | warning |

### Fuentes de Verificación (Tiered Corpus)

```
Tier HIGH:    Wikidata claims (P571, P149, P84...) → puede verificar
Tier MEDIUM:  Wikipedia + POI-level enriched context → puede verificar
Tier LOW:     Wikivoyage → solo materiales/medidas
Tier REGIONAL: City/region context → NUNCA verifica claims del POI
```

### Ejemplo de Salida
```json
{
  "claimCheck": {
    "totalExtracted": 7,
    "verifiedRate": 0.71,
    "contradictedRate": 0,
    "unverifiedRate": 0.29,
    "criticalFailCount": 0
  }
}
```

---

## 6. Persistencia y Cachés

| Tabla/Caché | Propósito | Best-effort |
|-------------|-----------|-------------|
| `tours` + `places` | Datos del tour generado | ❌ Obligatorio |
| `poi_cache` | POIs de Overpass por ciudad/tema | ✅ Sí |
| `poi_enrichment_cache` | Wikidata claims cacheados | ✅ Sí |
| `poi_narration_cache` | Narraciones generadas (por modelo/tema/idioma) | ✅ Sí |
| `enrichment_cache` | Resultados RAG cacheados | ⚠️ Definido en schema.prisma pero sin migración SQL. El código lo maneja con try/catch |

---

## 7. Configuración y Feature Flags

| Variable | Default | Descripción |
|----------|---------|-------------|
| `ENRICHMENT_ENABLED_CITIES` | `madrid` | Ciudades con RAG activo. `*` = todas |
| `ENRICHMENT_INDEX_BASE_DIR` | (auto) | Ruta a índices turbovec |
| `SKIP_AUDIO` | `false` | Saltar generación de audio (dev/testing) |
| `OLLAMA_HOST` | `localhost:11434` | URL de Ollama |
| `OLLAMA_MODEL` | `gemma4:26b` | Modelo de orquestación |
| `NARRATIVE_MODEL` | `llama3.1:8b` | Modelo de narración |
| `TOUR_CONFIDENCE_GATE_MODE` | `shadow` | Modo del quality gate |

### Auth y Rate Limiting

- **API Key**: `X-API-Key: development-api-key` requerido en todas las requests
- **Rate limit**: 100 requests por ventana de 15 minutos (configurable: `RATE_LIMIT_MAX_REQUESTS`, `RATE_LIMIT_WINDOW_MS`)

---

## 8. Fallbacks y Degradación

| Escenario | Comportamiento |
|-----------|---------------|
| Sin índice RAG para la ciudad | RAG omitido. POI usa Wikipedia/Wikidata sola |
| Sidecar Python caído | LLM pod usa modo fallback (spawn enrich.py por request, +3-8s) |
| Ollama caído | Error en generación. Tour no se completa |
| TTS caído | Con `SKIP_AUDIO=true` devuelve sin audio |
| Quality gate shadow_failed | Tour se genera igual. Solo logging |
| Wikipedia sin artículo del POI | Thin-seed: prompt restrictivo, solo descripción visible |
| Overpass rate-limited | Reintentos 429/504. Hasta 3 intentos con backoff |

---

## 9. Limitaciones Conocidas

- **RAG requiere índice pre-construido**: sin él, calidad baja en pueblos pequeños
- **Benchmark no garantiza calidad global**: probado en 4 ciudades españolas
- **Wikidata SPARQL no funciona desde WSL2**: corpus se construye vía Wikipedia REST
- **Ollama local**: latencia 5-30s por sección. OpenAI API sería ~2-5s
- **Audio asíncrono**: la generación de audio es opcional (`SKIP_AUDIO=true` la omite). En producción, TTS primario (VoxCPM :3006) con fallback a Kokoro (:3005)
- **`enrichment_cache` sin migración**: definido en schema.prisma pero la tabla no existe en BD. El código usa try/catch para no bloquear
- **Validador 3-tier**: falsos positivos en transiciones cross-stop (mitigado con `isTransitionContext`)

---

## 10. Benchmark

| Ciudad | POIs | Wikidata % | ✅ Verified | ❌ Contradicted | RAG |
|--------|------|-----------|-------------|-----------------|-----|
| Toledo | 120+ | alta | 89% | 0 | ✅ POI-level |
| Barcelona | 257 | ~100% | 79% | 0 | ❌ |
| Castellón | 34 | 76% | 71% | 1 real | ❌ |
| Vilalba | 20 | 10% | 61% | 0 | ✅ N2 geo-corpus |

**Cómo reproducir** (requiere servicios arriba + `SKIP_AUDIO=true`):
```bash
# Toledo arte (con índice RAG POI-level)
curl -X POST http://localhost:3001/api/v1/tours/generate \
  -H "Content-Type: application/json" -H "X-API-Key: development-api-key" \
  -d '{"city":"Toledo","country":"Spain","countryCode":"ES","theme":"art","language":"es","durationMinutes":120,"maxStops":5}'

# Vilalba historia (con índice RAG N2 geo-corpus, commit d9f93e8)
curl ... -d '{"city":"Vilalba","theme":"history","language":"es","durationMinutes":120,"maxStops":5}'
```
Modelos: `gemma4:26b` (orquestación) + `llama3.1:8b` (narración). Inspeccionar `claimCheck` en logs del backend.

---

## 11. Archivos Clave

| Archivo | Rol |
|---------|-----|
| `pods/llm-pod/src/enrichment/build_city_corpus.py` | Constructor de corpus coordinate-first |
| `pods/llm-pod/src/enrichment/enrichment_server.py` | Servidor RAG HTTP :11435 |
| `pods/llm-pod/src/enrichment/enrich.py` | Build/search CLI turbovec |
| `backend/src/services/enrichment/CityKnowledgeBase.ts` | Quotas, level labels, enriquecimiento |
| `backend/src/services/narrative/NarrativeBuilder.ts` | Orquestación de generación |
| `pods/llm-pod/src/routes/narrativeLong.ts` | Validador 3-tier + generación por sección |
| `pods/llm-pod/src/prompts/narrative/types.ts` | System prompts + thin-guard |
| `pods/llm-pod/src/llm/model.ts` | Cliente Ollama (chat + complete) |
| `backend/src/api/routes/index.ts` | Endpoint `POST /generate` |
| `backend/src/services/orchestrationService.ts` | Quality gate + orquestación |
