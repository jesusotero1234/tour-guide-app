#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Deploying TTS Pod...${NC}"

# Set working directory to project root
cd "$(dirname "$0")/../.."

# Create required volumes if they don't exist
echo -e "\n${YELLOW}Setting up volumes...${NC}"
podman volume create tts-models || true
podman volume create tts-cache || true

# Build the container
echo -e "\n${YELLOW}Building TTS Pod container...${NC}"
podman build \
  -t tts-pod:latest \
  -f deployment/podman/containers/tts-pod/Containerfile \
  .

if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to build container${NC}"
    exit 1
fi

# Stop and remove existing container if it exists
echo -e "\n${YELLOW}Cleaning up existing containers...${NC}"
podman stop tts-pod 2>/dev/null || true
podman rm tts-pod 2>/dev/null || true

# Run the container without resource limits
echo -e "\n${YELLOW}Starting TTS Pod...${NC}"
podman run -d \
  --name tts-pod \
  -p 3005:3005 \
  -v tts-models:/app/models \
  -v tts-cache:/app/cache \
  -e NODE_ENV=production \
  -e PORT=3005 \
  tts-pod:latest

if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to start container${NC}"
    exit 1
fi

# Wait for container to be ready
echo -e "\n${YELLOW}Waiting for service to be ready...${NC}"
max_attempts=30
attempt=1
while [ $attempt -le $max_attempts ]; do
    if curl -s http://localhost:3005/health > /dev/null; then
        echo -e "\n${GREEN}✓ TTS Pod is running${NC}"
        
        # Show connection details
        echo -e "\nService available at:"
        echo -e "  ${YELLOW}http://localhost:3005${NC}"
        echo -e "\nQuick test:"
        echo -e "  ${YELLOW}./pods/tts-pod/scripts/quick-test.sh${NC}"
        
        # Show container info
        echo -e "\nContainer info:"
        podman inspect tts-pod --format "{{.State.Status}}" | while read status; do
            echo -e "Status: ${GREEN}$status${NC}"
        done
        
        exit 0
    fi
    echo -n "."
    sleep 2
    attempt=$((attempt + 1))
done

echo -e "\n${RED}Service failed to become ready within 60 seconds${NC}"
echo "Container logs:"
podman logs tts-pod
exit 1
