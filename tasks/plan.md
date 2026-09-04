# Plan de ejecución: tomo XI de Madoz completo con OCR híbrido

## 1. Autoridad, estado y alcance

- Este es el único plan activo para `historical-corpus-pod`.
- Es una ampliación aprobada del plan anterior limitado a Málaga.
- Rama: `codex/feature/historical-corpus-rag-podman`.
- Estado: **en ejecución**.
- Fecha: 2026-09-03.
- Codex decide contratos, calidad y aceptación; Qwen ejecuta cambios de código
  acotados una vez cerrada cada decisión.

El producto cubrirá una sola fuente:

```text
Obra: Diccionario geográfico-estadístico-histórico
Volumen: tomo XI, 1848
Archivo: 783 páginas PDF físicas
OCR incrustado observado: 772 páginas
Runtime: servicio independiente con Podman
Exposición: local y privada
```

La cobertura será **todo el contenido único disponible en el PDF**, no solo
Málaga. El tomo comienza en `Madrid de Caderechas`; no contiene la entrada
general de la ciudad de Madrid. Las consultas sobre Madrid podrán recuperar
las entradas y menciones que sí existan, pero el producto deberá explicar
cuando la entrada solicitada pertenece a otro tomo.

Quedan fuera:

- otros libros y tomos, incluido el tomo que contenga la entrada general de
  Madrid;
- backend narrativo, frontend, Narrative y canario;
- descarga de otras copias sin una decisión posterior;
- completar texto que no aparezca en ninguna imagen del PDF;
- corrección silenciosa mediante LLM;
- despliegue público.

## 2. Qué significa «100 % funcional»

Para este tomo significa:

1. inventariar las 783 páginas físicas;
2. identificar portada, preliminares, cuerpo, páginas vacías y material final;
3. detectar bloques repetidos, páginas fuera de orden y huecos impresos;
4. construir una secuencia canónica con cada hoja útil una sola vez;
5. usar el OCR incrustado cuando sea suficiente y OCR de imagen cuando falte o
   resulte dudoso;
6. conservar ambos textos y su procedencia cuando se comparen;
7. hacer buscables prosa y tablas con página, líneas, cajas y preview;
8. abstenerse cuando una consulta dependa de una página o tomo ausente;
9. preparar y reanudar el corpus completo de forma reproducible en Podman;
10. mantener el servicio privado, aislado y fuera del canario.

No significa perfección carácter por carácter ni reconstruir páginas que no
existen en la fuente. Todo hueco real quedará declarado.

## 3. Evidencia inicial

### 3.1 Fuente comprobada

La inspección read-only del PDF privado confirmó:

- 783 páginas físicas;
- 772 páginas con texto incrustado;
- 11 sin texto incrustado: PDF 2, 3, 4, 6, 7, 756, 757, 770, 771, 781 y 783;
- el cuerpo visible comienza en PDF 14 con `Madrid de Caderechas`;
- Málaga ocupa el bloque ya estudiado alrededor de PDF 39–109;
- existen menciones de Madrid y Málaga fuera de sus encabezados, por lo que
  una búsqueda literal no basta para decidir límites de artículos.

### 3.2 Servicio existente

Ya existen:

- API FastAPI, SQLite FTS5, Qwen y TurboVec;
- contenedores separados de API e ingesta con Podman;
- manifiesto estricto, inventario, hashes visuales/textuales y candidatos de
  duplicado;
- preparación reanudable y publicación separada;
- locks, journal, reparación y rollback del índice;
- citas por página/línea/caja y previews;
- evaluación OCR y de recuperación;
- material privado fuera de Git.

El inventario actual ya calcula etiqueta impresa, SHA del texto incrustado,
SimHash textual, dHash visual y candidatos de duplicado. La preparación,
sin embargo, usa exclusivamente PP-OCR y descarta el texto incrustado como
fuente de contenido. Ese es el cambio central de este plan.

### 3.3 Línea base de Málaga

La referencia privada de 24 páginas sigue siendo el primer gate de regresión.
El OCR de imagen actual no pasa calidad en layouts complejos:

