# Madrid de los Austrias: primera versión para escuchar

Fecha: 16 de septiembre de 2026. Estado: audio generado para escucha local.

**Duración: 5:14.** Bienvenida y cinco paradas; 722 palabras y dos segundos de separación entre capítulos. Es una versión compacta para valorar el enfoque, no el guion extendido de un tour comercial.

![Escuchar Madrid de los Austrias](/home/jesusotero/coding/tour-guide-app/backend/tmp/madrid-austrias-escucha-20260916/madrid-de-los-austrias.mp3)

[Dossier histórico, recorrido y evaluación de fuentes](experimento-madrid-austrias-20260916.md).

[Segunda escucha: selección de fechas hecha por DeepSeek, con el audio y la comparación](madrid-austrias-fechas-deepseek-20260916.md).

## Quién hizo cada parte

- **Investigación y primeras muestras:** Codex, en el experimento anterior. No se hicieron con DeepSeek.
- **Nuevo borrador y edición:** llamadas reales a DeepSeek, modelo devuelto `deepseek-flash`. La documentación del proveedor lo identifica actualmente como DeepSeek V4.1 Flash. Se partió de las muestras y límites ya revisados; no hubo investigación autónoma de DeepSeek.
- **Revisión final:** Codex comprobó el texto completo contra las fichas y corrigió la bienvenida, una transición cronológica y una formulación ambigua. Las correcciones literales están conservadas.
- **Voz sintética:** VoxCPM2 local, preset español «voz A» ya usado por la app. No intervino un proveedor externo de voz.

Se reutilizaron el cliente DeepSeek con registro de solicitudes y el renderizador de audio existentes. Esta ejecución no recorrió el proceso completo de creación de tours de la app ni insertó el tour en su catálogo. No se modificó código de producción.

## Qué ocurrió y cuánto costó

La llamada con razonamiento máximo agotó 20.000 tokens sin entregar texto final. La repetición con razonamiento reducido produjo un borrador, pero añadió repeticiones e inferencias no justificadas. La revisión de DeepSeek aprobó las seis piezas sin objeciones; la revisión de Codex encontró problemas y preparó las correcciones. DeepSeek editó el guion y después se hicieron ajustes locales breves. La versión final quedó cercana a las muestras iniciales.

| Etapa | Tiempo de API | Tokens de entrada | Tokens de salida, incluido razonamiento | Estimación USD |
| --- | ---: | ---: | ---: | ---: |
| Redacción con razonamiento máximo: sin texto final | 74.9 s | 2126 | 20000 | 0.012319 |
| Redacción con razonamiento reducido | 61.7 s | 2126 | 15344 | 0.009525 |
| Revisión automática del borrador | 52.5 s | 4057 | 12149 | 0.007898 |
| Edición con correcciones de Codex | 4.9 s | 4579 | 1148 | 0.001376 |

