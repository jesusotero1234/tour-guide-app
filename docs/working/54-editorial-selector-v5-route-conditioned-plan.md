# Selector editorial v5: búsqueda de rutas primero, juicio editorial después

Fecha: 2026-08-07

Estado: implementado en `feature/editorial-selector-v5`; calibración bloqueada por el gate de Madrid. Véase `55-editorial-selector-v5-madrid-calibration.md`. Exclusivamente offline.

## 1. Conclusión técnica

El problema principal no es que DeepSeek sea incapaz de curar un tour. El problema es que la arquitectura concede demasiada autoridad a una operación para la que cualquier LLM es frágil: ordenar globalmente 30 lugares antes de conocer la ruta.

La evidencia actual lo demuestra:

- Los 30 candidatos contienen todos los anchors de calibración. El problema ocurre después.
- Madrid tiene una ruta 7/7 físicamente viable de unos 93 minutos; geometría y duración no explican el fallo.
- Plaza de la Villa varió entre los puestos 3 y 25 con temperatura 0; Puerta del Sol, entre 2 y 23; Palau Güell, entre 2 y 23.
- En Madrid el crítico prefirió `r02`, con 7/7 beats y riesgo de omisión `none`, pero el código escogió `r01` porque tenía mayor suma global.
- En Toulouse el ganador era la tercera opción del crítico.
- Ocho de nueve rutas terminaron con el máximo de ocho paradas. Se eliminó el relleno temporal explícito, pero la función objetivo volvió a introducirlo indirectamente.
- París cubre 7/7 beats, sólo 2/4 anchors físicos y 1/4 identidades exactas, mientras el crítico declara riesgo de omisión `none`. Por tanto, los beats actuales no representan suficientemente el valor de primera visita.

La solución no es ajustar pesos ni cambiar inmediatamente de modelo. Hay que eliminar el ranking global como cuello de botella y hacer que el LLM compare rutas completas, donde el valor de una parada puede juzgarse en relación con las demás.

## 2. Crítica de la arquitectura actual

| Problema | Evidencia y efecto | Solución v5 |
|---|---|---|
| Ranking global inestable | El orden cambia mucho entre ejecuciones y a menudo replica la posición de entrada. | Ningún ranking LLM de candidatos. |
| Reducción irreversible 30→18 | Madrid pierde Plaza de la Villa antes de buscar rutas; Roma pierde la Capilla Sixtina. | Matriz y búsqueda sobre los 30 candidatos. |
| Evidencia contaminada entre identidades | Entidades próximas pueden heredar hechos de otro QID, aunque no se fusionen. | Sólo evidencia propia; proximidad crea conflicto de visita, nunca equivalencia semántica. |
| DP no exacto editorialmente | El estado `(mask, end)` conserva únicamente el camino más corto y destruye órdenes narrativos alternativos. | Beam con múltiples etiquetas y camino ordenado completo. |
| Función objetivo monótona | Sumar prioridad, reconocimiento y saliencia favorece añadir paradas. | Utilidad submodular, saturación y preferencia final por menos paradas. |
| Beats demasiado amplios | Una ruta puede cubrir todos los beats con sustitutos editorialmente flojos. | El arco se construye para cada ruta, no para toda la ciudad. |
| Cartera limitada | El crítico sólo recibe cinco rutas producidas por el mismo objetivo sesgado. | Cartera diversa de hasta diez rutas y cobertura explícita de candidatos protegidos. |
| Crítico sin capacidad de reparación | Puede vetar, pero no introducir el landmark ausente. | Sugerencias estructuradas de sustitución y una reparación determinista. |
| Crítico sin autoridad real | `priorityCoverage` se evalúa antes que el ranking del crítico. | Entre rutas válidas, el ranking final del jurado será autoritativo. |
| Cobertura por proximidad | Un QID cercano puede contar como anchor aunque narre otra cosa. | Sólo identidad exacta o representación aprobada previamente. |
| Duración sintética | Dwell fijo de 7–8 minutos; no mide capacidad narrativa. | Roles de ruta con presupuestos discretos y duración real reportada. |
| Evaluación incompleta | El oracle no demuestra que el paseo se sienta bien y aún no hubo revisión humana. | Gate híbrido: invariantes + anchors + tres revisores ciegos. |

