import { 
  RouteStop, 
  RouteVerificationResponse, 
  ValidationError,
  PlaceVerificationRequest,
  OpenStreetMapResult,
  ErrorResponse,
  PlaceCategory
} from '../types/api';
import { calculateDistance } from '../utils/placeUtils';
import { checkDuplicates, calculateImportance } from '../utils/stopAnalysis';
import { placeService } from './places';
import { optimizeRoute } from '../utils/routeOptimization';

// Average walking speed in km/h
const WALKING_SPEED = 4;

// Maximum distance between stops in meters
const MAX_STOP_DISTANCE = 1000;

// Average time at each stop in minutes
const STOP_DURATION = 20;

/**
 * Detect place category from OSM tags
 * This approach is language-independent and works for any country
 */
function getCategoryFromOSM(osmData: any): PlaceCategory {
  // Extract all possible tags from the OSM data
  const tags = {
    // Direct OSM tags
    tourism: osmData.tourism,
    historic: osmData.historic,
    amenity: osmData.amenity,
    leisure: osmData.leisure,
    building: osmData.building,
    natural: osmData.natural,
    heritage: osmData.heritage,
    
    // From nested tags
    ...(osmData.tags || {}),
    ...(osmData.extratags || {})
  };
  
  // Log detailed tag extraction for debugging
  console.log('\nExtracting category from OSM tags:', tags);

  // Religious places
  if (
    tags.amenity === 'place_of_worship' ||
    tags.building === 'church' ||
    tags.building === 'cathedral' ||
    tags.building === 'mosque' ||
    tags.building === 'synagogue' ||
    tags.building === 'temple' ||
    osmData.class === 'amenity' && osmData.type === 'place_of_worship'
  ) {
    console.log('Categorized as: religious (from OSM tags)');
    return 'religious';
  }

  // Historical places
  if (
    tags.historic ||
    tags.heritage ||
    tags.castle_type ||
    tags.ruins ||
    tags.archaeological_site ||
    osmData.class === 'historic'
  ) {
    console.log('Categorized as: historical (from OSM tags)');
    return 'historical';
  }

  // Tourist attractions
  if (
    tags.tourism === 'attraction' ||
    tags.tourism === 'museum' ||
    tags.tourism === 'gallery' ||
    tags.tourism === 'viewpoint' ||
    tags.tourism === 'artwork' ||
    osmData.class === 'tourism'
  ) {
    console.log('Categorized as: tourist (from OSM tags)');
    return 'tourist';
  }

  // Natural places
  if (
    tags.natural ||
    tags.leisure === 'park' ||
    tags.leisure === 'garden' ||
    osmData.class === 'leisure' && (osmData.type === 'park' || osmData.type === 'garden') ||
    osmData.class === 'natural'
  ) {
    console.log('Categorized as: natural (from OSM tags)');
    return 'natural';
  }

  // Palaces and significant buildings often tagged as historic but sometimes as buildings
  if (
    tags.building === 'palace' ||
    tags.building === 'castle' ||
    tags.building === 'manor'
  ) {
    console.log('Categorized as: historical (from building type)');
    return 'historical';
  }

  // Public squares and plazas are typically tourist attractions
  if (
    osmData.type === 'square' ||
    osmData.type === 'plaza' ||
    tags.place === 'square'
  ) {
    console.log('Categorized as: tourist (from place type)');
    return 'tourist';
  }

  console.log('Categorized as: other (no specific tags matched)');
  return 'other';
}

/**
 * Convert verification details to OSM format
 */
