import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

interface EnvVars {
  port: number;
  nodeEnv: string;
  logLevel: string;
  llmPodUrl: string;
  cacheTtl: number;
  maxCacheItems: number;
}

/**
 * Environment configuration for the description pod
 */
export const env: EnvVars = {
  port: parseInt(process.env.PORT || '3004', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  llmPodUrl: process.env.LLM_POD_URL || 'http://localhost:3002',
  cacheTtl: parseInt(process.env.CACHE_TTL || '3600', 10),
  maxCacheItems: parseInt(process.env.MAX_CACHE_ITEMS || '1000', 10),
};

/**
 * Check if the application is running in production mode
 */
export const isProduction = env.nodeEnv === 'production';

/**
 * Check if the application is running in development mode
 */
export const isDevelopment = env.nodeEnv === 'development';

/**
 * Check if the application is running in test mode
 */
export const isTest = env.nodeEnv === 'test';
