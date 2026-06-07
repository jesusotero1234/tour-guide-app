import { Request, Response } from 'express';
import { FlexiblePassQuoteRequest } from '../../types/api';
import { orchestrationService } from '../../services/orchestrationService';

function getQueryParam(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export async function listFlexiblePassCities(req: Request, res: Response) {
  try {
    const language = getQueryParam(req.query.language);
    const result = await orchestrationService.listFlexiblePassCities(language);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error listing flexible pass cities:', error);
    res.status(500).json({
      error: {
        code: 'FLEXIBLE_PASS_CITIES_ERROR',
        message: 'Failed to list flexible pass cities',
      },
    });
  }
}

export async function getFlexiblePassOptions(req: Request, res: Response) {
  try {
    const city = getQueryParam(req.query.city);
    const countryCode = getQueryParam(req.query.countryCode);
    const language = getQueryParam(req.query.language);

    if (!city || !countryCode || !language) {
      return res.status(400).json({
        error: {
          code: 'INVALID_FLEXIBLE_PASS_QUERY',
          message: 'city, countryCode, and language are required',
        },
      });
    }

    const result = await orchestrationService.getFlexiblePassOptions({ city, countryCode, language });
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error getting flexible pass options:', error);
    res.status(500).json({
      error: {
        code: 'FLEXIBLE_PASS_OPTIONS_ERROR',
        message: 'Failed to get flexible pass options',
      },
    });
  }
}

export async function quoteFlexiblePass(req: Request, res: Response) {
  try {
    const body = req.body as FlexiblePassQuoteRequest;
    if (!body.city || !body.countryCode || !body.language || !Array.isArray(body.tourIds)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_FLEXIBLE_PASS_QUOTE',
          message: 'city, countryCode, language, and tourIds are required',
        },
      });
    }

    const result = await orchestrationService.quoteFlexiblePass(body);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error quoting flexible pass:', error);
    if (error instanceof Error) {
      return res.status(400).json({
        error: {
          code: 'INVALID_FLEXIBLE_PASS_SELECTION',
          message: error.message,
        },
      });
    }
    res.status(500).json({
      error: {
        code: 'FLEXIBLE_PASS_QUOTE_ERROR',
        message: 'Failed to quote flexible pass',
      },
    });
  }
}
