import { createHash } from 'crypto';
import { readFile, stat } from 'fs/promises';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';

export const audioHash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
// Rehash an audio file only when its identity on disk changes; rereading every MP3 per request
// kept the backend at its memory limit with page cache.
const verifiedFiles = new Map<string, { identity: string; sha256: string }>();
export async function audioFileSha256(path: string): Promise<string | null> {
  const info = await stat(path);
  if (!info.isFile() || info.size === 0) return null;
  const identity = [info.ino, info.size, info.mtimeMs, info.ctimeMs].join(':');
  const known = verifiedFiles.get(path);
  if (known?.identity === identity) return known.sha256;
  const sha256 = audioHash(await readFile(path));
  if (verifiedFiles.size >= 50000) verifiedFiles.clear();
  verifiedFiles.set(path, { identity, sha256 });
  return sha256;
}
export type AudioRecord = { storagePath: string; language: string; metadata: unknown };
export async function verifiedAudio(record: AudioRecord | null, storageDir: string,
  expected: { language: string; rendererKey: string; sourceHash: string }): Promise<boolean> {
  if (!record || record.language !== expected.language ||
    !/^voxcpm2\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.mp3$/.test(record.storagePath)) return false;
  const metadata = record.metadata as Record<string, unknown>;
  if (metadata?.rendererKey !== expected.rendererKey || metadata?.sourceHash !== expected.sourceHash) return false;
  try {
    return metadata.fileSha256 === await audioFileSha256(join(storageDir, record.storagePath));
  } catch { return false; }
}

export async function activeIntroduction(client: PrismaClient, storageDir: string, tour: {
  id: string; language: string; metadata: unknown;
}, expected: { rendererKey: string; sourceHash: string; firstId: string; firstHash: string }) {
  const id = (tour.metadata as Record<string, unknown>)?.introductionAudioId;
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const intro = await client.tourIntroductionAudio.findUnique({ where: { id } });
  if (!intro || intro.tourId !== tour.id || !await verifiedAudio(intro, storageDir, { ...expected, language: tour.language })) return null;
  const firstId = (intro.metadata as Record<string, unknown>).firstAudioAssetId;
  if (typeof firstId !== 'string' || !/^[0-9a-f-]{36}$/.test(firstId)) return null;
  const first = await client.audioAsset.findUnique({ where: { id: firstId } });
  if (!first || first.placeId !== expected.firstId || !await verifiedAudio(first, storageDir,
    { language: tour.language, rendererKey: expected.rendererKey, sourceHash: expected.firstHash })) return null;
  return intro;
}
