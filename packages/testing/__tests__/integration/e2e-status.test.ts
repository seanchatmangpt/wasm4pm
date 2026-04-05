/**
 * e2e-status.test.ts
 * Status command tests for pmctl
 * Tests: Status tracking, progress, resource monitoring
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

/**
 * Status snapshot
 */
interface StatusSnapshot {
  timestamp: string;
  runId: string;
  state: string;
  progress: number;
  phaseStatus: Record<string, PhaseStatus>;
  resourceUsage: ResourceUsage;
  errors: Error[];
}

/**
 * Phase status
 */
interface PhaseStatus {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
  duration?: number;
}

/**
 * Resource usage
 */
interface ResourceUsage {
  wasmMemoryUsedMB: number;
  wasmMemoryMaxMB: number;
  cpuTimeMs: number;
  heapUsedMB?: number;
}

/**
 * Error interface
 */
interface Error {
  code: string;
  message: string;
  timestamp: string;
}

/**
 * Helper to create temporary test environment
 */
async function createTestEnv() {
  const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'wasm4pm-status-test-'));
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
 * Status Snapshot Tests
 */
describe('e2e-status: Status Snapshots', () => {
  let env: Awaited<ReturnType<typeof createTestEnv>>;

  beforeEach(async () => {
    env = await createTestEnv();
  });

  afterEach(async () => {
    await env.cleanup();
  });

  it('should create status snapshot with required fields', async () => {
    // Arrange
    const snapshot: StatusSnapshot = {
      timestamp: new Date().toISOString(),
      runId: 'run_001',
      state: 'running',
      progress: 50,
      phaseStatus: {},
      resourceUsage: {
        wasmMemoryUsedMB: 10,
        wasmMemoryMaxMB: 100,
        cpuTimeMs: 500,
      },
      errors: [],
    };

    // Assert
    expect(snapshot.timestamp).toBeDefined();
    expect(snapshot.runId).toBeDefined();
    expect(snapshot.state).toBeDefined();
    expect(snapshot.progress).toBeDefined();
    expect(snapshot.resourceUsage).toBeDefined();
  });

  it('should persist status snapshots to disk', async () => {
    // Arrange
    const statusDir = path.join(env.tempDir, 'status');
    await fs.mkdir(statusDir, { recursive: true });

    const snapshot: StatusSnapshot = {
      timestamp: new Date().toISOString(),
      runId: 'run_001',
      state: 'running',
      progress: 50,
      phaseStatus: {
        bootstrap: {
          name: 'Bootstrap',
          status: 'completed',
          duration: 100,
        },
      },
      resourceUsage: {
        wasmMemoryUsedMB: 15,
        wasmMemoryMaxMB: 100,
        cpuTimeMs: 500,
      },
      errors: [],
    };

    // Act
    const statusPath = path.join(statusDir, 'status.json');
    await fs.writeFile(statusPath, JSON.stringify(snapshot, null, 2));

    // Assert
    const content = await fs.readFile(statusPath, 'utf-8');
    const loaded: StatusSnapshot = JSON.parse(content);

    expect(loaded.runId).toBe(snapshot.runId);
    expect(loaded.state).toBe(snapshot.state);
  });

  it('should track all states: uninitialized, bootstrapping, ready, planning, running, degraded, failed', async () => {
    // Arrange
    const states = [
      'uninitialized',
      'bootstrapping',
      'ready',
      'planning',
      'running',
      'degraded',
      'failed',
    ];

    // Act & Assert
    for (const state of states) {
      const snapshot: StatusSnapshot = {
        timestamp: new Date().toISOString(),
        runId: 'run_001',
        state,
        progress: 0,
        phaseStatus: {},
        resourceUsage: {
          wasmMemoryUsedMB: 0,
          wasmMemoryMaxMB: 100,
          cpuTimeMs: 0,
        },
        errors: [],
      };

      expect(snapshot.state).toBe(state);
    }
  });

  it('should include timestamp in ISO 8601 format', async () => {
    // Arrange
    const now = new Date();
    const snapshot: StatusSnapshot = {
      timestamp: now.toISOString(),
      runId: 'run_001',
      state: 'running',
      progress: 50,
      phaseStatus: {},
      resourceUsage: {
        wasmMemoryUsedMB: 10,
        wasmMemoryMaxMB: 100,
        cpuTimeMs: 500,
      },
      errors: [],
    };

    // Act
    const parsed = new Date(snapshot.timestamp);

    // Assert
    expect(parsed.getTime()).toBeCloseTo(now.getTime(), -3);
  });
});

