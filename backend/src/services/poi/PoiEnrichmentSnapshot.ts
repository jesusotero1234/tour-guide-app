import { WikidataBatchEnrichment } from '../../infrastructure/enrichment/WikidataEnricher';
import { WikipediaEnrichment } from '../../infrastructure/enrichment/WikipediaEnricher';
import { PoiEnrichmentCache } from './PoiEnrichmentCache';

export interface PoiEnrichmentSnapshot {
  schemaVersion: 1;
  city: string;
  theme: string;
  language: string;
  capturedAt: string;
  wikidata: Record<string, WikidataBatchEnrichment>;
  wikipedia: Record<string, WikipediaEnrichment>;
}

export class SnapshotPoiEnrichmentCache implements PoiEnrichmentCache {
  readonly isCompleteSnapshot = true;

  constructor(private readonly snapshot: PoiEnrichmentSnapshot) {}

  async getWikidata(wikidataId: string, language: string): Promise<WikidataBatchEnrichment | null> {
    return language === this.snapshot.language ? this.snapshot.wikidata[wikidataId] ?? null : null;
  }

  async setWikidata(wikidataId: string, language: string, payload: WikidataBatchEnrichment): Promise<void> {
    if (language === this.snapshot.language) {
      this.snapshot.wikidata[wikidataId] = payload;
    }
  }

  async getWikipedia(osmWikipediaTag: string, language: string): Promise<WikipediaEnrichment | null> {
    return language === this.snapshot.language ? this.snapshot.wikipedia[osmWikipediaTag] ?? null : null;
  }

  async setWikipedia(osmWikipediaTag: string, language: string, payload: WikipediaEnrichment): Promise<void> {
    if (language === this.snapshot.language) {
      this.snapshot.wikipedia[osmWikipediaTag] = payload;
    }
  }
}

export class RecordingPoiEnrichmentCache implements PoiEnrichmentCache {
  private readonly snapshotCache: SnapshotPoiEnrichmentCache;

  constructor(
    private readonly inner: PoiEnrichmentCache,
    private readonly snapshot: PoiEnrichmentSnapshot
  ) {
    this.snapshotCache = new SnapshotPoiEnrichmentCache(snapshot);
  }

  async getWikidata(wikidataId: string, language: string): Promise<WikidataBatchEnrichment | null> {
    const payload = await this.inner.getWikidata(wikidataId, language);
    if (payload) await this.snapshotCache.setWikidata(wikidataId, language, payload);
    return payload;
  }

  async setWikidata(wikidataId: string, language: string, payload: WikidataBatchEnrichment): Promise<void> {
    await this.inner.setWikidata(wikidataId, language, payload);
    await this.snapshotCache.setWikidata(wikidataId, language, payload);
  }

  async getWikipedia(osmWikipediaTag: string, language: string): Promise<WikipediaEnrichment | null> {
    const payload = await this.inner.getWikipedia(osmWikipediaTag, language);
    if (payload) await this.snapshotCache.setWikipedia(osmWikipediaTag, language, payload);
    return payload;
  }

  async setWikipedia(osmWikipediaTag: string, language: string, payload: WikipediaEnrichment): Promise<void> {
    await this.inner.setWikipedia(osmWikipediaTag, language, payload);
    await this.snapshotCache.setWikipedia(osmWikipediaTag, language, payload);
  }

  toSnapshot(): PoiEnrichmentSnapshot {
    return this.snapshot;
  }
}

export function createEmptyPoiEnrichmentSnapshot(input: {
  city: string;
  theme: string;
  language: string;
  capturedAt?: string;
}): PoiEnrichmentSnapshot {
  return {
    schemaVersion: 1,
    city: input.city,
    theme: input.theme,
    language: input.language,
    capturedAt: input.capturedAt ?? new Date().toISOString(),
    wikidata: {},
    wikipedia: {},
  };
}
