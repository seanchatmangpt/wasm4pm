/**
 * social-cli.test.ts
 *
 * End-to-end CLI tests for `wpm social` — social network mining command.
 *
 * The social command supports three metrics:
 *   handover         — directed handover-of-work network (default)
 *   working-together — undirected co-occurrence network
 *   similar-task     — (stub, returns empty graph in current build)
 *
 * Correctness properties under test:
 *
 *   SN-1: --help exits 0 and names the network/handover concept.
 *   SN-2: No-input error is structured JSON, exit 2 (source_error).
 *   SN-3: Nonexistent file exits 2 (source_error).
 *   SN-4: --metric handover is accepted.
 *   SN-5: --metric working-together is accepted.
 *   SN-6: Invalid --metric exits 1 (config_error) — bad flag value is a config error, not source error.
 *   SN-7: Valid input + --format json produces parseable JSON envelope.
 *   SN-8: JSON payload has network.nodes and network.edges arrays.
 *   SN-9: JSON payload has status field.
 *   SN-10: Valid input exits 0 (success) or 3 (execution_error if WASM unavailable).
 *   SN-11: Human output for valid input is non-empty.
 *   SN-12: --resource-key flag is accepted.
 *   SN-13: --activity-key flag is accepted.
 *   SN-14: JSON envelope command field is 'social'.
 *   SN-15: Network edges have from, to, weight fields (when WASM succeeds).
 *   SN-16: --no-save skips receipt emission.
 *   SN-17: --metric similar-task does not crash (returns stub empty network).
 *   SN-18: working-together metric in JSON payload.
 *   SN-19: JSON envelope status is 'ok' or 'error' — never missing.
 *   SN-20: Human output mentions "Social Network Mining" header.
 *   SN-21: --format json with valid file produces a payload object.
 *   SN-22: Default metric (no --metric flag) does not crash.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runCli, EXIT_CODES } from '@wasm4pm/testing';

// ---------------------------------------------------------------------------
// Fixture: minimal XES with org:resource attributes for social mining
// ---------------------------------------------------------------------------

const MINIMAL_XES_WITH_RESOURCES = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="case-001"/>
    <event>
      <string key="concept:name" value="Register"/>
      <date key="time:timestamp" value="2026-01-01T09:00:00Z"/>
      <string key="org:resource" value="Alice"/>
    </event>
    <event>
      <string key="concept:name" value="Approve"/>
      <date key="time:timestamp" value="2026-01-01T10:00:00Z"/>
      <string key="org:resource" value="Bob"/>
    </event>
    <event>
      <string key="concept:name" value="Close"/>
      <date key="time:timestamp" value="2026-01-01T11:00:00Z"/>
      <string key="org:resource" value="Alice"/>
    </event>
  </trace>
  <trace>
    <string key="concept:name" value="case-002"/>
    <event>
      <string key="concept:name" value="Register"/>
      <date key="time:timestamp" value="2026-01-02T09:00:00Z"/>
      <string key="org:resource" value="Charlie"/>
    </event>
    <event>
      <string key="concept:name" value="Approve"/>
      <date key="time:timestamp" value="2026-01-02T10:00:00Z"/>
      <string key="org:resource" value="Alice"/>
    </event>
    <event>
      <string key="concept:name" value="Close"/>
      <date key="time:timestamp" value="2026-01-02T11:00:00Z"/>
      <string key="org:resource" value="Bob"/>
    </event>
  </trace>
  <trace>
    <string key="concept:name" value="case-003"/>
    <event>
      <string key="concept:name" value="Register"/>
      <date key="time:timestamp" value="2026-01-03T09:00:00Z"/>
      <string key="org:resource" value="Bob"/>
    </event>
    <event>
      <string key="concept:name" value="Approve"/>
      <date key="time:timestamp" value="2026-01-03T10:00:00Z"/>
      <string key="org:resource" value="Charlie"/>
    </event>
    <event>
      <string key="concept:name" value="Close"/>
      <date key="time:timestamp" value="2026-01-03T11:00:00Z"/>
      <string key="org:resource" value="Alice"/>
    </event>
  </trace>
</log>`;

// ---------------------------------------------------------------------------
// Infrastructure
// ---------------------------------------------------------------------------

const SOCIAL_TEST_TIMEOUT_MS = 30_000;

interface SocialEnvelope {
  command: string;
  status: 'ok' | 'error';
  exit_code: number;
  payload: {
    metric?: string;
    network?: {
      nodes: Array<{ id: string; label?: string }>;
      edges: Array<{ from: string; to: string; weight: number }>;
    };
    [key: string]: unknown;
  } | null;
  error?: { code: string; message: string };
}

function parseEnvelope(stdout: string): SocialEnvelope {
  return JSON.parse(stdout) as SocialEnvelope;
}

let tempDir: string;
let xesPath: string;

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-social-'));
  xesPath = path.join(tempDir, 'social-test.xes');
  fs.writeFileSync(xesPath, MINIMAL_XES_WITH_RESOURCES, 'utf-8');
});

afterAll(() => {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // non-fatal
  }
});

// ---------------------------------------------------------------------------
// SN-1: --help
// ---------------------------------------------------------------------------

describe('SN-1: --help exits 0 and describes the command', () => {
  it('wpm social --help exits 0', async () => {
    const result = await runCli(['social', '--help'], { timeout: SOCIAL_TEST_TIMEOUT_MS });
    expect(result.exitCode).toBe(EXIT_CODES.success);
  }, SOCIAL_TEST_TIMEOUT_MS);

  it('--help output mentions handover or network concept', async () => {
    const result = await runCli(['social', '--help'], { timeout: SOCIAL_TEST_TIMEOUT_MS });
    const combined = result.stdout + result.stderr;
    expect(combined.toLowerCase()).toMatch(/handover|network|social/);
  }, SOCIAL_TEST_TIMEOUT_MS);

  it('--help output mentions metric flag', async () => {
    const result = await runCli(['social', '--help'], { timeout: SOCIAL_TEST_TIMEOUT_MS });
    const combined = result.stdout + result.stderr;
    expect(combined.toLowerCase()).toMatch(/metric|network/);
  }, SOCIAL_TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// SN-2: No-input exits 2 (source_error)
// ---------------------------------------------------------------------------

describe('SN-2: no input is a structured error with exit 2', () => {
  it('wpm social with no arguments exits non-zero', async () => {
    const result = await runCli(['social'], { timeout: SOCIAL_TEST_TIMEOUT_MS });
    expect(result.exitCode).not.toBe(EXIT_CODES.success);
  }, SOCIAL_TEST_TIMEOUT_MS);

  it('wpm social --format json with no input exits 2', async () => {
    const result = await runCli(['social', '--format', 'json'], {
      timeout: SOCIAL_TEST_TIMEOUT_MS,
    });
    expect(result.exitCode).toBe(EXIT_CODES.source_error);
  }, SOCIAL_TEST_TIMEOUT_MS);

  it('JSON error envelope has command=social when no input given', async () => {
    const result = await runCli(['social', '--format', 'json'], {
      timeout: SOCIAL_TEST_TIMEOUT_MS,
    });
    const env = parseEnvelope(result.stdout);
    expect(env.command).toBe('social');
    expect(env.status).toBe('error');
  }, SOCIAL_TEST_TIMEOUT_MS);

  it('JSON error envelope has error.code and error.message', async () => {
    const result = await runCli(['social', '--format', 'json'], {
      timeout: SOCIAL_TEST_TIMEOUT_MS,
    });
    const env = parseEnvelope(result.stdout);
    expect(env.error).toBeDefined();
    expect(typeof env.error!.code).toBe('string');
    expect(typeof env.error!.message).toBe('string');
  }, SOCIAL_TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// SN-3: Nonexistent file exits 2 (source_error)
// ---------------------------------------------------------------------------

describe('SN-3: nonexistent file exits 2', () => {
  it('-i nonexistent.xes exits 2 (source_error)', async () => {
    const result = await runCli(['social', '-i', '/tmp/does-not-exist-wpm.xes', '--format', 'json'], {
      timeout: SOCIAL_TEST_TIMEOUT_MS,
    });
    expect(result.exitCode).toBe(EXIT_CODES.source_error);
  }, SOCIAL_TEST_TIMEOUT_MS);

  it('nonexistent positional file exits 2', async () => {
    const result = await runCli(['social', '/tmp/no-such-file-xyz.xes', '--format', 'json'], {
      timeout: SOCIAL_TEST_TIMEOUT_MS,
    });
    expect(result.exitCode).toBe(EXIT_CODES.source_error);
  }, SOCIAL_TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// SN-4: --metric handover is accepted
// ---------------------------------------------------------------------------

describe('SN-4: --metric handover is accepted', () => {
  it('--metric handover does not exit 1 (config_error)', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--metric', 'handover', '--format', 'json', '--no-save'],
      { timeout: SOCIAL_TEST_TIMEOUT_MS }
    );
    expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
  }, SOCIAL_TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// SN-5: --metric working-together is accepted
// ---------------------------------------------------------------------------

describe('SN-5: --metric working-together is accepted', () => {
  it('--metric working-together does not exit 1 (config_error)', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--metric', 'working-together', '--format', 'json', '--no-save'],
      { timeout: SOCIAL_TEST_TIMEOUT_MS }
    );
    expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
  }, SOCIAL_TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// SN-6: Invalid --metric exits 1 (config_error)
// An unknown --metric value is a CLI argument error (config_error=1), not a
// source data error (source_error=2).  Source errors are reserved for bad input
// files; flag validation failures are always config errors.
// ---------------------------------------------------------------------------

describe('SN-6: invalid --metric exits 1 (config_error)', () => {
  it('--metric invalid-network exits 1 (config_error)', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--metric', 'invalid-network', '--format', 'json', '--no-save'],
      { timeout: SOCIAL_TEST_TIMEOUT_MS }
    );
    expect(result.exitCode).toBe(EXIT_CODES.config_error);
  }, SOCIAL_TEST_TIMEOUT_MS);

  it('invalid metric error envelope names the invalid value', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--metric', 'bogus-metric', '--format', 'json', '--no-save'],
      { timeout: SOCIAL_TEST_TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    expect(env.status).toBe('error');
    expect(env.error!.message.toLowerCase()).toMatch(/bogus-metric|invalid.*metric|metric.*invalid/i);
  }, SOCIAL_TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// SN-7: Valid input + --format json produces parseable JSON
// ---------------------------------------------------------------------------

describe('SN-7: valid input + --format json produces parseable JSON', () => {
  it('--format json stdout is valid JSON', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--format', 'json', '--no-save'],
      { timeout: SOCIAL_TEST_TIMEOUT_MS }
    );
    expect(() => parseEnvelope(result.stdout)).not.toThrow();
  }, SOCIAL_TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// SN-8: JSON payload has network.nodes and network.edges
// ---------------------------------------------------------------------------

describe('SN-8: JSON payload network structure', () => {
  it('payload.network has nodes array when command succeeds', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--format', 'json', '--no-save'],
      { timeout: SOCIAL_TEST_TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    if (env.status === 'error') {
      expect(env.error).toBeDefined();
      return;
    }
    expect(env.payload).not.toBeNull();
    expect(env.payload!.network).toBeDefined();
    expect(Array.isArray(env.payload!.network!.nodes)).toBe(true);
  }, SOCIAL_TEST_TIMEOUT_MS);

  it('payload.network has edges array when command succeeds', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--format', 'json', '--no-save'],
      { timeout: SOCIAL_TEST_TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    if (env.status === 'error') {
      expect(env.error).toBeDefined();
      return;
    }
    expect(env.payload!.network).toBeDefined();
    expect(Array.isArray(env.payload!.network!.edges)).toBe(true);
  }, SOCIAL_TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// SN-9: JSON payload has status field
// ---------------------------------------------------------------------------

describe('SN-9: JSON envelope has status field', () => {
  it('status is ok or error — never undefined', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--format', 'json', '--no-save'],
      { timeout: SOCIAL_TEST_TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    expect(['ok', 'error']).toContain(env.status);
  }, SOCIAL_TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// SN-10: Valid input exits 0 or 3 (WASM-dependent)
// ---------------------------------------------------------------------------

describe('SN-10: valid input exits 0 (success) or 3 (WASM unavailable)', () => {
  it('social with valid XES exits 0 or 3', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--no-save'],
      { timeout: SOCIAL_TEST_TIMEOUT_MS }
    );
    expect([EXIT_CODES.success, EXIT_CODES.execution_error]).toContain(result.exitCode);
  }, SOCIAL_TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// SN-11: Human output is non-empty for valid input
// ---------------------------------------------------------------------------

describe('SN-11: human output for valid input is non-empty', () => {
  it('--format human produces non-empty stdout or stderr', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--format', 'human', '--no-save'],
      { timeout: SOCIAL_TEST_TIMEOUT_MS }
    );
    const combined = result.stdout + result.stderr;
    expect(combined.trim()).not.toBe('');
  }, SOCIAL_TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// SN-12 & SN-13: --resource-key and --activity-key flags
// ---------------------------------------------------------------------------

describe('SN-12/SN-13: --resource-key and --activity-key are accepted', () => {
  it('--resource-key org:resource is accepted (no config_error)', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--resource-key', 'org:resource', '--format', 'json', '--no-save'],
      { timeout: SOCIAL_TEST_TIMEOUT_MS }
    );
    expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
  }, SOCIAL_TEST_TIMEOUT_MS);

  it('--activity-key concept:name is accepted (no config_error)', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--activity-key', 'concept:name', '--format', 'json', '--no-save'],
      { timeout: SOCIAL_TEST_TIMEOUT_MS }
    );
    expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
  }, SOCIAL_TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// SN-14: JSON envelope command field is 'social'
// ---------------------------------------------------------------------------

describe('SN-14: JSON envelope command field', () => {
  it('command field is social in success and error responses', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--format', 'json', '--no-save'],
      { timeout: SOCIAL_TEST_TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    expect(env.command).toBe('social');
  }, SOCIAL_TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// SN-15: Edges have from, to, weight when WASM succeeds
// ---------------------------------------------------------------------------

describe('SN-15: network edges have from, to, weight fields', () => {
  it('each edge in network.edges has from, to, and numeric weight', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--format', 'json', '--no-save'],
      { timeout: SOCIAL_TEST_TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    if (env.status === 'error') {
      expect(env.error).toBeDefined();
      return;
    }
    const edges = env.payload!.network!.edges;
    for (const edge of edges) {
      expect(typeof edge.from).toBe('string');
      expect(typeof edge.to).toBe('string');
      expect(typeof edge.weight).toBe('number');
      expect(edge.weight).toBeGreaterThanOrEqual(0);
    }
  }, SOCIAL_TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// SN-16: --no-save flag is accepted
// ---------------------------------------------------------------------------

describe('SN-16: --no-save flag is accepted', () => {
  it('--no-save does not cause a config_error', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--no-save', '--format', 'json'],
      { timeout: SOCIAL_TEST_TIMEOUT_MS }
    );
    expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
  }, SOCIAL_TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// SN-17: --metric similar-task is accepted (returns stub network)
// ---------------------------------------------------------------------------

describe('SN-17: --metric similar-task does not crash', () => {
  it('similar-task exits 0 or 3 (not a crash)', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--metric', 'similar-task', '--format', 'json', '--no-save'],
      { timeout: SOCIAL_TEST_TIMEOUT_MS }
    );
    expect([EXIT_CODES.success, EXIT_CODES.execution_error]).toContain(result.exitCode);
  }, SOCIAL_TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// SN-18: working-together metric reported in JSON payload
// ---------------------------------------------------------------------------

describe('SN-18: working-together metric reflected in JSON payload', () => {
  it('payload.metric equals working-together when that metric is requested', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--metric', 'working-together', '--format', 'json', '--no-save'],
      { timeout: SOCIAL_TEST_TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    if (env.status === 'error') {
      expect(env.error).toBeDefined();
      return;
    }
    expect(env.payload!.metric).toBe('working-together');
  }, SOCIAL_TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// SN-19: JSON envelope status is never missing
// ---------------------------------------------------------------------------

describe('SN-19: JSON envelope status is always present', () => {
  it('error envelope has status=error for missing file', async () => {
    const result = await runCli(
      ['social', '-i', '/no/such/file.xes', '--format', 'json'],
      { timeout: SOCIAL_TEST_TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    expect(env.status).toBe('error');
  }, SOCIAL_TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// SN-20: Human output contains "Social Network Mining" header
// ---------------------------------------------------------------------------

describe('SN-20: human output contains Social Network Mining header', () => {
  it('social command human output includes Social Network Mining', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--format', 'human', '--no-save'],
      { timeout: SOCIAL_TEST_TIMEOUT_MS }
    );
    if (result.exitCode === EXIT_CODES.success) {
      const combined = result.stdout + result.stderr;
      expect(combined).toMatch(/Social Network Mining/i);
    } else {
      // WASM not available — just verify non-zero exit
      expect(result.exitCode).not.toBe(EXIT_CODES.success);
    }
  }, SOCIAL_TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// SN-21: --format json with valid file produces payload object
// ---------------------------------------------------------------------------

describe('SN-21: --format json with valid file produces payload', () => {
  it('payload is an object (not null) when status is ok', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--format', 'json', '--no-save'],
      { timeout: SOCIAL_TEST_TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    if (env.status === 'ok') {
      expect(env.payload).not.toBeNull();
      expect(typeof env.payload).toBe('object');
    } else {
      expect(env.error).toBeDefined();
    }
  }, SOCIAL_TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// SN-22: Default metric (no --metric) does not crash
// ---------------------------------------------------------------------------

describe('SN-22: default metric (handover) is used when no --metric given', () => {
  it('social without --metric flag exits 0 or 3', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--format', 'json', '--no-save'],
      { timeout: SOCIAL_TEST_TIMEOUT_MS }
    );
    expect([EXIT_CODES.success, EXIT_CODES.execution_error]).toContain(result.exitCode);
  }, SOCIAL_TEST_TIMEOUT_MS);

  it('default metric in payload is handover', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--format', 'json', '--no-save'],
      { timeout: SOCIAL_TEST_TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    if (env.status === 'ok') {
      expect(env.payload!.metric).toBe('handover');
    } else {
      expect(env.error).toBeDefined();
    }
  }, SOCIAL_TEST_TIMEOUT_MS);
});
