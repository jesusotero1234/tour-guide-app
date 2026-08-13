import {
  NarrativeRouteBriefV6,
  narrativeTourFingerprintV6,
} from './NarrativeContractsV6';
import { NarrativeDossierV6 } from './NarrativeDossierV6';
import {
  NARRATIVE_REVIEW_PATCH_SCHEMA_VERSION_V6,
  NarrativeReviewPatchV6,
  prepareNarrativeResumeReviewV6,
} from './NarrativeReviewResumeV6';

const stopIds = ['palace', 'almudena', 'villa', 'mayor', 'sol', 'cibeles', 'alcala'];
const route: NarrativeRouteBriefV6 = {
  schemaVersion: 'narrative-route-brief-v6', caseId: 'madrid-history-es-120',
  city: 'Madrid', country: 'Spain', language: 'es', theme: 'history', durationMinutes: 120,
  fingerprint: 'r'.repeat(64),
  stops: stopIds.map((stopId, position) => ({
    stopId, position, name: stopId, narrativeRole: 'test', wikidataId: `Q${position}`,
    wikidataUrl: `https://www.wikidata.org/wiki/Q${position}`, wikipediaUrl: null,
    coordinates: { lat: 40 + position / 100, lng: -3 },
    previousStopId: stopIds[position - 1] ?? null,
    nextStopId: stopIds[position + 1] ?? null,
  })),
};
const dossiers = stopIds.map((stopId): NarrativeDossierV6 => ({
  stopId, language: 'es', sources: [], passages: [], propositions: [],
  authorizedNames: [], authorizedNumbers: [], discrepancies: [], limits: [],
  sufficiency: {
    isSufficient: true, missingRoles: [], authoritySourceCount: 2, independentPublisherCount: 2,
  },
  fingerprint: stopId.padEnd(64, '0'),
}));
const scripts = stopIds.map((stopId) => ({
  stopId, text: `Estás en ${stopId}. Esta frase permanece intacta.`,
}));
const tourFingerprint = narrativeTourFingerprintV6({
  routeFingerprint: route.fingerprint,
  dossierFingerprints: dossiers.map((dossier) => dossier.fingerprint),
  scripts,
});
const review = { runId: 'original-run', tourFingerprint, scripts };
const patch: NarrativeReviewPatchV6 = {
  schemaVersion: NARRATIVE_REVIEW_PATCH_SCHEMA_VERSION_V6,
  runId: review.runId,
  tourFingerprint,
  replacements: [
    {
      stopId: 'palace', sentenceId: 'palace-S001', before: 'Estás en palace.',
      after: 'Estás ante el palacio.',
    },
    {
      stopId: 'mayor', sentenceId: 'mayor-S001', before: 'Estás en mayor.',
      after: 'Estás en la plaza mayor.',
    },
  ],
};

describe('narrative v6 resumed review boundary', () => {
  it('rejects a mismatched fingerprint or exact before text', () => {
    expect(() => prepareNarrativeResumeReviewV6({
      review,
      patch: { ...patch, tourFingerprint: 'f'.repeat(64) },
      route, dossiers, reviewStopIds: ['palace', 'mayor'],
    })).toThrow('tour fingerprint does not match');
    expect(() => prepareNarrativeResumeReviewV6({
      review,
      patch: {
        ...patch,
        replacements: patch.replacements.map((replacement, index) => (
          index === 0 ? { ...replacement, before: 'Texto incorrecto.' } : replacement
        )),
      },
      route, dossiers, reviewStopIds: ['palace', 'mayor'],
    })).toThrow('before text does not match palace-S001');
  });

  it('patches only the requested stops and preserves the other scripts byte for byte', () => {
    const prepared = prepareNarrativeResumeReviewV6({
      review, patch, route, dossiers, reviewStopIds: ['palace', 'mayor'],
    });

    expect(prepared.scripts.find((script) => script.stopId === 'palace')?.text)
      .toContain('ante el palacio');
    for (const stopId of ['almudena', 'villa', 'sol', 'cibeles', 'alcala']) {
      expect(prepared.scripts.find((script) => script.stopId === stopId)?.text)
        .toBe(scripts.find((script) => script.stopId === stopId)?.text);
    }
    expect(prepared.patchedTourFingerprint).not.toBe(tourFingerprint);
  });

  it('requires the exact seven-stop source set and exact review-stop patch set', () => {
    expect(() => prepareNarrativeResumeReviewV6({
      review: { ...review, scripts: scripts.slice(0, -1) }, patch, route, dossiers,
      reviewStopIds: ['palace', 'mayor'],
    })).toThrow('source review must contain the exact route stop set');
    expect(() => prepareNarrativeResumeReviewV6({
      review, patch, route, dossiers, reviewStopIds: ['palace', 'mayor', 'villa'],
    })).toThrow('review patch must contain the exact route stop set');
  });
});
