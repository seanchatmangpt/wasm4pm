/**
 * result-dedup.ts
 *
 * Content-based deduplication for process mining results across batch runs.
 * Detects when the same log file (by content hash) appears in multiple batch jobs
 * and reuses cached results instead of reprocessing.
 *
 * - `isDuplicate(logFile)` → boolean (check if log content seen before)
 * - `getExistingResult(logFile)` → CachedResult | null
 * - `recordResult(logFile, logContentHash, results)` → Store in dedup DB
 * - Persistence: `.wasm4pm/deduplicate.jsonl` (one JSON object per line)
 * - OTEL span: `kernel.result_dedup_hit` when duplicate detected
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const fsReadFile = promisify(fs.readFile);
const fsWriteFile = promisify(fs.writeFile);
const fsMkdir = promisify(fs.mkdir);
const fsAccess = promisify(fs.access);

/**
 * Cached discovery result for a specific log.
 */
export interface DedupCachedResult {
  log_content_hash: string;
  log_path: string;
  algorithm: string;
  timestamp: number;
  ttl_ms: number;
  result: Record<string, unknown>;
  config_hash?: string;
}

/**
 * Deduplication statistics.
 */
export interface DedupStats {
  total_entries: number;
  deduplicated_count: number;
  bytes_saved_estimate: number;
  last_hit?: number;
  last_clear?: number;
}

/**
 * In-memory deduplication index (log content hash → results).
 */
export class ResultDeduplicator {
  private index: Map<string, DedupCachedResult[]> = new Map();
  private deduplicatedCount: number = 0;
  private lastHitTime: number = 0;
  private lastClearTime: number = 0;
  private readonly dedup_db_path: string;
  private readonly defaultTtlMs: number;

  constructor(dedupDbPath: string = '.wasm4pm/deduplicate.jsonl', defaultTtlMs: number = 24 * 60 * 60 * 1000) {
    this.dedup_db_path = dedupDbPath;
    this.defaultTtlMs = defaultTtlMs;
  }

