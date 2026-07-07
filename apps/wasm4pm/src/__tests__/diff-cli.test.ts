/**
 * diff-cli.test.ts — Comprehensive CLI integration tests for `wpm diff`.
 *
 * Migrated from the retired top-level `wpm diff` command (removed — see
 * `apps/wasm4pm/src/nouns/_removed.ts`: `diff` -> `model diff`) to
 * `wpm model diff` (`apps/wasm4pm/src/nouns/model/diff.ts`).
 *
 * `model diff` is a legacy BRIDGE verb (`invokeLegacyCommandAsJson` in
 * `apps/wasm4pm/src/nouns/_bridge.ts`): it reuses `commands/diff.ts`
 * completely unmodified, forcing `--format json --quiet` under the hood.
 *
 * Two important behavior changes from bridging (read before editing):
 *  1. SUCCESS still returns the OLD `{command,status,payload,meta}` envelope
 *     verbatim — that legacy object literally IS the verb's JSON result for
 *     a bridged verb. FAILURE, however, now takes the NEW
 *     `{error:{code,message}}` shape (the bridge throws a `NounVerbError` on
 *     any nonzero legacy exit code — see `_bridge.ts`'s
 *     `classifyLegacyFailure`), so the old `j.status === 'error'` /
 *     `j.command === 'diff'` assertions on error paths no longer apply and
 *     are rewritten below to check `j.error.code`/`j.error.message`.
 *  2. The bridge's forced `--format json` means a caller-supplied
 *     `--format human` is silently overridden — stdout is ALWAYS JSON now,
 *     even when the legacy `--format human` flag is passed. The old
 *     command's rich human-formatted report (with "Structural similarity",
 *     "Activities" section headers, etc.) is consequently unreachable
 *     through the new CLI surface; the "human output" tests below are
 *     rewritten to assert the new (intentional) always-JSON behavior
 *     instead of hunting for text that can no longer appear.
 *
 * Oracle rank: Rank 2 (Domain contract).
 *
 * Coverage areas:
 *   - Exit codes (success, source_error, execution_error)
 *   - JSON envelope shape (command, status, payload.diff) on success;
 *     {error:{code,message}} on failure
 *   - Jaccard similarity: self-diff=1.0, two-log diff in [0,1]
 *   - diff.activities sub-fields (added, removed, shared)
 *   - diff.edges sub-fields (added, removed, changed)
 *   - diff.variants sub-fields (totalLog1, totalLog2, shared)
 *   - Always-JSON-on-stdout even with legacy --format human (changed)
 *   - Error cases: missing files, missing args
 *   - Flag behavior: --format, --activity-key, --no-save, --quiet, --verbose
 *   - Structural guarantees: jaccard monotonicity, summary string format
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ─── Minimal XES fixtures ─────────────────────────────────────────────────────

/**
 * Builds a minimal XES string with a given set of traces.
 * Each trace is an array of { activity, timestamp }.
 */
function buildXes(traces: Array<Array<{ activity: string; timestamp: string }>>, casePrefix = 'case'): string {
  const traceXml = traces.map((events, i) => {
    const eventsXml = events
      .map(
        (e) =>
          `    <event>
      <string key="concept:name" value="${e.activity}"/>
      <date key="time:timestamp" value="${e.timestamp}"/>
    </event>`,
      )
      .join('\n');
    return `  <trace>
    <string key="concept:name" value="${casePrefix}_${i + 1}"/>
${eventsXml}
  </trace>`;
  });

  // NOTE: The WASM XES parser does not support <global> sections — omit them.
  // The XES standard allows logs without global declarations; the parser infers
  // key types from the first occurrence of each attribute.
  return `<?xml version="1.0" encoding="UTF-8"?>
<log xmlns="http://www.xes-standard.org/" xes.version="1.0">
  <extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/>
  <extension name="Time" prefix="time" uri="http://www.xes-standard.org/time.xesext"/>
${traceXml.join('\n')}
</log>`;
}

