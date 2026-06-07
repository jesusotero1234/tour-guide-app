export interface AudioAsset {
  id: string;
  placeId: string;
  language: string;
  format: string;
  storagePath: string;
  audioUrl?: string;
  createdAt: string;
  updatedAt?: string;
}
