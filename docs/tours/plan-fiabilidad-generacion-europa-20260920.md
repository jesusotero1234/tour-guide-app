# Plan de fiabilidad de la generación europea

Fecha: 20 de septiembre de 2026. Estado: siete tours terminados. Por instrucción posterior del usuario, el lote pasa a preparar todas las ciudades en paralelo y generar los audios al final, con los límites descritos abajo.

## Cambio solicitado: ciudades en paralelo y audio al final

El usuario pidió «Hazlas todas en paralelo» y aclaró que los audios deben
generarse juntos al final. Este cambio sustituye la condición de esperar a los
tres pilotos completos antes de abrir las demás ciudades; no declara superados
los pilotos pendientes. El nuevo modo explícito es `--all-texts-first`.

- Todas las ciudades quedan habilitadas, con hasta dos preparaciones y cuatro
  guiones simultáneos. Los siete tours completos se reutilizan sin regenerarlos.
- El audio nuevo empieza cuando todas las preparaciones y revisiones del lote
  hayan terminado o quedado con una incidencia terminal. Una ciudad todavía
  trabajando o esperando un reintento mantiene cerrada esta fase. Solo los
  guiones con revisión y recibos válidos entran al lote de audio, de uno en uno
  en la GPU; cada ciudad conserva su archivo completo con todos sus capítulos.
- Un timeout o 504 de una consulta queda aislado a esa ciudad. Una respuesta
  explícita de saturación (429/503) conserva la espera compartida, y durante la
  comprobación de recuperación solo se permite arrancar la consulta de prueba.
  Las ventanas agotadas y los límites de gasto no se reinician.
- Se mantienen la evidencia histórica, las comprobaciones de duración, las
  objeciones editoriales, los recibos y las comprobaciones de procedencia del audio.
- Pasaron las 57 pruebas de administración, incluidas seis nuevas sobre el modo
  solicitado, concurrencia real, espera del último guion, reanudación, aislamiento
  de un timeout y respeto a las restricciones del proveedor. No hubo llamadas
  facturables en esas pruebas. Una prueba detectó que al abrir un reintento podía
  salir también otra ciudad: se corrigió antes de reanudar el lote real.

La decisión y los límites actuales se guardan en `rollout.json` y en
`queue-status.json.executionPolicy`. Las secciones siguientes conservan el plan
original y la evidencia obtenida antes de esta instrucción del usuario.

## Objetivo y situación comprobada

Completar los treinta históricos generales en español conservando la evidencia,
la revisión editorial y la procedencia del audio. La recuperación debe poder
funcionar durante ausencias del usuario, con límites claros y sin transformar
un fallo en un éxito aparente.

A las 17:24 UTC hay seis tours con audio completo —París, Berlín, Roma, Niza,
Múnich y Milán—, Marsella bloqueada en el profesor editorial, Hamburgo bloqueada
en mapas y veintidós ciudades en cola. El supervisor salió a las 16:32 UTC.
`retryNotBefore` venció, pero no existe un proceso que despierte al vencerlo.
Los seis tours tienen revisión automática; eso no equivale a aprobación humana.

La auditoría de este plan fue de lectura: no se lanzaron consultas a proveedores,
llamadas a modelos, nuevas generaciones ni reinicios. Los originales se conservan.

## Por qué parece que antes funcionaba y ahora no

España terminó, pero ese resultado final incluyó recuperación y supervisión.
El lote español conserva once ciudades con sus cinco idiomas completos, cuatro
correcciones manuales de traducción y tres respuestas MAX truncadas. Su plan
registra además ajustes de arco, coordenadas, alcance y recuperación de mapas.
Palma agotó cuatro respuestas 504 antes de recuperarse; Barcelona tuvo 504 y 429.
Otros casos reutilizaron mapas guardados. No tenemos evidencia de que antes el
mismo proceso completara todo sin intervención.

Europa introduce treinta ciudades, muchas sin caché previa, y combina ese flujo
con un coordinador nuevo pensado para dejarse trabajando. Esto aumenta la
exposición a fallos, pero no demuestra por sí solo por qué falló una consulta.
El idioma de investigación no cambia los filtros de Overpass. El Markdown en las
fuentes también aparece en España; no es un problema exclusivo del francés.