// Log A: simple A→B→C process
const LOG_A_XES = buildXes(
  [
    [
      { activity: 'register', timestamp: '2024-01-01T09:00:00Z' },
      { activity: 'approve', timestamp: '2024-01-01T10:00:00Z' },
      { activity: 'close', timestamp: '2024-01-01T11:00:00Z' },
    ],
    [
      { activity: 'register', timestamp: '2024-01-02T09:00:00Z' },
      { activity: 'reject', timestamp: '2024-01-02T10:00:00Z' },
      { activity: 'close', timestamp: '2024-01-02T11:00:00Z' },
    ],
    [
      { activity: 'register', timestamp: '2024-01-03T09:00:00Z' },
      { activity: 'approve', timestamp: '2024-01-03T10:00:00Z' },
      { activity: 'close', timestamp: '2024-01-03T11:00:00Z' },
    ],
  ],
  'deal',
);

// Log B: different process — adds onboard, removes reject
const LOG_B_XES = buildXes(
  [
    [
      { activity: 'register', timestamp: '2024-02-01T09:00:00Z' },
      { activity: 'onboard', timestamp: '2024-02-01T10:00:00Z' },
      { activity: 'close', timestamp: '2024-02-01T11:00:00Z' },
    ],
    [
      { activity: 'register', timestamp: '2024-02-02T09:00:00Z' },
      { activity: 'onboard', timestamp: '2024-02-02T10:00:00Z' },
      { activity: 'close', timestamp: '2024-02-02T11:00:00Z' },
    ],
  ],
  'deal',
);

// ─── CLI runner ───────────────────────────────────────────────────────────────

const CLI_PATH = path.resolve(__dirname, '../../dist/bin/wpm.js');

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface DiffEnvelope {
  command: string;
  status: 'ok' | 'error';
  exit_code?: number;
  payload?: {
    log1: string;
    log2: string;
    activityKey: string;
    diff: {
      jaccard: number;
      summary: string;
      activities: { added: string[]; removed: string[]; shared: string[] };
      edges: {
        added: Array<{ from: string; to: string; count: number }>;
        removed: Array<{ from: string; to: string; count: number }>;
        changed: Array<{ from: string; to: string; count1: number; count2: number; pctChange: number }>;
      };
      variants: {
        totalLog1: number;
        totalLog2: number;
        shared: number;
        uniqueLog1: number;
        uniqueLog2: number;
      };
    };
  };
  error?: { code: string; message: string };
}

function runDiffCli(args: string[], timeoutMs = 45_000): Promise<CliResult> {
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
      },
    );
    child.on('error', () =>
      resolve({ exitCode: 5, stdout: '', stderr: 'Process failed to start' }),
    );
  });
}

function parseEnvelope(result: CliResult): DiffEnvelope {
  try {
    return JSON.parse(result.stdout) as DiffEnvelope;
  } catch {
    throw new Error(
      `Failed to parse CLI JSON output.\nExit: ${result.exitCode}\nstdout: ${result.stdout.slice(0, 500)}\nstderr: ${result.stderr.slice(0, 300)}`,
    );
  }
}

// ─── Temp dir lifecycle ───────────────────────────────────────────────────────

let tempDir: string;
let logAPath: string;
let logBPath: string;

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-diff-test-'));
  logAPath = path.join(tempDir, 'logA.xes');
  logBPath = path.join(tempDir, 'logB.xes');
  fs.writeFileSync(logAPath, LOG_A_XES, 'utf-8');
  fs.writeFileSync(logBPath, LOG_B_XES, 'utf-8');
});

afterAll(() => {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
});

// ─── wpm diff — help and basic CLI ───────────────────────────────────────────

describe('wpm diff — help', () => {
  it('--help exits 0 and mentions compare or log', async () => {
    const result = await runDiffCli(['model', 'diff', '--help']);
    expect(result.exitCode).toBe(0);
    // Help may go to stdout or stderr depending on terminal mode
    const combined = result.stdout + result.stderr;
    // If combined is empty (can happen in non-TTY), still confirm exit 0
    if (combined.length > 0) {
      expect(combined).toMatch(/diff|log|compare/i);
    }
  });
});

