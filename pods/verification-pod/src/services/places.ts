import axios from 'axios';
import stringSimilarity from 'string-similarity';
import { env } from '../config/env';
import { 
  PlaceVerificationRequest, 
  PlaceVerificationResponse, 
  PlaceCategory,
  PlaceAccessibility,
  OpenStreetMapResult 
} from '../types/api';
import { translationService } from './translation';

const PLACE_CONFIDENCE_THRESHOLD = 0.6; // Lowered from 0.8 to be more lenient with place matches
const DISTANCE_THRESHOLD_METERS = 500;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class PlaceService {
  private baseUrl: string;
  private lastRequestTime: number;

  constructor() {
    this.baseUrl = env.osmApiUrl;
    this.lastRequestTime = 0;
  }

  private async searchPlace(query: string, city: string, country: string): Promise<OpenStreetMapResult[]> {
    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < env.osmRequestDelay) {
      await sleep(env.osmRequestDelay - timeSinceLastRequest);
    }
    this.lastRequestTime = Date.now();

    // Build a free-form query string
    const fullQuery = `${query}, ${city}, ${country}`;
    console.log('\n=== OSM Search ===');
    console.log('Query:', fullQuery);

    try {
      const searchParams = new URLSearchParams({
        q: fullQuery,
        format: 'json',
        addressdetails: '1',
        namedetails: '1',
        extratags: '1',
        limit: '10'  // Increased limit since we're filtering post-query
      });

      const url = `${this.baseUrl}/search?${searchParams}`;
      console.log('URL:', url);

      const response = await axios.get<OpenStreetMapResult[]>(url);
      console.log('Found results:', response.data.length);
      
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('OSM search error:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          message: error.response?.data?.error?.message
        });
      } else {
        console.error('OSM search error:', error);
      }
      return [];
    }
  }

  /**
   * Get detailed OSM data for a specific place
   */
  private async getDetailedOsmData(osmId: string, osmType: string): Promise<OpenStreetMapResult | null> {
    try {
      // Rate limiting
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      if (timeSinceLastRequest < env.osmRequestDelay) {
        await sleep(env.osmRequestDelay - timeSinceLastRequest);
      }
      this.lastRequestTime = Date.now();
      
      console.log('\n=== OSM Details Query ===');
      console.log(`Fetching details for ${osmType}/${osmId}`);

      // Format OSM type correctly for the lookup endpoint
      const formattedOsmType = osmType === 'node' ? 'N' : 
                              osmType === 'way' ? 'W' : 
                              osmType === 'relation' ? 'R' : 'N';
      
      const lookupParams = new URLSearchParams({
        osm_ids: `${formattedOsmType}${osmId}`,
        format: 'json',
        addressdetails: '1',
        extratags: '1'
      });

      const url = `${this.baseUrl}/lookup?${lookupParams}`;
      console.log('URL:', url);

      const response = await axios.get<OpenStreetMapResult[]>(url);
      
      if (response.data && response.data.length > 0) {
        console.log('Found detailed OSM data');
        console.log('OSM tags:', response.data[0].extratags);
        return response.data[0];
      } else {
        console.log('No details found for OSM ID');
        return null;
      }
    } catch (error) {
      console.error('OSM details error:', error);
      return null;
    }
  }

  private filterResultsByLocation(
    results: OpenStreetMapResult[], 
    city: string, 
    countryCode: string
  ): OpenStreetMapResult[] {
    // If we have no results, just return empty array
    if (!results || results.length === 0) {
      console.log('No results to filter');
      return [];
    }

    // For debugging, log all received results
    console.log('Filtering results for:', { city, countryCode });
    
    const filteredResults = results.filter(place => {
      console.log('\nEvaluating place:', place.display_name);
      
      // Check country match (case insensitive)
      const placeCountryCode = place.address?.country_code?.toLowerCase() || '';
      const expectedCountryCode = countryCode.toLowerCase();
      const countryMatch = placeCountryCode.includes(expectedCountryCode) || 
                           expectedCountryCode.includes(placeCountryCode);
      
      console.log('Country codes:', { 
        place: placeCountryCode, 
        expected: expectedCountryCode, 
        match: countryMatch 
      });

      // Get normalized search city name
      const normalizedCity = city.toLowerCase().trim();
      
      // City match - collect all possible city fields
      const cityFieldValues: string[] = [
        place.address?.city,
        place.address?.town,
        place.address?.village,
        place.address?.municipality,
        place.address?.quarter,
        place.address?.suburb,
        place.address?.hamlet,
        place.address?.state
      ].filter(Boolean) as string[];  // Remove undefined/null values
      
      // Add the first part of display_name as it often contains the place name
      const displayNameParts = place.display_name.split(',');
      if (displayNameParts.length > 0) {
        cityFieldValues.push(displayNameParts[0]);
      }
      
      // Normalize all city field values (lowercase, trim)
      const normalizedCityFields = cityFieldValues.map(field => 
        field?.toLowerCase().trim()
      );
      
      console.log('City fields:', normalizedCityFields);
      
      // Several approaches to match cities:
      // 1. Exact match
      const exactMatch = normalizedCityFields.some(field => 
        field === normalizedCity
      );
      
      // 2. Includes match (city name is part of the field or field is part of city name)
      const includesMatch = normalizedCityFields.some(field => 
        field?.includes(normalizedCity) || normalizedCity.includes(field || '')
      );
      
      // 3. First part match (first word matches)
      const firstWordMatch = normalizedCityFields.some(field => {
        const fieldFirstWord = field?.split(/\s+/)[0];
        const cityFirstWord = normalizedCity.split(/\s+/)[0];
        return fieldFirstWord === cityFirstWord && cityFirstWord.length > 3; // At least 4 chars to avoid false positives
      });
      
      const cityMatch = exactMatch || includesMatch || firstWordMatch;
      
      console.log('City match evaluation:', { 
        exactMatch, 
        includesMatch, 
        firstWordMatch, 
        overallMatch: cityMatch 
      });

      // For now, we'll be a bit more lenient - if either country or city matches, we'll include it
      // We can make the match criteria more strict if needed
      const match = countryMatch || cityMatch;
      
      if (match) {
        console.log('✅ MATCHED place:', place.display_name);
      } else {
        console.log('❌ REJECTED place:', place.display_name);
      }
      
      return match;
    });
    
    console.log(`Filtered ${results.length} results down to ${filteredResults.length}`);
    return filteredResults;
  }

  private calculateConfidence(place: OpenStreetMapResult, query: string, request: PlaceVerificationRequest): number {
    let confidence = 0;

    // Base confidence from OSM importance (20%)
    confidence += (place.importance || 0.5) * 0.2;

    // Location match (35%)
    // More flexible city matching
    const cityFields = [
      place.address?.city,
      place.address?.town,
      place.address?.village,
      place.address?.municipality,
      place.address?.suburb,
      place.address?.hamlet
    ].filter(Boolean) as string[];
    
    const normalizedCity = request.city.toLowerCase().trim();
    
    // Check if any of the city fields partially match the request city
    const cityMatch = cityFields.some(field => {
      const normalized = field.toLowerCase().trim();
      return normalized.includes(normalizedCity) || 
             normalizedCity.includes(normalized) ||
             stringSimilarity.compareTwoStrings(normalized, normalizedCity) > 0.7;
    });

    if (cityMatch) {
      confidence += 0.2;
    }

    // Country code match - be a bit more flexible
    const placeCountryCode = place.address?.country_code?.toLowerCase() || '';
    const requestCountryCode = request.countryCode.toLowerCase();
    if (placeCountryCode === requestCountryCode) {
      confidence += 0.15; // Exact match
    } else if (placeCountryCode.includes(requestCountryCode) || 
               requestCountryCode.includes(placeCountryCode)) {
      confidence += 0.1; // Partial match
    }

    // Name similarity (45%) - increased weight for name matching
    const displayName = place.display_name.split(',')[0].toLowerCase(); // Get first part before comma
    const queryName = query.toLowerCase();
    const nameSimilarity = stringSimilarity.compareTwoStrings(queryName, displayName);
    
    console.log('Name similarity:', {
      query: queryName,
      name: displayName,
      similarity: nameSimilarity
    });
    
    confidence += nameSimilarity * 0.45;

    const finalConfidence = Math.min(confidence, 1);
    console.log('Confidence calculation:', {
      importance: (place.importance || 0.5) * 0.2,
      cityMatch: cityMatch ? 0.2 : 0,
      countryMatch: placeCountryCode === requestCountryCode ? 0.15 : 
                   (placeCountryCode.includes(requestCountryCode) || 
                    requestCountryCode.includes(placeCountryCode)) ? 0.1 : 0,
      nameSimilarity: nameSimilarity * 0.45,
      final: finalConfidence
    });

    return finalConfidence;
  }

  private async findBestMatch(
    query: string, 
    request: PlaceVerificationRequest
  ): Promise<{ match: OpenStreetMapResult | null, confidence: number }> {
    // Search with free-form query
    const results = await this.searchPlace(query, request.city, request.country);
    console.log('Total results before filtering:', results.length);

    // Filter results by location
    const filteredResults = this.filterResultsByLocation(
      results,
      request.city,
      request.countryCode
    );
    console.log('Results after location filtering:', filteredResults.length);

    let bestMatch: OpenStreetMapResult | null = null;
    let bestConfidence = 0;

    // Score filtered results
    for (const place of filteredResults) {
      const confidence = this.calculateConfidence(place, query, request);
      if (confidence > bestConfidence) {
        bestMatch = place;
        bestConfidence = confidence;
      }
    }

    if (bestMatch) {
      console.log('Best match:', {
        name: bestMatch.display_name,
        confidence: bestConfidence
      });

      // Enhance with detailed OSM data
      if (bestMatch.osm_id && bestMatch.osm_type) {
        const detailedData = await this.getDetailedOsmData(bestMatch.osm_id, bestMatch.osm_type);
        if (detailedData) {
          // Merge with existing data, preserving the original display name and confidence
          bestMatch = {
            ...bestMatch,
            ...detailedData,
            display_name: bestMatch.display_name,  // Keep the original display name
            importance: bestMatch.importance       // Keep the original importance
          };
        }
      }
    }

    return { match: bestMatch, confidence: bestConfidence };
  }

  private inferPlaceCategory(place: OpenStreetMapResult): PlaceCategory {
    // Log all available tags for debugging
    console.log('\n=== Place Category Detection ===');
    console.log('OSM type/class:', place.osm_type, place.class, place.type);
    console.log('Tags:', place.tags);
    console.log('Extratags:', place.extratags);
    
    // Extract all available tags from various sources
    const extraTags = place.extratags || {};
    const tags = place.tags || {};
    
    // Check for religious places
    if (
      place.amenity === 'place_of_worship' ||
      extraTags.amenity === 'place_of_worship' ||
      tags.amenity === 'place_of_worship' ||
      place.building === 'church' ||
      extraTags.building === 'church' ||
      tags.building === 'church' ||
      place.building === 'cathedral' ||
      extraTags.building === 'cathedral' ||
      tags.building === 'cathedral' ||
      place.building === 'mosque' ||
      extraTags.building === 'mosque' ||
      tags.building === 'mosque' ||
      place.building === 'synagogue' ||
      extraTags.building === 'synagogue' ||
      tags.building === 'synagogue' ||
      place.building === 'temple' ||
      extraTags.building === 'temple' ||
      tags.building === 'temple'
    ) {
      console.log('Categorized as: religious (from OSM tags)');
      return 'religious';
    }

    // Check for historical places
    if (
      place.historic ||
      extraTags.historic ||
      tags.historic ||
      extraTags.heritage ||
      tags.heritage ||
      extraTags.castle_type ||
      tags.castle_type ||
      extraTags.ruins ||
      tags.ruins ||
      extraTags.archaeological_site ||
      tags.archaeological_site ||
      place.class === 'historic' ||
      place.building === 'palace' ||
      extraTags.building === 'palace' ||
      tags.building === 'palace' ||
      place.building === 'castle' ||
      extraTags.building === 'castle' ||
      tags.building === 'castle' ||
      place.building === 'manor' ||
      extraTags.building === 'manor' ||
      tags.building === 'manor'
    ) {
      console.log('Categorized as: historical (from OSM tags)');
      return 'historical';
    }

    // Check for tourist attractions
    if (
      place.tourism === 'attraction' ||
      extraTags.tourism === 'attraction' ||
      tags.tourism === 'attraction' ||
      extraTags.tourism === 'museum' ||
      tags.tourism === 'museum' ||
      extraTags.tourism === 'gallery' ||
      tags.tourism === 'gallery' ||
      extraTags.tourism === 'viewpoint' ||
      tags.tourism === 'viewpoint' ||
      extraTags.tourism === 'artwork' ||
      tags.tourism === 'artwork' ||
      place.class === 'tourism' ||
      extraTags.place === 'square' ||
      tags.place === 'square' ||
      place.type === 'square'
    ) {
      console.log('Categorized as: tourist (from OSM tags)');
      return 'tourist';
    }

    // Check for natural places
    if (
      place.natural ||
      extraTags.natural ||
      tags.natural ||
      extraTags.leisure === 'park' ||
      tags.leisure === 'park' ||
      extraTags.leisure === 'garden' ||
      tags.leisure === 'garden' ||
      place.class === 'leisure' && (place.type === 'park' || place.type === 'garden') ||
      place.class === 'natural'
    ) {
      console.log('Categorized as: natural (from OSM tags)');
      return 'natural';
    }

    console.log('Categorized as: other (no specific tags matched)');
    return 'other';
  }

  private inferAccessibility(place: OpenStreetMapResult): PlaceAccessibility {
    if (place.access === 'private') return 'private';
    if (place.access === 'permissive' || place.access === 'restricted') return 'limited';
    if (place.access === 'yes' || place.access === 'public') return 'public';
    return 'unknown';
  }

  async verifyPlace(request: PlaceVerificationRequest): Promise<PlaceVerificationResponse> {
    try {
      console.log('\n=== Verify Place ===');
      console.log('Input:', {
        name: request.name,
        city: request.city,
        country: request.country
      });

      // Step 1: Get translations
      const translations = await translationService.translatePlace({
        english: request.name,
        city: request.city,
        country: request.country
      });

      console.log('Translations:', translations);

      // Step 2: Try each name variant
      const nameVariants = [translations.local, ...translations.alternatives];
      console.log('Trying variants:', nameVariants);

      let bestMatch: OpenStreetMapResult | null = null;
      let bestConfidence = 0;

      for (const name of nameVariants) {
        console.log(`\nTrying: "${name}"`);
        const { match, confidence } = await this.findBestMatch(name, request);
        
        if (match && confidence > bestConfidence) {
          bestMatch = match;
          bestConfidence = confidence;

          if (confidence >= PLACE_CONFIDENCE_THRESHOLD) {
            break;  // Found a good enough match
          }
        }
      }

      if (bestMatch && bestConfidence >= PLACE_CONFIDENCE_THRESHOLD) {
        console.log('Found valid match:', bestMatch.display_name);
        
        // Use enhanced category detection with all available tags
        const category = this.inferPlaceCategory(bestMatch);
        const accessibility = this.inferAccessibility(bestMatch);

        return {
          valid: true,
          exists: true,
          inCity: bestMatch.address?.city?.toLowerCase() === request.city.toLowerCase(),
          names: translations,
          details: {
            osmId: bestMatch.osm_id,
            type: `${bestMatch.class}:${bestMatch.type}`,
            confidence: bestConfidence,
            category,
            accessibility,
            coordinates: {
              lat: parseFloat(bestMatch.lat),
              lng: parseFloat(bestMatch.lon)
            }
          }
        };
      }

      // If we get here, no match was good enough
      console.log('No matches met confidence threshold');
      return {
        valid: false,
        exists: false,
        inCity: false,
        names: translations
      };

    } catch (error) {
      console.error('Place verification error:', error);
      throw error;
    }
  }
}

export const placeService = new PlaceService();
