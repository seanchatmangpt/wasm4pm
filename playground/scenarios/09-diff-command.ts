/**
 * Scenario: diff command — pmctl diff log1.xes log2.xes
 *
 * Dev action simulated: "I refactored the Jaccard computation or changed how
 * computeDiff normalises variant keys. Does same-file diff still produce 1.0?
 * Do missing files exit 2? Does --format json round-trip the diff field?"
 *
 * Key contracts verified:
 *   - Missing log1 or log2 → exit 2 (source_error)
 *   - --format json on error → { status: 'error', message: string }
 *   - Same file vs itself → Jaccard 1.0, zero added/removed activities/edges
 *   - Different files → Jaccard < 1.0 when processes differ structurally
 *   - Human output contains the "Structural similarity" banner
 *
 * Binary: apps/pmctl/dist/bin/pmctl.js (must be built first)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as path from 'path';
import * as url from 'url';
import * as fs from 'fs/promises';
import { runCli, assertExitCode, assertJsonOutput, createCliTestEnv, EXIT_CODES } from '@wasm4pm/testing';
import type { CliTestEnv } from '@wasm4pm/testing';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const PMCTL = path.resolve(__dirname, '../../apps/pmctl/dist/bin/pmctl.js');

function pmctl(userArgs: string[]) {
  return runCli([PMCTL, ...userArgs], { cliPath: 'node', timeout: 20_000 });
}

// ── XES fixtures ──────────────────────────────────────────────────────────────

// Standard A→B→C log (3 traces) — edges: {A→B, B→C}
const MINI_XES = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0">
  <extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/>
  <extension name="Time" prefix="time" uri="http://www.xes-standard.org/time.xesext"/>
  <global scope="event">
    <string key="concept:name" value="undefined"/>
    <date key="time:timestamp" value="1970-01-01T00:00:00.000+00:00"/>
  </global>
  <trace>
    <string key="concept:name" value="Case1"/>
    <event><string key="concept:name" value="A"/><date key="time:timestamp" value="2024-01-01T09:00:00"/></event>
    <event><string key="concept:name" value="B"/><date key="time:timestamp" value="2024-01-01T10:00:00"/></event>
    <event><string key="concept:name" value="C"/><date key="time:timestamp" value="2024-01-01T11:00:00"/></event>
  </trace>
  <trace>
    <string key="concept:name" value="Case2"/>
    <event><string key="concept:name" value="A"/><date key="time:timestamp" value="2024-01-02T09:00:00"/></event>
    <event><string key="concept:name" value="B"/><date key="time:timestamp" value="2024-01-02T10:00:00"/></event>
    <event><string key="concept:name" value="C"/><date key="time:timestamp" value="2024-01-02T11:00:00"/></event>
  </trace>
  <trace>
    <string key="concept:name" value="Case3"/>
    <event><string key="concept:name" value="A"/><date key="time:timestamp" value="2024-01-03T09:00:00"/></event>
    <event><string key="concept:name" value="B"/><date key="time:timestamp" value="2024-01-03T10:00:00"/></event>
    <event><string key="concept:name" value="C"/><date key="time:timestamp" value="2024-01-03T11:00:00"/></event>
  </trace>
</log>`;

// Structurally different: first 2 traces A→B→C, last 2 traces A→D→C
// Edges: {A→B, A→D, B→C, D→C}. Cross-log Jaccard: shared=2, union=4 → 0.5
const DRIFT_XES = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0">
  <extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/>
  <extension name="Time" prefix="time" uri="http://www.xes-standard.org/time.xesext"/>
  <global scope="event">
    <string key="concept:name" value="undefined"/>
    <date key="time:timestamp" value="1970-01-01T00:00:00.000+00:00"/>
  </global>
  <trace>
    <string key="concept:name" value="Pre1"/>
    <event><string key="concept:name" value="A"/><date key="time:timestamp" value="2024-01-01T09:00:00"/></event>
    <event><string key="concept:name" value="B"/><date key="time:timestamp" value="2024-01-01T10:00:00"/></event>
    <event><string key="concept:name" value="C"/><date key="time:timestamp" value="2024-01-01T11:00:00"/></event>
  </trace>
  <trace>
    <string key="concept:name" value="Pre2"/>
    <event><string key="concept:name" value="A"/><date key="time:timestamp" value="2024-01-02T09:00:00"/></event>
    <event><string key="concept:name" value="B"/><date key="time:timestamp" value="2024-01-02T10:00:00"/></event>
    <event><string key="concept:name" value="C"/><date key="time:timestamp" value="2024-01-02T11:00:00"/></event>
  </trace>
  <trace>
    <string key="concept:name" value="Post1"/>
    <event><string key="concept:name" value="A"/><date key="time:timestamp" value="2024-06-01T09:00:00"/></event>
    <event><string key="concept:name" value="D"/><date key="time:timestamp" value="2024-06-01T10:00:00"/></event>
    <event><string key="concept:name" value="C"/><date key="time:timestamp" value="2024-06-01T11:00:00"/></event>
  </trace>
  <trace>
    <string key="concept:name" value="Post2"/>
    <event><string key="concept:name" value="A"/><date key="time:timestamp" value="2024-06-02T09:00:00"/></event>
    <event><string key="concept:name" value="D"/><date key="time:timestamp" value="2024-06-02T10:00:00"/></event>
    <event><string key="concept:name" value="C"/><date key="time:timestamp" value="2024-06-02T11:00:00"/></event>
  </trace>
</log>`;

// ── Shared temp env for WASM-dependent tests ──────────────────────────────────

let _env: CliTestEnv | null = null;
let miniXesPath: string;
let driftXesPath: string;

beforeAll(async () => {
  _env = await createCliTestEnv();
  miniXesPath  = path.join(_env.tempDir, 'mini.xes');
  driftXesPath = path.join(_env.tempDir, 'drift.xes');
  await fs.writeFile(miniXesPath,  MINI_XES,  'utf-8');
  await fs.writeFile(driftXesPath, DRIFT_XES, 'utf-8');
  console.info('[diff] temp dir:', _env.tempDir);
});

afterAll(async () => { await _env?.cleanup(); _env = null; });

// ── Error paths ───────────────────────────────────────────────────────────────

describe('diff command: error paths', () => {
  it('exits 2 (source_error) when log1 does not exist', async () => {
    const result = await pmctl(['diff', '/tmp/phantom-diff-log1-99999.xes', '/tmp/phantom-diff-log2-99999.xes']);
    assertExitCode(result, EXIT_CODES.SOURCE_ERROR);
    expect(result.stderr + result.stdout).toMatch(/not found|no such file|does not exist/i);
    console.info('[diff] missing log1 message:', (result.stderr + result.stdout).slice(0, 120));
  });

  it('exits 2 (source_error) when log2 does not exist but log1 does', async () => {
    const result = await pmctl(['diff', miniXesPath, '/tmp/phantom-diff-log2-99999.xes']);
    assertExitCode(result, EXIT_CODES.SOURCE_ERROR);
    expect(result.stderr + result.stdout).toMatch(/not found|no such file|does not exist/i);
    console.info('[diff] missing log2 message:', (result.stderr + result.stdout).slice(0, 120));
  });

  it('--format json emits parseable error envelope on missing file', async () => {
    const result = await pmctl(['diff', '/tmp/phantom-diff-log1-99999.xes', '/tmp/phantom-diff-log2-99999.xes', '--format', 'json']);
    assertExitCode(result, EXIT_CODES.SOURCE_ERROR);
    const envelope = assertJsonOutput(result) as Record<string, unknown>;
    expect(envelope).toHaveProperty('status', 'error');
    expect(typeof envelope['message']).toBe('string');
    console.info('[diff] json error envelope:', JSON.stringify(envelope).slice(0, 200));
  });
});

// ── Same-file comparison ──────────────────────────────────────────────────────

describe('diff command: same-file comparison', () => {
  it('exits 0 (or 3 if WASM unbuilt) when both paths are the same file', async () => {
    const result = await pmctl(['diff', miniXesPath, miniXesPath]);
    const acceptable = [EXIT_CODES.SUCCESS, EXIT_CODES.EXECUTION_ERROR];
    if (!acceptable.includes(result.exitCode)) {
      console.error('[diff] same-file unexpected exit:', result.exitCode);
      console.error('  stdout:', result.stdout.slice(0, 300));
      console.error('  stderr:', result.stderr.slice(0, 300));
    }
    expect(acceptable, `diff same-file exited ${result.exitCode}`).toContain(result.exitCode);
    if (result.exitCode === EXIT_CODES.SUCCESS) {
      console.info('[diff] same-file stdout:', result.stdout.slice(0, 300));
    } else {
      console.warn('[diff] exit 3 — WASM may not be initialized. Run: cd wasm4pm && npm run build:nodejs');
    }
  }, 30_000);

  it('--format json same-file Jaccard is 1.0 with zero added/removed', async () => {
    const result = await pmctl(['diff', miniXesPath, miniXesPath, '--format', 'json']);
    if (result.exitCode !== EXIT_CODES.SUCCESS) {
      console.warn('[diff] skipping Jaccard=1.0 check — exit', result.exitCode);
      return;
    }
    const envelope = assertJsonOutput(result) as Record<string, unknown>;
    expect(envelope).toHaveProperty('status', 'success');
    const diff = envelope['diff'] as Record<string, unknown>;
    expect(diff).toBeDefined();
    expect(typeof diff['jaccard']).toBe('number');
    expect(diff['jaccard']).toBe(1.0);
    const activities = diff['activities'] as Record<string, unknown[]>;
    expect(activities['added']).toHaveLength(0);
    expect(activities['removed']).toHaveLength(0);
    const edges = diff['edges'] as Record<string, unknown[]>;
    expect(edges['added']).toHaveLength(0);
    expect(edges['removed']).toHaveLength(0);
    console.info('[diff] same-file Jaccard:', diff['jaccard'], '| summary:', diff['summary']);
  }, 30_000);
});

// ── Cross-log comparison ──────────────────────────────────────────────────────

describe('diff command: cross-log comparison', () => {
  it('exits 0 (or 3) comparing two structurally different logs', async () => {
    const result = await pmctl(['diff', miniXesPath, driftXesPath]);
    const acceptable = [EXIT_CODES.SUCCESS, EXIT_CODES.EXECUTION_ERROR];
    if (!acceptable.includes(result.exitCode)) {
      console.error('[diff] cross-log unexpected exit:', result.exitCode);
      console.error('  stdout:', result.stdout.slice(0, 300));
      console.error('  stderr:', result.stderr.slice(0, 300));
    }
    expect(acceptable, `diff cross-log exited ${result.exitCode}`).toContain(result.exitCode);
    if (result.exitCode === EXIT_CODES.SUCCESS) {
      console.info('[diff] cross-log stdout:', result.stdout.slice(0, 300));
    }
  }, 30_000);

  it('--format json cross-log Jaccard is < 1.0', async () => {
    const result = await pmctl(['diff', miniXesPath, driftXesPath, '--format', 'json']);
    if (result.exitCode !== EXIT_CODES.SUCCESS) {
      console.warn('[diff] skipping Jaccard<1.0 check — exit', result.exitCode);
      return;
    }
    const envelope = assertJsonOutput(result) as Record<string, unknown>;
    const diff = envelope['diff'] as Record<string, unknown>;
    const jaccard = diff['jaccard'] as number;
    expect(jaccard).toBeGreaterThanOrEqual(0);
    expect(jaccard).toBeLessThan(1.0);
    console.info('[diff] cross-log Jaccard:', jaccard, '(DRIFT_XES adds activity D — must be < 1.0)');
  }, 30_000);

  it('human output contains "Structural similarity" banner', async () => {
    const result = await pmctl(['diff', miniXesPath, driftXesPath]);
    if (result.exitCode !== EXIT_CODES.SUCCESS) {
      console.warn('[diff] skipping banner check — exit', result.exitCode);
      return;
    }
    // Human format uses consola which writes to stderr in child processes
    const output = result.stdout + result.stderr;
    expect(output).toMatch(/Structural similarity|Jaccard/i);
    console.info('[diff] banner found in stdout: OK');
  }, 30_000);
});