| Métrica | Actual | Gate |
|---|---:|---:|
| CER | 15,30 % | máximo 8 % |
| WER | 21,43 % | máximo 18 % |
| Error de tokens críticos | 53,45 % | máximo 5 % |
| Boundary F1 | 0,301 | mínimo 0,90 |

El OCR incrustado permite reducir trabajo, pero no se tratará como verdad
absoluta: contiene errores, especialmente en cifras, columnas y tablas.

## 4. Decisiones técnicas cerradas

### 4.1 Política `embedded_first`

Se añadirá un modo explícito y versionado sin cambiar el comportamiento del
modo legado `ocr`:

```text
embedded_first
  -> extraer líneas y cajas del OCR incrustado
  -> comprobar suficiencia y coherencia
  -> aceptar si pasa
  -> ejecutar PP-OCR solo si falta, falla o la página exige layout especial
  -> comparar candidatos y conservar la decisión con motivo
```

No se mezclan palabras de ambos OCR para fabricar silenciosamente una línea.
`textSource` identifica la fuente uniforme de la página y todas sus líneas;
cuando PP-OCR repite una región, `role=table`, la caja y la región congelada
en el fingerprint permiten identificar ese pase regional. La imagen original
sigue siendo la autoridad final.

### 4.2 Reconstrucción de líneas incrustadas

PyMuPDF entrega bloque, línea y posición de palabra. Esos identificadores se
conservarán al leer el PDF y se usarán para formar líneas deterministas. Las
cajas se transformarán al mismo sistema normalizado que el OCR de imagen.

La lectura seguirá este orden:

1. páginas por secuencia canónica;
2. bandas verticales;
3. columnas izquierda a derecha;
4. bloques y líneas del OCR incrustado dentro de cada región;
5. regiones especiales en el orden declarado por el manifiesto.

### 4.3 Gate automático por página

El OCR incrustado se considera utilizable solo si cumple controles
deterministas, como mínimo:

- texto no vacío y cantidad de caracteres razonable;
- cajas válidas dentro de la hoja;
- proporción mínima de tokens alfabéticos;
- ausencia de repetición patológica;
- encabezado/pie no constituyen la mayor parte del contenido;
- continuidad de bloques y columnas compatible con el layout;
- ninguna región especial obligatoria queda sin tratar.

Las cifras no se “corrigen” por plausibilidad. En páginas estadísticas o
tablas se ejecutará OCR regional de contraste aunque el texto incrustado pase.

### 4.4 Inventario físico y secuencia canónica

El inventario tendrá 783 filas físicas. La secuencia canónica se obtiene con:

- coincidencia exacta de imagen;
- coincidencia exacta o cercana de texto;
- etiqueta impresa y continuidad;
- encabezados alfabéticos;
- overrides privados explícitos para conflictos.

La automatización puede proponer decisiones, pero ninguna coincidencia débil
excluirá una página. Los casos ambiguos quedan `pending_review` hasta que Codex
compare texto e imagen. Una hoja ausente no será reemplazada por una parecida.

### 4.5 Layouts y tablas

Las páginas ordinarias usarán el OCR incrustado. Se conserva el perfil de
Málaga para PDF 40–42, 52, 60, 70 y 89–92, 102–108. El inventario completo
detectará otras páginas giradas o tabulares; únicamente esas recibirán
regiones adicionales.

Los chunks de tabla serán opt-in, exclusivos de tabla y nunca se mezclarán con
prosa. Todos conservan `documentId`, página PDF, etiqueta impresa, `lineIds`,
cajas, fuente textual y preview.

### 4.6 Privacidad y publicación

- PDF, manifiesto real, inventario, OCR, referencias y reportes permanecen
  fuera de Git con permisos privados.
- No habrá red durante inventario, OCR, evaluación o preparación.
- Podman es el único runtime de contenedores.
- Preparar no publica.
- Publicar localmente sigue bloqueado hasta confirmar derechos y aceptar la
  cobertura observada.
- No se modifica el canario.

## 5. Grafo de ejecución

