/**
 * Receipt Chain Verification Tests
 *
 * Tests BLAKE3-based receipt chain verification following van der Aalst's
 * reproducibility requirements: every algorithm execution must produce
 * a cryptographically verifiable receipt.
 *
 * Receipt chain: config_hash → input_hash → plan_hash → output_hash
 * All hashes: BLAKE3 (64-char hex string)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';
import {
  Receipt,
  isReceipt,
} from '../receipt';
import { ReceiptBuilder } from '../receipt-builder';
import {
  hashConfig,
  hashData,
  hashJsonString,
  verifyHash,
  normalizeForHashing,
} from '../hash';

/**
 * Test environment helper
 */
interface TestEnv {
  tempDir: string;
  cleanup: () => Promise<void>;
}

async function createTestEnv(): Promise<TestEnv> {
  const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'receipt-test-'));
  return {
    tempDir,
    cleanup: async () => {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    },
  };
}

/**
 * Helper to compute manual BLAKE3 hash for comparison
 * (In real implementation, this would use the actual BLAKE3 library)
 */
function computeBlake3Hash(data: string): string {
  // Mock hash for testing - in production this uses actual BLAKE3
  // For tests, we use a deterministic hash function
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Convert to 64-char hex string (mock format)
  const hexHash = Math.abs(hash).toString(16).padStart(16, '0');
  return hexHash.repeat(4); // 64 characters
}