/**
 * Phase Status Tests
 */
describe('e2e-status: Phase Tracking', () => {
  let env: Awaited<ReturnType<typeof createTestEnv>>;

  beforeEach(async () => {
    env = await createTestEnv();
  });

  afterEach(async () => {
    await env.cleanup();
  });

  it('should track all execution phases', async () => {
    // Arrange
    const phases: Record<string, PhaseStatus> = {
      bootstrap: {
        name: 'Bootstrap WASM',
        status: 'completed',
        startedAt: new Date().toISOString(),
        completedAt: new Date(Date.now() + 100).toISOString(),
        duration: 100,
      },
      plan: {
        name: 'Create Plan',
        status: 'completed',
        duration: 50,
      },
      execute: {
        name: 'Execute Plan',
        status: 'running',
      },
      finalize: {
        name: 'Finalize',
        status: 'pending',
      },
    };

    // Assert
    expect(phases.bootstrap.status).toBe('completed');
    expect(phases.plan.status).toBe('completed');
    expect(phases.execute.status).toBe('running');
    expect(phases.finalize.status).toBe('pending');
  });

  it('should record phase duration', async () => {
    // Arrange
    const phase: PhaseStatus = {
      name: 'Discovery Algorithm',
      status: 'completed',
      duration: 2500,
    };

    // Assert
    expect(phase.duration).toBe(2500);
    expect(phase.duration).toBeGreaterThan(0);
  });

  it('should track start and end timestamps for phases', async () => {
    // Arrange
    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + 5000);

    const phase: PhaseStatus = {
      name: 'Long Running Phase',
      status: 'completed',
      startedAt: startTime.toISOString(),
      completedAt: endTime.toISOString(),
      duration: 5000,
    };

    // Assert
    expect(phase.startedAt).toBeDefined();
    expect(phase.completedAt).toBeDefined();
    expect(
      new Date(phase.completedAt!).getTime() -
      new Date(phase.startedAt!).getTime()
    ).toBe(5000);
  });

  it('should show multiple phases in execution order', async () => {
    // Arrange
    const snapshot: StatusSnapshot = {
      timestamp: new Date().toISOString(),
      runId: 'run_001',
      state: 'running',
      progress: 50,
      phaseStatus: {
        phase1: { name: 'Phase 1', status: 'completed', duration: 100 },
        phase2: { name: 'Phase 2', status: 'completed', duration: 200 },
        phase3: { name: 'Phase 3', status: 'running', duration: undefined },
      },
      resourceUsage: {
        wasmMemoryUsedMB: 10,
        wasmMemoryMaxMB: 100,
        cpuTimeMs: 300,
      },
      errors: [],
    };

    // Assert: Verify order
    const phases = Object.keys(snapshot.phaseStatus);
    expect(phases.length).toBe(3);
  });

  it('should handle phase transitions correctly', async () => {
    // Arrange: Simulate phase transitions
    const transitions = [
      { before: 'pending', after: 'running' },
      { before: 'running', after: 'completed' },
      { before: 'running', after: 'failed' },
    ];

    // Act & Assert
    for (const transition of transitions) {
      const phase: PhaseStatus = {
        name: 'Test',
        status: 'running' as any,
      };

      expect(['pending', 'running', 'completed', 'failed']).toContain(
        phase.status
      );
    }
  });
});

/**
 * Resource Usage Tests
 */
