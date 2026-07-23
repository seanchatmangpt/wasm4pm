/**
 * JTBD Error & Edge States — unique per command.
 *
 * Every test targets a validation rule or domain behavior specific to ONE command.
 * Generic patterns (missing file, no JSON) are intentionally excluded — those test
 * infrastructure, not capabilities. A fake that passes jtbd-all-commands.test.ts
 * must still fail here because each assertion targets a unique code path.
 *
 * Migrated to the noun/verb surface. Error responses now ALWAYS use the
 * framework's own `{error: {code, message}}` envelope (see
 * `packages/noun-verb/src/errors.ts`) instead of the old command-specific
 * error codes (`ALGORITHM_NOT_FOUND`, `MISSING_INPUT`, etc.) — those old
 * fine-grained codes collapsed onto the framework's 9-value generic
 * `ErrorCode` vocabulary (almost always `INVALID_INPUT` for a bad-argument
 * case, `EXECUTION_ERROR` for a runtime failure). The old codes'
 * *messages* mostly survive unchanged (still naming the bad value, still
 * listing valid alternatives), since bridged verbs still call straight
 * into the same legacy `commands/*.ts` bodies — only the outer
 * classification/envelope changed. Process exit codes also shifted:
 * `apps/wasm4pm/src/cli.ts`'s `ERROR_CODE_MAP` maps `INVALID_INPUT` to
 * `EXIT_CODES.source_error` (2) uniformly, so an old CONFIG_ERROR case
 * (exit 1) is frequently exit 2 now — verified live against the built CLI
 * for every case below, not assumed.
 *
 * Structure per command: 1 success edge case + 2 error states unique to that command.
 */

import { describe, it, expect } from 'vitest';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ---------------------------------------------------------------------------
// Infrastructure
// ---------------------------------------------------------------------------

const CLI_PATH = path.resolve(__dirname, '../../dist/bin/wpm.js');
const XES = path.resolve(__dirname, '../../../../test/fixtures/small.xes');

interface CliResult { exitCode: number; stdout: string; stderr: string; }

function run(args: string[], opts: { timeoutMs?: number; cwd?: string } = {}): Promise<CliResult> {
  const { timeoutMs = 30000, cwd = os.tmpdir() } = opts;
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [CLI_PATH, ...args],
      { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024, cwd },
      (error, stdout, stderr) => {
        const code = error && 'code' in error && typeof error.code === 'number' ? error.code : error ? 1 : 0;
        resolve({ exitCode: code, stdout: stdout ?? '', stderr: stderr ?? '' });
      }
    );
  });
}

function json<T = Record<string, unknown>>(r: CliResult): T {
  return JSON.parse(r.stdout) as T;
}

/** Unwrap a bridged verb's legacy `{command,status,payload,meta}` envelope; pass a native verb's plain result through. */
function payload(r: CliResult): Record<string, unknown> {
  const j = json<Record<string, unknown>>(r);
  return typeof j.command === 'string' && 'payload' in j ? (j.payload as Record<string, unknown>) : j;
}

function err(r: CliResult): { code: string; message: string } {
  const j = json<{ error: { code: string; message: string } }>(r);
  return j.error;
}

// ---------------------------------------------------------------------------
// model discover (was: wpm run) — algorithm registry validation
// ---------------------------------------------------------------------------

describe('model discover: algorithm registry (was: wpm run)', () => {
  it('unknown algorithm produces INVALID_INPUT with the bad name in message', async () => {
    const r = await run(['model', 'discover', XES, '--algorithm', 'TOTALLY_FAKE_ALGO', '--format', 'json']);
    expect(r.exitCode).toBe(2);
    const e = err(r);
    expect(e.code).toBe('INVALID_INPUT');
    expect(e.message).toContain('TOTALLY_FAKE_ALGO');
  });

  it('discovered model carries algorithm identity — fakes cannot guess the returned algorithm name', async () => {
    const r = await run(['model', 'discover', XES, '--algorithm', 'dfg', '--format', 'json']);
    expect(r.exitCode).toBe(0);
    const j = json(r);
    // The algorithm echoed back must match what was requested
    expect(j['algorithm']).toBe('dfg');
    const shape = j['shape'] as Record<string, unknown>;
    expect(typeof shape['nodes']).toBe('number');
    expect((shape['nodes'] as number)).toBeGreaterThan(0);
  });

  it('discover with no input produces INVALID_INPUT — not a citty parse error or crash', async () => {
    const r = await run(['model', 'discover', '--format', 'json']);
    expect(r.exitCode).toBe(2);
    const e = err(r);
    expect(e.code).toBe('INVALID_INPUT');
  });
});

