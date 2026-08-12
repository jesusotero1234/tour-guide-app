import {
  NARRATIVE_SUFFICIENCY_ROLES_V6,
  NarrativeDossierV6,
  NarrativeSufficiencyRoleV6,
} from './NarrativeDossierV6';
import { NarrativeCapturedSourceV6 } from './NarrativeSourcesV6';

export type NarrativeFacetStatusV6 = 'met' | 'partial' | 'missing' | 'contradictory';

export interface NarrativeResearchFacetV6 {
  facetId: string;
  hard: boolean;
  allowedRoles: NarrativeSufficiencyRoleV6[];
  humanEvidence: Array<{ referenceId: string; literalExcerpt: string }>;
  conceptGroups: string[][];
  contradictionPhrases: string[];
}

export interface NarrativeMadridResearchRubricV6 {
  schemaVersion: 'narrative-madrid-research-rubric-v6.1';
  minimumAuthorityPublisherMatches: number;
  stops: Array<{
    stopId: string;
    expectedPublishers: string[];
    forbiddenNarrativeClaims: string[];
    referenceSources: Array<{
      referenceId: string;
      url: string;
      literalAnchors: string[];
    }>;
    facets: NarrativeResearchFacetV6[];
  }>;
}

export interface NarrativeFacetEvaluationV6 {
  stopId: string;
  facetId: string;
  status: NarrativeFacetStatusV6;
  propositionIds: string[];
  passageIds: string[];
}

export type NarrativeCalibrationGateResultV6 =
  | { status: 'passed'; facets?: NarrativeFacetEvaluationV6[] }
  | { status: 'human_spot_check_required'; stopId: string; reason: string }
  | {
    status: 'reference_evidence_missing';
    stopId: string;
    missingReferenceIds: string[];
    reason: string;
  }
  | { status: 'model_calibration_failed'; stage: 'editorial_engine' | 'research'; reason: string };

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error(`${label} must contain non-empty strings`);
  }
  return value;
}

