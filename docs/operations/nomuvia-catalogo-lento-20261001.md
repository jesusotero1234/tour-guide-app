# Catálogo lento en Nomuvia: causa y corrección

1 de octubre de 2026. Autorización del responsable: «ya sube el nuevo y comitea
y pushea».

Release activa: `/srv/tour-guide/releases/20261001-audio-cache` (commit `766286f`).
Anterior: `/srv/tour-guide/releases/20260922-europe-history`.

## Síntoma

`https://nomuvia.com/tours` no mostraba tours. La petición del catálogo
(`/api/backend/tours?language=es&readyOnly=true&limit=50`) tardaba entre 74 y
96 s, y las páginas SEO de ciudad y ruta agotaban su espera de 12 s.

## Causa

PostgreSQL estaba sano: 216 tours, 1.653 paradas y 13 MB de datos. En
`pg_stat_activity`, la consulta activa esperaba en `Client:ClientWrite`, es decir,
tenía el resultado listo y esperaba a que la aplicación lo leyera.

- Validar cada tour leía completos todos sus MP3 para calcular el SHA-256: unos
  360 MiB por carga del catálogo y otra lectura por cada parada reproducida.
- Esa caché de disco mantenía el cgroup de `nomuvia-backend` en su `MemoryMax`
  (768 MiB): 1,86 millones de eventos `max` y 440 GiB releídos en 9 días.
- Al estar en el límite, el kernel descartaba paquetes de la conexión local con
  PostgreSQL: 523 descartes (`TcpExtTCPRcvQDrop`) y 528 retransmisiones en una
  sola carga del catálogo. Cada retransmisión espera al menos 200 ms.
- Además había 135 conexiones de audio abandonadas, que el proxy de Next nunca
  cerraba.

## Cambios

- Backend: el hash de cada audio se recuerda por identidad del archivo (inodo,
  tamaño, `mtime` y `ctime`). Un archivo modificado o borrado se vuelve a
  verificar.
- Frontend: los proxies de audio cancelan la petición al backend cuando el
  oyente se desconecta.
- `nomuvia-backend`: `MemoryHigh=640M`, aplicado con
  `systemctl set-property` y reflejado en `deployment/pilot/nomuvia-backend.service`.

No hay cambios de base de datos, audios ni reglas de admisión. Se descartó cachear
el catálogo porque `pilot.test.ts` exige que un tour retirado desaparezca del
listado al instante.

## Publicación

Script: `deployment/pilot/release-audio-cache-20261001.sh`. Verifica por SHA-256
que los cuatro archivos activos coinciden con la base del commit, copia la release
anterior, sustituye solo esos cuatro archivos y compila como `nomuvia-admin` con
grupo `tour-pilot`, sin root y con `frontend.env`. Después cambia `current`
atómicamente, reinicia backend y frontend, y revierte solo si fallan las
comprobaciones.

## Verificación

- Catálogo tras activar: 3–6 s con la caché fría y 1,1–1,5 s con la caché caliente.
- Totales: `es=52`, `en=41`, `fr=41`, `de=41`, `it=41`.
- Audio de parada con rango: `206`. Página `/tours`: `200`.
- 0 descartes de paquetes en tres cargas del catálogo; 0 conexiones atascadas;
  backend en 623 MiB.
- Disco: 2,8 GB libres (93 %). Conviene retirar releases antiguas.

## Reversión

Restaurar atómicamente `/srv/tour-guide/current` a `20260922-europe-history` y
reiniciar `nomuvia-backend` y `nomuvia-frontend`. `MemoryHigh` se retira con
`systemctl set-property nomuvia-backend.service MemoryHigh=infinity`.
