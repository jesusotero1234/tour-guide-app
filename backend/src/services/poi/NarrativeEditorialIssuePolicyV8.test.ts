import {
  NarrativeAdjudicationV6,
  NarrativeAuditObjectionV6,
  NarrativeProtocolWarningV6,
  NarrativeScriptV6,
} from './NarrativeEditorialV6';
import {
  buildFinalNarrativeIssueStateV8,
  planNarrativeRepairsV8,
} from './NarrativeEditorialIssuePolicyV8';

function makeScript(stopId: string, sentences: string[]): NarrativeScriptV6 {
  const sentenceRecords = sentences.map((text, index) => ({
    sentenceId: `${stopId}-S${String(index + 1).padStart(3, '0')}`,
    stopId,
    index,
    text,
  }));
  const text = sentences.join(' ');
  return {
    stopId,
    text,
    sentences: sentenceRecords,
    fingerprint: `fp-${stopId}`,
  };
}

function makeWarning(
  stopId: string,
  code: string,
  severity: 'hard' | 'soft',
  sentenceId?: string,
  fingerprint?: string
): NarrativeProtocolWarningV6 {
  return {
    warningId: `${stopId}:${code}${sentenceId ? `:${sentenceId}` : ''}`,
    stopId,
    code: code as NarrativeProtocolWarningV6['code'],
    severity,
    message: `warning ${code}`,
    ...(sentenceId ? { sentenceId } : {}),
    ...(fingerprint ? { scriptFingerprint: fingerprint } : {}),
  };
}

function makeObjection(
  stopId: string,
  sentenceId: string,
  classification: 'unsupported' | 'distorted' | 'unclear',
  reason: string,
  prefix = 'auditor'
): NarrativeAuditObjectionV6 {
  return {
    objectionId: `${prefix}:${sentenceId}:${classification}`,
    auditor: 'deepseek',
    sentenceId,
    classification,
    reason,
    propositionIds: [],
  };
}

function makeAdjudication(
  objectionId: string,
  decision: 'accepted' | 'rejected',
  reason: string
): NarrativeAdjudicationV6 {
  return { objectionId, decision, reason };
}

