# Network Connectivity Fixes

This document explains the network connectivity fixes implemented for the Tour Guide App's microservices architecture.

## Issue Overview

The application uses a microservices architecture with several pods running in Docker containers:
- `backend`: Main backend service
- `llm-pod`: Language model service (runs in host network mode)
- `verification-pod`: Verifies geographic locations
- `description-pod`: Generates descriptions for places
- `tts-pod`: Text-to-speech service
- `supabase-pod`: Database service

We encountered connectivity issues where the verification and description pods were unable to communicate with the LLM pod. The error manifested as:

```
Error: connect ECONNREFUSED 127.0.0.1:3002
```

## Root Cause

The root cause was a networking configuration mismatch:

1. The LLM pod was running with `network_mode: "host"` in Docker to access the local Ollama service
2. The other pods were running in the standard Docker bridge network
3. The verification and description pods were trying to connect to the LLM pod using:
   - Either an internal Docker DNS name (`http://llm-pod:3002`) which doesn't work when targeting a host-networked container
   - Or `http://localhost:3002` which refers to the container's own localhost, not the host machine

## Solutions Implemented

### 1. Docker Compose Configuration Updates

We added a specific environment variable to the verification and description pods in both docker-compose files:

```yaml
verification-pod:
  environment:
    # Other environment variables...
    - LLM_POD_URL=http://host.docker.internal:3002

description-pod:
  environment:
    # Other environment variables...
    - LLM_POD_URL=http://host.docker.internal:3002
```

The `host.docker.internal` hostname is a special DNS name that Docker provides to allow containers to reference the host machine.

### 2. Client Code Improvements

We enhanced the LLM clients in both services to be more resilient:

- Added explicit timeout configurations
- Improved error handling with detailed logging
- Added retries and fallback behaviors
- Enhanced logging for better debugging

## Additional Network Configuration

To ensure the special DNS resolution works across platforms, we added:

```yaml
extra_hosts:
  - "host.containers.internal:host-gateway"
  - "host.podman.internal:host-gateway"
  - "host.docker.internal:host-gateway"
```

This ensures compatibility with Docker, Podman, and other container runtimes.

## Future Improvements

For a more production-ready setup, consider:

1. Moving all services to the same network type when possible
2. Using a service mesh or API gateway to abstract networking concerns
3. Implementing circuit breakers and proper fallback behaviors
4. Setting up health checks and automatic recovery strategies
