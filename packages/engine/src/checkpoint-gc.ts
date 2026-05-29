/**
 * checkpoint-gc.ts
 * Checkpoint garbage collection and stale lock file cleanup automation
 * Implements automated disk management per critical-constraints.md
 */

import * as fs from 'fs';
import * as path from 'path';
import { ICheckpointStore, CheckpointMetadata } from './checkpoint-store.js';

export interface CheckpointStorageStats {
  totalBytes: number;
  checkpointCount: number;
  oldestCheckpointAgeHours: number;
  youngestCheckpointAgeHours: number;
  averageCheckpointAgeHours: number;
}

export interface GarbageCollectionStats {
  checkpointsDeleted: number;
  bytesFreed: number;
  executionTimeMs: number;
  storageStatsBefore: CheckpointStorageStats;
  storageStatsAfter: CheckpointStorageStats;
}

export interface LockCleanupStats {
  staleLocksRemoved: number;
  locksVerifiedActive: number;
  executionTimeMs: number;
}

/**
 * Checkpoint garbage collection manager
 * Handles automated cleanup of old checkpoints and stale lock files
 */
export class CheckpointGarbageCollector {
  private lockDir: string;
  private gcCycleCount = 0;
  private lockCleanupCycleCount = 0;

  constructor(
    private checkpointStore: ICheckpointStore,
    lockDir = '.wasm4pm/lock',
    private maxCheckpointAgeHours = 7 * 24, // 7 days default
    private maxLockAgeMs = 24 * 60 * 60 * 1000 // 24 hours default
  ) {
    this.lockDir = lockDir;
  }

  /**
   * Get checkpoint storage usage statistics
   * Rank-1 oracle: deterministic calculation from metadata
   */
  async getStorageStats(): Promise<CheckpointStorageStats> {
    try {
      const checkpoints = await this.checkpointStore.list();

      if (checkpoints.length === 0) {
        return {
          totalBytes: 0,
          checkpointCount: 0,
          oldestCheckpointAgeHours: 0,
          youngestCheckpointAgeHours: 0,
          averageCheckpointAgeHours: 0,
        };
      }

      const now = Date.now();
      const totalBytes = checkpoints.reduce((sum, cp) => sum + cp.sizeBytes, 0);
      const ages = checkpoints.map((cp) => (now - cp.createdAt.getTime()) / (1000 * 60 * 60));

      return {
        totalBytes,
        checkpointCount: checkpoints.length,
        oldestCheckpointAgeHours: Math.max(...ages),
        youngestCheckpointAgeHours: Math.min(...ages),
        averageCheckpointAgeHours: ages.reduce((a, b) => a + b) / ages.length,
      };
    } catch (error) {
      console.error('Failed to get checkpoint storage stats:', error);
      return {
        totalBytes: 0,
        checkpointCount: 0,
        oldestCheckpointAgeHours: 0,
        youngestCheckpointAgeHours: 0,
        averageCheckpointAgeHours: 0,
      };
    }
  }

  /**
   * Delete old checkpoints based on age policy
   * Policy: Keep most recent checkpoint per run_id, delete others older than max age
   * Rank-1 oracle: age comparison is deterministic
   * Rank-2 domain contract: always keep latest checkpoint per run
   */
  async deleteOldCheckpoints(
    maxAgeHours: number = this.maxCheckpointAgeHours,
    forceSoftDelete = false
  ): Promise<GarbageCollectionStats> {
    const startMs = Date.now();
    const statsBefore = await this.getStorageStats();

    try {
      const checkpoints = await this.checkpointStore.list();
      const now = Date.now();
      const maxAgeMs = maxAgeHours * 60 * 60 * 1000;

      // Group by run_id to identify most recent per run
      const runMap = new Map<string, CheckpointMetadata[]>();
      for (const cp of checkpoints) {
        if (!runMap.has(cp.runId)) {
          runMap.set(cp.runId, []);
        }
        runMap.get(cp.runId)!.push(cp);
      }

      // Identify candidates for deletion
      const toDelete: CheckpointMetadata[] = [];
      for (const [runId, cpList] of runMap) {
        // Sort by sequence number (descending) to identify most recent
        const sorted = cpList.sort((a, b) => b.sequenceNumber - a.sequenceNumber);

        // Keep first (most recent), evaluate others for age
        for (let i = 1; i < sorted.length; i++) {
          const cp = sorted[i];
          const ageMs = now - cp.createdAt.getTime();

          if (ageMs >= maxAgeMs) {
            toDelete.push(cp);
          }
        }
      }

      // Execute deletion
      let bytesFreed = 0;
      for (const cp of toDelete) {
        try {
          bytesFreed += cp.sizeBytes;
          await this.checkpointStore.delete(cp.id);
        } catch (error) {
          console.error(`Failed to delete checkpoint ${cp.id}:`, error);
        }
      }

      const statsAfter = await this.getStorageStats();
      const executionTimeMs = Date.now() - startMs;

      return {
        checkpointsDeleted: toDelete.length,
        bytesFreed,
        executionTimeMs,
        storageStatsBefore: statsBefore,
        storageStatsAfter: statsAfter,
      };
    } catch (error) {
      console.error('Checkpoint garbage collection failed:', error);
      const statsAfter = await this.getStorageStats();
      return {
        checkpointsDeleted: 0,
        bytesFreed: 0,
        executionTimeMs: Date.now() - startMs,
        storageStatsBefore: statsBefore,
        storageStatsAfter: statsAfter,
      };
    }
  }

