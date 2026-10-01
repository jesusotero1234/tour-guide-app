# Plan de publicación de Europa en Nomuvia

Fecha: 21 de septiembre de 2026. Destino: `https://nomuvia.com`. Autorización
del responsable: «quiero que lo publiquemos en nuestra pagina de nomuvia.com».

## Objetivo y alcance

Publicar en el catálogo real de Nomuvia los recorridos históricos generales de
las diez ciudades seleccionadas de Francia, diez de Alemania y diez de Italia,
en español, inglés, francés, alemán e italiano.

La página `http://localhost:3188/` seguirá siendo solo una herramienta privada de
escucha y revisión. No forma parte del lanzamiento ni se crearán cinco páginas
estáticas para producción.

El lote añade:

- 30 recorridos base y 150 versiones de tour, una por idioma.
- 234 paradas por idioma: 1.170 audios de paradas en total.
- 30 introducciones por idioma: 150 audios de introducción.
- 150 páginas de ciudad y 150 páginas de ruta nuevas en los cinco idiomas.

Partiendo del catálogo actual de 66 tours, el resultado esperado es:

- 216 tours publicados: 52 en español y 41 en cada uno de los otros idiomas.
- 1.653 audios de paradas y 216 introducciones disponibles.
- 41 ciudades, 205 páginas de ciudad, 216 páginas de ruta y 422 URLs en el
  sitemap, contando también el catálogo.

## Condiciones antes de publicar

La preparación puede ejecutarse mientras termina el audio, pero la transferencia
al servidor no comenzará hasta que se cumpla todo lo siguiente:

- `translation-audio/status.json` indica `completed`.
- Los cuatro idiomas traducidos tienen 30 tours y 264 capítulos completos; el
  español conserva sus 30 tours y 264 capítulos validados.
- Existen los 150 guiones maestros y los 1.320 MP3 de capítulo esperados.
- Cada audio se puede decodificar, tiene duración positiva y coincide con el
  texto, idioma, voz, hash y procedencia registrados.
- Las 150 versiones conservan el mismo orden de paradas y la misma ruta de su
  ciudad; nombres, textos e introducciones corresponden a su idioma.
- Cada parada mantiene sus coordenadas y créditos de fuentes. Las imágenes son
  opcionales; nunca se inventarán imágenes ni atribuciones.
- Qwen vuelve a iniciarse después de liberar la GPU.

Si falla una condición se reanuda o corrige únicamente el bloque afectado. No se
sube un lote parcial.

## Preparación del paquete

Se reutilizará el procedimiento empleado para la colección temática:

1. Crear IDs deterministas y distintos para cada tour, parada e idioma.
2. Convertir los 150 maestros, rutas y audios al formato actual de PostgreSQL y
   del almacenamiento de Nomuvia, sin volver a sintetizar audio.
3. Conservar `sourceCredits`, la ruta peatonal, los hashes de audio y la huella
   de publicación de cada tour.
4. Registrar la autorización como `owner-authorized`, sin afirmar una revisión
   humana que no se haya realizado.
5. Generar las 30 ciudades y 150 rutas nuevas del inventario SEO usando los IDs
   del mismo paquete. Los slugs quedarán estables y las cinco versiones de cada
   ciudad se enlazarán como traducciones equivalentes.
6. Producir un manifiesto con cantidades, tamaños y SHA-256 de todos los archivos.

Los `tour.mp3` completos se conservan para revisión y descarga privada. La web
usa la introducción y los capítulos separados, por lo que solo esos 1.320 audios
se incorporan al almacenamiento público.

## Ensayo local

Antes de tocar producción se importará el paquete en una base local vacía con el
catálogo actual como punto de partida. La prueba rechazará IDs repetidos,
cantidades inesperadas, archivos sin registro, registros sin archivo, rutas no
válidas o una huella de publicación incorrecta.

Después se compilará el frontend con el inventario ampliado y se comprobarán:

- 216 tours admitidos por la API y los totales exactos por idioma.
- Texto, orden, coordenadas, fuentes, ruta y audio de las 150 versiones.
- 422 URLs únicas en el sitemap, con canonical e idiomas recíprocos.
- Páginas de ciudad y ruta con el contenido inicial completo.
- Catálogo, mapa y reproductor a 320, 390 y 1280 píxeles.

## Publicación en Hetzner

La publicación será un único procedimiento recuperable:

1. Medir el paquete terminado. Solo continuar si el servidor puede conservar
   simultáneamente el paquete de transferencia y su copia definitiva y todavía
   deja 2 GiB libres. El 21 de septiembre había 8,2 GiB disponibles.
2. Guardar un `pg_dump`, el enlace de la release activa y un inventario del
   almacenamiento actual.
3. Transferir el paquete a un directorio temporal y verificar todos sus SHA-256.
4. Copiar los audios a un directorio nuevo dentro del almacenamiento compartido;
   no sobrescribir archivos de los 66 tours actuales.
5. Importar los 150 tours en una sola transacción. La importación exige que aún
   existan exactamente 66 tours y que ninguno de los IDs nuevos esté presente.
6. Compilar una release nueva con el inventario SEO ampliado, verificarla en un
   puerto privado y cambiar el enlace `current` de forma atómica.
7. Reiniciar únicamente los servicios que cambien y comprobar que backend,
   frontend y Caddy permanecen activos.

## Comprobación pública

Después del cambio se verificará directamente en `https://nomuvia.com`:

- Catálogo: 216 tours; 52 `es` y 41 `en`, `fr`, `de` e `it`.
- Las 150 fichas devuelven el texto, las paradas y la ruta esperados.
- Una petición parcial de la introducción y de una parada de cada tour devuelve
  `206` y bytes de audio válidos.
- Reproducción real con avance de tiempo en una ciudad de cada país y cada idioma
  —15 combinaciones—, además de navegación, mapa y vista móvil.
- Las 300 páginas nuevas responden `200`; el sitemap contiene 422 URLs únicas y
  sus canonical y enlaces de idioma son coherentes.
- No aparecen respuestas `404`, `429`, `500` o `503` en la muestra final.

El resultado se guardará en un informe de lanzamiento con los hashes, recuentos,
release activa y pruebas realizadas.

## Recuperación

Todos los datos nuevos tendrán IDs y directorio propios. Si una comprobación
falla, un único procedimiento eliminará esos 150 tours mediante sus IDs,
retirará el directorio de audio nuevo y restaurará el enlace de la release
anterior. Los 66 tours existentes no se modifican. El dump completo queda como
recuperación adicional, no como primera opción.

## Estado actual

Completado y publicado el 22 de septiembre de 2026 en la release
`20260922-europe-history`. Resultado: 216 tours públicos, 1.653 paradas con
audio, 216 introducciones y 422 URLs en el sitemap. El informe de lanzamiento
está en `docs/tours/publicacion-europa-20260922.md`.