El error de enfoque fue resolver casos concretos y reabrir el lote sin demostrar
la recuperación completa frente a las distintas clases de fallo. Las pruebas
unitarias que pasaron eran útiles, pero no probaban esa fiabilidad operativa.

| Hallazgo confirmado | Qué significa | Qué no permite afirmar |
| --- | --- | --- |
| Hamburgo agotó cuatro esperas de 70 segundos, alternando dos proveedores. | La consulta no respondió dentro del plazo. | Que ambos proveedores estuvieran caídos, que el problema sea el idioma o que haya que reducir el área. |
| Marsella recibió una respuesta completa del profesor, pero una cita no coincide con el Markdown de la fuente. | Hay un defecto de representación de citas. | Que el guion esté históricamente aprobado al arreglar la cita. |
| El profesor señaló una discrepancia sobre la ubicación del observatorio de Longchamp. | La observación debe llegar al editor y a la revisión posterior. | Que se pueda borrar la observación por ser incómoda. |
| La cola sale tras el bloqueo de mapas. | La hora guardada es una condición para un reinicio manual, no un reintento programado. | Que el ordenador encendido implique generación en marcha. |
| Un reinicio reutiliza un directorio de preparación incompleto. | Falta crear el siguiente intento o seleccionar un checkpoint válido. | Que ejecutar otra vez el mismo comando baste. |
| El buscador complementario de Wikidata devuelve `[]` cuando falla. | No distingue ausencia real de resultados de consulta no disponible. | Que la búsqueda de candidatos haya sido exhaustiva. |

En Marsella, el campo exacto es
`pieces[6].factualConcerns[0].evidence[0].quote`, parada `Q1619084`, pasaje
`p-586218501794f4a58b04`. La respuesta cita el texto visible de un enlace;
el documento contiene el enlace Markdown y un salto antes del punto.
La comprobación en memoria confirma que ajustar solo esa representación permite
validar el contrato, conservando la objeción y la decisión `ADJUST`.
El editor y el revisor aún tienen trabajo pendiente.

## Reglas que no se negocian

- Conservar fuentes, solicitudes, respuestas, guiones, revisiones e intentos
  originales. Los cambios se registran con antes/después, motivo y huellas.
- No aceptar una respuesta truncada, parcial o con paradas ausentes; no borrar
  advertencias para conseguir un estado verde.
- No aceptar citas aproximadas, traducidas o inventadas. Un identificador correcto
  no convierte cualquier texto en una cita válida.
- No cambiar hechos, eliminar lugares, recortar áreas o reducir requisitos de
  ruta para evitar un fallo técnico. Un cambio editorial real necesita evidencia
  y una decisión visible, independiente de la recuperación técnica.
- No confundir cita localizada, afirmación respaldada, revisión automática y
  aprobación del usuario. Son comprobaciones diferentes.
- No repetir modelos hasta obtener una opinión favorable. Las reparaciones tienen
  un alcance y un límite fijados antes de ejecutarlas.
- Contabilizar todos los intentos, incluidos los fallidos, las reservas y las
  solicitudes cuyo coste quede incierto. Cambiar de carpeta no renueva el presupuesto.

## 1. Fijar una referencia reproducible

Mantener detenido el lote durante la implementación inicial. Guardar un inventario
de fases y artefactos con ciudad, identidad, política de ruta, modelo, instrucciones,
fuentes, huellas, gasto e intervención manual. Revalidar los seis resultados
terminados con los contratos vigentes, sin regenerarlos. Si aparece una carencia,
registrarla en ese tour; no repararlo en silencio ni invalidar automáticamente los demás.

Llevar a código mantenido la versión elegida del cliente, contratos e instrucciones
editoriales que hoy se importa desde `tmp/tour-quality-sandbox/…`. Primero probar
que la extracción conserva el comportamiento, sin mezclarla con cambios de política.
Mantener los originales experimentales intactos.

