# Servidor de la beta en Hetzner

**Último ajuste de interfaz:** `20260919-brand-header-v2`, logo original en la cabecera.
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
