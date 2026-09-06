import { EventEmitter } from 'node:events';
import childProcess = require('node:child_process');
import fs = require('node:fs/promises');
import { runCodexTour } from './CodexTourGenerator';
import { TourRequest } from '../types/api';

const request: TourRequest = { city: 'City; echo forbidden', country: 'Spain', countryCode: 'ES', theme: 'history', language: 'es', durationMinutes: 60 };
const tick = async () => { for (let index = 0; index < 15; index++) await Promise.resolve(); };

describe('isolated Codex worker protocol', () => {
  let child: EventEmitter & { kill: jest.Mock }, spawned: jest.SpyInstance;
  beforeEach(() => {
    jest.useFakeTimers();
    child = Object.assign(new EventEmitter(), { kill: jest.fn(() => { child.emit('close', null); return true; }) });
    spawned = jest.spyOn(childProcess, 'spawn').mockReturnValue(child as any);
    jest.spyOn(fs, 'access').mockResolvedValue(undefined);
    jest.spyOn(fs, 'stat').mockResolvedValue({ size: 10 } as any);
    jest.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify({ stops: [{ status: 'audited' }], missingStopIds: [] }));
  });
  afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });
  it('passes request through argv with shell disabled and returns parsed artifacts', async () => {
    const pending = runCodexTour(request, 'app-test', undefined);
    await tick();
    const [executable, args, options] = spawned.mock.calls[0];
    expect(executable).toBe(process.execPath);
    expect(args).toContain('--writer-transport=codex');
    expect(args).toContain('--city=City; echo forbidden');
    expect(args).toContain('--prior-spend-usd=0');
    expect(options.shell).toBe(false);
    child.emit('close', 0);
    expect(await pending).toHaveProperty('author');
    expect(jest.getTimerCount()).toBe(0);
  });
  it('reports worker failure without exposing stderr or provider keys', async () => {
    const pending = runCodexTour(request, 'app-test', undefined);
    const assertion = expect(pending).rejects.toThrow('Codex generation did not finish');
    await tick(); child.emit('close', 1); await assertion;
    expect(jest.getTimerCount()).toBe(0);
  });
  it('terminates on lease cancellation', async () => {
    const controller = new AbortController();
    const pending = runCodexTour(request, 'app-test', undefined, controller.signal);
    const assertion = expect(pending).rejects.toThrow('Generation cancelled');
    await tick(); controller.abort(); await assertion;
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });
  it('terminates when progress persistence fails', async () => {
    const progress = jest.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('lease lost'));
    const pending = runCodexTour(request, 'app-test', progress);
    const assertion = expect(pending).rejects.toThrow('Generation progress could not be persisted');
    await tick(); await jest.advanceTimersByTimeAsync(2000); await assertion;
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });
  it('enforces an overall deadline', async () => {
    const pending = runCodexTour(request, 'app-test', undefined);
    const assertion = expect(pending).rejects.toThrow('Generation deadline exceeded');
    await tick(); await jest.advanceTimersByTimeAsync(31 * 60 * 1000); await assertion;
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });
});
