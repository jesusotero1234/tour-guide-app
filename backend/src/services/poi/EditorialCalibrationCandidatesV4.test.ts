import { join } from 'path';
import { loadEditorialEvaluationInputV4 } from './EditorialEvaluationInputV4';
import { loadEditorialEvaluationCases } from './EditorialEvaluationManifest';

const fixtures = join(__dirname, '..', '..', '..', 'fixtures');
const manifest = join(fixtures, 'oracle', 'editorial-v2-manifest.json');

describe('v4 calibration candidate evidence gate', () => {
  jest.setTimeout(120000);

  it('contains every calibration oracle before any model or route decision', async () => {
    const cases = loadEditorialEvaluationCases(manifest);
    for (const evaluationCase of cases) {
      const loaded = await loadEditorialEvaluationInputV4(evaluationCase, fixtures);
      const candidateIds = new Set(loaded.readyEntities.map((entity) => entity.canonicalId));
      const missing = evaluationCase.oracle.stops.filter((anchor) => !candidateIds.has(anchor.qid));
      expect({ caseId: evaluationCase.id, missing }).toEqual({ caseId: evaluationCase.id, missing: [] });
      expect(loaded.readyEntities.length).toBeLessThanOrEqual(30);
      expect(loaded.readyEntities.every((entity) => entity.readiness.ready)).toBe(true);
    }
  });
});
