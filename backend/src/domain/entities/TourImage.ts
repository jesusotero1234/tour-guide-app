/** Paragraph-bound, attributed images. Bare legacy imageUrl values are not verified. */
export interface TourImage {
  id: string;
  role: 'primary' | 'detail';
  paragraphId: string;
  paragraphIndex: number;
  paragraphText: string;
  caption: string;
  alt: string;
  url: string;
  sourceUrl: string;
  sourceTitle: string;
  author: string;
  license: string;
  licenseUrl: string;
  attribution: string;
  changes: string;
  width: number;
  height: number;
  entityId: string;
  identityEvidence: 'wikidata-p18' | 'commons-depicts';
  verifiedAt: string;
  visualReason: string;
}

export interface TourImageSet {
  version: 1;
  sourceText: string;
  status: 'ready' | 'unavailable' | 'disabled';
  reason?: string;
  images: TourImage[];
}

export interface TourImageCandidate {
  id: string;
  entityId: string;
  identityEvidence: TourImage['identityEvidence'];
  title: string;
  description: string;
  url: string;
  sourceUrl: string;
  author: string;
  license: string;
  licenseUrl: string;
  attribution: string;
  width: number;
  height: number;
}
