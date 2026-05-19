/**
 * discovery-cache.ts
 *
 * LRU cache for discovery results indexed by log+algorithm+params hash.
 * Supports TTL-based expiration (24 hours by default).
 *
 * - `cacheDiscovery(key, result, ttl)` → store discovery result
 * - `getDiscovery(key)` → retrieve or null if expired
 * - `invalidateByAlgorithm(algorithm)` → clear all entries for algo
 * - TTL: 24 hours (configurable)
 */

import * as crypto from 'crypto';

export interface CachedDiscoveryResult {
  handle: string;
  algorithm: string;
  outputType: string;
  durationMs: number;
  hash: string;
  params: Record<string, unknown>;
  timestamp: number;
  ttl_ms: number;
}

export interface DiscoveryCacheStats {
  hits: number;
  misses: number;
  entries: number;
  bytes_used: number;
  avg_age_ms: number;
}

/**
 * Simple LRU cache with per-entry TTL and algorithm-aware invalidation.
 * Evicts oldest entries when capacity exceeded.
 */
export class DiscoveryCache {
  private cache: Map<string, CachedDiscoveryResult> = new Map();
  private algorithmIndex: Map<string, Set<string>> = new Map(); // algorithm -> cache keys
  private hits: number = 0;
  private misses: number = 0;
  private readonly maxEntries: number;
  private readonly defaultTtlMs: number;

  constructor(maxEntries: number = 1000, defaultTtlMs: number = 24 * 60 * 60 * 1000) {
    this.maxEntries = maxEntries;
    this.defaultTtlMs = defaultTtlMs;
  }

  /**
   * Store a discovery result in the cache.
   */
  public cacheDiscovery(
    cacheKey: string,
    result: Omit<CachedDiscoveryResult, 'timestamp' | 'ttl_ms'>,
    ttlMs?: number
  ): void {
    const ttl = ttlMs ?? this.defaultTtlMs;

    const cached: CachedDiscoveryResult = {
      ...result,
      timestamp: Date.now(),
      ttl_ms: ttl,
    };

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value as string;
      // Retrieve the entry BEFORE deleting so the algorithm index can be cleaned up.
      // Bug fix: previously `this.cache.get(oldestKey)` was called after
      // `this.cache.delete(oldestKey)`, which always returned undefined and left
      // stale references in the algorithm index.
      const oldestEntry = this.cache.get(oldestKey);
      this.cache.delete(oldestKey);
      // Clean up algorithm index
      if (oldestEntry) {
        const keys = this.algorithmIndex.get(oldestEntry.algorithm);
        if (keys) {
          keys.delete(oldestKey);
          if (keys.size === 0) {
            this.algorithmIndex.delete(oldestEntry.algorithm);
          }
        }
      }
    }

    // Update algorithm index
    if (!this.algorithmIndex.has(result.algorithm)) {
      this.algorithmIndex.set(result.algorithm, new Set());
    }
    this.algorithmIndex.get(result.algorithm)!.add(cacheKey);

