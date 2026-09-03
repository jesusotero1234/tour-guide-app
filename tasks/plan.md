# Plan de ejecución: Madoz Málaga 100 % funcional

## 1. Autoridad, estado y alcance

- Este es el único plan activo para `historical-corpus-pod`.
- Sustituye el plan amplio anterior del corpus Madoz; Git conserva su historial.
- Rama: `codex/feature/historical-corpus-rag-podman`.
- Estado: **plan preparado; pendiente de aprobación para ejecutar**.
- Fecha: 2026-09-03.
- Codex decide arquitectura, comportamiento, validación y aceptación.
- Qwen ejecutará solamente cambios mecánicos acotados después de que Codex
  haya cerrado cada contrato.

El objetivo queda limitado a una sola fuente y un solo producto:

```text
Fuente: Diccionario geográfico-estadístico-histórico, tomo XI (1848)
Producto: bloque Málaga disponible en PDF 39–109
Cobertura física: 71 páginas PDF
Cobertura bibliográfica: parcial; faltan seis páginas impresas en la fuente
Runtime: servicio independiente con Podman
Exposición: local y privada
```

Quedan fuera de este plan:

- otros libros o tomos, incluido el tomo XVI;
- un clasificador universal de documentos;
- backend narrativo, frontend y canario;
- descargas o llamadas de red durante OCR;
- reconstruir o inventar páginas ausentes;
- declarar que el tomo o el artículo Málaga están completos;
- corrección silenciosa mediante LLM;
- despliegue público.

## 2. Qué significa «100 % funcional»

No significa OCR perfecto carácter por carácter ni completar material que el
PDF no contiene. Significa que, para las 71 páginas disponibles de Málaga:

1. cada página se procesa sin crash y con identidad reproducible;
2. el texto narrativo conserva el orden de lectura real;
3. las tablas giradas o mixtas se leen por regiones y no contaminan columnas;
4. texto y tablas quedan buscables sin perder página, línea ni caja de origen;
5. una búsqueda devuelve evidencia y preview de la página correcta;
6. las seis páginas impresas ausentes se exponen como huecos y nunca se
   sustituyen con una respuesta inventada;
7. los gates OCR y de recuperación existentes se superan;
8. preparar, publicar localmente, reiniciar y reparar el índice son
   reproducibles con Podman;
9. el servicio sigue aislado y el canario permanece intacto.

La aceptación se divide en dos hitos:

- **Técnicamente listo:** OCR, bundle de 71 páginas y evaluación de búsqueda
  aprobados en entorno privado.
- **Producto local publicado:** además requiere que una persona confirme los
  derechos de uso de la digitalización y acepte expresamente la cobertura
  parcial. No se debilitará ese gate para terminar antes.

## 3. Evidencia inicial

### 3.1 Ya implementado

El servicio independiente ya dispone de:

- API FastAPI, SQLite/FTS5, Qwen y TurboVec;
- contenedores API e ingesta con Podman;
- manifiesto e inventario estrictos;
- preparación reanudable y publicación separada;
- locks, migración, journal y reparación del índice;
- procedencia por página/línea/caja y previews;
- comandos de evaluación OCR y recuperación;
- suite completa previamente verde con 604 pruebas;
- fuente, datos, modelos y material de revisión fuera de Git.

### 3.2 Referencia OCR privada disponible

La muestra actual contiene 24 páginas y 7.035 líneas:

```text
/home/jesusotero/.local/share/tour-guide/historical-corpus/
  madoz-t11-ai-review/madoz-t11.ai-assisted.private.jsonl
```

Estado de revisión:

- 8 páginas adjudicadas visualmente;
- 15 páginas revisadas mediante consenso de dos OCR y revisión dirigida de
  cifras;
- 1 página con tabla densa y advertencia explícita;
- 24/24 filas válidas contra `OcrGoldPage`;
- SHA-256 de la referencia:
  `f608e32668075743bb879c7d040957b36e954136d1202e2aab1e65af70a28c3c`.

No se denomina «gold humano»: es una referencia privada asistida por IA cuya
autoridad final es el facsímil.

