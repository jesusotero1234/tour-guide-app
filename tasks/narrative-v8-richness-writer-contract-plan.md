# Plan técnico — riqueza narrativa y contrato por escenas (Narrative V8)

## Objetivo

Conseguir que un tour largo sea más rico, oral e inmersivo sin rellenar para alcanzar una cifra de palabras ni debilitar el soporte factual.

El resultado esperado no es que todas las paradas midan lo mismo. Una parada conservará el objetivo de 600 palabras (mínimo aceptado: 580) solo cuando el material curado pueda sostenerlo. Si no puede, el sistema investigará de forma dirigida y, si sigue faltando evidencia, reducirá esa parada o sustituirá una parada opcional antes que repetir o estirar afirmaciones.

## Punto de partida comprobado

La implementación actual ya incluye una primera versión de la mejora:

- calcula `targetSeconds`, `targetWords`, un rango de proposiciones y anclas visuales por parada;
- pasa ese objetivo a investigación y curaduría;
- amplía el paquete del curador con la duración, aunque con topes todavía modestos;
- pide al escritor una secuencia de orientación, cambio temporal, vida humana, contraste y transición;
- acepta para 600 palabras un mínimo de 580 y un máximo de 660.

Lo que todavía falta explica la sensación de texto largo pero no siempre más rico:

- la riqueza se mide principalmente por cantidad de roles/proposiciones, no por variedad narrativa real;
- el escritor recibe proposiciones, pero no tarjetas priorizadas ni un plan de escenas verificable;
- la salida sigue siendo un único `script` sin relación explícita entre cada tramo y su evidencia;
- no se recalcula la duración después de conocer la riqueza real de cada dossier;
- la reparación puede dejar el texto fuera del rango sin una validación final equivalente;
- el control de repetición global es débil y depende principalmente del auditor LLM.

## Decisiones de diseño

1. **La evidencia sigue siendo la frontera dura.** Ninguna mejora de estilo permitirá usar datos fuera de los pasajes y proposiciones admitidos.
2. **600/580 es un objetivo condicionado, no una obligación ciega.** El rango se aplica al objetivo final reconciliado de cada parada.
3. **Investigación antes que reducción.** Cuando falten dimensiones narrativas, se hará una ronda dirigida; solo después se acortará, redistribuirá o sustituirá.
4. **El tiempo sobrante no obliga a hablar.** Se redistribuye únicamente si otra parada tiene capacidad probada y sin superar su máximo; en caso contrario queda como tiempo de paseo/observación.
5. **El contrato V6 no se rompe.** El modo estructurado será opt-in para V8 y se normalizará al `NarrativeScriptV6` existente antes de auditoría y reparación.
6. **No se cambia de modelo en esta fase.** Se mantiene el perfil actual con GPT-5.4 mini como escritor. Primero se corrige la información y el contrato; solo habrá benchmark de modelos si la calidad sigue por debajo del umbral.
7. **Todo se calibra sin gasto externo antes del canario.** Los umbrales iniciales se validarán con fixtures de paradas ricas y delgadas; no se tratarán como constantes dogmáticas.

## Contratos nuevos

### Perfil de riqueza por parada

`NarrativeRichnessProfileV8` resumirá, de forma determinista:

- proposiciones soportadas y publishers independientes;
- tarjetas de prioridad alta;
- dimensiones distintas cubiertas;
- anclas visuales y espaciales;
- cronología, acción humana, transformación, contraste y singularidad;
- capacidad máxima de narración soportada y motivos de cualquier reducción.

La disponibilidad de cinco etiquetas no bastará por sí sola: también se exigirá diversidad de pasajes y contenido no redundante.

### Tarjeta de evidencia

`NarrativeEvidenceCardV8` proyectará el dossier sin inventar contenido:

- `cardId` estable;
- afirmación atómica y `propositionId` de origen;
- `passageIds` y `sourceIds` admitidos;
- faceta narrativa y prioridad;
- marcas `visual` y `spatial`;
- pista de punto de vista solo cuando se derive literalmente del material.

### Plan de escenas

