import { NarrativeDossierV6 } from './NarrativeDossierV6';
import {
  NarrativeEditorialOperationV6,
  NarrativeEditorialRequestProjectorV6,
} from './NarrativeEditorialAgentsV6';
import {
  NarrativeAdmittedStopV8,
  NarrativeEvidenceManifestV8,
} from './NarrativeEvidenceBoundaryV8';
import { NarrativeArcV8 } from './NarrativeArcArchitectV8';
import { NarrativeNarrationTargetV8, narrationLengthBoundsV8, validateNarrativeRepairLengthV8 } from './NarrativeDurationTargetsV8';
import { buildNarrativeWriterPlanV8 } from './NarrativeWriterContractV8';
import {
  NarrativeScriptV6,
  NarrativeSentenceV6,
  narrativeSentenceFingerprintV6,
} from './NarrativeEditorialV6';
import { analyzeNarrativeTourStyleV8 } from './NarrativeTourStyleV8';

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

function projectNarrativeDossierForWriterV8(
  dossier: NarrativeDossierV6
): Omit<NarrativeDossierV6, 'stopId' | 'sufficiency' | 'fingerprint' | 'sources' | 'passages'> & {
  writerEvidencePassages: NarrativeDossierV6['passages'];
} {
  const {
    stopId: _stopId,
    sufficiency: _sufficiency,
    fingerprint: _fingerprint,
    sources: _sources,
    passages,
    ...projected
  } = dossier;
  return {
    ...projected,
    writerEvidencePassages: passages,
  };
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

export interface ReviewEvidenceEnvelopeV8 {
  routeStopId: string;
  entityQid: string;
  dossierFingerprint: string;
  dossier: Omit<NarrativeDossierV6, 'stopId' | 'sufficiency' | 'fingerprint'>;
}

export interface AuthorizedPropositionEntryV8 {
  ownerRouteStopId: string;
  entityQid: string;
  proposition: NarrativeDossierV6['propositions'][number];
}

export interface AuthorizedEvidenceByStopV8 {
  routeStopId: string;
  entityQid: string;
  localPropositions: AuthorizedPropositionEntryV8[];
  contributionPropositions: AuthorizedPropositionEntryV8[];
  bridgePropositions: AuthorizedPropositionEntryV8[];
}

function resolveAuthorizedEvidenceForStop(
  stop: NarrativeAdmittedStopV8,
  arcStop: NarrativeArcV8['stops'][number],
  nextStop: NarrativeAdmittedStopV8 | undefined
): AuthorizedEvidenceByStopV8 {
  const propositionById = new Map(
    stop.dossier.propositions.map((p) => [p.propositionId, p])
  );

  const resolveEntry = (propositionId: string, ownerStop: NarrativeAdmittedStopV8): AuthorizedPropositionEntryV8 => {
    const proposition = propositionById.get(propositionId);
    if (!proposition) {
      throw new Error(`authorized proposition ${propositionId} not found in stop ${ownerStop.routeStopId}`);
    }
    return {
      ownerRouteStopId: ownerStop.routeStopId,
      entityQid: ownerStop.entityQid,
      proposition,
    };
  };

  const localPropositions: AuthorizedPropositionEntryV8[] = stop.dossier.propositions.map((p) => ({
    ownerRouteStopId: stop.routeStopId,
    entityQid: stop.entityQid,
    proposition: p,
  }));

  const contributionPropositions: AuthorizedPropositionEntryV8[] = arcStop.contributionPropositionIds.map((id) =>
    resolveEntry(id, stop)
  );

  const bridgePropositions: AuthorizedPropositionEntryV8[] = arcStop.bridgePropositionIds.map((id) => {
    const currentProp = stop.dossier.propositions.find((p) => p.propositionId === id);
    if (currentProp) {
      return {
        ownerRouteStopId: stop.routeStopId,
        entityQid: stop.entityQid,
        proposition: currentProp,
      };
    }
    if (!nextStop) {
      throw new Error(`bridge proposition ${id} not in current or next stop dossier`);
    }
    const nextProp = nextStop.dossier.propositions.find((p) => p.propositionId === id);
    if (!nextProp) {
      throw new Error(`bridge proposition ${id} not in current or next stop dossier`);
    }
    return {
      ownerRouteStopId: nextStop.routeStopId,
      entityQid: nextStop.entityQid,
      proposition: nextProp,
    };
  });

  return {
    routeStopId: stop.routeStopId,
    entityQid: stop.entityQid,
    localPropositions,
    contributionPropositions,
    bridgePropositions,
  };
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
  stop: NarrativeAdmittedStopV8,
  arc: NarrativeArcV8,
  arcStop: NarrativeArcV8['stops'][number],
  authorizedEvidence: AuthorizedEvidenceByStopV8,
  narrationTarget: NarrativeNarrationTargetV8 | undefined,
  stopIndex: number
): JsonRecord {
  const suppliedDossier = record(input.dossier, `${operation} dossier`) as unknown as NarrativeDossierV6;
  if (
    suppliedDossier.stopId !== stop.entityQid
    || suppliedDossier.fingerprint !== stop.dossier.fingerprint
  ) {
    throw new Error(`editorial dossier mismatch for route stop ${stop.routeStopId}`);
  }

  const isWriteOrRepair = operation === 'write' || operation === 'repair';
  const dossierProjection = isWriteOrRepair
    ? projectNarrativeDossierForWriterV8(stop.dossier)
    : projectNarrativeDossierForEditorialV8(stop.dossier);

  const writerPlan = operation === 'write' && narrationTarget
    ? buildNarrativeWriterPlanV8({
        routeStopId: stop.routeStopId,
        dossier: stop.dossier,
        narrationTarget,
        stopIndex,
      })
    : undefined;

  const projectedScript = operation === 'audit'
    ? (() => {
        const script = record(input.script, 'audit script') as unknown as NarrativeScriptV6;
        const sentences: NarrativeSentenceV6[] = script.sentences.map((sentence) => ({
          ...sentence,
          sentenceFingerprint: narrativeSentenceFingerprintV6(sentence),
        }));
        return {
          ...script,
          sentences,
        };
      })()
    : input.script;

  return {
    ...input,
    script: projectedScript,
    dossier: dossierProjection,
    routeStopId: stop.routeStopId,
    entityQid: stop.entityQid,
    evidence: stop.evidence,
    arcContext: {
      promise: arc.promise,
      centralQuestion: arc.centralQuestion,
      contribution: arcStop.contribution,
      bridge: arcStop.bridge,
      contributionPropositionIds: arcStop.contributionPropositionIds,
      bridgePropositionIds: arcStop.bridgePropositionIds,
    },
    authorizedEvidence,
    ...(narrationTarget ? { narrationTarget } : {}),
    ...(writerPlan ? { writerPlan } : {}),
  };
}

function projectTourInput(
  input: JsonRecord,
  admittedStops: NarrativeAdmittedStopV8[],
  arc: NarrativeArcV8
): JsonRecord {
  const { dossiers: _dossiers, ...rest } = input;
  const projected: JsonRecord = {
    ...rest,
    arc,
  };

  if (Array.isArray(input.dossiers)) {
    const stopByEntityQid = new Map(admittedStops.map((stop) => [stop.entityQid, stop]));
    input.dossiers.forEach((rawDossier) => {
      const dossier = record(rawDossier, 'tour audit dossier') as unknown as NarrativeDossierV6;
      const stop = stopByEntityQid.get(dossier.stopId);
      if (!stop || dossier.fingerprint !== stop.dossier.fingerprint) {
        throw new Error(`tour audit dossier is not admitted: ${dossier.stopId}`);
      }
    });
  }

  const scripts = Array.isArray(input.scripts)
    ? (input.scripts as unknown[]).map((rawScript) => record(rawScript, 'tour audit script') as unknown as NarrativeScriptV6)
    : [];
  const contributionsByStopId: Record<string, string> = {};
  arc.stops.forEach((arcStop) => {
    contributionsByStopId[arcStop.stopId] = arcStop.contribution;
  });
  projected.styleDiagnostics = analyzeNarrativeTourStyleV8(scripts, { contributionsByStopId });

  return projected;
}

const V8_INHERITED_DURATION_SENTENCE = 'Escribe prosa oral continua de aproximadamente dos o tres minutos, sin rellenar.';
const V8_EXPLICIT_NARRATION_SENTENCE = 'Escribe prosa oral continua, natural y sin rellenar.';

function reconcileBaseSystemPrompt(
  systemPrompt: string,
  narrationTarget: NarrativeNarrationTargetV8 | undefined
): string {
  if (!narrationTarget) return systemPrompt;
  return systemPrompt.replace(V8_INHERITED_DURATION_SENTENCE, V8_EXPLICIT_NARRATION_SENTENCE);
}

const V8_FACTUAL_PERMISSIONS_PREFIX = [
  'El boundary determinista V8 ya ha admitido todas las paradas como A, B o C.',
  'Usa las proposiciones locales y authorizedEvidence como selección base. Puedes desarrollar detalles explícitos de writerEvidencePassages locales; de la siguiente parada solo los hechos del bridge autorizado.',
  'No uses memoria, fuentes fuera del paquete, ni resuelvas discrepancias por cuenta propia.',
  'historicalContext fecha el testimonio del pasaje: atribuye los usos o descripciones de época y no los presentes como estado actual ni confundas publicación con construcción.',
  'Desarrolla cada hecho principal una sola vez, en su beat asignado; los demás segmentos deben aportar evidencia distinta, no volver a resumir sus fechas o su importancia.',
  'En nivel B no presentes la evidencia como corroborada por varios publishers.',
  'En nivel C redacta de forma conservadora y limita cada afirmación a soporte explícito.',
  'Los missingWriterRoles son prohibiciones: no los inventes ni los completes.',
].join(' ');

function buildWriterSuffix(narrationTarget: NarrativeNarrationTargetV8 | undefined, language: string): string {
  const base = [V8_FACTUAL_PERMISSIONS_PREFIX];

  if (narrationTarget) {
    const { minimumWords, maximumWords } = narrationLengthBoundsV8(narrationTarget.targetWords);
    base.push(
      `Apunta a unas ${narrationTarget.targetWords} palabras para ${narrationTarget.targetSeconds} segundos; se acepta un mínimo de ${minimumWords} palabras y un máximo de ${maximumWords} palabras. Prioriza una narración natural y respaldada, sin repetir ni estirar afirmaciones para alcanzar la cifra. Este objetivo sustituye cualquier pauta genérica de dos o tres minutos.`
    );
    base.push(
      'Escribe exactamente un segmento por cada entrada de writerPlan.beats, en el mismo orden, sin repetir ni dividir beats para alargar la narración.'
    );
    base.push(
      'La extensión de cada segmento puede variar según el contenido disponible; no distribuyas cuotas fijas de palabras ni cuentes mentalmente para igualar segmentos.'
    );
  }

  base.push(
    'Cada segmento declara supportCardIds válidos y debe no crear un beat sin evidencia.'
  );

  base.push(
    `Construye una secuencia inmersiva respaldada por evidencia en ${language}: detalle exterior concreto, uso humano documentado y transformación o consecuencia sustentada. No asumas posición exacta, no trates interiores o cifras de superficie como observables desde calle, y señala interpretaciones de forma modesta sin inventar causalidad. Si la evidencia no permite uno de esos momentos, omítelo en vez de inventarlo.`
  );

  return base.join(' ');
}

function buildRepairSuffix(
  narrationTarget: NarrativeNarrationTargetV8 | undefined,
  baselineText: string
): string {
  const parts: string[] = [V8_FACTUAL_PERMISSIONS_PREFIX, V8_PROMPT_SUFFIX_REPAIR];

  if (narrationTarget) {
    const validation = validateNarrativeRepairLengthV8(baselineText, narrationTarget, baselineText);
    parts.push(
      `El texto completo resultante debe tener entre ${validation.minimumWords} y ${validation.maximumWords} palabras. Apunta a unas ${narrationTarget.targetWords} palabras como preferencia, sin inventar ni repetir contenido para alcanzarla. La aceptación editorial no garantiza la publicación ni la duración final.`
    );
  }

  return parts.join(' ');
}

const V8_PROMPT_SUFFIX_REPAIR = [
  'Devuelve únicamente replacements para los sentenceIds autorizados; no redactes un guion nuevo.',
  'Cada replacement.text debe contener una frase completa y no vacía.',
  'Nunca uses una cadena vacía para borrar o fusionar sentenceIds.',
  'Si dos sentenceIds provienen de una frase dividida, conserva ambos IDs y redistribuye el contenido en dos frases completas que eliminen el fragmento.',
  'Nunca copies el mismo texto completo en dos sentenceIds.',
  'Cada replacement.text debe diferir de la frase inmediatamente anterior y de la frase inmediatamente posterior del guion; no copies ni reproduzcas el texto de una frase vecina.',
  'Al eliminar redundancia, conserva cada sentenceId con contenido complementario y nunca copies una frase vecina.',
].join(' ');

const V8_PROMPT_SUFFIX_AUDITOR = [
  'El boundary determinista V8 ya ha admitido todas las paradas como A, B o C.',
  'El dossier y reviewEvidence determinan el soporte de fuentes; authorizedEvidence determina el permiso del escritor.',
  'Las afirmaciones verdaderas pero no autorizadas permanecen como objeciones reparables.',
  'En nivel B no presentes la evidencia como corroborada por varios publishers.',
  'En nivel C redacta de forma conservadora y limita cada afirmación a soporte explícito.',
  'Los missingWriterRoles son prohibiciones: no los inventes ni los completes.',
  'styleDiagnostics contiene diagnósticos deterministas de estilo de todo el tour; usa los issues clasificados como mechanical_repetition como candidatos concretos para revisión localizada y no penalices automáticamente las entradas clasificadas como intentional_motif.',
].join(' ');

export type NarrativeTourProjectionModeV8 = 'compactNarrativeAudit' | 'evidenceRichScorecard';

export function createNarrativeEditorialRequestProjectorV8(
  admittedStops: NarrativeAdmittedStopV8[],
  manifest: NarrativeEvidenceManifestV8,
  arc: NarrativeArcV8,
  narrationTargetsByStopId?: ReadonlyMap<string, NarrativeNarrationTargetV8>,
  tourProjectionMode: NarrativeTourProjectionModeV8 = 'compactNarrativeAudit'
): NarrativeEditorialRequestProjectorV6 {
  assertManifestMatchesAdmittedStops(admittedStops, manifest);

  if (arc.stops.length !== admittedStops.length) {
    throw new Error('arc stop cardinality mismatch');
  }
  for (let i = 0; i < admittedStops.length; i++) {
    if (arc.stops[i].stopId !== admittedStops[i].routeStopId) {
      throw new Error(`arc stop order mismatch at index ${i}`);
    }
  }

  const stopByRouteId = new Map(admittedStops.map((stop) => [stop.routeStopId, stop]));
  const authorizedEvidenceByStop: AuthorizedEvidenceByStopV8[] = admittedStops.map((stop, i) =>
    resolveAuthorizedEvidenceForStop(stop, arc.stops[i], admittedStops[i + 1])
  );
  const reviewEvidenceByStop: ReviewEvidenceEnvelopeV8[] = admittedStops.map((stop) => ({
    routeStopId: stop.routeStopId,
    entityQid: stop.entityQid,
    dossierFingerprint: stop.dossier.fingerprint,
    dossier: projectNarrativeDossierForEditorialV8(stop.dossier),
  }));

  return ({ operation, systemPrompt, input }) => {
    const inputRecord = record(input, `${operation} input`);
    if (operation === 'auditTour') {
      const compactTourInput = projectTourInput(inputRecord, admittedStops, arc);
      if (tourProjectionMode === 'evidenceRichScorecard') {
        const projected: JsonRecord = {
          ...compactTourInput,
          // Each sentence and full evidence dossier appear once; permissions reference
          // those same propositions rather than serializing them a second/third time.
          scripts: (inputRecord.scripts as NarrativeScriptV6[]).map(script => ({
            stopId: script.stopId, sentences: script.sentences,
          })),
          evidenceManifest: manifest,
          authorizedEvidenceByStop: authorizedEvidenceByStop.map(stop => ({
            routeStopId: stop.routeStopId,
            localPropositionIds: stop.localPropositions.map(entry => entry.proposition.propositionId),
            contributionPropositionIds: stop.contributionPropositions.map(entry => entry.proposition.propositionId),
            bridgePropositions: stop.bridgePropositions.map(entry => ({
              ownerRouteStopId: entry.ownerRouteStopId, propositionId: entry.proposition.propositionId,
            })),
          })),
          reviewEvidenceByStop,
        };
        return {
          systemPrompt: `${systemPrompt} ${V8_PROMPT_SUFFIX_AUDITOR}`,
          input: projected,
        };
      }
      return {
        systemPrompt: `${systemPrompt} ${V8_PROMPT_SUFFIX_AUDITOR}`,
        input: compactTourInput,
      };
    }

    const routeStopId = routeStopIdForOperation(operation, inputRecord);
    const stop = routeStopId ? stopByRouteId.get(routeStopId) : undefined;
    if (!routeStopId || !stop) {
      throw new Error(`unknown editorial route stop ${routeStopId ?? '<missing>'}`);
    }

    const stopIndex = admittedStops.findIndex((s) => s.routeStopId === routeStopId);
    const arcStop = arc.stops[stopIndex];
    const authorizedEvidence = authorizedEvidenceByStop[stopIndex];
    const narrationTarget = narrationTargetsByStopId?.get(routeStopId);
    const writerSuffix = buildWriterSuffix(narrationTarget, stop.dossier.language);
    const promptSuffix = operation === 'repair'
      ? buildRepairSuffix(narrationTarget, (inputRecord.script as Record<string, unknown>).text as string)
      : operation === 'write'
        ? writerSuffix
        : V8_PROMPT_SUFFIX_AUDITOR;
    const reconciledBaseSystemPrompt = (operation === 'write' || operation === 'repair')
      ? reconcileBaseSystemPrompt(systemPrompt, narrationTarget)
        .replace('Usa exclusivamente las proposiciones, nombres y números autorizados del dossier.',
          'Usa solo proposiciones autorizadas y detalles explícitos de writerEvidencePassages locales; de la siguiente parada, solo el bridge autorizado.')
        .replace('Eres el escritor de una audioguía histórica en español de España.',
          `Eres el escritor de una audioguía histórica en el idioma ${stop.dossier.language}.`)
      : systemPrompt;

    const projectedInput = projectPerStopInput(operation, inputRecord, stop, arc, arcStop, authorizedEvidence, narrationTarget, stopIndex);
    if (operation === 'audit' || operation === 'adjudicate') {
      projectedInput.reviewEvidence = {
        current: {
          routeStopId: stop.routeStopId,
          entityQid: stop.entityQid,
          dossierFingerprint: stop.dossier.fingerprint,
        },
        next: reviewEvidenceByStop[stopIndex + 1] ?? null,
      };
    }

    const auditCitationPropositionIds = operation === 'audit'
      ? [...new Set([
        ...stop.dossier.propositions.map((p) => p.propositionId),
        ...(admittedStops[stopIndex + 1]?.dossier.propositions ?? []).map((p) => p.propositionId),
        ...authorizedEvidence.contributionPropositions.map((e) => e.proposition.propositionId),
        ...authorizedEvidence.bridgePropositions.map((e) => e.proposition.propositionId),
      ])]
      : undefined;

    return {
      systemPrompt: `${reconciledBaseSystemPrompt} ${promptSuffix}`,
      input: projectedInput,
      ...(auditCitationPropositionIds !== undefined ? { auditCitationPropositionIds } : {}),
    };
  };
}