### 3.3 Resultado del OCR actual

La evaluación reproducible actual terminó sin páginas fallidas, pero no
superó calidad:

| Métrica | Actual | Gate |
|---|---:|---:|
| CER | 15,30 % | máximo 8 % |
| WER | 21,43 % | máximo 18 % |
| Error de tokens críticos | 53,45 % | máximo 5 % |
| Boundary F1 | 0,301 | mínimo 0,90 |
| Páginas fallidas | 0 | máximo 0 |
| Reading-order pairs | 0 | debe ser no vacío y ≥ 0,95 |

El valor 1,0 de reading-order no es aceptación: actualmente se calculó sobre
cero pares. Este plan exige anclas suficientes para volverlo significativo.

Los mayores fallos se concentran en PDF 42, 52, 70, 71 y 89–92. La evidencia
visual demuestra que PP-OCRv6 reconoce bien cuando recibe el recorte y la
orientación correctos; el problema principal es segmentación, orientación y
recomposición del layout.

## 4. Decisiones técnicas cerradas

### 4.1 No cambiar el motor todavía

Se mantiene PP-OCRv6 medium con Transformers en CPU. No se añade otro modelo,
PaddlePaddle, GPU ni servicio permanente. Solo se reconsiderará el motor si,
después de corregir layout, el CER por carácter sigue fallando en páginas
normales correctamente segmentadas.

### 4.2 Perfil determinista de este libro

No se intentará resolver «cualquier PDF». El manifiesto privado de Madoz será
la autoridad de layout para las páginas excepcionales.

Se añadirá un contrato opcional de regiones ordenadas por página. Cada región
declarará:

- caja normalizada dentro de la página;
- rol `body` o `table`;
- rotación OCR `0`, `90`, `180` o `270`;
- número de columnas cuando aplique;
- orden estable dentro de la página.

Ausencia de regiones conserva el comportamiento anterior. Así no se rompe la
ingesta existente ni se introducen heurísticas globales basadas solo en este
libro.

Perfil mínimo obligatorio:

| PDF | Tratamiento |
|---:|---|
| 42 | cuerpo superior a dos columnas, tabla horizontal y tabla inferior girada |
| 52 | texto superior a tres columnas y tabla inferior girada |
| 70 | texto/tabla de distancias a la izquierda y tabla municipal girada a la derecha |
| 71 | dos columnas superiores, tabla central y dos columnas inferiores |
| 89 | texto superior a tres columnas y tabla inferior |
| 90–91 | tabla de página completa en orientación corregida |
| 92 | tabla girada a la izquierda y artículo del cementerio a la derecha |

PDF 39, 41, 60, 68, 69, 102 y 108 permanecen en la muestra para evitar que el
arreglo de los casos difíciles deteriore páginas normales y tablas ya buenas.

### 4.3 Composición y procedencia

Cada región se OCRiza una sola vez en su orientación efectiva. Después:

1. sus polígonos vuelven al sistema de coordenadas de la página;
2. las líneas se ordenan dentro de la región;
3. las regiones se concatenan por su orden declarado;
4. se eliminan duplicados provenientes del OCR general solapado;
5. encabezados, pies y marca Google conservan procedencia, pero no forman
   contenido recuperable;
6. ningún texto corregido sustituye silenciosamente `originalText`.

El fingerprint incluirá versión del contrato de layout, cajas, rotaciones,
columnas y orden. Cambiar cualquier valor invalida la reutilización de páginas
preparadas incompatibles.

### 4.4 Tablas buscables mediante opt-in

Actualmente `madoz_chunking._body_lines` excluye todas las líneas `table`.
Para que este único producto sea funcional también en cifras:

- el manifiesto tendrá un opt-in explícito para indexar tablas;
- el valor por defecto será `false`, preservando compatibilidad;
- una tabla nunca se fusionará con prosa en el mismo chunk;
- se crearán chunks de tabla por fila o bloque pequeño, con sus `lineIds`;
- no se inventarán separadores, celdas ni valores ausentes;
- búsquedas numéricas deberán devolver preview de la tabla original.

