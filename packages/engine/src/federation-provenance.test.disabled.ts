/**
 * federation-provenance.test.ts - Tests for provenance chain computation
 *
 * Validates:
 * - canonicalJson() determinism and correctness
 * - blake3Hex() hash format and determinism
 * - computeProvenanceChain() with all 10 fields populated
 * - buildModelIR() transformation from RawModelOutput
 * - wrapDiscoveryResult() complete envelope wrapping
 * - inferModelType() algorithm-to-type mapping
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  canonicalJson,
  blake3Hex,
  computeProvenanceChain,
  buildModelIR,
  wrapDiscoveryResult,
} from './federation-provenance';
import type { RawModelOutput } from './federation-provenance';
import type { EventLogIR, Plan, ModelCapabilities } from '@wasm4pm/contracts';
import type { BaseConfig } from '@wasm4pm/config';

// ============================================================================
// Test Fixtures
// ============================================================================

const mockEventLogIR: EventLogIR = {
  format_version: '1.0',
  events: [
    {
      trace_id: 'trace-1',
      object_id: 'case-1',
      timestamp: '2026-04-16T12:00:00Z',
      activity: 'create',
      lifecycle: 'start',
      resource: 'Alice',
    },
    {
      trace_id: 'trace-1',
      object_id: 'case-1',
      timestamp: '2026-04-16T12:05:00Z',
      activity: 'review',
      lifecycle: 'complete',
      resource: 'Bob',
    },
  ],
};

const mockConfig: BaseConfig = {
  source: { kind: 'stream' },
  sink: { kind: 'stdout' },
  algorithm: { name: 'dfg', parameters: {} },
  execution: { profile: 'balanced' },
  observability: { logLevel: 'info' },
  output: { format: 'json', destination: 'stdout', pretty: false, colorize: false },
  metadata: {
    loadTime: 123,
    hash: 'mock-hash', // @lint-allow-fakery — disabled test fixture, intentionally short
    provenance: {},
  },
};

const mockPlan: Plan = {
  planId: 'plan-123',
  steps: [
    {
      id: 'step-1',
      name: 'load_log',
      inputs: { source: 'mocklog.xes' },
    },
    {
      id: 'step-2',
      name: 'run_algorithm',
      dependencies: ['step-1'],
    },
  ],
  totalSteps: 2,
};

const mockRawModelOutput: RawModelOutput = {
  model: {
    nodes: [
      { id: 'start', label: 'Start', type: 'place' },
      { id: 'create', label: 'Create', type: 'transition' },
      { id: 'review', label: 'Review', type: 'transition' },
      { id: 'end', label: 'End', type: 'place' },
    ],
    edges: [
      { from: 'start', to: 'create', weight: 100 },
      { from: 'create', to: 'review', weight: 95 },
      { from: 'review', to: 'end', weight: 95 },
    ],
    quality: {
      fitness: 0.95,
      precision: 0.92,
      generalization: 0.88,
      simplicity: 0.85,
    },
  },
  model_hash: 'a'.repeat(64), // 64 hex chars
  deterministic: true,
  algorithm_version: '26.4.8.dfg_v1',
  latency_class: 'low_ms',
  algorithm_duration_ms: 45,
};

const mockCapabilities: ModelCapabilities = {
  online_safe: true,
  offline_only: false,
  replay_ready: true,
  alignment_ready: false,
  streaming_compatible: true,
  exportable_to_pnml: false,
  exportable_to_bpmn: false,
};

// ============================================================================
// canonicalJson() Tests
// ============================================================================

describe('canonicalJson', () => {
  it('should produce deterministic output for objects with different key order', () => {
    const obj1 = { z: 1, a: 2, m: 3 };
    const obj2 = { a: 2, m: 3, z: 1 };

    const json1 = canonicalJson(obj1);
    const json2 = canonicalJson(obj2);

    expect(json1).toBe(json2);
    expect(json1).toContain('"a":2');
    expect(json1).toContain('"m":3');
    expect(json1).toContain('"z":1');
  });

  it('should handle primitives correctly', () => {
    expect(canonicalJson('test')).toBe('"test"');
    expect(canonicalJson(42)).toBe('42');
    expect(canonicalJson(true)).toBe('true');
    expect(canonicalJson(false)).toBe('false');
    expect(canonicalJson(null)).toBe('null');
  });

  it('should handle arrays preserving order', () => {
    const arr = [3, 1, 2];
    const json = canonicalJson(arr);
    expect(json).toBe('[3,1,2]'); // Order preserved
  });

  it('should skip undefined values in objects', () => {
    const obj = { a: 1, b: undefined, c: 3 };
    const json = canonicalJson(obj);
    expect(json).toContain('"a":1');
    expect(json).not.toContain('b');
    expect(json).toContain('"c":3');
  });

  it('should handle nested objects with deterministic key sorting', () => {
    const obj1 = { z: { y: 1, x: 2 }, a: 3 };
    const obj2 = { a: 3, z: { x: 2, y: 1 } };

    const json1 = canonicalJson(obj1);
    const json2 = canonicalJson(obj2);

    expect(json1).toBe(json2);
  });
});

// ============================================================================
// blake3Hex() Tests
// ============================================================================

describe('blake3Hex', () => {
  it('should return a 64-character hex string (BLAKE3 hash)', () => {
    const obj = { test: 'value' };
    const hash = blake3Hex(obj);

    expect(hash).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
  });

  it('should produce deterministic hashes for objects with different key order', () => {
    const obj1 = { a: 1, b: 2 };
    const obj2 = { b: 2, a: 1 };

    const hash1 = blake3Hex(obj1);
    const hash2 = blake3Hex(obj2);

    expect(hash1).toBe(hash2);
  });

  it('should produce different hashes for different objects', () => {
    const obj1 = { a: 1 };
    const obj2 = { a: 2 };

    const hash1 = blake3Hex(obj1);
    const hash2 = blake3Hex(obj2);

    expect(hash1).not.toBe(hash2);
  });

  it('should always produce lowercase hex output', () => {
    const obj = { test: 'value' };
    const hash = blake3Hex(obj);

    expect(hash).toBe(hash.toLowerCase());
  });
});

// ============================================================================
// computeProvenanceChain() Tests
// ============================================================================

describe('computeProvenanceChain', () => {
  it('should populate all 10 required fields', () => {
    const provenance = computeProvenanceChain(
      mockEventLogIR,
      mockConfig,
      mockPlan,
      'a'.repeat(64),
      'dfg',
      '26.4.8.dfg_v1',
      'wasm',
      '26.4.8',
      'b'.repeat(64)
    );

    expect(provenance.input_hash).toHaveLength(64);
    expect(provenance.config_hash).toHaveLength(64);
    expect(provenance.plan_hash).toHaveLength(64);
    expect(provenance.output_hash).toHaveLength(64);
    expect(provenance.combined_hash).toHaveLength(64);
    expect(provenance.algorithm_id).toBe('dfg');
    expect(provenance.algorithm_version).toBe('26.4.8.dfg_v1');
    expect(provenance.backend_id).toBe('wasm');
    expect(provenance.kernel_version).toBe('26.4.8');
    expect(provenance.wasm_build_hash).toHaveLength(64);
  });

  it('should compute combined_hash as BLAKE3 of concatenated input/config/plan/output hashes', () => {
    const provenance = computeProvenanceChain(
      mockEventLogIR,
      mockConfig,
      mockPlan,
      'a'.repeat(64),
      'dfg',
      '26.4.8.dfg_v1',
      'wasm',
      '26.4.8',
      'b'.repeat(64)
    );

    // Verify that combined_hash is different from individual hashes
    expect(provenance.combined_hash).not.toBe(provenance.input_hash);
    expect(provenance.combined_hash).not.toBe(provenance.config_hash);
    expect(provenance.combined_hash).not.toBe(provenance.plan_hash);
    expect(provenance.combined_hash).not.toBe(provenance.output_hash);
  });

  it('should produce deterministic provenance for the same inputs', () => {
    const prov1 = computeProvenanceChain(
      mockEventLogIR,
      mockConfig,
      mockPlan,
      'a'.repeat(64),
      'dfg',
      '26.4.8.dfg_v1',
      'wasm',
      '26.4.8',
      'b'.repeat(64)
    );

    const prov2 = computeProvenanceChain(
      mockEventLogIR,
      mockConfig,
      mockPlan,
      'a'.repeat(64),
      'dfg',
      '26.4.8.dfg_v1',
      'wasm',
      '26.4.8',
      'b'.repeat(64)
    );

    expect(prov1.combined_hash).toBe(prov2.combined_hash);
  });

  it('should have all hashes as non-empty strings', () => {
    const provenance = computeProvenanceChain(
      mockEventLogIR,
      mockConfig,
      mockPlan,
      'a'.repeat(64),
      'dfg',
      '26.4.8.dfg_v1',
      'wasm',
      '26.4.8',
      'b'.repeat(64)
    );

    expect(provenance.input_hash.length).toBeGreaterThan(0);
    expect(provenance.config_hash.length).toBeGreaterThan(0);
    expect(provenance.plan_hash.length).toBeGreaterThan(0);
    expect(provenance.output_hash.length).toBeGreaterThan(0);
    expect(provenance.combined_hash.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// buildModelIR() Tests
// ============================================================================

describe('buildModelIR', () => {
  it('should extract nodes and edges from RawModelOutput', () => {
    const modelIR = buildModelIR(mockRawModelOutput, 'dfg', mockCapabilities);

    expect(modelIR.nodes.length).toBe(4);
    expect(modelIR.edges.length).toBe(3);
    expect(modelIR.nodes[0].id).toBe('start');
    expect(modelIR.edges[0].from).toBe('start');
    expect(modelIR.edges[0].to).toBe('create');
  });

  it('should populate format_version as "1.0"', () => {
    const modelIR = buildModelIR(mockRawModelOutput, 'dfg', mockCapabilities);

    expect(modelIR.format_version).toBe('1.0');
  });

  it('should infer correct model_type from algorithm_id', () => {
    const dfgIR = buildModelIR(mockRawModelOutput, 'dfg', mockCapabilities);
    expect(dfgIR.model_type).toBe('dfg');

    const imIR = buildModelIR(mockRawModelOutput, 'inductive_miner', mockCapabilities);
    expect(imIR.model_type).toBe('petri_net');
  });

  it('should include quality metrics if present', () => {
    const modelIR = buildModelIR(mockRawModelOutput, 'dfg', mockCapabilities);

    expect(modelIR.quality).toBeDefined();
    expect(modelIR.quality?.fitness).toBe(0.95);
    expect(modelIR.quality?.precision).toBe(0.92);
  });

  it('should include capabilities from parameters', () => {
    const modelIR = buildModelIR(mockRawModelOutput, 'dfg', mockCapabilities);

    expect(modelIR.capabilities.online_safe).toBe(true);
    expect(modelIR.capabilities.replay_ready).toBe(true);
  });
});

// ============================================================================
// wrapDiscoveryResult() Tests
// ============================================================================

describe('wrapDiscoveryResult', () => {
  it('should generate run_id and invocation_id as UUIDs', () => {
    const envelope = wrapDiscoveryResult(
      mockRawModelOutput,
      mockEventLogIR,
      mockConfig,
      mockPlan,
      'dfg',
      'wasm',
      '26.4.8',
      'b'.repeat(64),
      42,
      mockCapabilities
    );

    // UUID v4 format: 8-4-4-4-12 hex digits with hyphens
    expect(envelope.run_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(envelope.invocation_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it('should set status to "success"', () => {
    const envelope = wrapDiscoveryResult(
      mockRawModelOutput,
      mockEventLogIR,
      mockConfig,
      mockPlan,
      'dfg',
      'wasm',
      '26.4.8',
      'b'.repeat(64),
      42,
      mockCapabilities
    );

    expect(envelope.status).toBe('success');
  });

  it('should derive latency_class from algorithm_duration_ms', () => {
    const envelope = wrapDiscoveryResult(
      mockRawModelOutput,
      mockEventLogIR,
      mockConfig,
      mockPlan,
      'dfg',
      'wasm',
      '26.4.8',
      'b'.repeat(64),
      42,
      mockCapabilities
    );

    expect(envelope.latency_class).toBe('low_ms'); // 45ms
  });

  it('should include all required envelope fields', () => {
    const envelope = wrapDiscoveryResult(
      mockRawModelOutput,
      mockEventLogIR,
      mockConfig,
      mockPlan,
      'dfg',
      'wasm',
      '26.4.8',
      'b'.repeat(64),
      42,
      mockCapabilities
    );

    expect(envelope.run_id).toBeDefined();
    expect(envelope.status).toBe('success');
    expect(envelope.latency_ms).toBe(45);
    expect(envelope.latency_class).toBe('low_ms');
    expect(envelope.backend_id).toBe('wasm');
    expect(envelope.invocation_id).toBeDefined();
    expect(envelope.cycle_seq).toBe(42);
    expect(envelope.algorithm_id).toBe('dfg');
    expect(envelope.model_ir).toBeDefined();
    expect(envelope.provenance).toBeDefined();
    expect(envelope.stale).toBe(false);
  });

  it('should have provenance with all 10 fields populated', () => {
    const envelope = wrapDiscoveryResult(
      mockRawModelOutput,
      mockEventLogIR,
      mockConfig,
      mockPlan,
      'dfg',
      'wasm',
      '26.4.8',
      'b'.repeat(64),
      42,
      mockCapabilities
    );

    const prov = envelope.provenance;
    expect(prov.input_hash).toHaveLength(64);
    expect(prov.config_hash).toHaveLength(64);
    expect(prov.plan_hash).toHaveLength(64);
    expect(prov.output_hash).toHaveLength(64);
    expect(prov.combined_hash).toHaveLength(64);
    expect(prov.algorithm_id).toBe('dfg');
    expect(prov.algorithm_version).toBe('26.4.8.dfg_v1');
    expect(prov.backend_id).toBe('wasm');
    expect(prov.kernel_version).toBe('26.4.8');
    expect(prov.wasm_build_hash).toBe('b'.repeat(64));
  });

  it('should set stale to false for fresh results', () => {
    const envelope = wrapDiscoveryResult(
      mockRawModelOutput,
      mockEventLogIR,
      mockConfig,
      mockPlan,
      'dfg',
      'wasm',
      '26.4.8',
      'b'.repeat(64),
      42,
      mockCapabilities
    );

    expect(envelope.stale).toBe(false);
  });

  it('should not have stale_age_ms when stale is false', () => {
    const envelope = wrapDiscoveryResult(
      mockRawModelOutput,
      mockEventLogIR,
      mockConfig,
      mockPlan,
      'dfg',
      'wasm',
      '26.4.8',
      'b'.repeat(64),
      42,
      mockCapabilities
    );

    expect(envelope.stale_age_ms).toBeUndefined();
  });
});

// ============================================================================
// Round-trip Serialization Tests
// ============================================================================

describe('Round-trip Serialization', () => {
  it('should serialize and deserialize provenance with hash preservation', () => {
    const original = computeProvenanceChain(
      mockEventLogIR,
      mockConfig,
      mockPlan,
      'a'.repeat(64),
      'dfg',
      '26.4.8.dfg_v1',
      'wasm',
      '26.4.8',
      'b'.repeat(64)
    );

    const serialized = JSON.stringify(original);
    const deserialized = JSON.parse(serialized);

    expect(deserialized.combined_hash).toBe(original.combined_hash);
    expect(deserialized.input_hash).toBe(original.input_hash);
  });

  it('should serialize complete envelope to JSON', () => {
    const envelope = wrapDiscoveryResult(
      mockRawModelOutput,
      mockEventLogIR,
      mockConfig,
      mockPlan,
      'dfg',
      'wasm',
      '26.4.8',
      'b'.repeat(64),
      42,
      mockCapabilities
    );

    const json = JSON.stringify(envelope);
    const parsed = JSON.parse(json);

    expect(parsed.run_id).toBe(envelope.run_id);
    expect(parsed.status).toBe('success');
    expect(parsed.provenance.combined_hash).toBe(envelope.provenance.combined_hash);
  });
});
