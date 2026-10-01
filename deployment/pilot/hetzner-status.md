# Servidor de la beta en Hetzner

**Release actual:** `20260920-canonical-head`. Canonical en la cabecera HTML
inicial y redirección permanente de la portada al catálogo. Detalle al final.

**Ampliación SEO, 20 de septiembre:** `20260920-seo-catalog`, 55 páginas
de ciudad y 66 versiones de tour en cinco idiomas; 122 URLs en el sitemap.
Se conservan Search Console y Umami con consentimiento. Ver «Ampliación SEO»
al final. Las entradas anteriores son históricas.

**Ajuste de interfaz del 19:** `20260919-brand-header-v2`, logo original en la cabecera.
Diseño base: `20260919-mobile-design`, catálogo visual móvil,
ficha previa del paseo y reproductor actualizado. Publicado y comprobado sobre
HTTPS el 19 de septiembre. Catálogo y audios sin cambios. Detalles y reversión:
`docs/operations/nomuvia-mobile-design-20260919.md`.

**Última ampliación:** release `20260919-thematic`, 66 tours publicados. Se añadieron
once tours temáticos en español, 58 audios de paradas y once introducciones.
Comprobaciones y enlaces: `docs/tours/publicacion-tematicos-20260919.md`.

**Estado actual, 19 de septiembre de 2026:** abierto por instrucción expresa del
responsable. Release `20260919-owner-launch-mobile`, 55 tours, 425 audios de paradas y 55
introducciones. Caddy usa `Caddyfile.nomuvia-public`. Aviso operativo en cinco
idiomas; sin contraseña pública, generación bloqueada. Las secciones siguientes
son historial de preparación. Detalles, límites y reversión en
`docs/security/nomuvia-public-launch-20260919.md`.

Preparación inicial: 19 de septiembre de 2026.

- Nombre: `tour-guide-beta`.
- IPv4: `88.99.175.28`.
- Plan elegido por el responsable: CX23.
- Sistema comprobado: Ubuntu 24.04.4 LTS; aproximadamente 4 GB de RAM y disco de 40 GB.
- Acceso: clave Ed25519 dedicada `tour-guide-hetzner`; privada fuera del repositorio,
  en `/home/jesusotero/.ssh/tour-guide-hetzner`. No copiarla al servidor.
- Actualizaciones de paquetes instaladas; actualizaciones de seguridad automáticas
  habilitadas, sin reinicios automáticos.
- SSH admite claves; contraseña y autenticación interactiva desactivadas. El
  acceso directo de root está desactivado; usar `nomuvia-admin` con la misma clave
  y `sudo -n` para administración. Nueva conexión y sudo comprobados.
- Cortafuegos UFW: entrada denegada salvo TCP 22, 80 y 443, también en IPv6.
  Permitir HTTP/HTTPS no inicia un servidor web ni publica la aplicación.
- Swap de 2 GB configurada para persistir al reiniciar.
- Usuario de servicio `tour-pilot`, sin acceso interactivo; directorios privados
  `/srv/tour-guide` y `/etc/tour-guide` preparados para el futuro despliegue.

La preparación del host queda reproducible en `bootstrap-host.sh`, ejecutado
como root tras actualizar paquetes y comprobar el acceso por clave. El script
no instala la app, no contrata recursos y no configura backups del proveedor.

## Pendiente de publicación

- Marca y dominio elegidos: **Nomuvia**, `nomuvia.com`, con Cloudflare Registrar.
  Compra confirmada. DNS de Cloudflare configurado en modo solo DNS: registro A
  del dominio principal a `88.99.175.28` y CNAME `www` al dominio principal.
- Backups de Hetzner aplazados por decisión expresa del responsable. El PC conserva
  los originales; los futuros datos exclusivos del servidor necesitarán una copia.
- La aplicación y PostgreSQL están instalados y activos internamente; catálogo vacío.
  Umami y los tours todavía no están desplegados.
- Faltan completar el aviso del piloto, importar tours revisados y comprobar la
  entrada HTTPS con invitaciones, según `docs/legal/pilot-operations-20260908.md`.

No se ha abierto acceso a participantes ni se han copiado credenciales locales,
material de investigación o bases de datos al servidor.

## Verificación del host

