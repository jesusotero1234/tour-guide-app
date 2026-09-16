# Enseñar a DeepSeek un método editorial verificable

Fecha: 16 de septiembre de 2026. Objetivo: trasladar decisiones editoriales observables a instrucciones reutilizables y comprobar su resultado. No es una reproducción del razonamiento interno de Codex, ni entrenamiento del modelo.

## Qué queremos trasladar

Un tour como «Madrid de los Austrias» necesita hechos que formen una historia, personajes documentados y una cronología comprensible. La [regla temporal](regla-editorial-fechas-audioguias.md) sigue siendo válida, pero [el ensayo anterior](ejecucion-regla-fechas-deepseek-20260916.md) mostró que entregarla junto con todas las demás instrucciones no garantizaba su aplicación.

En aquel ensayo se pedían todos los hechos esenciales, selección de fechas, extensión breve y un tour completo en una sola respuesta. Además, el texto genérico trataba la extensión como una orientación, mientras el encargo compacto la convertía en un límite. Son tensiones observables del encargo; no prueban por sí solas la causa de cada fallo. La hipótesis nueva es que separar las decisiones comprobables de la redacción hará más fácil detectar errores y aplicar el criterio.

## Procedimiento reutilizable

1. **Admitir las fuentes.** La entrada debe indicar procedencia, versión, pasajes y condición de reutilización. Credibilidad y permiso de reutilización son decisiones separadas. El modelo trabaja con el material admitido; una URL, una cita o su propio conocimiento no autorizan añadir contenido. Si falta evidencia, se pide investigación o se omite el detalle.
2. **Preparar una ficha de hechos.** Extraer quién hizo qué, a qué edificio se refiere y qué momento representa: decisión, permiso, comienzo, apertura, ocupación parcial o terminación. Cada afirmación se apoya en un fragmento literal identificable. Registrar contradicciones y detalles que se dejan fuera. No resolver una contradicción inventando una conciliación.
3. **Elegir el episodio.** Formular en una frase qué descubrirá el oyente. Seleccionar hechos que desarrollen ese episodio: situación inicial, acción o cambio y resultado documentado. No imponer conflicto, intenciones o desenlace cuando la fuente no los ofrece. En un tour temático, explicar la contribución de cada parada al tema sin atribuir un plan común a sus protagonistas.
4. **Preparar la orientación temporal.** Elegir anclas para el conjunto, decidir dónde se pronuncian y señalar retrocesos entre paradas. Para cada intervalo, comprobar ambos hitos y su precisión. Las demás fechas pueden quedar en la ficha. El objetivo de fechas y extensión pertenece al encargo concreto, no a una regla universal.
5. **Redactar para escuchar.** Usar la ficha contrastada y los pasajes originales. Una pregunta, un cambio de uso o una espera documentada pueden aportar interés. No añadir conversaciones, sensaciones, motivos ni instrucciones de movimiento inventados. Separar texto hablado y referencias.
6. **Revisar y corregir con alcance limitado.** Contar palabras y fechas fuera del modelo; contrastar el significado con las fuentes en una revisión nueva. Una aprobación del propio modelo no certifica exactitud. Si hay un problema, identificar frase, evidencia y efecto; corregir solamente las piezas afectadas y conservar las demás. Si persiste un error importante tras el límite de correcciones, el resultado queda pendiente.

La ficha es un producto editorial breve que se puede inspeccionar, no una solicitud de razonamiento privado extenso. En esta primera prueba, Codex sigue comprobando su significado y el del guion.

## Ejemplo de criterio que se puede enseñar

Evidencia de Casa de la Villa: licencia en 1629, comienzo en 1644, ocupación parcial en 1656 y obras posteriores.

- Elección editorial: contar la espera hasta poder empezar y después la ocupación de una parte del edificio.
- Reformulación válida: «Las obras comenzaron quince años después de obtener la licencia. El concejo se trasladó más adelante a una parte terminada, mientras la construcción continuaba».
- Reformulación inválida: «El edificio se construyó en quince años y quedó terminado cuando llegó el concejo».