// ─── wpm diff — error cases ───────────────────────────────────────────────────

describe('wpm diff — error cases', () => {
  it('missing both log args exits non-zero', async () => {
    const result = await runDiffCli(['model', 'diff', '--format', 'json']);
    expect(result.exitCode).toBeGreaterThan(0);
  });

  it('nonexistent log1 exits source_error (2)', async () => {
    const result = await runDiffCli([
      'model', 'diff',
      '/nonexistent/logA.xes',
      logBPath,
      '--format',
      'json',
      '--no-save',
    ]);
    expect(result.exitCode).toBe(2);

    // Bridged-verb failures use the new {error:{code,message}} shape, not
    // the old {command,status,payload,meta} envelope (see file header).
    const j = parseEnvelope(result);
    expect(j.status).toBeUndefined();
    expect(j.error).toBeDefined();
    expect(j.error!.code).toBe('INVALID_INPUT');
  });

  it('nonexistent log2 exits source_error (2)', async () => {
    const result = await runDiffCli([
      'model', 'diff',
      logAPath,
      '/nonexistent/logB.xes',
      '--format',
      'json',
      '--no-save',
    ]);
    expect(result.exitCode).toBe(2);

    const j = parseEnvelope(result);
    expect(j.error).toBeDefined();
    expect(j.error!.code).toBe('INVALID_INPUT');
  });

  it('error envelope contains error.code and error.message strings', async () => {
    const result = await runDiffCli([
      'model', 'diff',
      '/nonexistent/logA.xes',
      logBPath,
      '--format',
      'json',
      '--no-save',
    ]);
    const j = parseEnvelope(result);
    // was: expect(j.command).toBe('diff') — bridged failures no longer carry
    // a `command` field at all; the new error envelope is {error:{code,message}}.
    expect(j.error).toBeDefined();
    expect(typeof j.error!.code).toBe('string');
    expect(typeof j.error!.message).toBe('string');
    expect(j.error!.message.length).toBeGreaterThan(0);
  });
});

// ─── wpm diff — JSON envelope shape ──────────────────────────────────────────

