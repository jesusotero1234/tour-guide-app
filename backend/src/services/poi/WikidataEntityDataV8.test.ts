import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { readWikidataEntityDataV8 } from './WikidataEntityDataV8';
import { resolveWikidataEntityV8 } from './WikidataIdentityV8';
import { fetchWikidataEntitiesV8, fetchWikidataLabelsV8 } from './LiveCityCandidatesV8';

const entity = (id: string) => ({ id, lastrevid: 123, modified: '2026-09-20T00:00:00Z',
  labels: { es: { language: 'es', value: 'París' } }, claims: {}, sitelinks: {} });
describe('official Wikidata EntityData transport', () => {
  let directory: string;
  let originalMode: string | undefined;
  let originalCache: string | undefined;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'wikidata-entity-'));
    originalMode = process.env.NARRATIVE_WIKIDATA_READ_MODE;
    originalCache = process.env.NARRATIVE_WIKIDATA_ENTITY_CACHE_DIR;
  });
  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
    if (originalMode === undefined) delete process.env.NARRATIVE_WIKIDATA_READ_MODE;
    else process.env.NARRATIVE_WIKIDATA_READ_MODE = originalMode;
    if (originalCache === undefined) delete process.env.NARRATIVE_WIKIDATA_ENTITY_CACHE_DIR;
    else process.env.NARRATIVE_WIKIDATA_ENTITY_CACHE_DIR = originalCache;
  });
  it('reads one known identity, preserving its revision and reusing the captured response', async () => {
    const get = jest.fn().mockResolvedValue({ data: { entities: { Q90: entity('Q90') } } });
    const wait = jest.fn();
    const first = await readWikidataEntityDataV8('Q90', get, wait, directory);
    expect(await readWikidataEntityDataV8('Q90', get, wait, directory)).toEqual(first);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('https://www.wikidata.org/wiki/Special:EntityData/Q90.json', {});
    expect(resolveWikidataEntityV8(first.data, 'Q90').identity.revision?.revisionId).toBe(123);
  });
  it('rejects a changed capture instead of silently serving it', async () => {
    const get = jest.fn().mockResolvedValue({ data: { entities: { Q90: entity('Q90') } } });
    await readWikidataEntityDataV8('Q90', get, jest.fn(), directory);
    const file = join(directory, 'Q90.json');
    const capture = JSON.parse(readFileSync(file, 'utf8'));
    capture.data.entities.Q90.labels.es.value = 'Changed';
    writeFileSync(file, JSON.stringify(capture));
    await expect(readWikidataEntityDataV8('Q90', get, jest.fn(), directory)).rejects.toThrow('hash mismatch');
  });
  it('requires an explicit RDF equivalence for a resolved alias', async () => {
    const turtle = '@prefix wd: <http://www.wikidata.org/entity/> .\n'
      + '@prefix owl: <http://www.w3.org/2002/07/owl#> .\nwd:Q1 owl:sameAs wd:Q2 .';
    const get = jest.fn().mockResolvedValueOnce({ data: { entities: { Q2: entity('Q2') } } })
      .mockResolvedValueOnce({ data: turtle });
    const result = await readWikidataEntityDataV8('Q1', get, jest.fn(), directory);
    expect(resolveWikidataEntityV8(result.data, 'Q1').identity.redirectChain).toEqual(['Q1', 'Q2']);
  });
  it('rejects unrelated identities even when their labels match', async () => {
    const get = jest.fn().mockResolvedValueOnce({ data: { entities: { Q2: entity('Q2') } } })
      .mockResolvedValueOnce({ data: 'wd:Q1 rdfs:label "París" .' });
    await expect(readWikidataEntityDataV8('Q1', get, jest.fn(), directory)).rejects.toThrow('Unconfirmed');
  });
  it('respects HTTP Retry-After and does not switch back to the blocked action API', async () => {
    const get = jest.fn().mockRejectedValueOnce({ response: { status: 429, headers: { 'retry-after': '12' } } })
      .mockResolvedValueOnce({ data: { entities: { Q90: entity('Q90') } } });
    const wait = jest.fn();
    await readWikidataEntityDataV8('Q90', get, wait, directory);
    expect(wait).toHaveBeenCalledWith(12000);
    expect(get.mock.calls.every(call => call[0].includes('/Special:EntityData/'))).toBe(true);
  });
  it('records missing entities but never interprets access errors as missing', async () => {
    const missing = await readWikidataEntityDataV8('Q90', jest.fn().mockRejectedValue({ response: { status: 404 } }), jest.fn(), directory);
    expect(resolveWikidataEntityV8(missing.data, 'Q90').status).toBe('missing');
    const get = jest.fn().mockRejectedValue({ response: { status: 403 } });
    await expect(readWikidataEntityDataV8('Q91', get, jest.fn(), directory)).rejects.toEqual({ response: { status: 403 } });
    expect(get).toHaveBeenCalledTimes(1);
  });
  it('uses EntityData for both POIs and their labels when explicitly selected', async () => {
    process.env.NARRATIVE_WIKIDATA_READ_MODE = 'entity-data';
    process.env.NARRATIVE_WIKIDATA_ENTITY_CACHE_DIR = directory;
    const get = jest.fn().mockResolvedValue({ data: { entities: { Q90: entity('Q90') } } });
    expect((await fetchWikidataEntitiesV8(['Q90'], get, jest.fn())).get('Q90')?.identityResolution?.canonicalId).toBe('Q90');
    expect((await fetchWikidataLabelsV8(['Q90'], 'es', get, jest.fn())).get('Q90')).toBe('París');
    expect(get).toHaveBeenCalledTimes(1);
  });
});
