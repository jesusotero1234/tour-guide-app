import { PrismaClient } from '@prisma/client';

export interface CachedNarration {
  sections: Record<string, string>;
  narration: string;
}

interface NarrationCacheRow {
  sections: unknown;
  narration: string;
}

export class PostgresNarrationCacheRepository {
  constructor(
    private readonly client: PrismaClient,
    private readonly modelVersion = 'qwen3:4b-long-v3'
  ) {}

  async get(poiId: string, language: string, theme: string): Promise<CachedNarration | null> {
    const rows = await this.client.$queryRaw<NarrationCacheRow[]>`
      SELECT sections, narration
      FROM poi_narration_cache
      WHERE poi_id = ${poiId}
        AND language = ${language}
        AND theme = ${theme}
        AND model_version = ${this.modelVersion}
      LIMIT 1
    `;

    const row = rows[0];
    if (!row) {
      console.log(`[NarrationCache] miss for ${poiId}/${language}/${theme}`);
      return null;
    }

    console.log(`[NarrationCache] hit for ${poiId}/${language}/${theme}`);
    return {
      sections: row.sections as Record<string, string>,
      narration: row.narration,
    };
  }

  async set(
    poiId: string,
    language: string,
    theme: string,
    payload: CachedNarration
  ): Promise<void> {
    await this.client.$executeRaw`
      INSERT INTO poi_narration_cache (poi_id, language, theme, sections, narration, model_version, updated_at)
      VALUES (${poiId}, ${language}, ${theme}, ${payload.sections}, ${payload.narration}, ${this.modelVersion}, CURRENT_TIMESTAMP)
      ON CONFLICT (poi_id, language, theme) DO UPDATE SET
        sections = EXCLUDED.sections,
        narration = EXCLUDED.narration,
        model_version = EXCLUDED.model_version,
        updated_at = CURRENT_TIMESTAMP
    `;
    console.log(`[NarrationCache] write for ${poiId}/${language}/${theme}`);
  }
}
