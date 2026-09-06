# Sol medium: primera narración y auditoría completadas

Fecha: 2026-09-06. Run: `malagueta-author-sol-medium-20260906-2`.

## Veredicto

**Sol produjo una primera narración de 569 palabras, frente a un objetivo de 562, en una sola petición.** La escritura tardó 16,3 segundos. Con una auditoría GPT-5.4, la prueba completa tardó 63,5 segundos y costó **0,1577475 USD**. No hubo reparaciones ni regeneración del texto.

Mi valoración: es un candidato viable para el escritor. En esta muestra conserva mejor varias distinciones factuales que los otros candidatos, pero todavía suena bastante expositivo. No lo considero una demostración de publicación automática ni un tour completo aprobado. Haría una revisión editorial pequeña antes de grabarlo; no rediseñaría toda la arquitectura por los problemas de este borrador.

## Qué probamos

- La misma parada de La Malagueta, los mismos siete extractos y el mismo ejemplo de voz de Plaza Mayor.
- Mismos mensajes, razonamiento medio, política de privacidad y límite numérico de 5.000 tokens que los otros escritores.
- Única adaptación de transporte para Sol: `max_completion_tokens` en vez de `max_tokens`. No se redujo el límite ni se relajaron restricciones.
- Proveedor real: **Azure, a través de OpenRouter**. El modelo devuelto fue exactamente `openai/gpt-5.6-sol`; finalizó con `finish_reason: stop`.
- Auditor: **GPT-5.4**, razonamiento medio, máximo de 8.000 tokens. Mismo corpus y prompt de auditoría que las pruebas anteriores, verificados por igualdad exacta.
- Una llamada al escritor y una al auditor. Sin reparaciones. El HTTP 404 del run anterior es un intento adicional de la campaña, no parte de estas dos llamadas exitosas.
- No se midió TTS ni duración total del paseo. No se ejecutaron las siete paradas de Madrid.

El éxito con el campo corregido respalda la hipótesis de incompatibilidad del intento anterior, pero no identifica retroactivamente el mensaje exacto de aquel 404, que no se conservó.

## Resultado del auditor y revisión editorial

La respuesta del auditor cumplió su contrato estructural y señaló **dos objeciones**. Eso no equivale a dos errores históricos confirmados:

1. **Distribución espacial de las dependencias.** El texto dice que corrales, chiqueros y otras dependencias se distribuyen alrededor del ruedo. El extracto enumera esas instalaciones, pero no especifica su ubicación. Es una precisión innecesaria sin respaldo en este corpus; bastaría con describir las instalaciones sin situarlas. No justifica regenerar toda la narración.
2. **Europa y la Segunda Guerra Mundial.** Cuestiona «Europa se encontraba inmersa en la Segunda Guerra Mundial» por no estar documentada como afirmación sobre Europa entera. Mi lectura es que resulta excesivo: el texto no afirma que todos los países europeos participaran y el propio pasaje sitúa a refugiados huidos de Francia durante esa guerra. No lo trataría como un error histórico ni como motivo suficiente para bloquear el audio.

Mi revisión encuentra además aspectos que el auditor no resuelve:

- «No sabemos por estos datos…» introduce lenguaje de investigación dentro del guion. La limitación debe guiar lo que se omite, no convertirse necesariamente en una explicación al oyente.
- El párrafo «Conviene separar ambos episodios» vuelve a resumir lo que acaba de contar. Es la repetición más evidente.
- «La transformación más reciente» presupone una comprobación de actualidad que no hicimos. Se puede introducir directamente la restauración de 2017 sin ese superlativo.
- El comienzo acumula forma, dependencias, calendario y aforo antes de desarrollar la historia. Funciona como explicación, pero tiene menos impulso narrativo que el mejor tramo de DeepSeek.

A favor: separa 1939 de 1943, mantiene el sentido de detención, no atribuye dieciséis lados al ruedo, no inventa una relación causal entre protección patrimonial y restauración, y presenta el uso cultural anual como aspiración del proyecto, no como garantía actual.

