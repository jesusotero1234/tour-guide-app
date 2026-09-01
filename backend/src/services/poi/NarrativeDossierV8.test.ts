import {
  NarrativeCuratorOutputV8,
  NARRATIVE_ROLES_V8,
  buildValidatedDossierV8,
  classifyEvidenceTierV8,
} from './NarrativeDossierV8';
import { NarrativeCapturedSourceV8 } from './NarrativeSourcesV7';
import {
  NarrativeEvidenceSpanV7,
  segmentCaptureIntoSpansV7,
} from './NarrativeSpansV7';

function capture(
  sourceId: string,
  content: string,
  authority: NarrativeCapturedSourceV8['authority']
): NarrativeCapturedSourceV8 {
  return {
    sourceId,
    requestedUrl: `https://${sourceId}.example`,
    finalUrl: `https://${sourceId}.example`,
    title: sourceId,
    capturedAt: '2026-08-01T10:00:00Z',
    content,
    fingerprint: `f-${sourceId}`,
    authority,
    containsInstructionLikeText: false,
    finalHttpStatus: 200,
    sourceKind: 'official_web',
    entityQid: null,
    publisherKey: authority.publisherKey,
  };
}

function spansOf(c: NarrativeCapturedSourceV8): Map<string, NarrativeEvidenceSpanV7[]> {
  return new Map([[c.sourceId, segmentCaptureIntoSpansV7(c).spans]]);
}

function baseInput(overrides: Partial<Parameters<typeof buildValidatedDossierV8>[0]> = {}) {
  return {
    stopId: 'Q1',
    stopName: 'Monumento',
    qid: 'Q1',
    language: 'es',
    captures: [],
    spansBySource: new Map<string, NarrativeEvidenceSpanV7[]>(),
    curatorOutput: {
      propositions: [],
      authorizedNames: [],
      authorizedNumbers: [],
      discrepancies: [],
      limits: [],
    } as NarrativeCuratorOutputV8,
    ...overrides,
  };
}

const AUTHORITY_A = {
  tier: 'primary_authority' as const,
  publisherKey: 'a.example',
  rule: 'official_registry',
};
const AUTHORITY_B = {
  tier: 'primary_authority' as const,
  publisherKey: 'b.example',
  rule: 'official_registry',
};

