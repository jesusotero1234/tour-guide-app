import { NarrativeAuditReportV6, NarrativeScriptV6, validateNarrativeAuditReportV6 } from './NarrativeEditorialV6';
import { NarrativeStructuredWriterResultV8 } from './NarrativeWriterContractV8';
import { evaluateNarrationDeliveryV8, narrationLengthBoundsV8 } from './NarrativeDurationTargetsV8';

export interface NarrativeEditVersionV8 {
  draft: NarrativeStructuredWriterResultV8;
  script: NarrativeScriptV6;
  verification: { scriptFingerprint: string; report: NarrativeAuditReportV6 } | null;
}
export interface NarrativeEditComparisonV8 {
  before: NarrativeEditVersionV8;
  candidate: NarrativeEditVersionV8;
  targetSentenceIds?: string[];
  decision: 'pending' | 'accepted' | 'rejected';
  reason: string | null;
}

const SEVERITY_RANK_V8: Record<string, number> = {
  distorted: 3, unsupported: 2, unclear: 1, supported: 0, authorized_inference: 0,
};

export function reconcileNarrativeEditReportsV8(
  before: NarrativeEditVersionV8,
  candidate: NarrativeEditVersionV8
): { before: NarrativeAuditReportV6; candidate: NarrativeAuditReportV6 } {
  if (before.script.stopId !== candidate.script.stopId) throw new Error('edit stop mismatch');
  const clone = (version: NarrativeEditVersionV8): NarrativeAuditReportV6 => {
    if (!version.verification || version.verification.scriptFingerprint !== version.script.fingerprint) {
      throw new Error('edit verification fingerprint mismatch');
    }
    const report = validateNarrativeAuditReportV6(version.verification.report, version.script);
    return { ...report, findings: report.findings.map(f => ({ ...f })) };
  };
  const beforeClone = clone(before);
  const candidateClone = clone(candidate);
  const buildMap = (script: NarrativeScriptV6): Map<string, string | null> => {
    const map = new Map<string, string | null>();
    for (let i = 0; i < script.sentences.length; i += 1) {
      const prev = i > 0 ? script.sentences[i - 1].text : null;
      const cur = script.sentences[i].text;
      const next = i < script.sentences.length - 1 ? script.sentences[i + 1].text : null;
      const key = JSON.stringify([prev, cur, next]);
      map.set(key, map.has(key) ? null : script.sentences[i].sentenceId);
    }
    return map;
  };
  const oldMap = buildMap(before.script), newMap = buildMap(candidate.script);
  for (const [key, oldId] of oldMap) {
    const newId = newMap.get(key);
    if (!oldId || !newId) continue;
    const oldIndex = beforeClone.findings.findIndex(f => f.sentenceId === oldId);
    const newIndex = candidateClone.findings.findIndex(f => f.sentenceId === newId);
    const oldFinding = beforeClone.findings[oldIndex], newFinding = candidateClone.findings[newIndex];
    const oldSeverity = SEVERITY_RANK_V8[oldFinding.classification], newSeverity = SEVERITY_RANK_V8[newFinding.classification];
    if (oldSeverity === newSeverity) continue;
    // A late discovery remains an objection in either selected version; raw reports stay intact.
    const worst = oldSeverity > newSeverity ? oldFinding : newFinding;
    beforeClone.findings[oldIndex] = { ...worst, sentenceId: oldId, sentenceFingerprint: oldFinding.sentenceFingerprint };
    candidateClone.findings[newIndex] = { ...worst, sentenceId: newId, sentenceFingerprint: newFinding.sentenceFingerprint };
  }
  return { before: beforeClone, candidate: candidateClone };
}

