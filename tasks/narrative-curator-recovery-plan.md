# Plan técnico: recuperación del curador narrativo V8

Estado: ejecutado y validado; canario terminado con revisión humana pendiente  
Fecha: 2026-09-03  
Ámbito: backend narrativo V8  
Plan independiente: no sustituye ni modifica `tasks/plan.md` ni `tasks/todo.md`.

## 1. Objetivo

Conseguir que el canario completo de Madrid termine el tour después de que el
curador produzca una respuesta útil pero imperfecta, sin relajar las garantías
de evidencia y sin aumentar el presupuesto. Los cambios de modelo solo se
admiten cuando una ejecución controlada demuestra que una fase concreta los
necesita.

El resultado esperado es que:

- las selecciones de evidencia separadas se representen de forma válida y
  conservadora;
- las autorizaciones de nombres y números se limiten a lo respaldado
  literalmente por la evidencia seleccionada;
- una primera ronda válida alimente correctamente la segunda ronda con los
  roles narrativos que aún falten;
- los errores inseguros continúen fallando de forma cerrada;
- el canario escriba el tour y llegue a `artifact_write` dentro del límite de
  USD 2.

## 2. Evidencia observada

Canario analizado:

- run: `madrid-v8-qwen38-qid-schema-20260903-2`
- coste acumulado registrado: USD 0.0709026
- núcleo canónico: válido
- ruta: 7 paradas
- fallo: investigación/curación de Plaza Mayor y Catedral de la Almudena
- estado final de ambas: `evidence_review_required`
- motivo: `curator_contract_failed: supports reference non-contiguous spans`
- editorial: no se generó

Los cuatro llamados al curador —dos por parada— fueron respuestas JSON válidas
del proveedor y terminaron normalmente. GPT-5.4 mini no falló por formato,
timeout ni disponibilidad. El gasto de esas cuatro respuestas fue
aproximadamente USD 0.03412.

El prompt ya pide entre uno y tres spans contiguos de una misma fuente. Sin
embargo, el esquema JSON solo puede comprobar que los IDs pertenezcan al
conjunto permitido; no puede expresar que sean consecutivos ni vincular cada
`sourceId` con los spans que realmente le pertenecen.

Ejemplos reales devueltos por el curador:

- Plaza Mayor: `[0042, 0045]`, `[0003, 0024]`,
  `[0009, 0012, 0013]`.
- Almudena: `[0109, 0024]`, `[0026, 0027, 0030]`,
  `[0008, 0031, 0032]`.

La validación estructural inmediata acepta esas respuestas. La validación
semántica estricta ocurre después, en `buildValidatedDossierV8`, y las rechaza.
Como la primera ronda nunca llega a almacenarse en `state.round`, la segunda
ronda no recibe `missingWriterRoles`; repite esencialmente la misma petición en
lugar de reparar la cobertura narrativa faltante.

Una simulación offline mostró lo siguiente:

- al dividir cada selección no contigua en grupos contiguos máximos, la
  estructura vuelve a ser segura;
- Plaza Mayor todavía presentaba `authorizedNumbers: ["10"]`, aunque la
  evidencia seleccionada decía «diez» y no contenía el literal `10`;
- al filtrar conservadoramente autorizaciones no literales, Plaza Mayor produjo
  un dossier válido y `writerReady=true`;
- Almudena produjo un dossier válido, pero quedó pendiente únicamente el rol
  `tension_or_contrast`;
- con una primera ronda válida, el mecanismo existente puede solicitar ese rol
  concreto en la segunda ronda.

## 3. Causa raíz

El problema no es principalmente la capacidad narrativa del modelo. Es una
brecha de contrato entre cuatro capas:

1. El prompt expresa reglas semánticas que el esquema JSON no puede imponer.
2. La respuesta se considera válida antes de comprobar esas reglas.
3. El validador estricto correctamente rechaza después la evidencia insegura.
4. El estado de la primera ronda se pierde por completo, de modo que la segunda
   ronda carece de la información necesaria para ser una reparación real.

Cambiar a un modelo más grande solo reduciría probabilísticamente la frecuencia
del error. No eliminaría la incompatibilidad del contrato y aumentaría el
coste.