```text
T0 inventario físico provisional
 ├─> T1 contrato embedded_first + fingerprint
 │    └─> T2 líneas incrustadas con procedencia
 │          └─> T3 gate y fallback de OCR
 └─> T4 secuencia canónica completa
              ├─> T5 layouts/tablas excepcionales
              └─> T6 evaluación representativa
                         └─> T7 preparación completa
                                  └─> T8 recuperación y citas
                                           ├─> T9 publicación local autorizada
                                           └─> T10 runbook y cierre
```

## 6. Tareas de implementación

### T0 — Inventario provisional de las 783 páginas

**Objetivo:** producir fuera de Git un registro físico reproducible antes de
modificar el pipeline.

**Acciones:**

- crear un manifiesto privado `pending` para PDF 1–783;
- ejecutar `build-inventory` con la imagen de ingesta local y sin red;
- resumir páginas sin OCR, etiquetas ambiguas, saltos y duplicados candidatos;
- buscar en todo el volumen las etiquetas que parecían ausentes en Málaga;
- ubicar comienzo y final del cuerpo mediante encabezado e imagen.

**Aceptación:** 783 filas, hash estable, cero publicación y cero datos privados
en Git.

**Dependencias:** ninguna. **Tamaño:** S.

### T1 — Contrato `embedded_first` y fingerprint

**Objetivo:** declarar el modo híbrido de forma compatible y reproducible.

**Archivos autorizados:**

- `pods/historical-corpus-pod/src/historical_corpus/manifest.py`
- `pods/historical-corpus-pod/src/historical_corpus/processing_fingerprint.py`
- pruebas correspondientes.

**Aceptación:**

- manifiestos `ocr` existentes validan sin cambio;
- `embedded_first` es explícito, no default implícito;
- política y umbrales alteran el fingerprint;
- valores desconocidos o incompletos fallan cerrados.

**Verificación:** pruebas enfocadas de manifiesto y fingerprint.

**Dependencias:** T0. **Tamaño:** M.

### T2 — Extraer líneas incrustadas con cajas y orden

**Objetivo:** convertir la capa OCR del PDF en líneas utilizables sin perder
procedencia espacial.

**Archivos autorizados:**

- `pods/historical-corpus-pod/src/historical_corpus/pdf_source.py`
- `pods/historical-corpus-pod/src/historical_corpus/madoz_layout.py`
- pruebas correspondientes.

**Aceptación:**

- bloque, línea y palabra de PyMuPDF se conservan;
- palabras se agrupan determinísticamente;
- cajas, crop, rotación y split de hoja se transforman correctamente;
- el modo `ocr` produce exactamente la salida anterior.

**Verificación:** pruebas enfocadas de fuente PDF y layout.

**Dependencias:** T1. **Tamaño:** M.

### T3 — Gate, contraste y fallback por página

**Objetivo:** evitar PP-OCR en páginas sanas y usarlo cuando aporta evidencia.

**Archivos autorizados:**

- `pods/historical-corpus-pod/src/historical_corpus/madoz_processor.py`
- `pods/historical-corpus-pod/src/historical_corpus/madoz_layout.py`
- `pods/historical-corpus-pod/src/historical_corpus/ingest_models.py`
- `pods/historical-corpus-pod/src/historical_corpus/models.py`
- un módulo pequeño de política solo si reduce complejidad;
- pruebas de contrato, layout, procesador y pipeline.

La procedencia seguirá usando el esquema existente de página: `textSource`
distingue `embedded` de `ppocrv6`; para `embedded`, los campos históricos
`ocrEngine*` identifican al extractor `pymupdf` y a la capa `pdf-text-layer`.
Los fallbacks conservan `ppocrv6` y añaden un `qualityFlag` específico con el
motivo determinista. Así no se atribuye a PP-OCR texto que vino del PDF ni se
rompe el contrato legado.

**Aceptación:**

- una página incrustada sana no inicializa ni invoca PP-OCR;
- página sin texto, corrupta o especial usa OCR de imagen;
- tabla/cifras puede pedir contraste regional;
- salida declara fuente y motivo de fallback;
- errores no producen contenido vacío aceptado.

