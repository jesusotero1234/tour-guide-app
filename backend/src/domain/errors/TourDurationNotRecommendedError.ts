export const TOUR_DURATION_NOT_RECOMMENDED_CODE = 'TOUR_DURATION_NOT_RECOMMENDED';

export class TourDurationNotRecommendedError extends Error {
  readonly code = TOUR_DURATION_NOT_RECOMMENDED_CODE;
  readonly details: {
    city: string;
    theme: string;
    requestedDurationMinutes: number;
    recommendedDurationMinutes: number;
    draftTourId: string;
    reason: 'history_capacity_below_requested';
  };

  constructor(params: {
    city: string;
    theme: string;
    requestedDurationMinutes: number;
    recommendedDurationMinutes: number;
    draftTourId: string;
  }) {
    super(`No recomendamos un tour de ${params.requestedDurationMinutes} minutos para ${params.city}; hay un borrador de ${params.recommendedDurationMinutes} minutos disponible.`);
    this.name = 'TourDurationNotRecommendedError';
    this.details = {
      city: params.city,
      theme: params.theme,
      requestedDurationMinutes: params.requestedDurationMinutes,
      recommendedDurationMinutes: params.recommendedDurationMinutes,
      draftTourId: params.draftTourId,
      reason: 'history_capacity_below_requested',
    };
  }
}
