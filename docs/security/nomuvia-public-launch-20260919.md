# Nomuvia: lanzamiento autorizado por el responsable

19 de septiembre de 2026. El responsable indica expresamente: «Yo no quiero
revisarlos se q hicimos buen trabajo lanzalos a la nube». Esta decisión sustituye
el requisito previo del proyecto de una revisión manual adicional; no acredita
que se hayan realizado escuchas, paseos o revisiones jurídicas.

## Publicado

- https://nomuvia.com, sin autenticación básica. HTTPS y redirección de la raíz
  al catálogo conservados. Se mantiene noindex durante la prueba experimental.
- 55 tours: 11 ciudades por cinco idiomas, 425 paradas con sus audios vigentes
  y 55 introducciones independientes. Incluye las 35 narraciones regeneradas.
- Excluidas las dos versiones antiguas incompletas. Las colecciones temáticas
  independientes y Sicilia no se han importado: este lanzamiento corresponde a
  los 55 tours de la base de la aplicación inventariados en la revisión anterior.
- Aviso operativo en cinco idiomas, identidad y contacto elegidos por el usuario.
  No se adoptó el plazo propuesto de 90 días para Gmail sin su confirmación;
  se informa de conservación necesaria para la consulta y excepciones justificadas.
- Release: `/srv/tour-guide/releases/20260919-owner-launch-mobile`.

## Decisión de publicación y límites

La nueva modalidad `owner-authorized` registra una referencia de autorización y
mantiene los cuatro controles de revisión manual en false. La interfaz indica
«Publicado» en vez de afirmar revisión humana. La modalidad sigue exigiendo
audio completo, texto, ruta válida, atribuciones de imágenes y huella del material.
Cambiar texto, fuentes, ruta o audio invalida esa huella. La retirada sigue vigente.

Las fuentes de investigación con estado pending pueden permanecer pendientes
en esta modalidad; no se cambian a permitted ni se inventa una licencia. Los
orígenes restringidos siguen rechazándose y se exige HTTPS sin credenciales.
La autorización de publicación no es una conclusión jurídica sobre esas fuentes.
La revisión documental de proveedores, transferencias y derechos conserva los
límites del informe legal. No se afirma cumplimiento jurídico completo.

El catálogo exportado es una versión fija del contenido. No incluye snapshots de
investigación, trabajos, prompts de generación ni credenciales del PC. Sus registros
no dependen de blueprints locales: se validan por la huella de su contenido exportado,
incluidos créditos, imágenes, geometría y versiones de audio. La ruta anterior de
aprobación humana conserva sus comprobaciones de blueprint y fuentes.

## Validación

- Compilación backend y build de producción de Next completados. La primera
  compilación detectó una traducción ausente en la copia remota; se incorporó el
  archivo local completo y se recompiló correctamente.
- Cuatro suites de publicación/acceso: 15 pruebas correctas, incluida autorización
  explícita, contenido cambiado, fuentes restringidas y rechazo de HTTP.
- Validación real en Hetzner: 55 tours admitidos con sus 425 audios de paradas.
- Navegador externo sin credenciales: 11 tours en cada uno de los cinco idiomas,
  páginas de privacidad 200, detalle y ruta 200, petición parcial de audio 206
  con 1024 bytes, reproducción real con avance de currentTime.
- POST a `/api/backend/tours/generate`: 403. Acceso directo al frontend interno
  sin el token del proxy: 401. Caddy, backend y frontend activos.
- Aviso inicial y preferencias comprobados públicamente en cinco idiomas. La
  prueba móvil detectó desbordamiento por URLs largas del aviso; se corrigió
  permitiendo el salto de línea dentro de esas URLs y se recompiló el frontend.
  Repetición final: privacidad, navegación y anchura móvil correctas en cinco idiomas.
- App y base conservan usuario de servicio sin privilegios, SQL solo lectura,
  puertos internos en loopback y generación desactivada. No se habilitó analítica.

## Recuperación y evidencia

Antes de importar se guardaron aviso, Caddyfile, enlace de release anterior y
dump de la base vacía en `/root/nomuvia-before-launch-20260919` del servidor.
Para cerrar el acceso se puede restaurar su Caddyfile y recargar Caddy. Para
revertir la app se restaura el aviso y el enlace anterior, y se reinician ambos
servicios. El catálogo puede permanecer en la base, inaccesible por el control de
apertura anterior; no hace falta borrarlo para cerrar la publicación.

Paquete y scripts privados locales:
`/home/jesusotero/.local/share/tour-guide/nomuvia/launch-20260919/`.
La base local y los audios originales no fueron modificados por la exportación.
