# Prueba Astra: tour completo en una respuesta — 10 de septiembre de 2026

**La escritura conjunta funcionó y redujo el material enviado, pero esta variante tardó más en completar la escritura y las revisiones. No se ha cambiado la generación de producción.**

Se generó de nuevo el mismo tour de Madrid: seis paradas y bienvenida, en español, con Astra (`gpt-6-astra`, razonamiento `low`) mediante Codex CLI y la cuenta de ChatGPT. Se reutilizó el material factual preparado; no se repitieron investigación, preparación con DeepSeek, traducciones ni audio. Los tiempos siguientes corresponden a escritura y auditoría del texto.

Se ejecutaron una vez, por este orden:

- **Por paradas:** coordinador existente, siete llamadas de escritura y siete auditorías. Puede escribir la siguiente parada mientras audita la anterior.
- **Escritura conjunta:** una llamada escribe las siete piezas; después se mantienen las siete auditorías individuales existentes, en secuencia. Son ocho llamadas en total. La variante con una única auditoría conjunta, dos llamadas en total, no se ha probado.

| Medida observada | Por paradas | Escritura conjunta | Cambio |
| --- | ---: | ---: | ---: |
| Llamadas Astra, escritura + auditoría | 14 | 8 | −42,9 % |
| Tiempo acumulado en llamadas de escritura | 211,572 s | 159,811 s | −24,5 % |
| Tiempo acumulado en auditorías | 549,249 s | 581,826 s | +5,9 % |
| Tiempo transcurrido, escritura y auditorías | **593,519 s (9:54)** | **741,674 s (12:22)** | **+25,0 %** |
| Entrada de los escritores | 94.713 tokens | 22.418 tokens | −76,3 % |
| Salida de los escritores | 4.990 tokens | 5.078 tokens | +1,8 % |
| Entrada de todas las llamadas | 203.997 tokens | 131.836 tokens | −35,4 % |
| Salida de todas las llamadas | 20.049 tokens | 20.848 tokens | +4,0 % |
| Entrada + salida, sin ponderación de coste/cuota | 224.046 tokens | 152.684 tokens | −31,9 % |
| Entrada en caché, incluida en la entrada anterior | 13.696 tokens | 14.720 tokens | — |
| Palabras, seis paradas + bienvenida | 3.709 | 3.701 | −0,2 % |
| Observaciones automáticas pendientes, antes de revisión humana | 3 | 6 | No equivale a errores históricos confirmados |

La escritura conjunta ahorró unos 52 segundos de llamadas de escritura, pero perdió aproximadamente 167 segundos de solapamiento entre escritura y auditoría que aprovecha el coordinador actual. Además, las auditorías sumaron unos 33 segundos más. Esto explica que el conjunto terminara 148 segundos más tarde. No se deben sumar escritura y auditorías para calcular el tiempo real del método actual.

Hubo variación entre llamadas: la auditoría de Plaza Mayor pasó de 81,9 a 155,4 segundos, mientras que la de Colón bajó de 135,8 a 75,8 segundos. Una ejecución por estrategia no permite atribuir toda diferencia de latencia a la agrupación.

El primer texto por separado estuvo disponible en unos 31 segundos. El arnés conjunto entrega las siete piezas al terminar su única respuesta, a los 160 segundos; no se implementó extracción progresiva durante la respuesta.

**Completitud y revisión de calidad**

Las dos variantes entregaron todas las piezas, respetaron los límites de extensión de las seis paradas y produjeron una bienvenida dentro de 140–220 palabras. Las catorce auditorías devolvieron una respuesta válida y consideraron el español adecuado y natural para escuchar. Esto no es una aprobación de publicación: las dos ejecuciones terminaron en `complete_needs_review`, con `publicationPassed: false`.

| Pieza | Objetivo de palabras | Por paradas | Conjunta | Observaciones por paradas / conjunta |
| --- | ---: | ---: | ---: | ---: |
| Plaza Mayor | 600 | 600 | 595 | 1 / 1 |
| Palacio Real | 600 | 605 | 597 | 0 / 1 |
| Plaza de España | 566 | 553 | 567 | 1 / 2 |
| Cibeles | 566 | 569 | 563 | 0 / 0 |
| Puerta de Alcalá | 600 | 606 | 606 | 1 / 2 |
| Colón | 566 | 561 | 578 | 0 / 0 |
| Bienvenida | 180, intervalo 140–220 | 215 | 195 | 0 / 0 |

