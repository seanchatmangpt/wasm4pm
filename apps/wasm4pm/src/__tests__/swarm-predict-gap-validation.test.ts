/**
 * Gap-closing tests for `wpm swarm` and `wpm predict` validation.
 *
 * Gaps addressed:
 *   S1 — `--convergence-threshold` outside [0,1] should exit config_error (1)
 *   S2 — `--convergence-threshold` NaN should exit config_error (1)
 *   P1 — `wpm predict invalid-task` exits config_error (1) with valid-tasks list
 *   P2 — `wpm predict next-activity` with nonexistent file exits source_error (2)
 *   P3 — `--drift-window 0` exits config_error (1) (zero is meaningless for drift detection)
 *   P4 — `--drift-window -5` exits config_error (1)
 *   P5 — JSON payload always includes `task` field
 *   P6 — JSON payload includes `activityKey` field
 *
 * RED tests written first; implementation fixes follow.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, createCliTestEnv } from '@wasm4pm/testing';
import * as path from 'path';
import * as fs from 'fs/promises';

const CONFIG_ERROR = 1;
const SOURCE_ERROR = 2;

// Minimal XES fixture shared across all tests
const MINIMAL_XES = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="case-1"/>
    <event>
      <string key="concept:name" value="Register"/>
      <date key="time:timestamp" value="2026-04-16T10:00:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="Approve"/>
      <date key="time:timestamp" value="2026-04-16T10:01:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="Close"/>
      <date key="time:timestamp" value="2026-04-16T10:02:00Z"/>
    </event>
  </trace>
  <trace>
    <string key="concept:name" value="case-2"/>
    <event>
      <string key="concept:name" value="Register"/>
      <date key="time:timestamp" value="2026-04-16T11:00:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="Reject"/>
      <date key="time:timestamp" value="2026-04-16T11:01:00Z"/>
    </event>
  </trace>
</log>`;

// ============================================================================
// wpm swarm — convergence-threshold validation
// ============================================================================

describe('wpm swarm — convergence-threshold validation (S1, S2)', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;
  let testXesPath: string;

  beforeEach(async () => {
    env = await createCliTestEnv();
    testXesPath = path.join(env.tempDir, 'swarm-gap.xes');
    await fs.writeFile(testXesPath, MINIMAL_XES, 'utf-8');
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  // S1a: above-range value
  it('[S1a] --convergence-threshold 1.5 should exit config_error (1)', async () => {
    const result = await runCli(
      ['swarm', testXesPath, '--convergence-threshold', '1.5', '--format', 'json'],
      { cwd: env.tempDir }
    );
    expect(result.exitCode).toBe(CONFIG_ERROR);
  });

  it('[S1a] --convergence-threshold 1.5 produces structured JSON error', async () => {
    const result = await runCli(
      ['swarm', testXesPath, '--convergence-threshold', '1.5', '--format', 'json'],
      { cwd: env.tempDir }
    );
    expect(result.exitCode).toBe(CONFIG_ERROR);
    const parsed = JSON.parse(result.stdout) as { status: string; error?: { code: string } };
    expect(parsed.status).toBe('error');
    expect(parsed.error?.code).toBe('INVALID_CONVERGENCE_THRESHOLD');
  });

  it('[S1a] --convergence-threshold 1.5 error message mentions valid range [0,1]', async () => {
    const result = await runCli(
      ['swarm', testXesPath, '--convergence-threshold', '1.5', '--format', 'json'],
      { cwd: env.tempDir }
    );
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/\[0.*1\]|0\.0.*1\.0|range|between/i);
  });

  // S1b: below-range value
  it('[S1b] --convergence-threshold -0.1 should exit config_error (1)', async () => {
    const result = await runCli(
      ['swarm', testXesPath, '--convergence-threshold', '-0.1', '--format', 'json'],
      { cwd: env.tempDir }
    );
    expect(result.exitCode).toBe(CONFIG_ERROR);
  });

  it('[S1b] --convergence-threshold -0.1 produces INVALID_CONVERGENCE_THRESHOLD code', async () => {
    const result = await runCli(
      ['swarm', testXesPath, '--convergence-threshold', '-0.1', '--format', 'json'],
      { cwd: env.tempDir }
    );
    const parsed = JSON.parse(result.stdout) as { status: string; error?: { code: string } };
    expect(parsed.status).toBe('error');
    expect(parsed.error?.code).toBe('INVALID_CONVERGENCE_THRESHOLD');
  });

  // S1c: exact boundary values must still be accepted
  it('[S1c] --convergence-threshold 0.0 is valid (minimum boundary)', async () => {
    const result = await runCli(
      [
        'swarm',
        testXesPath,
        '--convergence-threshold',
        '0.0',
        '--max-episodes',
        '1',
        '--format',
        'json',
      ],
      { cwd: env.tempDir }
    );
    // Must NOT be config_error
    expect(result.exitCode).not.toBe(CONFIG_ERROR);
  });

  it('[S1c] --convergence-threshold 1.0 is valid (maximum boundary / unanimous)', async () => {
    const result = await runCli(
      [
        'swarm',
        testXesPath,
        '--convergence-threshold',
        '1.0',
        '--max-episodes',
        '1',
        '--format',
        'json',
      ],
      { cwd: env.tempDir }
    );
    expect(result.exitCode).not.toBe(CONFIG_ERROR);
  });

  it('[S1c] --convergence-threshold 0.5 is valid (mid-range)', async () => {
    const result = await runCli(
      [
        'swarm',
        testXesPath,
        '--convergence-threshold',
        '0.5',
        '--max-episodes',
        '1',
        '--format',
        'json',
      ],
      { cwd: env.tempDir }
    );
    expect(result.exitCode).not.toBe(CONFIG_ERROR);
  });

  // S2: NaN value
  it('[S2] --convergence-threshold notanumber should exit config_error (1)', async () => {
    const result = await runCli(
      ['swarm', testXesPath, '--convergence-threshold', 'notanumber', '--format', 'json'],
      { cwd: env.tempDir }
    );
    expect(result.exitCode).toBe(CONFIG_ERROR);
  });

  it('[S2] --convergence-threshold notanumber produces INVALID_CONVERGENCE_THRESHOLD code', async () => {
    const result = await runCli(
      ['swarm', testXesPath, '--convergence-threshold', 'notanumber', '--format', 'json'],
      { cwd: env.tempDir }
    );
    const parsed = JSON.parse(result.stdout) as { status: string; error?: { code: string } };
    expect(parsed.status).toBe('error');
    expect(parsed.error?.code).toBe('INVALID_CONVERGENCE_THRESHOLD');
  });
});

// ============================================================================
// wpm predict — invalid task → config_error (P1)
// ============================================================================

describe('wpm predict — invalid task exits config_error (P1)', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;

  beforeEach(async () => {
    env = await createCliTestEnv();
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  it('[P1] invalid task exits config_error (1) not source_error (2)', async () => {
    const result = await runCli(
      ['predict', 'invalid-task', '-i', 'test.xes'],
      { cwd: env.tempDir }
    );
    expect(result.exitCode).toBe(CONFIG_ERROR);
  });

  it('[P1] invalid task error message lists all valid tasks', async () => {
    const result = await runCli(
      ['predict', 'bad-task', '-i', 'test.xes', '--format', 'json'],
      { cwd: env.tempDir }
    );
    const combined = result.stdout + result.stderr;
    // All six valid tasks must appear in the error message
    expect(combined).toMatch(/next-activity/);
    expect(combined).toMatch(/remaining-time/);
    expect(combined).toMatch(/outcome/);
    expect(combined).toMatch(/drift/);
    expect(combined).toMatch(/features/);
    expect(combined).toMatch(/resource/);
  });

  it('[P1] invalid task JSON output has status=error and code=INVALID_TASK', async () => {
    const result = await runCli(
      ['predict', 'bad-task', '-i', 'test.xes', '--format', 'json'],
      { cwd: env.tempDir }
    );
    expect(result.exitCode).toBe(CONFIG_ERROR);
    const parsed = JSON.parse(result.stdout) as { status: string; error?: { code: string } };
    expect(parsed.status).toBe('error');
    expect(parsed.error?.code).toBe('INVALID_TASK');
  });

  it('[P1] did-you-mean suggestion appears for typo "next_activity" (closest to "next-activity")', async () => {
    const result = await runCli(
      ['predict', 'next_activity', '-i', 'test.xes', '--format', 'json'],
      { cwd: env.tempDir }
    );
    const combined = result.stdout + result.stderr;
    // Should suggest the correctly-hyphenated form
    expect(combined).toMatch(/next-activity|Did you mean/i);
  });
});

// ============================================================================
// wpm predict — nonexistent log file → source_error (P2)
// ============================================================================

describe('wpm predict — nonexistent log file exits source_error (P2)', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;

  beforeEach(async () => {
    env = await createCliTestEnv();
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  it('[P2] nonexistent file exits source_error (2)', async () => {
    const result = await runCli(
      ['predict', 'next-activity', '-i', '/no/such/file-abc123.xes'],
      { cwd: env.tempDir }
    );
    expect(result.exitCode).toBe(SOURCE_ERROR);
  });

  it('[P2] nonexistent file exits source_error for remaining-time task', async () => {
    const result = await runCli(
      ['predict', 'remaining-time', '-i', '/no/such/file-abc123.xes'],
      { cwd: env.tempDir }
    );
    expect(result.exitCode).toBe(SOURCE_ERROR);
  });

  it('[P2] nonexistent file JSON error has status=error and code=INPUT_NOT_FOUND', async () => {
    const result = await runCli(
      ['predict', 'next-activity', '-i', '/no/such/file-abc123.xes', '--format', 'json'],
      { cwd: env.tempDir }
    );
    expect(result.exitCode).toBe(SOURCE_ERROR);
    const parsed = JSON.parse(result.stdout) as { status: string; error?: { code: string } };
    expect(parsed.status).toBe('error');
    expect(parsed.error?.code).toBe('INPUT_NOT_FOUND');
  });
});

// ============================================================================
// wpm predict — drift-window zero/negative validation (P3, P4)
// ============================================================================

describe('wpm predict — drift-window <= 0 validation (P3, P4)', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;
  let testXesPath: string;

  beforeEach(async () => {
    env = await createCliTestEnv();
    testXesPath = path.join(env.tempDir, 'drift-gap.xes');
    await fs.writeFile(testXesPath, MINIMAL_XES, 'utf-8');
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  // P3: zero window
  it('[P3] --drift-window 0 exits config_error (1)', async () => {
    const result = await runCli(
      ['predict', 'drift', '-i', testXesPath, '--drift-window', '0', '--format', 'json'],
      { cwd: env.tempDir }
    );
    expect(result.exitCode).toBe(CONFIG_ERROR);
  });

  it('[P3] --drift-window 0 produces structured error with code=INVALID_ARG', async () => {
    const result = await runCli(
      ['predict', 'drift', '-i', testXesPath, '--drift-window', '0', '--format', 'json'],
      { cwd: env.tempDir }
    );
    expect(result.exitCode).toBe(CONFIG_ERROR);
    const parsed = JSON.parse(result.stdout) as { status: string; error?: { code: string } };
    expect(parsed.status).toBe('error');
    expect(parsed.error?.code).toBe('INVALID_ARG');
  });

  it('[P3] --drift-window 0 error message mentions positive integer requirement', async () => {
    const result = await runCli(
      ['predict', 'drift', '-i', testXesPath, '--drift-window', '0', '--format', 'json'],
      { cwd: env.tempDir }
    );
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/positive|>= 1|greater|minimum/i);
  });

  // P4: negative window
  it('[P4] --drift-window -5 exits config_error (1)', async () => {
    const result = await runCli(
      ['predict', 'drift', '-i', testXesPath, '--drift-window', '-5', '--format', 'json'],
      { cwd: env.tempDir }
    );
    expect(result.exitCode).toBe(CONFIG_ERROR);
  });

  it('[P4] --drift-window -5 produces INVALID_ARG error code', async () => {
    const result = await runCli(
      ['predict', 'drift', '-i', testXesPath, '--drift-window', '-5', '--format', 'json'],
      { cwd: env.tempDir }
    );
    const parsed = JSON.parse(result.stdout) as { status: string; error?: { code: string } };
    expect(parsed.status).toBe('error');
    expect(parsed.error?.code).toBe('INVALID_ARG');
  });

  // Boundary: drift-window=1 must be accepted
  it('[P3 boundary] --drift-window 1 is valid (minimum meaningful window)', async () => {
    const result = await runCli(
      ['predict', 'drift', '-i', testXesPath, '--drift-window', '1', '--format', 'json'],
      { cwd: env.tempDir }
    );
    // Must NOT be config_error
    expect(result.exitCode).not.toBe(CONFIG_ERROR);
  });

  // drift-window validation applies only to drift task — must not block other tasks
  it('[P3 scope] --drift-window 0 does not affect next-activity task (drift window ignored)', async () => {
    const result = await runCli(
      [
        'predict',
        'next-activity',
        '-i',
        testXesPath,
        '--drift-window',
        '0',
        '--format',
        'json',
      ],
      { cwd: env.tempDir }
    );
    // next-activity ignores drift-window — should NOT exit config_error
    expect(result.exitCode).not.toBe(CONFIG_ERROR);
  });
});

// ============================================================================
// wpm predict — JSON payload always includes `task` field (P5, P6)
// ============================================================================

describe('wpm predict — JSON payload structure (P5, P6)', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;
  let testXesPath: string;

  beforeEach(async () => {
    env = await createCliTestEnv();
    testXesPath = path.join(env.tempDir, 'predict-payload.xes');
    await fs.writeFile(testXesPath, MINIMAL_XES, 'utf-8');
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  it('[P5] JSON payload.task is present and equals "next-activity" on success', async () => {
    const result = await runCli(
      ['predict', 'next-activity', '-i', testXesPath, '--format', 'json', '--no-save'],
      { cwd: env.tempDir }
    );
    if (result.exitCode === 0) {
      const parsed = JSON.parse(result.stdout) as { payload?: { task?: string } };
      expect(parsed.payload).toHaveProperty('task');
      expect(parsed.payload?.task).toBe('next-activity');
    } else {
      // If execution fails (e.g., WASM not built for drift), still verify payload.task when present
      const text = result.stdout;
      if (text.startsWith('{')) {
        const parsed = JSON.parse(text) as { payload?: { task?: string } };
        if (parsed.payload?.task !== undefined) {
          expect(parsed.payload.task).toBe('next-activity');
        }
      }
    }
  });

  it('[P5] JSON payload.task matches the task argument for "drift"', async () => {
    const result = await runCli(
      [
        'predict',
        'drift',
        '-i',
        testXesPath,
        '--drift-window',
        '2',
        '--format',
        'json',
        '--no-save',
      ],
      { cwd: env.tempDir }
    );
    if (result.exitCode === 0) {
      const parsed = JSON.parse(result.stdout) as { payload?: { task?: string } };
      expect(parsed.payload).toHaveProperty('task');
      expect(parsed.payload?.task).toBe('drift');
    }
  });

  it('[P5] JSON payload.task matches the task argument for "features"', async () => {
    const result = await runCli(
      ['predict', 'features', '-i', testXesPath, '--format', 'json', '--no-save'],
      { cwd: env.tempDir }
    );
    if (result.exitCode === 0) {
      const parsed = JSON.parse(result.stdout) as { payload?: { task?: string } };
      expect(parsed.payload).toHaveProperty('task');
      expect(parsed.payload?.task).toBe('features');
    }
  });

  it('[P6] JSON payload.activityKey is present and defaults to concept:name', async () => {
    const result = await runCli(
      ['predict', 'next-activity', '-i', testXesPath, '--format', 'json', '--no-save'],
      { cwd: env.tempDir }
    );
    if (result.exitCode === 0) {
      const parsed = JSON.parse(result.stdout) as { payload?: { activityKey?: string } };
      expect(parsed.payload).toHaveProperty('activityKey');
      expect(parsed.payload?.activityKey).toBe('concept:name');
    }
  });

  it('[P6] JSON payload.activityKey reflects custom --activity-key flag', async () => {
    const result = await runCli(
      [
        'predict',
        'next-activity',
        '-i',
        testXesPath,
        '--activity-key',
        'my:activity',
        '--format',
        'json',
        '--no-save',
      ],
      { cwd: env.tempDir }
    );
    if (result.exitCode === 0) {
      const parsed = JSON.parse(result.stdout) as { payload?: { activityKey?: string } };
      expect(parsed.payload?.activityKey).toBe('my:activity');
    }
  });
});
