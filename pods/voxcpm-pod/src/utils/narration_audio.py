"""Bounded amplification and a short release for finished tour narrations."""
import numpy as np

NARRATION_POST_PROCESSING = {
    "normalizationPeak": 0.95,
    "normalizationMaxGain": 4.0,
    "endFadeMs": 10,
    "trailingSilenceMs": 900,
}


def finish_narration(audio: np.ndarray, sample_rate: int) -> np.ndarray:
    """Keep speech intact, limit peak gain, then add breathing room at the end."""
    samples = np.asarray(audio, dtype=np.float32)
    if samples.ndim != 1 or not samples.size or not np.isfinite(samples).all():
        raise ValueError("Expected finite, nonempty mono narration")
    if sample_rate <= 0:
        raise ValueError("Expected a positive sample rate")
    peak = float(np.max(np.abs(samples)))
    if peak < 1e-4:
        raise ValueError("Narration is silent")
    gain = min(NARRATION_POST_PROCESSING["normalizationMaxGain"],
               NARRATION_POST_PROCESSING["normalizationPeak"] / peak)
    finished = samples * gain
    # A tiny release avoids a click; a long fade could swallow the final word.
    fade_samples = min(len(finished), max(2, round(sample_rate * NARRATION_POST_PROCESSING["endFadeMs"] / 1000)))
    finished[-fade_samples:] *= np.linspace(1, 0, fade_samples, dtype=np.float32)
    tail = np.zeros(round(sample_rate * NARRATION_POST_PROCESSING["trailingSilenceMs"] / 1000), dtype=np.float32)
    return np.concatenate((finished, tail))
