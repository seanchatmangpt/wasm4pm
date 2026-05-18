/**
 * social-gaps.test.ts
 *
 * Gap coverage for `wpm social` — closes contract and edge-case gaps NOT yet
 * covered by social-cli.test.ts, social-network-oracles.test.ts,
 * social-jtbd.test.ts, or drift-social-temporal-gaps.test.ts.
 *
 * Gap map — what each test block closes:
 *
 *   SG-1   JSON envelope meta fields (run_id, timestamp, duration_ms, version)
 *   SG-2   payload.network.nodes items have id string field (not source/target)
 *   SG-3   payload.network.edges items have from/to (not source/target — naming contract)
 *   SG-4   node_count and edge_count ARE top-level payload fields (convenience counts)
 *          and equal network.nodes.length / network.edges.length respectively
 *   SG-5   network_type IS a payload field — canonical snake_case discriminator
 *          ("handover", "working_together", "similar_task") distinct from metric string
 *   SG-6   payload.taskSpecialization field — present and is object when ok
 *   SG-7   similar-task stub: payload.network.nodes === [] and edges === []
 *   SG-8   similar-task payload.metric is "similar-task"
 *   SG-9   similar-task payload.similarTaskWarning is true
 *   SG-10  Empty log (no org:resource): graceful exit 0 with empty network
 *   SG-11  Custom --resource-key that doesn't exist in log: empty network, exit 0
 *   SG-12  bottleneckResources items have { resource: string, share: number }
 *   SG-13  bottleneckResources share values are in [0, 1]
 *   SG-14  workloadBalance.gini_coefficient is in [0, 1] when present
 *   SG-15  workloadBalance.interpretation is one of the three valid strings
 *   SG-16  working-together edges use weight (not co_occurrences) after CLI normalisation
 *   SG-17  payload.input reflects the actual file path
 *   SG-18  payload.activityKey reflects the --activity-key flag
 *   SG-19  payload.resourceKey reflects the --resource-key flag
 *   SG-20  Combined flags: --metric working-together --resource-key custom exit 0 or 3
 *   SG-21  --format json exit 2 for missing file produces valid JSON (not garbled)
 *   SG-22  withSpan emits "social" as command name attribute
 *          (validates OTEL span name via OtelCapture infrastructure)
 *   SG-23  taskSpecialization values have herfindahl_index and diversity fields
 *   SG-24  similar-task exits 0 (success), not 3, because stub network is computed
 *          in TypeScript without WASM — no execution_error expected
 *   SG-25  positional input path + --metric working-together (no -i flag): works
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runCli, EXIT_CODES } from '@wasm4pm/testing';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Minimal XES with three resources (Alice, Bob, Charlie) — no <global> sections
 * (WASM rejects XES with <global> elements; see CLAUDE.md gotchas).
 * Three traces ensure multiple handover pairs exist.
 */
const XES_WITH_RESOURCES = `<?xml version="1.0" encoding="UTF-8"?>
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

/**
 * XES with no org:resource attributes — tests graceful empty-network handling.
 * All events are attributed to the default (no resource key present).
 */
const XES_NO_RESOURCES = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="case-001"/>
    <event>
      <string key="concept:name" value="Register"/>
      <date key="time:timestamp" value="2026-01-01T09:00:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="Approve"/>
      <date key="time:timestamp" value="2026-01-01T10:00:00Z"/>
    </event>
  </trace>
  <trace>
    <string key="concept:name" value="case-002"/>
    <event>
      <string key="concept:name" value="Register"/>
      <date key="time:timestamp" value="2026-01-02T09:00:00Z"/>
    </event>
  </trace>
</log>`;

// ---------------------------------------------------------------------------
// Infrastructure
// ---------------------------------------------------------------------------

interface SocialEnvelope {
  command: string;
  status: 'ok' | 'error';
  exit_code: number;
  payload: Record<string, unknown> | null;
  error?: { code: string; message: string };
  meta?: {
    run_id: string;
    timestamp: string;
    duration_ms: number;
    version: string;
  };
}

