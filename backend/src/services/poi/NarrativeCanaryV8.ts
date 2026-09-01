import {
  EssentialRouteCandidateV8,
  EssentialRouteSelectionResultV8,
  selectEssentialRouteV8,
} from './EssentialRouteSelectionV8';
import {
  NarrativeAuthorityRegistryV7,
  classifyAgainstRegistryV7,
} from './NarrativeAuthoritiesV7';
import {
  ClassifyRunBlockInputV8,
  NarrativePhaseLogEntryV8,
  NarrativeRunDiagnosticsV8,
  NarrativeRunReasonV8,
  classifyRunBlockV8,
} from './NarrativeRunStateV8';
import {
  NarrativeCapturedSourceV7,
  NarrativeCapturedSourceV8,
  NarrativeDiscoveryProviderV7,
  NarrativeDiscoveryResultV7,
} from './NarrativeSourcesV7';
import {
  NarrativeEvidenceSpanV7,
  NarrativeReconstructedQuoteV7,
  segmentCaptureIntoSpansV7,
} from './NarrativeSpansV7';
import {
  NarrativeCuratorOutputV8,
  NarrativeEvidenceGatesV8,
  NarrativeEvidenceTierV8,
} from './NarrativeDossierV8';
import { NarrativeDossierV6 } from './NarrativeDossierV6';
import {
  NarrativeCuratorPacketV8,
  NarrativeResearchServicesV8,
  NarrativeStopIdentityV8,
  researchNarrativeStopV8,
} from './NarrativeResearchV8';
import {
  TourGeometryV8Result,
  TourGeometryStopV8,
  composeTourLegsV8,
  tourStopsFromCandidatesV8,
} from './TourGeometryV8';

export interface NarrativeCanaryStopV8 {
  stopId: string;
  name: string;
  required: boolean;
  wikidataId: string;
  sufficiency: {
    isSufficient: boolean;
    missingRoles: string[];
  };
  spans: NarrativeEvidenceSpanV7[];
  quotes: NarrativeReconstructedQuoteV7[];
  capturedSources: NarrativeCapturedSourceV8[];
  searchQueries: number;
  mappedUrls: string[];
  substitutions: number;
  dossier: NarrativeDossierV6 | null;
  gates: NarrativeEvidenceGatesV8;
  evidenceTier: NarrativeEvidenceTierV8 | null;
  routeEligible: boolean;
}

export interface NarrativeCanaryCoreResolutionV8 {
  requiredIds: string[];
  disagreement: boolean;
}

export interface NarrativeCanaryServicesV8 {
  resolveCore(): Promise<NarrativeCanaryCoreResolutionV8>;
  resolveIdentity(input: {
    qid: string;
    language: string;
  }): Promise<NarrativeStopIdentityV8>;
  resolveAuthorities(input: {
    qid: string;
    cityQid: string;
    language: string;
  }): Promise<NarrativeAuthorityRegistryV7>;
  captureWikipedia(input: {
    title: string;
    language: string;
    expectedQid: string;
  }): Promise<NarrativeCapturedSourceV8 | null>;
  discovery: NarrativeDiscoveryProviderV7;
  captureProvider(input: { url: string }): Promise<NarrativeCapturedSourceV7>;
  proposeAdaptiveQueries?(input: {
    stopName: string;
    aliases: string[];
    language: string;
    countryCode: string;
    officialDomains: string[];
    usedQueries: string[];
    missingRoles: NarrativeEvidenceGatesV8['missingWriterRoles'];
  }): Promise<string[]>;
  curate(input: NarrativeCuratorPacketV8): Promise<NarrativeCuratorOutputV8>;
}

export interface NarrativeCanaryInputV8 {
  runId: string;
  city: string;
  cityQid: string;
  country: string;
  language: string;
  theme: string;
  durationMinutes: number;
  candidates: EssentialRouteCandidateV8[];
  maxStops: number;
}

export interface NarrativeCanaryReserveAttemptV8 {
  originalStopId: string;
  reserveStopId: string;
  sufficient: boolean;
  evidenceGaps: string[];
}