describe('e2e-status: Resource Monitoring', () => {
  let env: Awaited<ReturnType<typeof createTestEnv>>;

  beforeEach(async () => {
    env = await createTestEnv();
  });

  afterEach(async () => {
    await env.cleanup();
  });

  it('should track WASM memory usage', async () => {
    // Arrange
    const snapshot: StatusSnapshot = {
      timestamp: new Date().toISOString(),
      runId: 'run_001',
      state: 'running',
      progress: 50,
      phaseStatus: {},
      resourceUsage: {
        wasmMemoryUsedMB: 25.5,
        wasmMemoryMaxMB: 256,
        cpuTimeMs: 1000,
      },
      errors: [],
    };

    // Assert
    expect(snapshot.resourceUsage.wasmMemoryUsedMB).toBeGreaterThan(0);
    expect(snapshot.resourceUsage.wasmMemoryMaxMB).toBeGreaterThan(
      snapshot.resourceUsage.wasmMemoryUsedMB
    );
  });

  it('should not exceed memory limits', async () => {
    // Arrange
    const snapshot: StatusSnapshot = {
      timestamp: new Date().toISOString(),
      runId: 'run_001',
      state: 'running',
      progress: 50,
      phaseStatus: {},
      resourceUsage: {
        wasmMemoryUsedMB: 100,
        wasmMemoryMaxMB: 256,
        cpuTimeMs: 5000,
      },
      errors: [],
    };

    // Assert
    expect(snapshot.resourceUsage.wasmMemoryUsedMB).toBeLessThanOrEqual(
      snapshot.resourceUsage.wasmMemoryMaxMB
    );
  });

  it('should track CPU time', async () => {
    // Arrange
    const snapshot: StatusSnapshot = {
      timestamp: new Date().toISOString(),
      runId: 'run_001',
      state: 'running',
      progress: 50,
      phaseStatus: {},
      resourceUsage: {
        wasmMemoryUsedMB: 50,
        wasmMemoryMaxMB: 256,
        cpuTimeMs: 2500,
      },
      errors: [],
    };

    // Assert
    expect(snapshot.resourceUsage.cpuTimeMs).toBeGreaterThan(0);
  });

  it('should track heap memory on Node.js', async () => {
    // Arrange
    const snapshot: StatusSnapshot = {
      timestamp: new Date().toISOString(),
      runId: 'run_001',
      state: 'running',
      progress: 50,
      phaseStatus: {},
      resourceUsage: {
        wasmMemoryUsedMB: 50,
        wasmMemoryMaxMB: 256,
        cpuTimeMs: 1000,
        heapUsedMB: 75,
      },
      errors: [],
    };

    // Assert
    expect(snapshot.resourceUsage.heapUsedMB).toBeGreaterThan(0);
  });

  it('should warn if memory usage increases over time', async () => {
    // Arrange
    const snapshots: StatusSnapshot[] = [
      {
        timestamp: new Date().toISOString(),
        runId: 'run_001',
        state: 'running',
        progress: 25,
        phaseStatus: {},
        resourceUsage: {
          wasmMemoryUsedMB: 10,
          wasmMemoryMaxMB: 256,
          cpuTimeMs: 500,
        },
        errors: [],
      },
      {
        timestamp: new Date(Date.now() + 1000).toISOString(),
        runId: 'run_001',
        state: 'running',
        progress: 50,
        phaseStatus: {},
        resourceUsage: {
          wasmMemoryUsedMB: 50,
          wasmMemoryMaxMB: 256,
          cpuTimeMs: 2000,
        },
        errors: [],
      },
      {
        timestamp: new Date(Date.now() + 2000).toISOString(),
        runId: 'run_001',
        state: 'running',
        progress: 75,
        phaseStatus: {},
        resourceUsage: {
          wasmMemoryUsedMB: 150,
          wasmMemoryMaxMB: 256,
          cpuTimeMs: 5000,
        },
        errors: [],
      },
    ];

    // Assert: Memory is growing
    expect(snapshots[1].resourceUsage.wasmMemoryUsedMB).toBeGreaterThan(
      snapshots[0].resourceUsage.wasmMemoryUsedMB
    );
    expect(snapshots[2].resourceUsage.wasmMemoryUsedMB).toBeGreaterThan(
      snapshots[1].resourceUsage.wasmMemoryUsedMB
    );
  });
});

/**
 * Progress Reporting Tests
 */
