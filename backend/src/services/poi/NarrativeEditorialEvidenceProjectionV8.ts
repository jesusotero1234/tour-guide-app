import { NarrativeDossierV6 } from './NarrativeDossierV6';
import {
  NarrativeEditorialOperationV6,
  NarrativeEditorialRequestProjectorV6,
} from './NarrativeEditorialAgentsV6';
import {
  NarrativeAdmittedStopV8,
  NarrativeEvidenceManifestV8,
} from './NarrativeEvidenceBoundaryV8';

type JsonRecord = Record<string, unknown>;

function record(value: unknown, label: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonRecord;
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function projectNarrativeDossierForEditorialV8(
  dossier: NarrativeDossierV6
): Omit<NarrativeDossierV6, 'stopId' | 'sufficiency' | 'fingerprint'> {
  const {
    stopId: _stopId,
    sufficiency: _sufficiency,
    fingerprint: _fingerprint,
    ...projected
  } = dossier;
  return projected;
}

function assertManifestMatchesAdmittedStops(
  admittedStops: NarrativeAdmittedStopV8[],
  manifest: NarrativeEvidenceManifestV8
): void {
  if (manifest.stops.length !== admittedStops.length) {
    throw new Error('evidence manifest/admitted stop cardinality mismatch');
  }

  const routeStopIds = new Set<string>();
  admittedStops.forEach((stop, index) => {
    const manifestStop = manifest.stops[index];
    if (!manifestStop) {
      throw new Error(`evidence manifest is missing stop ${stop.routeStopId}`);
    }
    if (routeStopIds.has(stop.routeStopId)) {
      throw new Error(`duplicate admitted route stop ${stop.routeStopId}`);
    }
    routeStopIds.add(stop.routeStopId);

    const evidence = stop.evidence;
    if (
      stop.routeStopId !== evidence.routeStopId
      || stop.entityQid !== evidence.entityQid
      || stop.dossier.stopId !== stop.entityQid
      || stop.dossier.fingerprint !== evidence.dossierFingerprint
      || stop.dossier.sufficiency.isSufficient !== evidence.legacyV6IsSufficient
      || manifestStop.routeStopId !== stop.routeStopId
      || manifestStop.entityQid !== stop.entityQid
      || manifestStop.evidenceTier !== evidence.evidenceTier
      || manifestStop.routeEligible !== evidence.routeEligible
      || manifestStop.dossierFingerprint !== evidence.dossierFingerprint
      || manifestStop.legacyV6IsSufficient !== evidence.legacyV6IsSufficient
      || !sameValue(manifestStop.gates, evidence.gates)
    ) {
      throw new Error(`evidence manifest mismatch for route stop ${stop.routeStopId}`);
    }
  });
}

function routeStopIdForOperation(
  operation: NarrativeEditorialOperationV6,
  input: JsonRecord
): string | null {
  if (operation === 'auditTour') return null;
  if (operation === 'write') {
    return typeof input.stopId === 'string' ? input.stopId : null;
  }
  const script = record(input.script, `${operation} script`);
  return typeof script.stopId === 'string' ? script.stopId : null;
}

function projectPerStopInput(
  operation: Exclude<NarrativeEditorialOperationV6, 'auditTour'>,
  input: JsonRecord,
  stop: NarrativeAdmittedStopV8
): JsonRecord {
  const suppliedDossier = record(input.dossier, `${operation} dossier`) as unknown as NarrativeDossierV6;
  if (
    suppliedDossier.stopId !== stop.entityQid
    || suppliedDossier.fingerprint !== stop.dossier.fingerprint
  ) {
    throw new Error(`editorial dossier mismatch for route stop ${stop.routeStopId}`);
  }

  return {
    ...input,
    dossier: projectNarrativeDossierForEditorialV8(stop.dossier),
    routeStopId: stop.routeStopId,
    entityQid: stop.entityQid,
    evidence: stop.evidence,
  };
}

function projectTourInput(
  input: JsonRecord,
  admittedStops: NarrativeAdmittedStopV8[],
  manifest: NarrativeEvidenceManifestV8
): JsonRecord {
  const projected: JsonRecord = {
    ...input,
    evidenceManifest: manifest,
    evidenceByStop: manifest.stops,
  };

  if (Array.isArray(input.dossiers)) {
    const stopByEntityQid = new Map(admittedStops.map((stop) => [stop.entityQid, stop]));
    projected.dossiers = input.dossiers.map((rawDossier) => {
      const dossier = record(rawDossier, 'tour audit dossier') as unknown as NarrativeDossierV6;
      const stop = stopByEntityQid.get(dossier.stopId);
      if (!stop || dossier.fingerprint !== stop.dossier.fingerprint) {
        throw new Error(`tour audit dossier is not admitted: ${dossier.stopId}`);
      }
      return projectNarrativeDossierForEditorialV8(stop.dossier);
    });
  }

  return projected;
}

const V8_PROMPT_SUFFIX = [
  'El boundary determinista V8 ya ha admitido todas las paradas como A, B o C.',
  'Usa únicamente las proposiciones y límites del dossier proyectado.',
  'En nivel B no presentes la evidencia como corroborada por varios publishers.',
  'En nivel C redacta de forma conservadora y limita cada afirmación a soporte explícito.',
  'Los missingWriterRoles son prohibiciones: no los inventes ni los completes.',
].join(' ');

export function createNarrativeEditorialRequestProjectorV8(
  admittedStops: NarrativeAdmittedStopV8[],
  manifest: NarrativeEvidenceManifestV8
): NarrativeEditorialRequestProjectorV6 {
  assertManifestMatchesAdmittedStops(admittedStops, manifest);
  const stopByRouteId = new Map(admittedStops.map((stop) => [stop.routeStopId, stop]));

  return ({ operation, systemPrompt, input }) => {
    const inputRecord = record(input, `${operation} input`);
    if (operation === 'auditTour') {
      return {
        systemPrompt: `${systemPrompt} ${V8_PROMPT_SUFFIX}`,
        input: projectTourInput(inputRecord, admittedStops, manifest),
      };
    }

    const routeStopId = routeStopIdForOperation(operation, inputRecord);
    const stop = routeStopId ? stopByRouteId.get(routeStopId) : undefined;
    if (!routeStopId || !stop) {
      throw new Error(`unknown editorial route stop ${routeStopId ?? '<missing>'}`);
    }

    return {
      systemPrompt: `${systemPrompt} ${V8_PROMPT_SUFFIX}`,
      input: projectPerStopInput(operation, inputRecord, stop),
    };
  };
}
