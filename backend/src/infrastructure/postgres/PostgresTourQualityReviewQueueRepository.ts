import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { TourConfidence } from '../../types/tourQuality';

export type TourQualityReviewQueueStatus = 'shadow_passed' | 'shadow_failed' | 'auto_approved' | 'auto_repaired' | 'rejected';

export interface CreateTourQualityReviewQueueEntryInput {
  city: string;
  countryCode?: string;
  theme: string;
  language: string;
  durationMinutes: number;
  qualityStatus: TourQualityReviewQueueStatus;
  confidence: TourConfidence;
  stopCount: number;
  requestFingerprint?: string;
}

export class PostgresTourQualityReviewQueueRepository {
  private initialized = false;
  private initializationPromise: Promise<void> | null = null;

  constructor(private readonly prisma: PrismaClient) {}

  private async ensureTable(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (this.initializationPromise) {
      await this.initializationPromise;
      return;
    }

    this.initializationPromise = (async () => {
      try {
        await this.prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS tour_quality_review_queue (
            id TEXT PRIMARY KEY,
            city TEXT NOT NULL,
            normalized_city TEXT NOT NULL,
            country_code TEXT,
            theme TEXT NOT NULL,
            language TEXT NOT NULL,
            duration_minutes INTEGER NOT NULL,
            quality_status TEXT NOT NULL,
            confidence_score DOUBLE PRECISION NOT NULL,
            confidence_stage TEXT NOT NULL,
            reasons JSONB NOT NULL,
            signals JSONB,
            stop_count INTEGER NOT NULL,
            request_fingerprint TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `);
      } finally {
        this.initialized = true;
        this.initializationPromise = null;
      }
    })();

    await this.initializationPromise;
  }

  private normalizeCity(city: string): string {
    return city.trim().toLowerCase();
  }

  async enqueue(input: CreateTourQualityReviewQueueEntryInput): Promise<void> {
    await this.ensureTable();

    await this.prisma.$executeRawUnsafe(
      `
        INSERT INTO tour_quality_review_queue (
          id,
          city,
          normalized_city,
          country_code,
          theme,
          language,
          duration_minutes,
          quality_status,
          confidence_score,
          confidence_stage,
          reasons,
          signals,
          stop_count,
          request_fingerprint,
          created_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11::jsonb,
          $12::jsonb,
          $13,
          $14,
          CURRENT_TIMESTAMP
        )
      `,
      randomUUID(),
      input.city,
      this.normalizeCity(input.city),
      input.countryCode || null,
      input.theme,
      input.language,
      input.durationMinutes,
      input.qualityStatus,
      input.confidence.score,
      input.confidence.stage,
      JSON.stringify(input.confidence.reasons),
      JSON.stringify(input.confidence.signals || null),
      input.stopCount,
      input.requestFingerprint || null,
    );
  }
}