No se implementará un modelo relacional de tablas. El alcance es recuperación
de evidencia textual trazable.

### 4.5 Calidad y cuarentena

Una página no se aceptará solo por confianza media alta. Se marcará para
revisión si ocurre cualquiera de estos casos:

- faltan tokens críticos;
- hay cajas inválidas o fuera de página;
- una región esperada no produce líneas;
- aparecen duplicados por solapamiento;
- el orden no satisface sus anclas;
- la proporción de caracteres de baja confianza supera el gate;
- el resultado cambia sin cambiar fingerprint.

La preparación completa falla cerrada mientras exista una página pendiente.

## 5. Grafo de ejecución

```text
T1 contrato de layout y fingerprint
 ├─> T2 ejecución OCR por regiones
 │    └─> T3 composición, deduplicación y orden
 └─> T4 chunks de tabla opt-in

T2 + T3 + T4
 └─> T5 referencia y evaluación no vacía
      └─> T6 gate OCR de 24 páginas
           └─> T7 prepare completo de 71 páginas
                └─> T8 evaluación de recuperación
                     └─> T9 publicación local y rollback
                          └─> T10 cierre operativo
```

T1–T6 son secuenciales en sus contratos. Los casos de prueba de T2–T4 pueden
prepararse en paralelo únicamente después de cerrar T1.

## 6. Tareas de implementación

### T1 — Contrato opcional de regiones de layout

**Objetivo:** representar en el manifiesto las regiones necesarias para este
libro sin alterar el comportamiento por defecto.

**Cambios previstos:**

- validar cajas, orden, roles, rotación y columnas;
- rechazar regiones vacías, fuera de rango o con identificadores duplicados;
- incluir el perfil completo en el processing fingerprint;
- mantener válidos los manifiestos actuales sin regiones.

**Archivos autorizados:**

- `pods/historical-corpus-pod/src/historical_corpus/manifest.py`
- `pods/historical-corpus-pod/src/historical_corpus/processing_fingerprint.py`
- sus pruebas enfocadas correspondientes

**Aceptación:**

- un manifiesto legado conserva exactamente su fingerprint anterior;
- dos layouts distintos producen fingerprints distintos;
- el perfil de PDF 42/52/70/71/89–92 valida y los perfiles ambiguos fallan.

**Verificación:**

```bash
python -m pytest -q -p no:cacheprovider \
  tests/test_manifest.py tests/test_processing_fingerprint.py
```

**Dependencias:** ninguna. **Tamaño:** M.

### T2 — OCR determinista por región y orientación

**Objetivo:** OCRizar cada región declarada en la orientación correcta y
transformar sus cajas a coordenadas de página.

**Cambios previstos:**

- render a 300 DPI;
- rotación explícita 0/90/180/270;
- transformación inversa de los cuatro vértices;
- validación de cajas antes de persistir;
- error cerrado si una región requerida queda vacía.

**Archivos autorizados:**

- `pods/historical-corpus-pod/src/historical_corpus/madoz_processor.py`
- `pods/historical-corpus-pod/tests/test_madoz_processor.py`
- una fixture sintética nueva si resulta necesaria

Las fixtures deben ser sintéticas. Ninguna imagen, PDF o texto privado del
libro entra en Git.

**Aceptación:**

- los cuatro giros se prueban;
- las cajas transformadas quedan dentro de la página;
- las regiones de los ocho casos especiales se procesan sin duplicar OCR.

**Verificación:**

```bash
python -m pytest -q -p no:cacheprovider tests/test_madoz_processor.py
```

**Dependencias:** T1. **Tamaño:** M.

### T3 — Lectura por bandas, columnas y deduplicación

**Objetivo:** recomponer una página en el orden humano correcto.

**Cambios previstos:**

- ordenar columnas de arriba abajo y de izquierda a derecha;
- respetar el orden explícito de regiones;
- impedir que el OCR general duplique líneas de una región especializada;
- mantener separados `body`, `table`, `header` y `footer`;
- conservar IDs estables para el mismo contenido y layout.

**Archivos autorizados:**