function toOSMFormat(details: any): OpenStreetMapResult {
  // Get category from OSM tags
  const category = details.category || getCategoryFromOSM(details);
  console.log('\nDetected category:', category, 'for', details.name);

  // Initialize OSM attributes based on category
  let osmClass = 'place';
  let osmType = 'point';
  let tourismTag: string | undefined;
  let historicTag: string | undefined;
  let amenityTag: string | undefined;

  // Map categories to OSM attributes
  switch(category) {
    case 'tourist':
      osmClass = 'tourism';
      osmType = 'attraction';
      tourismTag = 'attraction';
      break;
    case 'historical':
      osmClass = 'historic';
      osmType = 'monument';
      historicTag = 'yes';
      break;
    case 'religious':
      osmClass = 'amenity';
      osmType = 'place_of_worship';
      amenityTag = 'place_of_worship';
      break;
    case 'natural':
      osmClass = 'leisure';
      osmType = 'park';
      break;
  }

  // Ensure we have the proper name
  const placeName = details.names?.local || details.name;

  // Build display name - make sure place name is first
  const displayName = [
    placeName,
    details.city,
    details.country
  ].filter(Boolean).join(', ');

  // Build base tags
  const tags: Record<string, string> = {
    name: placeName,
    'name:en': details.names?.english || details.name,
    category
  };

  // Add type-specific tags
  if (tourismTag) tags.tourism = tourismTag;
  if (historicTag) tags.historic = historicTag;
  if (amenityTag) tags.amenity = amenityTag;
  if (details.wikidata) tags.wikidata = details.wikidata;
  if (details.wikipedia) tags.wikipedia = details.wikipedia;

  // Build base OSM result
  const osmResult: OpenStreetMapResult = {
    place_id: parseInt(details.osmId),
    osm_id: details.osmId,
    osm_type: 'node',
    lat: details.coordinates.lat.toString(),
    lon: details.coordinates.lng.toString(),
    display_name: displayName,
    class: osmClass,
    type: osmType,
    importance: details.confidence || 0.5,
    address: {
      country: details.country || 'Unknown',
      city: details.city
    },
    tags,
    extratags: {
      importance: details.confidence?.toString() || '0.5',
      category
    }
  };

  // Add type-specific root level tags
  if (tourismTag) osmResult.tourism = tourismTag;
  if (historicTag) osmResult.historic = historicTag;
  if (amenityTag) osmResult.amenity = amenityTag;

  console.log('\nBuilding OSM data:', {
    name: displayName,
    class: osmClass,
    type: osmType,
    category,
    tags: {
      tourism: tourismTag,
      historic: historicTag,
      amenity: amenityTag
    }
  });

  return osmResult;
}

/**
 * Create standard error response
 */
function createError(code: ErrorResponse['error']['code'], message: string, details?: any): ErrorResponse {
  return {
    error: {
      code,
      message,
      details: details ? { message: details } : undefined
    }
  };
}

/**
 * Verify and optimize a tour route
 */