Después de reiniciar, el servidor arrancó con kernel `6.8.0-139-generic` y se
comprobó una nueva conexión SSH con la clave dedicada. Cortafuegos, swap y
actualizaciones automáticas permanecen activos; no queda reinicio pendiente.
La conexión desde el equipo de trabajo verifica el acceso remoto administrativo.


## Dominio y Cloudflare

El responsable elige Cloudflare para registrar y gestionar el dominio. Consulta
RDAP de Verisign para `nomuvia.com`: HTTP 404 el 19 de septiembre de 2026; no es una
reserva ni confirma el precio o la disponibilidad final del registrador. La revisión
directa de marcas en EUIPO/OEPM y de las tiendas de aplicaciones sigue pendiente;
una búsqueda web del nombre no equivale a esa revisión.

Propuesta inicial de despliegue: `nomuvia.com` para la web y la aplicación, con
`www` redirigido al dominio principal. La API y los audios conservan las rutas
protegidas del mismo origen; el backend no necesita un subdominio público. Los MP3
se alojarán en Hetzner y los originales permanecerán en el PC. El responsable
ha creado los registros DNS indicados.

Empezar con DNS de Cloudflare y HTTPS de Caddy en Hetzner, sin activar todavía el
proxy/CDN para la beta. Si se activa después, verificar condiciones de distribución
de audio, TLS Full (strict), aislamiento del origen y exclusión de caché de tours,
API y MP3 privados. Registrar el dominio no activa por sí solo estas protecciones.
No se presupone que un subdominio llamado `cdn` proporcione almacenamiento o CDN.


## HTTPS operativo

Caddy 2.11.4 instalado desde su repositorio oficial estable. Certificados de
Let's Encrypt emitidos para `nomuvia.com` y `www.nomuvia.com`, con renovación
automática gestionada por Caddy. Configuración desplegada:
`deployment/pilot/Caddyfile.nomuvia-pending`.

Comprobación desde el equipo externo, sin desactivar la validación de certificados:

- HTTP del dominio principal redirige a HTTPS (308).
- HTTPS principal responde 503 con el aviso de beta en preparación.
- HTTPS de `www` redirige al dominio principal (301).
- Las rutas de API también responden 503; no existe entrega de tours ni audios.
- Respuestas del dominio principal con `Cache-Control: private, no-store` y
  `X-Robots-Tag: noindex, nofollow`.

El aviso provisional confirma dominio y HTTPS, no la publicación de la aplicación.
Cloudflare actúa como registrador/DNS, sin proxy/CDN en esta fase. No se ha activado
ninguna copia de pago, analítica ni apertura del piloto.


## Datos del responsable

El responsable ha facilitado nombre y correo de contacto; posteriormente solicita
usar la forma abreviada de su nombre en el aviso pendiente. Se guardan en
`/etc/tour-guide/pilot-notice.json` (root:tour-pilot, 0640), con copia local privada
en `/home/jesusotero/.local/share/tour-guide/nomuvia/pilot-notice.json` (0600).
Los datos personales no se incorporan a la plantilla del repositorio. El aviso
operativo todavía está incompleto y `launchReview.acceptedForPilot` sigue en false.
No se ha publicado el correo ni configurado un servicio de correo o reenvío.

## Revisión de seguridad del 19 de septiembre

Configuración SSH adicional `/etc/ssh/sshd_config.d/00-nomuvia-admin.conf`,
con copia en `sshd-nomuvia-admin.conf`: solo `nomuvia-admin`, clave obligatoria,
sin root, contraseña, X11 ni reenvío del agente. Permite túneles locales para
administración. Instalar solo tras crear el usuario y verificar su clave y sudo.
Esta configuración precede al archivo de bootstrap; volver a ejecutar la
preparación base no reactiva el acceso root.

Caddy usa `/etc/systemd/system/caddy.service.d/security.conf`, copia en
`caddy-security.conf`: sin elevación de privilegios, sistema de archivos de solo
lectura salvo sus directorios de estado y logs, sin acceso a homes y capacidad
limitada a escuchar puertos bajos. HTTPS y servicio comprobados tras reiniciar.

Informe y pendientes: `docs/security/nomuvia-security-review-20260919.md`.

## Aplicación instalada en privado

El responsable confirma 2FA de Hetzner y Cloudflare. Preparación del 19 de septiembre:

