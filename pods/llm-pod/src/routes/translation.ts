import express from 'express';
import { model } from '../llm/model';
import { PlaceTranslationRequest, PlaceTranslationResponse, PlaceTranslation } from '../types/api';

const router = express.Router();

const TRANSLATION_MODEL = 'gemma4:26b';

router.post('/places', async (req, res) => {
  try {
    const { places } = req.body as PlaceTranslationRequest;

    // Log raw request first
    console.log('\n=== Raw Request ===');
    console.log('Places:', places);

    const placesString = places.map(p => 
      `- ${p.english} in ${p.city}, ${p.country}`
    ).join('\n');

    const prompt = `For these tourist places:
${placesString}

Get local names and OpenStreetMap names. Return a JSON object with this schema:
- "translations": array of objects, each with:
  - "english": string — the English name as provided
  - "osm": string — the primary local/OSM name
  - "alternatives": array of strings — alternative names`;

    console.log('\n=== Translation Request ===');
    console.log('Prompt:', prompt);

    const response = await model.complete({
      prompt,
      temperature: 0.2,
      num_predict: 1000,
      model: TRANSLATION_MODEL,
      format: 'json'
    });

    console.log('\n=== LLM Response ===');
    console.log(response);

    if (!response.success || !response.content) {
      throw new Error(response.error || 'Failed to generate translations');
    }

    try {
      const content = response.content.trim();
      console.log('\n=== Processing Response ===');
      console.log('Raw content:', content);

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON content found in response');
      }

      const jsonStr = jsonMatch[0];
      console.log('Extracted JSON:', jsonStr);

      const parsed = JSON.parse(jsonStr);
      console.log('Parsed response:', parsed);

      if (!Array.isArray(parsed.translations)) {
        throw new Error('Invalid response format - translations is not an array');
      }

      const translations = validateAndCleanTranslations(parsed.translations);
      console.log('Valid translations:', translations);
      res.json({ translations });

    } catch (parseError) {
      console.error('Failed to parse LLM response:', parseError);
      console.error('Response content:', response.content);
      throw new Error('Invalid response format from LLM');
    }

  } catch (error) {
    console.error('Translation error:', error);
    res.status(500).json({
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        details: error
      }
    });
  }
});

function validateAndCleanTranslations(translations: any[]): PlaceTranslation[] {
  return translations
    .filter(translation => {
      const isValid = (
        typeof translation?.english === 'string' &&
        typeof translation?.osm === 'string' &&
        Array.isArray(translation?.alternatives) &&
        translation.alternatives.every((alt: any) => typeof alt === 'string')
      );

      if (!isValid) {
        console.log('Filtered out invalid translation:', translation);
      }

      return isValid;
    })
    .map(translation => ({
      english: translation.english.trim(),
      osm: translation.osm.trim(),
      alternatives: translation.alternatives.map((alt: string) => alt.trim())
    }));
}

export default router;
