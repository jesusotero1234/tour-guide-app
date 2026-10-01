# Plan de paralelismo con control compartido de mapas

Fecha: 20 de septiembre de 2026. Estado: implementado y validado localmente;
supervisor reanudado con el control compartido el 20 de septiembre a las 19:27 UTC.

## Resultado de la implementación

- `OverpassCoordinator.ts` lanza el trabajador HTTP bajo `flock --no-fork`.
  `OverpassRequestWorker.ts` conserva el permiso durante la petición, la
  validación y la publicación de la caché. La política compartida vive en
  `OverpassCoordinatorPolicy.ts`.
- El estado duradero está en `backend/tmp/source-control/overpass/state.json`;
  puede configurarse mediante `OVERPASS_COORDINATOR_DIR`, siempre absoluto y
  común a los procesos. El diagnóstico también pasa por este control.
- El supervisor distingue espera compartida de fallo y no reserva ventanas al
  esperar. Los reintentos vuelven detrás de las ciudades que aún no empezaron.
  La página del lote muestra el estado del proveedor y la recuperación.
- Validación: 32 pruebas de adquisición, incluidas nueve de integración con
  procesos reales; 64 pruebas administrativas y cuatro de reanudación de
  preparación. Compilación TypeScript y del trabajador de generación correctas.
  Treinta procesos simultáneos con la misma consulta emitieron un solo HTTP;
  las consultas distintas respetaron la exclusión y los tres segundos mínimos.
- La migración conserva las tres ventanas agotadas de Hamburgo. Las respuestas
  válidas posteriores de Venecia acreditan recuperación del servicio para
  otras ciudades, sin renovar el presupuesto de Hamburgo.
- En el piloto de activación, Venecia reutilizó su caché. Lyon emitió su cuarto
  intento inicial, recibió 504 con evidencia de sobrecarga y abrió una espera
  compartida con tres comprobaciones limitadas. No se declaró recuperado al
  proveedor ni se repitió la consulta dentro del piloto.

El alcance comprobado es esta máquina. El Dockerfile instala `util-linux` para
disponer de `flock`, pero esta intervención no desplegó ni probó una imagen Docker.
Los detalles siguientes describen el contrato aplicado.

El objetivo es admitir las treinta ciudades en una cola, preparar rutas y guiones
en paralelo y evitar que un fallo de mapas provoque intentos simultáneos o una
cadena de fallos en todo el lote. La disponibilidad del proveedor sigue siendo
externa; podemos controlar nuestra carga, conservar el trabajo y recuperarnos
sin multiplicar peticiones.

## Punto de partida comprobado

- El modo `--all-texts-first`, en desarrollo en la tarea «Añadir 10 ciudades de
  Europa», configura dos preparaciones, cuatro guiones y un audio al final.
- `OverpassPoiFetcher.ts` serializa consultas y esperas dentro de cada proceso.
  Dos preparaciones tienen dos controles independientes. El supervisor recibe
  el fallo al terminar una preparación; el otro proceso puede seguir consultando.
- `OverpassQueryCache.ts` ya conserva respuestas válidas durante siete días.
  La deduplicación de peticiones pendientes también vive dentro del proceso.
- Existen cuatro intentos iniciales por consulta y tres ventanas de recuperación
  de 5, 15 y 30 minutos. Cambiar de ciudad o proceso no debe renovar el presupuesto
  de recuperación de un proveedor que sigue fallando.
- El diagnóstico guardado de Hamburgo incluye un 504 con mensaje de servidor
  ocupado incluso para una consulta mínima. El alternativo agotó la espera.
  Un timeout aislado, por sí mismo, mantiene la causa como desconocida.

La otra tarea terminó sus cambios antes de esta implementación. El supervisor
se detuvo ordenadamente, se guardó su estado y se reanudó tras las pruebas y la
migración. Las fases completadas y sus recibos se conservaron.

## Límites propuestos

| Trabajo | Límite inicial | Condición |
| --- | --- | --- |
| Ciudades admitidas | Las 30 en cola | Admitir no significa iniciar todas sus peticiones. |
| Preparación de rutas | 2 simultáneas | Comparten el permiso de acceso a Overpass. |
| HTTP de Overpass | 1 petición global | Incluye ambos proveedores, reintentos y comprobaciones de recuperación. |
| Separación entre peticiones | Al menos 3 segundos desde la finalización anterior | Se amplía ante errores y nunca acorta `Retry-After`. |
| Guiones | 4 simultáneos | Solo con preparación y fuentes validadas. |
| Audios | 1 simultáneo, en un lote al final | Después de terminar las fases previas; solo tours con texto aprobado. |

