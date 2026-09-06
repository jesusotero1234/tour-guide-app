import { captureWikimediaProminenceV6, WikimediaGetV6, WikimediaProminenceProgressV6 } from './EditorialProminenceCaptureV6';
import { validateWikimediaProminenceSnapshotV6 } from './EditorialProminenceV6';
import { buildCoreAuditRequestV6 } from './EditorialCoreResolverV6';
import { EditorialEntityCandidateV5 } from './EditorialEvidenceV5';

const timestamp = '2026-08-06T10:00:00Z';
const page = (title: string, revisionId = 10) => ({
  pageid: revisionId, title, revisions: [{ revid: revisionId, timestamp }],
});
type Reply = () => Promise<{ data: unknown }>;
function fixture(language = 'es', city = 'Villa de Prueba', voyage?: Reply, wikipedia?: Reply) {
  const entities: EditorialEntityCandidateV5[] = [1, 2].map(n => ({
    canonicalId: 'Q' + n, siteId: 'site:Q' + n, sourceIds: ['node:' + n],
    localName: 'Candidate ' + n, category: 'memorial', coordinates: { lat: 40 + n / 1000, lng: -3 },
    fameScore: 40, recognitionScore: 60,
    evidenceFacts: [{ id: 'Q' + n + ':history', source: 'wikidata', sourceId: 'Q' + n,
      kind: 'claim', value: 'inception: 1800', observable: false }],
    readiness: { ready: true, observableCount: 1, contextCount: 1, historicalSpecificCount: 1, missing: [] },
    visitConflictGroup: null,
  }));
  const progress: WikimediaProminenceProgressV6[] = [];
  const get: jest.MockedFunction<WikimediaGetV6> = jest.fn(async (url, options) => {
    const p = options.params as Record<string, string>;
    if (url.includes('wikidata.org')) return { data: { success: 1, entities: Object.fromEntries(
      entities.map((e, i) => [e.canonicalId, { id: e.canonicalId, lastrevid: 100 + i, modified: timestamp,
        sitelinks: { [language + 'wiki']: { title: e.localName } } }])) } };
    if (url.includes('wikimedia.org/api/rest_v1')) return { data: { items: [{ views: url.includes('Candidate_1') ? 10 : 20 }] } };
    if (url.includes(language + '.wikipedia.org')) {
      if (wikipedia) return wikipedia();
      if (p.generator === 'links') return { data: { query: { pages: [
        { title: 'Candidate 1', pageprops: { wikibase_item: 'Q1' } },
      ] } } };
      return { data: { query: { pages: p.titles === city ? [page(city)] : [page('Candidate 1', 11), page('Candidate 2', 12)] } } };
    }
    if (url.includes(language + '.wikivoyage.org')) {
      if (voyage) return voyage();
      return { data: { query: { pages: [{ ns: 0, title: city, missing: true }] } } };
    }
    throw new Error('Unexpected test request: ' + url);
  });
  return {
    entities, progress, get,
    options: { cityKey: city, cityTitle: city, language, entities, get,
      capturedAt: '2026-08-07T00:00:00.000Z',
      onProgress: (event: WikimediaProminenceProgressV6) => { progress.push(event); } },
  };
}
describe('optional missing city Wikivoyage, never optional malformed or unavailable network', () => {
  test('does not call an absent Wikivoyage edition when the canonical destination has no sitelink', async () => {
    const f = fixture();
    const snapshot = await captureWikimediaProminenceV6({...f.options,wikivoyagePage:null});
    expect(f.get.mock.calls.some(([url])=>url.includes('wikivoyage'))).toBe(false);
    expect(snapshot.candidates.every(c=>c.wikivoyageSeeMentioned===null)).toBe(true);
  });
  test('uses the verified edition and title independently of research language', async () => {
    const f = fixture('en','Kyoto');
    const snapshot = await captureWikimediaProminenceV6({...f.options,language:'ja',cityTitle:'京都市',
      wikipediaPage:{language:'en',title:'Kyoto'},wikivoyagePage:{language:'en',title:'Kyoto'}});
    expect(snapshot.language).toBe('ja');
    expect(f.get.mock.calls.some(([url,options])=>url.includes('en.wikipedia.org') && options.params?.titles==='Kyoto')).toBe(true);
    expect(f.get.mock.calls.some(([url])=>url.includes('ja.wikipedia.org'))).toBe(false);
    expect(snapshot.sourceRevisions.some(s=>s.project==='en.wikipedia.org' && s.title==='Kyoto')).toBe(true);
  });
  test.each([['es', 'Villa de Prueba'], ['en', 'Small Town']])('missing guide works for %s without city rules', async (language, city) => {
    const f = fixture(language, city);
    const snapshot = await captureWikimediaProminenceV6(f.options);
    expect(validateWikimediaProminenceSnapshotV6(snapshot, f.entities, { cityKey: city, language })).toEqual(snapshot);
    expect(snapshot.candidates).toHaveLength(2);
    expect(snapshot.candidates.every(c => c.wikivoyageSeeMentioned === null && c.wikivoyageSectionTitle === null)).toBe(true);
    expect(snapshot.sourceRevisions.some(r => r.project.includes('wikivoyage'))).toBe(false);
    expect(snapshot.candidates.flatMap(c => c.support).some(s => s.type === 'wikivoyage_see_mention')).toBe(false);
    expect(snapshot.candidates[0]).toMatchObject({ cityWikipediaLinked: true, sitelinks: 1, pageviews365: 10 });
    expect(snapshot.candidates[1].pageviews365).toBe(20);
    expect(snapshot.candidates.every(c => c.support.some(s => s.type === 'historical_evidence'))).toBe(true);
    expect(f.get.mock.calls.filter(([url]) => url.includes('wikivoyage'))).toHaveLength(1);
    expect(f.get.mock.calls.some(([, o]) => o.params?.action === 'parse')).toBe(false);
    expect(f.progress).toContainEqual(expect.objectContaining({
      event: 'stage_finished', stage: 'city_wikivoyage_revision', status: 'unavailable',
    }));
    expect(f.progress.some(e => e.event === 'stage_finished' && e.status === 'failed')).toBe(false);
    const request = buildCoreAuditRequestV6({ cityKey: city, theme: 'history', durationMinutes: 60 }, f.entities, snapshot, 'seed');
    expect(request.candidates.every(c => c.signals.wikivoyageSee === null)).toBe(true);
    expect(request.candidates.every(c => c.support.length > 0)).toBe(true);
  });
  test('present guide without mentions remains false, not unknown', async () => {
    let calls = 0;
    const f = fixture('es', 'Villa', async () => ({ data: ++calls === 1
      ? { query: { pages: [page('Villa')] } }
      : { parse: { title: 'Villa', sections: [] } } }));
    const snapshot = await captureWikimediaProminenceV6(f.options);
    expect(snapshot.candidates.every(c => c.wikivoyageSeeMentioned === false)).toBe(true);
    expect(snapshot.sourceRevisions.some(r => r.project === 'es.wikivoyage.org')).toBe(true);
    expect(validateWikimediaProminenceSnapshotV6(snapshot, f.entities, { cityKey: 'Villa', language: 'es' })).toEqual(snapshot);
    expect(calls).toBe(2);
  });
  test.each([
    ['zero pages', { query: { pages: [] } }],
    ['multiple pages', { query: { pages: [page('A'), page('B')] } }],
    ['API error', { error: { code: 'internal_api_error', info: 'failure' } }],
    ['missing string marker', { query: { pages: [{ title: 'Villa', missing: '' }] } }],
    ['false missing marker', { query: { pages: [{ ...page('Villa'), missing: false }] } }],
    ['missing title', { query: { pages: [{ missing: true }] } }],
    ['blank title', { query: { pages: [{ title: ' ', missing: true }] } }],
    ['invalid title marker', { query: { pages: [{ title: 'Villa', missing: true, invalid: true }] } }],
    ['invalid page with revision', { query: { pages: [{ ...page('Villa'), invalid: true }] } }],
    ['contradictory revisions', { query: { pages: [{ ...page('Villa'), missing: true }] } }],
    ['no revision', { query: { pages: [{ title: 'Villa' }] } }],
    ['malformed revision', { query: { pages: [{ title: 'Villa', revisions: [{ revid: 'not-a-number', timestamp }] }] } }],
  ])('does not suppress %s', async (_label, data) => {
    const f = fixture('es', 'Villa', async () => ({ data }));
    await expect(captureWikimediaProminenceV6(f.options)).rejects.toThrow();
    expect(f.progress).toContainEqual(expect.objectContaining({ stage: 'city_wikivoyage_revision', status: 'failed' }));
    expect(f.progress.some(e => e.event === 'stage_finished' && e.status === 'unavailable')).toBe(false);
  });
  test.each([429, 503, 504])('HTTP %i is not a missing page', async status => {
    const f = fixture('es', 'Villa', async () => { throw { response: { status, headers: { 'retry-after': '0' } } }; });
    await expect(captureWikimediaProminenceV6(f.options)).rejects.toThrow('HTTP ' + status);
    expect(f.get.mock.calls.filter(([url]) => url.includes('wikivoyage'))).toHaveLength(status === 504 ? 1 : 3);
    expect(f.progress.some(e => e.event === 'stage_finished' && e.status === 'unavailable')).toBe(false);
  });
  test('timeout is not a missing page', async () => {
    const f = fixture('es', 'Villa', async () => { throw new Error('timeout ETIMEDOUT'); });
    await expect(captureWikimediaProminenceV6(f.options)).rejects.toThrow('ETIMEDOUT');
    expect(f.progress).toContainEqual(expect.objectContaining({ stage: 'city_wikivoyage_revision', status: 'failed' }));
  });
  test('confirmed missing Wikipedia still fails rather than becoming optional', async () => {
    const f = fixture('es', 'Villa', undefined, async () => ({ data: { query: { pages: [{ title: 'Villa', missing: true }] } } }));
    await expect(captureWikimediaProminenceV6(f.options)).rejects.toThrow('Missing Wikimedia page es.wikipedia.org');
    expect(f.get.mock.calls.some(([url]) => url.includes('wikivoyage'))).toBe(false);
  });
  test('unknown signals cannot contain fake Wikivoyage sections, revisions or support', async () => {
    const f = fixture();
    const snapshot = await captureWikimediaProminenceV6(f.options);
    const validate = (value: unknown) => validateWikimediaProminenceSnapshotV6(value, f.entities, { cityKey: f.options.cityKey, language: 'es' });
    const section = structuredClone(snapshot); section.candidates[0].wikivoyageSectionTitle = 'Ver';
    expect(() => validate(section)).toThrow('inconsistent');
    const revision = structuredClone(snapshot); revision.sourceRevisions.push({
      sourceId: 'eswikivoyage:fake', project: 'es.wikivoyage.org', title: 'fake', revisionId: 1, revisionTimestamp: timestamp,
    });
    expect(() => validate(revision)).toThrow('inconsistent');
    const support = structuredClone(snapshot); support.candidates[0].support.push({
      supportId: 'Q1:fake-voyage', type: 'wikivoyage_see_mention', value: 'Invented mention', sourceRef: 'fake',
    });
    expect(() => validate(support)).toThrow('cannot supply support');
    const tampered = { ...snapshot, fingerprint: 'changed' };
    expect(() => validate(tampered)).toThrow('fingerprint');
  });
});