export function validateNarrativeMadridResearchRubricV6(
  raw: unknown
): NarrativeMadridResearchRubricV6 {
  const root = objectValue(raw, 'Madrid research rubric');
  if (root.schemaVersion !== 'narrative-madrid-research-rubric-v6.1') {
    throw new Error('invalid Madrid research rubric schema');
  }
  if (!Number.isInteger(root.minimumAuthorityPublisherMatches)
    || Number(root.minimumAuthorityPublisherMatches) < 1) {
    throw new Error('minimumAuthorityPublisherMatches must be positive');
  }
  if (!Array.isArray(root.stops) || root.stops.length === 0) {
    throw new Error('Madrid research rubric requires stops');
  }
  const stops = root.stops.map((rawStop, index) => {
    const stop = objectValue(rawStop, `rubric stop ${index}`);
    if (typeof stop.stopId !== 'string' || !stop.stopId.trim()) {
      throw new Error(`rubric stop ${index} requires stopId`);
    }
    if (!Array.isArray(stop.facets)) {
      throw new Error(`rubric stop ${index} facets must be an array`);
    }
    const facets = stop.facets.map((rawFacet, facetIndex): NarrativeResearchFacetV6 => {
      const facet = objectValue(
        rawFacet, `rubric stop ${index} facet ${facetIndex}`
      );
      if (typeof facet.facetId !== 'string' || !facet.facetId.trim()) {
        throw new Error(`rubric stop ${index} facet ${facetIndex} requires facetId`);
      }
      if (typeof facet.hard !== 'boolean') {
        throw new Error(`rubric stop ${index} facet ${facetIndex} requires hard`);
      }
      const allowedRoles = stringArray(
        facet.allowedRoles, `rubric stop ${index} facet ${facetIndex} allowedRoles`
      );
      if (allowedRoles.length === 0 || allowedRoles.some((role) => (
        !NARRATIVE_SUFFICIENCY_ROLES_V6.includes(role as NarrativeSufficiencyRoleV6)
      ))) {
        throw new Error(`rubric stop ${index} facet ${facetIndex} has invalid allowedRoles`);
      }
      if (!Array.isArray(facet.humanEvidence) || facet.humanEvidence.length === 0) {
        throw new Error(`rubric stop ${index} facet ${facetIndex} requires human evidence`);
      }
      const humanEvidence = facet.humanEvidence.map((rawEvidence, evidenceIndex) => {
        const evidence = objectValue(
          rawEvidence, `rubric stop ${index} facet ${facetIndex} evidence ${evidenceIndex}`
        );
        if (typeof evidence.referenceId !== 'string' || !evidence.referenceId.trim()
          || typeof evidence.literalExcerpt !== 'string' || !evidence.literalExcerpt.trim()) {
          throw new Error(
            `rubric stop ${index} facet ${facetIndex} evidence ${evidenceIndex} is malformed`
          );
        }
        return {
          referenceId: evidence.referenceId,
          literalExcerpt: evidence.literalExcerpt,
        };
      });
      if (!Array.isArray(facet.conceptGroups) || facet.conceptGroups.length === 0) {
        throw new Error(`rubric stop ${index} facet ${facetIndex} requires conceptGroups`);
      }
      const conceptGroups = facet.conceptGroups.map((group, groupIndex) => stringArray(
        group, `rubric stop ${index} facet ${facetIndex} conceptGroups[${groupIndex}]`
      ));
      if (conceptGroups.some((group) => group.length === 0)) {
        throw new Error(`rubric stop ${index} facet ${facetIndex} has an empty concept group`);
      }
      return {
        facetId: facet.facetId,
        hard: facet.hard,
        allowedRoles: allowedRoles as NarrativeSufficiencyRoleV6[],
        humanEvidence,
        conceptGroups,
        contradictionPhrases: stringArray(
          facet.contradictionPhrases,
          `rubric stop ${index} facet ${facetIndex} contradictionPhrases`
        ),
      };
    });
    if (new Set(facets.map((facet) => facet.facetId)).size !== facets.length) {
      throw new Error(`rubric stop ${index} facetIds must be unique`);
    }
    if (!Array.isArray(stop.referenceSources)) {
      throw new Error(`rubric stop ${index} referenceSources must be an array`);
    }
    const referenceSources = stop.referenceSources.map((rawSource, sourceIndex) => {
      const source = objectValue(rawSource, `rubric stop ${index} reference ${sourceIndex}`);
      if (typeof source.referenceId !== 'string' || !source.referenceId.trim()
        || typeof source.url !== 'string') {
        throw new Error(`rubric stop ${index} reference ${sourceIndex} is malformed`);
      }
      const url = new URL(source.url);
      if (url.protocol !== 'https:') {
        throw new Error(`rubric stop ${index} reference ${sourceIndex} must use HTTPS`);
      }
      const literalAnchors = stringArray(
        source.literalAnchors, `rubric stop ${index} reference ${sourceIndex} literalAnchors`
      );
      if (literalAnchors.length === 0) {
        throw new Error(`rubric stop ${index} reference ${sourceIndex} requires literal anchors`);
      }
      return { referenceId: source.referenceId, url: source.url, literalAnchors };
    });
    if (new Set(referenceSources.map((source) => source.referenceId)).size
      !== referenceSources.length) {
      throw new Error(`rubric stop ${index} reference IDs must be unique`);
    }
    for (const facet of facets) {
      for (const evidence of facet.humanEvidence) {
        const source = referenceSources.find((item) => item.referenceId === evidence.referenceId);
        if (!source?.literalAnchors.includes(evidence.literalExcerpt)) {
          throw new Error(`${facet.facetId} human evidence is not anchored to referenceSources`);
        }
      }
    }
    return {
      stopId: stop.stopId,
      expectedPublishers: stringArray(stop.expectedPublishers, `rubric stop ${index} publishers`),
      forbiddenNarrativeClaims: stringArray(
        stop.forbiddenNarrativeClaims, `rubric stop ${index} forbidden claims`
      ),
      referenceSources,
      facets,
    };
  });
  if (new Set(stops.map((stop) => stop.stopId)).size !== stops.length) {
    throw new Error('Madrid research rubric stopIds must be unique');
  }
  return {
    schemaVersion: 'narrative-madrid-research-rubric-v6.1',
    minimumAuthorityPublisherMatches: Number(root.minimumAuthorityPublisherMatches),
    stops,
  };
}

export function narrativeReferenceRequirementsFromRubricV6(
  rubric: NarrativeMadridResearchRubricV6,
  stopId: string
): Array<{
  referenceId: string;
  url: string;
  literalAnchors: readonly string[];
  facetTargets: Array<{
    facetId: string;
    allowedRoles: readonly NarrativeSufficiencyRoleV6[];
    conceptGroups: readonly (readonly string[])[];
    humanEvidence: ReadonlyArray<{ referenceId: string; literalExcerpt: string }>;
  }>;
}> {
  const stop = rubric.stops.find((item) => item.stopId === stopId);
  if (!stop) throw new Error(`research rubric has no stop ${stopId}`);
  return stop.referenceSources.map((source) => ({
    referenceId: source.referenceId,
    url: source.url,
    literalAnchors: source.literalAnchors,
    facetTargets: stop.facets.filter((facet) => facet.humanEvidence.some((evidence) => (
      evidence.referenceId === source.referenceId
    ))).map((facet) => ({
      facetId: facet.facetId,
      allowedRoles: facet.allowedRoles,
      conceptGroups: facet.conceptGroups,
      humanEvidence: facet.humanEvidence,
    })),
  }));
}