- Node.js 22.23.2 instalado desde nodejs.org; archivo contrastado con SHASUMS256.txt
  del mismo origen HTTPS. Ruta estable `/opt/nomuvia-node`.
- PostgreSQL del repositorio Ubuntu, solo localhost IPv4/IPv6. Base nueva `nomuvia`;
  todas las migraciones del proyecto aplicadas, sin copiar datos del PC.
- Release `/srv/tour-guide/releases/20260919-security`, enlace `current`. Código
  propiedad de root, grupo tour-pilot; caché de Next escribible por el servicio.
  `source-manifest.json` registra hashes de la copia de fuentes utilizada.
- Copia explícita de fuentes y archivos de instalación: excluye .env, bases de
  datos locales, audio, trabajos de generación, referencias de voz y capturas.
  Compilación en el servidor con usuario administrativo sin ejecutar npm como root.
- Servicios `nomuvia-backend` y `nomuvia-frontend` activos y habilitados al arrancar;
  unidades reproducidas en los archivos .service de esta carpeta. Sin reinicios
  inesperados ni servicios fallidos en la comprobación final.
- Backend en 127.0.0.1:3001; Next en 127.0.0.1:3000. Backend con red restringida
  por systemd a loopback, sin salida hacia proveedores de generación.
- Secretos exclusivos generados en `/etc/tour-guide/{backend,frontend,migration,proxy}.env`,
  root 0600, sin mostrarlos ni copiarlos al repositorio. La aplicación usa
  `nomuvia_app` con SELECT, sin INSERT ni permisos de migración; el propietario
  `nomuvia_migrate` tiene credenciales separadas para cambios de esquema/importación.
- Logs en `/var/log/tour-pilot` con permisos restringidos; configuración logrotate
  instalada y validada en modo debug, temporizador activo. No se ha probado todavía
  una rotación real de siete días; no se confunde con retención de PostgreSQL/journal.

Pruebas reales: backend /health 200; Next sin cabecera de confianza 401, /about
con cabecera interna 200, catálogo interno 503 porque el aviso sigue incompleto.
Consulta mediante Prisma a la base nueva: cero tours. Desde el PC, puertos 22/80/443
accesibles y 2019/3000/3001/5432 inaccesibles en IPv4. No se hizo sondeo IPv6 externo.
Caddy continúa sirviendo preparación con 503 y TLS válido; no se ha conectado el
proxy público a la aplicación ni creado invitaciones de participantes.

El responsable pide excluir los tours que otro agente está generando hasta que
termine. No se han detenido procesos locales, reiniciado su entorno ni modificado
su base de datos. La instalación remota no es todavía la apertura de la beta.

## Acceso de revisión para el responsable

Caddy sirve ahora `Caddyfile.nomuvia-private`: acceso HTTPS mediante invitación
individual `jesus`, con contraseña aleatoria. Se mantiene el cierre del catálogo
por `acceptedForPilot=false`; no se han aprobado ni publicado tours. `www` redirige
al dominio principal. La contraseña se conserva solo en el archivo privado local
`/home/jesusotero/.local/share/tour-guide/nomuvia/acceso-privado.txt` (0600);
se eliminó la copia temporal en texto claro del servidor. El servidor usa hash
bcrypt en `/etc/tour-guide/proxy.env` (0600), leído mediante un drop-in de Caddy.

Pruebas sobre HTTPS real: sin invitación, páginas, API y petición Range de audio
con cabeceras falsificadas responden 401. Con invitación, /about y /privacy 200,
catálogo 503 por cierre y POST de generación 403. GET a la ruta de generación da
405 porque solo define POST; no es un fallo de protección. No se ha probado
reproducción real porque no hay tours importados.

Aviso de privacidad preparado como borrador privado, no sustituye al aviso activo:
`/home/jesusotero/.local/share/tour-guide/nomuvia/borrador-privacidad.md`.
Zona de alojamiento comprobada por metadatos Hetzner: nbg1-dc3.
Declaración «solo VOXCPM2» guardada sin modificar presets ni audio.
La revisión del catálogo está en `docs/security/nomuvia-catalog-readiness-20260919.md`.

## Correcciones de interfaz publicadas

