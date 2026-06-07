#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Making scripts executable...${NC}"

# Make all scripts in the scripts directory executable
chmod +x scripts/*.sh

# List all scripts with their permissions
echo -e "\n${YELLOW}Script permissions:${NC}"
ls -l scripts/*.sh

echo -e "\n${GREEN}✓ All scripts are now executable${NC}"