Los tres segundos son el punto de partida conservador del cliente actual, no
una garantía de admisión del proveedor. Las colas conservan orden y evitan que
una ciudad con fallos monopolice las oportunidades disponibles.

## 1. Un control compartido antes de cada petición

Añadir un coordinador local de Overpass integrado en el cliente común. Todos los
procesos del lote, las generaciones manuales y los diagnósticos deben pasar por
él. Limitar únicamente el número de preparaciones resulta insuficiente.

Para este despliegue Linux/WSL, usar exclusión entre procesos mediante `flock`,
ya disponible y utilizado en el repositorio, y estado JSON con escritura atómica.
El adaptador protegido debe realizar la petición y persistir el resultado antes
de liberar el permiso; bloquear solo la lectura del estado no protege el HTTP.
No hace falta añadir otro servicio de base de datos para este lote local.

Guardar el control en una ruta absoluta compartida, independiente del directorio
del lote, del proceso y de la caché. La caché fría de Venecia seguirá respetando
el mismo límite de red. Este mecanismo coordina una sola máquina; ejecutar desde
otro host requeriría centralizar el acceso antes de habilitarlo.

Persistir proveedor, próxima hora permitida, petición en curso, propietario,
contador de intentos e incidente de recuperación. Al obtener el permiso, volver
a comprobar la caché: otro proceso puede haber completado ya la misma consulta.
La respuesta validada debe estar publicada antes de permitir una descarga
duplicada con la misma identidad y política de caché.

Si el proceso muere con una petición enviada, conservar el intento consumido y
una espera conservadora hasta superar su plazo de ejecución y enfriamiento.
El bloqueo del sistema libera la exclusión, pero no demuestra que el servidor
haya dejado de ejecutar la consulta. Un estado ilegible produce una espera
explícita; nunca habilita acceso sin control.

## 2. Errores y recuperación sin avalanchas

Mantener estado separado para cada proveedor y un único permiso global de red:

- **429, 503 o mensaje explícito de servidor ocupado:** cerrar temporalmente
  el acceso a ese proveedor y compartir la hora de reanudación inmediatamente.
- **Timeout o 504 sin explicación:** registrar causa desconocida y enfriar ese
  proveedor al menos 30 segundos. Dos fallos transitorios consecutivos dentro
  de cinco minutos abren su espera de recuperación. Es una medida preventiva,
  no una declaración de caída confirmada.
- **Error de consulta o respuesta inválida no transitoria:** detener esa
  consulta para revisión, sin bloquear ciudades independientes ni insistir.
- **403:** registrar restricción y detener ese acceso; no rotar automáticamente
  proveedores como respuesta a una restricción de acceso.

El alternativo solo se utiliza si su propio estado permite acceso y existe
presupuesto. También consume el permiso global. Si ambos están esperando,
las consultas nuevas quedan pendientes; el trabajo con fuentes ya completas
puede continuar.

Concentrar la decisión de reintentar en el coordinador. El cliente realiza un
intento autorizado y el supervisor programa las fases; ninguno añade otro bucle
de reintentos por su cuenta. Conservar como máximo cuatro intentos iniciales
por consulta. Las tres ventanas adicionales de 5, 15 y 30 minutos se comparten
por incidente de indisponibilidad: no se conceden tres a cada ciudad.

En cada ventana, una sola consulta pendiente sirve como comprobación de
recuperación y consume un intento. Respetar el mayor plazo entre la espera
local y `Retry-After`, con variación aleatoria solo hacia más tarde. Si responde
correctamente, conservar los datos y reabrir gradualmente con el mismo límite
global de una petición. Si falla, pasar a la siguiente ventana. Agotadas las
tres, mostrar «recuperación agotada» y continuar únicamente el trabajo posible
con fuentes disponibles. Una nueva ciudad o un reinicio no crea otro incidente
para eludir ese límite.

El contador aumenta al reservar y despachar realmente una petición. Esperar
turno, encontrar caché o aplazar por enfriamiento no consume intentos. Un intento
reservado cuya ejecución quede incierta tras una caída sí se conserva.

## 3. Integración con la cola y el trabajo existente

