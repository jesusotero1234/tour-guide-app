# 27 — Plan de trabajo: atribucion semantica de fama para evitar colapsos por objetos transferibles

## Problema

El caso tipo Lima no falla porque el gate sea demasiado estricto ni porque falte un hardcode por ciudad.

Falla porque el pipeline atribuye a ciertos POIs la fama global de una entidad Wikidata que describe un tipo, modelo o familia de objeto en vez de un destino fisico unico de la ciudad.

Ejemplos tipicos:

- aviones concretos enlazados a modelos famosos
- vehiculos, armas, barcos o locomotoras con articulo propio muy enlazado
- exhibiciones de museo cuya fama pertenece al objeto o clase, no al lugar visitable

Cuando esos POIs heredan `sitelinks` altos, `LandmarkTiering` los eleva a `flagship` o `major`, y downstream el ranking/composer termina favoreciendo un cluster compacto pero turisticamente debil.

## Objetivo

Corregir la atribucion de fama de forma generica para que:

- no se hardcodeen ciudades ni landmarks
- no se relajen thresholds del confidence gate
- los objetos transferibles no hereden fama global como si fueran destinos estrella
- los destinos fisicos reales mantengan su scoring normal
- el fix ocurra upstream, antes de `PoiRanker` y `RouteSelection`

## Decision recomendada

Adoptar una clasificacion semantica en `LandmarkTiering.ts` basada en `instanceOfLabels` de Wikidata, pero evitando una blacklist infinita de labels negativas.

En lugar de perseguir todos los tipos posibles de `aircraft`, `vehicle`, `weapon`, `ship class`, etc., usar una allowlist pequena y estable de labels que si representan lugares fisicos visitables.

Reglas:

1. `area_entity`
   - ciudad, municipio, distrito, barrio, centro historico
   - seguir excluyendolos de `history`

2. `place_like_entity`
   - museo, edificio, catedral, iglesia, palacio, castillo, plaza, puente, parque, puerta, mercado, monasterio, fortificacion, sitio arqueologico, ayuntamiento, biblioteca, teatro, etc.
   - scoring normal

3. `non_place_or_transferable_entity`
   - si no hay ninguna senal clara de lugar fisico
   - no excluir por completo
   - capar fama transferida y evitar que se convierta en `flagship`

## Implementacion propuesta

### Fase 1: tests primero

Anadir tests en `backend/src/services/poi/LandmarkTiering.test.ts` para cubrir:

- un `aircraft family` o similar con sitelinks altos no debe quedar `flagship`
- una plaza/catedral/palacio con menos sitelinks pero entidad place-like debe quedar por encima
- un POI con labels mixtos como `museum` + `building` no debe ser penalizado por accidente
- un pool pequeno compuesto solo por objetos transferibles no debe quedar vacio
- la normalizacion de labels debe ser case-insensitive

### Fase 2: helper semantico en tiering

Anadir helpers internos en `LandmarkTiering.ts` para:

- normalizar labels de `instanceOfLabels`
- detectar `area_entity`
- detectar si existe al menos un label `place_like`
- detectar si una entidad debe tratarse como fama transferible

### Fase 3: cap de fama transferida

En `tierPoisByLandmarkFame(...)`:

- si la entidad es `place_like`, usar `sitelinks` reales
- si es `non_place_or_transferable_entity`, usar `effectiveSitelinks = min(rawSitelinks, 5)`
- mantener el POI en el pool, pero con menor capacidad de subir por fama heredada

### Fase 4: cap de tier

Despues de ordenar y asignar tier por ranking relativo:

- si el POI fue clasificado como `non_place_or_transferable_entity`, su tier maximo sera `supporting`
- esto evita que un modelo famoso se vuelva `flagship` y luego fuerce inclusion downstream

### Fase 5: rollout conservador

Aplicar esta logica primero solo para `theme === history`.

Motivos:

- el bug actual esta en tours historicos
- ya existe logica history-specific en `LandmarkTiering`
- evita regresiones inesperadas en otros temas antes de validar bien el patron

## Criterios de exito

- los objetos transferibles dejan de dominar el tiering por sitelinks heredados
- los landmarks place-like reales suben en el shortlist
- no se vacia el pool en ciudades con poca oferta
- `PoiRanker` y `RouteSelection` reciben mejores tiers upstream sin cambios grandes
- no se relaja `routeMaxCategoryShare <= 0.7`
- Madrid/history y acceptance verified siguen pasando

## Verificacion

Orden recomendado:

1. `npx jest --runInBand src/services/poi/LandmarkTiering.test.ts`
2. `npx jest --runInBand src/services/poi/PoiRanker.test.ts src/services/poi/RouteSelection.test.ts src/services/poi/TourQuality.acceptance.test.ts`
3. `npm run build`
4. `npx jest --runInBand`
5. repro estructural real de Lima si el script y datos siguen disponibles

## Riesgos conocidos

- una allowlist demasiado corta puede descontar museos o edificios reales mal etiquetados
- una allowlist demasiado amplia puede dejar pasar demasiado ruido
- sin fixture de Lima, la validacion real depende del script estructural y del estado actual del cache/dataset

## No objetivos

- hardcodes por ciudad
- cambios de frontend
- relajar thresholds del gate
- mover la logica al composer antes de corregir el tiering
