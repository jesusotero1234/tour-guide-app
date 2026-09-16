# Plan: introducción independiente y audio para los 55 tours

Estado: en ejecución desde el 12 de septiembre de 2026. El usuario autorizó generar todos los audios y dejar el lote en segundo plano; la revisión de escucha se hará posteriormente cuando la solicite.

Ampliación autorizada: 55 introducciones + 425 paradas = 480 piezas. El inventario verificó 312 audios reutilizables y 168 piezas pendientes de generar. La selección de 55 tours y la conservación de Madrid/es anterior no cambian. El alcance completo sustituye la limitación inicial de 110 piezas y la espera de revisión manual entre el primer grupo y el resto.

El objetivo es que «Introducción» funcione como el primer contenido del reproductor: presenta la ciudad y anticipa el recorrido, permite escuchar o leer la bienvenida y da paso a la primera parada real. Se reutilizan las introducciones existentes.

## 1. Alcance y selección

La comprobación del catálogo encontró 56 tours seleccionados, todos con introducción, correspondientes a 55 combinaciones de ciudad e idioma. Hay dos versiones de Madrid en español.

La selección propuesta para el lote es una versión por cada combinación, 55 tours en total. Para Madrid en español:

| Tratamiento | Tour |
| --- | --- |
| Incluir la versión más reciente, del 12 de septiembre de 2026 | `5b393fef-f58b-5e42-861e-b3baafbb3a8a` |
| Conservar la versión anterior fuera de este lote | `b1fbcc6c-22ca-4795-9ee2-b1292fc3dfb0` |

Antes de ejecutar, guardar un manifiesto con los 55 identificadores, ciudad, idioma, primera parada, versiones de voz y huellas de los textos. Verificar de nuevo la selección; una modificación posterior del catálogo no debe incorporar tours automáticamente al lote.

No se modificarán las descripciones, introducciones, orden de las paradas, coordenadas, imágenes ni recorridos. Tampoco se eliminarán versiones anteriores. Si alguna introducción necesita un resumen editorial más breve, se anotará por separado: este proceso no reescribe textos.

## 2. Comportamiento de la aplicación

- Añadir «Introducción» al principio del selector del recorrido, con su texto y el mismo reproductor de audio.
- Mostrarla al comenzar un tour nuevo. Permitir saltarla y volver a seleccionarla en cualquier momento.
- Incluir el botón «Ir a la primera parada». Al terminar su audio, ofrecer continuar; no iniciar otra narración automáticamente.
- Mantener la numeración de las paradas reales desde 1. La introducción no suma una parada, no tiene coordenadas ni genera un marcador.
- En la introducción, mostrar el texto como contenido principal. Las paradas conservarán sus vistas de fotos, texto y mapa.
- Sustituir la pantalla de bienvenida separada por esta entrada integrada. En «Texto» de la primera parada quedará solamente el texto de esa parada.
- Mantener el aviso inicial que ya se recuerda por navegador, separado de la introducción propia de cada tour.
- Traducir los nuevos controles a español, francés, inglés, alemán e italiano.

La selección distinguirá explícitamente entre introducción y parada por identificador. No se añadirá una parada ficticia a la lista que utilizan los mapas y las rutas.

El progreso de la introducción se guardará aparte. Escucharla no marcará la primera parada como completada. Al actualizar un tour se conservarán la parada seleccionada y el progreso de los audios que no cambien. La posición del antiguo primer audio no se trasladará directamente al nuevo: sus segundos incluyen una bienvenida que ya no estará allí.

## 3. Separación del audio

Actualmente el primer audio concatena el aviso de voz artificial, la introducción y la descripción de la primera parada. La nueva composición será:

| Pieza | Texto que se convierte en audio |
| --- | --- |
| Introducción | Aviso de voz artificial y `tour.introduction` |
| Primera parada | Únicamente su descripción |
| Paradas siguientes | Su descripción actual, sin cambios |

El aviso visual sobre la voz permanecerá accesible en el reproductor, también para quien salte la introducción.

Para los 55 tours hay **110 piezas objetivo**: 55 introducciones y 55 primeras paradas. Es el alcance de esta adaptación, no una afirmación de que el resto del catálogo ya tenga todos sus audios preparados. Los audios restantes que falten o no sean válidos se incluirán en el informe, sin ampliar automáticamente el lote.

Reutilizar los audios de las demás paradas cuando coincidan texto, idioma, voz, modelo y archivo verificado. No cambiar globalmente la versión del generador para expresar este cambio de estructura, porque eso invalidaría audios que no necesitan regenerarse.

