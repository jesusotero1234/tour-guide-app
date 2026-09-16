# Abrir y compartir la app local

Esta vista ejecuta el frontend y backend reales contra la base de datos local.
No es la maqueta ni una prueba con datos simulados. Mantiene el modo piloto privado
y de solo lectura; no habilita generación ni Nominatim.

## Preparar el acceso durante un viaje

Desde Windows, haz doble clic en `deployment/pilot/preview-trip.cmd` y acepta la
solicitud de administrador. El script usa `Ubuntu-22.04` y este repositorio en
`/home/jesusotero/coding/tour-guide-app`.

- Permite el puerto 3100 desde casa (`192.168.8.0/24`) y desde los dispositivos
  conectados a vuestra VPN WireGuard (`10.0.0.0/24`).
- Reutiliza la app si ya responde. Si hace falta arrancarla, recupera la selección
  de tours guardada y reutiliza la compilación existente; solo compila si falta.
- Comprueba la web, el backend y el catálogo, e imprime la dirección para entrar.
- Mantiene el PC despierto mientras la ventana siga abierta, sin modificar el
  plan de energía. La pantalla puede apagarse.

Deja el PC enchufado, con esa ventana abierta y conectado al router. Evita cerrar
la tapa si es un portátil: el permiso para mantenerlo despierto no impide una
suspensión manual. Después de reiniciar Windows, vuelve a ejecutar el archivo;
no se instala un arranque automático. PostgreSQL debe estar disponible en WSL.

En el móvil de tu pareja, conecta WireGuard y abre la dirección que imprime el
script (actualmente `http://192.168.8.127:3100/tours`). Antes del viaje, pruébalo
con los datos móviles y el Wi-Fi apagado. Si el router cambia la IP del PC, usa
la nueva dirección; una reserva DHCP para este PC permite conservarla.

Para comprobar el estado sin modificar nada, o preparar la app sin dejar abierta
la ventana que evita la suspensión:

```powershell
.\deployment\pilot\preview-trip.ps1 -CheckOnly
.\deployment\pilot\preview-trip.ps1 -NoKeepAwake
```

Los parámetros `-Subnet`, `-VpnSubnet`, `-Distro` y `-RepoPath` permiten adaptar
el script a otro equipo. Cerrar su ventana deja la app en segundo plano y vuelve
a permitir la suspensión según el plan de energía. Los permisos del firewall
permanecen guardados.

## Arrancar desde WSL

Desde la raíz del repositorio:

```bash
python3 scripts/preview-local.py start
```

También puedes ejecutarlo desde PowerShell de Windows, si este repositorio está
en tu distribución WSL predeterminada:

```powershell
wsl --cd /home/jesusotero/coding/tour-guide-app python3 scripts/preview-local.py start
```

El lanzador comprueba las dependencias y la base de datos, compila el frontend y
arranca los tres procesos. Reutiliza Caddy o descarga su versión fijada desde la
publicación oficial y verifica el checksum SHA512. No inicia bases de datos,
pods, migraciones ni generaciones. Si hay trabajos de generación pendientes,
se detiene antes de arrancar el backend para evitar reanudarlos.

Requisitos: WSL/Linux, Node.js 22 o superior y npm, Python 3, dependencias ya instaladas en frontend
y backend, y PostgreSQL disponible con la configuración local del backend.
Si la sesión usa un Node antiguo, el lanzador busca una versión compatible ya
instalada con nvm, también al arrancar desde Windows. No instala ni cambia el Node
del sistema.
La descarga automática de Caddy admite Linux x86_64; otras plataformas pueden
proporcionar un ejecutable mediante CADDY_BIN.

- Windows: http://localhost:3100/tours
- Otra laptop en la misma red: usa la dirección que imprime el lanzador.
- La vista local abre sin usuario ni contraseña desde la red permitida, incluida
  la VPN doméstica si tiene acceso a esa red.
- Backend: 127.0.0.1:3101. Frontend: 127.0.0.1:3102. Solo el acceso privado de
  Caddy se comparte en el puerto 3100.

Los procesos quedan en segundo plano. Cerrar la terminal no los detiene.
Si un puerto está ocupado, el lanzador informa del conflicto sin cerrar procesos.

```bash
python3 scripts/preview-local.py status
python3 scripts/preview-local.py stop
python3 scripts/preview-local.py check
```

Para aplicar cambios nuevos: ejecuta stop y después start. Solo cuando quieras
reutilizar expresamente la compilación anterior, usa start --skip-build.

Los logs, PID y claves internas están fuera del repositorio, en
~/.cache/tour-guide-preview. El acceso local sin contraseña se conserva entre reinicios.
No copies access.json ni los secretos del piloto al repositorio.
Las claves internas siguen conectando el proxy con el frontend y la API.
La plantilla de despliegue del piloto conserva su autenticación; el lanzador
local elimina únicamente el formulario de usuario y contraseña del navegador.

## Permitir otra laptop desde Windows