Crear fixtures mínimas versionadas de Marsella, Roma, un fallo real de mapas y
casos españoles que antes pasaron. Las pruebas de correcciones no deben depender
de que existan directorios temporales personales.

**Salida exigida:** reproducción offline del fallo de Marsella y del reinicio
fallido de preparación; identificación de qué variantes anteriores funcionaban,
con qué caché y con qué intervención. No presentar archivos de estado antiguos
como tasas finales de éxito.

## 2. Unificar las citas y conservar los problemas históricos

Aplicar un único contrato a profesor, editor, reparador y revisores. Comparar
contra una representación explícita del texto visible de la fuente, conservando
el original y una correspondencia verificable entre ambos. Para enlaces Markdown,
usar un analizador y conservar URL y posiciones; no borrar contenido mediante una
sustitución general que pueda cambiar el significado.

Solo admitir equivalencias demostrables: espacios y comillas según el contrato,
texto visible de enlaces y omisiones explícitas con fragmentos únicos, ordenados
y pertenecientes al mismo pasaje. Una transformación registra la política y
las huellas y no cambia decisiones, gravedad, evidencia exigida ni objeciones.
Si la equivalencia es ambigua, el resultado sigue siendo inválido.

Retirar la sustitución de cualquier cita no vacía por el párrafo entero en
`teacher` y `lostUsefulDetails`. Un párrafo puede ser un localizador de una nota,
pero no prueba que el modelo haya citado correctamente su contenido. Si se permite
una nota sin cita, debe tener un contrato explícito de localización y no presentarse
como evidencia factual. La revisión de hechos seguirá exigiendo respaldo verificable.

Separar respuesta completa con contrato inválido, truncamiento, transporte y
objeción histórica. El error debe identificar etapa, pieza, campo y causa.
Primero revalidar la respuesta guardada; solo si no puede recuperarse de forma
determinista, permitir una reparación del contrato por etapa, con presupuesto
registrado. Nunca completar una respuesta truncada inventando lo que falta.

Para una objeción sustantiva: conservar la reparación editorial acotada y una
nueva revisión ligada al texto corregido. Si sigue pendiente, detener esa ciudad.
Una corrección local posterior se registra como intervención y no se cuenta como
éxito autónomo. No ampliar el número de correcciones a posteriori para aprobar.

**Prueba decisiva:** Marsella supera el problema de representación con su respuesta
original y mantiene la objeción sobre el observatorio. El texto solo avanza a audio
cuando el editor y la revisión resuelven el significado a partir de las fuentes,
o expresan fielmente la incertidumbre. Cifras, negaciones, pasajes, orden de
fragmentos o citas inventadas deben seguir provocando rechazo.

## 3. Diagnosticar y recuperar las fuentes sin perder cobertura

Antes de modificar consultas, guardar consulta exacta y hash, ciudad y límites
geográficos, grupo, proveedor, tiempos de conexión y respuesta, estado HTTP o
error de transporte, marca temporal de datos, aviso `remark`, número de resultados
y límites de salida. Registrar también proveedor y procedencia en los éxitos;
haber intentado el proveedor alternativo no prueba que funcione.

Con el plazo de espera del proveedor cumplido, hacer una comparación acotada y
serial: consulta real de Hamburgo y consulta de control, en cada proveedor.
Máximo cuatro solicitudes diagnósticas; una restricción explícita del servicio
suspende la comparación. Reutilizar y guardar cualquier respuesta válida.
Distinguir coste de consulta, acceso de red y problemas de servicio según la
evidencia obtenida; un timeout aislado se clasifica como causa todavía desconocida.

Si se demuestra que la consulta es demasiado costosa, probar división por filtros
o regiones conservando la unión original, identidades, orden de selección y
límites globales. Comparar cobertura antes/después. No reducir el perímetro ni
omitir categorías para que responda. Si el problema es del servicio, aplicar
espera y recuperación; aumentar intentos por sí solo no es una solución.