Cada parada recibirá un `NarrativeBeatPlanV8` ordenado:

1. llegada y orientación;
2. ancla visible;
3. salto temporal o transformación;
4. escena humana o uso vivido;
5. contraste o consecuencia;
6. idea final y transición.

Un beat podrá omitirse si no tiene soporte. No se reemplazará con prosa decorativa.

### Respuesta estructurada del escritor

El modo V8 pedirá segmentos con:

- `segmentId`;
- `beat`;
- `text`;
- `supportCardIds`;
- `estimatedWords`.

Solo saludos, conectores puramente operativos y transiciones sin afirmaciones podrán tener soporte vacío. El adaptador validará los IDs, concatenará los segmentos y producirá el `NarrativeScriptV6` compatible con el flujo actual.

## Plan de ejecución

### Fase 0 — Baseline reproducible y métricas (S)

**Archivos**

- Crear fixture sanitizado V8 a partir del último Madrid: una parada rica (Plaza Mayor) y dos propensas a estiramiento (Cibeles y Colón).
- Crear una prueba de caracterización para registrar palabras, proposiciones, pasajes, anclas y repeticiones actuales.

**Aceptación**

- El fixture no contiene secretos, checkpoints privados ni respuestas completas de proveedores.
- La prueba reproduce el desequilibrio: objetivos similares con riqueza material distinta.
- No cambia todavía el comportamiento de producción.

**Verificación**

- Prueba de caracterización aislada.
- Revisión del diff del fixture y búsqueda de credenciales.

### Fase 1 — Medir riqueza real y capacidad soportada (M)

**Archivos previstos**

- `backend/src/services/poi/NarrativeDurationTargetsV8.ts`
- Nuevo `backend/src/services/poi/NarrativeRichnessV8.ts`
- Tests directos de ambos módulos.

**Trabajo**

- Añadir al objetivo las metas de tarjetas, visualidad, espacialidad y facetas.
- Construir `NarrativeRichnessProfileV8` desde proposiciones y pasajes ya validados.
- Calcular escalones conservadores de capacidad (por ejemplo 180/240/300 s), calibrados con fixtures.
- Separar `groundingReady`, `writerReady` y `richnessReady` en vez de resumirlos en un único booleano.

**Aceptación**

- Un dossier con muchas proposiciones redundantes no obtiene capacidad completa.
- Un dossier variado y bien soportado puede conservar 300 s / 600 palabras.
- El cálculo es determinista e independiente del modelo.

**Verificación**

- Tests de frontera para 179/180, 239/240 y 299/300 s.
- Tests con repetición de pasajes, falta de anclas y diversidad suficiente.

### Fase 2 — Selección y curaduría orientadas a riqueza (M)

**Archivos previstos**

- `backend/src/services/poi/NarrativeResearchV8.ts`
- `backend/src/services/poi/NarrativeResearchV8.test.ts`
- Ajuste del schema/prompt del curador donde actualmente se define.

**Trabajo**

- Dimensionar spans y caracteres con la meta de tarjetas, no solo con palabras/proposiciones.
- Seleccionar por estratos: publisher, sección/posición, novedad, visualidad, espacialidad, transformación, acción humana y singularidad.
- Evitar que muchos spans equivalentes desplacen material complementario.
- Hacer que la segunda ronda pida explícitamente las facetas ausentes.
- Registrar por parada cuántos spans útiles quedaron fuera y por qué.

**Valores iniciales a calibrar**

- `targetEvidenceCards = clamp(6, 20, ceil(targetSeconds / 30))`.
- paquete entre 40 y 80 spans, ampliable solo con evidencia de truncamiento útil;
- caracteres derivados de la meta de tarjetas, con techo compatible con el límite actual del proveedor.

**Aceptación**

- Plaza Mayor no pierde material singular por llenar primero el cupo con una sola sección.
- Cibeles/Colón no se declaran ricas solo por repetir cronología o descripción genérica.
- La ronda adaptativa indica exactamente qué faceta intentó completar.

**Verificación**

- Tests offline de selección estratificada y presupuesto.
- Tests de fallback cuando no existe material para una faceta.

