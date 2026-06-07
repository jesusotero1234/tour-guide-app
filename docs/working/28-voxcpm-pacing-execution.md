# VoxCPM Pacing Execution

Status: **completed for the first pacing-improvement pass**.

## Goal

Make generated tour audio sound more natural by reducing audible chunk seams, preserving section-level pauses, and keeping a calmer rhythm after punctuation.

## Problem Summary

- VoxCPM was chunking long narrations into many short pieces.
- All chunk joins used the same stitching strategy, regardless of whether the cut happened at a sentence, paragraph, or forced split.
- Paragraph breaks from the narration builder were flattened into one long text stream.
- Reference mode kept timbre consistency, but lost explicit rhythm guidance from the voice description prompt.
- Inference pacing controls were hardcoded, so there was no safe A/B surface for tuning.

## Execution Plan

1. Preserve paragraph structure during sanitization instead of flattening all whitespace.
2. Replace plain string chunking with chunk metadata that records boundary type.
3. Split long sentences more carefully before hard word wrapping.
4. Stitch chunk audio with boundary-aware pauses:
   - short crossfade only for forced split boundaries
   - sentence pause for natural sentence joins
   - longer paragraph pause for section breaks
5. Reapply voice-description conditioning in reference mode.
6. Expose pacing and inference knobs via environment variables.
7. Add chunk-level logs and run lightweight verification.

## Planned Environment Knobs

- `VOXCPM_CHUNK_MAX_CHARS`
- `VOXCPM_CHUNK_CROSSFADE_MS`
- `VOXCPM_SENTENCE_PAUSE_MS`
- `VOXCPM_PARAGRAPH_PAUSE_MS`
- `VOXCPM_TRIM_EDGE_SILENCE_MS`
- `VOXCPM_SILENCE_THRESHOLD`
- `VOXCPM_CFG_VALUE`
- `VOXCPM_INFERENCE_TIMESTEPS`

## Files In Scope

- `pods/voxcpm-pod/src/utils/sanitize.py`
- `pods/voxcpm-pod/src/services/voxcpm.py`
- `docs/working/28-voxcpm-pacing-execution.md`

## Executed Changes

- Preserved paragraph boundaries during sanitization instead of flattening all whitespace.
- Replaced plain string chunking with `TextChunk(text, boundary)` metadata.
- Added clause-aware fallback splitting before hard word wrapping for oversized sentences.
- Increased default chunk target from `250` to `360` characters while keeping runtime override support.
- Changed chunk stitching so only forced `split` boundaries crossfade.
- Added natural default pauses by boundary type:
  - `sentence`: `180ms`
  - `paragraph`: `420ms`
- Added edge-silence trimming before joining chunks.
- Reapplied `({voice description})` conditioning in reference mode.
- Exposed inference and pacing controls through environment variables.
- Added chunk-level logs with boundary, char length, estimated token count, and generated duration.

## Verification Plan

- `python3 -m py_compile src/services/voxcpm.py src/utils/sanitize.py` in `pods/voxcpm-pod`
- Review generated diffs for chunk metadata alignment and join behavior.

## Validation Executed

- `python3 -m py_compile src/services/voxcpm.py src/utils/sanitize.py` in `pods/voxcpm-pod` — passed.

## Expected Outcome

- Fewer perceptible prosody resets in long narrations.
- Clearer pauses between sections such as arrival, history, significance, and transition.
- Less of the "pause, then rush" effect after punctuation.

## Follow-Up

- Run one end-to-end Spanish tour generation and listen to at least two long stops.
- If pacing still feels compressed, first try `VOXCPM_INFERENCE_TIMESTEPS=20` before changing the pause defaults again.
