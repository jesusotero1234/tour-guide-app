import { RawPoi } from '../../domain/poi/RawPoi';
import {
  canonicalBindingToRawPoi,
  mergeCanonicalWikidataPois,
} from './WikidataCanonicalPoiFetcher';

describe('WikidataCanonicalPoiFetcher', () => {
  it('converts high-sitelink historical bindings into synthetic raw POIs', () => {
    const poi = canonicalBindingToRawPoi({
      item: { value: 'http://www.wikidata.org/entity/Q82425' },
      itemLabel: { value: 'Brandenburg Gate' },
      coord: { value: 'Point(13.377704 52.516272)' },
      sitelinks: { value: '145' },
      instanceLabels: { value: 'city gate|monument|tourist attraction' },
    });

    expect(poi).not.toBeNull();
    expect(poi?.tags.wikidata).toBe('Q82425');
    expect(poi?.tags.historic).toBe('city_gate');
    expect(poi?.tags['canonical:source']).toBe('wikidata-sparql');
  });

  it('filters museum-only bindings that are not lived history sites', () => {
    const poi = canonicalBindingToRawPoi({
      item: { value: 'http://www.wikidata.org/entity/Q1' },
      itemLabel: { value: 'Collection Museum' },
      coord: { value: 'Point(13.39 52.52)' },
      sitelinks: { value: '90' },
      instanceLabels: { value: 'museum' },
    });

    expect(poi).toBeNull();
  });

  it('filters abstract events even when Wikidata gives them coordinates', () => {
    const poi = canonicalBindingToRawPoi({
      item: { value: 'http://www.wikidata.org/entity/Q153992' },
      itemLabel: { value: 'Reichstag fire' },
      coord: { value: 'Point(13.376111 52.518611)' },
      sitelinks: { value: '56' },
      instanceLabels: { value: 'arson' },
    });

    expect(poi).toBeNull();
  });

  it('keeps historically important structures even when they represent an event story', () => {
    const poi = canonicalBindingToRawPoi({
      item: { value: 'http://www.wikidata.org/entity/Q5086' },
      itemLabel: { value: 'Berlin Wall' },
      coord: { value: 'Point(13.3903 52.5076)' },
      sitelinks: { value: '140' },
      instanceLabels: { value: 'tourist attraction|separation barrier|destroyed building or structure' },
    });

    expect(poi).not.toBeNull();
    expect(poi?.tags.historic).toBe('citywalls');
  });

  it('merges canonical Wikidata signals into existing OSM POIs without duplicating identities', () => {
    const existing: RawPoi = {
      osmType: 'way',
      osmId: 123,
      name: 'Existing Gate',
      lat: 52.5,
      lng: 13.3,
      tags: {
        name: 'Existing Gate',
        wikidata: 'Q82425',
        historic: 'yes',
        tourism: 'attraction',
      },
    };
    const canonical: RawPoi = {
      osmType: 'node',
      osmId: -82425,
      name: 'Brandenburg Gate',
      lat: 52.516272,
      lng: 13.377704,
      tags: {
        name: 'Brandenburg Gate',
        wikidata: 'Q82425',
        historic: 'city_gate',
        'canonical:source': 'wikidata-sparql',
        'canonical:sitelinks': '145',
        'canonical:instance_of': 'city gate|monument',
      },
    };

    const merged = mergeCanonicalWikidataPois([existing], [canonical]);

    expect(merged).toHaveLength(1);
    expect(merged[0].osmType).toBe('way');
    expect(merged[0].tags.name).toBe('Existing Gate');
    expect(merged[0].tags.historic).toBe('city_gate');
    expect(merged[0].tags['canonical:sitelinks']).toBe('145');
  });
});
