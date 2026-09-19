# Revisión de seguridad de Nomuvia — 19 de septiembre de 2026

## Alcance y estado

Revisión del host propio 88.99.175.28, dependencias locales de producción,
controles de acceso del piloto y entrega de audio. Al inicio, la aplicación y PostgreSQL no estaban desplegados. Tras la confirmación
del 2FA se instalaron internamente con una base vacía y credenciales nuevas;
Caddy mantiene HTTPS público con respuesta 503 de preparación.
No es una auditoría exhaustiva, una prueba de penetración completa ni una garantía
contra futuros ataques. No se ha investigado el servidor comprometido antiguo.

## Hallazgos corregidos

- Dependencias backend: npm audit --omit=dev detectó 9 paquetes afectados
  (1 crítico, 4 altos, 4 moderados). Actualización compatible sin --force:
  axios 1.20.0, express 4.22.3, ajv 8.20.0 y dependencias transitivas.
  npm audit fix terminó con cero vulnerabilidades conocidas en 523 paquetes.
  Se incorpora package-lock.json al repositorio y se elevan mínimos directos;
  usar npm ci para reproducir la instalación. Los paquetes anteriores no estaban
  publicados en el host. Frontend: cero alertas de producción en esta revisión.
- Arranque backend: se evita reanudar trabajos de generación cuando pilotEnabled()
  es verdadero, incluyendo siempre NODE_ENV=production. La beta es de lectura.
- SSH: nuevo usuario nomuvia-admin con clave dedicada y sudo, verificado antes de
  cerrar root. Contraseñas y autenticación interactiva desactivadas. Solo ese
  usuario puede conectar; sin X11 ni reenvío de agente, máximo tres intentos y
  30 segundos para autenticar. Se permiten túneles locales de administración.
- Caddy: NoNewPrivileges, ProtectSystem=strict, ProtectHome, aislamiento de
  dispositivos y protección de controles del kernel. Solo CAP_NET_BIND_SERVICE;
  escritura permitida en /var/lib/caddy y /var/log/caddy para certificados/estado.

## Evidencia de validación

- Backend: build TypeScript correcto; 4 suites, 38 pruebas aprobadas para admisión
  del piloto, aviso de lanzamiento, audio y generación. El bloqueo adicional en
  el arranque se revisó en código; estas suites no simulan el arranque completo.
- Prueba local con Caddy y build de Next: sin invitación devuelve 401 para web,
  API, MP3 y peticiones Range. Cabeceras falsificadas no eluden el control;
  origen Next privado, clave participante y bloqueo de generación comprobados.
  Backend simulado en esa prueba; no sustituye pruebas con datos desplegados.
- SSH: nueva sesión administrativa con sudo válida; conexión root rechazada.
- Caddy activo tras reiniciar; HTTPS nomuvia.com responde 503 con certificado
  validado. Configuración efectiva de systemd verificada.
- UFW deniega entrada salvo TCP 22/80/443 en IPv4 e IPv6. Backend y base de datos solo escuchan en loopback;
  no hay paneles de desarrollo expuestos. Administración Caddy en loopback.
- Sistema actualizado, kernel 6.8.0-139-generic; actualizaciones automáticas
  activadas sin reinicio automático. La revisión de logs fue limitada y no
  certifica ausencia de intrusiones.

## Pendientes antes de abrir la beta

1. 2FA de Hetzner y Cloudflare confirmado por el responsable el 19 de septiembre.
   Guardar códigos de recuperación fuera del servidor. Confirmación del usuario;
   no se ha inspeccionado la configuración de los paneles. No reutilizar
   contraseñas comprometidas. La clave SSH local no tiene frase de paso: proteger
   el PC y valorar añadirla mediante entrada interactiva, sin compartirla aquí.
2. Servicios instalados con usuario sin login, secretos separados y orígenes en
   loopback; falta conectar el proxy con invitaciones fuertes y probar
   HTTPS/API/audio con datos reales en el dominio.
   No copiar credenciales de generación ni bases de datos completas del PC.
3. Completar el aviso y revisiones humanas de tours. acceptedForPilot continúa
   false; no se han sustituido revisiones humanas por aprobaciones automáticas.
4. Verificar capacidad del catálogo: el limitador backend puede agrupar usuarios
   tras el proxy local, y la validación de hashes de audio puede consumir recursos.
   Medir con el catálogo piloto antes de abrirlo; no confiar sin más en X-Forwarded-For.
5. Copias externas y restauración: backups de pago aplazados por decisión del
   responsable. Originales locales no cubren futuros datos exclusivos del servidor.
6. Cloudflare está en modo solo DNS: su proxy/WAF no protege el tráfico actual.
   Si se activa, comprobar TLS estricto, acceso al origen y ausencia de caché de
   audios, tours y API privados. No se ha configurado alertado continuo.

Los audios se servirán por rutas autenticadas del mismo origen desde Hetzner;
no necesitan Supabase para esta beta. Los controles no impiden que un participante
autorizado guarde el audio que recibe.

## Operación

Administrar con la clave local dedicada y usuario nomuvia-admin; sudo concede
administración completa, por lo que proteger esa clave sigue siendo esencial.
Configuraciones exactas copiadas en deployment/pilot/sshd-nomuvia-admin.conf y
caddy-security.conf. Nunca instalar la primera en otro host sin preparar y probar
antes usuario, clave y sudo. El bootstrap base no incluye esa migración de usuario.

Guías oficiales para cuentas:
- https://docs.hetzner.com/general/security-and-identify/two-factor-authentication/
- https://developers.cloudflare.com/fundamentals/user-profiles/2fa/

## Comprobaciones tras instalar la aplicación

Detalles operativos en deployment/pilot/hetzner-status.md. Compilaciones remotas
correctas, migraciones aplicadas a una base vacía y servicios activos sin reinicios.
Cuenta runtime PostgreSQL solo SELECT (INSERT denegado por permisos), código root,
servicios sin privilegios y backend con red limitada a localhost. Prueba externa
IPv4: 2019, 3000, 3001 y 5432 inaccesibles; 22, 80 y 443 accesibles. Pruebas internas
reales: salud backend 200, frontend sin confianza 401, página informativa con
confianza 200 y catálogo 503 por cierre de lanzamiento. No se importaron tours.
