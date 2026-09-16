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

## Approved French documentary profile (2026-09-15)

`presets/guide-fr-documentary-serene.json` stores the user's selected documentary
delivery. Select it explicitly with `VOXCPM_PRESET_PATH` when rendering the next
French batch. It uses reference-only controllable cloning, the approved style
instruction on each chunk, speed 1.0, and MP3 VBR compression level 0.0. The
adapter keeps continuation available for existing presets. The style instruction
is recorded in provenance and is separate from the visible/spoken transcript.

The user confirmed that the high-quality MP3 and lossless WAV both sounded much
better than the previous export, with no audible difference between those two.
The MP3 is the selected delivery format. Years are expanded to French words before
synthesis; narration finishing boosts quiet output with a capped gain and adds
900 ms of silence after a 10 ms end fade.

The default presets and published audio are still unchanged. Before activating
this profile, render and validate replacement audio, including the introduction
and first-stop pair. Changing the default preset or backend render version alone
invalidates the currently served audio. See `docs/tours/feedback-sevilla-20260915.md`
in the repository root for comparison artifacts and rollout status.

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
an MP3 and report the decoded duration. The initial approval was for the recovered
French voice at 0.9x; the September 15 profile above records the revised preference.

Validated on 2026-09-12: the working tree and isolated commit both generated the
same two-chunk French MP3 (byte-identical), 18.106 seconds after tempo adjustment.
ASR recovered the complete text in French. CPU pitch/duration/reference-reuse tests
and preparation tests passed; backend lifecycle suites passed (14 working-tree,
9 isolated tests). One isolated run exposed an existing intermittent failure-code
race (`AUDIO_INTERRUPTED` versus `AUDIO_GENERATION_FAILED`); the follow-up passed.
No assertion was weakened. The local backend was restarted and returned HTTP 200
on its health endpoint. No remote production host was deployed by this change.