Se leyeron los dos tours originales y se contrastaron las observaciones con los pasajes suministrados. Su interpretación es:

- En **ambos**, la frase que anuncia Palacio Real como siguiente parada se convirtió en `unclear` al llegar sin cita con la etiqueta `supported`. El orden canónico del tour sí autoriza esa transición: es una observación del sistema de auditoría, no un error narrativo.
- En **ambos**, “pocos años después” conecta 1929 con el uso militar de Plaza de España. El corpus menciona la batalla de Madrid, pero no la fecha necesaria para justificar ese intervalo. No demuestra que la cronología sea históricamente falsa.
- En **por paradas**, se sitúa la puerta anterior del siglo XVI exactamente en el mismo lugar. La fuente afirma su sustitución, sin precisar esa coincidencia espacial.
- En **conjunta**, se añade que Juvarra era italiano y que Cervantes era escritor. Esos atributos no aparecen en los pasajes suministrados; el verificador restringido a ese material los marca como no respaldados. La marca no establece que sean falsos.
- En **conjunta**, la explicación de las dos caras de Alcalá atribuye una intención al diseño que el pasaje no documenta. También se introduce “Después” del episodio de 1823, aunque la fuente solo fecha la transformación urbana en el siglo XIX.

La versión conjunta no recortó las últimas paradas y mantiene el trato de tú desde la bienvenida; por separado, la bienvenida emplea vosotros/os y las paradas tú. Ambas tienen transiciones claras y explicaciones completas, con algo de reiteración interpretativa. Estas son observaciones editoriales de una lectura, no una evaluación ciega ni una demostración de calidad equivalente. Las seis observaciones frente a tres tampoco prueban el doble de errores: incluyen el mismo problema de auditoría y ausencias de información en el corpus.

**Cuota real de Codex**

Se consultó la cuenta mediante la operación de solo lectura `account/rateLimits/read`. Se guardaron únicamente las ventanas y porcentajes, sin credenciales.

| Momento UTC | Porcentaje semanal usado | Limitación de la lectura |
| --- | ---: | --- |
| 10:08:58, durante la ejecución por paradas | 79 % | La primera escritura ya había terminado |
| 10:18:13, después de por paradas y antes de conjunta | 82 % | Lectura de toda la cuenta |
| 10:31:05, después de conjunta | 84 % | Lectura de toda la cuenta |

La ventana devuelta fue de 10.080 minutos y mantuvo el mismo reinicio. Durante el intervalo conjunto se observó un aumento de dos puntos; durante la parte observada del intervalo por paradas, tres puntos. **No es una medición aislada de 3 % frente a 2 % por tour:** falta una lectura anterior al inicio del primer método, el contador se devuelve en enteros y puede incluir esta conversación y otra actividad de la cuenta.

