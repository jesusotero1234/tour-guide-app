import { Request, Response, NextFunction } from 'express';
import { ConceptTourRequest, TourRequest } from '../../types/api';

export function validateTourRequest(req: Request, res: Response, next: NextFunction) {
  const body = req.body as Partial<TourRequest> & { duration?: number; durationMinutes?: number };
  const { city, country, countryCode, theme, language } = body;

  const durationMinutes = body.durationMinutes ?? body.duration;

  if (!city || typeof city !== 'string') {
    return res.status(400).json({
      error: {
        code: 'INVALID_CITY',
        message: 'City is required and must be a string'
      }
    });
  }

  if (!theme || typeof theme !== 'string') {
    return res.status(400).json({
      error: {
        code: 'INVALID_THEME',
        message: 'Theme is required and must be a string'
      }
    });
  }

  if (!country || typeof country !== 'string') {
    return res.status(400).json({
      error: {
        code: 'INVALID_COUNTRY',
        message: 'Country is required and must be a string'
      }
    });
  }

  if (!countryCode || typeof countryCode !== 'string' || !/^[A-Z]{2}$/.test(countryCode)) {
    return res.status(400).json({
      error: {
        code: 'INVALID_COUNTRY_CODE',
        message: 'countryCode is required and must be an ISO-2 uppercase code'
      }
    });
  }

  if (language && typeof language !== 'string') {
    return res.status(400).json({
      error: {
        code: 'INVALID_LANGUAGE',
        message: 'Language must be a string when provided'
      }
    });
  }

  if (typeof durationMinutes !== 'number' || Number.isNaN(durationMinutes) || durationMinutes <= 0) {
    return res.status(400).json({
      error: {
        code: 'INVALID_DURATION_MINUTES',
        message: 'durationMinutes is required and must be a positive number'
      }
    });
  }

  // Add validated data to request
  req.body.language = language || 'en';
  req.body.durationMinutes = durationMinutes;

  next();
}

export function validateCodexTourRequest(req: Request, res: Response, next: NextFunction) {
  const { tourLocale, enabledTourLanguages } = require('../../services/tourReadiness/TourLanguage') as typeof import('../../services/tourReadiness/TourLanguage');
  const supported = enabledTourLanguages();
  const body = req.body as Partial<TourRequest>;
  let language: string;
  try { language = tourLocale(typeof body.language === 'string' ? body.language : ''); }
  catch { language = ''; }
  if (typeof body.city !== 'string' || !body.city.trim()
    || typeof body.country !== 'string' || !body.country.trim()
    || body.theme !== 'history' || ![60, 120, 180, 240].includes(body.durationMinutes ?? 0)
    || !supported.some(value => value === language)) {
    return res.status(400).json({ error: {
      code: 'UNSUPPORTED_TOUR_REQUEST',
      message: 'Choose a city and country, history, a supported duration (60, 120, 180 or 240 minutes), and language: ' + supported.join(', ') + '.',
    } });
  }
  req.body.language = language;
  delete req.body.destination;
  delete req.body.blueprintRevision;
  next();
}

export function validateConceptTourRequest(req: Request, res: Response, next: NextFunction) {
  const body = req.body as Partial<ConceptTourRequest>;
  const { conceptSlug, city, country, countryCode, language } = body;

  if (!conceptSlug || typeof conceptSlug !== 'string') {
    return res.status(400).json({
      error: {
        code: 'INVALID_CONCEPT_SLUG',
        message: 'conceptSlug is required and must be a string'
      }
    });
  }

  if (!city || typeof city !== 'string') {
    return res.status(400).json({
      error: {
        code: 'INVALID_CITY',
        message: 'City is required and must be a string'
      }
    });
  }

  if (!country || typeof country !== 'string') {
    return res.status(400).json({
      error: {
        code: 'INVALID_COUNTRY',
        message: 'Country is required and must be a string'
      }
    });
  }

  if (!countryCode || typeof countryCode !== 'string' || !/^[A-Z]{2}$/.test(countryCode)) {
    return res.status(400).json({
      error: {
        code: 'INVALID_COUNTRY_CODE',
        message: 'countryCode is required and must be an ISO-2 uppercase code'
      }
    });
  }

  if (language && typeof language !== 'string') {
    return res.status(400).json({
      error: {
        code: 'INVALID_LANGUAGE',
        message: 'Language must be a string when provided'
      }
    });
  }

  if (body.durationMinutes !== undefined && (typeof body.durationMinutes !== 'number' || Number.isNaN(body.durationMinutes) || body.durationMinutes <= 0)) {
    return res.status(400).json({
      error: {
        code: 'INVALID_DURATION_MINUTES',
        message: 'durationMinutes must be a positive number when provided'
      }
    });
  }

  req.body.language = language || 'en';
  next();
}
