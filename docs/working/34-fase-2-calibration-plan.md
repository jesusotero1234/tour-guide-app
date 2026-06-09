# Fase 2 — Board-Directed Model Calibration Plan

**Date:** 2026-06-09  
**Board:** Claude Opus 4.7 (Chair) + ChatGPT 5.5 (Reviewer)  
**Verdict:** Unanimous — VEREDICTO UNIFICADO  
**Code Review:** ChatGPT 5.5 — APPROVE WITH CHANGES (incorporated below)  
**Status:** ⏳ Awaiting final Board sign-off

---

## 📋 Resumen Ejecutivo

Fase 1a (ban lists, golden rule, native prompts) eliminó la alucinación atmosférica pero creó un nuevo fallo: el modelo evita usar los hechos del Fact Card por miedo a inventar. El Board determinó que el problema es estructural (polaridad solo negativa en prompts) y de modelo (ni llama3.1:8b ni gemma4:26b son óptimos).

**Solución:** Fact Contract (polaridad positiva obligatoria) + modelo 14B + calibración por sección.

---

## 🎯 Objetivos

1. **Encontrar el modelo óptimo** para narración factual en español dentro de 16GB VRAM
2. **Implementar Fact Contract** con anchors por categoría y cobertura obligatoria
3. **Calibrar temperatura** por sección para balancear factualidad y fluidez
4. **Validator post-generación** robusto con normalización y separación de tipos de fallo

---

## 📦 Modelos

| Prioridad | Modelo | Estado | VRAM est. |
|---|---|---|---|
| 🥇 | qwen2.5:14b | ✅ Instalado (9.0GB) | ~9GB Q4 |
| 🥈 | phi4:14b | ⬜ Pull pendiente | ~9GB Q4 |
| 🔬 | mistral-nemo:12b | ⬜ Solo si Fase 2 | ~7GB Q4 |
| ⚠️ | llama3.1:8b (baseline) | ✅ Instalado | ~6GB |
| ⚠️ | gemma4:26b (referencia) | ✅ Instalado | ~18GB |

---

## 🏗️ Arquitectura — Fact Contract v2

> *Updated per ChatGPT 5.5 review: anchors by category, robust validator with normalization, separated failure types.*

### Anchors por sección (por categoría, no por prop ID)

```typescript
type FactCategory = 'year_built' | 'architect' | 'creator' | 'style' | 
                    'heritage' | 'material' | 'location' | 'event' | 'measurement';

const PROP_TO_CATEGORY: Record<string, FactCategory> = {
  P571: 'year_built', P1619: 'year_built',  // fechas → year_built
  P84: 'architect', P170: 'creator',         // arquitecto/creador
  P149: 'style',                              // estilo
  P1435: 'heritage',                          // patrimonio
  P186: 'material', P276: 'location',
  P793: 'event', P2048: 'measurement',
};

const SECTION_ANCHORS: Record<SectionName, { categories: FactCategory[]; minCoverage: number }> = {
  history: {
    categories: ['year_built', 'architect', 'creator', 'style', 'heritage'],
    minCoverage: 3,
  },
  arrival: {
    categories: ['material', 'location'],  // opcionales, sin mínimo
    minCoverage: 0,
  },
  significance: {
    categories: ['heritage', 'event'],
    minCoverage: 1,
  },
};
```

### Prompt — Doble polaridad

```typescript
// POSITIVA (nueva — se inyecta ANTES de la golden rule en sectionSystem)
const FACT_CONTRACT_ES = `CONTRATO DE HECHOS: Los HECHOS VERIFICADOS son seguros y DEBES 
usarlos. Fechas, arquitectos, estilos y materiales están PERMITIDOS cuando aparecen en 
HECHOS VERIFICADOS. History debe incluir al menos 3 hechos.`;

// NEGATIVA (reformulada)
const GOLDEN_RULE_ES = `REGLA DE ORO: No añadas afirmaciones factuales fuera de los datos 
proporcionados. Prohibido inventar fechas, arquitectos, estilos, materiales no visibles, 
eventos. Permitido: describir lo visible y conectar narrativamente los hechos del contrato.`;
```

### formatStructuredFacts() — Sin fuentes visibles

```diff
- HECHOS VERIFICADOS (usa solo estos — no inventes fechas, arquitectos ni estilos):
- - Arquitecto: Filippo Juvarra [fuente: Wikidata P84, confianza: high]
+ HECHOS VERIFICADOS — USA ESTOS DATOS:
+ - Arquitecto: Filippo Juvarra
+ - Año: 1738
+ - Estilo: barroco clasicista italiano
```

### Validator — hasFactCoverageGap() v3

> *Updated: handles history + significance, enrichedContext fallback, thin-seed correctly*