export interface NarrativeCanaryResultV8 {
  status: 'ready_for_human_gate' | 'review_required' | 'failed';
  reasons: NarrativeRunReasonV8[];
  core: NarrativeCanaryCoreResolutionV8;
  selection: EssentialRouteSelectionResultV8<EssentialRouteCandidateV8> | null;
  geometry: TourGeometryV8Result | null;
  stops: NarrativeCanaryStopV8[];
  reserveAttempts: NarrativeCanaryReserveAttemptV8[];
  diagnostics: NarrativeRunDiagnosticsV8;
}

export const NARRATIVE_CANARY_BUDGET_V8 = {
  deterministicQueries: 4,
  mappedDomains: 3,
  captures: 12,
  adaptiveQueries: 4,
} as const;

function logPhase(
  diagnostics: NarrativeRunDiagnosticsV8,
  entry: Omit<NarrativePhaseLogEntryV8, 'reason'>,
  reason: NarrativeRunReasonV8 | null = null
): void {
  diagnostics.appendPhase({ ...entry, reason });
}

export async function runNarrativeCanaryV8(
  input: NarrativeCanaryInputV8,
  services: NarrativeCanaryServicesV8
): Promise<NarrativeCanaryResultV8> {
  const diagnostics = new NarrativeRunDiagnosticsV8();
  const core = await services.resolveCore();
  logPhase(diagnostics, {
    phase: 'core_selection',
    provider: 'editorial-resolver',
    language: input.language,
    country: input.country,
    resultCount: core.requiredIds.length,
    mappedUrls: [],
    finalHttpStatus: null,
    authorityTier: 'n/a',
    cacheHit: false,
    evidenceGaps: [],
    substitutions: 0,
    editorialCoreCoverage: core.requiredIds.length > 0 ? 1 : 0,
    freeTransferCount: 0,
  }, core.disagreement ? 'core_disagreement' : null);

  const blockReasons = classifyRunBlockV8({
    missingRequiredIds: [],
    geometryStatus: null,
    geometryReason: null,
    noResults: false,
    captureBlocked: false,
    parseEmpty: false,
    authorityInsufficient: false,
    evidenceReviewRequired: false,
    curatorContractFailed: false,
    coreDisagreement: core.disagreement,
  });
  if (blockReasons.length > 0) {
    return {
      status: 'failed',
      reasons: blockReasons,
      core,
      selection: null,
      geometry: null,
      stops: [],
      reserveAttempts: [],
      diagnostics,
    };
  }

  const selection = selectEssentialRouteV8(
    input.candidates,
    core.requiredIds,
    input.maxStops,
    { requestedDuration: input.durationMinutes, theme: input.theme }
  );
  logPhase(diagnostics, {
    phase: 'core_selection',
    provider: 'essential-selection',
    language: input.language,
    country: input.country,
    resultCount: selection.route.length,
    mappedUrls: [],
    finalHttpStatus: null,
    authorityTier: 'n/a',
    cacheHit: false,
    evidenceGaps: selection.missingRequiredIds,
    substitutions: 0,
    editorialCoreCoverage: selection.coverage.requiredRatio,
    freeTransferCount: 0,
  }, selection.missingRequiredIds.length > 0 ? 'required_identity_missing' : null);

  let geometry: TourGeometryV8Result | null = null;
  if (selection.route.length > 0) {
    const geometryStops = tourStopsFromCandidatesV8(
      selection.route,
      core.requiredIds
    );
    geometry = composeTourLegsV8(geometryStops, input.durationMinutes);
    logPhase(diagnostics, {
      phase: 'geometry',
      provider: 'tour-geometry-v8',
      language: input.language,
      country: input.country,
      resultCount: geometry.blocks.length,
      mappedUrls: [],
      finalHttpStatus: null,
      authorityTier: 'n/a',
      cacheHit: false,
      evidenceGaps: [],
      substitutions: 0,
      editorialCoreCoverage: selection.coverage.requiredRatio,
      freeTransferCount: geometry.transferCount,
    }, geometry.reason ?? null);
  }

  const geometryReasons = geometry ? classifyRunBlockV8({
    missingRequiredIds: selection.missingRequiredIds,
    geometryStatus: geometry.status === 'walkable' ? 'walkable' : 'route_review_required',
    geometryReason: geometry.reason,
    noResults: false,
    captureBlocked: false,
    parseEmpty: false,
    authorityInsufficient: false,
    evidenceReviewRequired: false,
    curatorContractFailed: false,
    coreDisagreement: false,
  }) : [];

  const stops: NarrativeCanaryStopV8[] = [];
  const reserveAttempts: NarrativeCanaryReserveAttemptV8[] = [];
  let captureBlocked = false;
  let parseEmpty = false;
  let curatorContractFailed = false;
  let substitutionsApplied = 0;

  if (geometry && geometryReasons.length === 0) {
    const selectedStopIds = new Set(
      geometry.blocks.flatMap((block) => block.stopIds)
    );
    const availableReserveIds = new Set(
      input.candidates
        .filter((candidate) => (
          typeof candidate.wikidataId === 'string'
          && !selectedStopIds.has(candidate.wikidataId)
          && !core.requiredIds.includes(candidate.wikidataId)
        ))
        .map((candidate) => candidate.wikidataId as string)
    );
    const candidateByWikidataId = new Map(
      input.candidates
        .filter((candidate) => typeof candidate.wikidataId === 'string')
        .map((candidate) => [candidate.wikidataId as string, candidate])
    );
    for (const block of geometry.blocks) {
      for (const stop of block.stopIds) {
        const candidate = selection.route.find((item) => (
          item.wikidataId === stop
        )) as EssentialRouteCandidateV8;
        let stopResult = await researchCanaryStopV8({
          runId: input.runId,
          stop,
          candidate,
          cityName: input.city,
          cityQid: input.cityQid,
          language: input.language,
          country: input.country,
          requiredIds: core.requiredIds,
        }, services, diagnostics);
        captureBlocked = captureBlocked || stopResult.captureBlocked;
        parseEmpty = parseEmpty || stopResult.parseEmpty;
        curatorContractFailed = curatorContractFailed || stopResult.curatorContractFailed;

        const isRequired = core.requiredIds.includes(stop);
        if (!isRequired
          && !stopResult.routeEligible
          && availableReserveIds.size > 0) {
          const blockCoordinates = block.stopIds
            .map((blockStopId) => selection.route.find((item) => item.wikidataId === blockStopId))
            .filter((item): item is EssentialRouteCandidateV8 => Boolean(item?.coordinates))
            .map((item) => item.coordinates as { lat: number; lng: number });
          const centroid = blockCoordinates.length > 0 ? {
            lat: blockCoordinates.reduce((total, coordinate) => total + coordinate.lat, 0)
              / blockCoordinates.length,
            lng: blockCoordinates.reduce((total, coordinate) => total + coordinate.lng, 0)
              / blockCoordinates.length,
          } : null;
          const nearestReserveId = [...availableReserveIds].sort((left, right) => {
            const leftCandidate = candidateByWikidataId.get(left);
            const rightCandidate = candidateByWikidataId.get(right);
            const leftDistance = centroid && leftCandidate?.coordinates
              ? Math.hypot(leftCandidate.coordinates.lat - centroid.lat, leftCandidate.coordinates.lng - centroid.lng)
              : 0;
            const rightDistance = centroid && rightCandidate?.coordinates
              ? Math.hypot(rightCandidate.coordinates.lat - centroid.lat, rightCandidate.coordinates.lng - centroid.lng)
              : 0;
            return leftDistance - rightDistance;
          })[0];
          if (nearestReserveId) {
            availableReserveIds.delete(nearestReserveId);
            const nearestReserve = candidateByWikidataId.get(nearestReserveId) as EssentialRouteCandidateV8;
            const reserveResult = await researchCanaryStopV8({
              runId: input.runId,
              stop: nearestReserveId,
              candidate: nearestReserve,
              cityName: input.city,
              cityQid: input.cityQid,
              language: input.language,
              country: input.country,
              requiredIds: core.requiredIds,
            }, services, diagnostics);
            reserveAttempts.push({
              originalStopId: stop,
              reserveStopId: nearestReserveId,
              sufficient: reserveResult.routeEligible,
              evidenceGaps: reserveResult.stop.sufficiency.missingRoles,
            });
            if (reserveResult.routeEligible) {
              stopResult = {
                ...reserveResult,
                stop: {
                  ...reserveResult.stop,
                  substitutions: stopResult.stop.substitutions + 1,
                },
              };
              substitutionsApplied += 1;
            }
          }
        }
        stops.push(stopResult.stop);
      }
    }
  }

  const candidateByWikidataId = new Map(
    input.candidates
      .filter((candidate) => typeof candidate.wikidataId === 'string')
      .map((candidate) => [candidate.wikidataId as string, candidate])
  );
  const finalRoute = stops
    .map((stop) => candidateByWikidataId.get(stop.stopId))
    .filter((candidate): candidate is EssentialRouteCandidateV8 => Boolean(candidate))
    .map((candidate, index) => ({ ...candidate, position: index }));
  let finalGeometry = geometry;
  if (stops.length > 0) {
    const geometryStops = tourStopsFromCandidatesV8(finalRoute, core.requiredIds);
    finalGeometry = composeTourLegsV8(geometryStops, input.durationMinutes);
    logPhase(diagnostics, {
      phase: 'geometry',
      provider: 'tour-geometry-v8',
      language: input.language,
      country: input.country,
      resultCount: finalGeometry.blocks.length,
      mappedUrls: [],
      finalHttpStatus: null,
      authorityTier: 'n/a',
      cacheHit: false,
      evidenceGaps: [],
      substitutions: substitutionsApplied,
      editorialCoreCoverage: selection.coverage.requiredRatio,
      freeTransferCount: finalGeometry.transferCount,
    }, finalGeometry.reason ?? null);
  }
  const finalRequiredIds = new Set(selection.requiredIds);
  const finalOptionalIds = finalRoute
    .filter((candidate) => (
      typeof candidate.wikidataId === 'string'
      && !finalRequiredIds.has(candidate.wikidataId as string)
    ))
    .map((candidate) => candidate.wikidataId as string)
    .sort();
  const finalSelection: EssentialRouteSelectionResultV8<EssentialRouteCandidateV8> = stops.length > 0
    ? {
      ...selection,
      route: finalRoute,
      optionalIds: finalOptionalIds,
      coverage: {
        ...selection.coverage,
        optionalCount: finalOptionalIds.length,
      },
    }
    : selection;
  const evidenceReviewRequired = stops.some((stop) => !stop.routeEligible);
  const noResults = selection.route.length === 0;
  const finalGeometryReasons = finalGeometry
    ? classifyRunBlockV8({
      missingRequiredIds: selection.missingRequiredIds,
      geometryStatus: finalGeometry.status === 'walkable' ? 'walkable' : 'route_review_required',
      geometryReason: finalGeometry.reason,
      noResults: false,
      captureBlocked: false,
      parseEmpty: false,
      authorityInsufficient: false,
      evidenceReviewRequired: false,
      curatorContractFailed: false,
      coreDisagreement: false,
    })
    : [];

  const reasons = finalGeometryReasons.length > 0
    ? finalGeometryReasons
    : classifyRunBlockV8({
      missingRequiredIds: selection.missingRequiredIds,
      geometryStatus: null,
      geometryReason: null,
      noResults,
      captureBlocked,
      parseEmpty,
      authorityInsufficient: false,
      evidenceReviewRequired,
      curatorContractFailed,
      coreDisagreement: false,
    });
  const requiredInsufficient = stops.some((stop) => (
    stop.required && !stop.sufficiency.isSufficient
  ));

  return {
    status: noResults
      ? 'failed'
      : reasons.length > 0 || requiredInsufficient
        || finalGeometry?.status === 'route_review_required'
        ? 'review_required'
        : 'ready_for_human_gate',
    reasons,
    core,
    selection: finalSelection,
    geometry: finalGeometry,
    stops,
    reserveAttempts,
    diagnostics,
  };
}

