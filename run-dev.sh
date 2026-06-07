#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting Tour Guide App - Development Environment${NC}"

# Determine whether to use podman or docker
if command -v docker &> /dev/null; then
    CONTAINER_ENGINE="docker"
    echo -e "${GREEN}Using Docker${NC}"
elif command -v podman &> /dev/null; then
    CONTAINER_ENGINE="podman"
    echo -e "${GREEN}Using Podman${NC}"
else
    echo -e "${RED}Neither Docker nor Podman found. Please install one of them.${NC}"
    exit 1
fi

# Stop existing containers if running
echo -e "\n${YELLOW}Stopping any existing containers...${NC}"
$CONTAINER_ENGINE ps -a --format '{{.Names}}' | grep 'tour-guide' | xargs -r $CONTAINER_ENGINE stop
$CONTAINER_ENGINE ps -a --format '{{.Names}}' | grep 'tour-guide' | xargs -r $CONTAINER_ENGINE rm

# Start with Docker Compose/Podman Compose
echo -e "\n${YELLOW}Starting services with ${CONTAINER_ENGINE}...${NC}"

if [ "$CONTAINER_ENGINE" = "docker" ]; then
    # For Docker
    docker compose up -d
elif [ "$CONTAINER_ENGINE" = "podman" ]; then
    # For Podman - try with network host to avoid DNS issues
    podman-compose -f docker-compose.yml up --network host
fi

if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to start services!${NC}"
    
    if [ "$CONTAINER_ENGINE" = "podman" ]; then
        echo -e "${YELLOW}Trying alternative podman-compose command...${NC}"
        PODMAN_USERNS=keep-id podman-compose -f docker-compose.yml up -d
        
        if [ $? -ne 0 ]; then
            echo -e "${RED}Alternative command also failed. Try using Docker instead.${NC}"
            exit 1
        fi
    else
        exit 1
    fi
fi

# Show running containers
echo -e "\n${GREEN}Services started! Running containers:${NC}"
$CONTAINER_ENGINE ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Show how to view logs
echo -e "\n${YELLOW}To view logs:${NC}"
echo -e "${GREEN}${CONTAINER_ENGINE} logs -f [container_name]${NC}"

# Show how to start frontend
echo -e "\n${YELLOW}To start the frontend:${NC}"
echo -e "${GREEN}cd frontend && npm run dev${NC}"

echo -e "\n${GREEN}Development environment is ready!${NC}"
echo -e "${YELLOW}API services available at:${NC}"
echo -e "  Backend: http://localhost:3001"
echo -e "  LLM Pod: http://localhost:3002"
echo -e "  Verification Pod: http://localhost:3003"
echo -e "  Description Pod: http://localhost:3004"
echo -e "  TTS Pod: http://localhost:3005"
echo -e "  Supabase Pod: http://localhost:3006"
