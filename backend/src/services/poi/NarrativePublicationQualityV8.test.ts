import { EditorialCallResultV6 } from './EditorialStructuredLlmV6';
import { NarrativeScriptV6 } from './NarrativeEditorialV6';
import { narrationTargetForSecondsV8 } from './NarrativeDurationTargetsV8';
import { buildNarrativePublicationQualityV8 } from './NarrativePublicationQualityV8';
import { NARRATIVE_BEAT_ORDER_V8 } from './NarrativeWriterContractV8';

function script(stopId: string, wordCount: number): NarrativeScriptV6 {
  const text = Array.from({ length: wordCount }, (_, index) => `palabra${index + 1}`).join(' ');
  return {
    stopId,
    text,
    sentences: [{ sentenceId: `${stopId}-S001`, stopId, index: 0, text }],
    fingerprint: stopId.padEnd(64, '0').slice(0, 64),
  };
}

function writerDiagnostic(stopId: string, coverage = 0.8): EditorialCallResultV6<unknown> {
  return {
    callId: `narrative-v6-writer-${stopId}`,
    status: 'valid',
    value: {
      text: 'normalized text',
      coverage,
      wordCount: 580,
      segments: NARRATIVE_BEAT_ORDER_V8.map((beat, index) => ({
        segmentId: `segment-${index + 1}`,
        beat,
        text: `segment ${index + 1}`,
        supportCardIds: [`card-${index + 1}`],
        estimatedWords: 90,
      })),
    },
    attempts: [],
    model: 'test-model',
    promptFingerprint: 'a'.repeat(64),
    responseFingerprint: 'b'.repeat(64),
    inputCharacters: 1,
    schemaCharacters: 1,
    input: {},
    rawOutput: null,
  };
}

describe('NarrativePublicationQualityV8', () => {
  it('approves final length and traceable beat coverage when both pass', () => {
    const quality = buildNarrativePublicationQualityV8({
      scripts: [script('stop-a', 580)],
      targets: [narrationTargetForSecondsV8('stop-a', 300)],
      arcContributions: { 'stop-a': 'Explica el origen ceremonial de la plaza.' },
      writerDiagnostics: [writerDiagnostic('stop-a')],
      requireWriterTraceability: true,
    });

    expect(quality.passed).toBe(true);
    expect(quality.stops).toEqual([
      expect.objectContaining({
        stopId: 'stop-a',
        finalWordCount: 580,
        minimumWords: 580,
        lengthPassed: true,
        beatCount: 6,
        highPriorityCoverage: 0.8,
        traceabilityPassed: true,
      }),
    ]);
  });

  it('fails publication quality when a repaired final script falls below its reconciled range', () => {
    const quality = buildNarrativePublicationQualityV8({
      scripts: [script('stop-a', 579)],
      targets: [narrationTargetForSecondsV8('stop-a', 300)],
      arcContributions: { 'stop-a': 'Explica el origen ceremonial de la plaza.' },
      writerDiagnostics: [writerDiagnostic('stop-a')],
      requireWriterTraceability: true,
    });

    expect(quality.passed).toBe(false);
    expect(quality.stops[0]).toEqual(expect.objectContaining({
      finalWordCount: 579,
      lengthPassed: false,
    }));
  });

  it('reports missing writer traceability and fails when a fresh run requires it', () => {
    const quality = buildNarrativePublicationQualityV8({
      scripts: [script('stop-a', 580)],
      targets: [narrationTargetForSecondsV8('stop-a', 300)],
      arcContributions: { 'stop-a': 'Explica el origen ceremonial de la plaza.' },
      writerDiagnostics: [],
      requireWriterTraceability: true,
    });

    expect(quality.passed).toBe(false);
    expect(quality.stops[0]).toEqual(expect.objectContaining({
      highPriorityCoverage: null,
      traceabilityPassed: null,
    }));
  });
});
