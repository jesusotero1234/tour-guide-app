import { RouteCoordinates } from './RouteSelection';
import { EssentialRouteCandidateV8 } from './EssentialRouteSelectionV8';

export type TourLegV8 =
  | {
      type: 'walking';
      fromStopId: string;
      toStopId: string;
      durationSeconds: number;
    }
  | {
      type: 'self_transfer';
      fromStopId: string;
      toStopId: string;
      durationSeconds: null;
    };

export interface TourGeometryStopV8 {
  stopId: string;
  name: string;
  coordinates: RouteCoordinates;
  required?: boolean;
}

export interface TourGeometryV8Result {
  status: 'walkable' | 'route_review_required';
  reason: 'too_many_self_transfers' | 'guided_duration_infeasible' | null;
  blocks: Array<{ stopIds: string[] }>;
  legs: TourLegV8[];
  guidedDurationMinutes: number;
  externalTransferTimeIncluded: false;
  transferCount: number;
  requestedDuration: number;
}

export interface TourGeometryOptionsV8 {
  maxSegmentMeters?: number;
  stopExperienceMinutes?: number;
  walkingSpeedKmh?: number;
  walkingDistanceMultiplier?: number;
  guidedDurationCeilingRatio?: number;
}

export interface TourGeometryV8PrunedResult extends TourGeometryV8Result {
  stops: TourGeometryStopV8[];
  removedOptionalIds: string[];
}