El interés procede de una espera real. La comprobación debe distinguir acontecimientos, además de verificar la resta. Este ejemplo sirve para aprender el criterio; no aporta hechos sobre otras ciudades.

## Encargo común para DeepSeek

> Escribe una audioguía histórica que permita entender qué cambió en estos lugares. Usa exclusivamente la evidencia admitida. Conserva los hechos esenciales y su grado de certeza, sin obligación de pronunciar todos los años. Elige referencias temporales que orienten al oyente. Distingue acontecimientos, edificios y etapas; no conviertas proximidad temporal en causalidad. Las contradicciones sin resolver deben quedar fuera del guion y registrarse aparte. El texto debe poder grabarse tal cual; las fuentes y controles van fuera del audio. Cumple los límites concretos del encargo. Si no puedes conservar los hechos esenciales dentro de esos límites, declara el problema; no inventes ni certifiques tú mismo que has cumplido.

Se adjunta el bloque canónico completo de la regla temporal, el ejemplo anterior, el dossier y el contrato de salida de la etapa. No se añade el antiguo encargo de «una sola respuesta» a la etapa de preparación.

### Preparación

> Entrega una ficha JSON con hechos apoyados en citas literales, exclusiones o contradicciones y un esquema por pieza: episodio, hechos seleccionados, años que se pronunciarán y orientación temporal. Devuelve decisiones editoriales y referencias breves. No escribas aún la narración.

### Redacción

> Redacta las piezas a partir de la ficha comprobada y de la evidencia original. Respeta el episodio y las decisiones temporales; si detectas una incompatibilidad, señálala fuera del guion. Entrega el texto y un registro separado que vincule sus afirmaciones históricas con pasajes admitidos.

### Revisión

> Contrasta el guion con los pasajes originales y el encargo. Busca hechos sin apoyo, cambios de significado, fusiones de acontecimientos, precisión inventada, contradicciones y retrocesos no señalados. Omitir un año sin alterar la historia no es un error. Usa los recuentos externos de longitud y fechas. Para cada objeción, cita literalmente el fragmento y especifica la evidencia. No des por válida una afirmación porque venga acompañada de una referencia: comprueba que la referencia la sostiene.

## Experimento fijado antes de las llamadas

- Caso nuevo respecto al ensayo temporal: dos paradas de Valencia, Palacio de la Generalidad y Torres de Serranos, con bienvenida. Tema editorial: edificios que cambiaron de oficio. Mantiene el orden relativo de un recorrido guardado; no valida una ruta completa ni accesos.
- Material: pasajes de Wikipedia ya guardados, con revisión y atribución. No se envían fuentes institucionales o de prensa no admitidas. El dossier conserva un desacuerdo sobre el inicio del palacio para comprobar si el método lo detecta y evita resolverlo sin evidencia.
- Comparación A: encargo común, regla, ejemplo y dossier → guion directo. Comparación B: las mismas entradas → ficha editorial → comprobación → guion. Ambas reciben exactamente los mismos hechos esenciales y límites desde el principio.
- Modelo `deepseek-flash`, razonamiento desactivado, temperatura cero y JSON. Se estudia el método de trabajo; no se cambia el modo de razonamiento entre variantes.
- Extensión: bienvenida de 70–100 palabras, cada parada de 100–140; entre una y tres menciones de años completos en el conjunto. Siglos, reinados e intervalos se revisan por significado y carga narrativa. Estas cifras son del ensayo.
- Cada variante tiene una revisión nueva de DeepSeek y contraste final de Codex. Como máximo una llamada de corrección por variante, limitada a piezas señaladas por errores o recuentos. Sin reescritura manual del guion, sin reparaciones ocultas de la ficha y sin cambiar instrucciones después de ver resultados.
- Aceptación: estructura válida; hechos esenciales conservados; ausencia de afirmaciones históricas sin apoyo o fusiones de acontecimientos; cronología comprensible; límites de extensión y fechas cumplidos; un episodio reconocible por parada. Una ficha inválida bloquea la redacción de B. El gusto de los oyentes queda por evaluar.
- Máximo: siete llamadas (A: redacción, revisión, corrección opcional; B: preparación, redacción, revisión, corrección opcional), 2 USD de exposición controlada. Los errores y descartes cuentan. Se conservan solicitudes, respuestas, huellas, revisiones y consumo.

