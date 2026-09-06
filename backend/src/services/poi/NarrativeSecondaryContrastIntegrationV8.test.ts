import { NarrativeCuratorOutputV8, buildValidatedDossierV8, normalizeNarrativeCuratorOutputV8,
  assessNarrativeEvidenceGatesV8, classifyEvidenceTierV8 } from './NarrativeDossierV8';
import { NarrativeCapturedSourceV8 } from './NarrativeSourcesV7';
import { segmentCaptureIntoSpansV7 } from './NarrativeSpansV7';
import { buildNarrativeEvidenceBoundaryV8 } from './NarrativeEvidenceBoundaryV8';
import { NarrativeRouteBriefV6, narrativeFingerprintV6 } from './NarrativeContractsV6';

const comparison = 'Se distingue porque está separada de la iglesia o catedral, en contraste con otros campanarios integrados en el mismo edificio eclesiástico.';
const quote = 'Se caracteriza porque está separada de la catedral, a diferencia de otros campanarios que se encuentran integrados en el mismo edificio eclesiástico.';
const coverage = { left: 'está separada', right: 'integrados en el mismo edificio eclesiástico' };

function fixture() {
  const content = [
    'La torre se encuentra junto a una amplia plaza del centro histórico de la ciudad.',
    'La construcción del monumento se desarrolló en varias etapas y tuvo una larga paralización.',
    'La torre fue un proyecto municipal utilizado para comunicar los avisos a los habitantes.',
    quote,
  ].join('\n\n');
  const wiki: NarrativeCapturedSourceV8 = {
    sourceId: 'wiki', requestedUrl: 'https://es.wikipedia.org/wiki/Monumento', finalUrl: 'https://es.wikipedia.org/wiki/Monumento',
    title: 'Monumento', content, capturedAt: '2026-09-06T00:00:00Z', fingerprint: 'wiki-fingerprint',
    authority: { tier: 'established_source', publisherKey: 'wikimedia', rule: 'wikimedia_qid_match' },
    containsInstructionLikeText: false, finalHttpStatus: 200, sourceKind: 'wikipedia_api', entityQid: 'Q1', publisherKey: 'wikimedia',
  };
  const spans = segmentCaptureIntoSpansV7(wiki).spans;
  const output: NarrativeCuratorOutputV8 = { propositions: spans.map((span, index) => ({
    text: index === 3 ? comparison : span.text,
    role: (['visible_observation', 'chronology_or_transformation', 'human_agency_or_lived_function', 'distinctive_trait'] as const)[index],
    certainty: 'high', interpretation: 'direct',
    supports: [{ sourceId: wiki.sourceId, evidenceSpanIds: [span.evidenceSpanId] }],
  })), authorizedNames: [], authorizedNumbers: [], discrepancies: [], limits: [] };
  return { wiki, output };
}

function run(output: NarrativeCuratorOutputV8, captures: NarrativeCapturedSourceV8[]) {
  const spansBySource = new Map(captures.map(c => [c.sourceId, segmentCaptureIntoSpansV7(c).spans]));
  const normalized = normalizeNarrativeCuratorOutputV8({ output, captures, spansBySource });
  const result = buildValidatedDossierV8({ stopId: 'Q1', stopName: 'Monumento', qid: 'Q1', language: 'es',
    curatorOutput: normalized.output, captures, spansBySource, admissionMode: 'independent' });
  if (result.status !== 'ok') throw new Error(result.reason);
  return result.value;
}

