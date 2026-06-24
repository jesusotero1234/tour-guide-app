import { getHistoryPlaceProfile } from './HistoryPlaceScoring';

describe('HistoryPlaceScoring', () => {
  it('does not treat a museum collection as a lived-history site just because it is monumental', () => {
    const profile = getHistoryPlaceProfile({
      name: 'Museo Arqueológico Nacional',
      tags: {
        name: 'Museo Arqueológico Nacional',
        tourism: 'museum',
        historic: 'monument',
        'canonical:instance_of': 'archaeological museum|monument|national museum',
        'canonical:sitelinks': '32',
        wikidata: 'Q1352282',
      },
    });

    expect(profile.isMuseumLike).toBe(true);
    expect(profile.isEventSiteLike).toBe(false);
    expect(profile.kinds).toContain('museum-container');
  });

  it('keeps a palace as a lived-history site even when Wikidata also labels it as a museum', () => {
    const profile = getHistoryPlaceProfile({
      name: 'Palacio Real',
      tags: {
        name: 'Palacio Real',
        tourism: 'attraction',
        historic: 'castle',
        'canonical:instance_of': 'palace|museum|official residence|royal palace',
        'canonical:sitelinks': '45',
        wikidata: 'Q171517',
      },
    });

    expect(profile.isMuseumLike).toBe(true);
    expect(profile.isEventSiteLike).toBe(true);
    expect(profile.kinds).toContain('power-site');
    expect(profile.kinds).not.toContain('museum-container');
  });

  it('keeps a historic house museum when the place itself is the historical site', () => {
    const profile = getHistoryPlaceProfile({
      name: 'Anne Frank Huis',
      tags: {
        name: 'Anne Frank Huis',
        tourism: 'museum',
        historic: 'memorial',
        'canonical:instance_of': 'war memorial|historic house museum',
        'canonical:sitelinks': '38',
        wikidata: 'Q165366',
      },
    });

    expect(profile.isMuseumLike).toBe(true);
    expect(profile.isEventSiteLike).toBe(true);
    expect(profile.kinds).toContain('museum-with-site-context');
    expect(profile.kinds).not.toContain('museum-container');
  });

  it('treats historic bridges as lived-history anchors', () => {
    const profile = getHistoryPlaceProfile({
      name: 'Karlův most',
      tags: {
        name: 'Karlův most',
        tourism: 'attraction',
        historic: 'yes',
        bridge: 'yes',
        'canonical:instance_of': 'stone bridge|tourist attraction',
        'canonical:sitelinks': '52',
        wikidata: 'Q204871',
      },
    });

    expect(profile.score).toBeGreaterThanOrEqual(15);
    expect(profile.isEventSiteLike).toBe(true);
    expect(profile.kinds).toContain('event-place');
  });
});