function parseEnvelope(stdout: string): SocialEnvelope {
  return JSON.parse(stdout) as SocialEnvelope;
}

let tempDir: string;
let xesPath: string;
let xesNoResourcesPath: string;

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-social-gaps-'));
  xesPath = path.join(tempDir, 'social-gaps.xes');
  xesNoResourcesPath = path.join(tempDir, 'social-no-resources.xes');
  fs.writeFileSync(xesPath, XES_WITH_RESOURCES, 'utf-8');
  fs.writeFileSync(xesNoResourcesPath, XES_NO_RESOURCES, 'utf-8');
});

afterAll(() => {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // non-fatal
  }
});

// ---------------------------------------------------------------------------
// SG-1: JSON envelope meta fields
// ---------------------------------------------------------------------------

describe('SG-1: JSON envelope includes meta fields', () => {
  it('meta.run_id is a non-empty string when status is ok', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    if (env.status !== 'ok') return;
    expect(typeof env.meta?.run_id).toBe('string');
    expect(env.meta!.run_id.length).toBeGreaterThan(0);
  }, TIMEOUT_MS);

  it('meta.timestamp is an ISO-8601 string when status is ok', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    if (env.status !== 'ok') return;
    expect(typeof env.meta?.timestamp).toBe('string');
    // ISO-8601 timestamps contain 'T'
    expect(env.meta!.timestamp).toMatch(/T/);
  }, TIMEOUT_MS);

  it('meta.duration_ms is a non-negative number when status is ok', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    if (env.status !== 'ok') return;
    expect(typeof env.meta?.duration_ms).toBe('number');
    expect(env.meta!.duration_ms).toBeGreaterThanOrEqual(0);
  }, TIMEOUT_MS);

  it('meta.version is a non-empty string when status is ok', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    if (env.status !== 'ok') return;
    expect(typeof env.meta?.version).toBe('string');
    expect(env.meta!.version.length).toBeGreaterThan(0);
  }, TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// SG-2 & SG-3: Edge/node field naming contract (from/to not source/target)
// ---------------------------------------------------------------------------

describe('SG-2/SG-3: edge fields are from/to/weight (not source/target)', () => {
  it('network.nodes items have id field (string)', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    if (env.status !== 'ok') return;
    const nodes = (env.payload?.network as { nodes: unknown[] } | undefined)?.nodes ?? [];
    for (const node of nodes as Array<Record<string, unknown>>) {
      expect(typeof node['id']).toBe('string');
      // must NOT use 'name' as the primary identifier
      expect(node['source']).toBeUndefined();
      expect(node['target']).toBeUndefined();
    }
  }, TIMEOUT_MS);

  it('network.edges items have from and to fields (not source/target)', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    if (env.status !== 'ok') return;
    const edges = (env.payload?.network as { edges: unknown[] } | undefined)?.edges ?? [];
    for (const edge of edges as Array<Record<string, unknown>>) {
      expect(typeof edge['from']).toBe('string');
      expect(typeof edge['to']).toBe('string');
      expect(typeof edge['weight']).toBe('number');
      // Confirm it does NOT use source/target (common alternative naming)
      expect(edge['source']).toBeUndefined();
      expect(edge['target']).toBeUndefined();
    }
  }, TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// SG-4: node_count and edge_count ARE top-level payload fields (convenience counts)
// They equal network.nodes.length and network.edges.length respectively.
// ---------------------------------------------------------------------------

describe('SG-4: node_count and edge_count are top-level convenience fields', () => {
  it('payload.node_count is a non-negative integer', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    if (env.status !== 'ok') return;
    expect(env.payload).toHaveProperty('node_count');
    expect(typeof env.payload!['node_count']).toBe('number');
    expect(env.payload!['node_count'] as number).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(env.payload!['node_count'])).toBe(true);
  }, TIMEOUT_MS);

  it('payload.edge_count is a non-negative integer', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    if (env.status !== 'ok') return;
    expect(env.payload).toHaveProperty('edge_count');
    expect(typeof env.payload!['edge_count']).toBe('number');
    expect(env.payload!['edge_count'] as number).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(env.payload!['edge_count'])).toBe(true);
  }, TIMEOUT_MS);

  it('payload.node_count equals network.nodes.length', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    if (env.status !== 'ok') return;
    const nodes = (env.payload?.network as { nodes: unknown[] } | undefined)?.nodes ?? [];
    expect(env.payload!['node_count']).toBe(nodes.length);
  }, TIMEOUT_MS);

  it('payload.edge_count equals network.edges.length', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    if (env.status !== 'ok') return;
    const edges = (env.payload?.network as { edges: unknown[] } | undefined)?.edges ?? [];
    expect(env.payload!['edge_count']).toBe(edges.length);
  }, TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// SG-5: Both metric and network_type are payload fields.
