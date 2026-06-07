import * as path from 'path';

interface Config {
  // Server settings
  port: number;
  nodeEnv: string;
  env: string;  // For logger compatibility
  
  // File paths
  modelsPath: string;
  audioCache: string;
  modelFile: string;
  voicesFile: string;
  
  // TTS settings
  defaultVoice: string;
  defaultLanguage: string;
  cacheDuration: number;
  
  // Rate limiting
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  
  // Validation
  maxTextLength: number;
  allowedFormats: readonly ['wav', 'mp3'];
  
  // Language support
  supportedLanguages: Record<string, string>;
}

export const env: Config = {
  // Server settings
  port: Number(process.env.PORT) || 3005,
  nodeEnv: process.env.NODE_ENV || 'development',
  env: process.env.NODE_ENV || 'development',
  
  // File paths
  modelsPath: process.env.MODELS_PATH || path.join(process.cwd(), 'models'),
  audioCache: process.env.AUDIO_CACHE || path.join(process.cwd(), 'cache'),
  modelFile: process.env.MODEL_FILE || 'kokoro-v1.0.onnx',
  voicesFile: process.env.VOICES_FILE || 'voices-v1.0.bin',
  
  // TTS settings
  defaultVoice: process.env.DEFAULT_VOICE || 'af_sarah',
  defaultLanguage: process.env.DEFAULT_LANGUAGE || 'en-us',
  cacheDuration: Number(process.env.CACHE_DURATION) || 3600,
  
  // Rate limiting
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW) || 60000,
  rateLimitMaxRequests: Number(process.env.RATE_LIMIT_MAX) || 30,
  
  // Validation
  maxTextLength: Number(process.env.MAX_TEXT_LENGTH) || 1000,
  allowedFormats: ['wav', 'mp3'] as const,
  
  // Language support
  supportedLanguages: {
    'en-us': 'en',
    'en-gb': 'en',
    'fr-fr': 'fr',
    'it': 'it',
    'ja': 'ja',
    'cmn': 'zh'
  }
};