- `pods/historical-corpus-pod/src/historical_corpus/madoz_layout.py`
- `pods/historical-corpus-pod/tests/test_madoz_layout.py`

**Aceptación:**

- pruebas sintéticas reproducen las estructuras de PDF 42, 52, 70, 71, 89 y
  92;
- ninguna línea desaparece o aparece dos veces;
- al menos una prueba falla si se vuelve al orden global por coordenada Y.

**Verificación:**

```bash
python -m pytest -q -p no:cacheprovider tests/test_madoz_layout.py
```

**Dependencias:** T1–T2. **Tamaño:** M.

### Checkpoint A — Layout

- [ ] T1–T3 verdes.
- [ ] Codex revisa el diff y confirma compatibilidad/fingerprint.
- [ ] Smoke privado de PDF 42, 52, 70, 71, 89–92 sin red.
- [ ] Previews comparados con el facsímil.
- [ ] Ningún archivo privado aparece en `git status`.

### T4 — Recuperación opt-in de tablas

**Objetivo:** hacer buscables las tablas de este corpus conservando el default
seguro de excluirlas.

**Cambios previstos:**

- añadir la opción interna de manifiesto decidida en T1;
- formar chunks exclusivos de tabla;
- respetar límites de caracteres y 512 `lineIds`;
- impedir chunks mixtos body/table y cruces de página o hueco.

**Archivos autorizados:**

- `pods/historical-corpus-pod/src/historical_corpus/madoz_chunking.py`
- `pods/historical-corpus-pod/tests/test_madoz_chunking.py`
- `pods/historical-corpus-pod/tests/test_madoz_pipeline.py`

**Aceptación:**

- opt-in falso reproduce exactamente los chunks actuales;
- opt-in verdadero recupera filas/cifras con procedencia;
- una tabla grande se divide sin pérdida ni mezcla con prosa.

**Verificación:**

```bash
python -m pytest -q -p no:cacheprovider \
  tests/test_madoz_chunking.py tests/test_madoz_pipeline.py
```

**Dependencias:** T1 y T3. **Tamaño:** M.

### T5 — Convertir la referencia en una evaluación significativa

**Objetivo:** mantener la referencia privada auditable y eliminar métricas
vacías o anotaciones ambiguas.

**Trabajo privado, no trackeado:**

- añadir `orderAnchor` en transiciones de columnas y regiones;
- exigir al menos 30 pares de orden distribuidos entre los casos difíciles;
- confirmar que cada token crítico existe literalmente en el facsímil;
- conservar entry boundaries solo sobre líneas `body`;
- completar revisión visual de cualquier línea modificada por consenso;
- conservar sidecar con método, hash y grado de revisión por página.

**Cambios de código solo si una prueba revela un defecto del evaluador:**

- `pods/historical-corpus-pod/src/historical_corpus/evaluation.py`
- `pods/historical-corpus-pod/tests/test_evaluation.py`

**Aceptación:**

- 24/24 páginas validan;
- `readingOrderTotalPairs >= 30`;
- ningún gate puede aprobar de forma vacía;
- la referencia sigue marcada como asistida por IA, no gold humano.

**Verificación:** validación estricta más `tests/test_evaluation.py`.

**Dependencias:** T3. **Tamaño:** S/M.

### T6 — Aprobar el gate OCR de 24 páginas

**Objetivo:** demostrar que el pipeline corregido lee la muestra real.

Se ejecutará en Podman, sin red, contra el mismo sample hash y una ruta de
reporte nueva. No se ajustará la referencia para perseguir la salida del OCR.

**Aceptación obligatoria:**

- 24 páginas y 0 fallidas;
- CER ≤ 0,08;
- WER ≤ 0,18;
- error de tokens críticos ≤ 0,05;
- Boundary F1 ≥ 0,90;
- Reading-order accuracy ≥ 0,95 con al menos 30 pares;
- ninguna de las ocho páginas especiales queda en cuarentena.

Si falla:

1. clasificar por página y causa;
2. corregir únicamente layout, rol, región o transformación responsable;
3. cambiar versión/fingerprint si cambia el comportamiento;
4. repetir primero la página afectada y después el lote de 24;
5. no ejecutar las 71 páginas hasta aprobar.