describe('planNarrativeRepairsV8', () => {
  it('combines deterministic hard warnings and accepted factual objections into one plan per stop', () => {
    const stopId = 'stop-a';
    const script = makeScript(stopId, ['Sentence one.', 'Sentence two.']);
    const warnings = [
      makeWarning(stopId, 'unauthorized_name', 'hard', `${stopId}-S001`, script.fingerprint),
      makeWarning(stopId, 'duration_outlier', 'soft', undefined, script.fingerprint),
    ];
    const objections = [
      makeObjection(stopId, `${stopId}-S002`, 'unsupported', 'factual issue'),
    ];
    const adjudications = [
      makeAdjudication(objections[0].objectionId, 'accepted', 'accepted factual'),
    ];

    const plans = planNarrativeRepairsV8(
      [stopId],
      [{ stopId, script, warnings, objections, adjudications }],
      undefined,
      1
    );

    expect(plans).toHaveLength(1);
    expect(plans[0].stopId).toBe(stopId);
    expect(plans[0].sentenceIds).toEqual([`${stopId}-S001`, `${stopId}-S002`]);
    expect(plans[0].objections).toHaveLength(2);
    expect(plans[0].objections[0].objectionId).toBe(`deterministic:${stopId}:unauthorized_name:${stopId}-S001`);
    expect(plans[0].objections[1].objectionId).toBe(objections[0].objectionId);
    expect(plans[0].adjudications).toHaveLength(2);
    expect(plans[0].sourceIssueIds).toEqual([
      objections[0].objectionId,
      `${stopId}:unauthorized_name:${stopId}-S001`,
    ]);
  });

  it('excludes soft deterministic warnings from repair plans', () => {
    const stopId = 'stop-b';
    const script = makeScript(stopId, ['Only soft.']);
    const warnings = [
      makeWarning(stopId, 'duration_outlier', 'soft', undefined, script.fingerprint),
    ];
    const plans = planNarrativeRepairsV8(
      [stopId],
      [{ stopId, script, warnings, objections: [], adjudications: [] }],
      undefined,
      1
    );
    expect(plans).toHaveLength(0);
  });

  it('respects route ordering and maximumRepairCalls', () => {
    const stopA = 'stop-a';
    const stopB = 'stop-b';
    const scriptA = makeScript(stopA, ['A one.']);
    const scriptB = makeScript(stopB, ['B one.']);
    const warningsA = [makeWarning(stopA, 'unauthorized_name', 'hard', `${stopA}-S001`, scriptA.fingerprint)];
    const warningsB = [makeWarning(stopB, 'unauthorized_name', 'hard', `${stopB}-S001`, scriptB.fingerprint)];

    const plans = planNarrativeRepairsV8(
      [stopB, stopA],
      [
        { stopId: stopA, script: scriptA, warnings: warningsA, objections: [], adjudications: [] },
        { stopId: stopB, script: scriptB, warnings: warningsB, objections: [], adjudications: [] },
      ],
      undefined,
      1
    );

    expect(plans).toHaveLength(1);
    expect(plans[0].stopId).toBe(stopB);
  });

  it('never includes more than one plan per stop', () => {
    const stopId = 'stop-c';
    const script = makeScript(stopId, ['C one.', 'C two.']);
    const warnings = [
      makeWarning(stopId, 'unauthorized_name', 'hard', `${stopId}-S001`, script.fingerprint),
      makeWarning(stopId, 'unauthorized_number', 'hard', `${stopId}-S002`, script.fingerprint),
    ];
    const plans = planNarrativeRepairsV8(
      [stopId],
      [{ stopId, script, warnings, objections: [], adjudications: [] }],
      undefined,
      10
    );
    expect(plans).toHaveLength(1);
    expect(plans[0].sentenceIds).toEqual([`${stopId}-S001`, `${stopId}-S002`]);
  });

  it('respects allowedStopIds', () => {
    const stopA = 'stop-a';
    const stopB = 'stop-b';
    const scriptA = makeScript(stopA, ['A one.']);
    const scriptB = makeScript(stopB, ['B one.']);
    const warningsA = [makeWarning(stopA, 'unauthorized_name', 'hard', `${stopA}-S001`, scriptA.fingerprint)];
    const warningsB = [makeWarning(stopB, 'unauthorized_name', 'hard', `${stopB}-S001`, scriptB.fingerprint)];

    const plans = planNarrativeRepairsV8(
      [stopA, stopB],
      [
        { stopId: stopA, script: scriptA, warnings: warningsA, objections: [], adjudications: [] },
        { stopId: stopB, script: scriptB, warnings: warningsB, objections: [], adjudications: [] },
      ],
      [stopB],
      10
    );

    expect(plans).toHaveLength(1);
    expect(plans[0].stopId).toBe(stopB);
  });
});