Estas observaciones son una lectura editorial no ciega de una muestra conocida. **El original se conserva intacto abajo; no se aplicaron esas ediciones.**

## Comparación con las muestras anteriores

Todas estas filas corresponden a una sola parada, no a un tour completo.

| Escritor | Palabras | Escritura | Coste escritor | Coste con auditor |
| --- | ---: | ---: | ---: | ---: |
| Sol medium | 569 | 16,3 s | $0,05621 | $0,15775 |
| DeepSeek V4 Pro 0813 | 574 | 29,0 s | $0,00878 | $0,10851 |
| GLM 5.3 | 618 | 37,9 s | $0,00784 | $0,09042 |
| Kimi K3 | 608 | 83,3 s | $0,02838 | $0,14051 |

Sol fue el más rápido escribiendo en estas muestras. No es un benchmark repetido de latencia: cambian proveedores, tokenizadores y consumo real de razonamiento. DeepSeek sigue pareciéndome más narrativo; Sol conserva mejor algunas distinciones importantes. El coste no es una razón fuerte para descartar a Sol en contenido que se publicará una vez y se reutilizará.

La igualdad de contexto de auditoría mantiene también su limitación conocida: no recibe la posición canónica final de la parada, aunque el escritor sí. No se corrigió ese contrato durante la comparación ni se usó el número de flags como clasificación definitiva de calidad.

## Gasto real y presupuesto

La autorización nueva fue de **2 USD**. Para limitar esta prueba a ese importe adicional, se conservó el gasto histórico contabilizado de 9,241560152 USD y se fijó el nuevo techo en 11,241560152 USD. No se aprovechó adicionalmente el remanente anterior de 0,229989198 USD.

- Sol: 3.465 tokens de entrada; 1.152 de salida, incluidos 352 de razonamiento.
- Coste reportado de escritura: **0,0562125 USD**.
- Auditor: 4.470 tokens de entrada; 6.024 de salida, incluidos 3.474 de razonamiento.
- Coste reportado de auditoría: **0,101535 USD**.
- Total de esta prueba: **0,1577475 USD**.
- Saldo de los 2 USD nuevos: **1,8422525 USD**.
- Exposición no confirmada nueva: cero. Reservas abiertas: cero.

El gasto desconocido del 404 previo permanece conservadoramente en el histórico; este éxito no demuestra que aquel fallo fuese gratuito. El coste real de Sol incluye el componente de escritura de caché que reportó Azure. No debe sustituirse por una cuenta hecha con la tarifa promocional estándar de otro proveedor.

Como extrapolación únicamente, siete paradas con un consumo idéntico a esta costarían unos **$0,39 de escritura o $1,10 incluyendo siete auditorías**. No se ha medido esa cifra en Madrid ni corresponde a generar las siete narraciones en una única petición. Excluye investigación, TTS, reparaciones e infraestructura.

## Recomendación

Mantendría Sol como candidato experimental y leería este guion con el usuario antes de gastar el saldo en más modelos. Aquí ya tenemos una primera versión completa que requiere edición localizada, no una cadena de decenas de llamadas. Lo pendiente es decidir si esta voz resulta suficientemente atractiva y comprobar luego el enfoque en un tour completo y en otra ciudad.

No cambié perfiles de producción, RAG, infraestructura ni el texto original. En este turno se ejecutó el piloto previamente corregido; no se añadieron nuevos cambios de implementación. Se comprobaron identidad del modelo, respuesta completa, igualdad de entrada y corpus del auditor, límite numérico, dos llamadas, coste reportado y ausencia de reservas abiertas. Los 22 tests del ajuste habían pasado en el turno anterior; no se repitieron sin cambios de código.

## Evidencia

