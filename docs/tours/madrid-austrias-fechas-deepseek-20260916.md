# Madrid de los Austrias: menos fechas, editado por DeepSeek

Fecha: 16 de septiembre de 2026. Experimento de escucha local; segunda versión del mismo tour.

**DeepSeek hizo la reformulación y sus correcciones.** Codex preparó las instrucciones, revisó la evidencia y seleccionó el resultado. Ninguna frase de esta variante fue reescrita manualmente después de la salida del modelo. El guion original y la investigación proceden del [experimento anterior](madrid-austrias-escucha-deepseek-20260916.md).

![Escuchar la variante con menos fechas](/home/jesusotero/coding/tour-guide-app/backend/tmp/madrid-austrias-fechas-20260916/madrid-de-los-austrias.mp3)

[Escuchar la primera versión](/home/jesusotero/coding/tour-guide-app/backend/tmp/madrid-austrias-escucha-20260916/madrid-de-los-austrias.mp3).

## Resultado observable

| Medida | Primera versión | Variante |
| --- | ---: | ---: |
| Menciones de años completos, contando repeticiones | 14 | 1 |
| Palabras | 722 | 716 |
| Audio | 5:14 | 5:11 |
| Piezas | Bienvenida + 5 paradas | Bienvenida + 5 paradas |

La fecha conservada es **1561**, para la instalación de la corte. Siglos, reinados e intervalos siguen presentes: el recuento no significa que solo quede una referencia temporal. La comparación mantiene voz, recorrido, episodios y extensión aproximadamente constantes.

Por ejemplo, DeepSeek convirtió los años del permiso y del inicio de obra en:

> Felipe cuarto concedió licencia para construirla y las obras comenzaron quince años después.

La evidencia distingue licencia en 1629 e inicio en 1644. El intervalo expresa la espera hasta empezar, no la duración de la construcción. La ocupación parcial posterior permanece en el relato. Al pasar del concejo a la Plaza Mayor, el texto aclara el retorno de las obras bajo Felipe IV al reinado de Felipe III.

## Instrucción y ejecución

La [regla editorial reutilizable](regla-editorial-fechas-audioguias.md) pide seleccionar fechas con función narrativa, conservar la cronología en las fichas, comprobar los hitos de cada intervalo y señalar retrocesos entre paradas. No elimina las fechas por sistema.

1. El primer intento pasó de 14 a 11 menciones: la instrucción abierta produjo poco contraste.
2. Antes del siguiente intento se fijó un objetivo de **una a cuatro menciones para estas aproximadamente 700 palabras**, conservando los seis episodios. Es una decisión de este ensayo, no una cifra universal ni una hipótesis fijada antes de la primera llamada.
3. Un intento devolvió los datos recibidos y fue rechazado. Una instrucción explícita en el mensaje de tarea produjo la reformulación válida.
4. DeepSeek revisó la cronología. Señaló una espera demasiado vaga y también marcó omisiones de años como errores aunque los acontecimientos seguían presentes. Codex revisó esas objeciones y detectó la transición imprecisa entre reinados.
5. DeepSeek corrigió las dos piezas indicadas. Las otras cuatro se conservaron literalmente. Se generaron seis audios y su unión con el renderizador existente.

Una petición de corrección devolvió HTTP 400; al añadir la indicación explícita «JSON» funcionó. El motivo es probable, pues el registro no conservó el cuerpo del error. Los intentos están incluidos en el registro. La revisión del modelo también dejó justificaciones inexactas fuera del guion; se señalan en la revisión final y no se consideran evidencia histórica.