export function narrativeReferenceEvidenceFromCapturesV6(
  rubric: NarrativeMadridResearchRubricV6,
  captures: readonly NarrativeCapturedSourceV6[]
): Array<{ referenceId: string; excerpts: readonly string[] }> {
  return rubric.stops.flatMap((stop) => stop.referenceSources.map((reference) => {
    const capture = captures.find((item) => (
      item.requestedUrl === reference.url || item.finalUrl === reference.url
    ));
    return {
      referenceId: reference.referenceId,
      excerpts: capture
        ? reference.literalAnchors.filter((anchor) => capture.content.includes(anchor))
        : [],
    };
  }));
}

export function evaluateNarrativeEditorialGateV6(input: {
  developmentStopIds: string[];
  validationStopIds: string[];
  stopOutcomes: Array<{
    stopId: string;
    status: string;
    promptFingerprint: string;
  }>;
  mutations: Array<{ mutationId: string; detected: boolean }>;
}): NarrativeCalibrationGateResultV6 {
  const expected = [...input.developmentStopIds, ...input.validationStopIds];
  const missing = expected.filter((stopId) => !input.stopOutcomes.some((item) => item.stopId === stopId));
  const notReady = input.stopOutcomes.filter((item) => item.status !== 'ready_for_human_gate');
  const promptFingerprints = new Set(input.stopOutcomes.map((item) => item.promptFingerprint));
  const missedMutations = input.mutations.filter((mutation) => !mutation.detected);
  const reasons = [
    ...(missing.length > 0 ? [`missing stops: ${missing.join(', ')}`] : []),
    ...(notReady.length > 0
      ? [`stops not ready: ${notReady.map((item) => item.stopId).join(', ')}`]
      : []),
    ...(promptFingerprints.size !== 1 ? ['prompt changed between development and holdout'] : []),
    ...(missedMutations.length > 0
      ? [`missed mutations: ${missedMutations.map((item) => item.mutationId).join(', ')}`]
      : []),
  ];
  return reasons.length === 0
    ? { status: 'passed' }
    : { status: 'model_calibration_failed', stage: 'editorial_engine', reason: reasons.join('; ') };
}

