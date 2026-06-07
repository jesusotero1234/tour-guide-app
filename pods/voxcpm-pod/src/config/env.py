import os
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass


PORT = int(os.getenv("PORT", "3006"))
MODEL_ID = os.getenv("MODEL_ID", "openbmb/VoxCPM2")
AUDIO_CACHE = Path(os.getenv("AUDIO_CACHE", "./cache")).resolve()
DEVICE = os.getenv("DEVICE", "cuda")
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", f"http://localhost:{PORT}")
OPTIMIZE = os.getenv("VOXCPM_OPTIMIZE", "true").strip().lower() not in {"0", "false", "no"}