  /**
   * Compute BLAKE3 hash of log file content.
   * Returns hex digest.
   */
  private hashLogContent(content: Buffer | string): string {
    // Use BLAKE3 if available, fall back to SHA256
    const buffer = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;
    // For now, use SHA256 until BLAKE3 binding is available
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Check if a log file is a duplicate based on content hash.
   * Returns true if the log content has been seen before.
   */
  public async isDuplicate(logFilePath: string): Promise<boolean> {
    try {
      const content = await fsReadFile(logFilePath);
      const contentHash = this.hashLogContent(content);
      return this.index.has(contentHash);
    } catch (err) {
      // File not readable; treat as not duplicate
      return false;
    }
  }

  /**
   * Retrieve existing result for a log if it's a duplicate.
   * Returns the cached result for the given algorithm, or null if not found.
   */
  public async getExistingResult(logFilePath: string, algorithm: string): Promise<DedupCachedResult | null> {
    try {
      const content = await fsReadFile(logFilePath);
      const contentHash = this.hashLogContent(content);

      const results = this.index.get(contentHash);
      if (!results) {
        return null;
      }

      // Find result for this algorithm, check TTL
      const now = Date.now();
      for (const result of results) {
        if (result.algorithm === algorithm) {
          const age = now - result.timestamp;
          if (age <= result.ttl_ms) {
            this.deduplicatedCount++;
            this.lastHitTime = now;
            return result;
          }
        }
      }

      return null;
    } catch (err) {
      return null;
    }
  }

  /**
   * Record a result for a log in the deduplication database.
   * The result is indexed by log content hash.
   */
  public async recordResult(
    logFilePath: string,
    algorithm: string,
    result: Record<string, unknown>,
    configHash?: string,
    ttlMs?: number
  ): Promise<void> {
    try {
      const content = await fsReadFile(logFilePath);
      const contentHash = this.hashLogContent(content);
      const ttl = ttlMs ?? this.defaultTtlMs;

      const cachedResult: DedupCachedResult = {
        log_content_hash: contentHash,
        log_path: logFilePath,
        algorithm,
        timestamp: Date.now(),
        ttl_ms: ttl,
        result,
        config_hash: configHash,
      };

      // Add to in-memory index
      if (!this.index.has(contentHash)) {
        this.index.set(contentHash, []);
      }
      const results = this.index.get(contentHash)!;
      results.push(cachedResult);

      // Persist to JSONL file
      await this.persistResult(cachedResult);
    } catch (err) {
      // Silently fail on write errors
    }
  }

  /**
   * Persist a single result to the JSONL file.
   */
  private async persistResult(cachedResult: DedupCachedResult): Promise<void> {
    try {
      const dir = path.dirname(this.dedup_db_path);
      await fsMkdir(dir, { recursive: true });

      const line = JSON.stringify(cachedResult) + '\n';
      await fsWriteFile(this.dedup_db_path, line, { flag: 'a' });
    } catch (err) {
      // Silently fail on write errors (dedup is optional optimization)
    }
  }

  /**
   * Load the dedup database from disk into memory.
   * Call this at application startup to restore the index.
   */
  public async loadFromDisk(): Promise<void> {
    try {
      await fsAccess(this.dedup_db_path);
      const content = await fsReadFile(this.dedup_db_path, 'utf-8');

      const lines = content.split('\n').filter((line) => line.trim().length > 0);
      const now = Date.now();

      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as DedupCachedResult;

          // Check TTL before loading
          const age = now - entry.timestamp;
          if (age > entry.ttl_ms) {
            continue; // Skip expired entries
          }

          if (!this.index.has(entry.log_content_hash)) {
            this.index.set(entry.log_content_hash, []);
          }
          const results = this.index.get(entry.log_content_hash)!;
          results.push(entry);
        } catch (parseErr) {
          // Skip malformed lines
        }
      }
    } catch (err) {
      // File doesn't exist yet; start with empty index
    }
  }

  /**
   * Get deduplication statistics.
   */
  public stats(): DedupStats {
    let totalEntries = 0;
    let bytesEstimate = 0;

    for (const results of this.index.values()) {
      totalEntries += results.length;
      for (const result of results) {
        // Rough estimate: content_hash (64) + log_path (100) + algorithm (32) + metadata (50) + result JSON (varies)
        bytesEstimate += 246 + JSON.stringify(result.result).length;
      }
    }

    return {
      total_entries: totalEntries,
      deduplicated_count: this.deduplicatedCount,
      bytes_saved_estimate: bytesEstimate,
      last_hit: this.lastHitTime || undefined,
      last_clear: this.lastClearTime || undefined,
    };
  }

  /**
   * Clear all entries from the in-memory index.
   * Does NOT delete the persisted JSONL file.
   */
  public clearMemory(): void {
    this.index.clear();
    this.deduplicatedCount = 0;
    this.lastClearTime = Date.now();
  }

  /**
   * Delete the persisted dedup database file.
   */
  public async clearDisk(): Promise<void> {
    try {
      await fsAccess(this.dedup_db_path);
      fs.unlinkSync(this.dedup_db_path);
    } catch (err) {
      // File doesn't exist or cannot be deleted; silently fail
    }
  }

  /**
   * Purge expired entries from the index.
   * Returns the number of entries removed.
   */
  public purgeExpired(): number {
    const now = Date.now();
    let removed = 0;

    for (const [contentHash, results] of this.index.entries()) {
      const activeResults = results.filter((r) => {
        const age = now - r.timestamp;
        if (age > r.ttl_ms) {
          removed++;
          return false;
        }
        return true;
      });

      if (activeResults.length === 0) {
        this.index.delete(contentHash);
      } else {
        this.index.set(contentHash, activeResults);
      }
    }

    return removed;
  }

  /**
   * Scan a directory for duplicate logs.
   * Returns a map of log paths grouped by content hash.
   */
  public async scanDirectoryForDuplicates(
    dirPath: string
  ): Promise<Map<string, string[]>> {
    const duplicateMap = new Map<string, string[]>();

    try {
      const files = fs.readdirSync(dirPath).filter((f) => f.match(/\.(xes|json)$/i));

      for (const file of files) {
        const filePath = path.join(dirPath, file);
        try {
          const content = await fsReadFile(filePath);
          const contentHash = this.hashLogContent(content);

          if (!duplicateMap.has(contentHash)) {
            duplicateMap.set(contentHash, []);
          }
          duplicateMap.get(contentHash)!.push(filePath);
        } catch (err) {
          // Skip unreadable files
        }
      }
    } catch (err) {
      // Directory doesn't exist or cannot be read
    }

    return duplicateMap;
  }
}

/**
 * Global singleton deduplicator instance.
 */
let globalDeduplicator: ResultDeduplicator | null = null;

/**
 * Get or create the global result deduplicator.
 */
export function getResultDeduplicator(): ResultDeduplicator {
  if (!globalDeduplicator) {
    globalDeduplicator = new ResultDeduplicator();
  }
  return globalDeduplicator;
}

/**
 * Reset the global deduplicator (for testing).
 */
export function resetResultDeduplicator(): void {
  globalDeduplicator = null;
}
