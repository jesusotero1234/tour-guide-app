import { EditorialCallResultV6 } from './EditorialStructuredLlmV6';
import { NarrativeAgentProtocolErrorV6, NarrativeAuditInputV6 } from './NarrativeEditorialAgentsV6';
import { NarrativeEditorialAgentsV8 } from './NarrativeEditorialAgentsV8';
import { NarrativeAdmittedStopV8, NarrativeEvidenceManifestV8 } from './NarrativeEvidenceBoundaryV8';
import { buildNarrativeEvidenceFixtureV8 } from './NarrativeEvidenceFixturesV8.test-support';
import { NarrativeEditorialWorkflowInputV8, runNarrativeEditorialWorkflowV8 } from './NarrativeEditorialWorkflowV8';
import { NarrativeEditorialStageStateV8 } from './NarrativeEditorialStageStateV8';
import { NarrativeRouteBriefV6 } from './NarrativeContractsV6';
import { NarrativeAuditReportV6, assignNarrativeSentenceIdsV6 } from './NarrativeEditorialV6';
import { buildNarrativeWriterPlanV8, parseNarrativeWriterResponseV8 } from './NarrativeWriterContractV8';
import { narrationTargetForSecondsV8 } from './NarrativeDurationTargetsV8';
import { applyNarrativeSentencePatchV8, resolveNarrativeSentenceTargetsV8 } from './NarrativeSentenceEditV8';
import { buildNarrativePublicationQualityV8 } from './NarrativePublicationQualityV8';
import { createCheckpoint, projectCheckpointStateForResumeV8 } from './NarrativeUserCanaryCheckpointV8';

function diagnostic<T>(callId: string, value: T, status: 'valid' | 'transport_error' = 'valid'): EditorialCallResultV6<T> {
  return { callId, status, value, attempts: [{ attempt: 1, status, latencyMs: 1,
    rawOutput: '{}', error: status === 'valid' ? null : 'HTTP 503 temporary failure' }],
    model: 'test', promptFingerprint: 'p', responseFingerprint: 'r',
    inputCharacters: 1, schemaCharacters: 1, input: {}, rawOutput: '{}' };
}

