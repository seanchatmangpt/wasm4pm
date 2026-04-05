/**
 * Tests for receipt validation and tampering detection
 */

import { describe, it, expect } from 'vitest';
import { ReceiptBuilder } from '../src/receipt-builder';
import {
  validateReceipt,
  verifyReceiptHashes,
  detectTampering,
} from '../src/validation';

describe('receipt validation', () => {
  let validReceipt: any;

  // Setup a valid receipt before each test
  beforeEach(() => {
    validReceipt = new ReceiptBuilder()
      .setRunId('550e8400-e29b-41d4-a716-446655440000')
      .setConfig({ algorithm: 'test' })
      .setInput({ data: 123 })
      .setPlan({ steps: [] })
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

  describe('validateReceipt', () => {
    it('should validate a correct receipt', () => {
      const result = validateReceipt(validReceipt);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject non-object input', () => {
      const result = validateReceipt('not an object');

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject null', () => {
      const result = validateReceipt(null);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should detect missing run_id', () => {
      const receipt = { ...validReceipt };
      delete receipt.run_id;

      const result = validateReceipt(receipt);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('run_id'))).toBe(true);
    });

    it('should detect invalid UUID format', () => {
      const receipt = { ...validReceipt, run_id: 'not-a-uuid' };

      const result = validateReceipt(receipt);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('UUID'))).toBe(true);
    });

    it('should detect invalid hash format', () => {
      const receipt = { ...validReceipt, config_hash: 'invalid' };

      const result = validateReceipt(receipt);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('config_hash'))).toBe(true);
    });

    it('should detect invalid ISO 8601 timestamps', () => {
      const receipt = { ...validReceipt, start_time: 'not a date' };

      const result = validateReceipt(receipt);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('start_time'))).toBe(true);
    });

    it('should detect negative duration', () => {
      const receipt = { ...validReceipt, duration_ms: -100 };

      const result = validateReceipt(receipt);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('duration_ms'))).toBe(true);
    });

    it('should detect invalid status', () => {
      const receipt = { ...validReceipt, status: 'unknown' };

      const result = validateReceipt(receipt);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('status'))).toBe(true);
    });

    it('should warn when failed status lacks error info', () => {
      const receipt = { ...validReceipt, status: 'failed' };
      delete receipt.error;

      const result = validateReceipt(receipt);

      expect(result.warnings.some((w) => w.includes('failed'))).toBe(true);
    });

    it('should warn about unknown schema versions', () => {
      const receipt = { ...validReceipt, schema_version: '2.0' };

      const result = validateReceipt(receipt);

      expect(result.warnings.some((w) => w.includes('schema version'))).toBe(
        true
      );
    });

    it('should detect invalid summary', () => {
      const receipt = { ...validReceipt, summary: { invalid: 'data' } };

      const result = validateReceipt(receipt);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('summary'))).toBe(true);
    });

    it('should detect missing algorithm info', () => {
      const receipt = { ...validReceipt, algorithm: { version: '1.0' } };

      const result = validateReceipt(receipt);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Algorithm'))).toBe(true);
    });

    it('should detect invalid model counts', () => {
      const receipt = { ...validReceipt, model: { nodes: 'invalid' } };

      const result = validateReceipt(receipt);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('model'))).toBe(true);
    });
  });

  describe('verifyReceiptHashes', () => {
    it('should verify hashes match content', () => {
      const config = { algorithm: 'test' };
      const input = { data: 123 };
      const plan = { steps: [] };

      const result = verifyReceiptHashes(validReceipt, config, input, plan);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect config tampering', () => {
      const config = { algorithm: 'different' };
      const input = { data: 123 };
      const plan = { steps: [] };

      const result = verifyReceiptHashes(validReceipt, config, input, plan);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('config_hash'))).toBe(true);
    });

    it('should detect input tampering', () => {
      const config = { algorithm: 'test' };
      const input = { data: 456 };
      const plan = { steps: [] };

      const result = verifyReceiptHashes(validReceipt, config, input, plan);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('input_hash'))).toBe(true);
    });

    it('should detect plan tampering', () => {
      const config = { algorithm: 'test' };
      const input = { data: 123 };
      const plan = { steps: [{ name: 'extra' }] };

      const result = verifyReceiptHashes(validReceipt, config, input, plan);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('plan_hash'))).toBe(true);
    });

    it('should detect multiple tampering attempts', () => {
      const config = { algorithm: 'tampered' };
      const input = { data: 999 };
      const plan = { steps: [{ name: 'tampered' }] };

      const result = verifyReceiptHashes(validReceipt, config, input, plan);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });

    it('should be order-independent for hashing', () => {
      const config = { z: 1, a: 2 };
      const configReordered = { a: 2, z: 1 };
      const input = { data: 123 };
      const plan = { steps: [] };

      const receipt = new ReceiptBuilder()
        .setRunId('550e8400-e29b-41d4-a716-446655440000')
        .setConfig(config)
        .setInput(input)
        .setPlan(plan)
        .setTiming('2026-04-04T10:00:00Z', '2026-04-04T10:01:00Z')
        .setStatus('success')
        .setSummary({})
        .setAlgorithm({ name: 'test', version: '1.0' })
        .setModel({})
        .build();

      const result = verifyReceiptHashes(receipt, configReordered, input, plan);

      expect(result.valid).toBe(true);
    });
  });

  describe('detectTampering', () => {
    it('should detect any hash mismatch', () => {
      const config = { algorithm: 'test' };
      const input = { data: 'tampered' };
      const plan = { steps: [] };

      const isTampered = detectTampering(validReceipt, config, input, plan);

      expect(isTampered).toBe(true);
    });

    it('should return false for valid receipts', () => {
      const config = { algorithm: 'test' };
      const input = { data: 123 };
      const plan = { steps: [] };

      const isTampered = detectTampering(validReceipt, config, input, plan);

      expect(isTampered).toBe(false);
    });

    it('should use hash mismatch as tampering signal', () => {
      const config = { algorithm: 'test' };
      const input = { data: 123 };
      const plan = { steps: [{ name: 'tampered' }] };

      const isTampered = detectTampering(validReceipt, config, input, plan);

      expect(isTampered).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle non-serializable content gracefully', () => {
      const config = { algorithm: 'test' };
      const input = { data: 123 };
      const plan = { steps: [] };

      // This should not throw, but indicate hash mismatch
      const result = verifyReceiptHashes(validReceipt, config, input, plan);

      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('errors');
    });

    it('should provide detailed error messages', () => {
      const receipt = { ...validReceipt, status: 'invalid' };

      const result = validateReceipt(receipt);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(typeof result.errors[0]).toBe('string');
    });

    it('should accumulate multiple validation errors', () => {
      const receipt = {
        ...validReceipt,
        run_id: 'invalid-uuid',
        config_hash: 'invalid-hash',
        duration_ms: -1,
      };

      const result = validateReceipt(receipt);

      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });
  });
});