```typescript
function extractClaimsFromContext(input: LongNarrativePromptInput): Record<string, string> {
  // Primary: Wikidata claims
  if (input.seeds.wikidataClaims && Object.keys(input.seeds.wikidataClaims).length > 0) {
    return input.seeds.wikidataClaims;
  }
  // Fallback: extract facts from enrichedContext/wikipediaBody via regex
  const context = input.seeds.enrichedContext || input.seeds.wikipediaBody || '';
  const claims: Record<string, string> = {};
  // Extract dates (years)
  const yearMatch = context.match(/(\d{4})/g);
  if (yearMatch) claims['P571'] = yearMatch[0];
  // Extract names (capitalized multi-word patterns)
  const nameMatch = context.match(/diseñado por ([A-ZÁÉÍÓÚ][a-záéíóú]+ [A-ZÁÉÍÓÚ][a-záéíóú]+)/i);
  if (nameMatch) claims['P84'] = nameMatch[1];
  // Extract styles
  const styleMatch = context.match(/(barroco|gótico|renacentista|neoclásico|románico|modernista)[a-z]*/i);
  if (styleMatch) claims['P149'] = styleMatch[0];
  return claims;
}

function hasFactCoverageGap(
  section: string, 
  input: LongNarrativePromptInput, 
  name: SectionName
): string | null {
  const anchors = SECTION_ANCHORS[name];
  if (!anchors || anchors.minCoverage === 0) return null;
  
  const claims = extractClaimsFromContext(input);
  
  // Map claims to categories
  const claimsByCategory: Map<FactCategory, { propId: string; terms: string[] }[]> = new Map();
  for (const [propId, value] of Object.entries(claims)) {
    const category = PROP_TO_CATEGORY[propId];
    if (!category || !anchors.categories.includes(category)) continue;
    if (!claimsByCategory.has(category)) claimsByCategory.set(category, []);
    claimsByCategory.get(category)!.push({ propId, terms: expandFactTerms(value, category) });
  }
  
  const availableCategories = [...claimsByCategory.keys()];
  if (availableCategories.length === 0) return null;
  
  // thin-seed: reduced requirement
  const effectiveMin = input.seedQuality === 'thin' 
    ? Math.min(1, availableCategories.length)
    : anchors.minCoverage;
  
  const normalizedSection = normalizeNFD(section).toLowerCase();
  const requiredCount = Math.min(effectiveMin, availableCategories.length);
  
  const coveredCategories = availableCategories.filter(category => {
    const claimEntries = claimsByCategory.get(category)!;
    return claimEntries.some(entry =>
      entry.terms.some(term => normalizedSection.includes(term))
    );
  });
  
  if (coveredCategories.length < requiredCount) {
    const missingCategories = availableCategories.filter(c => !coveredCategories.includes(c));
    const missingPropIds = missingCategories
      .flatMap(c => claimsByCategory.get(c)!.map(e => e.propId));
    return `fact-coverage:${coveredCategories.length}/${requiredCount}:missing=${missingPropIds.join(',')}`;
  }
  return null;
}
```
### Retry con missing facts (localizado)

Si `validateSection` devuelve `fact-coverage:*`, el prompt de retry incluye:
```typescript
const missingFactsPrompt = language === 'es'
  ? `Intento anterior falló — faltaron estos hechos: ${missingLabels.join(', ')}. Reescribe incluyéndolos.`
  : `Previous attempt failed — missing facts: ${missingLabels.join(', ')}. Rewrite including them.`;
```

---

## 🌡️ Calibración por sección

| Sección | Temp intento 1 | Temp intento 2 | top_p | max_tokens |
|---|---|---|---|---|
| arrival | 0.5 | 0.3 | 0.9 | 220 |
| **history** | **0.2** | **0.15** | **0.8** | **260** |
| significance | 0.4 | 0.25 | 0.9 | 220 |
| transition | 0.5 | 0.3 | 0.9 | 150 |

---

## 🧪 Plan de Prueba

### Fase 1 — Smoke Test (36 generaciones con repeticiones)

> *Updated per ChatGPT: 3 repeticiones por combinación, baseline incluido*

**Modelos:** qwen2.5:14b, phi4:14b, llama3.1:8b (baseline)  
**Fact Cards:** 
1. Palacio Real de Madrid (historia, rico en Wikidata)
2. Un POI arqueológico o religioso (perfil diferente)  
**Secciones:** arrival, history, significance (×2 stops)  
**Repeticiones:** 3 por combinación crítica

**Total:** 3 modelos × 2 Fact Cards × 3 secciones × 3 reps = **54 generaciones totales**

| Métrica | Definición | Target |
|---|---|---|
| `anchor_coverage` | % de categorías requeridas cubiertas en history | ≥ 80% |
| `factual_drift_count` | Claims factuales no en Fact Card (rúbrica: fecha, nombre, estilo, material, evento) | 0 |
| `banned_sensory_count` | Invención atmosférica/sensorial (luz, sombras, atmósfera, sensaciones) — métrica separada | 0 |
| `unused_required_facts` | Categorías del Card con facts disponibles no usados | ≤ 1 |
| `fluency_es` | Escala 1-5 (manual): naturalidad, ritmo de guía, español nativo | ≥ 3 |
| `validator_pass_rate` | % intentos que pasan validator, desglosado por tipo: parse_fail, banned_phrase, coverage_gap, factual_drift | ≥ 85% |
| `latency_p50` / `latency_p95` | ms por generación | p50 < 8s, p95 < 15s |

