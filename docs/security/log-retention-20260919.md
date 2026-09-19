# Conservación de registros de Nomuvia

Aplicado en Hetzner el 19 de septiembre de 2026. No modifica tours, audios ni
procesos locales. No se fuerza una purga ni una rotación inicial.

| Registros | Configuración |
| --- | --- |
| App (`tour-pilot`) | Diaria, siete copias, maxage siete días |
| rsyslog, UFW, PostgreSQL, btmp y wtmp | Diaria, treinta copias, maxage treinta días |
| journald | MaxRetentionSec=30day, MaxFileSec=1day, 256 MB persistentes y 64 MB volátiles |

Se eliminan los umbrales de tamaño mínimo y la exclusión de archivos vacíos para
que la falta de actividad no impida rotar archivos que conservan datos antiguos.
La retención se ejecuta por archivos y ciclos; no es un borrado exacto por evento
al cumplirse siete o treinta días. Los límites de espacio pueden acortar el plazo.
No se aplica esta política a registros propios de proveedores, archivos de
instalación/mantenimiento, datos de cuentas como lastlog o evidencias que se
conserven separadamente para una incidencia justificada. No existe una copia de
incidencia creada por este cambio.

Motivo operativo: disponer de una ventana acotada para detectar e investigar
accesos no autorizados y fallos, sin mantener indefinidamente registros ordinarios.
No constituye por sí solo una ponderación jurídica completa del interés legítimo.

Implementación: `deployment/pilot/configure-log-retention.py` y
`deployment/pilot/journald-retention.conf`. Conserva los hooks de rotación de los
paquetes y guarda la configuración previa en un directorio exclusivo de root.
Ante fallo de validación o reinicio restaura los originales.

Verificación: logrotate --debug sin errores; journal sin avisos tras el reinicio;
frontend, backend, Caddy, rsyslog, journald y temporizador de logrotate activos.
La web mantiene HTTP 401 sin credenciales. No se han reiniciado frontend/backend.
No se ha observado todavía un ciclo de treinta días; revisar tras actualizaciones
de paquetes o cambios en las unidades que escriben logs.

La configuración previa queda en el servidor en
`/root/nomuvia-retention-20260919T121641931042`. Solo contiene configuración.
