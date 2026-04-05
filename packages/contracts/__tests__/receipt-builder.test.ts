/**
 * Tests for ReceiptBuilder fluent API and receipt construction
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ReceiptBuilder } from '../src/receipt-builder';
import { Receipt } from '../src/receipt';

describe('ReceiptBuilder', () => {
  let builder: ReceiptBuilder;

  beforeEach(() => {
    builder = new ReceiptBuilder();
  });

  describe('basic construction', () => {
    it('should construct a minimal valid receipt', () => {
      const receipt = builder
        .setConfig({ algorithm: 'test' })
        .setInput({ data: [] })
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

      expect(receipt).toBeDefined();
      expect(receipt.run_id).toBeDefined();
      expect(receipt.schema_version).toBe('1.0');
    });

    it('should generate UUID if not provided', () => {
      const receipt = builder
        .setConfig({})
        .setInput({})
        .setPlan({})
        .setOutput({})
        .setTiming('2026-04-04T10:00:00Z', '2026-04-04T10:01:00Z')
        .setStatus('success')
        .setSummary({})
        .setAlgorithm({ name: 'test', version: '1.0' })
        .setModel({})
        .build();

      expect(receipt.run_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('should allow setting custom run ID', () => {
      const customId = '550e8400-e29b-41d4-a716-446655440000';
      const receipt = builder
        .setRunId(customId)
        .setConfig({})
        .setInput({})
        .setPlan({})
        .setOutput({})
        .setTiming('2026-04-04T10:00:00Z', '2026-04-04T10:01:00Z')
        .setStatus('success')
        .setSummary({})
        .setAlgorithm({ name: 'test', version: '1.0' })
        .setModel({})
        .build();

      expect(receipt.run_id).toBe(customId);
    });
  });

  describe('hashing', () => {
    it('should compute config hash', () => {
      const config = { algorithm: 'alpha', threshold: 0.8 };
      const receipt = builder
        .setConfig(config)
        .setInput({})
        .setPlan({})
        .setOutput({})
        .setTiming('2026-04-04T10:00:00Z', '2026-04-04T10:01:00Z')
        .setStatus('success')
        .setSummary({})
        .setAlgorithm({ name: 'test', version: '1.0' })
        .setModel({})
        .build();

      expect(receipt.config_hash).toMatch(/^[0-9a-f]{64}$/i);
    });

    it('should compute input hash', () => {
      const input = { traces: [{ id: 1, events: [] }] };
      const receipt = builder
        .setConfig({})
        .setInput(input)
        .setPlan({})
        .setOutput({})
        .setTiming('2026-04-04T10:00:00Z', '2026-04-04T10:01:00Z')
        .setStatus('success')
        .setSummary({})
        .setAlgorithm({ name: 'test', version: '1.0' })
        .setModel({})
        .build();

      expect(receipt.input_hash).toMatch(/^[0-9a-f]{64}$/i);
    });

    it('should compute plan hash', () => {
      const plan = { steps: [{ name: 'parse' }, { name: 'discover' }] };
      const receipt = builder
        .setConfig({})
        .setInput({})
        .setPlan(plan)
        .setOutput({})
        .setTiming('2026-04-04T10:00:00Z', '2026-04-04T10:01:00Z')
        .setStatus('success')
        .setSummary({})
        .setAlgorithm({ name: 'test', version: '1.0' })
        .setModel({})
        .build();

      expect(receipt.plan_hash).toMatch(/^[0-9a-f]{64}$/i);
    });

    it('should produce deterministic hashes for same input', () => {
      const config = { test: true };
      const input = { data: 123 };
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

      expect(receipt1.config_hash).toBe(receipt2.config_hash);
      expect(receipt1.input_hash).toBe(receipt2.input_hash);
      expect(receipt1.plan_hash).toBe(receipt2.plan_hash);
    });
  });

  describe('timing', () => {
    it('should compute duration from start and end times', () => {
      const receipt = builder
        .setConfig({})
        .setInput({})
        .setPlan({})
        .setOutput({})
        .setTiming('2026-04-04T10:00:00Z', '2026-04-04T10:01:00Z')
        .setStatus('success')
        .setSummary({})
        .setAlgorithm({ name: 'test', version: '1.0' })
        .setModel({})
        .build();

      expect(receipt.duration_ms).toBe(60000); // 1 minute
    });

    it('should allow setting duration directly', () => {
      const receipt = builder
        .setConfig({})
        .setInput({})
        .setPlan({})
        .setOutput({})
        .setTiming('2026-04-04T10:00:00Z', '2026-04-04T10:00:05Z')
        .setDuration(5000)
        .setStatus('success')
        .setSummary({})
        .setAlgorithm({ name: 'test', version: '1.0' })
        .setModel({})
        .build();

      expect(receipt.duration_ms).toBe(5000);
    });

    it('should override timing with explicit duration', () => {
      const receipt = builder
        .setConfig({})
        .setInput({})
        .setPlan({})
        .setOutput({})
        .setTiming('2026-04-04T10:00:00Z', '2026-04-04T10:01:00Z')
        .setDuration(3000)
        .setStatus('success')
        .setSummary({})
        .setAlgorithm({ name: 'test', version: '1.0' })
        .setModel({})
        .build();

      expect(receipt.duration_ms).toBe(3000);
    });

    it('should clamp negative durations to zero', () => {
      const receipt = builder
        .setConfig({})
        .setInput({})
        .setPlan({})
        .setOutput({})
        .setTiming('2026-04-04T10:00:00Z', '2026-04-04T10:00:01Z')
        .setDuration(-100)
        .setStatus('success')
        .setSummary({})
        .setAlgorithm({ name: 'test', version: '1.0' })
        .setModel({})
        .build();

      expect(receipt.duration_ms).toBe(0);
    });
  });

  describe('status and errors', () => {
    it('should support success status', () => {
      const receipt = builder
        .setConfig({})
        .setInput({})
        .setPlan({})
        .setOutput({})
        .setTiming('2026-04-04T10:00:00Z', '2026-04-04T10:01:00Z')
        .setStatus('success')
        .setSummary({})
        .setAlgorithm({ name: 'test', version: '1.0' })
        .setModel({})
        .build();

      expect(receipt.status).toBe('success');
      expect(receipt.error).toBeUndefined();
    });

    it('should support failed status with error', () => {
      const error = {
        code: 'INVALID_LOG',
        message: 'Event log format is invalid',
        stack: 'Error: ...',
      };

      const receipt = builder
        .setConfig({})
        .setInput({})
        .setPlan({})
        .setOutput({})
        .setTiming('2026-04-04T10:00:00Z', '2026-04-04T10:01:00Z')
        .setStatus('failed')
        .setError(error)
        .setSummary({})
        .setAlgorithm({ name: 'test', version: '1.0' })
        .setModel({})
        .build();

      expect(receipt.status).toBe('failed');
      expect(receipt.error).toBe(error);
    });

    it('should support partial status', () => {
      const receipt = builder
        .setConfig({})
        .setInput({})
        .setPlan({})
        .setOutput({})
        .setTiming('2026-04-04T10:00:00Z', '2026-04-04T10:01:00Z')
        .setStatus('partial')
        .setSummary({})
        .setAlgorithm({ name: 'test', version: '1.0' })
        .setModel({})
        .build();

      expect(receipt.status).toBe('partial');
    });
  });

  describe('method chaining', () => {
    it('should support fluent API', () => {
      const receipt = builder
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

      expect(receipt.run_id).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(receipt.schema_version).toBe('1.0');
    });
  });

  describe('validation', () => {
    it('should throw if required fields are missing', () => {
      expect(() => builder.build()).toThrow();
    });

    it('should throw if config is not set', () => {
      expect(() =>
        builder
          .setInput({})
          .setPlan({})
        .setOutput({})
          .setTiming('2026-04-04T10:00:00Z', '2026-04-04T10:01:00Z')
          .setStatus('success')
          .setSummary({})
          .setAlgorithm({ name: 'test', version: '1.0' })
          .setModel({})
          .build()
      ).toThrow('config_hash');
    });

    it('should throw if timing is not set', () => {
      expect(() =>
        builder
          .setConfig({})
          .setInput({})
          .setPlan({})
        .setOutput({})
          .setStatus('success')
          .setSummary({})
          .setAlgorithm({ name: 'test', version: '1.0' })
          .setModel({})
          .build()
      ).toThrow();
    });
  });

  describe('partial updates', () => {
    it('should allow partial summary updates', () => {
      const receipt = builder
        .setConfig({})
        .setInput({})
        .setPlan({})
        .setOutput({})
        .setTiming('2026-04-04T10:00:00Z', '2026-04-04T10:01:00Z')
        .setStatus('success')
        .setSummary({ traces_processed: 100 })
        .setSummary({ variants_discovered: 10 })
        .setAlgorithm({ name: 'test', version: '1.0' })
        .setModel({})
        .build();

      expect(receipt.summary.traces_processed).toBe(100);
      expect(receipt.summary.variants_discovered).toBe(10);
    });

    it('should allow partial algorithm updates', () => {
      const receipt = builder
        .setConfig({})
        .setInput({})
        .setPlan({})
        .setOutput({})
        .setTiming('2026-04-04T10:00:00Z', '2026-04-04T10:01:00Z')
        .setStatus('success')
        .setSummary({})
        .setAlgorithm({ name: 'alpha' })
        .setAlgorithm({ version: '2.0' })
        .setModel({})
        .build();

      expect(receipt.algorithm.name).toBe('alpha');
      expect(receipt.algorithm.version).toBe('2.0');
    });
  });
});
