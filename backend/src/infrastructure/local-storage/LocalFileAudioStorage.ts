import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { AudioStorage, SaveAudioResult } from '../../domain/storage/AudioStorage';

export class LocalFileAudioStorage implements AudioStorage {
  private readonly storageDir: string;
  private readonly baseUrl: string;

  constructor(
    storageDir: string = process.env.AUDIO_STORAGE_PATH ?? './data/audio',
    baseUrl: string = process.env.AUDIO_BASE_URL ?? 'http://localhost:3001/audio/'
  ) {
    this.storageDir = storageDir;
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
  }

  async save(
    placeId: string,
    language: string,
    format: string,
    audioData: string
  ): Promise<SaveAudioResult> {
    const filename = `${placeId}-${language}.${format}`;
    const filePath = join(this.storageDir, filename);

    await mkdir(this.storageDir, { recursive: true });
    await writeFile(filePath, Buffer.from(audioData, 'base64'));

    return {
      storagePath: filename,
      audioUrl: this.baseUrl + filename
    };
  }
}
