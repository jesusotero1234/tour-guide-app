import { EditorialCallResultV6, requestEditorialStructuredV6 } from './EditorialStructuredLlmV6';
import { NarrativeRouteBriefV6, narrativeFingerprintV6 } from './NarrativeContractsV6';
import { NarrativeArcV6 } from './NarrativeEditorialWorkflowV6';
import {
  NarrativeAdmittedStopV8,
  NarrativeEvidenceManifestV8,
  NARRATIVE_EVIDENCE_MANIFEST_SCHEMA_VERSION_V8,
} from './NarrativeEvidenceBoundaryV8';
import {
  NarrativeModelClientOptionsV6,
  narrativePhaseExecutionV6,
} from './NarrativeModelProfilesV6';
import { validateNarrativeArcShapeV6 } from './NarrativeArcArchitectV6';

export interface NarrativeArcBundleV8 {
  arc: NarrativeArcV6;
  manifest: NarrativeEvidenceManifestV8;
  diagnostic?: EditorialCallResultV6<NarrativeArcV6>;
}

export interface NarrativeArcArchitectV8 {
  build(input: {
    route: NarrativeRouteBriefV6;
    admittedStops: NarrativeAdmittedStopV8[];
    manifest: NarrativeEvidenceManifestV8;
  }): Promise<NarrativeArcBundleV8>;
}

export interface ProjectedNarrativeAdmittedStopV8 {
  routeStopId: string;
  entityQid: string;
  evidenceTier: 'A' | 'B' | 'C';
  routeEligible: true;
  gates: NarrativeAdmittedStopV8['evidence']['gates'];
  dossierFingerprint: string;
  dossier: Omit<NarrativeAdmittedStopV8['dossier'], 'stopId' | 'sufficiency' | 'fingerprint'>;
}

export function projectNarrativeAdmittedStopForArcV8(
  stop: NarrativeAdmittedStopV8
): ProjectedNarrativeAdmittedStopV8 {
  const { stopId, sufficiency, fingerprint, ...dossierProjection } = stop.dossier;
  return {
    routeStopId: stop.routeStopId,
    entityQid: stop.entityQid,
    evidenceTier: stop.evidence.evidenceTier,
    routeEligible: stop.evidence.routeEligible,
    gates: stop.evidence.gates,
    dossierFingerprint: stop.evidence.dossierFingerprint,
    dossier: dossierProjection,
  };
}