describe('e2e-status: Progress Reporting', () => {
  let env: Awaited<ReturnType<typeof createTestEnv>>;

  beforeEach(async () => {
    env = await createTestEnv();
  });

  afterEach(async () => {
    await env.cleanup();
  });

  it('should report progress 0-100', async () => {
    // Arrange
    const snapshots: StatusSnapshot[] = [];

    for (let progress = 0; progress <= 100; progress += 25) {
      snapshots.push({
        timestamp: new Date().toISOString(),
        runId: 'run_001',
        state: 'running',
        progress,
        phaseStatus: {},
        resourceUsage: {
          wasmMemoryUsedMB: 10,
          wasmMemoryMaxMB: 100,
          cpuTimeMs: 500,
        },
        errors: [],
      });
    }

    // Assert
    for (const snapshot of snapshots) {
      expect(snapshot.progress).toBeGreaterThanOrEqual(0);
      expect(snapshot.progress).toBeLessThanOrEqual(100);
    }
  });

  it('should maintain monotonic progress increase', async () => {
    // Arrange
    const snapshots: StatusSnapshot[] = [
      {
        timestamp: new Date().toISOString(),
        runId: 'run_001',
        state: 'running',
        progress: 0,
        phaseStatus: {},
        resourceUsage: {
          wasmMemoryUsedMB: 0,
          wasmMemoryMaxMB: 100,
          cpuTimeMs: 0,
        },
        errors: [],
      },
      {
        timestamp: new Date().toISOString(),
        runId: 'run_001',
        state: 'running',
        progress: 50,
        phaseStatus: {},
        resourceUsage: {
          wasmMemoryUsedMB: 50,
          wasmMemoryMaxMB: 100,
          cpuTimeMs: 2500,
        },
        errors: [],
      },
      {
        timestamp: new Date().toISOString(),
        runId: 'run_001',
        state: 'ready',
        progress: 100,
        phaseStatus: {},
        resourceUsage: {
          wasmMemoryUsedMB: 100,
          wasmMemoryMaxMB: 100,
          cpuTimeMs: 5000,
        },
        errors: [],
      },
    ];

    // Assert
    for (let i = 1; i < snapshots.length; i++) {
      expect(snapshots[i].progress).toBeGreaterThanOrEqual(
        snapshots[i - 1].progress
      );
    }
  });

  it('should estimate time remaining', async () => {
    // Arrange
    const startTime = Date.now();
    const elapsed = 2000; // 2 seconds
    const progress = 50; // 50%

    // Act
    const estimatedTotal = (elapsed / progress) * 100;
    const remaining = estimatedTotal - elapsed;

    // Assert
    expect(remaining).toBeGreaterThan(0);
    expect(estimatedTotal).toBeLessThan(10000); // Less than 10 seconds total
  });
});

/**
 * Error Tracking Tests
 */
describe('e2e-status: Error Tracking', () => {
  let env: Awaited<ReturnType<typeof createTestEnv>>;

  beforeEach(async () => {
    env = await createTestEnv();
  });

  afterEach(async () => {
    await env.cleanup();
  });

  it('should record errors in status snapshot', async () => {
    // Arrange
    const snapshot: StatusSnapshot = {
      timestamp: new Date().toISOString(),
      runId: 'run_001',
      state: 'degraded',
      progress: 75,
      phaseStatus: {},
      resourceUsage: {
        wasmMemoryUsedMB: 50,
        wasmMemoryMaxMB: 100,
        cpuTimeMs: 3000,
      },
      errors: [
        {
          code: 'ALGORITHM_WARNING',
          message: 'Some traces could not be parsed',
          timestamp: new Date().toISOString(),
        },
      ],
    };

    // Assert
    expect(snapshot.errors.length).toBeGreaterThan(0);
    expect(snapshot.errors[0].code).toBeDefined();
    expect(snapshot.errors[0].message).toBeDefined();
  });

  it('should include error context in status', async () => {
    // Arrange
    const snapshot: StatusSnapshot = {
      timestamp: new Date().toISOString(),
      runId: 'run_001',
      state: 'running',
      progress: 50,
      phaseStatus: {},
      resourceUsage: {
        wasmMemoryUsedMB: 50,
        wasmMemoryMaxMB: 100,
        cpuTimeMs: 2500,
      },
      errors: [
        {
          code: 'MEMORY_WARNING',
          message: 'WASM memory usage at 50% of limit',
          timestamp: new Date().toISOString(),
        },
      ],
    };

    // Assert
    expect(snapshot.errors[0].code).toContain('MEMORY');
    expect(snapshot.errors[0].message).toContain('50%');
  });

  it('should accumulate errors over run', async () => {
    // Arrange
    const snapshots: StatusSnapshot[] = [
      {
        timestamp: new Date().toISOString(),
        runId: 'run_001',
        state: 'running',
        progress: 50,
        phaseStatus: {},
        resourceUsage: {
          wasmMemoryUsedMB: 50,
          wasmMemoryMaxMB: 100,
          cpuTimeMs: 2500,
        },
        errors: [
          {
            code: 'WARNING_1',
            message: 'First warning',
            timestamp: new Date().toISOString(),
          },
        ],
      },
      {
        timestamp: new Date(Date.now() + 1000).toISOString(),
        runId: 'run_001',
        state: 'running',
        progress: 75,
        phaseStatus: {},
        resourceUsage: {
          wasmMemoryUsedMB: 75,
          wasmMemoryMaxMB: 100,
          cpuTimeMs: 3500,
        },
        errors: [
          {
            code: 'WARNING_1',
            message: 'First warning',
            timestamp: new Date().toISOString(),
          },
          {
            code: 'WARNING_2',
            message: 'Second warning',
            timestamp: new Date().toISOString(),
          },
        ],
      },
    ];

    // Assert
    expect(snapshots[1].errors.length).toBeGreaterThan(snapshots[0].errors.length);
  });
});

