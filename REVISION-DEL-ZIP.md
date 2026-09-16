# Revisión independiente del sandbox de sustitución de Astra

**Fuente inspeccionada:** `astra-replacement-20260911-175200.zip`.

Se extrajo el archivo y se inspeccionaron el runner de 1.254 líneas, los briefs, prompts, metadata, referencias históricas, resultados de selección y auditorías. No se ejecutó el runner original ni se hicieron llamadas de generación. Se probó exclusivamente su función `balanced_compare` aislada con un juez simulado. El manifest adjunto identifica los archivos y sus hashes.

## Hallazgos comprobados

### 1. No existe una comparación DeepSeek–Astra ejecutada

`ASTRA-REPLACEMENT-REPORT.md` declara `NOT EXECUTED (BLOCKED - DEEPSEEK_CONFIG_INCONCLUSIVE)`. El archivo `benchmark/deepseek-vs-astra/BLOCKED.json` y las líneas 843–853 del runner implementan ese bloqueo. Los 462 registros de `metrics/calls.jsonl` contienen 108 llamadas Writer, 76 internal, 4 b-vs-c, 4 c-vs-d y 270 factual; ninguna corresponde a DeepSeek-vs-Astra.

**Implicación:** el experimento no ha medido todavía la pregunta principal. El bloqueo venía del protocolo solicitado, no demuestra una incapacidad de DeepSeek.

### 2. Hay 15 candidatos C completos, pero solo dos están auditados

Existen `arm-c-brief/<stop>/C1.md`, `C2.md` y `C3.md` para las cinco paradas. Las 15 metadata tienen `finish_reason=stop`, `status=OK` y entre 450 y 600 palabras. La suma de los intentos registrados para esos candidatos es 26, no 15.

En `factual/arm-c/` solo `cibeles.json` (C1, 51 oraciones) y `puerta-alcala.json` (C3, 38 oraciones) contienen auditoría. Palacio, Plaza Mayor y Plaza de España tienen `NO_ARM_WINNER`.

Las cifras 49 SUPPORTED, 1 PARTIALLY_SUPPORTED, 1 UNSUPPORTED y 38 EDITORIAL describen esos **dos** guiones, no los quince. No deben generalizarse a todo el brazo C. Los rechazos del Writer no se conservaron como texto; su contenido no puede reconstruirse a partir de `usage`.

### 3. La atribución Astra está declarada, pero el ZIP no transporta toda la prueba primaria

Los cinco `baselines/astra/*.meta.json` indican `model=gpt-6-astra`, `writerConfirmed=true`, `effort=low`, `transport=codex_cli` y procedencia `astra-batching-20260910-1/together/tour.md`.

Las líneas 371–372 del runner calculan `writerConfirmed` usando **solo** `requested_model` de un archivo externo: `combined-author/result.private.json`. Ese archivo no está incluido en el ZIP. El inventario también usa `writerConfirmed=True` literal para una fuente alternativa, líneas 394–406.

Esto no demuestra que la atribución sea falsa. Significa que esta copia del experimento no permite verificar de forma independiente toda la cadena de procedencia. Hay que copiar la prueba original desde el repositorio, cuando exista, y distinguir modelo solicitado, modelo reportado y transformaciones posteriores.

La fuente se denomina `together/combined-author`: no se debe presentar como cinco llamadas Astra aisladas. Tampoco está demostrado aquí que sus inputs sean idénticos a los del Curator. La comparación de textos seguirá siendo útil como **referencia histórica de producto**, pero no como experimento que cambia exclusivamente el modelo.

### 4. El Brief V2 contribuye al estilo observado

En `inputs/palacio-real/narrative-brief-v2.json`:

- `writerInstructions[0]` exige abrir con una pregunta.
- `writerInstructions[4]` exige mencionar las cifras discrepantes de visitantes.
- `excludedMaterial[3]` omite la leyenda del incendio para no confundir la causalidad.
- `writerInstructions[5]` vuelve a permitir mencionar esa misma leyenda, si se presenta como tal.

Palacio C1 incluye tanto la leyenda como la discrepancia de visitantes. No es correcto atribuir estos dos elementos únicamente a decisiones espontáneas del Writer.

También Plaza Mayor, Plaza de España y Puerta de Alcalá exigen abrir con la pregunta central. La repetición de esa estructura es, por tanto, al menos parcialmente inducida por instrucciones. Esto no prueba que el Writer carezca de variedad.

El `storySelection.selected` retiene los siguientes IDs existentes:

| Parada | IDs seleccionados / IDs disponibles | Optional facts |
|---|---:|---:|
| Palacio Real | 24 / 27 | 3 |
| Plaza Mayor | 26 / 27 | 3 |
| Plaza de España | 21 / 23 | 4 |
| Cibeles | 25 / 25 | 4 |
| Puerta de Alcalá | 23 / 25 | 3 |