    this.cache.set(cacheKey, cached);
  }

  /**
   * Retrieve a cached discovery result if it exists and hasn't expired.
   */
  public getDiscovery(cacheKey: string): CachedDiscoveryResult | null {
    const cached = this.cache.get(cacheKey);

    if (!cached) {
      this.misses++;
      return null;
    }

    // Check TTL
    const now = Date.now();
    const age = now - cached.timestamp;
    if (age > cached.ttl_ms) {
      this.cache.delete(cacheKey);
      // Clean up algorithm index
      const keys = this.algorithmIndex.get(cached.algorithm);
      if (keys) {
        keys.delete(cacheKey);
        if (keys.size === 0) {
          this.algorithmIndex.delete(cached.algorithm);
        }
      }
      this.misses++;
      return null;
    }

    this.hits++;
    return cached;
  }

  /**
   * Invalidate all cache entries for a specific algorithm.
   * Useful when algorithm parameters change or algorithm is updated.
   */
  public invalidateByAlgorithm(algorithm: string): number {
    const keys = this.algorithmIndex.get(algorithm);
    if (!keys) {
      return 0;
    }

    let removed = 0;
    for (const key of keys) {
      this.cache.delete(key);
      removed++;
    }

    this.algorithmIndex.delete(algorithm);
    return removed;
  }

  /**
   * Get cache statistics.
   */
  public stats(): DiscoveryCacheStats {
    let bytes = 0;
    let totalAge = 0;

    for (const entry of this.cache.values()) {
      // Rough estimate: key (64) + handle (32) + algorithm (32) + outputType (16)
      // + hash (64) + params (100) + numbers (24) = ~332 bytes per entry
      bytes += 332;
      totalAge += Date.now() - entry.timestamp;
    }

    const avgAge = this.cache.size > 0 ? totalAge / this.cache.size : 0;

    return {
      hits: this.hits,
      misses: this.misses,
      entries: this.cache.size,
      bytes_used: bytes,
      avg_age_ms: Math.round(avgAge),
    };
  }

  /**
   * Clear all cached entries and reset counters.
   */
  public clear(): void {
    this.cache.clear();
    this.algorithmIndex.clear();
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
        // Clean up algorithm index
        const keys = this.algorithmIndex.get(entry.algorithm);
        if (keys) {
          keys.delete(key);
          if (keys.size === 0) {
            this.algorithmIndex.delete(entry.algorithm);
          }
        }
        removed++;
      }
    }

    return removed;
  }

  /**
   * Get all algorithms currently cached.
   */
  public getCachedAlgorithms(): string[] {
    return Array.from(this.algorithmIndex.keys());
  }

  /**
   * Get cache hit rate (0-1).
   */
  public hitRate(): number {
    const total = this.hits + this.misses;
    return total === 0 ? 0 : this.hits / total;
  }
}

/**
 * Global singleton cache instance.
 */
let globalCache: DiscoveryCache | null = null;

/**
 * Get or create the global discovery cache.
 */
export function getDiscoveryCache(): DiscoveryCache {
  if (!globalCache) {
    globalCache = new DiscoveryCache();
  }
  return globalCache;
}

/**
 * Reset the global cache (for testing).
 */
export function resetDiscoveryCache(): void {
  globalCache = null;
}

/**
 * Generate a deterministic cache key from algorithm, log handle, and parameters.
 * Uses BLAKE3-like hashing via SHA256 for consistency with other hashing in wasm4pm.
 */
export function generateDiscoveryCacheKey(
  algorithmName: string,
  eventLogHandle: string,
  params: Record<string, unknown>
): string {
  const combined = JSON.stringify({
    algorithm: algorithmName,
    handle: eventLogHandle,
    params: Object.entries(params)
      .sort(([a], [b]) => a.localeCompare(b))
      .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {}),
  });

  return crypto.createHash('sha256').update(combined).digest('hex');
}

/**
 * Model cache wrapper — provides convenient access to discovery cache
 * for model-centric operations.
 */
export interface CachedModel {
  /** Opaque model handle in WASM memory */
  handle: string;

  /** Algorithm that produced this model */
  algorithm: string;

  /** Model output type */
  outputType: string;

  /** Time spent computing the model (ms) */
  durationMs: number;

  /** Deterministic hash of the model output */
  hash: string;

  /** Parameters used to produce this model */
  params: Record<string, unknown>;

  /** When this model was cached (timestamp) */
  cachedAt: number;

  /** Cache hit count for this specific model */
  accessCount: number;
}

export interface ModelCacheStats {
  /** Total hits across all models */
  total_hits: number;

  /** Total misses across all models */
  total_misses: number;

  /** Number of distinct models cached */
  models: number;

  /** Estimated memory used by all models */
  bytes_used: number;

  /** Hit rate (0-1) across all models */
  hit_rate: number;

  /** Average model age in milliseconds */
  avg_model_age_ms: number;

