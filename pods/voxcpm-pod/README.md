# VoxCPM Pod

Python/FastAPI TTS pod for VoxCPM2. It preserves the legacy `tts-pod` HTTP contract while running on port `3006`.

## Routes

- `GET /healthz` -> `{ "ok": true, "model": "openbmb/VoxCPM2", "device": "cuda" | "cpu" }`
- `POST /tts/generate` -> `{ success, audioUrl, audioData, format }`
- `POST /tts/audio` -> plain-text absolute URL
- `GET /audio/<file>.wav` -> cached WAV file

## Local development

```bash
cd pods/voxcpm-pod
./scripts/setup-dev.sh
source .venv/bin/activate
PYTHONPATH=src uvicorn server:app --host 0.0.0.0 --port 3006
```

Then run:

```bash
./scripts/quick-test.sh
```

First start downloads the VoxCPM2 model into the Hugging Face cache and can take several minutes.
