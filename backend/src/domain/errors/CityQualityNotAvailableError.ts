import { TourConfidence } from '../../types/tourQuality';

export const CITY_QUALITY_NOT_AVAILABLE_CODE = 'CITY_QUALITY_NOT_AVAILABLE';

export class CityQualityNotAvailableError extends Error {
  readonly code = CITY_QUALITY_NOT_AVAILABLE_CODE;
  readonly details: {
    city: string;
    theme: string;
    reasons: string[];
    stage: TourConfidence['stage'];
    score: number;
    signals?: TourConfidence['signals'];
  };

  constructor(city: string, theme: string, confidence: TourConfidence) {
    super('Todavia no podemos generar un tour de calidad suficiente para esta ciudad.');
    this.name = 'CityQualityNotAvailableError';
    this.details = {
      city,
      theme,
      reasons: confidence.reasons,
      stage: confidence.stage,
      score: confidence.score,
      signals: confidence.signals,
    };
  }
}
