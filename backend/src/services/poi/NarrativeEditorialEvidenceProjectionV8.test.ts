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
import { buildNarrativeDossierV6 } from './NarrativeDossierV6';
import { createNarrativeEditorialRequestProjectorV8 } from './NarrativeEditorialEvidenceProjectionV8';
import type { NarrativeArcV8 } from './NarrativeArcArchitectV8';

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

function arcFor(admittedStops: NarrativeAdmittedStopV8[]): NarrativeArcV8 {
  return {
    promise: 'test-promise',
    centralQuestion: 'test-question',
    stops: admittedStops.map((stop, i) => {
      const nextStop = admittedStops[i + 1];
      const currentIds = new Set(stop.dossier.propositions.map((p) => p.propositionId));
      const nextPropositionId = nextStop
        ? nextStop.dossier.propositions.find((p) => !currentIds.has(p.propositionId))?.propositionId
        : undefined;
      const bridgePropositionId = nextPropositionId ?? stop.dossier.propositions[0].propositionId;
      return {
        stopId: stop.routeStopId,
        contribution: `contribution-${stop.routeStopId}`,
        bridge: `bridge-${stop.routeStopId}`,
        contributionPropositionIds: [stop.dossier.propositions[0].propositionId],
        bridgePropositionIds: [bridgePropositionId],
      };
    }),
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

    const projected = createNarrativeEditorialRequestProjectorV8([admitted], manifest, arcFor([admitted]))({
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
    expect(dossier).not.toHaveProperty('sources');
    expect(dossier).not.toHaveProperty('passages');
    expect(dossier).toHaveProperty('propositions');
    const arcContext = input.arcContext as Record<string, unknown>;
    expect(arcContext.contribution).toBe(arcFor([admitted]).stops[0].contribution);
    expect(arcContext.bridge).toBe(arcFor([admitted]).stops[0].bridge);
    const authorizedEvidence = input.authorizedEvidence as Record<string, unknown>;
    expect(authorizedEvidence).toHaveProperty('localPropositions');
    expect(authorizedEvidence).toHaveProperty('contributionPropositions');
    expect(authorizedEvidence).toHaveProperty('bridgePropositions');
    expect((authorizedEvidence.localPropositions as unknown[]).length).toBeGreaterThan(0);
    expect((authorizedEvidence.contributionPropositions as unknown[]).length).toBeGreaterThan(0);
    expect((authorizedEvidence.bridgePropositions as unknown[]).length).toBeGreaterThan(0);
    expect(projected.systemPrompt).toMatch(/^writer-prefix /);
    expect(projected.systemPrompt).toContain('missingWriterRoles');
    expect(JSON.stringify(complete.dossier)).toBe(original);
    expect(complete.dossier.sufficiency.isSufficient).toBe(false);
  });

  test('projects an explicit immersive narration target into the write request', () => {
    const narrationFixture = fixture('malaga-history-stop-05', 'Q3849449', COMPLETE_ROLES);
    expect(narrationFixture.tier).toBe('C');
    const narrationAdmitted = admit(narrationFixture);
    const narrationManifest = manifestFor([narrationAdmitted]);
    const narrationTarget = {
      stopId: narrationFixture.routeStopId,
      targetSeconds: 360,
      targetWords: 840,
      minPropositions: 10,
      maxPropositions: 14,
      minVisualAnchors: 3,
    };
    const narrationTargets = new Map([[narrationFixture.routeStopId, narrationTarget]]);
    const projector = createNarrativeEditorialRequestProjectorV8(
      [narrationAdmitted],
      narrationManifest,
      arcFor([narrationAdmitted]),
      narrationTargets
    );

    const projected = projector({
      operation: 'write',
      systemPrompt: 'writer-prefix',
      input: {
        stopId: narrationFixture.routeStopId,
        dossier: narrationFixture.dossier,
        neighboringStops: [],
      },
    });

    const input = projected.input as Record<string, unknown>;
    expect(input.narrationTarget).toEqual(narrationTarget);
    expect(projected.systemPrompt).toContain('840 palabras');
    expect(projected.systemPrompt).toContain('360 segundos');
    expect(projected.systemPrompt).toContain('orientación visible');
    expect(projected.systemPrompt).toContain('cambio temporal');
    expect(projected.systemPrompt).toContain('vida humana');
    expect(projected.systemPrompt).toContain('contraste/significado');
    expect(projected.systemPrompt).toContain('transición');
  });

  test('carries partial C restrictions into per-stop and tour requests', () => {
    const partialFixture = fixture('malaga-history-stop-04', 'Q3849448', PARTIAL_ROLES);
    expect(partialFixture.tier).toBe('C');
    expect(partialFixture.gates.writerReady).toBe(false);
    expect(partialFixture.gates.missingWriterRoles).toContain('tension_or_contrast');
    const partial = admit(partialFixture);
    const complete = admit(fixture('malaga-history-stop-03', 'Q3849447', COMPLETE_ROLES));
    const admitted = [partial, complete];
    const manifest = manifestFor(admitted);
    const projector = createNarrativeEditorialRequestProjectorV8(admitted, manifest, arcFor(admitted));

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
    const auditDossier = (audit.input as Record<string, unknown>).dossier as Record<string, unknown>;
    expect(auditDossier).toHaveProperty('sources');
    expect(auditDossier).toHaveProperty('passages');
    expect(auditDossier).not.toHaveProperty('stopId');
    expect(auditDossier).not.toHaveProperty('sufficiency');
    expect(auditDossier).not.toHaveProperty('fingerprint');
    expect(audit.input).toHaveProperty('authorizedEvidence');
    const auditAuthorizedEvidence = (audit.input as Record<string, unknown>).authorizedEvidence as Record<string, unknown>;
    const auditBridgePropositions = auditAuthorizedEvidence.bridgePropositions as Record<string, unknown>[];
    expect(auditBridgePropositions.length).toBeGreaterThan(0);
    expect(auditBridgePropositions[0].ownerRouteStopId).toBe(complete.routeStopId);
    expect(auditBridgePropositions[0].entityQid).toBe(complete.entityQid);

    const repair = projector({
      operation: 'repair',
      systemPrompt: 'repair-prefix',
      input: {
        script: { stopId: partial.routeStopId, sentences: [] },
        objections: [],
        adjudications: [],
        dossier: partial.dossier,
      },
    });
    const repairInput = repair.input as Record<string, unknown>;
    const repairDossier = repairInput.dossier as Record<string, unknown>;
    expect(repairDossier).not.toHaveProperty('sources');
    expect(repairDossier).not.toHaveProperty('passages');
    expect(repairInput).toHaveProperty('authorizedEvidence');
    expect(repairInput).not.toHaveProperty('reviewEvidence');
    expect(repair.systemPrompt).toContain(
      'Cada replacement.text debe contener una frase completa y no vacía.'
    );
    expect(repair.systemPrompt).toContain(
      'Nunca uses una cadena vacía para borrar o fusionar sentenceIds.'
    );
    expect(repair.systemPrompt).toContain(
      'conserva ambos IDs y redistribuye el contenido en dos frases completas'
    );
    expect(repair.systemPrompt).toContain(
      'Nunca copies el mismo texto completo en dos sentenceIds.'
    );

    const write = projector({
      operation: 'write',
      systemPrompt: 'writer-prefix',
      input: {
        stopId: partial.routeStopId,
        dossier: partial.dossier,
        neighboringStops: [],
      },
    });
    expect(write.systemPrompt).not.toContain(
      'Nunca uses una cadena vacía para borrar o fusionar sentenceIds.'
    );

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
    expect(tourInput).toHaveProperty('arc');
    const authorizedEvidenceByStop = tourInput.authorizedEvidenceByStop as Record<string, unknown>[];
    expect(authorizedEvidenceByStop.length).toBe(admitted.length);
    for (const dossier of tourInput.dossiers as Record<string, unknown>[]) {
      expect(dossier).toHaveProperty('sources');
      expect(dossier).toHaveProperty('passages');
      expect(dossier).not.toHaveProperty('stopId');
      expect(dossier).not.toHaveProperty('sufficiency');
      expect(dossier).not.toHaveProperty('fingerprint');
    }
  });

  test('projects supervisor-only complete current/next review evidence for audit and adjudicate', () => {
    const stopA = fixture('malaga-history-stop-01', 'Q3849441', COMPLETE_ROLES);
    const stopB = fixture('malaga-history-stop-02', 'Q3849442', COMPLETE_ROLES);
    const stopC = fixture('malaga-history-stop-03', 'Q3849443', COMPLETE_ROLES);
    for (const stop of [stopB, stopC]) {
      const dossier = stop.dossier;
      stop.dossier = buildNarrativeDossierV6({
        stopId: dossier.stopId,
        language: dossier.language,
        sources: dossier.sources.map((source) => source.sourceId),
        passages: dossier.passages,
        propositions: dossier.propositions.map((proposition) => ({
          ...proposition,
          propositionId: `${proposition.propositionId}-${stop.routeStopId}`,
        })),
        authorizedNames: dossier.authorizedNames,
        authorizedNumbers: dossier.authorizedNumbers,
        discrepancies: dossier.discrepancies,
        limits: dossier.limits,
      }, stop.captures);
    }
    const admitted = [admit(stopA), admit(stopB), admit(stopC)];
    const manifest = manifestFor(admitted);
    const projector = createNarrativeEditorialRequestProjectorV8(admitted, manifest, arcFor(admitted));

    const audit = projector({
      operation: 'audit',
      systemPrompt: 'audit-prefix',
      input: {
        script: { stopId: stopA.routeStopId, sentences: [] },
        dossier: stopA.dossier,
      },
    });
    const auditInput = audit.input as Record<string, unknown>;
    expect(auditInput).toHaveProperty('reviewEvidence');
    const auditReviewEvidence = auditInput.reviewEvidence as Record<string, unknown>;
    expect(auditReviewEvidence).toHaveProperty('current');
    expect(auditReviewEvidence).toHaveProperty('next');
    const auditCurrent = auditReviewEvidence.current as Record<string, unknown>;
    const auditNext = auditReviewEvidence.next as Record<string, unknown> | null;
    expect(auditCurrent).not.toBe(stopA.dossier);
    expect(auditCurrent).toMatchObject({
      routeStopId: stopA.routeStopId,
      entityQid: stopA.entityQid,
      dossierFingerprint: stopA.dossier.fingerprint,
    });
    expect(auditCurrent).not.toHaveProperty('dossier');
    expect(auditNext).not.toBeNull();
    expect(auditNext).not.toBe(stopB.dossier);
    expect(auditNext).toMatchObject({
      routeStopId: stopB.routeStopId,
      entityQid: stopB.entityQid,
      dossierFingerprint: stopB.dossier.fingerprint,
    });
    const auditNextDossier = (auditNext as Record<string, unknown>).dossier as Record<string, unknown>;
    expect(auditNextDossier).toHaveProperty('sources');
    expect(auditNextDossier).toHaveProperty('passages');
    expect(auditNextDossier).not.toHaveProperty('stopId');
    expect(auditNextDossier).not.toHaveProperty('sufficiency');
    expect(auditNextDossier).not.toHaveProperty('fingerprint');
    const auditDossier = auditInput.dossier as Record<string, unknown>;
    expect(auditDossier).toHaveProperty('sources');
    expect(auditDossier).toHaveProperty('passages');
    expect(auditDossier).not.toHaveProperty('stopId');
    expect(auditDossier).not.toHaveProperty('sufficiency');
    expect(auditDossier).not.toHaveProperty('fingerprint');
    expect(auditInput).toHaveProperty('authorizedEvidence');

    const currentIds = stopA.dossier.propositions.map((p) => p.propositionId);
    const nextIds = stopB.dossier.propositions.map((p) => p.propositionId);
    const expectedAuditCitationIds = [...new Set([...currentIds, ...nextIds])];
    expect(audit.auditCitationPropositionIds).toEqual(expectedAuditCitationIds);

    const reviewOnlyNextPropositionId = stopB.dossier.propositions[1].propositionId;
    expect(audit.auditCitationPropositionIds).toContain(reviewOnlyNextPropositionId);

    const auditAuthorizedEvidence = auditInput.authorizedEvidence as Record<string, unknown>;
    const flattenedAuthorizedIds = [
      ...(auditAuthorizedEvidence.localPropositions as Record<string, unknown>[]).map((e) => (e.proposition as Record<string, unknown>).propositionId),
      ...(auditAuthorizedEvidence.contributionPropositions as Record<string, unknown>[]).map((e) => (e.proposition as Record<string, unknown>).propositionId),
      ...(auditAuthorizedEvidence.bridgePropositions as Record<string, unknown>[]).map((e) => (e.proposition as Record<string, unknown>).propositionId),
    ];
    expect(flattenedAuthorizedIds).not.toContain(reviewOnlyNextPropositionId);
    expect(auditInput).not.toHaveProperty('auditCitationPropositionIds');

    const adjudicate = projector({
      operation: 'adjudicate',
      systemPrompt: 'adjudicate-prefix',
      input: {
        script: { stopId: stopA.routeStopId, sentences: [] },
        objections: [],
        dossier: stopA.dossier,
      },
    });
    const adjudicateInput = adjudicate.input as Record<string, unknown>;
    expect(adjudicateInput).toHaveProperty('reviewEvidence');
    const adjudicateReviewEvidence = adjudicateInput.reviewEvidence as Record<string, unknown>;
    expect(adjudicateReviewEvidence).toHaveProperty('current');
    expect(adjudicateReviewEvidence).toHaveProperty('next');
    const adjudicateCurrent = adjudicateReviewEvidence.current as Record<string, unknown>;
    const adjudicateNext = adjudicateReviewEvidence.next as Record<string, unknown> | null;
    expect(adjudicateCurrent).not.toBe(stopA.dossier);
    expect(adjudicateCurrent).toMatchObject({
      routeStopId: stopA.routeStopId,
      entityQid: stopA.entityQid,
      dossierFingerprint: stopA.dossier.fingerprint,
    });
    expect(adjudicateCurrent).not.toHaveProperty('dossier');
    expect(adjudicateNext).not.toBeNull();
    expect(adjudicateNext).not.toBe(stopB.dossier);
    expect(adjudicateNext).toMatchObject({
      routeStopId: stopB.routeStopId,
      entityQid: stopB.entityQid,
      dossierFingerprint: stopB.dossier.fingerprint,
    });
    const adjudicateNextDossier = (adjudicateNext as Record<string, unknown>).dossier as Record<string, unknown>;
    expect(adjudicateNextDossier).toHaveProperty('sources');
    expect(adjudicateNextDossier).toHaveProperty('passages');
    expect(adjudicateNextDossier).not.toHaveProperty('stopId');
    expect(adjudicateNextDossier).not.toHaveProperty('sufficiency');
    expect(adjudicateNextDossier).not.toHaveProperty('fingerprint');
    const adjudicateDossier = adjudicateInput.dossier as Record<string, unknown>;
    expect(adjudicateDossier).toHaveProperty('sources');
    expect(adjudicateDossier).toHaveProperty('passages');
    expect(adjudicateDossier).not.toHaveProperty('stopId');
    expect(adjudicateDossier).not.toHaveProperty('sufficiency');
    expect(adjudicateDossier).not.toHaveProperty('fingerprint');
    expect(adjudicateInput).toHaveProperty('authorizedEvidence');

    const finalAudit = projector({
      operation: 'audit',
      systemPrompt: 'audit-prefix',
      input: {
        script: { stopId: stopC.routeStopId, sentences: [] },
        dossier: stopC.dossier,
      },
    });
    const finalAuditInput = finalAudit.input as Record<string, unknown>;
    expect(finalAuditInput).toHaveProperty('reviewEvidence');
    const finalAuditReviewEvidence = finalAuditInput.reviewEvidence as Record<string, unknown>;
    expect(finalAuditReviewEvidence).toHaveProperty('current');
    expect(finalAuditReviewEvidence).toHaveProperty('next');
    const finalAuditCurrent = finalAuditReviewEvidence.current as Record<string, unknown>;
    expect(finalAuditCurrent).not.toBe(stopC.dossier);
    expect(finalAuditCurrent).toMatchObject({
      routeStopId: stopC.routeStopId,
      entityQid: stopC.entityQid,
      dossierFingerprint: stopC.dossier.fingerprint,
    });
    expect(finalAuditCurrent).not.toHaveProperty('dossier');
    expect(finalAuditReviewEvidence.next).toBeNull();

    const finalAuditCitationIds = stopC.dossier.propositions.map((p) => p.propositionId);
    expect(finalAudit.auditCitationPropositionIds).toEqual(finalAuditCitationIds);
    const stopAIds = new Set(stopA.dossier.propositions.map((p) => p.propositionId));
    for (const id of finalAudit.auditCitationPropositionIds as string[]) {
      expect(stopAIds.has(id)).toBe(false);
    }

    const write = projector({
      operation: 'write',
      systemPrompt: 'writer-prefix',
      input: {
        stopId: stopA.routeStopId,
        dossier: stopA.dossier,
        neighboringStops: [],
      },
    });
    const writeInput = write.input as Record<string, unknown>;
    expect(writeInput).not.toHaveProperty('reviewEvidence');
    const writeDossier = writeInput.dossier as Record<string, unknown>;
    expect(writeDossier).not.toHaveProperty('sources');
    expect(writeDossier).not.toHaveProperty('passages');
    expect(writeInput).toHaveProperty('authorizedEvidence');

    const repair = projector({
      operation: 'repair',
      systemPrompt: 'repair-prefix',
      input: {
        script: { stopId: stopA.routeStopId, sentences: [] },
        objections: [],
        adjudications: [],
        dossier: stopA.dossier,
      },
    });
    const repairInput = repair.input as Record<string, unknown>;
    expect(repairInput).not.toHaveProperty('reviewEvidence');
    const repairDossier = repairInput.dossier as Record<string, unknown>;
    expect(repairDossier).not.toHaveProperty('sources');
    expect(repairDossier).not.toHaveProperty('passages');
    expect(repairInput).toHaveProperty('authorizedEvidence');

    const tour = projector({
      operation: 'auditTour',
      systemPrompt: 'tour-prefix',
      input: {
        scripts: admitted.map((stop) => ({ stopId: stop.routeStopId, sentences: [] })),
        dossiers: admitted.map((stop) => stop.dossier),
      },
    });
    const tourInput = tour.input as Record<string, unknown>;
    expect(tourInput).toHaveProperty('reviewEvidenceByStop');
    const reviewEvidenceByStop = tourInput.reviewEvidenceByStop as Record<string, unknown>[];
    expect(reviewEvidenceByStop.length).toBe(admitted.length);
    for (let i = 0; i < admitted.length; i++) {
      const entry = reviewEvidenceByStop[i];
      expect(entry).not.toBe(admitted[i].dossier);
      expect(entry).toMatchObject({
        routeStopId: admitted[i].routeStopId,
        entityQid: admitted[i].entityQid,
        dossierFingerprint: admitted[i].dossier.fingerprint,
      });
      const dossier = entry.dossier as Record<string, unknown>;
      expect(dossier).toHaveProperty('sources');
      expect(dossier).toHaveProperty('passages');
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

    expect(() => createNarrativeEditorialRequestProjectorV8([admitted], corrupted, arcFor([admitted])))
      .toThrow('evidence manifest mismatch');
  });
});
