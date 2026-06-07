import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config();

// Environment configuration with validation and defaults
interface EnvConfig {
  port: number;
  nodeEnv: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  storageBucket: string;
  logLevel: string;
  corsOrigin: string;
}

// Validate required environment variables
const requiredEnvVars: string[] = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
}

// Export configuration with defaults
export const config: EnvConfig = {
  port: parseInt(process.env.PORT || '3006', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  storageBucket: process.env.STORAGE_BUCKET || 'tour-guide-audio',
  logLevel: process.env.LOG_LEVEL || 'info',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000'
};

// Determine if we're in a production environment
export const isProd = config.nodeEnv === 'production';
