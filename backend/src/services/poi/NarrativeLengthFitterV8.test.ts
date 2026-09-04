import {
  NARRATIVE_BEAT_ORDER_V8,
  NarrativeStructuredWriterResultV8,
  NarrativeWriterPlanV8,
  parseNarrativeWriterResponseV8,
} from './NarrativeWriterContractV8';
import { NarrativeNarrationTargetV8 } from './NarrativeDurationTargetsV8';
import {
  applyNarrativeLengthExpansionPatchV8,
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
      editableWindowWords: 186,
      minimumReplacementWords: 202,
      maximumReplacementWords: 287,
      desiredReplacementWords: 227,
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
      editableWindowWords: 230,
      minimumReplacementWords: 115,
      maximumReplacementWords: 200,
      desiredReplacementWords: 140,
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
    const selectedIds = fit!.editableSegmentIds;
    const firstSelectedId = selectedIds[0];
    const firstSelected = draft.segments.find((segment) => segment.segmentId === firstSelectedId)!;
    const firstReplacementWords = firstSelected.text.split(/\s+/u).length + 61;

    const replacements = selectedIds.map((segmentId, index) => {
      const segment = draft.segments.find((item) => item.segmentId === segmentId)!;
      return {
        segmentId,
        text: index === 0 ? words(firstReplacementWords, 'expanded-') : segment.text,
        supportCardIds: segment.supportCardIds,
      };
    });

    const patched = applyNarrativeLengthFitPatchV8(plan, draft, fit!, { replacements });

    expect(patched.wordCount).toBe(600);
    for (const segment of patched.segments) {
      const original = draft.segments.find((item) => item.segmentId === segment.segmentId)!;
      if (segment.segmentId !== firstSelectedId) {
        expect(segment.text).toBe(original.text);
        expect(segment.beat).toBe(original.beat);
        expect(segment.supportCardIds).toEqual(original.supportCardIds);
      }
      expect(segment.estimatedWords).toBe(segment.text.split(/\s+/u).length);
    }
    expect(patched.text).toBe(patched.segments.map((segment) => segment.text).join(' '));
  });

  it('rejects a patch missing any selected segment with an error mentioning every editable segment', () => {
    const plan = writerPlan();
    const draft = draftWithWords(plan, 559);
    const fit = planNarrativeLengthFitV8(plan, draft)!;
    const missingId = fit.editableSegmentIds[1];
    const presentId = fit.editableSegmentIds[0];
    const presentSegment = draft.segments.find((segment) => segment.segmentId === presentId)!;

    expect(() => applyNarrativeLengthFitPatchV8(plan, draft, fit, {
      replacements: [{
        segmentId: presentId,
        text: presentSegment.text,
        supportCardIds: presentSegment.supportCardIds,
      }],
    })).toThrow(new RegExp(`every editable segment.*${missingId}`));
  });

  it('rejects a replacement outside the selected edit window', () => {
    const plan = writerPlan();
    const draft = draftWithWords(plan, 539);
    const fit = planNarrativeLengthFitV8(plan, draft)!;
    const validId = fit.editableSegmentIds[0];
    const validSegment = draft.segments.find((segment) => segment.segmentId === validId)!;
    const forbidden = draft.segments.find(
      (segment) => !fit.editableSegmentIds.includes(segment.segmentId)
    )!;

    expect(() => applyNarrativeLengthFitPatchV8(plan, draft, fit, {
      replacements: [
        {
          segmentId: validId,
          text: validSegment.text,
          supportCardIds: validSegment.supportCardIds,
        },
        {
          segmentId: forbidden.segmentId,
          text: forbidden.text,
          supportCardIds: forbidden.supportCardIds,
        },
      ],
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

  it('expands a 539-word draft to 600 words through two reservoir addition responses', async () => {
    const plan = writerPlan();
    const draft = draftWithWords(plan, 539);
    const firstPatch = JSON.stringify({
      additions: [
        { segmentId: 'segment-2', text: words(10, 'add-a-'), supportCardIds: ['card-2'] },
        { segmentId: 'segment-3', text: words(5, 'add-b-'), supportCardIds: ['card-3'] },
        { segmentId: 'segment-3', text: words(5, 'add-c-'), supportCardIds: ['card-3'] },
      ],
    });
    const secondPatch = JSON.stringify({
      additions: [
        { segmentId: 'segment-2', text: words(20, 'add-d-'), supportCardIds: ['card-2'] },
        { segmentId: 'segment-3', text: words(10, 'add-e-'), supportCardIds: ['card-3'] },
        { segmentId: 'segment-3', text: words(11, 'add-f-'), supportCardIds: ['card-3'] },
      ],
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
    expect(post.mock.calls[0][1]).not.toHaveProperty('temperature');
    expect(JSON.stringify(post.mock.calls[0][1])).not.toContain('"uniqueItems"');
    expect(draft.wordCount).toBe(539);

    const firstRequest = post.mock.calls[0][1];
    const userMessage = firstRequest.messages.find((message: { role: string }) => message.role === 'user');
    const rawJson = userMessage.content.split('\n').slice(1).join('\n');
    const parsedInput = JSON.parse(rawJson);
    expect(parsedInput.expansionReservoir).toEqual({
      requiredUnits: 3,
      desiredTotalWords: 100,
      approximateWordsPerUnit: 34,
      maximumUsefulUnitWords: 85,
    });
    expect(firstRequest.response_format.json_schema.schema.properties.additions.minItems).toBe(3);
    expect(firstRequest.response_format.json_schema.schema.properties.additions.maxItems).toBe(3);
    expect(firstRequest.max_tokens).toBe(2_400);
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

  it('accepts a tiny improved residual of 538 words after two bounded reservoir addition attempts for target 566', async () => {
    const plan = writerPlan(566);
    const draft = draftWithWords(plan, 469);
    const firstPatch = JSON.stringify({
      additions: [
        { segmentId: 'segment-2', text: words(15, 'add-a-'), supportCardIds: ['card-2'] },
        { segmentId: 'segment-3', text: words(15, 'add-b-'), supportCardIds: ['card-3'] },
        { segmentId: 'segment-3', text: words(10, 'add-c-'), supportCardIds: ['card-3'] },
        { segmentId: 'segment-3', text: words(11, 'add-d-'), supportCardIds: ['card-3'] },
      ],
    });
    const secondPatch = JSON.stringify({
      additions: [
        { segmentId: 'segment-2', text: words(8, 'add-e-'), supportCardIds: ['card-2'] },
        { segmentId: 'segment-3', text: words(5, 'add-f-'), supportCardIds: ['card-3'] },
        { segmentId: 'segment-3', text: words(5, 'add-g-'), supportCardIds: ['card-3'] },
      ],
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

    expect(result.value.wordCount).toBe(538);
    expect(result.diagnostics).toHaveLength(2);
    expect(post).toHaveBeenCalledTimes(2);

    const firstRequest = post.mock.calls[0][1];
    const firstUserMessage = firstRequest.messages.find((message: { role: string }) => message.role === 'user');
    const firstRawJson = firstUserMessage.content.split('\n').slice(1).join('\n');
    const firstParsedInput = JSON.parse(firstRawJson);
    expect(firstParsedInput.expansionReservoir).toEqual({
      requiredUnits: 4,
      desiredTotalWords: 133,
      approximateWordsPerUnit: 34,
      maximumUsefulUnitWords: 81,
    });
    expect(firstRequest.response_format.json_schema.schema.properties.additions.minItems).toBe(4);
    expect(firstRequest.response_format.json_schema.schema.properties.additions.maxItems).toBe(4);

    const secondRequest = post.mock.calls[1][1];
    const secondUserMessage = secondRequest.messages.find((message: { role: string }) => message.role === 'user');
    const secondRawJson = secondUserMessage.content.split('\n').slice(1).join('\n');
    const secondParsedInput = JSON.parse(secondRawJson);
    expect(secondParsedInput.expansionReservoir).toEqual({
      requiredUnits: 3,
      desiredTotalWords: 82,
      approximateWordsPerUnit: 28,
      maximumUsefulUnitWords: 81,
    });
    expect(secondRequest.response_format.json_schema.schema.properties.additions.minItems).toBe(3);
    expect(secondRequest.response_format.json_schema.schema.properties.additions.maxItems).toBe(3);

    expect(draft.wordCount).toBe(469);
  });

  it('rejects with exhaustion when two valid reservoir responses overshoot farther from target 600', async () => {
    const plan = writerPlan(600);
    const draft = draftWithWords(plan, 559);
    const firstPatch = JSON.stringify({
      additions: [
        { segmentId: 'segment-2', text: words(200, 'add-a-'), supportCardIds: ['card-2'] },
        { segmentId: 'segment-3', text: words(200, 'add-b-'), supportCardIds: ['card-3'] },
        { segmentId: 'segment-3', text: words(200, 'add-c-'), supportCardIds: ['card-3'] },
      ],
    });
    const secondPatch = JSON.stringify({
      additions: [
        { segmentId: 'segment-2', text: words(200, 'add-d-'), supportCardIds: ['card-2'] },
        { segmentId: 'segment-3', text: words(200, 'add-e-'), supportCardIds: ['card-3'] },
        { segmentId: 'segment-3', text: words(200, 'add-f-'), supportCardIds: ['card-3'] },
      ],
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

  it('selects the two 20-word expansion units deterministically and appends exact text to the selected segments', () => {
    const plan = writerPlan();
    const draft = draftWithWords(plan, 539);
    const segment2 = draft.segments.find((segment) => segment.segmentId === 'segment-2')!;
    const segment3 = draft.segments.find((segment) => segment.segmentId === 'segment-3')!;
    const segment4 = draft.segments.find((segment) => segment.segmentId === 'segment-4')!;
    const segment5 = draft.segments.find((segment) => segment.segmentId === 'segment-5')!;
    const segment6 = draft.segments.find((segment) => segment.segmentId === 'segment-6')!;

    const additions = [
      {
        segmentId: 'segment-2',
        text: words(20, 'add-a-'),
        supportCardIds: ['card-2'],
      },
      {
        segmentId: 'segment-3',
        text: words(20, 'add-b-'),
        supportCardIds: ['card-3'],
      },
      {
        segmentId: 'segment-2',
        text: words(100, 'add-c-'),
        supportCardIds: ['card-2'],
      },
    ];

    const patched = applyNarrativeLengthExpansionPatchV8(plan, draft, {
      additions,
    });

    expect(patched.wordCount).toBe(579);

    const patchedSegment2 = patched.segments.find((segment) => segment.segmentId === 'segment-2')!;
    const patchedSegment3 = patched.segments.find((segment) => segment.segmentId === 'segment-3')!;

    expect(patchedSegment2.text).toBe(`${segment2.text} ${words(20, 'add-a-')}`);
    expect(patchedSegment3.text).toBe(`${segment3.text} ${words(20, 'add-b-')}`);

    expect(patchedSegment2.supportCardIds).toEqual(['card-2']);
    expect(patchedSegment3.supportCardIds).toEqual(['card-3']);

    const patchedSegment4 = patched.segments.find((segment) => segment.segmentId === 'segment-4')!;
    const patchedSegment5 = patched.segments.find((segment) => segment.segmentId === 'segment-5')!;
    const patchedSegment6 = patched.segments.find((segment) => segment.segmentId === 'segment-6')!;

    expect(patchedSegment4.text).toBe(segment4.text);
    expect(patchedSegment5.text).toBe(segment5.text);
    expect(patchedSegment6.text).toBe(segment6.text);

    expect(patchedSegment4.beat).toBe(segment4.beat);
    expect(patchedSegment5.beat).toBe(segment5.beat);
    expect(patchedSegment6.beat).toBe(segment6.beat);

    expect(patchedSegment4.supportCardIds).toEqual(segment4.supportCardIds);
    expect(patchedSegment5.supportCardIds).toEqual(segment5.supportCardIds);
    expect(patchedSegment6.supportCardIds).toEqual(segment6.supportCardIds);
  });

  it('rejects an expansion unit assigned to a non-editable segment with an outside-window error', () => {
    const plan = writerPlan();
    const draft = draftWithWords(plan, 539);

    expect(() => applyNarrativeLengthExpansionPatchV8(plan, draft, {
      additions: [
        {
          segmentId: 'segment-1',
          text: words(20, 'add-'),
          supportCardIds: ['card-1'],
        },
      ],
    })).toThrow('outside-window');
  });

  it('rejects an expansion unit with a supportCardId not authorized for its segment', () => {
    const plan = writerPlan();
    const draft = draftWithWords(plan, 539);

    expect(() => applyNarrativeLengthExpansionPatchV8(plan, draft, {
      additions: [
        {
          segmentId: 'segment-2',
          text: words(20, 'add-'),
          supportCardIds: ['card-5'],
        },
      ],
    })).toThrow('not authorized');
  });

  it('compresses a 690-word draft to 600 words through full segment replacements', async () => {
    const plan = writerPlan();
    const draft = draftWithWords(plan, 690);
    const firstPatch = JSON.stringify({
      replacements: [
        { segmentId: 'segment-2', text: words(70, 'compressed-'), supportCardIds: ['card-2'] },
        { segmentId: 'segment-3', text: words(70, 'compressed-'), supportCardIds: ['card-3'] },
      ],
    });
    const post = jest.fn()
      .mockResolvedValueOnce(openRouterResponse(firstPatch));

    const result = await fitNarrativeWriterLengthV8({
      plan,
      draft,
      profile: 'qwen38_hybrid',
      openRouterApiKey: 'test-key',
      post,
    });

    expect(result.value.wordCount).toBe(600);
    expect(result.diagnostics).toHaveLength(1);
    expect(post).toHaveBeenCalledTimes(1);

    const firstRequest = post.mock.calls[0][1];
    expect(firstRequest.response_format.json_schema.schema.properties.replacements).toBeDefined();
    expect(firstRequest.response_format.json_schema.schema.properties.additions).toBeUndefined();
  });

  it('plans a compression with actual segment word counts and selects the two longest intermediate segments', () => {
    const plan = writerPlan();
    const counts = [140, 126, 163, 70, 117, 68];
    const draft = draftWithCounts(plan, counts, counts);

    const fit = planNarrativeLengthFitV8(plan, draft);

    expect(fit).toMatchObject({
      direction: 'compress',
      wordCount: 684,
      minimumWords: 575,
      maximumWords: 660,
      minimumChangeWords: 24,
      maximumChangeWords: 109,
      desiredChangeWords: 84,
      editableWindowWords: 289,
      minimumReplacementWords: 180,
      maximumReplacementWords: 265,
      desiredReplacementWords: 205,
    });
    expect(fit?.editableSegmentIds).toEqual(['segment-3', 'segment-2']);
  });

  it('adaptively selects three intermediate segments for a short-target compression', () => {
    const plan = writerPlan(150);
    const counts = [40, 45, 45, 45, 45, 40];
    const draft = draftWithCounts(plan, counts, counts);

    const fit = planNarrativeLengthFitV8(plan, draft);

    expect(fit).toMatchObject({
      direction: 'compress',
      wordCount: 260,
      minimumWords: 125,
      maximumWords: 165,
      minimumChangeWords: 95,
      maximumChangeWords: 135,
      desiredChangeWords: 110,
      editableWindowWords: 135,
      minimumReplacementWords: 3,
      maximumReplacementWords: 40,
      desiredReplacementWords: 25,
    });
    expect(fit?.editableSegmentIds).toEqual(['segment-2', 'segment-3', 'segment-4']);
  });

  it('returns null for an infeasible compression where intermediate segments cannot remove the minimum required words', () => {
    const plan = writerPlan(150);
    const counts = [110, 10, 10, 10, 10, 110];
    const draft = draftWithCounts(plan, counts, counts);

    expect(planNarrativeLengthFitV8(plan, draft)).toBeNull();
  });

  it('selects the closer candidate when band distance ties and the candidate is nearer to target', () => {
    const plan = writerPlan();
    const current = draftWithWords(plan, 684);
    const candidate = draftWithWords(plan, 551);

    expect(chooseCloserNarrativeDraftV8(current, candidate, plan.narrationTarget)).toBe(candidate);
  });
});