**Dependencias:** T2–T5. **Tamaño:** M.

### Checkpoint B — OCR

- [ ] Todos los gates de T6 aprobados.
- [ ] Informe y hashes guardados fuera de Git.
- [ ] Comparación visual final de los ocho casos especiales.
- [ ] Codex confirma que no se maquillaron tokens, boundaries ni gold.

### T7 — Preparar las 71 páginas disponibles

**Objetivo:** construir el bundle completo de Málaga sin publicar.

**Aceptación:**

- exactamente 71 hojas del inventario verificado;
- reutilización solo de las 24 páginas cuyo fingerprint coincida;
- cero páginas fallidas o pendientes;
- cero cajas inválidas, duplicados u `oversize_body_line`;
- narrativa y tablas generan chunks separados y trazables;
- ningún chunk cruza los breaks antes de PDF 69, 103 y 105;
- bundle declara `partial_source`, tramos observados y seis huecos;
- segunda ejecución exacta reutiliza resultados y produce los mismos IDs.

**Verificación:** smoke de CLI, hashes, inventario, conteos y replay de
`prepare` dentro del contenedor de ingesta.

**Dependencias:** Checkpoint B. **Tamaño:** M.

### T8 — Aprobar recuperación y citas

**Objetivo:** demostrar que el RAG recupera la evidencia útil del libro.

Se crearán 20 casos privados y auditables:

- 4 de provincia/obispado/ciudad;
- 4 de población y estadísticas;
- 4 de geografía, clima, caminos o límites;
- 4 de instituciones, economía o cementerio;
- 4 que dependan de tablas, fechas o cifras.

Cada caso contendrá páginas/chunks relevantes esperados, no una respuesta
generada. Ningún caso dependerá de las páginas ausentes.

**Aceptación:**

- al menos 20 casos;
- Recall@20 ≥ 0,90;
- MRR@20 ≥ 0,75;
- integridad estructural = 1,0;
- cero excepciones;
- ocho resultados revisados visualmente, incluidos cuatro de tabla;
- consultas sobre huecos devuelven ausencia de cobertura, no evidencia falsa.

**Archivos de código solo si hay un defecto real:**

- `pods/historical-corpus-pod/src/historical_corpus/service.py` para la
  recuperación;
- `pods/historical-corpus-pod/src/historical_corpus/evaluation.py` para el
  cálculo del gate;
- `pods/historical-corpus-pod/tests/test_retrieval.py`.

Los casos del libro permanecen privados fuera de Git.

**Dependencias:** T7. **Tamaño:** M.

### T9 — Publicación local aislada y rollback

**Objetivo:** cargar el bundle real en el servicio local y demostrar
persistencia.

**Bloqueo humano previo:**

- confirmar derechos de uso previstos de la digitalización;
- aceptar que la cobertura es parcial y contiene seis huecos.

Sin ambas decisiones, el estado máximo será
`code_complete_prepared_not_published`.

**Aceptación después de autorización:**

- backup recuperable del volumen;
- API detenido durante `publish` y lock exclusivo adquirido;
- primer publish cambia la generación una sola vez;
- replay exacto no duplica ni cambia generación;
- API healthy en loopback;
- búsquedas narrativas y de tabla devuelven página/preview correctos;
- reinicio conserva documento, chunks y TurboVec;
- reparación en un clon desechable del volumen funciona;
- rollback restaura el volumen completo, no tablas manuales.

**Dependencias:** T7–T8 y gate humano. **Tamaño:** M.

### T10 — Cierre operativo

**Objetivo:** dejar una operación repetible para este libro.

**Archivos previstos:**

- `docs/operations/historical-corpus-rag.md`
- solo si es necesario, los Compose de `deployment/podman/`.

**Contenido mínimo:**

- rutas privadas y variables sin secretos reales;
- preparar, evaluar, publicar, reiniciar y reparar;
- hashes/fingerprints que deben comprobarse;
- diagnóstico de regiones/layout;
- backup y rollback;
- declaración explícita de cobertura parcial;
- aviso: no conectado al canario.