interface ResearchCanaryStopContextV8 {
  runId: string;
  stop: string;
  candidate: EssentialRouteCandidateV8;
  cityName: string;
  cityQid: string;
  language: string;
  country: string;
  requiredIds: string[];
}

interface ResearchCanaryStopResultV8 {
  stop: NarrativeCanaryStopV8;
  routeEligible: boolean;
  captureBlocked: boolean;
  parseEmpty: boolean;
  curatorContractFailed: boolean;
}

const EMPTY_GATES_V8: NarrativeEvidenceGatesV8 = {
  minimumEvidenceReady: false,
  writerReady: false,
  missingMinimumRoles: [],
  missingWriterRoles: [],
};

function researchServicesFromCanaryV8(services: NarrativeCanaryServicesV8): NarrativeResearchServicesV8 {
  return {
    resolveIdentity: services.resolveIdentity,
    resolveAuthorities: services.resolveAuthorities,
    resolveQidFromWikipedia: async () => null,
    captureWikipedia: services.captureWikipedia,
    search: services.discovery.search,
    mapOfficialSite: services.discovery.mapOfficialSite,
    captureWeb: services.captureProvider,
    curate: services.curate,
    proposeAdaptiveQueries: services.proposeAdaptiveQueries,
  };
}

async function researchCanaryStopV8(
  context: ResearchCanaryStopContextV8,
  services: NarrativeCanaryServicesV8,
  diagnostics: NarrativeRunDiagnosticsV8
): Promise<ResearchCanaryStopResultV8> {
  const wikidataId = typeof context.candidate.wikidataId === 'string'
    ? context.candidate.wikidataId
    : context.stop;
  const research = await researchNarrativeStopV8({
    runId: context.runId,
    stopId: wikidataId,
    stopName: context.candidate.name ?? context.stop,
    cityName: context.cityName,
    cityQid: context.cityQid,
    countryCode: context.country,
    language: context.language,
    required: context.requiredIds.includes(wikidataId),
  }, researchServicesFromCanaryV8(services));
  const gates = research.status === 'failed' ? EMPTY_GATES_V8 : research.gates;
  const capturedSources = research.captures;
  const spans = capturedSources
    .flatMap((capture) => segmentCaptureIntoSpansV7(capture).spans)
    .slice(0, 40);
  const quotes: NarrativeReconstructedQuoteV7[] = research.status === 'failed'
    ? []
    : (research.dossier?.passages ?? []).map((passage) => ({
      sourceId: passage.sourceId,
      evidenceSpanIds: [],
      quote: passage.quote,
    }));
  const stop: NarrativeCanaryStopV8 = {
    stopId: wikidataId,
    name: context.candidate.name ?? context.stop,
    required: context.requiredIds.includes(wikidataId),
    wikidataId,
    sufficiency: {
      isSufficient: gates.minimumEvidenceReady,
      missingRoles: gates.missingMinimumRoles,
    },
    spans,
    quotes,
    capturedSources,
    searchQueries: research.stats.searchQueries,
    mappedUrls: [],
    substitutions: 0,
    dossier: research.status === 'failed' ? null : research.dossier,
    gates,
    evidenceTier: research.evidenceTier,
    routeEligible: research.routeEligible,
  };
  logPhase(diagnostics, {
    phase: 'curation',
    provider: 'narrative-research-v8',
    language: context.language,
    country: context.country,
    resultCount: capturedSources.length,
    mappedUrls: [],
    finalHttpStatus: null,
    authorityTier: capturedSources.at(-1)?.authority.tier ?? 'n/a',
    cacheHit: false,
    evidenceGaps: gates.missingWriterRoles,
    substitutions: 0,
    editorialCoreCoverage: 0,
    freeTransferCount: 0,
  }, research.routeEligible ? null : 'evidence_review_required');
  const curatorContractFailed = research.status === 'evidence_review_required'
    && research.evidenceTier === null
    && research.reasons.some((reason) => reason.includes('curator_contract_failed'));
  return {
    stop,
    routeEligible: research.routeEligible,
    captureBlocked: false,
    parseEmpty: false,
    curatorContractFailed,
  };
}

export function canaryStopsForGeometryV8(
  geometry: TourGeometryV8Result,
  candidates: EssentialRouteCandidateV8[],
  requiredIds: string[]
): TourGeometryStopV8[] {
  const byWikidataId = new Map(
    candidates
      .filter((candidate) => typeof candidate.wikidataId === 'string')
      .map((candidate) => [candidate.wikidataId as string, candidate])
  );
  const stops = geometry.blocks.flatMap((block) => block.stopIds)
    .map((stopId) => {
      const candidate = byWikidataId.get(stopId);
      const coordinates = candidate?.coordinates ?? { lat: 0, lng: 0 };
      return {
        stopId,
        name: candidate?.name ?? stopId,
        coordinates: {
          lat: coordinates.lat as number,
          lng: coordinates.lng as number,
        },
        required: requiredIds.includes(stopId),
      };
    });
  return stops;
}
