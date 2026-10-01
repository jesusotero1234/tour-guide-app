# Plan de respaldo OSM estático para la generación europea

Fecha: 21 de septiembre de 2026

## Objetivo

Evitar que la preparación de los tours quede detenida cuando los servidores públicos de Overpass no responden. El sistema debe seguir intentando la ruta normal primero y, solo cuando el control compartido declare agotada la recuperación, obtener los mismos puntos de interés desde una copia estática oficial de OpenStreetMap.

Este respaldo no requiere mantener un servidor Overpass ni una base de datos permanente. Usa `osmium-tool` para leer extractos PBF de [Geofabrik](https://download.geofabrik.de/europe.html) y conserva los archivos locales durante un máximo de siete días.

## Flujo decidido

1. Consultar Overpass mediante el coordinador actual, con una sola petición de mapas simultánea y los límites de reintento existentes.
2. Usar inmediatamente cualquier respuesta por ciudad que siga válida en la caché de siete días.
3. Si Overpass responde, continuar sin descargar un país.
4. Si el coordinador termina con `source_recovery_exhausted`, activar el respaldo para Francia, Alemania o Italia.
5. Descargar una sola vez el extracto del país desde Geofabrik, reanudando una descarga parcial si se interrumpió.
6. Verificar el archivo con el MD5 publicado por Geofabrik antes de usarlo y publicar el archivo completo mediante un cambio de nombre atómico.
7. Extraer el rectángulo de la ciudad, conservar las geometrías necesarias y aplicar exactamente los mismos filtros, grupos de prioridad y límites usados por Overpass.
8. Guardar el resultado por ciudad en la caché existente con su procedencia: país, URL, fecha de descarga, suma de comprobación, versión de `osmium`, rectángulo y cantidad de elementos.
9. Reanudar las ciudades detenidas desde `prepare`; conservar los tours ya terminados y producir todos los textos antes del lote de audio.

## Archivos y caducidad

- Carpeta del respaldo: `backend/tmp/static-osm-fallback`.
- Extractos oficiales: `countries/<pais>-latest.osm.pbf`.
- Resultados por consulta: la caché OSM existente de cada lote.
- Vigencia: siete días desde la descarga validada.
- Limpieza: antes de cada uso se eliminan extractos vencidos, descargas parciales antiguas y artefactos temporales. Un archivo vencido nunca se usa para una nueva consulta.
- Concurrencia: un bloqueo compartido evita descargar o procesar el mismo país dos veces. Las demás fases del lote pueden seguir en paralelo.

## Integridad y recuperación

- Las descargas usan HTTPS, `curl --continue-at -`, un archivo `.part` y comprobación MD5.
- Una interrupción conserva la parte descargada para que el siguiente intento continúe desde allí.
- Un resultado local solo se declara `complete_under_policy` después de validar su estructura y persistirlo.
- Si el país no está soportado, falta `osmium`, falla la suma de comprobación o el disco no puede guardar el archivo, la preparación falla de forma explícita; no se inventan puntos ni se publica un tour incompleto.
- Los manifiestos y recibos conservan la prueba del origen igual que con una respuesta de Overpass.

## Validación antes de reanudar

1. Probar el filtrado con un extracto OSM pequeño y conocido, incluyendo nodos, áreas, relaciones, filtros combinados y límites separados.
2. Probar caché válida, caducidad, descarga interrumpida, suma incorrecta y exclusión de países no admitidos.
3. Ejecutar las pruebas del coordinador, la cola, los recibos y la compilación TypeScript.
4. Actualizar la vinculación entre las pruebas y los archivos ejecutados.
5. Reencolar únicamente las ciudades detenidas por mapas y lanzar el supervisor con textos primero y audio al final.

## Criterios de aceptación

- Un fallo definitivo de Overpass activa el respaldo sin intervención manual.
- Cada país se descarga como máximo una vez durante su periodo válido.
- Los archivos locales no se reutilizan después de siete días.
- La selección local respeta los mismos filtros y límites que la consulta pública.
- Los ocho tours ya completos permanecen intactos.
- Las 22 ciudades pendientes vuelven a la cola y el estado permite distinguir descarga, extracción, texto y audio.

## Operación

El reinicio seguro se hace con:

```bash
python3 /home/jesusotero/coding/tour-guide-app/backend/scripts/admin/restart-europe-batch.py --static-fallback
```

El estado se observa con:

```bash
tail -F /home/jesusotero/coding/tour-guide-app/backend/tmp/pilot-batch-europe-20260920/supervisor.log /home/jesusotero/coding/tour-guide-app/backend/tmp/pilot-batch-europe-20260920/*/prepare-runner.log
```
