export type KokoroLanguage = 'en-us' | 'en-gb' | 'fr-fr' | 'it' | 'ja' | 'cmn';
export type AudioFormat = 'wav' | 'mp3';

export interface TTSRequest {
  text: string;
  language?: KokoroLanguage;
  voice?: string;
  speed?: number;
  format?: AudioFormat;
}

// Success response
export interface TTSResponse {
  success: true;
  audioUrl: string;    // Keeping for backwards compatibility
  audioData: string;   // Base64-encoded audio data
  format: AudioFormat;
}

// Error response
export interface TTSErrorResponse {
  success: false;
  error: string;
}
