# Selector editorial v5: resultado de implementación y calibración de Madrid

Fecha: 2026-08-07

Estado: implementación técnica verificada; gate editorial no superado; no fusionar ni ejecutar holdouts.

## Decisión

Mantener v5 en `feature/editorial-selector-v5` y no llevarla a `master` todavía. La parte determinista ya construye y repara rutas 7/7 físicamente válidas, pero el jurado final DeepSeek v4 Flash ha elegido repetidamente una ruta 5/7 y ha emitido evaluaciones de cobertura contradictorias. El siguiente cambio debe reducir y hacer verificable el contrato de decisión editorial; no se deben ajustar pesos del beam ni introducir el oracle en el selector.

## Qué quedó demostrado

- Los siete anchors de Madrid están presentes en el conjunto de 30 candidatos con evidencia propia.
- La matriz OSRM congelada contiene una ruta 7/7 viable bajo el techo solicitado.
- El portfolio conserva combinaciones de candidatos protegidos, no sólo cobertura individual.
- La reparación elimina la parada de relleno y entrega al jurado final una ruta 7/7 de 93,78 minutos en ambos sentidos.
- El esquema del jurado impide citar evidencia de otra identidad y falla cerrado ante una violación.
- Dos llamadas normales y un único reintento compartido siguen siendo el límite.
- El replay de `editorial-v5-madrid-20260807-e` reproduce exactamente inputs, respuestas, portfolio, reparación y ganador.
- Las siete suites v5 pasan: 27 tests. El build TypeScript también pasa.

## Capturas live de Madrid

| Captura | Resultado | Cobertura ganadora | Hallazgo |
|---|---|---:|---|
| `editorial-v5-madrid-20260807-a` | completa, gate rojo | 4/7 | El beam contenía mejores combinaciones, pero el MMR sólo cubría candidatos individualmente. |
| `editorial-v5-madrid-20260807-b` | fallo cerrado | — | DeepSeek citó en Senado evidencia propiedad de otra identidad; el validador la rechazó. |
| `editorial-v5-madrid-20260807-c` | completa, gate rojo | 5/7 | El esquema por candidato resolvió el grounding. El jurado inicial calificó la ruta 7/7 como fuerte; el jurado final cambió la evaluación. |
| `editorial-v5-madrid-20260807-d` | completa, gate rojo | 5/7 | La alternativa compacta 7/7 llegó a la final, pero fue marcada como incompleta. |
| `editorial-v5-madrid-20260807-e` | completa, gate rojo | 5/7 | Tres alternativas 7/7 llegaron a la final; DeepSeek declaró rutas 4/7 como cobertura canónica completa y las rutas compactas 7/7 como cobertura parcial. |

Artefactos reproducibles: `backend/fixtures/editorial-v5/`.

## Causa actual

```text
30 candidatos grounded + matriz OSRM
                │
                ▼
beam y MMR por coocurrencias protegidas
                │
                ├── ruta 7/7 + una parada: 115,49 min
                └── reparación compacta 7/7: 93,78 min, dos sentidos
                                │
                                ▼
                   jurado final, seis rutas
                                │
             ┌──────────────────┴──────────────────┐
             │                                     │
     rutas 4/7 o 5/7                       rutas compactas 7/7
     "cobertura completa"                  "cobertura parcial"
             │                                     │
             └──────────────────┬──────────────────┘
                                ▼
                    ganador 5/7, gate Madrid rojo
```

El cuello de botella ya no es candidate recall, geometría, duración, beam, MMR ni reparación. Es la falta de consistencia verificable entre el juicio de cobertura de varias rutas dentro de una respuesta larga. El modelo produce planes grounded y narrativamente plausibles, pero su etiqueta `firstVisitCompleteness` no representa una comparación estable.

## Por qué no se culpa al modelo sin aislar la arquitectura

La entrada final ronda 30.000 caracteres y exige relacionar un catálogo común con seis arrays de slots y un esquema JSON grande. Por tanto, DeepSeek y el contrato son una unidad experimental: todavía no se ha demostrado que otro modelo remoto falle con la misma entrada.

Sí existen dos evidencias específicas contra la configuración actual:

1. DeepSeek contradijo su propia evaluación entre la llamada inicial y la final para la misma ruta sin cambio.
2. En la captura `e`, evaluó como más completa una ruta con menos landmarks canónicos aun teniendo delante tres alternativas 7/7.

Se probó el mismo input final con `qwen2.5:14b` local. No produjo respuesta en más de once minutos y se canceló, por lo que no es una alternativa operativa con el contrato actual. Esto no demuestra peor criterio; demuestra que el payload actual tampoco es viable localmente.

## Próximo cambio recomendado

Diseñar y probar una revisión pequeña del contrato antes de otra captura live:

1. Reducir la entrada final al catálogo usado por las seis rutas; el catálogo completo sólo es necesario antes de reparar.
2. Incluir nombre y categoría junto a cada slot dentro de la ruta para eliminar el lookup mental `slot → catálogo`.
3. Añadir una auditoría compartida y grounded de landmarks de primera visita. Las omisiones de todas las rutas deben derivarse del mismo conjunto explícito, no de seis etiquetas independientes.
4. Validar consistencia cruzada: una ruta que contiene todos los landmarks declarados no puede tener peor completeness que otra que omite alguno.
5. Aplicar una prueba metamórfica de permutación de rutas. Cambiar el orden de `f01…f06` no debe alterar el conjunto de landmarks ni invertir dominancias claras.
6. Ejecutar el jurado revisado contra el snapshot congelado de Madrid antes de pagar otra matriz o recalibrar el beam.
7. Sólo si Madrid alcanza 7/7 en tres capturas live se continúa con las otras ocho ciudades. Valencia permanece sellada.

Cambiar directamente de modelo sólo tiene sentido después de congelar este contrato reducido. La comparación debe medir schema reliability, latencia, consistencia metamórfica, cobertura y revisión humana sobre exactamente las mismas rutas.

## Comandos de verificación

```bash
cd backend
npm test -- --runInBand \
  src/services/poi/EditorialEvidenceV5.test.ts \
  src/services/poi/EditorialCalibrationCandidatesV5.test.ts \
  src/services/poi/EditorialRoutePortfolioV5.test.ts \
  src/services/poi/EditorialRouteJuryV5.test.ts \
  src/services/poi/EditorialStructuredLlmV5.test.ts \
  src/services/poi/EditorialRouteRepairV5.test.ts \
  src/services/poi/EditorialSelectionWorkflowV5.test.ts
npm run build
npm run quality:route:v5 -- \
  --mode snapshot \
  --case madrid-history-es-120 \
  --snapshot-run editorial-v5-madrid-20260807-e
```

El último comando debe reproducir la captura y terminar con el gate en rojo (`oracle 5/7`); ese fallo es el resultado esperado del snapshot y evita confundir reproducibilidad con calidad aprobada.