function normalized(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function phrasePresent(text: string, phrase: string): boolean {
  const words = normalized(phrase).split(' ').filter(Boolean);
  if (words.length === 0) return false;
  const tokens = new Set(text.split(' '));
  return words.every((word) => tokens.has(word));
}

function evaluateFacet(
  stopId: string,
  facet: NarrativeResearchFacetV6,
  referenceSources: Array<{ referenceId: string; url: string }>,
  dossier: NarrativeDossierV6
): NarrativeFacetEvaluationV6 {
  const eligible = dossier.propositions.filter((proposition) => (
    facet.allowedRoles.includes(proposition.role)
  ));
  const contradictory = eligible.filter((proposition) => (
    facet.contradictionPhrases.some((phrase) => (
      normalized(proposition.text).includes(normalized(phrase))
    ))
  ));
  if (contradictory.length > 0) {
    return {
      stopId, facetId: facet.facetId, status: 'contradictory',
      propositionIds: contradictory.map((item) => item.propositionId),
      passageIds: [...new Set(contradictory.flatMap((item) => item.passageIds))],
    };
  }
  const passagesById = new Map(dossier.passages.map((passage) => [passage.passageId, passage]));
  const sourceUrlById = new Map(dossier.sources.map((source) => [source.sourceId, source.finalUrl]));
  const contributors = new Map<string, typeof eligible[number]>();
  let coveredGroups = 0;
  for (const aliases of facet.conceptGroups) {
    const contributor = eligible.find((proposition) => {
      if (!aliases.some((alias) => phrasePresent(normalized(proposition.text), alias))) return false;
      return proposition.passageIds.some((passageId) => {
        const passage = passagesById.get(passageId);
        return passage !== undefined
          && proposition.sourceIds.includes(passage.sourceId)
          && aliases.some((alias) => phrasePresent(normalized(passage.quote), alias));
      });
    });
    if (contributor) {
      contributors.set(contributor.propositionId, contributor);
      coveredGroups += 1;
    }
  }
  const traceable = [...contributors.values()];
  const anchored = facet.humanEvidence.every((evidence) => {
    const referenceUrl = referenceSources.find((source) => (
      source.referenceId === evidence.referenceId
    ))?.url;
    return referenceUrl !== undefined && traceable.some((proposition) => (
      proposition.passageIds.some((passageId) => {
        const passage = passagesById.get(passageId);
        return passage !== undefined
          && sourceUrlById.get(passage.sourceId) === referenceUrl
          && passage.quote.includes(evidence.literalExcerpt);
      })
    ));
  });
  const status: NarrativeFacetStatusV6 = coveredGroups === facet.conceptGroups.length && anchored
    ? 'met'
    : coveredGroups > 0 ? 'partial' : 'missing';
  return {
    stopId, facetId: facet.facetId, status,
    propositionIds: traceable.map((item) => item.propositionId),
    passageIds: [...new Set(traceable.flatMap((item) => item.passageIds))],
  };
}

function missingReferenceEvidence(input: {
  rubric: NarrativeMadridResearchRubricV6;
  referenceEvidence?: Array<{ referenceId: string; excerpts: readonly string[] }>;
}): { stopId: string; missingReferenceIds: string[] } | undefined {
  const byId = new Map((input.referenceEvidence ?? []).map((item) => [
    item.referenceId, item.excerpts,
  ]));
  for (const stop of input.rubric.stops) {
    const missing = [...new Set(stop.facets.flatMap((facet) => (
      facet.humanEvidence.filter((anchor) => !byId.get(anchor.referenceId)?.some((excerpt) => (
        excerpt.includes(anchor.literalExcerpt)
      ))).map((anchor) => anchor.referenceId)
    )))];
    if (missing.length > 0) return { stopId: stop.stopId, missingReferenceIds: missing };
  }
  return undefined;
}

export function evaluateNarrativeResearchGateV6(input: {
  rubric: NarrativeMadridResearchRubricV6;
  outcomes: Array<{
    stopId: string;
    status: 'sufficient' | 'evidence_review_required' | 'failed';
    dossier?: NarrativeDossierV6;
  }>;
  humanSpotCheck: 'pending' | 'accepted' | 'rejected';
  referenceEvidence?: Array<{ referenceId: string; excerpts: readonly string[] }>;
}): NarrativeCalibrationGateResultV6 {
  const missingEvidence = missingReferenceEvidence(input);
  if (missingEvidence) {
    return {
      status: 'reference_evidence_missing',
      ...missingEvidence,
      reason: `human reference anchors are absent: ${missingEvidence.missingReferenceIds.join(', ')}`,
    };
  }
  const failures: string[] = [];
  const facets: NarrativeFacetEvaluationV6[] = [];
  for (const reference of input.rubric.stops) {
    const outcome = input.outcomes.find((item) => item.stopId === reference.stopId);
    if (!outcome?.dossier) {
      failures.push(`${reference.stopId}: did not produce a sufficient dossier`);
      facets.push(...reference.facets.map((facet) => ({
        stopId: reference.stopId,
        facetId: facet.facetId,
        status: 'missing' as const,
        propositionIds: [],
        passageIds: [],
      })));
      continue;
    }
    if (outcome.status !== 'sufficient') {
      failures.push(`${reference.stopId}: did not produce a sufficient dossier`);
    }
    const publishers = new Set(outcome.dossier.sources.map((source) => source.authority.publisherKey));
    const publisherMatches = reference.expectedPublishers.filter((publisher) => publishers.has(publisher));
    if (publisherMatches.length < input.rubric.minimumAuthorityPublisherMatches) {
      failures.push(`${reference.stopId}: missed reference authority publishers`);
    }
    if (!outcome.dossier.sufficiency.isSufficient) {
      failures.push(`${reference.stopId}: did not cover narrative sufficiency roles`);
    }
    const stopFacets = reference.facets.map((facet) => (
      evaluateFacet(reference.stopId, facet, reference.referenceSources, outcome.dossier!)
    ));
    facets.push(...stopFacets);
    const failedHardFacets = stopFacets.filter((facet) => (
      reference.facets.find((item) => item.facetId === facet.facetId)?.hard
        && facet.status !== 'met'
    ));
    if (failedHardFacets.length > 0) failures.push(
      `${reference.stopId}: hard facets not met: ${failedHardFacets
        .map((facet) => `${facet.facetId}=${facet.status}`).join(', ')}`
    );
    const narrativeText = normalized(
      outcome.dossier.propositions.map((proposition) => proposition.text).join(' ')
    );
    const narrativeTokens = new Set(narrativeText.split(' '));
    const forbidden = reference.forbiddenNarrativeClaims.find((claim) => (
      normalized(claim).split(' ').filter((token) => token.length > 3)
        .every((token) => narrativeTokens.has(token))
    ));
    if (forbidden) failures.push(`${reference.stopId}: included forbidden claim: ${forbidden}`);
  }
  if (failures.length > 0 || input.humanSpotCheck === 'rejected') {
    return {
      status: 'model_calibration_failed', stage: 'research',
      reason: [...failures, ...(input.humanSpotCheck === 'rejected'
        ? ['human spot-check rejected the machine dossier']
        : [])].join('; '),
    };
  }
  if (input.humanSpotCheck === 'pending') {
    return {
      status: 'human_spot_check_required',
      stopId: input.rubric.stops[0].stopId,
      reason: 'the first machine dossier must be compared with the approved Madrid reference',
    };
  }
  return { status: 'passed', facets };
}