Código donde se materializan los principales problemas: `EditorialRouteOptimizerV4.ts`, `EditorialRouteCriticV4.ts` y `docs/working/53-editorial-selector-v4-calibration.md`.

### Diagrama del fallo actual

```text
Fuentes OSM/Wikidata/Wikipedia
              │
              ▼
     Entidades por QID
              │
              ├── hechos compartidos por proximidad
              │      └── identidades semánticamente borrosas
              ▼
       30 candidatos válidos
              │
              ▼
 LLM ordena globalmente los 30
    │         │              │
    │         │              └── sesgo por posición
    │         └── variación aunque temperatura = 0
    └── desconoce corredor, orden y sustituciones
              │
              ▼
       Reducción dura a 18
              │
              └── landmarks eliminados para siempre
              ▼
 DP conserva sólo el camino más corto
       por (conjunto, última parada)
              │
              └── órdenes narrativos alternativos desaparecen
              ▼
 Pareto con scores que crecen al añadir paradas
              │
              └── 8/9 ganadores llegan al máximo de 8
              ▼
       Cinco finalistas sesgados
              │
              ▼
 Crítico puede vetar, pero no reparar
              │
              ▼
 priorityCoverage prevalece sobre el crítico
              │
              ▼
 Ruta geométricamente válida,
 pero incompleta, redundante o poco natural
```

## 3. Arquitectura v5

```text
Evidencia propia y entidades estables
              │
              ▼
    30 candidatos + matriz OSRM completa
              │
              ▼
 Beam multietiqueta sobre rutas ordenadas
  - duración y segmentos
  - reconocimiento saturado
  - diversidad de eras/categorías
  - evidencia y no redundancia
  - sin oracle y sin scores LLM
              │
              ▼
 Cartera diversa de hasta 10 rutas
              │
              ▼
       Jurado route-conditioned
          DeepSeek, llamada 1
              │
              ├── evalúa paseo completo
              ├── asigna roles y contribuciones
              └── propone sustituciones
              ▼
 Reparación determinista local
  - swap, delete, relocate, reverse y 2-opt
  - geometría y duración revalidadas
              │
              ▼
 Jurado final sobre máximo 6 rutas
          DeepSeek, llamada 2
              │
              ▼
 Ganador editorial autoritativo
              │
              ▼
 Gate automático + oracle + revisión humana
```

### 3.1 Evidencia e identidad

- Crear v5 en paralelo, sin modificar el comportamiento ni los artefactos v4.
- Mantener fusión únicamente por QID.
- Prohibir que una entidad se vuelva `ready` usando hechos de otra entidad cercana.
- Mantener `visitConflictGroup` exclusivamente para impedir dos paradas físicas equivalentes.
- Conservar hasta doce hechos propios por candidato. Para cada petición al jurado seleccionar como máximo cuatro:

  - Un observable.
  - Un claim histórico estructurado.
  - Dos contextos distintivos respecto a las demás paradas.

- La selección de hechos será determinista y favorecerá novedad léxica, fechas, causalidad histórica y observabilidad.
- El oracle no será importable desde los módulos del selector.

### 3.2 Búsqueda sobre los 30 candidatos