## 4. Decisiones técnicas

### 4.1 Mantener estricto el dossier

`buildValidatedDossierV8` seguirá rechazando entradas crudas con spans
desconocidos, duplicados, cruzados entre fuentes o no contiguos. No se eliminarán
ni debilitarán las pruebas existentes que protegen este comportamiento.

### 4.2 Normalizar de forma conservadora antes del dossier

Se añadirá una función pura en la frontera curador → dossier. La función
trabajará sobre una copia de la salida del proveedor y devolverá tanto la salida
normalizada como un informe auditable.

Interfaz orientativa:

```ts
export interface NarrativeCuratorNormalizationV8 {
  output: NarrativeCuratorOutputV8;
  report: {
    splitSupportCount: number;
    removedAuthorizedNames: string[];
    removedAuthorizedNumbers: string[];
  };
}

export function normalizeNarrativeCuratorOutputV8(input: {
  output: NarrativeCuratorOutputV8;
  captures: NarrativeCapturedSourceV8[];
  spansBySource: ReadonlyMap<string, NarrativeEvidenceSpanV7[]>;
  authorizedIdentityNames?: string[];
}): NarrativeCuratorNormalizationV8;
```

Reglas exactas:

- No mutar la respuesta original del proveedor.
- Para cada `support` con entre uno y tres IDs únicos, conocidos y pertenecientes
  al `sourceId`, ordenar los spans según su posición en la fuente y dividirlos
  en grupos contiguos máximos.
- Ejemplo: `[0026, 0027, 0030]` se convierte en dos objetos `support`:
  `[0026, 0027]` y `[0030]`.
- Conservar la unión exacta de evidencia seleccionada. Nunca añadir spans que el
  modelo no seleccionó.
- Si hay un ID desconocido, spans de otra fuente, duplicados o más de tres IDs,
  no intentar reparar la entrada. Se deja intacta para que el validador estricto
  la rechace.
- Reconstruir los pasajes aceptados con la misma lógica de captura y offsets que
  usa el dossier.
- Intersectar `authorizedNames` y `authorizedNumbers` con los valores respaldados
  literalmente por esos pasajes o, en el caso permitido, por nombres de
  identidad autorizados.
- La normalización solo puede retirar permisos; nunca inventarlos ni ampliarlos.
- Registrar cuántos supports se dividieron y qué autorizaciones se retiraron.
  La salida cruda ya queda conservada en los artefactos privados del canario.

### 4.3 Integrar antes de `buildValidatedDossierV8`

`curateRoundV8` aplicará la normalización inmediatamente antes de construir el
dossier. Si después quedan errores inseguros, el flujo fallará cerrado como
ahora.

Una primera ronda normalizada y válida sí se guardará en `state.round`. Si aún
faltan roles para escritura, la segunda ronda recibirá exactamente
`state.round.gates.missingWriterRoles`.

### 4.4 Reforzar el contrato del prompt

El prompt incluirá ejemplos inequívocos:

- `0026 + 0027` es contiguo y válido.
- `0026 + 0030` no es contiguo; debe usar dos objetos `support` o dividir la
  afirmación en proposiciones atómicas.
- `authorizedNumbers` debe contener el texto exacto presente en los pasajes;
  no debe transformar «diez» en `10`.

La guía debe vivir en una constante exportable y probada, compartida por el
flujo narrativo y el canario, para evitar que el contrato escrito y el contrato
ejecutado vuelvan a divergir.

### 4.5 Cambio de escritor basado en evidencia, sin cambiar el presupuesto

La curación se mantiene en GPT-5.4 mini a través de OpenRouter. Durante la
ejecución, Qwen local produjo guiones demasiado cortos incluso después de recibir
feedback semántico (249 y 395 palabras frente a un mínimo entonces fijado en
630). Por ello se cambió únicamente el escritor largo del perfil
`qwen38_hybrid` a GPT-5.4 mini mediante OpenRouter. Qwen permanece en las fases
locales de apoyo. El límite total continúa en USD 2.

