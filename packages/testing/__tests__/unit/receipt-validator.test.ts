/**
 * ReceiptValidator harness tests.
 *
 * Validates receipt chain integrity, Blake3 hash verification,
 * file persistence, and signature field verification.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';
import { ReceiptValidator, createReceiptValidator } from '../../src/harness/receipt-validator.js';
import type { Receipt } from '@wasm4pm/contracts';

let receiptCounter = 0;

describe('ReceiptValidator', () => {
  let validator: ReceiptValidator;
  let tempDir: string;

  beforeEach(async () => {
    validator = createReceiptValidator();
    // Create temp directory for file tests
    tempDir = path.join(tmpdir(), `receipt-validator-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    receiptCounter = 0; // Reset counter for each test
  });

  afterEach(async () => {
    // Cleanup temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // best effort
    }
  });

  describe('validateReceipt()', () => {
    it('should accept a valid receipt', () => {
      const receipt = createValidReceipt();
      const result = validator.validateReceipt(receipt);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject receipt with invalid run_id', () => {
      const receipt = createValidReceipt();
      (receipt as any).run_id = 'not-a-uuid';
      const result = validator.validateReceipt(receipt);
      expect(result.valid).toBe(false);
      const error = result.errors.find((e) => e.field === 'run_id');
      expect(error).toBeDefined();
      expect(error?.message).toContain('UUID v4');
    });

    it('should reject receipt with invalid Blake3 hashes', () => {
      const receipt = createValidReceipt();
      (receipt as any).config_hash = 'not-a-valid-hash'; // Too short
      const result = validator.validateReceipt(receipt);
      expect(result.valid).toBe(false);
      const error = result.errors.find((e) => e.field === 'config_hash');
      expect(error).toBeDefined();
      expect(error?.message).toContain('Blake3');
    });

    it('should reject receipt with invalid timestamps', () => {
      const receipt = createValidReceipt();
      (receipt as any).start_time = 'not-a-timestamp';
      const result = validator.validateReceipt(receipt);
      expect(result.valid).toBe(false);
      const error = result.errors.find((e) => e.field === 'start_time');
      expect(error).toBeDefined();
      expect(error?.message).toContain('ISO 8601');
    });

    it('should reject receipt with end_time before start_time', () => {
      const receipt = createValidReceipt();
      (receipt as any).start_time = '2026-05-18T12:00:00Z';
      (receipt as any).end_time = '2026-05-18T11:00:00Z'; // Earlier than start_time
      const result = validator.validateReceipt(receipt);
      expect(result.valid).toBe(false);
      const error = result.errors.find((e) => e.field === 'start_time/end_time');
      expect(error).toBeDefined();
      expect(error?.message).toContain('after start_time');
    });

    it('should reject receipt with invalid status', () => {
      const receipt = createValidReceipt();
      (receipt as any).status = 'unknown';
      const result = validator.validateReceipt(receipt);
      expect(result.valid).toBe(false);
      const error = result.errors.find((e) => e.field === 'status');
      expect(error).toBeDefined();
      expect(error?.message).toContain('success');
    });

    it('should reject receipt with missing summary fields', () => {
      const receipt = createValidReceipt();
      (receipt as any).summary = { traces_processed: 10 }; // Missing other fields
      const result = validator.validateReceipt(receipt);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some(
          (e) => e.field === 'summary.objects_processed' || e.field === 'summary.variants_discovered'
        )
      ).toBe(true);
    });

    it('should reject receipt with invalid algorithm fields', () => {
      const receipt = createValidReceipt();
      (receipt as any).algorithm = { name: 'dfg' }; // Missing version
      const result = validator.validateReceipt(receipt);
      expect(result.valid).toBe(false);
      const error = result.errors.find((e) => e.field === 'algorithm.version');
      expect(error).toBeDefined();
    });

    it('should reject receipt with invalid model fields', () => {
      const receipt = createValidReceipt();
      (receipt as any).model = { nodes: -1, edges: 5 }; // Negative nodes
      const result = validator.validateReceipt(receipt);
      expect(result.valid).toBe(false);
      const error = result.errors.find((e) => e.field === 'model.nodes');
      expect(error).toBeDefined();
      expect(error?.message).toContain('non-negative');
    });
  });

  describe('validateBlake3Hashes()', () => {
    it('should validate all four hashes in a receipt', () => {
      const receipt = createValidReceipt();
      expect(validator.validateBlake3Hashes(receipt)).toBe(true);
    });

    it('should reject receipt with non-hex characters in hash', () => {
      const receipt = createValidReceipt();
      (receipt as any).config_hash = 'z'.repeat(64); // 'z' is not a hex character
      expect(validator.validateBlake3Hashes(receipt)).toBe(false);
    });

    it('should reject receipt with hash too short', () => {
      const receipt = createValidReceipt();
      (receipt as any).input_hash = 'a'.repeat(63); // Only 63 chars
      expect(validator.validateBlake3Hashes(receipt)).toBe(false);
    });

    it('should reject receipt with hash too long', () => {
      const receipt = createValidReceipt();
      (receipt as any).plan_hash = 'a'.repeat(65); // 65 chars
      expect(validator.validateBlake3Hashes(receipt)).toBe(false);
    });

    it('should reject receipt with missing hash field', () => {
      const receipt = createValidReceipt();
      delete (receipt as any).output_hash;
      expect(validator.validateBlake3Hashes(receipt)).toBe(false);
    });

    it('should accept uppercase hex characters', () => {
      const receipt = createValidReceipt();
      (receipt as any).config_hash = 'A'.repeat(64);
      expect(validator.validateBlake3Hashes(receipt)).toBe(true);
    });

    it('should accept mixed case hex characters', () => {
      const receipt = createValidReceipt();
      (receipt as any).config_hash = 'aAbBcCdDeEfF'.padEnd(64, '0');
      expect(validator.validateBlake3Hashes(receipt)).toBe(true);
    });
  });

  describe('validateReceiptChain()', () => {
    it('should validate a chain of valid receipts', () => {
      const receipts = [createValidReceipt(), createValidReceipt(), createValidReceipt()];
      const result = validator.validateReceiptChain(receipts);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject a chain with duplicate run_ids', () => {
      const receipt1 = createValidReceipt();
      const receipt2 = createValidReceipt();
      (receipt2 as any).run_id = (receipt1 as any).run_id; // Duplicate
      const result = validator.validateReceiptChain([receipt1, receipt2]);
      expect(result.valid).toBe(false);
      const error = result.errors.find((e) => e.field.includes('run_id'));
      expect(error).toBeDefined();
      expect(error?.message).toContain('Duplicate');
    });

    it('should reject a chain with non-monotonic timestamps', () => {
      const receipt1 = createValidReceipt({
        start_time: '2026-05-18T12:00:00Z',
        end_time: '2026-05-18T12:01:00Z',
      });
      const receipt2 = createValidReceipt({
        start_time: '2026-05-18T11:00:00Z',
        end_time: '2026-05-18T11:01:00Z', // Earlier than receipt1
      });
      const result = validator.validateReceiptChain([receipt1, receipt2]);
      expect(result.valid).toBe(false);
      const error = result.errors.find((e) => e.message.includes('end_time must be after previous'));
      expect(error).toBeDefined();
    });

    it('should reject a chain with invalid individual receipts', () => {
      const receipt1 = createValidReceipt();
      const receipt2 = createValidReceipt();
      (receipt2 as any).status = 'invalid'; // Invalid status
      const result = validator.validateReceiptChain([receipt1, receipt2]);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field.includes('status'))).toBe(true);
    });

    it('should reject non-array input', () => {
      const result = validator.validateReceiptChain('not an array' as any);
      expect(result.valid).toBe(false);
      const error = result.errors.find((e) => e.field === 'receipts');
      expect(error).toBeDefined();
      expect(error?.message).toContain('array');
    });

    it('should handle empty receipt chain', () => {
      const result = validator.validateReceiptChain([]);
      expect(result.valid).toBe(false);
      expect(result.warnings).toContain('Receipt chain is empty');
    });
  });

  describe('assertReceiptSaved()', () => {
    it('should succeed when receipt file exists with matching run_id', async () => {
      const receipt = createValidReceipt();
      const filePath = path.join(tempDir, 'receipt.json');
      await fs.writeFile(filePath, JSON.stringify(receipt), 'utf-8');

      const result = await validator.assertReceiptSaved(tempDir, (receipt as any).run_id);
      expect(result).toBe(true);
    });

    it('should throw when receipt file does not exist', async () => {
      const receipt = createValidReceipt();
      await expect(validator.assertReceiptSaved(tempDir, (receipt as any).run_id)).rejects.toThrow(
        'Receipt file not found'
      );
    });

    it('should throw when receipt file is not valid JSON', async () => {
      const filePath = path.join(tempDir, 'receipt.json');
      await fs.writeFile(filePath, 'not valid json', 'utf-8');

      const receipt = createValidReceipt();
      await expect(validator.assertReceiptSaved(tempDir, (receipt as any).run_id)).rejects.toThrow(
        'Failed to read/parse receipt'
      );
    });

    it('should throw when run_id does not match', async () => {
      const receipt = createValidReceipt();
      const filePath = path.join(tempDir, 'receipt.json');
      await fs.writeFile(filePath, JSON.stringify(receipt), 'utf-8');

      await expect(
        validator.assertReceiptSaved(tempDir, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')
      ).rejects.toThrow('run_id mismatch');
    });

    it('should support custom filename', async () => {
      const receipt = createValidReceipt();
      const filePath = path.join(tempDir, 'custom-receipt.json');
      await fs.writeFile(filePath, JSON.stringify(receipt), 'utf-8');

      const result = await validator.assertReceiptSaved(tempDir, (receipt as any).run_id, 'custom-receipt.json');
      expect(result).toBe(true);
    });
  });

  describe('verifySignatureField()', () => {
    it('should return true when signature field exists and is non-empty', () => {
      const receipt = createValidReceipt();
      (receipt as any).signature = 'a'.repeat(128); // 128 hex chars = 64 bytes (typical Ed25519)
      expect(validator.verifySignatureField(receipt)).toBe(true);
    });

    it('should return false when signature field is missing', () => {
      const receipt = createValidReceipt();
      expect(validator.verifySignatureField(receipt)).toBe(false);
    });

    it('should return false when signature field is empty string', () => {
      const receipt = createValidReceipt();
      (receipt as any).signature = '';
      expect(validator.verifySignatureField(receipt)).toBe(false);
    });

    it('should return false when signature field is not a string', () => {
      const receipt = createValidReceipt();
      (receipt as any).signature = 12345;
      expect(validator.verifySignatureField(receipt)).toBe(false);
    });

    it('should accept various signature lengths (up to 512 chars)', () => {
      const receipt = createValidReceipt();
      (receipt as any).signature = 'a'.repeat(256);
      expect(validator.verifySignatureField(receipt)).toBe(true);
    });

    it('should return false when signature exceeds 512 characters', () => {
      const receipt = createValidReceipt();
      (receipt as any).signature = 'a'.repeat(513);
      expect(validator.verifySignatureField(receipt)).toBe(false);
    });
  });

  describe('integration: full receipt lifecycle', () => {
    it('should validate, save, and retrieve a complete receipt chain', async () => {
      // Create 3 receipts with proper monotonic timestamps
      const baseTime = new Date('2026-05-18T10:00:00Z').getTime();
      const receipts = [
        createValidReceipt({
          start_time: new Date(baseTime).toISOString(),
          end_time: new Date(baseTime + 1000).toISOString(),
        }),
        createValidReceipt({
          start_time: new Date(baseTime + 2000).toISOString(),
          end_time: new Date(baseTime + 3000).toISOString(),
        }),
        createValidReceipt({
          start_time: new Date(baseTime + 4000).toISOString(),
          end_time: new Date(baseTime + 5000).toISOString(),
        }),
      ];

      // Validate individual receipts
      for (const receipt of receipts) {
        const result = validator.validateReceipt(receipt);
        expect(result.valid).toBe(true);
        expect(validator.validateBlake3Hashes(receipt)).toBe(true);
      }

      // Validate chain
      const chainResult = validator.validateReceiptChain(receipts);
      expect(chainResult.valid).toBe(true);

      // Save all receipts
      for (let i = 0; i < receipts.length; i++) {
        const filePath = path.join(tempDir, `receipt-${i}.json`);
        await fs.writeFile(filePath, JSON.stringify(receipts[i]), 'utf-8');
      }

      // Verify each saved receipt
      for (let i = 0; i < receipts.length; i++) {
        const result = await validator.assertReceiptSaved(
          tempDir,
          (receipts[i] as any).run_id,
          `receipt-${i}.json`
        );
        expect(result).toBe(true);
      }
    });
  });
});

/**
 * Helper to create a valid receipt with optional overrides.
 */
