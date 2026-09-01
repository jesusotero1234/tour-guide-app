import {
  reviewNarrativeTourScorecardV6Core,
} from './NarrativeEditorialAgentsV6';
import { NarrativeScriptV6 } from './NarrativeEditorialV6';
import {
  NARRATIVE_EVIDENCE_CONTEXT_SCHEMA_VERSION_V8,
  NARRATIVE_EVIDENCE_MANIFEST_SCHEMA_VERSION_V8,
  NarrativeAdmittedStopV8,
  NarrativeEvidenceManifestV8,
} from './NarrativeEvidenceBoundaryV8';
import { buildNarrativeEvidenceFixtureV8 } from './NarrativeEvidenceFixturesV8.test-support';
import { reviewNarrativeTourScorecardV8 } from './NarrativeTourScorecardV8';

jest.mock('./NarrativeEditorialAgentsV6', () => ({
  reviewNarrativeTourScorecardV6Core: jest.fn(),
}));

const coreMock = reviewNarrativeTourScorecardV6Core as jest.MockedFunction<
  typeof reviewNarrativeTourScorecardV6Core
>;

function completeC(): {
  admitted: NarrativeAdmittedStopV8;
  manifest: NarrativeEvidenceManifestV8;
  script: NarrativeScriptV6;
} {
  const fixture = buildNarrativeEvidenceFixtureV8({
    routeStopId: 'malaga-scorecard-stop-03',
    entityQid: 'Q3849447',
    includedRoles: [
      'visible_observation',
      'chronology_or_transformation',
      'human_agency_or_lived_function',
      'tension_or_contrast',
      'distinctive_trait',
    ],
    sources: [{
      sourceId: 'scorecard-established',
      publisherKey: 'scorecard.example',
      authorityTier: 'established_source',
    }],
  });
  if (fixture.tier !== 'C') throw new Error(`expected C fixture, got ${fixture.tier}`);

  const admitted: NarrativeAdmittedStopV8 = {
    routeStopId: fixture.routeStopId,
    entityQid: fixture.entityQid,
    dossier: fixture.dossier,
    evidence: {
      schemaVersion: NARRATIVE_EVIDENCE_CONTEXT_SCHEMA_VERSION_V8,
      routeStopId: fixture.routeStopId,
      entityQid: fixture.entityQid,
      evidenceTier: fixture.tier,
      routeEligible: true,
      gates: fixture.gates,
      dossierFingerprint: fixture.dossier.fingerprint,
      legacyV6IsSufficient: fixture.dossier.sufficiency.isSufficient,
    },
  };
  const manifest: NarrativeEvidenceManifestV8 = {
    schemaVersion: NARRATIVE_EVIDENCE_MANIFEST_SCHEMA_VERSION_V8,
    routeFingerprint: 'scorecard-route-fingerprint',
    stops: [{
      routeStopId: admitted.routeStopId,
      entityQid: admitted.entityQid,
      evidenceTier: admitted.evidence.evidenceTier,
      routeEligible: true,
      gates: admitted.evidence.gates,
      dossierFingerprint: admitted.evidence.dossierFingerprint,
      legacyV6IsSufficient: admitted.evidence.legacyV6IsSufficient,
    }],
    fingerprint: 's'.repeat(64),
  };
  const script: NarrativeScriptV6 = {
    stopId: admitted.routeStopId,
    text: 'Texto respaldado.',
    sentences: [{
      sentenceId: `${admitted.routeStopId}-S001`,
      stopId: admitted.routeStopId,
      index: 0,
      text: 'Texto respaldado.',
    }],
    fingerprint: 't'.repeat(64),
  };
  return { admitted, manifest, script };
}

describe('NarrativeTourScorecardV8', () => {
  beforeEach(() => {
    coreMock.mockReset();
  });

  test('projects admitted C evidence and returns the exact manifest', async () => {
    const { admitted, manifest, script } = completeC();
    const original = JSON.stringify(admitted.dossier);
    let projectedInput: unknown = null;
    coreMock.mockImplementation(async (_options, input, _request, projector) => {
      projectedInput = projector(input);
      const value = {
        decision: 'Approve' as const,
        overallBand: 'Excellent' as const,
        weightedScore: 10,
        dimensions: {
          accuracyGrounding: { score: 10 as const, rationale: 'Correcto.', sentenceIds: [script.sentences[0].sentenceId] },
          narrativeArcTransitions: { score: 10 as const, rationale: 'Correcto.', sentenceIds: [script.sentences[0].sentenceId] },
          oralClarityRhythm: { score: 10 as const, rationale: 'Correcto.', sentenceIds: [script.sentences[0].sentenceId] },
          placeObservationSafety: { score: 10 as const, rationale: 'Correcto.', sentenceIds: [script.sentences[0].sentenceId] },
          styleRepetitionClosing: { score: 10 as const, rationale: 'Correcto.', sentenceIds: [script.sentences[0].sentenceId] },
        },
        polishNotes: [],
        objections: [],
      };
      return {
        value,
        diagnostic: {
          callId: 'scorecard-v8-test',
          status: 'valid' as const,
          value,
          attempts: [{
            attempt: 1,
            status: 'valid' as const,
            latencyMs: 1,
            rawOutput: '{}',
            error: null,
          }],
          model: 'fake',
          promptFingerprint: 'p',
          responseFingerprint: 'r',
          inputCharacters: 1,
          schemaCharacters: 1,
          input: {},
          rawOutput: '{}',
        },
      };
    });

    const result = await reviewNarrativeTourScorecardV8({}, {
      promise: 'Promesa.',
      scripts: [script],
      admittedStops: [admitted],
      evidenceManifest: manifest,
    });

    expect(result.evidenceManifest).toBe(manifest);
    const projected = projectedInput as Record<string, unknown>;
    expect(projected.evidenceManifest).toBe(manifest);
    expect(projected.evidenceByStop).toBe(manifest.stops);
    const dossier = (projected.dossiers as Record<string, unknown>[])[0];
    expect(dossier).not.toHaveProperty('stopId');
    expect(dossier).not.toHaveProperty('sufficiency');
    expect(dossier).not.toHaveProperty('fingerprint');
    expect(admitted.dossier.sufficiency.isSufficient).toBe(false);
    expect(JSON.stringify(admitted.dossier)).toBe(original);
  });

  test('rejects mismatched script identity before the V6 core', async () => {
    const { admitted, manifest, script } = completeC();
    await expect(reviewNarrativeTourScorecardV8({}, {
      promise: 'Promesa.',
      scripts: [{ ...script, stopId: 'wrong-route-stop' }],
      admittedStops: [admitted],
      evidenceManifest: manifest,
    })).rejects.toThrow('scorecard scripts/admitted stops mismatch');
    expect(coreMock).not.toHaveBeenCalled();
  });
});