Una ejecución posterior mostró además que el objetivo fijo de 700 palabras
presionaba innecesariamente dossiers parciales. La política final usa 120
palabras por minuto, un máximo objetivo de 600 palabras por parada y un margen
inferior de 20 palabras; el prompt prohíbe repetir o estirar afirmaciones para
alcanzar la cifra.

## 5. Fuera de alcance

- Relajar la continuidad de evidencia en `buildValidatedDossierV8`.
- Aceptar silenciosamente spans desconocidos o de otra fuente.
- Convertir automáticamente números escritos en palabras.
- Subir el límite de gasto.
- Cambiar OpenRouter o migrar fases de modelo sin evidencia de ejecución.
- Corregir fallos preexistentes de suites no relacionadas.
- Rediseñar el pipeline narrativo V8 completo.

## 6. Plan de implementación

### Tarea 1 — Normalizador puro y conservador

Archivos previstos:

- `backend/src/services/poi/NarrativeDossierV8.ts`
- `backend/src/services/poi/NarrativeDossierV8.test.ts`

Trabajo:

- Añadir el tipo de reporte y la función pura de normalización.
- Implementar la partición en grupos contiguos máximos.
- Reutilizar la misma interpretación de fuentes, offsets y texto que el dossier.
- Filtrar autorizaciones no respaldadas de manera literal.
- Mantener intacto el validador estricto.

Pruebas de aceptación:

- `[0026, 0027, 0030]` se convierte en `[0026, 0027]` + `[0030]`.
- Se conserva exactamente la unión de spans elegidos.
- La entrada original no cambia.
- Se retira `10` si el pasaje solo contiene «diez».
- Se conserva una autorización respaldada literalmente.
- IDs desconocidos, spans cruzados, duplicados y selecciones de más de tres
  siguen siendo rechazados por el dossier.
- La prueba existente de rechazo de una entrada cruda no contigua sigue pasando.

Tamaño estimado: pequeño/medio.  
Dependencias: ninguna.

### Tarea 2 — Integración con las dos rondas de curación

Archivos previstos:

- `backend/src/services/poi/NarrativeResearchV8.ts`
- `backend/src/services/poi/NarrativeResearchV8.test.ts`

Trabajo:

- Aplicar el normalizador dentro de `curateRoundV8`, antes del dossier.
- Conservar el reporte para diagnóstico estructurado.
- Verificar que una primera ronda reparable produzca `state.round`.
- Mantener el fallo cerrado para selecciones inseguras.

Pruebas de aceptación:

- Una primera respuesta con spans separables genera un dossier válido.
- Si esa ronda carece de `tension_or_contrast`, la segunda llamada recibe
  `priorityRoles: ["tension_or_contrast"]`.
- La segunda ronda puede completar `writerReady=true`.
- Un span desconocido o cruzado termina en `evidence_review_required`.
- El número de rondas y el control de presupuesto no cambian.

Tamaño estimado: medio.  
Dependencias: Tarea 1.

### Tarea 3 — Contrato explícito y comprobable del prompt

Archivos previstos:

- `backend/src/services/poi/NarrativeResearchV8.ts`
- `backend/src/services/poi/NarrativeResearchV8.test.ts`
- `backend/scripts/validation/narrative-user-canary-v8.ts`

Trabajo:

- Extraer una guía común para soportes contiguos y autorizaciones literales.
- Añadir los ejemplos positivos y negativos definidos en la sección 4.4.
- Usar la guía en el prompt del canario.
- Probar que el contrato esencial esté presente.

Pruebas de aceptación:

- El prompt distingue explícitamente IDs consecutivos de IDs solo ordenados.
- Explica cómo representar evidencia separada sin perderla.
- Prohíbe normalizar números entre palabras y cifras.
- No reduce `evidenceSpanIds` a un solo elemento: el soporte de pasajes
  contiguos de hasta tres spans sigue permitido.

Tamaño estimado: pequeño.  
Dependencias: puede desarrollarse después de Tarea 1; se valida junto con Tarea
2.

### Punto de control A — Validación local y revisión

Ejecutar:

```bash
cd /home/jesusotero/coding/tour-guide-app/backend
npx jest src/services/poi/NarrativeDossierV8.test.ts --runInBand
npx jest src/services/poi/NarrativeResearchV8.test.ts --runInBand
npx jest src/services/poi/NarrativeUserCanaryRuntimeV8.test.ts --runInBand
npm run build
```

