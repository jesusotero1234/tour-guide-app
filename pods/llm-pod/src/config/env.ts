import dotenv from 'dotenv';

dotenv.config();

export const env = {
  port: process.env.PORT || 3002,
  env: process.env.NODE_ENV || 'development',
  ollamaHost: process.env.OLLAMA_HOST || 'http://localhost:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'gemma4:26b',
  narrativeModel: process.env.NARRATIVE_MODEL || 'llama3.1:8b',
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
  rateLimitMaxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100
};
