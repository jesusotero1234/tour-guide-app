import { OpenStreetMapResult, RouteStop } from '../types/api';
import { calculateDistance } from './placeUtils';

const DUPLICATE_DISTANCE_THRESHOLD = 100; // meters
const NAME_SIMILARITY_THRESHOLD = 0.8;  // 80% similarity

interface ImportanceResult {
  score: number;          // 0-1 based on tags
  osmTags: string[];      // Relevant tags found
  isTouristAttraction: boolean;
  isHistorical: boolean;
  hasWikiInfo: boolean;
}

interface DuplicateResult {
  isDuplicate: boolean;
  originalStop?: string;
}

/**
 * Calculate importance score for a place based on OSM tags
 */
export function calculateImportance(place: OpenStreetMapResult): ImportanceResult {
  console.log('\nAnalyzing tags for:', place.display_name);

  const tags = mergeTags(place);
  const relevantTags: string[] = [];
  let score = 0;

  // Base importance from class/type
  if (place.class === 'tourism') {
    score += 0.7;
    console.log('Added tourism class score:', 0.7);
    relevantTags.push('class=tourism');
  }
  if (place.class === 'historic') {
    score += 0.7;
    console.log('Added historic class score:', 0.7);
    relevantTags.push('class=historic');
  }
  if (place.class === 'amenity' && place.type === 'place_of_worship') {
    score += 0.7;
    console.log('Added religious building score:', 0.7);
    relevantTags.push('class=place_of_worship');
  }

  // Type-based scoring
  switch (place.type) {
    case 'attraction':
      score += 0.2;
      console.log('Added attraction type score:', 0.2);
      relevantTags.push('type=attraction');
      break;
    case 'monument':
    case 'castle':
    case 'palace':
      score += 0.3;
      console.log('Added monument/castle/palace score:', 0.3);
      relevantTags.push(`type=${place.type}`);
      break;
    case 'museum':
    case 'viewpoint':
      score += 0.2;
      console.log('Added museum/viewpoint score:', 0.2);
      relevantTags.push(`type=${place.type}`);
      break;
    case 'place_of_worship':
      score += 0.2;
      console.log('Added place_of_worship type score:', 0.2);
      relevantTags.push('type=place_of_worship');
      break;
  }

  // Tag-based bonuses
  const isTouristAttraction = Boolean(
    tags.tourism === 'attraction' ||
    tags.tourism === 'yes' ||
    place.class === 'tourism'
  );
  if (isTouristAttraction) {
    score += 0.1;
    console.log('Added tourist attraction bonus:', 0.1);
    relevantTags.push('tourism');
  }

  const isHistorical = Boolean(
    tags.historic ||
    place.class === 'historic' ||
    tags.heritage ||
    place.address?.neighbourhood?.toLowerCase().includes('historic') ||
    place.address?.quarter?.toLowerCase().includes('historic')
  );
  if (isHistorical) {
    score += 0.2;
    console.log('Added historical bonus:', 0.2);
    relevantTags.push('historic');
  }

  // Check for religious places
  const isReligious = Boolean(
    place.class === 'amenity' && place.type === 'place_of_worship' ||
    tags.amenity === 'place_of_worship' ||
    tags.building === 'church' ||
    tags.building === 'cathedral' ||
    tags.building === 'mosque' ||
    tags.building === 'synagogue' ||
    tags.building === 'temple'
  );
  if (isReligious) {
    score += 0.2;
    console.log('Added religious building bonus:', 0.2);
    relevantTags.push('religious');
  }

  // Check for square/plaza - important tourist spots
  const isSquare = Boolean(
    place.type === 'square' ||
    tags.place === 'square'
  );
  if (isSquare) {
    score += 0.2;
    console.log('Added square/plaza bonus:', 0.2);
    relevantTags.push('square');
  }

  // Information quality bonuses
  const hasWikiInfo = Boolean(tags.wikipedia || tags.wikidata);
  if (hasWikiInfo) {
    score += 0.2;
    console.log('Added wiki info bonus:', 0.2);
    relevantTags.push('wiki_info');
  }

  // Normalize score to 0-1
  score = Math.min(score, 1);
  console.log('Final normalized score:', score);

  return {
    score,
    osmTags: [...new Set(relevantTags)], // Remove duplicates
    isTouristAttraction,
    isHistorical,
    hasWikiInfo
  };
}

/**
 * Check if a stop is a duplicate of any previous stops
 */
export function checkDuplicates(stop: RouteStop, previousStops: RouteStop[]): DuplicateResult {
  for (const prevStop of previousStops) {
    // Check physical proximity
    const distance = calculateDistance(
      stop.lat,
      stop.lng,
      prevStop.lat,
      prevStop.lng
    );

    if (distance < DUPLICATE_DISTANCE_THRESHOLD) {
      // Check name similarity
      if (areNamesSimular(stop.name, prevStop.name)) {
        return {
          isDuplicate: true,
          originalStop: prevStop.name
        };
      }
    }
  }

  return { isDuplicate: false };
}

/**
 * Calculate similarity between two names
 */
function areNamesSimular(name1: string, name2: string): boolean {
  const norm1 = normalizeName(name1);
  const norm2 = normalizeName(name2);
  
  if (norm1 === norm2) return true;
  if (norm1.includes(norm2) || norm2.includes(norm1)) return true;
  
  return calculateSimilarity(norm1, norm2) > NAME_SIMILARITY_THRESHOLD;
}

/**
 * Normalize a place name for comparison
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[-]/g, '') // Remove diacritics
    .replace(/[^a-z0-9]/g, '');      // Remove non-alphanumeric
}

/**
 * Calculate Levenshtein distance similarity ratio
 */
function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1.0;
  
  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

/**
 * Calculate Levenshtein distance between strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str1.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= str2.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str1.length; i++) {
    for (let j = 1; j <= str2.length; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,  // substitution
          Math.min(
            matrix[i][j - 1] + 1,    // insertion
            matrix[i - 1][j] + 1     // deletion
          )
        );
      }
    }
  }

  return matrix[str1.length][str2.length];
}

/**
 * Merge OSM tags from various sources into a single object
 */
function mergeTags(place: OpenStreetMapResult): { [key: string]: string | undefined } {
  const merged = {
    tourism: place.tourism,
    historic: place.historic,
    amenity: place.amenity,
    leisure: place.leisure,
    building: place.building,
    access: place.access,
    opening_hours: place.opening_hours,
    ...place.tags,
    ...place.extratags
  };

  console.log('Merged tags:', merged);
  return merged;
}
