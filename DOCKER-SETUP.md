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