La cabecera, el título del navegador, el catálogo y la página informativa usan
Nomuvia. Release actual: `/srv/tour-guide/releases/20260919-privacy-languages`.
Privacidad contiene español, inglés, francés, alemán e italiano; sus enlaces
conservan los cinco idiomas y la página resuelve idioma explícito, cookie o navegador.
El botón de borrado y sus mensajes también están traducidos. Compilación remota y
prueba de navegador contra HTTPS superadas en los cinco idiomas, incluida la
navegación desde el selector, acceso directo, configuración y borrado selectivo
sin eliminar consentimiento ni datos ajenos. Se mantiene el catálogo cerrado y
no se han modificado tours, audios ni procesos de generación.

## Aviso de primera visita

Release actual: `/srv/tour-guide/releases/20260919-first-visit`. El aviso aparece
sin preferencias guardadas aunque Umami no esté configurado. En ese caso informa
del almacenamiento local y ofrece Entendido y Configurar privacidad; no activa
estadísticas ni solicita aceptar una analítica inactiva. Se conserva una elección
negativa al confirmar y se respetan preferencias existentes. Prueba de navegador
sobre HTTPS en cinco idiomas: primera visita, persistencia, caducidad, estadísticas
desactivadas y anchura móvil correctas. Solo se reinició el frontend remoto.

## Icono de marca

Release actual: `/srv/tour-guide/releases/20260919-brand-icon`. El icono de pestaña
usa la imagen de símbolo sin texto facilitada por el responsable, sin redibujarla.
`frontend/src/app/icon.png` sustituye al favicon anterior. Compilación correcta;
HTML público autenticado declara el icono PNG y la descarga coincide byte a byte
con el archivo original. Se mantiene la protección por invitación.

## Redirección del dominio principal corregida

Release actual: `/srv/tour-guide/releases/20260919-public-redirect`. La URL interna
de Next producía una redirección a https://localhost:3000/tours desde la portada.
El middleware usa ahora el Host público conservado por el proxy autenticado.
La primera comprobación externa detectó además que se conservaba el puerto interno
3000. Corrección adicional para limpiar el puerto antes de aplicar Host; validación
externa pendiente hasta publicar esa corrección.

Validación final: release `/srv/tour-guide/releases/20260919-public-redirect-final`.
La prueba de regresión verifica también un Host público sin puerto frente a un
origen con puerto interno. Build y test de acceso superados. Navegador real contra
HTTPS: / y /passes redirigen a https://nomuvia.com/tours con respuesta 200 y selector
de idioma visible. Sin credenciales, / sigue respondiendo 401.

## SEO y medición: 20 de septiembre de 2026

Primera entrega SEO; ampliada en la sección siguiente.

- Release activo: `/srv/tour-guide/releases/20260920-seo-madrid-v2`. Se clonó la
  versión `20260919-brand-header-v2`, se aplicaron únicamente los archivos del
  manifiesto `seo-deployment-manifest.json`, se compiló y se cambió el enlace
  `current`. La segunda versión añade la medición de escucha de la introducción,
  identificada como segmento sin inventar un UUID de lugar. El backend, la base
  de tours y los audios no se modificaron.
- Caddy permite indexar el catálogo y cinco páginas nuevas: `/es/madrid`,
  `/en/madrid`, `/es/madrid/rutas/madrid-esencial`,
  `/en/madrid/rutas/madrid-highlights` y
  `/es/madrid/rutas/madrid-de-los-austrias`. `robots.txt` y `sitemap.xml`
  están disponibles. El sitemap contiene seis URLs, excluye el reproductor y
  elimina páginas/equivalencias cuando se retira un tour del catálogo admitido.
- La URL determina el idioma del HTML y los metadatos. El contenido de las
  paradas se entrega desde el servidor; mapa bajo demanda y reproducción
  siguen usando los componentes existentes. Se verificaron audio real,
  navegación móvil, canonical, hreflang, cabeceras y errores del backend.
- `GOOGLE_SITE_VERIFICATION` está configurado en el entorno privado del
  frontend con la etiqueta facilitada por el propietario. Se comprobó en el
  HTML de la portada redirigida y de las páginas nuevas. El propietario ha
  confirmado la verificación en Search Console y el envío del sitemap con
  estado «Correcto»; no se ha confirmado indexación.
- Umami 3.4.0 corre en `nomuvia-umami`, puerto local 3002, con base separada
  `nomuvia_umami`. Solo se publican script y colector bajo `/statistics/`.
  El panel sigue accesible por túnel SSH. La contraseña inicial se sustituyó.
