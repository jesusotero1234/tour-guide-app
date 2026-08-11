import candidates from '../../../fixtures/candidates/toledo-history.json';
import oracle from '../../../fixtures/oracle/toledo-history-es-120.json';
import sources from '../../../fixtures/sources/toledo-history-es.json';
import {
  approveNarrativeEditorialRunV6,
  buildNarrativeRouteBriefV6,
  narrativeTourFingerprintV6,
  validateNarrativeEditorialRunV6,
} from './NarrativeContractsV6';

describe('narrative v6 contracts', () => {
  it('builds the fixed Toledo route from the curated 120-minute oracle', () => {
    const brief = buildNarrativeRouteBriefV6({
      candidates,
      oracle,
      sources,
      country: 'España',
    });

    expect(brief.durationMinutes).toBe(120);
    expect(brief.stops).toHaveLength(6);
    expect(brief.stops.map((stop) => stop.wikidataId)).toEqual([
      'Q1123180', 'Q1326589', 'Q1324080', 'Q1289106', 'Q1568115', 'Q581532',
    ]);
    expect(brief.stops[0]).toMatchObject({
      stopId: 'catedral-de-santa-maria',
      previousStopId: null,
      nextStopId: 'alcazar-de-toledo',
      coordinates: { lat: 39.8573916, lng: -4.0237544 },
      wikidataUrl: 'https://www.wikidata.org/wiki/Q1123180',
      wikipediaUrl: 'https://es.wikipedia.org/wiki/Catedral%20de%20Toledo',
    });
    expect(brief.stops.at(-1)).toMatchObject({
      previousStopId: 'santa-maria-la-blanca', nextStopId: null,
    });
    expect(brief.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects approval for any fingerprint other than the exact tour', () => {
    const tour = {
      routeFingerprint: 'route-a',
      dossierFingerprints: ['dossier-a'],
      scripts: [{ stopId: 'palace', text: 'Texto aprobado.' }],
    };
    const fingerprint = narrativeTourFingerprintV6(tour);
    const ready = validateNarrativeEditorialRunV6({
      schemaVersion: 'narrative-editorial-run-v6',
      runId: 'run-1',
      caseId: 'madrid-history-es-120',
      createdAt: '2026-08-11T12:00:00.000Z',
      status: 'ready_for_human_gate',
      tourFingerprint: fingerprint,
      stopReviews: [{ stopId: 'palace', decision: 'accepted' }],
      diagnostics: { privateArtifactPath: 'diagnostics/run-1.json' },
    });

    expect(() => approveNarrativeEditorialRunV6(ready, {
      author: 'editorial-owner',
      approvedAt: '2026-08-11T13:00:00.000Z',
      reason: 'Escuchado y aprobado.',
      tourFingerprint: narrativeTourFingerprintV6({
        ...tour,
        scripts: [{ stopId: 'palace', text: 'Texto modificado.' }],
      }),
    })).toThrow('approval fingerprint does not match the exact tour');

    expect(approveNarrativeEditorialRunV6(ready, {
      author: 'editorial-owner',
      approvedAt: '2026-08-11T13:00:00.000Z',
      reason: 'Escuchado y aprobado.',
      tourFingerprint: fingerprint,
    })).toMatchObject({ status: 'approved', tourFingerprint: fingerprint });
  });

  it('keeps calibration failures distinct from genuine evidence review', () => {
    const failed = validateNarrativeEditorialRunV6({
      schemaVersion: 'narrative-editorial-run-v6',
      runId: 'run-research',
      caseId: 'madrid-history-es-120',
      createdAt: '2026-08-11T12:00:00.000Z',
      status: 'model_calibration_failed',
      stage: 'research',
      reason: 'The researcher missed an authority source present in the oracle.',
      diagnostics: { privateArtifactPath: 'diagnostics/run-research.json' },
    });

    expect(failed.status).toBe('model_calibration_failed');
    if (failed.status === 'model_calibration_failed') {
      expect(failed.stage).toBe('research');
    }
  });
});
