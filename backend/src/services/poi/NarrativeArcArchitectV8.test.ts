import { requestEditorialStructuredV6 } from './EditorialStructuredLlmV6';
import { NarrativeRouteBriefV6 } from './NarrativeContractsV6';
import { createNarrativeArcArchitectV8, validateNarrativeArcV8 } from './NarrativeArcArchitectV8';
import {
  NarrativeResearchHandoffStopV8,
  buildNarrativeEvidenceBoundaryV8,
} from './NarrativeEvidenceBoundaryV8';
import { buildNarrativeEvidenceFixtureV8 } from './NarrativeEvidenceFixturesV8.test-support';

jest.mock('./EditorialStructuredLlmV6', () => ({
  requestEditorialStructuredV6: jest.fn(),
}));

const stats = {
  searchQueries: 0,
  searchQueryAttempts: 0,
  searchQuerySuccesses: 0,
  mapAttempts: 0,
  mapSuccesses: 0,
  webCaptureAttempts: 0,
  webCaptureResponses: 0,
  infrastructureFailureCount: 0,
  mappedUrlCount: 0,
  attemptedUrlCount: 0,
  capturedSourceCount: 1,
  publisherCount: 1,
  curationCount: 1,
};

function readyInput() {
  const fixture = buildNarrativeEvidenceFixtureV8({
    routeStopId: 'malaga-history-stop-03',
    entityQid: 'Q3849447',
    includedRoles: [
      'visible_observation',
      'chronology_or_transformation',
      'human_agency_or_lived_function',
      'tension_or_contrast',
      'distinctive_trait',
    ],
    sources: [{
      sourceId: 'established-source',
      publisherKey: 'established.example',
      authorityTier: 'established_source',
    }],
  });
  if (fixture.tier === 'D') throw new Error('fixture unexpectedly produced tier D');
  const route = {
    schemaVersion: 'narrative-route-brief-v6',
    caseId: 'arc-v8-test',
    city: 'Málaga',
    country: 'España',
    language: 'es',
    theme: 'history',
    durationMinutes: 60,
    stops: [{
      stopId: fixture.routeStopId,
      position: 1,
      name: 'Teatro Romano',
      narrativeRole: 'opening',
      wikidataId: fixture.entityQid,
      wikidataUrl: `https://www.wikidata.org/wiki/${fixture.entityQid}`,
      wikipediaUrl: null,
      coordinates: { lat: 36.721, lng: -4.418 },
      previousStopId: null,
      nextStopId: null,
    }],
    fingerprint: 'arc-v8-route-fingerprint',
  } satisfies NarrativeRouteBriefV6;
  const handoff = {
    routeStopId: fixture.routeStopId,
    entityQid: fixture.entityQid,
    result: {
      status: 'sufficient',
      stopId: fixture.entityQid,
      gates: fixture.gates,
      dossier: fixture.dossier,
      evidenceTier: fixture.tier,
      routeEligible: true,
      stats,
      captures: fixture.captures,
      captureLog: [],
    },
  } satisfies NarrativeResearchHandoffStopV8;
  const boundary = buildNarrativeEvidenceBoundaryV8(route, [handoff]);
  if (boundary.status !== 'ready') throw new Error(`boundary was ${boundary.status}`);
  return { fixture, route, boundary };
}

