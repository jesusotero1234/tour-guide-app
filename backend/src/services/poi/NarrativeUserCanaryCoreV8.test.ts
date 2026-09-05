import {
  createCheckpoint, validateCheckpointV8, decodeCheckpointCoreV8,
  assertCheckpointSupportsResumeV8, projectCheckpointStateForResumeV8,
  SCHEMA_VERSION, ResumeFromV8,
} from './NarrativeUserCanaryCheckpointV8';

import { loadReplayRoute } from '../../../scripts/validation/narrative-user-canary-v8';

const core = { requiredIds: ['Q2807', 'Q3127243'], coverageRatio: 0.75, disagreement: true };
const saved = (withCore = true) => createCheckpoint({
  schemaVersion: SCHEMA_VERSION, completedPhase: 'scorecard',
  run: { runId: 'core-test', createdAt: '2026-09-05', profile: 'qwen38_hybrid',
    city: 'Madrid', cityQid: 'Q2807', language: 'es', requestFingerprint: 'request', priorSpendUsd: 0 },
  candidates: [], route: { stops: ['Q2807', 'Q3127243'] }, research: [],
  evidenceManifest: {}, arc: {}, narrationTargets: [{ stopId: 'Q2807', targetSeconds: 300 }],
  editorial: { status: 'draft_review_required', scripts: [] }, scorecard: {},
  ...(withCore ? { core } : {}),
});
describe('core replay invariants', () => {
  it('route artifact loader preserves the full core instead of a presence boolean', async () => {
    const read = jest.spyOn(require('fs'), 'readFileSync').mockReturnValue(JSON.stringify({
      route: { stops: [{ wikidataId: 'Q2807' }, { wikidataId: 'Q3127243' }] }, core,
    }));
    try {
      const replay = await loadReplayRoute('offline-fixture.json');
      expect(replay.core).toEqual(core);
      expect(replay.route.stops.map(stop => stop.wikidataId)).toEqual(core.requiredIds);
      read.mockReturnValue(JSON.stringify({ route: { stops: [{ wikidataId: 'Q2807' }] } }));
      await expect(loadReplayRoute('legacy-fixture.json')).rejects.toThrow(/core/);
    } finally { read.mockRestore(); }
  });
  it.each<ResumeFromV8>(['research', 'arc', 'editorial', 'scorecard'])('preserves core independently of targets for %s', phase => {
    const cp = saved();
    expect(() => assertCheckpointSupportsResumeV8(cp, phase)).not.toThrow();
    const projected = projectCheckpointStateForResumeV8(cp, phase);
    expect(projected.core).toEqual(core);
    expect(projected.core).not.toBe(core);
    expect(projected.core!.requiredIds).not.toBe(core.requiredIds);
    expect(projected.narrationTargets).toEqual(cp.narrationTargets);
  });
  it.each<ResumeFromV8>(['research', 'arc', 'editorial', 'scorecard'])('refuses legacy skip-route resume %s', phase => {
    const cp = saved(false);
    expect(() => validateCheckpointV8(cp)).not.toThrow();
    expect(() => assertCheckpointSupportsResumeV8(cp, phase)).toThrow(/core/);
    expect(() => projectCheckpointStateForResumeV8(cp, phase)).toThrow(/core/);
  });
  it('legacy can restart route and discards stale core when recomputing', () => {
    expect(() => assertCheckpointSupportsResumeV8(saved(false), 'route')).not.toThrow();
    expect(projectCheckpointStateForResumeV8(saved(), 'route').core).toBeUndefined();
  });
  it('whole-checkpoint fingerprint detects core mutation', () => {
    const cp = saved();
    cp.core = { ...core, requiredIds: [] };
    expect(() => validateCheckpointV8(cp)).toThrow(/fingerprint/i);
  });
  it.each([undefined, null, {}, {...core, requiredIds: ['Q1', 'Q1']},
    {...core, requiredIds: ['fake']}, {...core, coverageRatio: NaN},
    {...core, coverageRatio: -1}, {...core, coverageRatio: 1.1},
    {...core, disagreement: 'false'}, {...core, unexpected: true},
  ])('rejects invalid core %j', value => {
    expect(() => decodeCheckpointCoreV8(value, 'fixture')).toThrow(/core/);
  });
  it('accepts a deliberately empty but valid core, not a missing one', () => {
    expect(decodeCheckpointCoreV8({requiredIds: [], coverageRatio: 0, disagreement: false}, 'fixture').requiredIds).toEqual([]);
  });
});
