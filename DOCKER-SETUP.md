# Docker Compose Setup for Tour Guide App (Development)

This document explains how to run the complete Tour Guide App using Docker Compose for development purposes.

> **Note:** This Docker Compose setup in the project root is designed for local development. For production deployment, see the setup in `deployment/podman/` directory.

## Prerequisites

- Docker and Docker Compose installed on your system
- For the LLM Pod: Ollama running locally with the llama3.2 model available

## Running the Application

1. From the project root directory, run:

```bash
docker compose up
```

This will start all services in the following order:
- **LLM Pod** on port 3002
- **Verification Pod** on port 3003
- **Description Pod** on port 3004
- **TTS Pod** on port 3005
- **Supabase Pod** on port 3006
- **Backend Service** on port 3001

2. In a separate terminal, start the frontend:

```bash
cd frontend
npm run dev
```

The frontend will be available at `http://localhost:3000`

## Environment Variables

You can customize the LLM configuration by setting these environment variables before running `docker compose up`:

```bash
# Set a custom Ollama endpoint
export OLLAMA_API_URL=http://your-ollama-server:11434

# Use a different model
export OLLAMA_MODEL=mistral:latest
```

## SearXNG Local (Discovery Provider)

SearXNG is a self-hosted metasearch engine used as the web discovery provider for the research pipeline. It runs as a separate local container that publishes `127.0.0.1:18081` only, and it exposes a JSON API at `/search?format=json`. The local configuration uses Bing and Mwmbl, both of which are credential-free.

### Configuration

The local configuration uses Bing and Mwmbl. No API keys or billing credentials are required.

`scripts/searxng-settings.yml` is a secret-free committed template. The local script safely renders the SearXNG secret to `~/.local/state/tour-guide-app/searxng-settings.yml` under private state, and Compose mounts the rendered file read-only. The secret is not placed in the committed template or container environment, and the script does not print its value.

### Starting SearXNG

Firecrawl must be up first: SearXNG joins the Firecrawl bridge network so the Firecrawl api container can reach it as `http://searxng:8080`:

```bash
./scripts/firecrawl-local.sh up       # first: creates the shared network
bash scripts/searxng-local.sh up      # then: joins it and publishes 127.0.0.1:18081
bash scripts/searxng-local.sh status  # verify it responds
bash scripts/searxng-local.sh down    # stop (volumes are preserved)
```

The image is pinned by digest in `scripts/searxng-local.compose.yaml`. The rendered settings persist in private state; the named `/etc/searxng` volume preserves the remaining container configuration.

### Configuring the backend

Point the backend/discovery configuration at the local instance:

```bash
export SEARXNG_BASE_URL=http://127.0.0.1:18081
```

When using Firecrawl self-hosted as the capture provider, wire its own SearXNG integration as well: set `SEARXNG_ENDPOINT=http://searxng:8080` in the Firecrawl local environment file (`~/.local/state/tour-guide-app/firecrawl.env`) and restart Firecrawl with `./scripts/firecrawl-local.sh down && ./scripts/firecrawl-local.sh up`. The compose default already sets this value; the env file must not override it with a loopback address, which would not resolve inside the Firecrawl container.

### Running the provider smoke test

With SearXNG and Firecrawl both up, run the smoke test (no LLM required):

```bash
bash scripts/smoke-v8-providers.sh
```

It checks that SearXNG returns JSON, that Firecrawl `/search`, `/map` and `/scrape` (HTML and PDF) work, that SSRF protection blocks private addresses, and that no request can reach Firecrawl Cloud. The SearXNG gate runs the Palacio de los Condes de Buenavista Málaga query in `es-ES`. It requires that Mwmbl returns `https://www.wikidata.org/wiki/Q969308` and that Bing returns a relevant HTTPS Alcazaba de Málaga result. Each check prints `[ok]` or `[fail]`; the script exits with a non-zero code if any check fails.

### Security note

SearXNG publishes `127.0.0.1` only and must never be exposed to the network: it is an unauthenticated open metasearch endpoint. Inside the container it binds `0.0.0.0` (see `scripts/searxng-settings.yml`) so the Firecrawl API container can reach it over the Podman bridge network; the host-facing published port remains loopback-only.

Only `SEARXNG_SECRET` is rendered into private state. The private state directory must remain mode `0700` and the rendered settings file must remain mode `0600`.

### Browser-based search rejection

