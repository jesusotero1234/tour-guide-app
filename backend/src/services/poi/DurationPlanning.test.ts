import { getDurationPlan } from './DurationPlanning';

describe('getDurationPlan', () => {
  it('returns a compact plan for short tours', () => {
    expect(getDurationPlan(60)).toEqual({ candidateCount: 8, minStops: 5, maxStops: 5 });
  });

  it('returns a medium plan for 2 hour tours', () => {
    expect(getDurationPlan(120)).toEqual({ candidateCount: 30, minStops: 5, maxStops: 7 });
  });

  it('returns a broad plan for long tours', () => {
    expect(getDurationPlan(240)).toEqual({ candidateCount: 40, minStops: 6, maxStops: 10 });
    expect(getDurationPlan(300)).toEqual({ candidateCount: 50, minStops: 7, maxStops: 12 });
  });
});
