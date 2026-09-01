import { EvidenceFact } from './EditorialCandidate';
import { EditorialEntityCandidateV5 } from './EditorialEvidenceV5';
import {
  captureWikimediaProminenceV6,
  WikimediaGetV6,
  WikimediaProminenceProgressV6,
} from './EditorialProminenceCaptureV6';
import { validateWikimediaProminenceSnapshotV6 } from './EditorialProminenceV6';

function entity(index: number): EditorialEntityCandidateV5 {
  const canonicalId = `Q${index}`;
  const evidenceFacts: EvidenceFact[] = [{
    id: `${canonicalId}:history`, source: 'wikidata', sourceId: canonicalId,
    kind: 'claim', value: `inception: 18${index}0`, observable: false,
  }];
  return {
    canonicalId, siteId: `site:${canonicalId}`, sourceIds: [`node:${index}`],
    localName: `Candidate ${index}`, category: 'memorial',
    coordinates: { lat: 40.4 + index * 0.001, lng: -3.7 },
    fameScore: 40, recognitionScore: 60, evidenceFacts,
    readiness: {
      ready: true, observableCount: 1, contextCount: 1,
      historicalSpecificCount: 1, missing: [],
    },
    visitConflictGroup: null,
  };
}

function actionPage(title: string, revisionId: number) {
  return {
    pageid: revisionId,
    title,
    revisions: [{ revid: revisionId, timestamp: '2026-08-06T10:00:00Z' }],
  };
}

