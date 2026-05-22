import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import {
  ResultDeduplicator,
  getResultDeduplicator,
  resetResultDeduplicator,
} from './result-dedup.js';

const TEST_TMP = path.join(tmpdir(), 'wasm4pm-dedup-test');

/**
 * Create a temporary test directory.
 */
function ensureTestDir(): void {
  if (!fs.existsSync(TEST_TMP)) {
    fs.mkdirSync(TEST_TMP, { recursive: true });
  }
}

/**
 * Clean up test directory after tests.
 */
function cleanupTestDir(): void {
  if (fs.existsSync(TEST_TMP)) {
    fs.rmSync(TEST_TMP, { recursive: true, force: true });
  }
}

/**
 * Create a temporary test log file.
 */
function createTestLog(content: string): string {
  ensureTestDir();
  const fileName = `test-${Date.now()}-${Math.random().toString(36).slice(2)}.xes`;
  const filePath = path.join(TEST_TMP, fileName);
  fs.writeFileSync(filePath, content);
  return filePath;
}

describe('ResultDeduplicator', () => {
  let dedup: ResultDeduplicator;

  beforeEach(() => {
    ensureTestDir();
    dedup = new ResultDeduplicator(path.join(TEST_TMP, 'dedup.jsonl'));
  });

  afterEach(() => {
    dedup.clearMemory();
    cleanupTestDir();
  });

  describe('isDuplicate and recordResult', () => {
    it('should detect duplicate logs by content hash', async () => {
      const logContent = '<?xml version="1.0"?><log><trace>...</trace></log>';
      const logPath = createTestLog(logContent);

      // First run: not a duplicate
      const isDup1 = await dedup.isDuplicate(logPath);
      expect(isDup1).toBe(false);

      // Record the result
      const result = { dfg: { nodes: 5, edges: 10 } };
      await dedup.recordResult(logPath, 'dfg', result);

      // Second run: should be a duplicate
      const isDup2 = await dedup.isDuplicate(logPath);
      expect(isDup2).toBe(true);
    });

    it('should distinguish different log contents', async () => {
      const log1 = createTestLog('content1');
      const log2 = createTestLog('content2');

      await dedup.recordResult(log1, 'dfg', { nodes: 5 });

      const isDup1 = await dedup.isDuplicate(log1);
      const isDup2 = await dedup.isDuplicate(log2);

      expect(isDup1).toBe(true);
      expect(isDup2).toBe(false);
    });

    it('should handle identical logs created separately', async () => {
      const logContent = 'identical';
      const log1 = createTestLog(logContent);
      const log2 = createTestLog(logContent);

      await dedup.recordResult(log1, 'dfg', { nodes: 5 });

      // log2 has the same content as log1, so it's a duplicate
      const isDup2 = await dedup.isDuplicate(log2);
      expect(isDup2).toBe(true);
    });
  });

  describe('getExistingResult', () => {
    it('should retrieve cached result for duplicate logs', async () => {
      const logPath = createTestLog('test log content');
      const testResult = { dfg: { nodes: 10, edges: 20 } };

      // First call: no result
      let existing = await dedup.getExistingResult(logPath, 'dfg');
      expect(existing).toBeNull();

      // Record result
      await dedup.recordResult(logPath, 'dfg', testResult);

      // Second call: should return cached result
      existing = await dedup.getExistingResult(logPath, 'dfg');
      expect(existing).not.toBeNull();
      expect(existing?.algorithm).toBe('dfg');
      expect(existing?.result).toEqual(testResult);
    });

    it('should return null for different algorithms', async () => {
      const logPath = createTestLog('test content');

      await dedup.recordResult(logPath, 'dfg', { nodes: 5 });

      const existing = await dedup.getExistingResult(logPath, 'heuristic_miner');
      expect(existing).toBeNull();
    });

    it('should increment deduplicatedCount on hit', async () => {
      const logPath = createTestLog('test content');
      await dedup.recordResult(logPath, 'dfg', { nodes: 5 });

      const statsBefore = dedup.stats();
      expect(statsBefore.deduplicated_count).toBe(0);

      await dedup.getExistingResult(logPath, 'dfg');

      const statsAfter = dedup.stats();
      expect(statsAfter.deduplicated_count).toBe(1);
    });

    it('should handle TTL expiration', async () => {
      const logPath = createTestLog('test content');

      // Record with very short TTL (1 ms)
      await dedup.recordResult(logPath, 'dfg', { nodes: 5 }, undefined, 1);

      // Wait to ensure expiration
      await new Promise((resolve) => setTimeout(resolve, 10));

      const existing = await dedup.getExistingResult(logPath, 'dfg');
      expect(existing).toBeNull();
    });
  });

  describe('stats', () => {
    it('should report accurate statistics', async () => {
      const log1 = createTestLog('content1');
      const log2 = createTestLog('content2');

      await dedup.recordResult(log1, 'dfg', { nodes: 5 });
      await dedup.recordResult(log2, 'heuristic_miner', { nodes: 10 });

      const stats = dedup.stats();

      expect(stats.total_entries).toBe(2);
      expect(stats.deduplicated_count).toBe(0);
      expect(typeof stats.bytes_saved_estimate).toBe('number');
    });

    it('should track last_hit timestamp', async () => {
      const logPath = createTestLog('test content');
      await dedup.recordResult(logPath, 'dfg', { nodes: 5 });

      const statsBefore = dedup.stats();
      expect(statsBefore.last_hit).toBeUndefined();

      await dedup.getExistingResult(logPath, 'dfg');

      const statsAfter = dedup.stats();
      expect(statsAfter.last_hit).toBeDefined();
      expect(statsAfter.last_hit).toBeGreaterThan(0);
    });

    it('should track last_clear timestamp', async () => {
      const statsBefore = dedup.stats();
      expect(statsBefore.last_clear).toBeUndefined();

      dedup.clearMemory();

      const statsAfter = dedup.stats();
      expect(statsAfter.last_clear).toBeDefined();
    });
  });

  describe('clearMemory', () => {
    it('should clear all in-memory entries', async () => {
      const log1 = createTestLog('content1');
      const log2 = createTestLog('content2');

      await dedup.recordResult(log1, 'dfg', { nodes: 5 });
      await dedup.recordResult(log2, 'heuristic_miner', { nodes: 10 });

      let stats = dedup.stats();
      expect(stats.total_entries).toBe(2);

      dedup.clearMemory();

      stats = dedup.stats();
      expect(stats.total_entries).toBe(0);
      expect(stats.deduplicated_count).toBe(0);
    });
  });

  describe('purgeExpired', () => {
    it('should remove expired entries', async () => {
      const log1 = createTestLog('content1');
      const log2 = createTestLog('content2');

      // Record with short TTL
      await dedup.recordResult(log1, 'dfg', { nodes: 5 }, undefined, 1);
      await dedup.recordResult(log2, 'heuristic_miner', { nodes: 10 }, undefined, 24 * 60 * 60 * 1000); // 24 hours

      await new Promise((resolve) => setTimeout(resolve, 10));

      const removed = dedup.purgeExpired();
      expect(removed).toBe(1);

      const stats = dedup.stats();
      expect(stats.total_entries).toBe(1);
    });
  });

  describe('persistence', () => {
    it('should persist results to JSONL file', async () => {
      const dedupPath = path.join(TEST_TMP, 'persist.jsonl');
      const dedup2 = new ResultDeduplicator(dedupPath);

      const logPath = createTestLog('test content');
      await dedup2.recordResult(logPath, 'dfg', { nodes: 5 });

      // Check file exists
      expect(fs.existsSync(dedupPath)).toBe(true);

      // Check file contains the result
      const content = fs.readFileSync(dedupPath, 'utf-8');
      expect(content).toContain('dfg');
      expect(content).toContain('nodes');
    });

    it('should load persisted results from disk', async () => {
      const dedupPath = path.join(TEST_TMP, 'load.jsonl');
      const dedup1 = new ResultDeduplicator(dedupPath);
      const dedup2 = new ResultDeduplicator(dedupPath);

      const logPath = createTestLog('test content');
      const testResult = { dfg: { nodes: 5 } };
      await dedup1.recordResult(logPath, 'dfg', testResult);

      // Load into new instance
      await dedup2.loadFromDisk();

      // Should be able to retrieve the result
      const existing = await dedup2.getExistingResult(logPath, 'dfg');
      expect(existing).not.toBeNull();
      expect(existing?.result).toEqual(testResult);
    });

    it('should skip expired entries when loading from disk', async () => {
      const dedupPath = path.join(TEST_TMP, 'expire.jsonl');
      const dedup = new ResultDeduplicator(dedupPath);

      const logPath = createTestLog('test content');
      // Use 50ms TTL
      await dedup.recordResult(logPath, 'dfg', { nodes: 5 }, undefined, 50);

      // Wait to ensure the entry is written to disk
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Reset and load from disk immediately - entry still valid
      const dedup2 = new ResultDeduplicator(dedupPath);
      await dedup2.loadFromDisk();
      let stats = dedup2.stats();
      expect(stats.total_entries).toBeGreaterThan(0);

      // Wait past TTL
      await new Promise((resolve) => setTimeout(resolve, 60));

      // Load again - entry should now be expired
      const dedup3 = new ResultDeduplicator(dedupPath);
      await dedup3.loadFromDisk();
      stats = dedup3.stats();
      expect(stats.total_entries).toBe(0);
    });
  });

  describe('scanDirectoryForDuplicates', () => {
    it('should identify duplicate logs in a directory', async () => {
      const logContent = 'duplicate log';
      const dir = TEST_TMP;

      createTestLog(logContent);
      createTestLog(logContent);
      createTestLog('unique content');

      const duplicates = await dedup.scanDirectoryForDuplicates(dir);

      // Should find 2 files with the same content
      let duplicateCount = 0;
      for (const [, files] of duplicates) {
        if (files.length > 1) {
          duplicateCount += files.length;
        }
      }
      expect(duplicateCount).toBeGreaterThanOrEqual(2);
    });

    it('should handle non-existent directory gracefully', async () => {
      const nonExistentDir = path.join(TEST_TMP, 'does-not-exist');
      const duplicates = await dedup.scanDirectoryForDuplicates(nonExistentDir);

      expect(duplicates.size).toBe(0);
    });
  });

  describe('clearDisk', () => {
    it('should delete the persisted database file', async () => {
      const dedupPath = path.join(TEST_TMP, 'delete.jsonl');
      const dedup2 = new ResultDeduplicator(dedupPath);

      const logPath = createTestLog('test content');
      await dedup2.recordResult(logPath, 'dfg', { nodes: 5 });

      expect(fs.existsSync(dedupPath)).toBe(true);

      await dedup2.clearDisk();

      expect(fs.existsSync(dedupPath)).toBe(false);
    });
  });

  describe('configHash support', () => {
    it('should store config hash with results', async () => {
      const dedupPath = path.join(TEST_TMP, 'config.jsonl');
      const dedup2 = new ResultDeduplicator(dedupPath);

      const logPath = createTestLog('test content');
      const configHash = 'abc123def456';
      await dedup2.recordResult(logPath, 'dfg', { nodes: 5 }, configHash);

      // Read the persisted file
      const content = fs.readFileSync(dedupPath, 'utf-8');
      const entry = JSON.parse(content.trim());

      expect(entry.config_hash).toBe(configHash);
    });
  });
});

describe('Global deduplicator singleton', () => {
  beforeEach(() => {
    resetResultDeduplicator();
  });

  afterEach(() => {
    resetResultDeduplicator();
    cleanupTestDir();
  });

  it('should create singleton on first call', () => {
    const dedup1 = getResultDeduplicator();
    const dedup2 = getResultDeduplicator();

    expect(dedup1).toBe(dedup2);
  });

  it('should reset singleton', () => {
    const dedup1 = getResultDeduplicator();
    resetResultDeduplicator();
    const dedup2 = getResultDeduplicator();

    expect(dedup1).not.toBe(dedup2);
  });
});
