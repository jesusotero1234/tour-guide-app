# Selector editorial v7: perfil aprobado antes de optimizar

Fecha: 2026-08-07

Estado: **núcleo offline implementado; Madrid, Berlín y París continúan en `draft_only`**

## Qué implementa v7

V7 vive junto a v5 y al experimento fallido v6; no los modifica ni los usa como fallback. El producto queda definido por cuatro contratos nuevos:

- `CityEditorialProfileV1` separa identidades realmente obligatorias, capítulos con carriers alternativos, arco, fuentes y aprobación humana fingerprintada.
- `VisitSceneV1` representa una escena visible. Cibeles reúne plaza, fuente y palacio sólo mediante miembros exactos aprobables; cada hecho conserva su `ownerCanonicalId`.
- `StoryModulePlanV1` fija un módulo principal y hasta tres profundizaciones por escena, con hechos primarios no repetidos y observaciones explícitas de 45–90 segundos.
- `EditorialRouteSnapshotV7` congela perfil, escenas, matriz, ruta, plan, tiempo, decisión y fingerprints independientes.

El benchmark ya no convierte una ruta de referencia en requisitos. `mustVisit`, capítulos requeridos y rutas diagnósticas son campos distintos. Las propuestas no revisadas permanecen en `review_required` y cualquier cambio posterior invalida el fingerprint aprobado.

## Selección determinista

El optimizador enumera todas las órdenes para un máximo de ocho escenas. Aplica como restricciones duras:

1. cobertura completa de `mustVisit`;
2. cobertura de todos los capítulos mediante uno de sus carriers;
3. precedencias del arco;
4. incompatibilidades, identidades solapadas, alcance de matriz y tramo máximo;
5. contribución propia de cada parada o función física real como puente.

Entre rutas válidas minimiza, en este orden, caminata, tramo máximo, penalización de comodidad y número de escenas. No existe `categoryCount`, jurado global ni reparación por LLM.

El snapshot de Madrid enumera 5.040 órdenes completas y reproduce:

```text
Royal Palace → Almudena Cathedral → Plaza de la Villa → Plaza Mayor
→ Puerta del Sol → Cibeles → Puerta de Alcalá

3,067.6 m · 41.23 min walking · longest leg 976.1 m
```

## Evidencia congelada

El workbench guarda extractos breves y fingerprintados de Turismo Madrid para Palacio Real, Almudena, Plaza de la Villa, Plaza Mayor, Sol, Cibeles y Puerta de Alcalá. En particular, Plaza de la Villa conserva por separado el trazado medieval, los tres edificios civiles visibles y la función municipal. Cibeles conserva propietarios distintos para plaza (`Q1537446`), fuente (`Q2736564`) y palacio (`Q1849031`).

