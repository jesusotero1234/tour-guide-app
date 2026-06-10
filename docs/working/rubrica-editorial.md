# Rúbrica Editorial — Tour Guide Narrative Quality

**Date:** 2026-06-10
**Version:** 1.0
**Scope:** Criterio de calidad para narración generada

---

## Criterios por sección

Una sección buena debe cumplir TODOS los siguientes:

### 1. Factualidad (HARD FAIL)
- Sin claims fuera de evidencia disponible (dates, architects, styles, events, locations)
- Los claims verificables deben aparecer en el corpus de seeds (Wikidata, Wikipedia, enrichedContext)
- Si no hay evidencia para un claim, el sistema debe rechazarlo, no silenciarlo

### 2. Concreción (HARD FAIL si vacío)
- Al menos 1 detalle verificable o visible por sección
- Los detalles deben ser específicos, no genéricos
- Ejemplo bueno: "La fachada combina ladrillo visto con placas de granito gris"
- Ejemplo malo: "Es un edificio impresionante con una arquitectura notable"

### 3. Voz de guía real (SOFT)
- Suena a guía real, no a brochure turística
- Usa "tú" (es), "you" (en), lenguaje directo y coloquial culto
- Sin adjetivación vacía: "majestuoso", "impresionante", "increíble"

### 4. No meta-lenguaje (HARD FAIL)
- No menciona fuentes, limitaciones de datos, ni reglas internas
- Baneado: "según los registros", "fuentes limitadas", "datos verificados"
- Baneado: "sin añadir datos no verificados", "nos ceñimos a los hechos"

### 5. Utilidad (SOFT)
- Ayuda al visitante a leer el lugar
- Da claves de observación, no solo datos
- Conecta el detalle con la experiencia del visitante

### 6. Naturalidad (SOFT)
- Español/inglés fluido sin estructuras robóticas
- Sin frases formulaicas tipo "es un lugar emblemático", "steeped in history"
- Ritmo variado — no todas las frases con la misma estructura

### 7. Brevedad (HARD FAIL si fuera de rango)
- 45-140 palabras por sección
- Rich seeds: 70-90 palabras/objetivo
- Thin seeds: 60-80 palabras/objetivo

---

## Categorías de fallo

| Categoría | Tipo | Acción |
|-----------|------|--------|
| `unverified-date` | HARD | Reintentar con facts faltantes o degradar |
| `unverified-architect` | HARD | Reintentar o degradar |
| `unverified-style` | HARD | Reintentar o degradar |
| `unverified-location` | HARD | Reintentar o degradar |
| `banned-phrase` | HARD | Reintentar con instrucción anti-cliché |
| `banned-meta` | HARD | Reintentar sin meta-lenguaje |
| `fact-coverage` | HARD | Reintentar con facts faltantes |
| `word-count` | HARD | Reintentar con rango objetivo |
| `formal-register` | HARD | Reintentar con "tú" |
| `language-drift` | HARD | Reintentar en idioma correcto |
| `generic-shape` | HARD | Reintentar con más detalle |
| `repetition` | HARD | Reintentar con anti-repetición |
| `unsupported-drift` | HARD | Degradar (thin seed limitation) |
| `style-soft` | SOFT | Log + aceptar si factual |
| `unnatural-prose` | SOFT | Log + aceptar si factual |