**Verificación:** pruebas RED/GREEN de cada rama y smoke privado sin red.

**Dependencias:** T1–T2. **Tamaño:** M.

### Checkpoint A — Camino híbrido

- [x] T0–T3 verdes.
- [x] OCR incrustado aceptado en páginas ordinarias reales.
- [x] Fallback demostrado en al menos una de las 11 páginas sin texto.
- [x] El modo legado permanece compatible.
- [x] Ningún artefacto privado aparece en Git.

### T4 — Resolver la secuencia canónica del tomo

**Objetivo:** pasar del inventario físico a contenido único y ordenado.

**Trabajo privado:**

- agrupar duplicados exactos por imagen/texto;
- usar etiqueta, encabezado y vecinos para proponer orden;
- revisar visualmente solo grupos ambiguos;
- excluir preliminares/finales como `exclude_nonbody`;
- marcar duplicados con destino incluido;
- declarar todos los huecos reales;
- verificar y congelar hash del inventario.

**Código solo si el inventario existente no expresa una decisión necesaria:**

- `page_inventory.py`, `ingest_models.py` y sus pruebas.

**Aceptación:** 783 filas resueltas, cero `pending_review`, índices canónicos
contiguos y cada exclusión justificada.

**Resultado verificado (2026-09-04):**

- 783 filas físicas: 710 incluidas, 44 duplicadas y 29 no canónicas;
- cero filas o candidatos pendientes e índices canónicos 1–710;
- 707 folios numerados observados entre 7 y 791, con 78 ausencias declaradas
  en 39 intervalos, más tres páginas canónicas de fe de erratas;
- el bloque físico PDF 423–426 se ordena canónicamente como 425, 426, 423,
  424 para restaurar los folios impresos 458–461;
- `pageOverrides.canonicalSequenceIndex` expresa excepciones de orden sin
  alterar el orden físico determinista del JSONL;
- `build-inventory` aplica las decisiones de duplicado antes de finalizar;
- inventario privado congelado con SHA-256
  `cf2e60a9dcac1bd2c236354d431e7a0e0e98b3a2af0c31b66782beee563973d1`.

**Dependencias:** T0. **Tamaño:** M.

### T5 — Resolver layouts y tablas excepcionales

**Objetivo:** aplicar OCR de imagen únicamente a páginas donde el OCR
incrustado no conserva lectura o cifras.

**Aceptación:**

- las excepciones de Málaga siguen correctas;
- las nuevas excepciones del resto del tomo tienen regiones explícitas;
- narrativa y tabla no contaminan columnas;
- toda línea conserva caja y fuente;
- cambiar una región invalida la reutilización por fingerprint.

**Verificación:** pruebas de layout más previews de todas las excepciones.

**Resultado (2026-09-04):** las 710 páginas canónicas fueron examinadas. Se
congelaron 134 excepciones (17 de la referencia de Málaga y 117 nuevas con
regiones explícitas), 145 regiones de tabla y 95 regiones rotadas. Todas las
excepciones se revisaron en siete hojas de contacto; un smoke real de seis
páginas representativas pasó con cajas válidas, orden continuo y líneas no
vacías. El inventario se regeneró sin alterar decisiones ni orden canónico y
se guardaron el reporte, los previews y los hashes fuera de Git. No se usó red,
no se publicó y no se modificó el canario.

**Dependencias:** T3–T4. **Tamaño:** M por lote de excepciones.

### T6 — Gate OCR representativo del tomo

**Objetivo:** medir calidad sin revisar manualmente 783 páginas.

La referencia privada combinará las 24 páginas existentes con una muestra
estratificada del resto del tomo: inicio, cuartiles, final, páginas normales,
tablas, rotadas, sin texto incrustado y conflictos entre OCR. El facsímil será
la autoridad; el OCR incrustado no podrá evaluarse contra una copia de sí
mismo.

**Gates:**

