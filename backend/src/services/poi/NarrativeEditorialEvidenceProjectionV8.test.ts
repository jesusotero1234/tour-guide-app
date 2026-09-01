import {
  NARRATIVE_EVIDENCE_CONTEXT_SCHEMA_VERSION_V8,
  NARRATIVE_EVIDENCE_MANIFEST_SCHEMA_VERSION_V8,
  NarrativeAdmittedStopV8,
  NarrativeEvidenceManifestV8,
} from './NarrativeEvidenceBoundaryV8';
import {
  buildNarrativeEvidenceFixtureV8,
  NarrativeEvidenceFixtureResultV8,
} from './NarrativeEvidenceFixturesV8.test-support';
import { createNarrativeEditorialRequestProjectorV8 } from './NarrativeEditorialEvidenceProjectionV8';

const COMPLETE_ROLES = [
  'visible_observation',
  'chronology_or_transformation',
  'human_agency_or_lived_function',
  'tension_or_contrast',
  'distinctive_trait',
] as const;

const PARTIAL_ROLES = [
  'visible_observation',
  'chronology_or_transformation',
  'human_agency_or_lived_function',
  'distinctive_trait',
] as const;

function fixture(
  routeStopId: string,
  entityQid: string,
  roles: readonly (typeof COMPLETE_ROLES[number])[]
): NarrativeEvidenceFixtureResultV8 {
  return buildNarrativeEvidenceFixtureV8({
    routeStopId,
    entityQid,
    includedRoles: [...roles],
    sources: [{
      sourceId: `source-${routeStopId}`,
      publisherKey: `publisher-${routeStopId}.example`,
      authorityTier: 'established_source',
    }],
  });
}

function admit(value: NarrativeEvidenceFixtureResultV8): NarrativeAdmittedStopV8 {
  if (value.tier === 'D') throw new Error('fixture must be admitted');
  const evidence = {
    schemaVersion: NARRATIVE_EVIDENCE_CONTEXT_SCHEMA_VERSION_V8,
    routeStopId: value.routeStopId,
    entityQid: value.entityQid,
    evidenceTier: value.tier,
    routeEligible: true as const,
    gates: value.gates,
    dossierFingerprint: value.dossier.fingerprint,
    legacyV6IsSufficient: value.dossier.sufficiency.isSufficient,
  };
  return {
    routeStopId: value.routeStopId,
    entityQid: value.entityQid,
    dossier: value.dossier,
    evidence,
  };
}

function manifestFor(stops: NarrativeAdmittedStopV8[]): NarrativeEvidenceManifestV8 {
  return {
    schemaVersion: NARRATIVE_EVIDENCE_MANIFEST_SCHEMA_VERSION_V8,
    routeFingerprint: 'route-fingerprint',
    stops: stops.map(({ evidence }) => ({
      routeStopId: evidence.routeStopId,
      entityQid: evidence.entityQid,
      evidenceTier: evidence.evidenceTier,
      routeEligible: evidence.routeEligible,
      gates: evidence.gates,
      dossierFingerprint: evidence.dossierFingerprint,
      legacyV6IsSufficient: evidence.legacyV6IsSufficient,
    })),
    fingerprint: 'manifest-fingerprint',
  };
}

describe('NarrativeEditorialEvidenceProjectionV8', () => {
  test('projects a genuine complete C stop without mutating or leaking legacy dossier fields', () => {
    const complete = fixture('malaga-history-stop-03', 'Q3849447', COMPLETE_ROLES);
    expect(complete.tier).toBe('C');
    expect(complete.dossier.sufficiency.isSufficient).toBe(false);
    const original = JSON.stringify(complete.dossier);
    const admitted = admit(complete);
    const manifest = manifestFor([admitted]);

    const projected = createNarrativeEditorialRequestProjectorV8([admitted], manifest)({
      operation: 'write',
      systemPrompt: 'writer-prefix',
      input: {
        stopId: complete.routeStopId,
        dossier: complete.dossier,
        neighboringStops: [],
      },
    });

    const input = projected.input as Record<string, unknown>;
    const dossier = input.dossier as Record<string, unknown>;
    expect(input.routeStopId).toBe('malaga-history-stop-03');
    expect(input.entityQid).toBe('Q3849447');
    expect(input.evidence).toMatchObject({
      evidenceTier: 'C',
      gates: { writerReady: true },
    });
    expect(dossier).not.toHaveProperty('stopId');
    expect(dossier).not.toHaveProperty('sufficiency');
    expect(dossier).not.toHaveProperty('fingerprint');
    expect(dossier).toHaveProperty('propositions');
    expect(projected.systemPrompt).toMatch(/^writer-prefix /);
    expect(projected.systemPrompt).toContain('missingWriterRoles');
    expect(JSON.stringify(complete.dossier)).toBe(original);
    expect(complete.dossier.sufficiency.isSufficient).toBe(false);
  });

  test('carries partial C restrictions into per-stop and tour requests', () => {
    const complete = admit(fixture('malaga-history-stop-03', 'Q3849447', COMPLETE_ROLES));
    const partialFixture = fixture('malaga-history-stop-04', 'Q3849448', PARTIAL_ROLES);
    expect(partialFixture.tier).toBe('C');
    expect(partialFixture.gates.writerReady).toBe(false);
    expect(partialFixture.gates.missingWriterRoles).toContain('tension_or_contrast');
    const partial = admit(partialFixture);
    const admitted = [complete, partial];
    const manifest = manifestFor(admitted);
    const projector = createNarrativeEditorialRequestProjectorV8(admitted, manifest);

    const audit = projector({
      operation: 'audit',
      systemPrompt: 'audit-prefix',
      input: {
        script: { stopId: partial.routeStopId, sentences: [] },
        dossier: partial.dossier,
      },
    });
    expect(audit.input).toMatchObject({
      routeStopId: partial.routeStopId,
      entityQid: partial.entityQid,
      evidence: {
        evidenceTier: 'C',
        gates: {
          writerReady: false,
          missingWriterRoles: expect.arrayContaining(['tension_or_contrast']),
        },
      },
    });

    const tour = projector({
      operation: 'auditTour',
      systemPrompt: 'tour-prefix',
      input: {
        scripts: admitted.map((stop) => ({ stopId: stop.routeStopId, sentences: [] })),
        dossiers: admitted.map((stop) => stop.dossier),
      },
    });
    const tourInput = tour.input as Record<string, unknown>;
    expect(tourInput.evidenceManifest).toBe(manifest);
    expect(tourInput.evidenceByStop).toBe(manifest.stops);
    for (const dossier of tourInput.dossiers as Record<string, unknown>[]) {
      expect(dossier).not.toHaveProperty('stopId');
      expect(dossier).not.toHaveProperty('sufficiency');
      expect(dossier).not.toHaveProperty('fingerprint');
    }
  });

  test('rejects a corrupted manifest before any request projection', () => {
    const admitted = admit(fixture('malaga-history-stop-03', 'Q3849447', COMPLETE_ROLES));
    const manifest = manifestFor([admitted]);
    const corrupted: NarrativeEvidenceManifestV8 = {
      ...manifest,
      stops: [{ ...manifest.stops[0], entityQid: 'Q999999' }],
    };

    expect(() => createNarrativeEditorialRequestProjectorV8([admitted], corrupted))
      .toThrow('evidence manifest mismatch');
  });
});
