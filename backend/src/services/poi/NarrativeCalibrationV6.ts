import { NarrativeDossierV6 } from './NarrativeDossierV6';

export interface NarrativeMadridResearchRubricV6 {
  schemaVersion: 'narrative-madrid-research-rubric-v6';
  minimumAuthorityPublisherMatches: number;
  stops: Array<{
    stopId: string;
    expectedPublishers: string[];
    forbiddenNarrativeClaims: string[];
    requiredNarrativeConcepts: Array<{
      conceptId: string;
      requiredTerms: string[];
      oneOfTerms: string[];
    }>;
  }>;
}

export type NarrativeCalibrationGateResultV6 =
  | { status: 'passed' }
  | { status: 'human_spot_check_required'; stopId: string; reason: string }
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
  if (root.schemaVersion !== 'narrative-madrid-research-rubric-v6') {
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
    if (!Array.isArray(stop.requiredNarrativeConcepts)) {
      throw new Error(`rubric stop ${index} requiredNarrativeConcepts must be an array`);
    }
    const requiredNarrativeConcepts = stop.requiredNarrativeConcepts.map((rawConcept, conceptIndex) => {
      const concept = objectValue(
        rawConcept, `rubric stop ${index} concept ${conceptIndex}`
      );
      if (typeof concept.conceptId !== 'string' || !concept.conceptId.trim()) {
        throw new Error(`rubric stop ${index} concept ${conceptIndex} requires conceptId`);
      }
      const requiredTerms = stringArray(
        concept.requiredTerms, `rubric stop ${index} concept ${conceptIndex} requiredTerms`
      );
      const oneOfTerms = stringArray(
        concept.oneOfTerms, `rubric stop ${index} concept ${conceptIndex} oneOfTerms`
      );
      if (requiredTerms.length === 0 || oneOfTerms.length === 0) {
        throw new Error(`rubric stop ${index} concept ${conceptIndex} requires search terms`);
      }
      return { conceptId: concept.conceptId, requiredTerms, oneOfTerms };
    });
    if (new Set(requiredNarrativeConcepts.map((concept) => concept.conceptId)).size
      !== requiredNarrativeConcepts.length) {
      throw new Error(`rubric stop ${index} conceptIds must be unique`);
    }
    return {
      stopId: stop.stopId,
      expectedPublishers: stringArray(stop.expectedPublishers, `rubric stop ${index} publishers`),
      forbiddenNarrativeClaims: stringArray(
        stop.forbiddenNarrativeClaims, `rubric stop ${index} forbidden claims`
      ),
      requiredNarrativeConcepts,
    };
  });
  if (new Set(stops.map((stop) => stop.stopId)).size !== stops.length) {
    throw new Error('Madrid research rubric stopIds must be unique');
  }
  return {
    schemaVersion: 'narrative-madrid-research-rubric-v6',
    minimumAuthorityPublisherMatches: Number(root.minimumAuthorityPublisherMatches),
    stops,
  };
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

export function evaluateNarrativeResearchGateV6(input: {
  rubric: NarrativeMadridResearchRubricV6;
  outcomes: Array<{
    stopId: string;
    status: 'sufficient' | 'evidence_review_required' | 'failed';
    dossier?: NarrativeDossierV6;
  }>;
  humanSpotCheck: 'pending' | 'accepted' | 'rejected';
}): NarrativeCalibrationGateResultV6 {
  const failures: string[] = [];
  for (const reference of input.rubric.stops) {
    const outcome = input.outcomes.find((item) => item.stopId === reference.stopId);
    if (!outcome || outcome.status !== 'sufficient' || !outcome.dossier) {
      failures.push(`${reference.stopId}: did not produce a sufficient dossier`);
      continue;
    }
    const publishers = new Set(outcome.dossier.sources.map((source) => source.authority.publisherKey));
    const publisherMatches = reference.expectedPublishers.filter((publisher) => publishers.has(publisher));
    if (publisherMatches.length < input.rubric.minimumAuthorityPublisherMatches) {
      failures.push(`${reference.stopId}: missed reference authority publishers`);
    }
    if (!outcome.dossier.sufficiency.isSufficient) {
      failures.push(`${reference.stopId}: did not cover narrative sufficiency roles`);
    }
    const narrativeText = normalized(
      outcome.dossier.propositions.map((proposition) => proposition.text).join(' ')
    );
    const propositionTexts = outcome.dossier.propositions
      .map((proposition) => normalized(proposition.text));
    const missingConcepts = reference.requiredNarrativeConcepts.filter((concept) => (
      !propositionTexts.some((text) => (
        concept.requiredTerms.every((term) => text.includes(normalized(term)))
        && concept.oneOfTerms.some((term) => text.includes(normalized(term)))
      ))
    ));
    if (missingConcepts.length > 0) {
      failures.push(
        `${reference.stopId}: missed reference concepts: ${missingConcepts
          .map((concept) => concept.conceptId).join(', ')}`
      );
    }
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
  return { status: 'passed' };
}
