# 38 - Fase 3: Multi-idioma EN/FR/DE/IT

Date: 2026-06-09
Status: Execution plan

## Context

Fase 2.x shipped the Fact Contract, section validator, output bans, and fallback path for factual narration. The next risk is cross-language quality: English, French, German, and Italian prompts can still produce generic travel-copy AI-isms or mention unverified nearby streets, squares, parks, and monuments that the current Spanish-only location extractor misses.

## Goal

Extend the existing guardrails without changing the narration architecture:

- Add language-specific AI-ism bans for EN, FR, DE, and IT.
- Keep prompt-side bans and post-generation bans aligned.
- Expand location extraction to ES/EN/FR/DE/IT to catch unverified toponyms.
- Verify compile and smoke test Palacio Real in 5 languages using `qwen2.5:14b` on `localhost:3002`.

## Scope

Files:

- `pods/llm-pod/src/routes/narrativeLong.ts`
- `pods/llm-pod/src/prompts/narrative/types.ts`

Out of scope:

- No endpoint changes.
- No model change beyond using the configured `qwen2.5:14b` LLM pod for smoke testing.
- No refactor of the Fact Contract or fallback templates.

## Implementation Steps

1. Add 5-8 AI-isms per target language to `BANNED_OUTPUT_PHRASES` in normalized form.
2. Add the same language families to `BANNED_PHRASES` for prompt conditioning.
3. Replace the single Spanish `extractLocations()` regex with explicit ES, EN, FR, DE, and IT location-pattern regexes.
4. Compile `pods/llm-pod` with `npm run build`.
5. Smoke test one Palacio Real POI in `es`, `en`, `fr`, `de`, and `it` against `POST /narrative/stop/long`.

## Smoke Test Fixture

POI: Palacio Real

Facts:

- `P571=1738`
- `P84=Filippo Juvarra`
- `P149=baroque`
- `P1435=UNESCO`

Expected checks:

- `sectionsFallbacked = 0` per language.
- No banned phrase failures.
- No unsupported location drift such as unverified adjacent plazas or streets.
- Claim check has `criticalFailCount = 0`.

## Rollback Trigger

If compile fails, revert the code change. If smoke fails only in one language due to an over-broad ban or regex false positive, narrow that phrase/pattern instead of relaxing the Fact Contract.
