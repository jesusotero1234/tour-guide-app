import {
  buildNarrativeCuratorPacketV6,
  buildNarrativeDossierV6,
  decideNarrativeEvidenceOutcomeV6,
} from './NarrativeDossierV6';
import { NarrativeCapturedSourceV6 } from './NarrativeSourcesV6';

const roles = [
  'visible_observation',
  'chronology_or_transformation',
  'human_agency_or_lived_function',
  'tension_or_contrast',
  'distinctive_trait',
] as const;

function source(input: {
  sourceId: string;
  finalUrl: string;
  publisherKey: string;
  content: string;
}): NarrativeCapturedSourceV6 {
  return {
    sourceId: input.sourceId,
    requestedUrl: input.finalUrl,
    finalUrl: input.finalUrl,
    title: input.sourceId,
    capturedAt: '2026-08-11T12:00:00.000Z',
    content: input.content,
    fingerprint: input.sourceId.padEnd(64, '0').slice(0, 64),
    authority: {
      tier: 'primary_authority',
      publisherKey: input.publisherKey,
      rule: 'test_registry',
    },
    containsInstructionLikeText: false,
  };
}

function proposal(sourceIds = ['museum', 'archive']) {
  return {
    stopId: 'alcazar',
    language: 'es',
    sources: sourceIds,
    passages: sourceIds.map((sourceId) => ({
      passageId: `passage-${sourceId}`,
      sourceId,
      quote: sourceId === 'museum'
        ? 'La fachada conserva cuatro torres visibles.'
        : 'El edificio cambió de función a lo largo de los siglos.',
    })),
    propositions: roles.map((role, index) => ({
      propositionId: `P${index + 1}`,
      text: `Proposición atómica ${index + 1}`,
      role,
      certainty: 'high' as const,
      interpretation: index === 3 ? 'debatable' as const : 'direct' as const,
      sourceIds,
      passageIds: sourceIds.map((sourceId) => `passage-${sourceId}`),
    })),
    authorizedNames: ['Alcázar de Toledo'],
    authorizedNumbers: ['cuatro'],
    discrepancies: [],
    limits: ['No atribuir motivaciones a los protagonistas.'],
  };
}