describe('narrow explicit secondary contrast integration', () => {
  it('covers only the missing contrast without relabelling or duplicating the fact', () => {
    const { wiki, output } = fixture();
    const before = run(output, [wiki]);
    output.propositions[3].secondaryContrast = coverage;
    const snapshot = JSON.stringify(output);
    const after = run(output, [wiki]);
    expect(before.gates.missingWriterRoles).toEqual(['tension_or_contrast']);
    expect(after.gates.writerReady).toBe(true);
    expect(after.dossier.propositions).toHaveLength(before.dossier.propositions.length);
    expect(after.dossier.propositions.map(p => [p.propositionId, p.role, p.text, p.passageIds, p.sourceIds]))
      .toEqual(before.dossier.propositions.map(p => [p.propositionId, p.role, p.text, p.passageIds, p.sourceIds]));
    expect(after.dossier.passages).toEqual(before.dossier.passages);
    expect(after.dossier.sources).toEqual(before.dossier.sources);
    expect(after.dossier.sufficiency).toEqual(before.dossier.sufficiency); // legacy V6 stays unchanged
    expect(JSON.stringify(output)).toBe(snapshot);
  });

  it('keeps a full ready dossier byte-for-byte unchanged even if redundant coverage is supplied', () => {
    const { wiki, output } = fixture();
    output.propositions.push({ ...output.propositions[3], role: 'tension_or_contrast' });
    const before = run(output, [wiki]);
    output.propositions[3].secondaryContrast = coverage;
    const after = run(output, [wiki]);
    expect(after).toEqual(before);
    expect(after.dossier.fingerprint).toBe(before.dossier.fingerprint);
  });

  it('does not cover contrast automatically or repair any other missing role', () => {
    const { wiki, output } = fixture();
    expect(run(output, [wiki]).gates.writerReady).toBe(false);
    output.propositions[3].secondaryContrast = coverage;
    output.propositions = output.propositions.filter(p => p.role !== 'human_agency_or_lived_function');
    const result = run(output, [wiki]);
    expect(result.gates.missingWriterRoles).toEqual(['human_agency_or_lived_function', 'tension_or_contrast']);
    expect(result.dossier.propositions.every(p => p.secondaryContrast === undefined)).toBe(true);
  });

  it.each([null, { left: 'una torre única', right: coverage.right }, { ...coverage, extra: true }])('ignores invalid coverage without rejecting the otherwise valid fact: %j', invalid => {
    const { wiki, output } = fixture();
    const before = run(output, [wiki]);
    output.propositions[3].secondaryContrast = invalid as typeof coverage;
    expect(run(output, [wiki])).toEqual(before);
  });

  it('cannot use coverage from a rejected proposition', () => {
    const { wiki, output } = fixture();
    output.propositions.push({ ...output.propositions[3], text: 'Un hecho sin soporte.',
      secondaryContrast: coverage, supports: [{ sourceId: 'wiki', evidenceSpanIds: ['missing'] }] });
    expect(run(output, [wiki]).gates.writerReady).toBe(false);
  });

  it('revalidates coverage against this proposition citations after serialization', () => {
    const { wiki, output } = fixture();
    output.propositions[3].secondaryContrast = coverage;
    const result = run(output, [wiki]);
    const restored = JSON.parse(JSON.stringify(result.dossier));
    expect(assessNarrativeEvidenceGatesV8(restored, 'Q1')).toEqual(result.gates);
    restored.propositions[3].passageIds = [restored.propositions[0].passageIds[0]];
    expect(assessNarrativeEvidenceGatesV8(restored, 'Q1').writerReady).toBe(false);
  });

  it('survives the evidence handoff including the existing Wikipedia reference provenance', () => {
    const { wiki, output } = fixture();
    const museum: NarrativeCapturedSourceV8 = { ...wiki, sourceId: 'museum', requestedUrl: 'https://museum.es/monumento', finalUrl: 'https://museum.es/monumento',
      sourceKind: 'other_web', entityQid: null, publisherKey: 'museum.es',
      authority: { tier: 'established_source', publisherKey: 'museum.es', rule: 'wikipedia_citation_identity_verified' },
      referenceProvenance: { wikipediaSourceId: 'wiki', wikipediaUrl: wiki.finalUrl, revisionId: 1, citationUrl: 'https://museum.es/monumento', citationTitle: 'Monumento' } };
    output.propositions[0].supports = [{ sourceId: 'museum', evidenceSpanIds: [segmentCaptureIntoSpansV7(museum).spans[0].evidenceSpanId] }];
    output.propositions[3].secondaryContrast = coverage;
    const captures = [wiki, museum], admitted = run(output, captures);
    const dossier = admitted.dossier;
    const route: NarrativeRouteBriefV6 = { schemaVersion: 'narrative-route-brief-v6', caseId: 'contrast-test',
      city: 'Ciudad', country: 'España', language: 'es', theme: 'history', durationMinutes: 60,
      stops: [{ stopId: 'Q1', position: 0, name: 'Monumento', narrativeRole: 'opening', wikidataId: 'Q1',
        wikidataUrl: 'https://www.wikidata.org/wiki/Q1', wikipediaUrl: null, coordinates: { lat: 40, lng: -3 },
        previousStopId: null, nextStopId: null }], fingerprint: 'route-test' };
    const tier = classifyEvidenceTierV8(dossier, admitted.gates, captures);
    if (tier === 'D') throw new Error('fixture unexpectedly blocked');
    const result = buildNarrativeEvidenceBoundaryV8(route, [{ routeStopId: 'Q1', entityQid: 'Q1',
      result: { status: 'sufficient', stopId: 'Q1', routeEligible: true, evidenceTier: tier, dossier, gates: admitted.gates, captures, captureLog: [],
        stats: { searchQueries: 0, searchQueryAttempts: 0, searchQuerySuccesses: 0, mapAttempts: 0, mapSuccesses: 0,
          webCaptureAttempts: 0, webCaptureResponses: 0, infrastructureFailureCount: 0, mappedUrlCount: 0,
          attemptedUrlCount: 0, capturedSourceCount: 2, publisherCount: 2, curationCount: 2 } } }]);
    expect(result.status).toBe('ready');
    expect(dossier.sufficiency.independentPublisherCount).toBe(1);
    const { fingerprint, ...body } = dossier;
    expect(fingerprint).toBe(narrativeFingerprintV6(body));
  });
});
