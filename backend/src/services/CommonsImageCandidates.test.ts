import axios from 'axios';
import { candidateFromPage, CommonsImageCandidates } from './CommonsImageCandidates';
jest.mock('axios');
jest.mock('node:timers/promises', () => ({ setTimeout: jest.fn().mockResolvedValue(undefined) }));
const get = axios.get as jest.Mock;
const page = (overrides: Record<string, unknown> = {}) => ({
  pageid: 123, title: 'File:Palace.jpg', imageinfo: [{
    mime: 'image/jpeg', width: 1600, height: 900,
    url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Palace.jpg',
    descriptionurl: 'https://commons.wikimedia.org/wiki/File:Palace.jpg',
    extmetadata: { Artist: { value: '<a href="/wiki/User:Ana">Ana &amp; Luis</a>' },
      LicenseShortName: { value: 'CC BY-SA 4.0' },
      LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0/' },
      ...overrides },
  }],
});
const claim = (value: unknown, rank = 'normal') => ({ rank, mainsnak: { datavalue: { value } } });
beforeEach(() => get.mockReset());

it('retains per-file attribution, source and exact license while removing markup', () => {
  expect(candidateFromPage(page(), 'Q123', 'wikidata-p18')).toMatchObject({
    author: 'Ana & Luis', attribution: 'Ana & Luis', license: 'CC BY-SA 4.0',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Palace.jpg', entityId: 'Q123',
  });
});
it.each([
  ['CC0', 'https://creativecommons.org/publicdomain/zero/1.0/'],
  ['CC BY 3.0', 'http://creativecommons.org/licenses/by/3.0/'],
  ['CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0'],
  ['CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0/deed.en'],
  ['CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0/deed.es'],
  ['CC0', 'https://creativecommons.org/publicdomain/zero/1.0/deed.en'],
  ['CC0', 'https://creativecommons.org/publicdomain/zero/1.0/deed.es'],
])('accepts supported %s with matching license URL', (name, url) => {
  const candidate = candidateFromPage(page({ LicenseShortName: { value: name }, LicenseUrl: { value: url } }), 'Q123', 'wikidata-p18');
  expect(candidate).not.toBeNull();
  if (name === 'CC0') {
    expect(candidate!.licenseUrl).toBe('https://creativecommons.org/publicdomain/zero/1.0/');
  } else if (name === 'CC BY 3.0') {
    expect(candidate!.licenseUrl).toBe('https://creativecommons.org/licenses/by/3.0/');
  } else {
    expect(candidate!.licenseUrl).toBe('https://creativecommons.org/licenses/by-sa/4.0/');
  }
});
it.each([
  { Artist: { value: '' } },
  { Artist: { value: '<script>not an author</script>' } },
  { LicenseShortName: { value: 'CC BY-NC 4.0' } },
  { LicenseShortName: { value: 'CC BY-ND 4.0' } },
  { LicenseShortName: { value: 'Public domain' } },
  { LicenseShortName: { value: 'unknown' } },
  { LicenseUrl: { value: 'https://creativecommons.org/licenses/by/4.0/' } },
  { LicenseUrl: { value: 'https://creativecommons.org.evil.test/licenses/by-sa/4.0/' } },
  { LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0/?print=true' } },
  { LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0/#section' } },
  { LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0/deed.en/unrelated' } },
  { LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/3.0/deed.en' } },
  { Restrictions: { value: 'Personality rights' } },
])('omits ambiguous rights %#', metadata => expect(candidateFromPage(page(metadata), 'Q123', 'wikidata-p18')).toBeNull());
it.each([
  { url: 'https://upload.wikimedia.org.evil.test/Palace.jpg' },
  { descriptionurl: 'https://en.wikipedia.org/wiki/File:Palace.jpg' },
  { descriptionurl: 'https://commons.wikimedia.org/wiki/Palace' },
  { mime: 'image/svg+xml' }, { width: 100 }, { height: 100 },
])('rejects unsafe or unsuitable file %#', overrides => {
  const p = page(); Object.assign(p.imageinfo[0], overrides);
  expect(candidateFromPage(p, 'Q123', 'wikidata-p18')).toBeNull();
});
it('uses P18 and rejects a search result depicting a different entity', async () => {
  get.mockResolvedValueOnce({ data: { entities: { Q123: { claims: { P18: [claim('Palace.jpg'), claim('Old.jpg', 'deprecated')] } } } } })
    .mockResolvedValueOnce({ data: { query: { pages: { 123: page() } } } })
    .mockResolvedValueOnce({ data: { query: { pages: { 456: { ...page(), pageid: 456 } } } } })
    .mockResolvedValueOnce({ data: { entities: { M456: { statements: { P180: [claim({ id: 'Q999' })] } } } } });
  const result = await new CommonsImageCandidates().find('Q123');
  expect(result).toHaveLength(1);
  expect(result[0].identityEvidence).toBe('wikidata-p18');
  expect(get.mock.calls[1][1].params.titles).toBe('File:Palace.jpg');
});
it('checks actual P180 claims even when search says there is a match', async () => {
  get.mockResolvedValueOnce({ data: { entities: {} } })
    .mockResolvedValueOnce({ data: { query: { pages: { 123: page() } } } })
    .mockResolvedValueOnce({ data: { entities: { M123: { statements: { P180: [claim({ id: 'Q123' })] } } } } });
  expect(await new CommonsImageCandidates().find('Q123')).toEqual([expect.objectContaining({ identityEvidence: 'commons-depicts' })]);
});
it('rejects invalid identity without network and propagates cancellation', async () => {
  expect(await new CommonsImageCandidates().find('Palace')).toEqual([]);
  expect(get).not.toHaveBeenCalled();
  const abort = new AbortController(); abort.abort();
  await expect(new CommonsImageCandidates().find('Q123', abort.signal)).rejects.toThrow();
});

it('retries transient 429 and returns valid P18 candidate', async () => {
  const error429 = new Error('429');
  (error429 as any).response = { status: 429, headers: { 'retry-after': '0' } };
  get.mockRejectedValueOnce(error429)
    .mockResolvedValueOnce({ data: { entities: { Q123: { claims: { P18: [claim('Palace.jpg')] } } } } })
    .mockResolvedValueOnce({ data: { query: { pages: { 123: page() } } } })
    .mockResolvedValueOnce({ data: { query: { pages: {} } } });
  const result = await new CommonsImageCandidates().find('Q123');
  expect(result).toHaveLength(1);
  expect(result[0].identityEvidence).toBe('wikidata-p18');
  expect(get).toHaveBeenCalledTimes(4);
});
