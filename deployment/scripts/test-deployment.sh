#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test function
test_endpoint() {
    local name=$1
    local url=$2
    echo -e "\n${YELLOW}Testing $name...${NC}"
    if curl -s -f "$url" > /dev/null; then
        echo -e "${GREEN}✓ $name is running at $url${NC}"
        return 0
    else
        echo -e "${RED}✗ $name is not accessible at $url${NC}"
        return 1
    fi
}

# Header
echo -e "${YELLOW}=== Testing Tour Guide App Deployment ===${NC}"

# Test Ollama
echo -e "\n${YELLOW}Testing Ollama...${NC}"
if curl -s -f "http://localhost:11434/api/version" > /dev/null; then
    echo -e "${GREEN}✓ Ollama is running${NC}"
    
    # Check if llama3.2:latest model is available
    if ollama list | grep -q "llama3.2:latest"; then
        echo -e "${GREEN}✓ llama3.2:latest model is available${NC}"
    else
        echo -e "${RED}✗ llama3.2:latest model not found. Please run: ollama pull llama3.2:latest${NC}"
    fi
else
    echo -e "${RED}✗ Ollama is not running. Please start it first.${NC}"
    exit 1
fi

# Load environment variables
if [ -f ../.env ]; then
    set -a
    source <(grep -v '^#' ../.env | sed '/^$/d')
    set +a
fi

# Define ports
BACKEND_PORT=${BACKEND_PORT:-3001}
LLM_POD_PORT=${LLM_POD_PORT:-3002}

# Test frontend availability
test_endpoint "Frontend" "http://localhost:3000"

# Test backend health
test_endpoint "Backend" "http://localhost:${BACKEND_PORT}/health"

# Test LLM pod health
test_endpoint "LLM Pod" "http://localhost:${LLM_POD_PORT}/health"

# Test container status
echo -e "\n${YELLOW}Checking container status...${NC}"
podman ps

# Test network
echo -e "\n${YELLOW}Checking network...${NC}"
podman network inspect tour-network

# Summary
echo -e "\n${YELLOW}=== Port Configuration ===${NC}"
echo "Frontend: http://localhost:3000"
echo "Backend: http://localhost:${BACKEND_PORT}"
echo "LLM Pod: http://localhost:${LLM_POD_PORT}"
echo "Ollama: http://localhost:11434"

# Test service connections
echo -e "\n${YELLOW}=== Testing Service Connections ===${NC}"
echo -e "${GREEN}Service Chain:${NC}"
echo "Frontend (3000) → Backend (3001) → LLM Pod (3002) → Ollama (11434)"

# Done
echo -e "\n${GREEN}Test complete!${NC}"