Crear un manifiesto de fuentes: completas según la política, vacías válidas,
no disponibles o parciales rechazadas. Mantener explícitos los cortes del selector
y los límites: terminar los grupos previstos no significa inventario exhaustivo
de la ciudad. La búsqueda canónica de Wikidata seguirá siendo complementaria,
pero su fallo se declarará como tal. Solo se podrá continuar si las otras fuentes
acreditan los requisitos de identidad, cobertura del núcleo y evidencia de la
ruta; si no, la ciudad queda pendiente de fuentes.

**Salida exigida:** la adquisición de Hamburgo termina con grupos completos y
procedencia comprobable, o queda detenida con una causa precisa. Ningún HTTP 200
con un aviso de ejecución parcial se guarda como adquisición válida. La ausencia
del servicio complementario no se convierte en «no existen más lugares».

## 4. Hacer que la reanudación sea un comportamiento probado

El coordinador consumirá resultados estructurados de fase; no dependerá de buscar
una frase en el registro. Distinguirá espera de servicio, problema de consulta,
contrato inválido, evidencia insuficiente, objeción editorial, interrupción,
presupuesto agotado y finalización validada.

Mantener un solo propietario de la cola, una preparación, dos trabajos de texto
y un audio como máximo. Una objeción editorial detiene su ciudad. Las fases
independientes con entradas válidas pueden continuar. Una indisponibilidad
confirmada de un proveedor impone espera compartida a sus consultas; no provoca
una ráfaga de intentos en otras ciudades. Un fallo de causa desconocida se mantiene
en espera diagnóstica limitada, sin declararlo automáticamente caída global.

Tras los cuatro intentos iniciales existentes, permitir como máximo tres ventanas
de recuperación: 5, 15 y 30 minutos después del fallo precedente, siempre tomando
el plazo mayor si el proveedor exige más. Cada ventana permite una solicitud
para la consulta pendiente, no otros cuatro intentos ocultos. El contador y la
fecha sobreviven a reinicios; el proceso permanece esperando y despierta realmente.
Agotado el límite, la parada es explícita. No se crea seguimiento de Codex para
compensar que el propio coordinador no sabe esperar.

Persistir la transición al siguiente intento antes de lanzarlo. Reutilizar un
checkpoint solo tras validar identidad, política, entradas y fase. Si no existe
checkpoint, crear un nuevo directorio enlazado al anterior y aprovechar únicamente
cachés válidas; no reutilizar el directorio ocupado ni borrar el fallo.
Reconstruir gasto y reservas antes de autorizar cualquier nueva llamada.

Mantener el límite acumulado existente de 2 USD por ciudad para preparación.
Para el piloto editorial, fijar antes de las llamadas un límite agregado de
exposición adicional de 0,50 USD por ciudad, con reserva previa a cada petición;
si la exposición máxima de una llamada no cabe, detener. Ese límite se comparte
entre contrato, revisión por piezas y correcciones: no se multiplica por carpetas.
El historial anterior se contabiliza por separado y permanece visible.
La reserva usa la configuración de costes verificada del proveedor, no una tarifa
inventada. No subir límites automáticamente ni empezar una llamada con precio desconocido.

Aceptar una fase guardada por un recibo validado, no por existencia de un archivo.
El recibo enlaza sus insumos y resultados. El estado vigente muestra el intento
actual; el fallo anterior permanece en el historial. Mostrar próxima ejecución,
intentos restantes, espera, causa y si hay un proceso activo.

**Pruebas de integración:** caída y vuelta del servicio; reinicio durante una espera;
fallo sin checkpoint; checkpoint válido; dos reinicios sin trabajos duplicados;
petición de coste incierto; archivo presente pero corrupto; entrada de otra ruta;
fallo editorial que no bloquea ciudades independientes; agotamiento de todos los
intentos; parada limpia de GPU; reanudación sin duplicar audio. Usar directorios
reales temporales y procesos locales de prueba, sin llamadas facturables.

## 5. Reabrir por etapas, con condiciones de avance

1. Pasar las pruebas negativas de citas, cobertura de fuentes, presupuesto y
   reanudación. Las pruebas deben demostrar que los rechazos correctos se conservan.
2. Recuperar Marsella desde profesor y Hamburgo desde fuentes. Deben completar
   guion, revisión, audio y entrega con el flujo nuevo; documentar cualquier
   intervención. No declarar éxito general por una consulta aislada que responda.
