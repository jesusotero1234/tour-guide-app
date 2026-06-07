# 25 — Plan de trabajo: diversidad upstream para evitar category collapse

## Problema

El confidence gate y el auto-repair v1 ya hacen su trabajo: detectan y, a veces, rescatan tours cuya ruta final colapsa en una sola categoria.

El caso tipo Lima mostro un limite claro: cuando el ranking y la seleccion upstream ya entregan un shortlist y una ruta casi monopolizados por `memorial`, el repair downstream tiene poco margen real para recomponer una ruta defendible.

La causa raiz no es que el gate sea demasiado estricto ni que falte un hardcode por ciudad. La causa raiz es que el pipeline premia demasiado la relevancia bruta de una categoria dominante antes de aplicar suficiente presion por diversidad.

## Objetivo

Corregir el problema en el origen del pipeline para que:

- no se hardcodeen ciudades ni landmarks
- no se relajen thresholds del confidence gate
- la seleccion inicial ya favorezca rutas mas defendibles
- el repair quede como red de seguridad, no como solucion principal
- casos tipo Lima puedan pasar estructuralmente si el pool realmente contiene alternativas viables

## Decisiones

1. No relajar `routeMaxCategoryShare <= 0.7`.
2. No penalizar `memorial` por ser `memorial`; penalizar el monopolio de cualquier categoria.
3. No introducir blacklist por nombres de POIs en esta fase.
4. Arreglar primero ranking y composicion; extender repair solo si aun hace falta.
5. Validar siempre contra ciudades verified antes de considerar el cambio seguro.

## Alcance

Si entra en esta iteracion:

- fixture sintetico que reproduzca category collapse con alternativas viables
- ajuste upstream en `PoiRanker.ts`
- ajuste de composicion en `RouteSelection.ts`
- revalidacion con tests y scripts existentes
- uso opcional de `instanceOfLabels` solo si el caso sigue sin resolverse

No entra en esta iteracion inicial:

- hardcodes por ciudad
- cambios de frontend
- relajacion del gate
- panel admin
- ML o perfiles persistentes por ciudad
- refactorizaciones grandes fuera del area de ranking/seleccion

## Plan de ejecucion

### Fase 1: baseline y lectura minima

1. Revisar `git status` y no tocar cambios ajenos.
2. Leer solo los archivos necesarios:
   - `backend/src/services/poi/PoiRanker.ts`
   - `backend/src/services/poi/RouteSelection.ts`
   - `backend/src/services/poi/LandmarkTiering.ts`
   - tests relacionados si existen
3. Ejecutar baseline:
   - `npm run build`
   - `npx jest --runInBand`

Objetivo de esta fase: confirmar que el punto de partida compila y que no se mezclan fallos ajenos.

### Fase 2: fixture sintetico tipo Lima

Crear un fixture de test sin ciudad real ni red que tenga:

- 10-14 candidatos `memorial` con score alto
- 5-8 candidatos alternativos defendibles de categorias variadas
- sitelinks/fame suficientes para que los alternativos sean plausibles, pero no lideres absolutos

El fixture debe demostrar dos cosas:

1. La seleccion ingenua o actual tenderia al colapso.
2. Tras el fix, la ruta final no deberia exceder `routeMaxCategoryShare > 0.7` si existen alternativas viables.

Ubicaciones candidatas para el test:

- `backend/src/services/poi/RouteSelection.test.ts`
- `backend/src/services/poi/PoiRanker.test.ts`

Si no existe el archivo adecuado, crear el test minimo nuevo siguiendo el estilo del repo.

### Fase 3: diversidad en ranking upstream

Modificar `backend/src/services/poi/PoiRanker.ts` para que el top de candidatos no se construya solo por score bruto cuando una categoria ya esta sobrerrepresentada.

Implementacion recomendada:

- mantener `baseScore` actual
- al construir la seleccion parcial, calcular `share` por categoria dentro de lo ya elegido
- aplicar una penalizacion suave y proporcional al `share` de la categoria del candidato
- reordenar por `adjustedScore`, sin descartar candidatos por completo

Propiedades deseadas:

- generico para cualquier categoria
- seguro cuando hay pocas alternativas
- pequeno y facil de razonar

Ejemplo conceptual:

```ts
const share = categoryCount / Math.max(1, selected.length);
const overuse = Math.max(0, share - 0.5);
const penalty = 1 + overuse * 3;
const adjustedScore = baseScore / penalty;
```

