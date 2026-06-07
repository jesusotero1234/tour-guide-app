import NodeCache from 'node-cache';
import { env } from '../config/env';
import logger from './logger';

/**
 * Simple in-memory cache implementation using node-cache
 */
class CacheService {
  private cache: NodeCache;

  constructor() {
    this.cache = new NodeCache({
      stdTTL: env.cacheTtl,           // Default TTL in seconds
      checkperiod: 120,                // Check for expired keys every 120 seconds
      maxKeys: env.maxCacheItems,      // Maximum number of keys in cache
      useClones: false                 // For better performance with large objects
    });

    // Log cache statistics periodically in development
    if (env.nodeEnv === 'development') {
      setInterval(() => {
        const stats = this.cache.getStats();
        logger.debug('Cache stats:', stats);
      }, 60000); // Every minute
    }
  }

  /**
   * Get a value from cache
   * @param key Cache key
   * @returns The cached value or undefined if not found
   */
  get<T>(key: string): T | undefined {
    const value = this.cache.get<T>(key);
    if (value) {
      logger.debug(`Cache hit: ${key}`);
    } else {
      logger.debug(`Cache miss: ${key}`);
    }
    return value;
  }

  /**
   * Store a value in cache
   * @param key Cache key
   * @param value Value to cache
   * @param ttl Time-to-live in seconds (optional)
   * @returns True if successful
   */
  set<T>(key: string, value: T, ttl?: number): boolean {
    logger.debug(`Caching key: ${key}`);
    // If ttl is undefined, use the default ttl from NodeCache
    return ttl !== undefined ? this.cache.set(key, value, ttl) : this.cache.set(key, value);
  }

  /**
   * Remove a value from cache
   * @param key Cache key
   * @returns Number of items deleted
   */
  delete(key: string): number {
    logger.debug(`Removing from cache: ${key}`);
    return this.cache.del(key);
  }

  /**
   * Check if a key exists in cache
   * @param key Cache key
   * @returns True if key exists
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Generate a cache key from request parameters
   * @param prefix Key prefix
   * @param params Request parameters
   * @returns Cache key
   */
  generateKey(prefix: string, params: Record<string, any>): string {
    // Create a stable string representation of the parameters
    const paramsStr = JSON.stringify(params, Object.keys(params).sort());
    
    // Create a simple hash of the parameters
    const hash = this.simpleHash(paramsStr);
    
    return `${prefix}_${hash}`;
  }

  /**
   * Simple string hashing function
   * @param str String to hash
   * @returns Hash value
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36); // Convert to base36 for shorter strings
  }
}

export const cacheService = new CacheService();