### Fase 3 — Reconciliar duración después de investigar (M)

**Archivos previstos**

- `backend/src/services/poi/NarrativeDurationTargetsV8.ts`
- `backend/scripts/validation/narrative-user-canary-v8.ts`
- Tests de duración y del workflow V8.

**Trabajo**

- Mantener el objetivo inicial para presupuestar investigación.
- Tras admitir los dossiers, producir un objetivo final basado en `NarrativeRichnessProfileV8`.
- Política: investigación dirigida → reducción de parada obligatoria → posible reemplazo de parada opcional.
- Redistribuir tiempo solo hacia paradas con capacidad libre probada y sin superar 300 s / 600 palabras en esta versión.
- Guardar objetivo inicial, objetivo final y razón en diagnóstico/review.

**Aceptación**

- Una parada delgada nunca llega al escritor con 600 palabras obligatorias.
- Una parada rica no se acorta por culpa de otra.
- La suma final nunca excede el presupuesto original y el tiempo no asignado queda explícito.

**Verificación**

- Tests de mezcla rica/delgada, todas ricas, todas delgadas y parada opcional reemplazable.
- Reanudación desde checkpoint con los mismos objetivos reconciliados.

### Fase 4 — Evidence cards y beat plan deterministas (M)

**Archivos previstos**

- Nuevo `backend/src/services/poi/NarrativeWriterContractV8.ts`
- `backend/src/services/poi/NarrativeEditorialEvidenceProjectionV8.ts`
- Tests de ambos módulos.

**Trabajo**

- Proyectar proposiciones admitidas a tarjetas sin ampliar su significado.
- Asignar tarjetas a beats según faceta, prioridad y arco del tour.
- Variar deliberadamente el tipo de apertura y la contribución de cada parada.
- Incluir en el input del escritor solo tarjetas autorizadas y el plan resultante.

**Aceptación**

- Todo `cardId` resuelve a una proposición y a pasajes válidos.
- Ningún beat obligatorio queda sin tarjeta.
- Dos paradas consecutivas no reciben la misma plantilla de apertura salvo que sea inevitable y quede diagnosticado.

**Verificación**

- Tests de trazabilidad, orden de beats, omisiones permitidas y variedad entre paradas.

### Fase 5 — Salida segmentada, validación y reparación segura (L)

**Archivos previstos**

- `backend/src/services/poi/NarrativeEditorialAgentsV6.ts`
- `backend/src/services/poi/NarrativeWriterContractV8.ts`
- `backend/src/services/poi/NarrativeEditorialWorkflowV8.ts`
- Tests de agentes/workflow.

**Trabajo**

- Activar el schema segmentado solo cuando la proyección declare `segments_v8`; V6 conserva `{stop_id, script}`.
- Validar beats, IDs de soporte, cobertura de tarjetas prioritarias y suma de palabras antes de normalizar.
- Exigir al menos 70% de uso de tarjetas de prioridad alta, salvo excepción explicada por el perfil de riqueza.
- Volver a comprobar longitud y soporte después de reparaciones.
- Si una reparación elimina material y deja la parada corta: usar primero tarjetas válidas no utilizadas; si no existen, reconciliar a la baja y registrar la causa. Nunca rellenar.

**Aceptación**

- Campos o IDs desconocidos fallan de forma clara antes de auditoría.
- El flujo V6 no cambia en sus tests de contrato.
- La salida V8 vuelve al formato actual de script/sentencias para reutilizar auditores y artefactos.

**Verificación**

- Tests de compatibilidad V6, schema V8, soporte vacío permitido/prohibido y reparación bajo mínimo.
- Build TypeScript del backend.

### Fase 6 — Repetición global y criterio de publicación (M)

**Archivos previstos**

- Nuevo analizador determinista de estilo V8 o extensión mínima del módulo de revisión existente.
- `backend/src/services/poi/NarrativeEditorialEvidenceProjectionV8.ts`
- `backend/scripts/validation/narrative-user-canary-v8.ts`
- Tests de revisión global.

**Trabajo**

