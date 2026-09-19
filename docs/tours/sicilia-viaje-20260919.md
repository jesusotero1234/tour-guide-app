# Sicilia: paseos para el viaje del 23 al 30 de septiembre

Colección preparada en español, inglés, francés, alemán e italiano para el viaje de septiembre de 2026. Se combinan historia y episodios curiosos documentados. No se asigna destino a la noche del 26 al 27, que no figuraba en las reservas.

El usuario confirmó que disponen de coche y después precisó que los tours deben hacerse dentro de una misma zona. Se sustituyó la primera propuesta de circuitos por carretera por **siete paseos a pie**, con **32 paradas, 35 versiones y 230 capítulos de audio** contando introducciones y cierres. Desde Presa se llega en coche a Piedimonte o Linguaglossa; dentro de cada tour no hay traslados en coche. Son opciones para elegir, no una agenda obligatoria.

| Estancia | Tour | Paradas | Distancia a pie | Visita estimada |
| --- | --- | ---: | ---: | ---: |
| Palermo, 23–25 | Una capital entre culturas | 5 | 1,9 km | 45–65 min |
| Palermo, 23–25 | Una fuente viajera y otras vidas de la ciudad | 5 | 2,2 km | 50–70 min |
| Taormina, 25–26 | De la ciudad antigua a sus palacios | 5 | 2,2 km | 50–70 min |
| Taormina, 25–26 | Viajeros, jardines y edificios con otra vida | 5 | 1,5 km | 40–60 min |
| Base Presa / Etna, 27–29 | Piedimonte Etneo: un pueblo que hubo que construir | 4 | 1,1 km | 30–50 min |
| Base Presa / Etna, 27–29 | Linguaglossa: vivir de un volcán | 4 | 1,3 km | 35–55 min |
| Terrasini, 29–30 | Comerciantes, vigías y memoria junto al mar | 4 | 1,9 km | 40–60 min |

Las distancias unen la primera y última parada: no incluyen regreso al coche. Las duraciones suman marcha, escucha y pausas; no incluyen visitas interiores. Taormina tiene desniveles. Se usan calles y caminos de la red peatonal de OpenStreetMap mediante FOSSGIS/OSRM, sin afirmar una comprobación presencial ni accesibilidad universal. Los puntos sitúan edificios o plazas; se escucha desde el espacio público contiguo. No hay ascensiones al Etna ni acceso a fincas privadas.

## Entrega

[Página para elegir idioma y escuchar](/home/jesusotero/coding/tour-guide-app/backend/tmp/sicilia-20260919/index.html).

[Fuentes y créditos por parada](/home/jesusotero/coding/tour-guide-app/backend/tmp/sicilia-20260919/credits.md).

[Estado de la generación](/home/jesusotero/coding/tour-guide-app/backend/tmp/sicilia-20260919/status.json).

La página contiene los guiones, mapas, ubicaciones y 29 fotografías con créditos; tres paradas de los pueblos no disponen de fotografía específica y ofrecen el mapa. La foto de Casa Cuseni muestra el interior y está etiquetada como tal. Las fotografías son referencias del monumento, no imágenes tomadas desde el punto exacto de escucha. Cada versión tendrá capítulos individuales y MP3 continuo. Al completar cada idioma se prepara un ZIP con sus siete tours; al completar los cinco, un ZIP conjunto con la página de escucha. Fotos y mapas necesitan conexión; los MP3 descargados se pueden escuchar sin conexión. La página es un archivo local, no una web publicada para acceso desde cualquier móvil.

## Redacción y revisión

DeepSeek redactó los originales a partir de fichas de hechos, enfoques concretos y límites. Una segunda pasada buscó más desarrollo y una voz menos enciclopédica. Codex leyó las 46 piezas españolas, contrastó su contenido con las fichas y las fuentes consultadas e hizo correcciones puntuales: cronología de la catedral de Palermo, parentescos en Corvaja, atribuciones y causalidades no respaldadas, fechas innecesarias y notas internas que se habían filtrado a la narración. Es redacción de DeepSeek con edición de Codex, no una generación totalmente autónoma sin revisión.

