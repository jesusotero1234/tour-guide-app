# Ampliación a Francia, Alemania e Italia

Fecha: 20 de septiembre de 2026.

Segunda recuperación, después de comprobar cinco tours completos: Múnich tenía
una objeción factual pendiente en Marienplatz. La fuente alemana habla de una
«afrenta» (`Affront`), mientras el texto decía «un desafío para muchos ciudadanos».
Se aplicó la corrección literal «una afrenta para los ciudadanos», ligada mediante
huellas al texto, las fuentes y la revisión previa. Una nueva revisión de la parada
completa, con contexto de la ruta, pasó; las otras siete piezas y sus revisiones
se conservaron. El guion español final quedó suficiente dentro del alcance de la
revisión. No se alteraron las respuestas originales ni se omitió el control factual.
Las 18 pruebas de recuperación editorial, incluidas cuatro de esta corrección,
pasaron.

En Marsella, los proveedores habían agotado los cuatro intentos con 504 y tiempos
de espera. La misma consulta de plazas y mercados respondió después en 3,6 segundos
y se verificaron los cinco grupos de mapas, que quedaron guardados. La adquisición
completa produjo 231 candidatos únicos en 52,5 segundos. La consulta suplementaria
a Wikidata agotó sus 20 segundos y mantuvo su comportamiento opcional preexistente;
los cinco grupos de Overpass sí se completaron. No se cambió la consulta ni se
eliminaron grupos para sortear el fallo. Se reanudó la cola con esas capturas y
Múnich pasó a audio. `recovery-history/20260920-munich-marseille/` conserva los
estados previos y los datos del reinicio; el estado vivo sigue en `queue-status.json`.

Reanudado a las 15:17 UTC desde la última fase válida de cada ciudad. El proceso
466509 ejecuta el coordinador nuevo. Roma completó el guion español y su revisión;
Niza retomó su petición interrumpida y la revisión por pieza; Múnich recuperó su
redacción LOW pendiente. Milán reutilizó tres grupos de candidatos guardados y
avanzó a la comprobación de identidades. Berlín validó seis de ocho capítulos y
completó los dos restantes sin sobrescribir los anteriores. Su audio completo
de 29:31 está disponible por HTTP; la cola pasó automáticamente al audio de Roma.
`queue-status.json` contiene el estado vivo; no se espera a que termine el lote
para cerrar esta intervención.

Actualización tras la pausa solicitada a las 14:59 UTC: la auditoría encontró dos
fallos activos distintos (revisión de Roma y adquisición de mapas en Marsella),
interrupciones voluntarias y estados posteriores bloqueados que se mostraban
incorrectamente como incidencias propias. París tiene audio completo. Berlín
conserva seis de ocho capítulos verificados, con 20 minutos y 23 segundos de audio.
Niza y Múnich conservan sus rutas, fuentes y las etapas de texto terminadas.

Se corrigió la recuperación en tres puntos:

- Overpass realiza como máximo cuatro intentos entre dos proveedores públicos,
  con esperas de al menos 30 segundos y respeto a `Retry-After`. Los errores
  permanentes no se reintentan. Si ambos servicios siguen fallando, la cola pausa
  nuevas preparaciones; no recorre las treinta ciudades repitiendo el fallo.
- Las citas con omisiones explícitas pueden ampliarse al fragmento literal de
  una única fuente cuando sus partes coinciden sin ambigüedad y en el mismo orden.
  Se audita el cambio y se conserva la respuesta original. La revisión guardada
  de Roma supera así el validador estricto sin volver a pedir esa revisión.
  Una petición interrumpida admite una sola recuperación persistida y ligada a
  sus entradas; no se repiten los pasos de redacción ya válidos.
- El audio admite reanudación explícita: comprueba guion, fuentes, voz, modelo,
  procedencia, texto y archivo decodificado antes de reutilizar un capítulo.
  Los archivos incompletos se conservan en un historial. La preparación de la
  reanudación no sobrescribe el avance guardado.

