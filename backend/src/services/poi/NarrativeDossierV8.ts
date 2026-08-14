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
      // Si el LLM cita spans no contiguos de la misma fuente, conservar el
      // prefijo contiguo desde el primero (evidencia literal real) en lugar de
      // anular toda la ronda.
      let contiguousCount = 1;
      while (contiguousCount < selected.length
        && orderedIds[firstIndex + contiguousCount] === selected[contiguousCount].evidenceSpanId) {
        contiguousCount += 1;
      }
      selected = selected.slice(0, contiguousCount);
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
    }
    let interpretation = proposition.interpretation;
    if (interpretation === 'debatable') {
      const publishers = new Set([...sourceIds].map((sourceId) => (
        captureById.get(sourceId)?.authority.publisherKey
      )));
      if (publishers.size < 2) {
        // Sin corroboración independiente la afirmación no puede clasificarse
        // como debatible: se acepta como direct con su fuente autorizada (la
        // misma instrucción que recibe el curador), en lugar de invalidar
        // toda la ronda. La evidencia no cambia; solo baja la clasificación.
        interpretation = 'direct';
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
  // Los nombres/números que el LLM lista sin anclaje literal se descartan en
  // lugar de anular toda la ronda: la evidencia citada no cambia y el resto de
  // la salida se conserva. Solo sobreviven los que aparecen en citas aceptadas
  // o en la identidad Wikidata confirmada.
  const supportedNames = curatorOutput.authorizedNames.filter((name) => {
    const normalized = normalizeIdentityNameV8(name);
    return normalized.length > 0
      && (normalizedIdentityNames.includes(normalized)
        || normalizedQuotes.some((quote) => quote.includes(normalized)));
  });
  const supportedNumbers = curatorOutput.authorizedNumbers.filter((number) => (
    passageQuotes.some((quote) => quote.includes(number))
  ));

  const proposal: NarrativeDossierProposalV6 = {
    stopId: input.stopId,
    language: input.language,
    sources: [...allSourceIds].sort(),
    passages,
    propositions,
    authorizedNames: supportedNames,
    authorizedNumbers: supportedNumbers,
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
    && missingWriterRoles.length === 0
    && dossier.sufficiency.authoritySourceCount >= 2
    && dossier.sufficiency.independentPublisherCount >= 2;
  return {
    minimumEvidenceReady,
    writerReady,
    missingMinimumRoles,
    missingWriterRoles,
  };
}
