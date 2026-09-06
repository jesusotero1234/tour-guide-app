import { decideNarrativeEditV8, reconcileNarrativeEditReportsV8, NarrativeEditVersionV8 } from './NarrativeEditDecisionV8';
import { assignNarrativeSentenceIdsV6, NarrativeAuditReportV6 } from './NarrativeEditorialV6';

function buildVersion(text: string, classifications: NarrativeAuditReportV6['findings'][number]['classification'][]): NarrativeEditVersionV8 {
  const script = assignNarrativeSentenceIdsV6('stop', text, { sentenceBoundaryPolicy: 'v8' });
  if (script.sentences.length !== classifications.length) {
    throw new Error('classification count mismatch');
  }
  return {
    draft: {} as NarrativeEditVersionV8['draft'], script,
    verification: { scriptFingerprint: script.fingerprint, report: { auditor: 'deepseek_pro',
      findings: script.sentences.map((s, i) => ({ sentenceId: s.sentenceId, classification: classifications[i],
        reason: 'Resultado del verificador.', propositionIds: [], passageIds: ['passage'] })) } },
  };
}

function version(words: number, classifications: NarrativeAuditReportV6['findings'][number]['classification'][] = ['supported']): NarrativeEditVersionV8 {
  const text = classifications.map((_, index) => Array.from({ length: index === 0 ? words - classifications.length + 1 : 1 }, () => 'Texto').join(' ') + '.').join(' ');
  return buildVersion(text, classifications);
}
describe('verified edit selection V8', () => {
  it('rejects factual improvement that worsens duration', () => {
    expect(decideNarrativeEditV8(version(600, ['unsupported']), version(500), 600).decision).toBe('rejected');
  });
  it('rejects more factual issues', () => {
    expect(decideNarrativeEditV8(version(600), version(500, ['unsupported']), 600).decision).toBe('rejected');
  });
  it('does not trade fewer objections for more contradictions', () => {
    expect(decideNarrativeEditV8(version(600, ['unsupported', 'unclear']), version(600, ['distorted']), 600).decision).toBe('rejected');
  });
  it('rejects a factual tie that makes duration worse', () => {
    expect(decideNarrativeEditV8(version(600), version(545), 600).decision).toBe('rejected');
  });
  it('accepts a factual tie that improves duration or remains in band', () => {
    expect(decideNarrativeEditV8(version(530), version(580), 600).decision).toBe('accepted');
    expect(decideNarrativeEditV8(version(600), version(590), 600).decision).toBe('accepted');
  });
  it('keeps missing verification pending', () => {
    expect(decideNarrativeEditV8(version(600), { ...version(600), verification: null }, 600).decision).toBe('pending');
  });
  it('rejects stale verification or missing sentence coverage', () => {
    const stale = version(600); stale.verification!.scriptFingerprint = 'stale';
    expect(() => decideNarrativeEditV8(version(600), stale, 600)).toThrow('fingerprint');
    const missing = version(600); missing.verification!.report.findings = [];
    expect(() => decideNarrativeEditV8(version(600), missing, 600)).toThrow('every sentence');
  });
  it('marks same text newly unsupported as conservatively unsupported in both reports', () => {
    const before = version(600);
    const candidate = version(600, ['unsupported']);
    const reports = reconcileNarrativeEditReportsV8(before, candidate);
    expect(reports.before.findings[0].classification).toBe('unsupported');
    expect(reports.candidate.findings[0].classification).toBe('unsupported');
    expect(before.verification!.report.findings[0].classification).toBe('supported');
    expect(decideNarrativeEditV8(before, candidate, 600).decision).toBe('accepted');
  });
  it('accepts a factual tie when duration is unchanged', () => {
    const before = version(600);
    const candidate = version(600);
    expect(decideNarrativeEditV8(before, candidate, 600).decision).toBe('accepted');
    const reports = reconcileNarrativeEditReportsV8(before, candidate);
    expect(reports.before.findings).toEqual(before.verification!.report.findings);
    expect(reports.candidate.findings).toEqual(candidate.verification!.report.findings);
  });
  it('protects reversed inputs from transferring findings', () => {
    const before = version(600, ['unsupported']);
    const candidate = version(600);
    const reports = reconcileNarrativeEditReportsV8(before, candidate);
    expect(reports.before.findings[0].classification).toBe('unsupported');
    expect(reports.candidate.findings[0].classification).toBe('unsupported');
  });
  it('prevents transferring findings when a neighbor sentence changes', () => {
    const before = version(600, ['supported', 'supported']);
    const candidate = version(599, ['supported', 'unsupported']);
    const reports = reconcileNarrativeEditReportsV8(before, candidate);
    expect(before.script.sentences[1].text).toBe(candidate.script.sentences[1].text);
    expect(reports.before.findings[1].classification).toBe('supported');
    expect(reports.candidate.findings[1].classification).toBe('unsupported');
  });
  it('rejects missing verification and different stopId', () => {
    const before = version(600);
    const noVerification = { ...version(600), verification: null };
    expect(decideNarrativeEditV8(before, noVerification, 600).decision).toBe('pending');
    const differentStop = version(600);
    differentStop.script.stopId = 'other-stop';
    expect(() => reconcileNarrativeEditReportsV8(before, differentStop)).toThrow('stop mismatch');
  });
  it('rejects when duration worsens from 550 to 185', () => {
    expect(decideNarrativeEditV8(version(550), version(185), 600).decision).toBe('rejected');
  });
  it('accepts valid factual correction without worsening band', () => {
    const before = version(600, ['unsupported']);
    const candidate = version(600);
    expect(decideNarrativeEditV8(before, candidate, 600).decision).toBe('accepted');
  });
  it('protects sentences outside targets', () => {
    const before = version(600, ['supported', 'supported']);
    const candidate = version(600, ['supported', 'unsupported']);
    const targetIds = [before.script.sentences[0].sentenceId];
    expect(decideNarrativeEditV8(before, candidate, 600, targetIds).decision).toBe('rejected');
  });
  it('rejects when target sentence is still unsupported', () => {
    const before = version(600, ['supported']);
    const candidate = version(600, ['unsupported']);
    const targetIds = [before.script.sentences[0].sentenceId];
    expect(decideNarrativeEditV8(before, candidate, 600, targetIds).decision).toBe('rejected');
  });
  it('rejects new objection on previously supported target even if another resolved', () => {
    const before = version(600, ['supported', 'unsupported']);
    const candidate = version(600, ['unsupported', 'supported']);
    const targetIds = [before.script.sentences[0].sentenceId];
    expect(decideNarrativeEditV8(before, candidate, 600, targetIds).decision).toBe('rejected');
  });
  it('accepts a positive correction with targetSentenceIds and changed text', () => {
    const beforeText = 'Dato erróneo. Contexto que se conserva.';
    const candidateText = 'Dato corregido. Contexto que se conserva.';
    const before = buildVersion(beforeText, ['unsupported', 'supported']);
    const candidate = buildVersion(candidateText, ['supported', 'supported']);
    const targetIds = [before.script.sentences[0].sentenceId];
    const result = decideNarrativeEditV8(before, candidate, undefined, targetIds);
    expect(result.decision).toBe('accepted');
  });
  it('rejects changing text outside authorized targets', () => {
    const beforeText = 'Primera frase. Segunda frase.';
    const candidateText = 'Primera frase. Segunda frase cambiada.';
    const before = buildVersion(beforeText, ['supported', 'supported']);
    const candidate = buildVersion(candidateText, ['supported', 'supported']);
    const targetIds = [before.script.sentences[0].sentenceId];
    const result = decideNarrativeEditV8(before, candidate, undefined, targetIds);
    expect(result.decision).toBe('rejected');
    expect(result.reason).toBe('La edición modifica una frase fuera de los objetivos.');
  });
  it('rejects duplicate targetSentenceIds', () => {
    const beforeText = 'Primera frase. Segunda frase.';
    const candidateText = 'Primera frase corregida. Segunda frase.';
    const before = buildVersion(beforeText, ['unsupported', 'supported']);
    const candidate = buildVersion(candidateText, ['supported', 'supported']);
    const targetIds = [before.script.sentences[0].sentenceId, before.script.sentences[0].sentenceId];
    const result = decideNarrativeEditV8(before, candidate, undefined, targetIds);
    expect(result.decision).toBe('rejected');
    expect(result.reason).toBe('La lista de frases objetivo contiene duplicados.');
  });
  it('accepts new objection in non-target sentence when target resolved', () => {
    const beforeText = 'Primera frase. Segunda frase.';
    const candidateText = 'Primera frase corregida. Segunda frase.';
    const before = buildVersion(beforeText, ['unsupported', 'supported']);
    const candidate = buildVersion(candidateText, ['supported', 'unsupported']);
    const targetIds = [before.script.sentences[0].sentenceId];
    const result = decideNarrativeEditV8(before, candidate, undefined, targetIds);
    expect(result.decision).toBe('accepted');
    const reports = reconcileNarrativeEditReportsV8(before, candidate);
    expect(reports.candidate.findings[1].classification).toBe('unsupported');
    expect(candidate.verification!.report.findings[1].classification).toBe('unsupported');
  });
  it('accepts late distorted finding on protected neighbor with corrected supported target', () => {
    const beforeText = 'Primera frase. Segunda frase.';
    const candidateText = 'Primera frase corregida. Segunda frase.';
    const before = buildVersion(beforeText, ['unsupported', 'supported']);
    const candidate = buildVersion(candidateText, ['supported', 'distorted']);
    const targetIds = [before.script.sentences[0].sentenceId];
    const result = decideNarrativeEditV8(before, candidate, undefined, targetIds);
    expect(result.decision).toBe('accepted');
    const reports = reconcileNarrativeEditReportsV8(before, candidate);
    expect(reports.candidate.findings[1].classification).toBe('distorted');
    expect(candidate.verification!.report.findings[1].classification).toBe('distorted');
  });
  it('rejects exact repetition of a new sentence', () => {
    const beforeText = 'Primera frase. Segunda frase.';
    const candidateText = 'Primera frase. Primera frase.';
    const before = buildVersion(beforeText, ['supported', 'supported']);
    const candidate = buildVersion(candidateText, ['supported', 'supported']);
    const targetIds = [before.script.sentences[1].sentenceId];
    const result = decideNarrativeEditV8(before, candidate, undefined, targetIds);
    expect(result.decision).toBe('rejected');
    expect(result.reason).toBe('La edición introduce una repetición exacta de frases normalizadas.');
  });
  it('accepts scoped factual correction within local duration band', () => {
    const before = version(539, ['unsupported']);
    const candidate = version(525, ['supported']);
    const targetIds = [before.script.sentences[0].sentenceId];
    const result = decideNarrativeEditV8(before, candidate, 570, targetIds);
    expect(result.decision).toBe('accepted');
  });
  it('accepts scoped correction within local band and rejects just outside', () => {
    const before = version(600, ['unsupported']);
    const candidateAccepted = version(480, ['supported']);
    const candidateRejected = version(479, ['supported']);
    const targetIds = [before.script.sentences[0].sentenceId];
    expect(decideNarrativeEditV8(before, candidateAccepted, 600, targetIds).decision).toBe('accepted');
    expect(decideNarrativeEditV8(before, candidateRejected, 600, targetIds).decision).toBe('rejected');
  });
  it('rejects unsupported target even inside local band', () => {
    const before = version(600, ['unsupported']);
    const candidate = version(500, ['unsupported']);
    const targetIds = [before.script.sentences[0].sentenceId];
    const result = decideNarrativeEditV8(before, candidate, 600, targetIds);
    expect(result.decision).toBe('rejected');
    expect(result.reason).toBe('Una frase objetivo no está soportada o autorizada en la auditoría del candidato.');
  });
});