Criterios para continuar:

- todas las pruebas enfocadas pasan;
- el build termina correctamente;
- no se debilitó ninguna aserción del dossier;
- solo cambiaron los archivos autorizados;
- la revisión confirma que el normalizador no amplía evidencia ni permisos.

La suite completa tiene fallos preexistentes fuera de este alcance. Se usará
para detectar regresiones comparando contra ese baseline, no como condición de
que todo el repositorio quede verde. `npm run lint` tampoco es hoy una señal
válida porque el proyecto no dispone de la configuración ESLint esperada; no se
corregirá eso dentro de este trabajo.

### Tarea 4 — Replay forense offline

Sin cambios de producción adicionales.

Trabajo:

- Pasar las respuestas reales capturadas de Plaza Mayor y Almudena por el nuevo
  normalizador y luego por `buildValidatedDossierV8`.
- Confirmar que no se introducen spans ni autorizaciones nuevas.
- Confirmar que Plaza Mayor queda lista para escritura.
- Confirmar que Almudena produce una primera ronda válida y expone únicamente
  `tension_or_contrast` como rol faltante.

Criterio de aceptación:

- Plaza Mayor: dossier válido y `writerReady=true`.
- Almudena: dossier válido; el rol faltante coincide con
  `tension_or_contrast` y es utilizable por la segunda ronda.

Dependencias: Punto de control A.

### Tarea 5 — Canario completo controlado de Madrid

Se reutilizará el checkpoint que ya contiene ciudad y ruta. Para preservar una
contabilidad coherente, el nuevo proceso declarará los USD 0.0709026 ya
registrados; no se afirmará que el gasto anterior es cero.

Comando previsto:

```bash
cd /home/jesusotero/coding/tour-guide-app/backend

npm run quality:narrative:v8:user-canary -- \
  --generate \
  --allow-external \
  --profile=qwen38_hybrid \
  --city=Madrid \
  --city-qid=Q2807 \
  --country=España \
  --country-code=ES \
  --theme=history \
  --language=es \
  --duration=120 \
  --prior-spend-usd=0.0709026 \
  --run-id=madrid-v8-qwen38-curator-recovery-20260903-1 \
  --resume-checkpoint=/home/jesusotero/coding/tour-guide-app/backend/tmp/narrative-v8/madrid-v8-qwen38-qid-schema-20260903-2/checkpoint.private.json \
  --resume-from=route
```

Antes de ejecutarlo se verificará que el checkpoint existe, corresponde a
Madrid/Q2807 y declara `completedPhase: "route"`. Si el checkpoint ha cambiado o
no coincide, no se forzará el resume: se generará un run ID nuevo y se hará un
canario limpio.

Criterios de aceptación del canario:

- los tres core audits son válidos;
- ninguna parada termina en `curator_contract_failed`;
- las siete paradas tienen dossier utilizable para escritura;
- se genera una editorial y un `tour.md` no vacío y sustantivo;
- `review.json.completedStage` es `artifact_write`;
- `review.json.failure` es `null`;
- el gasto acumulado permanece por debajo de USD 2;
- los artefactos dejan trazabilidad de las normalizaciones realizadas.

Un resultado final `review_required` puede ser aceptable si el tour terminó y
los artefactos fueron escritos. Ese estado representa revisión editorial o de
publicación, no necesariamente un fallo de ejecución.

## 7. Dependencias

```text
Tarea 1: normalizador y pruebas
  ├──> Tarea 2: integración y estado de segunda ronda
  └──> Tarea 3: contrato del prompt
            │
            v
     Punto de control A
            │
            v
     Tarea 4: replay offline
            │
            v
     Tarea 5: canario de Madrid
```

Las tareas 2 y 3 pueden implementarse en paralelo únicamente después de que la
interfaz de la Tarea 1 quede estable. La ejecución externa no comienza hasta
terminar revisión y replay offline.