Fuentes oficiales: [Royal Palace](https://www.esmadrid.com/en/tourist-information/royal-palace), [Almudena Cathedral](https://www.esmadrid.com/en/tourist-information/catedral-de-la-almudena), [Plaza de la Villa](https://www.esmadrid.com/en/tourist-information/plaza-de-la-villa), [Plaza Mayor](https://www.esmadrid.com/en/tourist-information/plaza-mayor-madrid), [Puerta del Sol](https://www.esmadrid.com/informacion-turistica/puerta-del-sol), [Cibeles Fountain](https://www.esmadrid.com/en/tourist-information/fuente-de-la-cibeles), [Palacio de Cibeles](https://www.esmadrid.com/informacion-turistica/palacio-cibeles) y [Puerta de Alcalá](https://www.esmadrid.com/informacion-turistica/puerta-de-alcala).

## Narrativa y tiempo

La única llamada narrativa recibe exclusivamente las 4–8 escenas ya elegidas. No puede añadir, borrar ni reordenar escenas. La entrada se limita a 12.000 caracteres y el schema a 5.000. Sólo transporte o JSON malformado permiten un reintento; una violación semántica termina en `review_required`.

Antes de TTS se usan palabras y velocidad calibrada. Después de TTS se exige un fichero real por módulo. El total sólo suma:

- segundos OSRM caminando;
- audio estimado o real;
- observaciones expresamente mostradas al visitante.

No hay seis minutos por parada ni buffers invisibles. El plan provisional de Madrid suma 56.98 minutos y recomienda 60; no autoriza venderlo como 120 ni 90. La duración comercial sólo se decidirá con texto definitivo y audio real.

## Fase 0 y gates pendientes

El artefacto incluye tres fichas ciegas con el mismo formato: la antigua `f01` (4.967 m), la propuesta de siete escenas (3.067,6 m) y Madrid antiguo de cinco escenas (1.606,7 m). Cada ficha contiene promesa, contribución por parada, mapa, métricas OSRM, módulos posibles, rango temporal y rúbrica común.

No se han inventado resultados humanos. Permanecen pendientes:

- tres revisores y el gate de voluntad de pago;
- aprobación editorial del perfil y de las escenas;
- contenido final y audio real;
- calibración en nueve ciudades y comparación v7/v5/greedy;
- holdouts sellados de Valencia y Segovia;
- auditoría física de Madrid.

Por eso el snapshot correcto es `draft_only`, no `verified`, y no corresponde publicar, hacer push ni fusionar a `master`.

## Calibración inicial: Berlín y París

Se congelaron dos propuestas adicionales con fuentes turísticas oficiales y submatrices de las capturas OSRM existentes. No se cargaron oracles ni se copiaron las selecciones de v4/v5. Ambas propuestas permanecen sin aprobación humana y el replay exige igualdad exacta de perfil, escenas, ruta, módulos, tiempo y fingerprints.

| Ciudad | Producto propuesto | Ruta | Caminata OSRM | Tramo máximo | Tiempo explícito estimado | Recomendación honesta |
|---|---|---|---:|---:|---:|---:|
| Berlín | De la ciudad dividida a la capital reunificada | Checkpoint Charlie → Potsdamer Platz → Holocaust Memorial → Brandenburg Gate → Reichstag → Neue Wache → Humboldt Forum → Museum Island | 5.164,7 m · 68,87 min | 1.494 m · 19,92 min | 86,86 min | 90 min |
| París | De la Île de la Cité medieval al Louvre y Palais-Royal | Notre-Dame → Sainte-Chapelle → Conciergerie → Tour Saint-Jacques → Samaritaine → Louvre → Carrousel → Palais-Royal | 3.230,8 m · 43,56 min | 840,1 m · 11,2 min | 59,16 min | 60 min |

París produce una ruta compacta y un arco claro, pero es un producto de centro histórico de 60 minutos; no un recorrido genérico de iconos ni un tour honesto de 120 minutos. Berlín tiene una progresión defendible, pero su tramo Reichstag→Neue Wache roza el máximo y la caminata ocupa casi 69 de 87 minutos. Requiere revisar comodidad y enriquecer los anchors existentes antes de considerarla comprable. Ninguna de las dos se considera aprobada sólo porque el optimizador encuentre una ruta.

Fuentes principales: [ruta oficial de Berlín](https://www.visitberlin.de/en/tickets/guided-tour-italian-indispensable-berlin-tour), [Checkpoint Charlie](https://www.visitberlin.de/en/checkpoint-charlie), [Brandenburg Gate](https://www.visitberlin.de/en/brandenburg-gate), [Reichstag](https://www.visitberlin.de/en/reichstag-in-berlin), [Museum Island](https://www.visitberlin.de/en/museum-island-in-berlin), [ruta oficial por Notre-Dame](https://parisjetaime.com/eng/article/discovery-tour-around-the-cathedrale-notre-dame-de-paris-a1798), [Louvre Palace](https://www.louvre.fr/en/explore/the-palace) y [Palais-Royal](https://parisjetaime.com/eng/article/balade-du-palais-royal-a-la-place-vendome-a789).

## Brecha con la página en vivo

V7 sigue siendo offline y estos snapshots no cambian el comportamiento de la web. El pipeline anterior usa una lista fija que ya llama `verified` a Berlín y París. Para una ciudad fuera de esa lista, intenta generar un tour `unverified`; según los gates configurados puede publicarlo automáticamente si pasa o devolver `CITY_QUALITY_NOT_AVAILABLE` si falla.

La integración correcta del contrato nuevo deberá sustituir ese comportamiento: un fingerprint de perfil/ruta aprobado permitirá servir `verified`; una ciudad nueva podrá generar una propuesta `draft_only` y entrar en revisión, pero no venderse ni publicarse como premium. Esta integración y el mensaje específico de frontend permanecen fuera de la primera entrega offline.

## Replay

```bash
cd backend
npm run quality:route:v7
npm run quality:route:v7 -- --artifact fixtures/editorial-v7/berlin-history-de-120.json
npm run quality:route:v7 -- --artifact fixtures/editorial-v7/paris-history-en-120.json
```

Cada comando recalcula la ruta, revalida grounding y duración, compara todos los fingerprints y exige igualdad exacta con el snapshot indicado.

## Validación técnica

Estado del 8 de agosto de 2026:

- v7: 5 suites y 33 pruebas pasan, incluidas las reproducciones de Berlín y París;
- regresión v5/v6: 13 suites y 42 pruebas pasan;
- `npm run build` y `npm run quality:route:v7` pasan;
- suite backend completa: 60 suites pasan y 2 fallan (435 pruebas pasan, 2 fallan y 1 se omite);
- los dos fallos globales ya existían fuera de v7: el orden esperado en `LandmarkTiering.test.ts` y el payload `signals` en `tours.test.ts`; v7 no modifica esos archivos;
- `npm run lint` no puede ejecutarse porque el backend no contiene una configuración de ESLint.
