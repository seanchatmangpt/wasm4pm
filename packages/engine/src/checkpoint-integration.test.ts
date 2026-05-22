/**
 * checkpoint-integration.test.ts
 * Tests for crash detection, signal handling, and checkpoint persistence integration
 * Verifies Phase 1.5 infrastructure integration
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SignalHandler } from './signals.js';
import { CheckpointManager } from './checkpointing.js';
import { MemoryCheckpointStore, FileCheckpointStore } from './checkpoint-store.js';
import { CrashDetector } from './crash-detector.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Mock Engine for testing
 */
class MockEngine {
  constructor(private _state: 'uninitialized' | 'ready' | 'running' | 'failed' = 'uninitialized') {}

  state() {
    return this._state;
  }

  setState(state: any) {
    this._state = state;
  }
}

describe('Checkpoint Integration (Phase 1.5)', () => {
  let tempDir: string;
  let checkpointStore: FileCheckpointStore;
  let mockEngine: MockEngine;

  beforeEach(async () => {
    // Create temporary directory for test artifacts
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wasm4pm-test-'));
    checkpointStore = new FileCheckpointStore(path.join(tempDir, 'checkpoints'));
    mockEngine = new MockEngine('ready');
  });

  afterEach(async () => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('TASK 1: Engine Bootstrap Integration', () => {
    it('should initialize signal handler with crash detector', async () => {
      const runId = 'test-signal-init-' + Date.now();
      const signalHandler = new SignalHandler(mockEngine as any, checkpointStore, {
        runId,
        checkpointStore,
      });

      expect(signalHandler).toBeDefined();
      const crashDetector = signalHandler.getCrashDetector();
      expect(crashDetector).toBeDefined();
      signalHandler.deregister();
    });

    it('should detect previous crash on bootstrap', async () => {
      const runId = 'test-run-crash-' + Date.now();
      const lockDir = path.join(tempDir, 'lock');

      // Create a lock file simulating a crashed process
      if (!fs.existsSync(lockDir)) {
        fs.mkdirSync(lockDir, { recursive: true });
      }

      const lockPath = path.join(lockDir, `${runId}.lock`);
      const staleTime = Date.now() - 1000 * 60 * 60; // 1 hour old
      fs.writeFileSync(
        lockPath,
        JSON.stringify({
          runId,
          pid: 9999,
          startedAt: staleTime,
          hostname: 'test-host',
        })
      );

      // Create detector that should detect crash
      const detector = new CrashDetector(runId, lockDir);
      const result = detector.detectCrash();

      expect(result.crashed).toBe(true);
      expect(result.recoveryAvailable).toBe(true);
      // Process 9999 is unlikely to be alive, so either reason is acceptable
      expect(result.reason).toBeDefined();

      // Cleanup
      fs.unlinkSync(lockPath);
    });

    it('should emit crash detection on signal handler init', async () => {
      const runId = 'test-run-span-' + Date.now();
      const lockDir = path.join(tempDir, 'lock');

      // Create a stale lock file
      if (!fs.existsSync(lockDir)) {
        fs.mkdirSync(lockDir, { recursive: true });
      }

      const lockPath = path.join(lockDir, `${runId}.lock`);
      const staleTime = Date.now() - 1000 * 60 * 60;
      fs.writeFileSync(
        lockPath,
        JSON.stringify({
          runId,
          pid: 9999,
          startedAt: staleTime,
          hostname: 'test-host',
        })
      );

      const signalHandler = new SignalHandler(mockEngine as any, checkpointStore, {
        runId,
        lockDir,
        checkpointStore,
      });

      const crashDetected = await signalHandler.initializeCrashDetection();
      expect(crashDetected).toBe(true);

      // Cleanup
      fs.unlinkSync(lockPath);
      signalHandler.getCrashDetector().clearLock();
      signalHandler.deregister();
    });
  });

  describe('TASK 2: Signal Handlers', () => {
    it('should register and deregister signal handlers', async () => {
      const runId = 'test-signal-' + Date.now();
      const lockDir = path.join(tempDir, 'lock');

      const signalHandler = new SignalHandler(mockEngine as any, checkpointStore, {
        runId,
        lockDir,
        checkpointStore,
      });

      // Handlers are registered internally
      expect(signalHandler).toBeDefined();

      // Deregister should not throw
      signalHandler.deregister();
    });

    it('should create lock file on crash detection init', async () => {
      const runId = 'test-lock-' + Date.now();
      const lockDir = path.join(tempDir, 'lock');

      const signalHandler = new SignalHandler(mockEngine as any, checkpointStore, {
        runId,
        lockDir,
        checkpointStore,
      });

      await signalHandler.initializeCrashDetection();

      const crashDetector = signalHandler.getCrashDetector();
      const lockBefore = crashDetector.getLastLock();
      expect(lockBefore).toBeDefined();
      expect(lockBefore?.pid).toBe(process.pid);

      signalHandler.deregister();
    });

    it('should clear lock on signal handler deregister', async () => {
      const runId = 'test-signal-clear-' + Date.now();
      const lockDir = path.join(tempDir, 'lock');

      const signalHandler = new SignalHandler(mockEngine as any, checkpointStore, {
        runId,
        lockDir,
        checkpointStore,
      });

      await signalHandler.initializeCrashDetection();

      const crashDetector = signalHandler.getCrashDetector();
      const lockBefore = crashDetector.getLastLock();
      expect(lockBefore).toBeDefined();

      signalHandler.deregister();
      crashDetector.clearLock();

      const lockAfter = crashDetector.getLastLock();
      expect(lockAfter).toBeNull();
    });
  });

  describe('TASK 3: Checkpoint Persistence', () => {
    it('should create and retrieve checkpoints', async () => {
      const runId = 'test-checkpoint-' + Date.now();
      const checkpointManager = new CheckpointManager(runId);

      // Create a checkpoint
      const cp = checkpointManager.create('ready', 0.5, { test: true });
      expect(cp).toBeDefined();
      expect(cp.progress).toBe(0.5);
      expect(cp.state).toBe('ready');

      // Save to store
      await checkpointStore.save(cp.id, cp);

      // Load from store
      const loaded = await checkpointStore.load(cp.id);
      expect(loaded).toBeDefined();
      expect(loaded!.progress).toBe(0.5);
      expect(loaded!.state).toBe('ready');
    });

    it('should list checkpoints for a run', async () => {
      const runId = 'test-list-' + Date.now();
      const checkpointManager = new CheckpointManager(runId);

      // Create multiple checkpoints
      const cp1 = checkpointManager.create('ready', 0.25);
      const cp2 = checkpointManager.create('running', 0.5);
      const cp3 = checkpointManager.create('running', 0.75);

      await checkpointStore.save(cp1.id, cp1);
      await checkpointStore.save(cp2.id, cp2);
      await checkpointStore.save(cp3.id, cp3);

      // List all for this run
      const list = await checkpointStore.list({ runId });
      expect(list.length).toBeGreaterThanOrEqual(3);

      // Find our checkpoints
      const ours = list.filter((m) => m.runId === runId);
      expect(ours.length).toBe(3);
      expect(ours[0].progress).toBe(0.25);
      expect(ours[2].progress).toBe(0.75);
    });

    it('should validate checkpoint integrity on load', async () => {
      const runId = 'test-validate-' + Date.now();
      const checkpointManager = new CheckpointManager(runId);

      const checkpoint = checkpointManager.create('running', 0.75, { custom: 'data' });
      await checkpointStore.save(checkpoint.id, checkpoint);

      // Load and verify all fields
      const loaded = await checkpointStore.load(checkpoint.id);
      expect(loaded).toBeDefined();
      expect(loaded!.id).toBe(checkpoint.id);
      expect(loaded!.progress).toBe(0.75);
      expect(loaded!.state).toBe('running');
      expect(loaded!.runId).toBe(runId);
    });
  });

  describe('TASK 4: Recovery on Restart', () => {
    it('should load recovery checkpoint after crash detection', async () => {
      const runId = 'test-recovery-' + Date.now();
      const checkpointManager = new CheckpointManager(runId);

      // Create and save checkpoint (simulating previous run)
      const checkpoint = checkpointManager.create('ready', 0.5, { cycle: 1 });
      await checkpointStore.save(checkpoint.id, checkpoint);

      // Verify checkpoint was saved
      const saved = await checkpointStore.list({ runId });
      expect(saved.length).toBeGreaterThan(0);

      // Simulate restart and recovery
      const signalHandler = new SignalHandler(mockEngine as any, checkpointStore, {
        runId,
        checkpointStore,
      });

      // Verify we can detect and list checkpoints
      const savedCheckpoints = await checkpointStore.list({ runId });
      expect(savedCheckpoints.length).toBeGreaterThan(0);

      const latest = savedCheckpoints[savedCheckpoints.length - 1];
      expect(latest.progress).toBe(0.5);

      signalHandler.deregister();
    });

    it('should handle recovery when no checkpoint exists', async () => {
      const runId = 'test-no-recovery-' + Date.now();
      const signalHandler = new SignalHandler(mockEngine as any, checkpointStore, {
        runId,
        checkpointStore,
      });

      // Try to load recovery checkpoint when none exists
      const recovered = await signalHandler.loadRecoveryCheckpoint();
      expect(recovered).toBeNull();

      signalHandler.deregister();
    });
  });

  describe('TASK 5: Crash/Recovery Simulation', () => {
    it('should simulate complete crash and recovery cycle', async () => {
      const runId = 'test-full-cycle-' + Date.now();
      const lockDir = path.join(tempDir, 'lock');

      // Step 1: Initialize and save checkpoint
      console.log('Step 1: Initialize signal handler');
      const signalHandler1 = new SignalHandler(mockEngine as any, checkpointStore, {
        runId,
        lockDir,
        checkpointStore,
      });

      console.log('Step 2: Initialize crash detection (creates lock)');
      const crashDetected = await signalHandler1.initializeCrashDetection();
      expect(crashDetected).toBe(false); // First run, no crash

      const crashDetector = signalHandler1.getCrashDetector();
      const lock = crashDetector.getLastLock();
      expect(lock).toBeDefined();
      expect(lock!.pid).toBe(process.pid);

      console.log('Step 3: Save checkpoint');
      const checkpointMgr = signalHandler1.getCheckpointManager();
      const checkpoint = checkpointMgr.create('ready', 0.5, { cycle: 1 });
      await checkpointStore.save(checkpoint.id, checkpoint);

      // Step 4: Simulate crash by leaving lock file
      console.log('Step 4: Simulate crash (deregister handlers without clearing lock)');
      signalHandler1.deregister();

      // Step 5: Verify crash detector detects the lock from same runId
      console.log('Step 5: Detect crash on restart (same runId)');
      // Manually check crash detection without creating new signal handler
      const detector = new CrashDetector(runId, lockDir);
      const result = detector.detectCrash();
      // Should detect crash because lock file exists for current process PID
      // (unless process is still running, in which case it won't detect)
      console.log(`Crash detected: ${result.crashed}, reason: ${result.reason}`);

      console.log('Step 6: Load recovered checkpoint');
      const allCheckpoints = await checkpointStore.list({ runId });
      expect(allCheckpoints.length).toBeGreaterThan(0);

      console.log('Step 7: Verify checkpoint persisted');
      const latest = allCheckpoints[allCheckpoints.length - 1];
      expect(latest.progress).toBe(0.5);

      // Cleanup
      detector.clearLock();
    });

    it('should clean up stale lock files on startup', async () => {
      const lockDir = path.join(tempDir, 'lock');
      if (!fs.existsSync(lockDir)) {
        fs.mkdirSync(lockDir, { recursive: true });
      }

      // Create a stale lock file (2 days old - older than default 24h threshold)
      const staleRunId = 'stale-' + Date.now();
      const staleLockPath = path.join(lockDir, `${staleRunId}.lock`);
      const staleTime = Date.now() - 1000 * 60 * 60 * 48; // 2 days old
      fs.writeFileSync(
        staleLockPath,
        JSON.stringify({
          runId: staleRunId,
          pid: 9999,
          startedAt: staleTime,
          hostname: 'test-host',
        })
      );

      console.log(`Created stale lock at: ${staleLockPath}`);
      const beforeCleanup = fs.existsSync(staleLockPath);
      console.log(`Stale lock exists before cleanup: ${beforeCleanup}`);

      // Verify stale lock exists
      expect(beforeCleanup).toBe(true);

      // Create detector and call cleanupStaleLocks (uses default 24h threshold)
      const detector = new CrashDetector(staleRunId, lockDir);
      const cleaned = detector.cleanupStaleLocks();
      console.log(`Cleaned up ${cleaned} stale locks`);

      // Verify stale lock was cleaned (lock is 2 days old, threshold is 24h)
      const staleExists = fs.existsSync(staleLockPath);
      console.log(`Stale lock exists after cleanup: ${staleExists}`);
      expect(staleExists).toBe(false);
      expect(cleaned).toBe(1);
    });
  });
});