## 8. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
| --- | --- | --- |
| Dividir supports aumenta el número de pasajes | Dossier más grande | Usar solo grupos contiguos máximos y no duplicar spans |
| El filtrado oculta un defecto del modelo | Menor observabilidad | Conservar salida cruda y emitir reporte de elementos retirados |
| Una proposición mezcla hechos alejados | Evidencia ambigua | Preservar varios supports y pedir proposiciones atómicas en el prompt |
| Almudena sigue sin contraste | Tour no listo | Probar que la segunda ronda recibe el rol faltante concreto |
| Se repara evidencia insegura por accidente | Riesgo factual | No reparar IDs desconocidos, cruzados, duplicados o fuera de límite |
| El resume rechaza el presupuesto | Canario no inicia | Usar el coste previo exacto y verificar checkpoint antes de ejecutar |
| Una puerta editorial devuelve `review_required` | Falso negativo | Separar finalización del tour de aprobación de publicación |
| Cambiar demasiadas fases de modelo enmascara la causa | Más coste y menor claridad | Cambiar solo el escritor después de medir el fallo de Qwen; mantener las fases locales de apoyo |

## 9. Estrategia de rollback

- Mantener la normalización aislada y pura para poder retirar su integración sin
  tocar el validador del dossier.
- Si aparece una regresión, revertir las modificaciones del normalizador,
  integración y prompt como una unidad.
- No modificar artefactos históricos ni checkpoints existentes.
- No borrar las pruebas que demuestran el fallo crudo de spans no contiguos.
- No compensar una regresión aumentando presupuesto, reintentos o tamaño del
  modelo.

## 10. Definición de terminado

- [x] Normalizador puro implementado y probado.
- [x] El dossier sigue rechazando entradas crudas inseguras.
- [x] Las autorizaciones quedan limitadas a evidencia literal.
- [x] La primera ronda válida alimenta los roles faltantes de la segunda.
- [x] El prompt comparte un contrato explícito y comprobado.
- [x] Pruebas enfocadas y build pasan.
- [x] Replay de Plaza Mayor y Almudena confirma el comportamiento esperado.
- [x] Canario completo de Madrid llega a `artifact_write` sin fallo.
- [x] `tour.md` es sustantivo y revisable.
- [x] El gasto total permanece por debajo de USD 2.
- [x] Se revisa el diff final y no hay cambios ajenos a la recuperación narrativa.

## 11. Resultado de ejecución

La ejecución final fue
`madrid-v8-qwen38-curator-recovery-20260903-7`. Reutilizó la ruta, la
investigación, el arco y los guiones válidos de checkpoints anteriores. El
canario terminó en 14 min 55 s con:

- 7 de 7 paradas elegibles y 7 guiones escritos;
- `completedStage: artifact_write` y `failure: null`;
- 4.115 palabras narrativas, unas 30 min de escucha;
- gasto acumulado de USD 1.04461865 y exposición no verificada de USD 0;
- estado `review_required`, permitido por el plan, con dos objeciones factuales
  abiertas para revisión humana antes de publicar.

Durante el canario se corrigieron dos bloqueos adicionales descubiertos en
ejecución: el escritor ahora reintenta dentro de la validación semántica de
longitud, y la auditoría narrativa global ya no duplica dossiers, fuentes y
pasajes hasta superar 150.000 caracteres. El scorecard conserva una proyección
separada con evidencia completa.

Las pruebas enfocadas y el build pasan. La suite completa vuelve exactamente al
baseline conocido: 138 suites pasan y 6 suites ajenas fallan, con 1.161 pruebas
pasadas, 13 fallidas y 1 omitida.

## 12. Condición para reconsiderar el modelo

Solo abrir un benchmark de modelos alternativos si, después de esta corrección,
dos ejecuciones controladas consecutivas cumplen el contrato técnico pero no
alcanzan calidad narrativa suficiente o siguen requiriendo reparaciones
semánticas frecuentes.

Ese benchmark deberá comparar, mediante OpenRouter y con el mismo conjunto de
evidencia:

- tasa de dossier válido en el primer intento;
- cobertura de roles narrativos;
- fidelidad de nombres, cifras y citas;
- tiempo total por parada;
- coste por tour terminado, no solo coste por token.

Hasta entonces, la decisión es corregir la frontera del pipeline y conservar
GPT-5.4 mini.
