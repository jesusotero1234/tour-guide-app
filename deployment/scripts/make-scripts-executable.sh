#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Making scripts executable...${NC}"

# Set working directory to project root
cd "$(dirname "$0")/../.."

# Make all deployment scripts executable
chmod +x deployment/scripts/*.sh

# Make all TTS pod scripts executable
chmod +x pods/tts-pod/scripts/*.sh

echo -e "\n${GREEN}Scripts in deployment/scripts:${NC}"
ls -la deployment/scripts/*.sh

echo -e "\n${GREEN}Scripts in pods/tts-pod/scripts:${NC}"
ls -la pods/tts-pod/scripts/*.sh

echo -e "\n${GREEN}✓ All scripts are now executable${NC}"

echo -e "\nYou can now run:"
echo -e "  ${YELLOW}./deployment/scripts/deploy-tts-pod.sh${NC} - Deploy TTS pod"
echo -e "  ${YELLOW}./pods/tts-pod/scripts/quick-test.sh${NC} - Test the service"
echo -e "  ${YELLOW}./pods/tts-pod/scripts/setup-dev.sh${NC} - Set up development environment"
