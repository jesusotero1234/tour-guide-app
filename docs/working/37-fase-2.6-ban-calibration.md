# 37 — Fase 2.6: Calibración de Bans + Temperaturas

**Date:** 2026-06-09
**Board:** Pendiente (Claude Opus 4.7 Chair + ChatGPT 5.5 Reviewer)
**Status:** 📝 DRAFT

---

## 📋 Contexto

Fase 2.5 demostró que el problema no es el modelo — es el ban list:

| Modelo | Fallback rate |
|---|---|
| llama3.1:8b | 92% (11/12) |
| qwen2.5:14b | 100% (9/9) |

Ambos tropiezan con "imponente", "majestuoso", "majestuosidad". En español, "un edificio imponente" o "una fachada majestuosa" son descriptores normales que un guía humano usaría. NO son AI-isms.

### Taxonomía actual de bans

| Categoría | Ejemplos | ¿Debe seguir baneado? |
|---|---|---|
| **Descriptores de escala** | imponente, majestuoso, grandioso | ❌ NO — normales en español |
| **Sustantivos abstractos** | majestuosidad, grandiosidad | ⚠️ debate — más literario que funcional |
| **Invenciones sensoriales** | juego de luces, sombras, atmósfera, penumbra | ✅ SÍ — inventan lo que no se ve |
| **Invenciones de lujo** | fachada dorada, lujosa decoración, poder y riqueza | ✅ SÍ — no están en el Fact Card |
| **Meta-lenguaje** | testimonio de, refleja cómo, muestra cómo | ✅ SÍ — rompen la inmersión |
| **Inglés/otros** | imposing, majestic, atmosphère, majestätisch | ⚠️ debatir por idioma |

---

## 🎯 Objetivo

Reducir fallback rate a 0-1/12 sin sacrificar el bloqueo de invenciones reales.

---

## 📋 Cambios propuestos

### A. Quitar del ban list (descriptores normales)

```
IMPORTANTE: REMOVER:
- 'imponente', 'imponente fachada', 'imponente presencia'
- 'majestuoso'
- 'grandioso'

INGLÉS: REMOVER:
- 'imposing', 'majestic'
```

### B. Mantener en el ban list (invenciones reales)

```
MANTENER:
- 'majestuosidad', 'majestuosamente' (sustantivo/adverbio literario)
- 'juego de luces', 'sombras', 'atmósfera', 'penumbra' (sensorial)
- 'fachada dorada', 'lujosa decoración', 'lujosa', 'poder y riqueza'
- 'testimonio de', 'testimonio tangible'
- 'se alza majestuosamente' (combo AI-ism)
- Meta-lenguaje: 'fuentes limitadas', 'registros disponibles', etc.
```

### C. Añadir al ban list

```
NUEVOS (detectados en smoke tests):
- 'grandiosidad' (sustantivo abstracto, mismo patrón que majestuosidad)
- ES: 'se alza imponente', 'imponente estructura', 'presencia imponente'
- EN: 'breathtaking', 'awe-inspiring'
```

### D. Ajuste de temperaturas

| Sección | Actual | Propuesto | Razón |
|---|---|---|---|
| History | 0.2/0.15 | 0.2/0.15 | Sin cambio — ya funciona |
| Arrival | 0.5/0.3 | 0.4/0.25 | Reducir tendencia a adornar |
| Significance | 0.4/0.25 | 0.35/0.2 | Reducir tendencia a adornar |

---

## 🧪 Verificación

1. Mismo smoke test: 3 temas ES + 1 EN con qwen2.5:14b
2. Target: 0-1 fallbacks de 12 secciones
3. Si >1 fallback → revertir cambios de temperatura

---

## 🔗 Archivos

- `pods/llm-pod/src/routes/narrativeLong.ts` — `BANNED_OUTPUT_PHRASES`
- `pods/llm-pod/src/prompts/narrative/types.ts` — `BANNED_PHRASES`
- Temperaturas: `narrativeLong.ts` línea ~1092 (`sectionTemps`)
