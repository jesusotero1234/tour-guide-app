export interface PlaceSourcePoiMetadata {
  osmType?: 'node' | 'way' | 'relation';
  osmId?: number;
  wikidata?: string;
  wikipedia?: string;
  osmName?: string;
  localName?: string;
  category?: string;
  landmarkTier?: string;
  fameScore?: number;
  osmTags?: Record<string, string>;
}

export interface PlaceMetadata {
  sourcePoi?: PlaceSourcePoiMetadata;
  narrationMeta?: Record<string, unknown>;
  localizedFromPlaceId?: string;
  localizedFromTourId?: string;
  localizedFromLanguage?: string;
  descriptionSections?: Record<string, string>;
  nameInTourLanguage?: string;
}

export interface Place {
  id: string;
  tourId: string;
  name: string;
  nameInTourLanguage?: string;
  description: string;
  descriptionSections?: Record<string, string>;
  latitude: number;
  longitude: number;
  position: number;
  importanceScore?: number;
  imageUrl?: string;
  audioUrl?: string;
  metadata?: PlaceMetadata;
  createdAt?: string;
  updatedAt?: string;
}