3. Probar una ciudad nueva de la cola —Venecia— con adquisición sin caché para
   ese caso, conservando la caché original. Registrar aciertos de caché para no
   atribuirles falsamente una mejora. Un control español se reproduce con sus
   datos congelados para comprobar que no rompimos lo que ya funcionaba.
4. Comprobar las interrupciones deliberadas en copias del piloto, sin perder trabajo
   válido ni provocar otra llamada facturable incierta. Después abrir las otras
   veintiuna ciudades manteniendo los límites y la política probada.

La condición para ampliar es: tres pilotos terminados, ninguna objeción material
sin resolver, fuentes obligatorias acreditadas, revisión y audio ligados al guion
vigente, presupuesto respetado y recuperación de fallos demostrada. Una intervención
debe figurar como tal; si fue necesaria para vencer un fallo de infraestructura o
contrato ya contemplado, se corrige ese mecanismo y se repite su prueba antes de ampliar.
Esto acredita esos casos y esas clases de fallo, no promete disponibilidad eterna
de los proveedores ni exactitud histórica absoluta.

## Aplicación y verificación del plan

Actualización del 20 de septiembre, después del arranque controlado de las 18:00 UTC.

- Se congeló un inventario de 698 artefactos antes de editar. La extracción inicial
  de los cuatro módulos editoriales fue idéntica byte por byte y pasó las 18 pruebas
  anteriores. El código mantenido y el ejemplo de estilo están ahora en
  `backend/scripts/admin/editorial_runtime`; los originales experimentales permanecen intactos.
- Las fixtures de Marsella, Roma, Sevilla y el fallo de Hamburgo están versionadas.
  Las citas comparten analizador de enlaces, posiciones y URL, equivalencias acotadas
  y registro de ajustes. Las citas inventadas, números cambiados, negaciones y
  fragmentos ambiguos o desordenados se rechazan. Se retiró el reemplazo por párrafos
  completos. Una reparación de contrato no puede modificar decisiones u objeciones
  y comparte un único cupo por etapa, también entre revisiones por piezas.