  /**
   * Clean up stale lock files
   * Policy: Delete lock files older than max age; verify PID doesn't exist first
   * Rank-1 oracle: age calculation is deterministic
   * Rank-2 domain contract: never delete active process lock (PID alive)
   */
  async cleanupStaleLocks(maxAgeMs: number = this.maxLockAgeMs): Promise<LockCleanupStats> {
    const startMs = Date.now();
    let staleLocksRemoved = 0;
    let locksVerifiedActive = 0;

    if (!fs.existsSync(this.lockDir)) {
      return {
        staleLocksRemoved,
        locksVerifiedActive,
        executionTimeMs: Date.now() - startMs,
      };
    }

    try {
      const files = fs.readdirSync(this.lockDir).filter((f) => f.endsWith('.lock'));

      for (const file of files) {
        const lockPath = path.join(this.lockDir, file);

        try {
          const stat = fs.statSync(lockPath);
          const lockAge = Date.now() - stat.mtimeMs;

          // Skip if lock is recent
          if (lockAge < maxAgeMs) {
            locksVerifiedActive++;
            continue;
          }

          // Verify PID doesn't exist before deletion
          try {
            const content = fs.readFileSync(lockPath, 'utf-8');
            const lock = JSON.parse(content);

            // Check if process is alive (signal 0 for non-Windows)
            if (this.isProcessAlive(lock.pid)) {
              locksVerifiedActive++;
              continue;
            }
          } catch {
            // If we can't parse, treat as stale
          }

          // Delete stale lock
          fs.unlinkSync(lockPath);
          staleLocksRemoved++;
        } catch (error) {
          console.error(`Failed to process lock file ${file}:`, error);
        }
      }

      return {
        staleLocksRemoved,
        locksVerifiedActive,
        executionTimeMs: Date.now() - startMs,
      };
    } catch (error) {
      console.error('Stale lock cleanup failed:', error);
      return {
        staleLocksRemoved,
        locksVerifiedActive,
        executionTimeMs: Date.now() - startMs,
      };
    }
  }

