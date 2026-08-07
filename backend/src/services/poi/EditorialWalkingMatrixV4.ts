import axios from 'axios';
import { createHash } from 'crypto';
import { EditorialEntityCandidateV4 } from './EditorialEntityV4';

export const WALKING_MATRIX_SCHEMA_VERSION = 'walking-matrix-v1' as const;
export const FOSSGIS_FOOT_BASE_URL = 'https://routing.openstreetmap.de/routed-foot' as const;

export interface WalkingMatrixSiteV4 {
  siteId: string;
  lat: number;
  lng: number;
}

export interface WalkingLegV4 {
  meters: number | null;
  seconds: number | null;
  reachable: boolean;
}

export interface WalkingMatrixSnapshotV4 {
  schemaVersion: typeof WALKING_MATRIX_SCHEMA_VERSION;
  provider: {
    id: 'fossgis-osrm-foot';
    capturedAt: string;
  };
  candidateFingerprint: string;
  sites: WalkingMatrixSiteV4[];
  legs: WalkingLegV4[][];
}

export interface CaptureWalkingMatrixOptionsV4 {
  baseUrl?: string;
  get?: (url: string, options: Record<string, unknown>) => Promise<{ data: unknown }>;
  capturedAt?: string;
}

function matrixSites(entities: EditorialEntityCandidateV4[]): WalkingMatrixSiteV4[] {
  return entities.map((entity) => ({
    siteId: entity.siteId,
    lat: entity.coordinates.lat,
    lng: entity.coordinates.lng,
  }));
}

export function walkingMatrixCandidateFingerprintV4(sites: WalkingMatrixSiteV4[]): string {
  return createHash('sha256').update(JSON.stringify(sites)).digest('hex');
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function matrixValue(value: unknown, size: number, label: string): Array<Array<number | null>> {
  if (!Array.isArray(value) || value.length !== size) throw new Error(`${label} must contain ${size} rows`);
  return value.map((row, rowIndex) => {
    if (!Array.isArray(row) || row.length !== size) throw new Error(`${label}[${rowIndex}] must contain ${size} values`);
    return row.map((item, columnIndex) => {
      if (item === null) return null;
      if (typeof item !== 'number' || !Number.isFinite(item) || item < 0) {
        throw new Error(`${label}[${rowIndex}][${columnIndex}] is invalid`);
      }
      return item;
    });
  });
}

export async function captureWalkingMatrixV4(
  entities: EditorialEntityCandidateV4[],
  options: CaptureWalkingMatrixOptionsV4 = {}
): Promise<WalkingMatrixSnapshotV4> {
  if (entities.length < 2 || entities.length > 30) throw new Error('Walking matrix requires 2 to 30 entities');
  const sites = matrixSites(entities);
  const coordinates = sites.map((site) => `${site.lng},${site.lat}`).join(';');
  const baseUrl = (options.baseUrl ?? FOSSGIS_FOOT_BASE_URL).replace(/\/$/, '');
  const get = options.get ?? ((url: string, requestOptions: Record<string, unknown>) => axios.get(url, requestOptions));
  const response = await get(`${baseUrl}/table/v1/driving/${coordinates}`, {
    params: { annotations: 'distance,duration' },
    timeout: 30000,
    headers: { 'User-Agent': 'tour-guide-app/1.0 (offline editorial calibration)' },
  });
  const root = objectValue(response.data, 'OSRM response');
  if (root.code !== 'Ok') throw new Error(`OSRM matrix failed with code ${String(root.code)}`);
  const distances = matrixValue(root.distances, sites.length, 'distances');
  const durations = matrixValue(root.durations, sites.length, 'durations');
  return {
    schemaVersion: WALKING_MATRIX_SCHEMA_VERSION,
    provider: { id: 'fossgis-osrm-foot', capturedAt: options.capturedAt ?? new Date().toISOString() },
    candidateFingerprint: walkingMatrixCandidateFingerprintV4(sites),
    sites,
    legs: distances.map((row, fromIndex) => row.map((meters, toIndex) => {
      const seconds = durations[fromIndex][toIndex];
      return {
        meters,
        seconds,
        reachable: meters !== null && seconds !== null,
      };
    })),
  };
}

export function validateWalkingMatrixSnapshotV4(
  value: unknown,
  entities: EditorialEntityCandidateV4[]
): WalkingMatrixSnapshotV4 {
  const root = objectValue(value, 'walking matrix');
  if (root.schemaVersion !== WALKING_MATRIX_SCHEMA_VERSION) throw new Error('Invalid walking matrix schemaVersion');
  const expectedSites = matrixSites(entities);
  const expectedFingerprint = walkingMatrixCandidateFingerprintV4(expectedSites);
  if (root.candidateFingerprint !== expectedFingerprint) throw new Error('Walking matrix candidate fingerprint changed');
  if (JSON.stringify(root.sites) !== JSON.stringify(expectedSites)) throw new Error('Walking matrix sites changed');
  const rawLegs = root.legs;
  if (!Array.isArray(rawLegs) || rawLegs.length !== entities.length) throw new Error('Walking matrix legs are incomplete');
  const legs = rawLegs.map((row, fromIndex) => {
    if (!Array.isArray(row) || row.length !== entities.length) throw new Error(`Walking matrix row ${fromIndex} is incomplete`);
    return row.map((item, toIndex) => {
      const leg = objectValue(item, `legs[${fromIndex}][${toIndex}]`);
      const reachable = leg.reachable === true;
      const meters = leg.meters;
      const seconds = leg.seconds;
      if (reachable && (typeof meters !== 'number' || typeof seconds !== 'number'
        || !Number.isFinite(meters) || !Number.isFinite(seconds) || meters < 0 || seconds < 0)) {
        throw new Error(`Reachable leg ${fromIndex}:${toIndex} requires non-negative metrics`);
      }
      if (!reachable && (meters !== null || seconds !== null)) {
        throw new Error(`Unreachable leg ${fromIndex}:${toIndex} must use null metrics`);
      }
      return {
        reachable,
        meters: reachable ? meters as number : null,
        seconds: reachable ? seconds as number : null,
      };
    });
  });
  const provider = objectValue(root.provider, 'walking matrix provider');
  if (provider.id !== 'fossgis-osrm-foot' || typeof provider.capturedAt !== 'string') {
    throw new Error('Invalid walking matrix provider');
  }
  return {
    schemaVersion: WALKING_MATRIX_SCHEMA_VERSION,
    provider: { id: 'fossgis-osrm-foot', capturedAt: provider.capturedAt },
    candidateFingerprint: expectedFingerprint,
    sites: expectedSites,
    legs,
  };
}

export function walkingLegV4(
  snapshot: WalkingMatrixSnapshotV4,
  fromSiteId: string,
  toSiteId: string
): WalkingLegV4 {
  const from = snapshot.sites.findIndex((site) => site.siteId === fromSiteId);
  const to = snapshot.sites.findIndex((site) => site.siteId === toSiteId);
  if (from < 0 || to < 0) throw new Error(`Walking matrix does not contain ${fromSiteId} -> ${toSiteId}`);
  return snapshot.legs[from][to];
}