- Recogida sujeta a consentimiento y DNT; atribución por canales limitados,
  sin búsquedas ni referente completo. GeoLite2 Country aporta solo país.
  Grabación de sesiones y telemetría de Umami desactivadas. Retención de
  90 días con eliminación diaria mediante `nomuvia-umami-retention.timer`.
  El aviso de privacidad se actualizó en sus cinco traducciones y se
  sincronizó con la copia local privada. Detalles en [UMAMI.md](../UMAMI.md).
- Copias de configuración anteriores: `/root/nomuvia-before-seo-20260920/`.
  Para volver al frontend anterior, restaurar su enlace de release y
  reiniciar el servicio. Para desactivar estadísticas, retirar únicamente
  `UMAMI_SCRIPT_URL` y `UMAMI_WEBSITE_ID` del entorno y reiniciar el frontend.
  Conservar `GOOGLE_SITE_VERIFICATION`. No eliminar bases de datos.

## Ampliación SEO: 11 ciudades y cinco idiomas

Release activo: `/srv/tour-guide/releases/20260920-seo-catalog`, clonado de
`20260920-seo-madrid-v2` y compilado de forma aislada antes de cambiar `current`.
El manifiesto `seo-catalog-manifest.json` registra 18 archivos añadidos/modificados,
los hashes anteriores y la retirada de dos páginas exclusivas de Madrid,
sustituidas por rutas dinámicas que conservan sus URLs.

- 55 páginas de ciudad, 66 páginas de tour y el catálogo: 122 URLs. Las once
  rutas generales tienen es/en/fr/de/it; los once temáticos solo español.
  Inventario revisado en `frontend/src/lib/seoInventory.ts`. Las publicaciones
  futuras se incorporan deliberadamente; cambiar el contenido de un tour
  existente se refleja en cada lectura, sin almacenar copias públicas obsoletas.
- Canonical propio, idioma de URL, equivalencias recíprocas, contenido completo
  de paradas en HTML inicial y enlaces de ciudad/tour. Sitemap y páginas vuelven
  a comprobar la admisión pública. La etiqueta de Google sigue presente.
- Pruebas locales: compilación, 121 páginas de ciudad/tour y 122 URLs del sitemap,
  retirada de versiones, fallo del backend, controles de acceso y lectura,
  cinco idiomas, navegación móvil, catálogo y reproductor. Persisten únicamente
  los dos avisos previos de dependencias de hooks en `TourExperience`.
- La publicación detectó respuestas 429 al leer dos veces el sitemap: la API
  agrupaba todas las peticiones de Next en la dirección loopback con el valor
  predeterminado de **100 por 900.000 ms**. En `/etc/tour-guide/backend.env`
  se fijaron **`RATE_LIMIT=1200`** y **`RATE_LIMIT_WINDOW_MS=60000`**. Es un
  presupuesto compartido del servicio, no un límite individual ni una prueba
  de capacidad. Se reinició únicamente la API para aplicar este ajuste;
  su código, base de tours y audios permanecen iguales.
- Copia privada anterior del entorno: `/root/nomuvia-before-seo-catalog-backend.env`
  (0600). Caddy, las credenciales, la configuración de Google y Umami permanecen
  iguales. El ajuste de límite no amplía métodos ni permisos de acceso.
- Para revertir las páginas, cambiar `current` a la release anterior y reiniciar
  `nomuvia-frontend`. Si también se revierte el límite, restaurar esa copia de
  `backend.env` y reiniciar `nomuvia-backend`; hacerlo restablece el límite que
  bloqueaba el rastreo. No eliminar datos ni retirar la etiqueta de Google.

El propietario había confirmado Search Console y el envío inicial del sitemap
como «Correcto». La dirección del sitemap no cambia; no se ha confirmado aún su
lectura posterior a esta ampliación ni la indexación de las páginas nuevas.

Validación pública final: 122/122 URLs HTTPS con respuesta 200, títulos únicos,
canonical, equivalencias recíprocas, etiqueta de Google y todas las transcripciones
publicadas en HTML inicial. Navegador real en fr/de/it a 320, 390 y 1280 píxeles,
mapas, audio de muestra y entrada/reproducción del tour italiano correctos.
En las últimas 900 respuestas de API comprobadas después del ajuste: 896 respuestas
200 y cuatro 206; ninguna 429/500/503. Servicios activos sin reinicios inesperados.
Informe: `output/seo/catalog-expansion-verification.json`.