- El cliente reserva la exposición antes de enviar cada petición y conserva la
  reserva si el coste es incierto. El límite adicional de 0,50 USD se comparte por
  ciudad entre todas las carpetas. Se verificaron las [tarifas oficiales](https://api-docs.deepseek.com/quick_start/pricing/) el 20 de
  septiembre; se usa la tarifa máxima publicada para la reserva y la contabilidad
  conservadora, sin confundir ese techo con el cargo exacto de la factura.
- Las consultas de mapas conservan texto, huella, ciudad, límites, grupo, proveedor,
  conexión, respuesta, estado, caché y procedencia. La búsqueda canónica distingue
  una respuesta vacía válida de un servicio no disponible. Los manifiestos declaran
  los límites de selección y no afirman exhaustividad.
- Se hicieron exactamente cuatro diagnósticos de Hamburgo. Las dos consultas reales
  agotaron 70 segundos. El control pequeño del primer proveedor devolvió HTTP 504 y
  un mensaje explícito de saturación; el control del segundo agotó también el plazo.
  DNS, conexión y TLS funcionaron. No se ha demostrado que reducir la consulta sea
  la solución, y no se ha cambiado su cobertura. La consulta se reconstruyó con el
  mismo generador y la delimitación actual: el intento antiguo no guardaba su texto.
- El supervisor consume fallos estructurados, guarda contadores y fechas, permanece
  esperando y asigna carpetas nuevas o checkpoints verificados. Cada ventana vuelve
  a intentar una sola vez la consulta pendiente. Los recibos vinculan los archivos
  de entrada, revisión y audio; la mera presencia de un archivo ya no basta.
- Se revalidaron las seis entregas anteriores, incluida la procedencia de todos sus
  capítulos, sin regenerarlas. Se conserva visible la intervención anterior en Múnich.
- Las comprobaciones automatizadas suman 99: 51 de administración/editorial/cola,
  33 de fuentes, 4 de directorios de preparación, 3 de limpieza de GPU, 6 de
  reanudación de audio y 2 de procedencia. También pasó TypeScript sin emitir archivos.
  Las pruebas de cola usan procesos locales reales y verifican que matar el lanzador no permita duplicar su trabajador; los fallos del proveedor se
  simulan en esas pruebas sin llamadas facturables. La prueba de apagado de GPU usa
  procesos simulados, no interrumpe una generación real en GPU.
- En copias del audio de París y de Marsella se simuló perder la última actualización
  del progreso después de guardar el capítulo. El proceso real del renderizador
  recuperó ese capítulo sin acceso a GPU, sin reescribir audio y sin cambiar los originales.

**Resultado del primer piloto:** Marsella reutilizó escritor y profesor guardados.
La normalización modificó una sola cita del profesor y mantuvo `ADJUST` y su
objeción. El editor cambió la ubicación del observatorio a «en las inmediaciones del
conjunto» y el revisor comprobó esa precisión contra las fuentes. No quedan
objeciones materiales en su revisión. El audio dura 1082,4735 segundos y está
vinculado al guion aprobado automáticamente; sigue pendiente la escucha del usuario.
Las dos nuevas llamadas tienen una exposición contabilizada máxima de 0,0444399 USD.
No se aplicó una corrección manual del texto de Marsella.

**Pendiente y condición de avance:** Hamburgo hizo una sola solicitud en la primera
ventana y recibió HTTP 504; la segunda quedó programada para las 18:15:54 UTC.
Un reinicio al vencer esa espera detectó y corrigió una reserva durante el apagado;
la segunda ventana se conserva asignada, sin repetir ni reiniciar su contador.
La segunda ventana hizo una única consulta al proveedor alternativo y agotó el
plazo. Queda una ventana, programada para las **18:50:35 UTC (20:50 en Madrid)**.
El supervisor continúa vivo, con el contador y la espera persistidos.
Venecia permanece retenida durante la espera compartida, con carpetas separadas
para su adquisición inicial sin caché de mapas ni entidades. Los veintiún destinos
restantes se liberarán automáticamente solo cuando los tres pilotos tengan recibos
válidos, la implementación coincida con las versiones probadas y las copias de audio
superen la prueba de recuperación. Si se agotan las ventanas o falla un control,
la ampliación queda detenida. No se ha declarado completado el lote.

Los resultados vivos y el diagnóstico están en `reliability-gates.json`,
`reliability-existing-results.json`, `reliability-audio-interruption.json`,
`hamburg/source-diagnosis.json` y los recibos y pruebas de recuperación de cada ciudad,
dentro del directorio del lote. Los estados posteriores se consultan en
`queue-status.json`; esta sección describe la evidencia obtenida al aplicar el plan.

## Evidencia local principal

- [Estado detenido del lote](../../backend/tmp/pilot-batch-europe-20260920/queue-status.json).
- [Plan y recuperaciones anteriores de España](../../backend/tmp/pilot-batch-spain-20260912/PLAN.md).
- [Registro de mapas de Palma](../../backend/tmp/pilot-batch-spain-20260912/palma/prepare.log).
- [Respuesta del profesor de Marsella](../../backend/tmp/pilot-batch-europe-20260920/marseille/editorial/cases/marseille/teacher-raw.json).
- [Fuentes y caso de Marsella](../../backend/tmp/pilot-batch-europe-20260920/marseille/editorial/case.json).
- [Intentos de Hamburgo](../../backend/tmp/pilot-batch-europe-20260920/hamburg/prepare-runner.log).
- [Recuperación guardada de los mapas de Marsella](../../backend/tmp/pilot-batch-europe-20260920/marseille/overpass-recovery-verified.json).
- [Coordinador actual](../../backend/scripts/admin/deepseek-europe-supervise.py),
  [preparación](../../backend/scripts/admin/deepseek-europe-prepare.cjs) y
  [flujo editorial](../../backend/scripts/admin/deepseek-batch-text.py).

Los archivos de ejecución bajo `tmp` están fuera de Git y deben preservarse.
El inventario congelado y las fixtures del primer paso harán reproducible la
comprobación sin depender de enlaces a estados vivos.