function haversineMeters(a: RouteCoordinates, b: RouteCoordinates): number {
  const toRad = (degrees: number) => degrees * (Math.PI / 180);
  const earthRadiusMeters = 6371000;
  const deltaLat = toRad(b.lat - a.lat);
  const deltaLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinLat = Math.sin(deltaLat / 2);
  const sinLng = Math.sin(deltaLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function defaultMaxSegmentMetersV8(requestedDuration: number): number {
  if (requestedDuration >= 240) return 1800;
  if (requestedDuration >= 180) return 1600;
  if (requestedDuration >= 120) return 1400;
  return 1200;
}

export function selfTransferInstructionV8(nextStopName: string): string {
  return `La siguiente parada es ${nextStopName}. Llega por el medio que prefieras y reanuda el recorrido allí.`;
}

export function guidedDurationCopyV8(guidedDurationMinutes: number): string {
  return `≈${guidedDurationMinutes} min de experiencia guiada + traslado libre`;
}

function estimateBlockDurationSeconds(
  stopIds: string[],
  stopsByStopId: Map<string, TourGeometryStopV8>,
  options: Required<Pick<TourGeometryOptionsV8,
    'stopExperienceMinutes' | 'walkingSpeedKmh' | 'walkingDistanceMultiplier'>>
): number {
  const speedMetersPerSecond = options.walkingSpeedKmh * 1000 / 3600;
  const experienceSeconds = stopIds.length * options.stopExperienceMinutes * 60;
  let walkingSeconds = 0;
  for (let index = 1; index < stopIds.length; index += 1) {
    const from = stopsByStopId.get(stopIds[index - 1]);
    const to = stopsByStopId.get(stopIds[index]);
    if (!from || !to) continue;
    const segmentMeters = haversineMeters(from.coordinates, to.coordinates)
      * options.walkingDistanceMultiplier;
    walkingSeconds += segmentMeters / speedMetersPerSecond;
  }
  return experienceSeconds + walkingSeconds;
}

export function orderTourStopsByProximityV8(
  stops: TourGeometryStopV8[]
): TourGeometryStopV8[] {
  if (stops.length <= 2) return [...stops];
  const remaining = [...stops];
  const ordered: TourGeometryStopV8[] = [];
  let currentIndex = 0;
  const requiredIndex = stops.findIndex((stop) => stop.required === true);
  if (requiredIndex >= 0) currentIndex = requiredIndex;
  ordered.push(remaining.splice(currentIndex, 1)[0]);
  while (remaining.length > 0) {
    const current = ordered[ordered.length - 1];
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < remaining.length; index += 1) {
      const distance = haversineMeters(current.coordinates, remaining[index].coordinates);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    }
    ordered.push(remaining.splice(nearestIndex, 1)[0]);
  }
  return ordered;
}

export function composeTourLegsV8(
  orderedStops: TourGeometryStopV8[],
  requestedDuration: number,
  options: TourGeometryOptionsV8 = {}
): TourGeometryV8Result {
  const maxSegmentMeters = options.maxSegmentMeters
    ?? defaultMaxSegmentMetersV8(requestedDuration);
  const stopExperienceMinutes = options.stopExperienceMinutes ?? 7;
  const walkingSpeedKmh = options.walkingSpeedKmh ?? 4.2;
  const walkingDistanceMultiplier = options.walkingDistanceMultiplier ?? 1.3;
  const guidedDurationCeilingRatio = options.guidedDurationCeilingRatio ?? 1.15;

  if (orderedStops.length === 0) {
    throw new Error('tour geometry requires at least one stop');
  }
  const ordered = orderTourStopsByProximityV8(orderedStops);
  const stopsByStopId = new Map(orderedStops.map((stop) => [stop.stopId, stop]));

  const blocks: string[][] = [];
  let currentBlock: string[] = [ordered[0].stopId];
  for (let index = 1; index < ordered.length; index += 1) {
    const from = stopsByStopId.get(ordered[index - 1].stopId);
    const to = stopsByStopId.get(ordered[index].stopId);
    const segmentMeters = from && to
      ? haversineMeters(from.coordinates, to.coordinates) * walkingDistanceMultiplier
      : 0;
    if (segmentMeters > maxSegmentMeters) {
      blocks.push(currentBlock);
      currentBlock = [ordered[index].stopId];
    } else {
      currentBlock.push(ordered[index].stopId);
    }
  }
  blocks.push(currentBlock);

  const requiredStopIds = new Set(
    orderedStops.filter((stop) => stop.required === true).map((stop) => stop.stopId)
  );
  const tooManyTransfers = blocks.length > 2;
  if (tooManyTransfers) {
    return {
      status: 'route_review_required',
      reason: 'too_many_self_transfers',
      blocks: blocks.map((stopIds) => ({ stopIds })),
      legs: [],
      guidedDurationMinutes: Math.ceil(guidedDurationCeilingMinutes(
        blocks,
        stopsByStopId,
        stopExperienceMinutes,
        walkingSpeedKmh,
        walkingDistanceMultiplier
      )),
      externalTransferTimeIncluded: false,
      transferCount: blocks.length - 1,
      requestedDuration,
    };
  }

  const guidedDurationMinutes = Math.ceil(guidedDurationCeilingMinutes(
    blocks,
    stopsByStopId,
    stopExperienceMinutes,
    walkingSpeedKmh,
    walkingDistanceMultiplier
  ));
  if (guidedDurationMinutes > requestedDuration * guidedDurationCeilingRatio) {
    return {
      status: 'route_review_required',
      reason: 'guided_duration_infeasible',
      blocks: blocks.map((stopIds) => ({ stopIds })),
      legs: [],
      guidedDurationMinutes,
      externalTransferTimeIncluded: false,
      transferCount: blocks.length - 1,
      requestedDuration,
    };
  }

  const legs: TourLegV8[] = [];
  blocks.forEach((block, blockIndex) => {
    for (let index = 1; index < block.length; index += 1) {
      const from = stopsByStopId.get(block[index - 1]) as TourGeometryStopV8;
      const to = stopsByStopId.get(block[index]) as TourGeometryStopV8;
      const segmentSeconds = Math.round(
        haversineMeters(from.coordinates, to.coordinates)
          * walkingDistanceMultiplier
          / (walkingSpeedKmh * 1000 / 3600)
      );
      legs.push({
        type: 'walking',
        fromStopId: from.stopId,
        toStopId: to.stopId,
        durationSeconds: segmentSeconds,
      });
    }
    if (blockIndex < blocks.length - 1) {
      const fromStopId = block[block.length - 1];
      const toStopId = blocks[blockIndex + 1][0];
      legs.push({
        type: 'self_transfer',
        fromStopId,
        toStopId,
        durationSeconds: null,
      });
    }
  });

  return {
    status: 'walkable',
    reason: null,
    blocks: blocks.map((stopIds) => ({ stopIds })),
    legs,
    guidedDurationMinutes,
    externalTransferTimeIncluded: false,
    transferCount: Math.max(0, blocks.length - 1),
    requestedDuration,
  };
}

function guidedDurationCeilingMinutes(
  blocks: string[][],
  stopsByStopId: Map<string, TourGeometryStopV8>,
  stopExperienceMinutes: number,
  walkingSpeedKmh: number,
  walkingDistanceMultiplier: number
): number {
  const options = { stopExperienceMinutes, walkingSpeedKmh, walkingDistanceMultiplier };
  const totalSeconds = blocks.reduce((total, block) => (
    total + estimateBlockDurationSeconds(block, stopsByStopId, options)
  ), 0);
  return Math.ceil(totalSeconds / 60);
}

export function pruneOptionalStopsForWalkabilityV8(
  stops: TourGeometryStopV8[],
  requiredIds: string[],
  requestedDuration: number,
  minStops: number
): TourGeometryV8PrunedResult {
  const requiredSet = new Set(requiredIds);
  const isRequired = (stop: TourGeometryStopV8): boolean =>
    stop.required === true || requiredSet.has(stop.stopId);

  let currentStops = [...stops];
  const removedOptionalIds: string[] = [];

  let result = composeTourLegsV8(currentStops, requestedDuration);

  while (
    result.status !== 'walkable' &&
    currentStops.length > minStops &&
    currentStops.some((stop) => !isRequired(stop))
  ) {
    const optionalStops = currentStops.filter((stop) => !isRequired(stop));
    let bestRemoval: {
      stopId: string;
      result: TourGeometryV8Result;
    } | null = null;

    for (const candidate of optionalStops) {
      const candidateStops = currentStops.filter((stop) => stop.stopId !== candidate.stopId);
      const candidateResult = composeTourLegsV8(candidateStops, requestedDuration);

      if (bestRemoval === null) {
        bestRemoval = { stopId: candidate.stopId, result: candidateResult };
        continue;
      }

      const current = bestRemoval.result;
      const next = candidateResult;

      const currentWalkable = current.status === 'walkable';
      const nextWalkable = next.status === 'walkable';

      if (nextWalkable !== currentWalkable) {
        if (nextWalkable) {
          bestRemoval = { stopId: candidate.stopId, result: candidateResult };
        }
        continue;
      }

      if (next.transferCount !== current.transferCount) {
        if (next.transferCount < current.transferCount) {
          bestRemoval = { stopId: candidate.stopId, result: candidateResult };
        }
        continue;
      }

      if (next.guidedDurationMinutes !== current.guidedDurationMinutes) {
        if (next.guidedDurationMinutes < current.guidedDurationMinutes) {
          bestRemoval = { stopId: candidate.stopId, result: candidateResult };
        }
        continue;
      }

      if (candidate.stopId < bestRemoval.stopId) {
        bestRemoval = { stopId: candidate.stopId, result: candidateResult };
      }
    }

    if (bestRemoval === null) break;

    removedOptionalIds.push(bestRemoval.stopId);
    currentStops = currentStops.filter((stop) => stop.stopId !== bestRemoval.stopId);
    result = bestRemoval.result;
  }

  return {
    ...result,
    stops: currentStops,
    removedOptionalIds,
  };
}

export function tourStopsFromCandidatesV8(
  route: EssentialRouteCandidateV8[],
  requiredIds: string[]
): TourGeometryStopV8[] {
  const requiredSet = new Set(requiredIds);
  return route.map((candidate) => {
    const coordinates = candidate.coordinates
      ? { lat: candidate.coordinates.lat, lng: candidate.coordinates.lng }
      : { lat: candidate.latitude as number, lng: candidate.longitude as number };
    if (typeof coordinates.lat !== 'number' || typeof coordinates.lng !== 'number'
      || Number.isNaN(coordinates.lat) || Number.isNaN(coordinates.lng)) {
      throw new Error(`stop ${candidate.name ?? candidate.wikidataId ?? 'unknown'} has no coordinates`);
    }
    const stopId = typeof candidate.wikidataId === 'string' ? candidate.wikidataId : `stop-${route.indexOf(candidate)}`;
    return {
      stopId,
      name: candidate.name ?? stopId,
      coordinates,
      required: typeof candidate.wikidataId === 'string'
        && requiredSet.has(candidate.wikidataId),
    };
  });
}
