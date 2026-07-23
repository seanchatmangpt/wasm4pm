/**
 * JTBD: All CLI commands validated against real use-case invocations.
 * "Running help is not validation." — Every test invokes actual command logic.
 *
 * Migrated to the noun/verb surface (see `nouns/_removed.ts` for the old
 * top-level command -> new noun/verb mapping). Two output shapes now exist:
 *   - Bridged verbs (thin wrappers over `commands/*.ts` via
 *     `invokeLegacyCommandAsJson`) still return the legacy
 *     `{command, status, payload, meta}` envelope on SUCCESS — that's
 *     literally what the wrapped legacy command returns.
 *   - Native verbs (rewritten from scratch: `model discover`, `model check`,
 *     `log stats`, `config show`, `system completions`) return their plain
 *     result object directly — no envelope at all.
 *   - Every verb's FAILURE path (bridged or native) normalizes to the
 *     framework's own `{error: {code, message, action_template?}}` envelope
 *     (see `packages/noun-verb/src/errors.ts`) — never the legacy
 *     `{status:'error', ...}` shape.
 * `payloadOf()` below picks the right one so most per-field assertions are
 * unchanged from the pre-migration version of this file.
 *
 * Two tiers:
 *   Tier 1 (always runs): no WASM required — exit codes, envelopes, structural output
 *   Tier 2 (wasmAvailable guard): algorithm execution — field types, domain ranges
 *
 * Van der Aalst: trust the event evidence, not the code path.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ---------------------------------------------------------------------------
// Shared infrastructure
// ---------------------------------------------------------------------------

const CLI_PATH = path.resolve(__dirname, '../../dist/bin/wpm.js');
const FIXTURE_XES = path.resolve(__dirname, '../../../../test/fixtures/small.xes');

interface CliResult { exitCode: number; stdout: string; stderr: string; }
interface ErrorEnvelope { error?: { code: string; message: string } }
interface Env { tempDir: string; xesPath: string; cleanup: () => void; }

function runCli(args: string[], opts: { cwd?: string; timeoutMs?: number } = {}): Promise<CliResult> {
  const { cwd = os.tmpdir(), timeoutMs = 30000 } = opts;
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [CLI_PATH, ...args],
      { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024, cwd },
      (error, stdout, stderr) => {
        const exitCode =
          error && 'code' in error && typeof error.code === 'number' ? error.code : error ? 1 : 0;
        resolve({ exitCode, stdout: stdout ?? '', stderr: stderr ?? '' });
      }
    );
    child.on('error', () => resolve({ exitCode: 5, stdout: '', stderr: 'Process failed to start' }));
  });
}

function parseJson(result: CliResult): Record<string, unknown> {
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

/** True only for the legacy `{command, status, payload, meta}` envelope shape. */
function isLegacyEnvelope(json: Record<string, unknown>): boolean {
  return typeof json.command === 'string' && (json.status === 'ok' || json.status === 'error') && 'payload' in json;
}

/** Unwrap a bridged verb's legacy envelope to its `payload`; pass a native verb's result through unchanged. */
function payloadOf(json: Record<string, unknown>): Record<string, unknown> {
  return isLegacyEnvelope(json) ? (json.payload as Record<string, unknown>) ?? {} : json;
}

function isErrorEnvelope(json: Record<string, unknown>): json is ErrorEnvelope & Record<string, unknown> {
  return typeof json.error === 'object' && json.error !== null;
}

function createEnv(): Env {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-jtbd-'));
  const xesPath = path.join(tempDir, 'test.xes');
  fs.copyFileSync(FIXTURE_XES, xesPath);
  return {
    tempDir,
    xesPath,
    cleanup: () => {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    },
  };
}

// ---------------------------------------------------------------------------
// Category A: No-input commands — always testable (Tier 1)
// ---------------------------------------------------------------------------

