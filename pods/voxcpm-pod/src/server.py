from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from config import env
from routes.tts import router as tts_router
from services.voxcpm import voxcpm_service


app = FastAPI(title="voxcpm-pod")

env.AUDIO_CACHE.mkdir(parents=True, exist_ok=True)
app.mount("/audio", StaticFiles(directory=str(env.AUDIO_CACHE)), name="audio")
app.include_router(tts_router)


@app.get("/healthz")
def healthz():
    status_code, payload = voxcpm_service.health_payload()
    return JSONResponse(content=payload, status_code=status_code)
