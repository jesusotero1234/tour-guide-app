import { readFileSync } from 'fs';
import { join } from 'path';
import { loadEditorialCoreInputV6 } from './EditorialCoreInputV6';

const FIXTURES = join(__dirname, '..', '..', '..', 'fixtures');
const V5_MADRID = join(
  FIXTURES, 'editorial-v5', 'editorial-v5-madrid-20260807-e', 'madrid-history-es-120.json'
);

describe('editorial core input v6', () => {
  it('reuses the frozen v5 identity/evidence pool without loading an evaluation oracle', async () => {
    const expected = JSON.parse(readFileSync(V5_MADRID, 'utf8')) as {
      candidateMapping: Array<{ canonicalId: string }>;
    };
    const loaded = await loadEditorialCoreInputV6({
      city: 'Madrid', cityKey: 'madrid', theme: 'history', language: 'es',
      durationMinutes: 120,
    }, FIXTURES);

    expect(loaded.readyEntities).toHaveLength(30);
    expect(loaded.readyEntities.map((entity) => entity.canonicalId))
      .toEqual(expected.candidateMapping.map((candidate) => candidate.canonicalId));
    expect(loaded.readyEntities.every((entity) => (
      entity.readiness.ready && entity.evidenceFacts.length > 0
    ))).toBe(true);
  }, 60_000);
});
