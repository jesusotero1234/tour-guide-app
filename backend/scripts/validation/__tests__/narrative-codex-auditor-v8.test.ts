import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { requestCodexAuditV8 } from '../narrative-codex-auditor-v8';
import { buildCodexArgs, CodexOutput } from '../narrative-codex-author-v8';

const events = (text: string) => [
  { type: 'item.completed', item: { type: 'agent_message', text } },
  { type: 'turn.completed', usage: { input_tokens: 8, output_tokens: 3 } },
].map(e => JSON.stringify(e)).join('\n');
const config = () => ({
  callId: 'test', input: { evidence: 'A supported claim.' }, systemPrompt: 'Verify evidence.',
  signal: new AbortController().signal,
  schema: { type: 'object', additionalProperties: false, required: ['ok'], properties: { ok: { type: 'boolean' } } },
  validate: (value: unknown) => value as { ok: boolean },
});
test('Astra low audit is one isolated quota call with full schema and cleanup', async () => {
  const c = config();
  let temporary = '';
  const run = jest.fn(async (prompt, directory, env, options): Promise<CodexOutput> => {
    temporary = directory;
    expect(prompt).toContain(c.systemPrompt);
    expect(prompt).toContain(JSON.stringify(c.input));
    expect(options).toMatchObject({ signal: c.signal, timeoutMs: 180000 });
    expect(JSON.parse(readFileSync(join(directory, 'schema.json'), 'utf8'))).toEqual(c.schema);
    expect(statSync(join(directory, 'schema.json')).mode & 0o777).toBe(0o600);
    expect(statSync(directory).mode & 0o077).toBe(0);
    expect(env.OPENROUTER_API_KEY).toBeUndefined();
    return { exitCode: 0, stderr: '', stdout: events('{"ok":true}') };
  });
  const result = await requestCodexAuditV8(c, { run });
  expect(result).toMatchObject({ status: 'valid', value: { ok: true }, model: 'gpt-6-astra',
    reasoning: 'low', transport: 'codex_cli', billing: 'ChatGPT quota', apiSpendUsd: 0,
    quotaUsage: { input_tokens: 8, output_tokens: 3 }, rawOutput: '{"ok":true}' });
  expect(result.attempts).toHaveLength(1);
  expect(run).toHaveBeenCalledTimes(1);
  expect(existsSync(temporary)).toBe(false);
  const args = buildCodexArgs('unused');
  expect(args).toEqual(expect.arrayContaining(['gpt-6-astra', 'model_reasoning_effort="low"',
    'forced_login_method="chatgpt"', '--ephemeral', 'read-only', '--ignore-user-config']));
});
test.each([
  ['invalid JSON', events('not json'), 0],
  ['schema failure', events('{"ok":"yes"}'), 0],
  ['tool use', JSON.stringify({ type: 'item.completed', item: { type: 'command_execution' } }), 0],
  ['process failure', '', 1],
] as const)('%s fails without retries and cleans temporary input', async (_label, stdout, exitCode) => {
  let temporary = '';
  const run = jest.fn(async (_prompt, directory): Promise<CodexOutput> => {
    temporary = directory; return { stdout, exitCode, stderr: 'private stderr' };
  });
  await expect(requestCodexAuditV8(config(), { run })).rejects.toThrow('Codex auditor');
  expect(run).toHaveBeenCalledTimes(1);
  expect(existsSync(temporary)).toBe(false);
});
test('semantic rejection is not accepted or retried', async () => {
  const run = jest.fn(async (): Promise<CodexOutput> => ({ stdout: events('{"ok":true}'), exitCode: 0, stderr: '' }));
  await expect(requestCodexAuditV8({ ...config(), validate: () => { throw new Error('invalid citation'); } }, { run })).rejects.toThrow('invalid citation');
  expect(run).toHaveBeenCalledTimes(1);
});
test('pre-aborted audit does not start a process', async () => {
  const controller = new AbortController(); controller.abort();
  const run = jest.fn();
  await expect(requestCodexAuditV8({ ...config(), signal: controller.signal }, { run })).rejects.toThrow();
  expect(run).not.toHaveBeenCalled();
});
