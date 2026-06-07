import { THEME_TAG_MAP } from './themeTags';

describe('THEME_TAG_MAP food filters', () => {
  it('keeps food filters focused on food-relevant POIs', () => {
    expect(THEME_TAG_MAP.food.unionFilters).toEqual(expect.arrayContaining([
      'node["amenity"="marketplace"]',
      'way["amenity"="marketplace"]',
      'node["building"="marketplace"]',
      'way["building"="marketplace"]',
      'node["shop"~"^(bakery|pastry|cheese|wine|greengrocer)$"]',
      'way["shop"~"^(bakery|pastry|cheese|wine|greengrocer)$"]',
    ]));
    expect(THEME_TAG_MAP.food.unionFilters.join(' ')).not.toMatch(/tourism"="attraction/);
  });
});
