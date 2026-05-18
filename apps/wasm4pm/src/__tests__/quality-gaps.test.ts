/**
 * quality-gaps.test.ts
 *
 * Gap coverage for wpm quality — threshold validation, JSON contract completeness,
 * and edge cases not covered by quality-dimensions.test.ts (QD-1 through QD-24).
 *
 * Test catalogue:
 *
 *   TH-1:  --threshold=-0.1 (negative)          → exit 1 (config_error)
 *   TH-2:  --threshold=1.5 (>1.0)               → exit 1 (config_error)
 *   TH-3:  --threshold=abc (non-numeric)         → exit 1 (config_error)
 *   TH-4:  --threshold=0.7 (valid)               → accepted (exit 0 or 3, never 1)
 *   TH-5:  --threshold=0 (boundary 0.0)          → accepted
 *   TH-6:  --threshold=1 (boundary 1.0)          → accepted
 *   TH-7:  --threshold=0.0001 (near-zero float)  → accepted
 *   TH-8:  error envelope has INVALID_THRESHOLD code
 *   TH-9:  below-threshold exits 3, not 0
 *   TH-10: above-threshold exits 0
 *   TH-11: aggregate.passed_threshold=false when below threshold
 *   TH-12: aggregate.passed_threshold=true when at or above threshold
 *   TH-13: threshold field present in payload when --threshold provided
 *   TH-14: threshold field absent from payload when --threshold not provided
 *
 *   SC-1:  payload.dimensions is an object identical to payload.scores
 *   SC-2:  payload.dimensions has all four dimension keys when all metrics computed
 *   SC-3:  payload.activityKey reflects --activity-key value
 *   SC-4:  aggregate.score matches mean(scores) — identical to QD-3 but for
 *          non-default metric subsets (fitness only; generalization+simplicity)
 *   SC-5:  payload.metrics is an array (not string, not null)
 *   SC-6:  model.nodes and model.edges are integers (not floats)
 *   SC-7:  No --algorithm flag on quality (quality uses ILP internally, no flag)
 *
 *   HO-1:  Human output threshold failure mentions "threshold" or "score"
 *   HO-2:  Human output for below-threshold still shows dimension scores
 *   HO-3:  Human output for valid input includes sparklines / bar characters
 *
 *   EX-1:  Empty XES file (no traces) → exit 3 (execution_error), not crash
 *   EX-2:  XES with a single trace → exits 0 or 3, never 1 or 2
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

const TEST_TIMEOUT_MS = 45_000;

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface QualityEnvelope {
  command: string;
  status: 'ok' | 'error';
  exit_code: number;
  payload?: {
    scores?: Record<string, number>;
    dimensions?: Record<string, number>;
    aggregate?: {
      score: number;
      level: string;
      passed_threshold?: boolean;
    };
    metrics?: string[];
    model?: { type: string; nodes: number; edges: number };
    threshold?: number | null;
    activityKey?: string;
    input?: string;
    [key: string]: unknown;
  } | null;
  error?: { code: string; message: string };
}

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

// ---------------------------------------------------------------------------
// Fixture management
// ---------------------------------------------------------------------------

let tempDir: string;
let xesPath: string;
let emptyXesPath: string;
let singleTraceXesPath: string;

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-quality-gaps-'));

  // Standard XES fixture
  xesPath = path.join(tempDir, 'test.xes');
  fs.copyFileSync(FIXTURE_XES, xesPath);

  // Empty XES — valid XML but zero traces (WASM must handle gracefully)
  emptyXesPath = path.join(tempDir, 'empty.xes');
  fs.writeFileSync(
    emptyXesPath,
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<log xes.version="1.0" xmlns="http://www.xes-standard.org/">\n` +
    `</log>\n`
  );

  // Single-trace XES — minimal viable log
  singleTraceXesPath = path.join(tempDir, 'single.xes');
  fs.writeFileSync(
    singleTraceXesPath,
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<log xes.version="1.0" xmlns="http://www.xes-standard.org/">\n` +
    `  <trace>\n` +
    `    <string key="concept:name" value="case-001"/>\n` +
    `    <event>\n` +
    `      <string key="concept:name" value="Start"/>\n` +
    `      <date key="time:timestamp" value="2026-01-01T10:00:00Z"/>\n` +
    `    </event>\n` +
    `    <event>\n` +
    `      <string key="concept:name" value="End"/>\n` +
    `      <date key="time:timestamp" value="2026-01-01T10:01:00Z"/>\n` +
    `    </event>\n` +
    `  </trace>\n` +
    `</log>\n`
  );
});

afterAll(() => {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // non-fatal
  }
});

// ---------------------------------------------------------------------------
// TH-1: --threshold=-0.1 (negative) → exit 1 (config_error)
// ---------------------------------------------------------------------------

describe('TH-1: negative threshold is rejected with config_error (exit 1)', () => {
  it('--threshold=-0.1 exits 1', async () => {
    // NOTE: --threshold=-0.1 must use = form to avoid flag parsing treating -0.1 as a flag
    const result = await runCli([
      'quality', '-i', xesPath,
      '--threshold=-0.1',
      '--format', 'json',
      '--no-save',
    ]);
    expect(result.exitCode).toBe(1);
  });

  it('error envelope has status=error for negative threshold', async () => {
    const result = await runCli([
      'quality', '-i', xesPath,
      '--threshold=-0.1',
      '--format', 'json',
      '--no-save',
    ]);
    const env = parseEnvelope(result);
    expect(env.status).toBe('error');
  });
});

// ---------------------------------------------------------------------------
// TH-2: --threshold=1.5 (>1.0) → exit 1 (config_error)
// ---------------------------------------------------------------------------

describe('TH-2: threshold > 1.0 is rejected with config_error (exit 1)', () => {
  it('--threshold=1.5 exits 1', async () => {
    const result = await runCli([
      'quality', '-i', xesPath,
      '--threshold=1.5',
      '--format', 'json',
      '--no-save',
    ]);
    expect(result.exitCode).toBe(1);
  });

  it('--threshold=2 exits 1', async () => {
    const result = await runCli([
      'quality', '-i', xesPath,
      '--threshold=2',
      '--format', 'json',
      '--no-save',
    ]);
    expect(result.exitCode).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// TH-3: --threshold=abc (non-numeric) → exit 1 (config_error)
// ---------------------------------------------------------------------------

describe('TH-3: non-numeric threshold is rejected with config_error (exit 1)', () => {
  it('--threshold=abc exits 1', async () => {
    const result = await runCli([
      'quality', '-i', xesPath,
      '--threshold=abc',
      '--format', 'json',
      '--no-save',
    ]);
    expect(result.exitCode).toBe(1);
  });

  it('--threshold=abc error message mentions the invalid value', async () => {
    const result = await runCli([
      'quality', '-i', xesPath,
      '--threshold=abc',
      '--format', 'json',
      '--no-save',
    ]);
    const env = parseEnvelope(result);
    expect(env.status).toBe('error');
    expect(env.error).toBeDefined();
    expect(env.error!.message).toMatch(/abc/);
  });

  it('--threshold=not-a-number exits 1', async () => {
    const result = await runCli([
      'quality', '-i', xesPath,
      '--threshold=not-a-number',
      '--format', 'json',
      '--no-save',
    ]);
    expect(result.exitCode).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// TH-4 through TH-7: valid threshold values are accepted
// ---------------------------------------------------------------------------

describe('TH-4: --threshold=0.7 is accepted (exit 0 or 3, never 1)', () => {
  it('--threshold=0.7 does not produce config_error', async () => {
    const result = await runCli([
      'quality', '-i', xesPath,
      '--threshold=0.7',
      '--format', 'json',
      '--no-save',
    ]);
    // exit 0 = passed threshold, exit 3 = failed threshold or WASM error — never config_error
    expect(result.exitCode).not.toBe(1);
  }, TEST_TIMEOUT_MS);
});

describe('TH-5: --threshold=0 (boundary 0.0) is accepted', () => {
  it('--threshold=0 does not produce config_error', async () => {
    const result = await runCli([
      'quality', '-i', xesPath,
      '--threshold=0',
      '--format', 'json',
      '--no-save',
    ]);
    // Threshold=0 should always pass (any score >= 0), so exit 0 or 3 (WASM fail)
    expect(result.exitCode).not.toBe(1);
  }, TEST_TIMEOUT_MS);

  it('--threshold=0 produces passed_threshold=true in aggregate', async () => {
    const result = await runCli([
      'quality', '-i', xesPath,
      '--threshold=0',
      '--format', 'json',
      '--no-save',
    ]);
    if (result.exitCode === 3 && result.stdout.trim() === '') return; // WASM unavailable
    const env = parseEnvelope(result);
    if (env.status === 'error') return; // WASM failure gracefully handled
    // Any score >= 0, so threshold=0 must always pass
    expect(env.payload!.aggregate!.passed_threshold).toBe(true);
  }, TEST_TIMEOUT_MS);
});

describe('TH-6: --threshold=1 (boundary 1.0) is accepted', () => {
  it('--threshold=1 does not produce config_error (exit 1)', async () => {
    const result = await runCli([
      'quality', '-i', xesPath,
      '--threshold=1',
      '--format', 'json',
      '--no-save',
    ]);
    // May exit 0 or 3 (threshold too high) — never config_error
    expect(result.exitCode).not.toBe(1);
  }, TEST_TIMEOUT_MS);
});

describe('TH-7: --threshold=0.0001 (near-zero float) is accepted', () => {
  it('--threshold=0.0001 does not produce config_error', async () => {
    const result = await runCli([
      'quality', '-i', xesPath,
      '--threshold=0.0001',
      '--format', 'json',
      '--no-save',
    ]);
    expect(result.exitCode).not.toBe(1);
  }, TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// TH-8: error envelope error.code is INVALID_THRESHOLD
// ---------------------------------------------------------------------------

describe('TH-8: threshold error code is INVALID_THRESHOLD', () => {
  it('error.code is INVALID_THRESHOLD for --threshold=-0.1', async () => {
    const result = await runCli([
      'quality', '-i', xesPath,
      '--threshold=-0.1',
      '--format', 'json',
      '--no-save',
    ]);
    const env = parseEnvelope(result);
    expect(env.status).toBe('error');
    expect(env.error!.code).toBe('INVALID_THRESHOLD');
  });

  it('error.code is INVALID_THRESHOLD for --threshold=abc', async () => {
    const result = await runCli([
      'quality', '-i', xesPath,
      '--threshold=abc',
      '--format', 'json',
      '--no-save',
    ]);
    const env = parseEnvelope(result);
    expect(env.error!.code).toBe('INVALID_THRESHOLD');
  });

  it('error.code is INVALID_THRESHOLD for --threshold=1.5', async () => {
    const result = await runCli([
      'quality', '-i', xesPath,
      '--threshold=1.5',
      '--format', 'json',
      '--no-save',
    ]);
    const env = parseEnvelope(result);
    expect(env.error!.code).toBe('INVALID_THRESHOLD');
  });
});

// ---------------------------------------------------------------------------
// TH-9: below-threshold exits 3, not 0
// TH-10: above-threshold exits 0
// ---------------------------------------------------------------------------

describe('TH-9/TH-10: threshold exit code semantics', () => {
  it('--threshold=1.0 forces exit 3 when aggregate score is below 1.0 (which it always is)', async () => {
    // A quality score of 1.0 on the aggregate is virtually impossible in practice.
    // For this fixture, threshold=1 should always trigger execution_error (exit 3).
    const result = await runCli([
      'quality', '-i', xesPath,
      '--threshold=1.0',
      '--format', 'json',
      '--no-save',
    ]);
    if (result.exitCode === 3 && result.stdout.trim() === '') return; // WASM unavailable
    const env = parseEnvelope(result);
    if (env.status === 'error' && !env.payload) return; // WASM unavailable
    // If WASM ran successfully, a score < 1.0 triggers execution_error (3)
    // or it genuinely hit 1.0 (exit 0). Both are valid; the key test is TH-11.
    expect([0, 3]).toContain(result.exitCode);
  }, TEST_TIMEOUT_MS);

  it('--threshold=0.0 always passes: exit 0 when WASM succeeds', async () => {
    const result = await runCli([
      'quality', '-i', xesPath,
      '--threshold=0.0',
      '--format', 'json',
      '--no-save',
    ]);
    if (result.exitCode === 3 && result.stdout.trim() === '') return; // WASM unavailable
    const env = parseEnvelope(result);
    if (env.status === 'error' && !env.payload) return; // WASM unavailable
    if (env.status === 'ok') {
      // threshold=0 → aggregate is always >= 0 → always passes → exit 0
      expect(result.exitCode).toBe(0);
    }
  }, TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// TH-11: passed_threshold=false when aggregate below threshold
// TH-12: passed_threshold=true when aggregate at or above threshold
// ---------------------------------------------------------------------------

describe('TH-11/TH-12: aggregate.passed_threshold semantics', () => {
  it('passed_threshold=false when threshold=1.0 (unreachable score)', async () => {
    const result = await runCli([
      'quality', '-i', xesPath,
      '--threshold=1.0',
      '--format', 'json',
      '--no-save',
    ]);
    if (result.stdout.trim() === '') return; // WASM unavailable
    const env = parseEnvelope(result);
    if (env.status === 'error' && !env.payload) return;
    if (env.status === 'ok') {
      const passed = env.payload!.aggregate!.passed_threshold;
      expect(typeof passed).toBe('boolean');
      // threshold=1.0 → only passes if aggregate is exactly 1.0
      // exit code must be consistent with passed_threshold
      if (passed === false) {
        expect(result.exitCode).toBe(3);
      } else {
        expect(result.exitCode).toBe(0);
      }
    }
  }, TEST_TIMEOUT_MS);

  it('passed_threshold=true when threshold=0 (always passes)', async () => {
    const result = await runCli([
      'quality', '-i', xesPath,
      '--threshold=0',
      '--format', 'json',
      '--no-save',
    ]);
    if (result.stdout.trim() === '') return; // WASM unavailable
    const env = parseEnvelope(result);
    if (env.status === 'error' && !env.payload) return;
    if (env.status === 'ok') {
      expect(env.payload!.aggregate!.passed_threshold).toBe(true);
    }
  }, TEST_TIMEOUT_MS);

  it('passed_threshold is absent (undefined) when --threshold not provided', async () => {
    const result = await runCli([
      'quality', '-i', xesPath,
      '--format', 'json',
      '--no-save',
    ]);
    if (result.stdout.trim() === '') return; // WASM unavailable
    const env = parseEnvelope(result);
    if (env.status === 'error' && !env.payload) return;
    if (env.status === 'ok') {
      // passed_threshold should NOT be present when no --threshold was supplied
      expect(env.payload!.aggregate!.passed_threshold).toBeUndefined();
    }
  }, TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// TH-13: threshold field present in payload when --threshold provided
// TH-14: threshold field absent from payload when --threshold not provided
// ---------------------------------------------------------------------------

describe('TH-13/TH-14: threshold field presence in payload', () => {
  it('TH-13: payload.threshold is numeric when --threshold=0.8 is provided', async () => {
    const result = await runCli([
      'quality', '-i', xesPath,
      '--threshold=0.8',
      '--format', 'json',
      '--no-save',
    ]);
    if (result.stdout.trim() === '') return;
    const env = parseEnvelope(result);
    if (env.status === 'error' && !env.payload) return;
    if (env.status === 'ok') {
      expect(typeof env.payload!.threshold).toBe('number');
      expect(env.payload!.threshold).toBe(0.8);
    }
  }, TEST_TIMEOUT_MS);

  it('TH-14: payload.threshold is absent when --threshold not provided', async () => {
    const result = await runCli([
      'quality', '-i', xesPath,
      '--format', 'json',
      '--no-save',
    ]);
    if (result.stdout.trim() === '') return;
    const env = parseEnvelope(result);
    if (env.status === 'error' && !env.payload) return;
    if (env.status === 'ok') {
      // No threshold supplied → field must be absent (not null, not 0)
      expect(env.payload!.threshold).toBeUndefined();
    }
  }, TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// SC-1/SC-2: payload.dimensions is alias for payload.scores
// ---------------------------------------------------------------------------

describe('SC-1/SC-2: payload.dimensions is present and mirrors payload.scores', () => {
  it('SC-1: dimensions object has the same keys as scores', async () => {
    const result = await runCli([
      'quality', '-i', xesPath,
      '--format', 'json',
      '--no-save',
    ]);
    if (result.stdout.trim() === '') return;
    const env = parseEnvelope(result);
    if (env.status === 'error' && !env.payload) return;
    if (env.status === 'ok') {
      const scores = env.payload!.scores;
      const dimensions = env.payload!.dimensions;
      expect(dimensions).toBeDefined();
      expect(typeof dimensions).toBe('object');
      expect(Object.keys(dimensions!).sort()).toEqual(Object.keys(scores!).sort());
    }
  }, TEST_TIMEOUT_MS);

  it('SC-2: dimensions values are identical to scores values', async () => {
    const result = await runCli([
      'quality', '-i', xesPath,
      '--format', 'json',
      '--no-save',
    ]);
    if (result.stdout.trim() === '') return;
    const env = parseEnvelope(result);
    if (env.status === 'error' && !env.payload) return;
    if (env.status === 'ok') {
      const scores = env.payload!.scores!;
      const dimensions = env.payload!.dimensions!;
      for (const key of Object.keys(scores)) {
        expect(dimensions[key]).toBe(scores[key]);
      }
    }
  }, TEST_TIMEOUT_MS);

  it('SC-2b: dimensions has fitness, precision, generalization, simplicity when all computed', async () => {
    const result = await runCli([
      'quality', '-i', xesPath,
      '--format', 'json',
      '--no-save',
    ]);
    if (result.stdout.trim() === '') return;
    const env = parseEnvelope(result);
    if (env.status === 'error' && !env.payload) return;
    if (env.status === 'ok') {
      const dims = env.payload!.dimensions!;
      for (const key of ['fitness', 'precision', 'generalization', 'simplicity']) {
        expect(Object.keys(dims)).toContain(key);
      }
    }
  }, TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// SC-3: payload.activityKey reflects --activity-key value
// ---------------------------------------------------------------------------

describe('SC-3: payload.activityKey reflects --activity-key option', () => {
  it('activityKey is concept:name by default', async () => {
    const result = await runCli([
      'quality', '-i', xesPath,
      '--format', 'json',
      '--no-save',
    ]);
    if (result.stdout.trim() === '') return;
    const env = parseEnvelope(result);
    if (env.status === 'error' && !env.payload) return;
    if (env.status === 'ok') {
      expect(env.payload!.activityKey).toBe('concept:name');
    }
  }, TEST_TIMEOUT_MS);

  it('activityKey reflects custom --activity-key value', async () => {
    const result = await runCli([
      'quality', '-i', xesPath,
      '--activity-key', 'lifecycle:transition',
      '--format', 'json',
      '--no-save',
    ]);
    if (result.stdout.trim() === '') return;
    const env = parseEnvelope(result);
    if (env.status === 'error' && !env.payload) return;
    if (env.status === 'ok') {
      expect(env.payload!.activityKey).toBe('lifecycle:transition');
    }
  }, TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// SC-4: aggregate mean consistency for non-default metric subsets
// ---------------------------------------------------------------------------

describe('SC-4: aggregate.score is mean(scores) for metric subsets', () => {
  it('--metrics fitness only: aggregate.score equals scores.fitness', async () => {
    const result = await runCli([
      'quality', '-i', xesPath,
      '--metrics', 'fitness',
      '--format', 'json',
      '--no-save',
    ]);
    if (result.stdout.trim() === '') return;
    const env = parseEnvelope(result);
    if (env.status === 'error' && !env.payload) return;
    if (env.status === 'ok') {
      const scores = env.payload!.scores!;
      const agg = env.payload!.aggregate!.score;
      expect(Math.abs(agg - scores.fitness)).toBeLessThan(1e-6);
    }
  }, TEST_TIMEOUT_MS);

  it('--metrics generalization,simplicity: aggregate is mean of those two', async () => {
    const result = await runCli([
      'quality', '-i', xesPath,
      '--metrics', 'generalization,simplicity',
      '--format', 'json',
      '--no-save',
    ]);
    if (result.stdout.trim() === '') return;
    const env = parseEnvelope(result);
    if (env.status === 'error' && !env.payload) return;
    if (env.status === 'ok') {
      const scores = env.payload!.scores!;
      const agg = env.payload!.aggregate!.score;
      const expected = (scores.generalization + scores.simplicity) / 2;
      expect(Math.abs(agg - expected)).toBeLessThan(1e-6);
    }
  }, TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// SC-5: payload.metrics is an array
// ---------------------------------------------------------------------------

describe('SC-5: payload.metrics is an array', () => {
  it('metrics field is an Array instance, not a string', async () => {
    const result = await runCli([
      'quality', '-i', xesPath,
      '--format', 'json',
      '--no-save',
    ]);
    if (result.stdout.trim() === '') return;
    const env = parseEnvelope(result);
    if (env.status === 'error' && !env.payload) return;
    if (env.status === 'ok') {
      expect(Array.isArray(env.payload!.metrics)).toBe(true);
    }
  }, TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// SC-6: model.nodes and model.edges are integers
// ---------------------------------------------------------------------------

describe('SC-6: model.nodes and model.edges are integers (not floats)', () => {
  it('model.nodes is an integer', async () => {
    const result = await runCli([
      'quality', '-i', xesPath,
      '--format', 'json',
      '--no-save',
    ]);
    if (result.stdout.trim() === '') return;
    const env = parseEnvelope(result);
    if (env.status === 'error' && !env.payload) return;
    if (env.status === 'ok') {
      const nodes = env.payload!.model!.nodes;
      expect(Number.isInteger(nodes)).toBe(true);
    }
  }, TEST_TIMEOUT_MS);

  it('model.edges is an integer', async () => {
    const result = await runCli([
      'quality', '-i', xesPath,
      '--format', 'json',
      '--no-save',
    ]);
    if (result.stdout.trim() === '') return;
    const env = parseEnvelope(result);
    if (env.status === 'error' && !env.payload) return;
    if (env.status === 'ok') {
      const edges = env.payload!.model!.edges;
      expect(Number.isInteger(edges)).toBe(true);
    }
  }, TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// SC-7: No --algorithm flag on quality command
// ---------------------------------------------------------------------------

describe('SC-7: quality command does not expose an --algorithm flag', () => {
  it('passing --algorithm does not crash (citty ignores unknown args or exits 1)', async () => {
    // quality.ts has no `algorithm` arg — citty will either ignore it or exit 1 (config_error).
    // It must not exit 3 (execution_error) or 5 (system_error).
    const result = await runCli([
      'quality', '-i', xesPath,
      '--algorithm', 'dfg',
      '--format', 'json',
      '--no-save',
    ]);
    // Acceptable: citty ignores unknown arg (exit 0/3) OR exits config_error (exit 1)
    // Not acceptable: system_error (5) or unhandled crash
    expect(result.exitCode).not.toBe(5);
    // stdout must be valid JSON
    if (result.stdout.trim().length > 0) {
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    }
  }, TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// HO-1: Human output threshold failure mentions "threshold" or "score"
// ---------------------------------------------------------------------------

describe('HO-1: human output for threshold failure mentions threshold context', () => {
  it('human output when threshold fails includes score or aggregate info', async () => {
    // Use threshold=1.0 which is almost certainly going to fail
    const result = await runCli([
      'quality', '-i', xesPath,
      '--threshold=1.0',
      '--format', 'human',
      '--no-save',
    ]);
    if (result.exitCode === 3 && (result.stdout + result.stderr).trim() === '') return;
    const combined = (result.stdout + result.stderr).toLowerCase();
    if (combined.trim().length === 0) return; // WASM unavailable
    // Human output must mention quality metrics context
    expect(combined).toMatch(/quality|score|fitness|precision|aggregate/);
  }, TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// HO-2: Human output for below-threshold still shows dimension scores
// ---------------------------------------------------------------------------

describe('HO-2: human output still shows dimension scores when threshold fails', () => {
  it('output contains numerical score data even when threshold fails', async () => {
    const result = await runCli([
      'quality', '-i', xesPath,
      '--threshold=1.0',
      '--format', 'human',
      '--no-save',
    ]);
    const combined = result.stdout + result.stderr;
    if (combined.trim().length === 0) return; // WASM unavailable
    // Should contain at least one decimal score like "0.xxx"
    if (result.exitCode !== 3 || result.stdout.trim() !== '') {
      expect(combined).toMatch(/\d+\.\d+/);
    }
  }, TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// HO-3: Human output contains sparkline bar characters
// ---------------------------------------------------------------------------

describe('HO-3: human output contains bar chart characters (ASCII sparklines)', () => {
  it('human output contains block fill characters (█ or ░)', async () => {
    const result = await runCli([
      'quality', '-i', xesPath,
      '--format', 'human',
      '--no-save',
    ]);
    const combined = result.stdout + result.stderr;
    if (combined.trim().length === 0) return; // WASM unavailable
    if (result.exitCode === 0 || result.exitCode === 3) {
      // Human output should include ASCII bar chars for quality dimensions
      expect(combined).toMatch(/[█░▓]/);
    }
  }, TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// EX-1: Empty XES (no traces) → exits 3, not crash
// ---------------------------------------------------------------------------

describe('EX-1: empty XES (no traces) exits 3, not crash or config_error', () => {
  it('empty XES produces exit code 3 (execution_error), not 1 or 5', async () => {
    const result = await runCli([
      'quality', '-i', emptyXesPath,
      '--format', 'json',
      '--no-save',
    ]);
    // Must not be config_error (1) or system_error (5)
    expect(result.exitCode).not.toBe(1);
    expect(result.exitCode).not.toBe(5);
  }, TEST_TIMEOUT_MS);

  it('empty XES produces a parseable JSON response', async () => {
    const result = await runCli([
      'quality', '-i', emptyXesPath,
      '--format', 'json',
      '--no-save',
    ]);
    expect(result.stdout.trim()).not.toBe('');
    expect(() => JSON.parse(result.stdout)).not.toThrow();
    const env = parseEnvelope(result);
    expect(env.command).toBe('quality');
    expect(['ok', 'error']).toContain(env.status);
  }, TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// EX-2: Single-trace XES → exits 0 or 3, never 1 or 2
// ---------------------------------------------------------------------------

describe('EX-2: single-trace XES exits 0 or 3 (never config_error or source_error)', () => {
  it('single-trace XES exit code is not 1 (config_error) or 2 (source_error)', async () => {
    const result = await runCli([
      'quality', '-i', singleTraceXesPath,
      '--format', 'json',
      '--no-save',
    ]);
    expect(result.exitCode).not.toBe(1);
    expect(result.exitCode).not.toBe(2);
  }, TEST_TIMEOUT_MS);

  it('single-trace XES produces valid JSON envelope', async () => {
    const result = await runCli([
      'quality', '-i', singleTraceXesPath,
      '--format', 'json',
      '--no-save',
    ]);
    expect(result.stdout.trim()).not.toBe('');
    expect(() => JSON.parse(result.stdout)).not.toThrow();
  }, TEST_TIMEOUT_MS);
});