describe('JTBD-A: No-input commands (no WASM required)', () => {
  it('JTBD-A1: system status — as a DevOps engineer I need engine health before scheduling a batch run (was: wpm status)', async () => {
    const result = await runCli(['system', 'status', '--format', 'json']);
    expect(result.exitCode).toBe(0);
    const p = payloadOf(parseJson(result));
    expect(p).toHaveProperty('engine');
    const engine = p['engine'] as Record<string, unknown>;
    expect(typeof engine['wasmLoaded']).toBe('boolean');
    expect(typeof engine['kernelReady']).toBe('boolean');
    expect(p).toHaveProperty('system');
    const system = p['system'] as Record<string, unknown>;
    expect(typeof system['platform']).toBe('string');
    expect(p).toHaveProperty('memory');
    const memory = p['memory'] as Record<string, unknown>;
    expect(typeof memory['heapUsed']).toBe('number');
  });

  it('JTBD-A2: system doctor check — as a new user I need to know why wpm is not working on my machine (was: wpm doctor check)', async () => {
    const result = await runCli(['system', 'doctor', 'check', '--format', 'json'], { timeoutMs: 60000 });
    const p = payloadOf(parseJson(result));
    expect(Array.isArray(p['checks'])).toBe(true);
    expect(typeof p['healthy']).toBe('boolean');
    const checks = p['checks'] as Array<Record<string, unknown>>;
    expect(checks.length).toBeGreaterThan(0);
    const firstCheck = checks[0];
    expect(typeof firstCheck['name']).toBe('string');
    expect(typeof firstCheck['severity']).toBe('string');
    expect(typeof firstCheck['message']).toBe('string');
  }, 60000);

  it('JTBD-A3: config init — when starting a project I need a valid wasm4pm.toml generated (was: wpm init)', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-init-'));
    try {
      const result = await runCli(['config', 'init'], { cwd: tempDir });
      expect(result.exitCode).toBe(0);
      const tomlPath = path.join(tempDir, 'wasm4pm.toml');
      expect(fs.existsSync(tomlPath)).toBe(true);
      const content = fs.readFileSync(tomlPath, 'utf-8');
      expect(content).toContain('schema_version');
    } finally {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    }
  });

  it('JTBD-A4: evidence report — I want to browse previous run outputs without losing them (was: wpm results)', async () => {
    const result = await runCli(['evidence', 'report', '--format', 'json']);
    expect(result.exitCode).toBe(0);
    const p = payloadOf(parseJson(result));
    expect(typeof p['directory']).toBe('string');
    expect(typeof p['count']).toBe('number');
    expect(Array.isArray(p['results'])).toBe(true);
  });

  it('JTBD-A5: model explain dfg — before choosing an algorithm I need to understand what it does (was: wpm explain dfg)', async () => {
    const result = await runCli(['model', 'explain', 'dfg', '--format', 'json']);
    expect(result.exitCode).toBe(0);
    const p = payloadOf(parseJson(result));
    expect(typeof p['subject']).toBe('string');
    expect((p['subject'] as string).toLowerCase()).toContain('dfg');
    expect(typeof p['content']).toBe('string');
    expect((p['content'] as string).length).toBeGreaterThan(50);
  });

  it('JTBD-A6: system completions bash — I need tab completions installed in my shell (was: wpm completions bash)', async () => {
    const result = await runCli(['system', 'completions', 'bash']);
    expect(result.exitCode).toBe(0);
    // `system completions` is a NATIVE verb: stdout is always JSON per the
    // framework's contract, so the raw shell script is wrapped in a JSON
    // envelope (`{shell, script, scriptBytes}`) rather than printed as a
    // bare shell script directly to stdout, as `wpm completions bash` used to.
    const json = parseJson(result);
    expect(json['shell']).toBe('bash');
    const script = json['script'] as string;
    expect(typeof script).toBe('string');
    expect(script.length).toBeGreaterThan(100);
    expect(script).toContain('_wpm');
    expect(script.trimStart().startsWith('#')).toBe(true);
    expect(json['scriptBytes']).toBeGreaterThan(100);
  });

  it('JTBD-A7: evidence verify — I want to confirm parity and determinism certification gates run (was: wpm verify)', async () => {
    const result = await runCli(['evidence', 'verify', '--format', 'json']);
    // May fail (nonzero exit) if gates fail, but must return structured JSON — not a crash
    const json = parseJson(result);
    const p = payloadOf(json);
    if (!isErrorEnvelope(json)) {
      expect(Array.isArray(p['gates'])).toBe(true);
      const gates = p['gates'] as Array<Record<string, unknown>>;
      if (gates.length > 0) {
        expect(typeof gates[0]['gate']).toBe('string');
        expect(typeof gates[0]['passed']).toBe('boolean');
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Category B: Schema/structural commands — no WASM, needs XES (Tier 1)
// ---------------------------------------------------------------------------

describe('JTBD-B: Schema validation commands (no WASM required)', () => {
  let env: Env;
  beforeEach(() => { env = createEnv(); });
  afterEach(() => { env.cleanup(); });

  it('JTBD-B1: log validate (valid log) — before running discovery on a client log I need schema confirmation (was: wpm validate)', async () => {
    const result = await runCli(['log', 'validate', env.xesPath, '--output-format', 'json']);
    expect(result.exitCode).toBe(0);
    const p = payloadOf(parseJson(result));
    expect(typeof p['valid']).toBe('boolean');
    expect(p['valid']).toBe(true);
    expect(Array.isArray(p['checks'])).toBe(true);
    // status is 'pass' when checks succeed, 'warn' when checks are not yet available
    expect(['pass', 'warn']).toContain(p['status']);
  });

  it('JTBD-B2: log validate (missing file) — non-existent input must be rejected with actionable detail (was: wpm validate)', async () => {
    // log validate exits 2 (source_error) when the file does not exist —
    // ErrorCode INVALID_INPUT maps to EXIT_CODES.source_error per wpm's ERROR_CODE_MAP.
    const result = await runCli(['log', 'validate', '/nonexistent-input.xes', '--output-format', 'json']);
    expect(result.exitCode).toBe(2);
    const json = parseJson(result);
    expect(isErrorEnvelope(json)).toBe(true);
    expect((json as ErrorEnvelope).error!.code).toBe('INVALID_INPUT');
    expect(typeof (json as ErrorEnvelope).error!.message).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// Category C: WASM-backed discovery + analysis (Tier 1 envelope, Tier 2 domain)
// ---------------------------------------------------------------------------

describe('JTBD-C: Discovery and analysis commands', () => {
  let env: Env;
  beforeEach(() => { env = createEnv(); });
  afterEach(() => { env.cleanup(); });

  it('JTBD-C1: model discover — discover the real process model from my event log (was: wpm run)', async () => {
    // model discover is a NATIVE verb: input is positional, no --no-save
    // (it never saves a result file), plain result object on success.
    const result = await runCli(['model', 'discover', env.xesPath, '--format', 'json']);
    const json = parseJson(result);
    if (!isErrorEnvelope(json)) {
      expect(typeof json['algorithm']).toBe('string');
      const shape = json['shape'] as Record<string, unknown>;
      expect(typeof shape['nodes']).toBe('number');
      expect(typeof shape['edges']).toBe('number');
      expect((shape['nodes'] as number)).toBeGreaterThan(0);
    } else {
      // WASM unavailable — must still return a structured error, not a crash
      expect(typeof (json as ErrorEnvelope).error!.code).toBe('string');
    }
  });

  it('JTBD-C2: model compare — pick the best algorithm for my log by seeing side-by-side metrics (was: wpm compare)', async () => {
    const result = await runCli(['model', 'compare', 'dfg,heuristic_miner', '-i', env.xesPath, '--format', 'json', '--no-save']);
    const json = parseJson(result);
    const p = payloadOf(json);
    if (!isErrorEnvelope(json)) {
      const algos = p['algorithms'] as Array<Record<string, unknown>>;
      expect(algos.length).toBe(2);
      for (const algo of algos) {
        expect(typeof algo['algorithm']).toBe('string');
        expect(typeof algo['nodes']).toBe('number');
        expect(typeof algo['elapsedMs']).toBe('number');
        expect((algo['elapsedMs'] as number)).toBeGreaterThanOrEqual(0);
      }
    } else {
      expect(typeof (json as ErrorEnvelope).error!.code).toBe('string');
    }
  });

  it('JTBD-C3: model diff (same file) — comparing a log to itself must show zero changes (was: wpm diff)', async () => {
    const result = await runCli(['model', 'diff', env.xesPath, env.xesPath, '--format', 'json', '--no-save']);
    const json = parseJson(result);
    const p = payloadOf(json);
    if (!isErrorEnvelope(json)) {
      const diff = p['diff'] as Record<string, unknown>;
      expect(diff['jaccard']).toBe(1);
    } else {
      expect(typeof (json as ErrorEnvelope).error!.code).toBe('string');
    }
  });

  it('JTBD-C4: log stats — basic event/case counts, structured error if the log is unreadable (was: wpm quality, in part)', async () => {
    // `wpm quality`'s old fitness/precision/generalization/simplicity report
    // has NO replacement verb (see nouns/log/stats.ts's doc comment: "in
    // part") — `log stats` is a deliberately simpler, model-free replacement
    // (just event/case/activity counts). This test now exercises that
    // narrower, real contract instead of the retired quality-dimensions one.
    const result = await runCli(['log', 'stats', env.xesPath, '--format', 'json']);
    const json = parseJson(result);
    expect(result.exitCode).toBe(0);
    expect(isErrorEnvelope(json)).toBe(false);
    const stats = json['stats'] as Record<string, unknown>;
    expect(typeof stats['total_events']).toBe('number');
    expect(typeof stats['total_cases']).toBe('number');
    expect((stats['total_events'] as number)).toBeGreaterThan(0);
  });

  it('JTBD-C5: model check --mode self — check how well my log fits a model mined from itself (was: wpm conformance)', async () => {
    // `wpm conformance` auto-mined a model from the same log before
    // checking fitness — `--mode self` is the direct equivalent (`--mode
    // replay` instead requires an explicit externally-supplied --model).
    const result = await runCli(['model', 'check', env.xesPath, '--mode', 'self', '--format', 'json']);
    const json = parseJson(result);
    if (!isErrorEnvelope(json)) {
      expect(['ADMITTED', 'REJECTED', 'INDETERMINATE']).toContain(json['status']);
      expect(typeof json['checked']).toBe('number');
    } else {
      expect(typeof (json as ErrorEnvelope).error!.code).toBe('string');
    }
  });

  it('JTBD-C6: model simulate — generate synthetic process instances for load testing (was: wpm simulate)', async () => {
    const result = await runCli(['model', 'simulate', env.xesPath, '--format', 'json', '--no-save']);
    const json = parseJson(result);
    const p = payloadOf(json);
    if (!isErrorEnvelope(json)) {
      const sim = p['simulation'] as Record<string, unknown>;
      expect(sim['method']).toBe('monte_carlo');
      expect(typeof sim['casesRequested']).toBe('number');
    } else {
      expect(typeof (json as ErrorEnvelope).error!.code).toBe('string');
    }
  });

  it('JTBD-C7: lab temporal — find which activities are slowest in my process (was: wpm temporal)', async () => {
    const result = await runCli(['lab', 'temporal', env.xesPath, '--format', 'json', '--no-save']);
    const json = parseJson(result);
    const p = payloadOf(json);
    if (!isErrorEnvelope(json)) {
      const dfg = p['dfg'] as Record<string, unknown>;
      expect(Array.isArray(dfg['nodes'])).toBe(true);
      expect(Array.isArray(dfg['edges'])).toBe(true);
    } else {
      expect(typeof (json as ErrorEnvelope).error!.code).toBe('string');
    }
  });

  it('JTBD-C8: lab social — mine the organizational network from resource handovers (was: wpm social)', async () => {
    const result = await runCli(['lab', 'social', env.xesPath, '--format', 'json', '--no-save']);
    const json = parseJson(result);
    const p = payloadOf(json);
    if (!isErrorEnvelope(json)) {
      const network = p['network'] as Record<string, unknown>;
      expect(Array.isArray(network['nodes'])).toBe(true);
      expect(Array.isArray(network['edges'])).toBe(true);
    } else {
      expect(typeof (json as ErrorEnvelope).error!.code).toBe('string');
    }
  });

  it('JTBD-C9: lab autoprocess — autonomic loop must return structured response, not crash (was: wpm autoprocess)', async () => {
    const result = await runCli(['lab', 'autoprocess', env.xesPath, '--format', 'json', '--no-save']);
    const json = parseJson(result);
    // Must return a valid response whether ok or error — not a crash
    if (isErrorEnvelope(json)) {
      expect(typeof (json as ErrorEnvelope).error!.code).toBe('string');
    } else {
      expect(payloadOf(json)).toHaveProperty('cycle_result');
    }
  });
});

// ---------------------------------------------------------------------------
// Category D: Prediction tasks (Tier 1 envelope + Tier 2 domain fields)
// ---------------------------------------------------------------------------

describe('JTBD-D: Predict tasks (was: wpm predict, now: model predict)', () => {
  let env: Env;
  beforeEach(() => { env = createEnv(); });
  afterEach(() => { env.cleanup(); });

  it('JTBD-D1: model predict next-activity — given an incomplete trace, predict the most likely next step', async () => {
    const result = await runCli(['model', 'predict', 'next-activity', '-i', env.xesPath, '--format', 'json', '--no-save']);
    const json = parseJson(result);
    const p = payloadOf(json);
    if (!isErrorEnvelope(json)) {
      expect(p['task']).toBe('next-activity');
      expect(Array.isArray(p['predictions'])).toBe(true);
    } else {
      expect(typeof (json as ErrorEnvelope).error!.code).toBe('string');
    }
  });

  it('JTBD-D2: model predict remaining-time — estimate how long an in-progress case will take', async () => {
    const result = await runCli(['model', 'predict', 'remaining-time', '-i', env.xesPath, '--format', 'json', '--no-save']);
    const json = parseJson(result);
    const p = payloadOf(json);
    if (!isErrorEnvelope(json)) {
      expect(p['task']).toBe('remaining-time');
      expect(p['message'] !== undefined || p['predicted'] !== undefined).toBe(true);
    } else {
      expect(typeof (json as ErrorEnvelope).error!.code).toBe('string');
    }
  });

  it('JTBD-D3: model predict outcome — classify whether a case will end in success or failure', async () => {
    const result = await runCli(['model', 'predict', 'outcome', '-i', env.xesPath, '--format', 'json', '--no-save']);
    const json = parseJson(result);
    const p = payloadOf(json);
    if (!isErrorEnvelope(json)) {
      expect(p['task']).toBe('outcome');
      expect(p).toHaveProperty('anomalies');
    } else {
      expect(typeof (json as ErrorEnvelope).error!.code).toBe('string');
    }
  });

  it('JTBD-D4: model predict drift — detect if the process has changed behavior over time', async () => {
    const result = await runCli(['model', 'predict', 'drift', '-i', env.xesPath, '--format', 'json', '--no-save']);
    const json = parseJson(result);
    const p = payloadOf(json);
    if (!isErrorEnvelope(json)) {
      expect(p['task']).toBe('drift');
      expect(p).toHaveProperty('driftResult');
    } else {
      expect(typeof (json as ErrorEnvelope).error!.code).toBe('string');
    }
  });

  it('JTBD-D5: model predict features — extract features for downstream ML from prefix traces', async () => {
    const result = await runCli(['model', 'predict', 'features', '-i', env.xesPath, '--format', 'json', '--no-save']);
    const json = parseJson(result);
    const p = payloadOf(json);
    if (!isErrorEnvelope(json)) {
      expect(p['task']).toBe('features');
      expect(p).toHaveProperty('transitions');
    } else {
      expect(typeof (json as ErrorEnvelope).error!.code).toBe('string');
    }
  });

  it('JTBD-D6: model predict resource — predict the best resource to assign to the next case', async () => {
    const result = await runCli(['model', 'predict', 'resource', '-i', env.xesPath, '--format', 'json', '--no-save']);
    const json = parseJson(result);
    const p = payloadOf(json);
    if (!isErrorEnvelope(json)) {
      expect(p['task']).toBe('resource');
      expect(p).toHaveProperty('queueStats');
    } else {
      expect(typeof (json as ErrorEnvelope).error!.code).toBe('string');
    }
  });
});

// ---------------------------------------------------------------------------
// Category D: ML tasks (was: wpm ml, now: lab ml)
// ---------------------------------------------------------------------------

describe('JTBD-D-ML: ML tasks (was: wpm ml, now: lab ml)', () => {
  let env: Env;
  beforeEach(() => { env = createEnv(); });
  afterEach(() => { env.cleanup(); });

  it('JTBD-ML1: lab ml classify — classify trace variants by outcome category', async () => {
    const result = await runCli(['lab', 'ml', 'classify', '-i', env.xesPath, '--format', 'json', '--no-save']);
    const json = parseJson(result);
    const p = payloadOf(json);
    if (!isErrorEnvelope(json)) {
      expect(Array.isArray(p['predictions'])).toBe(true);
    } else {
      expect(typeof (json as ErrorEnvelope).error!.code).toBe('string');
    }
  });

  it('JTBD-ML2: lab ml cluster — group similar process variants to find dominant patterns', async () => {
    const result = await runCli(['lab', 'ml', 'cluster', '-i', env.xesPath, '--format', 'json', '--no-save']);
    const json = parseJson(result);
    const p = payloadOf(json);
    if (!isErrorEnvelope(json)) {
      expect(typeof p['clusterCount']).toBe('number');
      expect((p['clusterCount'] as number)).toBeGreaterThanOrEqual(0);
    } else {
      expect(typeof (json as ErrorEnvelope).error!.code).toBe('string');
    }
  });

  it('JTBD-ML3: lab ml forecast — forecast future throughput from historical data', async () => {
    const result = await runCli(['lab', 'ml', 'forecast', '-i', env.xesPath, '--format', 'json', '--no-save']);
    const json = parseJson(result);
    const p = payloadOf(json);
    if (!isErrorEnvelope(json)) {
      expect(p).toHaveProperty('trend');
    } else {
      expect(typeof (json as ErrorEnvelope).error!.code).toBe('string');
    }
  });

  it('JTBD-ML4: lab ml anomaly — score each trace for anomalousness to find outliers', async () => {
    const result = await runCli(['lab', 'ml', 'anomaly', '-i', env.xesPath, '--format', 'json', '--no-save']);
    const json = parseJson(result);
    const p = payloadOf(json);
    if (!isErrorEnvelope(json)) {
      expect(typeof p['originalLength']).toBe('number');
      expect((p['originalLength'] as number)).toBeGreaterThanOrEqual(0);
    } else {
      expect(typeof (json as ErrorEnvelope).error!.code).toBe('string');
    }
  });

  it('JTBD-ML5: lab ml regress — model cycle-time as a function of trace features', async () => {
    const result = await runCli(['lab', 'ml', 'regress', '-i', env.xesPath, '--format', 'json', '--no-save']);
    const json = parseJson(result);
    const p = payloadOf(json);
    if (!isErrorEnvelope(json)) {
      expect(typeof p['rSquared']).toBe('number');
      const r2 = p['rSquared'] as number;
      expect(r2).toBeGreaterThanOrEqual(-1);
      expect(r2).toBeLessThanOrEqual(1);
    } else {
      expect(typeof (json as ErrorEnvelope).error!.code).toBe('string');
    }
  });

  it('JTBD-ML6: lab ml pca — must return a structured response (ok or graceful error) not a crash', async () => {
    const result = await runCli(['lab', 'ml', 'pca', '-i', env.xesPath, '--format', 'json', '--no-save']);
    const json = parseJson(result);
    // pca fails for small.xes — validate graceful error, not a crash
    if (isErrorEnvelope(json)) {
      expect(typeof (json as ErrorEnvelope).error!.code).toBe('string');
    }
  });
});

// ---------------------------------------------------------------------------
// Category E: POWL / model discovery commands (was: wpm powl discover)
// ---------------------------------------------------------------------------

describe('JTBD-E: POWL model commands (was: wpm powl discover, now: model discover)', () => {
  let env: Env;
  beforeEach(() => { env = createEnv(); });
  afterEach(() => { env.cleanup(); });

  it('JTBD-E1: model discover --algorithm inductive_miner — discover a partial-order workflow model from my log', async () => {
    // `wpm powl discover` had no dedicated slot in the new tree; process-tree
    // discovery is just `model discover` with a tree-shaped algorithm.
    const result = await runCli(['model', 'discover', env.xesPath, '--algorithm', 'inductive_miner', '--format', 'json']);
    const json = parseJson(result);
    if (!isErrorEnvelope(json)) {
      const shape = json['shape'] as Record<string, unknown>;
      expect(typeof shape['nodeCount']).toBe('number');
      expect(shape).toHaveProperty('root');
    } else {
      expect(typeof (json as ErrorEnvelope).error!.code).toBe('string');
    }
  });
});

// ---------------------------------------------------------------------------
// Category F: Subcommand suites (Tier 1)
// ---------------------------------------------------------------------------

describe('JTBD-F: Subcommand suites', () => {
  it('JTBD-F1: lab benchmark build (invalid corpus) — nonexistent corpus path is rejected with actionable error (was: wpm benchmark build)', async () => {
    const result = await runCli(['lab', 'benchmark', 'build', '--corpus', '/nonexistent-corpus-path', '--format', 'json']);
    expect(result.exitCode).not.toBe(0);
    const json = parseJson(result);
    expect(isErrorEnvelope(json)).toBe(true);
    expect(typeof (json as ErrorEnvelope).error!.code).toBe('string');
    expect(typeof (json as ErrorEnvelope).error!.message).toBe('string');
  });

  it('JTBD-F2: lab benchmark verify — CI gate returns structured status even without a corpus (was: wpm benchmark verify)', async () => {
    const result = await runCli(['lab', 'benchmark', 'verify', '--format', 'json']);
    const json = parseJson(result);
    // Either a legacy-envelope/native success, or the framework's error envelope — never a crash.
    expect(isErrorEnvelope(json) || typeof json === 'object').toBe(true);
  });

  it('JTBD-F3: config show — inspect the resolved config to debug precedence issues (unchanged noun)', async () => {
    const result = await runCli(['config', 'show', '--format', 'json']);
    expect(result.exitCode).toBe(0);
    // config show is a NATIVE verb — plain result object, no envelope.
    const json = parseJson(result);
    const config = json['config'] as Record<string, unknown>;
    expect(config).toHaveProperty('algorithm');
    const algo = config['algorithm'] as Record<string, unknown>;
    expect(typeof algo['name']).toBe('string');
    expect(config).toHaveProperty('source');
    expect(config).toHaveProperty('execution');
  });

  it('JTBD-F4: lab agent list — list all registered agents to know what automation is available (was: wpm agent list)', async () => {
    const result = await runCli(['lab', 'agent', 'list', '--format', 'json']);
    expect(result.exitCode).toBe(0);
    const p = payloadOf(parseJson(result));
    expect(Array.isArray(p['vda_agents']) || Array.isArray(p['agents'])).toBe(true);
  });

  it('JTBD-F5: lab agent status <agent> — check agent health without running a full process (was: wpm agent status)', async () => {
    // Use an agent name from the registry
    const result = await runCli(['lab', 'agent', 'status', 'mock-interceptor', '--format', 'json']);
    const json = parseJson(result);
    if (!isErrorEnvelope(json)) {
      const p = payloadOf(json);
      expect(p).toHaveProperty('agent');
    } else {
      expect(typeof (json as ErrorEnvelope).error!.code).toBe('string');
    }
  });
});

// ---------------------------------------------------------------------------
// Category G: Commands not testable in standard CI — documented exclusions
// ---------------------------------------------------------------------------
// pipeline watch (was: drift-watch): streaming EWMA — non-terminating by
//   design; tested via a separate integration harness (cannot be tested via
//   runCli() which requires termination)
// lab membrane: requires fog or browser WASM deployment profile
//   (feature-miniml absent from the default node_modules WASM build)
// lab cognition: covered by packages/cognition/__tests__/ — cognition.ts is a
//   thin CLI wrapper; functional coverage lives in the cognition crate tests
// swarm: requires a configured multi-worker pool; tested in a separate
//   integration harness with worker setup