Tu WSL usa networkingMode=mirrored. El permiso ya está configurado en este equipo.
Para repetirlo o cambiar de red, abre PowerShell **como administrador** y ejecuta
el archivo deployment/pilot/preview-network.ps1 desde la ruta Windows del repositorio:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "RUTA-WINDOWS-DEL-REPO\deployment\pilot\preview-network.ps1" -Subnet 192.168.8.0/24
```

Obtén esa ruta desde WSL con:

```bash
wslpath -w "$PWD/deployment/pilot/preview-network.ps1"
```

El archivo limita dos reglas (Windows y Hyper-V) al puerto 3100 y a la subred
privada indicada. No cambia el perfil de red ni desactiva el firewall.
Para retirar esas reglas, ejecuta el mismo archivo con -Remove.
stop detiene la app, pero conserva las reglas para el siguiente arranque.
Esta configuración es para revisar la app en tu red local, no para publicarla
en Internet. La dirección IP puede cambiar al cambiar de red.

### Acceder por WireGuard

Si el cliente VPN usa otra red, añade su IPv4 del campo **Interfaz → Direcciones**
de WireGuard (sin la máscara). Por ejemplo, para `10.0.0.2/24`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "RUTA-WINDOWS-DEL-REPO\deployment\pilot\preview-network.ps1" -Subnet 192.168.8.0/24 -VpnClientIp 10.0.0.2
```

Esto permite el puerto 3100 desde la red local y desde ese cliente VPN en las dos
reglas. Abre `http://IP-LAN-DEL-PC:3100/tours` con WireGuard conectado. El túnel
debe tener acceso a la red local a través del router. El endpoint y los servidores
DNS no identifican la IP del cliente. Si vuelves a ejecutar el script sin
`-VpnClientIp`, las reglas vuelven a permitir únicamente la subred local indicada.
El script mantiene una regla propia de WSL además de la regla de Windows.
Si Hyper-V refleja la regla de Windows (`HostFirewallLocal`), ese reflejo no
sustituye a la regla propia de WSL ni se edita directamente.

## Por qué Madrid puede no aparecer

El buscador consulta el catálogo propio por ciudad e idioma al escribir, tras una
pausa de 300 ms, y también al cambiar de idioma. Acepta nombres de ciudad parciales
y muestra los resultados debajo del formulario, sin botón de búsqueda.
No consulta Nominatim. Nominatim corresponde a localizar una
ciudad para generación y está desactivado en el piloto.

El catálogo puede devolver PILOT_NOT_OPEN aunque la interfaz cargue bien.
Se necesita un PILOT_NOTICE_FILE válido con los datos reales del responsable y
la revisión de apertura aceptada. Usa deployment/pilot/notice.example.json como
referencia de formato; no sirve aprobar el ejemplo ni inventar esos datos.

Una vez que exista un archivo real revisado, pasa su ruta absoluta a ambos
procesos mediante el lanzador:

```bash
PILOT_NOTICE_FILE=/ruta/absoluta/aviso-revisado.json python3 scripts/preview-local.py start
```

Además, un tour publicado debe cumplir los controles de admisión del piloto.
Comprobación del 9 de septiembre de 2026: el tour de Madrid en español creado
el 8 de septiembre a las 20:31 UTC existe y está publicado, pero no tiene
metadata.pilotRelease.status=approved. Abrir el piloto por sí solo no aprueba
ese tour. El lanzador no modifica estas decisiones ni los datos del tour.

## Revisión privada de un tour

Para revisar un tour específico en local sin aprobarlo, usa la opción
`--review-tour` con el UUID del tour. Esto habilita la revisión privada del
tour en el backend mediante la variable `LOCAL_REVIEW_TOUR_ID`, pero no
modifica los metadatos de aprobación ni genera contenido. El piloto estándar
sigue requiriendo un aviso legítimo y revisado para abrir el catálogo.

```bash
python3 scripts/preview-local.py start --review-tour b1fbcc6c-22ca-4795-9ee2-b1292fc3dfb0
```

La selección se persiste en `settings.json` dentro de `~/.cache/tour-guide-preview`.
En arranques posteriores, si no se especifica `--review-tour` ni `--pilot`, se
restaura el tour guardado. Para volver al piloto estándar sin tour de revisión,
usa:

```bash
python3 scripts/preview-local.py start --pilot
```

Esto limpia la selección guardada tras un arranque exitoso. El estado muestra
«Revisión privada del tour: UUID» cuando hay una selección activa.

Nota: esta es una revisión privada de un tour guardado, no una aprobación del
piloto. El problema de auditoría `SOURCE_USE_PENDING` permanece conocido.
El piloto normal sigue requiriendo un aviso legítimo y revisado; no se usa
Nominatim ni generación.

## Comprobación realizada

El lanzador se verifica con `python3 scripts/check-preview-local.py`, el rechazo
de puertos ocupados y un ciclo stop/start usando la compilación existente.
La navegación de Fuentes de datos debe mostrar «Volver a los tours» en español
y su equivalente en francés.
