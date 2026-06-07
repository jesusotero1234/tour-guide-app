# 15 - Phase 5 Step 2 Error Boundaries Plan

## Scope

Plan only the next incremental backend orchestration change for error boundaries and partial-failure behavior.

## Current orchestration failure points

1. `generateInitialPlaces()` fails the whole request if LLM is unreachable or returns invalid shape.
2. `verifyPlaces()` uses `Promise.all()`, so one verification request rejection currently fails the whole batch.
3. `verifyPlaces()` also fails the whole request when zero places remain after verification.
4. `generateDescriptions()` wraps the whole loop in one `try/catch`, so one description request failure aborts all remaining places.
5. `tourRepository.save()` is a hard stop because no persisted tour means there is no canonical result to return.
6. `generateAudio()` already degrades per place, but storage or metadata save failures still need to stay local to that place and never invalidate a successfully saved tour.
7. `tours` controller currently collapses all generation failures to the same `500 TOUR_GENERATION_ERROR`, which hides whether the failure was upstream-orchestration-critical or only a degraded optional step.

## Recommended fail-fast boundaries

Fail fast when any of these happen:

1. LLM place generation fails or returns invalid payload.
   - Why it matters: there is no tour skeleton to continue with.
   - Risk reduced: avoids persisting empty or fabricated tour shells.
2. Verification produces zero valid places after all attempts complete.
   - Why it matters: route quality and trust collapse without at least one verified stop.
   - Risk reduced: avoids returning unusable tours that look successful.
3. Tour persistence (`tourRepository.save`) fails.
   - Why it matters: the API should not claim a created tour when no durable record exists.
   - Risk reduced: avoids ghost tours and broken follow-up retrieval.

## Recommended graceful-degradation boundaries

Gracefully degrade when any of these happen:

1. One or more verification requests fail, but at least one place still verifies.
   - Behavior: keep successful verifications, drop failed ones, continue.
   - Why it matters: external verification is fan-out work where partial success is still valuable.
   - Risk reduced: avoids full-request failure from one bad upstream call.
2. One description request fails for a place.
   - Behavior: keep current fallback description for that place and continue the loop.
   - Why it matters: descriptions enrich stops but should not block a structurally valid tour.
   - Risk reduced: avoids losing all later places due to one description outage.
3. Image lookup fails for one or all places.
   - Behavior: keep existing no-image fallback and continue.
   - Why it matters: images are optional presentation data.
   - Risk reduced: avoids coupling tour creation to third-party media availability.
4. TTS generation, local audio save, or audio metadata save fails for a place.
   - Behavior: keep empty `audioUrl` for that place and continue.
   - Why it matters: persisted text tour is still usable without audio.
   - Risk reduced: avoids invalidating a durable tour because one media artifact failed.

## Smallest implementation step

Implement only two orchestration changes first:

1. Change verification fan-out from all-or-nothing behavior to partial-success handling.
2. Move description error handling from method-wide to per-place fallback handling.

Do not change repository interfaces, persistence design, controller response schema, or job tracking in this step.

## Implementation notes for the next agent

- Prefer a small internal helper/type only if needed inside `orchestrationService.ts`.
- Keep the public `generateCompleteTour()` return shape unchanged.
- Treat audio behavior as already acceptable for this step unless a tiny doc comment/log clarification is required.
- If introducing new thrown errors, keep them narrow and readable so controller-side mapping can remain unchanged for now.

## Validation target

- Backend TypeScript build should still pass.
- Existing generate/list/get flow should remain API-compatible.