La espera debe devolverse como un resultado estructurado con causa, proveedor y
`retryNotBefore`. El supervisor libera la plaza de preparación, conserva el
checkpoint y reprograma; no mantiene ocupado un proceso durante treinta minutos
ni transforma la espera en fallo editorial. Los plazos de adquisición se separan
de los tiempos máximos de ejecución de una preparación.

`independent_sources` puede dejar continuar ciudades cuando una consulta concreta
falla, pero nunca ignora el estado compartido del proveedor ni borra evidencia
previa de indisponibilidad. La recuperación debe proteger también a procesos
que ya estaban activos cuando se produjo el error.

Reutilizar la caché y los recibos de fases existentes. No aceptar respuestas
parciales, usar caché caducada silenciosamente, reducir el área de la ciudad ni
omitir grupos de lugares para desbloquear la generación.

El audio espera mientras haya rutas o textos ejecutándose, en cola o en espera
con recuperación pendiente. Cuando las fases previas terminen o queden en un
error definitivo, el lote de audio procesa los textos aprobados y muestra las
ciudades excluidas. El lote completo no se presenta como terminado sin errores
si quedan ciudades pendientes o fallidas.

La página de estado mostrará rutas y guiones activos, peticiones de mapas en
vuelo, proveedor en espera, siguiente comprobación, intentos restantes y uso de
caché. Los datos proceden del coordinador, no se deducen buscando frases en logs.

## 4. Implementación y validación

Orden propuesto, integrándolo con los cambios de la otra tarea antes de tocar
sus archivos:

1. Crear el coordinador compartido y sus pruebas entre procesos; integrar
   `OverpassPoiFetcher.ts`, `OverpassQueryCache.ts` y la evidencia de
   `SourceAcquisition.ts`. Adaptar también `diagnose-overpass.cjs`, que hoy
   realiza peticiones directas con curl.
2. Adaptar `deepseek-europe-prepare.cjs` y `deepseek-europe-supervise.py` para
   diferenciar espera de fallo, delegar los presupuestos de recuperación y
   publicar el estado. Migrar las esperas existentes conservando contadores
   y tomando el mayor plazo conocido; no reiniciar los límites de Hamburgo.
3. Actualizar las pruebas de Overpass, supervisor e integración y la página
   `deepseek-europe-page.py`. Volver a vincular las puertas de validación a los
   archivos comprobados, sin desactivar sus comprobaciones.
4. Validar primero con un servidor HTTP local simulado y varios procesos reales.
   Después usar un piloto de dos ciudades que aún tengan presupuesto, respetando
   las esperas vigentes y guardando toda respuesta aprovechable. Liberar el
   resto con los mismos límites tras comprobar el comportamiento.

Pruebas de aceptación indispensables:

- Treinta trabajos pendientes nunca producen más de un HTTP de Overpass en vuelo,
  aunque provengan de procesos o directorios de caché distintos.
- Dos procesos que necesitan la misma consulta compatible comparten el resultado
  sin duplicar su descarga; una respuesta parcial nunca llena la caché.
- Un 429 con `Retry-After` impide también consultas de otros procesos hasta el
  plazo. Un alternativo sano puede avanzar dentro del permiso global.
- Dos proveedores fallando producen una sola comprobación por ventana para todo
  el lote; los contadores no se multiplican por ciudades ni por reinicios.
- Esperar permiso no consume un intento. Matar y reiniciar al propietario no
  deja un bloqueo eterno, una descarga solapada ni un contador reiniciado.
- Un timeout aislado conserva su causa desconocida; una consulta inválida afecta
  solo a su ciudad. Los guiones con fuentes completas siguen avanzando.
- La caché completa permite avanzar durante una espera del proveedor. Las
  comprobaciones en frío comparten el control de red y mantienen su política.
- Los audios comienzan al terminar el trabajo previo elegible, con errores y
  exclusiones visibles y sin repetir fases que ya tienen un recibo válido.

La prueba decisiva es observar concurrencia HTTP y contadores desde varios
procesos, además de comprobar el estado final de la cola. Las pruebas actuales
de paralelismo del supervisor por sí solas no demuestran esa protección.

Referencia del proveedor: [recursos compartidos, cuotas y esperas de Overpass](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html).
Plan general relacionado: [fiabilidad de generación europea](plan-fiabilidad-generacion-europa-20260920.md).
