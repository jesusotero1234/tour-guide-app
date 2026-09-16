import { createHash } from 'crypto';
import { readFile, stat } from 'fs/promises';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';

export const audioHash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export type AudioRecord = { storagePath: string; language: string; metadata: unknown };
export async function verifiedAudio(record: AudioRecord | null, storageDir: string,
  expected: { language: string; rendererKey: string; sourceHash: string }): Promise<boolean> {
  if (!record || record.language !== expected.language ||
    !/^voxcpm2\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.mp3$/.test(record.storagePath)) return false;
  const metadata = record.metadata as Record<string, unknown>;
  if (metadata?.rendererKey !== expected.rendererKey || metadata?.sourceHash !== expected.sourceHash) return false;
  try {
    const path = join(storageDir, record.storagePath);
    const info = await stat(path);
    return info.isFile() && info.size > 0 && metadata.fileSha256 === audioHash(await readFile(path));
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
