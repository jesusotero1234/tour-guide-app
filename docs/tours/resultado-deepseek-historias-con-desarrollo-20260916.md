# Resultado: historias desarrolladas con DeepSeek

Fecha: 16 de septiembre de 2026. Estado: **ensayo cerrado; San Pío V mejoró su desarrollo, pero quedó por debajo de la duración; Colegio no ejecutado**.

**San Pío V pasó de la cápsula de veinte segundos a un relato de 86,6 segundos, aproximadamente 1:27.** La única corrección prevista devolvió exactamente el mismo texto. El objetivo era 90–120 segundos: faltaron 3,4 segundos para el mínimo y no se modificó el criterio después de generar. Se cerró la prueba tras dos llamadas; no se ejecutó el Colegio.

[Abrir comparación con fotos y audio](/home/jesusotero/coding/tour-guide-app/backend/tmp/deepseek-historias-desarrolladas-20260916/index.html) · [Escuchar el intento de San Pío V — no aprobado por duración](/home/jesusotero/coding/tour-guide-app/backend/tmp/deepseek-historias-desarrolladas-20260916/candidates/sanpio-draft/audio/cef8305a-300e-5842-ac51-8c318c354d9c.mp3) · [Plan ejecutado](plan-deepseek-historias-con-desarrollo-20260916.md)

## Qué produjo

| San Pío V | Palabras | Duración | Resultado |
| --- | --- | --- | --- |
| Entrega anterior con edición humana | 215 | 84,3 s | Referencia conservada. |
| Cápsula de la prueba anterior | 49 | 20,3 s | El usuario la consideró insuficiente para una historia. |
| Nuevo borrador de DeepSeek | 225 | 86,6 s | Cumple la revisión editorial; no alcanza el rango de audio. |
| Corrección de DeepSeek | 225 | Mismo audio | Texto idéntico; no se vuelve a sintetizar ni se aprueba. |

El nuevo texto recupera la escala de la entrega anterior; no supone un aumento importante de duración frente a aquella versión. La mejora que observo al leerlo está en su contenido: desarrolla una decisión concreta sobre el museo y no se limita a enumerar usos del edificio. Sigue teniendo una fecha larga y una frase técnica sobre los hitos del traslado. No se realizó una valoración auditiva humana del resultado.

## Desarrollo añadido y selección de fuentes

Las capturas completas ya guardadas contenían material que no había entrado en la ficha de tres hechos: el museo estaba en el Carmen, parte de sus fondos se trasladó a Madrid durante la guerra, Manuel González Martí gestionó su recuperación y encargó un informe para rehabilitar la sede dañada. La rehabilitación no se llevó a cabo y se decidió trasladar el museo.