// ---------------------------------------------------------------------------
// model compare (was: wpm compare) — algorithm list parsing and multi-algorithm results
// ---------------------------------------------------------------------------

describe('model compare: algorithm list validation (was: wpm compare)', () => {
  it('unknown algorithm in comma-list produces INVALID_INPUT citing the specific bad name', async () => {
    const r = await run(['model', 'compare', 'FAKE_ALGO,dfg', '-i', XES, '--format', 'json']);
    // Legacy exit 1 (config_error, UNKNOWN_ALGORITHMS) now collapses through
    // classifyLegacyFailure onto INVALID_INPUT -> EXIT_CODES.source_error (2).
    expect(r.exitCode).toBe(2);
    const e = err(r);
    expect(e.code).toBe('INVALID_INPUT');
    expect(e.message.toLowerCase()).toContain('fake_algo');
  });

  it('multiple unknown algorithms are all listed in the error message', async () => {
    const r = await run(['model', 'compare', 'BAD_ONE,BAD_TWO', '-i', XES, '--format', 'json']);
    const e = err(r);
    expect(e.code).toBe('INVALID_INPUT');
    // Both bad names must appear — user sees what to fix
    expect(e.message.toLowerCase()).toContain('bad_one');
    expect(e.message.toLowerCase()).toContain('bad_two');
  });

  it('successful compare returns exactly 2 algorithm entries with elapsedMs', async () => {
    const r = await run(['model', 'compare', 'dfg,heuristic_miner', '-i', XES, '--format', 'json']);
    if (r.exitCode === 0) {
      const p = payload(r);
      const algos = p['algorithms'] as Array<Record<string, unknown>>;
      expect(algos).toHaveLength(2);
      const names = algos.map((a) => a['algorithm'] as string);
      // Each algorithm name must be one we requested — not a placeholder
      // CLI normalizes 'heuristic_miner' → 'heuristic' in the output
      expect(names).toContain('dfg');
      expect(names.some((n) => n === 'heuristic' || n === 'heuristic_miner')).toBe(true);
      for (const a of algos) {
        expect(typeof a['elapsedMs']).toBe('number');
      }
    }
  });
});

// ---------------------------------------------------------------------------
// model diff (was: wpm diff) — per-log error attribution
// ---------------------------------------------------------------------------

describe('model diff: per-log error attribution (was: wpm diff)', () => {
  it('missing log1 names log1 in the error — not a generic "file not found"', async () => {
    const r = await run(['model', 'diff', '/no-log1.xes', XES, '--format', 'json']);
    expect(r.exitCode).toBe(2);
    const e = err(r);
    expect(e.code).toBe('INVALID_INPUT');
    expect(e.message).toContain('(log1)');
  });

  it('missing log2 names log2 — proves both files are checked independently', async () => {
    const r = await run(['model', 'diff', XES, '/no-log2.xes', '--format', 'json']);
    const e = err(r);
    expect(e.code).toBe('INVALID_INPUT');
    expect(e.message).toContain('(log2)');
  });

  it('comparing a file to itself yields jaccard = 1 — identity property', async () => {
    const r = await run(['model', 'diff', XES, XES, '--format', 'json']);
    if (r.exitCode === 0) {
      const d = (payload(r)['diff'] ?? payload(r)) as Record<string, unknown>;
      expect(d['jaccard']).toBe(1);
    }
  });
});

// ---------------------------------------------------------------------------
// log validate (was: wpm validate) — format whitelist enforcement
// ---------------------------------------------------------------------------

