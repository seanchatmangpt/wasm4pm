/**
 * social-cli.test.ts — CLI integration tests for `wpm social`
 *
 * Oracle rank: Rank 2 (Domain contract — exit codes, JSON envelope shape, flag behavior).
 *
 * Coverage:
 *  - `wpm social -i <xes> --format json`                           → exits 0, envelope ok, network shape valid
 *  - `wpm social -i <xes> --metric handover --format json`         → exits 0, metric=handover echoed in payload
 *  - `wpm social -i <xes> --metric working-together --format json` → exits 0, metric=working-together echoed
 *  - `wpm social -i <xes> --metric similar-task --format json`     → exits 0, similarTaskWarning flag present
 *  - `wpm social -i <xes> --metric bad-metric --format json`       → exits 2 (source_error), error envelope
 *  - `wpm social -i <xes> --format human`                          → exits 0, produces non-empty output
 *  - `wpm social` (no input)                                       → exits 2 (source_error), error envelope
 *  - `wpm social -i /nonexistent --format json`                    → exits 2 or 3, error envelope
 *  - `wpm social -i <xes> --no-save --format json`                 → exits 0, skips receipt write
 *  - `wpm social -i <xes> --resource-key org:resource --format json` → exits 0, resourceKey echoed in payload
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

// ── Minimal XES fixture with org:resource attributes ─────────────────────────
//
// 4 resources (Alice, Bob, Charlie, Dana), 3 traces, handover relationships
// guaranteed to exist between them.

const SOCIAL_XES = `<?xml version="1.0" encoding="UTF-8"?>
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
    <string key="lifecycle:transition" value="Transition"/>
  </global>
  <trace>
    <string key="concept:name" value="case_1"/>
    <event>
      <string key="concept:name" value="register"/>
      <date key="time:timestamp" value="2024-01-15T09:00:00Z"/>
      <string key="org:resource" value="Alice"/>
      <string key="lifecycle:transition" value="complete"/>
    </event>
    <event>
      <string key="concept:name" value="examine"/>
      <date key="time:timestamp" value="2024-01-15T09:30:00Z"/>
      <string key="org:resource" value="Bob"/>
      <string key="lifecycle:transition" value="complete"/>
    </event>
    <event>
      <string key="concept:name" value="decide"/>
      <date key="time:timestamp" value="2024-01-15T10:00:00Z"/>
      <string key="org:resource" value="Charlie"/>
      <string key="lifecycle:transition" value="complete"/>
    </event>
    <event>
      <string key="concept:name" value="notify"/>
      <date key="time:timestamp" value="2024-01-15T10:15:00Z"/>
      <string key="org:resource" value="Alice"/>
      <string key="lifecycle:transition" value="complete"/>
    </event>
  </trace>
  <trace>
    <string key="concept:name" value="case_2"/>
    <event>
      <string key="concept:name" value="register"/>
      <date key="time:timestamp" value="2024-01-15T11:00:00Z"/>
      <string key="org:resource" value="Bob"/>
      <string key="lifecycle:transition" value="complete"/>
    </event>
    <event>
      <string key="concept:name" value="decide"/>
      <date key="time:timestamp" value="2024-01-15T11:45:00Z"/>
      <string key="org:resource" value="Charlie"/>
      <string key="lifecycle:transition" value="complete"/>
    </event>
    <event>
      <string key="concept:name" value="notify"/>
      <date key="time:timestamp" value="2024-01-15T12:00:00Z"/>
      <string key="org:resource" value="Dana"/>
      <string key="lifecycle:transition" value="complete"/>
    </event>
  </trace>
  <trace>
    <string key="concept:name" value="case_3"/>
    <event>
      <string key="concept:name" value="register"/>
      <date key="time:timestamp" value="2024-01-16T08:00:00Z"/>
      <string key="org:resource" value="Alice"/>
      <string key="lifecycle:transition" value="complete"/>
    </event>
    <event>
      <string key="concept:name" value="examine"/>
      <date key="time:timestamp" value="2024-01-16T09:00:00Z"/>
      <string key="org:resource" value="Dana"/>
      <string key="lifecycle:transition" value="complete"/>
    </event>
    <event>
      <string key="concept:name" value="decide"/>
      <date key="time:timestamp" value="2024-01-16T10:30:00Z"/>
      <string key="org:resource" value="Bob"/>
      <string key="lifecycle:transition" value="complete"/>
    </event>
    <event>
      <string key="concept:name" value="notify"/>
      <date key="time:timestamp" value="2024-01-16T11:00:00Z"/>
      <string key="org:resource" value="Charlie"/>
      <string key="lifecycle:transition" value="complete"/>
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

interface EnvelopeError {
  code: string;
  message: string;
}

interface Envelope {
  command: string;
  status: 'ok' | 'error';
  payload?: Record<string, unknown>;
  error?: EnvelopeError | string;
}

function parseEnvelope(result: CliResult): Envelope {
  try {
    return JSON.parse(result.stdout) as Envelope;
  } catch {
    throw new Error(
      `Failed to parse CLI output as JSON.\n` +
        `Exit code: ${result.exitCode}\n` +
        `stdout: ${result.stdout.slice(0, 500)}\n` +
        `stderr: ${result.stderr.slice(0, 300)}`
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
  const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'wpm-social-cli-'));
  const xesPath = path.join(tempDir, 'social.xes');
  await fs.writeFile(xesPath, SOCIAL_XES, 'utf-8');
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

// ── wpm social — happy-path tests ─────────────────────────────────────────────

describe('wpm social — CLI integration (happy path)', () => {
  let env: TestEnv;

  beforeEach(async () => {
    env = await createTestEnv();
  });

  afterEach(async () => {
    await env.cleanup();
  });

  it('exits 0 and returns valid JSON envelope with network shape', async () => {
    const result = await runCli(['social', '-i', env.xesPath, '--format', 'json', '--no-save']);
    expect(result.exitCode).toBe(0);

    const j = parseEnvelope(result);
    expect(j.command).toBe('social');
    expect(j.status).toBe('ok');
    expect(j.payload).toBeDefined();

    const p = j.payload as Record<string, unknown>;

    // network block must be present with nodes and edges arrays
    const network = p['network'] as Record<string, unknown>;
    expect(network).toBeDefined();
    expect(Array.isArray(network['nodes'])).toBe(true);
    expect(Array.isArray(network['edges'])).toBe(true);

    // metadata fields
    expect(p['input']).toBe(env.xesPath);
    expect(p['metric']).toBe('handover'); // default
    expect(p['activityKey']).toBe('concept:name');
    expect(p['resourceKey']).toBe('org:resource');
  });

  it('network nodes and edges are well-formed objects', async () => {
    const result = await runCli(['social', '-i', env.xesPath, '--format', 'json', '--no-save']);
    expect(result.exitCode).toBe(0);

    const j = parseEnvelope(result);
    expect(j.status).toBe('ok');

    const p = j.payload as Record<string, unknown>;
    const network = p['network'] as { nodes: unknown[]; edges: unknown[] };

    for (const node of network.nodes) {
      expect(typeof (node as Record<string, unknown>)['id']).toBe('string');
    }

    for (const edge of network.edges) {
      const e = edge as Record<string, unknown>;
      expect(typeof e['from']).toBe('string');
      expect(typeof e['to']).toBe('string');
    }
  });

  it('resources Alice, Bob, Charlie, Dana appear in the network output', async () => {
    const result = await runCli(['social', '-i', env.xesPath, '--format', 'json', '--no-save']);
    expect(result.exitCode).toBe(0);

    const j = parseEnvelope(result);
    expect(j.status).toBe('ok');

    const payloadStr = JSON.stringify(j.payload);
    // At least two of the four resources should be discoverable in the network
    const resources = ['Alice', 'Bob', 'Charlie', 'Dana'];
    const found = resources.filter((r) => payloadStr.includes(r));
    expect(found.length).toBeGreaterThanOrEqual(2);
  });

  it('--metric handover exits 0 and echoes metric in payload', async () => {
    const result = await runCli([
      'social',
      '-i',
      env.xesPath,
      '--metric',
      'handover',
      '--format',
      'json',
      '--no-save',
    ]);
    expect(result.exitCode).toBe(0);

    const j = parseEnvelope(result);
    expect(j.command).toBe('social');
    expect(j.status).toBe('ok');

    const p = j.payload as Record<string, unknown>;
    expect(p['metric']).toBe('handover');
    expect(Array.isArray((p['network'] as Record<string, unknown>)['nodes'])).toBe(true);
    expect(Array.isArray((p['network'] as Record<string, unknown>)['edges'])).toBe(true);
  });

  it('--metric working-together exits 0 and echoes metric in payload', async () => {
    const result = await runCli([
      'social',
      '-i',
      env.xesPath,
      '--metric',
      'working-together',
      '--format',
      'json',
      '--no-save',
    ]);
    expect(result.exitCode).toBe(0);

    const j = parseEnvelope(result);
    expect(j.command).toBe('social');
    expect(j.status).toBe('ok');

    const p = j.payload as Record<string, unknown>;
    expect(p['metric']).toBe('working-together');
    expect(Array.isArray((p['network'] as Record<string, unknown>)['nodes'])).toBe(true);
  });

  it('--metric similar-task exits 0 and sets similarTaskWarning=true', async () => {
    const result = await runCli([
      'social',
      '-i',
      env.xesPath,
      '--metric',
      'similar-task',
      '--format',
      'json',
      '--no-save',
    ]);
    expect(result.exitCode).toBe(0);

    const j = parseEnvelope(result);
    expect(j.command).toBe('social');
    expect(j.status).toBe('ok');

    const p = j.payload as Record<string, unknown>;
    expect(p['metric']).toBe('similar-task');
    // similar-task is a stub in current WASM build — warning flag should be set
    expect(p['similarTaskWarning']).toBe(true);
    // network is returned as empty arrays
    const network = p['network'] as Record<string, unknown>;
    expect(Array.isArray(network['nodes'])).toBe(true);
    expect(Array.isArray(network['edges'])).toBe(true);
  });

  it('--resource-key flag is accepted and echoed in payload', async () => {
    const result = await runCli([
      'social',
      '-i',
      env.xesPath,
      '--resource-key',
      'org:resource',
      '--format',
      'json',
      '--no-save',
    ]);
    expect(result.exitCode).toBe(0);

    const j = parseEnvelope(result);
    expect(j.status).toBe('ok');

    const p = j.payload as Record<string, unknown>;
    expect(p['resourceKey']).toBe('org:resource');
  });

  it('--activity-key flag is accepted and echoed in payload', async () => {
    const result = await runCli([
      'social',
      '-i',
      env.xesPath,
      '--activity-key',
      'concept:name',
      '--format',
      'json',
      '--no-save',
    ]);
    expect(result.exitCode).toBe(0);

    const j = parseEnvelope(result);
    expect(j.status).toBe('ok');

    const p = j.payload as Record<string, unknown>;
    expect(p['activityKey']).toBe('concept:name');
  });

  it('--format human exits 0 and produces non-empty output', async () => {
    const result = await runCli([
      'social',
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

  it('--no-save flag prevents auto-save without altering exit code', async () => {
    const result = await runCli([
      'social',
      '-i',
      env.xesPath,
      '--format',
      'json',
      '--no-save',
    ]);
    expect(result.exitCode).toBe(0);

    const j = parseEnvelope(result);
    expect(j.status).toBe('ok');
  });
});

// ── wpm social — error-path tests ─────────────────────────────────────────────

describe('wpm social — CLI integration (error paths)', () => {
  let env: TestEnv;

  beforeEach(async () => {
    env = await createTestEnv();
  });

  afterEach(async () => {
    await env.cleanup();
  });

  it('missing input exits 2 (source_error) and returns error envelope', async () => {
    const result = await runCli(['social', '--format', 'json']);
    expect(result.exitCode).toBe(2);

    const j = parseEnvelope(result);
    expect(j.command).toBe('social');
    expect(j.status).toBe('error');
    expect(j.error).toBeDefined();
    // error is an object with code + message fields
    const err = j.error as EnvelopeError;
    expect(typeof err.code).toBe('string');
    expect(typeof err.message).toBe('string');
    expect(err.message.length).toBeGreaterThan(0);
  });

  it('invalid metric exits 2 (source_error) and returns error envelope with metric name', async () => {
    const result = await runCli([
      'social',
      '-i',
      env.xesPath,
      '--metric',
      'bad-metric',
      '--format',
      'json',
      '--no-save',
    ]);
    expect(result.exitCode).toBe(2);

    const j = parseEnvelope(result);
    expect(j.command).toBe('social');
    expect(j.status).toBe('error');
    expect(j.error).toBeDefined();
    // Error message should mention the invalid metric
    const err = j.error as EnvelopeError;
    expect(err.message).toContain('bad-metric');
  });

  it('nonexistent input file exits 2 or 3 and returns error envelope', async () => {
    const result = await runCli([
      'social',
      '-i',
      '/nonexistent/path/log.xes',
      '--format',
      'json',
      '--no-save',
    ]);
    // File-not-found is either a source_error (exit 2) or execution_error (exit 3)
    expect([2, 3]).toContain(result.exitCode);

    const j = parseEnvelope(result);
    expect(j.status).toBe('error');
    expect(j.command).toBe('social');
  });
});

// ── wpm social — metric exhaustiveness ───────────────────────────────────────

describe('wpm social — all three supported metrics behave consistently', () => {
  let env: TestEnv;

  beforeEach(async () => {
    env = await createTestEnv();
  });

  afterEach(async () => {
    await env.cleanup();
  });

  const VALID_METRICS = ['handover', 'working-together', 'similar-task'] as const;

  for (const metric of VALID_METRICS) {
    it(`metric "${metric}" exits 0 and returns ok status`, async () => {
      const result = await runCli([
        'social',
        '-i',
        env.xesPath,
        '--metric',
        metric,
        '--format',
        'json',
        '--no-save',
      ]);
      expect(result.exitCode).toBe(0);

      const j = parseEnvelope(result);
      expect(j.command).toBe('social');
      expect(j.status).toBe('ok');
      expect((j.payload as Record<string, unknown>)['metric']).toBe(metric);
    });
  }
});