  /**
   * Check if process is alive (PID verification)
   * Uses signal 0 (no-op) on Unix; always returns false on Windows
   */
  private isProcessAlive(pid: number): boolean {
    try {
      if (process.platform === 'win32') {
        return false;
      }
      process.kill(pid, 0);
      return true;
    } catch (error) {
      // process.kill(pid, 0) throws a NodeJS ErrnoException; ESRCH means no such process
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
        return false; // Process not found
      }
      return true; // Assume alive on other errors (permission denied, etc.)
    }
  }

  /**
   * Trigger garbage collection if needed
   * Called periodically (every 100 cycles suggested)
   * Emits metrics for observability
   */
  async triggerGarbageCollection(): Promise<{
    gcExecuted: boolean;
    gcStats?: GarbageCollectionStats;
    lockCleanupStats?: LockCleanupStats;
    storageUsageWarning?: string;
    storageUsageAlarm?: string;
  }> {
    this.gcCycleCount++;
    const stats = await this.getStorageStats();

    const result: {
      gcExecuted: boolean;
      gcStats?: GarbageCollectionStats;
      lockCleanupStats?: LockCleanupStats;
      storageUsageWarning?: string;
      storageUsageAlarm?: string;
    } = { gcExecuted: false };

    // Check if storage exceeds quota
    const storageUsageMb = stats.totalBytes / (1024 * 1024);

    if (stats.totalBytes > 2 * 1024 * 1024 * 1024) {
      // >2GB: aggressive cleanup
      result.storageUsageAlarm = `Checkpoint storage ${storageUsageMb.toFixed(1)}MB exceeds 2GB quota`;
      result.gcStats = await this.deleteOldCheckpoints(24); // Delete checkpoints older than 1 day
      result.gcExecuted = true;
    } else if (stats.totalBytes > 1 * 1024 * 1024 * 1024) {
      // >1GB: warning and normal cleanup
      result.storageUsageWarning = `Checkpoint storage ${storageUsageMb.toFixed(1)}MB exceeds 1GB threshold`;
    }

    // Every 100 GC cycles, clean up stale locks
    if (this.gcCycleCount % 100 === 0) {
      result.lockCleanupStats = await this.cleanupStaleLocks();
    }

    return result;
  }

  /**
   * Trigger lock cleanup on demand
   * Called on engine startup and periodically
   */
  async triggerLockCleanup(): Promise<LockCleanupStats> {
    this.lockCleanupCycleCount++;
    return await this.cleanupStaleLocks();
  }

  /**
   * Get current GC and lock cleanup cycle counts
   */
  getCycleCounts(): { gc: number; lockCleanup: number } {
    return {
      gc: this.gcCycleCount,
      lockCleanup: this.lockCleanupCycleCount,
    };
  }

  /**
   * Reset cycle counters (for testing)
   */
  resetCycleCounts(): void {
    this.gcCycleCount = 0;
    this.lockCleanupCycleCount = 0;
  }

  /**
   * Enforce storage quota by deleting oldest checkpoints until below threshold
   * Policy: Delete oldest checkpoints first (FIFO order) until total size < maxBytes
   * Rank-1 oracle: deterministic deletion order based on createdAt timestamp
   * Rank-2 domain contract: always keep at least one checkpoint per run_id
   */
  async enforceStorageQuota(maxBytes: number): Promise<GarbageCollectionStats> {
    const startMs = Date.now();
    const statsBefore = await this.getStorageStats();

    // If we're already under quota, no action needed
    if (statsBefore.totalBytes <= maxBytes) {
      const statsAfter = await this.getStorageStats();
      return {
        checkpointsDeleted: 0,
        bytesFreed: 0,
        executionTimeMs: Date.now() - startMs,
        storageStatsBefore: statsBefore,
        storageStatsAfter: statsAfter,
      };
    }

    try {
      const checkpoints = await this.checkpointStore.list();
      const now = Date.now();

      // Group by run_id to identify most recent per run (must keep at least one)
      const runMap = new Map<string, CheckpointMetadata[]>();
      for (const cp of checkpoints) {
        if (!runMap.has(cp.runId)) {
          runMap.set(cp.runId, []);
        }
        runMap.get(cp.runId)!.push(cp);
      }

      // Mark which checkpoints are protected (most recent per run)
      const protectedIds = new Set<string>();
      for (const [, cpList] of runMap) {
        const sorted = cpList.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        if (sorted.length > 0) {
          protectedIds.add(sorted[0].id);
        }
      }

      // Sort all checkpoints by age (oldest first) for FIFO deletion
      const sortedByAge = checkpoints
        .filter((cp) => !protectedIds.has(cp.id))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

      // Delete oldest checkpoints until we're under quota
      let currentSize = statsBefore.totalBytes;
      let bytesFreed = 0;
      const deleted: CheckpointMetadata[] = [];

      for (const cp of sortedByAge) {
        if (currentSize <= maxBytes) {
          break;
        }

        try {
          await this.checkpointStore.delete(cp.id);
          currentSize -= cp.sizeBytes;
          bytesFreed += cp.sizeBytes;
          deleted.push(cp);
        } catch (error) {
          console.error(`Failed to delete checkpoint ${cp.id} during quota enforcement:`, error);
        }
      }

      const statsAfter = await this.getStorageStats();
      return {
        checkpointsDeleted: deleted.length,
        bytesFreed,
        executionTimeMs: Date.now() - startMs,
        storageStatsBefore: statsBefore,
        storageStatsAfter: statsAfter,
      };
    } catch (error) {
      console.error('Storage quota enforcement failed:', error);
      const statsAfter = await this.getStorageStats();
      return {
        checkpointsDeleted: 0,
        bytesFreed: 0,
        executionTimeMs: Date.now() - startMs,
        storageStatsBefore: statsBefore,
        storageStatsAfter: statsAfter,
      };
    }
  }
}
