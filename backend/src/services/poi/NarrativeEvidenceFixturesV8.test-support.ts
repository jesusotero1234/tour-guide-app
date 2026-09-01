import {
  NarrativeDossierV6,
  NarrativeDossierProposalV6,
  buildNarrativeDossierV6,
} from './NarrativeDossierV6';
import {
  NarrativeEvidenceGatesV8,
  NarrativeEvidenceTierV8,
  NarrativeRoleV8,
  assessNarrativeEvidenceGatesV8,
  classifyEvidenceTierV8,
} from './NarrativeDossierV8';
import {
  NarrativeCapturedSourceV8,
} from './NarrativeSourcesV7';
import {
  NarrativeSourceAuthorityTierV6,
} from './NarrativeSourcesV6';

export interface NarrativeEvidenceFixtureSourceDefinitionV8 {
  sourceId: string;
  publisherKey: string;
  authorityTier: NarrativeSourceAuthorityTierV6;
}

export interface NarrativeEvidenceFixtureInputV8 {
  routeStopId: string;
  entityQid: string;
  includedRoles: NarrativeRoleV8[];
  sources: NarrativeEvidenceFixtureSourceDefinitionV8[];
}

export interface NarrativeEvidenceFixtureResultV8 {
  routeStopId: string;
  entityQid: string;
  captures: NarrativeCapturedSourceV8[];
  dossier: NarrativeDossierV6;
  gates: NarrativeEvidenceGatesV8;
  tier: NarrativeEvidenceTierV8;
}

const ROLE_CONTENT: Record<NarrativeRoleV8, string> = {
  visible_observation: 'La fachada presenta cuatro torres visibles y un patio central.',
  chronology_or_transformation: 'El edificio cambió de función militar a residencia real a lo largo de los siglos.',
  human_agency_or_lived_function: 'Los habitantes del palacio usaban las galerías para ceremonias y vida cotidiana.',
  tension_or_contrast: 'La estructura combina defensas medievales con reformas barrocas posteriores.',
  distinctive_trait: 'La torre del homenaje conserva una silueta vertical única en la ciudad.',
};

function buildCapture(
  source: NarrativeEvidenceFixtureSourceDefinitionV8,
  index: number,
  entityQid: string
): NarrativeCapturedSourceV8 {
  const url = `https://fixture.example/${source.publisherKey}/${source.sourceId}`;
  const roleQuotes = Object.values(ROLE_CONTENT).join(' ');
  const content = `Fixture ${index + 1} for ${entityQid}. ${source.publisherKey} describes the site. ${roleQuotes}`;
  return {
    sourceId: source.sourceId,
    requestedUrl: url,
    finalUrl: url,
    title: `Fixture source ${source.sourceId}`,
    capturedAt: '2026-08-11T12:00:00.000Z',
    content,
    fingerprint: source.sourceId.padEnd(64, '0').slice(0, 64),
    authority: {
      tier: source.authorityTier,
      publisherKey: source.publisherKey,
      rule: 'test_registry',
    },
    containsInstructionLikeText: false,
    finalHttpStatus: 200,
    sourceKind: 'official_web',
    entityQid,
    publisherKey: source.publisherKey,
  } satisfies NarrativeCapturedSourceV8;
}

export function buildNarrativeEvidenceFixtureV8(
  input: NarrativeEvidenceFixtureInputV8
): NarrativeEvidenceFixtureResultV8 {
  if (input.sources.length === 0) {
    throw new Error('test fixture requires at least one source');
  }

  const captures = input.sources.map((source, index) => (
    buildCapture(source, index, input.entityQid)
  ));

  const roleToSourceIds = new Map<NarrativeRoleV8, string[]>();
  for (const role of input.includedRoles) {
    roleToSourceIds.set(role, input.sources.map((source) => source.sourceId));
  }

  const passages: NarrativeDossierProposalV6['passages'] = [];
  const propositions: NarrativeDossierProposalV6['propositions'] = [];

  for (const role of input.includedRoles) {
    const sourceIds = roleToSourceIds.get(role)!;
    const rolePassageIds: string[] = [];
    for (const sourceId of sourceIds) {
      const capture = captures.find((c) => c.sourceId === sourceId)!;
      const quote = ROLE_CONTENT[role];
      const passageId = `passage-${role}-${sourceId}`;
      passages.push({ passageId, sourceId, quote });
      rolePassageIds.push(passageId);
    }
    const isDebatable = role === 'tension_or_contrast' && sourceIds.length >= 2;
    propositions.push({
      propositionId: `prop-${role}`,
      text: `Proposición atómica para ${role}`,
      role,
      certainty: 'high',
      interpretation: isDebatable ? 'debatable' : 'direct',
      sourceIds,
      passageIds: rolePassageIds,
    });
  }

  const proposal: NarrativeDossierProposalV6 = {
    stopId: input.entityQid,
    language: 'es',
    sources: input.sources.map((source) => source.sourceId),
    passages,
    propositions,
    authorizedNames: [],
    authorizedNumbers: [],
    discrepancies: [],
    limits: [],
  } satisfies NarrativeDossierProposalV6;

  const dossier = buildNarrativeDossierV6(proposal, captures);
  const gates = assessNarrativeEvidenceGatesV8(dossier, input.entityQid);
  const tier = classifyEvidenceTierV8(dossier, gates, captures);

  return {
    routeStopId: input.routeStopId,
    entityQid: input.entityQid,
    captures,
    dossier,
    gates,
    tier,
  };
}
