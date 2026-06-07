import base64
import hashlib
import json
import os
import threading
import time
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from voxcpm import VoxCPM

from config import env
from utils.logger import logger
from utils.sanitize import TextChunk, chunk_text, sanitize_text


VOICE_DESCRIPTIONS = {
    "en": "A warm, friendly adult museum guide, calm baritone voice, clear diction, steady pace",
    "es": "Una voz cálida de guía adulto de museo, barítono tranquilo, dicción clara, ritmo constante",
    "fr": "Une voix chaleureuse de guide adulte de musée, baryton calme, diction claire, rythme régulier",
    "de": "Eine warme erwachsene Museumsführer-Stimme, ruhiger Bariton, klare Aussprache, gleichmäßiges Tempo",
    "it": "Una voce calda di guida adulta di museo, baritono calmo, dizione chiara, ritmo costante",
}

VOICE_PROFILES = {
    "guide_en": VOICE_DESCRIPTIONS["en"],
    "guide_es": VOICE_DESCRIPTIONS["es"],
    "guide_fr": VOICE_DESCRIPTIONS["fr"],
    "guide_de": VOICE_DESCRIPTIONS["de"],
    "guide_it": VOICE_DESCRIPTIONS["it"],
}

CUDA_FATAL_ERROR = "CUDA context corrupted — pod restarting"


