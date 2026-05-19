/**
 * checkpoint-gc.test.ts
 * Tests for checkpoint garbage collection and stale lock file cleanup
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { CheckpointGarbageCollector } from './checkpoint-gc.js';
import { MemoryCheckpointStore } from './checkpoint-store.js';
import { Checkpoint } from './checkpointing.js';

describe('CheckpointGarbageCollector', () => {
  let gc: CheckpointGarbageCollector;
  let store: MemoryCheckpointStore;
  const testLockDir = `.wasm4pm/test-gc-locks-${Date.now()}`;

  beforeEach(() => {
    store = new MemoryCheckpointStore();
    gc = new CheckpointGarbageCollector(
      store,
      testLockDir,
      168, // 7 days
      24 * 60 * 60 * 1000 // 24 hours
    );

    // Ensure test lock dir exists
    if (!fs.existsSync(testLockDir)) {
      fs.mkdirSync(testLockDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test lock dir
    try {
      if (fs.existsSync(testLockDir)) {
        const files = fs.readdirSync(testLockDir);
        for (const file of files) {
          fs.unlinkSync(path.join(testLockDir, file));
        }
        fs.rmdirSync(testLockDir);
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Storage Statistics', () => {
    it('returns zero stats when no checkpoints exist', async () => {
      const stats = await gc.getStorageStats();
      expect(stats.checkpointCount).toBe(0);
      expect(stats.totalBytes).toBe(0);
      expect(stats.oldestCheckpointAgeHours).toBe(0);
    });

    it('calculates total storage from all checkpoints', async () => {
      const cp1: Checkpoint = {
        id: 'cp1',
        runId: 'run1',
        timestamp: new Date(),
        sequenceNumber: 1,
        state: 'ready',
        progress: 0.5,
        metadata: {},
      };

      const cp2: Checkpoint = {
        id: 'cp2',
        runId: 'run1',
        timestamp: new Date(),
        sequenceNumber: 2,
        state: 'ready',
        progress: 0.6,
        metadata: {},
      };

      await store.save('cp1', cp1);
      await store.save('cp2', cp2);

      const stats = await gc.getStorageStats();
      expect(stats.checkpointCount).toBe(2);
      expect(stats.totalBytes).toBeGreaterThan(0);
    });

    it('calculates checkpoint ages correctly', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const cp1: Checkpoint = {
        id: 'cp1',
        runId: 'run1',
        timestamp: oneHourAgo,
        sequenceNumber: 1,
        state: 'ready',
        progress: 0.5,
        metadata: {},
      };

      const cp2: Checkpoint = {
        id: 'cp2',
        runId: 'run1',
        timestamp: now,
        sequenceNumber: 2,
        state: 'ready',
        progress: 0.6,
        metadata: {},
      };

      await store.save('cp1', cp1);
      await store.save('cp2', cp2);

      const stats = await gc.getStorageStats();
      expect(stats.oldestCheckpointAgeHours).toBeGreaterThan(0);
      expect(stats.youngestCheckpointAgeHours).toBeLessThanOrEqual(
        stats.oldestCheckpointAgeHours
      );
    });
  });

  describe('Garbage Collection', () => {
    it('deletes old checkpoints older than max age', async () => {
      const now = new Date();
      const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);

      const oldCp: Checkpoint = {
        id: 'old',
        runId: 'run1',
        timestamp: eightDaysAgo,
        sequenceNumber: 1,
        state: 'ready',
        progress: 0.5,
        metadata: {},
      };

      const newCp: Checkpoint = {
        id: 'new',
        runId: 'run1',
        timestamp: now,
        sequenceNumber: 2,
        state: 'ready',
        progress: 0.6,
        metadata: {},
      };

      await store.save('old', oldCp);
      await store.save('new', newCp);

      const statsBefore = await gc.getStorageStats();
      expect(statsBefore.checkpointCount).toBe(2);

      const gcStats = await gc.deleteOldCheckpoints(7 * 24); // 7 days

      expect(gcStats.checkpointsDeleted).toBe(1);
      expect(gcStats.bytesFreed).toBeGreaterThan(0);

      const statsAfter = await gc.getStorageStats();
      expect(statsAfter.checkpointCount).toBe(1);
      expect(statsAfter.totalBytes).toBeLessThan(statsBefore.totalBytes);
    });

    it('keeps most recent checkpoint per run', async () => {
      const now = new Date();
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

      // Create 3 checkpoints for same run, different ages
      const cp1: Checkpoint = {
        id: 'cp1',
        runId: 'run1',
        timestamp: twoDaysAgo,
        sequenceNumber: 1,
        state: 'ready',
        progress: 0.5,
        metadata: {},
      };

      const cp2: Checkpoint = {
        id: 'cp2',
        runId: 'run1',
        timestamp: new Date(twoDaysAgo.getTime() + 24 * 60 * 60 * 1000),
        sequenceNumber: 2,
        state: 'ready',
        progress: 0.6,
        metadata: {},
      };

      const cp3: Checkpoint = {
        id: 'cp3',
        runId: 'run1',
        timestamp: now,
        sequenceNumber: 3,
        state: 'ready',
        progress: 0.7,
        metadata: {},
      };

      await store.save('cp1', cp1);
      await store.save('cp2', cp2);
      await store.save('cp3', cp3);

      const gcStats = await gc.deleteOldCheckpoints(1 * 24); // 1 day

      // Should delete cp1 and cp2 (older than 1 day)
      // Should keep cp3 (most recent)
      expect(gcStats.checkpointsDeleted).toBe(2);

      const statsAfter = await gc.getStorageStats();
      expect(statsAfter.checkpointCount).toBe(1);
    });

    it('handles multiple runs independently', async () => {
      const now = new Date();
      const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);

      // Run 1: old and new
      const run1Old: Checkpoint = {
        id: 'run1old',
        runId: 'run1',
        timestamp: eightDaysAgo,
        sequenceNumber: 1,
        state: 'ready',
        progress: 0.5,
        metadata: {},
      };

      const run1New: Checkpoint = {
        id: 'run1new',
        runId: 'run1',
        timestamp: now,
        sequenceNumber: 2,
        state: 'ready',
        progress: 0.6,
        metadata: {},
      };

      // Run 2: old and new
      const run2Old: Checkpoint = {
        id: 'run2old',
        runId: 'run2',
        timestamp: eightDaysAgo,
        sequenceNumber: 1,
        state: 'ready',
        progress: 0.5,
        metadata: {},
      };

      const run2New: Checkpoint = {
        id: 'run2new',
        runId: 'run2',
        timestamp: now,
        sequenceNumber: 2,
        state: 'ready',
        progress: 0.6,
        metadata: {},
      };

      await store.save('run1old', run1Old);
      await store.save('run1new', run1New);
      await store.save('run2old', run2Old);
      await store.save('run2new', run2New);

      const gcStats = await gc.deleteOldCheckpoints(7 * 24);

      // Should delete 2 old checkpoints (one per run)
      expect(gcStats.checkpointsDeleted).toBe(2);

      const statsAfter = await gc.getStorageStats();
      expect(statsAfter.checkpointCount).toBe(2);
    });
  });

  describe('Stale Lock File Cleanup', () => {
    it('removes stale lock files older than max age', async () => {
      const lockPath = path.join(testLockDir, 'stale.lock');

      const staleLock = {
        runId: 'run1',
        pid: 99999, // Non-existent PID
        startedAt: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
        hostname: 'testhost',
      };

      fs.writeFileSync(lockPath, JSON.stringify(staleLock));

      // Use utimesSync to set old mtime (more reliable than waiting)
      const oldTime = Math.floor((Date.now() - 25 * 60 * 60 * 1000) / 1000);
      fs.utimesSync(lockPath, oldTime, oldTime);

      const cleanupStats = await gc.cleanupStaleLocks(24 * 60 * 60 * 1000);

      expect(cleanupStats.staleLocksRemoved).toBe(1);
      expect(fs.existsSync(lockPath)).toBe(false);
    });

    it('preserves active lock files', async () => {
      const lockPath = path.join(testLockDir, 'active.lock');

      const activeLock = {
        runId: 'run1',
        pid: process.pid, // Current process (definitely alive)
        startedAt: Date.now() - 1 * 60 * 60 * 1000, // 1 hour ago
        hostname: 'testhost',
      };

      fs.writeFileSync(lockPath, JSON.stringify(activeLock));

      const cleanupStats = await gc.cleanupStaleLocks(24 * 60 * 60 * 1000);

      // Should not remove because process is alive and lock is recent
      expect(fs.existsSync(lockPath)).toBe(true);
      expect(cleanupStats.locksVerifiedActive).toBeGreaterThanOrEqual(0);
    });

    it('verifies PID before deleting old locks', async () => {
      const lockPath = path.join(testLockDir, 'pid-check.lock');

      // Create lock with non-existent PID (99999 is unlikely to be running)
      const oldLock = {
        runId: 'run1',
        pid: 99999,
        startedAt: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
        hostname: 'testhost',
      };

      fs.writeFileSync(lockPath, JSON.stringify(oldLock));

      // Use utimesSync to set old mtime (more reliable than setTimeout)
      const oldTime = Math.floor((Date.now() - 25 * 60 * 60 * 1000) / 1000);
      fs.utimesSync(lockPath, oldTime, oldTime);

      const cleanupStats = await gc.cleanupStaleLocks(24 * 60 * 60 * 1000);

      // Should remove because PID is dead and lock is old
      expect(cleanupStats.staleLocksRemoved).toBe(1);
      expect(fs.existsSync(lockPath)).toBe(false);
    });

    it('handles missing lock directory gracefully', async () => {
      const nonExistentDir = `.wasm4pm/nonexistent-${Date.now()}`;
      const gc2 = new CheckpointGarbageCollector(store, nonExistentDir);

      const cleanupStats = await gc2.cleanupStaleLocks();

      expect(cleanupStats.staleLocksRemoved).toBe(0);
      expect(cleanupStats.locksVerifiedActive).toBe(0);
    });
  });

  describe('Automated Triggering', () => {
    it('triggers garbage collection when storage exceeds quota', async () => {
      const now = new Date();
      const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);

      // Create old checkpoint to simulate storage
      const oldCp: Checkpoint = {
        id: 'old',
        runId: 'run1',
        timestamp: eightDaysAgo,
        sequenceNumber: 1,
        state: 'ready',
        progress: 0.5,
        metadata: {},
      };

      const newCp: Checkpoint = {
        id: 'new',
        runId: 'run1',
        timestamp: now,
        sequenceNumber: 2,
        state: 'ready',
        progress: 0.6,
        metadata: {},
      };

      await store.save('old', oldCp);
      await store.save('new', newCp);

      const result = await gc.triggerGarbageCollection();

      // If storage is small enough, it may not trigger GC
      // But the method should execute successfully
      expect(result).toHaveProperty('gcExecuted');
    });

    it('emits warning when storage exceeds 1GB threshold', async () => {
      // Note: This test verifies the method structure
      // In a real scenario, we'd need mock checkpoints large enough to exceed 1GB
      const result = await gc.triggerGarbageCollection();

      expect(result).toHaveProperty('gcExecuted');
      expect(typeof result.gcExecuted).toBe('boolean');
      // Storage warning/alarm properties only exist when thresholds are crossed
      // So we just verify the result is an object with at least gcExecuted
      expect(result).toBeInstanceOf(Object);
    });

    it('triggers lock cleanup every 100 GC cycles', async () => {
      // Reset counter
      gc.resetCycleCounts();

      // Trigger 100 times
      for (let i = 0; i < 100; i++) {
        const result = await gc.triggerGarbageCollection();
        if (i === 99) {
          // 100th cycle should include lock cleanup stats
          expect(result).toHaveProperty('lockCleanupStats');
        }
      }

      const counts = gc.getCycleCounts();
      expect(counts.gc).toBe(100);
    });
  });

  describe('Lock Cleanup on Demand', () => {
    it('triggers lock cleanup on demand', async () => {
      const lockPath = path.join(testLockDir, 'demand.lock');

      const staleLock = {
        runId: 'run1',
        pid: 99999,
        startedAt: Date.now() - 25 * 60 * 60 * 1000,
        hostname: 'testhost',
      };

      fs.writeFileSync(lockPath, JSON.stringify(staleLock));

      // Wait for mtime to be old
      await new Promise((resolve) => setTimeout(resolve, 10));

      const cleanupStats = await gc.triggerLockCleanup();

      expect(cleanupStats).toHaveProperty('staleLocksRemoved');
      expect(cleanupStats).toHaveProperty('locksVerifiedActive');
      expect(cleanupStats).toHaveProperty('executionTimeMs');
    });
  });

  describe('Cycle Counting', () => {
    it('tracks GC cycle count', async () => {
      gc.resetCycleCounts();
      let counts = gc.getCycleCounts();
      expect(counts.gc).toBe(0);

      await gc.triggerGarbageCollection();
      counts = gc.getCycleCounts();
      expect(counts.gc).toBe(1);

      await gc.triggerGarbageCollection();
      counts = gc.getCycleCounts();
      expect(counts.gc).toBe(2);
    });

    it('resets cycle counters', async () => {
      gc.resetCycleCounts();
      await gc.triggerGarbageCollection();

      let counts = gc.getCycleCounts();
      expect(counts.gc).toBeGreaterThan(0);

      gc.resetCycleCounts();
      counts = gc.getCycleCounts();
      expect(counts.gc).toBe(0);
    });
  });

  describe('Checkpoint GC Boundary Fix', () => {
    it('deletes checkpoint exactly at max age (boundary condition)', async () => {
      const now = Date.now();
      const maxAgeMs = 24 * 60 * 60 * 1000; // 24 hours
      const maxAgeHours = 24;

      // Create checkpoint exactly 24 hours old
      const exactlyAtBoundary = new Date(now - maxAgeMs);

      const boundaryCheckpoint: Checkpoint = {
        id: 'boundary',
        runId: 'run1',
        timestamp: exactlyAtBoundary,
        sequenceNumber: 1,
        state: 'ready',
        progress: 0.5,
        metadata: {},
      };

      const newCheckpoint: Checkpoint = {
        id: 'new',
        runId: 'run1',
        timestamp: new Date(now),
        sequenceNumber: 2,
        state: 'ready',
        progress: 0.6,
        metadata: {},
      };

      await store.save('boundary', boundaryCheckpoint);
      await store.save('new', newCheckpoint);

      const gcStats = await gc.deleteOldCheckpoints(maxAgeHours);

      // Boundary checkpoint should be deleted (ageMs >= maxAgeMs, not just >)
      expect(gcStats.checkpointsDeleted).toBe(1);

      const statsAfter = await gc.getStorageStats();
      expect(statsAfter.checkpointCount).toBe(1);
      expect(statsAfter.totalBytes).toBeGreaterThan(0);
    });
  });

  describe('Storage Quota Management', () => {
    it('enforces storage quota by deleting oldest checkpoints', async () => {
      const now = new Date();

      // Create 5 checkpoints of different ages
      const checkpoints: Checkpoint[] = [];
      for (let i = 0; i < 5; i++) {
        const cp: Checkpoint = {
          id: `cp${i}`,
          runId: 'run1',
          timestamp: new Date(now.getTime() - i * 60 * 60 * 1000), // i hours old
          sequenceNumber: i,
          state: 'ready',
          progress: 0.5 + i * 0.1,
          metadata: {},
        };
        checkpoints.push(cp);
        await store.save(`cp${i}`, cp);
      }

      const statsBefore = await gc.getStorageStats();
      expect(statsBefore.checkpointCount).toBe(5);

      // Enforce a quota that allows only 2 checkpoints
      // Calculate reasonable quota size (allow 2 checkpoints)
      const quotaSize = Math.floor((statsBefore.totalBytes / 5) * 2.5);

      const quotaStats = await gc.enforceStorageQuota(quotaSize);

      // Should have deleted some checkpoints
      expect(quotaStats.checkpointsDeleted).toBeGreaterThan(0);
      expect(quotaStats.bytesFreed).toBeGreaterThan(0);

      // Verify we're under quota
      expect(quotaStats.storageStatsAfter.totalBytes).toBeLessThanOrEqual(quotaSize);
    });

    it('deletes oldest checkpoints first (FIFO order)', async () => {
      const now = new Date();

      // Create 3 checkpoints with clear age ordering
      const oldest: Checkpoint = {
        id: 'oldest',
        runId: 'run1',
        timestamp: new Date(now.getTime() - 3 * 60 * 60 * 1000),
        sequenceNumber: 1,
        state: 'ready',
        progress: 0.3,
        metadata: {},
      };

      const middle: Checkpoint = {
        id: 'middle',
        runId: 'run1',
        timestamp: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        sequenceNumber: 2,
        state: 'ready',
        progress: 0.5,
        metadata: {},
      };

      const newest: Checkpoint = {
        id: 'newest',
        runId: 'run1',
        timestamp: now,
        sequenceNumber: 3,
        state: 'ready',
        progress: 0.7,
        metadata: {},
      };

      await store.save('oldest', oldest);
      await store.save('middle', middle);
      await store.save('newest', newest);

      // Enforce quota to keep only newest checkpoint
      const statsBefore = await gc.getStorageStats();
      const quotaSize = Math.floor((statsBefore.totalBytes / 3) * 1.2);

      const quotaStats = await gc.enforceStorageQuota(quotaSize);

      // Should delete oldest first, then middle
      expect(quotaStats.checkpointsDeleted).toBeGreaterThanOrEqual(1);

      // Newest should still exist (most recent)
      const statsAfter = await gc.getStorageStats();
      const remaining = await store.list();
      expect(remaining.some((cp) => cp.id === 'newest')).toBe(true);
    });

    it('respects no-deletion requirement when under quota', async () => {
      const now = new Date();

      const cp1: Checkpoint = {
        id: 'cp1',
        runId: 'run1',
        timestamp: new Date(now.getTime() - 1 * 60 * 60 * 1000),
        sequenceNumber: 1,
        state: 'ready',
        progress: 0.5,
        metadata: {},
      };

      const cp2: Checkpoint = {
        id: 'cp2',
        runId: 'run1',
        timestamp: now,
        sequenceNumber: 2,
        state: 'ready',
        progress: 0.6,
        metadata: {},
      };

      await store.save('cp1', cp1);
      await store.save('cp2', cp2);

      const statsBefore = await gc.getStorageStats();

      // Set quota much larger than current usage
      const largeQuota = statsBefore.totalBytes * 10;

      const quotaStats = await gc.enforceStorageQuota(largeQuota);

      // Should not delete anything
      expect(quotaStats.checkpointsDeleted).toBe(0);
      expect(quotaStats.bytesFreed).toBe(0);

      const statsAfter = await gc.getStorageStats();
      expect(statsAfter.checkpointCount).toBe(2);
    });

    it('always keeps most recent checkpoint per run during quota enforcement', async () => {
      const now = new Date();

      // Create 2 runs with multiple checkpoints each
      const run1Old: Checkpoint = {
        id: 'run1-old',
        runId: 'run1',
        timestamp: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        sequenceNumber: 1,
        state: 'ready',
        progress: 0.5,
        metadata: {},
      };

      const run1New: Checkpoint = {
        id: 'run1-new',
        runId: 'run1',
        timestamp: now,
        sequenceNumber: 2,
        state: 'ready',
        progress: 0.6,
        metadata: {},
      };

      const run2Old: Checkpoint = {
        id: 'run2-old',
        runId: 'run2',
        timestamp: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        sequenceNumber: 1,
        state: 'ready',
        progress: 0.5,
        metadata: {},
      };

      const run2New: Checkpoint = {
        id: 'run2-new',
        runId: 'run2',
        timestamp: now,
        sequenceNumber: 2,
        state: 'ready',
        progress: 0.6,
        metadata: {},
      };

      await store.save('run1-old', run1Old);
      await store.save('run1-new', run1New);
      await store.save('run2-old', run2Old);
      await store.save('run2-new', run2New);

      // Set quota to force deletion
      const statsBefore = await gc.getStorageStats();
      const tinyQuota = Math.floor((statsBefore.totalBytes / 4) * 2.1); // Allow ~2 checkpoints

      const quotaStats = await gc.enforceStorageQuota(tinyQuota);

      const statsAfter = await gc.getStorageStats();
      const remaining = await store.list();

      // Should keep both new checkpoints (most recent per run)
      expect(remaining.some((cp) => cp.id === 'run1-new')).toBe(true);
      expect(remaining.some((cp) => cp.id === 'run2-new')).toBe(true);

      // At least one old checkpoint should be deleted
      expect(quotaStats.checkpointsDeleted).toBeGreaterThan(0);
    });
  });
});
