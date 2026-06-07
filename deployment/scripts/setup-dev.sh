#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check command availability
check_command() {
    if ! command -v $1 &> /dev/null; then
        echo -e "${RED}Error: $1 is required but not installed.${NC}"
        return 1
    fi
    echo -e "${GREEN}✓ $1 is installed${NC}"
    return 0
}

echo -e "${YELLOW}=== Setting up Tour Guide App Development Environment ===${NC}"

# Check prerequisites
echo -e "\n${YELLOW}Checking prerequisites...${NC}"
check_command "podman" || exit 1
check_command "node" || exit 1
check_command "npm" || exit 1
check_command "curl" || exit 1
check_command "ollama" || exit 1

# Test Ollama availability
echo -e "\n${YELLOW}Testing Ollama...${NC}"
if ! curl -s localhost:11434/api/version > /dev/null; then
    echo -e "${RED}Error: Ollama is not running. Please start it first.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Ollama is running${NC}"

# Check for required Ollama model
echo -e "\n${YELLOW}Checking for llama3.2:latest model...${NC}"
if ! ollama list | grep -q "llama3.2:latest"; then
    echo -e "${YELLOW}llama3.2:latest model not found, pulling...${NC}"
    ollama pull llama3.2:latest
fi
echo -e "${GREEN}✓ llama3.2:latest model is available${NC}"

# Create environment files if they don't exist
echo -e "\n${YELLOW}Setting up environment files...${NC}"

# Deployment environment
if [ ! -f "../.env" ]; then
    echo -e "${YELLOW}Creating deployment .env${NC}"
    cp "../.env.example" "../.env"
    echo -e "${GREEN}✓ Created deployment/.env${NC}"
fi

# Backend environment
if [ ! -f "../../backend/.env" ]; then
    echo -e "${YELLOW}Creating backend .env${NC}"
    cp "../../backend/.env.example" "../../backend/.env"
    echo -e "${GREEN}✓ Created backend/.env${NC}"
fi

# LLM Pod environment
if [ ! -f "../../pods/llm-pod/.env" ]; then
    echo -e "${YELLOW}Creating llm-pod .env${NC}"
    cp "../../pods/llm-pod/.env.example" "../../pods/llm-pod/.env"
    echo -e "${GREEN}✓ Created llm-pod/.env${NC}"
fi

# Frontend environment
if [ ! -f "../../frontend/.env" ]; then
    echo -e "${YELLOW}Creating frontend .env${NC}"
    cp "../../frontend/.env.example" "../../frontend/.env"
    echo -e "${GREEN}✓ Created frontend/.env${NC}"
fi

# Make scripts executable
echo -e "\n${YELLOW}Making scripts executable...${NC}"
chmod +x deploy.sh test-deployment.sh
echo -e "${GREEN}✓ Scripts are executable${NC}"

echo -e "\n${YELLOW}Installing dependencies...${NC}"

# Install backend dependencies
echo "Installing backend dependencies..."
cd ../../backend
npm install

# Install LLM pod dependencies
echo "Installing LLM pod dependencies..."
cd ../pods/llm-pod
npm install

# Install frontend dependencies
echo "Installing frontend dependencies..."
cd ../../frontend
npm install

cd ../deployment/scripts

echo -e "\n${GREEN}=== Development environment setup complete! ===${NC}"
echo -e "\nTo start the application:"
echo -e "${YELLOW}1. Start Ollama:${NC}"
echo "   ollama run llama3.2:latest"
echo -e "${YELLOW}2. Deploy backend services:${NC}"
echo "   ./deploy.sh"
echo -e "${YELLOW}3. Start frontend:${NC}"
echo "   cd frontend && npm run dev"
echo -e "${YELLOW}4. Test deployment:${NC}"
echo "   ./test-deployment.sh"

echo -e "\n${GREEN}Services will be available at:${NC}"
echo "Frontend: http://localhost:3000"
echo "Backend: http://localhost:3001"
echo "LLM Pod: http://localhost:3002"
echo "Ollama: http://localhost:11434"