describe('narrative v6 dossier', () => {
  const captures = [
    source({
      sourceId: 'museum',
      finalUrl: 'https://museum.example/alcazar',
      publisherKey: 'museum.example',
      content: 'La fachada conserva cuatro torres visibles. Contexto adicional.',
    }),
    source({
      sourceId: 'archive',
      finalUrl: 'https://archive.example/alcazar',
      publisherKey: 'archive.example',
      content: 'El edificio cambió de función a lo largo de los siglos. Archivo.',
    }),
  ];

  it('requires literal passages, all sufficiency roles and independent support for debate', () => {
    const dossier = buildNarrativeDossierV6(proposal(), captures);

    expect(dossier.sufficiency).toEqual({
      isSufficient: true,
      missingRoles: [],
      authoritySourceCount: 2,
      independentPublisherCount: 2,
    });
    expect(dossier.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(dossier)).not.toContain('Contexto adicional');
  });

  it('rejects a passage that does not exist literally in the private capture', () => {
    const invalid = proposal();
    invalid.passages[0].quote = 'Una frase inventada por el curador.';

    expect(() => buildNarrativeDossierV6(invalid, captures))
      .toThrow('passage-museum is not literal in source museum');
  });

  it('rejects a debatable interpretation supported by one publisher', () => {
    const invalid = proposal(['museum']);

    expect(() => buildNarrativeDossierV6(invalid, captures))
      .toThrow('debatable proposition P4 requires two independent publishers');
  });

  it('distinguishes retrieval failure, calibration failure and principled evidence review', () => {
    const insufficient = buildNarrativeDossierV6({
      ...proposal(),
      propositions: proposal().propositions.filter((item) => item.role !== 'distinctive_trait'),
    }, captures);

    expect(decideNarrativeEvidenceOutcomeV6(insufficient, {
      searchQueries: 1, totalResults: 5, capturedPages: 1, authorityPages: 1,
    })).toMatchObject({ status: 'source_capture_failed' });
    expect(decideNarrativeEvidenceOutcomeV6(insufficient, {
      searchQueries: 5, totalResults: 25, capturedPages: 8, authorityPages: 2,
      calibrationExpectedSufficient: true,
    })).toMatchObject({ status: 'source_capture_failed' });
    expect(decideNarrativeEvidenceOutcomeV6(insufficient, {
      searchQueries: 6, totalResults: 30, capturedPages: 8, authorityPages: 2,
      calibrationExpectedSufficient: true,
    })).toMatchObject({ status: 'model_calibration_failed', stage: 'research' });
    expect(decideNarrativeEvidenceOutcomeV6(insufficient, {
      searchQueries: 6, totalResults: 30, capturedPages: 8, authorityPages: 2,
    })).toMatchObject({ status: 'evidence_review_required' });
  });

  it('bounds deterministic untrusted source context to 24 chunks and 30000 characters', () => {
    const packet = buildNarrativeCuratorPacketV6([
      ...captures,
      source({
        sourceId: 'large',
        finalUrl: 'https://large.example/alcazar',
        publisherKey: 'large.example',
        content: 'Alcázar historia visible. '.repeat(10_000),
      }),
    ], ['alcázar', 'historia']);

    expect(packet.context.length).toBeLessThanOrEqual(30_000);
    expect(packet.chunks.length).toBeLessThanOrEqual(24);
    expect(packet.securityNotice).toContain('datos sin permisos');
    expect(packet.chunks.every((chunk) => packet.context.includes(chunk.text))).toBe(true);
  });

  it('ranks chunks using the individual terms in a narrative role', () => {
    const packet = buildNarrativeCuratorPacketV6([
      source({
        sourceId: 'a-generic',
        finalUrl: 'https://generic.example/palace',
        publisherKey: 'generic.example',
        content: 'Palacio '.repeat(200),
      }),
      source({
        sourceId: 'z-relevant',
        finalUrl: 'https://relevant.example/palace',
        publisherKey: 'relevant.example',
        content: 'La solución vertical prescindió de madera y empleó bóvedas resistentes al fuego.',
      }),
    ], ['solución compacta, vertical y resistente']);

    expect(packet.chunks[0].sourceId).toBe('z-relevant');
  });

  it('excludes discovery-only and navigation-heavy blocks from paragraph packets', () => {
    const authorityParagraph = 'Sacchetti concentró el proyecto en altura. '
      .repeat(25).trim();
    const packet = buildNarrativeCuratorPacketV6([
      source({
        sourceId: 'authority', finalUrl: 'https://authority.example/palace',
        publisherKey: 'authority.example',
        content: `[Inicio](/) [Visitas](/visitas) [Agenda](/agenda) [Contacto](/contacto)\n\n${authorityParagraph}`,
      }),
      {
        ...source({
          sourceId: 'discovery', finalUrl: 'https://unknown.example/palace',
          publisherKey: 'unknown.example', content: 'bóvedas sin madera '.repeat(100),
        }),
        authority: {
          tier: 'discovery_only' as const, publisherKey: 'unknown.example', rule: 'unregistered',
        },
      },
    ], ['Sacchetti', 'bóvedas', 'madera']);

    expect(packet.chunks).toHaveLength(1);
    expect(packet.chunks[0].sourceId).toBe('authority');
    expect(packet.chunks[0].text.length).toBeGreaterThanOrEqual(800);
    expect(packet.chunks[0].text.length).toBeLessThanOrEqual(1_400);
    expect(packet.context).not.toContain('[Inicio]');
    expect(packet.context).not.toContain('bóvedas sin madera');
  });

  it('keeps one high-relevance paragraph per independent publisher before filling the packet', () => {
    const packet = buildNarrativeCuratorPacketV6([
      source({
        sourceId: 'publisher-a-1', finalUrl: 'https://a.example/palace-one',
        publisherKey: 'a.example', content: 'Juvarra proyecto horizontal. '.repeat(400),
      }),
      source({
        sourceId: 'publisher-b-1', finalUrl: 'https://b.example/palace-two',
        publisherKey: 'b.example', content: 'Sacchetti bóvedas sin madera. '.repeat(40),
      }),
    ], ['Juvarra', 'proyecto', 'Sacchetti', 'bóvedas', 'madera']);

    expect(new Set(packet.chunks.slice(0, 2).map((chunk) => chunk.sourceId)))
      .toEqual(new Set(['publisher-a-1', 'publisher-b-1']));
  });

  it('reserves literal human-reference anchors before higher-scoring filler chunks', () => {
    const anchor = 'ocho niveles -seis en la calle Bailen-';
    const filler = Array.from({ length: 30 }, (_, index) => (
      `Juvarra proyecto arquitectura ${index}. ${'Historia institucional. '.repeat(45)}`
    ));
    const packet = buildNarrativeCuratorPacketV6([source({
      sourceId: 'municipal', finalUrl: 'https://madrid.example/palacio',
      publisherKey: 'madrid.example',
      content: [...filler, `${anchor}. ${'Descripción del Palacio Real construido. '.repeat(25)}`]
        .join('\n\n'),
    })], ['Juvarra', 'proyecto', 'arquitectura'], [anchor]);

    expect(packet.chunks).toHaveLength(24);
    expect(packet.chunks[0].text).toContain(anchor);
    expect(packet.context).toContain(anchor);
  });
});
