# Estadísticas de la beta con Umami

## Producción: Nomuvia, 20 de septiembre de 2026

Umami **3.4.0** está instalado como servicio nativo `nomuvia-umami`, con Node 22,
en `/opt/nomuvia-umami/releases/3.4.0`. El panel escucha solo en
`127.0.0.1:3002`. PostgreSQL usa el propietario y base separados `nomuvia_umami`.
Se aplicaron las 26 migraciones oficiales de esa versión. Las instrucciones de
Compose que siguen son una alternativa; no describen este despliegue.

Caddy publica únicamente `GET/HEAD /statistics/script.js` y
`POST /statistics/api/send` en `nomuvia.com`; el resto de `/statistics/*` devuelve
404. El colector acepta hasta 32 KB y usa la IP de la conexión al proxy. No hay
DNS adicional, publicidad, grabación de sesiones ni publicación del panel.
Se usa la base GeoLite2 **Country**: país aproximado, sin ciudad, región ni GPS.
La telemetría de Umami está desactivada.

Las variables del servidor están en `/etc/tour-guide/umami.env` (root, 0600).
La contraseña inicial de administración fue sustituida por una aleatoria antes
de publicar el colector. La copia privada local está en
`/home/jesusotero/.local/share/tour-guide/nomuvia/umami-bootstrap.json` (0600);
contiene credenciales y no debe adjuntarse ni subirse al repositorio.

Acceso al panel desde el equipo del propietario:

```sh
ssh -N -i ~/.ssh/tour-guide-hetzner -L 3002:127.0.0.1:3002 nomuvia-admin@88.99.175.28
```

Abrir `http://localhost:3002` y entrar con `admin` y la contraseña del archivo
privado. Antes de exponer cualquier acceso público al panel, configurar 2FA.

`nomuvia-umami-retention.timer` ejecuta diariamente el SQL versionado de retención:
elimina eventos y propiedades de más de 90 días, y sesiones antiguas sin datos
vigentes. La ejecución diaria puede añadir hasta un día. El aviso desplegado lo
explica en los cinco idiomas. No hay copias periódicas de esta base configuradas;
antes de una actualización, hacer una copia temporal y borrarla tras validar la
migración para no prolongar la retención de estadísticas.

El frontend lee `UMAMI_SCRIPT_URL=https://nomuvia.com/statistics/script.js` y el
Website ID desde su archivo de entorno. Para desactivar la recogida, retirar esas
dos variables y reiniciar `nomuvia-frontend`; no borrar la base ni desactivar los
controles del piloto. Las copias anteriores al cambio están en
`/root/nomuvia-before-seo-20260920/`.

La integración está desactivada mientras el proceso del frontend no tenga
UMAMI_SCRIPT_URL y UMAMI_WEBSITE_ID válidos. Umami es un servicio separado.
Además de configurarla, cada visitante debe aceptar las estadísticas desde el panel
de privacidad. Sin decisión, con rechazo o tras retirarlo no se carga el tracker
ni se envían eventos nuevos. El software no tiene cuota por evento; consume recursos del servidor y necesita
copias de seguridad y actualizaciones.

## Instalación

Desde la raíz del repositorio:

1. Copiar deployment/umami.env.example a deployment/.env.umami.
2. Generar tres secretos independientes con openssl rand -hex 32 y completar
   UMAMI_DB_PASSWORD, UMAMI_APP_SECRET y UMAMI_TWO_FACTOR_KEY.
   El archivo .env.umami está ignorado por Git. Conservar una copia segura de las claves.
3. Iniciar con Docker Compose:

    docker compose --env-file deployment/.env.umami -p tour-guide-analytics -f deployment/umami.compose.yml up -d

   Si el servidor usa Compose v1, el comando equivalente es docker-compose.
   En Podman se necesita un proveedor Compose configurado.
4. Abrir el puerto local 3002 mediante un túnel SSH para la configuración inicial.
   Umami solo escucha en 127.0.0.1:3002 y PostgreSQL no publica ningún puerto.
5. Entrar con el usuario inicial admin y contraseña umami, cambiarla inmediatamente
   y activar 2FA antes de publicar. No compartir estas credenciales con participantes.
