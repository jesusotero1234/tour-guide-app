import { WikidataBatchEnrichment } from '../../infrastructure/enrichment/WikidataEnricher';
import { WikipediaEnrichment } from '../../infrastructure/enrichment/WikipediaEnricher';

export interface PoiEnrichmentCache {
  readonly isCompleteSnapshot?: boolean;
  getWikidata(wikidataId: string, language: string): Promise<WikidataBatchEnrichment | null>;
  setWikidata(wikidataId: string, language: string, payload: WikidataBatchEnrichment): Promise<void>;
  getWikipedia(osmWikipediaTag: string, language: string): Promise<WikipediaEnrichment | null>;
  setWikipedia(osmWikipediaTag: string, language: string, payload: WikipediaEnrichment): Promise<void>;
}
