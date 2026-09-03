import { createHash } from 'crypto';
import { NarrativeEvidenceSpanV7 } from './NarrativeSpansV7';
import { NarrativeCapturedSourceV8 } from './NarrativeSourcesV7';
import {
  NarrativeDossierV6,
  NarrativeDossierProposalV6,
  buildNarrativeDossierV6,
} from './NarrativeDossierV6';

export type NarrativeRoleV8 =
  | 'visible_observation'
  | 'chronology_or_transformation'
  | 'human_agency_or_lived_function'
  | 'tension_or_contrast'
  | 'distinctive_trait';

export const NARRATIVE_ROLES_V8: NarrativeRoleV8[] = [
  'visible_observation',
  'chronology_or_transformation',
  'human_agency_or_lived_function',
  'tension_or_contrast',
  'distinctive_trait',
];

export const NARRATIVE_CURATOR_PROPOSITION_MAX_TEXT_V8 = 1_200;
export const NARRATIVE_CURATOR_MAX_NAMES_V8 = 40;
export const NARRATIVE_CURATOR_MAX_NUMBERS_V8 = 40;
export const NARRATIVE_CURATOR_MAX_DISCREPANCIES_V8 = 20;
export const NARRATIVE_CURATOR_MAX_LIMITS_V8 = 20;

export interface NarrativeEvidenceSupportV8 {
  sourceId: string;
  evidenceSpanIds: string[];
}

export interface NarrativeCuratorPropositionV8 {
  text: string;
  role: NarrativeRoleV8;
  certainty: 'high' | 'medium' | 'low';
  interpretation: 'direct' | 'debatable';
  supports: NarrativeEvidenceSupportV8[];
}

export interface NarrativeCuratorOutputV8 {
  propositions: NarrativeCuratorPropositionV8[];
  authorizedNames: string[];
  authorizedNumbers: string[];
  discrepancies: string[];
  limits: string[];
}

export type NarrativeEvidenceTierV8 = 'A' | 'B' | 'C' | 'D';

export interface NarrativeEvidenceGatesV8 {
  minimumEvidenceReady: boolean;
  writerReady: boolean;
  missingMinimumRoles: string[];
  missingWriterRoles: NarrativeRoleV8[];
}

export interface NarrativeDossierInputV8 {
  stopId: string;
  stopName: string;
  qid: string;
  language: string;
  curatorOutput: NarrativeCuratorOutputV8;
  captures: NarrativeCapturedSourceV8[];
  spansBySource: Map<string, NarrativeEvidenceSpanV7[]>;
  authorizedIdentityNames?: string[];
}

export interface NarrativeValidatedDossierV8 {
  dossier: NarrativeDossierV6;
  gates: NarrativeEvidenceGatesV8;
  passageQuotes: string[];
}

export type NarrativeDossierValidationV8 =
  | { status: 'ok'; value: NarrativeValidatedDossierV8 }
  | { status: 'curator_contract_failed'; reason: string };

function deterministicIdV8(seed: string): string {
  return createHash('sha256').update(seed).digest('hex').slice(0, 20);
}

function normalizePropositionTextV8(text: string): string {
  return text.normalize('NFKD').toLocaleLowerCase().replace(/\s+/gu, ' ').trim();
}

function normalizeIdentityNameV8(name: string): string {
  return name.normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ');
}

function includesNormalizedAnchorV8(text: string, anchor: string): boolean {
  return ` ${text} `.includes(` ${anchor} `);
}

function canonicalNumericAnchorV8(value: string): string {
  const compact = value.replace(/[\u00a0\u202f ]/gu, '');
  const [integer, decimal] = compact.split(',');
  const normalizedInteger = integer.replace(/\./gu, '');
  return decimal === undefined ? normalizedInteger : `${normalizedInteger},${decimal}`;
}

function numericAnchorsV8(text: string): string[] {
  const matches = text.match(/\b(?:\d{1,3}(?:[.\u00a0\u202f ]\d{3})+|\d+)(?:,\d+)?\b/gu) ?? [];
  return [...new Set(matches.map(canonicalNumericAnchorV8))];
}

function isSentenceInitialTokenV8(text: string, index: number): boolean {
  const prefix = text.slice(0, index);
  return prefix.trim().length === 0 || /[.!?]\s*$/u.test(prefix);
}