- Capturar la matriz peatonal completa de hasta 30 candidatos: 900 pares, asumible para OSRM.
- Usar `BigInt` o un conjunto inmutable para candidatos visitados; no limitarse a bitmasks de 18 elementos.
- Buscar rutas de 4–8 paradas. Cuatro paradas fuertes serán válidas para ciudades pequeñas; no se añadirá una quinta por cuota.
- Cada estado conservará camino ordenado, inicio, final, duración, conflictos y vector editorial determinista.
- Retener hasta ocho etiquetas no dominadas por `(inicio, final, número de paradas)`. Nunca colapsar dos órdenes sólo porque uno camina menos.
- Limitar el beam a 6.000 estados por profundidad y registrar si hubo truncamiento.
- Vector Pareto:

  - Suma de los cuatro reconocimientos más altos, saturada después del cuarto.
  - Cobertura de eras.
  - Cobertura de categorías.
  - Calidad mínima de evidencia.
  - Distintividad entre paradas.
  - Caminata total y segmento máximo.
  - Menor número de paradas como desempate.

- Construir una cartera de hasta diez rutas mediante MMR:

  - Similitud Jaccard máxima preferida de 0,75.
  - Al menos tres tamaños de ruta si existen.
  - Cobertura conjunta de candidatos protegidos: top 10 de reconocimiento y carriers únicos de era/categoría.
  - Incluir rutas compactas y rutas de mayor cobertura, sin utilizar diferentes sumas de pesos ocultas.

Este beam queda acotado a aproximadamente 36.000 etiquetas retenidas, comparable o inferior a los 300.000–530.000 estados ya explorados por v4.

### 3.3 Jurado editorial y contratos

No habrá llamada LLM por candidato. El modelo sólo verá rutas completas y un catálogo común de candidatos.

```ts
interface RouteJuryV5 {
  schemaVersion: 'route-jury-v5';
  ranking: string[];
  shortlist: [string, string, string];
  assessments: Record<string, {
    verdict: 'strong' | 'acceptable' | 'reject';
    paidTourValue: 0 | 1 | 2 | 3 | 4;
    firstVisitCompleteness: 0 | 1 | 2 | 3 | 4;
    progression: 0 | 1 | 2 | 3 | 4;
    nonRedundancy: 0 | 1 | 2 | 3 | 4;
    omissionRisk: 'none' | 'moderate' | 'high';
    reasonCodes: string[];
  }>;
  routePlans: Record<string, {
    promise: string;
    centralQuestion: string;
    stops: Array<{
      candidateSlot: string;
      role: 'opening_anchor' | 'chapter_anchor'
        | 'turning_point' | 'resolution_anchor';
      uniqueContribution: string;
      evidenceIds: string[];
    }>;
    repairSuggestions: Array<{
      removeSlot: string | null;
      addSlot: string | null;
      insertAfterSlot: string | null;
      reason: string;
      evidenceIds: string[];
    }>;
  }>;
}
```

Validaciones:

- Todas las rutas aparecen exactamente una vez.
- `shortlist` contiene tres rutas no rechazadas.
- Cada parada aparece una vez en su plan y cita sólo evidencia propia.
- La primera parada es `opening_anchor` y la última `resolution_anchor`.
- Para tours de 90 minutos o más existen al menos cuatro paradas sustantivas.
- Ninguna sugerencia puede inventar candidato, evidencia o geometría.
- El jurado recibe catálogo, rutas, duración y evidencia; nunca oracle, resultados v4, greedy o scores internos del beam.

Presupuesto:

- Llamada normal 1: juicio de hasta diez rutas.
- Llamada normal 2: decisión final entre un máximo de seis rutas originales o reparadas.
- Una tercera llamada queda reservada como único reintento compartido ante transporte o JSON malformado.
- Un ID inventado, evidencia inválida o contradicción semántica falla sin reintento.
- No existe fallback publicable.

### 3.4 Reparación y decisión final

Después del primer jurado:

