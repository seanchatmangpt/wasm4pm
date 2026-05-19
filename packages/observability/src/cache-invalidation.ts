/**
 * cache-invalidation.ts
 * Smart cache invalidation for conformance results based on algorithm parameters
 *
 * Problem: Current cache only uses log+model hash, ignoring algorithm parameters.
 * Solution: Include parameter hash in cache key; invalidate when params change.
 *
 * - `computeParamHash(params)` → BLAKE3-like hash of parameter object
 * - `shouldInvalidate(oldParamHash, newParamHash)` → boolean
 * - `invalidateAlgorithmCache(algorithm, paramHash)` → Clear affected entries
 */

import * as crypto from 'crypto';

/**
 * Algorithm parameter configuration that can affect cache validity
 */
export interface AlgorithmParams {
  [key: string]: unknown;
}

/**
 * Compute a deterministic hash of algorithm parameters.
 * Uses SHA256 (consistent with crypto availability).
 *
 * @param params - Parameter object (e.g., { dependency_threshold: 0.2 })
 * @returns Hex-encoded hash of parameter object
 */
export function computeParamHash(params: Record<string, unknown>): string {
  // Normalize: sort keys for deterministic serialization
  const sorted = Object.keys(params)
    .sort()
    .reduce(
      (acc, key) => {
        acc[key] = params[key];
        return acc;
      },
      {} as Record<string, unknown>
    );

  const jsonStr = JSON.stringify(sorted);
  return crypto.createHash('sha256').update(jsonStr).digest('hex');
}

/**
 * Determine if cache should be invalidated based on parameter changes.
 * Returns true if hashes differ (parameters changed).
 *
 * @param oldParamHash - Previous parameter hash
 * @param newParamHash - Current parameter hash
 * @returns true if invalidation is needed, false if cache can be reused
 */
export function shouldInvalidate(
  oldParamHash: string | undefined,
  newParamHash: string
): boolean {
  // If no previous hash, this is a new entry — no invalidation needed
  if (!oldParamHash) {
    return false;
  }

  // If hashes differ, parameters changed — must invalidate
  return oldParamHash !== newParamHash;
}

/**
 * Per-algorithm cache tracker with parameter awareness
 * Stores metadata about cached results indexed by (algorithm, paramHash)
 */
export class AlgorithmCacheInvalidator {
  private cache: Map<string, Map<string, CacheEntry>> = new Map();

  /**
   * Track a cache entry with associated parameters
   */
  public trackEntry(algorithm: string, paramHash: string, metadata: CacheEntry): void {
    if (!this.cache.has(algorithm)) {
      this.cache.set(algorithm, new Map());
    }

    const algoCache = this.cache.get(algorithm)!;
    algoCache.set(paramHash, metadata);
  }

  /**
   * Retrieve cached metadata for a specific algorithm + params combination
   */
  public getEntry(algorithm: string, paramHash: string): CacheEntry | undefined {
    const algoCache = this.cache.get(algorithm);
    return algoCache?.get(paramHash);
  }

  /**
   * Invalidate all cache entries for an algorithm
   * (Used when we need a fresh start)
   *
   * @param algorithm - Algorithm ID
   * @returns Number of entries invalidated
   */
  public invalidateAlgorithm(algorithm: string): number {
    const count = this.cache.get(algorithm)?.size ?? 0;
    this.cache.delete(algorithm);
    return count;
  }

  /**
   * Invalidate a specific (algorithm, paramHash) combination
   */
  public invalidateEntry(algorithm: string, paramHash: string): boolean {
    const algoCache = this.cache.get(algorithm);
    if (!algoCache) {
      return false;
    }

    return algoCache.delete(paramHash);
  }

  /**
   * Get all algorithms currently tracked
   */
  public getTrackedAlgorithms(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get all param hashes for a specific algorithm
   */
  public getParamHashesForAlgorithm(algorithm: string): string[] {
    const algoCache = this.cache.get(algorithm);
    return algoCache ? Array.from(algoCache.keys()) : [];
  }

  /**
   * Clear all tracked entries
   */
  public clear(): void {
    this.cache.clear();
  }

  /**
   * Get statistics on cache coverage
   */
  public stats(): InvalidatorStats {
    let totalEntries = 0;
    let totalAlgorithms = 0;

    for (const algoCache of this.cache.values()) {
      totalAlgorithms++;
      totalEntries += algoCache.size;
    }

    return {
      totalAlgorithms,
      totalEntries,
      algorithmBreakdown: Array.from(this.cache.entries()).reduce(
        (acc, [algo, cache]) => {
          acc[algo] = cache.size;
          return acc;
        },
        {} as Record<string, number>
      ),
    };
  }
}

/**
 * Metadata about a cached conformance result
 */
export interface CacheEntry {
  logHash: string;
  modelHash: string;
  paramHash: string;
  fitness: number;
  precision: number | null;
  timestamp: number;
  algorithm: string;
}

/**
 * Statistics from the invalidator
 */
export interface InvalidatorStats {
  totalAlgorithms: number;
  totalEntries: number;
  algorithmBreakdown: Record<string, number>;
}

/**
 * Global singleton cache invalidator
 */
let globalInvalidator: AlgorithmCacheInvalidator | null = null;

/**
 * Get or create the global cache invalidator
 */
export function getAlgorithmCacheInvalidator(): AlgorithmCacheInvalidator {
  if (!globalInvalidator) {
    globalInvalidator = new AlgorithmCacheInvalidator();
  }
  return globalInvalidator;
}

/**
 * Reset the global invalidator (for testing)
 */
export function resetAlgorithmCacheInvalidator(): void {
  globalInvalidator = null;
}