function propositionNameAnchorsV8(
  text: string,
  authorizedNames: string[],
  identityNames: string[]
): string[] {
  const normalizedText = normalizeIdentityNameV8(text);
  const normalizedIdentityNames = identityNames.map(normalizeIdentityNameV8);
  const isIdentityAnchor = (anchor: string): boolean => normalizedIdentityNames.some(
    (identity) => includesNormalizedAnchorV8(identity, anchor)
  );
  const anchors = new Set<string>();

  for (const name of authorizedNames) {
    const normalized = normalizeIdentityNameV8(name);
    if (normalized && !isIdentityAnchor(normalized)
      && includesNormalizedAnchorV8(normalizedText, normalized)) {
      anchors.add(normalized);
    }
  }

  const tokenRegex = /\b[\p{Lu}][\p{L}\p{M}-]*/gu;
  for (const match of text.matchAll(tokenRegex)) {
    const token = match[0];
    const normalized = normalizeIdentityNameV8(token);
    if (!normalized || /^[ivxlcdm]+$/iu.test(normalized) || isIdentityAnchor(normalized)) continue;
    if (isSentenceInitialTokenV8(text, match.index ?? 0)) continue;
    anchors.add(normalized);
  }

  return [...anchors];
}

function contractFailure(reason: string): NarrativeDossierValidationV8 {
  return { status: 'curator_contract_failed', reason };
}

function uniqueOrFailure(
  values: string[],
  label: string
): NarrativeDossierValidationV8 | null {
  if (new Set(values).size !== values.length) {
    return contractFailure(`duplicate ${label}`);
  }
  return null;
}