Son IDs de passages y propositions, no hechos independientes: algunas fuentes describen el mismo hecho. Las cifras no miden por sí solas la compresión del texto. Sí muestran que no basta con afirmar que el Curator está seleccionando seis o siete hechos y excluyendo el resto.

### 5. Hay inconsistencias en el contexto de entrada

En `inputs/palacio-real/evidence-store.json`, `tourContext.previousStop.stopId=Q1123493` aparece con nombre Palacio Real, aunque la tabla STOPS del propio runner lo identifica como Plaza Mayor. `nextStop.stopId=Q1326261` aparece con nombre plaza de Cibeles, aunque corresponde a Plaza de España en esa tabla.

En Cibeles, el propio brief excluye observaciones que describen Puerta de Alcalá. No hay que arreglar estos inputs retroactivamente: deben registrarse como posibles fuentes de confusión y corregirse en un experimento posterior aislado, no mezclar la corrección con esta medición.

### 6. El agregador sigue confundiendo ausencias y sesgo con empate

En las líneas 733–775, `balanced_compare` devuelve `TIE` siempre que `x_wins == y_wins`, sin distinguir por qué.

La prueba local con un juez simulado confirmó:

| Respuestas con posiciones alternadas | Resultado del código viejo | Interpretación correcta |
|---|---|---|
| A, A, A, A | TIE | Dependencia de posición |
| FAILED, FAILED, FAILED, FAILED | TIE | Datos ausentes |
| A, B, A, B | C | Preferencia consistente por C |

Los resultados reproducibles están en `legacy_aggregation_fixture_results.json`.

Además, las líneas 706–709 del selector interno permiten que una orientación con voto y otra sin ganador produzcan un ganador del par. Esto mezcla un TIE o un fallo con evidencia insuficiente.

### 7. Varias garantías se reportan sin validación suficiente

- La generación llama `valid_writer(content)`, que comprueba texto, palabras y puntuación final, pero no usa `meta.finish_reason` como gate (líneas 654–668). Los 15 C sí reportan stop; el defecto es del guard, no prueba de truncamiento en ellos.
- Se copian inputs al sandbox, pero `arm_user_prompt` vuelve a leer el directorio P2B original (líneas 589–603). Los prompts guardados no son prueba criptográfica de la request que realmente salió.
- El modelo almacenado por `call_deepseek` es el configurado, no el `model` devuelto por el servidor. Las respuestas HTTP completas no se conservan.
- La latencia se toma antes de `json.load(resp)` (170–172); no es una medición completa del tiempo hasta recibir y leer la respuesta.
- Los cuatro “critical” del resumen son las cuatro etiquetas UNSUPPORTED de D. Cuando no hay configuración ganadora, la línea 1047 elige D por defecto y las líneas 1067–1068 equiparan unsupported con critical y partial con major. Eso no es una evaluación de gravedad.
- El factual verifier se importa de un archivo externo que no está incluido en este ZIP (882–887). No basta la etiqueta “reused literally” para verificar su implementación en esta copia.

### 8. D no prueba limpiamente «estilo Astra» ni el efecto exclusivo de los ejemplos

La selección Gold usa los primeros dos elementos elegibles por orden del corpus, no relevancia estilística (497–504). `sameHistoricalEvent` se iguala a `sameStop` (489), por lo que no existe una comprobación separada del acontecimiento.

C y D no difieren solo en la inserción de los Gold: C exige “Sigue los beats del brief”; D omite esa instrucción y usa un bloque de instrucciones distinto (531–559 y 603–627). Los ejemplos sí se insertan en el constructor de prompts. La comprobación comprueba un prefijo de 40 caracteres, no el hash del contenido completo enviado (637–640).

**Conclusión:** los ejemplos usados no ganaron esta medición, pero el resultado no justifica descartar todo Style RAG ni afirmar que ya se ensayó una imitación controlada de Astra.

## Qué cambia en el siguiente encargo

No se requiere otro modelo, otro Curator ni un nuevo corpus todavía. Se necesita medir los quince C existentes frente a las cinco referencias históricas, auditar lo que realmente les ordenan sus briefs y comprobar la calidad sin un selector que impida llegar a Astra.

Una coincidencia o victoria aislada es una señal exploratoria; no establece regularidad, desempeño del selector ni paridad general. Una preferencia del mismo modelo que escribió los candidatos tampoco sustituye la evaluación humana.

## Fuentes externas de apoyo metodológico

Estas fuentes no prueban resultados del ZIP; justifican precauciones y parámetros del protocolo nuevo:

- Zheng et al., *Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena*, arXiv:2306.05685: sesgos de posición, verbosidad y autopreferencia.
- Shi et al., *Judging the Judges: A Systematic Study of Position Bias in LLM-as-a-Judge*, arXiv:2406.07791: consistencia al invertir posiciones y estabilidad.
- DeepSeek, documentación oficial Thinking Mode y JSON Output, consultada el 11-09-2026: parámetros explícitos y validación de salida estructurada.
