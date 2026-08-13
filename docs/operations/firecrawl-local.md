# Firecrawl local para narrativa V6

La investigación V6 usa una instancia autohospedada de Firecrawl `v2.8.0`
separada de los Compose de la aplicación. Solo publica la API en
`127.0.0.1:3007`; Redis, RabbitMQ, PostgreSQL y Playwright permanecen dentro de
la red del proyecto Compose.

## Requisitos

- Podman 5 y `podman-compose`.
- Git, curl, jq, OpenSSL, `ss` y Bash.
- Capacidad para construir las imágenes oficiales de Firecrawl.

El script usa deliberadamente
`PODMAN_COMPOSE_PROVIDER=podman-compose podman compose`. No usa el alias
`docker` del sistema.

## Operación

Desde la raíz del repositorio:

```bash
./scripts/firecrawl-local.sh up
./scripts/firecrawl-local.sh smoke
./scripts/firecrawl-local.sh down
```

`up` aborta si el puerto 3007 está ocupado. La primera ejecución clona la
etiqueta exacta `v2.8.0` en `.runtime/firecrawl/v2.8.0`, comprueba que el checkout
no tenga modificaciones y crea
`$XDG_STATE_HOME/tour-guide-app/firecrawl.env` o, si esa variable no existe,
`~/.local/state/tour-guide-app/firecrawl.env`, con permisos 0600. El estado
privado queda en el sistema de archivos Linux porque `/mnt/c`
no preserva esos permisos. Los secretos de Bull y PostgreSQL se generan
localmente junto con la cookie de RabbitMQ y nunca se imprimen. `down` conserva
los volúmenes.

El overlay `scripts/firecrawl-local.compose.yaml` solo proporciona al build de
Playwright el argumento `PORT=3000`, que Podman Compose no deriva del bloque
`environment` del Compose oficial, y omite los límites de cgroup del Compose en
entornos Podman rootless que no tienen delegación de cgroups. Los límites de
concurrencia de Firecrawl sí permanecen activos.
En RabbitMQ, el mismo overlay corrige la propiedad del volumen antes de arrancar
y vuelve a bajar privilegios inmediatamente al usuario `rabbitmq`. PostgreSQL y
RabbitMQ usan volúmenes nombrados que `down` conserva y `up` reutiliza.

El smoke no invoca ningún LLM. Comprueba `/v2/search`, scraping HTML a Markdown,
un PDF oficial del Palacio Real y rechazo de loopback, metadata cloud y una
redirección hacia loopback.

## Backend

Configure el backend con:

```dotenv
FIRECRAWL_BASE_URL=http://127.0.0.1:3007/v2
FIRECRAWL_API_KEY=
```

Una instancia local no requiere clave. El adaptador usa este endpoint local por
defecto y rechaza explícitamente el host `api.firecrawl.dev`, incluso si existe
una clave, por lo que una caída local no puede derivar silenciosamente a
Firecrawl Cloud.

## Límites y seguridad

La configuración local limita workers, capturas y trabajos concurrentes a dos.
La API se enlaza solo a loopback. Firecrawl autohospedado no incluye Fire-engine;
una página bloqueada debe terminar como `source_capture_failed`, no como un
fallback cloud.

Las URL encontradas continúan validándose en el backend: solo HTTPS, sin
credenciales ni puertos personalizados y con rechazo si cualquier respuesta DNS
es privada o reservada. El contenido capturado y las respuestas de Firecrawl son
datos no confiables.

Fuentes fijadas: [Compose oficial v2.8.0](https://raw.githubusercontent.com/firecrawl/firecrawl/v2.8.0/docker-compose.yaml)
y [guía oficial de autohospedado v2.8.0](https://raw.githubusercontent.com/firecrawl/firecrawl/v2.8.0/SELF_HOST.md).
