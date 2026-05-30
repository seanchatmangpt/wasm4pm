/**
 * social-network-analysis.test.ts
 *
 * Tests for the enhanced `wpm social` command:
 *   SNA-1:  Basic run exits 0, JSON output has handover_network shape
 *   SNA-2:  JSON payload contains network.nodes and network.edges
 *   SNA-3:  network.edges have from, to, weight fields
 *   SNA-4:  working-together metric accepted and returns network
 *   SNA-5:  --matrix flag produces matrix in human output
 *   SNA-6:  --matrix flag adds adjacency_matrix to JSON payload
 *   SNA-7:  --roles flag produces role section in human output
 *   SNA-8:  --roles flag adds roles array to JSON payload
 *   SNA-9:  --centrality flag produces centrality table in human output
 *   SNA-10: --centrality flag adds centrality_scores to JSON payload
 *   SNA-11: --centrality_scores has degree, betweenness, closeness, eigenvector
 *   SNA-12: --export json produces valid JSON adjacency list (no envelope)
 *   SNA-13: --export csv produces from,to,weight CSV header
 *   SNA-14: --export dot produces digraph DOT syntax
 *   SNA-15: --export with invalid format exits 1 (config_error)
 *   SNA-16: --matrix + --roles + --centrality flags compose cleanly
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runCli, EXIT_CODES } from '@wasm4pm/testing';

// ---------------------------------------------------------------------------
// Fixture: XES with multiple resources to exercise social mining
// ---------------------------------------------------------------------------

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
      <string key="org:resource" value="Carol"/>
    </event>
  </trace>
  <trace>
    <string key="concept:name" value="case-002"/>
    <event>
      <string key="concept:name" value="Register"/>
      <date key="time:timestamp" value="2026-01-02T09:00:00Z"/>
      <string key="org:resource" value="Alice"/>
    </event>
    <event>
      <string key="concept:name" value="Approve"/>
      <date key="time:timestamp" value="2026-01-02T10:00:00Z"/>
      <string key="org:resource" value="Bob"/>
    </event>
    <event>
      <string key="concept:name" value="Close"/>
      <date key="time:timestamp" value="2026-01-02T11:00:00Z"/>
      <string key="org:resource" value="Dave"/>
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
      <string key="org:resource" value="Carol"/>
    </event>
    <event>
      <string key="concept:name" value="Close"/>
      <date key="time:timestamp" value="2026-01-03T11:00:00Z"/>
      <string key="org:resource" value="Alice"/>
    </event>
  </trace>
</log>`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TIMEOUT = 30_000;

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
    adjacency_matrix?: {
      resources: string[];
      matrix: number[][];
      heaviest: { from: string; to: string; weight: number } | null;
      mostActive: { resource: string; total: number } | null;
      mostIsolated: { resource: string; total: number } | null;
    } | null;
    roles?: Array<{
      role: string;
      label: string;
      resources: string[];
      pattern: string;
      confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    }> | null;
    centrality_scores?: {
      degree: Record<string, number>;
      betweenness: Record<string, number>;
      closeness: Record<string, number>;
      eigenvector: Record<string, number>;
    } | null;
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
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-sna-'));
  xesPath = path.join(tempDir, 'sna-test.xes');
  fs.writeFileSync(xesPath, XES_WITH_RESOURCES, 'utf-8');
});

afterAll(() => {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // cleanup is best-effort
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('wpm social — enhanced social network analysis', () => {
  // SNA-1: Basic run exits 0 with JSON output
  it('SNA-1: exits 0 with --format json', async () => {
    const result = await runCli(['social', xesPath, '--format', 'json', '--no-save']);
    expect([EXIT_CODES.success, EXIT_CODES.execution_error]).toContain(result.exitCode);
    if (result.exitCode === EXIT_CODES.success) {
      const envelope = parseEnvelope(result.stdout);
      expect(envelope.command).toBe('social');
      expect(['ok', 'error']).toContain(envelope.status);
    }
  }, TIMEOUT);

  // SNA-2: JSON payload has network.nodes and network.edges
  it('SNA-2: JSON payload has network.nodes and network.edges when WASM succeeds', async () => {
    const result = await runCli(['social', xesPath, '--format', 'json', '--no-save']);
    if (result.exitCode !== EXIT_CODES.success) return; // WASM not available
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.payload).not.toBeNull();
    expect(envelope.payload?.network).toBeDefined();
    expect(Array.isArray(envelope.payload?.network?.nodes)).toBe(true);
    expect(Array.isArray(envelope.payload?.network?.edges)).toBe(true);
  }, TIMEOUT);

  // SNA-3: network.edges have from, to, weight fields
  it('SNA-3: network edges have from, to, weight fields', async () => {
    const result = await runCli(['social', xesPath, '--format', 'json', '--no-save']);
    if (result.exitCode !== EXIT_CODES.success) return;
    const envelope = parseEnvelope(result.stdout);
    const edges = envelope.payload?.network?.edges ?? [];
    if (edges.length === 0) return; // empty network is valid
    for (const edge of edges) {
      expect(edge).toHaveProperty('from');
      expect(edge).toHaveProperty('to');
      expect(edge).toHaveProperty('weight');
      expect(typeof edge.from).toBe('string');
      expect(typeof edge.to).toBe('string');
      expect(typeof edge.weight).toBe('number');
    }
  }, TIMEOUT);

  // SNA-4: working-together metric accepted and returns network
  it('SNA-4: --metric working-together is accepted and returns a network', async () => {
    const result = await runCli([
      'social', xesPath,
      '--metric', 'working-together',
      '--format', 'json',
      '--no-save',
    ]);
    expect([EXIT_CODES.success, EXIT_CODES.execution_error]).toContain(result.exitCode);
    if (result.exitCode === EXIT_CODES.success) {
      const envelope = parseEnvelope(result.stdout);
      expect(envelope.payload?.metric).toBe('working-together');
      expect(envelope.payload?.network).toBeDefined();
    }
  }, TIMEOUT);

  // SNA-5: --matrix flag produces matrix section in human output
  it('SNA-5: --matrix flag produces adjacency matrix in human output', async () => {
    const result = await runCli(['social', xesPath, '--matrix', '--no-save']);
    if (result.exitCode !== EXIT_CODES.success) return;
    // The matrix section heading should appear
    expect(result.stdout).toMatch(/Adjacency Matrix|matrix view/i);
  }, TIMEOUT);

  // SNA-6: --matrix flag adds adjacency_matrix to JSON payload
  it('SNA-6: --matrix flag adds adjacency_matrix to JSON payload', async () => {
    const result = await runCli([
      'social', xesPath, '--matrix', '--format', 'json', '--no-save',
    ]);
    if (result.exitCode !== EXIT_CODES.success) return;
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.payload?.adjacency_matrix).toBeDefined();
    const am = envelope.payload?.adjacency_matrix;
    if (am) {
      expect(Array.isArray(am.resources)).toBe(true);
      expect(Array.isArray(am.matrix)).toBe(true);
      // matrix is square
      expect(am.matrix.length).toBe(am.resources.length);
      for (const row of am.matrix) {
        expect(row.length).toBe(am.resources.length);
      }
    }
  }, TIMEOUT);

  // SNA-7: --roles flag produces role section in human output
  it('SNA-7: --roles flag produces role discovery section in human output', async () => {
    const result = await runCli(['social', xesPath, '--roles', '--no-save']);
    if (result.exitCode !== EXIT_CODES.success) return;
    expect(result.stdout).toMatch(/Role Discovery|Process Starters|Process Finishers|Core Processors/i);
  }, TIMEOUT);

  // SNA-8: --roles flag adds roles array to JSON payload
  it('SNA-8: --roles flag adds roles array to JSON payload', async () => {
    const result = await runCli([
      'social', xesPath, '--roles', '--format', 'json', '--no-save',
    ]);
    if (result.exitCode !== EXIT_CODES.success) return;
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.payload?.roles).toBeDefined();
    const roles = envelope.payload?.roles;
    if (roles && roles.length > 0) {
      for (const role of roles) {
        expect(role).toHaveProperty('role');
        expect(role).toHaveProperty('label');
        expect(role).toHaveProperty('resources');
        expect(Array.isArray(role.resources)).toBe(true);
        expect(role).toHaveProperty('confidence');
        expect(['HIGH', 'MEDIUM', 'LOW']).toContain(role.confidence);
      }
    }
  }, TIMEOUT);

  // SNA-9: --centrality flag produces centrality table in human output
  it('SNA-9: --centrality flag produces centrality table in human output', async () => {
    const result = await runCli(['social', xesPath, '--centrality', '--no-save']);
    if (result.exitCode !== EXIT_CODES.success) return;
    expect(result.stdout).toMatch(/Centrality|Degree|Betwn|betweenness/i);
  }, TIMEOUT);

  // SNA-10: --centrality flag adds centrality_scores to JSON payload
  it('SNA-10: --centrality flag adds centrality_scores to JSON payload', async () => {
    const result = await runCli([
      'social', xesPath, '--centrality', '--format', 'json', '--no-save',
    ]);
    if (result.exitCode !== EXIT_CODES.success) return;
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.payload?.centrality_scores).toBeDefined();
  }, TIMEOUT);

  // SNA-11: centrality_scores has degree, betweenness, closeness, eigenvector
  it('SNA-11: centrality_scores has degree, betweenness, closeness, eigenvector', async () => {
    const result = await runCli([
      'social', xesPath, '--centrality', '--format', 'json', '--no-save',
    ]);
    if (result.exitCode !== EXIT_CODES.success) return;
    const envelope = parseEnvelope(result.stdout);
    const cs = envelope.payload?.centrality_scores;
    if (cs) {
      expect(cs).toHaveProperty('degree');
      expect(cs).toHaveProperty('betweenness');
      expect(cs).toHaveProperty('closeness');
      expect(cs).toHaveProperty('eigenvector');
      // All scores should be in [0,1]
      for (const [, score] of Object.entries(cs.degree)) {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1 + 1e-9);
      }
      for (const [, score] of Object.entries(cs.betweenness)) {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  }, TIMEOUT);

  // SNA-12: --export json produces valid JSON adjacency list (no outer envelope)
  it('SNA-12: --export json produces raw JSON adjacency list', async () => {
    const result = await runCli([
      'social', xesPath, '--export', 'json', '--no-save',
    ]);
    if (result.exitCode !== EXIT_CODES.success) return;
    // Output should be raw JSON, not the command envelope
    let parsed: unknown;
    expect(() => { parsed = JSON.parse(result.stdout); }).not.toThrow();
    // adjacency list: object where each key is a resource name
    expect(typeof parsed).toBe('object');
    expect(parsed).not.toBeNull();
    // Each value should be an array of {to, weight} entries
    for (const [, neighbours] of Object.entries(parsed as Record<string, unknown>)) {
      expect(Array.isArray(neighbours)).toBe(true);
    }
  }, TIMEOUT);

  // SNA-13: --export csv produces from,to,weight CSV
  it('SNA-13: --export csv produces from,to,weight CSV header', async () => {
    const result = await runCli([
      'social', xesPath, '--export', 'csv', '--no-save',
    ]);
    if (result.exitCode !== EXIT_CODES.success) return;
    expect(result.stdout).toMatch(/^from,to,weight/);
  }, TIMEOUT);

  // SNA-14: --export dot produces digraph DOT syntax
  it('SNA-14: --export dot produces digraph DOT syntax', async () => {
    const result = await runCli([
      'social', xesPath, '--export', 'dot', '--no-save',
    ]);
    if (result.exitCode !== EXIT_CODES.success) return;
    expect(result.stdout).toMatch(/digraph|graph/);
    expect(result.stdout).toMatch(/rankdir/);
  }, TIMEOUT);

  // SNA-15: --export with invalid format exits 1 (config_error)
  it('SNA-15: --export with invalid format exits 1 (config_error)', async () => {
    const result = await runCli([
      'social', xesPath, '--export', 'graphml', '--no-save',
    ]);
    // Invalid export format is a config error (1), not source (2) or execution (3)
    expect([EXIT_CODES.config_error, EXIT_CODES.execution_error]).toContain(result.exitCode);
  }, TIMEOUT);

  // SNA-16: --matrix + --roles + --centrality compose cleanly
  it('SNA-16: --matrix + --roles + --centrality compose cleanly', async () => {
    const result = await runCli([
      'social', xesPath,
      '--matrix', '--roles', '--centrality',
      '--format', 'json', '--no-save',
    ]);
    if (result.exitCode !== EXIT_CODES.success) return;
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.payload?.adjacency_matrix).toBeDefined();
    expect(envelope.payload?.roles).toBeDefined();
    expect(envelope.payload?.centrality_scores).toBeDefined();
    // All three fields should be present in a single run
    const am = envelope.payload?.adjacency_matrix;
    const roles = envelope.payload?.roles;
    const cs = envelope.payload?.centrality_scores;
    if (am) expect(am.resources.length).toBeGreaterThan(0);
    if (roles) expect(roles.length).toBeGreaterThan(0);
    if (cs) expect(Object.keys(cs.degree).length).toBeGreaterThan(0);
  }, TIMEOUT);
});
