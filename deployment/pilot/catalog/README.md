# Publicación de catálogo en producción (toolkit archivado)

Scripts de la publicación europea del 22 de septiembre de 2026 (`20260922-europe-history`),
copiados de `~/.local/share/tour-guide/nomuvia/europe-launch-20260922/`. Son la **plantilla**
de [`docs/plans/20261001-audio-paradas-ui-backend/04-regeneracion-y-publicacion.md`](../../../docs/plans/20261001-audio-paradas-ui-backend/04-regeneracion-y-publicacion.md),
no una herramienta genérica: tienen fijados los nombres de esa release y los recuentos del
catálogo de entonces (66 tours antes, 216 después). Para una publicación nueva se copian y se
adaptan; el importador de actualización del plan 04 es un script nuevo, `remote-update.cjs`, y los de actualización (`remote-snapshot.cjs`, `remote-update.cjs`, `update-*.sh`) **no** están ligados a ninguna release concreta. Los comprobó el ensayo local `backend/scripts/admin/rehearse-regeneration.cjs` (`remote-update.cjs` y `remote-snapshot.cjs` contra una copia real de Postgres); `update-install.sh` solo está comprobado con `bash -n`.

| Script | Dónde corre | Qué hace |
|---|---|---|
| `transfer.sh` | Equipo local | Copia el código pequeño de la release y sube la carpeta de etapa por `rsync`, **sin el audio**. Necesita `STAGE` (carpeta local) y, si no son los de por defecto, `HOST` y `KEY`. |
| `build.sh` | Servidor, usuario `nomuvia-admin` | Copia `current`, sustituye unos pocos archivos, compila el backend y el frontend y pasa `frontend/scripts/test-seo.cjs`. No toca producción. |
| `install.sh` | Servidor, con `sudo` | Comprueba el audio (`audio.sha256`), hace `pg_dump`, copia el audio con `cp -al`, importa, verifica, cambia `current` de forma atómica y reinicia. Revierte con un `trap` si algo falla. |
| `remote-import.cjs` | Servidor, con `/etc/tour-guide/migration.env` | Solo **crea**: `createMany` en una transacción, con los recuentos previos exactos y comprobando que los ids no existan. |
| `remote-rollback.cjs` | Servidor, con `/etc/tour-guide/migration.env` | Borra los tours importados, y se niega si el borrado sería parcial. |
| `verify.cjs` | Servidor, con `/etc/tour-guide/backend.env` | Cuenta filas por idioma y comprueba `admittedToPilot` en cada tour. |
| `remote-snapshot.cjs` | Servidor, con `/etc/tour-guide/backend.env` | **Solo lectura.** Vuelca el catálogo publicado con el código del backend (`dumpCatalog`) a un JSON. Necesita una release cuyo `dist` ya lleve `services/regeneration`. |
| `remote-update.cjs` | Servidor, `backend.env` y después `migration.env` | Importador de **actualización** del plan 04: `--dry-run`, actualización y `--rollback`. Comprueba esquema, audio en su sitio y huella esperada antes de tocar nada; una transacción por tour, verificación tras `COMMIT` y compensación al instante. |
| `update-transfer.sh` | Equipo local | Sube un paquete de actualización por `rsync` y comprueba `audio.sha256` en el servidor. Con `INSTALL=1` lanza el instalador. |
| `update-install.sh` | Servidor, con `sudo` | `pg_dump`, copia del audio con `cp -al` (se niega si la carpeta ya existe), ensayo, actualización, reinicio y comprobaciones públicas; revierte con un `trap`. |
| `smoke.cjs` | Equipo local, contra `https://nomuvia.com` | Comprobación pública: totales, fichas, rangos de audio y páginas móviles. Variables `PLAYWRIGHT_MODULE` y `CHROMIUM_PATH`. |

## Credenciales y roles

- **Lectura:** `/etc/tour-guide/backend.env`, usuario de BD `nomuvia_app`, solo `SELECT`.
- **Escritura y esquema:** `/etc/tour-guide/migration.env`, usuario `nomuvia_migrate`. Lo cargan `install.sh` y los scripts `remote-*`.
- Los valores **nunca** se copian al repo ni a los informes. Los scripts solo hacen `source` de esos archivos en el servidor. Se revisó que no contuvieran claves, contraseñas ni tokens. La IP del servidor ya figura en `deployment/pilot/hetzner-status.md`.
- El audio vive en `/srv/tour-guide/shared/audio` (`AUDIO_STORAGE_PATH`).

## Migraciones de esquema

Ninguno de los scripts de arriba migra el esquema, y `release-audio-cache-20261001.sh` tampoco.
Las releases se construían copiando `current` y cambiando unos archivos. La migración
`20260912190000_tour_introduction_audio` consta como aplicada en producción, así que se aplicó
por otra vía que **no está documentada**.

Para la migración aditiva `20261001220000_spoken_text_cues_legs` (texto hablado, clips de enlace y tramos a pie)
existe un procedimiento nuevo y completo en
[`../release-regeneration-backend.sh`](../release-regeneration-backend.sh): candidata construida sin root
(`prisma generate` y `tsc`), `pg_dump`, `prisma migrate deploy` con `migration.env` **antes** del cambio de `current`
(el cliente nuevo necesita las columnas nuevas; se comprobó en local), `GRANT SELECT ON tour_cue_audio, tour_walking_legs TO nomuvia_app`,
cambio atómico, comprobación pública de los 216 tours y reversión automática. La migración es aditiva, así que la release
antigua sigue funcionando con ella; su inverso está en `backend/prisma/migrations/20261001220000_spoken_text_cues_legs/down.sql`.

**Ese script no se ha ejecutado contra el servidor.** Antes de la primera ejecución (con `DRY_RUN=1`, solo lectura), con autorización de SSH del usuario:

1. Leer `_prisma_migrations` en la BD de producción (el modo `DRY_RUN` ya imprime las tres últimas).
2. Confirmar que la release activa tiene la CLI de Prisma (`node_modules/.bin/prisma`); el script se detiene si no.
3. Confirmar con qué comando y credenciales se aplicó la migración de septiembre, para que coincida con `prisma migrate deploy` y `migration.env`.

## Precedente: reparar huellas con SQL

La publicación de septiembre reparó huellas de publicación (`pilotRelease.fingerprint`) con un SQL generado
por tour: tabla temporal `fingerprint_fix(id, old_fp, new_fp)` y un `UPDATE` protegido por `old_fp`,
más su inverso con las columnas intercambiadas. No se versionan los archivos, porque solo contienen
identificadores y huellas de aquel momento. La técnica (actualización condicionada a la huella anterior
y reversión simétrica) es la que sigue el importador de actualización del plan 04.