6. Añadir en Umami el sitio web y su dominio real. Copiar el Website ID.
7. Apuntar el subdominio de estadísticas al servidor e importar
   deployment/umami.Caddyfile en Caddy, definiendo UMAMI_HOST.
   La configuración presupone Caddy ejecutado en el host. Si está en un contenedor,
   adaptar la red antes de usarla. Conservar las restricciones del piloto existente.
8. Configurar en el proceso del frontend y reiniciarlo:

    UMAMI_SCRIPT_URL=https://SUBDOMINIO-REAL/script.js
    UMAMI_WEBSITE_ID=UUID-REAL-DEL-SITIO

No hace falta recompilar por estas dos variables: el layout las lee en el servidor.
La URL debe ser HTTPS (HTTP solo en localhost/127.0.0.1 para pruebas).
Nunca incluir contraseñas en la URL. El colector se resuelve como api/send junto a script.js.

## Panel y descargas

Entrar en el subdominio con una cuenta de Umami. Mantener el panel privado.
Consultar visitas, visitantes estimados, países y procedencia en la vista del sitio.
Elegir fechas y filtros; usar el botón de descarga para exportar estadísticas a CSV,
que se puede abrir con Excel o LibreOffice.

Crear un tablero Beta con audiencia, tours iniciados, paradas consultadas,
escucha, lectura y valoraciones. Las métricas específicas usan estos eventos:

| Evento | Significado |
| --- | --- |
| tour_started | Pulsa el botón para empezar el recorrido. |
| tour_activated | Inicio confirmado y al menos 120 segundos de escucha medidos en la sesión; una vez por tour y sesión. |
| stop_viewed | Abre una parada o cambia entre fotos, historia y mapa. |
| audio_started | Empieza a reproducir el audio de una parada. |
| audio_listening | Segundos incrementales de escucha; sumar seconds y dividir entre 60. |
| audio_ended | El reproductor llega al final; no demuestra que escuchó todo. |
| audio_error | El reproductor notifica un error. |
| reading_active | Segundos estimados de lectura visible con actividad reciente. |
| tour_rating | Puntuación 1–5 y comentario opcional de hasta 400 caracteres. |

Los eventos llevan tour_id, language y, cuando corresponde, place_id.
Los audios de introducción llevan `segment: introduction`, sin `place_id`, y
también contribuyen a la escucha y activación del tour.
Un audio puede iniciarse de nuevo al montar el reproductor: usar visitantes/sesiones
únicos para porcentajes y contar eventos solo para acciones.
stop_viewed no significa parada consumida. No se deduce tour completado de saltar
al final de un audio. El progreso restaurado del navegador no se envía como escucha nueva.
Las valoraciones no tienen autenticación: no son una votación de una persona por cuenta.

En las exportaciones de propiedades agrupadas, ponderar cada valor seconds por su
recuento; no sumar únicamente los valores distintos. No sumar lectura y audio como
tiempo total del tour: pueden ocurrir simultáneamente.
El contador normal de duración de visita de Umami no sustituye estas mediciones.

## Calidad de los datos

- Respetamos Do Not Track y la exclusión local umami.disabled.
- Para excluir nuestras pruebas: localStorage.setItem('umami.disabled', '1').
  Para volver a medir: localStorage.removeItem('umami.disabled') y recargar.
- No se envían GPS, cuentas, identificadores propios de persona ni URLs de audio.
- Se excluyen búsquedas, fragmentos de URL y direcciones completas de procedencia.
  Las propiedades `acquisition_source`, `acquisition_medium` y `entry_page`
  conservan el canal inicial durante la sesión de medición, que caduca tras
  30 minutos de inactividad. Se reconocen Google, Bing, DuckDuckGo y referencia
  externa. Las campañas admiten solo las fuentes hotel/hostel/community/social/newsletter,
  medios qr/referral/social/email y el código `madrid-pilot`; otros valores no se envían.
  Consultar estas propiedades de eventos: no confundirlas con los informes UTM
  nativos de Umami, porque no se envía la query completa.
- País significa país aproximado de conexión, no nacionalidad. Verificarlo desde
  una conexión externa tras configurar el proxy; una prueba local no comprueba geolocalización.
- Lectura es una estimación: página visible y actividad en los últimos 60 segundos.
- La escucha admite segundo plano, pausas y reproducción repetida. Los saltos no
  añaden minutos. Cierre abrupto, bloqueo de red o del navegador pueden perder eventos;
  no hay cola offline ni reintentos automáticos que dupliquen mediciones.
