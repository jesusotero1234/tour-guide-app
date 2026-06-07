export interface SaveAudioResult {
  storagePath: string;
  audioUrl: string;
}

export interface AudioStorage {
  save(
    placeId: string,
    language: string,
    format: string,
    audioData: string
  ): Promise<SaveAudioResult>;
}