describe('narrative v8 arc architect', () => {
  it('builds an arc from a real complete tier C envelope without exposing legacy sufficiency', async () => {
    const { fixture, route, boundary } = readyInput();
    const propositionId = fixture.dossier.propositions[0].propositionId;
    const requester = requestEditorialStructuredV6 as jest.Mock;
    requester.mockReset();
    requester.mockResolvedValue({
      status: 'valid',
      value: {
        promise: 'Comprender la transformación de Málaga.',
        centralQuestion: '¿Cómo cambió este lugar?',
        stops: [{
          stopId: 'malaga-history-stop-03',
          contribution: 'Presenta una transformación urbana.',
          bridge: 'Resuelve la pregunta central.',
          contributionPropositionIds: [propositionId],
          bridgePropositionIds: [propositionId],
        }],
      },
    });

    const result = await createNarrativeArcArchitectV8({}).build({
      route,
      admittedStops: boundary.admittedStops,
      manifest: boundary.manifest,
    });

    expect(requester).toHaveBeenCalledTimes(1);
    expect(result.manifest.fingerprint).toBe(boundary.manifest.fingerprint);
    expect(result.arc.stops[0].stopId).toBe('malaga-history-stop-03');
    expect(result.arc.stops[0].contributionPropositionIds).toEqual([propositionId]);
    expect(result.arc.stops[0].bridgePropositionIds).toEqual([propositionId]);
    expect(fixture.dossier.sufficiency.isSufficient).toBe(false);

    const call = requester.mock.calls[0][0];
    expect(call.options.requestAttempts).toBe(3);
    expect(call.options.includePreviousResponseOnSemanticRetry).toBe(true);
    expect(call.systemPrompt).toContain('bridge debe ser siempre no vacío');
    expect(call.systemPrompt).toContain('la parada final cierra la pregunta central sin anunciar otra parada');
    const projected = call.input.admittedStops[0];
    expect(projected).toMatchObject({
      routeStopId: 'malaga-history-stop-03',
      entityQid: 'Q3849447',
      evidenceTier: 'C',
      routeEligible: true,
      dossierFingerprint: fixture.dossier.fingerprint,
    });
    expect(projected.gates).toEqual(fixture.gates);
    expect(projected.dossier).not.toHaveProperty('stopId');
    expect(projected.dossier).not.toHaveProperty('sufficiency');
    expect(projected.dossier).not.toHaveProperty('fingerprint');
    expect(projected.dossier).toHaveProperty('propositions');
    expect(projected.dossier).not.toHaveProperty('sources');
    expect(projected.dossier).not.toHaveProperty('passages');
    expect(call.systemPrompt).toContain('A, B y C son elegibles');
    expect(call.systemPrompt).toContain('No debes llenar roles ausentes en C');
    expect(call.systemPrompt).toContain('No añadas hechos externos');
    expect(call.systemPrompt).toContain('exactamente una entrada de stops para cada parada de la ruta');
    expect(call.systemPrompt).toContain('malaga-history-stop-03');
    expect(call.systemPrompt).not.toContain('todos los dossiers sean suficientes');

    const stopsSchema = call.schema.properties.stops;
    expect(stopsSchema.minItems).toBe(1);
    expect(stopsSchema.maxItems).toBe(1);
    expect(stopsSchema.items.properties.stopId.enum).toEqual(['malaga-history-stop-03']);
    expect(stopsSchema.items.required).toContain('contributionPropositionIds');
    expect(stopsSchema.items.required).toContain('bridgePropositionIds');
    expect(stopsSchema.items.properties.contributionPropositionIds).toEqual({
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
    });
    expect(stopsSchema.items.properties.bridgePropositionIds).toEqual({
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
    });
  });

  it('rejects a corrupted evidence manifest fingerprint before requesting the model', async () => {
    const { route, boundary } = readyInput();
    const corruptedManifest = { ...boundary.manifest, fingerprint: 'corrupted-fingerprint' };
    const requester = requestEditorialStructuredV6 as jest.Mock;
    requester.mockReset();

    await expect(
      createNarrativeArcArchitectV8({}).build({
        route,
        admittedStops: boundary.admittedStops,
        manifest: corruptedManifest,
      })
    ).rejects.toThrow('manifest.fingerprint does not match recomputed fingerprint');

    expect(requester).not.toHaveBeenCalled();
  });

  it('validates proposition provenance membership for contribution and bridge IDs', () => {
    const { fixture, route, boundary } = readyInput();
    const propositionId = fixture.dossier.propositions[0].propositionId;
    const validArc = {
      promise: 'Comprender la transformación de Málaga.',
      centralQuestion: '¿Cómo cambió este lugar?',
      stops: [{
        stopId: 'malaga-history-stop-03',
        contribution: 'Presenta una transformación urbana.',
        bridge: 'Resuelve la pregunta central.',
        contributionPropositionIds: [propositionId],
        bridgePropositionIds: [propositionId],
      }],
    };

    expect(() => validateNarrativeArcV8(validArc, route, boundary.admittedStops)).not.toThrow();

    const unknownContributionArc = {
      ...validArc,
      stops: [{
        ...validArc.stops[0],
        contributionPropositionIds: ['unknown-contribution-id'],
      }],
    };
    expect(() => validateNarrativeArcV8(unknownContributionArc, route, boundary.admittedStops)).toThrow(
      'arc stop 0 contributionPropositionId unknown-contribution-id not in current stop dossier'
    );

    const unknownBridgeArc = {
      ...validArc,
      stops: [{
        ...validArc.stops[0],
        bridgePropositionIds: ['unknown-bridge-id'],
      }],
    };
    expect(() => validateNarrativeArcV8(unknownBridgeArc, route, boundary.admittedStops)).toThrow(
      'arc stop 0 bridgePropositionId unknown-bridge-id not in current or next stop dossier'
    );
  });

  it('validates bridge adjacency for a two-stop arc', () => {
    const fixtureA = buildNarrativeEvidenceFixtureV8({
      routeStopId: 'stop-a',
      entityQid: 'Q100',
      includedRoles: [
        'visible_observation',
        'chronology_or_transformation',
        'human_agency_or_lived_function',
      ],
      sources: [{
        sourceId: 'source-a',
        publisherKey: 'publisher-a',
        authorityTier: 'established_source',
      }],
    });
    const fixtureB = buildNarrativeEvidenceFixtureV8({
      routeStopId: 'stop-b',
      entityQid: 'Q200',
      includedRoles: [
        'visible_observation',
        'chronology_or_transformation',
        'tension_or_contrast',
      ],
      sources: [{
        sourceId: 'source-b',
        publisherKey: 'publisher-b',
        authorityTier: 'established_source',
      }],
    });
    if (fixtureA.tier === 'D' || fixtureB.tier === 'D') {
      throw new Error('adjacency fixtures must be route eligible');
    }

    const route = {
      schemaVersion: 'narrative-route-brief-v6',
      caseId: 'arc-v8-two-stop-test',
      city: 'Málaga',
      country: 'España',
      language: 'es',
      theme: 'history',
      durationMinutes: 60,
      stops: [
        {
          stopId: fixtureA.routeStopId,
          position: 1,
          name: 'Stop A',
          narrativeRole: 'opening',
          wikidataId: fixtureA.entityQid,
          wikidataUrl: `https://www.wikidata.org/wiki/${fixtureA.entityQid}`,
          wikipediaUrl: null,
          coordinates: { lat: 36.721, lng: -4.418 },
          previousStopId: null,
          nextStopId: fixtureB.routeStopId,
        },
        {
          stopId: fixtureB.routeStopId,
          position: 2,
          name: 'Stop B',
          narrativeRole: 'closing',
          wikidataId: fixtureB.entityQid,
          wikidataUrl: `https://www.wikidata.org/wiki/${fixtureB.entityQid}`,
          wikipediaUrl: null,
          coordinates: { lat: 36.722, lng: -4.419 },
          previousStopId: fixtureA.routeStopId,
          nextStopId: null,
        },
      ],
      fingerprint: 'arc-v8-two-stop-fingerprint',
    } satisfies NarrativeRouteBriefV6;

    const handoffA = {
      routeStopId: fixtureA.routeStopId,
      entityQid: fixtureA.entityQid,
      result: {
        status: 'sufficient',
        stopId: fixtureA.entityQid,
        gates: fixtureA.gates,
        dossier: fixtureA.dossier,
        evidenceTier: fixtureA.tier,
        routeEligible: true,
        stats,
        captures: fixtureA.captures,
        captureLog: [],
      },
    } satisfies NarrativeResearchHandoffStopV8;

    const handoffB = {
      routeStopId: fixtureB.routeStopId,
      entityQid: fixtureB.entityQid,
      result: {
        status: 'sufficient',
        stopId: fixtureB.entityQid,
        gates: fixtureB.gates,
        dossier: fixtureB.dossier,
        evidenceTier: fixtureB.tier,
        routeEligible: true,
        stats,
        captures: fixtureB.captures,
        captureLog: [],
      },
    } satisfies NarrativeResearchHandoffStopV8;

    const boundary = buildNarrativeEvidenceBoundaryV8(route, [handoffA, handoffB]);
    if (boundary.status !== 'ready') throw new Error(`boundary was ${boundary.status}`);

    const propositionA = fixtureA.dossier.propositions.find(
      (proposition) => proposition.role === 'human_agency_or_lived_function'
    )!.propositionId;
    const propositionB = fixtureB.dossier.propositions.find(
      (proposition) => proposition.role === 'tension_or_contrast'
    )!.propositionId;

    const validArc = {
      promise: 'Comprender la transformación de Málaga.',
      centralQuestion: '¿Cómo cambió este lugar?',
      stops: [
        {
          stopId: fixtureA.routeStopId,
          contribution: 'Presenta una transformación urbana.',
          bridge: 'Resuelve la pregunta central.',
          contributionPropositionIds: [propositionA],
          bridgePropositionIds: [propositionB],
        },
        {
          stopId: fixtureB.routeStopId,
          contribution: 'Presenta una transformación urbana.',
          bridge: 'Resuelve la pregunta central.',
          contributionPropositionIds: [propositionB],
          bridgePropositionIds: [propositionB],
        },
      ],
    };

    expect(() => validateNarrativeArcV8(validArc, route, boundary.admittedStops)).not.toThrow();

    const invalidArc = {
      ...validArc,
      stops: [
        validArc.stops[0],
        {
          ...validArc.stops[1],
          bridgePropositionIds: [propositionA],
        },
      ],
    };

    expect(() => validateNarrativeArcV8(invalidArc, route, boundary.admittedStops)).toThrow(
      `arc stop 1 bridgePropositionId ${propositionA} not in current or next stop dossier`
    );
  });

  it('neutralizes bridge to next stop name when no next dossier support and preserves last stop', () => {
    const fixtureA = buildNarrativeEvidenceFixtureV8({
      routeStopId: 'edinburgh-stop-a',
      entityQid: 'Q100',
      includedRoles: [
        'visible_observation',
        'chronology_or_transformation',
        'human_agency_or_lived_function',
      ],
      sources: [{
        sourceId: 'source-a',
        publisherKey: 'publisher-a',
        authorityTier: 'established_source',
      }],
    });
    const fixtureB = buildNarrativeEvidenceFixtureV8({
      routeStopId: 'edinburgh-stop-b',
      entityQid: 'Q200',
      includedRoles: [
        'visible_observation',
        'chronology_or_transformation',
        'tension_or_contrast',
      ],
      sources: [{
        sourceId: 'source-b',
        publisherKey: 'publisher-b',
        authorityTier: 'established_source',
      }],
    });
    if (fixtureA.tier === 'D' || fixtureB.tier === 'D') {
      throw new Error('neutralization fixtures must be route eligible');
    }

    const route = {
      schemaVersion: 'narrative-route-brief-v6',
      caseId: 'arc-v8-neutral-bridge-test',
      city: 'Edinburgh',
      country: 'United Kingdom',
      language: 'en',
      theme: 'history',
      durationMinutes: 60,
      stops: [
        {
          stopId: fixtureA.routeStopId,
          position: 1,
          name: 'Old Town',
          narrativeRole: 'opening',
          wikidataId: fixtureA.entityQid,
          wikidataUrl: `https://www.wikidata.org/wiki/${fixtureA.entityQid}`,
          wikipediaUrl: null,
          coordinates: { lat: 55.948, lng: -3.189 },
          previousStopId: null,
          nextStopId: fixtureB.routeStopId,
        },
        {
          stopId: fixtureB.routeStopId,
          position: 2,
          name: 'Castle Rock',
          narrativeRole: 'closing',
          wikidataId: fixtureB.entityQid,
          wikidataUrl: `https://www.wikidata.org/wiki/${fixtureB.entityQid}`,
          wikipediaUrl: null,
          coordinates: { lat: 55.947, lng: -3.194 },
          previousStopId: fixtureA.routeStopId,
          nextStopId: null,
        },
      ],
      fingerprint: 'arc-v8-neutral-bridge-fingerprint',
    } satisfies NarrativeRouteBriefV6;

    const handoffA = {
      routeStopId: fixtureA.routeStopId,
      entityQid: fixtureA.entityQid,
      result: {
        status: 'sufficient',
        stopId: fixtureA.entityQid,
        gates: fixtureA.gates,
        dossier: fixtureA.dossier,
        evidenceTier: fixtureA.tier,
        routeEligible: true,
        stats,
        captures: fixtureA.captures,
        captureLog: [],
      },
    } satisfies NarrativeResearchHandoffStopV8;

    const handoffB = {
      routeStopId: fixtureB.routeStopId,
      entityQid: fixtureB.entityQid,
      result: {
        status: 'sufficient',
        stopId: fixtureB.entityQid,
        gates: fixtureB.gates,
        dossier: fixtureB.dossier,
        evidenceTier: fixtureB.tier,
        routeEligible: true,
        stats,
        captures: fixtureB.captures,
        captureLog: [],
      },
    } satisfies NarrativeResearchHandoffStopV8;

    const boundary = buildNarrativeEvidenceBoundaryV8(route, [handoffA, handoffB]);
    if (boundary.status !== 'ready') throw new Error(`boundary was ${boundary.status}`);

    const propositionA = fixtureA.dossier.propositions.find(
      (proposition) => proposition.role === 'human_agency_or_lived_function'
    )!.propositionId;
    const propositionB = fixtureB.dossier.propositions.find(
      (proposition) => proposition.role === 'tension_or_contrast'
    )!.propositionId;

    const arcWithLocalOnlyBridge = {
      promise: 'Understand the transformation of Edinburgh.',
      centralQuestion: 'How did this place change?',
      stops: [
        {
          stopId: fixtureA.routeStopId,
          contribution: 'Presents an urban transformation.',
          bridge: 'Original bridge text.',
          contributionPropositionIds: [propositionA],
          bridgePropositionIds: [propositionA],
        },
        {
          stopId: fixtureB.routeStopId,
          contribution: 'Presents an urban transformation.',
          bridge: 'Closes the central question.',
          contributionPropositionIds: [propositionB],
          bridgePropositionIds: [propositionB],
        },
      ],
    };

    const validated = validateNarrativeArcV8(arcWithLocalOnlyBridge, route, boundary.admittedStops);
    expect(validated.stops[0].bridge).toBe('Castle Rock');
    expect(validated.stops[1].bridge).toBe('Closes the central question.');

    const arcWithNextSupport = {
      ...arcWithLocalOnlyBridge,
      stops: [
        {
          ...arcWithLocalOnlyBridge.stops[0],
          bridgePropositionIds: [propositionB],
        },
        arcWithLocalOnlyBridge.stops[1],
      ],
    };
    const validatedWithSupport = validateNarrativeArcV8(arcWithNextSupport, route, boundary.admittedStops);
    expect(validatedWithSupport.stops[0].bridge).toBe('Original bridge text.');

    const arcWithForeignId = {
      ...arcWithLocalOnlyBridge,
      stops: [
        {
          ...arcWithLocalOnlyBridge.stops[0],
          bridgePropositionIds: ['foreign-bridge-id'],
        },
        arcWithLocalOnlyBridge.stops[1],
      ],
    };
    expect(() => validateNarrativeArcV8(arcWithForeignId, route, boundary.admittedStops)).toThrow(
      'arc stop 0 bridgePropositionId foreign-bridge-id not in current or next stop dossier'
    );
  });
});