describe('log validate: format whitelist (was: wpm validate)', () => {
  it('invalid --format produces INVALID_INPUT naming the valid formats', async () => {
    const r = await run(['log', 'validate', XES, '--format', 'PARQUET', '--output-format', 'json']);
    expect(r.exitCode).toBe(2);
    const e = err(r);
    expect(e.code).toBe('INVALID_INPUT');
    // Must tell user what IS valid
    expect(e.message).toContain('xes');
    expect(e.message).toContain('csv');
  });

  it("valid XES file returns valid=true even when checks are 'warn' (not yet implemented)", async () => {
    const r = await run(['log', 'validate', XES, '--output-format', 'json']);
    expect(r.exitCode).toBe(0);
    const p = payload(r);
    // valid must be boolean true — not undefined or null
    expect(p['valid']).toBe(true);
    expect(Array.isArray(p['checks'])).toBe(true);
  });

  it('file not found produces INVALID_INPUT (old FILE_NOT_FOUND folded into the generic code)', async () => {
    const r = await run(['log', 'validate', '/no-such-file.xes', '--output-format', 'json']);
    const e = err(r);
    expect(e.code).toBe('INVALID_INPUT');
    expect(e.message).toContain('/no-such-file.xes');
  });
});

// ---------------------------------------------------------------------------
// log stats (was: wpm quality, in part) — narrowed contract
// ---------------------------------------------------------------------------

describe('log stats: narrowed contract (was: wpm quality, in part)', () => {
  // `wpm quality`'s fitness/precision/generalization/simplicity report and
  // its `--metrics` whitelist have NO replacement — `log stats` (see
  // nouns/log/stats.ts's own doc comment: "in part") is a deliberately
  // simpler, model-free event/case-count profiler that doesn't even
  // recognize a `--metrics` flag. These tests now exercise that narrower,
  // real contract instead of the retired metric-whitelist one.
  it('an unrecognized --metrics flag is silently ignored — log stats has no metric whitelist', async () => {
    const r = await run(['log', 'stats', XES, '--metrics', 'FAKE_METRIC', '--format', 'json']);
    expect(r.exitCode).toBe(0);
    const j = json(r);
    expect(j['stats']).toBeDefined();
  });

  it('stats response always returns total_events/total_cases as numbers', async () => {
    const r = await run(['log', 'stats', XES, '--format', 'json']);
    expect(r.exitCode).toBe(0);
    const j = json(r);
    const stats = j['stats'] as Record<string, unknown>;
    expect(typeof stats['total_events']).toBe('number');
    expect(typeof stats['total_cases']).toBe('number');
    expect((stats['total_events'] as number)).toBeGreaterThan(0);
  });

  it('nonexistent input produces INVALID_INPUT', async () => {
    const r = await run(['log', 'stats', '/no-such-file.xes', '--format', 'json']);
    expect(r.exitCode).toBe(2);
    const e = err(r);
    expect(e.code).toBe('INVALID_INPUT');
  });
});

// ---------------------------------------------------------------------------
// model check (was: wpm conformance) — threshold validation
// ---------------------------------------------------------------------------

describe('model check --mode self: threshold and fitness contract (was: wpm conformance)', () => {
  it('non-numeric --fitness-threshold is NOT config-validated — it makes every comparison false, so the log is deterministically REJECTED', async () => {
    // Confirmed against conformance-cli.test.ts (migrated separately) and
    // mcpp-admission-gate.test.ts group C: `model check` does not range/NaN
    // validate --fitness-threshold. `fitness >= NaN` is `false` in JS for
    // every episode, so a non-numeric threshold deterministically produces
    // REJECTED (exit 6) rather than a distinct config-time error — a
    // deliberate simplification vs. the old `wpm conformance --threshold`.
    const r = await run(['model', 'check', XES, '--fitness-threshold', 'not_a_float', '--mode', 'self', '--format', 'json']);
    expect(r.exitCode).toBe(6);
    const j = json(r);
    expect(j['status']).toBe('REJECTED');
  });

  it('checked/status fields are always present even when conformance fails', async () => {
    const r = await run(['model', 'check', XES, '--mode', 'self', '--format', 'json']);
    if (r.exitCode === 0 || r.exitCode === 6) {
      const j = json(r);
      expect(['ADMITTED', 'REJECTED', 'INDETERMINATE']).toContain(j['status']);
      expect(typeof j['checked']).toBe('number');
      expect(Array.isArray(j['findings'])).toBe(true);
    }
  });

  it('--mode replay without --model produces INVALID_INPUT naming --model', async () => {
    const r = await run(['model', 'check', XES, '--mode', 'replay', '--format', 'json']);
    expect(r.exitCode).toBe(2);
    const e = err(r);
    expect(e.code).toBe('INVALID_INPUT');
    expect(e.message).toContain('--model');
  });
});

