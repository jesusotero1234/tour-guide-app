# LLM Pod

This service handles natural language processing tasks using Ollama with the llama3.2 model.

## Prerequisites

- Node.js v20 or higher
- Ollama installed locally (for development)
- At least 8GB RAM recommended

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set up Ollama:
```bash
# Install Ollama if not already installed
curl https://ollama.ai/install.sh | sh

# Pull the required model
ollama pull llama3.2:latest
```

3. Create `.env` file:
```bash
cp .env.example .env
```

4. Configure environment variables in `.env`:
```
PORT=3002
NODE_ENV=development
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=llama3.2:latest
```

## Development

Start the development server:
```bash
npm run dev
```

The service will be available at `http://localhost:3002`.

## API Endpoints

### POST /generate/places
Generate places for a tour based on user preferences.

Request body:
```json
{
  "city": "Madrid",
  "country": "Spain",
  "countryCode": "ES",
  "interests": ["history", "architecture"],
  "duration": 180,
  "maxStops": 5
}
```

Response:
```json
{
  "places": [
    {
      "name": "Royal Palace of Madrid",
      "description": "Historic palace and official residence of the Spanish Royal Family",
      "estimatedDuration": 45,
      "coordinates": {
        "lat": 40.4180,
        "lng": -3.7143
      }
    }
    // ... more places
  ]
}
```

## Docker/Podman Deployment

The service is containerized with Ollama included. To build and run:

```bash
# Build the image
podman build -t tour-guide/llm-pod -f deployment/podman/containers/llm-pod/Containerfile .

# Run the container
podman run -d \
  --name llm-pod \
  -p 3002:3002 \
  -p 11434:11434 \
  -v ollama_data:/root/.ollama \
  tour-guide/llm-pod
```

### Resource Requirements

- Memory: At least 4GB, recommended 8GB
- Storage: At least 5GB for model files
- CPU: 2 cores minimum, 4 cores recommended

## Monitoring

The service includes a health check endpoint:

```bash
curl http://localhost:3002/health
```

Response:
```json
{
  "status": "ok",
  "env": "development",
  "model": "llama3.2:latest",
  "host": "http://localhost:11434"
}
```

## Error Handling

- Rate limiting is enabled to prevent overload
- Errors are logged with appropriate context
- API responses include detailed error information
