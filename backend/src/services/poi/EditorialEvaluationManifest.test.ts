import { join } from 'path';
import { loadEditorialEvaluationInput } from './EditorialEvaluationInput';
import { loadEditorialEvaluationInputV4 } from './EditorialEvaluationInputV4';
import { loadEditorialEvaluationCases } from './EditorialEvaluationManifest';

const FIXTURES = join(__dirname, '..', '..', '..', 'fixtures');
const MANIFEST = join(FIXTURES, 'oracle', 'editorial-v2-manifest.json');

describe('editorial evaluation manifest', () => {
  it('loads calibration cases by default without exposing the Valencia holdout', () => {
    const cases = loadEditorialEvaluationCases(MANIFEST);

    expect(cases).toHaveLength(9);
    expect(cases.map((evaluationCase) => evaluationCase.city)).not.toContain('Valencia');
    expect(cases.map((evaluationCase) => [evaluationCase.id, evaluationCase.oracle.stops.length])).toEqual([
      ['madrid-history-es-120', 7],
      ['malaga-history-es-120', 5],
      ['amsterdam-history-nl-120', 5],
      ['toledo-history-es-120', 6],
      ['berlin-history-de-120', 5],
      ['barcelona-history-fr-120', 4],
      ['paris-history-en-120', 4],
      ['roma-history-it-150', 7],
      ['toulouse-history-fr-120', 4],
    ]);
  });

  it('refuses to load holdout oracles through the normal test path', () => {
    expect(() => loadEditorialEvaluationCases(MANIFEST, { scope: 'holdout' })).toThrow(
      'explicit allowHoldout authorization'
    );
  });

  it('refuses to build a holdout candidate input without separate authorization', async () => {
    const holdouts = loadEditorialEvaluationCases(MANIFEST, {
      scope: 'holdout',
      allowHoldout: true,
    });
    expect(holdouts.map((item) => item.id)).toEqual([
      'valencia-history-es-120',
      'segovia-history-es-120',
    ]);

    await expect(loadEditorialEvaluationInput(holdouts[0], FIXTURES)).rejects.toThrow(
      'refuses holdout case valencia-history-es-120'
    );
    await expect(loadEditorialEvaluationInputV4(holdouts[1], FIXTURES)).rejects.toThrow(
      'refuses holdout case segovia-history-es-120'
    );
  });
});
