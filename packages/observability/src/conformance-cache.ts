/**
 * conformance-cache.ts
 *
 * LRU cache for conformance checking results indexed by log+model hash.
 * Supports lazy precision computation: store fitness results and reuse them
 * when computing precision separately.
 *
 * - `cacheFitness(logHash, modelHash, fitnessResult)` → store fitness
 * - `getCachedFitness(logHash, modelHash)` → retrieve or null
 * - TTL: 24 hours (configurable)
 */

import * as crypto from 'crypto';

export interface CachedFitnessResult {
  fitness: number;
  precision: number | null;
  precision_available: boolean;
  timestamp: number;
  ttl_ms: number;
}

export interface ConformanceCacheStats {
  hits: number;
  misses: number;
  entries: number;
  bytes_used: number;
}

/**
 * Simple LRU cache with per-entry TTL.
 * Evicts oldest entries when capacity exceeded.
 */
export class ConformanceCache {
  private cache: Map<string, CachedFitnessResult> = new Map();
  private hits: number = 0;
  private misses: number = 0;
  private readonly maxEntries: number;
  private readonly defaultTtlMs: number;

  constructor(maxEntries: number = 1000, defaultTtlMs: number = 24 * 60 * 60 * 1000) {
    this.maxEntries = maxEntries;
    this.defaultTtlMs = defaultTtlMs;
  }

  /**
   * Generate a cache key from log hash and model hash.
   */
  private cacheKey(logHash: string, modelHash: string): string {
    return `${logHash}:${modelHash}`;
  }

  /**
   * Store a fitness result in the cache.
   */
  public cacheFitness(
    logHash: string,
    modelHash: string,
    fitnessResult: Omit<CachedFitnessResult, 'timestamp' | 'ttl_ms'>,
    ttlMs?: number
  ): void {
    const key = this.cacheKey(logHash, modelHash);
    const ttl = ttlMs ?? this.defaultTtlMs;

    const cached: CachedFitnessResult = {
      ...fitnessResult,
      timestamp: Date.now(),
      ttl_ms: ttl,
    };

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value as string;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, cached);
  }

  /**
   * Retrieve a cached fitness result if it exists and hasn't expired.
   */
  public getCachedFitness(logHash: string, modelHash: string): CachedFitnessResult | null {
    const key = this.cacheKey(logHash, modelHash);
    const cached = this.cache.get(key);

    if (!cached) {
      this.misses++;
      return null;
    }

    // Check TTL
    const now = Date.now();
    const age = now - cached.timestamp;
    if (age > cached.ttl_ms) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    return cached;
  }

  /**
   * Update precision on an existing cache entry (for lazy computation).
   */
  public updatePrecision(logHash: string, modelHash: string, precision: number): boolean {
    const key = this.cacheKey(logHash, modelHash);
    const cached = this.cache.get(key);

    if (!cached) {
      return false;
    }

    // Check TTL before updating
    const now = Date.now();
    const age = now - cached.timestamp;
    if (age > cached.ttl_ms) {
      this.cache.delete(key);
      return false;
    }

    cached.precision = precision;
    cached.precision_available = true;
    return true;
  }

  /**
   * Get cache statistics.
   */
  public stats(): ConformanceCacheStats {
    let bytes = 0;
    for (const entry of this.cache.values()) {
      // Rough estimate: key (32) + fitness (8) + precision (8) + bools (1) + timestamp (8) + ttl (8)
      bytes += 65;
    }

    return {
      hits: this.hits,
      misses: this.misses,
      entries: this.cache.size,
      bytes_used: bytes,
    };
  }

  /**
   * Clear all cached entries and reset counters.
   */
  public clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Purge expired entries.
   */
  public purgeExpired(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      const age = now - entry.timestamp;
      if (age > entry.ttl_ms) {
        this.cache.delete(key);
        removed++;
      }
    }

    return removed;
  }
}

/**
 * Global singleton cache instance.
 */
let globalCache: ConformanceCache | null = null;

/**
 * Get or create the global conformance cache.
 */
export function getConformanceCache(): ConformanceCache {
  if (!globalCache) {
    globalCache = new ConformanceCache();
  }
  return globalCache;
}

/**
 * Reset the global cache (for testing).
 */
export function resetConformanceCache(): void {
  globalCache = null;
}

/**
 * Hash a log file or model file deterministically.
 * Returns hex digest.
 */
export function hashLogOrModel(content: Buffer | string): string {
  const buffer = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;
  return crypto.createHash('sha256').update(buffer).digest('hex');
}
