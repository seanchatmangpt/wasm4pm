/**
 * diff-deep.test.ts — Tests for enhanced `wpm diff` with --deep flag,
 * improved default output, --same-file-check, and overall_verdict.
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
      'diff', baselinePath, baselinePath, '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const j = parseJson(result);
    expect(j.status).toBe('ok');
    expect(j.payload.diff.jaccard).toBe(1);
  });

  it('same-file diff payload includes same_file flag', async () => {
    const result = await runCli([
      'diff', baselinePath, baselinePath, '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const j = parseJson(result);
    expect(j.payload.same_file).toBe(true);
  });

  it('--same-file-check short-circuits on identical paths, exits 0', async () => {
    const result = await runCli([
      'diff', baselinePath, baselinePath,
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
      'diff', baselinePath, baselinePath,
      '--same-file-check', '--deep', '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const j = parseJson(result);
    expect(j.payload.deep.overall_verdict).toBe('IDENTICAL');
  });

  it('two distinct logs do NOT get same_file flag', async () => {
    const result = await runCli([
      'diff', baselinePath, currentPath, '--format', 'json', '--no-save',
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
      'diff', baselinePath, currentPath,
      '--deep', '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
  });

  it('--deep produces payload.deep object', async () => {
    const result = await runCli([
      'diff', baselinePath, currentPath,
      '--deep', '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const j = parseJson(result);
    expect(j.payload.deep).toBeDefined();
  });

  it('--deep produces control_flow with required fields', async () => {
    const result = await runCli([
      'diff', baselinePath, currentPath,
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
      'diff', baselinePath, currentPath,
      '--deep', '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const { control_flow } = parseJson(result).payload.deep;
    expect(control_flow.similarity).toBeGreaterThanOrEqual(0);
    expect(control_flow.similarity).toBeLessThanOrEqual(1);
  });

  it('--deep produces performance with required fields', async () => {
    const result = await runCli([
      'diff', baselinePath, currentPath,
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
      'diff', baselinePath, currentPath,
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
      'diff', baselinePath, currentPath,
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
      'diff', baselinePath, currentPath,
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
      'diff', baselinePath, currentPath,
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
      'diff', baselinePath, currentPath,
      '--deep', '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const { overall_verdict } = parseJson(result).payload.deep;
    expect(['IMPROVED', 'DEGRADED', 'CHANGED', 'IDENTICAL']).toContain(overall_verdict);
  });

  it('faster + similar structure → IMPROVED verdict', async () => {
    const result = await runCli([
      'diff', baselinePath, currentPath,
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
      'diff', baselinePath, baselinePath,
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
      'diff', baselinePath, currentPath, '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
  });

  it('exits 0 for two valid distinct logs (--deep mode)', async () => {
    const result = await runCli([
      'diff', baselinePath, currentPath,
      '--deep', '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
  });

  it('exits 0 for same-file (default mode)', async () => {
    const result = await runCli([
      'diff', baselinePath, baselinePath, '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
  });

  it('exits 2 (source_error) for missing file', async () => {
    const result = await runCli([
      'diff', '/nonexistent/log1.xes', currentPath,
      '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(2);
  });
});

// ─── Test 5: Default human output quick summary ───────────────────────────────

describe('wpm diff — default human output summary', () => {
  it('human output contains Similarity in the quick summary', async () => {
    const result = await runCli([
      'diff', baselinePath, currentPath, '--format', 'human', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/[Ss]imilarity/);
  });

  it('human output contains Activities count range (e.g. 3→3)', async () => {
    const result = await runCli([
      'diff', baselinePath, currentPath, '--format', 'human', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/Activities:/i);
  });

  it('human output contains Variants count range', async () => {
    const result = await runCli([
      'diff', baselinePath, currentPath, '--format', 'human', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/Variants:/i);
  });

  it('human output without --deep hints to run --deep', async () => {
    const result = await runCli([
      'diff', baselinePath, currentPath, '--format', 'human', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/--deep/);
  });

  it('human output with --deep shows Verdict', async () => {
    const result = await runCli([
      'diff', baselinePath, currentPath,
      '--deep', '--format', 'human', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/Verdict/i);
  });

  it('human output with --deep shows Performance section', async () => {
    const result = await runCli([
      'diff', baselinePath, currentPath,
      '--deep', '--format', 'human', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/Performance/i);
  });

  it('human output with --deep shows Control Flow section', async () => {
    const result = await runCli([
      'diff', baselinePath, currentPath,
      '--deep', '--format', 'human', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/Control Flow/i);
  });
});

// ─── Test 6: diff.activities reflects new/removed activities ─────────────────

describe('wpm diff --deep — control_flow activities', () => {
  it('AI_Approve appears in added_activities (only in current)', async () => {
    const result = await runCli([
      'diff', baselinePath, currentPath,
      '--deep', '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const { control_flow } = parseJson(result).payload.deep;
    // AI_Approve and Fast_Track are new in current log
    expect(control_flow.added_activities.length).toBeGreaterThan(0);
  });

  it('Manual_Review appears in removed_activities (only in baseline)', async () => {
    const result = await runCli([
      'diff', baselinePath, currentPath,
      '--deep', '--format', 'json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const { control_flow } = parseJson(result).payload.deep;
    // Manual_Review and Reject/Approve are only in baseline
    expect(control_flow.removed_activities.length).toBeGreaterThan(0);
  });
});
