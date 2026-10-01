# Publicación de Francia, Alemania e Italia

Fecha: 22 de septiembre de 2026. Destino: `https://nomuvia.com`.
Autorización del responsable: «quiero que lo publiquemos en nuestra pagina de
nomuvia.com».

## Resultado

Se publicaron los recorridos históricos generales de diez ciudades de Francia,
diez de Alemania y diez de Italia en español, inglés, francés, alemán e italiano.

- 150 versiones nuevas: 30 por idioma.
- 1.170 paradas y sus audios; 150 introducciones con aviso de voz sintética.
- Catálogo total: 216 tours, con 52 en español y 41 en cada uno de los otros
  cuatro idiomas.
- Inventario total: 41 ciudades, 205 páginas de ciudad, 216 páginas de ruta y
  422 URLs en el sitemap.
- Los nombres de las 30 ciudades se muestran y se pueden buscar en los cinco
  idiomas. La identidad guardada de la ciudad permanece en español para agrupar
  correctamente sus versiones.
- No se publicaron los MP3 combinados usados para revisión; Nomuvia sirve las
  introducciones y paradas independientes.

Release activa: `/srv/tour-guide/releases/20260922-europe-history`.

## Preparación y controles

Los 150 guiones maestros contienen 1.320 capítulos. Se comprobaron la identidad
de las cinco voces, el texto entregado al sintetizador, la procedencia, el hash y
la decodificación registrada de cada MP3. Las 1.170 paradas conservan QID,
coordenadas y créditos; las 30 rutas usan la geometría peatonal guardada. Las
fuentes cuya autorización no está documentada siguen marcadas como pendientes
bajo la modalidad `owner-authorized`; no se afirmó una revisión jurídica ni una
escucha humana completa. No se inventaron imágenes ni atribuciones.

El paquete ocupa 1,88 GiB. Los presets de voz locales y los instalados en
producción coincidieron por SHA-256. La candidata superó la compilación de backend
y frontend y la regresión de 421 páginas de ciudad/ruta más el sitemap.

El primer intento se revirtió automáticamente antes de activar la release porque
PostgreSQL normalizó la precisión de tres coordenadas y cambió la huella de
publicación. Se normalizaron todas las coordenadas de paradas a siete decimales y
se verificaron los 150 tours mediante una importación local real antes de repetir.
La segunda importación fue transaccional y no sobrescribió los 66 tours previos.

## Verificación pública

La comprobación posterior en `https://nomuvia.com` validó:

- 150 fichas con título, introducción, texto, coordenadas y orden exactos.
- 150 rutas peatonales.
- 300 peticiones parciales de audio con respuesta `206`.
- 15 reproducciones reales con avance de tiempo: una ciudad de cada país en cada
  idioma.
- 15 páginas de ruta en navegador móvil, con audio y sin desbordamiento.
- 422 URLs únicas en el sitemap.
- Totales públicos: `es=52`, `en=41`, `fr=41`, `de=41`, `it=41`.
- Backend, frontend y Caddy activos; sin avisos de servicio tras el lanzamiento.

Evidencia privada:
`/home/jesusotero/.local/share/tour-guide/nomuvia/europe-launch-20260922/`,
incluidos `manifest.json`, `catalog.json`, `audio.sha256` y `public-smoke.json`.

Ejemplos publicados:

- [París en español](https://nomuvia.com/es/paris/rutas/paris-recorrido-historico)
- [Berlín en alemán](https://nomuvia.com/de/berlin/rutas/berlin-historischer-rundgang)
- [Roma en italiano](https://nomuvia.com/it/roma/rutas/roma-percorso-storico)

## Recuperación

Antes de importar se guardaron el dump y la release anterior en
`/root/nomuvia-before-europe-20260922-attempt2`. Los 150 tours tienen IDs propios
y sus 1.320 audios están en un único directorio nuevo. La reversión elimina solo
esos IDs, retira ese directorio y restaura el enlace a
`20260920-canonical-head`; los 66 tours anteriores no se modifican.
