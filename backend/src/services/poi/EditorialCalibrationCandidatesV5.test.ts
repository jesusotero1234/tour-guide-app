import { join } from 'path';
import { loadEditorialEvaluationInputV5 } from './EditorialEvaluationInputV5';
import { loadEditorialEvaluationCases } from './EditorialEvaluationManifest';

const FIXTURES = join(__dirname, '..', '..', '..', 'fixtures');
const MANIFEST = join(FIXTURES, 'oracle', 'editorial-v2-manifest.json');

describe('editorial v5 frozen calibration candidates', () => {
  it('keeps every calibration anchor in the ready thirty-candidate set using own evidence', async () => {
    const cases = loadEditorialEvaluationCases(MANIFEST);
    const failures: string[] = [];
    for (const evaluationCase of cases) {
      const loaded = await loadEditorialEvaluationInputV5(evaluationCase, FIXTURES);
      const readyIds = new Set(loaded.readyEntities.map((entity) => entity.canonicalId));
      const missing = evaluationCase.oracle.stops.filter((anchor) => !readyIds.has(anchor.qid));
      if (missing.length > 0) {
        failures.push(`${evaluationCase.id}: ${missing.map((anchor) => anchor.qid).join(', ')}`);
      }
      expect(loaded.readyEntities.length).toBeLessThanOrEqual(30);
      expect(loaded.readyEntities.every((entity) => entity.readiness.ready)).toBe(true);
    }
    expect(failures).toEqual([]);
  }, 120000);
});
