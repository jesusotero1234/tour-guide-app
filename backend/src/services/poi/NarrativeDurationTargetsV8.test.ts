import { allocateNarrationTargetsV8 } from './NarrativeDurationTargetsV8';

describe('allocateNarrationTargetsV8', () => {
  const stops = [
    { stopId: 'Q1', required: true },
    { stopId: 'Q2', required: false },
    { stopId: 'Q3', required: true },
    { stopId: 'Q4', required: false },
    { stopId: 'Q5', required: false },
    { stopId: 'Q6', required: true },
    { stopId: 'Q7', required: false },
  ];

  it('allocates a bounded, richer target and gives required stops more time', () => {
    const targets = allocateNarrationTargetsV8({
      durationMinutes: 120,
      walkingSeconds: 25 * 60,
      stops,
    });

    expect(targets).toHaveLength(7);
    const totalSeconds = targets.reduce((sum, target) => sum + target.targetSeconds, 0);
    expect(totalSeconds).toBeLessThanOrEqual(120 * 60 * 0.3);
    expect(totalSeconds).toBeLessThanOrEqual((120 * 60) - (25 * 60) - (120 * 60 * 0.15));

    for (const target of targets) {
      expect(target.targetSeconds).toBeGreaterThanOrEqual(120);
      expect(target.targetSeconds).toBeLessThanOrEqual(300);
      expect(target.targetWords).toBe(Math.round((target.targetSeconds / 60) * 140));
      expect(target.minPropositions).toBeGreaterThanOrEqual(6);
      expect(target.minPropositions).toBeLessThanOrEqual(12);
      expect(target.maxPropositions).toBe(Math.min(16, target.minPropositions + 4));
      expect(target.minVisualAnchors).toBeGreaterThanOrEqual(2);
      expect(target.minVisualAnchors).toBeLessThanOrEqual(4);
    }

    const required = targets.filter((target) => stops.find((stop) => stop.stopId === target.stopId)!.required);
    const optional = targets.filter((target) => !stops.find((stop) => stop.stopId === target.stopId)!.required);
    const average = (values: typeof targets) => (
      values.reduce((sum, target) => sum + target.targetSeconds, 0) / values.length
    );
    expect(average(required)).toBeGreaterThan(average(optional));
  });

  it('uses a deterministic walking fallback when geometry is unavailable', () => {
    const input = { durationMinutes: 90, walkingSeconds: null, stops };
    expect(allocateNarrationTargetsV8(input)).toEqual(allocateNarrationTargetsV8(input));
  });

  it('returns no targets for an empty route', () => {
    expect(allocateNarrationTargetsV8({
      durationMinutes: 120,
      walkingSeconds: 0,
      stops: [],
    })).toEqual([]);
  });
});
