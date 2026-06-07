import axios from 'axios';
import { env } from '../config/env';
import { PlaceNames } from '../types/api';

interface TranslationRequest {
  places: Array<{
    english: string;
    country: string;
    city: string;
  }>;
  targetType: 'osm';
}

interface TranslationResponse {
  translations: Array<{
    english: string;
    osm: string;
    alternatives: string[];
  }>;
}

export class TranslationService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = env.llmPodUrl;
  }

  async translatePlace(place: {
    english: string;
    city: string;
    country: string;
  }): Promise<PlaceNames> {
    try {
      console.log('\n=== Translation Request ===');
      console.log('Place:', place);
      console.log('Using LLM Pod URL:', this.baseUrl);

      const request: TranslationRequest = {
        places: [place],
        targetType: 'osm'
      };

      console.log('Request payload:', request);

      // Add timeout and retry configuration
      const response = await axios.post<TranslationResponse>(
        `${this.baseUrl}/translate/places`,
        request,
        {
          timeout: 5000, // 5 second timeout
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('\n=== Translation Response ===');
      console.log(response.data);

      if (!response.data?.translations?.[0]) {
        throw new Error('No translation received from LLM pod');
      }

      const translation = response.data.translations[0];
      const result: PlaceNames = {
        english: translation.english,
        local: translation.osm,
        alternatives: translation.alternatives
      };

      console.log('Translated result:', result);
      return result;

    } catch (error) {
      console.error('\n=== Translation Error ===');
      console.error('Failed to translate:', place);
      console.error('Error:', error);

      // Fall back to English name if translation fails
      console.log('Falling back to English name');
      return {
        english: place.english,
        local: place.english,
        alternatives: [place.english]
      };
    }
  }

  async translatePlaces(places: Array<{
    english: string;
    city: string;
    country: string;
  }>): Promise<PlaceNames[]> {
    try {
      console.log('\n=== Batch Translation Request ===');
      console.log('Places:', places);

      const request: TranslationRequest = {
        places,
        targetType: 'osm'
      };

      console.log('Request payload:', request);

      console.log('Using LLM Pod URL:', this.baseUrl);

      // Add timeout and retry configuration
      const response = await axios.post<TranslationResponse>(
        `${this.baseUrl}/translate/places`,
        request,
        {
          timeout: 5000, // 5 second timeout
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('\n=== Batch Translation Response ===');
      console.log(response.data);

      if (!response.data?.translations) {
        throw new Error('No translations received from LLM pod');
      }

      const results = response.data.translations.map(t => ({
        english: t.english,
        local: t.osm,
        alternatives: t.alternatives
      }));

      console.log('Translated results:', results);
      return results;

    } catch (error) {
      console.error('\n=== Batch Translation Error ===');
      console.error('Failed to translate places:', places);
      console.error('Error:', error);

      // Fall back to English names if translation fails
      console.log('Falling back to English names');
      return places.map(p => ({
        english: p.english,
        local: p.english,
        alternatives: [p.english]
      }));
    }
  }
}

export const translationService = new TranslationService();