**Aceptación:** otra sesión puede reproducir el flujo usando únicamente el
runbook y los artefactos privados autorizados.

**Dependencias:** T9. **Tamaño:** S.

## 7. Validación transversal

Después de cada tarea se ejecutan solo sus pruebas enfocadas. Después de cada
checkpoint se construye el target de pruebas completo:

```bash
podman build --target test \
  --tag localhost/tour-guide-historical-corpus:test \
  pods/historical-corpus-pod

podman run --rm localhost/tour-guide-historical-corpus:test
```

Antes de aceptar cualquier commit, Codex comprobará:

- diff limitado a las rutas autorizadas;
- ninguna supresión, test saltado o umbral debilitado;
- compatibilidad de manifiestos y payloads existentes;
- ausencia de secretos, PDFs, OCR, modelos y datos privados;
- raíz de contenedor de solo lectura, usuario sin root, sin capacidades y sin
  red durante OCR;
- ninguna modificación en backend, frontend, Narrative o canario.

## 8. Estrategia de commits

Commits atómicos previstos:

1. `feat: describe deterministic Madoz page regions`
2. `feat: compose rotated Madoz OCR regions`
3. `feat: preserve Madoz reading order across layout bands`
4. `feat: index Madoz table evidence by opt-in`
5. `test: make historical OCR ordering gates meaningful`
6. `docs: document the private Madoz workflow`

Reglas:

- no hacer push sin solicitud explícita;
- no incluir un commit si su validación está roja;
- staging por rutas exactas;
- no incorporar archivos ajenos ya presentes en el worktree;
- el material privado y los reportes nunca se commitean.

## 9. Riesgos y mitigación

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Sobreajuste a Madoz | Medio | Perfil explícito por manifiesto; defaults legados intactos |
| Gold circular por usar OCR | Alto | Facsímil como autoridad, revisión visual de cambios y dos OCR solo como ayuda |
| Reading-order aparentemente verde | Alto | Mínimo 30 pares; prohíbe métrica vacía |
| Tablas producen falsos positivos | Alto | Chunks exclusivos, opt-in y consultas de tabla evaluadas |
| Cifras erróneas parecen plausibles | Alto | Tokens críticos y preview obligatorio |
| Fuente incompleta | Alto | `partial_source`, seis huecos y abstención explícita |
| Derechos no confirmados | Alto | Prepare/evaluación privados; publish bloqueado |
| Corrupción del índice | Alto | Locks, backup, journal, clon de reparación y rollback completo |
| Archivos privados en Git | Alto | rutas externas, permisos 0700/0600 y revisión de status/diff |

## 10. Intervención humana necesaria

Durante T1–T8 el usuario no necesita transcribir páginas ni operar comandos.
Codex realiza la revisión visual y la ejecución.

Antes de T9, el usuario deberá responder únicamente:

1. si el uso previsto es compatible con los derechos/condiciones de la
   digitalización;
2. si acepta publicar localmente un corpus Málaga parcial con seis páginas
   impresas ausentes.

Investigar qué otros libros se usarán puede continuar en paralelo, pero no
cambia ni bloquea este plan.

## 11. Definición de terminado

El producto Madoz Málaga queda terminado solo cuando:

- [ ] T1–T10 cumplen sus criterios y pruebas;
- [ ] las 24 páginas superan todos los gates OCR con orden no vacío;
- [ ] las 71 páginas se preparan con cero fallos y resultado reproducible;
- [ ] texto narrativo y tablas son recuperables con citas y preview;
- [ ] los 20 casos superan Recall@20, MRR e integridad;
- [ ] derechos y cobertura parcial han sido decididos por el usuario;
- [ ] publicación local, replay, reinicio, reparación y rollback están probados;
- [ ] el servicio permanece separado y escuchando solo en loopback;
- [ ] no hay archivos privados en Git;
- [ ] no hay cambios de canario.

Al terminar este plan no se inicia automáticamente ningún trabajo para otro
libro. Ese será un proyecto posterior basado en evidencia, no una condición
oculta de esta entrega.
