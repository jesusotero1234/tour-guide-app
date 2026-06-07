import 'dotenv/config';

interface Config {
  port: string | number;
  env: string;
  osmApiUrl: string;
  llmPodUrl: string;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  osmRequestDelay: number;
}

export const env: Config = {
  port: process.env.PORT || 3003,
  env: process.env.NODE_ENV || 'development',
  osmApiUrl: process.env.OSM_API_URL || 'https://nominatim.openstreetmap.org',
  llmPodUrl: process.env.LLM_POD_URL || 'http://localhost:3002',
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '60'),
  osmRequestDelay: parseInt(process.env.OSM_REQUEST_DELAY || '1000')
};