function createValidReceipt(overrides?: Record<string, any>): Receipt {
  // Ensure monotonically increasing timestamps across calls
  receiptCounter++;
  const baseTime = new Date().getTime() + receiptCounter * 2000; // 2 second increments

  // Generate unique run_id
  const runIdBase = `${String(receiptCounter).padStart(8, '0')}-1234-4123-a123`;
  const runIdTail = String(123456789012 + receiptCounter).padStart(12, '0');
  const run_id = `${runIdBase}-${runIdTail}`;

  return {
    run_id,
    schema_version: '1.0',
    config_hash: String(receiptCounter).padStart(64, 'a'),
    input_hash: String(receiptCounter).padStart(64, 'b'),
    plan_hash: String(receiptCounter).padStart(64, 'c'),
    output_hash: String(receiptCounter).padStart(64, 'd'),
    start_time: new Date(baseTime).toISOString(),
    end_time: new Date(baseTime + 1000).toISOString(),
    duration_ms: 1000,
    status: 'success',
    summary: {
      traces_processed: 100,
      objects_processed: 50,
      variants_discovered: 8,
    },
    algorithm: {
      name: 'dfg',
      version: '1.0.0',
      parameters: {},
    },
    model: {
      nodes: 10,
      edges: 15,
    },
    ...overrides,
  };
}
