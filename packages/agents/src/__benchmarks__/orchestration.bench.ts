// agent registry and audit store are called on every cognition run cycle

import { bench, describe } from 'vitest';
import { AgentRegistry } from '../registry.js';
import { AuditStore } from '../audit.js';
import type { AuditEntry } from '../types.js';

const FAST = { time: 100, iterations: 50 };

// ---------------------------------------------------------------------------
// Fake AuditEntry factory — no file I/O, no real BLAKE3
// ---------------------------------------------------------------------------
function makeFakeEntry(agentName: string, i: number): AuditEntry {
  return {
    id: `bench-${i}`,
    timestamp: new Date(Date.now() - i * 1000).toISOString(),
    agent_name: agentName,
    artifact_id: `artifact-${i}`,
    correction_type: 'code_refactoring',
    correction_success: true,
    correction_summary: `bench correction ${i}`,
    violation: {
      type: 'mock_detected',
      severity: 'high',
      description: `bench violation ${i}`,
      evidence: [],
    },
    before_snapshot: null,
    after_snapshot: null,
    run_id: `run-${i}`,
  } as unknown as AuditEntry;
}

// ---------------------------------------------------------------------------
// AgentRegistry benchmarks
// ---------------------------------------------------------------------------

describe('AgentRegistry construction', () => {
  bench('new AgentRegistry() — no file I/O', () => {
    new AgentRegistry();
  }, FAST);
});

describe('AgentRegistry.getAll()', () => {
  const registry = new AgentRegistry();
  bench('listAgents() — returns all built-in agents', () => {
    registry.listAgents();
  }, FAST);
});

describe('AgentRegistry.getEnabled()', () => {
  const registry = new AgentRegistry();
  bench('getContinuousAgents() — filtered list of active continuous agents', () => {
    registry.getContinuousAgents();
  }, FAST);
});

describe('AgentRegistry.get(name)', () => {
  const registry = new AgentRegistry();
  bench('getAgent("mock-interceptor") — single lookup by name', () => {
    registry.getAgent('mock-interceptor');
  }, FAST);
});

// ---------------------------------------------------------------------------
// AuditStore benchmarks
// ---------------------------------------------------------------------------

describe('AuditStore construction', () => {
  bench('new AuditStore("/tmp/bench-audit-nonexistent.jsonl") — no file present', () => {
    new AuditStore('/tmp/bench-audit-nonexistent.jsonl');
  }, FAST);
});

describe('AuditStore.query({})', () => {
  const store = new AuditStore('/tmp/bench-audit-nonexistent.jsonl');
  bench('query({}) — empty store, empty filter', () => {
    store.query({});
  }, FAST);
});

describe('AuditStore.query with a filter', () => {
  const store = new AuditStore('/tmp/bench-audit-nonexistent.jsonl');

  // Populate with 100 fake entries (50 mock-interceptor, 50 other)
  for (let i = 0; i < 50; i++) {
    store.log(makeFakeEntry('mock-interceptor', i));
  }
  for (let i = 50; i < 100; i++) {
    store.log(makeFakeEntry('theater-detector', i));
  }

  bench('query({ agent: "mock-interceptor" }) — 100 entries, half match', () => {
    store.query({ agent: 'mock-interceptor' });
  });
});
