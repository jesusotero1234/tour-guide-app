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
      expect(target.targetWords).toBe(Math.round((target.targetSeconds / 60) * 120));
      expect(target.targetWords).toBeLessThanOrEqual(600);
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
    expect(targets.some((target) => target.targetWords === 600)).toBe(true);
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

  it('asserts explicit card, facet, and spatial targets for a 300s target in a 120-minute route', () => {
    const targets = allocateNarrationTargetsV8({
      durationMinutes: 120,
      walkingSeconds: 25 * 60,
      stops,
    });

    const target = targets.find((t) => t.targetSeconds >= 300);
    expect(target).toBeDefined();
    expect(target!.targetEvidenceCards).toBe(10);
    expect(target!.minFacetCount).toBe(5);
    expect(target!.minSpatialAnchors).toBe(2);
  });

  it('asserts explicit card, facet, and spatial targets for a ~180s target', () => {
    const targets = allocateNarrationTargetsV8({
      durationMinutes: 20,
      walkingSeconds: 5 * 60,
      stops: [
        { stopId: 'A', required: true },
        { stopId: 'B', required: false },
      ],
    });

    const target = targets.find((t) => t.targetSeconds >= 170 && t.targetSeconds < 180);
    expect(target).toBeDefined();
    expect(target!.targetEvidenceCards).toBe(6);
    expect(target!.minFacetCount).toBe(3);
    expect(target!.minSpatialAnchors).toBe(1);
  });
});
