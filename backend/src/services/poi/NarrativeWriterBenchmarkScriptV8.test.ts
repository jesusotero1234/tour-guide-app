import {
  buildNarrativeWriterBenchmarkLengthContractV8,
  buildNarrativeWriterBenchmarkLengthPromptV8,
  buildNarrativeWriterBenchmarkPlanV8,
  buildNarrativeWriterBenchmarkSystemPromptV8,
  buildPublicNarrativeWriterBenchmarkSummaryV8,
  applyNarrativeWriterBenchmarkLengthSchemaV8,
  parseNarrativeWriterBenchmarkArgsV8,
  validateNarrativeWriterBenchmarkBeatLengthsV8,
} from '../../../scripts/validation/narrative-writer-benchmark-v8';
import {
  narrativeWriterResponseSchemaV8,
  type NarrativeStructuredWriterResultV8,
  type NarrativeWriterPlanV8,
} from './NarrativeWriterContractV8';

describe('narrative-writer-benchmark-v8 script contract', () => {
  it('defaults to a dry run over Plaza Mayor and Cibeles with no prior spend', () => {
    expect(parseNarrativeWriterBenchmarkArgsV8([])).toMatchObject({
      execute: false,
      priorSpendUsd: 0,
      stopIds: ['Q1123493', 'Q1537446'],
      seed: 'madrid-writer-benchmark-v8',
      lengthAwareContract: false,
    });
  });

  it('rejects invalid spend and stop arguments before any paid call', () => {
    expect(() => parseNarrativeWriterBenchmarkArgsV8(['--prior-spend-usd=-1']))
      .toThrow('prior spend');
    expect(() => parseNarrativeWriterBenchmarkArgsV8(['--stop-ids=']))
      .toThrow('stop ids');
    expect(() => parseNarrativeWriterBenchmarkArgsV8(['--run-id=../escape']))
      .toThrow('run id');
    expect(() => parseNarrativeWriterBenchmarkArgsV8(['--stop-ids=Q1123493,../../escape']))
      .toThrow('stop id');
  });

  it('plans exactly four blind arms per selected stop within the two-dollar cap', () => {
    const plan = buildNarrativeWriterBenchmarkPlanV8(
      ['Q1123493', 'Q1537446'],
      'madrid-writer-benchmark-v8',
      0
    );

    expect(plan.plannedCalls).toBe(8);
    expect(plan.maximumReservedSpendUsd).toBeCloseTo(1.6);
    expect(plan.assignments.map((assignment) => assignment.armId).sort()).toEqual(['A', 'B', 'C', 'D']);
    expect(() => buildNarrativeWriterBenchmarkPlanV8(
      ['Q1123493', 'Q1537446'],
      'madrid-writer-benchmark-v8',
      0.41
    )).toThrow('benchmark budget exceeded');
  });

  it('parses --explicit-json-instruction, --length-aware-contract and --arm-ids=D and plans a single D arm over two stops', () => {
    const args = parseNarrativeWriterBenchmarkArgsV8([
      '--explicit-json-instruction',
      '--length-aware-contract',
      '--arm-ids=D',
    ]);
    expect(args).toMatchObject({
      explicitJsonInstruction: true,
      lengthAwareContract: true,
      armIds: ['D'],
    });

    const plan = buildNarrativeWriterBenchmarkPlanV8(
      ['Q1123493', 'Q1537446'],
      'madrid-writer-benchmark-v8',
      0,
      ['D']
    );
    expect(plan.assignments).toHaveLength(1);
    expect(plan.assignments[0].armId).toBe('D');
    expect(plan.plannedCalls).toBe(2);
    expect(plan.maximumReservedSpendUsd).toBeCloseTo(0.4);
  });

  it('keeps model identity and narrative text out of the public summary', () => {
    const summary = buildPublicNarrativeWriterBenchmarkSummaryV8({
      runId: 'run-1',
      sourceCheckpoint: '/private/checkpoint.json',
      priorSpendUsd: 0,
      spentUsd: 0.05,
      accountedSpendUsd: 0.25,
      results: [{
        armId: 'A',
        stopId: 'Q1123493',
        model: 'secret/model',
        actualModel: 'secret/model-version',
        actualProvider: 'secret-provider',
        text: 'Texto narrativo ciego.',
        textFile: 'texts/A-Q1123493.md',
        status: 'valid',
        schemaPassed: true,
        lengthPassed: true,
        oneShotPassed: true,
        wordCount: 600,
        coverage: 1,
        retryCount: 0,
        costUsd: 0.05,
        budgetChargeUsd: 0.05,
        providerCostVerified: true,
        latencyMs: 1000,
      }],
    });

    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain('secret/model');
    expect(serialized).not.toContain('secret-provider');
    expect(serialized).not.toContain('Texto narrativo ciego');
    expect(summary.spentUsd).toBe(0.05);
    expect(summary.accountedSpendUsd).toBe(0.25);
    expect(summary.results[0]).toMatchObject({
      armId: 'A',
      stopId: 'Q1123493',
      textFile: 'texts/A-Q1123493.md',
      oneShotPassed: true,
      budgetChargeUsd: 0.05,
    });
  });

  it('adds an explicit-JSON sentence only when the opt-in flag is set', () => {
    const explicitPrompt = buildNarrativeWriterBenchmarkSystemPromptV8(true);
    const normalPrompt = buildNarrativeWriterBenchmarkSystemPromptV8(false);

    expect(explicitPrompt).toContain('Devuelve exclusivamente un único objeto JSON válido.');
    expect(normalPrompt).not.toContain('Devuelve exclusivamente un único objeto JSON válido.');
  });

  describe('per-beat word budget and schema overlay', () => {
    const fixture: NarrativeWriterPlanV8 = {
      version: 'segments_v8',
      routeStopId: 'Q1123493',
      openingMode: 'gaze',
      narrationTarget: {
        stopId: 'Q1123493',
        targetSeconds: 300,
        targetWords: 600,
        minPropositions: 8,
        maxPropositions: 12,
        minVisualAnchors: 3,
      },
      evidenceCards: [],
      beats: [
        { beat: 'arrival_and_orientation', evidenceCardIds: ['card-1'] },
        { beat: 'visible_anchor', evidenceCardIds: ['card-2'] },
        { beat: 'time_shift', evidenceCardIds: ['card-3'] },
        { beat: 'human_scene_or_use', evidenceCardIds: ['card-4'] },
        { beat: 'contrast_or_consequence', evidenceCardIds: ['card-5'] },
        { beat: 'takeaway_and_transition', evidenceCardIds: ['card-6'] },
      ],
      highPriorityCardIds: [],
      minimumHighPriorityCoverage: 0.7,
    };

    it('builds a length contract with midpoint target 618 and per-beat bounds', () => {
      const contract = buildNarrativeWriterBenchmarkLengthContractV8(fixture, 575, 660);

      expect(contract.targetWords).toBe(618);
      expect(contract.beats.map((beat) => beat.targetWords)).toEqual([103, 103, 118, 93, 113, 88]);
      expect(contract.beats.reduce((sum, beat) => sum + beat.targetWords, 0)).toBe(618);

      for (const beat of contract.beats) {
        expect(beat.minimumWords).toBeLessThanOrEqual(beat.targetWords);
        expect(beat.targetWords).toBeLessThanOrEqual(beat.maximumWords);
      }
    });

    it('applies the contract to the response schema with per-beat estimatedWords bounds', () => {
      const contract = buildNarrativeWriterBenchmarkLengthContractV8(fixture, 575, 660);
      const originalSchema = narrativeWriterResponseSchemaV8(fixture);
      const overlaidSchema = applyNarrativeWriterBenchmarkLengthSchemaV8(originalSchema, contract);

      expect(overlaidSchema).not.toBe(originalSchema);

      const segmentsItems = (overlaidSchema as Record<string, unknown>).properties as Record<string, unknown>;
      const segments = segmentsItems.segments as Record<string, unknown>;
      const anyOf = (segments.items as Record<string, unknown>).anyOf as Array<Record<string, unknown>>;

      expect(anyOf).toHaveLength(6);

      for (let i = 0; i < 6; i += 1) {
        const branch = anyOf[i];
        const properties = branch.properties as Record<string, unknown>;
        const estimatedWords = properties.estimatedWords as Record<string, unknown>;
        expect(estimatedWords.minimum).toBe(contract.beats[i].minimumWords);
        expect(estimatedWords.maximum).toBe(contract.beats[i].maximumWords);
      }

      const originalSegmentsItems = (originalSchema as Record<string, unknown>).properties as Record<string, unknown>;
      const originalSegments = originalSegmentsItems.segments as Record<string, unknown>;
      const originalAnyOf = (originalSegments.items as Record<string, unknown>).anyOf as Array<Record<string, unknown>>;
      for (const branch of originalAnyOf) {
        const properties = branch.properties as Record<string, unknown>;
        const estimatedWords = properties.estimatedWords as Record<string, unknown>;
        expect(estimatedWords.minimum).toBe(1);
      }
    });

    it('builds a length prompt that references writerLengthContract, the global bounds 575, 618 and 660, and actual segment.text words', () => {
      const contract = buildNarrativeWriterBenchmarkLengthContractV8(fixture, 575, 660);
      const prompt = buildNarrativeWriterBenchmarkLengthPromptV8(contract);

      expect(prompt).toContain('writerLengthContract');
      expect(prompt).toContain('575');
      expect(prompt).toContain('618');
      expect(prompt).toContain('660');
      expect(prompt).toContain('segment.text');
    });

    it('validates actual segment text counts against the experimental beat budget', () => {
      const contract = buildNarrativeWriterBenchmarkLengthContractV8(fixture, 575, 660);
      const targets = contract.beats.map((beat) => beat.targetWords);
      const validResult: NarrativeStructuredWriterResultV8 = {
        text: '',
        segments: contract.beats.map((beat, index) => ({
          segmentId: `seg-${index + 1}`,
          beat: beat.beat,
          text: Array.from({ length: targets[index] }, (_, i) => `word${i + 1}`).join(' '),
          supportCardIds: [fixture.beats[index].evidenceCardIds[0]],
          estimatedWords: targets[index],
        })),
        coverage: 1,
        wordCount: 618,
      };

      expect(validateNarrativeWriterBenchmarkBeatLengthsV8(validResult, contract)).toBe(validResult);

      const invalidResult: NarrativeStructuredWriterResultV8 = {
        ...validResult,
        segments: validResult.segments.map((segment, index) =>
          index === 0
            ? { ...segment, text: Array.from({ length: contract.beats[0].minimumWords - 1 }, (_, i) => `word${i + 1}`).join(' ') }
            : segment
        ),
      };

      expect(() => validateNarrativeWriterBenchmarkBeatLengthsV8(invalidResult, contract)).toThrow(
        /beat_length_target_missed.*arrival_and_orientation/u
      );
    });
  });
});