/** Compare verified versions, never the model's own word estimate or edit success flag. */
export function decideNarrativeEditV8(
  before: NarrativeEditVersionV8, candidate: NarrativeEditVersionV8, targetWords?: number, targetSentenceIds?: string[]
): Pick<NarrativeEditComparisonV8, 'decision' | 'reason'> {
  if (!before.verification || !candidate.verification) {
    return { decision: 'pending', reason: 'Falta verificar una versión de la edición.' };
  }
  const reports = reconcileNarrativeEditReportsV8(before, candidate);
  const counts = (report: NarrativeAuditReportV6) => {
    return {
      contradictions: report.findings.filter(f => f.classification === 'distorted').length,
      objections: report.findings.filter(f => !['supported', 'authorized_inference'].includes(f.classification)).length,
    };
  };
  const previous = counts(reports.before), next = counts(reports.candidate);
  if (targetSentenceIds === undefined && (next.contradictions > previous.contradictions || next.objections > previous.objections)) {
    return { decision: 'rejected', reason: 'La edición aumenta las objeciones factuales o las contradicciones.' };
  }

  // ponytail: targetSentenceIds represents a per-sentence correction; no adding/removing sentences.
  if (targetSentenceIds !== undefined) {
    if (targetSentenceIds.length === 0) {
      return { decision: 'rejected', reason: 'La lista de frases objetivo está vacía.' };
    }
    const targetSet = new Set(targetSentenceIds);
    if (targetSet.size !== targetSentenceIds.length) {
      return { decision: 'rejected', reason: 'La lista de frases objetivo contiene duplicados.' };
    }
    const beforeIds = new Set(before.script.sentences.map(s => s.sentenceId));
    const candidateIds = new Set(candidate.script.sentences.map(s => s.sentenceId));
    for (const id of targetSet) {
      if (!beforeIds.has(id)) {
        return { decision: 'rejected', reason: 'La frase objetivo no existe en la versión anterior.' };
      }
      if (!candidateIds.has(id)) {
        return { decision: 'rejected', reason: 'La frase objetivo no existe en el candidato.' };
      }
    }
    if (beforeIds.size !== candidateIds.size) {
      return { decision: 'rejected', reason: 'La edición cambia el número de frases; fuera del alcance de corrección por frase.' };
    }
    const beforeIndexMap = new Map(before.script.sentences.map(s => [s.sentenceId, s]));
    const candidateIndexMap = new Map(candidate.script.sentences.map(s => [s.sentenceId, s]));
    for (const id of beforeIds) {
      if (!targetSet.has(id)) {
        const beforeText = beforeIndexMap.get(id)!.text;
        const candidateText = candidateIndexMap.get(id)!.text;
        if (beforeText !== candidateText) {
          return { decision: 'rejected', reason: 'La edición modifica una frase fuera de los objetivos.' };
        }
      }
    }
    const candidateFindingMap = new Map(reports.candidate.findings.map(f => [f.sentenceId, f]));
    for (const id of targetSet) {
      const finding = candidateFindingMap.get(id);
      if (!finding || !['supported', 'authorized_inference'].includes(finding.classification)) {
        return { decision: 'rejected', reason: 'Una frase objetivo no está soportada o autorizada en la auditoría del candidato.' };
      }
    }
    let changedTarget = false;
    for (const id of targetSet) {
      if (beforeIndexMap.get(id)!.text !== candidateIndexMap.get(id)!.text) {
        changedTarget = true;
        break;
      }
    }
    if (!changedTarget) {
      return { decision: 'rejected', reason: 'Ninguna frase objetivo cambió; no hay corrección efectiva.' };
    }
    const normalize = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ');
    const beforeNormalized = before.script.sentences.map(s => normalize(s.text));
    const candidateNormalized = candidate.script.sentences.map(s => normalize(s.text));
    const beforeCounts = new Map<string, number>();
    for (const t of beforeNormalized) beforeCounts.set(t, (beforeCounts.get(t) || 0) + 1);
    const candidateCounts = new Map<string, number>();
    for (const t of candidateNormalized) candidateCounts.set(t, (candidateCounts.get(t) || 0) + 1);
    for (const [text, count] of candidateCounts) {
      const oldCount = beforeCounts.get(text) || 0;
      if (count > 1 && count > oldCount) {
        return { decision: 'rejected', reason: 'La edición introduce una repetición exacta de frases normalizadas.' };
      }
    }
  }


  const distance = (version: NarrativeEditVersionV8) => {
    if (targetWords === undefined) return 0;
    if (!Number.isFinite(targetWords) || targetWords < 0) throw new Error('invalid edit word target');
    const bounds = narrationLengthBoundsV8(targetWords);
    const words = version.script.text.trim().split(/\s+/u).length;
    return Math.max(bounds.minimumWords - words, words - bounds.maximumWords, 0);
  };
  if (targetSentenceIds !== undefined) {
    const candidateWords = candidate.script.text.trim().split(/\s+/u).length;
    const withinLocalBand = targetWords === undefined
      || evaluateNarrationDeliveryV8([{ targetWords, actualWords: candidateWords }]).localPassed;
    if (!withinLocalBand && distance(candidate) > distance(before)) {
      return { decision: 'rejected', reason: 'La edición empeora la desviación de duración.' };
    }
    return { decision: 'accepted', reason: 'Las correcciones objetivo están verificadas y las observaciones restantes se conservan.' };
  }
  if (distance(candidate) > distance(before)) {
    return { decision: 'rejected', reason: 'La edición empeora la desviación de duración.' };
  }
  return { decision: 'accepted', reason: 'La edición no empeora las objeciones factuales ni la duración.' };
}
