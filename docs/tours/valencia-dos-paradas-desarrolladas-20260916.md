# Dos nuevas versiones para escuchar: Colegio y Lonja

Fecha: 16 de septiembre de 2026. Estado: **dos paradas entregadas con fotos y audio; valoración del usuario pendiente**.

[Abrir la página de escucha y comparación](/home/jesusotero/coding/tour-guide-app/backend/tmp/deepseek-otras-paradas-20260916/index.html)

| Parada | Historia | Audio nuevo | Palabras | Redacción |
| --- | --- | --- | --- | --- |
| Colegio del Arte Mayor de la Seda | Qué regulaba el gremio, cómo inspeccionaba los tejidos y qué pidieron los sederos para conseguir el título de Colegio de artistas. | **2:05** | 324 | DeepSeek, con una corrección. |
| Lonja de la Seda | La expansión del negocio y la ruta por tierra a Cádiz para alcanzar mercados lejanos. | **1:45** | 273 | DeepSeek, primer intento. |

[Escuchar el Colegio](/home/jesusotero/coding/tour-guide-app/backend/tmp/deepseek-otras-paradas-20260916/audio/5fcdcdb9-e2d6-59ad-bdb5-063fa2feb7c8.mp3) · [Escuchar la Lonja](/home/jesusotero/coding/tour-guide-app/backend/tmp/deepseek-otras-paradas-20260916/audio/4d9fb342-4ab9-583d-bb43-8dc4461c7050.mp3)

La página muestra los textos completos y permite desplegar las versiones anteriores. Se conservan la misma voz y fotografías con sus créditos.

## Qué cambió

Tras valorar positivamente San Pío V, el usuario pidió otras paradas. La duración se fijó antes de generar como objetivo aproximado de minuto y medio a dos minutos: unos pocos segundos de diferencia no invalidan un relato desarrollado. El Colegio dura 124,9 segundos y la Lonja 104,9. Se informa la desviación del Colegio; no se cambió la velocidad ni se añadió silencio para modificar los tiempos.

En el Colegio se reutilizó la ficha enriquecida de la prueba anterior, que todavía no había generado esa parada. Se incorporó expresamente a la evidencia el reconocimiento de Arte de 1479 para evitar presentar el título de 1686 como el primer reconocimiento artístico de cualquier clase. El texto explica la regulación de las telas, las posibles consecuencias de incumplir las ordenanzas y los argumentos de la petición.

El primer borrador confundía la historia del edificio con la constitución del gremio y terminaba recapitulando el cambio. La corrección separó la institución, la aprobación de las ordenanzas y la compra de la casa, y retiró esa recapitulación. Conservó más extensión de la solicitada: sigue siendo la pieza más cronológica, con varias fechas completas y términos institucionales.

Para la Lonja se seleccionaron hechos ya capturados sobre el resurgimiento de la industria, nuevos mercados, trabajo directo e indirecto, huerta y transporte. Se distingue el edificio del siglo XV del auge comercial posterior. La ruta a Cádiz es terrestre y no se atribuye toda la producción a talleres dentro de la Lonja. Su última frase vuelve al nombre del edificio como cierre breve, sin repetir la ruta ni las cifras.

## Autoría, ejecución y comprobaciones

DeepSeek revisó guiones anteriores sobre una base asistida y con evidencia seleccionada por Codex. Codex preparó y revisó las fichas. **No hubo reescrituras humanas de los nuevos guiones**; los textos mostrados y enviados a voz coinciden con las respuestas seleccionadas. El registro de formato confirma que tampoco fue necesario sustituir saltos de línea escapados.

Hubo **3 solicitudes físicas**: dos para el Colegio y una para la Lonja. Se mantuvo `deepseek-flash`, temperatura cero y razonamiento adicional desactivado. Coste estimado registrado: **0.002347152 USD**, excluyendo preparación, revisión y voz. Se usaron las [tarifas oficiales comprobadas en esta sesión](https://api-docs.deepseek.com/quick_start/pricing/). No quedaron reservas abiertas ni hubo reintentos ocultos.

Los dos audios se generaron juntos con VoxCPM2; la síntesis y el relevo de GPU tardaron aproximadamente 68 segundos, y el servicio anterior quedó restaurado. Se verificaron fuentes y entradas fijadas, respuestas reales, identidad de voz, correspondencia entre texto y entrada al sintetizador, audio decodificable y con señal. Las dos fotografías cargaron y los cuatro reproductores —dos nuevos y dos anteriores— funcionaron en la comprobación del navegador. No hubo desbordamiento en móvil ni errores de ejecución.

Estas comprobaciones no sustituyen una escucha crítica humana. La valoración del usuario sobre estas dos versiones está pendiente; no se afirma fiabilidad general del método ni se incorporan automáticamente al catálogo.

Registros: [entradas y fuentes](/home/jesusotero/coding/tour-guide-app/backend/tmp/deepseek-otras-paradas-20260916/inputs.json), [evaluación](/home/jesusotero/coding/tour-guide-app/backend/tmp/deepseek-otras-paradas-20260916/evaluation.json), [revisión del Colegio](/home/jesusotero/coding/tour-guide-app/backend/tmp/deepseek-otras-paradas-20260916/colegio-repair.review.json), [revisión de la Lonja](/home/jesusotero/coding/tour-guide-app/backend/tmp/deepseek-otras-paradas-20260916/lonja-draft.review.json), [audio](/home/jesusotero/coding/tour-guide-app/backend/tmp/deepseek-otras-paradas-20260916/audio-check.json) y [navegador](/home/jesusotero/coding/tour-guide-app/backend/tmp/deepseek-otras-paradas-20260916/browser-check.json).

## Fuentes y créditos

Adaptación de textos de colaboradores de Wikipedia bajo [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), con selección y nueva redacción. Las fotografías conservan sus autores, licencias y enlaces originales en la página.

- [Colegio del Arte Mayor de la Seda, versión utilizada](https://es.wikipedia.org/wiki/Colegio_del_Arte_Mayor_de_la_Seda?oldid=174632164) · [Historial](https://es.wikipedia.org/wiki/Colegio_del_Arte_Mayor_de_la_Seda?action=history).
- [Industria sedera de Valencia, versión utilizada](https://es.wikipedia.org/wiki/Industria_sedera_de_Valencia?oldid=173589313) · [Historial](https://es.wikipedia.org/wiki/Industria_sedera_de_Valencia?action=history).
- [Lonja de la Seda, versión utilizada](https://es.wikipedia.org/wiki/Lonja_de_la_Seda?oldid=174667894) · [Historial](https://es.wikipedia.org/wiki/Lonja_de_la_Seda?action=history).

La ficha del Colegio también conserva el contraste factual anterior con la [historia y archivo del museo](https://www.museodelasedavalencia.com/museo/) y la [cronología de la institución](https://www.museodelasedavalencia.com/Colegio/); no se atribuye licencia abierta a su prosa.

La entrega es local. Las fotos necesitan conexión y la comparación reutiliza archivos de audio de la entrega anterior. Los tours existentes permanecen disponibles.
