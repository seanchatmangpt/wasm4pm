/**
 * explain-gaps.test.ts
 *
 * Adversarial audit of `wpm explain` covering all gaps identified in the DX audit:
 *   1. Unknown algorithm → exit 1, code UNKNOWN_ALGORITHM (not exit 0 with wrong data)
 *   2. No-argument mode → exit 0, algorithm:null in payload
 *   3. Nine standard discovery algorithms all return exit 0 with full payload contract
 *   4. --format json on error → structured JSON, not plaintext
 *   5. --verbose does not crash and still emits JSON contract
 *   6. Case sensitivity: DFG, Heuristic, ILP all resolve correctly
 *   7. Six ML algorithms all return exit 0 with algorithm field
 *   8. JSON payload field completeness: algorithm, strengths, weaknesses, use_cases,
 *      complexity, parameters are all present for known algorithms
 *   9. Fuzzy match regression: simd_streaming_dfg must NOT match dfg
 *
 * Van der Aalst north star: "What process model is hidden in this event log?" starts
 * with "Which algorithm should I use?" — explain closes the gap from question to choice.
 */

import { spawn } from 'child_process';
import { join } from 'path';

const WPM_BIN = join(import.meta.dirname, '../../dist/bin/wpm.js');

interface ExplainResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  json?: Record<string, unknown>;
}

function runExplain(args: string[]): Promise<ExplainResult> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    const proc = spawn(process.execPath, [WPM_BIN, 'explain', ...args], {
      env: { ...process.env, NODE_ENV: 'test' },
    });
    proc.stdout.on('data', (d: Buffer) => chunks.push(d));
    proc.stderr.on('data', (d: Buffer) => errChunks.push(d));
    proc.on('close', (code) => {
      const stdout = Buffer.concat(chunks).toString('utf8').trim();
      const stderr = Buffer.concat(errChunks).toString('utf8').trim();
      let json: Record<string, unknown> | undefined;
      try {
        json = JSON.parse(stdout) as Record<string, unknown>;
      } catch {
        json = undefined;
      }
      resolve({ stdout, stderr, exitCode: code ?? 0, json });
    });
  });
}