Browser-based search was rejected because it did not avoid CAPTCHA/blocking and added latency/maintenance. Firecrawl Playwright remains for page capture/rendering, while browser MCP is investigation-only and not runtime.

## Accessing Individual Services

Each service exposes its API at the following URLs:

- Backend: http://localhost:3001
  - Health check: http://localhost:3001/health
- LLM Pod: http://localhost:3002
- Verification Pod: http://localhost:3003
- Description Pod: http://localhost:3004
- TTS Pod: http://localhost:3005
- Supabase Pod: http://localhost:3006

## Volumes

The setup includes persistent volumes for:

- `tts_models`: Stores the TTS models
- `tts_cache`: Caches generated audio files

## Development vs. Production Setup

This project has two container orchestration configurations:

1. **Development Setup** (This document)
   - Located at project root: `docker-compose.yml`
   - Uses simplified Dockerfiles directly from pod directories
   - Set with NODE_ENV=development
   - Optimized for quick iteration and debugging

2. **Production Setup**
   - Located at `deployment/podman/compose.yml`
   - Uses optimized Containerfiles in the deployment directory
   - Set with NODE_ENV=production
   - Designed for deployments with additional optimizations

## Production Deployment Guide

For deploying the application in a production environment, follow these steps to ensure proper container networking and service discovery:

### 1. Prepare Environment Variables

Create a `.env.production` file with the following settings:

```bash
# General settings
NODE_ENV=production

# API security
API_KEYS=your-secure-api-key-here

# Container networking mode
USE_SERVICE_NAMES=true  # Enable proper service discovery in production
```

### 2. Configure Docker Compose for Production

Use the production-optimized compose file with the appropriate environment variables:

```bash
# Using Docker
docker compose -f deployment/podman/compose.yml --env-file .env.production up -d

# Using Podman
podman-compose -f deployment/podman/compose.yml --env-file .env.production up -d
```

### 3. Container Networking Configuration

The application is configured to use different networking strategies based on environment:

- **Production Mode**: Uses container service names for inter-service communication
  - Services connect directly via the internal Docker/Podman network
  - Example: `http://llm-pod:3002` for LLM service access

- **Development Mode**: Uses host-based access when container networking is problematic
  - Services connect through the host machine's special DNS
  - Example: `http://host.containers.internal:3002` for LLM service access

### 4. Scaling Considerations

When scaling services horizontally in a production environment:

1. Set `USE_SERVICE_NAMES=true` to enable proper service discovery
2. Consider using a load balancer in front of replicated services
3. For container orchestration platforms like Kubernetes, use service discovery mechanisms provided by the platform

### 5. Security Recommendations

1. Use a strong, randomly generated API key in production
2. Enable TLS for all service communications in production
3. Consider implementing proper authentication and authorization for API endpoints
4. Use a reverse proxy (like Nginx) in front of the application for TLS termination and additional security

### 6. Monitoring and Logging

1. Enable log collection from all services
2. Set up monitoring for container health and resource usage
3. Configure alerting for critical service failures

## Troubleshooting

### LLM Pod Connection to Ollama

If the LLM pod can't connect to Ollama, there are two effective solutions:

#### Solution 1: Use Host Network Mode (Recommended for Development)

The most reliable approach for development is to use host network mode for the LLM pod:

```yaml
# In docker-compose.yml
llm-pod:
  network_mode: "host"
  environment:
    - OLLAMA_HOST=http://localhost:11434
```

With this setup:
- The LLM pod shares the host's network stack
- Inside the container, `localhost` refers to the host machine
- No special DNS names or IP addresses are needed
- The backend should be configured to use `http://localhost:3002` to connect to the LLM pod

#### Solution 2: Use Your Host's Actual IP Address

If host network mode isn't suitable, you can use your host's actual IP address:

```yaml
# In docker-compose.yml
llm-pod:
  environment:
    - OLLAMA_HOST=http://YOUR_HOST_IP:11434
```

To find your host IP address:
- On Linux WSL: `ip addr show` (look for eth0 interface)
- On Windows: `ipconfig` (look for IPv4 Address)
- On macOS: `ifconfig` or `ipconfig getifaddr en0`

This is more reliable than using `host.containers.internal` which may not resolve correctly in all container environments, especially in Podman.

### Supabase Pod Configuration

Make sure the `.env` file exists in `pods/supabase-pod/` with your Supabase credentials.

### TTS Pod Models

The first time you run the TTS pod, it will download required models which may take some time.
