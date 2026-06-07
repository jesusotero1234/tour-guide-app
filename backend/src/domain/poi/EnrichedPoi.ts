import { RawPoi } from './RawPoi';

export interface PoiAttribution {
  wikipedia?: {
    url: string;
    language: string;
  };
  wikidata?: {
    url: string;
    id: string;
  };
}

export interface EnrichedPoi extends RawPoi {
  enriched: {
    nameTranslations: Record<string, string>;
    description: string | null;
    wikipediaLead: string | null;
    wikipediaBody: string | null;
    wikidataClaims: Record<string, string> | null;
    osmTags: Record<string, string>;
    wikivoyage: string | null;
    descriptionLanguage: string | null;
    attribution: PoiAttribution;
  };
}
