# Saved-tour audio with Nano

`render-tour.py` now uses nano-vllm-voxcpm 2.0.4 with the pinned VoxCPM2 snapshot,
10 inference steps, CFG 2, temperature 1, one resident model and one encoded
reference per batch. It keeps the existing GPU supervisor and stop/chunk progress.
There is no silent fallback to the old engine. The standalone HTTP TTS service
is unchanged; this switch covers the saved-tour production renderer.

The renderer and backend select `guide-{language}-a.json` for supported Spanish
and French tours. `VOXCPM_PRESET_PATH` remains an explicit override. French uses
`guide-fr-recovered.wav`, its matching transcript, and `speed: 0.9`. Spanish keeps
speed 1.0. PyAV's `atempo` changes duration without changing pitch, after joining
chunks and before final normalization/MP3 encoding. Durations reflect the final
output. The cache version changes so old audio is not reused for new requests.

## Runtime

Use the existing CUDA-capable Python environment and install `requirements-nano.txt`
with a FlashAttention build compatible with its PyTorch/CUDA/GPU combination.
The adapter also supports an isolated package directory: `VOXCPM_NANO_DEPS`, default
`pods/voxcpm-pod/.nano-deps`. That directory is ignored by Git and must be provisioned
on each host; it must not point to a disposable experiment directory.

The current RTX 5080 host uses the already-validated FlashAttention 2.8.3.post1
build (C++20, inference build for sm120) with PyTorch 2.14.0+cu130, Nano 2.0.4,
and PyAV 17.1.0. Its packages were copied to the persistent `.nano-deps` directory.
A wheel built for another CUDA/PyTorch ABI is not interchangeable.

The checkpoint must be cached locally. Rendering is offline. Keep
`with-tts-gpu.py` as the entry point for GPU ownership and Qwen restoration.

## Checks

Run `scripts/test-nano.py` and `scripts/test-tour-audio-input.py` with the pod Python,
and the backend `TourAudioService.test.ts` suite with Node 22.
A real French two-chunk canary must also complete through `render-tour.py`, produce
an MP3 and report the decoded duration. User approval was for the recovered French
voice at 0.9x; this is not an approval of unseen narrations in other languages.

Validated on 2026-09-12: the working tree and isolated commit both generated the
same two-chunk French MP3 (byte-identical), 18.106 seconds after tempo adjustment.
ASR recovered the complete text in French. CPU pitch/duration/reference-reuse tests
and preparation tests passed; backend lifecycle suites passed (14 working-tree,
9 isolated tests). One isolated run exposed an existing intermittent failure-code
race (`AUDIO_INTERRUPTED` versus `AUDIO_GENERATION_FAILED`); the follow-up passed.
No assertion was weakened. The local backend was restarted and returned HTTP 200
on its health endpoint. No remote production host was deployed by this change.
