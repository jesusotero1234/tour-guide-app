import { isEligibleForL1, isEligibleForL2, isEligibleForL3 } from './conceptRules';

describe('conceptRules', () => {
  const basePoi = {
    osmType: 'relation' as const,
    osmId: 1,
    name: 'Royal Palace',
    lat: 40.4168,
    lng: -3.7038,
    tags: {
      wikidata: 'Q1',
      wikipedia: 'es:Palacio_Real_de_Madrid',
      historic: 'palace',
      building: 'palace',
      tourism: 'attraction',
    },
  };

  it('accepts a notable historical poi into L1 and L2', () => {
    const input = {
      poi: basePoi,
      sitelinks: 25,
      instanceOfLabels: ['palace'],
      wikipediaBodyLength: 1400,
      landmarkTier: 'flagship',
    };

    expect(isEligibleForL1(input, 'historical')).toBe(true);
    expect(isEligibleForL2(input)).toBe(true);
  });

  it('rejects excluded historical entities from L1', () => {
    const input = {
      poi: { ...basePoi, tags: { ...basePoi.tags, historic: 'aircraft' } },
      sitelinks: 25,
      instanceOfLabels: ['spacecraft'],
      wikipediaBodyLength: 1400,
      landmarkTier: 'flagship',
    };

    expect(isEligibleForL1(input, 'historical')).toBe(false);
  });

  it('requires higher strength for L3 anchors', () => {
    const weak = {
      poi: basePoi,
      sitelinks: 6,
      instanceOfLabels: ['palace'],
      wikipediaBodyLength: 300,
      landmarkTier: 'major',
    };
    const strong = {
      poi: basePoi,
      sitelinks: 16,
      instanceOfLabels: ['palace'],
      wikipediaBodyLength: 1200,
      landmarkTier: 'flagship',
    };

    expect(isEligibleForL3(weak)).toBe(false);
    expect(isEligibleForL3(strong)).toBe(true);
  });
});
