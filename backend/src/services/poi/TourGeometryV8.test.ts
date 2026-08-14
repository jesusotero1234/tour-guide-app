import {
  composeTourLegsV8,
  guidedDurationCopyV8,
  selfTransferInstructionV8,
  TourGeometryStopV8,
  tourStopsFromCandidatesV8,
} from './TourGeometryV8';

function stop(stopId: string, name: string, lat: number, lng: number, required = false): TourGeometryStopV8 {
  return { stopId, name, coordinates: { lat, lng }, required };
}

describe('composeTourLegsV8', () => {
  it('produces a single walking block when every segment is walkable', () => {
    const result = composeTourLegsV8([
      stop('a', 'A', 41.380, 2.170),
      stop('b', 'B', 41.381, 2.171),
      stop('c', 'C', 41.382, 2.172),
    ], 120);

    expect(result.status).toBe('walkable');
    expect(result.transferCount).toBe(0);
    expect(result.blocks).toHaveLength(1);
    expect(result.legs.every((leg) => leg.type === 'walking')).toBe(true);
    expect(result.externalTransferTimeIncluded).toBe(false);
  });

  it('splits into exactly two walking blocks with a single self_transfer', () => {
    const result = composeTourLegsV8([
      stop('a', 'A', 41.380, 2.170),
      stop('b', 'B', 41.381, 2.171),
      stop('far', 'Far', 41.430, 2.220),
      stop('d', 'D', 41.431, 2.221),
    ], 120);

    expect(result.status).toBe('walkable');
    expect(result.blocks).toHaveLength(2);
    expect(result.transferCount).toBe(1);
    const transfers = result.legs.filter((leg) => leg.type === 'self_transfer');
    expect(transfers).toHaveLength(1);
    expect(transfers[0]).toEqual({
      type: 'self_transfer',
      fromStopId: 'b',
      toStopId: 'far',
      durationSeconds: null,
    });
  });

  it('groups interleaved stops by proximity before judging geometry infeasible', () => {
    const interleaved = composeTourLegsV8([
      stop('a1', 'A1', 41.380, 2.170),
      stop('b1', 'B1', 41.480, 2.270),
      stop('a2', 'A2', 41.381, 2.171),
      stop('b2', 'B2', 41.481, 2.271),
    ], 120);
    const grouped = composeTourLegsV8([
      stop('a1', 'A1', 41.380, 2.170),
      stop('a2', 'A2', 41.381, 2.171),
      stop('b1', 'B1', 41.480, 2.270),
      stop('b2', 'B2', 41.481, 2.271),
    ], 120);

    expect(interleaved.status).toBe('walkable');
    expect(interleaved.blocks).toHaveLength(2);
    expect(interleaved.transferCount).toBe(1);
    expect(interleaved.transferCount).toBe(grouped.transferCount);
    expect(interleaved.blocks.flatMap((block) => block.stopIds).sort())
      .toEqual(grouped.blocks.flatMap((block) => block.stopIds).sort());
  });

  it('never includes navigation, transport or duration in a self_transfer leg', () => {
    const result = composeTourLegsV8([
      stop('a', 'A', 41.380, 2.170),
      stop('b', 'B', 41.381, 2.171),
      stop('far', 'Far', 41.440, 2.230),
    ], 120);

    const transfer = result.legs.find((leg) => leg.type === 'self_transfer');
    expect(transfer).toBeDefined();
    expect(transfer).toEqual({
      type: 'self_transfer',
      fromStopId: 'b',
      toStopId: 'far',
      durationSeconds: null,
    });
    const serialized = JSON.stringify(transfer);
    expect(serialized).not.toMatch(/line|vehicle|route|provider|instructions|metro|bus|train/iu);
    expect((transfer as { durationSeconds: number | null }).durationSeconds).toBeNull();
  });

  it('flags route_review_required when more than one transfer would be needed', () => {
    const result = composeTourLegsV8([
      stop('a', 'A', 41.380, 2.170),
      stop('far1', 'Far1', 41.440, 2.230),
      stop('b', 'B', 41.381, 2.171),
      stop('far2', 'Far2', 41.450, 2.240),
    ], 120);

    expect(result.status).toBe('route_review_required');
    expect(result.reason).toBe('too_many_self_transfers');
    expect(result.transferCount).toBeGreaterThan(1);
  });

  it('does not silently drop essential stops on review', () => {
    const required = stop('required-far', 'RequiredFar', 41.440, 2.230, true);
    const result = composeTourLegsV8([
      stop('a', 'A', 41.380, 2.170),
      required,
      stop('b', 'B', 41.381, 2.171),
      stop('far2', 'Far2', 41.450, 2.240),
    ], 120);

    expect(result.status).toBe('route_review_required');
    expect(result.blocks.flatMap((block) => block.stopIds)).toContain('required-far');
  });

  it('flags guided_duration_infeasible when the guided core exceeds the ceiling', () => {
    const closeStops = Array.from({ length: 8 }, (_, index) => (
      stop(`s${index}`, `Stop ${index}`, 41.380 + index * 0.0005, 2.170)
    ));
    const result = composeTourLegsV8(closeStops, 60, { stopExperienceMinutes: 12 });

    expect(result.status).toBe('route_review_required');
    expect(result.reason).toBe('guided_duration_infeasible');
  });
});

describe('selfTransferInstructionV8', () => {
  it('uses the fixed non-LLM template', () => {
    expect(selfTransferInstructionV8('Sagrada Família')).toBe(
      'La siguiente parada es Sagrada Família. Llega por el medio que prefieras y reanuda el recorrido allí.'
    );
  });
});

describe('guidedDurationCopyV8', () => {
  it('separates guided experience from free transfer', () => {
    expect(guidedDurationCopyV8(120)).toBe('≈120 min de experiencia guiada + traslado libre');
  });
});

describe('tourStopsFromCandidatesV8', () => {
  it('maps candidates into geometry stops preserving required identity', () => {
    const stops = tourStopsFromCandidatesV8([
      { name: 'Sagrada', wikidataId: 'Q48435', coordinates: { lat: 41.4036, lng: 2.1744 } },
      { name: 'Market', wikidataId: 'Q222', coordinates: { lat: 41.3889, lng: 2.1701 } },
    ], ['Q48435']);

    expect(stops[0]).toEqual({
      stopId: 'Q48435',
      name: 'Sagrada',
      coordinates: { lat: 41.4036, lng: 2.1744 },
      required: true,
    });
    expect(stops[1].required).toBe(false);
  });
});
