import { requestEditorialStructuredV6 } from './EditorialStructuredLlmV6';
import { NarrativeRouteBriefV6 } from './NarrativeContractsV6';
import { createNarrativeArcArchitectV8 } from './NarrativeArcArchitectV8';
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
    expect(fixture.dossier.sufficiency.isSufficient).toBe(false);

    const call = requester.mock.calls[0][0];
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
});