export function buildValidatedDossierV8(
  input: NarrativeDossierInputV8
): NarrativeDossierValidationV8 {
  const { captures, spansBySource } = input;
  // El LLM puede repetir entradas exactas; deduplicar conservando el orden no
  // cambia la evidencia (cada entrada restante se valida igual).
  const curatorOutput = {
    ...input.curatorOutput,
    authorizedNames: [...new Set(input.curatorOutput.authorizedNames)],
    authorizedNumbers: [...new Set(input.curatorOutput.authorizedNumbers)],
    discrepancies: [...new Set(input.curatorOutput.discrepancies)],
    limits: [...new Set(input.curatorOutput.limits)],
  };
  const captureById = new Map(captures.map((capture) => [capture.sourceId, capture]));
  const authorizedSourceIds = new Set(
    captures
      .filter((capture) => capture.authority.tier !== 'discovery_only')
      .map((capture) => capture.sourceId)
  );

  const namesFailure = uniqueOrFailure(curatorOutput.authorizedNames, 'authorized names');
  if (namesFailure) return namesFailure;
  const numbersFailure = uniqueOrFailure(curatorOutput.authorizedNumbers, 'authorized numbers');
  if (numbersFailure) return numbersFailure;
  const discrepanciesFailure = uniqueOrFailure(curatorOutput.discrepancies, 'discrepancies');
  if (discrepanciesFailure) return discrepanciesFailure;
  const limitsFailure = uniqueOrFailure(curatorOutput.limits, 'limits');
  if (limitsFailure) return limitsFailure;
  if (curatorOutput.authorizedNames.length > NARRATIVE_CURATOR_MAX_NAMES_V8) {
    return contractFailure('too many authorized names');
  }
  if (curatorOutput.authorizedNumbers.length > NARRATIVE_CURATOR_MAX_NUMBERS_V8) {
    return contractFailure('too many authorized numbers');
  }
  if (curatorOutput.discrepancies.length > NARRATIVE_CURATOR_MAX_DISCREPANCIES_V8
    || curatorOutput.limits.length > NARRATIVE_CURATOR_MAX_LIMITS_V8) {
    return contractFailure('too many discrepancies or limits');
  }

  const passages: NarrativeDossierProposalV6['passages'] = [];
  const propositions: NarrativeDossierProposalV6['propositions'] = [];
  const passageQuotes: string[] = [];
  const allSourceIds = new Set<string>();

  for (const proposition of curatorOutput.propositions) {
    if (!NARRATIVE_ROLES_V8.includes(proposition.role)) {
      return contractFailure(`invalid role ${String(proposition.role)}`);
    }
    const text = proposition.text.trim();
    if (!text) return contractFailure('proposition has empty text');
    if (text.length > NARRATIVE_CURATOR_PROPOSITION_MAX_TEXT_V8) {
      return contractFailure('proposition text exceeds the length limit');
    }
    if (proposition.supports.length === 0) {
      return contractFailure('proposition has no supports');
    }
    const sourceIds = new Set<string>();
    const passageIds: string[] = [];
    const propositionPassageQuotes: string[] = [];
    for (const support of proposition.supports) {
      const capture = captureById.get(support.sourceId);
      if (!capture) return contractFailure(`unknown source ${support.sourceId}`);
      if (!authorizedSourceIds.has(support.sourceId)) {
        return contractFailure(`source ${support.sourceId} is discovery_only`);
      }
      if (support.evidenceSpanIds.length < 1 || support.evidenceSpanIds.length > 3) {
        return contractFailure('supports require between one and three spans');
      }
      if (new Set(support.evidenceSpanIds).size !== support.evidenceSpanIds.length) {
        return contractFailure('support repeats a span id');
      }
      const spans = spansBySource.get(support.sourceId) ?? [];
      const spanById = new Map(spans.map((span) => [span.evidenceSpanId, span]));
      let selected: NarrativeEvidenceSpanV7[] = [];
      for (const id of support.evidenceSpanIds) {
        const span = spanById.get(id);
        if (!span) return contractFailure(`unknown span ${id}`);
        if (span.sourceId !== support.sourceId) {
          return contractFailure(`span ${id} belongs to another source`);
        }
        selected.push(span);
      }
      selected.sort((left, right) => left.start - right.start);
      const orderedIds = spans.map((span) => span.evidenceSpanId);
      const firstIndex = orderedIds.indexOf(selected[0].evidenceSpanId);
      if (firstIndex < 0) {
        return contractFailure('supports reference a span from an unknown position');
      }
      const isContiguous = selected.every((span, index) => (
        orderedIds[firstIndex + index] === span.evidenceSpanId
      ));
      if (!isContiguous) {
        return contractFailure('supports reference non-contiguous spans');
      }
      const quote = capture.content.slice(selected[0].start, selected[selected.length - 1].end);
      if (!quote) return contractFailure('empty reconstructed quote');
      const passageId = `p-${deterministicIdV8(
        `${support.sourceId}\n${selected[0].start}:${selected[selected.length - 1].end}`
      )}`;
      if (!passages.some((passage) => passage.passageId === passageId)) {
        passages.push({ passageId, sourceId: support.sourceId, quote });
      }
      passageIds.push(passageId);
      sourceIds.add(support.sourceId);
      allSourceIds.add(support.sourceId);
      passageQuotes.push(quote);
      propositionPassageQuotes.push(quote);
    }
    const interpretation = proposition.interpretation;
    if (interpretation === 'debatable') {
      const publishers = new Set([...sourceIds].map((sourceId) => (
        captureById.get(sourceId)?.authority.publisherKey
      )));
      if (publishers.size < 2) {
        return contractFailure('debatable proposition lacks two distinct publishers');
      }
    }
    if (proposition.certainty === 'high' && interpretation === 'direct') {
      const normalizedLocalQuotes = propositionPassageQuotes.map(normalizeIdentityNameV8);
      const missingName = propositionNameAnchorsV8(
        text,
        curatorOutput.authorizedNames,
        input.authorizedIdentityNames ?? []
      ).find((anchor) => !normalizedLocalQuotes.some(
        (quote) => includesNormalizedAnchorV8(quote, anchor)
      ));
      if (missingName) {
        return contractFailure(`citation closure missing name ${missingName}`);
      }

      const localNumbers = new Set(propositionPassageQuotes.flatMap(numericAnchorsV8));
      const missingNumber = numericAnchorsV8(text).find((number) => !localNumbers.has(number));
      if (missingNumber) {
        return contractFailure(`citation closure missing number ${missingNumber}`);
      }
    }
    propositions.push({
      propositionId: `prop-${deterministicIdV8(
        `${proposition.role}\n${normalizePropositionTextV8(text)}`
      )}`,
      text,
      role: proposition.role,
      certainty: proposition.certainty,
      interpretation,
      sourceIds: [...sourceIds].sort(),
      passageIds,
    });
  }

  if (propositions.length === 0) {
    return contractFailure('curator output has no propositions');
  }
  const identityNames = input.authorizedIdentityNames ?? [];
  const normalizedIdentityNames = identityNames.map(normalizeIdentityNameV8);
  const normalizedQuotes = passageQuotes.map(normalizeIdentityNameV8);
  for (const name of curatorOutput.authorizedNames) {
    const normalized = normalizeIdentityNameV8(name);
    if (normalized.length === 0
      || !(normalizedIdentityNames.includes(normalized)
        || normalizedQuotes.some((quote) => quote.includes(normalized)))) {
      return contractFailure(`unsupported authorized name ${name}`);
    }
  }
  for (const number of curatorOutput.authorizedNumbers) {
    if (!passageQuotes.some((quote) => quote.includes(number))) {
      return contractFailure(`unsupported authorized number ${number}`);
    }
  }

  const proposal: NarrativeDossierProposalV6 = {
    stopId: input.stopId,
    language: input.language,
    sources: [...allSourceIds].sort(),
    passages,
    propositions,
    authorizedNames: curatorOutput.authorizedNames,
    authorizedNumbers: curatorOutput.authorizedNumbers,
    discrepancies: curatorOutput.discrepancies,
    limits: curatorOutput.limits,
  };
  let dossier: NarrativeDossierV6;
  try {
    dossier = buildNarrativeDossierV6(proposal, captures);
  } catch (error) {
    return contractFailure(`dossier adapter rejected the proposal: ${error instanceof Error ? error.message : String(error)}`);
  }
  const gates = assessNarrativeEvidenceGatesV8(dossier, input.qid);
  return { status: 'ok', value: { dossier, gates, passageQuotes } };
}