- Las valoraciones solo muestran éxito tras una respuesta de colección válida.
  Una respuesta perdida después de guardar puede provocar un duplicado al reintentar.
- En instalaciones nuevas, completar proveedor/alojamiento, conservación y
  condiciones de medición antes de activar la recogida. En Nomuvia ya están
  configurados el aviso traducido y el borrado diario descritos arriba.

## Operación

Hacer copias periódicas de PostgreSQL y guardar las claves por separado:

    docker compose --env-file deployment/.env.umami -p tour-guide-analytics -f deployment/umami.compose.yml exec -T db pg_dump -U umami -d umami -Fc > umami-backup.dump

Conservar la copia fuera del servidor y ensayar la restauración en una base separada.
No usar down -v: elimina los datos. Para actualizar, hacer copia primero, revisar las
notas de Umami y cambiar deliberadamente la imagen fijada en el compose.
Mantener el puerto 3002 en loopback. El panel requiere login de Umami, pero script.js
y api/send deben aceptar peticiones de los navegadores de los participantes.
No añadir autenticación básica a todo el subdominio: rompería la medición.

## Validación

Con Node 22 y dependencias del frontend instaladas:

    node frontend/scripts/test-analytics.cjs
    cd frontend && npx tsc --noEmit --incremental false

El smoke frontend/scripts/test-analytics-browser.cjs usa Playwright con las variables
PLAYWRIGHT_MODULE, CHROMIUM_PATH y BASE_URL. Requiere un frontend configurado con la URL
de ejemplo stats.example.org y el UUID de su encabezado; intercepta las peticiones.
Prueba inicio, parada, fallo al enviar valoración y reintento confirmado.
No prueba una instancia real de Umami, su autenticación, CSV o geolocalización:
esas comprobaciones quedan para el servidor y dominio definitivos.

Fuentes: https://docs.umami.is/docs/install y
https://github.com/umami-software/umami/releases/tag/v3.4.0

## Consentimiento (19 de septiembre de 2026)

Panel disponible en los cinco idiomas de la interfaz, con aceptar/rechazar al mismo
nivel y ajustes permanentes en el pie. Sin configuración de Umami no se muestra
el aviso inicial; los ajustes siguen accesibles. La elección versionada se guarda
en `tour-privacy-v1` y caduca a los 180 días; no se reutiliza una elección inválida.
Si el almacenamiento está bloqueado, no se activa la medición. El rechazo y la
retirada no impiden leer ni escuchar tours, ni cambian el permiso independiente de GPS.

El tracker utiliza `data-auto-track="false"`; las visitas y eventos salen por el
mismo control de consentimiento. Se comprueba el permiso en cada envío y se
sincroniza su retirada entre pestañas. No se recuperan tiempos de lectura o escucha
anteriores a la aceptación. Retirar el permiso no borra datos ya recibidos.
Configuración según la [documentación de Umami](https://docs.umami.is/docs/tracker-configuration).

Verificación adicional: `node frontend/scripts/test-consent-browser.cjs`, con las
mismas variables del smoke de analítica y un servidor de prueba configurado.
Comprueba bloqueo inicial, rechazo persistente, aceptación, retirada entre pestañas,
caducidad, almacenamiento bloqueado, DNT, elección corrupta y navegación por teclado.
El colector está simulado: queda por verificar la instancia real al desplegar.

La regresión `frontend/scripts/test-audio-consent.cjs` arranca un frontend de
producción con fixtures y comprueba escucha real del elemento de audio en la
introducción y una parada, así como la retirada del permiso y la ausencia de
eventos posteriores. Usa `PLAYWRIGHT_MODULE` y `CHROMIUM_PATH` como las otras
pruebas de navegador.

Validación pública del 20 de septiembre: navegador real con consentimiento,
introducción y más de 120 segundos de narración de una parada, una única
activación y procedencia Google conservada. Se verificó la persistencia en
PostgreSQL, país sin ciudad/región, retirada del permiso y borrado de una
fila sintética de más de 90 días sin afectar a una reciente. Las pruebas usaron
un sitio Umami separado que se eliminó al terminar; no se mezclaron con las
estadísticas de Nomuvia. Compilación y regresión del reproductor superadas.
