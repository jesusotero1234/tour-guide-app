import { env } from '../config/env';

/**
 * Delay execution for a given number of milliseconds
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Rate limiter for API requests
 */
export class ApiRateLimiter {
  private lastRequestTime: number = 0;
  private readonly requestDelay: number;

  constructor(requestDelayMs: number = 1000) {
    this.requestDelay = requestDelayMs;
  }

  async waitForNext(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.requestDelay) {
      await delay(this.requestDelay - timeSinceLastRequest);
    }
    
    this.lastRequestTime = Date.now();
  }
}

// Create a singleton instance for OSM API
export const osmRateLimiter = new ApiRateLimiter(env.osmRequestDelay);
