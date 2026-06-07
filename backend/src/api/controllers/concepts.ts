import { Request, Response } from 'express';
import { conceptDiscoveryService } from '../../services/cityIntelligence/ConceptDiscoveryService';

function getQueryParam(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export async function getCityConcepts(req: Request, res: Response) {
  try {
    const city = req.params.city;
    const countryCode = getQueryParam(req.query.countryCode) || getQueryParam(req.query.country);
    const language = getQueryParam(req.query.language) || 'en';

    if (!city || !countryCode) {
      return res.status(400).json({
        error: {
          code: 'INVALID_CONCEPT_QUERY',
          message: 'city path param and countryCode query param are required',
        },
      });
    }

    const result = await conceptDiscoveryService.getCityConcepts({ city, countryCode, language, includeLowConfidence: false });
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error getting city concepts:', error);
    res.status(500).json({
      error: {
        code: 'CITY_CONCEPT_DISCOVERY_ERROR',
        message: 'Failed to discover city concepts',
      },
    });
  }
}

export async function getAllCityConcepts(req: Request, res: Response) {
  try {
    const city = req.params.city;
    const countryCode = getQueryParam(req.query.countryCode) || getQueryParam(req.query.country);
    const language = getQueryParam(req.query.language) || 'en';

    if (!city || !countryCode) {
      return res.status(400).json({
        error: {
          code: 'INVALID_CONCEPT_QUERY',
          message: 'city path param and countryCode query param are required',
        },
      });
    }

    const result = await conceptDiscoveryService.getCityConcepts({ city, countryCode, language, includeLowConfidence: true });
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error getting all city concepts:', error);
    res.status(500).json({
      error: {
        code: 'CITY_CONCEPT_DISCOVERY_ERROR',
        message: 'Failed to discover city concepts',
      },
    });
  }
}