El coordinador mantenido es `backend/scripts/admin/deepseek-europe-supervise.py`;
el archivo `supervise.py` del lote lo invoca. La página muestra la primera fase
real pendiente y distingue pausas, dependencias y errores. Los intentos anteriores
y el estado detenido están en `recovery-history/20260920-incidents/`. Milán,
Marsella y Hamburgo retoman adquisición en un directorio nuevo, reutilizando
cachés; sus intentos interrumpidos no tenían checkpoint ni gasto o reserva.

Validación de las correcciones: 30 pruebas de Overpass y caché, 14 de recuperación
editorial, 12 del coordinador, ocho de preparación/reanudación de audio y dos de
procedencia, además de las comprobaciones TypeScript del backend y del generador. La comprobación real de Berlín
validó seis capítulos sin cambiar ninguno de los 19 archivos protegidos. La suite
completa de preparación de audio tiene una discrepancia previa en una expectativa
del preset francés; el lote actual usa la voz española.

Actualización de las 14:51 UTC: se aplicó el
[plan de recuperación de rutas](plan-reseleccion-rutas-historicas-20260920.md)
y se reanudó la cola. Las incidencias tenían causas distintas: exceso de ruta en
Roma, respuestas de revisión incompletas en París y Berlín, errores 429/504 de
Overpass en Niza y evidencia insuficiente en una parada de Múnich. París completó
el guion reutilizando las respuestas y está generando audio; Berlín terminó la
revisión y espera audio. Roma encontró ocho paradas y 125 minutos sin excluir
requisitos, terminó las fuentes y está redactando. Niza reintenta la preparación
y Múnich espera para reanudar investigación conservando las paradas verificables.
`resume-scoped-policy-20260920.json` conserva el estado previo al reinicio.

Estado actualizado: el responsable pidió **continuar con los históricos generales
largos del flujo habitual de España** y dejar la generación trabajando sin esperar
a que termine. Él escribirá para revisar los resultados. Se conserva la selección
de treinta ciudades y la primera versión en español.

El lote activo está en `backend/tmp/pilot-batch-europe-20260920/`. Cada ciudad pasa
por la preparación V8 de identidad, paradas, fuentes y recorrido; redacción del tour
completo y revisión editorial; y audio local con la voz española habitual. El
objetivo es **120 minutos entre paseo y escucha**, conservando la duración estimada
real y el ajuste de cada ruta. No son 120 minutos de audio ni textos breves con un
número fijo de palabras por parada. Palermo también se genera de nuevo.

La cola local `supervise.py` encadena una preparación, hasta dos redacciones y un
render de audio a la vez. Los procesos quedan separados de esta conversación y
guardan estados y registros en el lote. Una incidencia queda registrada y permite
continuar con las demás ciudades; no se marca un tour disponible hasta terminar
su audio y comprobar los archivos. Los guiones conservan su revisión automática
y quedan pendientes de revisión del usuario. No hay publicación ni seguimiento
automático programado. La página de escucha sigue en `http://localhost:3188/`.

Se comprobaron las treinta identidades y países, la preparación de la cola, el
contrato del escritor existente y los servicios de búsqueda, extracción HTML y
PDF. `launch.json` guarda los procesos; `queue-status.json`, `text-status.json` y
`audio-status.json` muestran el progreso real.

En el arranque, Wikidata respondió `maxlag` por retraso de sus réplicas. Las
primeras preparaciones terminaron antes de gastar; sus registros se conservaron
en los directorios originales y en `startup-source-delay.json`. La primera
corrección añadió una espera de hasta doce horas; se retiró después de diagnosticar
el problema y recibir la autorización para detener y reiniciar el proceso.