## Selector de idioma compacto: 20 de septiembre

Release `/srv/tour-guide/releases/20260920-language-menu`, basada en
`20260920-seo-catalog`. El idioma actual aparece junto al logo; al tocarlo se
abren enlaces de 48 px de alto a las traducciones existentes, con el idioma
actual marcado. Cierra al elegir, tocar fuera, salir con Tab o pulsar Escape.
Las rutas con un solo idioma muestran su nombre sin un desplegable vacío.
Se mantienen los enlaces en HTML y el selector básico funciona sin JavaScript.

Compilación local/remota y prueba SEO existente superadas. Comprobación en
HTTPS real: cinco idiomas a 320, 390 y 1280 px, cabecera en una fila,
navegación táctil y por teclado, cambio a la misma ciudad/tour, cierre y
alternativa sin JavaScript. Informe `output/seo/language-selector-verification.json`
y capturas `language-selector-mobile-{closed,open}.png` en esa misma carpeta.
Solo cambian tres archivos del componente/estilo y la interacción del test
existente. `language-menu-manifest.json` contiene hashes y release anterior.
Reversión: restaurar el enlace `current` a `20260920-seo-catalog` y reiniciar
`nomuvia-frontend`. No hubo cambios en API, catálogo, audios ni configuración.


## Consolidación canónica: 20 de septiembre

Search Console mostró `/tours` como duplicada, sin canónica declarada y con
`https://nomuvia.com/` elegida por Google (último rastreo indicado: 13:59:39).
La solicitud de indexación aparece enviada. La revisión pública encontró la
canónica de `/tours` fuera del `<head>` inicial, también con User-Agent de
Googlebot, y una redirección temporal 307 desde `/` al catálogo. Esto identifica
señales mejorables; no prueba la causa exacta de la selección de Google.

Release `/srv/tour-guide/releases/20260920-canonical-head`, copiada de la anterior
y cambiando únicamente `frontend/next.config.mjs` y `frontend/src/middleware.ts`.
Los metadatos se entregan en el `<head>` inicial para todos los agentes mediante
`htmlLimitedBots: /.*/`; la portada usa 308 hacia `/tours`. La redirección de pases
sigue siendo temporal. El coste es esperar los metadatos antes de entregar el
HTML inicial, en lugar de transmitirlos después.

Compilación local/remota y regresión SEO con navegador superadas: 121 páginas de
ciudad/ruta, 122 URLs del sitemap, cinco idiomas, retirada, errores y acceso. Se
añadió comprobación de canónica en cabecera y de redirecciones. Antes de activar,
la release candidata se verificó en un puerto local con el entorno de producción.
Se reinició únicamente `nomuvia-frontend`; API, Umami, datos y audios permanecen
con su configuración anterior. Verificación HTTPS posterior del catálogo para
navegador/Googlebot y de la redirección permanente correcta.

Evidencia local: `output/seo/canonical-fix-20260920/`, incluidos manifiesto,
pruebas y respuestas públicas. El manifiesto fija las huellas antes/después.
Reversión: restaurar `current` a `20260920-language-menu` y reiniciar el frontend.
Google todavía debe rastrear y reprocesar las señales; no se declara conseguida
la indexación ni se ha enviado otra solicitud desde el agente.

## Expansión europea: 22 de septiembre

Release activa: `/srv/tour-guide/releases/20260922-europe-history`. Se añadieron
150 tours históricos de 30 ciudades de Francia, Alemania e Italia en cinco
idiomas. El catálogo contiene 216 tours y 1.653 paradas con audio; el sitemap
contiene 422 URLs. Se amplió el inventario SEO y el diccionario de nombres de
ciudad sin modificar los 66 tours anteriores.

Importación transaccional con IDs deterministas y audios en un directorio propio.
Antes del cambio se guardaron el dump y la release anterior en
`/root/nomuvia-before-europe-20260922-attempt2`. Verificación pública: 150 fichas,
150 rutas, 300 rangos de audio `206`, 15 reproducciones reales y 15 páginas
móviles correctas. Servicios activos y sin avisos posteriores. Informe completo:
`docs/tours/publicacion-europa-20260922.md`.