La comparación cambia tanto la separación en etapas como el presupuesto de llamadas. No aísla cuál de esos componentes explicaría una mejora. Un caso favorable no demuestra fiabilidad general ni permite concluir nada sobre adaptar tours existentes: esta prueba redacta una muestra nueva desde fuentes.

Carpeta de evidencia: [editorial-method-deepseek-20260916](/home/jesusotero/coding/tour-guide-app/backend/tmp/editorial-method-deepseek-20260916). El protocolo y las instrucciones exactas se guardaron con huellas antes de las llamadas; los resultados siguientes se añadieron después.

## Resultado de la prueba

**Método documentado y probado; todavía no produce una variante aprobada de forma autónoma.** Se hicieron cuatro llamadas de DeepSeek: guion directo, ficha editorial, revisión del guion directo y su única corrección. La variante por etapas se detuvo en la comprobación de la ficha, sin producir guion. Por tanto, no tenemos una comparación completa que permita afirmar que una forma redacta mejor que la otra.

La ficha contiene once hechos con referencias literales verificadas. Distingue el alquiler del palacio, los hitos de construcción de Serranos y el propósito protector de su adaptación. Detecta el desacuerdo entre los dos pasajes sobre el inicio del palacio. También reparte tres menciones de años y prevé el retroceso cronológico entre paradas.

El problema aparece al seleccionar: incluye el hecho conflictivo `f3` y «construcción discutida» en el episodio del palacio, en lugar de excluirlo del audio y registrarlo entre las omisiones. La bienvenida propone además comentar cómo se dosifican las fechas. La ficha fue bloqueada por ese incumplimiento editorial; no se corrigió a escondidas ni se completó manualmente para continuar.

Hubo también un defecto del comprobador local: exigía referencias de hechos incluso a una bienvenida puramente editorial. Se corrigió para permitirlas vacías solo en ese caso, conservando el rechazo de referencias inexistentes y de paradas sin hechos. La misma respuesta original pasó después la comprobación estructural sin otra llamada al modelo. Su fallo semántico permaneció. El resultado inicial se conserva y esta corrección no se presenta como mejora de DeepSeek.

| Guion directo | Primera versión | Tras una corrección |
| --- | ---: | ---: |
| Palabras totales | 296 | 300 |
| Bienvenida | 60 | 60 |
| Palacio | 122 | 126 |
| Torres | 114 | 114 |
| Menciones de años completos | 0 | 0 |

La primera versión trasladaba el alquiler de 1421 a finales del siglo XV. La corrección lo sitúa a principios del siglo y recupera a Jaume Desplà y las dos dependencias. Sin embargo, conserva literalmente bienvenida y Torres: siguen los 60 vocablos de introducción, las cero menciones de años frente al mínimo de una y una afirmación de uso actual que el encargo prohibía. El registro de referencias deja además sin apoyo explícito varias afirmaciones históricas de la bienvenida. El resultado no se aprobó y no recibió otra corrección.

La revisión de DeepSeek sí detectó el alquiler mal situado y el uso actual, pero también produjo objeciones innecesarias: «para protegerlas» expresa intención, no garantiza eficacia; «tras un incendio» no implica por sí solo causalidad. Codex separó esas falsas alarmas de los problemas reales y añadió el incumplimiento del presupuesto de fechas, que el revisor no señaló. La autoevaluación del modelo sigue necesitando contraste.