export function assessNarrativeEvidenceGatesV8(
  dossier: NarrativeDossierV6,
  qid: string
): NarrativeEvidenceGatesV8 {
  const covered = new Set(dossier.propositions.map((proposition) => proposition.role));
  const identityConfirmed = /^Q\d+$/u.test(qid);
  const tertiaryRoles: NarrativeRoleV8[] = [
    'human_agency_or_lived_function',
    'tension_or_contrast',
    'distinctive_trait',
  ];
  const missingMinimumRoles = [
    ...(['visible_observation', 'chronology_or_transformation'] as NarrativeRoleV8[])
      .filter((role) => !covered.has(role)),
    ...(tertiaryRoles.some((role) => covered.has(role)) ? [] : ['function_or_conflict_or_trait']),
  ];
  const missingWriterRoles = NARRATIVE_ROLES_V8.filter((role) => !covered.has(role));
  const minimumEvidenceReady = identityConfirmed && missingMinimumRoles.length === 0;
  const writerReady = identityConfirmed
    && missingWriterRoles.length === 0;
  return {
    minimumEvidenceReady,
    writerReady,
    missingMinimumRoles,
    missingWriterRoles,
  };
}

export interface NarrativeCuratorNormalizationReportV8 {
  splitSupportCount: number;
  removedAuthorizedNames: string[];
  removedAuthorizedNumbers: string[];
}

export interface NarrativeCuratorNormalizationV8 {
  output: NarrativeCuratorOutputV8;
  report: NarrativeCuratorNormalizationReportV8;
}