La documentación indica que los límites dependen del modelo, tamaño y complejidad del trabajo, contexto, razonamiento, herramientas y caché; contar mensajes o medir solo el prompt no permite predecir el consumo. La reducción de entrada observada hace razonable investigar esta estrategia para aprovechar mejor la cuota, pero no permite prometer un porcentaje concreto de ahorro. [Documentación de precios y límites de Codex](https://learn.chatgpt.com/docs/pricing). La operación usada para consultar límites está documentada en [App Server](https://learn.chatgpt.com/docs/app-server).

No hubo gasto directo mediante una clave de API de OpenAI u OpenRouter: las dos ejecuciones consumieron la cuota de Codex. El campo `quotaPercentageMeasured: false` de los resúmenes significa que no se obtuvo una atribución aislada por experimento; las lecturas globales anteriores están guardadas por separado.

**Decisión a partir de esta prueba**

Mantener esta variante como experimento. Sí se ha probado que una sola respuesta puede escribir este tour completo y reducir los tokens enviados. No se ha demostrado una mejora de velocidad total ni calidad equivalente suficiente para activar el cambio. Para priorizar velocidad, el siguiente experimento mínimo sería medir las auditorías existentes con concurrencia limitada, conservando los controles, porque dominan el tiempo restante. No se ha implementado ese siguiente experimento.

No extrapolar estos resultados a 50 tours, cinco idiomas o tours mucho más largos: solo se probó Madrid en español. En una única respuesta cambia la exposición al contexto y al ejemplo de estilo. El ejemplo compartido de Plaza Mayor queda visible globalmente, aunque la instrucción excluye usarlo para esa misma parada; esto limita la comparación de calidad de esa pieza. Se reutilizó el mismo modelo como escritor y auditor, en llamadas independientes, no un juez de otro proveedor.

**Archivos y comprobaciones**

Arnés: [narrative-astra-tour-batching-v8.ts](/home/jesusotero/coding/tour-guide-app/backend/scripts/validation/narrative-astra-tour-batching-v8.ts).

Resultados originales:

- [Tour por paradas](/home/jesusotero/coding/tour-guide-app/backend/tmp/narrative-v8/astra-batching-20260910-1/separate/tour.md).
- [Tour de escritura conjunta](/home/jesusotero/coding/tour-guide-app/backend/tmp/narrative-v8/astra-batching-20260910-1/together/tour.md).
- [Resumen por paradas](/home/jesusotero/coding/tour-guide-app/backend/tmp/narrative-v8/astra-batching-20260910-1/separate/summary.private.json) y [resumen conjunto](/home/jesusotero/coding/tour-guide-app/backend/tmp/narrative-v8/astra-batching-20260910-1/together/summary.private.json).
- [Manifiesto y hashes](/home/jesusotero/coding/tour-guide-app/backend/tmp/narrative-v8/astra-batching-20260910-1/manifest.json). Cada carpeta conserva llamadas, respuestas originales y auditorías; las instantáneas de cuota están en la raíz del experimento. Son artefactos locales en `backend/tmp`.

El arnés reutiliza los constructores de material, escritor, auditor y coordinador existentes. Quita instrucciones y referencias de estilo repetidas del prompt conjunto, conserva los pasajes factuales originales y comprueba que no falte ninguna cita de entrada. Congela el material y verifica sus hashes antes de cada estrategia. Rechaza piezas ausentes, duplicadas, vacías, desordenadas o texto fuera del formato, y evita sobrescribir una ejecución previa.

Pasaron la comprobación de tipos mediante ts-node y el auto-test del parser y contabilidad de tokens. La comprobación final verificó hashes sin cambios, cobertura completa de escritura y auditoría, extensiones, idioma y uso medido en las 22 llamadas. Los ocho escritores observados completaron un único turno cada uno, sin herramientas. No hubo reintentos de generación, reparaciones del contenido ni selección de una mejor respuesta. Las llamadas contadas son inferencias lógicas observadas, no un recuento de posibles reintentos de red internos.

Comandos ejecutados desde `backend`:

```bash
npx ts-node --project tsconfig.json scripts/validation/narrative-astra-tour-batching-v8.ts --self-test
npx ts-node --project tsconfig.json scripts/validation/narrative-astra-tour-batching-v8.ts prepare tmp/narrative-v8/astra-batching-20260910-1 tmp/narrative-v8/codex-Q2807-20260906-115441/checkpoint.private.json
npx ts-node --project tsconfig.json scripts/validation/narrative-astra-tour-batching-v8.ts separate tmp/narrative-v8/astra-batching-20260910-1
npx ts-node --project tsconfig.json scripts/validation/narrative-astra-tour-batching-v8.ts together tmp/narrative-v8/astra-batching-20260910-1
```

Para otra ejecución, elegir una carpeta nueva: las anteriores ya existen y el arnés las protege. La preparación usa los documentos actuales; los hashes del manifiesto permiten distinguirla del material congelado de esta prueba.

Esta tarea añade únicamente el arnés experimental y este informe, además de los artefactos locales. Se conservaron los 208 cambios o rutas pendientes que ya estaban presentes.