- Conservar sus dos mejores rutas válidas.
- Aplicar hasta dos swaps sugeridos por ruta.
- Explorar además eliminación de una parada, sustitución por candidato protegido omitido, relocation, inversión y 2-opt.
- Revalidar conflictos, segmentos, duración y evidencia después de cada operación.
- Mantener como máximo seis alternativas diversas.
- El segundo jurado verá el orden real y la geometría exacta.
- Su ranking será autoritativo entre rutas aceptables. No se volverá a ordenar por reconocimiento o `priorityCoverage`.
- Si la primera ruta falla una validación determinista, se prueba la siguiente del ranking; si ninguna pasa, se devuelve `no_editorial_route`.
- A igualdad editorial explícita, gana menor caminata y después menor número de paradas.

### 3.5 Duración

- La duración solicitada continúa siendo un techo.
- Presupuesto determinista por rol:

  - `opening_anchor`: 7 minutos.
  - `chapter_anchor`: 6 minutos.
  - `turning_point`: 6 minutos.
  - `resolution_anchor`: 7 minutos.
  - Tres minutos generales de introducción/cierre.

- La duración reportada será `caminata OSRM + interpretación por roles + 3`.
- Una ruta editorialmente completa de 64 minutos para una petición de 120 se reportará como 64.
- El buscador generará primero rutas bajo el techo solicitado. Sólo si no existe cartera físicamente viable probará +15, +30, +45 y +60 minutos.
- Una extensión se devuelve como recomendación, nunca como cumplimiento de la petición original.
- Los lugares atravesados sin contribución no serán paradas narradas.

## 4. Plan de trabajo

### Fase 0 — Congelar diagnóstico

- Declarar `editorial-v4-calibration-final2` como baseline inmutable.
- Añadir un diagnóstico de attrition 30→18→cartera→ganador.
- Registrar por caso: rango LLM, presencia en reducción, presencia en finalistas, decisión del crítico y decisión efectiva.
- Preaprobar representaciones equivalentes del oracle antes de ejecutar v5. Sólo se aceptan por unanimidad de tres revisores; proximidad por sí sola nunca cuenta.

Salida: informe reproducible que demuestra qué etapa pierde cada anchor.

### Fase 1 — Entidad y evidencia v5

- Implementar perfiles con evidencia exclusivamente propia.
- Generar catálogo route-conditioned de hechos.
- Capturar matrices de 30 candidatos.
- Mantener los mismos pools congelados para aislar el efecto del selector.
- Si un anchor deja de estar `ready` al eliminar evidencia prestada, corregir su enriquecimiento genérico; no crear excepciones por ciudad.

Salida: 100% de anchors de calibración presentes con evidencia propia.

### Fase 2 — Portfolio determinista

- Implementar beam multietiqueta, Pareto saturado y MMR.
- Añadir diagnósticos de candidatos protegidos no representados y razones físicas.
- Incluir v4 y greedy únicamente en el workbench como comparadores, nunca como entradas del selector.

Salida: carteras diversas y físicamente válidas que contengan una ruta capaz de alcanzar el gate oracle en cada calibración.

### Fase 3 — Jurado y reparación

- Implementar ambos contratos JSON, validadores y presupuesto máximo de llamadas.
- Implementar el vecindario determinista de reparación.
- Dar autoridad real al ranking final.
- Persistir catálogo, rutas, prompts, modelo, respuestas, reparaciones y fingerprints.

Salida: selección reproducible desde snapshots sin fallback.

### Fase 4 — Calibración y estabilidad

- Ejecutar tres capturas live independientes por ciudad.
- Reproducir cada una en snapshot y exigir identidad exacta del replay.
- Medir calidad mínima por ejecución, no igualdad exacta de ruta: varias rutas buenas son aceptables.
- Ejecutar ablaciones:

  - Sin LLM: mejor ruta determinista.
  - v4 actual.
  - v5 sin reparación.
  - v5 completo.

- No cambiar de modelo durante esta calibración. DeepSeek v4 Flash continúa como referencia.

Salida: las tres ejecuciones de las nueve ciudades superan todos los gates.

### Fase 5 — Revisión humana y holdouts

