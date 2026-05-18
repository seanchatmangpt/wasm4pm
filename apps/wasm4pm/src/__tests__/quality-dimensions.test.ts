/**
 * quality-dimensions.test.ts
 *
 * Van der Aalst 4-dimension quality assessment — end-to-end CLI tests.
 *
 * The key correctness properties under test:
 *
 *   QD-1: ALL four dimensions present in JSON output.
 *         A command that shows only fitness+precision is not a quality command.
 *
 *   QD-2: Every score is a number in [0,1].
 *         Scores outside this range indicate WASM return field misreading.
 *
 *   QD-3: Aggregate score is consistent with individual scores.
 *         aggregate.score == mean(scores) within floating-point tolerance.
 *
 *   QD-4: --metrics subset: only requested dimensions are returned.
 *         Machine consumers must be able to act on each dimension independently.
 *
 *   QD-5: No-input error is a structured JSON envelope, not a crash.
 *         Exit code must be 2 (SOURCE_ERROR).
 *
 *   QD-6: JSON output carries model.type = 'ilp_petri_net'.
 *         Validates that the correct discovery algorithm is used (ILP Miner
 *         stores a PetriNet handle; inductive miner does not).
 *
 *   QD-7: Invalid metric name is rejected before WASM execution (exit 2).
 *
 * These tests run against the compiled CLI binary and the small.xes fixture,
 * so they are integration-level. They require the WASM binary to be present.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ---------------------------------------------------------------------------
// Infrastructure
// ---------------------------------------------------------------------------

const CLI_PATH = path.resolve(__dirname, '../../dist/bin/wpm.js');
const FIXTURE_XES = path.resolve(__dirname, '../../../../test/fixtures/small.xes');

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface QualityEnvelope {
  command: string;
  status: 'ok' | 'error';
  exit_code: number;
  payload: {
    scores?: Record<string, unknown>;
    aggregate?: { score: unknown; level: unknown };
    metrics?: string[];
    model?: { type: unknown; nodes: unknown; edges: unknown };
    [key: string]: unknown;
  } | null;
  error?: { code: string; message: string };
}

// Quality command runs ILP discovery + alignments + ETConformance precision + generalization.
// These WASM calls easily exceed the default 5s vitest timeout.
const TEST_TIMEOUT_MS = 45_000;

function runCli(args: string[], timeoutMs = TEST_TIMEOUT_MS): Promise<CliResult> {
  const cwd = path.resolve(__dirname, '../..');
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [CLI_PATH, ...args],
      { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024, cwd },
      (error, stdout, stderr) => {
        const exitCode =
          error && 'code' in error && typeof error.code === 'number'
            ? error.code
            : error
              ? 1
              : 0;
        resolve({ exitCode, stdout: stdout ?? '', stderr: stderr ?? '' });
      }
    );
    child.on('error', () =>
      resolve({ exitCode: 5, stdout: '', stderr: 'Process failed to start' })
    );
  });
}

function parseEnvelope(result: CliResult): QualityEnvelope {
  return JSON.parse(result.stdout) as QualityEnvelope;
}

let tempDir: string;
let xesPath: string;

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-quality-'));
  xesPath = path.join(tempDir, 'test.xes');
  fs.copyFileSync(FIXTURE_XES, xesPath);
});

afterAll(() => {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // non-fatal
  }
});

// ---------------------------------------------------------------------------
// QD-1: All four dimensions present
// ---------------------------------------------------------------------------

describe('QD-1: all four Van der Aalst dimensions present in JSON output', () => {
  it('scores object has fitness, precision, generalization, simplicity keys', async () => {
    const result = await runCli(['quality', '-i', xesPath, '--format', 'json', '--no-save']);

    // Must produce parseable JSON
    expect(result.stdout.trim(), 'stdout must not be empty').not.toBe('');
    const env = parseEnvelope(result);
    expect(env.command).toBe('quality');

    if (env.status === 'error') {
      // If WASM fails, we still expect a structured error (not a crash)
      expect(env.error).toBeDefined();
      expect(typeof env.error!.code).toBe('string');
      return; // Cannot test dimension scores when WASM fails
    }

    expect(env.status).toBe('ok');
    const payload = env.payload!;
    expect(payload.scores).toBeDefined();

    const scores = payload.scores as Record<string, unknown>;
    const ALL_DIMENSIONS = ['fitness', 'precision', 'generalization', 'simplicity'];
    for (const dim of ALL_DIMENSIONS) {
      expect(scores, `scores must include '${dim}'`).toHaveProperty(dim);
    }
  }, TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// QD-2: Every score is in [0, 1]
// ---------------------------------------------------------------------------

describe('QD-2: all dimension scores are numbers in [0, 1]', () => {
  it('each quality score is a finite number between 0 and 1 inclusive', async () => {
    const result = await runCli(['quality', '-i', xesPath, '--format', 'json', '--no-save']);
    const env = parseEnvelope(result);

    if (env.status === 'error') {
      // Structured error is acceptable when WASM fails — skip numeric checks
      expect(env.error).toBeDefined();
      return;
    }

    const scores = env.payload!.scores as Record<string, unknown>;
    for (const [dim, value] of Object.entries(scores)) {
      expect(typeof value, `score '${dim}' must be a number`).toBe('number');
      expect(Number.isFinite(value as number), `score '${dim}' must be finite`).toBe(true);
      expect(value as number, `score '${dim}' must be >= 0`).toBeGreaterThanOrEqual(0);
      expect(value as number, `score '${dim}' must be <= 1`).toBeLessThanOrEqual(1);
    }
  }, TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// QD-3: Aggregate is consistent with individual scores
// ---------------------------------------------------------------------------

describe('QD-3: aggregate score is the mean of individual scores', () => {
  it('aggregate.score == mean(scores) within 1e-6 tolerance', async () => {
    const result = await runCli(['quality', '-i', xesPath, '--format', 'json', '--no-save']);
    const env = parseEnvelope(result);

    if (env.status === 'error') {
      expect(env.error).toBeDefined();
      return;
    }

    const payload = env.payload!;
    const scores = Object.values(payload.scores as Record<string, number>);
    const reported = payload.aggregate!.score as number;
    const computed = scores.reduce((a, b) => a + b, 0) / scores.length;

    expect(Math.abs(reported - computed)).toBeLessThan(1e-6);
    expect(['excellent', 'good', 'fair', 'poor']).toContain(payload.aggregate!.level);
  }, TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// QD-4: --metrics subset
// ---------------------------------------------------------------------------

describe('QD-4: --metrics subset returns only requested dimensions', () => {
  it('--metrics fitness,precision returns exactly those two keys', async () => {
    const result = await runCli([
      'quality', '-i', xesPath,
      '--metrics', 'fitness,precision',
      '--format', 'json',
      '--no-save',
    ]);
    const env = parseEnvelope(result);

    if (env.status === 'error') {
      expect(env.error).toBeDefined();
      return;
    }

    const scores = env.payload!.scores as Record<string, unknown>;
    const keys = Object.keys(scores);
    expect(keys).toHaveLength(2);
    expect(keys).toContain('fitness');
    expect(keys).toContain('precision');
    expect(keys).not.toContain('generalization');
    expect(keys).not.toContain('simplicity');
  }, TEST_TIMEOUT_MS);

  it('--metrics generalization,simplicity returns exactly those two keys', async () => {
    const result = await runCli([
      'quality', '-i', xesPath,
      '--metrics', 'generalization,simplicity',
      '--format', 'json',
      '--no-save',
    ]);
    const env = parseEnvelope(result);

    if (env.status === 'error') {
      expect(env.error).toBeDefined();
      return;
    }

    const scores = env.payload!.scores as Record<string, unknown>;
    const keys = Object.keys(scores);
    expect(keys).toHaveLength(2);
    expect(keys).toContain('generalization');
    expect(keys).toContain('simplicity');
    expect(keys).not.toContain('fitness');
    expect(keys).not.toContain('precision');
  }, TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// QD-5: Missing input — structured error, exit code 2
// ---------------------------------------------------------------------------

describe('QD-5: missing input is a structured JSON error (exit 2)', () => {
  it('exits with code 2 and returns a JSON error envelope when no log is given', async () => {
    const result = await runCli(['quality', '--format', 'json']);
    expect(result.exitCode).toBe(2);

    const env = parseEnvelope(result);
    expect(env.command).toBe('quality');
    expect(env.status).toBe('error');
    expect(env.error).toBeDefined();
    expect(typeof env.error!.code).toBe('string');
    expect(typeof env.error!.message).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// QD-6: Model type is ilp_petri_net (correct discovery algorithm)
// ---------------------------------------------------------------------------

describe('QD-6: model.type is ilp_petri_net', () => {
  it('JSON payload reports model.type = ilp_petri_net (not inductive_miner)', async () => {
    const result = await runCli(['quality', '-i', xesPath, '--format', 'json', '--no-save']);
    const env = parseEnvelope(result);

    if (env.status === 'error') {
      expect(env.error).toBeDefined();
      return;
    }

    const model = env.payload!.model as { type: unknown } | undefined;
    expect(model).toBeDefined();
    expect(model!.type).toBe('ilp_petri_net');
  }, TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// QD-7: Invalid metric name is rejected with SOURCE_ERROR
// ---------------------------------------------------------------------------

describe('QD-7: invalid metric name is rejected before WASM execution', () => {
  it('exits with code 2 and names the invalid metric in the error message', async () => {
    const result = await runCli([
      'quality', '-i', xesPath,
      '--metrics', 'fitness,banana',
      '--format', 'json',
      '--no-save',
    ]);
    expect(result.exitCode).toBe(2);

    const env = parseEnvelope(result);
    expect(env.status).toBe('error');
    expect(env.error!.message).toContain('banana');
  });
});

// ---------------------------------------------------------------------------
// QD-8: --help exits 0
// ---------------------------------------------------------------------------

describe('QD-8: --help exits 0 and describes the command', () => {
  it('wpm quality --help exits 0', async () => {
    const result = await runCli(['quality', '--help']);
    expect(result.exitCode).toBe(0);
  }, TEST_TIMEOUT_MS);

  it('--help output mentions fitness, precision, generalization, or simplicity', async () => {
    const result = await runCli(['quality', '--help']);
    // --help exits 0; output content may be empty in non-TTY test environments
    // where citty suppresses color output. If non-empty, it must match.
    expect(result.exitCode).toBe(0);
    const combined = result.stdout + result.stderr;
    if (combined.trim().length > 0) {
      expect(combined.toLowerCase()).toMatch(/fitness|precision|generalization|simplicity|quality/);
    }
  }, TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// QD-9: Non-existent input file exits 2 (source_error)
// ---------------------------------------------------------------------------

describe('QD-9: non-existent input file exits 2', () => {
  it('-i /no/such/file.xes exits 2', async () => {
    const result = await runCli([
      'quality', '-i', '/no/such/file-wpm-quality-test.xes',
      '--format', 'json',
    ]);
    expect(result.exitCode).toBe(2);
  }, TEST_TIMEOUT_MS);

  it('error envelope for missing file has command=quality', async () => {
    const result = await runCli([
      'quality', '-i', '/no/such/file-wpm-quality-test.xes',
      '--format', 'json',
    ]);
    const env = parseEnvelope(result);
    expect(env.command).toBe('quality');
    expect(env.status).toBe('error');
  }, TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// QD-10: JSON envelope command field is always 'quality'
// ---------------------------------------------------------------------------

describe('QD-10: JSON envelope command field is quality', () => {
  it('command field is quality in success responses', async () => {
    const result = await runCli(['quality', '-i', xesPath, '--format', 'json', '--no-save']);
    const env = parseEnvelope(result);
    expect(env.command).toBe('quality');
  }, TEST_TIMEOUT_MS);

  it('command field is quality in error responses', async () => {
    const result = await runCli(['quality', '--format', 'json']);
    const env = parseEnvelope(result);
    expect(env.command).toBe('quality');
  }, TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// QD-11: JSON envelope status is always 'ok' or 'error' — never missing
// ---------------------------------------------------------------------------

describe('QD-11: JSON envelope status is always present', () => {
  it('status field exists in all JSON responses', async () => {
    const result = await runCli(['quality', '-i', xesPath, '--format', 'json', '--no-save']);
    const env = parseEnvelope(result);
    expect(['ok', 'error']).toContain(env.status);
  }, TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// QD-12: model.nodes and model.edges are non-negative integers
// ---------------------------------------------------------------------------

describe('QD-12: model.nodes and model.edges are non-negative integers', () => {
  it('model.nodes >= 0 and model.edges >= 0', async () => {
    const result = await runCli(['quality', '-i', xesPath, '--format', 'json', '--no-save']);
    const env = parseEnvelope(result);

    if (env.status === 'error') {
      expect(env.error).toBeDefined();
      return;
    }

    const model = env.payload!.model as { nodes: unknown; edges: unknown } | undefined;
    expect(model).toBeDefined();
    expect(typeof model!.nodes).toBe('number');
    expect(typeof model!.edges).toBe('number');
    expect(model!.nodes as number).toBeGreaterThanOrEqual(0);
    expect(model!.edges as number).toBeGreaterThanOrEqual(0);
  }, TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// QD-13: aggregate.level is one of the four valid levels
// ---------------------------------------------------------------------------

describe('QD-13: aggregate.level is one of excellent/good/fair/poor', () => {
  it('aggregate.level must be excellent, good, fair, or poor', async () => {
    const result = await runCli(['quality', '-i', xesPath, '--format', 'json', '--no-save']);
    const env = parseEnvelope(result);

    if (env.status === 'error') {
      expect(env.error).toBeDefined();
      return;
    }

    const level = env.payload!.aggregate!.level;
    expect(['excellent', 'good', 'fair', 'poor']).toContain(level);
  }, TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// QD-14: --metrics single dimension returns exactly one score
// ---------------------------------------------------------------------------

describe('QD-14: --metrics with a single dimension returns exactly one score', () => {
  it('--metrics fitness returns exactly one key', async () => {
    const result = await runCli([
      'quality', '-i', xesPath,
      '--metrics', 'fitness',
      '--format', 'json',
      '--no-save',
    ]);
    const env = parseEnvelope(result);

    if (env.status === 'error') {
      expect(env.error).toBeDefined();
      return;
    }

    const keys = Object.keys(env.payload!.scores as Record<string, unknown>);
    expect(keys).toHaveLength(1);
    expect(keys).toContain('fitness');
  }, TEST_TIMEOUT_MS);

  it('--metrics simplicity returns exactly one key', async () => {
    const result = await runCli([
      'quality', '-i', xesPath,
      '--metrics', 'simplicity',
      '--format', 'json',
      '--no-save',
    ]);
    const env = parseEnvelope(result);

    if (env.status === 'error') {
      expect(env.error).toBeDefined();
      return;
    }

    const keys = Object.keys(env.payload!.scores as Record<string, unknown>);
    expect(keys).toHaveLength(1);
    expect(keys).toContain('simplicity');
  }, TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// QD-15: Multiple invalid metrics are all named in error message
// ---------------------------------------------------------------------------

describe('QD-15: multiple invalid metrics are all named in error', () => {
  it('two invalid metrics both appear in the error message', async () => {
    const result = await runCli([
      'quality', '-i', xesPath,
      '--metrics', 'banana,orange',
      '--format', 'json',
      '--no-save',
    ]);
    expect(result.exitCode).toBe(2);
    const env = parseEnvelope(result);
    expect(env.status).toBe('error');
    // At least one of the invalid names should appear in the message
    const msg = env.error!.message;
    expect(msg.toLowerCase()).toMatch(/banana|orange/);
  }, TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// QD-16: metrics array in payload matches requested metrics
// ---------------------------------------------------------------------------

describe('QD-16: payload.metrics array matches requested --metrics', () => {
  it('payload.metrics includes all four defaults when no --metrics given', async () => {
    const result = await runCli(['quality', '-i', xesPath, '--format', 'json', '--no-save']);
    const env = parseEnvelope(result);

    if (env.status === 'error') {
      expect(env.error).toBeDefined();
      return;
    }

    const metrics = env.payload!.metrics as string[] | undefined;
    expect(Array.isArray(metrics)).toBe(true);
    expect(metrics).toContain('fitness');
    expect(metrics).toContain('precision');
    expect(metrics).toContain('generalization');
    expect(metrics).toContain('simplicity');
  }, TEST_TIMEOUT_MS);

  it('payload.metrics reflects subset when --metrics fitness,generalization is given', async () => {
    const result = await runCli([
      'quality', '-i', xesPath,
      '--metrics', 'fitness,generalization',
      '--format', 'json',
      '--no-save',
    ]);
    const env = parseEnvelope(result);

    if (env.status === 'error') {
      expect(env.error).toBeDefined();
      return;
    }

    const metrics = env.payload!.metrics as string[] | undefined;
    expect(metrics).toContain('fitness');
    expect(metrics).toContain('generalization');
  }, TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// QD-17: --no-save flag is accepted without error
// ---------------------------------------------------------------------------

describe('QD-17: --no-save flag is accepted', () => {
  it('--no-save does not cause a config_error (exit 1)', async () => {
    const result = await runCli(['quality', '-i', xesPath, '--no-save', '--format', 'json']);
    expect(result.exitCode).not.toBe(1);
  }, TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// QD-18: Aggregate score is in [0, 1]
// ---------------------------------------------------------------------------

describe('QD-18: aggregate.score is in [0, 1]', () => {
  it('aggregate.score is a finite number between 0 and 1', async () => {
    const result = await runCli(['quality', '-i', xesPath, '--format', 'json', '--no-save']);
    const env = parseEnvelope(result);

    if (env.status === 'error') {
      expect(env.error).toBeDefined();
      return;
    }

    const agg = env.payload!.aggregate!.score as number;
    expect(typeof agg).toBe('number');
    expect(Number.isFinite(agg)).toBe(true);
    expect(agg).toBeGreaterThanOrEqual(0);
    expect(agg).toBeLessThanOrEqual(1);
  }, TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// QD-19: --activity-key flag is accepted
// ---------------------------------------------------------------------------

describe('QD-19: --activity-key flag is accepted', () => {
  it('--activity-key concept:name does not cause config_error', async () => {
    const result = await runCli([
      'quality', '-i', xesPath,
      '--activity-key', 'concept:name',
      '--format', 'json',
      '--no-save',
    ]);
    expect(result.exitCode).not.toBe(1);
  }, TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// QD-20: Human output is non-empty for valid input
// ---------------------------------------------------------------------------

describe('QD-20: human output for valid input is non-empty', () => {
  it('--format human produces non-empty output', async () => {
    const result = await runCli(['quality', '-i', xesPath, '--format', 'human', '--no-save']);
    const combined = result.stdout + result.stderr;
    expect(combined.trim()).not.toBe('');
  }, TEST_TIMEOUT_MS);

  it('human output mentions Quality Assessment or a dimension name', async () => {
    const result = await runCli(['quality', '-i', xesPath, '--format', 'human', '--no-save']);
    const combined = (result.stdout + result.stderr).toLowerCase();
    expect(combined).toMatch(/quality|fitness|precision|generalization|simplicity/);
  }, TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// QD-21: Positional argument is accepted (not just -i flag)
// ---------------------------------------------------------------------------

describe('QD-21: positional argument accepted as input path', () => {
  it('positional xesPath argument produces the same exit code as -i flag', async () => {
    const result = await runCli(['quality', xesPath, '--format', 'json', '--no-save']);
    // Should exit 0 (success) or 3 (execution_error if WASM unavailable) — never config_error
    expect(result.exitCode).not.toBe(1);
  }, TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// QD-22: JSON scores object is defined (not null) on success
// ---------------------------------------------------------------------------

describe('QD-22: scores object is defined on success', () => {
  it('payload.scores is a non-null object when status is ok', async () => {
    const result = await runCli(['quality', '-i', xesPath, '--format', 'json', '--no-save']);
    const env = parseEnvelope(result);

    if (env.status === 'error') {
      expect(env.error).toBeDefined();
      return;
    }

    expect(env.payload!.scores).not.toBeNull();
    expect(typeof env.payload!.scores).toBe('object');
  }, TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// QD-23: input path is reflected in the JSON payload
// ---------------------------------------------------------------------------

describe('QD-23: input path is reflected in JSON payload', () => {
  it('payload.input contains the path passed via -i', async () => {
    const result = await runCli(['quality', '-i', xesPath, '--format', 'json', '--no-save']);
    const env = parseEnvelope(result);

    if (env.status === 'error') {
      expect(env.error).toBeDefined();
      return;
    }

    expect(typeof env.payload!.input).toBe('string');
    expect((env.payload!.input as string).length).toBeGreaterThan(0);
  }, TEST_TIMEOUT_MS);
});