def _int_env(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


def _float_env(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


def _estimate_tokens(text: str, desc: str = "") -> int:
    punctuation = len([ch for ch in text if ch in ".,;:!?-()"])
    rough = (len(text) + len(desc)) // 3
    density_penalty = punctuation // 4
    return max(1, rough + density_penalty)


def resolve_voice_description(voice: str | None, language: str) -> tuple[str, str]:
    lang = (language or "en")[:2]
    default_profile = f"guide_{lang}" if f"guide_{lang}" in VOICE_PROFILES else "guide_en"

    if not voice:
        return default_profile, VOICE_PROFILES[default_profile]

    normalized_voice = voice.strip()
    if normalized_voice in VOICE_PROFILES:
        return normalized_voice, VOICE_PROFILES[normalized_voice]

    # Kokoro voice ids may be passed through the shared backend payload. Treat
    # them as "no VoxCPM profile selected" instead of turning ids into prompts.
    if " " not in normalized_voice and len(normalized_voice) <= 32:
        return default_profile, VOICE_PROFILES[default_profile]

    custom_description = " ".join(normalized_voice.replace("(", "").replace(")", "").split())[:220]
    if not custom_description:
        return default_profile, VOICE_PROFILES[default_profile]
    return "custom", custom_description


def _silence_threshold(audio: np.ndarray) -> float:
    if np.issubdtype(audio.dtype, np.integer):
        return float(_int_env("VOXCPM_SILENCE_THRESHOLD", 8))
    return _float_env("VOXCPM_SILENCE_THRESHOLD", 0.003)


def trim_edge_silence(
    audio: np.ndarray,
    sample_rate: int,
    max_trim_ms: int | None = None,
    threshold: float | None = None,
) -> np.ndarray:
    if audio.size == 0:
        return audio

    if max_trim_ms is None:
        max_trim_ms = _int_env("VOXCPM_TRIM_EDGE_SILENCE_MS", 120)
    if max_trim_ms <= 0:
        return audio

    if threshold is None:
        threshold = _silence_threshold(audio)

    max_trim_samples = min(len(audio) // 2, int(sample_rate * max_trim_ms / 1000))
    if max_trim_samples <= 0:
        return audio

    start = 0
    while start < max_trim_samples and abs(float(audio[start])) <= threshold:
        start += 1

    end = len(audio)
    min_end = len(audio) - max_trim_samples
    while end > min_end and abs(float(audio[end - 1])) <= threshold:
        end -= 1

    if start >= end:
        return audio
    return audio[start:end]


def join_audio_chunks(
    generated_chunks: list[tuple[np.ndarray, TextChunk]],
    sample_rate: int,
    crossfade_ms: int | None = None,
) -> np.ndarray:
    if len(generated_chunks) == 1:
        return generated_chunks[0][0]

    if crossfade_ms is None:
        crossfade_ms = _int_env("VOXCPM_CHUNK_CROSSFADE_MS", 18)

    crossfade_samples = max(1, int(sample_rate * crossfade_ms / 1000))
    audio = generated_chunks[0][0]

    for index, (next_chunk, _) in enumerate(generated_chunks[1:]):
        boundary = generated_chunks[index][1].boundary
        current_audio = trim_edge_silence(audio, sample_rate)
        next_audio = trim_edge_silence(next_chunk, sample_rate)

        if boundary == "split":
            overlap = min(crossfade_samples, len(current_audio), len(next_audio))
            if overlap <= 1:
                audio = np.concatenate([current_audio, next_audio])
                continue

            fade_out = np.linspace(1.0, 0.0, overlap, dtype=current_audio.dtype)
            fade_in = np.linspace(0.0, 1.0, overlap, dtype=next_audio.dtype)
            blended = current_audio[-overlap:] * fade_out + next_audio[:overlap] * fade_in
            audio = np.concatenate([current_audio[:-overlap], blended, next_audio[overlap:]])
            continue

        pause_ms = _int_env("VOXCPM_SENTENCE_PAUSE_MS", 180)
        if boundary == "paragraph":
            pause_ms = _int_env("VOXCPM_PARAGRAPH_PAUSE_MS", 420)
        silence_samples = max(0, int(sample_rate * pause_ms / 1000))
        silence = np.zeros(silence_samples, dtype=current_audio.dtype)
        audio = np.concatenate([current_audio, silence, next_audio])

    return audio


def normalize_audio(audio: np.ndarray, peak: float = 0.95) -> np.ndarray:
    max_abs = float(np.max(np.abs(audio))) if audio.size else 0.0
    if max_abs <= 0.0:
        return audio
    return audio * min(1.0, peak / max_abs)


class VoxCpmService:
    def __init__(self) -> None:
        self._model = None
        self._generation_lock = threading.Lock()
        self._fatal_error: str | None = None

    @property
    def model(self):
        if self._model is None:
            logger.info("Loading VoxCPM model", extra={"model": env.MODEL_ID})
            self._model = VoxCPM.from_pretrained(
                env.MODEL_ID,
                load_denoiser=False,
                optimize=env.OPTIMIZE,
                device=env.DEVICE,
            )
        return self._model

    def health_payload(self) -> tuple[int, dict]:
        if self._fatal_error:
            return 503, {"ok": False, "model": env.MODEL_ID, "device": env.DEVICE, "fatal": True, "error": self._fatal_error}
        return 200, {"ok": True, "model": env.MODEL_ID, "device": env.DEVICE, "optimize": env.OPTIMIZE}

    def _is_cuda_fatal_error(self, error: Exception) -> bool:
        if isinstance(error, torch.AcceleratorError):
            return True
        message = str(error).lower()
        fatal_markers = [
            "device-side assert",
            "cuda context",
            "cuda error",
            "index out of bounds",
        ]
        return any(marker in message for marker in fatal_markers)

    def _mark_cuda_fatal(self, error: Exception) -> dict:
        self._fatal_error = CUDA_FATAL_ERROR
        logger.error(
            "FATAL: CUDA context poisoned by device-side assert. Exiting pod.",
            extra={"error": str(error)},
        )
        threading.Timer(0.2, lambda: os._exit(1)).start()
        return {"success": False, "error": CUDA_FATAL_ERROR, "fatal": True}

    def generate_speech(
        self,
        text: str,
        language: str = "en",
        voice: str | None = None,
        speed: float | None = None,
        audio_format: str = "wav",
        reference_id: str | None = None,
        reference_wav_path: str | None = None,
    ) -> dict:
        if audio_format != "wav":
            return {"success": False, "error": "Only wav output is supported"}

        if self._fatal_error:
            return {"success": False, "error": self._fatal_error, "fatal": True}

        try:
            wait_started_at = time.monotonic()
            self._generation_lock.acquire()
            waited_ms = int((time.monotonic() - wait_started_at) * 1000)
            if waited_ms > 0:
                logger.info("Queued VoxCPM request acquired generation lock", extra={"waitedMs": waited_ms})

            env.AUDIO_CACHE.mkdir(parents=True, exist_ok=True)
            cleaned = sanitize_text(text)
            if not cleaned:
                return {"success": False, "error": "Text is required"}

            voice_profile, desc = resolve_voice_description(voice, language)
            chunk_max_chars = _int_env("VOXCPM_CHUNK_MAX_CHARS", 360)
            chunks = chunk_text(cleaned, max_chars=chunk_max_chars)
            generated_chunks = []
            reference = self._resolve_voice_reference(language, voice_profile, desc, reference_id, reference_wav_path)

            logger.info(
                "Generating VoxCPM audio",
                extra={
                    "voiceProfile": voice_profile,
                    "language": language,
                    "chunks": len(chunks),
                    "chunkMaxChars": chunk_max_chars,
                    "seedSupported": False,
                    "referenceMode": reference is not None,
                    "referenceId": reference["id"] if reference else None,
                },
            )

            mode = "voice-design"
            if reference:
                try:
                    generated_chunks = self._generate_with_reference(chunks, reference, desc)
                    mode = "reference"
                except Exception as error:
                    if self._is_cuda_fatal_error(error):
                        raise
                    logger.warning(
                        "VoxCPM reference mode failed; falling back to Voice Design",
                        extra={"voiceProfile": voice_profile, "referenceId": reference["id"], "error": str(error)},
                    )

            if not generated_chunks:
                generated_chunks = self._generate_with_voice_design(chunks, desc)

            if not generated_chunks:
                return {"success": False, "error": "No safe chunks available after token guard"}

            sample_rate = self.model.tts_model.sample_rate
            audio = normalize_audio(join_audio_chunks(generated_chunks, sample_rate))
            output_path = self._output_path(audio_format)
            sf.write(output_path, audio, sample_rate)

            audio_bytes = output_path.read_bytes()
            logger.info(
                "Generated audio",
                extra={
                    "path": str(output_path),
                    "bytes": len(audio_bytes),
                    "voiceProfile": voice_profile,
                    "generationMode": mode,
                    "referenceId": reference["id"] if reference else None,
                },
            )
            return {
                "success": True,
                "audioUrl": f"/audio/{output_path.name}",
                "audioData": base64.b64encode(audio_bytes).decode("ascii"),
                "format": "wav",
                "generationMode": mode,
                "referenceId": reference["id"] if reference else None,
            }
        except Exception as error:
            if self._is_cuda_fatal_error(error):
                return self._mark_cuda_fatal(error)
            raise
        finally:
            if self._generation_lock.locked():
                self._generation_lock.release()

    def _generate_with_voice_design(self, chunks: list[TextChunk], desc: str) -> list[tuple[np.ndarray, TextChunk]]:
        wav_chunks = []
        cfg_value = _float_env("VOXCPM_CFG_VALUE", 2.0)
        inference_timesteps = _int_env("VOXCPM_INFERENCE_TIMESTEPS", 10)
        sample_rate = self.model.tts_model.sample_rate
        for index, chunk in enumerate(chunks):
            part = chunk.text
            estimated = _estimate_tokens(part, desc)
            if estimated > 500:
                logger.warning(
                    "Chunk exceeds safe token limit; skipping",
                    extra={"estimatedTokens": estimated, "maxTokens": 500, "mode": "voice-design", "boundary": chunk.boundary},
                )
                sub_chunks = chunk_text(part, max_chars=140)
                if len(sub_chunks) > 1:
                    for sub_index, sub_chunk in enumerate(sub_chunks):
                        sub_part = sub_chunk.text
                        sub_estimated = _estimate_tokens(sub_part, desc)
                        if sub_estimated > 500:
                            continue
                        prompt = f"({desc}){sub_part}"
                        wav = self.model.generate(text=prompt, cfg_value=cfg_value, inference_timesteps=inference_timesteps)
                        logger.info(
                            "Generated VoxCPM sub-chunk",
                            extra={
                                "mode": "voice-design",
                                "chunkIndex": index,
                                "subChunkIndex": sub_index,
                                "boundary": sub_chunk.boundary,
                                "chars": len(sub_part),
                                "estimatedTokens": sub_estimated,
                                "durationMs": int(len(wav) * 1000 / sample_rate),
                            },
                        )
                        wav_chunks.append((np.asarray(wav), sub_chunk))
                continue
            prompt = f"({desc}){part}"
            wav = self.model.generate(text=prompt, cfg_value=cfg_value, inference_timesteps=inference_timesteps)
            logger.info(
                "Generated VoxCPM chunk",
                extra={
                    "mode": "voice-design",
                    "chunkIndex": index,
                    "boundary": chunk.boundary,
                    "chars": len(part),
                    "estimatedTokens": estimated,
                    "durationMs": int(len(wav) * 1000 / sample_rate),
                },
            )
            wav_chunks.append((np.asarray(wav), chunk))
        return wav_chunks

    def _generate_with_reference(self, chunks: list[TextChunk], reference: dict, desc: str) -> list[tuple[np.ndarray, TextChunk]]:
        wav_chunks = []
        for chunk in chunks:
            wav = self._generate_reference_chunk(chunk, reference, desc)
            if wav is None:
                sub_chunks = chunk_text(chunk.text, max_chars=140)
                if len(sub_chunks) > 1:
                    for sub_chunk in sub_chunks:
                        sub_wav = self._generate_reference_chunk(sub_chunk, reference, desc)
                        if sub_wav is not None:
                            wav_chunks.append((np.asarray(sub_wav), sub_chunk))
                continue
            wav_chunks.append((np.asarray(wav), chunk))
        return wav_chunks

    def _generate_reference_chunk(self, chunk: TextChunk, reference: dict, desc: str):
        text = chunk.text
        estimated = _estimate_tokens(text)
        if estimated > 500:
            logger.warning(
                "Chunk exceeds safe token limit; skipping",
                extra={
                    "estimatedTokens": estimated,
                    "maxTokens": 500,
                    "mode": "reference",
                    "referenceId": reference["id"],
                    "boundary": chunk.boundary,
                },
            )
            return None
        cfg_value = _float_env("VOXCPM_CFG_VALUE", 2.0)
        inference_timesteps = _int_env("VOXCPM_INFERENCE_TIMESTEPS", 10)
        prompt = f"({desc}){text}"
        wav = self.model.generate(
            text=prompt,
            reference_wav_path=reference["path"],
            cfg_value=cfg_value,
            inference_timesteps=inference_timesteps,
        )
        logger.info(
            "Generated VoxCPM chunk",
            extra={
                "mode": "reference",
                "referenceId": reference["id"],
                "boundary": chunk.boundary,
                "chars": len(text),
                "estimatedTokens": estimated,
                "durationMs": int(len(wav) * 1000 / self.model.tts_model.sample_rate),
            },
        )
        return wav

    def _resolve_voice_reference(
        self,
        language: str,
        voice_profile: str,
        desc: str,
        reference_id: str | None,
        reference_wav_path: str | None,
    ) -> dict | None:
        if reference_wav_path:
            path = Path(reference_wav_path)
            if path.exists():
                return {"id": reference_id or path.stem, "path": str(path), "source": "request"}
            logger.warning("Requested VoxCPM reference WAV does not exist", extra={"path": str(path)})

        refs_dir = env.AUDIO_CACHE / "voice_references"
        refs_dir.mkdir(parents=True, exist_ok=True)
        model_key = env.MODEL_ID.replace("/", "_")
        lang = (language or "en")[:2]
        profile_key = voice_profile if voice_profile != "custom" else f"custom_{hashlib.sha1(desc.encode('utf-8')).hexdigest()[:8]}"
        stable_id = reference_id or hashlib.sha1(f"voxcpm|{model_key}|{lang}|{profile_key}".encode("utf-8")).hexdigest()[:16]
        path = refs_dir / f"{stable_id}.wav"

        if not path.exists():
            try:
                bootstrap_text = self._bootstrap_text(lang, desc)
                wav = self.model.generate(
                    text=bootstrap_text,
                    cfg_value=_float_env("VOXCPM_CFG_VALUE", 2.0),
                    inference_timesteps=_int_env("VOXCPM_INFERENCE_TIMESTEPS", 10),
                )
                sf.write(path, normalize_audio(np.asarray(wav)), self.model.tts_model.sample_rate)
                logger.info("Created VoxCPM voice reference", extra={"referenceId": stable_id, "path": str(path), "voiceProfile": profile_key})
            except Exception as error:
                logger.warning("Failed to create VoxCPM voice reference", extra={"referenceId": stable_id, "error": str(error)})
                return None

        self._audit_voice_reference(refs_dir, stable_id, path, lang, profile_key, model_key)
        return {"id": stable_id, "path": str(path), "source": "cache"}

    def _bootstrap_text(self, language: str, desc: str) -> str:
        samples = {
            "es": "Bienvenidos. Soy su guía local para este recorrido; hablaré con claridad, calma y un ritmo constante.",
            "fr": "Bienvenue. Je serai votre guide local pour cette visite, avec une voix claire, calme et régulière.",
            "de": "Willkommen. Ich begleite Sie als lokaler Guide mit klarer, ruhiger und gleichmäßiger Stimme.",
            "it": "Benvenuti. Sarò la vostra guida locale con una voce chiara, calma e dal ritmo costante.",
        }
        sample = samples.get(language, "Welcome. I will be your local guide for this tour, speaking clearly, calmly, and at a steady pace.")
        return f"({desc}){sample}"

    def _audit_voice_reference(self, refs_dir: Path, reference_id: str, path: Path, language: str, voice_profile: str, model_key: str) -> None:
        manifest_path = refs_dir / "manifest.json"
        try:
            manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
            manifest[reference_id] = {
                "provider": "voxcpm",
                "model": model_key,
                "language": language,
                "voiceProfile": voice_profile,
                "path": str(path),
                "updatedAtMs": int(time.time() * 1000),
            }
            manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True))
        except Exception as error:
            logger.warning("Failed to audit VoxCPM voice reference", extra={"referenceId": reference_id, "error": str(error)})

    def _output_path(self, audio_format: str) -> Path:
        return env.AUDIO_CACHE / f"{int(time.time() * 1000)}.{audio_format}"


voxcpm_service = VoxCpmService()