**Coste estimado de esta variante: 0.009837 USD** en consumo reportado: seis respuestas HTTP correctas, incluida la descartada, y una solicitud HTTP 400 sin consumo reportado. El coste de esta última es desconocido. No incluye el primer experimento, Codex ni recursos locales. Cálculo fuera de punta con las [tarifas oficiales](https://api-docs.deepseek.com/quick_start/pricing/) consultadas el 16/09/2026; no es una factura.

El modelo devuelto fue `deepseek-flash`, con razonamiento desactivado. Tiempo acumulado de API: 42.3 segundos. Proceso de voz local: 69.2 segundos. Estas cifras no son el tiempo total de trabajo.

## Qué demuestra y qué queda por evaluar

En este caso DeepSeek pudo aplicar la selección temporal conservando el contenido con instrucciones y revisión. No demuestra todavía que lo haga bien a la primera, para otras ciudades o sin supervisión. La regla queda documentada; no está integrada en la generación de tours de la app.

Se verificó que el guion usado coincide exactamente con las salidas aceptadas del modelo, que mantiene seis piezas y la misma identidad de voz, y que ambos audios conservan sus huellas. Las seis nuevas pistas se decodifican, tienen señal y procedencia enlazada. No se ha realizado escucha humana ni transcripción automática de control.

Para comparar, escuchad ambas versiones en orden alternado y valorad interés, facilidad para situar los hechos y sensación de exceso de datos. Comprobad también si recordáis qué ocurrió antes y qué cambió. Aún no hay resultados de oyentes; menos menciones de años no prueba mayor disfrute. La duración corresponde al audio compacto, no al paseo completo.

## Guion y créditos

Texto adaptado con IA a partir del guion anterior, bajo [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.es). Cambios: selección de años pronunciados y reformulación temporal. Créditos de las bases: colaboradores de Wikipedia; se conservan las [versiones, historiales y atribuciones de las cinco fuentes](madrid-austrias-escucha-deepseek-20260916.md#guion-y-créditos) y el [dossier de contraste histórico](experimento-madrid-austrias-20260916.md). Los enlaces exactos también acompañan al guion estructurado. La voz utiliza VoxCPM2 local y el mismo preset español A, con la procedencia y los límites de derechos documentados en la primera versión.

### Bienvenida

Bienvenidos al Madrid de los Austrias. Este paseo sigue las decisiones y obras que fueron dando forma a una capital, tomando como punto de partida la instalación de la corte por Felipe segundo a mediados del siglo dieciséis. Empezaremos ante el Palacio Real, donde estuvo el Alcázar, la antigua residencia real. Después retrocederemos a los años previos a esa instalación para encontrarnos con la fundación de Juana de Austria en las Descalzas Reales. Más tarde veremos el problema del concejo para encontrar sede, la transformación de la Plaza Mayor y, al final, el edificio que Felipe cuarto ordenó para juzgar y encerrar. Son decisiones diferentes, tomadas por personas distintas, que dejaron huella en esta parte de la ciudad.

### Una corte que decide quedarse

Mira hacia el Palacio Real. Para empezar esta historia hay que imaginar otro edificio en su lugar: el Alcázar, una residencia que llevaba siglos cambiando. En mil quinientos sesenta y uno, Felipe segundo instaló la corte en Madrid. Aquella decisión dio al viejo palacio un papel central y abrió una larga etapa de reformas. Se adaptaron habitaciones y se decoraron salas; convertirlo en residencia de la corte fue también un trabajo de arquitectos y artesanos. El Alcázar desapareció en un incendio ya en el siglo dieciocho. Por eso, la fachada que tienes delante pertenece a una etapa posterior. El lugar, sin embargo, permite empezar por la decisión que organiza nuestro paseo: establecer aquí la corte. En las próximas calles veremos cómo distintas instituciones fueron dando forma a esa capital.

### La fundación de Juana

Antes de que su hermano instalara la corte en Madrid, Juana de Austria ya había impulsado aquí una fundación. A mediados del siglo dieciséis, mientras ejercía la regencia, comenzó la historia del monasterio de las Descalzas Reales. Para alojarlo se transformó un palacio existente. El acondicionamiento terminó un par de años después y entonces se inauguró el monasterio, aunque la iglesia todavía no estaba acabada. Juana ocupa el centro de este episodio, como promotora de una institución estrechamente ligada a la familia real. Desde esta plaza podemos seguir otra forma de dejar huella en Madrid: dedicar un edificio, recursos y continuidad a una comunidad religiosa. La ciudad de los Austrias también se construyó mediante decisiones como la suya.

### El concejo busca casa

Ya en el siglo diecisiete, quienes gobernaban Madrid tenían un problema muy concreto: necesitaban un lugar donde reunirse. Sus dependencias estaban en mal estado y el concejo recurrió al alquiler. El estudio de los acuerdos municipales permite seguir aquella búsqueda de locales durante décadas. La sede que vemos aquí llegó por etapas: Felipe cuarto concedió licencia para construirla y las obras comenzaron quince años después. Más tarde ya pudo trasladarse el concejo a una parte terminada. La construcción continuó después. Esta fachada cierra una historia de mudanzas, gastos y obras: también el gobierno de la capital tuvo que resolver dónde trabajar.

### Dar forma a la plaza

Para la siguiente historia retrocedemos al reinado de Felipe tercero, anterior a las obras durante Felipe cuarto. Esta plaza ya tenía una historia anterior a su forma monumental. Aquí estuvo la plaza del Arrabal, lugar de mercado, y la transformación del espacio había comenzado antes del reinado de Felipe tercero. Siendo Felipe tercero rey, encargó a Juan Gómez de Mora culminar las obras. Un par de años después, aquella fase estaba terminada. Un espacio de comercio adquiría una nueva forma dentro de la capital. Al mirar alrededor conviene separar aquella obra de las modificaciones posteriores: la plaza sufrió incendios y fue reconstruida. Tampoco la estatua de Felipe tercero estuvo siempre en el centro; llegó aquí ya en el siglo diecinueve.

### Una sede para juzgar y encerrar

El nombre de Palacio de Santa Cruz puede hacer pensar en una residencia, pero el encargo de Felipe cuarto tenía otra función. El rey ordenó construir una sede para la Sala de Alcaldes de Casa y Corte y para la Cárcel de Corte. El proyecto se vinculó a Juan Gómez de Mora, cuyo nombre ya hemos encontrado en otras obras del paseo. Aquí, la administración de justicia y la reclusión compartían edificio. Sus usos y su estructura cambiaron después, por lo que tampoco esta fachada debe leerse como una imagen intacta del siglo diecisiete. Terminamos ante una de las instituciones de aquella capital. Hemos seguido una residencia real, una fundación religiosa, la búsqueda de sede del concejo, una plaza y una cárcel: decisiones diferentes que dejaron huella en calles cercanas.

## Archivos para reproducir y revisar

- [Guion final y créditos](/home/jesusotero/coding/tour-guide-app/backend/tmp/madrid-austrias-fechas-20260916/master.json).
- [Respuesta de reformulación de DeepSeek](/home/jesusotero/coding/tour-guide-app/backend/tmp/madrid-austrias-fechas-20260916/rewrite-light-retry.json) y [correcciones finales del modelo](/home/jesusotero/coding/tour-guide-app/backend/tmp/madrid-austrias-fechas-20260916/repair/result-json.json).
- [Revisión final y decisiones de Codex](/home/jesusotero/coding/tour-guide-app/backend/tmp/madrid-austrias-fechas-20260916/codex-final-review.json).
- [Comparación verificada](/home/jesusotero/coding/tour-guide-app/backend/tmp/madrid-austrias-fechas-20260916/comparison.json) y [consumo de todos los intentos](/home/jesusotero/coding/tour-guide-app/backend/tmp/madrid-austrias-fechas-20260916/usage-summary.json).
- [Audio, capítulos y duraciones](/home/jesusotero/coding/tour-guide-app/backend/tmp/madrid-austrias-fechas-20260916/listening-result.json) y [procedencia de la unión](/home/jesusotero/coding/tour-guide-app/backend/tmp/madrid-austrias-fechas-20260916/madrid-de-los-austrias.mp3.provenance.json).

Conservar esta carpeta de ejecución junto con la anterior: contiene los audios y registros que sustentan los enlaces. Las solicitudes y respuestas originales permanecen guardadas; el registro de cambios del borrador debe leerse junto con la corrección posterior y su revisión.
