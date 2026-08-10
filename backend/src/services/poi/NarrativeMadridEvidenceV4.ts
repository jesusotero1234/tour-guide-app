import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  NarrativeEvidenceCaseInputV4,
  NarrativeEvidenceCaseV4,
  hydrateNarrativeEvidenceCaseV4,
} from './NarrativeEvidenceV4';

export const MADRID_NARRATIVE_EVIDENCE_FIXTURE_V4 = resolve(
  __dirname,
  '../../../fixtures/narrative-madrid-v4/evidence.json'
);

interface MadridNarrativeEvidenceFixtureV4 {
  expectedFingerprint: string;
  evidence: NarrativeEvidenceCaseInputV4;
}

export function loadMadridNarrativeEvidenceCaseV4(
  path = MADRID_NARRATIVE_EVIDENCE_FIXTURE_V4
): NarrativeEvidenceCaseV4 {
  const fixture = JSON.parse(readFileSync(path, 'utf8')) as MadridNarrativeEvidenceFixtureV4;
  if (!fixture || typeof fixture.expectedFingerprint !== 'string' || !fixture.evidence) {
    throw new Error('Madrid narrative evidence v4 fixture is invalid');
  }
  const evidence = hydrateNarrativeEvidenceCaseV4(fixture.evidence);
  if (fixture.expectedFingerprint !== evidence.fingerprint) {
    throw new Error('Madrid narrative evidence v4 fixture fingerprint changed');
  }
  return evidence;
}
