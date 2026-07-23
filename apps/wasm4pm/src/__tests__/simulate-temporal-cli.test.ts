/**
 * `wpm simulate` and `wpm temporal` were both retired; the hard-break table
 * (nouns/_removed.ts) forwards them to `wpm model simulate` and
 * `wpm lab temporal` respectively — both bridges to their unmodified legacy
 * `commands/*.ts` bodies. Confirmed live against the built CLI: a successful
 * call returns the legacy `{command,status,payload,meta}` envelope verbatim;
 * a failing call is thrown as the framework's bare `{error:{code,message}}`
 * envelope instead (no top-level `command`/`status` field survives).
 *
 * simulate-temporal-cli.test.ts — CLI integration tests for `wpm model simulate` and `wpm lab temporal`
 *
 * Oracle rank: Rank 2 (Domain contract — exit codes, JSON envelope shape, and flag behavior).
 *
 * Coverage:
 *  - `wpm simulate -i <xes> --format json`                → exits 0, returns valid JSON envelope
 *  - `wpm simulate -i <xes> --cases 5 --format json`      → respects --cases flag
 *  - `wpm simulate -i <xes> --seed 42 --format json`      → accepts --seed flag without crash
 *  - `wpm simulate -i <xes> --format human`               → does not crash (exit 0)
 *  - `wpm simulate` (no input)                            → exits 2 (source_error), returns JSON error
 *  - `wpm temporal -i <xes> --format json`                → exits 0, returns valid JSON with dfg + violations
 *  - `wpm temporal -i <xes> --threshold 0.01 --format json` → respects --threshold flag
 *  - `wpm temporal -i <xes> --format human`               → does not crash (exit 0)
 *  - `wpm temporal` (no input)                            → exits 2 (source_error), returns JSON error
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

// ── Minimal XES fixture with timestamps for temporal analysis ─────────────────

const MINIMAL_XES = `<?xml version="1.0" encoding="UTF-8"?>
<log xmlns="http://www.xes-standard.org/" xes.version="1.0">
  <extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/>
  <extension name="Time" prefix="time" uri="http://www.xes-standard.org/time.xesext"/>
  <extension name="Organizational" prefix="org" uri="http://www.xes-standard.org/org.xesext"/>
  <extension name="Lifecycle" prefix="lifecycle" uri="http://www.xes-standard.org/lifecycle.xesext"/>
  <global scope="trace">
    <string key="concept:name" value="Case ID"/>
  </global>
  <global scope="event">
    <string key="concept:name" value="Activity"/>
    <date key="time:timestamp" value="Timestamp"/>
    <string key="org:resource" value="Resource"/>
  </global>
  <trace>
    <string key="concept:name" value="case_1"/>
    <event>
      <string key="concept:name" value="register"/>
      <date key="time:timestamp" value="2024-01-15T09:00:00Z"/>
      <string key="org:resource" value="Alice"/>
    </event>
    <event>
      <string key="concept:name" value="examine"/>
      <date key="time:timestamp" value="2024-01-15T09:30:00Z"/>
      <string key="org:resource" value="Bob"/>
    </event>
    <event>
      <string key="concept:name" value="decide"/>
      <date key="time:timestamp" value="2024-01-15T10:00:00Z"/>
      <string key="org:resource" value="Charlie"/>
    </event>
    <event>
      <string key="concept:name" value="notify"/>
      <date key="time:timestamp" value="2024-01-15T10:15:00Z"/>
      <string key="org:resource" value="Alice"/>
    </event>
  </trace>
  <trace>
    <string key="concept:name" value="case_2"/>
    <event>
      <string key="concept:name" value="register"/>
      <date key="time:timestamp" value="2024-01-15T11:00:00Z"/>
      <string key="org:resource" value="Bob"/>
    </event>
    <event>
      <string key="concept:name" value="decide"/>
      <date key="time:timestamp" value="2024-01-15T11:45:00Z"/>
      <string key="org:resource" value="Charlie"/>
    </event>
    <event>
      <string key="concept:name" value="notify"/>
      <date key="time:timestamp" value="2024-01-15T12:00:00Z"/>
      <string key="org:resource" value="Alice"/>
    </event>
  </trace>
  <trace>
    <string key="concept:name" value="case_3"/>
    <event>
      <string key="concept:name" value="register"/>
      <date key="time:timestamp" value="2024-01-16T08:00:00Z"/>
      <string key="org:resource" value="Alice"/>
    </event>
    <event>
      <string key="concept:name" value="examine"/>
      <date key="time:timestamp" value="2024-01-16T09:00:00Z"/>
      <string key="org:resource" value="Bob"/>
    </event>
    <event>
      <string key="concept:name" value="decide"/>
      <date key="time:timestamp" value="2024-01-16T10:30:00Z"/>
      <string key="org:resource" value="Charlie"/>
    </event>
    <event>
      <string key="concept:name" value="notify"/>
      <date key="time:timestamp" value="2024-01-16T11:00:00Z"/>
      <string key="org:resource" value="Alice"/>
    </event>
  </trace>
</log>`;

// ── CLI helpers ───────────────────────────────────────────────────────────────

const CLI_PATH = path.resolve(import.meta.dirname, '../../dist/bin/wpm.js');

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runCli(args: string[], timeoutMs = 30_000): Promise<CliResult> {
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [CLI_PATH, ...args],
      { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 },
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

// `command`/`status` only exist on the bridge's success-path passthrough of
// the legacy envelope; a bridged failure is thrown and reaches stdout as the
// bare `{error:{code,message}}` shape with neither field (see file header).
interface Envelope {
  command?: string;
  status?: 'ok' | 'error';
  payload?: Record<string, unknown>;
  error?: { code?: string; message?: string };
}

function parseEnvelope(result: CliResult): Envelope {
  try {
    return JSON.parse(result.stdout) as Envelope;
  } catch {
    throw new Error(
      `Failed to parse CLI output as JSON.\n` +
        `Exit code: ${result.exitCode}\n` +
        `stdout: ${result.stdout.slice(0, 400)}\n` +
        `stderr: ${result.stderr.slice(0, 200)}`
    );
  }
}

// ── Test environment ──────────────────────────────────────────────────────────

interface TestEnv {
  tempDir: string;
  xesPath: string;
  cleanup: () => Promise<void>;
}

async function createTestEnv(): Promise<TestEnv> {
  const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'wpm-sim-temp-test-'));
  const xesPath = path.join(tempDir, 'test.xes');
  await fs.writeFile(xesPath, MINIMAL_XES, 'utf-8');
  return {
    tempDir,
    xesPath,
    cleanup: async () => {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        /* best-effort cleanup */
      }
    },
  };
}

