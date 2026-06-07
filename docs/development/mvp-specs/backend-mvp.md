# Backend MVP Documentation

[→ See Development Roadmap for next steps](./development-roadmap.md)

## Service Architecture

### Components & Ports
- Frontend (Next.js): Port 3000
- Backend API: Port 3001
- LLM Pod: Port 3002
- Ollama: Port 11434

### Dependencies

#### LLM Requirements
- Ollama running locally
- Model: `llama3.2:latest`
  ```bash
  # Pull the model
  ollama pull llama3.2:latest
  
  # Run Ollama
  ollama run llama3.2:latest
  ```

### Service Communication
```
Frontend (3000) → Backend (3001) → LLM Pod (3002) → Ollama (11434)
```

### Startup Process

1. Prerequisites:
   - Ollama must be running with llama3.2:latest model
   - Podman installed and configured
   - Node.js for frontend development

2. Start Container Services (Automated):
   ```bash
   cd deployment/scripts
   ./deploy.sh  # Starts backend and LLM pod automatically
   ```
   This starts:
   - Backend container (port 3001)
   - LLM Pod container (port 3002)

3. Start Frontend (Manual):
   ```bash
   cd frontend
   npm install
   npm run dev  # Runs on port 3000
   ```

### Environment Configuration

1. Backend (.env):
   ```
   PORT=3001
   NODE_ENV=development
   LLM_SERVICE_URL=http://localhost:3002
   ```

2. LLM Pod (.env):
   ```
   PORT_LLM=3002
   OLLAMA_API_URL=http://host.containers.internal:11434
   OLLAMA_MODEL=llama3.2:latest
   ```

### Health Checks
- Backend: `http://localhost:3001/health`
- LLM Pod: `http://localhost:3002/health`

### Development Workflow
1. Start Ollama service with llama3.2:latest model
2. Run `./deploy.sh` to start containerized services
3. Start frontend development server
4. Use `./test-deployment.sh` to verify all services are running

### Troubleshooting
1. **Port Conflicts**
   - Frontend needs 3000
   - Backend needs 3001
   - LLM Pod needs 3002
   - Check running services: `lsof -i :<port>`

2. **Container Issues**
   - View logs: `podman logs <container_name>`
   - Check status: `podman ps`
   - Restart services: `./deploy.sh`

3. **Ollama Connection**
   - Verify Ollama is running: `ollama list`
   - Check model availability: `ollama pull llama3.2:latest`
   - Test direct connection: `curl http://localhost:11434/api/generate`
