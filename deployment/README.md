# Tour Guide App Production Deployment

This directory contains configuration and scripts for deploying the tour guide application to production environments using Podman.

> **Note:** For local development, you can use the Docker Compose setup in the project root. See `/DOCKER-SETUP.md` for details.

## Service Architecture

### Required Services & Ports
- Frontend (Next.js): Port 3000
- Backend API: Port 3001
- LLM Pod: Port 3002
- Ollama: Port 11434 (required for LLM)

## Prerequisites

1. Podman installed and running
   ```bash
   # Check installation
   podman --version
   ```

2. Ollama running locally with required models
   ```bash
   # Check Ollama status
   ollama list
   
   # Make sure llama3.2:latest is available
   ollama pull llama3.2:latest
   ```

## Quick Start

1. **Start Ollama Service**
   ```bash
   # Pull the model first
   ollama pull llama3.2:latest
   
   # Run Ollama
   ollama run llama3.2:latest
   ```

2. **Deploy Backend Services**
   ```bash
   cd scripts
   chmod +x deploy.sh
   ./deploy.sh
   ```
   This will start:
   - Backend container (port 3001)
   - LLM Pod container (port 3002)

3. **Start Frontend (Manual Step)**
   ```bash
   cd frontend
   npm install
   npm run dev  # Runs on port 3000
   ```

4. **Test Deployment**
   ```bash
   cd deployment/scripts
   chmod +x test-deployment.sh
   ./test-deployment.sh
   ```

## Environment Configuration

1. Copy example environment files:
   ```bash
   cp .env.example .env
   cp ../backend/.env.example ../backend/.env
   cp ../pods/llm-pod/.env.example ../pods/llm-pod/.env
   ```

2. Adjust settings in `.env` if needed:
   ```
   BACKEND_PORT=3001
   LLM_POD_PORT=3002
   OLLAMA_MODEL=llama3.2:latest
   ```

## Directory Structure

```
deployment/
├── podman/
│   ├── compose.yml           # Container orchestration for production
│   └── containers/           # Production-optimized container definitions
│       ├── backend/         
│       │   └── Containerfile
│       ├── llm-pod/
│       │   └── Containerfile
│       ├── verification-pod/
│       │   └── Containerfile
│       ├── description-pod/
│       │   └── Containerfile
│       ├── tts-pod/
│       │   └── Containerfile
│       └── supabase-pod/
│           └── Containerfile
├── scripts/
│   ├── deploy.sh            # Main deployment script
│   ├── deploy-tts-pod.sh    # TTS pod deployment script
│   ├── deploy-supabase-pod.sh # Supabase pod deployment script
│   ├── setup-dev.sh         # Development environment setup
│   └── test-deployment.sh   # Deployment testing script
└── .env                     # Environment configuration
```

## Development vs. Production Setup

This project has two container orchestration configurations:

1. **Development Setup**
   - Located at project root: `docker-compose.yml`
   - Uses simplified Dockerfiles directly from pod directories
   - Set with NODE_ENV=development
   - Optimized for quick iteration and debugging
   
2. **Production Setup** (This document)
   - Located at `deployment/podman/compose.yml`
   - Uses optimized Containerfiles in this deployment directory
   - Set with NODE_ENV=production
   - Designed for deployments with additional optimizations

## Scripts

### deploy.sh
- Stops existing containers
- Creates network
- Builds new images
- Starts services with proper networking
- Shows container logs

### test-deployment.sh
- Verifies Ollama and model availability
- Checks all service endpoints
- Tests network connectivity
- Validates service chain

## Troubleshooting

1. **Port Conflicts**
   ```bash
   # Check if ports are in use
   lsof -i :3000  # Frontend
   lsof -i :3001  # Backend
   lsof -i :3002  # LLM Pod
   ```

2. **Container Issues**
   ```bash
   # View container status
   podman ps
   
   # Check logs
   podman logs backend
   podman logs llm-pod
   ```

3. **Ollama Connection**
   ```bash
   # Test Ollama API
   curl http://localhost:11434/api/version
   ```

## Network Architecture
```
Frontend (3000) → Backend (3001) → LLM Pod (3002) → Ollama (11434)
```

All services communicate over the `tour-network` bridge network, with Ollama accessed via host.containers.internal from within containers.