export async function verifyRoute(
  stops: RouteStop[], 
  duration: number,
  city: string,
  country: string,
  countryCode: string
): Promise<RouteVerificationResponse> {
  try {
    const validationErrors: ValidationError[] = [];
    const verifiedStops: RouteVerificationResponse['details']['stops'] = [];
    const stopDurations: number[] = [];
    const distances: number[] = [];

    // Verify each stop
    for (let i = 0; i < stops.length; i++) {
      const stop = stops[i];
      try {
        const result = await placeService.verifyPlace({
          name: stop.name,
          coordinates: {
            lat: stop.lat,
            lng: stop.lng
          },
          city,
          country,
          countryCode
        });

        if (!result.valid) {
          validationErrors.push({
            type: 'INVALID_LOCATION',
            message: `Invalid location: ${stop.name}`,
            stopIndexes: [i]
          });
          continue;
        }

        if (result.details?.osmId) {
          // Create OSM data with place details
          const osmData = toOSMFormat({
            ...result.details,
            name: stop.name,
            names: result.names,
            city,
            country
          });

          console.log('\nCalculating importance for:', osmData.display_name);
          console.log('Using OSM data:', {
            class: osmData.class,
            type: osmData.type,
            tourism: osmData.tourism,
            historic: osmData.historic,
            amenity: osmData.amenity,
            tags: osmData.tags
          });

          // Calculate importance using non-async version
          const importanceResult = calculateImportance(osmData);
          console.log('Importance calculation result:', {
            score: importanceResult.score,
            tags: importanceResult.osmTags,
            isTourist: importanceResult.isTouristAttraction,
            isHistorical: importanceResult.isHistorical
          });
          
          // Check for duplicates
          const duplicate = checkDuplicates(stop, stops.slice(0, i));

          verifiedStops.push({
            original: {
              ...stop,
              names: result.names
            },
            importance: importanceResult.score,
            ...(duplicate.isDuplicate && { duplicateOf: duplicate.originalStop }),
            osmCoordinates: result.details.coordinates
          });

          if (duplicate.isDuplicate) {
            validationErrors.push({
              type: 'DUPLICATE',
              message: `Stop "${stop.name}" is too similar to "${duplicate.originalStop}"`,
              stopIndexes: [i]
            });
          }
        }

        stopDurations.push(STOP_DURATION);
      } catch (error) {
        console.error(`Error verifying stop ${stop.name}:`, error);
        validationErrors.push({
          type: 'INVALID_LOCATION',
          message: `Failed to verify stop: ${stop.name}`,
          stopIndexes: [i]
        });
      }
    }

    // Calculate distances between consecutive stops using OSM coordinates
    for (let i = 0; i < verifiedStops.length - 1; i++) {
      const current = verifiedStops[i].osmCoordinates || verifiedStops[i].original;
      const next = verifiedStops[i + 1].osmCoordinates || verifiedStops[i + 1].original;

      const distance = calculateDistance(
        current.lat,
        current.lng,
        next.lat,
        next.lng
      );

      if (distance > MAX_STOP_DISTANCE) {
        validationErrors.push({
          type: 'DISTANCE',
          message: `Distance between stops ${i + 1} and ${i + 2} exceeds maximum (${distance.toFixed(0)}m)`,
          stopIndexes: [i, i + 1]
        });
      }

      distances.push(distance);
    }

    // Calculate total walking time
    const totalDistance = distances.reduce((sum, d) => sum + d, 0);
    const walkingTime = (totalDistance / 1000) / WALKING_SPEED * 60; // Convert to minutes

    // Check if total duration is feasible
    const totalStopTime = stopDurations.reduce((sum, d) => sum + d, 0);
    const totalTime = walkingTime + totalStopTime;

    if (totalTime > duration) {
      validationErrors.push({
        type: 'DURATION',
        message: `Route takes ${totalTime.toFixed(0)} minutes, exceeds specified duration of ${duration} minutes`
      });
    }

    // Try to optimize route if needed
    let optimizedOrder = undefined;
    if (validationErrors.some(e => e.type === 'DISTANCE')) {
      optimizedOrder = stops.length > 0 ? optimizeRoute(stops) : undefined;
      if (optimizedOrder) {
        const improvement = calculateImprovement(stops, optimizedOrder);
        if (improvement > 0.1) { // If more than 10% improvement
          validationErrors.push({
            type: 'DISTANCE',
            message: `Route order could be optimized to reduce total distance by ${(improvement * 100).toFixed(1)}%`
          });
        }
      }
    }

    return {
      valid: validationErrors.length === 0,
      totalWalkingDistance: totalDistance,
      totalWalkingTime: walkingTime,
      numStops: stops.length,
      details: {
        stopDistances: distances,
        averageDistance: distances.length > 0 ? totalDistance / distances.length : 0,
        stopDurations,
        stops: verifiedStops,
        optimizedOrder,
        validationErrors
      }
    };

  } catch (error) {
    console.error('Route verification error:', error);
    throw createError(
      'INTERNAL_ERROR',
      'Failed to verify route',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

/**
 * Calculate potential improvement from route optimization
 */
function calculateImprovement(original: RouteStop[], optimized: RouteStop[]): number {
  if (!optimized || optimized.length === 0) return 0;
  
  const originalDistance = calculateTotalDistance(original);
  const optimizedDistance = calculateTotalDistance(optimized);
  return (originalDistance - optimizedDistance) / originalDistance;
}

/**
 * Calculate total distance of a route
 */
function calculateTotalDistance(route: RouteStop[]): number {
  let total = 0;
  for (let i = 0; i < route.length - 1; i++) {
    total += calculateDistance(
      route[i].lat,
      route[i].lng,
      route[i + 1].lat,
      route[i + 1].lng
    );
  }
  return total;
}