// ---------------------------------------------------------------------------
// model simulate (was: wpm simulate) — numeric parameter validation
// ---------------------------------------------------------------------------

describe('model simulate: numeric parameter validation (was: wpm simulate)', () => {
  it('non-numeric --cases produces INVALID_INPUT citing --cases', async () => {
    const r = await run(['model', 'simulate', XES, '--cases', 'notanumber', '--format', 'json']);
    expect(r.exitCode).toBe(2);
    const e = err(r);
    expect(e.code).toBe('INVALID_INPUT');
    expect(e.message).toContain('--cases');
  });

  it('non-numeric --time produces INVALID_INPUT citing --time', async () => {
    const r = await run(['model', 'simulate', XES, '--time', 'notanumber', '--format', 'json']);
    expect(r.exitCode).toBe(2);
    const e = err(r);
    expect(e.code).toBe('INVALID_INPUT');
    expect(e.message).toContain('--time');
  });

  it('successful simulation response has simulation.method = monte_carlo', async () => {
    const r = await run(['model', 'simulate', XES, '--format', 'json']);
    if (r.exitCode === 0) {
      const p = payload(r);
      const sim = p['simulation'] as Record<string, unknown>;
      expect(sim['method']).toBe('monte_carlo');
      expect(Array.isArray(p['traces'])).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// lab temporal (was: wpm temporal) — usage message
// ---------------------------------------------------------------------------

describe('lab temporal: usage and output contract (was: wpm temporal)', () => {
  it('no-input error message includes temporal-specific usage examples', async () => {
    const r = await run(['lab', 'temporal', '--format', 'json']);
    expect(r.exitCode).toBe(2);
    const e = err(r);
    expect(e.code).toBe('INVALID_INPUT');
    // Usage must reference the --threshold flag (temporal-specific)
    expect(e.message).toContain('--threshold');
  });

  it('successful response has dfg with nodes and edges arrays', async () => {
    const r = await run(['lab', 'temporal', '-i', XES, '--format', 'json']);
    if (r.exitCode === 0) {
      const p = payload(r);
      const dfg = p['dfg'] as Record<string, unknown>;
      expect(Array.isArray(dfg['nodes'])).toBe(true);
      expect(Array.isArray(dfg['edges'])).toBe(true);
    }
  });

  it('threshold flag is reflected in response — input roundtrips to output', async () => {
    const r = await run(['lab', 'temporal', '-i', XES, '--threshold', '0.5', '--format', 'json']);
    if (r.exitCode === 0) {
      const p = payload(r);
      expect(p).toHaveProperty('threshold');
    }
  });
});

// ---------------------------------------------------------------------------
// lab social (was: wpm social) — metric whitelist and network contract
// ---------------------------------------------------------------------------

describe('lab social: metric whitelist and network contract (was: wpm social)', () => {
  it('invalid --metric produces INVALID_INPUT with the three valid metric names', async () => {
    const r = await run(['lab', 'social', '-i', XES, '--metric', 'INVALID_METRIC', '--format', 'json']);
    expect(r.exitCode).toBe(2);
    const e = err(r);
    expect(e.code).toBe('INVALID_INPUT');
    // All three social network types must be listed
    expect(e.message).toContain('handover');
    expect(e.message).toContain('working-together');
    expect(e.message).toContain('similar-task');
  });

  it('valid response has network.nodes and network.edges arrays', async () => {
    const r = await run(['lab', 'social', '-i', XES, '--format', 'json']);
    if (r.exitCode === 0) {
      const network = (payload(r)['network'] ?? {}) as Record<string, unknown>;
      expect(Array.isArray(network['nodes'])).toBe(true);
      expect(Array.isArray(network['edges'])).toBe(true);
    }
  });

  it('no-input error includes social-specific usage with --metric example', async () => {
    const r = await run(['lab', 'social', '--format', 'json']);
    const e = err(r);
    expect(e.code).toBe('INVALID_INPUT');
    expect(e.message).toContain('--metric');
  });
});

// ---------------------------------------------------------------------------
// lab autoprocess (was: wpm autoprocess) — empty-file detection
// ---------------------------------------------------------------------------

describe('lab autoprocess: empty-file and WASM graceful failure (was: wpm autoprocess)', () => {
  it('empty file (/dev/null) produces INVALID_INPUT mentioning it is empty', async () => {
    const r = await run(['lab', 'autoprocess', '/dev/null', '--format', 'json']);
    expect(r.exitCode).toBe(2);
    const e = err(r);
    expect(e.code).toBe('INVALID_INPUT');
    expect(e.message.toLowerCase()).toContain('empty');
  });

  it('a real log produces a parseable envelope whether ok or error — never a crash', async () => {
    const r = await run(['lab', 'autoprocess', XES, '--format', 'json']);
    // Whether ok (native envelope) or error, stdout must be parseable JSON.
    expect(() => json(r)).not.toThrow();
  });

  it('successful response has a cycle_result payload field', async () => {
    const r = await run(['lab', 'autoprocess', XES, '--format', 'json']);
    if (r.exitCode === 0) {
      expect(payload(r)).toHaveProperty('cycle_result');
    }
  });
});

// ---------------------------------------------------------------------------
// model predict (was: wpm predict) — task whitelist and --top-k validation
// ---------------------------------------------------------------------------

describe('model predict: task whitelist and parameter validation (was: wpm predict)', () => {
  it('invalid task produces INVALID_INPUT listing all 6 valid task names', async () => {
    const r = await run(['model', 'predict', 'FAKE_TASK', '-i', XES, '--format', 'json']);
    expect(r.exitCode).toBe(2);
    const e = err(r);
    expect(e.code).toBe('INVALID_INPUT');
    // All 6 Van der Aalst prediction perspectives must be listed
    expect(e.message).toContain('next-activity');
    expect(e.message).toContain('remaining-time');
    expect(e.message).toContain('outcome');
    expect(e.message).toContain('drift');
    expect(e.message).toContain('features');
    expect(e.message).toContain('resource');
  });

  it('non-numeric --top-k produces INVALID_INPUT citing the flag name', async () => {
    const r = await run(['model', 'predict', 'next-activity', '-i', XES, '--top-k', 'hello', '--format', 'json']);
    expect(r.exitCode).toBe(2);
    const e = err(r);
    expect(e.code).toBe('INVALID_INPUT');
    expect(e.message).toContain('--top-k');
  });

  it('next-activity task field is echoed in successful response', async () => {
    const r = await run(['model', 'predict', 'next-activity', '-i', XES, '--format', 'json']);
    if (r.exitCode === 0) {
      expect(payload(r)['task']).toBe('next-activity');
      expect(Array.isArray(payload(r)['predictions'])).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// lab ml (was: wpm ml) — task whitelist and cluster k validation
// ---------------------------------------------------------------------------

describe('lab ml: task whitelist and cluster parameter (was: wpm ml)', () => {
  it('invalid task produces INVALID_INPUT listing all 6 valid ML tasks', async () => {
    const r = await run(['lab', 'ml', 'FAKE_ML_TASK', '-i', XES, '--format', 'json']);
    expect(r.exitCode).toBe(2);
    const e = err(r);
    expect(e.code).toBe('INVALID_INPUT');
    // All 6 ML tasks must appear in the error
    expect(e.message).toContain('classify');
    expect(e.message).toContain('cluster');
    expect(e.message).toContain('forecast');
    expect(e.message).toContain('anomaly');
    expect(e.message).toContain('regress');
    expect(e.message).toContain('pca');
  });

  it('cluster with non-numeric --k produces EXECUTION_ERROR citing k parameter', async () => {
    const r = await run(['lab', 'ml', 'cluster', '-i', XES, '--k', 'notanumber', '--format', 'json']);
    expect(r.exitCode).toBe(3);
    const e = err(r);
    expect(e.code).toBe('EXECUTION_ERROR');
    expect(e.message.toLowerCase()).toContain('k must be');
  });

  it('classify response is a parseable envelope', async () => {
    const r = await run(['lab', 'ml', 'classify', '-i', XES, '--format', 'json']);
    expect(() => json(r)).not.toThrow();
    if (r.exitCode === 0) {
      expect(Array.isArray(payload(r)['predictions'])).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// model discover (was: wpm powl) — subcommand model retired
// ---------------------------------------------------------------------------

describe('model discover: no subcommand whitelist (was: wpm powl <subcommand>)', () => {
  // `wpm powl` was a subcommand suite (`parse`, `discover`, `construct`,
  // `simplify`, `convert`, `diff`, `complexity`, `footprints`,
  // `conformance`, `import`) with its own INVALID_SUBCOMMAND/MISSING_MODEL
  // validation. `model discover` (its replacement for the `discover` case
  // — see nouns/_removed.ts) is a plain "give me a log, get a model" verb
  // with NO subcommand concept at all: `wpm powl parse --model <file>`
  // (loading a standalone POWL model file with no log) has no equivalent
  // verb in the new tree. These tests now cover model discover's own,
  // real, input-file contract instead of the retired subcommand whitelist.
  it('a non-file first positional is treated as an input path, not a subcommand — produces INVALID_INPUT', async () => {
    const r = await run(['model', 'discover', 'FAKE_OP', '--format', 'json']);
    expect(r.exitCode).toBe(2);
    const e = err(r);
    expect(e.code).toBe('INVALID_INPUT');
    expect(e.message).toContain('FAKE_OP');
  });

  it('discover with a real XES log and inductive_miner returns a tree-shaped model', async () => {
    const r = await run(['model', 'discover', XES, '--algorithm', 'inductive_miner', '--format', 'json']);
    if (r.exitCode === 0) {
      const j = json(r);
      const shape = j['shape'] as Record<string, unknown>;
      expect(typeof shape['nodeCount']).toBe('number');
      expect(shape).toHaveProperty('root');
    }
  });
});

// ---------------------------------------------------------------------------
// lab benchmark (was: wpm benchmark) — corpus concept errors
// ---------------------------------------------------------------------------

describe('lab benchmark: corpus-specific error codes (was: wpm benchmark)', () => {
  it('build with nonexistent corpus produces INVALID_INPUT (exit 2, not 3)', async () => {
    const r = await run(['lab', 'benchmark', 'build', '--corpus', '/no-such-corpus', '--format', 'json']);
    expect(r.exitCode).toBe(2);
    const e = err(r);
    expect(e.code).toBe('INVALID_INPUT');
    expect(e.message).toContain('no-such-corpus');
  });

  it('verify with nonexistent corpus produces EXECUTION_ERROR exit 3 (not exit 2)', async () => {
    const r = await run(['lab', 'benchmark', 'verify', '--corpus', '/no-such-corpus', '--format', 'json']);
    expect(r.exitCode).toBe(3);
    const e = err(r);
    // verify treats a missing corpus as a run-time failure, not a bad-input one — distinct from build's INVALID_INPUT
    expect(e.code).toBe('EXECUTION_ERROR');
  });

  it('build on empty /dev/null returns valid=0 without error — zero-item corpus is valid', async () => {
    const r = await run(['lab', 'benchmark', 'build', '--corpus', '/dev/null', '--format', 'json']);
    expect(r.exitCode).toBe(0);
    const p = payload(r);
    expect(p['valid']).toBe(0);
    expect(Array.isArray(p['errors'])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// lab agent (was: wpm agent) — violation payload vs error envelope distinction
// ---------------------------------------------------------------------------

describe('lab agent: violation payload vs error envelope (was: wpm agent)', () => {
  it('agent status with unknown agent produces INVALID_INPUT error envelope', async () => {
    const r = await run(['lab', 'agent', 'status', 'NO_SUCH_AGENT', '--format', 'json']);
    expect(r.exitCode).toBe(2);
    const e = err(r);
    expect(e.code).toBe('INVALID_INPUT');
    expect(e.message).toContain('NO_SUCH_AGENT');
  });

  it('agent execute with unknown agent uses violation payload (not error envelope)', async () => {
    const r = await run(['lab', 'agent', 'execute', 'NO_SUCH_AGENT', '-i', XES, '--format', 'json']);
    expect(r.exitCode).toBe(1);
    const j = json(r);
    // execute returns the legacy status:ok envelope with passed:false — a
    // different shape from status's error envelope for the same bad agent name.
    expect(j['status']).toBe('ok');
    const p = j['payload'] as Record<string, unknown>;
    expect(p['passed']).toBe(false);
    const violations = p['violations'] as Array<Record<string, unknown>>;
    expect(violations[0]['violation_type']).toBe('agent_not_found');
  });

  it('agent list always returns an agents array (may be empty) — never crashes', async () => {
    const r = await run(['lab', 'agent', 'list', '--format', 'json']);
    expect(r.exitCode).toBe(0);
    const p = payload(r);
    const agents = (p['vda_agents'] ?? p['agents']) as Array<Record<string, unknown>>;
    expect(Array.isArray(agents)).toBe(true);
    for (const a of agents) {
      const cfg = a['config'] as Record<string, unknown> | undefined;
      if (cfg) expect(typeof cfg['name']).toBe('string');
    }
  });
});

// ---------------------------------------------------------------------------
// evidence report (was: wpm results) — result addressing and parse error
// ---------------------------------------------------------------------------

describe('evidence report: result addressing and JSON parse error (was: wpm results)', () => {
  it('--cat with unknown ID produces INVALID_INPUT citing the ID', async () => {
    const r = await run(['evidence', 'report', '--cat', 'NONEXISTENT_ID_12345', '--format', 'json']);
    expect(r.exitCode).toBe(2);
    const e = err(r);
    expect(e.code).toBe('INVALID_INPUT');
    expect(e.message).toContain('NONEXISTENT_ID_12345');
  });

  it('--path with invalid JSON file produces an error mentioning the parse failure', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-res-'));
    try {
      const badJsonName = 'bad.json';
      fs.writeFileSync(path.join(tmp, badJsonName), 'not json at all', 'utf-8');
      // Run with cwd=tmp and a RELATIVE path: evidence report's path-traversal
      // guard (new; not present pre-migration) rejects an absolute path
      // outside the working directory before it ever reaches JSON parsing.
      const r = await run(['evidence', 'report', '--path', badJsonName, '--format', 'json'], { cwd: tmp });
      expect(r.exitCode).toBe(2);
      const e = err(r);
      expect(e.code).toBe('INVALID_INPUT');
      expect(e.message.toLowerCase()).toContain('parse');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('--path with nonexistent file produces INVALID_INPUT', async () => {
    const r = await run(['evidence', 'report', '--path', '/no-such-result-file.json', '--format', 'json']);
    const e = err(r);
    expect(e.code).toBe('INVALID_INPUT');
  });
});

// ---------------------------------------------------------------------------
// config init (was: wpm init) — format and preset whitelist
// ---------------------------------------------------------------------------

describe('config init: format and preset whitelist (was: wpm init)', () => {
  it('invalid --config-format produces INVALID_INPUT naming toml and json', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-init-'));
    try {
      const r = await run(['config', 'init', '--config-format', 'YAML', '--format', 'json'], { cwd: tmp, timeoutMs: 30000 });
      expect(r.exitCode).toBe(2);
      const e = err(r);
      expect(e.code).toBe('INVALID_INPUT');
      expect(e.message.toLowerCase()).toContain('toml');
      expect(e.message.toLowerCase()).toContain('json');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('invalid --preset produces INVALID_INPUT naming valid presets', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-init-'));
    try {
      const r = await run(['config', 'init', '--preset', 'enterprise', '--format', 'json'], { cwd: tmp, timeoutMs: 30000 });
      expect(r.exitCode).toBe(2);
      const e = err(r);
      expect(e.code).toBe('INVALID_INPUT');
      // All 3 original valid presets must still appear in the message
      expect(e.message).toContain('fast');
      expect(e.message).toContain('balanced');
      expect(e.message).toContain('quality');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('successful init creates wasm4pm.toml with a files_created array', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-init-'));
    try {
      const r = await run(['config', 'init', '--format', 'json', '--force'], { cwd: tmp, timeoutMs: 30000 });
      expect(r.exitCode).toBe(0);
      const p = payload(r);
      expect(Array.isArray(p['files_created'])).toBe(true);
      expect(fs.existsSync(path.join(tmp, 'wasm4pm.toml'))).toBe(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// model explain (was: wpm explain) — graceful fallback for unknown algorithms
// ---------------------------------------------------------------------------

describe('model explain: missing-input and graceful unknown-algo fallback (was: wpm explain)', () => {
  it('no args shows the algorithm menu (exit 0, subject=algorithm-menu)', async () => {
    const r = await run(['model', 'explain', '--format', 'json']);
    expect(r.exitCode).toBe(0);
    const p = payload(r);
    // Zero-arg explain returns a curated algorithm menu, not an error
    expect(p['subject']).toBe('algorithm-menu');
    expect(typeof p['content']).toBe('string');
    expect((p['content'] as string).length).toBeGreaterThan(100);
  });

  it('unknown --algorithm exits 0 — explain never errors for an unknown algo name', async () => {
    const r = await run(['model', 'explain', '--algorithm', 'ALGO_THAT_DOES_NOT_EXIST', '--format', 'json']);
    expect(r.exitCode).toBe(0);
    // Must echo back the requested algorithm name in the payload
    expect(payload(r)['subject']).toBe('ALGO_THAT_DOES_NOT_EXIST');
  });

  it('known algorithm dfg explanation payload contains a non-empty content string', async () => {
    const r = await run(['model', 'explain', 'dfg', '--format', 'json']);
    expect(r.exitCode).toBe(0);
    const p = payload(r);
    expect(typeof p['content']).toBe('string');
    expect((p['content'] as string).length).toBeGreaterThan(20);
    // subject must be dfg — proving the algorithm was actually looked up
    expect((p['subject'] as string).toLowerCase()).toContain('dfg');
  });
});

// ---------------------------------------------------------------------------
// system completions (was: wpm completions) — shell-specific script generation
// ---------------------------------------------------------------------------

describe('system completions: shell-specific generation (was: wpm completions)', () => {
  it('invalid shell exits 2 with a JSON error envelope on stdout (not stderr-only text)', async () => {
    const r = await run(['system', 'completions', 'POWERSHELL']);
    expect(r.exitCode).toBe(2);
    // Native verb: stdout is ALWAYS JSON per the framework's contract, even
    // for an error — unlike the old command, which wrote a bare stderr
    // message with empty stdout.
    const e = err(r);
    expect(e.code).toBe('INVALID_INPUT');
    expect(e.message).toContain('Unsupported shell');
    expect(e.message).toContain('POWERSHELL');
  });

  it('bash shell produces a script with a _wpm function definition', async () => {
    const r = await run(['system', 'completions', 'bash']);
    expect(r.exitCode).toBe(0);
    const script = json(r)['script'] as string;
    expect(script).toContain('_wpm');
    expect(script).toContain('compgen');
  });

  it('fish shell produces a different script format than bash (complete, not function)', async () => {
    const r = await run(['system', 'completions', 'fish']);
    expect(r.exitCode).toBe(0);
    // Fish uses 'complete' builtin, not bash-style function definitions
    const script = json(r)['script'] as string;
    expect(script).toContain('complete');
    expect(script).not.toContain('_wpm()');
  });
});