function validateArcV8Input(input: {
  route: NarrativeRouteBriefV6;
  admittedStops: NarrativeAdmittedStopV8[];
  manifest: NarrativeEvidenceManifestV8;
}): ProjectedNarrativeAdmittedStopV8[] {
  const { route, admittedStops, manifest } = input;

  if (manifest.routeFingerprint !== route.fingerprint) {
    throw new Error('manifest.routeFingerprint does not match route.fingerprint');
  }

  const routeStopIds = route.stops.map((stop) => stop.stopId);
  const routeStopIdSet = new Set(routeStopIds);
  if (routeStopIdSet.size !== routeStopIds.length) {
    throw new Error('route contains duplicate stop IDs');
  }

  const admittedRouteStopIds = admittedStops.map((stop) => stop.routeStopId);
  const admittedRouteStopIdSet = new Set(admittedRouteStopIds);
  if (admittedRouteStopIdSet.size !== admittedRouteStopIds.length) {
    throw new Error('admittedStops contains duplicate routeStopIds');
  }

  const manifestRouteStopIds = manifest.stops.map((stop) => stop.routeStopId);
  const manifestRouteStopIdSet = new Set(manifestRouteStopIds);
  if (manifestRouteStopIdSet.size !== manifestRouteStopIds.length) {
    throw new Error('manifest.stops contains duplicate routeStopIds');
  }

  if (admittedRouteStopIds.length !== routeStopIds.length || manifestRouteStopIds.length !== routeStopIds.length) {
    throw new Error('admittedStops and manifest.stops must cover every route stop exactly once');
  }

  for (let i = 0; i < routeStopIds.length; i++) {
    const routeStopId = routeStopIds[i];
    if (admittedRouteStopIds[i] !== routeStopId) {
      throw new Error(`admittedStops[${i}].routeStopId does not match route.stops[${i}].stopId`);
    }
    if (manifestRouteStopIds[i] !== routeStopId) {
      throw new Error(`manifest.stops[${i}].routeStopId does not match route.stops[${i}].stopId`);
    }
  }

  const expectedFingerprint = narrativeFingerprintV6({
    schemaVersion: NARRATIVE_EVIDENCE_MANIFEST_SCHEMA_VERSION_V8,
    routeFingerprint: route.fingerprint,
    stops: manifest.stops,
  });
  if (manifest.fingerprint !== expectedFingerprint) {
    throw new Error('manifest.fingerprint does not match recomputed fingerprint');
  }

  const projected: ProjectedNarrativeAdmittedStopV8[] = [];

  for (let i = 0; i < routeStopIds.length; i++) {
    const routeStop = route.stops[i];
    const admitted = admittedStops[i];
    const manifestStop = manifest.stops[i];

    if (admitted.routeStopId !== routeStop.stopId) {
      throw new Error(`admittedStops[${i}].routeStopId does not match route.stops[${i}].stopId`);
    }
    if (admitted.entityQid !== routeStop.wikidataId) {
      throw new Error(`admittedStops[${i}].entityQid does not match route.stops[${i}].wikidataId`);
    }
    if (admitted.dossier.stopId !== routeStop.wikidataId) {
      throw new Error(`admittedStops[${i}].dossier.stopId does not match route.stops[${i}].wikidataId`);
    }

    const evidence = admitted.evidence;
    if (evidence.routeStopId !== routeStop.stopId) {
      throw new Error(`admittedStops[${i}].evidence.routeStopId does not match route.stops[${i}].stopId`);
    }
    if (evidence.entityQid !== routeStop.wikidataId) {
      throw new Error(`admittedStops[${i}].evidence.entityQid does not match route.stops[${i}].wikidataId`);
    }
    if (evidence.dossierFingerprint !== admitted.dossier.fingerprint) {
      throw new Error(`admittedStops[${i}].evidence.dossierFingerprint does not match dossier.fingerprint`);
    }
    if (evidence.evidenceTier !== 'A' && evidence.evidenceTier !== 'B' && evidence.evidenceTier !== 'C') {
      throw new Error(`admittedStops[${i}].evidence.evidenceTier is not A, B, or C`);
    }
    if (evidence.routeEligible !== true) {
      throw new Error(`admittedStops[${i}].evidence.routeEligible must be true`);
    }

    if (manifestStop.routeStopId !== routeStop.stopId) {
      throw new Error(`manifest.stops[${i}].routeStopId does not match route.stops[${i}].stopId`);
    }
    if (manifestStop.entityQid !== routeStop.wikidataId) {
      throw new Error(`manifest.stops[${i}].entityQid does not match route.stops[${i}].wikidataId`);
    }
    if (manifestStop.evidenceTier !== evidence.evidenceTier) {
      throw new Error(`manifest.stops[${i}].evidenceTier does not match evidence.evidenceTier`);
    }
    if (manifestStop.routeEligible !== true) {
      throw new Error(`manifest.stops[${i}].routeEligible must be true`);
    }
    if (narrativeFingerprintV6(manifestStop.gates) !== narrativeFingerprintV6(evidence.gates)) {
      throw new Error(`manifest.stops[${i}].gates do not match evidence.gates`);
    }
    if (manifestStop.dossierFingerprint !== evidence.dossierFingerprint) {
      throw new Error(`manifest.stops[${i}].dossierFingerprint does not match evidence.dossierFingerprint`);
    }
    if (manifestStop.legacyV6IsSufficient !== evidence.legacyV6IsSufficient) {
      throw new Error(`manifest.stops[${i}].legacyV6IsSufficient does not match evidence.legacyV6IsSufficient`);
    }

    projected.push(projectNarrativeAdmittedStopForArcV8(admitted));
  }

  return projected;
}

export function createNarrativeArcArchitectV8(
  options: NarrativeModelClientOptionsV6
): NarrativeArcArchitectV8 {
  return {
    async build(input) {
      const projected = validateArcV8Input(input);
      const routeStopIds = input.route.stops.map((stop) => stop.stopId);
      const execution = narrativePhaseExecutionV6(options, 'architect', undefined, 1);
      const result = await requestEditorialStructuredV6<NarrativeArcV6>({
        callId: `narrative-v8-arc-${input.route.caseId}`,
        input: {
          route: input.route,
          admittedStops: projected,
        },
        provider: execution.provider,
        options: execution.options,
        systemPrompt: [
          'Construye la columna vertebral de una audioguía.',
          'Todas las paradas están admitidas de forma determinista.',
          'Las paradas A, B y C son elegibles.',
          'Solo puedes usar las proposiciones, pasajes y límites proporcionados.',
          'No debes llenar roles ausentes en C.',
          'No añadas hechos externos.',
          `Debes devolver exactamente una entrada de stops para cada parada de la ruta, en el orden exacto de la ruta, usando los valores exactos de stopId de la ruta: ${routeStopIds.join(', ')}.`,
        ].join(' '),
        schema: {
          type: 'object', additionalProperties: false,
          required: ['promise', 'centralQuestion', 'stops'],
          properties: {
            promise: { type: 'string' }, centralQuestion: { type: 'string' },
            stops: { type: 'array', minItems: routeStopIds.length, maxItems: routeStopIds.length, items: {
              type: 'object', additionalProperties: false,
              required: ['stopId', 'contribution', 'bridge'],
              properties: {
                stopId: { type: 'string', enum: routeStopIds }, contribution: { type: 'string' }, bridge: { type: 'string' },
              },
            } },
          },
        },
        toolName: 'build_narrative_arc_v8',
        toolDescription: 'Devuelve la columna vertebral del tour.',
        inputCharacterLimit: 160_000,
        schemaCharacterLimit: 10_000,
        validate: (value) => validateNarrativeArcShapeV6(value, input.route),
      });
      if (result.status !== 'valid' || !result.value) {
        throw new Error(`arc architect v8 failed with status ${result.status}`);
      }
      return { arc: result.value, manifest: input.manifest, diagnostic: result };
    },
  };
}
