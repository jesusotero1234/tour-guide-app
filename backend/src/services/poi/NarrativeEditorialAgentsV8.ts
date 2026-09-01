import {
  createNarrativeEditorialAgentsV6Core,
  NarrativeEditorialAgentsV6,
} from './NarrativeEditorialAgentsV6';
import { NarrativeModelClientOptionsV6 } from './NarrativeModelProfilesV6';
import {
  NarrativeAdmittedStopV8,
  NarrativeEvidenceManifestV8,
} from './NarrativeEvidenceBoundaryV8';
import { createNarrativeEditorialRequestProjectorV8 } from './NarrativeEditorialEvidenceProjectionV8';
import { NarrativeArcV8 } from './NarrativeArcArchitectV8';

export interface NarrativeEditorialAgentsV8 extends NarrativeEditorialAgentsV6 {
  readonly evidenceManifestFingerprint: string;
}

export function createNarrativeEditorialAgentsV8(
  options: NarrativeModelClientOptionsV6,
  admittedStops: NarrativeAdmittedStopV8[],
  manifest: NarrativeEvidenceManifestV8,
  arc: NarrativeArcV8
): NarrativeEditorialAgentsV8 {
  const core = createNarrativeEditorialAgentsV6Core(
    { ...options, writerRateLimitAttempts: 3 },
    createNarrativeEditorialRequestProjectorV8(admittedStops, manifest, arc)
  );
  return {
    ...core,
    evidenceManifestFingerprint: manifest.fingerprint,
  };
}
