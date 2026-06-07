const MIN_STOP_WORDS = 90;
const MIN_AVERAGE_STOP_WORDS = 160;
const MAX_SHORT_STOPS = 1;
const MIN_DESCRIPTION_CHARS = 350;

const FALLBACK_PATTERNS = [
  /^Visit\s+.+\.$/i,
  /^Visit\s+.+,\s+a notable/i,
  /^Visita\s+.+\.$/i,
  /^Llegamos a\s+.+\.$/i,
];

export interface StopContentReadiness {
  ready: boolean;
  wordCount: number;
  paragraphCount: number;
  fallbackLike: boolean;
  reasons: string[];
}

export interface TourContentReadinessStop {
  placeId?: string;
  name: string;
  wordCount: number;
  paragraphCount: number;
  fallbackLike: boolean;
  reasons: string[];
}

export interface TourContentReadiness {
  ready: boolean;
  averageWords: number;
  shortStopCount: number;
  fallbackStopCount: number;
  stopCount: number;
  reasons: string[];
  stops: TourContentReadinessStop[];
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function paragraphCount(text: string): number {
  return text.split(/\n\n+/).map((part) => part.trim()).filter(Boolean).length;
}

function isFallbackLike(text: string): boolean {
  const trimmed = text.trim();
  return FALLBACK_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function evaluateStopContentReadiness(place: {
  id?: string;
  name: string;
  description?: string | null;
}): StopContentReadiness {
  const description = (place.description || '').trim();
  const reasons: string[] = [];

  if (!description) {
    return {
      ready: false,
      wordCount: 0,
      paragraphCount: 0,
      fallbackLike: false,
      reasons: ['missing_description'],
    };
  }

  const words = wordCount(description);
  const paragraphs = paragraphCount(description);
  const fallbackLike = isFallbackLike(description);

  if (fallbackLike) {
    reasons.push('fallback_like');
  }

  if (words < MIN_STOP_WORDS) {
    reasons.push('short_stop');
  }

  if (description.length < MIN_DESCRIPTION_CHARS) {
    reasons.push('short_chars');
  }

  return {
    ready: reasons.length === 0,
    wordCount: words,
    paragraphCount: paragraphs,
    fallbackLike,
    reasons,
  };
}

export function evaluateTourContentReadiness(places: Array<{
  id?: string;
  name: string;
  description?: string | null;
}>): TourContentReadiness {
  if (places.length === 0) {
    return {
      ready: false,
      averageWords: 0,
      shortStopCount: 0,
      fallbackStopCount: 0,
      stopCount: 0,
      reasons: ['no_stops'],
      stops: [],
    };
  }

  const stops = places.map((place) => {
    const stop = evaluateStopContentReadiness(place);
    return {
      placeId: place.id,
      name: place.name,
      wordCount: stop.wordCount,
      paragraphCount: stop.paragraphCount,
      fallbackLike: stop.fallbackLike,
      reasons: stop.reasons,
    };
  });

  const totalWords = stops.reduce((sum, stop) => sum + stop.wordCount, 0);
  const averageWords = Math.round(totalWords / stops.length);
  const shortStopCount = stops.filter((stop) => stop.wordCount < MIN_STOP_WORDS || stop.reasons.includes('short_chars')).length;
  const fallbackStopCount = stops.filter((stop) => stop.fallbackLike).length;
  const reasons: string[] = [];

  if (fallbackStopCount > 0) {
    reasons.push('fallback_stop_present');
  }

  if (shortStopCount > MAX_SHORT_STOPS) {
    reasons.push('too_many_short_stops');
  }

  if (averageWords < MIN_AVERAGE_STOP_WORDS) {
    reasons.push('average_words_below_threshold');
  }

  return {
    ready: reasons.length === 0,
    averageWords,
    shortStopCount,
    fallbackStopCount,
    stopCount: stops.length,
    reasons,
    stops,
  };
}
