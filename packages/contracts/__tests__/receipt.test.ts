/**
 * Tests for Receipt types and serialization
 */

import { describe, it, expect } from 'vitest';
import { Receipt, isReceipt } from '../src/receipt';
import { ReceiptBuilder } from '../src/receipt-builder';

describe('Receipt types', () => {
  let validReceipt: Receipt;

  beforeEach(() => {
    validReceipt = new ReceiptBuilder()
      .setRunId('550e8400-e29b-41d4-a716-446655440000')
      .setConfig({ algorithm: 'test' })
      .setInput({ data: 123 })
      .setPlan({ steps: [] })
        .setOutput({})
      .setTiming('2026-04-04T10:00:00Z', '2026-04-04T10:01:00Z')
      .setStatus('success')
      .setSummary({
        traces_processed: 100,
        objects_processed: 500,
        variants_discovered: 10,
      })
      .setAlgorithm({ name: 'test-algo', version: '1.0' })
      .setModel({ nodes: 5, edges: 8 })
      .build();
  });

  describe('isReceipt type guard', () => {
    it('should recognize valid receipts', () => {
      expect(isReceipt(validReceipt)).toBe(true);
    });

    it('should reject non-objects', () => {
      expect(isReceipt('not a receipt')).toBe(false);
      expect(isReceipt(123)).toBe(false);
      expect(isReceipt(null)).toBe(false);
      expect(isReceipt(undefined)).toBe(false);
    });

    it('should reject objects with missing fields', () => {
      const incomplete = { ...validReceipt };
      delete (incomplete as any).run_id;

      expect(isReceipt(incomplete)).toBe(false);
    });

    it('should reject objects with wrong field types', () => {
      const wrongTypes = { ...validReceipt, duration_ms: 'not a number' };

      expect(isReceipt(wrongTypes)).toBe(false);
    });
  });

  describe('JSON serialization', () => {
    it('should serialize to JSON', () => {
      const json = JSON.stringify(validReceipt);

      expect(typeof json).toBe('string');
      expect(json.length).toBeGreaterThan(0);
    });

    it('should deserialize from JSON', () => {
      const json = JSON.stringify(validReceipt);
      const deserialized = JSON.parse(json);

      expect(isReceipt(deserialized)).toBe(true);
    });

    it('should round-trip through JSON', () => {
      const json = JSON.stringify(validReceipt);
      const deserialized = JSON.parse(json) as Receipt;

      expect(deserialized.run_id).toBe(validReceipt.run_id);
      expect(deserialized.config_hash).toBe(validReceipt.config_hash);
      expect(deserialized.input_hash).toBe(validReceipt.input_hash);
      expect(deserialized.plan_hash).toBe(validReceipt.plan_hash);
      expect(deserialized.start_time).toBe(validReceipt.start_time);
      expect(deserialized.end_time).toBe(validReceipt.end_time);
      expect(deserialized.duration_ms).toBe(validReceipt.duration_ms);
      expect(deserialized.status).toBe(validReceipt.status);
      expect(deserialized.summary).toEqual(validReceipt.summary);
      expect(deserialized.algorithm).toEqual(validReceipt.algorithm);
      expect(deserialized.model).toEqual(validReceipt.model);
    });

    it('should preserve error information through serialization', () => {
      const receiptWithError = new ReceiptBuilder()
        .setRunId('550e8400-e29b-41d4-a716-446655440000')
        .setConfig({})
        .setInput({})
        .setPlan({})
        .setOutput({})
        .setTiming('2026-04-04T10:00:00Z', '2026-04-04T10:01:00Z')
        .setStatus('failed')
        .setError({
          code: 'PARSE_ERROR',
          message: 'Failed to parse event log',
          stack: 'Error: ...',
        })
        .setSummary({})
        .setAlgorithm({ name: 'test', version: '1.0' })
        .setModel({})
        .build();

      const json = JSON.stringify(receiptWithError);
      const deserialized = JSON.parse(json) as Receipt;

      expect(deserialized.error).toBeDefined();
      expect(deserialized.error?.code).toBe('PARSE_ERROR');
      expect(deserialized.error?.message).toBe('Failed to parse event log');
    });

    it('should handle large receipts', () => {
      const largeReceipt = new ReceiptBuilder()
        .setRunId('550e8400-e29b-41d4-a716-446655440000')
        .setConfig({ parameters: Array(1000).fill({ key: 'value' }) })
        .setInput({ traces: Array(1000).fill({ events: [] }) })
        .setPlan({ steps: Array(100).fill({ name: 'step' }) })
        .setOutput({})
        .setTiming('2026-04-04T10:00:00Z', '2026-04-04T10:01:00Z')
        .setStatus('success')
        .setSummary({
          traces_processed: 1000000,
          objects_processed: 5000000,
          variants_discovered: 50000,
        })
        .setAlgorithm({
          name: 'complex-algo',
          version: '1.0',
          parameters: Array(100).fill({ key: 'value' }),
        })
        .setModel({
          nodes: 10000,
          edges: 50000,
          artifacts: { output: '/path/to/model' },
        })
        .build();

      const json = JSON.stringify(largeReceipt);
      const deserialized = JSON.parse(json);

      expect(isReceipt(deserialized)).toBe(true);
    });
  });

  describe('Receipt fields', () => {
    it('should have all required fields', () => {
      expect(validReceipt).toHaveProperty('run_id');
      expect(validReceipt).toHaveProperty('schema_version');
      expect(validReceipt).toHaveProperty('config_hash');
      expect(validReceipt).toHaveProperty('input_hash');
      expect(validReceipt).toHaveProperty('plan_hash');
      expect(validReceipt).toHaveProperty('start_time');
      expect(validReceipt).toHaveProperty('end_time');
      expect(validReceipt).toHaveProperty('duration_ms');
      expect(validReceipt).toHaveProperty('status');
      expect(validReceipt).toHaveProperty('summary');
      expect(validReceipt).toHaveProperty('algorithm');
      expect(validReceipt).toHaveProperty('model');
    });

    it('should have optional error field only when status is not success', () => {
      expect(validReceipt.error).toBeUndefined();

      const failedReceipt = new ReceiptBuilder()
        .setRunId('550e8400-e29b-41d4-a716-446655440000')
        .setConfig({})
        .setInput({})
        .setPlan({})
        .setOutput({})
        .setTiming('2026-04-04T10:00:00Z', '2026-04-04T10:01:00Z')
        .setStatus('failed')
        .setError({ code: 'ERROR', message: 'Failed' })
        .setSummary({})
        .setAlgorithm({ name: 'test', version: '1.0' })
        .setModel({})
        .build();

      expect(failedReceipt.error).toBeDefined();
    });

    it('should have optional artifacts in model', () => {
      const receiptWithArtifacts = new ReceiptBuilder()
        .setRunId('550e8400-e29b-41d4-a716-446655440000')
        .setConfig({})
        .setInput({})
        .setPlan({})
        .setOutput({})
        .setTiming('2026-04-04T10:00:00Z', '2026-04-04T10:01:00Z')
        .setStatus('success')
        .setSummary({})
        .setAlgorithm({ name: 'test', version: '1.0' })
        .setModel({
          nodes: 5,
          edges: 8,
          artifacts: {
            petri_net: '/output/model.pnml',
            dfg: '/output/model.dfg',
          },
        })
        .build();

      expect(receiptWithArtifacts.model.artifacts).toBeDefined();
      expect(receiptWithArtifacts.model.artifacts?.petri_net).toBe(
        '/output/model.pnml'
      );
    });

    it('should support custom context in error info', () => {
      const receiptWithContext = new ReceiptBuilder()
        .setRunId('550e8400-e29b-41d4-a716-446655440000')
        .setConfig({})
        .setInput({})
        .setPlan({})
        .setOutput({})
        .setTiming('2026-04-04T10:00:00Z', '2026-04-04T10:01:00Z')
        .setStatus('failed')
        .setError({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          context: {
            field: 'event_id',
            value: 'invalid',
            reason: 'Must be numeric',
          },
        })
        .setSummary({})
        .setAlgorithm({ name: 'test', version: '1.0' })
        .setModel({})
        .build();

      expect(receiptWithContext.error?.context?.field).toBe('event_id');
    });
  });

  describe('Receipt structure', () => {
    it('should maintain proper nesting', () => {
      expect(typeof validReceipt.summary).toBe('object');
      expect(typeof validReceipt.algorithm).toBe('object');
      expect(typeof validReceipt.model).toBe('object');

      expect(typeof validReceipt.summary.traces_processed).toBe('number');
      expect(typeof validReceipt.algorithm.name).toBe('string');
      expect(typeof validReceipt.model.nodes).toBe('number');
    });

    it('should support nested objects in parameters', () => {
      const receipt = new ReceiptBuilder()
        .setRunId('550e8400-e29b-41d4-a716-446655440000')
        .setConfig({})
        .setInput({})
        .setPlan({})
        .setOutput({})
        .setTiming('2026-04-04T10:00:00Z', '2026-04-04T10:01:00Z')
        .setStatus('success')
        .setSummary({})
        .setAlgorithm({
          name: 'genetic',
          version: '1.0',
          parameters: {
            population_size: 100,
            generations: 50,
            mutation_rate: 0.1,
            fitness: {
              type: 'edges',
              threshold: 0.8,
            },
          },
        })
        .setModel({})
        .build();

      expect(
        (receipt.algorithm.parameters as any).fitness.type
      ).toBe('edges');
    });
  });
});