describe('buildValidatedDossierV8', () => {
  it('accepts a literal span from an authorized source and reconstructs the exact quote', () => {
    const c = capture('source-a', 'La torre norte quedó inacabada en 1782.', AUTHORITY_A);
    const spans = spansOf(c);
    const spanId = spans.get('source-a')![0].evidenceSpanId;
    const result = buildValidatedDossierV8(baseInput({
      captures: [c],
      spansBySource: spans,
      curatorOutput: {
        propositions: [{
          text: 'La torre norte quedó inacabada en 1782.',
          role: 'chronology_or_transformation',
          certainty: 'high',
          interpretation: 'direct',
          supports: [{ sourceId: 'source-a', evidenceSpanIds: [spanId] }],
        }],
        authorizedNames: ['torre'],
        authorizedNumbers: ['1782'],
        discrepancies: [],
        limits: [],
      },
    }));

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.value.passageQuotes).toContain('La torre norte quedó inacabada en 1782.');
    expect(result.value.dossier.passages[0].quote).toBe(c.content.slice(
      spans.get('source-a')![0].start,
      spans.get('source-a')![0].end
    ));
  });

  it('rejects an invented span id as curator_contract_failed', () => {
    const c = capture('source-a', 'Contenido de la fuente A.', AUTHORITY_A);
    const result = buildValidatedDossierV8(baseInput({
      captures: [c],
      spansBySource: spansOf(c),
      curatorOutput: {
        propositions: [{
          text: 'Afirmación sin soporte real.',
          role: 'visible_observation',
          certainty: 'high',
          interpretation: 'direct',
          supports: [{ sourceId: 'source-a', evidenceSpanIds: ['source-a:span:9999'] }],
        }],
        authorizedNames: [],
        authorizedNumbers: [],
        discrepancies: [],
        limits: [],
      },
    }));

    expect(result.status).toBe('curator_contract_failed');
  });

  it('rejects a duplicate span selection', () => {
    const c = capture('source-a', 'Párrafo uno.\n\nPárrafo dos.', AUTHORITY_A);
    const spans = spansOf(c);
    const spanId = spans.get('source-a')![0].evidenceSpanId;
    const result = buildValidatedDossierV8(baseInput({
      captures: [c],
      spansBySource: spans,
      curatorOutput: {
        propositions: [{
          text: 'Duplicado.',
          role: 'visible_observation',
          certainty: 'high',
          interpretation: 'direct',
          supports: [{ sourceId: 'source-a', evidenceSpanIds: [spanId, spanId] }],
        }],
        authorizedNames: [],
        authorizedNumbers: [],
        discrepancies: [],
        limits: [],
      },
    }));

    expect(result.status).toBe('curator_contract_failed');
  });

  it('keeps the contiguous prefix of non-contiguous spans', () => {
    const c = capture('source-a', 'Párrafo uno.\n\nPárrafo dos.\n\nPárrafo tres.', AUTHORITY_A);
    const spans = spansOf(c);
    const ids = spans.get('source-a')!.map((span) => span.evidenceSpanId);
    const result = buildValidatedDossierV8(baseInput({
      captures: [c],
      spansBySource: spans,
      curatorOutput: {
        propositions: [{
          text: 'Salto.',
          role: 'visible_observation',
          certainty: 'high',
          interpretation: 'direct',
          supports: [{ sourceId: 'source-a', evidenceSpanIds: [ids[0], ids[2]] }],
        }],
        authorizedNames: [],
        authorizedNumbers: [],
        discrepancies: [],
        limits: [],
      },
    }));

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.value.dossier.propositions[0].passageIds).toHaveLength(1);
  });

  it('rejects a support referencing a span from another source', () => {
    const a = capture('source-a', 'Contenido A.', AUTHORITY_A);
    const b = capture('source-b', 'Contenido B.', AUTHORITY_B);
    const otherSpan = spansOf(b).get('source-b')![0];
    const result = buildValidatedDossierV8(baseInput({
      captures: [a, b],
      spansBySource: spansOf(a),
      curatorOutput: {
        propositions: [{
          text: 'Cruce.',
          role: 'visible_observation',
          certainty: 'high',
          interpretation: 'direct',
          supports: [{ sourceId: 'source-a', evidenceSpanIds: [otherSpan.evidenceSpanId] }],
        }],
        authorizedNames: [],
        authorizedNumbers: [],
        discrepancies: [],
        limits: [],
      },
    }));

    expect(result.status).toBe('curator_contract_failed');
  });

  it('rejects a discovery_only source even if the spans exist', () => {
    const c = capture('source-a', 'Contenido A.', {
      tier: 'discovery_only',
      publisherKey: 'a.example',
      rule: 'unregistered',
    });
    const spans = spansOf(c);
    const spanId = spans.get('source-a')![0].evidenceSpanId;
    const result = buildValidatedDossierV8(baseInput({
      captures: [c],
      spansBySource: spans,
      curatorOutput: {
        propositions: [{
          text: 'Sin autoridad.',
          role: 'visible_observation',
          certainty: 'high',
          interpretation: 'direct',
          supports: [{ sourceId: 'source-a', evidenceSpanIds: [spanId] }],
        }],
        authorizedNames: [],
        authorizedNumbers: [],
        discrepancies: [],
        limits: [],
      },
    }));

    expect(result.status).toBe('curator_contract_failed');
  });

  it('downgrades a debatable proposition backed by a single publisher to direct', () => {
    const a = capture('source-a', 'Afirmación discutible en la fuente A.', AUTHORITY_A);
    const b = capture('source-a2', 'Otra página de la fuente A.', AUTHORITY_A);
    const spansA = spansOf(a);
    const spansB = spansOf(b);
    const allSpans = new Map([...spansA, ...spansB]);
    const result = buildValidatedDossierV8(baseInput({
      captures: [a, b],
      spansBySource: allSpans,
      curatorOutput: {
        propositions: [{
          text: 'Afirmación discutible.',
          role: 'tension_or_contrast',
          certainty: 'medium',
          interpretation: 'debatable',
          supports: [
            { sourceId: 'source-a', evidenceSpanIds: [spansA.get('source-a')![0].evidenceSpanId] },
            { sourceId: 'source-a2', evidenceSpanIds: [spansB.get('source-a2')![0].evidenceSpanId] },
          ],
        }],
        authorizedNames: [],
        authorizedNumbers: [],
        discrepancies: [],
        limits: [],
      },
    }));

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.value.dossier.propositions[0].interpretation).toBe('direct');
  });

  it('accepts a debatable proposition with two publishers and keeps both quotes', () => {
    const a = capture('source-a', 'Afirmación discutible corroborada en A.', AUTHORITY_A);
    const b = capture('source-b', 'Afirmación discutible corroborada en B.', AUTHORITY_B);
    const spansA = spansOf(a);
    const spansB = spansOf(b);
    const allSpans = new Map([...spansA, ...spansB]);
    const result = buildValidatedDossierV8(baseInput({
      captures: [a, b],
      spansBySource: allSpans,
      curatorOutput: {
        propositions: [{
          text: 'Afirmación discutible.',
          role: 'tension_or_contrast',
          certainty: 'medium',
          interpretation: 'debatable',
          supports: [
            { sourceId: 'source-a', evidenceSpanIds: [spansA.get('source-a')![0].evidenceSpanId] },
            { sourceId: 'source-b', evidenceSpanIds: [spansB.get('source-b')![0].evidenceSpanId] },
          ],
        }],
        authorizedNames: [],
        authorizedNumbers: [],
        discrepancies: [],
        limits: [],
      },
    }));

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.value.dossier.propositions[0].interpretation).toBe('debatable');
    expect(result.value.dossier.propositions[0].passageIds).toHaveLength(2);
    expect(result.value.dossier.sufficiency.independentPublisherCount).toBeGreaterThanOrEqual(2);
  });

  it('counts wikimedia sources once for debatable corroboration', () => {
    const a = capture('source-wiki-es', 'Texto en la Wikipedia en español.', {
      tier: 'established_source',
      publisherKey: 'wikimedia',
      rule: 'wikimedia_qid_match',
    });
    const b = capture('source-wiki-en', 'Text in the English Wikipedia.', {
      tier: 'established_source',
      publisherKey: 'wikimedia',
      rule: 'wikimedia_qid_match',
    });
    const spansA = spansOf(a);
    const spansB = spansOf(b);
    const result = buildValidatedDossierV8(baseInput({
      captures: [a, b],
      spansBySource: new Map([...spansA, ...spansB]),
      curatorOutput: {
        propositions: [{
          text: 'Discutible solo con Wikimedia.',
          role: 'tension_or_contrast',
          certainty: 'medium',
          interpretation: 'debatable',
          supports: [
            { sourceId: 'source-wiki-es', evidenceSpanIds: [spansA.get('source-wiki-es')![0].evidenceSpanId] },
            { sourceId: 'source-wiki-en', evidenceSpanIds: [spansB.get('source-wiki-en')![0].evidenceSpanId] },
          ],
        }],
        authorizedNames: [],
        authorizedNumbers: [],
        discrepancies: [],
        limits: [],
      },
    }));

    // Wikimedia cuenta una sola vez: dos fuentes wikimedia no son dos
    // publishers, así que la proposición debatible se acepta como direct.
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.value.dossier.propositions[0].interpretation).toBe('direct');
  });

  it('filters authorized names and numbers absent from the evidence', () => {
    const c = capture('source-a', 'El puente fue construido en 1840.', AUTHORITY_A);
    const spans = spansOf(c);
    const spanId = spans.get('source-a')![0].evidenceSpanId;
    const badName = buildValidatedDossierV8(baseInput({
      captures: [c],
      spansBySource: spans,
      curatorOutput: {
        propositions: [{
          text: 'El puente.',
          role: 'visible_observation',
          certainty: 'high',
          interpretation: 'direct',
          supports: [{ sourceId: 'source-a', evidenceSpanIds: [spanId] }],
        }],
        authorizedNames: ['Inventado'],
        authorizedNumbers: [],
        discrepancies: [],
        limits: [],
      },
    }));
    expect(badName.status).toBe('ok');
    if (badName.status !== 'ok') return;
    expect(badName.value.dossier.authorizedNames).toEqual([]);

    const badNumber = buildValidatedDossierV8(baseInput({
      captures: [c],
      spansBySource: spans,
      curatorOutput: {
        propositions: [{
          text: 'El puente.',
          role: 'visible_observation',
          certainty: 'high',
          interpretation: 'direct',
          supports: [{ sourceId: 'source-a', evidenceSpanIds: [spanId] }],
        }],
        authorizedNames: [],
        authorizedNumbers: ['1999'],
        discrepancies: [],
        limits: [],
      },
    }));
    expect(badNumber.status).toBe('ok');
    if (badNumber.status !== 'ok') return;
    expect(badNumber.value.dossier.authorizedNumbers).toEqual([]);
  });

  it('accepts an authorized name that matches the evidence after normalization', () => {
    const c = capture('source-a', 'El Teatro romano de Málaga fue declarado BIC en 1972.', AUTHORITY_A);
    const spans = spansOf(c);
    const spanId = spans.get('source-a')![0].evidenceSpanId;
    const result = buildValidatedDossierV8(baseInput({
      captures: [c],
      spansBySource: spans,
      curatorOutput: {
        propositions: [{
          text: 'El teatro fue declarado BIC.',
          role: 'chronology_or_transformation',
          certainty: 'high',
          interpretation: 'direct',
          supports: [{ sourceId: 'source-a', evidenceSpanIds: [spanId] }],
        }],
        authorizedNames: ['Teatro Romano De Malaga'],
        authorizedNumbers: ['1972'],
        discrepancies: [],
        limits: [],
      },
    }));

    expect(result.status).toBe('ok');
  });

  it('computes both gates and lets buildNarrativeDossierV6 confirm writerReady', () => {
    const a = capture('source-a', [
      'Se observa la torre inacabada.',
      'Construida entre 1528 y 1782.',
      'Fue sede del poder episcopal.',
      'Contrasta con el puerto moderno.',
      'Su coro de caoba es un rasgo único.',
    ].join('\n\n'), AUTHORITY_A);
    const b = capture('source-b', 'La catedral transformó la ciudad durante siglos.', AUTHORITY_B);
    const spans = new Map([
      ...spansOf(a),
      ...spansOf(b),
    ]);
    const idsA = spans.get('source-a')!.map((span) => span.evidenceSpanId);
    const idsB = spans.get('source-b')!.map((span) => span.evidenceSpanId);
    const roles = NARRATIVE_ROLES_V8;
    const supportForRole: Record<string, { sourceId: string; spanId: string }> = {
      visible_observation: { sourceId: 'source-a', spanId: idsA[0] },
      chronology_or_transformation: { sourceId: 'source-a', spanId: idsA[1] },
      human_agency_or_lived_function: { sourceId: 'source-b', spanId: idsB[0] },
      tension_or_contrast: { sourceId: 'source-a', spanId: idsA[3] },
      distinctive_trait: { sourceId: 'source-a', spanId: idsA[4] },
    };
    const result = buildValidatedDossierV8(baseInput({
      captures: [a, b],
      spansBySource: spans,
      curatorOutput: {
        propositions: roles.map((role, index) => ({
          text: `Proposición de rol ${role}.`,
          role,
          certainty: 'high' as const,
          interpretation: 'direct' as const,
          supports: [{
            sourceId: supportForRole[role].sourceId,
            evidenceSpanIds: [supportForRole[role].spanId],
          }],
        })),
        authorizedNames: ['torre', 'caoba'],
        authorizedNumbers: ['1528', '1782'],
        discrepancies: [],
        limits: [],
      },
    }));

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.value.gates.minimumEvidenceReady).toBe(true);
    expect(result.value.gates.writerReady).toBe(true);
    expect(result.value.dossier.sufficiency.isSufficient).toBe(true);
  });

  it('classifies tier A with two supporting publishers', () => {
    const a = capture('source-a', 'Texto A.', AUTHORITY_A);
    const b = capture('source-b', 'Texto B.', AUTHORITY_B);
    const spans = new Map([...spansOf(a), ...spansOf(b)]);
    const idsA = spans.get('source-a')!.map((span) => span.evidenceSpanId);
    const idsB = spans.get('source-b')!.map((span) => span.evidenceSpanId);
    const result = buildValidatedDossierV8(baseInput({
      captures: [a, b],
      spansBySource: spans,
      curatorOutput: {
        propositions: [
          { text: 'Obs.', role: 'visible_observation', certainty: 'high', interpretation: 'direct', supports: [{ sourceId: 'source-a', evidenceSpanIds: [idsA[0]] }] },
          { text: 'Cron.', role: 'chronology_or_transformation', certainty: 'high', interpretation: 'direct', supports: [{ sourceId: 'source-b', evidenceSpanIds: [idsB[0]] }] },
          { text: 'Func.', role: 'human_agency_or_lived_function', certainty: 'high', interpretation: 'direct', supports: [{ sourceId: 'source-a', evidenceSpanIds: [idsA[0]] }] },
          { text: 'Tens.', role: 'tension_or_contrast', certainty: 'high', interpretation: 'direct', supports: [{ sourceId: 'source-b', evidenceSpanIds: [idsB[0]] }] },
          { text: 'Rasgo.', role: 'distinctive_trait', certainty: 'high', interpretation: 'direct', supports: [{ sourceId: 'source-a', evidenceSpanIds: [idsA[0]] }] },
        ],
        authorizedNames: [],
        authorizedNumbers: [],
        discrepancies: [],
        limits: [],
      },
    }));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(classifyEvidenceTierV8(result.value.dossier, result.value.gates, [a, b])).toBe('A');
  });

  it('classifies tier B with one supporting primary authority', () => {
    const a = capture('source-a', 'Texto A.', AUTHORITY_A);
    const spans = spansOf(a);
    const idsA = spans.get('source-a')!.map((span) => span.evidenceSpanId);
    const result = buildValidatedDossierV8(baseInput({
      captures: [a],
      spansBySource: spans,
      curatorOutput: {
        propositions: [
          { text: 'Obs.', role: 'visible_observation', certainty: 'high', interpretation: 'direct', supports: [{ sourceId: 'source-a', evidenceSpanIds: [idsA[0]] }] },
          { text: 'Cron.', role: 'chronology_or_transformation', certainty: 'high', interpretation: 'direct', supports: [{ sourceId: 'source-a', evidenceSpanIds: [idsA[0]] }] },
          { text: 'Func.', role: 'human_agency_or_lived_function', certainty: 'high', interpretation: 'direct', supports: [{ sourceId: 'source-a', evidenceSpanIds: [idsA[0]] }] },
          { text: 'Tens.', role: 'tension_or_contrast', certainty: 'high', interpretation: 'direct', supports: [{ sourceId: 'source-a', evidenceSpanIds: [idsA[0]] }] },
          { text: 'Rasgo.', role: 'distinctive_trait', certainty: 'high', interpretation: 'direct', supports: [{ sourceId: 'source-a', evidenceSpanIds: [idsA[0]] }] },
        ],
        authorizedNames: [],
        authorizedNumbers: [],
        discrepancies: [],
        limits: [],
      },
    }));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.value.dossier.sources).toHaveLength(1);
    expect(classifyEvidenceTierV8(result.value.dossier, result.value.gates, [a])).toBe('B');
  });

  it('does not upgrade C to B with unsupported primary capture', () => {
    const a = capture('source-a', 'Texto A.', { tier: 'established_source', publisherKey: 'a.example', rule: 'established' });
    const unsupported = capture('source-c', 'Texto C.', AUTHORITY_A);
    const spans = spansOf(a);
    const idsA = spans.get('source-a')!.map((span) => span.evidenceSpanId);
    const result = buildValidatedDossierV8(baseInput({
      captures: [a, unsupported],
      spansBySource: spans,
      curatorOutput: {
        propositions: [
          { text: 'Obs.', role: 'visible_observation', certainty: 'high', interpretation: 'direct', supports: [{ sourceId: 'source-a', evidenceSpanIds: [idsA[0]] }] },
          { text: 'Cron.', role: 'chronology_or_transformation', certainty: 'high', interpretation: 'direct', supports: [{ sourceId: 'source-a', evidenceSpanIds: [idsA[0]] }] },
          { text: 'Func.', role: 'human_agency_or_lived_function', certainty: 'high', interpretation: 'direct', supports: [{ sourceId: 'source-a', evidenceSpanIds: [idsA[0]] }] },
          { text: 'Tens.', role: 'tension_or_contrast', certainty: 'high', interpretation: 'direct', supports: [{ sourceId: 'source-a', evidenceSpanIds: [idsA[0]] }] },
          { text: 'Rasgo.', role: 'distinctive_trait', certainty: 'high', interpretation: 'direct', supports: [{ sourceId: 'source-a', evidenceSpanIds: [idsA[0]] }] },
        ],
        authorizedNames: [],
        authorizedNumbers: [],
        discrepancies: [],
        limits: [],
      },
    }));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.value.dossier.sources).toHaveLength(1);
    expect(classifyEvidenceTierV8(result.value.dossier, result.value.gates, [a, unsupported])).toBe('C');
  });

  it('classifies tier C with minimum evidence but no writer readiness', () => {
    const a = capture('source-a', 'Texto A.', AUTHORITY_A);
    const b = capture('source-b', 'Texto B.', AUTHORITY_B);
    const spans = new Map([...spansOf(a), ...spansOf(b)]);
    const idsA = spans.get('source-a')!.map((span) => span.evidenceSpanId);
    const idsB = spans.get('source-b')!.map((span) => span.evidenceSpanId);
    const result = buildValidatedDossierV8(baseInput({
      captures: [a, b],
      spansBySource: spans,
      curatorOutput: {
        propositions: [
          { text: 'Obs.', role: 'visible_observation', certainty: 'high', interpretation: 'direct', supports: [{ sourceId: 'source-a', evidenceSpanIds: [idsA[0]] }] },
          { text: 'Cron.', role: 'chronology_or_transformation', certainty: 'high', interpretation: 'direct', supports: [{ sourceId: 'source-b', evidenceSpanIds: [idsB[0]] }] },
          { text: 'Func.', role: 'human_agency_or_lived_function', certainty: 'high', interpretation: 'direct', supports: [{ sourceId: 'source-a', evidenceSpanIds: [idsA[0]] }] },
        ],
        authorizedNames: [],
        authorizedNumbers: [],
        discrepancies: [],
        limits: [],
      },
    }));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.value.gates.minimumEvidenceReady).toBe(true);
    expect(result.value.gates.writerReady).toBe(false);
    expect(classifyEvidenceTierV8(result.value.dossier, result.value.gates, [a, b])).toBe('C');
  });

  it('classifies tier D without minimum evidence', () => {
    const a = capture('source-a', 'Texto A.', AUTHORITY_A);
    const spans = spansOf(a);
    const idsA = spans.get('source-a')!.map((span) => span.evidenceSpanId);
    const result = buildValidatedDossierV8(baseInput({
      captures: [a],
      spansBySource: spans,
      curatorOutput: {
        propositions: [
          { text: 'Obs.', role: 'visible_observation', certainty: 'high', interpretation: 'direct', supports: [{ sourceId: 'source-a', evidenceSpanIds: [idsA[0]] }] },
        ],
        authorizedNames: [],
        authorizedNumbers: [],
        discrepancies: [],
        limits: [],
      },
    }));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.value.gates.minimumEvidenceReady).toBe(false);
    expect(classifyEvidenceTierV8(result.value.dossier, result.value.gates, [a])).toBe('D');
  });
});
