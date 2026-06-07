# Operations Documentation

This directory contains documentation related to operating, deploying, and managing the Tour Guide App.

## Contents

- [Container Management](./container-management.md) - Guidelines for working with containers

## Deployment

The Tour Guide App uses Docker containers for both development and production deployments. The application consists of multiple pods:

- Backend API (Port 3001)
- LLM Pod (Port 3002)
- Verification Pod (Port 3003)
- Description Pod (Port 3004)
- TTS Pod (Port 3005)
- Supabase Pod (Port 3006)

## Development Environment

To run the development environment:

```bash
# From the project root
./run-dev.sh
```

This script starts all required containers using Docker Compose with hot reloading enabled.

## Production Deployment

For production deployment:

```bash
# From the project root
cd deployment/scripts
./deploy.sh
```

This script builds optimized containers and deploys them according to the production configuration.

## Monitoring

The Tour Guide App includes standard logging for all services:

- REST API requests and responses
- LLM request/response pairs
- Audio generation events
- Database operations

All logs are available through Docker's logging system and can be accessed with:

```bash
docker logs <container_name>
```

## Common Operations

### Updating the LLM

When changing LLM providers or models:

1. Update the `.env` file in the LLM Pod
2. Restart the LLM Pod container
3. Test with a simple tour generation

### Adding Voices to TTS

To add new voices to the TTS system:

1. Place voice model files in the `tts-pod/models` directory
2. Update voice options in `tts-pod/src/config/voices.ts`
3. Restart the TTS Pod