describe('Wikimedia prominence capture v6', () => {
  const entities = [entity(1), entity(2)];

  it('captures candidate-owned mult-source signals, source revisions, and pageview percentiles', async () => {
    let rateLimited = false;
    const progress: WikimediaProminenceProgressV6[] = [];
    const get: jest.MockedFunction<WikimediaGetV6> = jest.fn(async (url, options) => {
      const params = options.params as Record<string, string>;
      expect(options.headers['User-Agent']).toContain('github.com/jesusotero1234/tour-guide-app');
      expect(options.headers['Accept-Encoding']).toBe('gzip');
      if (url.includes('wikidata.org')) {
        expect(params.props).toBe('info|sitelinks');
        return { data: { success: 1, entities: {
          Q1: {
            id: 'Q1', lastrevid: 101, modified: '2026-08-05T00:00:00Z',
            sitelinks: { eswiki: { title: 'Candidate 1' }, enwiki: { title: 'Candidate One' } },
          },
          Q2: {
            id: 'Q2', lastrevid: 102, modified: '2026-08-05T00:00:00Z',
            sitelinks: { eswiki: { title: 'Candidate 2' } },
          },
        } } };
      }
      if (url.includes('wikimedia.org/api/rest_v1')) {
        if (url.includes('Candidate_1') && !rateLimited) {
          rateLimited = true;
          throw { response: { status: 429, headers: { 'retry-after': '0' } } };
        }
        return { data: { items: url.includes('Candidate_1')
          ? [{ views: 40 }, { views: 60 }]
          : [{ views: 100 }, { views: 200 }] } };
      }
      if (url.includes('es.wikipedia.org')) {
        if (params.generator === 'links') {
          return { data: { batchcomplete: true, query: { pages: [{
            pageid: 11, title: 'Candidate 1', pageprops: { wikibase_item: 'Q1' },
          }] } } };
        }
        if (params.titles === 'Madrid') {
          return { data: { batchcomplete: true, query: { pages: [actionPage('Madrid', 201)] } } };
        }
        return { data: { batchcomplete: true, query: { pages: [
          actionPage('Candidate 1', 301), actionPage('Candidate 2', 302),
        ] } } };
      }
      if (url.includes('es.wikivoyage.org')) {
        if (params.action === 'parse' && params.prop === 'sections') {
          return { data: { parse: { title: 'Madrid', sections: [
            { index: '1', line: 'Ver' }, { index: '2', line: 'Comer' },
          ] } } };
        }
        if (params.action === 'parse' && params.prop === 'wikitext') {
          return { data: { parse: { title: 'Madrid', wikitext: {
            '*': 'La sección incluye [[w:es:Candidate 2|Candidate 2]].',
          } } } };
        }
        return { data: { batchcomplete: true, query: { pages: [actionPage('Madrid', 401)] } } };
      }
      throw new Error(`Unexpected request ${url} ${JSON.stringify(params)}`);
    });

    const snapshot = await captureWikimediaProminenceV6({
      cityKey: 'madrid', cityTitle: 'Madrid', language: 'es', entities,
      capturedAt: '2026-08-07T00:00:00.000Z',
      pageviewWindow: { start: '2025-08-07', end: '2026-08-06' },
      get,
      onProgress: (event) => progress.push(event),
    });

    expect(snapshot.candidates).toHaveLength(2);
    expect(snapshot.candidates[0]).toMatchObject({
      canonicalId: 'Q1', wikipediaTitle: 'Candidate 1', cityWikipediaLinked: true,
      wikivoyageSeeMentioned: false, sitelinks: 2, pageviews365: 100,
      pageviewPercentile: 0,
    });
    expect(snapshot.candidates[1]).toMatchObject({
      canonicalId: 'Q2', cityWikipediaLinked: false, wikivoyageSeeMentioned: true,
      wikivoyageSectionTitle: 'Ver', sitelinks: 1, pageviews365: 300,
      pageviewPercentile: 1,
    });
    expect(snapshot.sourceRevisions.map((revision) => revision.sourceId)).toEqual(expect.arrayContaining([
      'wikidata:Q1', 'wikidata:Q2', 'eswiki:Madrid', 'eswikivoyage:Madrid',
      'eswiki:Candidate 1', 'eswiki:Candidate 2',
    ]));
    expect(snapshot.candidates.every((candidate) => (
      candidate.support.length > 0
      && candidate.support.every((support) => support.supportId.startsWith(`${candidate.canonicalId}:`))
    ))).toBe(true);
    expect(validateWikimediaProminenceSnapshotV6(snapshot, entities, {
      cityKey: 'madrid', language: 'es',
    })).toEqual(snapshot);
    expect(get.mock.calls.filter(([url]) => url.includes('wikimedia.org/api/rest_v1')))
      .toHaveLength(3);
    expect(progress.filter((event) => event.event === 'stage_finished').map((event) => (
      event.event === 'stage_finished' ? event.stage : null
    ))).toEqual([
      'wikidata_entities',
      'city_wikipedia_revision',
      'city_wikipedia_links',
      'city_wikivoyage_revision',
      'wikivoyage_sections',
      'candidate_wikipedia_revisions',
      'candidate_pageviews',
    ]);
    expect(progress.filter((event) => event.event === 'pageview_finished')).toHaveLength(2);
    expect(progress.find((event) => event.event === 'request_retry')).toMatchObject({
      event: 'request_retry', status: 429, attempt: 1, waitMs: 0,
    });
  });

  it('rejects changed fingerprints and support IDs assigned to another identity', async () => {
    const get: WikimediaGetV6 = async (url, options) => {
      const params = options.params as Record<string, string>;
      if (url.includes('wikidata.org')) {
        expect(params.props).toBe('info|sitelinks');
        return { data: { success: 1, entities: {
          Q1: { id: 'Q1', lastrevid: 1, modified: '2026-08-05T00:00:00Z', sitelinks: {} },
          Q2: { id: 'Q2', lastrevid: 2, modified: '2026-08-05T00:00:00Z', sitelinks: {} },
        } } };
      }
      if (url.includes('es.wikipedia.org')) {
        return params.generator === 'links'
          ? { data: { batchcomplete: true, query: { pages: [] } } }
          : { data: { batchcomplete: true, query: { pages: [actionPage('Madrid', 3)] } } };
      }
      if (params.action === 'parse' && params.prop === 'sections') {
        return { data: { parse: { title: 'Madrid', sections: [] } } };
      }
      if (url.includes('es.wikivoyage.org')) {
        return { data: { batchcomplete: true, query: { pages: [actionPage('Madrid', 4)] } } };
      }
      throw new Error(`Unexpected request ${url}`);
    };
    const snapshot = await captureWikimediaProminenceV6({
      cityKey: 'madrid', cityTitle: 'Madrid', language: 'es', entities,
      capturedAt: '2026-08-07T00:00:00.000Z',
      pageviewWindow: { start: '2025-08-07', end: '2026-08-06' }, get,
    });

    expect(() => validateWikimediaProminenceSnapshotV6(
      { ...snapshot, fingerprint: 'changed' }, entities, { cityKey: 'madrid', language: 'es' }
    )).toThrow(/fingerprint/i);
    const contaminated = structuredClone(snapshot);
    contaminated.candidates[0].support[0].supportId = 'Q2:foreign';
    expect(() => validateWikimediaProminenceSnapshotV6(
      contaminated, entities, { cityKey: 'madrid', language: 'es' }
    )).toThrow(/owned/i);

    const relabelled = structuredClone(snapshot);
    relabelled.candidates[0].localName = entities[1].localName;
    expect(() => validateWikimediaProminenceSnapshotV6(
      relabelled, entities, { cityKey: 'madrid', language: 'es' }
    )).toThrow(/identity/i);
  });
});