La historia oficial del museo permite distinguir el decreto de traslado de 1939 y la nueva sede desde 1946; la Academia confirma este último año. Esas precisiones se incorporaron a la ficha antes de generar, sin inventar las causas del fracaso de la rehabilitación. Fuentes: [historia del museo](https://museobellasartesvalencia.gva.es/es/historia-del-museo) e [historia de la Academia](https://realacademiasancarlos.com/historia/).

También se preparó la ficha del Colegio: ordenanzas anteriores, control de tejidos, facultad de decomisar telas, argumentos recogidos en la petición y título de Colegio de artistas. Se excluyó presentar 1686 como el primer reconocimiento de cualquier clase como arte, porque la cronología institucional documenta un reconocimiento anterior. Se conservan la ficha y sus límites, pero no se generó ni evaluó una nueva narración del Colegio. Contraste: [museo y archivo de la Seda](https://www.museodelasedavalencia.com/museo/) y [cronología del Colegio](https://www.museodelasedavalencia.com/Colegio/).

Las fuentes institucionales se usaron para contrastar hechos y formular paráfrasis factuales; no se presupuso licencia abierta para reproducir su prosa. Las capturas de Wikipedia mantienen su atribución y condiciones de adaptación. La consulta del PDF de la Biblioteca Valenciana no pudo completarse y no se utilizó como evidencia.

## Texto nuevo, sin retoques

Estás ante el Colegio de San Pío V, hoy sede del Museo de Bellas Artes de Valencia. Su historia cambió de rumbo tras la Guerra Civil, cuando el museo tuvo que buscar un nuevo hogar. Durante el conflicto, el museo estaba en el antiguo convento del Carmen Calzado. Allí fue desmontado y usado como almacén del Tesoro Artístico, y parte de sus fondos se trasladó a Madrid, al Museo del Prado. Al acabar la guerra, el director Manuel González Martí gestionó la recuperación de esos fondos. El cinco de septiembre de mil novecientos treinta y nueve encargó un informe para evaluar los daños sufridos por el edificio conventual, con la intención de rehabilitarlo. Pero esa rehabilitación no se llevó a cabo. Entonces se tomó la decisión de trasladar el museo al Colegio Seminario de San Pío V. Ese mismo año, el Ministerio de Educación decretó el traslado debido a los daños del Carmen. La decisión y la ocupación no fueron el mismo hito: San Pío V fue la nueva sede desde mil novecientos cuarenta y seis. Así, un edificio fundado por el arzobispo Juan Tomás de Rocabertí para formar sacerdotes, y que después fue sede de la Beneficencia, almacén militar y hospital militar durante la Guerra Civil, pasó a albergar el Museo de Bellas Artes. Lo que ves hoy es el resultado de aquel traslado.

## Comprobación de la corrección

La petición de reparación incluía la duración medida, el defecto concreto y el objetivo de unas 260–280 palabras, además de señalar la transición final y el registro técnico. Se mantuvieron las mismas fuentes, hechos, ejemplo y configuración. No se proporcionaron frases humanas de sustitución.

Las dos respuestas llegaron completas, con finalización `stop`, identificadores distintos y solicitudes diferentes. Se comprobó que la segunda solicitud contenía las instrucciones de corrección y que las respuestas originales de la API coinciden con los resultados guardados. **Las narraciones son idénticas byte a byte.** Esto verifica que no se reutilizó accidentalmente un resultado local; no permite determinar por qué el modelo ignoró la corrección.

Se reutiliza el audio del primer intento porque ambos textos son iguales. No se añade silencio, no se altera la velocidad y no se repite la síntesis para intentar superar el mínimo por variación de voz.

## Evaluación y alcance

| Criterio fijado | San Pío V |
| --- | --- |
| Historia reconocible desde el inicio | Cumple: búsqueda de sede, recuperación, informe y traslado. |
| Desarrollo documentado | Cumple: incorpora actuaciones del director y el intento de rehabilitación. |
| Audio de 90–120 segundos | **No cumple: 86,6 segundos.** |
| Fidelidad y cronología | Cumple según la ficha; distingue decisión e instalación. |
| Avance sin reiteración del episodio completo | Cumple; los usos previos aparecen como contexto retrospectivo en el cierre. |

Resultado bajo el protocolo: **cero piezas aprobadas, una probada y una no ejecutada**. La narración puede escucharse como intento con más desarrollo; no se presenta como cumplimiento del plan ni como aceptación del usuario. Su valoración sigue pendiente.

La base enviada a DeepSeek fue el guion anterior con sus intervenciones humanas, junto con el ejemplo completo de la Generalidad y la evidencia seleccionada por Codex. Hubo **cero ediciones humanas de las nuevas respuestas**, pero el proceso es una revisión sobre una base asistida y requiere preparación editorial. Este ensayo no evalúa redacción autónoma de nuevos tours desde cero.

## Ejecución y verificaciones

Se realizaron **2 solicitudes físicas de generación**, ambas para San Pío V, con `deepseek-flash`, razonamiento adicional desactivado y temperatura cero. Coste estimado: **0.001252236 USD**, conciliado con el registro de gasto y las [tarifas oficiales consultadas](https://api-docs.deepseek.com/quick_start/pricing/). No incluye preparación, revisión ni voz. No quedaron reservas abiertas. El límite por pieza era dos; las otras dos llamadas posibles estaban reservadas al Colegio, cuya condición de entrada no se cumplió.

La síntesis utilizó la identidad habitual de VoxCPM2. Generación y relevo de GPU tardaron unos 47 segundos y el servicio anterior quedó restaurado. Se verificaron huellas de entradas y fuentes, respuestas reales, texto mostrado y enviado a voz, integridad y señal de los audios, carga de dos fotografías y reproducción de cinco archivos. La comparación funciona en escritorio y móvil sin desbordamiento. Son comprobaciones técnicas, no una auditoría auditiva palabra por palabra.

Registros: [fichas fijadas](/home/jesusotero/coding/tour-guide-app/backend/tmp/deepseek-historias-desarrolladas-20260916/inputs.json), [selección de fuentes](/home/jesusotero/coding/tour-guide-app/backend/tmp/deepseek-historias-desarrolladas-20260916/source-review.json), [evaluación](/home/jesusotero/coding/tour-guide-app/backend/tmp/deepseek-historias-desarrolladas-20260916/evaluation.json), [revisión final de San Pío V](/home/jesusotero/coding/tour-guide-app/backend/tmp/deepseek-historias-desarrolladas-20260916/sanpio-repair.review.json), [decisión de cierre](/home/jesusotero/coding/tour-guide-app/backend/tmp/deepseek-historias-desarrolladas-20260916/decisions.json), [audio](/home/jesusotero/coding/tour-guide-app/backend/tmp/deepseek-historias-desarrolladas-20260916/audio-check.json) y [navegador](/home/jesusotero/coding/tour-guide-app/backend/tmp/deepseek-historias-desarrolladas-20260916/browser-check.json).

## Créditos y conservación

Adaptación de textos de colaboradores de Wikipedia bajo [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), con selección y nueva redacción. Las fotos mantienen sus créditos y licencias en la comparación.

- [Museo de Bellas Artes de Valencia, versión utilizada](https://es.wikipedia.org/wiki/Museo_de_Bellas_Artes_de_Valencia?oldid=175147247) · [Historial](https://es.wikipedia.org/wiki/Museo_de_Bellas_Artes_de_Valencia?action=history).
- [Colegio del Arte Mayor de la Seda, versión utilizada para la ficha](https://es.wikipedia.org/wiki/Colegio_del_Arte_Mayor_de_la_Seda?oldid=174632164) · [Historial](https://es.wikipedia.org/wiki/Colegio_del_Arte_Mayor_de_la_Seda?action=history).

No se sustituyeron los tours existentes ni se modificó producción. La comparación es local, reutiliza los audios anteriores y necesita conexión para cargar las fotos.

## Valoración posterior del usuario

El usuario valoró el resultado con «Bueno pero ni tan mal» y pidió otras paradas. Se continúa con el Colegio y la Lonja en una ejecución nueva, con duración orientativa y sin rechazo automático por pocos segundos. El resultado de este protocolo conserva sus criterios originales. No se presume una escucha detallada. Véase la [nueva entrega](valencia-dos-paradas-desarrolladas-20260916.md).
