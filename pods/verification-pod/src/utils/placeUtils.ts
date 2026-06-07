import { OpenStreetMapResult, PlaceCategory } from '../types/api';

const EARTH_RADIUS_KM = 6371;

/**
 * Calculate distance between two points using Haversine formula
 */
export function calculateDistance(
  lat1: number, 
  lon1: number, 
  lat2: number, 
  lon2: number
): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const lat1Rad = toRad(lat1);
  const lat2Rad = toRad(lat2);

  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.sin(dLon/2) * Math.sin(dLon/2) * 
    Math.cos(lat1Rad) * Math.cos(lat2Rad);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  
  // Convert to meters
  return EARTH_RADIUS_KM * c * 1000;
}

/**
 * Convert degrees to radians
 */
function toRad(degrees: number): number {
  return degrees * Math.PI / 180;
}

/**
 * Determine place category from OSM data
 */
export function determinePlaceCategory(place: OpenStreetMapResult): PlaceCategory {
  // Check tourism places first
  if (
    place.tourism === 'attraction' ||
    place.tourism === 'viewpoint' ||
    place.tourism === 'zoo' ||
    place.tourism === 'theme_park'
  ) {
    return 'tourist';
  }

  // Check historical places
  if (
    place.historic ||
    place.class === 'historic' ||
    place.type === 'monument' ||
    place.type === 'castle' ||
    place.type === 'ruins'
  ) {
    return 'historical';
  }

  // Check religious places
  if (
    place.amenity === 'place_of_worship' ||
    place.building === 'church' ||
    place.building === 'cathedral' ||
    place.building === 'mosque' ||
    place.building === 'temple'
  ) {
    return 'religious';
  }

  // Check natural places
  if (
    place.leisure === 'park' ||
    place.leisure === 'garden' ||
    place.natural ||
    place.type === 'viewpoint'
  ) {
    return 'natural';
  }

  // Check other tourist/cultural places
  if (
    place.tourism === 'museum' ||
    place.tourism === 'gallery' ||
    place.amenity === 'theatre' ||
    place.amenity === 'arts_centre' ||
    place.amenity === 'cinema'
  ) {
    return 'tourist';
  }

  return 'other';
}

/**
 * Check if a place is likely to be interesting
 */
export function isInterestingPlace(place: OpenStreetMapResult): boolean {
  // Check essential tags
  if (place.tourism || place.historic || place.leisure === 'park') {
    return true;
  }

  // Check amenities
  if (
    place.amenity && [
      'place_of_worship',
      'theatre',
      'arts_centre',
      'museum'
    ].includes(place.amenity)
  ) {
    return true;
  }

  // Check if place has Wikipedia or Wikidata entries
  if (place.wikipedia || place.wikidata) {
    return true;
  }

  // Check buildings
  if (
    place.building && [
      'church',
      'cathedral',
      'castle',
      'palace',
      'monument'
    ].includes(place.building)
  ) {
    return true;
  }

  return false;
}

/**
 * Get the relative importance of a place
 */
export function getPlaceImportance(place: OpenStreetMapResult): number {
  let importance = place.importance || 0.5;

  // Boost importance for notable places
  if (place.wikipedia || place.wikidata) importance += 0.2;
  if (place.tourism === 'attraction') importance += 0.1;
  if (place.historic) importance += 0.1;
  if (place.class === 'tourism' || place.class === 'historic') importance += 0.1;

  // Normalize between 0 and 1
  return Math.min(Math.max(importance, 0), 1);
}

/**
 * Determine if a place is restricted or has limited access
 */
export function hasAccessRestriction(place: OpenStreetMapResult): boolean {
  if (place.access === 'private' || place.access === 'no') return true;
  if (place.tags?.access === 'private' || place.tags?.access === 'no') return true;
  
  // Check if it requires payment/tickets
  if (place.tags?.fee === 'yes' || place.tags?.entrance === 'ticket') return true;

  return false;
}
