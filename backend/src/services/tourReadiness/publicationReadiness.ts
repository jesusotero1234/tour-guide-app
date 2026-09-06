import { Tour } from '../../domain/entities/Tour';
import { evaluateTourContentReadiness } from './contentReadiness';

/** Shared requirements for publishing and delivering a text tour. */
export function publicationProblems(tour: Tour): string[] {
  const reasons: string[] = [];
  if (!tour.introduction?.trim()) reasons.push('missing_introduction');
  if (tour.places.length < 5) reasons.push('too_few_stops');
  if (!tour.metadata?.textAudit?.passed) reasons.push('text_audit_not_passed');
  if (!tour.metadata?.routeDiagnostics) reasons.push('missing_route_diagnostics');
  else if (tour.metadata.routeDiagnostics.degraded) reasons.push('route_degraded');
  reasons.push(...evaluateTourContentReadiness(tour.places).reasons);
  return reasons;
}

export function isPublishedTourReady(tour: Tour | null): tour is Tour {
  return tour !== null && tour.status === 'published' && publicationProblems(tour).length === 0;
}
