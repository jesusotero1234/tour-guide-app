# 30 - Multi-Route Audit Results

Status: completed

Date: 2026-05-31

## Goal

Measure how distinct the current route generation already is across theme and duration before building city concept discovery.

## Script

- `backend/scripts/audit/multi-route-overlap.ts`
- run with `npm run audit:multi-route-overlap` from `backend/`

The script writes a timestamped JSON report under `backend/scripts/audit/output/`.

## Audited Requests

- Madrid / es / history / 60
- Madrid / es / history / 120
- Madrid / es / history / 240
- Madrid / es / architecture / 120
- Madrid / es / food / 120
- Valencia / es / history / 120
- Valencia / es / history / 240
- Valencia / es / architecture / 120

## Results Summary

### Madrid

- `history 60` vs `history 120`: **100% overlap**
- `history 60` vs `history 240`: **60% overlap**
- `history 120` vs `history 240`: **60% overlap**
- `history` vs `architecture`: **0% overlap**
- `history` vs `food`: **0% overlap**
- `architecture` vs `food`: **0% overlap**

### Valencia

- `history 120` vs `history 240`: **100% overlap**
- `history` vs `architecture`: **43% overlap**

## Interpretation

### What looks good

- Theme differentiation in Madrid is already strong enough for early packaging work.
- The current route pipeline can produce clearly distinct cross-theme tours in at least one strong city.
- This is enough to justify future exploration of a flexible pass built from different themes.

### What does not look good yet

- Duration alone is not a reliable differentiator.
- In Valencia, `history 120` and `history 240` are effectively the same route.
- In Valencia, architecture still overlaps materially with history.
- This means the current system is not yet good enough for multiple concept-level tours inside the same broad theme.

## Product Implications

- A same-city pass made from different themes is plausible in stronger cities such as Madrid.
- A "historical city pass" made from several different history sub-routes is **not** validated by the current system.
- Concept discovery remains necessary before building city-specific historical passes.

## Engineering Implications

- Proceed to the city intelligence discovery layer.
- Do not treat duration as a route-variation mechanism.
- Future concept generation must use stronger angle-specific constraints than `theme + duration`.

## Decision

Proceed with **Phase B - City Intelligence Discovery Layer**.