- al menos 48 páginas de referencia;
- 0 páginas fallidas;
- CER ≤ 0,08 y WER ≤ 0,18;
- error de tokens críticos ≤ 0,05;
- Boundary F1 ≥ 0,90;
- orden ≥ 0,95 con al menos 60 pares;
- 100 % de fallbacks esperados activados;
- ninguna métrica puede aprobar sobre muestra vacía.

**Diagnóstico intermedio (2026-09-04):** la muestra estratificada ya contiene
48 páginas, 13.105 líneas de referencia, 258 límites y 192 pares de orden. El
OCR íntegro de imagen obtuvo 0 páginas fallidas, CER 0,00270, WER 0,01112,
Boundary F1 0,99417 y orden 0,96354. T6 sigue abierto porque fallaron 31 de 154
tokens críticos (error 0,20130), concentrados en ocho páginas de tablas y
cifras. Subir de 300 a 350/400 DPI no resolvió la causa. La referencia y el
reporte son privados y se identifican por los hashes
`9c7f59948837d675d01f55d937922f76e3dc6916ec81ac9535cf19938cb82121` y
`1176582952dd4d60f4e5b5f525a3956e7f79f2d0427b8fa0442a04a4d36fb4f0`;
la referencia es AI-adjudicada, no certificada por una persona.

#### T6.1 — Correcciones explícitas con procedencia

**Objetivo:** hacer recuperables las cifras críticas verificadas contra el
facsímil sin presentar una corrección como OCR bruto.

**Contrato:**

- el conjunto privado de correcciones será JSONL, tendrá SHA-256 esperado y
  quedará fuera de Git;
- cada corrección identificará documento, página física/lógica, línea, hash
  del texto OCR original, texto corregido, autoridad y fecha de revisión;
- `originalText` y `lineId` conservarán la evidencia OCR; `correctedText` será
  un campo separado y será el texto efectivo para evaluación e índice;
- toda corrección deberá corresponder exactamente a una sola línea; una
  corrección obsoleta, duplicada o no usada hará fallar la preparación;
- ruta, hash y estado de revisión entrarán en el fingerprint para invalidar
  reutilización incompatible;
- la evaluación distinguirá `ppocrv6` de `ppocrv6+corrections` y conservará
  una medición auditable del resultado efectivo;
- no se permite generar correcciones durante la preparación, inventar texto,
  completar huecos ni aplicar sustituciones silenciosas.

**Pruebas:** manifiesto y fingerprint; carga segura del JSONL; rechazo de
hash/ruta/línea incorrectos; conservación del OCR bruto; propagación exacta a
chunks; evaluación de tokens críticos sobre texto efectivo.

**Dependencias:** T3–T5. **Tamaño:** M.

### Checkpoint B — Inventario y calidad

- [x] Secuencia canónica verificada y congelada.
- [ ] Todos los gates de T6 aprobados.
- [ ] Reportes y hashes privados guardados fuera de Git.
- [ ] Ausencias reales documentadas, sin texto inventado.

### T7 — Preparar todo el contenido canónico

**Objetivo:** construir el bundle completo sin publicarlo.

**Aceptación:**

- se procesan todas y solo las filas `include`;
- este tomo usa PP-OCR en las 710 páginas canónicas: la capa incrustada quedó
  descartada para este volumen después de medir WER 0,26533 en la muestra
  transversal; el servicio conserva `embedded_first` para libros futuros;
- cero fallos, pendientes, cajas inválidas o chunks sin procedencia;
- toda línea `body` o `table` queda asignada; prosa y tablas generan chunks
  separados y ningún chunk mezcla ambos roles;
- los chunks de tabla permanecen dentro de una sola página y se rotulan de
  forma determinista con la entrada activa y la página impresa/lógica;
- ningún chunk cruza página, hueco o salto canónico;
- la primera preparación reutiliza las páginas compatibles ya evaluadas;
- un segundo `prepare` reutiliza las 710 páginas y conserva IDs/hashes.

**Dependencias:** Checkpoint B. **Tamaño:** M.

### T8 — Aprobar recuperación y citas

**Objetivo:** demostrar búsqueda útil a lo largo de todo el tomo.

