import { featureToRawPoi, parseGeofabrikChecksum, parseOverpassFilter, selectStaticPois } from './StaticOsmPoiFallback';

const feature = (type: 'node' | 'way' | 'relation', id: number, tags: Record<string, string>, coordinates: unknown) => ({
  type: 'Feature', properties: { '@type': type, '@id': id, ...tags },
  geometry: { type: type === 'node' ? 'Point' : 'Polygon', coordinates },
});

describe('static OSM fallback selection', () => {
  it('binds a checksum to the same dated extract instead of trusting a stale latest mirror', () => {
    const resolved = 'https://download.geofabrik.de/europe/germany-260920.osm.pbf';
    expect(parseGeofabrikChecksum('305276093cb91433f6ca237b8c9ea7b1  germany-260920.osm.pbf\n', resolved))
      .toBe('305276093cb91433f6ca237b8c9ea7b1');
    expect(() => parseGeofabrikChecksum(
      '223a11dee00f0399bea70bbbb4feb953  germany-260919.osm.pbf\n', resolved
    )).toThrow('does not identify');
  });
  it('parses the exact filters used by the history query', () => {
    expect(parseOverpassFilter('way["building"~"^(cathedral|palace|castle)$"]["wikidata"]')).toMatchObject({
      osmType: 'way', clauses: [{ key: 'building', pattern: /cathedral/ }, { key: 'wikidata' }],
    });
    expect(() => parseOverpassFilter('nwr/historic')).toThrow('Unsupported');
  });

  it('converts geometry to the same center-style POI shape', () => {
    expect(featureToRawPoi(feature('way', 8, { name: 'Palace', building: 'palace' },
      [[[2, 40], [4, 40], [4, 42], [2, 40]]]))).toEqual({
      osmType: 'way', osmId: 8, name: 'Palace', lat: 41, lng: 3,
      tags: { name: 'Palace', building: 'palace' },
    });
  });

  it('applies AND clauses, regex values, deduplication and separate area/node limits', () => {
    const features = [
      feature('node', 1, { name: 'Node castle', historic: 'castle' }, [2, 40]),
      feature('node', 2, { name: 'Node palace', historic: 'palace' }, [2.1, 40.1]),
      feature('way', 3, { name: 'Historic museum', tourism: 'museum', wikidata: 'Q3' }, [[[2, 40], [3, 40], [2, 41], [2, 40]]]),
      feature('way', 3, { name: 'Duplicate', tourism: 'museum', wikidata: 'Q3' }, [[[2, 40], [3, 40], [2, 41], [2, 40]]]),
      feature('relation', 4, { name: 'Unlinked museum', tourism: 'museum' }, [[[[2, 40], [3, 40], [2, 41], [2, 40]]]]),
    ];
    expect(selectStaticPois(features, [
      'node["historic"~"^(castle|palace)$"]',
      'way["tourism"="museum"]["wikidata"]',
      'relation["tourism"="museum"]["wikidata"]',
    ], 1, 1).map(poi => `${poi.osmType}:${poi.osmId}`)).toEqual(['way:3', 'node:1']);
  });
});
