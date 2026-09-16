# Operación del piloto privado

Estado: implementación local; no desplegado ni abierto a participantes. Fecha: 8 de septiembre de 2026.

## Configuración y apertura

El modo piloto se activa con `PILOT_MODE=true` y es obligatorio en producción. Solo ofrece lectura de tours preparados y aprobados. La generación del equipo conserva su API interna y una clave diferente.

1. Elegir dominio/alojamiento y responsable real. Copiar `deployment/pilot/notice.example.json` fuera del repositorio, con permisos restringidos. Completar los ocho campos públicos con prácticas verificadas: responsable, correo, alojamiento, proveedores, transferencias, conservación, finalidades/bases jurídicas y derechos. No publicar una plantilla rellenada con datos ficticios.
2. Documentar la evaluación jurídica, el origen de la voz y el papel/marcado de IA aplicable. Las referencias privadas `launchReview.legalReference`, `voiceOriginReference`, `aiTransparencyReference` identifican esos documentos. `acceptedForPilot` es una declaración manual, no una certificación emitida por el programa. El código no comprueba el contenido de esos informes.
3. Configurar en **ambos servidores** `PILOT_NOTICE_FILE` con la ruta absoluta del mismo aviso; mantenerla fuera de `public/`. La respuesta pública solo expone los ocho campos informativos. La API permanece cerrada si falta un campo, un correo válido o la declaración de apertura.
4. Generar secretos distintos de al menos 32 caracteres para `PILOT_API_KEY` (frontend/backend) y `PILOT_PROXY_TOKEN` (Caddy/frontend). La clave del equipo se configura como `API_KEYS` en backend y `API_KEY` en el frontend interno de desarrollo. Nunca usar `NEXT_PUBLIC_API_KEY`, ni poner la clave del piloto entre `API_KEYS`.
5. Compilar. Ejecutar Next con `next start --hostname 127.0.0.1 --port 3000`; backend en `127.0.0.1:3001`, con `API_URL=http://127.0.0.1:3001/api` para Next. Usar un usuario del sistema sin privilegios y conservar los paths de almacenamiento de audio. No arrancar una segunda instancia sobre trabajos de generación activos.
6. Validar y adaptar `deployment/pilot/Caddyfile` con Caddy instalado. `PILOT_HOST` debe ser el dominio real; `PILOT_USER` y `PILOT_PASSWORD_HASH` contienen el usuario y el hash obtenido con `caddy hash-password`. Añadir una línea por invitación para poder revocarlas individualmente. Caddy gestiona HTTPS y reemplaza las cabeceras de confianza; no activar el servicio hasta completar los controles siguientes.
7. Confirmar desde otra máquina que solo está expuesta la entrada HTTPS. PostgreSQL, Next, backend y pods deben ser inaccesibles directamente. Los Compose existentes no son una prueba de este aislamiento: no reutilizar sus puertos publicados sin revisarlos. En contenedores, publicar únicamente en loopback y ajustar la escucha interior a su red privada.

La autenticación HTTP del proxy es deliberadamente sencilla para un grupo pequeño. Revocar implica retirar el usuario y recargar Caddy. El navegador puede conservar las credenciales hasta cerrarse; no se anuncia un cierre de sesión que no existe. Una retirada impide nuevas entregas, no recupera archivos ya descargados.

## Revisar y retirar un tour

Desde `backend`, con el entorno de equipo y acceso a su PostgreSQL:

```sh
npx ts-node scripts/admin/pilot-tours.ts audit
npx ts-node scripts/admin/pilot-tours.ts prepare TOUR_ID
npx ts-node scripts/admin/pilot-tours.ts review TOUR_ID > /ruta/privada/revision-tour.json
npx ts-node scripts/admin/pilot-tours.ts approve TOUR_ID /ruta/privada/aprobacion.json
npx ts-node scripts/admin/pilot-tours.ts withdraw TOUR_ID
```

`audit` solo lee, emite IDs/motivos y no copia capturas. `prepare` vuelve a comprobar el blueprint y sus permisos, proyecta créditos y obtiene una geometría peatonal para revisión; retira cualquier aprobación anterior. No repara un blueprint antiguo editando su firma. Si la investigación antigua no pasa la política actual, preparar una base nueva con fuentes permitidas y mantener los controles editoriales existentes.

`review` exige material completo y muestra texto, transcripción, versiones del audio, fuentes, imágenes y geometría. El archivo de aprobación es el objeto `review` del informe, completado por la persona que ha comprobado texto, audio, recorrido en la calle y derechos. Debe contener `reviewedBy`, `reviewedAt`, `fingerprint`, `changes` y las cuatro comprobaciones explícitas a `true`. No copiar el informe entero como aprobación. La aplicación nunca rellena esas confirmaciones por el revisor. La licencia de guion admitida es CC BY-SA 4.0; las fotos mantienen sus licencias particulares.