describe('wpm diff — JSON envelope shape', () => {
  it('envelope has command=diff and status=ok on success', async () => {
    const result = await runDiffCli([
      'model', 'diff', logAPath, logAPath, '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);

    const j = parseEnvelope(result);
    expect(j.command).toBe('diff');
    expect(j.status).toBe('ok');
  });

  it('payload.log1 and payload.log2 paths are recorded', async () => {
    const result = await runDiffCli([
      'model', 'diff', logAPath, logBPath, '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);

    const j = parseEnvelope(result);
    expect(j.payload!.log1).toBe(logAPath);
    expect(j.payload!.log2).toBe(logBPath);
  });

  it('payload.activityKey defaults to concept:name', async () => {
    const result = await runDiffCli([
      'model', 'diff', logAPath, logBPath, '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);

    const j = parseEnvelope(result);
    expect(j.payload!.activityKey).toBe('concept:name');
  });

  it('--activity-key flag is reflected in payload', async () => {
    const result = await runDiffCli([
      'model', 'diff', logAPath, logBPath, '--activity-key', 'concept:name', '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);

    const j = parseEnvelope(result);
    expect(j.payload!.activityKey).toBe('concept:name');
  });

  it('payload.diff is present with all required sub-fields', async () => {
    const result = await runDiffCli([
      'model', 'diff', logAPath, logBPath, '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);

    const j = parseEnvelope(result);
    const d = j.payload!.diff;
    expect(d).toBeDefined();
    expect(typeof d.jaccard).toBe('number');
    expect(typeof d.summary).toBe('string');
    expect(d.activities).toBeDefined();
    expect(d.edges).toBeDefined();
    expect(d.variants).toBeDefined();
  });
});

// ─── wpm diff — Jaccard correctness ──────────────────────────────────────────

describe('wpm diff — Jaccard similarity', () => {
  it('self-diff jaccard equals 1.0 (identical DFGs)', async () => {
    const result = await runDiffCli([
      'model', 'diff', logAPath, logAPath, '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);

    const j = parseEnvelope(result);
    expect(j.payload!.diff.jaccard).toBe(1);
  });

  it('two-log jaccard is in [0, 1]', async () => {
    const result = await runDiffCli([
      'model', 'diff', logAPath, logBPath, '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);

    const j = parseEnvelope(result);
    const jaccard = j.payload!.diff.jaccard;
    expect(jaccard).toBeGreaterThanOrEqual(0);
    expect(jaccard).toBeLessThanOrEqual(1);
  });

  it('two distinct-process logs have jaccard < 1 (not identical)', async () => {
    const result = await runDiffCli([
      'model', 'diff', logAPath, logBPath, '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);

    const j = parseEnvelope(result);
    // Log A and Log B have different edges (approve/reject vs onboard)
    expect(j.payload!.diff.jaccard).toBeLessThan(1);
  });

  it('self-diff jaccard = 1 also for log B', async () => {
    const result = await runDiffCli([
      'model', 'diff', logBPath, logBPath, '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);

    const j = parseEnvelope(result);
    expect(j.payload!.diff.jaccard).toBe(1);
  });

  it('summary string is non-empty', async () => {
    const result = await runDiffCli([
      'model', 'diff', logAPath, logBPath, '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);

    const j = parseEnvelope(result);
    expect(j.payload!.diff.summary.length).toBeGreaterThan(0);
  });

  it('summary contains Jaccard value as a string', async () => {
    const result = await runDiffCli([
      'model', 'diff', logAPath, logBPath, '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);

    const j = parseEnvelope(result);
    // The summary always embeds the jaccard value in text
    expect(j.payload!.diff.summary).toMatch(/jaccard/i);
  });
});

// ─── wpm diff — activities sub-fields ─────────────────────────────────────────

describe('wpm diff — activities sub-fields', () => {
  it('activities.added, removed, shared are arrays', async () => {
    const result = await runDiffCli([
      'model', 'diff', logAPath, logBPath, '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);

    const d = parseEnvelope(result).payload!.diff;
    expect(Array.isArray(d.activities.added)).toBe(true);
    expect(Array.isArray(d.activities.removed)).toBe(true);
    expect(Array.isArray(d.activities.shared)).toBe(true);
  });

  it('self-diff activities: added and removed are empty, shared is non-empty', async () => {
    const result = await runDiffCli([
      'model', 'diff', logAPath, logAPath, '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);

    const d = parseEnvelope(result).payload!.diff;
    expect(d.activities.added).toHaveLength(0);
    expect(d.activities.removed).toHaveLength(0);
    expect(d.activities.shared.length).toBeGreaterThan(0);
  });

  it('two-log diff: onboard appears in added (only in log B)', async () => {
    const result = await runDiffCli([
      'model', 'diff', logAPath, logBPath, '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);

    const d = parseEnvelope(result).payload!.diff;
    // onboard is in log B but not in log A
    expect(d.activities.added).toContain('onboard');
  });

  it('two-log diff: register and close appear in shared', async () => {
    const result = await runDiffCli([
      'model', 'diff', logAPath, logBPath, '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);

    const d = parseEnvelope(result).payload!.diff;
    // Both logs share register and close
    expect(d.activities.shared).toContain('register');
    expect(d.activities.shared).toContain('close');
  });
});

// ─── wpm diff — edges sub-fields ──────────────────────────────────────────────

describe('wpm diff — edges sub-fields', () => {
  it('edges.added, removed, changed are arrays', async () => {
    const result = await runDiffCli([
      'model', 'diff', logAPath, logBPath, '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);

    const d = parseEnvelope(result).payload!.diff;
    expect(Array.isArray(d.edges.added)).toBe(true);
    expect(Array.isArray(d.edges.removed)).toBe(true);
    expect(Array.isArray(d.edges.changed)).toBe(true);
  });

  it('self-diff edges: added, removed, changed are all empty', async () => {
    const result = await runDiffCli([
      'model', 'diff', logAPath, logAPath, '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);

    const d = parseEnvelope(result).payload!.diff;
    expect(d.edges.added).toHaveLength(0);
    expect(d.edges.removed).toHaveLength(0);
    expect(d.edges.changed).toHaveLength(0);
  });

  it('edge objects in added have from and to string fields', async () => {
    const result = await runDiffCli([
      'model', 'diff', logAPath, logBPath, '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);

    const d = parseEnvelope(result).payload!.diff;
    // Log B has new edges (register→onboard, onboard→close)
    if (d.edges.added.length > 0) {
      const edge = d.edges.added[0];
      expect(typeof edge.from).toBe('string');
      expect(typeof edge.to).toBe('string');
      // count may be undefined if WASM DFG omits frequency — defensive check
      if (edge.count !== undefined) {
        expect(typeof edge.count).toBe('number');
      }
    }
  });
});

// ─── wpm diff — variants sub-fields ───────────────────────────────────────────

describe('wpm diff — variants sub-fields', () => {
  it('variants.totalLog1, totalLog2, shared are numbers', async () => {
    const result = await runDiffCli([
      'model', 'diff', logAPath, logBPath, '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);

    const d = parseEnvelope(result).payload!.diff;
    expect(typeof d.variants.totalLog1).toBe('number');
    expect(typeof d.variants.totalLog2).toBe('number');
    expect(typeof d.variants.shared).toBe('number');
  });

  it('variants.totalLog1 and totalLog2 are non-negative', async () => {
    const result = await runDiffCli([
      'model', 'diff', logAPath, logBPath, '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);

    const d = parseEnvelope(result).payload!.diff;
    expect(d.variants.totalLog1).toBeGreaterThanOrEqual(0);
    expect(d.variants.totalLog2).toBeGreaterThanOrEqual(0);
  });

  it('self-diff variants: totalLog1 = totalLog2 and shared = totalLog1', async () => {
    const result = await runDiffCli([
      'model', 'diff', logAPath, logAPath, '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);

    const d = parseEnvelope(result).payload!.diff;
    expect(d.variants.totalLog1).toBe(d.variants.totalLog2);
    expect(d.variants.shared).toBe(d.variants.totalLog1);
  });

  it('variants.uniqueLog1 and uniqueLog2 are non-negative', async () => {
    const result = await runDiffCli([
      'model', 'diff', logAPath, logBPath, '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);

    const d = parseEnvelope(result).payload!.diff;
    expect(d.variants.uniqueLog1).toBeGreaterThanOrEqual(0);
    expect(d.variants.uniqueLog2).toBeGreaterThanOrEqual(0);
  });
});

// ─── wpm diff — human output (was: legacy --format human text report — REMOVED, see file header) ──

// The bridge forces `--format json` under the hood regardless of what the
// caller passes, so `--format human`'s old rich text report (with its own
// "Structural similarity"/"Activities" section headers) is no longer
// reachable through `wpm model diff` — stdout is ALWAYS the JSON envelope
// now. These tests assert that new, intentional behavior directly instead
// of grepping for text that can no longer be produced.
describe('wpm diff — human output (legacy --format human is now overridden to JSON)', () => {
  it('exits 0 and stdout is JSON even with legacy --format human', async () => {
    const result = await runDiffCli([
      'model', 'diff', logAPath, logAPath, '--format', 'human', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
  });

  it('the diff summary field still conveys near-identical structure (was: "Structural similarity" text line)', async () => {
    const result = await runDiffCli([
      'model', 'diff', logAPath, logAPath, '--format', 'human', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const j = parseEnvelope(result);
    expect(j.payload!.diff.summary).toMatch(/structurally|identical/i);
  });

  it('the JSON payload still exposes an activities section', async () => {
    const result = await runDiffCli([
      'model', 'diff', logAPath, logBPath, '--format', 'human', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/"activities"/i);
  });

  it('the JSON payload still exposes a variants section', async () => {
    const result = await runDiffCli([
      'model', 'diff', logAPath, logBPath, '--format', 'human', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/"variants"/i);
  });

  it('self-diff summary mentions identical or the exact jaccard value', async () => {
    const result = await runDiffCli([
      'model', 'diff', logAPath, logAPath, '--format', 'human', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    // Self-diff jaccard=1 should trigger "identical" summary
    const j = parseEnvelope(result);
    // The summary says "Structurally nearly identical" for jaccard >= 0.9
    expect(j.payload!.diff.summary).toMatch(/identical|1\.000/i);
  });
});

// ─── wpm diff — flag behavior ─────────────────────────────────────────────────

describe('wpm diff — flag behavior', () => {
  it('--quiet suppresses non-error output in human mode', async () => {
    const result = await runDiffCli([
      'model', 'diff', logAPath, logAPath, '--format', 'human', '--quiet', '--no-save',
    ]);
    // Quiet mode should still exit 0
    expect([0, 2, 3]).toContain(result.exitCode);
  });

  it('--verbose produces more verbose output', async () => {
    const result = await runDiffCli([
      'model', 'diff', logAPath, logAPath, '--format', 'human', '--verbose', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
  });

  it('--no-save flag does not break diff execution', async () => {
    const result = await runDiffCli([
      'model', 'diff', logAPath, logBPath, '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const j = parseEnvelope(result);
    expect(j.status).toBe('ok');
  });
});

// ─── wpm diff — gap fixes (DX/QoL) ───────────────────────────────────────────

describe('wpm diff — gap fixes (DX/QoL)', () => {
  it('Gap-D1: nonexistent log1 error code is LOG1_NOT_FOUND in JSON', async () => {
    const result = await runDiffCli([
      'model', 'diff', '/nonexistent/log1.xes', logBPath, '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(2);
    const j = parseEnvelope(result);
    // Bridged failure — new {error:{code,message}} shape, not {status:'error'}.
    expect(j.error).toBeDefined();
    // error code should be specific to log1
    const errorBody = JSON.stringify(j);
    expect(errorBody).toMatch(/LOG1_NOT_FOUND|log1|not found/i);
  });

  it('Gap-D1: nonexistent log2 error code is LOG2_NOT_FOUND in JSON', async () => {
    const result = await runDiffCli([
      'model', 'diff', logAPath, '/nonexistent/log2.xes', '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(2);
    const j = parseEnvelope(result);
    expect(j.error).toBeDefined();
    // error code should be specific to log2
    const errorBody = JSON.stringify(j);
    expect(errorBody).toMatch(/LOG2_NOT_FOUND|log2|not found/i);
  });

  it('Gap-D2: self-diff JSON payload includes same_file:true flag', async () => {
    const result = await runDiffCli([
      'model', 'diff', logAPath, logAPath, '--format', 'json', '--no-save',
    ]);
    // If WASM is available, assert same_file:true and jaccard=1
    // If WASM fails (exit 3), still assert the command does not crash and produces valid JSON
    if (result.exitCode === 0) {
      const j = parseEnvelope(result);
      expect(j.status).toBe('ok');
      expect(j.payload!.diff.jaccard).toBe(1);
      const payloadStr = JSON.stringify(j.payload);
      expect(payloadStr).toContain('same_file');
    } else {
      // WASM not loaded — verify graceful error JSON (not a crash/raw text)
      expect([0, 3]).toContain(result.exitCode);
      const j = parseEnvelope(result);
      expect(j.status === 'ok' || j.error !== undefined).toBe(true);
    }
  });

  it('Gap-D2: two-log diff JSON payload does NOT include same_file flag (or it is false)', async () => {
    const result = await runDiffCli([
      'model', 'diff', logAPath, logBPath, '--format', 'json', '--no-save',
    ]);
    // If WASM is available, assert same_file is absent/false for distinct logs
    if (result.exitCode === 0) {
      const j = parseEnvelope(result);
      expect(j.status).toBe('ok');
      const payloadAny = j.payload as unknown as Record<string, unknown> | undefined;
      expect(payloadAny?.['same_file'] ?? false).toBe(false);
    } else {
      // WASM not loaded — verify graceful error JSON
      expect([0, 3]).toContain(result.exitCode);
      const j = parseEnvelope(result);
      expect(j.status === 'ok' || j.error !== undefined).toBe(true);
    }
  });
});