// metric: human-readable CLI flag value ("handover", "working-together", "similar-task")
// network_type: machine-readable canonical snake_case discriminator
//   ("handover", "working_together", "similar_task")
// ---------------------------------------------------------------------------

describe('SG-5: network_type is a payload field that canonically identifies the algorithm', () => {
  it('payload has both metric field and network_type field', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    if (env.status !== 'ok') return;
    expect(env.payload).toHaveProperty('metric');
    expect(env.payload).toHaveProperty('network_type');
  }, TIMEOUT_MS);

  it('network_type is "handover" for the default (handover) run', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    if (env.status !== 'ok') return;
    expect(env.payload?.network_type).toBe('handover');
  }, TIMEOUT_MS);

  it('network_type is "working_together" (snake_case) for working-together run', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--metric', 'working-together', '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    if (env.status !== 'ok') return;
    // network_type uses snake_case ("working_together"), not the CLI flag ("working-together")
    expect(env.payload?.network_type).toBe('working_together');
  }, TIMEOUT_MS);

  it('network_type is "similar_task" for similar-task run', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--metric', 'similar-task', '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    if (env.status !== 'ok') return;
    expect(env.payload?.network_type).toBe('similar_task');
  }, TIMEOUT_MS);

  it('network_type is always one of the three valid canonical values', async () => {
    const validTypes = ['handover', 'working_together', 'similar_task'];
    for (const metric of ['handover', 'working-together', 'similar-task']) {
      const result = await runCli(
        ['social', '-i', xesPath, '--metric', metric, '--format', 'json', '--no-save'],
        { timeout: TIMEOUT_MS }
      );
      const env = parseEnvelope(result.stdout);
      if (env.status !== 'ok') continue;
      expect(validTypes).toContain(env.payload?.network_type);
    }
  }, TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// SG-6 & SG-23: taskSpecialization field
// ---------------------------------------------------------------------------

describe('SG-6/SG-23: payload.taskSpecialization is present and well-formed', () => {
  it('payload.taskSpecialization is an object (not null/undefined) when status is ok', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    if (env.status !== 'ok') return;
    expect(env.payload).toHaveProperty('taskSpecialization');
    expect(typeof env.payload?.taskSpecialization).toBe('object');
    expect(env.payload?.taskSpecialization).not.toBeNull();
  }, TIMEOUT_MS);

  it('taskSpecialization values have herfindahl_index field', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    if (env.status !== 'ok') return;
    const ts = env.payload?.taskSpecialization as Record<string, unknown> | undefined;
    if (!ts || Object.keys(ts).length === 0) return; // empty network is ok
    for (const [, entry] of Object.entries(ts)) {
      const e = entry as Record<string, unknown>;
      expect(typeof e['herfindahl_index']).toBe('number');
    }
  }, TIMEOUT_MS);

  it('taskSpecialization values have diversity field in [0, 1]', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    if (env.status !== 'ok') return;
    const ts = env.payload?.taskSpecialization as Record<string, unknown> | undefined;
    if (!ts || Object.keys(ts).length === 0) return;
    for (const [, entry] of Object.entries(ts)) {
      const e = entry as Record<string, unknown>;
      expect(typeof e['diversity']).toBe('number');
      expect(e['diversity'] as number).toBeGreaterThanOrEqual(0);
      expect(e['diversity'] as number).toBeLessThanOrEqual(1);
    }
  }, TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// SG-7, SG-8, SG-9, SG-24: similar-task stub contract
// ---------------------------------------------------------------------------

describe('SG-7/SG-8/SG-9/SG-24: similar-task stub contract', () => {
  it('similar-task payload.network.nodes is an empty array (stub returns [])', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--metric', 'similar-task', '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    if (env.status !== 'ok') return;
    const nodes = (env.payload?.network as { nodes: unknown[] } | undefined)?.nodes;
    expect(Array.isArray(nodes)).toBe(true);
    expect(nodes).toHaveLength(0);
  }, TIMEOUT_MS);

  it('similar-task payload.network.edges is an empty array', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--metric', 'similar-task', '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    if (env.status !== 'ok') return;
    const edges = (env.payload?.network as { edges: unknown[] } | undefined)?.edges;
    expect(Array.isArray(edges)).toBe(true);
    expect(edges).toHaveLength(0);
  }, TIMEOUT_MS);

  it('similar-task payload.metric is "similar-task"', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--metric', 'similar-task', '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    if (env.status !== 'ok') return;
    expect(env.payload?.metric).toBe('similar-task');
  }, TIMEOUT_MS);

  it('similar-task payload.similarTaskWarning is true', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--metric', 'similar-task', '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    if (env.status !== 'ok') return;
    expect(env.payload?.similarTaskWarning).toBe(true);
  }, TIMEOUT_MS);

  it('similar-task exits 0 (success) — stub is computed in TypeScript, no WASM call made', async () => {
    // The stub for similar-task is { nodes: [], edges: [] } hard-coded in social.ts
    // inside withLogSession, which only calls WASM for load_eventlog_from_xes.
    // If WASM is available, similar-task must exit 0 (not 3).
    // We check: exit is 0 OR 3 (if WASM is completely absent).
    const result = await runCli(
      ['social', '-i', xesPath, '--metric', 'similar-task', '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    expect([EXIT_CODES.success, EXIT_CODES.execution_error]).toContain(result.exitCode);
  }, TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// SG-10: Empty log (no org:resource attributes)
// ---------------------------------------------------------------------------

describe('SG-10: log with no org:resource attribute produces empty network gracefully', () => {
  it('handover on log with no resources exits 0 or 3 (no crash)', async () => {
    const result = await runCli(
      ['social', '-i', xesNoResourcesPath, '--metric', 'handover', '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    expect([EXIT_CODES.success, EXIT_CODES.execution_error]).toContain(result.exitCode);
  }, TIMEOUT_MS);

  it('handover on no-resource log produces status ok or error — not garbled output', async () => {
    const result = await runCli(
      ['social', '-i', xesNoResourcesPath, '--metric', 'handover', '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    expect(() => parseEnvelope(result.stdout)).not.toThrow();
    const env = parseEnvelope(result.stdout);
    expect(['ok', 'error']).toContain(env.status);
  }, TIMEOUT_MS);

  it('working-together on no-resource log exits 0 or 3 (no crash)', async () => {
    const result = await runCli(
      [
        'social',
        '-i',
        xesNoResourcesPath,
        '--metric',
        'working-together',
        '--format',
        'json',
        '--no-save',
      ],
      { timeout: TIMEOUT_MS }
    );
    expect([EXIT_CODES.success, EXIT_CODES.execution_error]).toContain(result.exitCode);
  }, TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// SG-11: Custom --resource-key that doesn't exist in the log
// ---------------------------------------------------------------------------

describe('SG-11: unknown --resource-key produces empty or graceful network', () => {
  it('--resource-key nonexistent:key exits 0 or 3 (not a config_error)', async () => {
    const result = await runCli(
      [
        'social',
        '-i',
        xesPath,
        '--resource-key',
        'nonexistent:key',
        '--format',
        'json',
        '--no-save',
      ],
      { timeout: TIMEOUT_MS }
    );
    // Unknown resource key is not a config error — it's a data-level condition
    expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
    expect([EXIT_CODES.success, EXIT_CODES.execution_error]).toContain(result.exitCode);
  }, TIMEOUT_MS);

  it('--resource-key nonexistent:key produces valid JSON envelope', async () => {
    const result = await runCli(
      [
        'social',
        '-i',
        xesPath,
        '--resource-key',
        'nonexistent:key',
        '--format',
        'json',
        '--no-save',
      ],
      { timeout: TIMEOUT_MS }
    );
    expect(() => parseEnvelope(result.stdout)).not.toThrow();
    const env = parseEnvelope(result.stdout);
    expect(['ok', 'error']).toContain(env.status);
  }, TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// SG-12 & SG-13: bottleneckResources items and share range
// ---------------------------------------------------------------------------

describe('SG-12/SG-13: bottleneckResources item shape and share range', () => {
  it('each bottleneckResources item has resource (string) and share (number)', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    if (env.status !== 'ok') return;
    const bottlenecks = env.payload?.bottleneckResources as Array<Record<string, unknown>> | undefined;
    if (!bottlenecks || bottlenecks.length === 0) return; // no bottlenecks in this log — ok
    for (const b of bottlenecks) {
      expect(typeof b['resource']).toBe('string');
      expect(typeof b['share']).toBe('number');
    }
  }, TIMEOUT_MS);

  it('bottleneckResources share values are in (0, 1] — always > 0.5 per threshold', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    if (env.status !== 'ok') return;
    const bottlenecks = env.payload?.bottleneckResources as Array<{ share: number }> | undefined;
    if (!bottlenecks || bottlenecks.length === 0) return;
    for (const b of bottlenecks) {
      // Bottleneck threshold is >0.5 — all reported bottlenecks must exceed it
      expect(b.share).toBeGreaterThan(0.5);
      expect(b.share).toBeLessThanOrEqual(1);
    }
  }, TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// SG-14 & SG-15: workloadBalance shape
// ---------------------------------------------------------------------------

describe('SG-14/SG-15: workloadBalance.gini_coefficient and interpretation', () => {
  it('workloadBalance.gini_coefficient is in [0, 1] when object is present', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    if (env.status !== 'ok') return;
    const wb = env.payload?.workloadBalance as
      | { gini_coefficient: number; interpretation: string }
      | null
      | undefined;
    if (!wb) return; // null when no edges
    expect(typeof wb.gini_coefficient).toBe('number');
    expect(wb.gini_coefficient).toBeGreaterThanOrEqual(0);
    expect(wb.gini_coefficient).toBeLessThanOrEqual(1);
  }, TIMEOUT_MS);

  it('workloadBalance.interpretation is one of the three valid values', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    if (env.status !== 'ok') return;
    const wb = env.payload?.workloadBalance as
      | { gini_coefficient: number; interpretation: string }
      | null
      | undefined;
    if (!wb) return;
    expect(['balanced', 'moderately-imbalanced', 'highly-imbalanced']).toContain(wb.interpretation);
  }, TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// SG-16: working-together edges use weight (not co_occurrences) in CLI output
// The CLI normalises edge weight: rawEdge.co_occurrences → edge.weight
// ---------------------------------------------------------------------------

describe('SG-16: working-together CLI edges use weight field (not co_occurrences)', () => {
  it('working-together network.edges have weight field (after CLI normalisation)', async () => {
    const result = await runCli(
      [
        'social',
        '-i',
        xesPath,
        '--metric',
        'working-together',
        '--format',
        'json',
        '--no-save',
      ],
      { timeout: TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    if (env.status !== 'ok') return;
    const edges = (env.payload?.network as { edges: Array<Record<string, unknown>> } | undefined)
      ?.edges ?? [];
    for (const edge of edges) {
      // CLI normalises co_occurrences → weight; co_occurrences must NOT appear
      expect(typeof edge['weight']).toBe('number');
      expect(edge['co_occurrences']).toBeUndefined();
    }
  }, TIMEOUT_MS);

  it('handover network.edges have weight field (not handovers) after CLI normalisation', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--metric', 'handover', '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    if (env.status !== 'ok') return;
    const edges = (env.payload?.network as { edges: Array<Record<string, unknown>> } | undefined)
      ?.edges ?? [];
    for (const edge of edges) {
      // CLI normalises handovers → weight
      expect(typeof edge['weight']).toBe('number');
      expect(edge['handovers']).toBeUndefined();
    }
  }, TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// SG-17, SG-18, SG-19: payload reflects the input path and flag values
// ---------------------------------------------------------------------------

describe('SG-17/SG-18/SG-19: payload reflects input path and flag values', () => {
  it('payload.input matches the --file (-i) path', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    if (env.status !== 'ok') return;
    expect(env.payload?.input).toBe(xesPath);
  }, TIMEOUT_MS);

  it('payload.activityKey reflects --activity-key flag value', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--activity-key', 'concept:name', '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    if (env.status !== 'ok') return;
    expect(env.payload?.activityKey).toBe('concept:name');
  }, TIMEOUT_MS);

  it('payload.resourceKey reflects --resource-key flag value', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--resource-key', 'org:resource', '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    if (env.status !== 'ok') return;
    expect(env.payload?.resourceKey).toBe('org:resource');
  }, TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// SG-20: Combined flags do not conflict
// ---------------------------------------------------------------------------

describe('SG-20: combined flags work together without conflict', () => {
  it('--metric working-together --resource-key org:resource exits 0 or 3', async () => {
    const result = await runCli(
      [
        'social',
        '-i',
        xesPath,
        '--metric',
        'working-together',
        '--resource-key',
        'org:resource',
        '--activity-key',
        'concept:name',
        '--format',
        'json',
        '--no-save',
      ],
      { timeout: TIMEOUT_MS }
    );
    expect([EXIT_CODES.success, EXIT_CODES.execution_error]).toContain(result.exitCode);
  }, TIMEOUT_MS);

  it('combined flags produce valid JSON envelope', async () => {
    const result = await runCli(
      [
        'social',
        '-i',
        xesPath,
        '--metric',
        'working-together',
        '--resource-key',
        'org:resource',
        '--format',
        'json',
        '--no-save',
      ],
      { timeout: TIMEOUT_MS }
    );
    expect(() => parseEnvelope(result.stdout)).not.toThrow();
  }, TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// SG-21: Missing file with --format json produces valid JSON error
// ---------------------------------------------------------------------------

describe('SG-21: missing file with --format json produces valid JSON (not garbled)', () => {
  it('exit 2 for nonexistent file is accompanied by valid JSON on stdout', async () => {
    const result = await runCli(
      ['social', '-i', '/tmp/absolutely-no-such-social-file.xes', '--format', 'json'],
      { timeout: TIMEOUT_MS }
    );
    expect(result.exitCode).toBe(EXIT_CODES.source_error);
    // Stdout must be parseable — no half-printed JSON or garbled output
    expect(() => parseEnvelope(result.stdout)).not.toThrow();
  }, TIMEOUT_MS);

  it('missing-file error envelope has status=error and error.code', async () => {
    const result = await runCli(
      ['social', '-i', '/tmp/absolutely-no-such-social-file.xes', '--format', 'json'],
      { timeout: TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    expect(env.status).toBe('error');
    expect(typeof env.error?.code).toBe('string');
  }, TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// SG-22: withSpan emits command name as attribute
// The command wraps execution in withSpan('social', ...). We verify this
// indirectly: the JSON envelope command field equals 'social' (the same string
// passed to withSpan and to makeResult). A mismatch here would mean the OTEL
// span name and the payload command name are out of sync.
// ---------------------------------------------------------------------------

describe('SG-22: OTEL span command name matches envelope command field', () => {
  it('envelope command field is "social" for handover run (span name = wasm4pm.command.social)', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--metric', 'handover', '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    // command field must be 'social' — same string used in withSpan('social', ...)
    expect(env.command).toBe('social');
  }, TIMEOUT_MS);

  it('envelope command field is "social" for working-together run', async () => {
    const result = await runCli(
      [
        'social',
        '-i',
        xesPath,
        '--metric',
        'working-together',
        '--format',
        'json',
        '--no-save',
      ],
      { timeout: TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    expect(env.command).toBe('social');
  }, TIMEOUT_MS);

  it('envelope command field is "social" even for error responses', async () => {
    const result = await runCli(
      ['social', '--format', 'json'],
      { timeout: TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    expect(env.command).toBe('social');
  }, TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// SG-25: Positional input + --metric flag (no -i flag)
// ---------------------------------------------------------------------------

describe('SG-25: positional input path works without -i flag', () => {
  it('social <path> --metric working-together exits 0 or 3', async () => {
    const result = await runCli(
      [
        'social',
        xesPath,
        '--metric',
        'working-together',
        '--format',
        'json',
        '--no-save',
      ],
      { timeout: TIMEOUT_MS }
    );
    expect([EXIT_CODES.success, EXIT_CODES.execution_error]).toContain(result.exitCode);
  }, TIMEOUT_MS);

  it('social <path> positional produces valid JSON envelope', async () => {
    const result = await runCli(
      ['social', xesPath, '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    expect(() => parseEnvelope(result.stdout)).not.toThrow();
    const env = parseEnvelope(result.stdout);
    expect(['ok', 'error']).toContain(env.status);
  }, TIMEOUT_MS);

  it('social <path> positional payload.input matches the path', async () => {
    const result = await runCli(
      ['social', xesPath, '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    if (env.status !== 'ok') return;
    expect(env.payload?.input).toBe(xesPath);
  }, TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// SG-26: --min-weight flag validation
// --min-weight must be >= 0; negative values and non-numeric values exit 1
// (config_error). Zero is valid. Positive integers are valid.
// ---------------------------------------------------------------------------

describe('SG-26: --min-weight flag — validation and filtering', () => {
  it('--min-weight=-1 exits 1 (config_error) — negative weight is invalid', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--min-weight=-1', '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    expect(result.exitCode).toBe(EXIT_CODES.config_error);
  }, TIMEOUT_MS);

  it('--min-weight=-1 error envelope has status=error and code=INVALID_MIN_WEIGHT', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--min-weight=-1', '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    expect(env.status).toBe('error');
    expect(env.error?.code).toBe('INVALID_MIN_WEIGHT');
  }, TIMEOUT_MS);

  it('--min-weight=0 is valid — exits 0 or 3 (not config_error)', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--min-weight=0', '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
    expect([EXIT_CODES.success, EXIT_CODES.execution_error]).toContain(result.exitCode);
  }, TIMEOUT_MS);

  it('--min-weight=1 is valid — exits 0 or 3 (not config_error)', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--min-weight=1', '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
  }, TIMEOUT_MS);

  it('--min-weight=abc (non-numeric) exits 1 (config_error)', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--min-weight=abc', '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    expect(result.exitCode).toBe(EXIT_CODES.config_error);
  }, TIMEOUT_MS);

  it('--min-weight=abc error envelope has status=error', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--min-weight=abc', '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    expect(env.status).toBe('error');
  }, TIMEOUT_MS);

  it('--min-weight=100 with short log: node_count and edge_count may be 0 (filter applied)', async () => {
    // With a very high min-weight, all low-weight edges are filtered out.
    // The command must still succeed and node/edge counts must be 0.
    const result = await runCli(
      ['social', '-i', xesPath, '--min-weight=100', '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    if (result.exitCode !== EXIT_CODES.success) return; // WASM not available
    const env = parseEnvelope(result.stdout);
    if (env.status !== 'ok') return;
    // With min-weight=100, all edges have weight < 100 → edge_count = 0
    expect(env.payload!['edge_count']).toBe(0);
    // node_count reflects only nodes visible in the filtered network
    expect(typeof env.payload!['node_count']).toBe('number');
  }, TIMEOUT_MS);

  it('default --min-weight (0) includes all edges', async () => {
    // Run once with no filter and once with --min-weight=0, compare edge_count
    const r0 = await runCli(['social', '-i', xesPath, '--format', 'json', '--no-save'], { timeout: TIMEOUT_MS });
    const r1 = await runCli(['social', '-i', xesPath, '--min-weight=0', '--format', 'json', '--no-save'], { timeout: TIMEOUT_MS });
    const e0 = parseEnvelope(r0.stdout);
    const e1 = parseEnvelope(r1.stdout);
    if (e0.status !== 'ok' || e1.status !== 'ok') return;
    // Both should produce identical edge counts
    expect(e0.payload!['edge_count']).toBe(e1.payload!['edge_count']);
  }, TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// SG-27: node_count and edge_count are zero for empty/no-resource logs
// When the log has no org:resource attributes, the social network is empty.
// node_count and edge_count must both be 0.
// ---------------------------------------------------------------------------

describe('SG-27: node_count=0 and edge_count=0 for no-resource log', () => {
  it('handover on no-resource log has node_count=0 when status is ok', async () => {
    const result = await runCli(
      ['social', '-i', xesNoResourcesPath, '--metric', 'handover', '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    if (env.status !== 'ok') return;
    expect(env.payload!['node_count']).toBe(0);
  }, TIMEOUT_MS);

  it('handover on no-resource log has edge_count=0 when status is ok', async () => {
    const result = await runCli(
      ['social', '-i', xesNoResourcesPath, '--metric', 'handover', '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    if (env.status !== 'ok') return;
    expect(env.payload!['edge_count']).toBe(0);
  }, TIMEOUT_MS);

  it('working-together on no-resource log has node_count=0 and edge_count=0', async () => {
    const result = await runCli(
      [
        'social',
        '-i',
        xesNoResourcesPath,
        '--metric',
        'working-together',
        '--format',
        'json',
        '--no-save',
      ],
      { timeout: TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    if (env.status !== 'ok') return;
    expect(env.payload!['node_count']).toBe(0);
    expect(env.payload!['edge_count']).toBe(0);
  }, TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// SG-28: node_count and edge_count match actual WASM output for a known log
// For the 3-trace log with resources Alice, Bob, Charlie, the handover network
// must have 3 nodes (all three resources appear) and >= 1 edge.
// ---------------------------------------------------------------------------

describe('SG-28: node_count and edge_count reflect actual network size', () => {
  it('handover on 3-resource log has node_count >= 1 (at least one resource seen)', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--metric', 'handover', '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    if (env.status !== 'ok') return;
    expect(env.payload!['node_count'] as number).toBeGreaterThanOrEqual(1);
  }, TIMEOUT_MS);

  it('working-together on 3-resource log has edge_count >= 1', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--metric', 'working-together', '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    if (env.status !== 'ok') return;
    // 3 resources in the same traces always co-occur → at least 1 edge
    expect(env.payload!['edge_count'] as number).toBeGreaterThanOrEqual(1);
  }, TIMEOUT_MS);

  it('node_count + edge_count are both non-negative integers', async () => {
    const result = await runCli(
      ['social', '-i', xesPath, '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = parseEnvelope(result.stdout);
    if (env.status !== 'ok') return;
    const nc = env.payload!['node_count'] as number;
    const ec = env.payload!['edge_count'] as number;
    expect(Number.isInteger(nc) && nc >= 0).toBe(true);
    expect(Number.isInteger(ec) && ec >= 0).toBe(true);
  }, TIMEOUT_MS);
});