// ---------------------------------------------------------------------------
// Gap 1 — Unknown algorithm
// ---------------------------------------------------------------------------
describe('Gap 1: unknown algorithm', () => {
  it('returns exit 1 for an unknown algorithm name', async () => {
    const r = await runExplain(['totally_unknown_xyz', '--format', 'json']);
    expect(r.exitCode).toBe(1);
  });

  it('returns UNKNOWN_ALGORITHM error code, not a success payload', async () => {
    const r = await runExplain(['totally_unknown_xyz', '--format', 'json']);
    expect(r.json).toBeDefined();
    expect(r.json!.status).toBe('error');
    const err = r.json!.error as { code: string; message: string };
    expect(err.code).toBe('UNKNOWN_ALGORITHM');
    expect(err.message).toContain('totally_unknown_xyz');
  });

  it('payload is null for unknown algorithm (no partial data leak)', async () => {
    const r = await runExplain(['totally_unknown_xyz', '--format', 'json']);
    expect(r.json!.payload).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Gap 2 — Zero-argument mode
// ---------------------------------------------------------------------------
describe('Gap 2: zero-argument mode', () => {
  it('returns exit 0 with no arguments', async () => {
    const r = await runExplain(['--format', 'json']);
    expect(r.exitCode).toBe(0);
  });

  it('returns status ok with no arguments', async () => {
    const r = await runExplain(['--format', 'json']);
    expect(r.json!.status).toBe('ok');
  });

  it('includes algorithm:null in the payload (not missing field)', async () => {
    const r = await runExplain(['--format', 'json']);
    const payload = r.json!.payload as Record<string, unknown>;
    // 'algorithm' key must be present and null — not absent.
    expect(Object.prototype.hasOwnProperty.call(payload, 'algorithm')).toBe(true);
    expect(payload.algorithm).toBeNull();
  });

  it('sets subject to algorithm-menu', async () => {
    const r = await runExplain(['--format', 'json']);
    const payload = r.json!.payload as Record<string, unknown>;
    expect(payload.subject).toBe('algorithm-menu');
  });
});

// ---------------------------------------------------------------------------
// Gap 3 — Nine standard discovery algorithms
// ---------------------------------------------------------------------------
const STANDARD_ALGORITHMS = [
  'dfg',
  'alpha',
  'heuristic',
  'inductive',
  'genetic',
  'ilp',
  'astar',
  'aco',
  'pso',
] as const;

describe('Gap 3: nine standard discovery algorithms', () => {
  for (const algo of STANDARD_ALGORITHMS) {
    it(`${algo}: returns exit 0 and status ok`, async () => {
      const r = await runExplain([algo, '--format', 'json']);
      expect(r.exitCode).toBe(0);
      expect(r.json!.status).toBe('ok');
    });

    it(`${algo}: payload.algorithm equals the requested algorithm`, async () => {
      const r = await runExplain([algo, '--format', 'json']);
      const payload = r.json!.payload as Record<string, unknown>;
      expect(payload.algorithm).toBe(algo);
    });

    it(`${algo}: content is non-empty string`, async () => {
      const r = await runExplain([algo, '--format', 'json']);
      const payload = r.json!.payload as Record<string, unknown>;
      expect(typeof payload.content).toBe('string');
      expect((payload.content as string).length).toBeGreaterThan(20);
    });
  }
});

// ---------------------------------------------------------------------------
// Gap 4 — --format json on error path
// ---------------------------------------------------------------------------
describe('Gap 4: --format json on error', () => {
  it('emits valid JSON (not plaintext) for unknown algorithm with --format json', async () => {
    const r = await runExplain(['no_such_algo', '--format', 'json']);
    expect(r.json).toBeDefined();
    expect(typeof r.json!.command).toBe('string');
    expect(typeof r.json!.status).toBe('string');
  });

  it('error JSON has the command field set to "explain"', async () => {
    const r = await runExplain(['no_such_algo', '--format', 'json']);
    expect(r.json!.command).toBe('explain');
  });
});

// ---------------------------------------------------------------------------
// Gap 5 — --verbose flag
// ---------------------------------------------------------------------------
describe('Gap 5: --verbose flag', () => {
  it('does not crash when --verbose is passed with a known algorithm', async () => {
    const r = await runExplain(['dfg', '--format', 'json', '--verbose']);
    expect(r.exitCode).toBe(0);
  });

  it('still emits valid JSON payload when --verbose is passed', async () => {
    const r = await runExplain(['dfg', '--format', 'json', '--verbose']);
    expect(r.json).toBeDefined();
    expect(r.json!.status).toBe('ok');
    const payload = r.json!.payload as Record<string, unknown>;
    expect(payload.algorithm).toBe('dfg');
  });
});

// ---------------------------------------------------------------------------
// Gap 6 — Case sensitivity
// ---------------------------------------------------------------------------
describe('Gap 6: case sensitivity', () => {
  it('resolves DFG (uppercase) to dfg', async () => {
    const r = await runExplain(['DFG', '--format', 'json']);
    expect(r.exitCode).toBe(0);
    const payload = r.json!.payload as Record<string, unknown>;
    expect(payload.algorithm).toBe('DFG');
    // content must be non-trivial dfg explanation, not an error
    expect((payload.content as string).toLowerCase()).toContain('directly');
  });

  it('resolves Heuristic (mixed case) to heuristic', async () => {
    const r = await runExplain(['Heuristic', '--format', 'json']);
    expect(r.exitCode).toBe(0);
    expect(r.json!.status).toBe('ok');
  });

  it('resolves ILP (uppercase) to ilp', async () => {
    const r = await runExplain(['ILP', '--format', 'json']);
    expect(r.exitCode).toBe(0);
    expect(r.json!.status).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// Gap 7 — ML algorithms
// ---------------------------------------------------------------------------
const ML_ALGORITHMS = [
  'ml_cluster',
  'ml_anomaly',
  'ml_classify',
  'ml_forecast',
  'ml_regress',
  'ml_pca',
] as const;

describe('Gap 7: ML algorithms', () => {
  for (const algo of ML_ALGORITHMS) {
    it(`${algo}: returns exit 0 and status ok`, async () => {
      const r = await runExplain([algo, '--format', 'json']);
      expect(r.exitCode).toBe(0);
      expect(r.json!.status).toBe('ok');
    });

    it(`${algo}: payload.algorithm equals the requested algorithm`, async () => {
      const r = await runExplain([algo, '--format', 'json']);
      const payload = r.json!.payload as Record<string, unknown>;
      expect(payload.algorithm).toBe(algo);
    });
  }
});

// ---------------------------------------------------------------------------
// Gap 8 — JSON payload field completeness
// ---------------------------------------------------------------------------
describe('Gap 8: JSON payload field completeness', () => {
  const KNOWN_ALGOS: string[] = ['dfg', 'genetic', 'ilp', 'ml_cluster', 'ml_anomaly'];

  for (const algo of KNOWN_ALGOS) {
    it(`${algo}: strengths is a non-empty array`, async () => {
      const r = await runExplain([algo, '--format', 'json']);
      const payload = r.json!.payload as Record<string, unknown>;
      expect(Array.isArray(payload.strengths)).toBe(true);
      expect((payload.strengths as unknown[]).length).toBeGreaterThan(0);
    });

    it(`${algo}: weaknesses is a non-empty array`, async () => {
      const r = await runExplain([algo, '--format', 'json']);
      const payload = r.json!.payload as Record<string, unknown>;
      expect(Array.isArray(payload.weaknesses)).toBe(true);
      expect((payload.weaknesses as unknown[]).length).toBeGreaterThan(0);
    });

    it(`${algo}: use_cases is a non-empty array`, async () => {
      const r = await runExplain([algo, '--format', 'json']);
      const payload = r.json!.payload as Record<string, unknown>;
      expect(Array.isArray(payload.use_cases)).toBe(true);
      expect((payload.use_cases as unknown[]).length).toBeGreaterThan(0);
    });

    it(`${algo}: complexity is a non-empty string`, async () => {
      const r = await runExplain([algo, '--format', 'json']);
      const payload = r.json!.payload as Record<string, unknown>;
      expect(typeof payload.complexity).toBe('string');
      expect((payload.complexity as string).length).toBeGreaterThan(0);
    });

    it(`${algo}: parameters is a non-empty array with name/type/description`, async () => {
      const r = await runExplain([algo, '--format', 'json']);
      const payload = r.json!.payload as Record<string, unknown>;
      expect(Array.isArray(payload.parameters)).toBe(true);
      const params = payload.parameters as Array<Record<string, unknown>>;
      expect(params.length).toBeGreaterThan(0);
      const first = params[0];
      expect(typeof first.name).toBe('string');
      expect(typeof first.type).toBe('string');
      expect(typeof first.description).toBe('string');
    });
  }

  it('dfg: parameters includes activity_key with default concept:name', async () => {
    const r = await runExplain(['dfg', '--format', 'json']);
    const payload = r.json!.payload as Record<string, unknown>;
    const params = payload.parameters as Array<Record<string, unknown>>;
    const activityParam = params.find((p) => p.name === 'activity_key');
    expect(activityParam).toBeDefined();
    expect(activityParam!.default).toBe('concept:name');
  });

  it('quality_dimensions has all four Van der Aalst fields', async () => {
    const r = await runExplain(['dfg', '--format', 'json']);
    const payload = r.json!.payload as Record<string, unknown>;
    const qd = payload.quality_dimensions as Record<string, unknown>;
    expect(typeof qd.fitness).toBe('string');
    expect(typeof qd.precision).toBe('string');
    expect(typeof qd.generalization).toBe('string');
    expect(typeof qd.simplicity).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// Gap 9 — Fuzzy match regression
// ---------------------------------------------------------------------------
describe('Gap 9: fuzzy match regression — simd_streaming_dfg must not match dfg', () => {
  it('simd_streaming_dfg resolves to its own SIMD-specific explanation (exit 0)', async () => {
    // Previously this was UNKNOWN_ALGORITHM. Now simd_streaming_dfg has a proper explanation.
    // The key invariant is that it does NOT silently return dfg content.
    const r = await runExplain(['simd_streaming_dfg', '--format', 'json']);
    expect(r.exitCode).toBe(0);
    const payload = r.json!.payload as Record<string, unknown>;
    expect(payload).not.toBeNull();
    // Must reference SIMD content, not generic dfg content
    expect((payload.content as string).toLowerCase()).toContain('simd');
  });

  it('simd_streaming_dfg does not silently return generic dfg content', async () => {
    const r = await runExplain(['simd_streaming_dfg', '--format', 'json']);
    expect(r.exitCode).toBe(0);
    const payload = r.json!.payload as Record<string, unknown>;
    // Must not say "simplest algorithm" (that's the standard dfg description)
    expect((payload.content as string).toLowerCase()).not.toContain('simplest and fastest');
    // Must say "SIMD" — that's the distinguishing characteristic
    expect((payload.content as string)).toContain('SIMD');
  });

  it('heuristic_miner alias resolves to heuristic', async () => {
    const r = await runExplain(['heuristic_miner', '--format', 'json']);
    expect(r.exitCode).toBe(0);
    const payload = r.json!.payload as Record<string, unknown>;
    // content should reference heuristic miner, not an error
    expect((payload.content as string).toLowerCase()).toContain('heuristic');
  });
});
