/**
 * Tests for receipt validation and tampering detection
 */

import { describe, it, expect, beforeEach } from 'vitest';
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
      .setTraceId('aabbccddeeff00112233445566778899')
      .build();
  });

  describe('validateReceipt', () => {
    it('validates correct receipts and rejects all invalid inputs', () => {
      expect(validateReceipt(validReceipt).valid).toBe(true);
      expect(validateReceipt(validReceipt).errors).toHaveLength(0);

      expect(validateReceipt('not an object').valid).toBe(false);
      expect(validateReceipt(null).valid).toBe(false);

      const noRunId = { ...validReceipt };
      delete noRunId.run_id;
      const noRunIdResult = validateReceipt(noRunId);
      expect(noRunIdResult.valid).toBe(false);
      expect(noRunIdResult.errors.some((e) => e.includes('run_id'))).toBe(true);

      const badUuid = { ...validReceipt, run_id: 'not-a-uuid' };
      expect(validateReceipt(badUuid).valid).toBe(false);
      expect(validateReceipt(badUuid).errors.some((e) => e.includes('UUID'))).toBe(true);

      const badHash = { ...validReceipt, config_hash: 'invalid' };
      expect(validateReceipt(badHash).valid).toBe(false);
      expect(validateReceipt(badHash).errors.some((e) => e.includes('config_hash'))).toBe(true);

      const badTimestamp = { ...validReceipt, start_time: 'not a date' };
      expect(validateReceipt(badTimestamp).valid).toBe(false);
      expect(validateReceipt(badTimestamp).errors.some((e) => e.includes('start_time'))).toBe(true);

      const negDuration = { ...validReceipt, duration_ms: -100 };
      expect(validateReceipt(negDuration).valid).toBe(false);
      expect(validateReceipt(negDuration).errors.some((e) => e.includes('duration_ms'))).toBe(true);

      const badStatus = { ...validReceipt, status: 'unknown' };
      expect(validateReceipt(badStatus).valid).toBe(false);
      expect(validateReceipt(badStatus).errors.some((e) => e.includes('status'))).toBe(true);

      const failedNoError = { ...validReceipt, status: 'failed' };
      delete failedNoError.error;
      expect(validateReceipt(failedNoError).warnings.some((w) => w.includes('failed'))).toBe(true);

      const unknownSchema = { ...validReceipt, schema_version: '2.0' };
      expect(validateReceipt(unknownSchema).warnings.some((w) => w.includes('schema version'))).toBe(true);

      const badSummary = { ...validReceipt, summary: { invalid: 'data' } };
      expect(validateReceipt(badSummary).valid).toBe(false);
      expect(validateReceipt(badSummary).errors.some((e) => e.includes('summary'))).toBe(true);

      const missingAlgo = { ...validReceipt, algorithm: { version: '1.0' } };
      expect(validateReceipt(missingAlgo).valid).toBe(false);
      expect(validateReceipt(missingAlgo).errors.some((e) => e.includes('Algorithm'))).toBe(true);

      const badModel = { ...validReceipt, model: { nodes: 'invalid' } };
      expect(validateReceipt(badModel).valid).toBe(false);
      expect(validateReceipt(badModel).errors.some((e) => e.includes('model'))).toBe(true);
    });
  });

  describe('verifyReceiptHashes', () => {
    it('verifies matching hashes, detects single and multiple tampering, is order-independent', () => {
      const config = { algorithm: 'test' };
      const input = { data: 123 };
      const plan = { steps: [] };

      const validResult = verifyReceiptHashes(validReceipt, config, input, plan);
      expect(validResult.valid).toBe(true);
      expect(validResult.errors).toHaveLength(0);

      const configTamper = verifyReceiptHashes(validReceipt, { algorithm: 'different' }, input, plan);
      expect(configTamper.valid).toBe(false);
      expect(configTamper.errors.some((e) => e.includes('config_hash'))).toBe(true);

      const inputTamper = verifyReceiptHashes(validReceipt, config, { data: 456 }, plan);
      expect(inputTamper.valid).toBe(false);
      expect(inputTamper.errors.some((e) => e.includes('input_hash'))).toBe(true);

      const planTamper = verifyReceiptHashes(validReceipt, config, input, { steps: [{ name: 'extra' }] });
      expect(planTamper.valid).toBe(false);
      expect(planTamper.errors.some((e) => e.includes('plan_hash'))).toBe(true);

      const multiTamper = verifyReceiptHashes(validReceipt, { algorithm: 'tampered' }, { data: 999 }, { steps: [{ name: 'tampered' }] });
      expect(multiTamper.valid).toBe(false);
      expect(multiTamper.errors.length).toBeGreaterThanOrEqual(3);

      const configReordered = { z: 1, a: 2 };
      const orderReceipt = new ReceiptBuilder()
        .setRunId('550e8400-e29b-41d4-a716-446655440000')
        .setConfig({ z: 1, a: 2 })
        .setInput(input)
        .setPlan(plan)
        .setOutput({})
        .setTiming('2026-04-04T10:00:00Z', '2026-04-04T10:01:00Z')
        .setStatus('success')
        .setSummary({})
        .setAlgorithm({ name: 'test', version: '1.0' })
        .setModel({})
        .setTraceId('aabbccddeeff00112233445566778899')
        .build();
      expect(verifyReceiptHashes(orderReceipt, configReordered, input, plan).valid).toBe(true);
    });
  });

  describe('detectTampering', () => {
    it('returns true for tampered receipts and false for valid ones', () => {
      const config = { algorithm: 'test' };
      const input = { data: 123 };
      const plan = { steps: [] };

      expect(detectTampering(validReceipt, config, { data: 'tampered' }, plan)).toBe(true);
      expect(detectTampering(validReceipt, config, input, plan)).toBe(false);
      expect(detectTampering(validReceipt, config, input, { steps: [{ name: 'tampered' }] })).toBe(true);
    });
  });

  describe('error handling', () => {
    it('handles edge cases, provides detailed messages, and accumulates multiple errors', () => {
      const config = { algorithm: 'test' };
      const input = { data: 123 };
      const plan = { steps: [] };

      const result = verifyReceiptHashes(validReceipt, config, input, plan);
      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('errors');

      const badStatusReceipt = { ...validReceipt, status: 'invalid' };
      const statusResult = validateReceipt(badStatusReceipt);
      expect(statusResult.errors.length).toBeGreaterThan(0);
      expect(typeof statusResult.errors[0]).toBe('string');

      const multiErrorReceipt = {
        ...validReceipt,
        run_id: 'invalid-uuid',
        config_hash: 'invalid-hash',
        duration_ms: -1,
      };
      expect(validateReceipt(multiErrorReceipt).errors.length).toBeGreaterThanOrEqual(3);
    });
  });
});
