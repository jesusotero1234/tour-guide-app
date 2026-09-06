import { createTourBlueprintSnapshot, TourBlueprintSnapshot } from './TourBlueprint';
import { TourDestination } from './TourDestinationResolver';
import { buildNarrativeEvidenceFixtureV8 } from './poi/NarrativeEvidenceFixturesV8.test-support';
import { buildNarrativeDossierV6 } from './poi/NarrativeDossierV6';
import { assessNarrativeEvidenceGatesV8, classifyEvidenceTierV8, finalizeNarrativeDossierV8 } from './poi/NarrativeDossierV8';
import { buildNarrativeEvidenceBoundaryV8, NarrativeResearchHandoffStopV8 } from './poi/NarrativeEvidenceBoundaryV8';
import { narrativeFingerprintV6, NarrativeRouteBriefV6 } from './poi/NarrativeContractsV6';
import { narrationTargetForSecondsV8 } from './poi/NarrativeDurationTargetsV8';
import { RESEARCH_POLICY_VERSION } from './tourReadiness/TourLanguage';
import { TourRequest } from '../types/api';

export const madridDestination: TourDestination = {
  qid: 'Q2807', city: 'Madrid', country: 'Spain', countryCode: 'ES',
  researchLanguages: ['es', 'en'], policyVersion: RESEARCH_POLICY_VERSION,
};
export function blueprintFixture(destination = madridDestination): TourBlueprintSnapshot {
  const ids = ['Q1', 'Q2'];
  const routeData = {
    schemaVersion: 'narrative-route-brief-v6' as const, caseId: 'multilingual-fixture',
    city: destination.city, country: destination.country, theme: 'history',
    language: destination.researchLanguages[0], durationMinutes: 120,
    stops: ids.map((id, position) => ({
      stopId: id, wikidataId: id, name: 'Monumento ' + (position + 1), position,
      narrativeRole: 'history', wikidataUrl: 'https://www.wikidata.org/wiki/' + id,
      wikipediaUrl: null, coordinates: { lat: 40.4 + position * 0.001, lng: -3.7 },
      previousStopId: ids[position - 1] ?? null, nextStopId: ids[position + 1] ?? null,
    })),
  };
  const route: NarrativeRouteBriefV6 = { ...routeData, fingerprint: narrativeFingerprintV6(routeData) };
  const research: NarrativeResearchHandoffStopV8[] = ids.map(id => {
    const fixture = buildNarrativeEvidenceFixtureV8({
      routeStopId: id, entityQid: id,
      includedRoles: ['visible_observation', 'chronology_or_transformation', 'human_agency_or_lived_function', 'tension_or_contrast', 'distinctive_trait'],
      sources: [{ sourceId: id + '-official', publisherKey: 'official.example', authorityTier: 'primary_authority' },
        { sourceId: id + '-museum', publisherKey: 'museum.example', authorityTier: 'established_source' }],
    });
    const captures = fixture.captures.map((c, index) => ({ ...c, sourceLanguage: 'es',
      ...(index === 0 ? { referenceProvenance: {
        wikipediaSourceId: id + '-wiki', wikipediaUrl: 'https://es.wikipedia.org/wiki/' + id,
        revisionId: 12345, citationUrl: c.finalUrl, citationTitle: 'Citation ' + id,
      } } : {}),
    }));
    const { fingerprint, sufficiency, sources, ...proposal } = fixture.dossier;
    const dossier = finalizeNarrativeDossierV8(buildNarrativeDossierV6({ ...proposal, language: route.language,
      sources: captures.map(c => c.sourceId) }, captures), captures);
    const gates = assessNarrativeEvidenceGatesV8(dossier, id);
    const evidenceTier = classifyEvidenceTierV8(dossier, gates, captures);
    if (evidenceTier === 'D') throw new Error('Invalid fixture');
    return { routeStopId: id, entityQid: id, result: {
      status: 'sufficient', stopId: id, dossier, gates, evidenceTier, routeEligible: true,
      stats: { searchQueries: 0, searchQueryAttempts: 0, searchQuerySuccesses: 0, mapAttempts: 0, mapSuccesses: 0,
        webCaptureAttempts: 0, webCaptureResponses: 0, infrastructureFailureCount: 0, mappedUrlCount: 0,
        attemptedUrlCount: 0, capturedSourceCount: 2, publisherCount: 2, curationCount: 1 },
      captures, captureLog: [],
    } };
  });
  const boundary = buildNarrativeEvidenceBoundaryV8(route, research);
  if (boundary.status !== 'ready') throw new Error('Invalid boundary fixture');
  return createTourBlueprintSnapshot({
    destination,
    checkpoint: {
      route, research, evidenceManifest: boundary.manifest, narrationTargets: ids.map(id => narrationTargetForSecondsV8(id, 180)),
      arc: { promise: 'Comprender los cambios de la ciudad.', centralQuestion: '¿Cómo cambió este lugar?',
        stops: ids.map(id => ({ stopId: id, contribution: 'Una transformación documentada.',
          bridge: 'Continuamos el recorrido.', contributionPropositionIds: ['prop-visible_observation'],
          bridgePropositionIds: ['prop-visible_observation'] })) },
    },
    geometry: { status: 'walkable', reason: null, blocks: [{ stopIds: ids }],
      legs: [{ type: 'walking', fromStopId: ids[0], toStopId: ids[1], durationSeconds: 300 }],
      guidedDurationMinutes: 100, requestedDuration: 120, externalTransferTimeIncluded: false,
      transferCount: 0, timingSource: 'walking_graph', durationFit: 'within_target' },
  });
}
export function narratedFixture(snapshot: TourBlueprintSnapshot, request: TourRequest, runId: string) {
  return {
    review: { runId, request, writerTransport: 'codex', boundaryMigrationPassed: true,
      blueprintFingerprint: snapshot.fingerprint, route: { stops: snapshot.checkpoint.route.stops }, geometry: snapshot.geometry },
    author: { status: 'complete_needs_review', publicationPassed: false, missingStopIds: [],
      stops: snapshot.checkpoint.route.stops.map(stop => ({
        stopId: stop.stopId, status: 'audited',
        script: { stopId: stop.stopId, text: request.language === 'fr' ? 'Cette façade possède quatre tours.' : 'La fachada tiene cuatro torres.',
          sentences: [{ sentenceId: stop.stopId + '-s1' }] },
        audit: { status: 'valid', value: {
          findings: [{ sentenceId: stop.stopId + '-s1', classification: 'supported', reason: 'Fixture source' }],
          languageReview: { matchesRequestedLanguage: true, naturalForListening: true, issues: [] },
        } },
      })) },
  };
}
