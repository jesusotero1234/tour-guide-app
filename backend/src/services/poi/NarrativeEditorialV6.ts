import { narrativeFingerprintV6 } from './NarrativeContractsV6';

export type NarrativeAuditClassificationV6 =
  | 'supported'
  | 'authorized_inference'
  | 'unsupported'
  | 'distorted'
  | 'unclear';

export type NarrativeAuditorV6 = 'deepseek' | 'gemma';

export interface NarrativeSentenceV6 {
  sentenceId: string;
  stopId: string;
  index: number;
  text: string;
}

export interface NarrativeScriptV6 {
  stopId: string;
  text: string;
  sentences: NarrativeSentenceV6[];
  fingerprint: string;
}

export interface NarrativeAuditFindingV6 {
  sentenceId: string;
  classification: NarrativeAuditClassificationV6;
  reason: string;
  propositionIds: string[];
}

export interface NarrativeAuditReportV6 {
  auditor: NarrativeAuditorV6;
  findings: NarrativeAuditFindingV6[];
}

export interface NarrativeAuditObjectionV6 extends NarrativeAuditFindingV6 {
  objectionId: string;
  auditor: NarrativeAuditorV6;
}

export interface NarrativeAdjudicationV6 {
  objectionId: string;
  decision: 'accepted' | 'rejected';
  reason: string;
}

export interface NarrativeLocalPatchV6 {
  replacements: Array<{ sentenceId: string; text: string }>;
}

export interface NarrativeProtocolWarningV6 {
  warningId: string;
  stopId: string;
  code:
    | 'language_mismatch'
    | 'unauthorized_number'
    | 'unsafe_orientation'
    | 'duration_outlier'
    | 'cross_stop_repetition';
  severity: 'hard' | 'soft';
  message: string;
}

const AUDIT_CLASSIFICATIONS_V6: NarrativeAuditClassificationV6[] = [
  'supported', 'authorized_inference', 'unsupported', 'distorted', 'unclear',
];

const SPANISH_MARKERS_V6 = new Set([
  'a', 'al', 'con', 'de', 'del', 'el', 'en', 'es', 'esta', 'este', 'la', 'las', 'lo',
  'los', 'para', 'por', 'que', 'se', 'sin', 'su', 'sus', 'un', 'una', 'y', 'ahora',
]);

function normalizedWords(value: string): string[] {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/u).filter(Boolean);
}

function splitSentences(text: string): string[] {
  return text.replace(/\s+/gu, ' ').trim().split(/(?<=[.!?…])\s+(?=[A-ZÁÉÍÓÚÜÑ¿¡])/u)
    .map((sentence) => sentence.trim()).filter(Boolean);
}

function scriptFromSentences(stopId: string, texts: string[]): NarrativeScriptV6 {
  const sentences = texts.map((text, index) => ({
    sentenceId: `${stopId}-S${String(index + 1).padStart(3, '0')}`,
    stopId,
    index,
    text,
  }));
  const script = { stopId, text: texts.join(' '), sentences };
  return { ...script, fingerprint: narrativeFingerprintV6(script) };
}

export function assignNarrativeSentenceIdsV6(stopId: string, text: string): NarrativeScriptV6 {
  if (!stopId.trim()) throw new Error('script stopId is required');
  const sentences = splitSentences(text);
  if (sentences.length === 0) throw new Error(`script ${stopId} has no sentences`);
  return scriptFromSentences(stopId, sentences);
}

export function validateNarrativeAuditReportV6(
  report: NarrativeAuditReportV6,
  script: NarrativeScriptV6
): NarrativeAuditReportV6 {
  if (report.auditor !== 'deepseek' && report.auditor !== 'gemma') {
    throw new Error('unknown narrative auditor');
  }
  const expected = script.sentences.map((sentence) => sentence.sentenceId);
  const observed = report.findings.map((finding) => finding.sentenceId);
  if (observed.length !== expected.length
    || new Set(observed).size !== expected.length
    || expected.some((sentenceId) => !observed.includes(sentenceId))) {
    throw new Error(`${report.auditor} must classify every sentence exactly once`);
  }
  for (const finding of report.findings) {
    if (!AUDIT_CLASSIFICATIONS_V6.includes(finding.classification)) {
      throw new Error(`${report.auditor} returned invalid classification`);
    }
    if (!finding.reason.trim()) throw new Error(`${report.auditor} finding requires a reason`);
  }
  return report;
}

export function buildNarrativeAuditObjectionsV6(
  reports: NarrativeAuditReportV6[]
): NarrativeAuditObjectionV6[] {
  if (new Set(reports.map((report) => report.auditor)).size !== reports.length) {
    throw new Error('narrative audit reports must come from independent auditors');
  }
  return reports.flatMap((report) => report.findings
    .filter((finding) => ['unsupported', 'distorted', 'unclear'].includes(finding.classification))
    .map((finding) => ({
      ...finding,
      objectionId: `${report.auditor}:${finding.sentenceId}:${finding.classification}`,
      auditor: report.auditor,
    })));
}

export function validateNarrativeAdjudicationsV6(
  objections: NarrativeAuditObjectionV6[],
  adjudications: NarrativeAdjudicationV6[]
): NarrativeAdjudicationV6[] {
  const expected = objections.map((objection) => objection.objectionId);
  const observed = adjudications.map((item) => item.objectionId);
  if (expected.length !== observed.length || new Set(observed).size !== expected.length
    || expected.some((objectionId) => !observed.includes(objectionId))) {
    throw new Error('editor must adjudicate every objection exactly once');
  }
  if (adjudications.some((item) => !item.reason.trim())) {
    throw new Error('every adjudication requires an explicit reason');
  }
  return adjudications;
}

