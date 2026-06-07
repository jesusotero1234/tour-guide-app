from fastapi import APIRouter, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from config import env
from services.voxcpm import CUDA_FATAL_ERROR, voxcpm_service


class TtsRequest(BaseModel):
    text: str
    language: str = "en"
    voice: str | None = None
    speed: float | None = None
    format: str = "wav"
    referenceId: str | None = None
    referenceWavPath: str | None = None


router = APIRouter(prefix="/tts")


@router.post("/generate")
def generate(request: TtsRequest):
    result = voxcpm_service.generate_speech(
        text=request.text,
        language=request.language,
        voice=request.voice,
        speed=request.speed,
        audio_format=request.format,
        reference_id=request.referenceId,
        reference_wav_path=request.referenceWavPath,
    )
    if not result.get("success") and result.get("error") == CUDA_FATAL_ERROR:
        return JSONResponse(content=result, status_code=503)
    return result


@router.post("/audio")
def audio(request: TtsRequest):
    result = generate(request)
    if isinstance(result, JSONResponse):
        return result
    if result.get("success"):
        return Response(
            content=f"{env.PUBLIC_BASE_URL}{result['audioUrl']}",
            media_type="text/plain",
        )
    return Response(content=result.get("error", "Unknown error"), status_code=500)