function fixture(city = 'Madrid', count = 1, thin = false) {
  const admittedStops: NarrativeAdmittedStopV8[] = Array.from({ length: count }, (_, index) => {
    const f = buildNarrativeEvidenceFixtureV8({ routeStopId: 'stop-' + index, entityQid: 'Q' + (100 + index),
      includedRoles: thin ? ['visible_observation', 'chronology_or_transformation', 'human_agency_or_lived_function', 'distinctive_trait'] :
        ['visible_observation', 'chronology_or_transformation', 'human_agency_or_lived_function', 'tension_or_contrast', 'distinctive_trait'],
      sources: [{ sourceId: 'source-' + index, publisherKey: 'official.example', authorityTier: 'primary_authority' }] });
    if (f.tier === 'D') throw new Error('fixture must be admitted');
    return { routeStopId: f.routeStopId, entityQid: f.entityQid, dossier: f.dossier,
      evidence: { schemaVersion: 'narrative-evidence-context-v8', routeStopId: f.routeStopId, entityQid: f.entityQid,
        evidenceTier: f.tier, routeEligible: true, gates: f.gates,
        dossierFingerprint: f.dossier.fingerprint, legacyV6IsSufficient: f.dossier.sufficiency.isSufficient } };
  });
  const route: NarrativeRouteBriefV6 = { schemaVersion: 'narrative-route-brief-v6', caseId: 'fixture', city,
    country: 'España', language: 'es', theme: 'history', durationMinutes: 60, fingerprint: 'route-fingerprint',
    stops: admittedStops.map((s, i) => ({ stopId: s.routeStopId, position: i, name: 'Palacio', narrativeRole: 'historia',
      wikidataId: s.entityQid, wikidataUrl: 'https://www.wikidata.org/wiki/' + s.entityQid, wikipediaUrl: null,
      coordinates: { lat: 40, lng: -3 }, previousStopId: admittedStops[i - 1]?.routeStopId ?? null,
      nextStopId: admittedStops[i + 1]?.routeStopId ?? null })) };
  const manifest: NarrativeEvidenceManifestV8 = { schemaVersion: 'narrative-evidence-manifest-v8',
    routeFingerprint: route.fingerprint, fingerprint: 'manifest-fingerprint',
    stops: admittedStops.map(s => ({ ...s.evidence })) };
  const plans = admittedStops.map((s, index) => {
    const target = narrationTargetForSecondsV8(s.routeStopId, 60);
    target.targetWords = s.dossier.propositions.map(p => p.text).join(' ').split(/\s+/u).length;
    target.targetSeconds = target.targetWords / 2;
    return buildNarrativeWriterPlanV8({ routeStopId: s.routeStopId, dossier: s.dossier, narrationTarget: target, stopIndex: index });
  });
  const drafts = plans.map(plan => parseNarrativeWriterResponseV8(plan, { stop_id: plan.routeStopId,
    segments: plan.beats.map((beat, i) => {
      const claims = beat.evidenceCardIds.map(id => plan.evidenceCards.find(c => c.cardId === id)!.claim);
      const text = claims.map(c => c.endsWith('.') ? c : c + '.').join(' ');
      return { segmentId: 'segment-' + i, beat: beat.beat, text, supportCardIds: beat.evidenceCardIds, estimatedWords: 999 };
    }) }));
  const input: NarrativeEditorialWorkflowInputV8 = { runId: 'test', createdAt: '2026-09-05T12:00:00Z',
    route, admittedStops, voiceProfile: ['Factual y oral.'], privateArtifactPath: '/tmp/staged-test.json',
    arcBundle: { manifest, arc: { promise: 'Comprender los cambios del lugar.', centralQuestion: '¿Cómo cambió su uso?',
      stops: admittedStops.map(s => ({ stopId: s.routeStopId, contribution: 'Explica la transformación del lugar.',
        bridge: 'Cierre del recorrido.', contributionPropositionIds: [s.dossier.propositions[0].propositionId],
        bridgePropositionIds: [] })) } } };
  const report = (auditInput: NarrativeAuditInputV6, classification: 'supported' | 'unsupported' = 'supported'): NarrativeAuditReportV6 => ({
    auditor: 'deepseek_pro', findings: auditInput.script.sentences.map((s, index) => {
      const isUnsupported = classification === 'unsupported' && index === 0;
      return {
        sentenceId: s.sentenceId, classification: isUnsupported ? 'unsupported' : 'supported',
        reason: isUnsupported ? 'Falta respaldo.' : 'Soporte explícito.',
        propositionIds: [], passageIds: isUnsupported ? [] : [auditInput.dossier.passages[0].passageId],
      };
    }),
  });
  const write = jest.fn(async ({ stopId }: { stopId: string }) => {
    const draft = drafts[admittedStops.findIndex(s => s.routeStopId === stopId)];
    return { value: draft, diagnostic: diagnostic('writer-' + stopId, draft) };
  });
  const verify = jest.fn(async (auditInput: NarrativeAuditInputV6) => {
    const value = report(auditInput); return { value, diagnostic: diagnostic('verify', value) };
  });
  const edit = jest.fn(async (stopId: string, draft: typeof drafts[number], ids: string[]) => {
    const plan = plans.find(p => p.routeStopId === stopId)!;
    const targets = resolveNarrativeSentenceTargetsV8(stopId, draft, ids);
    const first = targets[0];
    const words = first.text.split(/\s+/u);
    const newText = 'Observa ' + words.slice(1).join(' ');
    const value = applyNarrativeSentencePatchV8(plan, draft, ids, { replacements: [{
      sentenceId: first.sentenceId, text: newText, supportCardIds: first.segmentId ? draft.segments.find(s => s.segmentId === first.segmentId)!.supportCardIds : [],
    }] });
    return { value, diagnostic: diagnostic('edit', value) };
  });
  const auditTour = jest.fn(async () => {
    const value = { issues: [], progressionWorks: true, promiseDelivered: true, closingWorks: true };
    return { value, diagnostic: diagnostic('global', value) };
  });
  const agents: NarrativeEditorialAgentsV8 = {
    evidenceManifestFingerprint: manifest.fingerprint, policyFingerprint: 'test-policy',
    writerPlan: id => plans.find(p => p.routeStopId === id) ?? null,
    narrationLengthOutcome: () => null, write, verify, edit, auditTour,
    audit: jest.fn(), repair: jest.fn(), adjudicate: jest.fn(),
  };
  return { input, agents, write, verify, edit, auditTour, report, plans, drafts };
}
const complete = <T extends { status: string }>(value: T): Extract<T, { status: 'complete' }> => {
  if (value.status !== 'complete') throw new Error(JSON.stringify(value));
  return value as Extract<T, { status: 'complete' }>;
};

