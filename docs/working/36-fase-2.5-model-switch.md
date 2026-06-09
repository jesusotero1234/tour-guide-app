# 36 — Fase 2.5: Model Switch + Calibración

**Date:** 2026-06-09
**Board:** ✅ APPROVED WITH CHANGES (Claude Opus 4.7 Chair + ChatGPT 5.5 Reviewer)
**Status:** ✅ READY — 8 Board changes incorporated below

---

## 📋 Contexto

Fase 2 implementó el Fact Contract + validator con 7 fixes post-smoke-test. Mergeado a master (`05aef38`).

**Smoke test con llama3.1:8b (modelo equivocado):**

| Section | Result | Razón |
|---|---|---|
| Arrival | ❌ fallback | `banned-phrase-majestuoso` |
| History | ✅ PASS | "barroca", "1738" — limpio |
| Significance | ❌ fallback | `banned-phrase-majestuoso` |

**Análisis:** El validator funciona correctamente. El problema es el modelo: `llama3.1:8b` genera `majestuoso` tan agresivamente que 2/3 secciones agotan los 2 intentos y caen a fallback. Los fallbacks son limpios (templates sin AI-isms) pero no usan facts — son genéricos.

El Board ya dictaminó en Fase 2 que `qwen2.5:14b` es el modelo óptimo para narración en español. Pero nunca se configuró en el LLM pod — sigue usando `llama3.1:8b`.

---

## 🎯 Objetivo

Validar que con `qwen2.5:14b`:
1. Arrival + significance PASAN el validator (sin `majestuoso`, `imponente`, etc.)
2. History mantiene ≥3 facts usados
3. Ninguna sección va a fallback
4. Los claims no verificados son ≤1 por sección

---

## 📋 Plan de Ejecución

### Paso 1: Configurar qwen2.5:14b

Cambiar `NARRATIVE_MODEL` en el LLM pod de `llama3.1:8b` a `qwen2.5:14b`.

**Archivo:** `pods/llm-pod/.env` (o donde se configure `NARRATIVE_MODEL`)

Sin cambios de código — solo config.

### Paso 2: Smoke test ×3

Correr 3 generaciones idénticas con Palacio Real/es/history:

```bash
curl POST /narrative/stop/long \
  localName="Palacio Real de Madrid" language="es" theme="history" \
  wikidataClaims={P571:"1738",P84:"Filippo Juvarra",P149:"arquitectura barroca",P1435:"Patrimonio de la Humanidad"} \
  wikipediaBody="Construido desde 1738 por Filippo Juvarra y Juan Bautista Sachetti..."
```

**Métricas por repetición:**

| Métrica | Target |
|---|---|
| Secciones en fallback | 0 |
| History facts usados | ≥3 |
| Arrival facts usados | ≥1 |
| Banned phrases | 0 |
| Unverified claims | ≤1 |

### Paso 3: Code review

ChatGPT 5.5 revisa el diff mergeado (`a16bfd6..05aef38`) para confirmar que no hay regresiones.

---

## 🔗 Estado Actual

- **Rama:** `master` (mergeado)
- **Commit:** `05aef38`
- **LLM Pod:** corriendo con `llama3.1:8b` en `localhost:3002`
- **qwen2.5:14b:** instalado (9.0 GB) en Ollama Windows host
- **Validator:** funcional — bans, coverage gap, unverified claims, location drift

---

## 📎 Smoke Test Raw Data

### Test 1 (llama3.1:8b — 2026-06-09 17:50, pre-Board)

```
=== ARRIVAL ===
Llegamos a Palacio Real de Madrid, una parada de history en Madrid...
[DROPPED: arrival:banned-phrase-majestuoso:fallback]

=== HISTORY ===
El Palacio Real de Madrid tiene un pasado fascinante. Fíjate cómo su arquitectura 
barroca se destaca en el skyline urbano. Construido desde 1738, este edificio ha 
sido testigo de la historia de España
[PASS — no validation failures]

=== SIGNIFICANCE ===
Dentro de este recorrido por history, Palacio Real de Madrid ayuda a entender...
[DROPPED: significance:banned-phrase-majestuoso:fallback]
```

### Claim Check (post-generation)

```
totalExtracted: 8
verified: 3 (Filippo Juvarra, barroca, 1738)
unverified: 5
contradicted: 0
```

---

## ✅ Board Verdict — APPROVED WITH CHANGES

**Chair:** Claude Opus 4.7 · **Reviewer:** ChatGPT 5.5

8 changes incorporated. Plan above is amended; canonical execution order and exit criteria are below.

### Changes 1–5 (Chair, confirmed by Reviewer)

1. **Rollback path.** Document the exact env var revert (`NARRATIVE_MODEL=llama3.1:8b`) and pod restart command. If qwen smoke test fails on any of the 3 runs, revert before further investigation.
2. **Latency metrics.** Capture p50/p95 generation latency per section, per run. Fail the phase if qwen p95 > 2× llama p95 on any section.
3. **Other themes.** Smoke must cover all 3 themes (history, art, architecture) on Palacio Real, not history alone. AI-isms are theme-sensitive.
4. **Other languages.** One English run on the same place to confirm qwen's EN quality didn't regress vs llama (qwen was selected for ES; EN is a side-effect we must verify, not assume).
5. **Claim-check delta.** Report unverified-claims count for llama baseline AND qwen, side by side. Goal isn't just ≤1 — it's that qwen doesn't get worse than llama on factuality while winning on style.

### Changes 6–8 (Reviewer, accepted by Chair)

6. **Identical generation params across the model swap.** Per-section calibration from Fase 2 stays (arrival/history/significance keep their own temperatures). What must be identical is the *resolved param set per section* between the llama baseline and the qwen runs — same temperature, top_p, retries, and **pinned seed**. Pre-flight: dump resolved params before each run and diff. Unpin seed after the comparison concludes.
7. **VRAM pre-flight (not a separate phase).** Before Paso 2, run `ollama run qwen2.5:14b "hola"` with `nvidia-smi` watching. Abort if VRAM > 14 GB resident or any layer spills to CPU. The 9 GB weights + KV cache for our 4–8K context on a 16 GB RTX 5080 is tight but should fit; we just need to confirm, not assume.
8. **Baseline-before-switch ordering.** Folds into #2. Capture the llama baseline (3 runs) *before* flipping `NARRATIVE_MODEL`. No reverting just to backfill baseline.

### Canonical Execution Order

1. Capture llama3.1:8b baseline — 3 runs × 3 themes × ES + 1 EN run. Record latency p50/p95, banned-phrase hits, unverified-claim counts, fallback rate. Pin seeds.
2. Flip `NARRATIVE_MODEL` → `qwen2.5:14b`. Restart LLM pod.
3. **VRAM pre-flight** (#7). Abort and revert if cold-start spills to CPU.
4. Param diff check (#6). Resolved per-section params must match step 1.
5. Capture qwen2.5:14b runs — same matrix as step 1, same seeds.
6. Side-by-side comparison table (latency, AI-isms, fallback rate, unverified claims) per #5.
7. ChatGPT code review of `a16bfd6..05aef38`.

### Exit Criteria (must hold on qwen runs)

- 0 sections in fallback across all themes/languages
- 0 banned-phrase hits
- ≥3 facts used in history, ≥1 in arrival
- ≤1 unverified claim per section
- Unverified-claim count not worse than llama baseline
- p95 latency ≤ 2× llama baseline per section

### Rollback Trigger

Any single qwen run failing exit criteria → revert `NARRATIVE_MODEL` to `llama3.1:8b`, restart pod, open follow-up issue with raw outputs. Do not proceed to code review until smoke is green.
