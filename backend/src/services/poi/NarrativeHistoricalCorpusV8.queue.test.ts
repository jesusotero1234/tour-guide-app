import { retrieveNarrativeHistoricalCorpusV8 } from './NarrativeHistoricalCorpusV8';
const input = { stopId: 'Q1', stopName: 'Castillo', cityQid: 'Q2', cityName: 'Ciudad', language: 'es', aliases: [] };
const response = { indexVersion: 'sha256:' + 'a'.repeat(64), hits: [null] };

describe('RAG client queue', () => {
  it('serializes requests by origin without spending execution time waiting in the server', async () => {
    let active = 0, maximum = 0;
    const post = async () => {
      maximum = Math.max(maximum, ++active);
      await new Promise(resolve => setTimeout(resolve, 15));
      active -= 1;
      return response;
    };
    const results = await Promise.all([retrieveNarrativeHistoricalCorpusV8(input, { post }), retrieveNarrativeHistoricalCorpusV8(input, { post })]);
    expect(maximum).toBe(1);
    expect(results[1].queueWaitMs).toBeGreaterThan(0);
    expect(results.every(r => r.error === null)).toBe(true);
  });
  it('cancels a queued request before dispatch and releases its place without bypassing the active request', async () => {
    let release!: () => void, entered!: () => void;
    const enteredPromise = new Promise<void>(resolve => { entered = resolve; });
    const post = jest.fn(async () => {
      entered();
      await new Promise<void>(resolve => { release = resolve; });
      return response;
    });
    const first = retrieveNarrativeHistoricalCorpusV8(input, { post });
    await enteredPromise;
    const controller = new AbortController();
    const second = retrieveNarrativeHistoricalCorpusV8(input, { post, signal: controller.signal });
    controller.abort(new Error('cancelled while queued'));
    try {
      await expect(second).rejects.toThrow('cancelled while queued');
      expect(post).toHaveBeenCalledTimes(1);
    } finally { release(); await first; }
    const third = await retrieveNarrativeHistoricalCorpusV8(input, { post: async () => response });
    expect(third.error).toBeNull();
  });
  it('releases the queue after a failed transport', async () => {
    const first = await retrieveNarrativeHistoricalCorpusV8(input, { post: async () => { throw new Error('network failed'); } });
    const second = await retrieveNarrativeHistoricalCorpusV8(input, { post: async () => response });
    expect(first.error).toBe('network failed');
    expect(second.error).toBeNull();
  });
});
