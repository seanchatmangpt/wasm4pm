/**
 * Integration tests for complete receipt workflow
 * Demonstrates real-world usage patterns
 */

import { describe, it, expect } from 'vitest';
import {
  ReceiptBuilder,
  hashConfig,
  hashData,
  validateReceipt,
  verifyReceiptHashes,
  detectTampering,
  isReceipt,
} from '../src/index';

describe('Receipt Integration Tests', () => {
  describe('complete execution flow', () => {
    it('should create, validate, and verify a receipt for successful execution', () => {
      // Setup: define execution parameters
      const config = {
        algorithm: 'alpha++',
        threshold: 0.75,
        max_depth: 5,
      };

      const input = {
        traces: [
          { id: 't1', events: [{ id: 'e1', activity: 'A' }] },
          { id: 't2', events: [{ id: 'e2', activity: 'B' }] },
        ],
      };

      const plan = {
        steps: [
          { name: 'parse', timeout: 5000 },
          { name: 'discover', timeout: 10000 },
          { name: 'validate', timeout: 5000 },
        ],
      };

      const startTime = new Date('2026-04-04T10:00:00Z').toISOString();
      const endTime = new Date('2026-04-04T10:00:05Z').toISOString();

      // Build receipt
      const receipt = new ReceiptBuilder()
        .setConfig(config)
        .setInput(input)
        .setPlan(plan)
        .setOutput({})
        .setTiming(startTime, endTime)
        .setStatus('success')
        .setSummary({
          traces_processed: 2,
          objects_processed: 2,
          variants_discovered: 2,
        })
        .setAlgorithm({
          name: 'alpha++',
          version: '1.0.0',
          parameters: { threshold: 0.75, max_depth: 5 },
        })
        .setModel({
          nodes: 10,
          edges: 12,
          artifacts: {
            petri_net: '/tmp/model.pnml',
            dfg: '/tmp/model.dfg',
          },
        })
        .build();

      // Validate structure
      const structureValidation = validateReceipt(receipt);
      expect(structureValidation.valid).toBe(true);
      expect(structureValidation.errors).toHaveLength(0);

      // Verify hashes
      const hashValidation = verifyReceiptHashes(receipt, config, input, plan);
      expect(hashValidation.valid).toBe(true);
      expect(hashValidation.errors).toHaveLength(0);

      // Ensure not tampered
      expect(detectTampering(receipt, config, input, plan)).toBe(false);
    });

    it('should detect tampering when input data is modified', () => {
      const config = { algorithm: 'test' };
      const input = { value: 100 };
      const plan = { steps: [] };

      // Create original receipt
      const receipt = new ReceiptBuilder()
        .setRunId('550e8400-e29b-41d4-a716-446655440000')
        .setConfig(config)
        .setInput(input)
        .setPlan(plan)
        .setOutput({})
        .setTiming('2026-04-04T10:00:00Z', '2026-04-04T10:01:00Z')
        .setStatus('success')
        .setSummary({})
        .setAlgorithm({ name: 'test', version: '1.0' })
        .setModel({})
        .build();

      // Tamper with input
      const tamperedInput = { value: 999 };

      // Detection should work
      const isTampered = detectTampering(receipt, config, tamperedInput, plan);
      expect(isTampered).toBe(true);

      // Verification should fail
      const result = verifyReceiptHashes(receipt, config, tamperedInput, plan);
      expect(result.valid).toBe(false);
    });

    it('should handle failed execution with error information', () => {
      const config = { algorithm: 'unstable' };
      const input = { corrupt: true };
      const plan = { steps: [] };

      const receipt = new ReceiptBuilder()
        .setConfig(config)
        .setInput(input)
        .setPlan(plan)
        .setOutput({})
        .setTiming('2026-04-04T10:00:00Z', '2026-04-04T10:00:01Z')
        .setStatus('failed')
        .setError({
          code: 'PARSE_ERROR',
          message: 'Failed to parse event log: invalid format',
          stack: 'Error: Invalid format\n  at Parser.parse:42',
          context: {
            line: 42,
            char: 10,
            expected: 'timestamp',
          },
        })
        .setSummary({
          traces_processed: 0,
          objects_processed: 0,
          variants_discovered: 0,
        })
        .setAlgorithm({
          name: 'failed-algo',
          version: '1.0',
          parameters: {},
        })
        .setModel({ nodes: 0, edges: 0 })
        .build();

      // Validate structure
      const result = validateReceipt(receipt);
      expect(result.valid).toBe(true);

      // Check error is present
      expect(receipt.error).toBeDefined();
      expect(receipt.error?.code).toBe('PARSE_ERROR');
      expect(receipt.error?.context?.line).toBe(42);
    });

    it('should support partial success with warning', () => {
      const config = { algorithm: 'alpha' };
      const input = { traces: [] };
      const plan = { steps: [] };

      const receipt = new ReceiptBuilder()
        .setConfig(config)
        .setInput(input)
        .setPlan(plan)
        .setOutput({})
        .setTiming('2026-04-04T10:00:00Z', '2026-04-04T10:00:02Z')
        .setStatus('partial')
        .setError({
          code: 'INCOMPLETE',
          message: 'Processing interrupted: timeout after 2s',
        })
        .setSummary({
          traces_processed: 50,
          objects_processed: 250,
          variants_discovered: 5,
        })
        .setAlgorithm({ name: 'alpha', version: '1.0' })
        .setModel({ nodes: 8, edges: 10 })
        .build();

      expect(receipt.status).toBe('partial');
      expect(receipt.error?.message).toContain('timeout');

      const validation = validateReceipt(receipt);
      expect(validation.valid).toBe(true);
    });
  });

  describe('JSON round-trip', () => {
    it('should serialize and deserialize receipt correctly', () => {
      const original = new ReceiptBuilder()
        .setRunId('550e8400-e29b-41d4-a716-446655440000')
        .setConfig({ algorithm: 'test', threshold: 0.8 })
        .setInput({ data: [1, 2, 3] })
        .setPlan({ steps: [{ name: 'step1' }] })
        .setOutput({})
        .setTiming('2026-04-04T10:00:00Z', '2026-04-04T10:00:05Z')
        .setStatus('success')
        .setSummary({
          traces_processed: 100,
          objects_processed: 500,
          variants_discovered: 10,
        })
        .setAlgorithm({
          name: 'test-algo',
          version: '1.0.0',
          parameters: { threshold: 0.8 },
        })
        .setModel({
          nodes: 42,
          edges: 156,
          artifacts: { output: '/tmp/model.pnml' },
        })
        .build();

      // Serialize
      const json = JSON.stringify(original);

      // Deserialize
      const deserialized = JSON.parse(json);

      // Type check
      expect(isReceipt(deserialized)).toBe(true);

      // Field comparison
      expect(deserialized.run_id).toBe(original.run_id);
      expect(deserialized.schema_version).toBe(original.schema_version);
      expect(deserialized.config_hash).toBe(original.config_hash);
      expect(deserialized.input_hash).toBe(original.input_hash);
      expect(deserialized.plan_hash).toBe(original.plan_hash);
      expect(deserialized.status).toBe(original.status);
      expect(deserialized.duration_ms).toBe(original.duration_ms);
      expect(deserialized.summary).toEqual(original.summary);
      expect(deserialized.algorithm).toEqual(original.algorithm);
      expect(deserialized.model).toEqual(original.model);
    });

    it('should preserve complex nested structures', () => {
      const complexConfig = {
        algorithm: 'genetic',
        population: {
          size: 100,
          mutation_rate: 0.1,
          crossover: {
            type: 'single_point',
            probability: 0.8,
          },
        },
        selection: ['tournament', 'elite'],
      };

      const receipt = new ReceiptBuilder()
        .setConfig(complexConfig)
        .setInput({})
        .setPlan({})
        .setOutput({})
        .setTiming('2026-04-04T10:00:00Z', '2026-04-04T10:00:01Z')
        .setStatus('success')
        .setSummary({})
        .setAlgorithm({ name: 'test', version: '1.0' })
        .setModel({})
        .build();

      const json = JSON.stringify(receipt);
      const deserialized = JSON.parse(json);

      expect(deserialized.config_hash).toBe(receipt.config_hash);
    });
  });

  describe('deterministic hashing across multiple calls', () => {
    it('should produce consistent hashes for equivalent objects', () => {
      const config1 = { z: 1, a: 2, m: 3 };
      const config2 = { a: 2, m: 3, z: 1 };
      const config3 = { m: 3, z: 1, a: 2 };

      const hash1 = hashConfig(config1);
      const hash2 = hashConfig(config2);
      const hash3 = hashConfig(config3);

      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });

    it('should use consistent hashes in receipts', () => {
      const config = { algorithm: 'test' };
      const input = { data: 'value' };
      const plan = { steps: [] };

      const receipt1 = new ReceiptBuilder()
        .setConfig(config)
        .setInput(input)
        .setPlan(plan)
        .setOutput({})
        .setTiming('2026-04-04T10:00:00Z', '2026-04-04T10:01:00Z')
        .setStatus('success')
        .setSummary({})
        .setAlgorithm({ name: 'test', version: '1.0' })
        .setModel({})
        .build();

      const receipt2 = new ReceiptBuilder()
        .setConfig(config)
        .setInput(input)
        .setPlan(plan)
        .setOutput({})
        .setTiming('2026-04-04T10:00:00Z', '2026-04-04T10:01:00Z')
        .setStatus('success')
        .setSummary({})
        .setAlgorithm({ name: 'test', version: '1.0' })
        .setModel({})
        .build();

      // Same inputs should produce same hashes
      expect(receipt1.config_hash).toBe(receipt2.config_hash);
      expect(receipt1.input_hash).toBe(receipt2.input_hash);
      expect(receipt1.plan_hash).toBe(receipt2.plan_hash);
    });
  });

  describe('real-world scenarios', () => {
    it('should handle large event log processing', () => {
      // Simulate large event log
      const traces = Array.from({ length: 100 }, (_, i) => ({
        id: `trace_${i}`,
        events: Array.from({ length: 50 }, (_, j) => ({
          id: `event_${i}_${j}`,
          activity: `Activity_${j % 10}`,
          timestamp: `2026-04-04T${String(Math.floor(j / 60)).padStart(2, '0')}:${String(j % 60).padStart(2, '0')}:00Z`,
        })),
      }));

      const config = {
        algorithm: 'alpha++',
        threshold: 0.8,
        max_depth: 5,
      };

      const receipt = new ReceiptBuilder()
        .setConfig(config)
        .setInput({ traces })
        .setPlan({ steps: [{ name: 'discover' }] })
        .setOutput({})
        .setTiming('2026-04-04T10:00:00Z', '2026-04-04T10:05:00Z')
        .setStatus('success')
        .setSummary({
          traces_processed: 100,
          objects_processed: 5000,
          variants_discovered: 47,
        })
        .setAlgorithm({
          name: 'alpha++',
          version: '1.0.0',
          parameters: config,
        })
        .setModel({
          nodes: 15,
          edges: 42,
        })
        .build();

      // Should handle large data without issues
      const result = validateReceipt(receipt);
      expect(result.valid).toBe(true);

      // Hash should be computed efficiently
      expect(receipt.input_hash).toMatch(/^[0-9a-f]{64}$/i);
    });

    it('should track algorithm parameters in receipt', () => {
      const algorithmConfig = {
        name: 'genetic_algorithm',
        version: '2.1.0',
        parameters: {
          population_size: 100,
          generations: 50,
          mutation_rate: 0.1,
          crossover_rate: 0.8,
          fitness_function: 'edge_count',
          selection_strategy: 'tournament',
          tournament_size: 3,
          elitism_ratio: 0.1,
          convergence_threshold: 0.001,
          max_stagnation: 20,
        },
      };

      const receipt = new ReceiptBuilder()
        .setConfig({})
        .setInput({})
        .setPlan({})
        .setOutput({})
        .setTiming('2026-04-04T10:00:00Z', '2026-04-04T10:00:30Z')
        .setStatus('success')
        .setSummary({})
        .setAlgorithm(algorithmConfig)
        .setModel({})
        .build();

      // All parameters preserved
      expect(receipt.algorithm.parameters).toEqual(algorithmConfig.parameters);
      expect(receipt.algorithm.name).toBe('genetic_algorithm');
      expect(receipt.algorithm.version).toBe('2.1.0');
    });
  });
});
