# Basic Container Management

## Starting and Stopping Containers
```bash
# Start all services defined in docker-compose.dev.yml
podman-compose -f docker-compose.dev.yml up

# Start services in detached mode (background)
podman-compose -f docker-compose.dev.yml up -d

# Start only specific services
podman-compose -f docker-compose.dev.yml up tts-pod backend

# Stop all running containers
podman-compose -f docker-compose.dev.yml down

# Stop and remove volumes too
podman-compose -f docker-compose.dev.yml down -v

# Restart a specific service
podman-compose -f docker-compose.dev.yml restart tts-pod
```

## Building Containers
```bash
# Build all services
podman-compose -f docker-compose.dev.yml build

# Build with no cache (clean build)
podman-compose -f docker-compose.dev.yml build --no-cache

# Build specific service
podman-compose -f docker-compose.dev.yml build tts-pod

# Build and start
podman-compose -f docker-compose.dev.yml up --build
```

## Container Interaction
```bash
# Execute a command in a running container
podman exec -it tour-guide-app_tts-pod_1 /bin/bash

# View logs
podman-compose -f docker-compose.dev.yml logs

# View logs for specific service
podman-compose -f docker-compose.dev.yml logs tts-pod

# Follow logs (continuous output)
podman-compose -f docker-compose.dev.yml logs -f tts-pod

# Check container status
podman-compose -f docker-compose.dev.yml ps
```

## Volume Management
```bash
# List volumes
podman volume ls

# Inspect a volume
podman volume inspect tts_cache

# Remove a volume
podman volume rm tts_models

# Remove all unused volumes
podman volume prune

# Create a volume
podman volume create tts_models
```

## Image Management
```bash
# List images
podman images

# Remove an image
podman rmi tour-guide-app_tts-pod

# Remove all unused images
podman image prune

# Remove all unused images (including unused tagged images)
podman image prune -a
```

## Network Management
```bash
# List networks
podman network ls

# Inspect a network
podman network inspect app-network

# Remove a network
podman network rm app-network

# Create a network
podman network create app-network
```

## Troubleshooting Commands
```bash
# Check container resource usage
podman stats

# View container details
podman inspect tour-guide-app_tts-pod_1

# Check port mapping
podman port tour-guide-app_tts-pod_1

# Check logs for errors
podman logs tour-guide-app_tts-pod_1 | grep -i error

# Get a live, updating list of processes in container
podman top tour-guide-app_tts-pod_1
```

## Common Workflows

### Fixing TTS Pod Model Files
```bash
# Rebuild the TTS pod after Dockerfile changes
podman-compose -f docker-compose.dev.yml build --no-cache tts-pod

# Restart just the TTS pod
podman-compose -f docker-compose.dev.yml restart tts-pod

# View logs to verify model loading
podman-compose -f docker-compose.dev.yml logs -f tts-pod
```

### Fixing API Routing Issues
```bash
# After updating routes in server.ts file
podman-compose -f docker-compose.dev.yml restart tts-pod

# Check if routes are working correctly
curl http://localhost:3005/tts/generate -X POST -H "Content-Type: application/json" -d '{"text": "Hello world", "language": "en"}'
```

### Running In Development Mode
```bash
# Start development environment
./run-dev.sh

# Start with hot-reloading
./run-dev-watch.sh

# Cleaning development environment 
podman-compose -f docker-compose.dev.yml down -v
podman image prune -a -f
```

### Switching Between Docker and Podman
```bash
# Alias podman as docker (for scripts expecting docker)
alias docker=podman
alias docker-compose=podman-compose

# Check current version
podman version
```