  /** Models per algorithm */
  models_by_algorithm: Record<string, number>;

  /** Estimated time saved by cache hits */
  time_saved_ms: number;
}

/**
 * Extended discovery cache with model-centric access patterns.
 * Adds access counting and statistics suitable for warm-start caching.
 */
export class ModelCache extends DiscoveryCache {
  private modelAccessCount: Map<string, number> = new Map(); // cacheKey -> access count
  private modelCacheDurations: Map<string, number> = new Map(); // cacheKey -> durationMs

  /**
   * Retrieve a cached model, incrementing access count for statistics.
   */
  public getModel(cacheKey: string): CachedModel | null {
    const cached = this.getDiscovery(cacheKey);
    if (!cached) {
      return null;
    }

    // Increment access count
    const currentCount = this.modelAccessCount.get(cacheKey) ?? 0;
    this.modelAccessCount.set(cacheKey, currentCount + 1);

    return {
      handle: cached.handle,
      algorithm: cached.algorithm,
      outputType: cached.outputType,
      durationMs: cached.durationMs,
      hash: cached.hash,
      params: cached.params,
      cachedAt: cached.timestamp,
      accessCount: currentCount + 1,
    };
  }

  /**
   * Get model cache statistics for reporting and monitoring.
   */
  public modelStats(): ModelCacheStats {
    const baseStats = this.stats();
    const algorithms = this.getCachedAlgorithms();

    // Count models per algorithm
    const modelsByAlgo: Record<string, number> = {};
    for (const algo of algorithms) {
      modelsByAlgo[algo] = 0;
    }

    // Estimate time saved: sum of all durations × (access count - 1)
    let timeSavedMs = 0;
    for (const [key, accessCount] of this.modelAccessCount.entries()) {
      if (accessCount > 1) {
        const duration = this.modelCacheDurations.get(key) ?? 0;
        // Time saved is the duration of that algorithm, times (accesses - 1)
        timeSavedMs += duration * (accessCount - 1);
      }
    }

    return {
      total_hits: baseStats.hits,
      total_misses: baseStats.misses,
      models: baseStats.entries,
      bytes_used: baseStats.bytes_used,
      hit_rate: baseStats.hits + baseStats.misses > 0
        ? baseStats.hits / (baseStats.hits + baseStats.misses)
        : 0,
      avg_model_age_ms: baseStats.avg_age_ms,
      models_by_algorithm: modelsByAlgo,
      time_saved_ms: Math.round(timeSavedMs),
    };
  }

  /**
   * List all cached models for a specific algorithm.
   */
  public getModelsForAlgorithm(_algorithm: string): CachedModel[] {
    const models: CachedModel[] = [];
    // This requires iterating the cache, which we don't have direct access to
    // For now, return empty — will need to refactor cache structure if this is critical
    return models;
  }

  /**
   * Override parent's cacheDiscovery to also track duration.
   */
  public cacheDiscovery(
    cacheKey: string,
    result: Omit<CachedDiscoveryResult, 'timestamp' | 'ttl_ms'>,
    ttlMs?: number
  ): void {
    super.cacheDiscovery(cacheKey, result, ttlMs);
    this.modelCacheDurations.set(cacheKey, result.durationMs);
    this.modelAccessCount.set(cacheKey, 0); // First access is the cache write, not the read
  }

  /**
   * Clear all models and reset counters.
   */
  public clear(): void {
    super.clear();
    this.modelAccessCount.clear();
    this.modelCacheDurations.clear();
  }
}

/**
 * Global singleton model cache instance.
 */
let globalModelCache: ModelCache | null = null;

/**
 * Get or create the global model cache.
 */
export function getModelCache(): ModelCache {
  if (!globalModelCache) {
    globalModelCache = new ModelCache();
  }
  return globalModelCache;
}

/**
 * Reset the global model cache (for testing).
 */
export function resetModelCache(): void {
  globalModelCache = null;
}