- [Narración original](../../backend/tmp/narrative-plain-writer-pilot-v8/malagueta-author-sol-medium-20260906-2/narration.md).
- [Entrada exacta](../../backend/tmp/narrative-plain-writer-pilot-v8/malagueta-author-sol-medium-20260906-2/inputs.private.json).
- [Respuesta del escritor y uso](../../backend/tmp/narrative-plain-writer-pilot-v8/malagueta-author-sol-medium-20260906-2/writer-response.private.json).
- [Auditoría](../../backend/tmp/narrative-plain-writer-pilot-v8/malagueta-author-sol-medium-20260906-2/audit.private.json).
- [Resultados y presupuesto](../../backend/tmp/narrative-plain-writer-pilot-v8/malagueta-author-sol-medium-20260906-2/results.private.json).
- [Diagnóstico del 404 anterior](narrative-author-sol-result-20260906.md).
- [Otros tres escritores y sus textos originales](narrative-author-context-results-20260906.md).

## Narración original de Sol — sin editar

Fíjate en la fachada de ladrillo. No es solo un acabado que envejece bien: una restauración reciente recuperó ese material original y también los elementos decorativos exteriores. Esa intervención nos plantea una buena pregunta para entender La Malagueta: ¿cómo puede cambiar tanto la vida de un recinto mientras su arquitectura sigue permitiéndonos reconocerlo?

La forma ya da una pista de que estamos ante un edificio pensado con precisión. La plaza es de estilo clasicista y su perímetro forma un hexadecágono, es decir, una figura de dieciséis lados. En el interior, el ruedo mide 52 metros de diámetro. A su alrededor se distribuyen dependencias propias de la actividad taurina: corrales, diez chiqueros, caballerizas, enfermería y sala de toreros, entre otras.

La Malagueta es un recinto taurino de temporada. Ha acogido festejos ligados a momentos concretos del calendario malagueño: la Semana Santa, la festividad de los patronos San Ciriaco y Santa Paula, la Feria de Agosto o la celebración de la patrona de la ciudad. Entre ellos está la llamada Corrida Picassiana. Tras una reforma realizada en 2010, el aforo quedó establecido en 9.032 espectadores.

Pero la función para la que se organizó este edificio no explica toda su historia. Hubo momentos en que el recinto dejó de estar asociado al espectáculo y pasó a formar parte de episodios mucho más duros.

El primero ocurrió en 1939, durante los últimos meses de la Guerra Civil. El campo de concentración de prisioneros de Málaga, instalado en la fábrica y cuartel de La Aurora, estaba saturado. Ante esa situación, los militares sublevados utilizaron también la plaza de toros con ese fin. La Malagueta se convirtió así en un espacio de reclusión. No sabemos por estos datos en qué zonas concretas del edificio permanecieron los prisioneros, pero sí que fueron retenidos dentro del recinto.

Cuatro años después, en 1943, la plaza volvió a albergar detenidos. El contexto era ya otro: Europa se encontraba inmersa en la Segunda Guerra Mundial. En esta ocasión fueron refugiados extranjeros que habían huido de Francia. Habían escapado de un país en guerra, pero su estancia aquí tampoco fue un alojamiento voluntario: llegaron como detenidos.

Conviene separar ambos episodios. En 1939, la plaza se utilizó debido a la saturación de un campo de concentración durante la Guerra Civil española. En 1943, acogió bajo detención a extranjeros huidos de Francia durante otro conflicto. Son circunstancias diferentes, unidas por una misma transformación del edificio: un lugar concebido para reunir espectadores pasó a servir para recluir personas.

Décadas después llegó el reconocimiento patrimonial. En 1976, coincidiendo con el centenario de su inauguración, La Malagueta fue declarada conjunto histórico-artístico. En 1981 recibió la consideración de bien de interés cultural.

La transformación más reciente comenzó con una restauración iniciada en 2017. Las obras se demoraron dos años y el recinto abrió al público en 2019. Además de recuperar el ladrillo original de la fachada, la intervención reorganizó espacios para albergar áreas expositivas y salas de congresos, dentro de un proyecto que aspiraba a dar al conjunto un uso cultural durante todo el año.

Vuelve ahora a ese ladrillo del principio. Ya no señala únicamente la antigüedad de una plaza de toros. Es la envoltura recuperada de un edificio que ha reunido públicos, ha encerrado detenidos y ha sido reorganizado para incorporar nuevos espacios culturales. Ahí está la clave de La Malagueta: una forma reconocible, de dieciséis lados, capaz de contener historias y usos radicalmente distintos.

