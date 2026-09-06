# Caché de consultas Overpass

La ruta live reutiliza respuestas completas de Overpass durante 7 días. La clave incluye identidad de ciudad (QID u objeto OSM), consulta completa y versión del formato; cambiar zona, filtros o límites genera otra entrada. No incluye el idioma narrativo. Esta caché no elimina tours, fuentes ni bases de investigación.

Desde `backend`, ejecutar:

```sh
npx tsx scripts/admin/overpass-cache.ts expire --city=Q2807
npx tsx scripts/admin/overpass-cache.ts cleanup
```

`expire` marca las consultas de Madrid para renovar en su próxima consulta a Overpass. No descarga datos inmediatamente ni invalida una base de tour ya preparada o la caché histórica PostgreSQL del catálogo. Conservar la captura/checkpoint explícito del canario para comparaciones congeladas; la caché temporal no sustituye esa captura.

La descarga correcta reemplaza cada entrada atómicamente. Si falla, la copia anterior se conserva y el error se propaga: no se utiliza automáticamente información caducada ni se confunde un fallo con cero lugares. Las respuestas con errores parciales tampoco se guardan.

Configuración: `OVERPASS_CACHE_DIR` (predeterminado `tmp/osm-cache` relativo al directorio de ejecución) y `OVERPASS_CACHE_TTL_DAYS` (positivo, predeterminado 7). Usar una ruta absoluta compartida por backend y canarios para independencia del directorio de ejecución; montar un volumen persistente en contenedores.

La limpieza se intenta durante consultas correctas, como máximo una vez al día por proceso; elimina entradas de más de 30 días o dos TTL, lo que sea mayor. Sin procesos activos, no se ejecuta sola; el comando `cleanup` permite ejecutarla manualmente. Consultas idénticas simultáneas se agrupan dentro del mismo proceso; no hay bloqueo entre distintos procesos. Ejecutar la expiración manual sin una descarga simultánea de esa ciudad.

Este cambio no introduce servidores alternativos ni modifica la política de reintentos. Reduce consultas repetidas; un primer acceso o una renovación todavía puede recibir 429.
