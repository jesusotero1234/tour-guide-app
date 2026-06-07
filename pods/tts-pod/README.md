# TTS Pod Service

Text-to-Speech microservice using Kokoro TTS for high-quality speech synthesis.

## Quick Start

1. Deploy with container:
```bash
./deployment/scripts/deploy-tts-pod.sh
./pods/tts-pod/scripts/quick-test.sh
```

2. Or run locally:
```bash
./scripts/setup-dev.sh
npm run dev
```

## API Usage

Generate speech:
```bash
curl -X POST http://localhost:3005/generate \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello world",
    "language": "en-us",
    "voice": "af_sarah",
    "speed": 1.0,
    "format": "wav"
  }'
```

List voices:
```bash
curl http://localhost:3005/voices
```

## Available Voices

| Language | Code | Available Voices |
|----------|------|-----------------|
| US English | en-us | Female: af_alloy, af_aoede, af_bella, af_heart, af_jessica, af_kore, af_nicole, af_nova, af_river, af_sarah, af_sky<br>Male: am_adam, am_echo, am_eric, am_fenrir, am_liam, am_michael, am_onyx, am_puck |
| UK English | en-gb | Female: bf_alice, bf_emma, bf_isabella, bf_lily<br>Male: bm_daniel, bm_fable, bm_george, bm_lewis |
| French | fr-fr | Female: ff_siwis |
| Italian | it | Female: if_sara<br>Male: im_nicola |
| Japanese | ja | Female: jf_alpha, jf_gongitsune, jf_nezumi, jf_tebukuro<br>Male: jm_kumo |
| Chinese | cmn | Female: zf_xiaobei, zf_xiaoni, zf_xiaoxiao, zf_xiaoyi<br>Male: zm_yunjian, zm_yunxi, zm_yunxia, zm_yunyang |

## Development

Requirements:
- Node.js 20+
- Python 3.12+
- Git
- podman/docker (optional)

### Local Development

```bash
# Setup dev environment
./scripts/setup-dev.sh

# Start development server
npm run dev

# Run tests
./scripts/quick-test.sh

# Clear cache
./scripts/cleanup.sh
```

### Container Deployment

```bash
# Build and run container
./deployment/scripts/deploy-tts-pod.sh

# Test deployment
./scripts/quick-test.sh
```

## Configuration

Environment variables:
```env
PORT=3005                  # Server port
NODE_ENV=development       # Environment (development/production)
MODELS_PATH=./models      # Path to model files
AUDIO_CACHE=./cache       # Path to audio cache
```

## Troubleshooting

1. Missing model files:
   ```bash
   # Manually download models
   mkdir -p models
   cd models
   wget https://github.com/nazdridoy/kokoro-tts/releases/download/v1.0.0/voices-v1.0.bin
   wget https://github.com/nazdridoy/kokoro-tts/releases/download/v1.0.0/kokoro-v1.0.onnx
   ```

2. Python dependency issues:
   ```bash
   pip install --upgrade pip
   pip install -r requirements.txt
   ```

3. Container issues:
   ```bash
   # View logs
   podman logs tts-pod
   
   # Restart service
   podman restart tts-pod