La escritura compara el material persistido dentro de una transacción serializable. Un cambio concurrente obliga a repetir. Además, cada entrega vuelve a comprobar fuentes, vigencia del blueprint, versión y bytes del audio y huella aprobada. La identidad privada del revisor no se devuelve al participante. La ruta del piloto usa la geometría guardada y no consulta OSRM durante la escucha.

## Datos y conservación

El render de voz es local. La investigación y escritura pueden usar proveedores externos: verificar cuentas, planes y contratos reales antes de completar `processors` y `transfers`. El código no demuestra la ubicación de esos proveedores ni sus plazos.

Los participantes conservan progreso de lectura/escucha en su propio navegador hasta borrarlo; `/privacy` permite eliminar solo las claves del tour. El GPS se solicita tras una acción explícita, permanece en memoria del navegador y puede detenerse. Mapas y fotos implican solicitudes a terceros: OpenStreetMap recibe IP y zonas de teselas, Wikimedia recibe solicitudes de imágenes; los enlaces a Google Maps pasan el destino a ese servicio externo.

Se han retirado cuerpos, filtros e identificadores de los registros HTTP y del manejador central de errores. Caddy no activa el registro de acceso. Para un despliegue nativo que redirija stdout/stderr a `/var/log/tour-pilot/*.log`, se entrega `deployment/pilot/logrotate.conf`: rotación diaria, siete archivos y antigüedad máxima de siete días. Antes de usarlo, crear usuario/grupo `tour-pilot`, dar permisos 0750 al directorio, 0640 a los archivos y verificar que el temporizador diario de logrotate está activo. No está instalado en esta máquina. La retención de siete días es una propuesta operativa, no una práctica ya aplicada ni un plazo que cubra automáticamente hosting, copias, Caddy o proveedores.

Comprobar `logrotate --debug` con la configuración del host, ejecutar una rotación de prueba sobre archivos de ensayo y revisar que las copias caducan. No registrar secretos ni redirigir volcados de investigación a esos logs. Definir por separado retención de contactos de incidencias, credenciales de invitación, expedientes de revisión y copias de seguridad. Solo después describir los plazos efectivos en el aviso.

## Comprobaciones antes de invitar

- Sin credenciales: HTML directo, API, MP3 y petición Range bloqueados; tampoco se accede al origen por otro puerto.
- Con invitación: solo tours revisados; generación, trabajos, pases y geocodificación rechazados. No se crea trabajo ni se consulta un proveedor por esos intentos.
- Revisar una ruta real en los dos idiomas ofrecidos: texto, pronunciación, aviso audible inicial, fotos/créditos, cruces, accesos y cierres. Guardar alcance y fecha de la comprobación física.
- Retirar esa ruta: listado, enlace directo, estado de audio, recorrido y Range dejan de servirla.
- Verificar aviso del responsable, canal de errores y derechos; revisar red, registros y mecanismos reales de conservación.
- Resolver si el artículo 50 del Reglamento de IA exige otras medidas para este rol y distribución. Las huellas y JSON de procedencia son trazabilidad; no se presentan como marca robusta ni certificado legal.

Configuración del proxy basada en [basic_auth de Caddy](https://caddyserver.com/docs/caddyfile/directives/basic_auth) y [cabeceras de reverse_proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy). La política de mapas y la revisión jurídica de partida están enlazadas en el plan técnico.

## Repetir las pruebas locales

Tras compilar el frontend, `CADDY_BIN=/ruta/a/caddy node frontend/scripts/test-pilot-access.cjs` valida la configuración y levanta Caddy/Next temporales en loopback con un backend simulado. No usa credenciales reales ni escribe en PostgreSQL. Se comprobó con Caddy 2.10.2 descargado de su publicación oficial y contrastado con su suma SHA-512; ese binario temporal no se instala ni fija la versión del despliegue futuro.

Para la experiencia, arrancar Next en desarrollo y ejecutar `frontend/scripts/test-tour-listening.cjs` con `BASE_URL`, `PLAYWRIGHT_MODULE` y `CHROMIUM_PATH` apuntando al entorno de pruebas. Las fuentes, fotos, teselas y audio de ensayo se simulan. El conjunto comprueba también que una versión nueva vuelve a la primera parada y no recupera una posición de escucha antigua.

## Aclaración del origen de voz aportada por el responsable

El 8 de septiembre de 2026 el responsable indica que creó las voces usando el ejemplo de VoxCPM2 y que está preparando nuevos ejemplos. Se registra esa declaración en `guide-es-a.provenance.json`. El código local permite crear la referencia con texto, sin WAV de entrada. Falta precisar si ese fue el modo utilizado o si se partió de un audio de ejemplo: son entradas distintas y requieren registros distintos. No se pide regenerar una voz únicamente para reemplazar la falta de un registro histórico.

Para los ejemplos nuevos, conservar juntos el texto, modelo/revisión, parámetros y audio de salida con su huella. Si se usa un WAV como entrada, conservar también su identificador/origen y licencia. La fecha de esta declaración no se presenta como fecha de generación original. No se ha alterado ningún audio ni la generación en curso.
