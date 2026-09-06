import { createHash } from 'node:crypto';
import { TourRequest } from '../types/api';
import { TourDestination } from './TourDestinationResolver';
import { NarrativeRouteBriefV6, narrativeFingerprintV6 } from './poi/NarrativeContractsV6';
import { NarrativeArcV8, validateNarrativeArcV8 } from './poi/NarrativeArcArchitectV8';
import { NarrativeNarrationTargetV8 } from './poi/NarrativeDurationTargetsV8';
import { NarrativeResearchHandoffStopV8, NarrativeEvidenceManifestV8, buildNarrativeEvidenceBoundaryV8 } from './poi/NarrativeEvidenceBoundaryV8';
import { TourGeometryV8Result } from './poi/TourGeometryV8';
import { RESEARCH_POLICY_VERSION } from './tourReadiness/TourLanguage';

export interface TourEvidenceCheckpoint {
  route: NarrativeRouteBriefV6;
  research: NarrativeResearchHandoffStopV8[];
  evidenceManifest: NarrativeEvidenceManifestV8;
  arc: NarrativeArcV8;
  narrationTargets: NarrativeNarrationTargetV8[];
}
export interface TourBlueprintSnapshot {
  schemaVersion: 'tour-blueprint-1';
  destination: TourDestination;
  checkpoint: TourEvidenceCheckpoint;
  geometry: TourGeometryV8Result;
  fingerprint: string;
}
export interface TourBlueprint {
  id: string;
  baseKey: string;
  revision: number;
  status: string;
  snapshot: TourBlueprintSnapshot | null;
  revalidateAfter: Date | null;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  attemptCount: number;
  accountedSpendUsd: number;
  spendLimitUsd: number;
}
export type BlueprintClaim = { kind: 'ready' | 'waiting' | 'claimed'; blueprint: TourBlueprint; allowanceUsd: number };
export interface TourBlueprintRepository {
  revisionForRequest(baseKey: string): Promise<number>;
  acquire(baseKey: string, owner: string, limitUsd: number): Promise<BlueprintClaim>;
  renew(id: string, owner: string): Promise<boolean>;
  complete(id: string, owner: string, snapshot: TourBlueprintSnapshot, costUsd: number): Promise<boolean>;
  fail(id: string, owner: string, reason: string, costUsd?: number): Promise<void>;
  isCurrent(id: string): Promise<boolean>;
  findById(id: string): Promise<TourBlueprint | null>;
}
export function tourBaseKey(destination: TourDestination, request: Pick<TourRequest, 'theme' | 'durationMinutes'>): string {
  return createHash('sha256').update(JSON.stringify({
    qid: destination.qid, countryCode: destination.countryCode, theme: request.theme,
    durationMinutes: request.durationMinutes, researchPolicy: RESEARCH_POLICY_VERSION,
    routePolicy: 'walking-v8-1',
  })).digest('hex');
}
function requireCondition(value: unknown, reason: string): asserts value {
  if (!value) throw new Error('INVALID_TOUR_BLUEPRINT: ' + reason);
}
export function createTourBlueprintSnapshot(input: Omit<TourBlueprintSnapshot, 'schemaVersion' | 'fingerprint'>): TourBlueprintSnapshot {
  // Diagnostic logs are deliberately not part of the durable evidence contract.
  const research = input.checkpoint.research.map(handoff => {
    const result = handoff.result;
    requireCondition(result.status === 'sufficient', 'research is not sufficient');
    return {
      routeStopId: handoff.routeStopId, entityQid: handoff.entityQid,
      result: {
        status: result.status, stopId: result.stopId, gates: result.gates,
        dossier: result.dossier, evidenceTier: result.evidenceTier, routeEligible: result.routeEligible,
        stats: result.stats, captureLog: [],
        captures: result.captures.map(c => ({
          sourceId: c.sourceId, requestedUrl: c.requestedUrl, finalUrl: c.finalUrl,
          title: c.title, capturedAt: c.capturedAt, content: c.content, fingerprint: c.fingerprint,
          authority: c.authority, containsInstructionLikeText: c.containsInstructionLikeText,
          finalHttpStatus: c.finalHttpStatus, sourceKind: c.sourceKind,
          entityQid: c.entityQid, publisherKey: c.publisherKey,
          ...(c.wikimediaRevision ? { wikimediaRevision: c.wikimediaRevision } : {}),
          ...(c.historicalCorpus ? { historicalCorpus: c.historicalCorpus } : {}),
          ...(c.referenceProvenance ? { referenceProvenance: c.referenceProvenance } : {}),
          ...('sourceLanguage' in c ? { sourceLanguage: c.sourceLanguage } : {}),
        })),
      },
    };
  });
  const payload = JSON.parse(JSON.stringify({
    schemaVersion: 'tour-blueprint-1', destination: input.destination,
    checkpoint: { ...input.checkpoint, research }, geometry: input.geometry,
  })) as Omit<TourBlueprintSnapshot, 'fingerprint'>;
  return parseTourBlueprintSnapshot({ ...payload, fingerprint: narrativeFingerprintV6(payload) });
}
export function parseTourBlueprintSnapshot(value: unknown): TourBlueprintSnapshot {
  requireCondition(value && typeof value === 'object' && !Array.isArray(value), 'object required');
  requireCondition(Buffer.byteLength(JSON.stringify(value), 'utf8') <= 8 * 1024 * 1024, 'snapshot too large');
  const snapshot = value as TourBlueprintSnapshot;
  requireCondition(snapshot.schemaVersion === 'tour-blueprint-1', 'schema version');
  const { fingerprint, ...payload } = snapshot;
  requireCondition(fingerprint === narrativeFingerprintV6(payload), 'fingerprint mismatch');
  const d = snapshot.destination, cp = snapshot.checkpoint, geometry = snapshot.geometry;
  requireCondition(d && /^Q\d+$/.test(d.qid) && /^[A-Z]{2}$/.test(d.countryCode), 'destination identity');
  requireCondition(d.policyVersion === RESEARCH_POLICY_VERSION && d.city?.trim() && d.country?.trim(), 'destination policy');
  requireCondition(Array.isArray(d.researchLanguages) && d.researchLanguages.length > 0
    && d.researchLanguages.every(lang => /^[a-z]{2,3}$/.test(lang)), 'research languages');
  requireCondition(cp?.route && Array.isArray(cp.route.stops) && cp.route.stops.length >= 2, 'route');
  const route = cp.route;
  requireCondition(route.city === d.city && route.country === d.country && route.language === d.researchLanguages[0], 'route destination/language');
  requireCondition(route.theme === 'history' && [60, 120, 180, 240].includes(route.durationMinutes), 'route request');
  const { fingerprint: routeHash, ...routePayload } = route;
  requireCondition(routeHash === narrativeFingerprintV6(routePayload), 'route fingerprint');
  requireCondition(new Set(route.stops.map(s => s.stopId)).size === route.stops.length, 'duplicate stops');
  route.stops.forEach((s, i) => {
    requireCondition(s.stopId === s.wikidataId && /^Q\d+$/.test(s.stopId) && s.name?.trim(), 'stop identity');
    requireCondition(s.position === i && s.previousStopId === (route.stops[i - 1]?.stopId ?? null)
      && s.nextStopId === (route.stops[i + 1]?.stopId ?? null), 'stop order');
    requireCondition(s.coordinates && Number.isFinite(s.coordinates.lat) && Math.abs(s.coordinates.lat) <= 90
      && Number.isFinite(s.coordinates.lng) && Math.abs(s.coordinates.lng) <= 180, 'coordinates');
  });
  requireCondition(Array.isArray(cp.research), 'research');
  const boundary = buildNarrativeEvidenceBoundaryV8(route, cp.research);
  requireCondition(boundary.status === 'ready', 'evidence boundary rejected');
  requireCondition(narrativeFingerprintV6(boundary.manifest) === narrativeFingerprintV6(cp.evidenceManifest), 'evidence changed');
  validateNarrativeArcV8(cp.arc, route, boundary.admittedStops);
  requireCondition(Array.isArray(cp.narrationTargets) && cp.narrationTargets.length === route.stops.length, 'targets');
  for (const stop of route.stops) {
    const targets = cp.narrationTargets.filter(t => t.stopId === stop.stopId);
    requireCondition(targets.length === 1 && targets[0].targetWords > 0 && targets[0].targetSeconds > 0
      && Number.isFinite(targets[0].targetWords) && Number.isFinite(targets[0].targetSeconds), 'stop target');
  }
  requireCondition(geometry?.status === 'walkable' && Number.isFinite(geometry.guidedDurationMinutes)
    && geometry.guidedDurationMinutes > 0 && geometry.externalTransferTimeIncluded === false, 'geometry');
  requireCondition(geometry.requestedDuration === route.durationMinutes, 'geometry request');
  const transferCount = geometry.legs.filter(leg => leg.type === 'self_transfer').length;
  requireCondition(transferCount <= 1 && transferCount === geometry.transferCount, 'transfer count');
  requireCondition(Array.isArray(geometry.blocks)
    && JSON.stringify(geometry.blocks.flatMap(block => block.stopIds)) === JSON.stringify(route.stops.map(stop => stop.stopId)), 'walking blocks');
  requireCondition(geometry.legs.length === route.stops.length - 1, 'route legs');
  geometry.legs.forEach((leg, i) => {
    requireCondition(leg.fromStopId === route.stops[i].stopId && leg.toStopId === route.stops[i + 1].stopId, 'leg order');
    requireCondition(leg.type === 'self_transfer' ? leg.durationSeconds === null
      : leg.type === 'walking' && Number.isFinite(leg.durationSeconds) && leg.durationSeconds >= 0, 'leg duration');
  });
  return snapshot;
}