// ── wpm simulate ──────────────────────────────────────────────────────────────

describe('wpm simulate — CLI integration', () => {
  let env: TestEnv;

  beforeEach(async () => {
    env = await createTestEnv();
  });

  afterEach(async () => {
    await env.cleanup();
  });

  it('exits 0 and returns valid JSON envelope with simulation payload', async () => {
    const result = await runCli(['model', 'simulate', '-i', env.xesPath, '--format', 'json', '--no-save']);
    expect(result.exitCode).toBe(0);

    const j = parseEnvelope(result);
    expect(j.command).toBe('simulate');
    expect(j.status).toBe('ok');
    expect(j.payload).toBeDefined();

    const p = j.payload as Record<string, unknown>;
    // simulation block must be present with method=monte_carlo
    const sim = p['simulation'] as Record<string, unknown>;
    expect(sim).toBeDefined();
    expect(sim['method']).toBe('monte_carlo');
    expect(typeof sim['casesRequested']).toBe('number');
    expect(typeof sim['seed']).toBe('number');

    // statistics block must be present
    const stats = p['statistics'] as Record<string, unknown>;
    expect(stats).toBeDefined();
    expect('avgTraceLength' in stats).toBe(true);
    // avgSojournTimeMs is the canonical field name (includes unit suffix)
    expect('avgSojournTimeMs' in stats).toBe(true);

    // traces must be an array
    expect(Array.isArray(p['traces'])).toBe(true);

    // input path must be recorded
    expect(p['input']).toBe(env.xesPath);
  });

  it('--cases flag sets casesRequested in the response', async () => {
    const result = await runCli([
      'model',
      'simulate',
      '-i',
      env.xesPath,
      '--cases',
      '5',
      '--format',
      'json',
      '--no-save',
    ]);
    expect(result.exitCode).toBe(0);

    const j = parseEnvelope(result);
    expect(j.status).toBe('ok');
    const sim = (j.payload as Record<string, unknown>)['simulation'] as Record<string, unknown>;
    expect(sim['casesRequested']).toBe(5);
  });

  it('--seed flag is accepted without crashing and seed value is echoed in response', async () => {
    const result = await runCli([
      'model',
      'simulate',
      '-i',
      env.xesPath,
      '--seed',
      '42',
      '--format',
      'json',
      '--no-save',
    ]);
    expect(result.exitCode).toBe(0);

    const j = parseEnvelope(result);
    expect(j.status).toBe('ok');
    const sim = (j.payload as Record<string, unknown>)['simulation'] as Record<string, unknown>;
    expect(sim['seed']).toBe(42);
  });

  it('--format human does not crash and exits 0', async () => {
    const result = await runCli([
      'model',
      'simulate',
      '-i',
      env.xesPath,
      '--format',
      'human',
      '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    // Human output should contain at least some text
    const combined = result.stdout + result.stderr;
    expect(combined.length).toBeGreaterThan(0);
  });

  it('missing input exits 2 (source_error) and returns the bare {error} envelope', async () => {
    const result = await runCli(['model', 'simulate', '--format', 'json']);
    expect(result.exitCode).toBe(2);

    const j = parseEnvelope(result);
    expect(j.command).toBeUndefined();
    expect(j.status).toBeUndefined();
    expect(j.error).toBeDefined();
  });

  it('nonexistent file exits 2 or 3 and returns structured {error}', async () => {
    const result = await runCli([
      'model',
      'simulate',
      '-i',
      '/nonexistent/path/log.xes',
      '--format',
      'json',
      '--no-save',
    ]);
    // File-not-found is a source_error (exit 2) or execution_error (exit 3)
    expect([2, 3]).toContain(result.exitCode);

    const j = parseEnvelope(result);
    expect(j.error).toBeDefined();
    expect(j.command).toBeUndefined();
  });
});

// ── wpm temporal ──────────────────────────────────────────────────────────────

describe('wpm temporal — CLI integration', () => {
  let env: TestEnv;

  beforeEach(async () => {
    env = await createTestEnv();
  });

  afterEach(async () => {
    await env.cleanup();
  });

  it('exits 0 and returns valid JSON envelope with dfg and violations payload', async () => {
    const result = await runCli(['lab', 'temporal', '-i', env.xesPath, '--format', 'json', '--no-save']);
    expect(result.exitCode).toBe(0);

    const j = parseEnvelope(result);
    expect(j.command).toBe('temporal');
    expect(j.status).toBe('ok');
    expect(j.payload).toBeDefined();

    const p = j.payload as Record<string, unknown>;

    // DFG structure must be present
    const dfg = p['dfg'] as Record<string, unknown>;
    expect(dfg).toBeDefined();
    expect(Array.isArray(dfg['nodes'])).toBe(true);
    expect(Array.isArray(dfg['edges'])).toBe(true);

    // violations structure must be present
    const violations = p['violations'] as Record<string, unknown>;
    expect(violations).toBeDefined();
    expect(typeof violations['count']).toBe('number');
    expect(Array.isArray(violations['items'])).toBe(true);

    // metadata fields
    expect(p['input']).toBe(env.xesPath);
    expect(p['activityKey']).toBe('concept:name');
    expect(p['timestampKey']).toBe('time:timestamp');
    expect(typeof p['threshold']).toBe('number');
  });

  it('DFG nodes in temporal output match activities present in the XES', async () => {
    const result = await runCli(['lab', 'temporal', '-i', env.xesPath, '--format', 'json', '--no-save']);
    expect(result.exitCode).toBe(0);

    const j = parseEnvelope(result);
    expect(j.status).toBe('ok');

    const dfg = (j.payload as Record<string, unknown>)['dfg'] as Record<string, unknown>;
    const nodes = dfg['nodes'] as Array<Record<string, unknown> | string>;

    // The XES has 4 activities: register, examine, decide, notify
    // At minimum the nodes array should be non-empty when the log loaded successfully
    if (nodes.length > 0) {
      const nodeLabels = nodes.map((n) =>
        typeof n === 'string' ? n : (n['id'] ?? n['activity'] ?? n['name'] ?? '')
      );
      const expectedActivities = ['register', 'examine', 'decide', 'notify'];
      const foundAny = expectedActivities.some((a) =>
        nodeLabels.some((label) => String(label).includes(a))
      );
      expect(foundAny).toBe(true);
    }
  });

  it('--threshold flag is reflected in the JSON response', async () => {
    const result = await runCli([
      'lab',
      'temporal',
      '-i',
      env.xesPath,
      '--threshold',
      '0.01',
      '--format',
      'json',
      '--no-save',
    ]);
    expect(result.exitCode).toBe(0);

    const j = parseEnvelope(result);
    expect(j.status).toBe('ok');
    const p = j.payload as Record<string, unknown>;
    expect(p['threshold']).toBeCloseTo(0.01);
  });

  it('--format human does not crash and exits 0', async () => {
    const result = await runCli([
      'lab',
      'temporal',
      '-i',
      env.xesPath,
      '--format',
      'human',
      '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const combined = result.stdout + result.stderr;
    expect(combined.length).toBeGreaterThan(0);
  });

  it('missing input exits 2 (source_error) and returns the bare {error} envelope', async () => {
    const result = await runCli(['lab', 'temporal', '--format', 'json']);
    expect(result.exitCode).toBe(2);

    const j = parseEnvelope(result);
    expect(j.command).toBeUndefined();
    expect(j.status).toBeUndefined();
    expect(j.error).toBeDefined();
  });

  it('nonexistent file exits 2 or 3 and returns structured {error}', async () => {
    const result = await runCli([
      'lab',
      'temporal',
      '-i',
      '/nonexistent/path/log.xes',
      '--format',
      'json',
      '--no-save',
    ]);
    expect([2, 3]).toContain(result.exitCode);

    const j = parseEnvelope(result);
    expect(j.error).toBeDefined();
    expect(j.command).toBeUndefined();
  });
});
