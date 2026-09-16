import { Tour } from '../../domain/entities/Tour';
import { evaluateTourContentReadiness } from './contentReadiness';

/** Shared requirements for publishing and delivering a text tour. */
export function publicationProblems(tour: Tour): string[] {
  const reasons: string[] = [];
  const codexAuthor = tour.metadata?.codexAuthor;
  if (codexAuthor) {
    if (codexAuthor.publicationPassed !== true) reasons.push('codex_publication_not_passed');
    if (codexAuthor.findingCount !== 0) reasons.push('codex_factual_findings');
    if (codexAuthor.languageFindingCount !== 0) reasons.push('codex_language_findings');
    if (codexAuthor.narrationWithinTarget !== true) reasons.push('codex_narration_out_of_target');
    const nonblankPlaces = tour.places.filter(p => p.description?.trim());
    if (nonblankPlaces.length < 2 || nonblankPlaces.length !== tour.places.length) reasons.push('codex_too_few_places');
    if (!tour.introduction?.trim()) reasons.push('codex_missing_introduction');
    const stopReviews = codexAuthor.stopReviews || [];
    if (stopReviews.length !== tour.places.length) reasons.push('codex_stop_reviews_mismatch');
    for (const review of stopReviews) {
      if (!review.findings || review.findings.length === 0) {
        reasons.push('codex_stop_missing_findings');
        break;
      }
      for (const finding of review.findings) {
        if (finding.classification !== 'supported' && finding.classification !== 'authorized_inference') {
          reasons.push('codex_invalid_classification');
          break;
        }
      }
      if (reasons.includes('codex_invalid_classification')) break;
      const lr = review.languageReview;
      if (!lr || lr.matchesRequestedLanguage !== true || lr.naturalForListening !== true || lr.issues.length !== 0) {
        reasons.push('codex_language_review_failed');
        break;
      }
    }
    return reasons;
  }
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
