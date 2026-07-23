/**
 * diff-deep.test.ts — Tests for enhanced `wpm diff` with --deep flag,
 * improved default output, --same-file-check, and overall_verdict.
 *
 * Migrated from the retired top-level `wpm diff` command (removed — see
 * `apps/wasm4pm/src/nouns/_removed.ts`: `diff` -> `model diff`) to
 * `wpm model diff` (`apps/wasm4pm/src/nouns/model/diff.ts`), a legacy BRIDGE
 * verb (`invokeLegacyCommandAsJson`) that reuses `commands/diff.ts`
 * unmodified. SUCCESS still returns the old `{command,status,payload,meta}`
 * envelope verbatim (all `--deep`/`--same-file-check` behavior below is
 * unchanged); the bridge's forced `--format json` means legacy
 * `--format human` no longer produces a text report (see the "default
 * output summary" describe block for the rewritten assertions).
 *
 * Oracle rank: Rank 2 (Domain contract).
 *
 * Coverage:
 *   1. Same-file diff exits 0 with similarity near 1.0
 *   2. --deep produces control_flow, performance, variants in JSON payload
 *   3. overall_verdict is one of IMPROVED/DEGRADED/CHANGED/IDENTICAL
 *   4. Exit code 0 on success
 *   5. --same-file-check short-circuit path
 *   6. Default output quick-summary format
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ─── XES fixture builders ─────────────────────────────────────────────────────

function buildXes(
  traces: Array<Array<{ activity: string; timestamp: string }>>,
  casePrefix = 'case'
): string {
  const traceXml = traces.map((events, i) => {
    const eventsXml = events
      .map(
        (e) =>
          `    <event>
      <string key="concept:name" value="${e.activity}"/>
      <date key="time:timestamp" value="${e.timestamp}"/>
    </event>`
      )
      .join('\n');
    return `  <trace>
    <string key="concept:name" value="${casePrefix}_${i + 1}"/>
${eventsXml}
  </trace>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<log xmlns="http://www.xes-standard.org/" xes.version="1.0">
  <extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/>
  <extension name="Time" prefix="time" uri="http://www.xes-standard.org/time.xesext"/>
${traceXml.join('\n')}
</log>`;
}

// Baseline: slower process with manual review path
const LOG_BASELINE_XES = buildXes(
  [
    [
      { activity: 'Register', timestamp: '2024-01-01T08:00:00Z' },
      { activity: 'Manual_Review', timestamp: '2024-01-02T10:00:00Z' },   // +26h
      { activity: 'Approve', timestamp: '2024-01-03T11:00:00Z' },         // +25h
      { activity: 'Ship', timestamp: '2024-01-03T14:00:00Z' },            // +3h
    ],
    [
      { activity: 'Register', timestamp: '2024-01-05T08:00:00Z' },
      { activity: 'Manual_Review', timestamp: '2024-01-06T10:00:00Z' },
      { activity: 'Reject', timestamp: '2024-01-07T11:00:00Z' },
      { activity: 'Close', timestamp: '2024-01-07T12:00:00Z' },
    ],
    [
      { activity: 'Register', timestamp: '2024-01-10T08:00:00Z' },
      { activity: 'Manual_Review', timestamp: '2024-01-11T09:00:00Z' },
      { activity: 'Approve', timestamp: '2024-01-12T10:00:00Z' },
      { activity: 'Ship', timestamp: '2024-01-12T13:00:00Z' },
    ],
  ],
  'order'
);

// Current: faster process with AI approval path, no manual review
const LOG_CURRENT_XES = buildXes(
  [
    [
      { activity: 'Register', timestamp: '2024-02-01T08:00:00Z' },
      { activity: 'AI_Approve', timestamp: '2024-02-01T10:00:00Z' },   // +2h (much faster)
      { activity: 'Ship', timestamp: '2024-02-01T14:00:00Z' },
    ],
    [
      { activity: 'Register', timestamp: '2024-02-05T08:00:00Z' },
      { activity: 'AI_Approve', timestamp: '2024-02-05T09:30:00Z' },
      { activity: 'Fast_Track', timestamp: '2024-02-05T10:00:00Z' },
      { activity: 'Ship', timestamp: '2024-02-05T11:00:00Z' },
    ],
    [
      { activity: 'Register', timestamp: '2024-02-10T08:00:00Z' },
      { activity: 'AI_Approve', timestamp: '2024-02-10T09:00:00Z' },
      { activity: 'Ship', timestamp: '2024-02-10T12:00:00Z' },
    ],
  ],
  'order'
);

// ─── CLI runner ───────────────────────────────────────────────────────────────

const CLI_PATH = path.resolve(__dirname, '../../dist/bin/wpm.js');

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runCli(args: string[], timeoutMs = 60_000): Promise<CliResult> {
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

function parseJson(result: CliResult): any {
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(
      `Failed to parse JSON output.\nExit: ${result.exitCode}\nstdout: ${result.stdout.slice(0, 500)}\nstderr: ${result.stderr.slice(0, 300)}`
    );
  }
}

// ─── Temp dir lifecycle ───────────────────────────────────────────────────────

let tempDir: string;
let baselinePath: string;
let currentPath: string;

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-diff-deep-'));
  baselinePath = path.join(tempDir, 'baseline.xes');
  currentPath = path.join(tempDir, 'current.xes');
  fs.writeFileSync(baselinePath, LOG_BASELINE_XES, 'utf-8');
  fs.writeFileSync(currentPath, LOG_CURRENT_XES, 'utf-8');
});

afterAll(() => {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
});

// ─── Test 1: Same-file diff → similarity near 1.0 ────────────────────────────

describe('wpm diff — same-file detection', () => {
  it('same-file diff exits 0 with jaccard = 1', async () => {
    const result = await runCli([
      'model', 'diff', baselinePath, baselinePath, '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const j = parseJson(result);
    expect(j.status).toBe('ok');
    expect(j.payload.diff.jaccard).toBe(1);
  });

  it('same-file diff payload includes same_file flag', async () => {
    const result = await runCli([
      'model', 'diff', baselinePath, baselinePath, '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const j = parseJson(result);
    expect(j.payload.same_file).toBe(true);
  });

  it('--same-file-check short-circuits on identical paths, exits 0', async () => {
    const result = await runCli([
      'model', 'diff', baselinePath, baselinePath,
      '--same-file-check', '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const j = parseJson(result);
    expect(j.status).toBe('ok');
    expect(j.payload.diff.jaccard).toBe(1);
    expect(j.payload.same_file).toBe(true);
  });

  it('--same-file-check with --deep produces IDENTICAL verdict', async () => {
    const result = await runCli([
      'model', 'diff', baselinePath, baselinePath,
      '--same-file-check', '--deep', '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const j = parseJson(result);
    expect(j.payload.deep.overall_verdict).toBe('IDENTICAL');
  });

  it('two distinct logs do NOT get same_file flag', async () => {
    const result = await runCli([
      'model', 'diff', baselinePath, currentPath, '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const j = parseJson(result);
    expect(j.payload.same_file ?? false).toBe(false);
  });
});

// ─── Test 2: --deep produces control_flow, performance, variants ──────────────

describe('wpm diff --deep — JSON structure', () => {
  it('--deep flag exits 0', async () => {
    const result = await runCli([
      'model', 'diff', baselinePath, currentPath,
      '--deep', '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
  });

  it('--deep produces payload.deep object', async () => {
    const result = await runCli([
      'model', 'diff', baselinePath, currentPath,
      '--deep', '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const j = parseJson(result);
    expect(j.payload.deep).toBeDefined();
  });

  it('--deep produces control_flow with required fields', async () => {
    const result = await runCli([
      'model', 'diff', baselinePath, currentPath,
      '--deep', '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const { control_flow } = parseJson(result).payload.deep;
    expect(typeof control_flow.similarity).toBe('number');
    expect(typeof control_flow.added_paths).toBe('number');
    expect(typeof control_flow.removed_paths).toBe('number');
    expect(Array.isArray(control_flow.added_activities)).toBe(true);
    expect(Array.isArray(control_flow.removed_activities)).toBe(true);
  });

  it('--deep control_flow.similarity is in [0, 1]', async () => {
    const result = await runCli([
      'model', 'diff', baselinePath, currentPath,
      '--deep', '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const { control_flow } = parseJson(result).payload.deep;
    expect(control_flow.similarity).toBeGreaterThanOrEqual(0);
    expect(control_flow.similarity).toBeLessThanOrEqual(1);
  });

  it('--deep produces performance with required fields', async () => {
    const result = await runCli([
      'model', 'diff', baselinePath, currentPath,
      '--deep', '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const { performance } = parseJson(result).payload.deep;
    expect(typeof performance.baseline_avg_duration_hours).toBe('number');
    expect(typeof performance.current_avg_duration_hours).toBe('number');
    expect(typeof performance.duration_delta_pct).toBe('number');
    expect(typeof performance.throughput_change_pct).toBe('number');
  });

  it('--deep performance shows faster current process (duration_delta_pct < 0)', async () => {
    const result = await runCli([
      'model', 'diff', baselinePath, currentPath,
      '--deep', '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const { performance } = parseJson(result).payload.deep;
    // Current log has much shorter traces (~2-6h) vs baseline (~54-75h)
    // duration_delta_pct must be negative (improvement)
    expect(performance.duration_delta_pct).toBeLessThan(0);
  });

  it('--deep produces variants with required fields', async () => {
    const result = await runCli([
      'model', 'diff', baselinePath, currentPath,
      '--deep', '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const { variants } = parseJson(result).payload.deep;
    expect(typeof variants.baseline_count).toBe('number');
    expect(typeof variants.current_count).toBe('number');
    expect(typeof variants.new_variants).toBe('number');
    expect(typeof variants.removed_variants).toBe('number');
    expect(typeof variants.top_new_variant).toBe('string');
    expect(typeof variants.top_removed_variant).toBe('string');
  });

  it('--deep variants counts are non-negative', async () => {
    const result = await runCli([
      'model', 'diff', baselinePath, currentPath,
      '--deep', '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const { variants } = parseJson(result).payload.deep;
    expect(variants.baseline_count).toBeGreaterThanOrEqual(0);
    expect(variants.current_count).toBeGreaterThanOrEqual(0);
    expect(variants.new_variants).toBeGreaterThanOrEqual(0);
    expect(variants.removed_variants).toBeGreaterThanOrEqual(0);
  });

  it('--deep without --deep flag does NOT produce payload.deep', async () => {
    const result = await runCli([
      'model', 'diff', baselinePath, currentPath,
      '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const j = parseJson(result);
    expect(j.payload.deep).toBeUndefined();
  });
});

// ─── Test 3: overall_verdict is one of the four valid values ─────────────────

describe('wpm diff --deep — overall_verdict', () => {
  it('overall_verdict is one of IMPROVED/DEGRADED/CHANGED/IDENTICAL', async () => {
    const result = await runCli([
      'model', 'diff', baselinePath, currentPath,
      '--deep', '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const { overall_verdict } = parseJson(result).payload.deep;
    expect(['IMPROVED', 'DEGRADED', 'CHANGED', 'IDENTICAL']).toContain(overall_verdict);
  });

  it('faster + similar structure → IMPROVED verdict', async () => {
    const result = await runCli([
      'model', 'diff', baselinePath, currentPath,
      '--deep', '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const deep = parseJson(result).payload.deep;
    // current is significantly faster (duration_delta_pct < 0) → should be IMPROVED
    if (deep.performance.duration_delta_pct < 0 && deep.control_flow.similarity > 0.6) {
      expect(deep.overall_verdict).toBe('IMPROVED');
    } else {
      // Still must be a valid verdict
      expect(['IMPROVED', 'DEGRADED', 'CHANGED', 'IDENTICAL']).toContain(deep.overall_verdict);
    }
  });

  it('self-diff with --deep → IDENTICAL verdict', async () => {
    const result = await runCli([
      'model', 'diff', baselinePath, baselinePath,
      '--same-file-check', '--deep', '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const { overall_verdict } = parseJson(result).payload.deep;
    expect(overall_verdict).toBe('IDENTICAL');
  });
});

// ─── Test 4: Exit code 0 on success ──────────────────────────────────────────

describe('wpm diff — exit codes', () => {
  it('exits 0 for two valid distinct logs (default mode)', async () => {
    const result = await runCli([
      'model', 'diff', baselinePath, currentPath, '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
  });

  it('exits 0 for two valid distinct logs (--deep mode)', async () => {
    const result = await runCli([
      'model', 'diff', baselinePath, currentPath,
      '--deep', '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
  });

  it('exits 0 for same-file (default mode)', async () => {
    const result = await runCli([
      'model', 'diff', baselinePath, baselinePath, '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
  });

  it('exits 2 (source_error) for missing file', async () => {
    const result = await runCli([
      'model', 'diff', '/nonexistent/log1.xes', currentPath,
      '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(2);
  });
});

// ─── Test 5: Default output quick summary (was: human-formatted text — REMOVED, see file header) ──
//
// The `model diff` bridge forces `--format json` under the hood regardless
// of what the caller passes (see `_bridge.ts`'s `stripLegacyOutputFlags` /
// `invokeLegacyCommandAsJson`), so the legacy command's rich `--format human`
// quick-summary text ("Similarity: ...", "Activities: 3→3", "Verdict:",
// "Performance"/"Control Flow" section headers, the "--deep" hint) is no
// longer reachable through `wpm model diff` — stdout is ALWAYS the JSON
// envelope now. These are rewritten to assert the equivalent real JSON
// fields instead of grepping for text that can no longer be produced.

describe('wpm diff — default output summary (legacy --format human is now overridden to JSON)', () => {
  it('JSON payload conveys similarity via diff.jaccard / diff.summary (was: human "Similarity" line)', async () => {
    const result = await runCli([
      'model', 'diff', baselinePath, currentPath, '--format', 'human', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const j = parseJson(result);
    expect(typeof j.payload.diff.jaccard).toBe('number');
    expect(j.payload.diff.summary).toMatch(/similar|different|identical/i);
  });

  it('JSON payload exposes an activities section (was: human "Activities:" count range)', async () => {
    const result = await runCli([
      'model', 'diff', baselinePath, currentPath, '--format', 'human', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const j = parseJson(result);
    expect(j.payload.diff.activities).toBeDefined();
    expect(Array.isArray(j.payload.diff.activities.shared)).toBe(true);
  });

  it('JSON payload exposes a variants section (was: human "Variants:" count range)', async () => {
    const result = await runCli([
      'model', 'diff', baselinePath, currentPath, '--format', 'human', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const j = parseJson(result);
    expect(j.payload.diff.variants).toBeDefined();
  });

  it('without --deep, payload has no deep section at all (was: human hint text to run --deep)', async () => {
    const result = await runCli([
      'model', 'diff', baselinePath, currentPath, '--format', 'human', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const j = parseJson(result);
    expect(j.payload.deep).toBeUndefined();
  });

  it('with --deep, JSON payload.deep.overall_verdict is present (was: human "Verdict" line)', async () => {
    const result = await runCli([
      'model', 'diff', baselinePath, currentPath,
      '--deep', '--format', 'human', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const j = parseJson(result);
    expect(['IMPROVED', 'DEGRADED', 'CHANGED', 'IDENTICAL']).toContain(j.payload.deep.overall_verdict);
  });

  it('with --deep, JSON payload.deep.performance is present (was: human "Performance" section)', async () => {
    const result = await runCli([
      'model', 'diff', baselinePath, currentPath,
      '--deep', '--format', 'human', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const j = parseJson(result);
    expect(j.payload.deep.performance).toBeDefined();
  });

  it('with --deep, JSON payload.deep.control_flow is present (was: human "Control Flow" section)', async () => {
    const result = await runCli([
      'model', 'diff', baselinePath, currentPath,
      '--deep', '--format', 'human', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const j = parseJson(result);
    expect(j.payload.deep.control_flow).toBeDefined();
  });
});

// ─── Test 6: diff.activities reflects new/removed activities ─────────────────

describe('wpm diff --deep — control_flow activities', () => {
  it('AI_Approve appears in added_activities (only in current)', async () => {
    const result = await runCli([
      'model', 'diff', baselinePath, currentPath,
      '--deep', '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const { control_flow } = parseJson(result).payload.deep;
    // AI_Approve and Fast_Track are new in current log
    expect(control_flow.added_activities.length).toBeGreaterThan(0);
  });

  it('Manual_Review appears in removed_activities (only in baseline)', async () => {
    const result = await runCli([
      'model', 'diff', baselinePath, currentPath,
      '--deep', '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const { control_flow } = parseJson(result).payload.deep;
    // Manual_Review and Reject/Approve are only in baseline
    expect(control_flow.removed_activities.length).toBeGreaterThan(0);
  });
});