Se crearán al menos 40 casos privados distribuidos por cinco bandas
alfabéticas, con prosa, cifras, tablas, topónimos homónimos y preguntas fuera
de cobertura. Cada caso define evidencia esperada, no una respuesta generada.

**Gates:**

- Recall@20 ≥ 0,90;
- MRR@20 ≥ 0,75;
- integridad estructural = 1,0;
- cero excepciones;
- página, etiqueta, caja y preview correctos;
- consultas sobre la entrada general de Madrid explican que no está en este
  tomo en vez de responder con coincidencias incidentales.

**Dependencias:** T7. **Tamaño:** M.

### T9 — Publicación local aislada y rollback

**Bloqueo humano previo:** confirmar derechos de uso y aceptar la cobertura
final observada. Sin ambas decisiones el estado máximo será
`code_complete_prepared_not_published`.

**Aceptación después de autorización:** backup completo, publish idempotente,
API healthy en loopback, persistencia tras reinicio, reparación en clon y
rollback del volumen completo.

**Dependencias:** T7–T8 y gate humano. **Tamaño:** M.

### T10 — Runbook y cierre

**Archivo previsto:** `docs/operations/historical-corpus-rag.md`.

Documentará inventario, política híbrida, preparación, evaluación,
publicación, diagnóstico, backup, reparación, rollback, cobertura exacta y la
separación del canario.

**Dependencias:** T8; la sección de publicación se valida tras T9. **Tamaño:** S.

## 7. Validación transversal

Cada cambio lógico sigue RED → GREEN → revisión → commit. Después de cada
checkpoint se construye y ejecuta el target de pruebas con Podman. Antes de
aceptar cualquier commit se comprobará:

- diff limitado a archivos autorizados;
- ninguna supresión, prueba saltada o umbral debilitado;
- compatibilidad de manifiestos `ocr` existentes;
- ausencia de PDF, OCR, modelos, tokens y datos privados;
- ningún acceso de red durante procesamiento;
- backend, frontend, Narrative y canario intactos.

## 8. Commits previstos

1. `docs: expand Madoz plan to the full tome XI`
2. `feat: add embedded-first Madoz processing contract`
3. `feat: preserve embedded Madoz text lines`
4. `feat: fall back to image OCR by page quality`
5. `feat: handle exceptional Madoz layouts`
6. `test: validate hybrid OCR across tome XI`
7. `docs: document the private Madoz workflow`

No se hará push sin solicitud explícita. Cada commit será un punto verde y
reversible.

## 9. Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| OCR incrustado incorrecto parece confiable | gate determinista, muestra visual y fallback |
| Duplicado falso elimina una hoja distinta | exclusión automática solo con evidencia fuerte; ambigüedad se revisa |
| Orden físico no es orden bibliográfico | secuencia canónica separada y encabezados/etiquetas |
| Tablas dañan la búsqueda | chunks exclusivos y OCR regional de contraste |
| Entrada de Madrid fuera del tomo | cobertura explícita y casos de abstención |
| Fuente realmente incompleta | huecos declarados, nunca reconstruidos |
| Datos privados en Git | rutas externas, permisos privados y revisión de status |
| Trabajo demasiado largo | OCR incrustado evita reprocesar 772 páginas normales |

## 10. Intervención humana y definición de terminado

El usuario no necesita transcribir ni revisar páginas durante T0–T8. Solo se
pedirá, antes de T9, confirmar derechos y aceptar la cobertura final.

El producto queda terminado cuando:

- [ ] las 783 páginas físicas están inventariadas;
- [ ] la secuencia canónica no contiene pendientes ni duplicados no resueltos;
- [ ] el OCR híbrido supera todos los gates representativos;
- [ ] todo el contenido canónico se prepara con cero fallos y de forma
      reproducible;
- [ ] los casos de recuperación superan Recall, MRR e integridad;
- [ ] citas y previews apuntan al facsímil correcto;
- [ ] derechos y cobertura han sido aceptados para publicación local;
- [ ] publish, reinicio, reparación y rollback están probados;
- [ ] no hay datos privados ni cambios de canario en Git.

Al cerrar este plan no se inicia automáticamente otro libro o tomo.
