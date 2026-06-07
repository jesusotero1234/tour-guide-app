import { dedupeByWikidata } from './dedupePois';
import { RawPoi } from './RawPoi';

function poi(overrides: Partial<RawPoi> & { osmType: RawPoi['osmType']; osmId: number }): RawPoi {
  return {
    name: overrides.name ?? 'POI',
    lat: overrides.lat ?? 40,
    lng: overrides.lng ?? -3,
    tags: overrides.tags ?? {},
    ...overrides,
  };
}

describe('dedupeByWikidata', () => {
  it('collapses elements sharing a wikidata id to one', () => {
    const input = [
      poi({ osmType: 'node', osmId: 1, name: 'Palacio Real', tags: { wikidata: 'Q171517', tourism: 'attraction' } }),
      poi({ osmType: 'relation', osmId: 2, name: 'Palacio Real de Madrid', tags: { wikidata: 'Q171517', tourism: 'museum', building: 'palace', historic: 'palace' } }),
    ];

    const result = dedupeByWikidata(input);

    expect(result).toHaveLength(1);
    expect(result[0].tags.wikidata).toBe('Q171517');
  });

  it('keeps the richer element (more tags), tie-breaking toward area geometry', () => {
    const node = poi({ osmType: 'node', osmId: 1, name: 'label', tags: { wikidata: 'Q1', tourism: 'attraction' } });
    const relation = poi({ osmType: 'relation', osmId: 2, name: 'building', tags: { wikidata: 'Q1', tourism: 'museum', building: 'palace', historic: 'palace' } });

    expect(dedupeByWikidata([node, relation])[0].osmId).toBe(2);
    expect(dedupeByWikidata([relation, node])[0].osmId).toBe(2);
  });

  it('breaks ties on equal tag count by geometry rank (relation > way > node)', () => {
    const node = poi({ osmType: 'node', osmId: 1, tags: { wikidata: 'Q1', tourism: 'attraction' } });
    const way = poi({ osmType: 'way', osmId: 2, tags: { wikidata: 'Q1', tourism: 'attraction' } });

    expect(dedupeByWikidata([node, way])[0].osmType).toBe('way');
  });

  it('never merges POIs without a wikidata tag', () => {
    const input = [
      poi({ osmType: 'node', osmId: 1, name: 'Plaza A', tags: { place: 'square' } }),
      poi({ osmType: 'node', osmId: 2, name: 'Plaza B', tags: { place: 'square' } }),
    ];

    expect(dedupeByWikidata(input)).toHaveLength(2);
  });

  it('preserves first-seen order of kept POIs', () => {
    const input = [
      poi({ osmType: 'relation', osmId: 1, name: 'First', tags: { wikidata: 'Q1' } }),
      poi({ osmType: 'node', osmId: 2, name: 'Second', tags: { wikidata: 'Q2' } }),
      poi({ osmType: 'node', osmId: 3, name: 'First-dup', tags: { wikidata: 'Q1' } }),
    ];

    const result = dedupeByWikidata(input);

    expect(result.map((p) => p.tags.wikidata)).toEqual(['Q1', 'Q2']);
  });
});
