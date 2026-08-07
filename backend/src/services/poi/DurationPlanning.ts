export interface DurationPlan {
  candidateCount: number;
  minStops: number;
  maxStops: number;
}

export function getDurationPlan(durationMinutes: number): DurationPlan {
  if (durationMinutes <= 75) {
    return { candidateCount: 8, minStops: 5, maxStops: 5 };
  }

  if (durationMinutes <= 120) {
    return { candidateCount: 30, minStops: 5, maxStops: 7 };
  }

  if (durationMinutes <= 180) {
    return { candidateCount: 30, minStops: 5, maxStops: 9 };
  }

  if (durationMinutes <= 240) {
    return { candidateCount: 40, minStops: 6, maxStops: 10 };
  }

  return { candidateCount: 50, minStops: 7, maxStops: 12 };
}