- Medir aperturas repetidas, n-gramas/frases recurrentes y abuso de abstracciones conocidas.
- Pasar el informe compacto al auditor global para reparaciones localizadas.
- Distinguir motivos narrativos intencionales de muletillas accidentales.
- Añadir al `review.json` cobertura de tarjetas, beats, riqueza, longitud final y repetición.

**Aceptación**

- Expresiones como «capas», «memoria», «transformación», «ayuda a entender» y «no solo…» no pueden repetirse mecánicamente sin quedar señaladas.
- Cada parada conserva una contribución distinta al arco.
- No se crean falsas objeciones por nombres propios o capitalización.

**Verificación**

- Tests con repetición deliberada, motivo permitido y falsos positivos conocidos.

### Fase 7 — Validación escalonada y decisión sobre modelo (M)

**Orden**

1. Tests focalizados de los módulos modificados.
2. Build y suite del backend, comparando con el baseline conocido.
3. Replay offline de Plaza Mayor, Cibeles y Colón.
4. Un canario Madrid completo con checkpoint nuevo.
5. Benchmark de modelo solo si el tour no alcanza el umbral editorial.

**Criterios del canario**

- 7/7 paradas llegan a `artifact_write`.
- Cero afirmaciones duras sin soporte abiertas.
- Todas las paradas respetan su rango final reconciliado, también después de repair.
- Al menos 70% de las tarjetas prioritarias se usan con trazabilidad válida.
- No hay beats inventados ni relleno para alcanzar longitud.
- Cibeles y Colón son más cortas si no sostienen 600 palabras; Plaza Mayor conserva o mejora su densidad.
- Repetición global claramente menor que el baseline y sin aperturas clonadas.
- El coste total permanece bajo el presupuesto de USD 2; se reportan coste y tiempo por fase.

**Gate de modelo**

Solo si la arquitectura nueva sigue por debajo de 8/10 editorial o falla oralidad/inmersión con evidencia suficiente, ejecutar un bake-off ciego usando exactamente las mismas tarjetas y beats. Comparar GPT-5.4 mini con un máximo de dos alternativas disponibles en OpenRouter y decidir por calidad, latencia y coste. No investigar ni cambiar modelos antes de ese gate.

## Secuencia de commits propuesta

1. `test: capture V8 narrative richness baseline`
2. `feat: score evidence-backed narration capacity`
3. `feat: diversify V8 curator evidence selection`
4. `feat: reconcile narration duration with evidence richness`
5. `feat: add V8 evidence cards and beat plans`
6. `feat: validate structured V8 writer segments`
7. `feat: audit cross-stop narrative repetition`
8. `test: validate Madrid V8 richness canary`

Cada commit debe dejar los tests focalizados en verde y ser reversible sin depender de commits posteriores, salvo las dependencias explícitas entre fases.

## Riesgos y mitigaciones

- **Más contexto puede elevar coste/latencia:** ampliar por facetas faltantes y no por volumen indiscriminado; registrar tamaños reales.
- **El schema segmentado puede reducir fiabilidad del modelo:** hacerlo opt-in, probar primero con fixtures y conservar el modo V6.
- **Umbrales demasiado rígidos pueden acortar de más:** calibrar con tres perfiles de riqueza y guardar razones observables.
- **El detector de repetición puede castigar motivos útiles:** separar coincidencia literal, abstracción genérica y motivo intencional.
- **La reparación puede invalidar longitud o soporte:** validar nuevamente el artefacto final, no solo el primer borrador.

## Fuera de alcance

- Cambiar de proveedor o modelo antes del gate final.
- Reescribir el pipeline completo o sustituir el workflow V6 reutilizado.
- Debilitar las reglas de evidencia para obtener prosa más vistosa.
- Obligar a que los 120 minutos del recorrido sean narración continua.

## Definición de terminado

El trabajo termina cuando el canario completo produce un tour factual, trazable y publicable en el que la longitud de cada parada refleje la riqueza probada, los segmentos sigan beats respaldados, la repetición global sea menor y ninguna frase exista solo para completar 600 palabras.
