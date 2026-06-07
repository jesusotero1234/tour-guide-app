import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import { env } from '../config/env';
import logger from './logger';
import { AudioFormat } from '../types/api';

interface CacheMetadata {
  duration: number;
  format: AudioFormat;
  voice: string;
  text: string;
  language: string;
  createdAt: Date;
}

class CacheService {
  private cacheDir: string;

  constructor() {
    this.cacheDir = env.audioCache;
    fs.ensureDirSync(this.cacheDir);
  }

  generateKey(text: string, voice: string, language: string): string {
    const hash = crypto.createHash('sha256');
    hash.update(`${text}-${voice}-${language}`);
    return hash.digest('hex');
  }

  getFilePaths(key: string, format: AudioFormat) {
    return {
      audioPath: path.join(this.cacheDir, `${key}.${format}`),
      metaPath: path.join(this.cacheDir, `${key}.json`)
    };
  }

  exists(key: string, format: AudioFormat): boolean {
    const { audioPath, metaPath } = this.getFilePaths(key, format);
    return fs.existsSync(audioPath) && fs.existsSync(metaPath);
  }

  getAudioUrl(key: string, format: AudioFormat): string {
    return `/audio/${key}.${format}`;
  }

  getMetadata(key: string): CacheMetadata | null {
    try {
      const { metaPath } = this.getFilePaths(key, 'wav');
      if (!fs.existsSync(metaPath)) return null;

      const data = fs.readJsonSync(metaPath);
      return {
        ...data,
        createdAt: new Date(data.createdAt)
      };
    } catch (error) {
      logger.error('Failed to read cache metadata', { error, key });
      return null;
    }
  }

  saveMetadata(key: string, metadata: Omit<CacheMetadata, 'createdAt'>): void {
    try {
      const { metaPath } = this.getFilePaths(key, metadata.format);
      fs.writeJsonSync(metaPath, {
        ...metadata,
        createdAt: new Date()
      });
    } catch (error) {
      logger.error('Failed to save cache metadata', { error, key });
    }
  }

  async cleanup(maxAge: number = env.cacheDuration): Promise<number> {
    try {
      const now = Date.now();
      const files = await fs.readdir(this.cacheDir);
      let removed = 0;

      for (const file of files) {
        const filePath = path.join(this.cacheDir, file);
        const stats = await fs.stat(filePath);

        // Remove files older than maxAge
        if (now - stats.mtimeMs > maxAge * 1000) {
          await fs.remove(filePath);
          removed++;
        }
      }

      logger.info(`Cache cleanup complete`, { filesRemoved: removed });
      return removed;
    } catch (error) {
      logger.error('Cache cleanup failed', { error });
      throw error;
    }
  }

  async getStats() {
    try {
      const files = await fs.readdir(this.cacheDir);
      let totalSize = 0;
      let oldestTime = Date.now();
      let newestTime = 0;
      let oldestFile = '';
      let newestFile = '';

      for (const file of files) {
        const filePath = path.join(this.cacheDir, file);
        const stats = await fs.stat(filePath);
        
        totalSize += stats.size;
        
        if (stats.mtimeMs < oldestTime) {
          oldestTime = stats.mtimeMs;
          oldestFile = file;
        }
        
        if (stats.mtimeMs > newestTime) {
          newestTime = stats.mtimeMs;
          newestFile = file;
        }
      }

      return {
        totalFiles: files.length,
        totalSize,
        oldestFile,
        newestFile
      };
    } catch (error) {
      logger.error('Failed to get cache stats', { error });
      throw error;
    }
  }
}

// Export singleton instance
export const cacheService = new CacheService();