## 4. Almacenamiento y compatibilidad

El almacenamiento actual vincula cada audio a una parada real. Añadir una entidad de audio de introducción vinculada al tour, mediante una migración aditiva. No crear un registro ficticio de parada ni utilizar el identificador de la primera parada para los dos audios.

Guardar para cada introducción el idioma, archivo, duración, versión, huella del texto, identidad de voz y huella del archivo. Mantener los audios de paradas en su almacenamiento actual.

Ampliar la respuesta de audio con un campo opcional para la introducción —estado, texto, URL y versión— conservando los campos actuales de las paradas. Añadir una ruta de lectura propia para su archivo, tanto en el servidor como en el proxy de la aplicación. Mantener las reglas actuales de acceso, versión y lectura privada.

Separar los contadores de generación de segmentos del número de paradas reales: generar una introducción no debe convertir un recorrido de nueve paradas en uno de diez.

Preparar la pareja «introducción + primera parada nueva» como una edición pendiente. Activarla por tour, en una única operación, cuando ambas piezas hayan sido verificadas. Hasta entonces se mantiene la edición anterior, incluido su primer audio completo. Conservar sus referencias para poder revertir el cambio.

La verificación del material del piloto deberá incluir el nuevo audio de introducción. Si existe una revisión aprobada, un cambio de archivos no debe reutilizar una aprobación correspondiente a la edición anterior.

## 5. Proceso automático

Crear una herramienta administrativa con operaciones de inventario, simulación, ejecución, estado y reanudación. La generación no se lanzará desde la página pública.

1. Leer el manifiesto cerrado de los 55 tours y comprobar textos, primeras paradas, voces y disponibilidad de recursos.
2. Mostrar en la simulación qué piezas se crearían, cuáles ya son válidas y qué incidencias existen. Esta operación no escribe audios.
3. Preparar las dos piezas objetivo de cada tour con identificadores independientes y textos exactos del manifiesto.
4. Ejecutar la voz local utilizando el supervisor y la reserva de GPU existentes. Agrupar por idioma cuando ayude a reutilizar la voz cargada, con una generación activa cada vez.
5. Registrar de forma persistente el estado por pieza: pendiente, en curso, completada o fallida. Guardar cada resultado antes de avanzar.
6. Validar que el archivo se decodifica, tiene duración positiva y corresponde al texto y a la voz esperados.
7. Reintentar fallos transitorios de forma limitada. Si una pieza sigue fallando, registrarla y continuar con las demás cuando el servicio esté disponible.
8. Al reanudar, comprobar los archivos completados y generar solo lo pendiente. No sobrescribir ni duplicar resultados válidos.
9. Volver a comprobar las huellas antes de activar cada pareja. Si el texto o la voz cambian durante el trabajo, dejar ese resultado pendiente de revisión en vez de publicarlo.
10. Emitir un informe con piezas generadas, reutilizadas, pendientes, errores, tours activados y tiempo real empleado.

La herramienta debe solicitar exclusivamente introducción y primera parada. No llamará sin restricciones al procedimiento actual de completar todos los audios de un tour, porque podría generar también otras paradas pendientes.

## 6. Orden de implementación

1. Cerrar el manifiesto y obtener el inventario de audios reutilizables mediante lectura.
2. Añadir almacenamiento y lectura compatibles para introducciones y ediciones pendientes.
3. Adaptar la composición de audio y la herramienta de generación selectiva.
4. Integrar «Introducción» en el reproductor y en el progreso, manteniendo una alternativa compatible para tours todavía no migrados.
5. Probar un tour por idioma: cinco tours y diez piezas. Escuchar el comienzo y el final de cada introducción y comprobar la transición a la primera parada.
6. Tras validar esos casos, completar los otros 50 tours. Las piezas válidas de la prueba inicial forman parte del mismo lote y no se repiten.
7. Activar las parejas verificadas y revisar el resultado en el catálogo real.

La prueba inicial servirá para medir el tiempo por idioma y estimar la duración del lote completo; no se fija ahora un plazo de generación sin esa medición.

## 7. Comprobaciones de aceptación

