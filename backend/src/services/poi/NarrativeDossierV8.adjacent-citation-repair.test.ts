import {
  NarrativeCuratorOutputV8,
  buildValidatedDossierV8,
  normalizeNarrativeCuratorOutputV8,
} from './NarrativeDossierV8';
import { NarrativeCapturedSourceV8 } from './NarrativeSourcesV7';
import { segmentCaptureIntoSpansV7 } from './NarrativeSpansV7';

function wikipediaCapture(content: string): NarrativeCapturedSourceV8 {
  return {
    sourceId: 'source-wiki-es',
    requestedUrl: 'https://es.wikipedia.org/wiki/Plaza_de_Cibeles',
    finalUrl: 'https://es.wikipedia.org/wiki/Plaza_de_Cibeles',
    title: 'Plaza de Cibeles',
    capturedAt: '2026-09-03T21:39:21.219Z',
    content,
    fingerprint: 'fixture-plaza-cibeles',
    authority: {
      tier: 'established_source',
      publisherKey: 'wikimedia',
      rule: 'wikimedia_qid_match',
    },
    containsInstructionLikeText: false,
    finalHttpStatus: 200,
    sourceKind: 'wikipedia_api',
    entityQid: 'Q1537446',
    publisherKey: 'wikimedia',
  };
}

function curatorOutput(selectedSpanId: string): NarrativeCuratorOutputV8 {
  return {
    propositions: [{
      text: 'En 1895 se trasladó la fuente a la intersección del paseo de Recoletos con la calle de Alcalá.',
      role: 'chronology_or_transformation',
      certainty: 'high',
      interpretation: 'direct',
      supports: [{
        sourceId: 'source-wiki-es',
        evidenceSpanIds: [selectedSpanId],
      }],
    }],
    authorizedNames: ['paseo de Recoletos', 'calle de Alcalá'],
    authorizedNumbers: ['1895'],
    discrepancies: [],
    limits: [],
  };
}

function normalizeScenario(content: string, selectedSpanIndex: number) {
  const capture = wikipediaCapture(content);
  const spans = segmentCaptureIntoSpansV7(capture).spans;
  const spansBySource = new Map([[capture.sourceId, spans]]);
  const normalized = normalizeNarrativeCuratorOutputV8({
    output: curatorOutput(spans[selectedSpanIndex].evidenceSpanId),
    captures: [capture],
    spansBySource,
    authorizedIdentityNames: ['Plaza de Cibeles'],
  });
  return { capture, spans, spansBySource, normalized };
}

describe('V8 adjacent citation repair', () => {
  it('expands to the immediately preceding span when it resolves a named coreference', () => {
    const scenario = normalizeScenario(
      [
        'En 1782 se instaló la fuente junto al Palacio de Buenavista, en el paseo de Recoletos.',
        'En 1895 se trasladó la fuente a la intersección del citado paseo con la calle de Alcalá.',
      ].join('\n\n'),
      1
    );

    expect(scenario.normalized.output.propositions[0].supports[0].evidenceSpanIds).toEqual([
      scenario.spans[0].evidenceSpanId,
      scenario.spans[1].evidenceSpanId,
    ]);

    const validation = buildValidatedDossierV8({
      stopId: 'Q1537446',
      stopName: 'Plaza de Cibeles',
      qid: 'Q1537446',
      language: 'es',
      curatorOutput: scenario.normalized.output,
      captures: [scenario.capture],
      spansBySource: scenario.spansBySource,
      authorizedIdentityNames: ['Plaza de Cibeles'],
    });

    expect(validation.status).toBe('ok');
  });

  it('does not expand across an intervening span when the named evidence is not adjacent', () => {
    const scenario = normalizeScenario(
      [
        'En 1782 se instaló la fuente en el paseo de Recoletos.',
        'La plaza fue durante décadas un importante espacio ceremonial.',
        'En 1895 se trasladó la fuente a la intersección del citado paseo con la calle de Alcalá.',
      ].join('\n\n'),
      2
    );

    expect(scenario.normalized.output.propositions[0].supports[0].evidenceSpanIds).toEqual([
      scenario.spans[2].evidenceSpanId,
    ]);

    const validation = buildValidatedDossierV8({
      stopId: 'Q1537446',
      stopName: 'Plaza de Cibeles',
      qid: 'Q1537446',
      language: 'es',
      curatorOutput: scenario.normalized.output,
      captures: [scenario.capture],
      spansBySource: scenario.spansBySource,
      authorizedIdentityNames: ['Plaza de Cibeles'],
    });

    expect(validation).toEqual(expect.objectContaining({
      status: 'curator_contract_failed',
    }));
    if (validation.status !== 'curator_contract_failed') {
      throw new Error('expected citation closure failure');
    }
    expect(validation.reason).toContain('citation closure missing name');
  });

  it('expands to the immediately following span when it resolves a named coreference', () => {
    const scenario = normalizeScenario(
      [
        'En 1895 se trasladó la fuente a la intersección del paseo citado con la calle de Alcalá.',
        'El paseo de Recoletos es una vía histórica de Madrid.',
      ].join('\n\n'),
      0
    );

    expect(scenario.normalized.output.propositions[0].supports[0].evidenceSpanIds).toEqual([
      scenario.spans[0].evidenceSpanId,
      scenario.spans[1].evidenceSpanId,
    ]);

    const validation = buildValidatedDossierV8({
      stopId: 'Q1537446',
      stopName: 'Plaza de Cibeles',
      qid: 'Q1537446',
      language: 'es',
      curatorOutput: scenario.normalized.output,
      captures: [scenario.capture],
      spansBySource: scenario.spansBySource,
      authorizedIdentityNames: ['Plaza de Cibeles'],
    });

    expect(validation.status).toBe('ok');
  });
});