describe('canonical V8 staged workflow', () => {
  it.each(['Madrid', 'Toledo'])('writes and verifies once, saves before audit and reuses exact stages: %s', async city => {
    const f = fixture(city);
    let saved: NarrativeEditorialStageStateV8 | undefined;
    f.verify.mockImplementation(async auditInput => {
      expect(saved?.stops[0].script?.text).toBe(auditInput.script.text);
      const value = f.report(auditInput); return { value, diagnostic: diagnostic('verify', value) };
    });
    const first = complete(await runNarrativeEditorialWorkflowV8(f.input, f.agents, { onCheckpoint: async state => { saved = state; } }));
    expect(first.editorial.run.status).toBe('ready_for_human_gate');
    expect(f.write).toHaveBeenCalledTimes(1); expect(f.verify).toHaveBeenCalledTimes(1);
    expect(f.auditTour).toHaveBeenCalledTimes(1); expect(f.edit).not.toHaveBeenCalled();
    expect(f.agents.audit).not.toHaveBeenCalled(); expect(f.agents.adjudicate).not.toHaveBeenCalled();
    expect(first.stageState.stops[0].firstPassVerified).toBe(true);
    const resumed = complete(await runNarrativeEditorialWorkflowV8({ ...f.input, runId: 'resumed' }, f.agents, { resumeState: saved }));
    expect(resumed.editorial.run.status).toBe('ready_for_human_gate');
    expect(f.write).toHaveBeenCalledTimes(1); expect(f.verify).toHaveBeenCalledTimes(1);
    expect(f.auditTour).toHaveBeenCalledTimes(1);
  });

  it('preserves a thin admitted stop without inventing visual beats or length loops', async () => {
    const f = fixture('Ávila', 1, true);
    const result = complete(await runNarrativeEditorialWorkflowV8(f.input, f.agents));
    expect(result.editorial.stops).toHaveLength(1);
    expect(f.plans[0].beats).toHaveLength(4);
    expect(f.write).toHaveBeenCalledTimes(1);
  });

  it('keeps a draft on verifier failure and retries verification, not writing, on explicit resume', async () => {
    const f = fixture();
    f.verify.mockRejectedValueOnce(new NarrativeAgentProtocolErrorV6(diagnostic('verify', null, 'transport_error')));
    const first = complete(await runNarrativeEditorialWorkflowV8(f.input, f.agents));
    expect(first.editorial.run.status).toBe('draft_review_required');
    expect(first.stageState.stops[0].script).not.toBeNull();
    expect(first.editorial.issueStateV8?.openIssueIds).toContain('stop-0:verification_pending');
    expect(f.auditTour).not.toHaveBeenCalled();
    const second = complete(await runNarrativeEditorialWorkflowV8(f.input, f.agents, { resumeState: first.stageState }));
    expect(second.editorial.run.status).toBe('ready_for_human_gate');
    expect(f.write).toHaveBeenCalledTimes(1); expect(f.verify).toHaveBeenCalledTimes(2);
  });

  it('isolates writer failure to its stop and preserves another stop', async () => {
    const f = fixture('Madrid', 2);
    f.write.mockRejectedValueOnce(new NarrativeAgentProtocolErrorV6(diagnostic('writer', null, 'transport_error')));
    const result = complete(await runNarrativeEditorialWorkflowV8(f.input, f.agents));
    expect(result.editorial.stops.map(s => s.stopId)).toEqual(['stop-1']);
    expect(result.stageState.stops[0].writeAttempted).toBe(true);
    expect(f.verify).toHaveBeenCalledTimes(1);
    expect(result.editorial.run.status).toBe('draft_review_required');
    await runNarrativeEditorialWorkflowV8(f.input, f.agents, { resumeState: result.stageState, maximumRepairCalls: 0 });
    expect(f.write.mock.calls.map(call => call[0].stopId)).toEqual(['stop-0', 'stop-1', 'stop-0']);
  });

  it('edits once, rejects when candidate is unsupported, saves before and never edits twice across resumes', async () => {
    const f = fixture();
    f.verify.mockImplementation(async auditInput => {
      const value = f.report(auditInput, 'unsupported'); return { value, diagnostic: diagnostic('verify', value) };
    });
    const saves: NarrativeEditorialStageStateV8[] = [];
    const result = complete(await runNarrativeEditorialWorkflowV8(f.input, f.agents, { onCheckpoint: async s => { saves.push(s); } }));
    expect(f.edit).toHaveBeenCalledTimes(1); expect(f.verify).toHaveBeenCalledTimes(2);
    expect(f.auditTour).toHaveBeenCalledTimes(1);
    expect(result.editorial.run.status).toBe('draft_review_required');
    expect(saves.some(s => s.stops[0].script?.text !== s.stops[0].initialScript?.text
      && s.stops[0].verification === null && s.globalReview === null)).toBe(true);
    expect(f.edit.mock.calls[0][2]).toEqual(['stop-0-S001']);
    const comp = result.stageState.stops[0].editComparison;
    expect(comp).toBeDefined();
    expect(comp!.decision).toBe('rejected');
    expect(comp!.candidate.script.text).not.toBe(comp!.before.script.text);
    expect(comp!.before.script.text).toBe(result.stageState.stops[0].initialScript!.text);
    expect(result.stageState.stops[0].script!.text).toBe(result.stageState.stops[0].initialScript!.text);
    await runNarrativeEditorialWorkflowV8(f.input, f.agents, { resumeState: result.stageState });
    expect(f.edit).toHaveBeenCalledTimes(1); expect(f.verify).toHaveBeenCalledTimes(2);
  });

  it('accepts edit when first verification is unsupported and second is supported', async () => {
    const f = fixture();
    f.verify.mockImplementation(async auditInput => {
      const classification = f.verify.mock.calls.length === 1 ? 'unsupported' : 'supported';
      const value = f.report(auditInput, classification); return { value, diagnostic: diagnostic('verify', value) };
    });
    const saves: NarrativeEditorialStageStateV8[] = [];
    const result = complete(await runNarrativeEditorialWorkflowV8(f.input, f.agents, { onCheckpoint: async s => { saves.push(s); } }));
    expect(result.editorial.run.status).toBe('ready_for_human_gate');
    expect(f.edit).toHaveBeenCalledTimes(1); expect(f.verify).toHaveBeenCalledTimes(2);
    expect(f.auditTour).toHaveBeenCalledTimes(2);
    const comp = result.stageState.stops[0].editComparison;
    expect(comp).toBeDefined();
    expect(comp!.decision).toBe('accepted');
    expect(result.stageState.stops[0].script!.text).toBe(comp!.candidate.script.text);
    expect(result.stageState.stops[0].script!.text).not.toBe(comp!.before.script.text);
    expect(result.stageState.stops[0].firstPassVerified).toBe(false);
    expect(saves.some(s => s.stops[0].editComparison?.decision === 'accepted')).toBe(true);
    const resumed = complete(await runNarrativeEditorialWorkflowV8(f.input, f.agents, { resumeState: result.stageState }));
    expect(resumed.editorial.run.status).toBe('ready_for_human_gate');
    expect(f.edit).toHaveBeenCalledTimes(1); expect(f.verify).toHaveBeenCalledTimes(2);
    expect(f.auditTour).toHaveBeenCalledTimes(2);
  });

  it('handles error verifying candidate, saves pending result, and resumes to acceptance', async () => {
    const f = fixture();
    f.verify.mockImplementation(async auditInput => {
      const callCount = f.verify.mock.calls.length;
      if (callCount === 1) {
        const value = f.report(auditInput, 'unsupported'); return { value, diagnostic: diagnostic('verify', value) };
      }
      if (callCount === 2) {
        throw new NarrativeAgentProtocolErrorV6(diagnostic('verify', null, 'transport_error'));
      }
      const value = f.report(auditInput, 'supported'); return { value, diagnostic: diagnostic('verify', value) };
    });
    const first = complete(await runNarrativeEditorialWorkflowV8(f.input, f.agents));
    expect(first.editorial.run.status).toBe('draft_review_required');
    expect(f.edit).toHaveBeenCalledTimes(1); expect(f.verify).toHaveBeenCalledTimes(2);
    const comp = first.stageState.stops[0].editComparison;
    expect(comp).toBeDefined();
    expect(comp!.decision).toBe('pending');
    expect(comp!.before.script.text).toBe(first.stageState.stops[0].initialScript!.text);
    expect(comp!.candidate.script.text).not.toBe(comp!.before.script.text);
    const second = complete(await runNarrativeEditorialWorkflowV8(f.input, f.agents, { resumeState: first.stageState }));
    expect(second.editorial.run.status).toBe('ready_for_human_gate');
    expect(f.edit).toHaveBeenCalledTimes(1); expect(f.verify).toHaveBeenCalledTimes(3);
    expect(second.stageState.stops[0].editComparison!.decision).toBe('accepted');
    expect(second.stageState.stops[0].script!.text).toBe(second.stageState.stops[0].editComparison!.candidate.script.text);
  });

  it('handles persistence interruption after saving candidate and before verify, resumes without re-editing', async () => {
    const f = fixture();
    f.verify.mockImplementation(async auditInput => {
      const value = f.report(auditInput, f.verify.mock.calls.length === 1 ? 'unsupported' : 'supported');
      return { value, diagnostic: diagnostic('verify', value) };
    });
    let snapshot: NarrativeEditorialStageStateV8 | undefined;
    await expect(runNarrativeEditorialWorkflowV8(f.input, f.agents, {
      onCheckpoint: async s => {
        if (s.stops[0].editComparison?.decision === 'pending') {
          snapshot = JSON.parse(JSON.stringify(s)) as NarrativeEditorialStageStateV8;
          throw new Error('disk interrupted');
        }
      }
    })).rejects.toThrow('disk interrupted');
    expect(snapshot).toBeDefined();
    expect(f.edit).toHaveBeenCalledTimes(1); expect(f.verify).toHaveBeenCalledTimes(1);
    const resumed = complete(await runNarrativeEditorialWorkflowV8(f.input, f.agents, { resumeState: snapshot }));
    expect(resumed.editorial.run.status).toBe('ready_for_human_gate');
    expect(f.edit).toHaveBeenCalledTimes(1); expect(f.verify).toHaveBeenCalledTimes(2);
    expect(resumed.stageState.stops[0].editComparison!.decision).toBe('accepted');
  });

  it('rejects corrupted archived snapshot with foreign passageIds without new calls', async () => {
    const f = fixture();
    f.verify.mockImplementation(async auditInput => {
      const value = f.report(auditInput, f.verify.mock.calls.length === 1 ? 'unsupported' : 'supported');
      return { value, diagnostic: diagnostic('verify', value) };
    });
    const first = complete(await runNarrativeEditorialWorkflowV8(f.input, f.agents));
    const corrupted = JSON.parse(JSON.stringify(first.stageState)) as NarrativeEditorialStageStateV8;
    corrupted.stops[0].editComparison!.before.verification!.report.findings[0].passageIds = ['foreign-passage'];
    const result = await runNarrativeEditorialWorkflowV8(f.input, f.agents, { resumeState: corrupted });
    expect(result.status).toBe('protocol_failed');
    expect(f.write).toHaveBeenCalledTimes(1); expect(f.verify).toHaveBeenCalledTimes(2);
    expect(f.edit).toHaveBeenCalledTimes(1);
  });

  it('rejects a current report that differs from the selected archived report', async () => {
    const f = fixture();
    f.verify.mockImplementation(async auditInput => {
      const value = f.report(auditInput, f.verify.mock.calls.length === 1 ? 'unsupported' : 'supported');
      return { value, diagnostic: diagnostic('verify', value) };
    });
    const first = complete(await runNarrativeEditorialWorkflowV8(f.input, f.agents));
    const corrupted = JSON.parse(JSON.stringify(first.stageState)) as NarrativeEditorialStageStateV8;
    corrupted.stops[0].verification!.report.findings[0].classification = 'unsupported';
    const result = await runNarrativeEditorialWorkflowV8(f.input, f.agents, { resumeState: corrupted });
    expect(result.status).toBe('protocol_failed');
    expect(f.write).toHaveBeenCalledTimes(1); expect(f.verify).toHaveBeenCalledTimes(2);
    expect(f.edit).toHaveBeenCalledTimes(1);
  });

  it('selects only the affected sentence for a local issue', async () => {
    const f = fixture();
    f.verify.mockImplementation(async auditInput => {
      const value = f.report(auditInput);
      if (f.verify.mock.calls.length === 1) value.findings[0] = { ...value.findings[0], classification: 'unsupported', passageIds: [] };
      return { value, diagnostic: diagnostic('verify', value) };
    });
    const result = complete(await runNarrativeEditorialWorkflowV8(f.input, f.agents));
    expect(f.edit).toHaveBeenCalledTimes(1);
    expect(f.edit.mock.calls[0][0]).toBe('stop-0');
    expect(f.edit.mock.calls[0][2]).toEqual(['stop-0-S001']);
    expect(result.stageState.stops[0].editAttempted).toBe(true);
  });

  it('preserves an unchanged late objection in the selected report and raw report across resume', async () => {
    const f = fixture();
    f.verify.mockImplementation(async auditInput => {
      const callCount = f.verify.mock.calls.length;
      const value = f.report(auditInput);
      const index = callCount === 1 ? 0 : value.findings.length - 1;
      value.findings[index] = { ...value.findings[index], classification: 'unsupported', passageIds: [] };
      return { value, diagnostic: diagnostic('verify', value) };
    });
    const first = complete(await runNarrativeEditorialWorkflowV8(f.input, f.agents));
    expect(first.editorial.run.status).toBe('draft_review_required');
    expect(f.edit).toHaveBeenCalledTimes(1); expect(f.verify).toHaveBeenCalledTimes(2);
    const comp = first.stageState.stops[0].editComparison!;
    expect(comp.decision).toBe('rejected');
    expect(comp.before.script.text).toBe(first.stageState.stops[0].initialScript!.text);
    const resumed = complete(await runNarrativeEditorialWorkflowV8(f.input, f.agents, { resumeState: first.stageState }));
    expect(resumed.editorial.run.status).toBe('draft_review_required');
    expect(f.edit).toHaveBeenCalledTimes(1); expect(f.verify).toHaveBeenCalledTimes(2);
    expect(resumed.stageState.stops[0].verification!.report.findings.at(-1)!.classification).toBe('unsupported');
    expect(resumed.stageState.stops[0].editComparison!.before.verification!.report.findings.at(-1)!.classification).toBe('supported');
  });

  it('preserves edit allowance consumption after an interrupted edit', async () => {
    const f = fixture();
    f.verify.mockImplementation(async auditInput => { const value = f.report(auditInput, 'unsupported');
      return { value, diagnostic: diagnostic('verify', value) }; });
    f.edit.mockRejectedValueOnce(new NarrativeAgentProtocolErrorV6(diagnostic('edit', null, 'transport_error')));
    const first = complete(await runNarrativeEditorialWorkflowV8(f.input, f.agents));
    expect(first.stageState.stops[0].editAttempted).toBe(true);
    await runNarrativeEditorialWorkflowV8(f.input, f.agents, { resumeState: first.stageState });
    expect(f.edit).toHaveBeenCalledTimes(1);
  });

  it.each(['evidence', 'policy', 'voice'])('rejects stale resume after %s changes before model calls', async mode => {
    const f = fixture(); const first = complete(await runNarrativeEditorialWorkflowV8(f.input, f.agents));
    if (mode === 'evidence') f.input.admittedStops[0].dossier.passages[0].quote += ' Cambiado.';
    if (mode === 'voice') f.input.voiceProfile.push('Otra voz.');
    const agents = mode === 'policy' ? { ...f.agents, policyFingerprint: 'new-policy' } : f.agents;
    const result = await runNarrativeEditorialWorkflowV8(f.input, agents, { resumeState: first.stageState });
    expect(result.status).toBe('protocol_failed');
    expect(f.write).toHaveBeenCalledTimes(1); expect(f.verify).toHaveBeenCalledTimes(1);
  });

  it('rejects saved forged citations and drops a mismatched verification fingerprint', async () => {
    const f = fixture(); const first = complete(await runNarrativeEditorialWorkflowV8(f.input, f.agents));
    const forged = JSON.parse(JSON.stringify(first.stageState)) as NarrativeEditorialStageStateV8;
    forged.stops[0].verification!.report.findings[0].passageIds = ['forged'];
    expect((await runNarrativeEditorialWorkflowV8(f.input, f.agents, { resumeState: forged })).status).toBe('protocol_failed');
    const stale = JSON.parse(JSON.stringify(first.stageState)) as NarrativeEditorialStageStateV8;
    stale.stops[0].verification!.scriptFingerprint = 'old';
    const pending = complete(await runNarrativeEditorialWorkflowV8(f.input, f.agents, { resumeState: stale, resumeOnly: true }));
    expect(pending.editorial.run.status).toBe('draft_review_required');
    expect(f.verify).toHaveBeenCalledTimes(1);
  });

  it('propagates budget, cancellation and persistence errors instead of classifying them as model failures', async () => {
    const budget = fixture();
    budget.write.mockRejectedValueOnce(new Error('shared narrative spend cap exhausted before attempt'));
    await expect(runNarrativeEditorialWorkflowV8(budget.input, budget.agents)).rejects.toThrow('spend cap');
    const disk = fixture();
    await expect(runNarrativeEditorialWorkflowV8(disk.input, disk.agents, {
      onCheckpoint: async s => { if (s.stops[0].script) throw new Error('disk full'); },
    })).rejects.toThrow('disk full');
    expect(disk.verify).not.toHaveBeenCalled();
    const cancelled = fixture(); const controller = new AbortController(); controller.abort(new Error('cancelled'));
    await expect(runNarrativeEditorialWorkflowV8(cancelled.input, cancelled.agents, { signal: controller.signal })).rejects.toThrow('cancelled');
    expect(cancelled.write).not.toHaveBeenCalled();
  });

  it('round-trips actual staged artifacts through the existing checkpoint and preserves them on editorial resume', async () => {
    const f = fixture(); const result = complete(await runNarrativeEditorialWorkflowV8(f.input, f.agents));
    const checkpoint = createCheckpoint({
      schemaVersion: 'narrative-user-canary-checkpoint-v8', completedPhase: 'arc',
      run: { runId: 'checkpoint-test', createdAt: '2026-09-05T12:00:00Z', profile: 'qwen38_hybrid',
        city: 'madrid', cityQid: 'Q2807', language: 'es', requestFingerprint: 'request-fingerprint', priorSpendUsd: 0 },
      candidates: {}, core: { requiredIds: ['Q100'], coverageRatio: 1, disagreement: false },
      route: JSON.parse(JSON.stringify(f.input.route)), research: {},
      evidenceManifest: JSON.parse(JSON.stringify(f.input.arcBundle.manifest)), arc: JSON.parse(JSON.stringify(f.input.arcBundle.arc)),
      editorial: { status: result.editorial.run.status,
        scripts: JSON.parse(JSON.stringify(result.editorial.stops.map(s => s.finalScript))),
        stageState: JSON.parse(JSON.stringify(result.stageState)) },
    });
    expect(projectCheckpointStateForResumeV8(checkpoint, 'editorial').editorial?.stageState).toEqual(result.stageState);
    expect(() => createCheckpoint({ ...checkpoint, editorial: { ...checkpoint.editorial!,
      stageState: { rawResponse: 'must not persist raw responses' } } })).toThrow();
  });

  it('retains drafts and leaves a malformed global review pending', async () => {
    const f = fixture();
    f.agents.auditTour = jest.fn(async () => {
      const value = { issues: [{ issueId: 'foreign', stopId: 'stop-0', sentenceId: 'unknown',
        severity: 'hard' as const, reason: 'Wrong sentence.' }], progressionWorks: true, promiseDelivered: true, closingWorks: true };
      return { value, diagnostic: diagnostic('global', value) };
    });
    const result = complete(await runNarrativeEditorialWorkflowV8(f.input, f.agents));
    expect(result.editorial.run.status).toBe('draft_review_required');
    expect(result.stageState.globalError).toContain('invalid global review');
    expect(result.stageState.stops[0].script).not.toBeNull();
    expect(f.edit).not.toHaveBeenCalled();
    const issueIds = result.editorial.issueStateV8?.openIssueIds ?? [];
    expect(issueIds).toContain('tour:global_review_pending');
    expect(issueIds).not.toContain('tour:progressionWorks');
    expect(issueIds).not.toContain('tour:promiseDelivered');
    expect(issueIds).not.toContain('tour:closingWorks');
  });

  it('keeps real false auditor results as hard failures without pending global review', async () => {
    const f = fixture();
    f.agents.auditTour = jest.fn(async () => {
      const value = { issues: [], progressionWorks: false, promiseDelivered: false, closingWorks: false };
      return { value, diagnostic: diagnostic('global', value) };
    });
    const result = complete(await runNarrativeEditorialWorkflowV8(f.input, f.agents, { maximumRepairCalls: 0 }));
    expect(result.editorial.run.status).toBe('draft_review_required');
    const issueIds = result.editorial.issueStateV8?.openIssueIds ?? [];
    expect(issueIds).toContain('tour:progressionWorks');
    expect(issueIds).toContain('tour:promiseDelivered');
    expect(issueIds).toContain('tour:closingWorks');
    expect(issueIds).not.toContain('tour:global_review_pending');
  });

  it('requires final-text traces and completed verification for publication', async () => {
    const f = fixture(); const result = complete(await runNarrativeEditorialWorkflowV8(f.input, f.agents));
    const base = { scripts: result.editorial.stops.map(s => s.finalScript), targets: f.plans.map(p => p.narrationTarget),
      arcContributions: {}, writerDiagnostics: [], requireWriterTraceability: true,
      finalWriterTraces: result.finalWriterTraces, stageVerificationPassed: true };
    expect(buildNarrativePublicationQualityV8(base).passed).toBe(true);
    expect(buildNarrativePublicationQualityV8({ ...base, stageVerificationPassed: false }).passed).toBe(false);
    expect(buildNarrativePublicationQualityV8({ ...base, finalWriterTraces: {} }).passed).toBe(false);
    const changed = assignNarrativeSentenceIdsV6('stop-0', base.scripts[0].text + ' Otra frase.', { sentenceBoundaryPolicy: 'v8' });
    expect(buildNarrativePublicationQualityV8({ ...base, scripts: [changed] }).passed).toBe(false);
  });

  it('does not call edit when only duration outlier is present', async () => {
    const f = fixture();
    f.agents.narrationLengthOutcome = () => ({ stopId: 'stop-0', lengthStatus: 'accepted_with_residual', targetWords: 600, actualWords: 550, minimumWords: 575, maximumWords: 660 });
    const result = complete(await runNarrativeEditorialWorkflowV8(f.input, f.agents));
    expect(f.edit).not.toHaveBeenCalled();
    expect(result.editorial.run.status).toBe('draft_review_required');
    expect(result.editorial.warnings.some(w => w.code === 'duration_outlier')).toBe(true);
  });

  it('authorizes only the first sentence when duration and first objection coexist, leaving a warning', async () => {
    const f = fixture();
    f.agents.narrationLengthOutcome = () => ({ stopId: 'stop-0', lengthStatus: 'accepted_with_residual', targetWords: 600, actualWords: 550, minimumWords: 575, maximumWords: 660 });
    f.verify.mockImplementation(async auditInput => {
      const value = f.report(auditInput, 'unsupported');
      return { value, diagnostic: diagnostic('verify', value) };
    });
    const result = complete(await runNarrativeEditorialWorkflowV8(f.input, f.agents));
    expect(f.edit).toHaveBeenCalledTimes(1);
    expect(f.edit.mock.calls[0][2]).toEqual(['stop-0-S001']);
    expect(result.editorial.run.status).toBe('draft_review_required');
    const issueIds = result.editorial.issueStateV8?.openIssueIds ?? [];
    expect(issueIds.some(id => id.includes('duration'))).toBe(true);
  });

  it('preserves before and does not re-verify when candidate modifies a protected sentence', async () => {
    const f = fixture();
    f.verify.mockImplementation(async auditInput => {
      const value = f.report(auditInput, 'unsupported');
      return { value, diagnostic: diagnostic('verify', value) };
    });
    f.edit.mockImplementation(async (stopId, draft) => {
      const plan = f.plans.find(p => p.routeStopId === stopId)!;
      const value = parseNarrativeWriterResponseV8(plan, { stop_id: stopId,
        segments: draft.segments.map((s, i) => ({ ...s, text: i === 1 ? 'Se cambió contenido protegido.' : s.text })) });
      return { value, diagnostic: diagnostic('edit', value) };
    });
    const result = complete(await runNarrativeEditorialWorkflowV8(f.input, f.agents));
    expect(f.edit).toHaveBeenCalledTimes(1);
    expect(f.verify).toHaveBeenCalledTimes(1);
    expect(result.stageState.stops[0].editComparison).toBeUndefined();
    expect(result.stageState.stops[0].error?.message).toContain('edit_scope_invalid');
    expect(result.stageState.stops[0].script!.text).toBe(result.stageState.stops[0].initialScript!.text);
  });

  it('rejects stale schemaVersion without additional model calls', async () => {
    const f = fixture();
    const first = complete(await runNarrativeEditorialWorkflowV8(f.input, f.agents));
    const result = await runNarrativeEditorialWorkflowV8(f.input, f.agents, {
      resumeState: { ...first.stageState, schemaVersion: 'narrative-editorial-stages-v8-1' },
    });
    expect(result.status).toBe('protocol_failed');
    expect(f.write).toHaveBeenCalledTimes(1);
    expect(f.verify).toHaveBeenCalledTimes(1);
    expect(f.edit).not.toHaveBeenCalled();
  });
});
