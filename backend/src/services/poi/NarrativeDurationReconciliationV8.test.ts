import { narrationTargetForSecondsV8 } from './NarrativeDurationTargetsV8';
import {
  NarrativeDurationReconciliationV8,
  reconcileNarrationTargetsV8,
} from './NarrativeDurationReconciliationV8';
import { NarrativeRichnessProfileV8 } from './NarrativeRichnessV8';

function richness(
  maximumSupportedSeconds: number,
  overrides: Partial<NarrativeRichnessProfileV8> = {}
): NarrativeRichnessProfileV8 {
  return {
    cards: [],
    supportedCardCount: 10,
    highPriorityCardCount: 10,
    distinctPassageCount: 10,
    distinctPublisherCount: 2,
    facetCount: 6,
    visualCardCount: 2,
    spatialCardCount: 2,
    duplicateCardCount: 0,
    maximumSupportedSeconds,
    groundingReady: true,
    writerReady: true,
    richnessReady: maximumSupportedSeconds >= 300,
    reasons: maximumSupportedSeconds >= 300 ? [] : ['below_target_seconds'],
    ...overrides,
  };
}

describe('reconcileNarrationTargetsV8', () => {
  it('keeps 600 words only for a stop that supports the full 300 seconds', () => {
    const result = reconcileNarrationTargetsV8([
      {
        stopId: 'plaza-mayor',
        required: true,
        target: narrationTargetForSecondsV8('plaza-mayor', 300),
        richness: richness(300),
      },
    ]);

    expect(result.entries[0]).toMatchObject({
      stopId: 'plaza-mayor',
      disposition: 'kept',
      initialTargetSeconds: 300,
      finalTarget: {
        targetSeconds: 300,
        targetWords: 600,
      },
      richness: {
        supportedCardCount: 10,
        highPriorityCardCount: 10,
        distinctPassageCount: 10,
        distinctPublisherCount: 2,
        facetCount: 6,
        visualCardCount: 2,
        spatialCardCount: 2,
        duplicateCardCount: 0,
        groundingReady: true,
        writerReady: true,
        richnessReady: true,
      },
    });
    expect(result.unassignedSeconds).toBe(0);
  });

  it('reduces a medium stop before the writer sees an unsupported 600-word target', () => {
    const result = reconcileNarrationTargetsV8([
      {
        stopId: 'cibeles',
        required: true,
        target: narrationTargetForSecondsV8('cibeles', 300),
        richness: richness(240),
      },
    ]);

    expect(result.entries[0]).toMatchObject({
      disposition: 'shortened',
      initialTargetSeconds: 300,
      finalTarget: {
        targetSeconds: 240,
        targetWords: 480,
        targetEvidenceCards: 8,
      },
      reasons: expect.arrayContaining(['below_target_seconds']),
    });
    expect(result.unassignedSeconds).toBe(60);
  });

  it('recommends replacing an optional stop that only supports 120 seconds', () => {
    const result = reconcileNarrationTargetsV8([
      {
        stopId: 'colon',
        required: false,
        target: narrationTargetForSecondsV8('colon', 300),
        richness: richness(120),
      },
    ]);

    expect(result.entries[0]).toMatchObject({
      disposition: 'recommend_replace_optional',
      finalTarget: {
        targetSeconds: 120,
        targetWords: 240,
      },
    });
    expect(result.unassignedSeconds).toBe(180);
  });

  it('keeps a required sparse stop but shortens it to its supported floor', () => {
    const result = reconcileNarrationTargetsV8([
      {
        stopId: 'required-sparse',
        required: true,
        target: narrationTargetForSecondsV8('required-sparse', 300),
        richness: richness(120),
      },
    ]);

    expect(result.entries[0]).toMatchObject({
      disposition: 'shortened',
      finalTarget: {
        targetSeconds: 120,
        targetWords: 240,
      },
    });
  });

  it('blocks a stop whose evidence is not grounded or writer-ready', () => {
    const result = reconcileNarrationTargetsV8([
      {
        stopId: 'invalid',
        required: true,
        target: narrationTargetForSecondsV8('invalid', 300),
        richness: richness(0, {
          groundingReady: false,
          writerReady: false,
          reasons: ['invalid_grounding', 'dossier_not_writer_ready'],
        }),
      },
    ]);

    expect(result.entries[0]).toMatchObject({
      disposition: 'blocked',
      finalTarget: {
        targetSeconds: 0,
        targetWords: 0,
      },
      reasons: expect.arrayContaining([
        'invalid_grounding',
        'dossier_not_writer_ready',
        'below_target_seconds',
      ]),
    });
    expect(result.unassignedSeconds).toBe(300);
  });

  it('never exceeds the initial budget and reports unused narration time explicitly', () => {
    const result: NarrativeDurationReconciliationV8 = reconcileNarrationTargetsV8([
      {
        stopId: 'rich',
        required: true,
        target: narrationTargetForSecondsV8('rich', 300),
        richness: richness(300),
      },
      {
        stopId: 'medium',
        required: true,
        target: narrationTargetForSecondsV8('medium', 300),
        richness: richness(240),
      },
      {
        stopId: 'thin',
        required: false,
        target: narrationTargetForSecondsV8('thin', 300),
        richness: richness(120),
      },
    ]);

    const initialSeconds = result.entries.reduce((sum, entry) => sum + entry.initialTargetSeconds, 0);
    const finalSeconds = result.targets.reduce((sum, target) => sum + target.targetSeconds, 0);

    expect(finalSeconds).toBeLessThanOrEqual(initialSeconds);
    expect(result.unassignedSeconds).toBe(initialSeconds - finalSeconds);
    expect(result.unassignedSeconds).toBe(240);
  });
});