- La bienvenida se puede leer, reproducir, pausar, saltar y volver a seleccionar.
- Se escucha una sola vez al recorrer introducción y primera parada en secuencia.
- No hay reproducción ni petición de ubicación automáticas.
- Los nombres, el orden, el número de paradas y el mapa coinciden con los anteriores.
- Reabrir la introducción conserva la parada seleccionada y el progreso de las demás narraciones.
- Los controles gráficos de play y pausa funcionan en móvil; comprobar Safari en iOS, además del navegador de escritorio.
- Interrumpir y reanudar el lote no repite piezas completadas ni deja un tour con una pareja incompleta activada.
- Cambiar texto o voz invalida solamente los resultados que dependan de ese cambio.
- Los audios conservados mantienen sus versiones y archivos; la migración no altera su progreso de escucha.
- Las rutas privadas siguen aplicando sus controles de acceso y de versión.
- La compilación se prueba en una copia aislada. Al actualizar la vista, comprobar los archivos de CSS y JavaScript y conservar temporalmente los recursos usados por pestañas abiertas.

El cierre del lote requiere un informe de los 55 tours, con 55 introducciones y 55 primeras paradas válidas. Los problemas preexistentes de otras paradas deben quedar identificados y no presentarse como resueltos por esta adaptación.

## 8. Áreas principales del código

| Área | Archivos o componentes principales |
| --- | --- |
| Datos | `backend/prisma/schema.prisma` y migración aditiva |
| Audio y procedencia | `TourAudioService`, `LocalVoxCpmRenderer`, `AudioProvenance` |
| Lectura y edición vigente | Controladores de audio, rutas del piloto y `PilotRelease` |
| Proceso administrativo | Nueva herramienta de lote y manifiestos de ejecución |
| Reproductor | `TourExperience`, `TourAudioPanel`, `AudioPlayer` |
| Idiomas y progreso | `listeningCopy`, `tourProgress` y tipos de audio compartidos |
| Proxy y validación | Rutas de audio de Next.js y pruebas del servidor y navegador |

Entregables previstos: implementación compatible, herramienta reanudable, manifiesto de 55 tours, informe del lote y referencias de las ediciones anteriores para reversión.


## Operación del lote en segundo plano

Herramienta: `backend/scripts/admin/tour-audio-batch.cjs`, ejecutada desde `backend` con Node 22 y `-r ts-node/register/transpile-only`. Operaciones: `inventory`, `dry-run`, `run`, `resume`, `status`. Carpeta predeterminada: `backend/tmp/introduction-audio-20260912`.

- `manifest.json`: selección cerrada, textos exactos y huellas de voz; no modificar al reanudar.
- `state.json`: estado por pieza, activación por tour y último avance.
- `batch.log`: ejecución y errores; los resultados anteriores se conservan.
- `jobs/<id>/progress.json`: progreso del generador y resultados por pieza, recuperables después de una interrupción.
- `launcher.json`: identificador del proceso lanzador; el proceso trabajador figura en `state.json`.

El proceso se lanzó desacoplado de la conversación. Un bloqueo de sistema evita dos ejecuciones del mismo lote; el supervisor existente reserva la GPU. Cada archivo nuevo se verifica por huella y decodificación completa con SoundFile, ya instalado con el generador. Se activa cada introducción junto a su primera parada tras verificar ambas y comprobar que los textos siguen coincidiendo. Los archivos anteriores se conservan y la introducción registra las referencias de la edición previa.

Una incidencia inicial en la comprobación detectó que no había `ffprobe` instalado. Se cambió a SoundFile y se reanudó recuperando los archivos terminados, sin volver a sintetizarlos.

Reanudar, si el equipo o proceso se detiene:

```sh
cd /home/jesusotero/coding/tour-guide-app/backend
/home/jesusotero/.nvm/versions/node/v22.14.0/bin/node -r ts-node/register/transpile-only scripts/admin/tour-audio-batch.cjs resume
```

El proceso puede seguir con la conversación cerrada mientras el equipo permanezca encendido. La escucha editorial y la comprobación en un iPhone físico quedan para la revisión posterior solicitada por el usuario.


Validación de la integración: compilación de servidor y aplicación correctas; 31 pruebas del servidor aprobadas, incluidos acceso privado y versiones de audio. Pruebas en Chromium aprobadas para introducción integrada, progreso separado, selección conservada entre ediciones, numeración real, ausencia de reproducción automática, iconos SVG y tamaños móviles; también aprobada la batería general de escucha, mapa, galería y privacidad. La vista local se actualizó mediante compilación aislada, conservando los archivos estáticos anteriores. La comprobación de la vista activa confirmó búsqueda francesa y acceso privado; la entrega real de introducción y primera parada admite rangos y rechaza versiones obsoletas.