- Generar tarjetas ciegas v5 frente al mejor baseline por ciudad, determinado por mayor cobertura oracle y después menor caminata.
- Tres revisores independientes puntúan apertura, progresión, no redundancia, landmarks de primera visita, resolución, comodidad y valor pagado.
- Congelar código, prompts, modelo, fuentes, configuración y fingerprints.
- Ejecutar Valencia una sola vez y exigir 5/6.
- Si Valencia pasa, ejecutar Segovia una sola vez y exigir 5/6.
- Si cualquiera falla, documentar el fallo y detenerse. No ajustar v5 con ese resultado; será necesario designar un nuevo holdout antes de recalibrar.

## 5. Pruebas y gates

### Unitarias y metamórficas

- Dos QIDs próximos nunca comparten evidencia ni cuentan como la misma identidad.
- El orden de entrada de candidatos no cambia el portfolio determinista.
- El beam conserva dos órdenes distintos del mismo conjunto cuando ambos son no dominados.
- Una ruta no gana por añadir una parada redundante.
- Una ruta fuerte de cuatro paradas y 64 minutos es válida.
- Un punto remoto no entra para consumir duración.
- Ningún `reject` llega al ganador.
- El ranking final del jurado no puede ser sobreescrito por scores deterministas.
- IDs, rutas o evidencias inventadas fallan.
- El máximo real es dos llamadas normales y un único reintento compartido.
- Swap, delete y 2-opt nunca rompen duración, conflictos o segmentos.

### Regresiones de calibración

- Madrid: el portfolio contiene una ruta 7/7 y el ganador alcanza 7/7.
- Barcelona: el ganador alcanza 4/4.
- París: el ganador alcanza 4/4 contando sólo representaciones preaprobadas.
- Todas las demás ciudades alcanzan `ceil(80% × anchors)`.
- Cobertura no inferior a `max(v4, greedy)`.
- Cero duplicados, conflictos, segmentos largos o rutas sobre duración.
- Entre 4 y 8 paradas, todas con contribución única grounded.
- Ningún caso físicamente viable termina en `no_route`.
- Las tres repeticiones live pasan; la variabilidad del modelo puede cambiar la ruta, pero no romper el gate.

### Gate humano

- V5 gana por mayoría en al menos 6 de 9 ciudades.
- Ninguna ciudad tiene mayoría clara contra v5.
- Madrid debe preferirse a su baseline.
- Progresión, no redundancia y landmarks no pueden bajar frente al baseline.
- Acuerdo entre revisores medido y reportado; discrepancias extremas invalidan el freeze.

## 6. Por qué la solución es realista

- Reutiliza piezas que ya funcionan: identidad por QID, OSRM, DeepSeek estructurado, snapshots, fingerprints y aislamiento de holdouts.
- Elimina el límite de 18 sin intentar resolver un TSP exacto de 30 nodos; usa un beam explícitamente acotado.
- Reduce la autoridad del modelo: DeepSeek ya no puede borrar candidatos, inventar geometría ni escoger mediante una lista global.
- Mantiene el coste normal en dos llamadas y el máximo en tres.
- Introduce un bucle de corrección real: el jurado puede señalar una omisión y el código verifica físicamente la reparación.
- Mide por separado identidad, cobertura, coherencia y preferencia humana.
- Es falsable: si no supera tres ejecuciones multiciudad, tres revisores y dos holdouts sin ajustes, no se declara solucionado.

## Supuestos fijados

- V5 será completamente paralela y offline; v4 queda como baseline.
- No se modifican producción, frontend, narraciones, audio ni publicación.
- DeepSeek v4 Flash continúa inicialmente; cambiar de modelo antes de corregir la arquitectura sólo desplazaría la inestabilidad.
- Un benchmark posterior podrá comparar DeepSeek con Qwen/Ollama usando exactamente las mismas carteras congeladas. Sólo se cambiará si el alternativo supera schema reliability, estabilidad, gates y revisión humana.
- La calidad editorial prevalece sobre consumir toda la duración y sobre maximizar el número de paradas.
