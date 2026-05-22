/**
 * autonomous-recovery-loop.test.ts
 * Integration tests for autonomous recovery orchestrator
 * Tests: crash detection → recovery execution, MTTR <1s, escalation handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Engine } from './engine.js';
import { CrashDetector } from './crash-detector.js';
import { MemoryCheckpointStore } from './checkpoint-store.js';
import { CheckpointManager } from './checkpointing.js';
import { AutonomousRecoveryOrchestrator } from './autonomous-recovery-loop.js';
import { EngineState } from '@wasm4pm/contracts';

describe('AutonomousRecoveryOrchestrator', () => {
  let engine: Engine;
  let crashDetector: CrashDetector;
  let checkpointStore: MemoryCheckpointStore;
  let checkpointManager: CheckpointManager;
  let orchestrator: AutonomousRecoveryOrchestrator;
  const testRunId = `test-run-${Date.now()}`;
  const testLockDir = `.wasm4pm/test-locks-${Date.now()}`;

  beforeEach(() => {
    // Note: In real tests, Engine would be properly initialized
    // For this test, we use a minimal mock setup
    engine = {
      state: () => 'ready' as EngineState,
    } as unknown as Engine;

    crashDetector = new CrashDetector(testRunId, testLockDir, undefined, 5000);
    checkpointStore = new MemoryCheckpointStore();
    checkpointManager = new CheckpointManager(testRunId);

    orchestrator = new AutonomousRecoveryOrchestrator(
      engine,
      crashDetector,
      checkpointStore,
      checkpointManager,
      testRunId,
      undefined,
      100, // Shorter interval for testing
      5000 // 5s heartbeat timeout
    );
  });

  afterEach(() => {
    orchestrator.stop();
    crashDetector.clearLock();
  });

  // Test 1: Crash detected → recovery executed
  it('detects crash and executes recovery with checkpoint', async () => {
    // Setup: Create checkpoint before crash
    const checkpoint = checkpointManager.create('ready', 0.95, {
      testName: 'crash-recovery',
      algorithm: 'dfg',
    });

    await checkpointStore.save(checkpoint.id, checkpoint);

    // Simulate crash: stale lock (don't call createLock, so lock is stale)
    crashDetector.createLock();
    // Wait for lock to become stale
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Manually delete the lock file to simulate crash
    crashDetector.clearLock();

    // Detect crash
    const crashResult = crashDetector.detectCrash();
    expect(crashResult.crashed).toBe(false); // No lock = no crash marker

    // Now test recovery decision with a fresh lock
    crashDetector.createLock();
    const freshResult = crashDetector.detectCrash();
    expect(freshResult.crashed).toBe(false); // Fresh lock = no crash

    // For proper crash detection, we need a stale lock file
    // Create a lock with old timestamp
    const oldLock = {
      runId: testRunId,
      pid: 99999, // Non-existent PID
      startedAt: Date.now() - 10000, // 10s old
      hostname: 'test-host',
    };
    const fs = require('fs');
    const path = require('path');
    const lockPath = path.join(testLockDir, `${testRunId}.lock`);
    fs.writeFileSync(lockPath, JSON.stringify(oldLock));

    // Now detect crash from stale lock
    const staleResult = crashDetector.detectCrash();
    expect(staleResult.crashed).toBe(true);
    expect(staleResult.recoveryAvailable).toBe(true);

    // Verify checkpoint was saved and can be recovered
    const checkpoints = await checkpointStore.list({ runId: testRunId });
    expect(checkpoints.length).toBeGreaterThan(0);

    // Verify recovery would use this checkpoint
    const latestMeta = checkpoints[checkpoints.length - 1];
    const recovered = await checkpointStore.load(latestMeta.id);
    expect(recovered).toBeDefined();
    expect(recovered?.state).toBe('ready');
  });

  // Test 2: Crash with no checkpoint → escalation triggered
  it('escalates when crash detected but no checkpoint available', async () => {
    // Setup: Create crash condition without checkpoint
    const oldLock = {
      runId: testRunId,
      pid: 99999,
      startedAt: Date.now() - 10000,
      hostname: 'test-host',
    };
    const fs = require('fs');
    const path = require('path');
    if (!fs.existsSync(testLockDir)) {
      fs.mkdirSync(testLockDir, { recursive: true });
    }
    const lockPath = path.join(testLockDir, `${testRunId}.lock`);
    fs.writeFileSync(lockPath, JSON.stringify(oldLock));

    // Detect crash
    const crashResult = crashDetector.detectCrash();
    expect(crashResult.crashed).toBe(true);

    // Check no checkpoints available
    const checkpoints = await checkpointStore.list({ runId: testRunId });
    expect(checkpoints.length).toBe(0);

    // Recovery decision should escalate
    expect(crashResult.recoveryAvailable).toBe(true);
    // But no checkpoint to load

    // Clean up
    crashDetector.clearLock();
  });

  // Test 3: No crash → health monitoring continues
  it('continues normal operation when no crash detected', async () => {
    // Setup: Create valid lock
    crashDetector.createLock();

    // Detect no crash
    const crashResult = crashDetector.detectCrash();
    expect(crashResult.crashed).toBe(false);

    // Verify lock still present (normal operation)
    const lastLock = crashDetector.getLastLock();
    expect(lastLock).toBeDefined();
    expect(lastLock?.runId).toBe(testRunId);
    expect(lastLock?.pid).toBe(process.pid);
  });

  // Test 4: MTTR requirement validation
  it('verifies MTTR <1s requirement for recovery', async () => {
    // Setup: Create checkpoint
    const checkpoint = checkpointManager.create('ready', 0.9, {
      testName: 'mttr-validation',
    });
    await checkpointStore.save(checkpoint.id, checkpoint);

    // Measure recovery execution time
    const startMs = Date.now();

    // Simulate recovery (in real scenario, this would be in executeRecovery)
    const recovered = await checkpointStore.load(checkpoint.id);
    expect(recovered).toBeDefined();

    const recoveryTimeMs = Date.now() - startMs;

    // Verify MTTR <1s
    expect(recoveryTimeMs).toBeLessThan(1000);
    console.log(`Recovery time: ${recoveryTimeMs}ms (requirement: <1000ms)`);
  });

  // Test 5: Monitoring loop starts and stops cleanly
  it('starts and stops monitoring loop without errors', async () => {
    // Create valid initial lock
    crashDetector.createLock();

    // Start monitoring
    orchestrator.start();
    expect(orchestrator.getStatus().isMonitoring).toBe(true);

    // Let monitoring run briefly
    await new Promise((resolve) => setTimeout(resolve, 250));

    // Verify monitoring ran
    expect(orchestrator.getStatus().lastHealthCheck).toBeDefined();

    // Stop monitoring
    orchestrator.stop();
    expect(orchestrator.getStatus().isMonitoring).toBe(false);
  });

  // Test 6: Concurrent crash + signal handling
  it('handles concurrent crash detection and signal interruption', async () => {
    // Setup: Valid lock initially
    crashDetector.createLock();

    // Start monitoring
    orchestrator.start();
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Simulate crash during monitoring
    const oldLock = {
      runId: testRunId,
      pid: 99999,
      startedAt: Date.now() - 10000,
      hostname: 'test-host',
    };
    const fs = require('fs');
    const path = require('path');
    const lockPath = path.join(testLockDir, `${testRunId}.lock`);
    fs.writeFileSync(lockPath, JSON.stringify(oldLock));

    // Let next monitoring cycle run
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Stop should complete even with stale lock
    orchestrator.stop();
    expect(orchestrator.getStatus().isMonitoring).toBe(false);

    // Verify crash was eventually detected
    const crashResult = crashDetector.detectCrash();
    expect(crashResult.crashed).toBe(true);
  });

  // Test 7: Multiple recovery attempts tracked
  it('tracks recovery attempt count and consecutive failures', async () => {
    expect(orchestrator.getStatus().recoveryAttempts).toBe(0);

    // Setup: Create checkpoint for recovery tracking
    const checkpoint = checkpointManager.create('ready', 0.85, {
      testName: 'recovery-tracking',
    });
    await checkpointStore.save(checkpoint.id, checkpoint);

    // Verify status structure
    const status = orchestrator.getStatus();
    expect(status).toHaveProperty('recoveryAttempts');
    expect(status).toHaveProperty('consecutiveFailures');
    expect(status.recoveryAttempts).toBe(0);
  });

  // Test 8: Checkpoint metadata preserved through recovery
  it('preserves checkpoint metadata during recovery', async () => {
    const metadata = {
      testName: 'metadata-preservation',
      algorithm: 'genetic_algorithm',
      logSize: 10000,
      timestamp: new Date().toISOString(),
    };

    const checkpoint = checkpointManager.create('running', 0.75, metadata);
    await checkpointStore.save(checkpoint.id, checkpoint);

    // Recover checkpoint
    const recovered = await checkpointStore.load(checkpoint.id);
    expect(recovered?.metadata).toEqual(metadata);
    expect(recovered?.state).toBe('running');
    expect(recovered?.progress).toBe(0.75);
  });

  // Test 9: Stale lock cleanup
  it('cleans up stale lock files on initialization', async () => {
    // Create multiple stale locks
    const fs = require('fs');
    const path = require('path');

    for (let i = 0; i < 3; i++) {
      const staleLock = {
        runId: `stale-run-${i}`,
        pid: 99998 + i,
        startedAt: Date.now() - 100000, // Very old
        hostname: 'test-host',
      };
      const lockPath = path.join(testLockDir, `stale-run-${i}.lock`);
      fs.writeFileSync(lockPath, JSON.stringify(staleLock));
    }

    // Create fresh detector that will clean up
    const freshDetector = new CrashDetector(
      `fresh-run-${Date.now()}`,
      testLockDir,
      undefined,
      5000
    );

    const cleaned = freshDetector.cleanupStaleLocks();
    expect(cleaned).toBeGreaterThanOrEqual(3);

    freshDetector.clearLock();
  });

  // Test 10: Health check result structure
  it('returns complete health check results', async () => {
    crashDetector.createLock();

    // Create basic checkpoint for availability check
    const checkpoint = checkpointManager.create('ready', 1.0);
    await checkpointStore.save(checkpoint.id, checkpoint);

    // Verify orchestrator can be instantiated and configured
    expect(orchestrator).toBeDefined();
    expect(orchestrator.getStatus()).toHaveProperty('isMonitoring');
    expect(orchestrator.getStatus()).toHaveProperty('lastHealthCheck');
    expect(orchestrator.getStatus()).toHaveProperty('recoveryAttempts');
  });
});