No convertir esto en un sistema configurable nuevo salvo que el archivo ya use constantes de ese estilo.

### Fase 4: reforzar composicion de ruta

Revisar `backend/src/services/poi/RouteSelection.ts`, en particular `buildDiversePrefix` o helper equivalente.

Objetivo:

- cuando ya hay suficientes repeticiones de una categoria, no seguir eligiendo automaticamente la siguiente del mismo tipo si existen alternativas razonables

Implementacion recomendada:

- contar apariciones por categoria dentro de la ruta parcial
- introducir una penalizacion creciente despues de la segunda aparicion
- favorecer una categoria alternativa si la diferencia de score no es enorme
- no aplicar caps rigidos globales que puedan romper ciudades sanas

Ejemplo conceptual:

```ts
const categoryPenalty = 1 + Math.max(0, categoryCount - 1) * 0.35;
const adjustedScore = candidateScore / categoryPenalty;
```

### Fase 5: validar gate sin relajarlo

Ejecutar y ajustar tests para confirmar que:

- `category_collapse` sigue disparando cuando corresponde
- `coverage_ratio_too_high` no se degrada
- `auto_approved` y `auto_repaired` mantienen su semantica actual

No tocar thresholds salvo instruccion explicita del humano.

### Fase 6: validar con caso real

Usar el script estructural existente para reintentar el caso Lima o su equivalente real.

Objetivo esperado:

- la ruta ya no debe ser 10/10 de una sola categoria
- `routeMaxCategoryShare <= 0.7`
- `coverageRatio <= 1.2`
- si hay material suficiente, debe pasar sin hardcodes

Si sigue fallando, diagnosticar en que capa ocurre:

- si las alternativas nunca entran al shortlist, revisar `LandmarkTiering.ts`
- si entran al shortlist pero no a la ruta, ajustar `PoiRanker.ts` o `RouteSelection.ts`

### Fase 7: repair multi-attempt solo si sigue siendo necesario

No empezar por aqui.

Solo si ranking + composicion no bastan:

- extender `TourQualityRepair.ts`
- permitir 2-3 intentos acotados de recomposicion
- aceptar repair solo si `computeTourConfidence(...)` pasa al final

### Fase 8: supresion semantica solo como ultimo recurso

Solo si aun aparecen rutas historicas dominadas por objetos tipo vehiculo/arma/aeronave pese a las fases anteriores.

Si se implementa:

- usar `instanceOfLabels`
- aplicar penalizacion semantica solo para tours historicos
- evitar regex por nombres y evitar hardcodes por ciudad

## Criterios de exito

- existe un fixture sintetico que reproduce el patron de category collapse
- `PoiRanker.ts` y/o `RouteSelection.ts` quedaron corregidos con cambios pequenos
- `npm run build` pasa en `backend`
- `npx jest --runInBand` pasa en `backend`
- verified sigue pasando
- el caso real tipo Lima deja de colapsar si el pool tiene material suficiente
- no se relajo el gate
- no se hardcodeo ninguna ciudad

## Estrategia de verificacion

Orden recomendado:

1. test sintetico nuevo o actualizado
2. `npx jest --runInBand` sobre tests especificos tocados
3. `npm run build`
4. `npx jest --runInBand`
5. `npx tsx backend/scripts/validation/calibrate-confidence-gate.ts`
6. `npx tsx backend/scripts/validation/inspect-osm-tours-batch.ts` o equivalente acotado si existe filtro por ciudad

## Riesgos conocidos

- penalizacion demasiado agresiva puede dañar ciudades verified que hoy estan sanas
- cap rigido por categoria puede degradar rutas historicamente coherentes
- arreglar solo repair downstream seria insuficiente y enmascararia la causa raiz

## Orden recomendado de implementacion

1. fixture sintetico
2. diversidad en `PoiRanker.ts`
3. ajuste de composicion en `RouteSelection.ts`
4. revalidacion de gate y ciudades verified
5. repair multi-attempt solo si todavia hace falta

## Prompt de continuidad

Implementa este plan con cambios minimos y verificables. Prioriza el fixture sintetico y la diversidad upstream. No relajes el confidence gate, no hardcodees ciudades y no cambies frontend. Si el fix en ranking/seleccion resuelve el caso, deten ahi y no anadas complejidad extra.
