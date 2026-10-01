import * as fs from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { audioFileSha256, audioHash } from '../IntroductionAudio';

jest.mock('fs/promises', () => {
  const actual = jest.requireActual('fs/promises');
  return { ...actual, readFile: jest.fn(actual.readFile) };
});

describe('audio file identity cache', () => {
  it('rehashes only when the file changes on disk', async () => {
    const directory = await fs.mkdtemp(join(tmpdir(), 'audio-identity-'));
    const path = join(directory, 'stop.mp3');
    const reads = fs.readFile as jest.Mock;
    try {
      await fs.writeFile(path, 'first');
      expect(await audioFileSha256(path)).toBe(audioHash('first'));
      expect(await audioFileSha256(path)).toBe(audioHash('first'));
      expect(reads).toHaveBeenCalledTimes(1);

      await fs.writeFile(path, 'other');
      expect(await audioFileSha256(path)).toBe(audioHash('other'));
      await fs.writeFile(path, '');
      expect(await audioFileSha256(path)).toBeNull();
      await fs.rm(path);
      await expect(audioFileSha256(path)).rejects.toThrow();
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
});