export function applyNarrativeLocalPatchV6(
  script: NarrativeScriptV6,
  acceptedSentenceIds: string[],
  patch: NarrativeLocalPatchV6
): NarrativeScriptV6 {
  if (acceptedSentenceIds.length === 0) throw new Error('patch requires an accepted objection');
  if (patch.replacements.length === 0) throw new Error('patch requires at least one replacement');
  const indices = new Map(script.sentences.map((sentence) => [sentence.sentenceId, sentence.index]));
  const acceptedIndices = acceptedSentenceIds.map((sentenceId) => {
    const index = indices.get(sentenceId);
    if (index === undefined) throw new Error(`accepted sentence ${sentenceId} does not exist`);
    return index;
  });
  const permitted = new Set(acceptedIndices.flatMap((index) => [index - 1, index, index + 1])
    .filter((index) => index >= 0 && index < script.sentences.length));
  const replacements = new Map<string, string>();
  for (const replacement of patch.replacements) {
    const index = indices.get(replacement.sentenceId);
    if (index === undefined) throw new Error(`patch sentence ${replacement.sentenceId} does not exist`);
    if (!permitted.has(index)) {
      throw new Error(`patch changes sentence ${replacement.sentenceId} outside the permitted window`);
    }
    if (!replacement.text.trim()) throw new Error('patch replacement cannot be empty');
    if (replacements.has(replacement.sentenceId)) {
      throw new Error(`patch contains duplicate sentence ${replacement.sentenceId}`);
    }
    replacements.set(replacement.sentenceId, replacement.text.replace(/\s+/gu, ' ').trim());
  }
  if (!acceptedSentenceIds.some((sentenceId) => replacements.has(sentenceId))) {
    throw new Error('patch must change at least one accepted sentence');
  }
  const texts = script.sentences.map((sentence) => replacements.get(sentence.sentenceId) ?? sentence.text);
  const repaired = scriptFromSentences(script.stopId, texts);
  if (repaired.sentences.length !== script.sentences.length) {
    throw new Error('patch cannot add or remove sentences');
  }
  return repaired;
}

export function auditNarrativeScriptDeterministicallyV6(
  script: NarrativeScriptV6,
  input: { language: string; authorizedNumbers: string[] }
): NarrativeProtocolWarningV6[] {
  const warnings: NarrativeProtocolWarningV6[] = [];
  const words = normalizedWords(script.text);
  if (input.language === 'es') {
    const spanishMarkers = words.filter((word) => SPANISH_MARKERS_V6.has(word)).length;
    if (words.length >= 12 && spanishMarkers / words.length < 0.08) {
      warnings.push({
        warningId: `${script.stopId}:language_mismatch`, stopId: script.stopId,
        code: 'language_mismatch', severity: 'hard', message: 'El texto no parece estar en español.',
      });
    }
  }
  const authorized = new Set(input.authorizedNumbers.map((number) => number.replace(/\s+/gu, '')));
  const numbers = [...new Set(script.text.match(/\b\d[\d.,]*\b/gu) ?? [])];
  for (const number of numbers) {
    if (!authorized.has(number.replace(/\s+/gu, ''))) {
      warnings.push({
        warningId: `${script.stopId}:unauthorized_number:${number}`, stopId: script.stopId,
        code: 'unauthorized_number', severity: 'hard',
        message: `El número ${number} no está autorizado por el dossier.`,
      });
    }
  }
  if (/\b(?:cruza|atraviesa)\s+(?:la\s+)?(?:calle|carretera|calzada)\b/iu.test(script.text)) {
    warnings.push({
      warningId: `${script.stopId}:unsafe_orientation`, stopId: script.stopId,
      code: 'unsafe_orientation', severity: 'hard',
      message: 'La orientación pide cruzar una vía sin una instrucción segura verificable.',
    });
  }
  const durationSeconds = Math.round(words.length / 180 * 60);
  if (durationSeconds < 90 || durationSeconds > 240) {
    warnings.push({
      warningId: `${script.stopId}:duration_outlier`, stopId: script.stopId,
      code: 'duration_outlier', severity: 'soft',
      message: `Duración oral estimada fuera de la banda orientativa: ${durationSeconds}s.`,
    });
  }
  return warnings;
}

export function narrativeRepetitionWarningsV6(
  scripts: NarrativeScriptV6[]
): NarrativeProtocolWarningV6[] {
  const owners = new Map<string, string>();
  const warnings: NarrativeProtocolWarningV6[] = [];
  const warned = new Set<string>();
  for (const script of scripts) {
    const words = normalizedWords(script.text);
    for (let index = 0; index <= words.length - 12; index += 1) {
      const passage = words.slice(index, index + 12).join(' ');
      const owner = owners.get(passage);
      if (owner && owner !== script.stopId) {
        const warningId = `${owner}:${script.stopId}:cross_stop_repetition`;
        if (!warned.has(warningId)) {
          warned.add(warningId);
          warnings.push({
            warningId, stopId: script.stopId, code: 'cross_stop_repetition', severity: 'soft',
            message: `Repetición de doce palabras con la parada ${owner}.`,
          });
        }
      } else if (!owner) {
        owners.set(passage, script.stopId);
      }
    }
  }
  return warnings;
}
