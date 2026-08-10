import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { AutonomousNarrativeArtifactV5 } from './AutonomousNarrativeV5';
import {
  buildNarrativeDiagnosticBundleV5,
  writeNarrativeDiagnosticBundleV5,
} from './NarrativeDiagnosticsV5';

describe('NarrativeDiagnosticsV5', () => {
  it('keeps candidate text, concrete errors, and fingerprints in a private bundle', () => {
    const artifact = {
      variant: 'on_site',
      status: 'rejected',
      failure: { code: 'content_rejected', message: 'scripts[2] contiene Aurelio Valdés' },
      text: null,
      evidenceFingerprint: 'a'.repeat(64),
      planFingerprint: 'b'.repeat(64),
      grounding: {
        callId: 'grounding', status: 'valid', model: 'critic',
        promptFingerprint: 'c'.repeat(64), responseFingerprint: 'd'.repeat(64),
        input: {}, rawOutput: '{"grounding":true}', value: {},
        attempts: [{
          attempt: 1, status: 'valid', latencyMs: 1,
          rawOutput: '{"grounding":true}', error: null,
        }],
      },
      proseAttempts: [{
        callId: 'prose', status: 'semantic_error', model: 'writer',
        promptFingerprint: 'e'.repeat(64), responseFingerprint: 'f'.repeat(64),
        input: { writerPacket: 'private evidence packet' },
        rawOutput: '{"introduction":"texto real"}', value: null,
        attempts: [{
          attempt: 1, status: 'semantic_error', latencyMs: 2,
          rawOutput: '{"introduction":"texto real"}',
          error: 'scripts[2] contains unknown proper noun: Aurelio Valdés',
        }],
      }],
      finalCritiques: [],
    } as unknown as AutonomousNarrativeArtifactV5;
    const bundle = buildNarrativeDiagnosticBundleV5(
      'preflight', [artifact], '2026-08-10T12:00:00.000Z'
    );
    const path = join(mkdtempSync(join(tmpdir(), 'narrative-v5-diagnostic-')), 'bundle.json');

    writeNarrativeDiagnosticBundleV5(path, bundle);

    const serialized = readFileSync(path, 'utf8');
    expect(serialized).toContain('texto real');
    expect(serialized).toContain('Aurelio Valdés');
    expect(serialized).toContain('private evidence packet');
    expect(bundle.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
});
