import { EditorialEntityCandidateV4 } from './EditorialEntityV4';
import {
  captureWalkingMatrixV4,
  validateWalkingMatrixSnapshotV4,
  WALKING_MATRIX_SCHEMA_VERSION,
  walkingLegV4,
} from './EditorialWalkingMatrixV4';

function entity(id: string, lat: number): EditorialEntityCandidateV4 {
  return {
    canonicalId: id, siteId: `site:${id}`, sourceIds: [`node:${id}`], localName: id,
    category: 'other', coordinates: { lat, lng: -3.7 }, fameScore: 50,
    evidenceFacts: [], visitConflictGroup: null,
    readiness: { ready: true, observableCount: 1, contextCount: 1, historicalSpecificCount: 1, missing: [] },
  };
}

describe('editorial walking matrix v4', () => {
  it('captures a directed pedestrian matrix without inventing unreachable legs', async () => {
    const entities = [entity('Q1', 40.4), entity('Q2', 40.41)];
    const get = jest.fn(async (_url: string, _options: Record<string, unknown>) => ({ data: {
      code: 'Ok', distances: [[0, 100], [130, 0]], durations: [[0, 80], [100, 0]],
    } }));
    const snapshot = await captureWalkingMatrixV4(entities, { get, capturedAt: '2026-08-06T00:00:00.000Z' });

    expect(get.mock.calls[0][0]).toContain('/routed-foot/table/v1/driving/');
    expect(walkingLegV4(snapshot, 'site:Q1', 'site:Q2')).toEqual({ meters: 100, seconds: 80, reachable: true });
    expect(walkingLegV4(snapshot, 'site:Q2', 'site:Q1')).toEqual({ meters: 130, seconds: 100, reachable: true });
  });

  it('preserves null legs and rejects a candidate fingerprint mismatch', async () => {
    const entities = [entity('Q1', 40.4), entity('Q2', 40.41)];
    const snapshot = await captureWalkingMatrixV4(entities, {
      get: async () => ({ data: {
        code: 'Ok', distances: [[0, null], [null, 0]], durations: [[0, null], [null, 0]],
      } }),
    });
    expect(walkingLegV4(snapshot, 'site:Q1', 'site:Q2')).toEqual({ meters: null, seconds: null, reachable: false });
    expect(() => validateWalkingMatrixSnapshotV4(snapshot, [entities[0], entity('Q3', 40.42)]))
      .toThrow('fingerprint changed');
  });

  it('rejects incomplete reachable metrics instead of falling back to a straight line', () => {
    const entities = [entity('Q1', 40.4), entity('Q2', 40.41)];
    const sites = entities.map((item) => ({ siteId: item.siteId, lat: item.coordinates.lat, lng: item.coordinates.lng }));
    expect(() => validateWalkingMatrixSnapshotV4({
      schemaVersion: WALKING_MATRIX_SCHEMA_VERSION,
      provider: { id: 'fossgis-osrm-foot', capturedAt: 'now' },
      candidateFingerprint: 'wrong', sites, legs: [],
    }, entities)).toThrow('fingerprint changed');
  });
});
