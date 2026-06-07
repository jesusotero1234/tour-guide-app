# VoxCPM Stabilization Execution

Status: **completed for the crash-containment and timeout phase**.

## Goal

Keep VoxCPM as the primary audio path for full tours, remove the CUDA crash trigger caused by overlapping generations, and reserve Kokoro for true fallback scenarios instead of normal slowness.

## Problem Summary

- VoxCPM requests were allowed to overlap inside one shared Python process.
- The backend timed out VoxCPM after `180000ms`, then moved on to the next stop while the previous GPU generation could still be alive.
- The shared model uses mutable KV caches with an internal limit of `8192`.
- Under overlap, VoxCPM hit `index out of bounds: 0 <= tmp5 < 8192`, poisoned the CUDA context, and returned `503`.
- Kokoro was not always running, so tours ended with empty audio URLs.

## Scope Executed

### VoxCPM Pod

- [x] Added a process-local generation lock so only one VoxCPM generation runs at a time.
- [x] Logged queue wait time when a request had to wait for the model.
- [x] Added fatal CUDA state tracking inside the service.
- [x] Exposed fatal health status through `GET /healthz` with HTTP `503`.
- [x] Stopped using the internal `reference -> voice-design` fallback when the underlying error looks CUDA-fatal.
- [x] Added `VOXCPM_OPTIMIZE` env support and wired it into `VoxCPM.from_pretrained(...)`.
- [x] Passed `DEVICE` explicitly into the VoxCPM loader.

### Backend

- [x] Split TTS timeout by provider.
- [x] Raised VoxCPM default timeout to `900000ms` via `VOXCPM_TTS_TIMEOUT_MS`.
- [x] Kept Kokoro on a shorter timeout via `KOKORO_TTS_TIMEOUT_MS`.
- [x] Improved Axios error parsing so VoxCPM fatal `503` responses are visible in backend logs.

## Files Changed

- `pods/voxcpm-pod/src/config/env.py`
- `pods/voxcpm-pod/src/services/voxcpm.py`
- `pods/voxcpm-pod/src/server.py`
- `backend/src/services/orchestrationService.ts`

## Operational Outcome

After this change set:

- A second stop no longer starts a second VoxCPM generation in parallel while the first one is still using GPU state.
- Slow VoxCPM generations are allowed to complete instead of being abandoned at `180s` by default.
- If CUDA is poisoned, the pod advertises itself as unhealthy and exits, instead of pretending to be healthy.
- Kokoro remains available as backend fallback, but VoxCPM now has a realistic chance to finish all stops first.

## Remaining Follow-Up Work

- [ ] Add per-chunk duration logging and chunk metadata in VoxCPM.
- [ ] Tighten `chunk_text()` so long unpunctuated sentences split more aggressively.
- [ ] Investigate prompt-cache reuse to avoid re-encoding the reference path repeatedly per chunk.
- [ ] Add a deeper warmup path so `dev-up` can leave VoxCPM fully loaded before the first tour request.
- [ ] Run a full cold-generation end-to-end tour test with Kokoro available as fallback.

## Closure Notes

This execution document is closed for the stabilization phase.

The remaining items are optimization work, not blockers for the immediate CUDA crash caused by overlapping VoxCPM generations.