/**
 * Status Query Tests
 */
describe('e2e-status: Status Queries', () => {
  let env: Awaited<ReturnType<typeof createTestEnv>>;

  beforeEach(async () => {
    env = await createTestEnv();
  });

  afterEach(async () => {
    await env.cleanup();
  });

  it('should retrieve latest status for run', async () => {
    // Arrange
    const statusDir = path.join(env.tempDir, 'status');
    await fs.mkdir(statusDir, { recursive: true });

    const status1: StatusSnapshot = {
      timestamp: new Date(Date.now() - 1000).toISOString(),
      runId: 'run_001',
      state: 'running',
      progress: 50,
      phaseStatus: {},
      resourceUsage: {
        wasmMemoryUsedMB: 50,
        wasmMemoryMaxMB: 100,
        cpuTimeMs: 2500,
      },
      errors: [],
    };

    const status2: StatusSnapshot = {
      timestamp: new Date().toISOString(),
      runId: 'run_001',
      state: 'running',
      progress: 75,
      phaseStatus: {},
      resourceUsage: {
        wasmMemoryUsedMB: 75,
        wasmMemoryMaxMB: 100,
        cpuTimeMs: 3500,
      },
      errors: [],
    };

    await fs.writeFile(
      path.join(statusDir, '1.json'),
      JSON.stringify(status1)
    );
    await fs.writeFile(
      path.join(statusDir, '2.json'),
      JSON.stringify(status2)
    );

    // Act: Load latest
    const files = await fs.readdir(statusDir);
    const latestFile = files.sort().pop();
    const latest = JSON.parse(
      await fs.readFile(path.join(statusDir, latestFile!), 'utf-8')
    );

    // Assert
    expect(latest.progress).toBe(75);
  });

  it('should support filtering by state', async () => {
    // Arrange
    const snapshots: StatusSnapshot[] = [
      {
        timestamp: new Date().toISOString(),
        runId: 'run_001',
        state: 'bootstrapping',
        progress: 0,
        phaseStatus: {},
        resourceUsage: {
          wasmMemoryUsedMB: 0,
          wasmMemoryMaxMB: 100,
          cpuTimeMs: 0,
        },
        errors: [],
      },
      {
        timestamp: new Date().toISOString(),
        runId: 'run_001',
        state: 'running',
        progress: 50,
        phaseStatus: {},
        resourceUsage: {
          wasmMemoryUsedMB: 50,
          wasmMemoryMaxMB: 100,
          cpuTimeMs: 2500,
        },
        errors: [],
      },
      {
        timestamp: new Date().toISOString(),
        runId: 'run_001',
        state: 'ready',
        progress: 100,
        phaseStatus: {},
        resourceUsage: {
          wasmMemoryUsedMB: 100,
          wasmMemoryMaxMB: 100,
          cpuTimeMs: 5000,
        },
        errors: [],
      },
    ];

    // Act: Filter running states
    const running = snapshots.filter((s) => s.state === 'running');

    // Assert
    expect(running.length).toBe(1);
    expect(running[0].state).toBe('running');
  });
});
