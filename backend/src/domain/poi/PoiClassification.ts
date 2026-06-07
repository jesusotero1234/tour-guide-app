import { RawPoi } from './RawPoi';

const FOOD_SHOP_VALUES = new Set(['bakery', 'pastry', 'cheese', 'wine', 'greengrocer']);

export type PoiCategory =
  | 'palace_castle'
  | 'square_civic'
  | 'market'
  | 'religious'
  | 'museum'
  | 'memorial'
  | 'artwork'
  | 'other';

export function hasPoiNotabilityTag(tags: RawPoi['tags']): boolean {
  return Boolean(tags.wikidata || tags.wikipedia);
}

export function classifyPoiTags(tags: RawPoi['tags']): PoiCategory {
  if (
    tags.historic === 'castle'
    || tags.historic === 'palace'
    || tags.building === 'castle'
    || tags.building === 'palace'
  ) {
    return 'palace_castle';
  }

  if (tags.historic === 'memorial') {
    return 'memorial';
  }

  if (tags.tourism === 'artwork') {
    return 'artwork';
  }

  if (tags.place === 'square' || tags.highway === 'pedestrian') {
    return 'square_civic';
  }

  if (
    tags.amenity === 'marketplace'
    || tags.building === 'marketplace'
    || (typeof tags.shop === 'string' && FOOD_SHOP_VALUES.has(tags.shop))
  ) {
    return 'market';
  }

  if (
    tags.building === 'church'
    || tags.building === 'cathedral'
    || tags.building === 'basilica'
    || tags.amenity === 'place_of_worship'
  ) {
    return 'religious';
  }

  if (tags.tourism === 'museum') {
    return 'museum';
  }

  return 'other';
}
