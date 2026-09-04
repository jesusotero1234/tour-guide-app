import {
  NARRATIVE_BEAT_ORDER_V8,
  NarrativeStructuredWriterResultV8,
  NarrativeWriterPlanV8,
  parseNarrativeWriterResponseV8,
} from './NarrativeWriterContractV8';
import { NarrativeNarrationTargetV8 } from './NarrativeDurationTargetsV8';
import {
  applyNarrativeLengthFitPatchV8,
  chooseCloserNarrativeDraftV8,
  planNarrativeLengthFitV8,
} from './NarrativeLengthFitterV8';
import { fitNarrativeWriterLengthV8 } from './NarrativeLengthFitterAgentV8';

function words(count: number, prefix = 'palabra'): string {
  return Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`).join(' ');
}

function openRouterResponse(content: string) {
  return { data: {
    model: 'openai/gpt-5.4-mini',
    choices: [{ finish_reason: 'stop', message: { content } }],
    usage: {
      prompt_tokens: 20,
      completion_tokens: 8,
      total_tokens: 28,
      cost: 0.0012,
      prompt_tokens_details: { cached_tokens: 0 },
      completion_tokens_details: { reasoning_tokens: 3 },
    },
    openrouter_metadata: {
      requested: 'openai/gpt-5.4-mini',
      strategy: 'direct',
      attempt: 1,
      endpoints: { total: 1, available: [{
        provider: 'OpenAI', model: 'openai/gpt-5.4-mini', selected: true,
      }] },
      attempts: [{ provider: 'OpenAI', model: 'openai/gpt-5.4-mini', status: 200 }],
      pipeline: [],
    },
  } };
}

function target(targetWords = 600): NarrativeNarrationTargetV8 {
  return {
    stopId: 'stop-generic',
    targetSeconds: 300,
    targetWords,
    minPropositions: 6,
    maxPropositions: 12,
    minVisualAnchors: 2,
  };
}

function writerPlan(targetWords = 600): NarrativeWriterPlanV8 {
  const narrationTarget = target(targetWords);
  const evidenceCards = NARRATIVE_BEAT_ORDER_V8.map((beat, index) => ({
    cardId: `card-${index + 1}`,
    propositionId: `proposition-${index + 1}`,
    claim: `Hecho autorizado para ${beat}`,
    role: index === 0
      ? 'visible_observation' as const
      : index === 1
        ? 'chronology_or_transformation' as const
        : index === 2
          ? 'human_agency_or_lived_function' as const
          : index === 3
            ? 'tension_or_contrast' as const
            : 'distinctive_trait' as const,
    sourceIds: [`source-${index + 1}`],
    passageIds: [`passage-${index + 1}`],
    publisherKeys: ['publisher'],
    facets: [index === 0 ? 'visual' as const : 'distinctive' as const],
    visual: index === 0,
    spatial: false,
    priority: 'high' as const,
  }));
  return {
    version: 'segments_v8',
    routeStopId: narrationTarget.stopId,
    openingMode: 'gaze',
    narrationTarget,
    evidenceCards,
    beats: NARRATIVE_BEAT_ORDER_V8.map((beat, index) => ({
      beat,
      evidenceCardIds: [evidenceCards[index].cardId],
    })),
    highPriorityCardIds: evidenceCards.map((card) => card.cardId),
    minimumHighPriorityCoverage: 0.7,
  };
}

function draftWithWords(plan: NarrativeWriterPlanV8, totalWords: number): NarrativeStructuredWriterResultV8 {
  const base = Math.floor(totalWords / plan.beats.length);
  const remainder = totalWords % plan.beats.length;
  return parseNarrativeWriterResponseV8(plan, {
    stop_id: plan.routeStopId,
    segments: plan.beats.map((item, index) => {
      const count = base + (index < remainder ? 1 : 0);
      return {
        segmentId: `segment-${index + 1}`,
        beat: item.beat,
        text: words(count, `s${index + 1}-`),
        supportCardIds: [item.evidenceCardIds[0]],
        estimatedWords: count,
      };
    }),
  });
}

function draftWithCounts(
  plan: NarrativeWriterPlanV8,
  counts: number[],
  estimatedWords: number[]
): NarrativeStructuredWriterResultV8 {
  return parseNarrativeWriterResponseV8(plan, {
    stop_id: plan.routeStopId,
    segments: plan.beats.map((item, index) => ({
      segmentId: `segment-${index + 1}`,
      beat: item.beat,
      text: words(counts[index], `s${index + 1}-`),
      supportCardIds: [item.evidenceCardIds[0]],
      estimatedWords: estimatedWords[index],
    })),
  });
}

describe('NarrativeLengthFitterV8', () => {
  it('plans a localized expansion for a 559-word structured draft', () => {
    const plan = writerPlan();
    const draft = draftWithWords(plan, 559);

    const fit = planNarrativeLengthFitV8(plan, draft);

    expect(fit).toMatchObject({
      direction: 'expand',
      wordCount: 559,
      minimumWords: 575,
      maximumWords: 660,
      minimumChangeWords: 16,
      maximumChangeWords: 101,
      desiredChangeWords: 41,
    });
    expect(fit?.editableSegmentIds.length).toBeGreaterThan(0);
    expect(draft.wordCount).toBe(559);
  });

  it('plans a localized compression for a 690-word structured draft', () => {
    const plan = writerPlan();
    const draft = draftWithWords(plan, 690);

    expect(planNarrativeLengthFitV8(plan, draft)).toMatchObject({
      direction: 'compress',
      wordCount: 690,
      minimumWords: 575,
      maximumWords: 660,
      minimumChangeWords: 30,
      maximumChangeWords: 115,
      desiredChangeWords: 90,
    });
  });

  it('selects the truly longest intermediate segment when estimatedWords are misleading', () => {
    const plan = writerPlan();
    const counts = [100, 100, 150, 100, 100, 140];
    const misleading = [100, 100, 100, 100, 100, 150];
    const draft = draftWithCounts(plan, counts, misleading);

    const fit = planNarrativeLengthFitV8(plan, draft);

    expect(fit).toMatchObject({
      direction: 'compress',
      wordCount: 690,
    });
    expect(fit?.editableSegmentIds[0]).toBe('segment-3');
    expect(fit?.editableSegmentIds).not.toContain('segment-6');
  });

  it('does not plan an edit when the draft is already in range', () => {
    const plan = writerPlan();
    expect(planNarrativeLengthFitV8(plan, draftWithWords(plan, 600))).toBeNull();
  });

  it('applies only selected replacements and recomputes word estimates from actual text', () => {
    const plan = writerPlan();
    const counts = [89, 89, 89, 89, 89, 94];
    const wrongEstimates = [100, 100, 100, 100, 100, 100];
    const draft = draftWithCounts(plan, counts, wrongEstimates);
    const fit = planNarrativeLengthFitV8(plan, draft);
    expect(fit).not.toBeNull();
    const selectedId = fit!.editableSegmentIds[0];
    const selected = draft.segments.find((segment) => segment.segmentId === selectedId)!;
    const replacementWords = selected.text.split(/\s+/u).length + 61;

    const patched = applyNarrativeLengthFitPatchV8(plan, draft, fit!, {
      replacements: [{
        segmentId: selectedId,
        text: words(replacementWords, 'expanded-'),
        supportCardIds: selected.supportCardIds,
      }],
    });

    expect(patched.wordCount).toBe(600);
    for (const segment of patched.segments) {
      const original = draft.segments.find((item) => item.segmentId === segment.segmentId)!;
      if (segment.segmentId !== selectedId) {
        expect(segment.text).toBe(original.text);
        expect(segment.beat).toBe(original.beat);
        expect(segment.supportCardIds).toEqual(original.supportCardIds);
      }
      expect(segment.estimatedWords).toBe(segment.text.split(/\s+/u).length);
    }
    expect(patched.text).toBe(patched.segments.map((segment) => segment.text).join(' '));
  });

  it('rejects a replacement outside the selected edit window', () => {
    const plan = writerPlan();
    const draft = draftWithWords(plan, 539);
    const fit = planNarrativeLengthFitV8(plan, draft)!;
    const forbidden = draft.segments.find(
      (segment) => !fit.editableSegmentIds.includes(segment.segmentId)
    )!;

    expect(() => applyNarrativeLengthFitPatchV8(plan, draft, fit, {
      replacements: [{
        segmentId: forbidden.segmentId,
        text: forbidden.text,
        supportCardIds: forbidden.supportCardIds,
      }],
    })).toThrow('outside the selected length-fit window');
  });

  it('keeps the closest valid structured draft instead of accepting regressions', () => {
    const plan = writerPlan();
    const current = draftWithWords(plan, 539);
    const farther = draftWithWords(plan, 800);
    const closer = draftWithWords(plan, 559);

    expect(chooseCloserNarrativeDraftV8(current, farther, plan.narrationTarget)).toBe(current);
    expect(chooseCloserNarrativeDraftV8(current, closer, plan.narrationTarget)).toBe(closer);
  });

  it('expands a 539-word draft to 600 words through two localized segment-2 patches', async () => {
    const plan = writerPlan();
    const draft = draftWithWords(plan, 539);
    const firstPatch = JSON.stringify({
      replacements: [{
        segmentId: 'segment-2',
        text: words(110, 'expanded-'),
        supportCardIds: ['card-2'],
      }],
    });
    const secondPatch = JSON.stringify({
      replacements: [{
        segmentId: 'segment-2',
        text: words(151, 'expanded-'),
        supportCardIds: ['card-2'],
      }],
    });
    const post = jest.fn()
      .mockResolvedValueOnce(openRouterResponse(firstPatch))
      .mockResolvedValueOnce(openRouterResponse(secondPatch));

    const result = await fitNarrativeWriterLengthV8({
      plan,
      draft,
      profile: 'qwen38_hybrid',
      openRouterApiKey: 'test-key',
      post,
    });

    expect(result.value.wordCount).toBe(600);
    expect(result.diagnostics).toHaveLength(2);
    expect(post).toHaveBeenCalledTimes(2);
    expect(draft.wordCount).toBe(539);
  });

  it('returns the same draft without calling post when it is already in range', async () => {
    const plan = writerPlan();
    const draft = draftWithWords(plan, 600);
    const post = jest.fn(async () => openRouterResponse('{}'));

    const result = await fitNarrativeWriterLengthV8({
      plan,
      draft,
      profile: 'qwen38_hybrid',
      openRouterApiKey: 'test-key',
      post,
    });

    expect(result.value).toBe(draft);
    expect(result.diagnostics).toEqual([]);
    expect(post).not.toHaveBeenCalled();
  });

  it('plans a localized expansion for a 260-word draft targeting 300 words', () => {
    const plan = writerPlan(300);
    const draft = draftWithWords(plan, 260);

    const fit = planNarrativeLengthFitV8(plan, draft);

    expect(fit).toMatchObject({
      direction: 'expand',
      wordCount: 260,
      minimumWords: 275,
      maximumWords: 330,
      minimumChangeWords: 15,
      desiredChangeWords: 40,
    });
  });

  it('rejects with exhaustion when two valid responses worsen the draft to 539 words', async () => {
    const plan = writerPlan(600);
    const draft = draftWithWords(plan, 559);
    const firstPatch = JSON.stringify({
      replacements: [{
        segmentId: 'segment-2',
        text: words(73, 'expanded-'),
        supportCardIds: ['card-2'],
      }],
    });
    const secondPatch = JSON.stringify({
      replacements: [{
        segmentId: 'segment-2',
        text: words(73, 'expanded-'),
        supportCardIds: ['card-2'],
      }],
    });
    const post = jest.fn()
      .mockResolvedValueOnce(openRouterResponse(firstPatch))
      .mockResolvedValueOnce(openRouterResponse(secondPatch));

    await expect(fitNarrativeWriterLengthV8({
      plan,
      draft,
      profile: 'qwen38_hybrid',
      openRouterApiKey: 'test-key',
      post,
    })).rejects.toThrow('length_fit_exhausted stop=stop-generic actual=559 accepted=575-660');

    expect(post).toHaveBeenCalledTimes(2);
  });
});
