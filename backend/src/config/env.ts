export interface Config {
  env: 'development' | 'production' | 'test';
  port: number;
  auth: {
    apiKeys: string[];
    rateLimit: {
      max: number;
      windowMs: number;
    };
  };
}

export const config: Config = {
  env: (process.env.NODE_ENV as Config['env']) || 'development',
  port: parseInt(process.env.PORT || '3001', 10),
  auth: {
    apiKeys: process.env.API_KEYS?.split(',') || [],
    rateLimit: {
      max: parseInt(process.env.RATE_LIMIT || '100', 10),
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    },
  },
};
