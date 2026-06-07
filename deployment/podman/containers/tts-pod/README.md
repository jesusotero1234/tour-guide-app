# TTS Pod Container

This directory contains the container configuration for the Text-to-Speech microservice using Kokoro TTS.

## Structure

```
tts-pod/
├── Containerfile          # Multi-stage container build
└── README.md             # This file
```

## Prerequisites

- Podman or Docker
- At least 4GB RAM available
- Python 3.12
- Node.js 20+

## Building

From the project root:
```bash
podman build -t tts-pod:latest -f deployment/podman/containers/tts-pod/Containerfile .
```

Or using podman-compose:
```bash
podman-compose -f deployment/podman/compose.yml build tts-pod
```

## Running

### Using deployment script (recommended):
```bash
./deployment/scripts/deploy-tts-pod.sh
```

### Using podman directly:
```bash
podman run -d \
  --name tts-pod \
  -p 3005:3005 \
  -v tts-models:/app/models \
  -v tts-cache:/app/cache \
  -e NODE_ENV=production \
  -e BASE_URL=http://localhost:3005 \
  --memory=4g \
  tts-pod:latest
```

### Using podman-compose:
```bash
podman-compose -f deployment/podman/compose.yml up tts-pod
```

## Volumes

- `tts-models`: Stores Kokoro TTS model files
- `tts-cache`: Stores generated audio files

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| NODE_ENV | Environment | production |
| PORT | Server port | 3005 |
| BASE_URL | Public URL | http://localhost:3005 |
| MODELS_PATH | Models directory | /app/models |
| AUDIO_CACHE | Cache directory | /app/cache |

## Health Checks

The container includes automatic health checking that verifies:
- Service is responding
- TTS models are loaded
- Audio generation is working

Check container health with:
```bash
podman inspect --format='{{.State.Health.Status}}' tts-pod
```

## Logs

View logs with:
```bash
podman logs tts-pod
```

Or follow logs:
```bash
podman logs -f tts-pod
```

## Troubleshooting

1. If the container fails to start:
   - Check logs: `podman logs tts-pod`
   - Verify model files are downloaded
   - Ensure enough memory is available

2. If audio generation fails:
   - Check model files in `/app/models`
   - Verify Python dependencies installation
   - Check disk space for cache

3. Common issues:
   - Memory limits too low
   - Missing model files
   - Network connectivity for model download
   - File permissions in volumes
