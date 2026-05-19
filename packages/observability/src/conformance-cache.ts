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
import type { OtelEvent } from './types.js';
import { Instrumentation } from './instrumentation.js';

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
 * LRU cache with per-entry TTL.
 *
 * Access order is maintained via delete-then-reinsert in `getCachedFitness()`,
 * which moves the accessed entry to the tail of the Map's insertion-order
 * sequence. When capacity is exceeded, the head of the sequence (least recently
 * used entry) is evicted.
 *
 * Before applying LRU eviction, expired entries are purged first so that zombie
 * entries do not consume capacity slots at the expense of valid live entries.
 */
export class ConformanceCache {
  private cache: Map<string, CachedFitnessResult> = new Map();
  private hits: number = 0;
  private misses: number = 0;
  private readonly maxEntries: number;
  private readonly defaultTtlMs: number;
  /** Optional OTEL span emitter. Set via `setSpanEmitter()`. Non-blocking. */
  private spanEmitter: ((event: OtelEvent) => void) | null = null;

  constructor(maxEntries: number = 1000, defaultTtlMs: number = 24 * 60 * 60 * 1000) {
    this.maxEntries = maxEntries;
    this.defaultTtlMs = defaultTtlMs;
  }

  /**
   * Register an OTEL span emitter for cache observability.
   * The emitter is called synchronously but must never throw
   * (per TPS non-blocking OTEL rule).
   */
  public setSpanEmitter(emit: (event: OtelEvent) => void): void {
    this.spanEmitter = emit;
  }

  /**
   * Emit an OTEL event without blocking the caller.
   */
  private tryEmit(event: OtelEvent): void {
    if (!this.spanEmitter) return;
    try {
      this.spanEmitter(event);
    } catch {
      /* never block on OTEL */
    }
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

    // If at capacity, purge expired entries first to reclaim dead slots before
    // evicting a potentially live entry.
    if (this.cache.size >= this.maxEntries) {
      const now = Date.now();
      for (const [k, v] of this.cache.entries()) {
        if (now - v.timestamp > v.ttl_ms) {
          this.cache.delete(k);
        }
      }
    }

    // Still at capacity after purging expired entries: evict the LRU (head).
    if (this.cache.size >= this.maxEntries) {
      const lruKey = this.cache.keys().next().value as string;
      this.cache.delete(lruKey);
    }

    this.cache.set(key, cached);
  }

  /**
   * Retrieve a cached fitness result if it exists and hasn't expired.
   * Emits `conformance.cache_hit` or `conformance.cache_miss` OTEL spans
   * when a span emitter has been registered via `setSpanEmitter()`.
   */
  public getCachedFitness(logHash: string, modelHash: string): CachedFitnessResult | null {
    const key = this.cacheKey(logHash, modelHash);
    const cached = this.cache.get(key);

    if (!cached) {
      this.misses++;
      this.tryEmit(
        Instrumentation.createConformanceCacheMissEvent(logHash, modelHash, 'not_found')
      );
      return null;
    }

    // Check TTL
    const now = Date.now();
    const age = now - cached.timestamp;
    if (age > cached.ttl_ms) {
      this.cache.delete(key);
      this.misses++;
      this.tryEmit(
        Instrumentation.createConformanceCacheMissEvent(logHash, modelHash, 'expired')
      );
      return null;
    }

    this.hits++;

    // Promote to tail (most-recently-used position) so the LRU eviction at
    // cacheFitness() correctly evicts the least-recently-accessed entry.
    this.cache.delete(key);
    this.cache.set(key, cached);

    this.tryEmit(
      Instrumentation.createConformanceCacheHitEvent(
        logHash,
        modelHash,
        cached.precision_available,
        age
      )
    );
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
    for (const _ of this.cache.values()) {
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
