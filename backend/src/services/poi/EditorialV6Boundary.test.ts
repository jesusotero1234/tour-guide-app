import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const FIXTURES = join(__dirname, '..', '..', '..', 'fixtures');
const DEEPSEEK_CORE = join(
  FIXTURES, 'editorial-v6', 'core', 'editorial-core-v6-madrid-20260807-e',
  'madrid-history-es-120.json'
);

describe('editorial v6 selector boundary', () => {
  it('keeps evaluation targets and manifests out of every production v6 service module', () => {
    const productionModules = readdirSync(__dirname).filter((file) => (
      file.endsWith('V6.ts') && !file.endsWith('.test.ts')
    ));
    const violations = productionModules.flatMap((file) => {
      const source = readFileSync(join(__dirname, file), 'utf8');
      return [
        /EditorialEvaluationManifest/.test(source) ? `${file}: evaluation manifest import` : null,
        /fixtures[/'"]+oracle/i.test(source) ? `${file}: evaluation fixture import` : null,
      ].filter((value): value is string => value !== null);
    });

    expect(violations).toEqual([]);
  });

  it('serializes only visible candidate context, never evaluation labels or comparator results', () => {
    const artifact = JSON.parse(readFileSync(DEEPSEEK_CORE, 'utf8')) as {
      resolution: { runs: Array<{ input: unknown }> };
    };
    expect(artifact.resolution.runs).toHaveLength(3);
    for (const run of artifact.resolution.runs) {
      const serialized = JSON.stringify(run.input).toLowerCase();
      expect(serialized).not.toMatch(/oracle|baseline|greedy|optimizer.?score|hidden.?score/);
    }
  });
});