## Qué aprendimos para reutilizarlo

La extracción de datos y la decisión de narrarlos deben tener controles distintos. Encontrar una contradicción no basta si luego se incorpora al episodio. El siguiente ajuste concreto sería mantener **hechos utilizables** y **detalles excluidos** en apartados separados, y comprobar que el esquema solo referencia los primeros. Es una propuesta derivada del ensayo, todavía no probada; no modifica retrospectivamente las instrucciones congeladas.

El método ya deja resultados intermedios inspeccionables y permite detener una mala selección antes de narrar. Aún no demuestra mejor calidad final, automatización fiable ni menor intervención de Codex. No se ensayó activar el modo de razonamiento del proveedor: ambas variantes conservaron el modo desactivado para estudiar este cambio de procedimiento. Tampoco se modificó el redactor de la app ni se generó audio nuevo.

**Consumo estimado: 0.005155 USD**, cuatro llamadas, incluidas la ficha rechazada y la corrección insuficiente. Cálculo con consumo reportado y [tarifas oficiales consultadas el 16/09/2026](https://api-docs.deepseek.com/quick_start/pricing/), reconciliado con el control de gasto existente; no quedaron reservas abiertas. No incluye Codex, trabajo local o impuestos y no es una factura.

## Fuentes, reproducción y créditos

Se reutilizó investigación guardada del 12/09/2026; no se realizó una investigación histórica nueva ni se validó vigencia de usos o accesos. El caso es nuevo respecto al ensayo temporal de Madrid, Barcelona y Sevilla, aunque el proyecto ya tenía investigación de Valencia.

Textos adaptados de colaboradores de Wikipedia, bajo [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.es). Cambios: selección de pasajes, preparación de ficha editorial y narración mediante DeepSeek, con revisión de Codex. Bases:

- [Palacio de la Generalidad Valenciana, revisión 173450230](https://es.wikipedia.org/w/index.php?title=Palacio_de_la_Generalidad_Valenciana&oldid=173450230); [historial de colaboradores](https://es.wikipedia.org/w/index.php?title=Palacio_de_la_Generalidad_Valenciana&action=history).
- [Torres de Serranos, revisión 173134642](https://es.wikipedia.org/w/index.php?title=Torres_de_Serranos&oldid=173134642); [historial de colaboradores](https://es.wikipedia.org/w/index.php?title=Torres_de_Serranos&action=history).

La evidencia local conserva:

- [Protocolo](../../backend/tmp/editorial-method-deepseek-20260916/protocol.json), [dossier](../../backend/tmp/editorial-method-deepseek-20260916/case.json) y [plantillas exactas](../../backend/tmp/editorial-method-deepseek-20260916/prompts.json).
- [Ficha original de DeepSeek](../../backend/tmp/editorial-method-deepseek-20260916/b-plan.result.json) y [revisión de la ficha](../../backend/tmp/editorial-method-deepseek-20260916/b-plan-codex-review.json).
- [Guion corregido, sin edición manual](../../backend/tmp/editorial-method-deepseek-20260916/a-repair.result.json) y [evaluación completa](../../backend/tmp/editorial-method-deepseek-20260916/evaluation.json).
- [Ejecutor y comprobación sin API](../../backend/tmp/editorial-method-deepseek-20260916/run.cjs) y [verificación de integridad y consumo](../../backend/tmp/editorial-method-deepseek-20260916/verify.cjs).

Comprobaciones realizadas: entradas congeladas sin cambios, citas e identificadores válidos, respuestas y textos conservados exactamente, recuentos externos, consumo reconciliado y límite de correcciones respetado. La exactitud semántica se revisó aparte; estas comprobaciones no equivalen a aprobación editorial. Los artefactos de ejecución están fuera de Git y deben conservarse para mantener los enlaces y reproducir la inspección. No hubo cambios de código en la aplicación.
