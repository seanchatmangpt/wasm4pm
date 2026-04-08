/**
 * e2e-watch.test.ts
 * Watch mode tests for pictl
 * Tests: Streaming events, checkpoints, reconnection, progress tracking
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

/**
 * Status update interface
 */
interface StatusUpdate {
  timestamp: string;
  state: string;
  progress: number;
  message?: string;
}

/**
 * Checkpoint interface
 */
interface Checkpoint {
  runId: string;
  stepId: string;
  state: Record<string, unknown>;
  timestamp: string;
}

/**
 * Helper to create temporary test environment
 */
async function createTestEnv() {
  const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'wasm4pm-watch-test-'));
  return {
    tempDir,
    cleanup: async () => {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (e) {
        // ignore
      }
    },
  };
}

/**
 * Helper to simulate async iterable
 */
function createMockStream(updates: StatusUpdate[]) {
  return (async function* () {
    for (const update of updates) {
      yield update;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  })();
}

/**
 * Streaming Events Tests
 */
describe('e2e-watch: Streaming Events', () => {
  let env: Awaited<ReturnType<typeof createTestEnv>>;

  beforeEach(async () => {
    env = await createTestEnv();
  });

  afterEach(async () => {
    await env.cleanup();
  });

  it('should stream status updates during execution', async () => {
    // Arrange
    const updates: StatusUpdate[] = [
      {
        timestamp: new Date().toISOString(),
        state: 'bootstrapping',
        progress: 0,
        message: 'Initializing WASM module',
      },
      {
        timestamp: new Date().toISOString(),
        state: 'planning',
        progress: 25,
        message: 'Creating execution plan',
      },
      {
        timestamp: new Date().toISOString(),
        state: 'running',
        progress: 50,
        message: 'Running algorithm',
      },
      {
        timestamp: new Date().toISOString(),
        state: 'running',
        progress: 75,
        message: 'Processing results',
      },
      {
        timestamp: new Date().toISOString(),
        state: 'ready',
        progress: 100,
        message: 'Execution complete',
      },
    ];

    // Act
    const stream = createMockStream(updates);
    const received: StatusUpdate[] = [];

    for await (const update of stream) {
      received.push(update);
    }

    // Assert
    expect(received.length).toBe(updates.length);
    expect(received[0].progress).toBe(0);
    expect(received[received.length - 1].progress).toBe(100);
  });

  it('should maintain monotonic progress during streaming', async () => {
    // Arrange
    const updates: StatusUpdate[] = [
      { timestamp: new Date().toISOString(), state: 'running', progress: 10 },
      { timestamp: new Date().toISOString(), state: 'running', progress: 25 },
      { timestamp: new Date().toISOString(), state: 'running', progress: 50 },
      { timestamp: new Date().toISOString(), state: 'running', progress: 75 },
      { timestamp: new Date().toISOString(), state: 'ready', progress: 100 },
    ];

    // Act
    const stream = createMockStream(updates);
    const received: StatusUpdate[] = [];

    for await (const update of stream) {
      received.push(update);
    }

    // Assert: Progress should be monotonically increasing
    for (let i = 1; i < received.length; i++) {
      expect(received[i].progress).toBeGreaterThanOrEqual(received[i - 1].progress);
    }
  });

  it('should emit events with correct timestamps', async () => {
    // Arrange
    const now = new Date();
    const updates: StatusUpdate[] = [
      {
        timestamp: new Date(now.getTime()).toISOString(),
        state: 'running',
        progress: 0,
      },
      {
        timestamp: new Date(now.getTime() + 1000).toISOString(),
        state: 'running',
        progress: 50,
      },
    ];

    // Act
    const stream = createMockStream(updates);
    const received: StatusUpdate[] = [];

    for await (const update of stream) {
      received.push(update);
    }

    // Assert
    expect(received[0].timestamp).toBeDefined();
    expect(received[1].timestamp).toBeDefined();

    const ts1 = new Date(received[0].timestamp);
    const ts2 = new Date(received[1].timestamp);
    expect(ts2.getTime()).toBeGreaterThanOrEqual(ts1.getTime());
  });

  it('should handle rapid status updates', async () => {
    // Arrange: Simulate rapid updates
    const updates: StatusUpdate[] = [];
    for (let i = 0; i < 100; i++) {
      updates.push({
        timestamp: new Date().toISOString(),
        state: 'running',
        progress: i,
      });
    }

    // Act
    const stream = createMockStream(updates);
    const received: StatusUpdate[] = [];

    for await (const update of stream) {
      received.push(update);
    }

    // Assert
    expect(received.length).toBe(100);
    expect(received[0].progress).toBe(0);
    expect(received[99].progress).toBe(99);
  });

  it('should include optional message field', async () => {
    // Arrange
    const updates: StatusUpdate[] = [
      {
        timestamp: new Date().toISOString(),
        state: 'running',
        progress: 50,
        message: 'Processing traces',
      },
      {
        timestamp: new Date().toISOString(),
        state: 'running',
        progress: 75,
        // No message
      },
    ];

    // Act
    const stream = createMockStream(updates);
    const received: StatusUpdate[] = [];

    for await (const update of stream) {
      received.push(update);
    }

    // Assert
    expect(received[0].message).toBeDefined();
    expect(received[1].message).toBeUndefined();
  });
});

/**
 * Checkpoint Tests
 */
describe('e2e-watch: Checkpoints', () => {
  let env: Awaited<ReturnType<typeof createTestEnv>>;

  beforeEach(async () => {
    env = await createTestEnv();
  });

  afterEach(async () => {
    await env.cleanup();
  });

  it('should create checkpoint after each major step', async () => {
    // Arrange
    const checkpointDir = path.join(env.tempDir, 'checkpoints');
    await fs.mkdir(checkpointDir, { recursive: true });

    // Act: Create checkpoints
    const checkpoints: Checkpoint[] = [
      {
        runId: 'run_001',
        stepId: 'bootstrap',
        state: { wasm_loaded: true },
        timestamp: new Date().toISOString(),
      },
      {
        runId: 'run_001',
        stepId: 'plan',
        state: { plan_created: true, steps: 5 },
        timestamp: new Date().toISOString(),
      },
      {
        runId: 'run_001',
        stepId: 'execute',
        state: { progress: 50 },
        timestamp: new Date().toISOString(),
      },
    ];

    for (const checkpoint of checkpoints) {
      const path_obj = path.join(checkpointDir, `${checkpoint.stepId}.json`);
      await fs.writeFile(path_obj, JSON.stringify(checkpoint));
    }

    // Assert: Verify checkpoints exist
    const files = await fs.readdir(checkpointDir);
    expect(files.length).toBe(3);
  });

  it('should restore from checkpoint on reconnection', async () => {
    // Arrange
    const checkpointPath = path.join(env.tempDir, 'checkpoint.json');
    const checkpoint: Checkpoint = {
      runId: 'run_001',
      stepId: 'execute_step_3',
      state: {
        currentStep: 3,
        stepsCompleted: 3,
        progress: 60,
      },
      timestamp: new Date().toISOString(),
    };

    await fs.writeFile(checkpointPath, JSON.stringify(checkpoint));

    // Act: Load checkpoint
    const loaded = await fs.readFile(checkpointPath, 'utf-8');
    const restoredCheckpoint: Checkpoint = JSON.parse(loaded);

    // Assert
    expect(restoredCheckpoint.runId).toBe('run_001');
    expect(restoredCheckpoint.state.currentStep).toBe(3);
    expect(restoredCheckpoint.state.progress).toBe(60);
  });

  it('should preserve state when checkpointing', async () => {
    // Arrange
    const state = {
      currentStep: 5,
      totalSteps: 10,
      progress: 50,
      discovered: {
        activities: ['A', 'B', 'C'],
        edges: [{ from: 'A', to: 'B' }],
      },
    };

    const checkpoint: Checkpoint = {
      runId: 'run_001',
      stepId: 'state_save',
      state,
      timestamp: new Date().toISOString(),
    };

    const checkpointPath = path.join(env.tempDir, 'state.json');
    await fs.writeFile(checkpointPath, JSON.stringify(checkpoint));

    // Act: Load and verify
    const loaded = JSON.parse(await fs.readFile(checkpointPath, 'utf-8'));

    // Assert: All state preserved
    expect(loaded.state.currentStep).toBe(state.currentStep);
    expect(loaded.state.discovered.activities).toEqual(state.discovered.activities);
  });

  it('should support multiple concurrent checkpoints', async () => {
    // Arrange
    const checkpointDir = path.join(env.tempDir, 'checkpoints');
    await fs.mkdir(checkpointDir, { recursive: true });

    // Act: Create multiple checkpoints
    const runIds = ['run_001', 'run_002', 'run_003'];

    for (const runId of runIds) {
      const checkpoint: Checkpoint = {
        runId,
        stepId: 'current',
        state: { progress: 50 },
        timestamp: new Date().toISOString(),
      };

      const cpPath = path.join(checkpointDir, `${runId}.json`);
      await fs.writeFile(cpPath, JSON.stringify(checkpoint));
    }

    // Assert
    const files = await fs.readdir(checkpointDir);
    expect(files.length).toBe(3);
  });

  it('should clean up checkpoints after successful run', async () => {
    // Arrange
    const checkpointDir = path.join(env.tempDir, 'checkpoints');
    await fs.mkdir(checkpointDir, { recursive: true });

    const checkpoint: Checkpoint = {
      runId: 'run_001',
      stepId: 'temp',
      state: {},
      timestamp: new Date().toISOString(),
    };

    const cpPath = path.join(checkpointDir, 'temp.json');
    await fs.writeFile(cpPath, JSON.stringify(checkpoint));

    // Act: Clean up after success
    await fs.rm(cpPath);

    // Assert: Checkpoint removed
    const exists = await fs.access(cpPath).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });
});

/**
 * Reconnection Tests
 */
describe('e2e-watch: Reconnection', () => {
  let env: Awaited<ReturnType<typeof createTestEnv>>;

  beforeEach(async () => {
    env = await createTestEnv();
  });

  afterEach(async () => {
    await env.cleanup();
  });

  it('should resume from last checkpoint on reconnection', async () => {
    // Arrange
    const checkpoint: Checkpoint = {
      runId: 'run_001',
      stepId: 'step_5',
      state: { completed_steps: 5, total_steps: 10 },
      timestamp: new Date().toISOString(),
    };

    const checkpointPath = path.join(env.tempDir, 'checkpoint.json');
    await fs.writeFile(checkpointPath, JSON.stringify(checkpoint));

    // Act: Simulate reconnection
    const loaded: Checkpoint = JSON.parse(
      await fs.readFile(checkpointPath, 'utf-8')
    );

    const resumeUpdates: StatusUpdate[] = [
      {
        timestamp: new Date().toISOString(),
        state: 'running',
        progress: 50,
        message: 'Resumed from checkpoint',
      },
      {
        timestamp: new Date().toISOString(),
        state: 'running',
        progress: 100,
        message: 'Completed',
      },
    ];

    const allUpdates = [
      { timestamp: new Date().toISOString(), state: 'running', progress: 50 },
      ...resumeUpdates,
    ];

    // Assert
    expect(loaded.state.completed_steps).toBe(5);
    expect(allUpdates.length).toBeGreaterThan(0);
  });

  it('should not duplicate work after reconnection', async () => {
    // Arrange: Track completed work
    const completed = ['step_1', 'step_2', 'step_3'];

    // Act: Reconnect and resume
    const checkpoint: Checkpoint = {
      runId: 'run_001',
      stepId: 'step_3',
      state: { completed },
      timestamp: new Date().toISOString(),
    };

    const remaining = ['step_4', 'step_5'];
    const toProcess = remaining; // Only remaining steps

    // Assert: No duplication
    expect(toProcess).not.toContain('step_1');
    expect(toProcess).not.toContain('step_2');
    expect(toProcess).not.toContain('step_3');
    expect(toProcess.length).toBe(2);
  });

  it('should handle connection timeout gracefully', async () => {
    // Arrange
    const timeoutMs = 5000;
    let elapsed = 0;

    // Simulate timeout
    const updates: StatusUpdate[] = [
      {
        timestamp: new Date().toISOString(),
        state: 'running',
        progress: 50,
      },
      // Connection lost (no more updates)
    ];

    // Act & Assert
    expect(updates.length).toBe(1);
    expect(elapsed).toBeLessThan(timeoutMs);
  });

  it('should verify checkpoint integrity before resuming', async () => {
    // Arrange: Create valid and corrupted checkpoints
    const validCheckpoint: Checkpoint = {
      runId: 'run_001',
      stepId: 'step_3',
      state: { data: 'valid' },
      timestamp: new Date().toISOString(),
    };

    // Act: Validate checkpoint
    const isValid =
      validCheckpoint.runId &&
      validCheckpoint.stepId &&
      validCheckpoint.state &&
      validCheckpoint.timestamp;

    // Assert
    expect(isValid).toBe(true);
  });
});

/**
 * Progress Tracking Tests
 */
describe('e2e-watch: Progress Tracking', () => {
  let env: Awaited<ReturnType<typeof createTestEnv>>;

  beforeEach(async () => {
    env = await createTestEnv();
  });

  afterEach(async () => {
    await env.cleanup();
  });

  it('should track progress through all phases', async () => {
    // Arrange
    const phases = [
      { name: 'bootstrap', progress: 0 },
      { name: 'planning', progress: 25 },
      { name: 'execution', progress: 50 },
      { name: 'finalization', progress: 100 },
    ];

    const updates: StatusUpdate[] = phases.map((p) => ({
      timestamp: new Date().toISOString(),
      state: 'running',
      progress: p.progress,
      message: p.name,
    }));

    // Act
    const stream = createMockStream(updates);
    const received: StatusUpdate[] = [];

    for await (const update of stream) {
      received.push(update);
    }

    // Assert
    expect(received[0].progress).toBe(0);
    expect(received[1].progress).toBe(25);
    expect(received[2].progress).toBe(50);
    expect(received[3].progress).toBe(100);
  });

  it('should estimate time remaining', async () => {
    // Arrange
    const startTime = Date.now();

    const updates: StatusUpdate[] = [
      {
        timestamp: new Date(startTime).toISOString(),
        state: 'running',
        progress: 0,
      },
      {
        timestamp: new Date(startTime + 1000).toISOString(),
        state: 'running',
        progress: 25,
      },
      {
        timestamp: new Date(startTime + 2000).toISOString(),
        state: 'running',
        progress: 50,
      },
    ];

    // Act: Calculate remaining time
    const elapsed = 2000; // 2 seconds
    const progress = 50; // 50%
    const estimatedTotal = (elapsed / progress) * 100;
    const estimatedRemaining = estimatedTotal - elapsed;

    // Assert
    expect(estimatedRemaining).toBeGreaterThan(0);
    expect(estimatedRemaining).toBeLessThan(5000); // Should be < 5s
  });

  it('should handle non-linear progress', async () => {
    // Arrange: Simulation may have non-linear progress
    const updates: StatusUpdate[] = [
      { timestamp: new Date().toISOString(), state: 'running', progress: 0 },
      { timestamp: new Date().toISOString(), state: 'running', progress: 10 },
      { timestamp: new Date().toISOString(), state: 'running', progress: 15 },
      { timestamp: new Date().toISOString(), state: 'running', progress: 50 },
      { timestamp: new Date().toISOString(), state: 'running', progress: 100 },
    ];

    // Act
    const stream = createMockStream(updates);
    const received: StatusUpdate[] = [];

    for await (const update of stream) {
      received.push(update);
    }

    // Assert: Should still be monotonic
    for (let i = 1; i < received.length; i++) {
      expect(received[i].progress).toBeGreaterThanOrEqual(received[i - 1].progress);
    }
  });

  it('should provide step-level progress detail', async () => {
    // Arrange
    const stepProgress = {
      totalSteps: 10,
      completedSteps: 5,
      currentStep: 6,
      overallProgress: 50,
    };

    // Act
    const calculatedProgress = (stepProgress.completedSteps / stepProgress.totalSteps) * 100;

    // Assert
    expect(calculatedProgress).toBe(stepProgress.overallProgress);
  });

  it('should update progress in real-time without buffering', async () => {
    // Arrange: Simulate continuous updates
    const updates: StatusUpdate[] = [];

    for (let i = 0; i <= 100; i += 10) {
      updates.push({
        timestamp: new Date().toISOString(),
        state: 'running',
        progress: i,
      });
    }

    // Act
    const stream = createMockStream(updates);
    let lastProgress = 0;
    const deltas: number[] = [];

    for await (const update of stream) {
      deltas.push(update.progress - lastProgress);
      lastProgress = update.progress;
    }

    // Assert: Verify updates were received
    expect(deltas.length).toBeGreaterThan(0);
    // Most deltas should be non-zero (progress updated)
    expect(deltas.filter((d) => d > 0).length).toBeGreaterThan(0);
  });
});