describe('buildFinalNarrativeIssueStateV8', () => {
  it('includes only hard deterministic warnings in openIssueIds and retains soft as observation', () => {
    const stopId = 'stop-a';
    const script = makeScript(stopId, ['One.', 'Two.']);
    const warnings = [
      makeWarning(stopId, 'unauthorized_name', 'hard', `${stopId}-S001`, script.fingerprint),
      makeWarning(stopId, 'duration_outlier', 'soft', undefined, script.fingerprint),
    ];
    const state = buildFinalNarrativeIssueStateV8(
      warnings,
      [],
      [],
      [script],
      { progressionWorks: true, promiseDelivered: true, closingWorks: true, tourFingerprint: 'tour-fp' }
    );

    expect(state.openIssueIds).toEqual([`${stopId}:unauthorized_name:${stopId}-S001`]);
    const softIssue = state.issues.find((issue) => issue.issueId === `${stopId}:duration_outlier`);
    expect(softIssue?.state).toBe('observation');
    expect(state.summary.hardWarnings).toBe(1);
    expect(state.summary.softWarnings).toBe(1);
    expect(state.summary.totalOpen).toBe(1);
  });

  it('canonicalizes tour issue IDs with tour: prefix', () => {
    const stopId = 'stop-a';
    const script = makeScript(stopId, ['One.']);
    const tourObjection = makeObjection(stopId, `${stopId}-S001`, 'distorted', 'tour issue');
    const state = buildFinalNarrativeIssueStateV8(
      [],
      [],
      [tourObjection],
      [script],
      { progressionWorks: true, promiseDelivered: true, closingWorks: true, tourFingerprint: 'tour-fp' }
    );

    const tourIssue = state.issues.find((issue) => issue.source === 'tour');
    expect(tourIssue?.issueId).toBe(`tour:${tourObjection.objectionId}`);
    expect(tourIssue?.state).toBe('open');
    expect(state.summary.acceptedTour).toBe(1);
  });

  it('binds every issue to the matching final script fingerprint', () => {
    const stopId = 'stop-a';
    const script = makeScript(stopId, ['One.']);
    const warnings = [
      makeWarning(stopId, 'unauthorized_name', 'hard', `${stopId}-S001`, script.fingerprint),
    ];
    const state = buildFinalNarrativeIssueStateV8(
      warnings,
      [],
      [],
      [script],
      { progressionWorks: true, promiseDelivered: true, closingWorks: true, tourFingerprint: 'tour-fp' }
    );

    for (const issue of state.issues) {
      expect(issue.scriptFingerprint).toBe(script.fingerprint);
    }
  });

  it('rejects unknown stop IDs', () => {
    const script = makeScript('stop-a', ['One.']);
    const warnings = [
      makeWarning('stop-unknown', 'unauthorized_name', 'hard', 'stop-unknown-S001', 'fp-unknown'),
    ];
    expect(() => buildFinalNarrativeIssueStateV8(
      warnings,
      [],
      [],
      [script],
      { progressionWorks: true, promiseDelivered: true, closingWorks: true, tourFingerprint: 'tour-fp' }
    )).toThrow('unknown stop stop-unknown');
  });

  it('rejects missing fingerprint data', () => {
    const stopId = 'stop-a';
    const script = makeScript(stopId, ['One.']);
    const warnings = [
      makeWarning(stopId, 'unauthorized_name', 'hard', `${stopId}-S001`, undefined),
    ];
    expect(() => buildFinalNarrativeIssueStateV8(
      warnings,
      [],
      [],
      [script],
      { progressionWorks: true, promiseDelivered: true, closingWorks: true, tourFingerprint: 'tour-fp' }
    )).toThrow('missing scriptFingerprint');
  });

  it('removes obsolete earlier issues by deriving only from latest audited state', () => {
    const stopId = 'stop-a';
    const script = makeScript(stopId, ['One.']);
    const warnings = [
      makeWarning(stopId, 'unauthorized_name', 'hard', `${stopId}-S001`, script.fingerprint),
    ];
    const state = buildFinalNarrativeIssueStateV8(
      warnings,
      [],
      [],
      [script],
      { progressionWorks: true, promiseDelivered: true, closingWorks: true, tourFingerprint: 'tour-fp' }
    );
    expect(state.openIssueIds).toHaveLength(1);
    expect(state.openIssueIds[0]).toBe(`${stopId}:unauthorized_name:${stopId}-S001`);
  });

  it('produces correct summary counts including byStop', () => {
    const stopA = 'stop-a';
    const stopB = 'stop-b';
    const scriptA = makeScript(stopA, ['A one.']);
    const scriptB = makeScript(stopB, ['B one.']);
    const warnings = [
      makeWarning(stopA, 'unauthorized_name', 'hard', `${stopA}-S001`, scriptA.fingerprint),
      makeWarning(stopB, 'duration_outlier', 'soft', undefined, scriptB.fingerprint),
    ];
    const factualObjection = makeObjection(stopA, `${stopA}-S001`, 'unsupported', 'factual');
    const tourObjection = makeObjection(stopB, `${stopB}-S001`, 'distorted', 'tour');

    const state = buildFinalNarrativeIssueStateV8(
      warnings,
      [factualObjection],
      [tourObjection],
      [scriptA, scriptB],
      { progressionWorks: false, promiseDelivered: true, closingWorks: true, tourFingerprint: 'tour-fp' }
    );

    expect(state.summary.totalOpen).toBe(4);
    expect(state.summary.hardWarnings).toBe(1);
    expect(state.summary.softWarnings).toBe(1);
    expect(state.summary.acceptedFactual).toBe(1);
    expect(state.summary.acceptedTour).toBe(1);
    expect(state.summary.byStop).toEqual({
      [stopA]: 2,
      [stopB]: 2,
    });
  });

  it('uses exact sentence identity for factual issue attribution when stopId contains -S', () => {
    const stopId = 'malaga-S-sector';
    const script = makeScript(stopId, ['First sentence.', 'Second sentence.']);
    const factualObjection = makeObjection(stopId, `${stopId}-S001`, 'unsupported', 'factual issue');

    const state = buildFinalNarrativeIssueStateV8(
      [],
      [factualObjection],
      [],
      [script],
      { progressionWorks: true, promiseDelivered: true, closingWorks: true, tourFingerprint: 'tour-fp' }
    );

    const factualIssue = state.issues.find((issue) => issue.source === 'factual');
    expect(factualIssue?.stopId).toBe('malaga-S-sector');
    expect(factualIssue?.scriptFingerprint).toBe(script.fingerprint);
  });
});
