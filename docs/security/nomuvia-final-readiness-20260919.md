# Nomuvia: comprobación previa a publicación

**Actualización posterior:** el responsable autorizó el lanzamiento sin revisión
manual adicional. El estado desplegado y los límites conservados se documentan
en `nomuvia-public-launch-20260919.md`. Este informe conserva la evaluación previa.

Fecha: 19 de septiembre de 2026. Resultado: **todavía no listo para apertura pública**.
Esta revisión comprueba el estado técnico y los pendientes documentados; no certifica
cumplimiento jurídico ni sustituye la escucha o revisión humana del contenido.

## Resultados comprobados

- Catálogo local: 57 registros, 55 con audios completos y geometría peatonal;
  dos versiones antiguas incompletas. Cero trabajos activos en la base consultada.
- Ningún tour tiene admisión final al piloto. Persisten los controles de uso de
  fuentes y las aprobaciones pendientes. Un control automático pendiente no
  demuestra por sí mismo una infracción de derechos.
- Los 35 audios de las paradas con pasajes sustituidos están generados localmente;
  véase `../legal/nomuvia-original-passages-20260919.md`. No están en Hetzner.
- Colecciones del otro trabajo: 11 tours temáticos, 79 capítulos; Sicilia,
  35 versiones de siete paseos en cinco idiomas, 230 capítulos. Se verificaron
  existencia de archivos, duración declarada positiva y hashes disponibles en
  sus manifiestos. Sin incidencias en esa comprobación. Son páginas locales
  independientes: no forman parte todavía de la base de la aplicación.
- Hetzner: cero tours en PostgreSQL. Servicios de aplicación, Caddy, base de datos,
  firewall y temporizador de rotación activos. SSH por clave, sin contraseña ni
  acceso root; firewall con 22, 80 y 443. El acceso web sigue privado.
- Aviso operativo del servidor: identidad y contacto presentes; faltan hosting,
  destinatarios, transferencias, conservación, bases y derechos. La aceptación
  de lanzamiento sigue desactivada. El DPA fue confirmado por el responsable
  en la conversación; no se ha inspeccionado el documento firmado.
- Pruebas sobre https://nomuvia.com con autenticación privada: aviso inicial,
  reconocimiento persistente, caducidad, analítica desactivada y anchura móvil
  correctos en español, inglés, francés, alemán e italiano.
- Privacidad: navegación por idioma, título, preferencia guardada, borrado
  selectivo del progreso y enlace desde preferencias pasan en los cinco idiomas.
  Esto verifica la interfaz; no convierte en completo el aviso operativo ausente.
- Auditorías npm de dependencias de producción: cero vulnerabilidades conocidas
  reportadas tanto en frontend como en backend. No es garantía de ausencia de fallos.
- TypeScript de frontend y backend sin errores. Pruebas de analítica correctas.
  Cinco suites de controles de piloto/fuentes: 16 pruebas correctas; tras el ajuste
  de imágenes, repetidas tres suites afectadas: 13 pruebas correctas.

## Correcciones de esta comprobación

El validador rechazaba miniaturas del dominio oficial `thumb.wikimedia.org`, que
el cargador ya admitía. Se permite HTTPS en ese host exacto y su ruta de miniaturas
Commons; se mantienen los créditos y demás controles. Pruebas cubren el dominio
válido y rechazan suplantación de dominio, credenciales, HTTP y rutas ajenas.
La comprobación del catálogo ya no devuelve `PILOT_IMAGE_CREDITS_PENDING`.
Cambio local, pendiente de incluir en un despliegue posterior.

La prueba de navegación de privacidad reconoce el aviso inicial antes de pulsar
los enlaces; mantiene las comprobaciones de conservación selectiva de datos.

## Pendientes antes de abrir

1. Completar y desplegar el aviso operativo real y sus traducciones, resolviendo
   los pendientes descritos en `../legal/nomuvia-launch-review-20260919.md`.
2. Cerrar la revisión del uso efectivo de fuentes y del contenido. Registrar solo
   las revisiones realmente realizadas; no eliminar los controles para publicar.
3. Integrar las colecciones que se decida publicar, con rutas, imágenes/créditos,
   textos y audios vinculados a la aplicación. Las páginas de escucha no sustituyen
   esa integración. Las dos versiones antiguas incompletas deben quedar fuera.
4. Importar el catálogo aprobado y sus audios en Hetzner manteniendo el acceso
   privado; desplegar los cambios locales pendientes.
5. Comprobar allí búsqueda, detalle, reproducción y avance de audio, mapas y
   créditos con datos reales. Hoy no puede verificarse ese recorrido en producción
   porque la base está vacía. Retirar la restricción solo tras cerrar estos puntos.

Evidencia detallada privada en
`/home/jesusotero/.local/share/tour-guide/nomuvia/final-readiness-20260919/`:
`catalog.json` y `new-collections.json`. No se publicaron credenciales, alteraron
aprobaciones ni interrumpieron procesos de otros trabajos durante esta revisión.

## Continuación: material concreto para cerrar la revisión

Se preparó un paquete privado en
`/home/jesusotero/.local/share/tour-guide/nomuvia/revision-publicacion-20260919/`:

- `LEEME.md`: índice de 55 fichas con texto, coordenadas, fuentes y enlaces a
  425 archivos de audio vigentes (aproximadamente 690 MiB, sin duplicarlos).
- `manifest.json`: vincula cada ficha con la huella actual del tour, su ruta y
  las versiones y hashes de audio. No es un paquete de importación de la base.
- Un formulario de revisión por tour: identidad y fecha vacías, cuatro controles
  en false. Las fichas permiten revisar material incluso cuando el comando normal
  de aprobación se detiene por fuentes; no cambian los controles de publicación.
- `notice.draft.json` y `aviso-cinco-idiomas.md`: borrador operativo completo en
  cinco idiomas, con identidad/contacto existentes y pendientes expresamente
  identificados. Conservación de correo propuesta: 90 días desde la resolución,
  con borrado manual, pendiente de respuesta del responsable. Roles, garantías de
  servicios externos y ponderación siguen pendientes; no es aviso definitivo.

Se validó el borrador usando el lector real del frontend: los cinco idiomas
resuelven sin recurrir al español. El control real del backend sigue indicando
que el piloto no está abierto. Se comprobaron todas las referencias de archivos
y la correspondencia de huellas entre manifiesto y formularios. No se ha subido
este paquete a Hetzner ni importado datos. El modo de revisión de la aplicación
está restringido por diseño al entorno local; no se habilita en producción para
evitar las aprobaciones pendientes.
