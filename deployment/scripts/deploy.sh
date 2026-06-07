#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Load environment variables
if [ -f ../.env ]; then
    set -a
    source <(grep -v '^#' ../.env | sed '/^$/d')
    set +a
fi

# Ensure PODMAN_IGNORE_CGROUPSV1_WARNING is set
export PODMAN_IGNORE_CGROUPSV1_WARNING=1

# Get absolute paths
ROOT_DIR="/mnt/c/Users/Jesus/Desktop/Coding/tour-guide-app"
BACKEND_DIR="$ROOT_DIR/backend"
LLM_POD_DIR="$ROOT_DIR/pods/llm-pod"

echo -e "${YELLOW}Cleaning up existing containers...${NC}"
podman stop backend llm-pod 2>/dev/null || true
podman rm backend llm-pod 2>/dev/null || true
podman network rm tour-network 2>/dev/null || true

echo -e "${YELLOW}Creating network...${NC}"
podman network create tour-network

echo -e "${YELLOW}Building images...${NC}"
echo "Building backend..."
podman build -t tour-backend -f "$BACKEND_DIR/Dockerfile" "$BACKEND_DIR"

echo "Building LLM pod..."
podman build -t tour-llm -f "$LLM_POD_DIR/Dockerfile" "$LLM_POD_DIR"

echo -e "${YELLOW}Starting containers...${NC}"
# Start backend
podman run -d --name backend \
    --network tour-network \
    -p "${BACKEND_PORT:-3001}:${BACKEND_PORT:-3001}" \
    -e NODE_ENV="${NODE_ENV:-development}" \
    -e PORT="${BACKEND_PORT:-3001}" \
    tour-backend

# Start LLM pod
podman run -d --name llm-pod \
    --network tour-network \
    -p "${LLM_POD_PORT:-3002}:${LLM_POD_PORT:-3002}" \
    --add-host=host.containers.internal:host-gateway \
    -e NODE_ENV="${NODE_ENV:-development}" \
    -e PORT_LLM="${LLM_POD_PORT:-3002}" \
    -e OLLAMA_API_URL="${OLLAMA_API_URL:-http://host.containers.internal:11434}" \
    -e OLLAMA_MODEL="${OLLAMA_MODEL:-llama3.2:latest}" \
    tour-llm

echo -e "${YELLOW}Checking container status...${NC}"
podman ps

echo -e "${GREEN}Setup complete! Services should be running at:${NC}"
echo "Frontend: http://localhost:${FRONTEND_PORT:-3000}"
echo "Backend: http://localhost:${BACKEND_PORT:-3001}"
echo "LLM Pod: http://localhost:${LLM_POD_PORT:-3002}"
echo
echo -e "${YELLOW}To view logs use:${NC}"
echo "podman logs backend"
echo "podman logs llm-pod"