Las cuatro traducciones conservan el español revisado. Se comprobaron cobertura, identidad del texto de origen, longitud y correspondencia de significado; la comparación automática de las 28 versiones traducidas no señaló divergencias materiales. Cinco respuestas tenían saltos de párrafo sin escapar en el JSON: se recuperó el texto original sin volver a generarlo. El validador de auditoría rechazó inicialmente la respuesta corta «OK» por una regla de longitud para narraciones; se recuperaron las respuestas guardadas y se comprobó su contenido. No se modificó la narración para resolver ese problema de formato.

Se mantiene una referencia temporal útil por historia cuando es posible; algunas piezas requieren dos épocas para explicar un cambio. La duración responde al material disponible, sin alargar los episodios débiles. Los guiones españoles suman unas 6.100 palabras, aproximadamente 45 minutos a 135 palabras/minuto, antes de medir las voces finales.

Los interiores son opcionales; no se promete verlos desde la calle ni se incluyen horarios y precios en las narraciones. Las fuentes institucionales se utilizan para contrastar hechos. Las adaptaciones de artículos de Wikipedia llevan atribución e historial y se entregan bajo CC BY-SA 4.0; cada fotografía conserva su propia licencia. Las fuentes y las discrepancias se guardan junto al dossier. No se realizó revisión por un historiador local ni visita presencial.

## Audio y comprobaciones

Se usan los cinco presets existentes de VoxCPM2, cada uno con las huellas de su referencia y configuración. Versión del modelo fijada: `bffb3df5a29440629464e5e839f4d214c8714c3d`. Los 230 textos y las 35 entradas de voz están congelados y validados. Se comprobó la normalización de números, párrafos y estilos de voz, incluido el modo francés, y se contrastó el contrato con un audio anterior terminado. La página se probó en las 35 combinaciones de tour e idioma, sin errores de JavaScript ni desbordamiento móvil. Las fotos cargaron en la comprobación visual; la foto añadida del Rosario también se comprobó por separado.

La cola procesa primero los siete tours españoles y luego inglés, francés, alemán e italiano. Cada versión se valida al terminar: identidad, texto entregado al motor, archivos decodificables, señal no vacía, procedencia y compilación con dos segundos entre capítulos. Estas comprobaciones no equivalen a una escucha humana ni a una transcripción automática del sonido. Ante un trabajo parcial se conserva lo generado y se requiere inspección antes de reanudarlo.

Estimación inicial, basada en la tanda anterior y el volumen de texto: **20–35 minutos para español y alrededor de 2–3 horas para los cinco idiomas**. Depende de la velocidad efectiva de cada voz y del equipo. El usuario pidió dejar la generación funcionando en segundo plano y no esperar al final. El ordenador y WSL deben permanecer encendidos.

No se publicaron estos tours en producción ni se modificaron los tours actuales de la aplicación. Todos los archivos están en `backend/tmp/sicilia-20260919/`. El presupuesto preventivo de DeepSeek se mantuvo en 3 USD; los costes y las respuestas se guardan en la carpeta. Estado de audio: cola iniciada en segundo plano el 19 de septiembre de 2026 a las 13:45, hora de Madrid. Primer tour: Palermo, una capital entre culturas, en español. No se esperó a la finalización. El archivo de estado enlazado contiene el avance y cualquier incidencia.

## Resultado final

La generación terminó el 19 de septiembre de 2026 a las 14:35, hora de Madrid, tras unos 50 minutos de ejecución. Completados los 35 tours y los 230 capítulos, sin errores de generación o ensamblado. Están disponibles los cinco ZIP por idioma y el ZIP conjunto. Se verificó la integridad de los seis archivos; la página incluida en el ZIP conjunto contiene enlaces a los audios incluidos, sin ofrecer los ZIP separados. Los siete tours españoles suman 41,9 minutos de audio. No se ha realizado escucha humana de la tanda.