### Rúbrica de factual_drift_count

Cuenta como factual drift si el output afirma:
- Una fecha/año/siglo no en Fact Card
- Un nombre de arquitecto/artista/personaje no en Fact Card
- Un estilo arquitectónico no en Fact Card
- Un material específico no en Fact Card ni visible
- Un evento histórico no en Fact Card

### Rúbrica de banned_sensory_count (métrica separada)

Cuenta como banned sensory si el output contiene:
- Atmósfera, ambiente, luz, sombras, penumbra
- Sensaciones (frío, calor, olor, textura no visible)
- Estado emocional de personajes históricos o visitantes

NO cuenta como drift ni banned:
- Descripciones genéricas visibles ("piedra", "muros", "gran escala")
- Conectores narrativos ("frente a ti", "a tu izquierda")
- Actividad urbana observable ("tráfico", "turistas")

### Edge cases cubiertos

| Edge case | Manejo |
|---|---|
| Fact Card sin Wikidata, solo Wikipedia | Validator extrae facts de `enrichedContext` y `wikipediaBody` como fuente secundaria cuando `wikidataClaims` está vacío. Se extraen entidades (fechas, nombres, estilos) vía regex. |
| POI famoso (modelo sabe más que Fact Card) | Golden rule prohíbe usar conocimiento previo; validator detecta drift comparando claims contra Fact Card + enrichedContext |
| `seedQuality === thin` con claims útiles | Validator aplica `minCoverage=1` (reducido) si hay al menos 1 categoría con datos |
| Multi-valores: varios arquitectos | `expandFactTerms()` descompone por `,`, `y`, `&` |
| Food theme | `historyPrompt()` tiene ruta especial en código existente |
| Fallback no cumple coverage | Fallback se excluye de métricas; se reporta como `fallback_used` |
| Facts redundantes (P571 y P1619) | Ambas mapean a `year_built`; cobertura cuenta la categoría, no el prop |

### Criterio de avance

- Ganador claro en ≥ 3 métricas (incluyendo anchor_coverage, factual_drift_count, y banned_sensory_count) → avanzar
- Empate → Fase 2 con matriz ampliada
- Ambos fallan factual_drift_count > 0 o banned_sensory_count > 0 → corregir Fact Contract antes de Fase 2

---

## 📁 Archivos a modificar

| Archivo | Cambio |
|---|---|
| `pods/llm-pod/src/prompts/narrative/types.ts` | +FACT_CONTRACTS, reformular GOLDEN_RULES, formatStructuredFacts() sin fuentes, +PROP_TO_CATEGORY |
| `pods/llm-pod/src/prompts/narrative/history.ts` | +TASK con cobertura explícita, +missing facts localizados en retry |
| `pods/llm-pod/src/routes/narrativeLong.ts` | +SECTION_ANCHORS, +hasFactCoverageGap() v2, +expandDateTerms(), +expandFactTerms(), validateSection(name), retry con missingFacts, métricas desglosadas |
| ~~`pods/llm-pod/src/config/env.ts`~~ | ~~NARRATIVE_HISTORY_MODEL~~ → pospuesto: usar NARRATIVE_MODEL global primero |

---

## ✅ Criterios de Éxito

- [ ] history con anchor_coverage ≥ 80% en qwen2.5:14b
- [ ] 0 hallucination_count en 2 Fact Cards distintas
- [ ] validator_pass_rate ≥ 85% (con desglose por tipo)
- [ ] latency p50 < 8s, p95 < 15s
- [ ] fluency_es ≥ 3 en revisión manual
- [ ] Board aprueba el modelo y la implementación final

---

## 📅 Timeline

| Día | Actividad | Entregable |
|---|---|---|
| **Día 1** | Fact Contract v2 + validator robusto | Código compilado, tests pasan |
| **Día 2** | Smoke test: qwen2.5:14b vs phi4:14b vs baseline | Tabla 54 generaciones + métricas |
| **Día 3** | Decisión + calibración fina (o Fase 2) | model_card.md, modelo seleccionado |

---

## 📝 Changelog

| Versión | Cambio | Autor |
|---|---|---|
| v1 | Plan inicial | Board (Claude + ChatGPT) |
| v2 | Anchors por categoría, validator robusto, métricas ampliadas, edge cases, 3 reps, baseline incluido | ChatGPT 5.5 review |

---

*Board Chair: Claude Opus 4.7 | Reviewer: ChatGPT 5.5 | Verdict: UNANIMOUS | v2 — Awaiting final sign-off*