**Total estimado DeepSeek: 0.031118 USD**, aproximadamente 3,1 centavos, incluidos los intentos sin texto útil. Cálculo con consumo devuelto y [tarifas oficiales](https://api-docs.deepseek.com/quick_start/pricing/), consultadas el 16/09/2026. Las cuatro llamadas ocurrieron fuera de punta. No es una factura y no incluye el trabajo de Codex, infraestructura, electricidad o impuestos.

La API acumuló 194,1 segundos. El proceso supervisado de voz duró 73,6 segundos, incluida su preparación; no equivale al tiempo total de trabajo de esta sesión.

**Conclusión del ensayo:** DeepSeek pudo producir y editar texto utilizable a bajo coste de API en este caso, pero su autorrevisión dejó pasar problemas. Esta muestra no valida un proceso autónomo ni demuestra ahorro total frente al flujo habitual.

## Capítulos

| Inicio | Capítulo | Duración |
| --- | --- | ---: |
| 0:00 | [Bienvenida](/home/jesusotero/coding/tour-guide-app/backend/tmp/madrid-austrias-escucha-20260916/audio/b53b11c6-f8ac-526d-b30a-ce95f2302482.mp3) | 0:45 |
| 0:47 | [Una corte que decide quedarse](/home/jesusotero/coding/tour-guide-app/backend/tmp/madrid-austrias-escucha-20260916/audio/1a02fd9a-1183-5e26-9d9d-c9eef5368b33.mp3) | 0:56 |
| 1:45 | [La fundación de Juana](/home/jesusotero/coding/tour-guide-app/backend/tmp/madrid-austrias-escucha-20260916/audio/80610d8d-fa59-5837-a4a3-8be7bb816473.mp3) | 0:51 |
| 2:38 | [El concejo busca casa](/home/jesusotero/coding/tour-guide-app/backend/tmp/madrid-austrias-escucha-20260916/audio/24a72d9a-2bbf-5712-a547-011babaa8da0.mp3) | 0:50 |
| 3:30 | [Dar forma a la plaza](/home/jesusotero/coding/tour-guide-app/backend/tmp/madrid-austrias-escucha-20260916/audio/ea6b219f-9d08-53a0-93c3-237e9340bd3e.mp3) | 0:49 |
| 4:21 | [Una sede para juzgar y encerrar](/home/jesusotero/coding/tour-guide-app/backend/tmp/madrid-austrias-escucha-20260916/audio/76aca364-4ac5-5b20-80ad-d7e31e0a0419.mp3) | 0:54 |

## Guion y créditos

Texto generado y editado con IA a partir de las muestras del dossier; revisión y ajustes de Codex. Las adaptaciones conservan [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.es), atribución y aviso de cambios. Las condiciones del texto no acreditan por sí solas todos los derechos de una grabación o referencia de voz. Este audio se entrega para la prueba local solicitada; se conserva la procedencia documentada del preset sin ampliar permisos que no constan.

Créditos de las bases: colaboradores de Wikipedia. Las versiones fijadas y sus historiales se encuentran a continuación; el dossier contiene el contraste con Patrimonio Nacional, Comunidad de Madrid, Ministerio de Exteriores y el estudio de Castellanos Oñate. No se enviaron esos artículos completos a DeepSeek.

- [Real Alcázar de Madrid, versión utilizada](https://es.wikipedia.org/w/index.php?title=Real_Alc%C3%A1zar_de_Madrid&oldid=173930555); [historial de colaboradores](https://es.wikipedia.org/w/index.php?title=Real_Alc%C3%A1zar_de_Madrid&action=history).
- [Descalzas Reales, versión utilizada](https://es.wikipedia.org/w/index.php?title=Monasterio_de_las_Descalzas_Reales_(Madrid)&oldid=175237579); [historial de colaboradores](https://es.wikipedia.org/w/index.php?title=Monasterio_de_las_Descalzas_Reales_(Madrid)&action=history).
- [Casa de la Villa, versión utilizada](https://es.wikipedia.org/w/index.php?title=Casa_de_la_Villa_de_Madrid&oldid=171949938); [historial de colaboradores](https://es.wikipedia.org/w/index.php?title=Casa_de_la_Villa_de_Madrid&action=history).
- [Plaza Mayor, versión utilizada](https://es.wikipedia.org/w/index.php?title=Plaza_Mayor_de_Madrid&oldid=173002611); [historial de colaboradores](https://es.wikipedia.org/w/index.php?title=Plaza_Mayor_de_Madrid&action=history).
- [Palacio de Santa Cruz, versión utilizada](https://es.wikipedia.org/w/index.php?title=Palacio_de_Santa_Cruz_(Madrid)&oldid=174618098); [historial de colaboradores](https://es.wikipedia.org/w/index.php?title=Palacio_de_Santa_Cruz_(Madrid)&action=history).

Las [condiciones de DeepSeek](https://cdn.deepseek.com/policies/en-US/deepseek-terms-of-use.html), consultadas el 16/09/2026, requieren disponer de los derechos necesarios sobre las entradas, verificar las salidas y señalar su generación con IA al difundirlas. No se presume confidencialidad absoluta ni una exclusión de uso para mejora del servicio que no se haya comprobado en la cuenta.

### Bienvenida

Bienvenidos al Madrid de los Austrias. Este paseo sigue las decisiones y obras que fueron dando forma a una capital, tomando como punto de partida la instalación de la corte en mil quinientos sesenta y uno. Empezaremos ante el Palacio Real, donde estuvo el Alcázar, la antigua residencia real. Después retrocederemos a mil quinientos cincuenta y siete para encontrarnos con la fundación de Juana de Austria en las Descalzas Reales. Más tarde veremos el problema del concejo para encontrar sede, la transformación de la Plaza Mayor y, al final, el edificio que Felipe cuarto ordenó para juzgar y encerrar. Son decisiones diferentes, tomadas por personas distintas, que dejaron huella en esta parte de la ciudad.

### Una corte que decide quedarse

Mira hacia el Palacio Real. Para empezar esta historia hay que imaginar otro edificio en su lugar: el Alcázar, una residencia que llevaba siglos cambiando. En mil quinientos sesenta y uno, Felipe segundo instaló la corte en Madrid. Aquella decisión dio al viejo palacio un papel central y abrió una larga etapa de reformas. Se adaptaron habitaciones y se decoraron salas; convertirlo en residencia de la corte fue también un trabajo de arquitectos y artesanos. El Alcázar desapareció en el incendio de mil setecientos treinta y cuatro. Por eso, la fachada que tienes delante pertenece a una etapa posterior. El lugar, sin embargo, permite empezar por la decisión que organiza nuestro paseo: establecer aquí la corte. En las próximas calles veremos cómo distintas instituciones fueron dando forma a esa capital.

### La fundación de Juana

Antes de que su hermano instalara la corte en Madrid, Juana de Austria ya había impulsado aquí una fundación. En mil quinientos cincuenta y siete, mientras ejercía la regencia, comenzó la historia del monasterio de las Descalzas Reales. Para alojarlo se transformó un palacio existente. El acondicionamiento terminó en agosto de mil quinientos cincuenta y nueve y aquel año se inauguró el monasterio, aunque la iglesia todavía no estaba acabada. Juana ocupa el centro de este episodio, como promotora de una institución estrechamente ligada a la familia real. Desde esta plaza podemos seguir otra forma de dejar huella en Madrid: dedicar un edificio, recursos y continuidad a una comunidad religiosa. La ciudad de los Austrias también se construyó mediante decisiones como la suya.

### El concejo busca casa

En mil seiscientos diecinueve, quienes gobernaban Madrid tenían un problema muy concreto: necesitaban un lugar donde reunirse. Sus dependencias estaban en mal estado y el concejo recurrió al alquiler. El estudio de los acuerdos municipales permite seguir aquella búsqueda de locales durante décadas. La sede que vemos aquí llegó por etapas: Felipe cuarto concedió licencia para construirla en mil seiscientos veintinueve y las obras comenzaron en mil seiscientos cuarenta y cuatro. En mil seiscientos cincuenta y seis ya pudo trasladarse el concejo a una parte terminada. La construcción continuó después. Esta fachada cierra una historia de mudanzas, gastos y obras: también el gobierno de la capital tuvo que resolver dónde trabajar.

### Dar forma a la plaza

Para la siguiente historia retrocedemos a mil seiscientos diecisiete. Esta plaza ya tenía una historia anterior a su forma monumental. Aquí estuvo la plaza del Arrabal, lugar de mercado, y la transformación del espacio había comenzado antes del reinado de Felipe tercero. Ese año, el rey encargó a Juan Gómez de Mora culminar las obras. En mil seiscientos diecinueve, aquella fase estaba terminada. Un espacio de comercio adquiría una nueva forma dentro de la capital. Al mirar alrededor conviene separar aquella obra de las modificaciones posteriores: la plaza sufrió incendios y fue reconstruida. Tampoco la estatua de Felipe tercero estuvo siempre en el centro; llegó aquí en mil ochocientos cuarenta y ocho.

### Una sede para juzgar y encerrar

El nombre de Palacio de Santa Cruz puede hacer pensar en una residencia, pero el encargo de mil seiscientos veintinueve tenía otra función. Felipe cuarto ordenó construir una sede para la Sala de Alcaldes de Casa y Corte y para la Cárcel de Corte. El proyecto se vinculó a Juan Gómez de Mora, cuyo nombre ya hemos encontrado en otras obras del paseo. Aquí, la administración de justicia y la reclusión compartían edificio. Sus usos y su estructura cambiaron después, por lo que tampoco esta fachada debe leerse como una imagen intacta del siglo diecisiete. Terminamos ante una de las instituciones de aquella capital. Hemos seguido una residencia real, una fundación religiosa, la búsqueda de sede del concejo, una plaza y una cárcel: decisiones diferentes que dejaron huella en calles cercanas.

## Comprobaciones y límites

Se comprobaron las seis piezas, su decodificación, señal no silenciosa, duraciones, integridad por SHA-256 y registros de procedencia enlazados. El ritmo resultante está entre 133 y 154 palabras por minuto según el capítulo. La unión conserva dos segundos entre piezas y su propia procedencia. No se ha realizado escucha humana, transcripción automática ni comprobación del paseo sobre el terreno.

El recorrido del dossier sigue siendo una hipótesis de 2,12 km y unos 29 minutos de marcha. Los 5:14 de audio no son la duración del paseo. No se han publicado entradas, accesos ni horarios como verificados.

## Evidencia de esta ejecución

- [Guion final estructurado](/home/jesusotero/coding/tour-guide-app/backend/tmp/madrid-austrias-escucha-20260916/master.json).
- [Consumo, modelos y llamadas](/home/jesusotero/coding/tour-guide-app/backend/tmp/madrid-austrias-escucha-20260916/usage-summary.json).
- [Problemas detectados por Codex](/home/jesusotero/coding/tour-guide-app/backend/tmp/madrid-austrias-escucha-20260916/codex-editorial-review.json).
- [Ajustes y revisión final](/home/jesusotero/coding/tour-guide-app/backend/tmp/madrid-austrias-escucha-20260916/codex-final-review.json).
- [Audio, capítulos, duraciones y huellas](/home/jesusotero/coding/tour-guide-app/backend/tmp/madrid-austrias-escucha-20260916/listening-result.json).
- [Procedencia del audio continuo](/home/jesusotero/coding/tour-guide-app/backend/tmp/madrid-austrias-escucha-20260916/madrid-de-los-austrias.mp3.provenance.json).

Conservar la carpeta de esta ejecución junto con los audios: contiene solicitudes, respuestas, texto, consumos, entrada del renderizador y procedencia de cada clip. Borrarla rompería los enlaces de escucha y parte de la trazabilidad.
