import dotenv from 'dotenv';

dotenv.config();

function cleanEnvValue(value: string | undefined): string | undefined {
  return value?.split(/\s+#/)[0]?.trim();
}

function cleanNumber(value: string | undefined): number {
  const cleaned = cleanEnvValue(value);
  return cleaned ? Number(cleaned) : Number.NaN;
}

function cleanBoolean(value: string | undefined): boolean {
  return cleanEnvValue(value) === 'true';
}

function normalizeOllamaHost(value: string | undefined): string {
  const cleaned = cleanEnvValue(value) || 'http://localhost:11434';
  return /^https?:\/\//i.test(cleaned) ? cleaned : `http://${cleaned}`;
}

export const env = {
  port: cleanEnvValue(process.env.PORT) || 3002,
  env: cleanEnvValue(process.env.NODE_ENV) || 'development',
  ollamaHost: normalizeOllamaHost(process.env.OLLAMA_HOST),
  ollamaModel: cleanEnvValue(process.env.OLLAMA_MODEL) || 'gemma4:26b',
  narrativeModel: cleanEnvValue(process.env.NARRATIVE_MODEL) || 'gemma4:26b',
  rateLimitWindowMs: cleanNumber(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
  rateLimitMaxRequests: cleanNumber(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  narrativeMaxConcurrency: Math.max(1, cleanNumber(process.env.NARRATIVE_MAX_CONCURRENCY) || 2),
  narrativeBriefEnabled: cleanBoolean(process.env.NARRATIVE_BRIEF_ENABLED),
};