La comparación en vivo confirmó que `wbgetentities` con `maxlag=30` devolvía
`wikibase-queryservice`, mientras que la misma entidad sin ese parámetro y el
acceso oficial `Special:EntityData/Q90.json` devolvían la revisión 2547890591.
El lote usa ahora `NARRATIVE_WIKIDATA_READ_MODE=entity-data` para leer los QID
conocidos mediante la [interfaz oficial de datos enlazados](https://www.wikidata.org/wiki/Wikidata:Data_access#Linked_Data_Interface).
Las capturas se guardan durante 24 horas en `wikidata-entity-cache/`, con URL,
fecha, revisión y hash; las entidades fusionadas requieren equivalencia explícita
en el RDF de Wikidata. Se conservan la separación entre consultas, los reintentos
limitados y `Retry-After`. El flujo habitual de la aplicación sigue usando su
transporte anterior salvo que se seleccione este modo explícitamente.

El reinicio superó la espera de París y entró en preparación de ruta. Se pasaron
52 pruebas de lectura, caché, identidad, candidatos y reintentos, además de dos
lecturas reales (París y una identidad fusionada). Los subprocesos de preparación
ahora copian su avance a `prepare-runner.log`, para que el comando de seguimiento
del usuario muestre también las fichas verificadas. Todavía no hay audios nuevos
terminados; el estado actual siempre lo indican los archivos de la cola.

## Reducción de consultas previas a la selección

Tras la observación del usuario sobre el tiempo empleado, se reprodujo la
selección de París usando únicamente las capturas locales y los mismos criterios.
Las 291 identidades y 479 referencias suponían 767 fichas distintas. Manteniendo
todos los tipos necesarios para seleccionar y aplazando los otros detalles hasta
la preselección de 60 lugares, hacen falta 558 fichas distintas: 209 menos (27,2 %).
Las referencias secundarias pasan de 479 a 268. La medición y el cálculo están en
`lookup-efficiency.json`; `measure-lookups.cjs` los reproduce sin acceso externo.

La captura original abarcó unos 20 minutos. El ahorro estimado para una consulta
sin datos guardados es de 5–6 minutos en esa fase, no en el audio ni en toda la
producción; falta medir una ejecución completa con el cambio. Se conservan todos
los valores de P31 antes de ordenar y excluir candidatos. Para el resto de
propiedades se resuelve únicamente el primer valor, que es el que consume el
flujo existente, y únicamente para los lugares preseleccionados. Las etiquetas
ya consultadas se reutilizan entre ambos pasos. No se pospone la identidad ni la
comprobación de tipos hasta después de decidir la ruta. Las 53 pruebas pasaron.
La mejora se aplica a las preparaciones que arranquen después del cambio; Berlín
ya estaba en marcha y conserva la ejecución anterior.

París terminó la adquisición pero quedó pendiente de ajustar la ruta: la
estimación resultó de 194 minutos para un objetivo de 120. El punto de recuperación
con los candidatos queda guardado en el intento `paris-sources-ready-1`; volver a
seleccionar no requiere repetir las descargas. La cola continuó con Berlín.

## Ajuste aprobado de París

El usuario aprobó un recorrido compacto por Notre-Dame, Sainte-Chapelle,
Conciergerie, Tour Saint-Jacques, Palais du Louvre, Arc de triomphe du Carrousel
e Invalides, en ese orden. La medición peatonal da 3.850 segundos de desplazamiento
y una estimación total de 114 minutos, frente a los 194 anteriores: el primer
recorrido excedía en 74 minutos el objetivo de 120. Se excluye Père-Lachaise de
este paseo; el tramo anterior desde Invalides hasta ese cementerio sumaba unos
100 minutos a pie.

La auditoría inicial eligió cinco lugares obligatorios por su importancia
histórica. Recibe la duración solicitada, pero no coordenadas ni tiempos entre
paradas. El planificador posterior conserva todos los obligatorios y solo puede
quitar o sustituir opcionales. La comprobación de desplazamientos sí detectó el
exceso y bloqueó la preparación; falta un mecanismo general que revise el ámbito
y los obligatorios cuando ese conjunto resulta inviable. Este ajuste aplica la
decisión explícita del usuario para París; no modifica ese comportamiento general.

`paris/route-approval.json` conserva la aprobación, las identidades y las huellas
del punto de recuperación original y del nuevo. El nuevo checkpoint parte de los
candidatos guardados, incorpora las siete paradas aprobadas y permite reanudar
directamente desde investigación, sin repetir la adquisición. La asignación de
narración es de 35 minutos, cinco por parada, dentro de la estimación de paseo y
escucha. La duración final del audio dependerá del guion y de su locución.

La cola se reinició para aplicar ese checkpoint. El intento interrumpido de Roma
tenía gasto y reserva de cero; conserva sus archivos y reutiliza la caché en un
directorio nuevo. `restart-approved-paris-20260920.json` conserva los estados
anteriores. Berlín ya tenía la preparación completa, pero su revisión editorial
falló con una respuesta incompleta y queda registrada para revisión.

## Historial del lote breve detenido

Se preparó el lote en `backend/tmp/europa-historicos-20260920/`, con fuentes para
las treinta ciudades y 179 paradas. Se reutilizó el histórico de Palermo de Sicilia.
Las primeras solicitudes nuevas de redacción produjeron varios textos demasiado
largos; se conservaron respuestas, revisiones y costes, y se detuvo la ejecución
para corregir el encargo. Todavía no se han generado los audios nuevos.

La página local de escucha es `http://localhost:3188/`. En Palermo, el reproductor
principal contiene el tour completo de 7:03; la introducción aislada dura 25,53
segundos y las cinco paradas duran entre 54,14 y 93,19 segundos. Se comprobaron los
archivos y se aclararon las etiquetas de tour completo y capítulos con su duración
real. El formato breve reutilizado se conserva como historial y no forma parte
del lote activo de históricos generales largos.

Se mantiene el borrador de selección y método a continuación como historial;
las decisiones inicialmente abiertas quedaron resueltas por el encargo posterior.

## Encargo y decisiones abiertas

El encargo es ampliar los tours a las diez ciudades más visitadas de Francia,
Alemania e Italia. Se interpreta como diez por país: treinta ciudades.

Se han planteado dos decisiones que cambian el contenido del lote:

- Un tour histórico general por ciudad, uno temático de historias o ambos. Ambos
  significaría sesenta recorridos antes de contar traducciones.
- Selección de ciudades turísticas con patrimonio para pasear o clasificación
  estricta por pernoctaciones, que incluye destinos principalmente vacacionales.

Primera versión en español como supuesto de trabajo, pendiente de la respuesta.
Las cinco lenguas de los tours generales anteriores no se convierten
automáticamente en un encargo de 150 versiones nuevas.

## Propuesta de ciudades para el catálogo

La tabla es una propuesta editorial orientada a turismo urbano. El orden indica
prioridad de preparación, **no una clasificación estadística conjunta**. Las zonas
son puntos de partida para seleccionar paradas; todavía no son rutas calculadas.

| Prioridad | Francia | Zona inicial para estudiar | Alemania | Zona inicial para estudiar | Italia | Zona inicial para estudiar |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | París | Île de la Cité y ribera del Sena | Berlín | Mitte y Unter den Linden | Roma | Centro monumental; delimitar un paseo compacto |
| 2 | Niza | Vieux Nice y entorno del puerto | Múnich | Altstadt y Residenz | Milán | Duomo, centro histórico y Castello |
| 3 | Marsella | Vieux-Port y Le Panier | Hamburgo | Altstadt y Speicherstadt | Venecia | San Marco y Rialto |
| 4 | Lyon | Vieux Lyon y Presqu'île | Fráncfort del Meno | Römerberg y ribera del Meno | Florencia | Duomo, Signoria y ribera del Arno |
| 5 | Burdeos | Centro histórico y frente del Garona | Colonia | Catedral, casco antiguo y Rin | Nápoles | Centro histórico; escoger un eje caminable |
| 6 | Toulouse | Capitole y centro histórico | Düsseldorf | Altstadt y ribera del Rin | Bolonia | Piazza Maggiore y barrio universitario |
| 7 | Estrasburgo | Grande Île y Petite France | Stuttgart | Schlossplatz y centro | Turín | Piazza Castello y centro histórico |
| 8 | Lille | Grand-Place y Vieux-Lille | Dresde | Altstadt y ribera del Elba | Verona | Arena y centro histórico |
| 9 | Nantes | Castillo y centro histórico | Núremberg | Altstadt y entorno del castillo | Palermo | Reutilizar la colección de Sicilia si encaja |
| 10 | Montpellier | Écusson y plazas del centro | Leipzig | Markt y centro histórico | Pisa | Centro histórico y Piazza dei Miracoli |

## Qué respaldan los datos consultados

### Alemania

La propuesta coincide con las diez grandes ciudades del informe del
[Deutscher Tourismusverband, edición 2025, página 8](https://www.deutschertourismusverband.de/fileadmin/user_upload/Footer/Presse/Zahlen-Daten-Fakten_2025.pdf),
con datos de 2024. Por pernoctaciones: Berlín, Múnich, Hamburgo, Fráncfort del Meno,
Colonia, Düsseldorf, Stuttgart, Dresde, Núremberg y Leipzig. El universo son
alojamientos con al menos diez camas o parcelas; incluye viajes de negocios.
No es un recuento de visitantes únicos ni se presenta como ranking de 2026.

### Italia

El [informe de ISTAT sobre 2024, página 6](https://www.istat.it/wp-content/uploads/2026/03/Statistica-Today_Turismo-2024.pdf)
ordena los municipios por pernoctaciones en establecimientos de alojamiento. Sus
primeros diez son Roma, Milán, Venecia, Florencia, Rímini, Cavallino-Treporti,
San Michele al Tagliamento, Jesolo, Caorle y Bolonia. Nápoles figura en el puesto
12; Palermo y Pisa, en el 28 y 29.

La propuesta para el catálogo conserva cinco de esos diez municipios y propone
Nápoles, Turín, Verona, Palermo y Pisa en lugar de los cinco destinos vacacionales.
Esta sustitución es editorial y está pendiente de decisión: **no permite llamar
a la propuesta «las diez ciudades más visitadas de Italia»** bajo ese indicador.

### Francia

No se ha verificado una clasificación pública completa que permita presentar la
propuesta como las diez ciudades más visitadas con un criterio único.
[INSEE publica datos de 2024 por ciudades sobre reservas en plataformas](https://www.insee.fr/fr/statistiques/8673310),
que respaldan el interés de varios destinos propuestos, pero excluyen hoteles y
campings. En esa tabla, Toulon y Annecy superan a Nantes y Montpellier.
Su ámbito territorial también debe comprobarse antes de convertirlo en un ranking
de municipios.

[Atout France describe su observatorio urbano City Trends](https://www.atout-france.fr/fr/territoires-et-filieres-touristiques/pole-tourisme-urbain)
y el uso de indicadores normalizados entre destinos. No se han mezclado sus cifras
metropolitanas con recuentos municipales para fabricar una clasificación.

Si se elige el criterio estadístico estricto, hay que cerrar primero un indicador
reproducible para Francia y sustituir la propuesta italiana por la lista de ISTAT.

## Producción que se puede reutilizar

Los once tours generales españoles se seleccionaron por población, según
`backend/tmp/pilot-batch-spain-20260912/manifest.json`, y se produjeron en cinco
idiomas. Ese criterio no debe trasladarse a este encargo turístico.

El flujo existente prepara identidad de ciudad, paradas, fuentes, recorrido y
dossier; redacta con DeepSeek, revisa, traduce y genera audio con la voz de cada
idioma. Los ejecutores de preparación y entrega están fijados al lote español;
requieren admitir otro manifiesto antes de ejecutarlos para este lote. No conviene
ejecutarlos sin ese cambio porque volverían a apuntar a España.

Para la variante temática existen el método supervisado de
[la colección temática](produccion-tours-tematicos-20260917.md) y la colección
`backend/tmp/sicilia-20260919/`. Esta última contiene material general y temático de
Palermo que debe revisarse antes de reutilizarlo.

Una vez resueltas las decisiones, el primer recorrido de París, Berlín y Roma
permite comprobar las fuentes en francés, alemán e italiano y ajustar el proceso
antes de extenderlo a las treinta ciudades. Cada entrega debe conservar guion,
fuentes, coordenadas, recorrido, fotografías acreditadas cuando estén disponibles,
audio y estado real de revisión. La duración se calcula para la ruta elegida.

## Próximos pasos

- [x] Revisar cómo se produjeron las colecciones existentes.
- [x] Contrastar indicadores turísticos y documentar sus diferencias.
- [x] Preparar una propuesta concreta de diez ciudades por país.
- [x] Resolver criterio de ciudades y tipo de recorrido con el responsable.
- [x] Cerrar el manifiesto del lote y comprobar los servicios de generación.
- [ ] Preparar fuentes y rutas, redactar y revisar los guiones.
- [ ] Producir audio, fotografías disponibles y páginas para revisar los tours.

Los límites de gasto de las colecciones anteriores pertenecían a aquellos lotes;
no se presentan como presupuesto aprobado para esta ampliación.
