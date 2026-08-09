# Autonomous narrative v2 checklist

- [x] Claim plans receive canonical IDs and preserve exact scene/block order.
- [x] All evidence is used within its scene and dynamic reuse limits hold after fact permutation.
- [x] Grounding and final reports contain findings only; local gates own approval.
- [x] DeepSeek prose cannot supply IDs, evidence, transitions, or counts.
- [x] Blocks use 42-45 space tokens; transitions use 22-25; Unicode scene totals remain 220-260.
- [x] One plan repair and one prose repair are independent; second content failures reject.
- [x] Transport, malformed JSON, and invalid report references get one protocol retry without consuming content repair.
- [x] Route/evidence/provenance/plan/text/prompts/models/digest/parameters/policies/reports fingerprint independently.
- [x] Paris, Madrid, Berlin, and a synthetic unknown city use the same engine.
- [x] Benchmark requires 8/9 overall, 2/3 per city, 12 factual mutation rejections, GPU-only Gemma, and <180s critiques.
- [x] Failed benchmark cannot create or overwrite freeze outputs.
- [x] Existing v1 modules remain unchanged; replay remains unavailable because its approved artifact was never frozen.
- [ ] Focused/full tests, v1/v7 replays, TypeScript, diff, and secret scan pass.
- [ ] First additive commit exists; second content commit exists only after a live passing benchmark.
