import { classifyPoiTags, hasPoiNotabilityTag } from './PoiClassification';

describe('classifyPoiTags', () => {
  it('classifies palace and castle landmarks', () => {
    expect(classifyPoiTags({ historic: 'palace' })).toBe('palace_castle');
    expect(classifyPoiTags({ building: 'castle' })).toBe('palace_castle');
  });

  it('classifies civic places before falling back to other', () => {
    expect(classifyPoiTags({ place: 'square' })).toBe('square_civic');
    expect(classifyPoiTags({ highway: 'pedestrian' })).toBe('square_civic');
  });

  it('classifies market, religious and museum categories', () => {
    expect(classifyPoiTags({ amenity: 'marketplace' })).toBe('market');
    expect(classifyPoiTags({ shop: 'bakery' })).toBe('market');
    expect(classifyPoiTags({ building: 'cathedral' })).toBe('religious');
    expect(classifyPoiTags({ tourism: 'museum' })).toBe('museum');
  });

  it('classifies commemorative and artwork POIs separately', () => {
    expect(classifyPoiTags({ historic: 'memorial' })).toBe('memorial');
    expect(classifyPoiTags({ tourism: 'artwork' })).toBe('artwork');
  });

  it('detects notability tags', () => {
    expect(hasPoiNotabilityTag({ wikidata: 'Q1' })).toBe(true);
    expect(hasPoiNotabilityTag({ wikipedia: 'en:Plaza_Mayor' })).toBe(true);
    expect(hasPoiNotabilityTag({ tourism: 'museum' })).toBe(false);
  });
});
