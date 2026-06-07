import express from 'express';
import { model } from '../llm/model';
import { GenerateTourRequest, GenerateTourResponse, TourStop } from '../types/api';

const router = express.Router();

const PLACE_GENERATION_MODEL = 'gemma4:26b';

const PLACE_NAME_PLACEHOLDERS = new Set([
  'place name',
  'place 1',
  'place 2',
  'location 1',
  'stop 1',
  'attraction 1',
  'unknown',
  'n/a'
]);

const PLACE_DESCRIPTION_PLACEHOLDERS = new Set([
  'brief description',
  'short factual description',
  'description 1',
  'description 2',
  'unknown',
  'n/a'
]);

function normalizePlaceholderText(value: string): string {
  return value.trim().toLowerCase();
}

function isPlaceholderPlace(place: TourStop): boolean {
  const normalizedName = normalizePlaceholderText(place.name);
  const normalizedDescription = normalizePlaceholderText(place.description);

  return (
    PLACE_NAME_PLACEHOLDERS.has(normalizedName) ||
    PLACE_DESCRIPTION_PLACEHOLDERS.has(normalizedDescription)
  );
}

router.post('/places', async (req, res) => {
  try {
    // Log raw request first
    console.log('\n=== Raw Request ===');
    console.log('Body:', req.body);

    // Add defaults
    const { 
      maxStops = 5,
      city, 
      country, 
      countryCode = 'ES', 
      duration = 240, // Increased from 120 to 240 minutes
      interests = [] 
    } = req.body as GenerateTourRequest;

    // Log processed request with defaults
    console.log('\n=== Processed Request ===');
    console.log('Parameters:', { maxStops, city, country, countryCode, duration, interests });

    // Handle the case when country is undefined
    const locationText = country ? `${city}, ${country}` : city;
    // Handle empty interests array
    const focusText = interests.length > 0 ? 
      `focused on ${interests.join(', ')}` : 
      'covering notable historic and cultural points';

    const prompt = `Generate up to ${maxStops} real places to visit in ${locationText} for a ${duration} minute walking tour ${focusText}.

Prefer exactly ${maxStops} places if enough real, public, verifiable places exist. If fewer real places are confidently known, return fewer places.

Requirements for every place:
- must be a real place, not invented
- must be public or visitor-accessible
- must be well-known enough to be verifiable
- must actually be located in ${locationText}
- must fit the requested interests/theme
- must be useful for a walking tour
- must have plausible coordinates inside the requested city
- description must be short and factual

Never return placeholders or fabricated entries such as "Place 1", "Description 1", "Unknown", or generic filler.

Return a JSON object with this schema:
- "places": array of objects, each with:
  - "name": string — real name of the place
  - "description": string — short factual description
  - "estimatedDuration": number — visit time in minutes
  - "coordinates": object with "lat" (number) and "lng" (number)`;

    console.log('\n=== Generation Request ===');
    console.log('Prompt:', prompt);

    for (let attempt = 1; attempt <= 2; attempt++) {
      console.log(`\n=== Generation Attempt ${attempt} ===`);
      const response = await model.complete({
        prompt,
        temperature: 0.2,
        num_predict: 1000,
        model: PLACE_GENERATION_MODEL,
        format: 'json'
      });

      console.log('\n=== LLM Response ===');
      console.log(response);

      if (!response.success || !response.content) {
        if (attempt === 2) {
          throw new Error(response.error || 'Failed to generate places');
        }
        console.warn('Generation attempt failed, retrying once.');
        continue;
      }

      try {
        const content = response.content.trim();
        console.log('\n=== Processing Response ===');
        console.log('Raw content:', content);

        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('No JSON content found in response');
        }

        // Clean up the JSON string by removing all '>' characters that might be in the response
        const jsonStr = jsonMatch[0].replace(/>/g, '');
        console.log('Extracted JSON:', jsonStr);

        const parsed = JSON.parse(jsonStr);
        console.log('Parsed response:', parsed);

        if (!Array.isArray(parsed.places)) {
          throw new Error('Invalid response format - places is not an array');
        }

        const shapeValidPlaces = validateAndCleanPlaces(parsed.places);
        const places = shapeValidPlaces.filter((place) => !isPlaceholderPlace(place));
        const placeholderRejected = shapeValidPlaces.length - places.length;

        console.log('Placeholder rejected count:', placeholderRejected);

        const totalDuration = places.reduce((sum, p) => sum + p.estimatedDuration, 0);
        if (totalDuration > duration) {
          console.warn(`Warning: Total duration ${totalDuration} exceeds requested duration ${duration}`);
        }

        if (places.length > maxStops) {
          console.log(`Warning: Generated ${places.length} places but only ${maxStops} were requested`);
          places.length = maxStops;
        }

        const placeholdersDominate =
          shapeValidPlaces.length > 0 && placeholderRejected >= Math.ceil(shapeValidPlaces.length / 2);

        if (places.length === 0 || placeholdersDominate) {
          console.warn('Placeholder-like generation detected.');
          if (attempt === 2) {
            throw new Error('Invalid place generation output from LLM');
          }
          continue;
        }

        console.log('Final places:', places);
        res.json({ places });
        return;

      } catch (parseError) {
        console.error('Failed to parse LLM response:', parseError);
        console.error('Response content:', response.content);
        if (attempt === 2) {
          throw new Error('Invalid response format from LLM');
        }
      }
    }

    throw new Error('Failed to generate places');

  } catch (error) {
    console.error('Generation error:', error);
    res.status(500).json({
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        details: error
      }
    });
  }
});

function validateAndCleanPlaces(places: any[]): TourStop[] {
  return places
    .filter(place => {
      const isValid = (
        typeof place?.name === 'string' &&
        typeof place?.description === 'string' &&
        typeof place?.estimatedDuration === 'number' &&
        typeof place?.coordinates?.lat === 'number' &&
        typeof place?.coordinates?.lng === 'number'
      );

      if (!isValid) {
        console.log('Filtered out invalid place:', place);
      }

      return isValid;
    })
    .map(place => ({
      name: place.name.trim(),
      description: place.description.trim(),
      estimatedDuration: Math.max(5, Math.min(180, place.estimatedDuration)),
      coordinates: {
        lat: place.coordinates.lat,
        lng: place.coordinates.lng
      }
    }));
}

export default router;
