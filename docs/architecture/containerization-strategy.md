# Containerization Strategy

This document explains the containerization approach for the Tour Guide App, including both development and production setups.

## Overview

The Tour Guide App uses a dual containerization strategy:

1. **Development Setup** - Simplified container setup optimized for developer workflow
2. **Production Setup** - Optimized containers with security and performance enhancements

## Container Configuration Files

| Purpose    | Location                           | Configuration                     | Environment  |
|------------|------------------------------------|---------------------------------|--------------|
| Development| Project root                       | `docker-compose.yml`            | development  |
| Production | `deployment/podman/`               | `compose.yml`                   | production   |

## Development Setup

The development setup is designed for local development and quick iteration:

- **Location**: Project root (`docker-compose.yml`)
- **Container Definitions**: Uses basic Dockerfiles located directly in each pod's directory
- **Node Environment**: Set to `development` for better debugging
- **Build Process**: Simple builds suitable for quick iteration
- **Volume Mounts**: More extensive for easier debugging
- **Entry Point**: Often uses development scripts with nodemon for hot reloading

### Structure

```
tour-guide-app/
├── docker-compose.yml               # Main development compose file
├── backend/
│   └── Dockerfile                   # Backend development container
└── pods/
    ├── llm-pod/
    │   └── Dockerfile               # LLM pod development container
    ├── verification-pod/
    │   └── Dockerfile               # Verification pod development container
    ├── description-pod/
    │   └── Dockerfile               # Description pod development container
    ├── tts-pod/
    │   └── Dockerfile               # TTS pod development container
    └── supabase-pod/
        └── Dockerfile               # Supabase pod development container
```

### Usage

```bash
# From project root
docker compose up
```

## Production Setup

The production setup is optimized for performance, security, and reliability:

- **Location**: `deployment/podman/` directory
- **Container Definitions**: Uses optimized Containerfiles in `deployment/podman/containers/`
- **Node Environment**: Set to `production`
- **Build Process**: Uses multi-stage builds to minimize image size
- **Security**: Includes additional hardening measures
- **Entry Point**: Uses production-ready server configurations

### Structure

```
tour-guide-app/
└── deployment/
    ├── podman/
    │   ├── compose.yml              # Production compose file
    │   └── containers/
    │       ├── backend/
    │       │   └── Containerfile    # Optimized backend container
    │       ├── llm-pod/
    │       │   └── Containerfile    # Optimized LLM pod container
    │       ├── verification-pod/
    │       │   └── Containerfile    # Optimized verification pod container
    │       ├── description-pod/
    │       │   └── Containerfile    # Optimized description pod container
    │       ├── tts-pod/
    │       │   └── Containerfile    # Optimized TTS pod container
    │       └── supabase-pod/
    │           └── Containerfile    # Optimized Supabase pod container
    └── scripts/
        ├── deploy.sh                # Main production deployment script
        ├── deploy-tts-pod.sh        # TTS pod deployment script
        └── deploy-supabase-pod.sh   # Supabase pod deployment script
```

### Usage

```bash
# From deployment/scripts directory
./deploy.sh
```

## Key Differences

| Feature             | Development (Docker)                | Production (Podman)                   |
|---------------------|------------------------------------|-----------------------------------------|
| Image Size          | Larger, includes dev dependencies  | Smaller, optimized for production      |
| Build Speed         | Faster builds                      | More thorough, multi-stage builds      |
| Configuration       | Development defaults               | Production defaults with hardening     |
| Logging             | Verbose, development-focused       | Structured, production-focused         |
| Performance         | Optimized for development workflow | Optimized for runtime performance      |
| Security            | Basic                              | Enhanced                               |

## When to Use Which

- **Use Development Setup** when:
  - You're actively developing new features
  - You need to debug issues
  - You want to quickly test changes
  - You're running the system locally

- **Use Production Setup** when:
  - Deploying to staging or production environments
  - Performance testing
  - Security testing
  - Creating deployment artifacts

## Best Practices

1. **Development**:
   - Use development containers during active development
   - Test your changes with both setups before committing

2. **Testing**:
   - Use development containers for unit and integration tests during development
   - Use production containers for final acceptance and performance testing

3. **CI/CD**:
   - Build both development and production containers in CI
   - Deploy production containers to staging/production environments

## Converting Between Setups

The main differences between development and production container files are:

1. Base images and multi-stage builds
2. Optimization flags
3. Environment variables
4. Security configurations

When moving a container from development to production, ensure these aspects are addressed.
