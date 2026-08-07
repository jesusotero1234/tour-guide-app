# Selector editorial v4: implementación y calibración offline

Fecha: 2026-08-06

Estado: implementado como workbench offline; no aprobado para producción ni para abrir holdouts.

## Arquitectura implementada

La selección queda separada en cuatro fases reproducibles:

1. Identidad y evidencia deterministas: sólo se fusiona el mismo QID; la proximidad crea conflictos de visita sin fusionar identidades. Los fact packs exigen evidencia observable, contexto e historia específica.
2. Curador DeepSeek (`deepseek-v4-flash`, temperatura 0): recibe slots opacos, hechos y `fameScore`; devuelve un inventario temático grounded, evaluaciones locales y una permutación ordinal completa.
3. Optimizador exacto: reduce a 18 candidatos combinando carriers, ranking editorial, reconocimiento público y densidad peatonal; usa matriz OSRM peatonal congelada, duración como techo, Pareto y DP sobre rutas de 4–8 paradas.
4. Crítico grounded: compara sólo finalistas físicamente válidos. Puede vetar incoherencia o redundancia, pero no sobreescribir mayor paid value entre rutas aceptables.

No hay fallback publicable, relleno de duración, narración, frontend ni integración con producción.

## Propiedades verificadas

- El candidate set de 30 contiene 100% de los anchors de las nueve ciudades antes de cualquier llamada LLM.
- Las referencias de evidencia de candidatos son locales al slot; el validador las convierte a referencias globales.
- Las eras de candidato se derivan de la evidencia, no del LLM.
- `priorityOrder` es una permutación estructural y no 30 enteros independientes.
- Los incrementos de duración no relajan los límites de segmento solicitados.
- Una ruta corta editorialmente completa es válida; no existe mínimo de consumo temporal.
- Los artefactos fallidos guardan input, output bruto, modelo, fingerprints y causa por etapa.
- Holdouts requieren runner separado, freeze compatible y revisión humana ciega aprobada.

## Calibración final y replay

Artefactos: `backend/fixtures/editorial-v4/editorial-v4-calibration-final2/`

Fingerprint del selector: `538074b2123fc86e409b95b082dde0e85fa3b76f587f41064a38ebcec0ea9f34`

La captura live y el replay snapshot produjeron exactamente las mismas duraciones y coberturas:

| Caso | Duración real | Oracle | Greedy | Gate |
|---|---:|---:|---:|---|
| Madrid 120 | 118.85 | 5/7 | 2/7 | falla |
| Málaga 120 | 112.42 | 4/5 | 4/5 | pasa |
| Ámsterdam 120 | 114.66 | 5/5 | 5/5 | pasa |
| Toledo 120 | 106.62 | 5/6 | 4/6 | pasa |
| Berlín 120 | 119.83 | 4/5 | 4/5 | pasa |
| Barcelona 120 | 119.45 | 3/4 | 2/4 | falla |
| París 120 | 116.63 | 2/4 | 1/4 | falla |
| Roma 150 | 137.55 | 6/7 | 4/7 | pasa |
| Toulouse 120 | 104.87 | 4/4 | 2/4 | pasa |

Todas las rutas seleccionadas respetaron duración, segmentos, conflictos de visita, no duplicados, núcleo narrativo y marginals no vacíos. Los tres fallos son exclusivamente de cobertura editorial requerida.

### Diagnóstico de los tres fallos

- Madrid omite Almudena y Plaza de la Villa y termina en Puente de Segovia. La geometría es válida, pero la selección no alcanza el estándar 7/7 y no debe aprobarse por superar a un greedy débil.
- Barcelona incluye Güell, Santa Maria del Mar y Catedral, pero omite Palau de la Música. 3/4 no alcanza `ceil(80%)`.
- París visita una representación local válida del Louvre, pero omite Orsay y Sainte-Chapelle. 2/4 no alcanza el gate.

El resultado demuestra que el problema no es sólo el modelo: identidad, evidencia, geometría, duración y reproducción funcionan. Tampoco sería correcto absolver al curador: un único ranking global sigue siendo insuficiente para garantizar que los mejores landmarks formen el mejor paseo en todas las ciudades.

## Holdouts

- Valencia no se ejecutó.
- Segovia no se ejecutó en el selector.
- Sólo se capturaron fuentes de Segovia con `--holdout-data-only`: 181 POIs, 60 entradas Wikidata y 53 entradas Wikipedia.
- No existe freeze porque la calibración falla y no se ha realizado revisión humana ciega.

## Decisión y siguiente experimento

Se detiene el avance narrativo y de holdouts. No se deben añadir reglas específicas para Madrid, Barcelona o París.

El siguiente experimento debe comparar a ciegas las rutas v4 contra v3 y evaluar una interfaz route-conditioned: primero producir varios corredores geográficos de alto valor y después pedir al curador que juzgue el arco de cada corredor. Esto aborda la interacción real entre landmarks y paseo sin convertir el oracle en input ni depender de un único ranking global.

Comandos reproducibles:

```bash
cd backend
npm test -- --runInBand src/services/poi/EditorialEntityV4.test.ts src/services/poi/EditorialWalkingMatrixV4.test.ts src/services/poi/EditorialStoryMapV4.test.ts src/services/poi/EditorialRouteOptimizerV4.test.ts src/services/poi/EditorialRouteCriticV4.test.ts src/services/poi/EditorialHumanReviewV4.test.ts src/services/poi/EditorialEvaluationManifest.test.ts src/services/poi/EditorialCalibrationCandidatesV4.test.ts
npm run build
npm run quality:route:v4 -- --mode=snapshot --all --run-id=editorial-v4-calibration-final2
```

El último comando termina con código 1 deliberadamente mientras los tres gates sigan rojos.