describe('Receipt Chain: Hash Computation', () => {
  describe('config_hash computation', () => {
    it('should produce deterministic hash for same config', () => {
      const config = {
        algorithm: 'alpha_plus_plus',
        parameters: {
          threshold: 0.8,
          dependencyThreshold: 0.6,
        },
      };

      const hash1 = hashConfig(config);
      const hash2 = hashConfig(config);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[0-9a-f]{64}$/i);
      expect(hash1.length).toBe(64);
    });

    it('should produce identical hash for equivalent configs with different key order', () => {
      const config1 = {
        algorithm: 'heuristic_miner',
        parameters: {
          dependencyThreshold: 0.5,
          threshold: 0.8,
        },
      };

      const config2 = {
        algorithm: 'heuristic_miner',
        parameters: {
          threshold: 0.8,
          dependencyThreshold: 0.5,
        },
      };

      const hash1 = hashConfig(config1);
      const hash2 = hashConfig(config2);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different configs', () => {
      const config1 = { algorithm: 'dfg', parameters: {} };
      const config2 = { algorithm: 'alpha', parameters: {} };

      const hash1 = hashConfig(config1);
      const hash2 = hashConfig(config2);

      expect(hash1).not.toBe(hash2);
    });

    it('should handle nested parameter objects', () => {
      const config = {
        algorithm: 'genetic_algorithm',
        parameters: {
          populationSize: 100,
          fitness: {
            type: 'edges',
            threshold: 0.9,
          },
          crossover: {
            rate: 0.7,
            method: 'uniform',
          },
        },
      };

      const hash = hashConfig(config);
      expect(hash).toMatch(/^[0-9a-f]{64}$/i);
    });
  });

  describe('input_hash computation', () => {
    it('should produce deterministic hash for same input data', () => {
      const inputData = {
        format: 'xes',
        traces: [
          {
            case_id: 'case_1',
            events: [
              { activity: 'A', timestamp: '2024-01-01T09:00:00Z' },
              { activity: 'B', timestamp: '2024-01-01T09:05:00Z' },
            ],
          },
        ],
      };

      const hash1 = hashData(inputData);
      const hash2 = hashData(inputData);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[0-9a-f]{64}$/i);
    });

    it('should handle XES file content hashing', () => {
      const xesContent = `<?xml version="1.0" encoding="UTF-8"?>
<log xmlns="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="case_1"/>
    <event><string key="concept:name" value="A"/></event>
  </trace>
</log>`;

      const hash = hashJsonString(xesContent);
      expect(hash).toMatch(/^[0-9a-f]{64}$/i);
    });

    it('should detect input tampering', () => {
      const input1 = { traces: [{ events: [{ id: 1 }] }] };
      const input2 = { traces: [{ events: [{ id: 2 }] }] };

      const hash1 = hashData(input1);
      const hash2 = hashData(input2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('plan_hash computation', () => {
    it('should hash execution plan deterministically', () => {
      const plan = {
        steps: [
          { type: 'source', action: 'load' },
          { type: 'algorithm', action: 'discover', name: 'dfg' },
          { type: 'sink', action: 'save' },
        ],
      };

      const hash1 = hashData(plan);
      const hash2 = hashData(plan);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hash for different plans', () => {
      const plan1 = {
        steps: [
          { type: 'source', action: 'load' },
          { type: 'algorithm', action: 'discover', name: 'dfg' },
        ],
      };

      const plan2 = {
        steps: [
          { type: 'source', action: 'load' },
          { type: 'algorithm', action: 'discover', name: 'alpha' },
        ],
      };

      const hash1 = hashData(plan1);
      const hash2 = hashData(plan2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('output_hash computation', () => {
    it('should hash algorithm output deterministically', () => {
      const output = {
        type: 'dfg',
        nodes: ['A', 'B', 'C'],
        edges: [
          { from: 'A', to: 'B', weight: 3 },
          { from: 'B', to: 'C', weight: 3 },
        ],
      };

      const hash1 = hashData(output);
      const hash2 = hashData(output);

      expect(hash1).toBe(hash2);
    });

    it('should handle Petri net outputs', () => {
      const petriNet = {
        type: 'petrinet',
        places: [
          { id: 'p1', label: 'start' },
          { id: 'p2', label: 'end' },
        ],
        transitions: [
          { id: 't1', label: 'A' },
        ],
        arcs: [
          { source: 'p1', target: 't1' },
          { source: 't1', target: 'p2' },
        ],
      };

      const hash = hashData(petriNet);
      expect(hash).toMatch(/^[0-9a-f]{64}$/i);
    });
  });
});

describe('Receipt Chain: Receipt Structure', () => {
  it('should contain all required hash fields', () => {
    const receipt = new ReceiptBuilder()
      .setRunId('550e8400-e29b-41d4-a716-446655440000')
      .setConfig({ algorithm: 'test' })
      .setInput({ data: 123 })
      .setPlan({ steps: [] })
      .setOutput({ result: 'success' })
      .setTiming('2024-04-10T10:00:00Z', '2024-04-10T10:01:00Z')
      .setStatus('success')
      .setSummary({
        traces_processed: 100,
        objects_processed: 500,
        variants_discovered: 10,
      })
      .setAlgorithm({ name: 'test-algo', version: '1.0' })
      .setModel({ nodes: 5, edges: 8 })
      .build();

    expect(receipt).toHaveProperty('config_hash');
    expect(receipt).toHaveProperty('input_hash');
    expect(receipt).toHaveProperty('plan_hash');
    expect(receipt).toHaveProperty('output_hash');

    // All hashes must be 64-character hex strings
    expect(receipt.config_hash).toMatch(/^[0-9a-f]{64}$/i);
    expect(receipt.input_hash).toMatch(/^[0-9a-f]{64}$/i);
    expect(receipt.plan_hash).toMatch(/^[0-9a-f]{64}$/i);
    expect(receipt.output_hash).toMatch(/^[0-9a-f]{64}$/i);
  });

  it('should pass type guard validation', () => {
    const receipt = new ReceiptBuilder()
      .setRunId('550e8400-e29b-41d4-a716-446655440000')
      .setConfig({})
      .setInput({})
      .setPlan({})
      .setOutput({})
      .setTiming('2024-04-10T10:00:00Z', '2024-04-10T10:01:00Z')
      .setStatus('success')
      .setSummary({})
      .setAlgorithm({ name: 'test', version: '1.0' })
      .setModel({})
      .build();

    expect(isReceipt(receipt)).toBe(true);
  });

  it('should include run_id for traceability', () => {
    const runId = '550e8400-e29b-41d4-a716-446655440000';
    const receipt = new ReceiptBuilder()
      .setRunId(runId)
      .setConfig({})
      .setInput({})
      .setPlan({})
      .setOutput({})
      .setTiming('2024-04-10T10:00:00Z', '2024-04-10T10:01:00Z')
      .setStatus('success')
      .setSummary({})
      .setAlgorithm({ name: 'test', version: '1.0' })
      .setModel({})
      .build();

    expect(receipt.run_id).toBe(runId);
    expect(receipt.run_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });
});

describe('Receipt Chain: Verification', () => {
  describe('verifyHash function', () => {
    it('should verify correct config hash', () => {
      const config = { algorithm: 'dfg', parameters: {} };
      const hash = hashConfig(config);

      expect(verifyHash(config, hash)).toBe(true);
    });

    it('should reject tampered config', () => {
      const config1 = { algorithm: 'dfg', parameters: {} };
      const config2 = { algorithm: 'alpha', parameters: {} };
      const hash = hashConfig(config1);

      expect(verifyHash(config2, hash)).toBe(false);
    });

    it('should verify correct input hash', () => {
      const input = { traces: [{ events: [] }] };
      const hash = hashData(input);

      expect(verifyHash(input, hash)).toBe(true);
    });

    it('should reject tampered input', () => {
      const input1 = { traces: [{ events: [{ id: 1 }] }] };
      const input2 = { traces: [{ events: [{ id: 2 }] }] };
      const hash = hashData(input1);

      expect(verifyHash(input2, hash)).toBe(false);
    });

    it('should be order-independent for object keys', () => {
      const obj1 = { x: 1, y: 2, z: 3 };
      const obj2 = { z: 3, y: 2, x: 1 };
      const hash = hashData(obj1);

      expect(verifyHash(obj2, hash)).toBe(true);
    });
  });
});

describe('Receipt Chain: Serialization Roundtrip', () => {
  it('should preserve all hashes through JSON serialization', () => {
    const original = new ReceiptBuilder()
      .setRunId('550e8400-e29b-41d4-a716-446655440000')
      .setConfig({ algorithm: 'test' })
      .setInput({ data: 'test' })
      .setPlan({ steps: [] })
      .setOutput({ result: 'ok' })
      .setTiming('2024-04-10T10:00:00Z', '2024-04-10T10:01:00Z')
      .setStatus('success')
      .setSummary({
        traces_processed: 50,
        objects_processed: 200,
        variants_discovered: 5,
      })
      .setAlgorithm({ name: 'test-algo', version: '1.0' })
      .setModel({ nodes: 3, edges: 4 })
      .build();

    const serialized = JSON.stringify(original);
    const deserialized = JSON.parse(serialized) as Receipt;

    expect(deserialized.config_hash).toBe(original.config_hash);
    expect(deserialized.input_hash).toBe(original.input_hash);
    expect(deserialized.plan_hash).toBe(original.plan_hash);
    expect(deserialized.output_hash).toBe(original.output_hash);
    expect(deserialized.run_id).toBe(original.run_id);
  });

  it('should maintain type guard after roundtrip', () => {
    const original = new ReceiptBuilder()
      .setRunId('550e8400-e29b-41d4-a716-446655440000')
      .setConfig({})
      .setInput({})
      .setPlan({})
      .setOutput({})
      .setTiming('2024-04-10T10:00:00Z', '2024-04-10T10:01:00Z')
      .setStatus('success')
      .setSummary({})
      .setAlgorithm({ name: 'test', version: '1.0' })
      .setModel({})
      .build();

    const serialized = JSON.stringify(original);
    const deserialized = JSON.parse(serialized);

    expect(isReceipt(deserialized)).toBe(true);
  });
});

describe('Receipt Chain: Reproducibility', () => {
  it('should produce identical receipt for identical execution', () => {
    const config = { algorithm: 'dfg', parameters: {} };
    const input = { traces: [{ events: [] }] };
    const plan = { steps: [{ type: 'algorithm', name: 'dfg' }] };
    const output = { type: 'dfg', nodes: [], edges: [] };

    const receipt1 = new ReceiptBuilder()
      .setRunId('550e8400-e29b-41d4-a716-446655440000')
      .setConfig(config)
      .setInput(input)
      .setPlan(plan)
      .setOutput(output)
      .setTiming('2024-04-10T10:00:00Z', '2024-04-10T10:01:00Z')
      .setStatus('success')
      .setSummary({})
      .setAlgorithm({ name: 'dfg', version: '1.0' })
      .setModel({})
      .build();

    const receipt2 = new ReceiptBuilder()
      .setRunId('550e8400-e29b-41d4-a716-446655440000')
      .setConfig(config)
      .setInput(input)
      .setPlan(plan)
      .setOutput(output)
      .setTiming('2024-04-10T10:00:00Z', '2024-04-10T10:01:00Z')
      .setStatus('success')
      .setSummary({})
      .setAlgorithm({ name: 'dfg', version: '1.0' })
      .setModel({})
      .build();

    expect(receipt1.config_hash).toBe(receipt2.config_hash);
    expect(receipt1.input_hash).toBe(receipt2.input_hash);
    expect(receipt1.plan_hash).toBe(receipt2.plan_hash);
    expect(receipt1.output_hash).toBe(receipt2.output_hash);
  });

  it('should produce different hashes for different outputs', () => {
    const config = { algorithm: 'dfg' };
    const input = { traces: [] };
    const plan = { steps: [] };

    const output1 = { type: 'dfg', nodes: ['A', 'B'], edges: [] };
    const output2 = { type: 'dfg', nodes: ['A', 'C'], edges: [] };

    const receipt1 = new ReceiptBuilder()
      .setRunId('550e8400-e29b-41d4-a716-446655440000')
      .setConfig(config)
      .setInput(input)
      .setPlan(plan)
      .setOutput(output1)
      .setTiming('2024-04-10T10:00:00Z', '2024-04-10T10:01:00Z')
      .setStatus('success')
      .setSummary({})
      .setAlgorithm({ name: 'dfg', version: '1.0' })
      .setModel({})
      .build();

    const receipt2 = new ReceiptBuilder()
      .setRunId('550e8400-e29b-41d4-a716-446655440000')
      .setConfig(config)
      .setInput(input)
      .setPlan(plan)
      .setOutput(output2)
      .setTiming('2024-04-10T10:00:00Z', '2024-04-10T10:01:00Z')
      .setStatus('success')
      .setSummary({})
      .setAlgorithm({ name: 'dfg', version: '1.0' })
      .setModel({})
      .build();

    expect(receipt1.output_hash).not.toBe(receipt2.output_hash);
  });
});

describe('Receipt Chain: Error Handling', () => {
  it('should include error info in failed receipt', () => {
    const receipt = new ReceiptBuilder()
      .setRunId('550e8400-e29b-41d4-a716-446655440000')
      .setConfig({})
      .setInput({})
      .setPlan({})
      .setOutput({})
      .setTiming('2024-04-10T10:00:00Z', '2024-04-10T10:01:00Z')
      .setStatus('failed')
      .setError({
        code: 'PARSE_ERROR',
        message: 'Failed to parse XES file',
        stack: 'Error: Failed to parse...',
      })
      .setSummary({})
      .setAlgorithm({ name: 'test', version: '1.0' })
      .setModel({})
      .build();

    expect(receipt.error).toBeDefined();
    expect(receipt.error?.code).toBe('PARSE_ERROR');
    expect(receipt.error?.message).toBe('Failed to parse XES file');
  });

  it('should preserve hashes in failed receipt', () => {
    const receipt = new ReceiptBuilder()
      .setRunId('550e8400-e29b-41d4-a716-446655440000')
      .setConfig({ algorithm: 'test' })
      .setInput({ data: 'test' })
      .setPlan({ steps: [] })
      .setOutput({})
      .setTiming('2024-04-10T10:00:00Z', '2024-04-10T10:01:00Z')
      .setStatus('failed')
      .setError({ code: 'ERROR', message: 'Failed' })
      .setSummary({})
      .setAlgorithm({ name: 'test', version: '1.0' })
      .setModel({})
      .build();

    expect(receipt.config_hash).toMatch(/^[0-9a-f]{64}$/i);
    expect(receipt.input_hash).toMatch(/^[0-9a-f]{64}$/i);
    expect(receipt.plan_hash).toMatch(/^[0-9a-f]{64}$/i);
    expect(receipt.output_hash).toMatch(/^[0-9a-f]{64}$/i);
  });
});

describe('Receipt Chain: Determinism', () => {
  it('should normalize objects with different key orders', () => {
    const obj1 = { z: 1, a: 2, m: 3 };
    const obj2 = { a: 2, m: 3, z: 1 };

    const normalized1 = normalizeForHashing(obj1);
    const normalized2 = normalizeForHashing(obj2);

    expect(normalized1).toBe(normalized2);
  });

  it('should normalize nested objects', () => {
    const obj1 = { outer: { z: 1, a: 2 }, key: 'value' };
    const obj2 = { key: 'value', outer: { a: 2, z: 1 } };

    const normalized1 = normalizeForHashing(obj1);
    const normalized2 = normalizeForHashing(obj2);

    expect(normalized1).toBe(normalized2);
  });

  it('should normalize arrays with object elements', () => {
    const arr1 = [1, { z: 1, a: 2 }, 'test'];
    const arr2 = [1, { a: 2, z: 1 }, 'test'];

    const normalized1 = normalizeForHashing(arr1);
    const normalized2 = normalizeForHashing(arr2);

    expect(normalized1).toBe(normalized2);
  });
});
