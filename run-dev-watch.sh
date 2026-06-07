#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting Tour Guide App - Development Environment with Hot Reloading${NC}"

# Check if Podman is installed
if command -v podman &> /dev/null; then
    CONTAINER_ENGINE="podman"
    echo -e "${GREEN}Using Podman${NC}"
else
    echo -e "${RED}Podman is not installed. Please install it.${NC}"
    exit 1
fi

# Stop existing containers if running
echo -e "\n${YELLOW}Stopping any existing containers...${NC}"
$CONTAINER_ENGINE ps -a --format "{{.Names}}" | grep 'tour-guide' | xargs -r $CONTAINER_ENGINE stop
$CONTAINER_ENGINE ps -a --format "{{.Names}}" | grep 'tour-guide' | xargs -r $CONTAINER_ENGINE rm

# Start with Podman Compose using the dev file
echo -e "\n${YELLOW}Starting services with hot reloading...${NC}"

# For Podman - Temporarily link the dev file
echo -e "${YELLOW}Creating temporary Podman Compose file...${NC}"
ln -s docker-compose.dev.yml podman-compose.yaml

# Start containers
podman-compose up -d

# Cleanup the symbolic link
rm podman-compose.yaml

# Check if the services started successfully
if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to start services!${NC}"
    exit 1
fi

# Show running containers
echo -e "\n${GREEN}Services started with hot reloading! Running containers:${NC}"
$CONTAINER_ENGINE ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Show how to view logs
echo -e "\n${YELLOW}To view logs:${NC}"
echo -e "${GREEN}podman logs -f [container_name]${NC}"

echo -e "\n${YELLOW}Hot Reloading:${NC}"
echo -e "${GREEN}File changes in any of the src directories will automatically reload the services.${NC}"

# Show how to start frontend
echo -e "\n${YELLOW}To start the frontend:${NC}"
echo -e "${GREEN}cd frontend && npm run dev${NC}"

echo -e "\n${GREEN}Development environment with hot reloading is ready!${NC}"
echo -e "${YELLOW}API services available at:${NC}"
echo -e "  Backend: http://localhost:3001"
echo -e "  LLM Pod: http://localhost:3002"
echo -e "  Verification Pod: http://localhost:3003"
echo -e "  Description Pod: http://localhost:3004"
echo -e "  TTS Pod: http://localhost:3005"
echo -e "  Supabase Pod: http://localhost:3006"