export function normalizeNarrativeCuratorOutputV8(
  input: {
    output: NarrativeCuratorOutputV8;
    captures: NarrativeCapturedSourceV8[];
    spansBySource: ReadonlyMap<string, NarrativeEvidenceSpanV7[]>;
    authorizedIdentityNames?: string[];
  }
): NarrativeCuratorNormalizationV8 {
  const { output, captures, spansBySource, authorizedIdentityNames } = input;
  const captureById = new Map(captures.map((capture) => [capture.sourceId, capture]));

  const clonedPropositions: NarrativeCuratorPropositionV8[] = output.propositions.map((proposition) => ({
    text: proposition.text,
    role: proposition.role,
    certainty: proposition.certainty,
    interpretation: proposition.interpretation,
    supports: proposition.supports.map((support) => ({
      sourceId: support.sourceId,
      evidenceSpanIds: [...support.evidenceSpanIds],
    })),
  }));

  let splitSupportCount = 0;
  const selectedQuotes: string[] = [];

  for (const proposition of clonedPropositions) {
    const newSupports: NarrativeEvidenceSupportV8[] = [];
    for (const support of proposition.supports) {
      const ids = support.evidenceSpanIds;
      if (ids.length < 1 || ids.length > 3) {
        newSupports.push({ sourceId: support.sourceId, evidenceSpanIds: [...ids] });
        continue;
      }
      if (new Set(ids).size !== ids.length) {
        newSupports.push({ sourceId: support.sourceId, evidenceSpanIds: [...ids] });
        continue;
      }
      const capture = captureById.get(support.sourceId);
      if (!capture) {
        newSupports.push({ sourceId: support.sourceId, evidenceSpanIds: [...ids] });
        continue;
      }
      const spans = spansBySource.get(support.sourceId) ?? [];
      const spanById = new Map(spans.map((span) => [span.evidenceSpanId, span]));
      const selected: NarrativeEvidenceSpanV7[] = [];
      let valid = true;
      for (const id of ids) {
        const span = spanById.get(id);
        if (!span || span.sourceId !== support.sourceId) {
          valid = false;
          break;
        }
        selected.push(span);
      }
      if (!valid) {
        newSupports.push({ sourceId: support.sourceId, evidenceSpanIds: [...ids] });
        continue;
      }
      const orderedIds = spans.map((span) => span.evidenceSpanId);
      const selectedWithIndex = selected.map((span) => ({
        span,
        index: orderedIds.indexOf(span.evidenceSpanId),
      }));
      if (selectedWithIndex.some(({ index }) => index < 0)) {
        newSupports.push({ sourceId: support.sourceId, evidenceSpanIds: [...ids] });
        continue;
      }
      selectedWithIndex.sort((left, right) => left.index - right.index);
      const runs: NarrativeEvidenceSpanV7[][] = [];
      let current: NarrativeEvidenceSpanV7[] = [selectedWithIndex[0].span];
      let previousIndex = selectedWithIndex[0].index;
      for (let i = 1; i < selectedWithIndex.length; i++) {
        const selectedSpan = selectedWithIndex[i];
        if (selectedSpan.index === previousIndex + 1) {
          current.push(selectedSpan.span);
        } else {
          runs.push(current);
          current = [selectedSpan.span];
        }
        previousIndex = selectedSpan.index;
      }
      runs.push(current);
      if (runs.length > 1) {
        splitSupportCount += 1;
      }
      for (const run of runs) {
        newSupports.push({
          sourceId: support.sourceId,
          evidenceSpanIds: run.map((span) => span.evidenceSpanId),
        });
        const quote = capture.content.slice(run[0].start, run[run.length - 1].end);
        if (quote) {
          selectedQuotes.push(quote);
        }
      }
    }
    proposition.supports = newSupports;
  }

  const normalizedIdentityNames = (authorizedIdentityNames ?? []).map(normalizeIdentityNameV8);
  const normalizedQuotes = selectedQuotes.map(normalizeIdentityNameV8);

  const retainedNames: string[] = [];
  const removedNames: string[] = [];
  for (const name of output.authorizedNames) {
    const normalized = normalizeIdentityNameV8(name);
    if (normalized.length > 0
      && (normalizedIdentityNames.includes(normalized)
        || normalizedQuotes.some((quote) => quote.includes(normalized)))) {
      retainedNames.push(name);
    } else {
      removedNames.push(name);
    }
  }

  const retainedNumbers: string[] = [];
  const removedNumbers: string[] = [];
  for (const number of output.authorizedNumbers) {
    if (selectedQuotes.some((quote) => quote.includes(number))) {
      retainedNumbers.push(number);
    } else {
      removedNumbers.push(number);
    }
  }

  return {
    output: {
      propositions: clonedPropositions,
      authorizedNames: retainedNames,
      authorizedNumbers: retainedNumbers,
      discrepancies: [...output.discrepancies],
      limits: [...output.limits],
    },
    report: {
      splitSupportCount,
      removedAuthorizedNames: removedNames,
      removedAuthorizedNumbers: removedNumbers,
    },
  };
}

export function classifyEvidenceTierV8(
  dossier: NarrativeDossierV6,
  gates: NarrativeEvidenceGatesV8,
  captures: NarrativeCapturedSourceV8[]
): NarrativeEvidenceTierV8 {
  if (!gates.minimumEvidenceReady) return 'D';
  if (gates.writerReady) {
    if (dossier.sufficiency.authoritySourceCount >= 2
      && dossier.sufficiency.independentPublisherCount >= 2) {
      return 'A';
    }
    const dossierSourceIds = new Set(dossier.sources.map((source) => source.sourceId));
    const hasSupportedPrimary = captures.some((capture) => (
      capture.authority.tier === 'primary_authority'
      && dossierSourceIds.has(capture.sourceId)
    ));
    if (hasSupportedPrimary) return 'B';
  }
  return 'C';
}
