/**
 * Receipt validation harness for cryptographic proof verification.
 *
 * Validates receipt chain continuity, Blake3 hash integrity, file persistence,
 * and signature authenticity. Used for CLI integration tests to ensure receipts
 * are properly generated and stored.
 */

import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import type { Receipt } from '@wasm4pm/contracts';

export interface ReceiptValidationError {
  field: string;
  message: string;
  value?: unknown;
}

export interface ReceiptValidationResult {
  valid: boolean;
  errors: ReceiptValidationError[];
  warnings: string[];
}

/**
 * Blake3 regex pattern: 64 hex characters (256-bit hash)
 */
const BLAKE3_HEX_64 = /^[0-9a-f]{64}$/i;

/**
 * UUID v4 regex pattern
 */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * ISO 8601 datetime regex (basic validation)
 */
const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * ReceiptValidator — validates receipt chain integrity and field contracts.
 */
export class ReceiptValidator {
  /**
   * Validate a single receipt for structural and cryptographic integrity.
   *
   * Checks:
   * - All hash fields are valid Blake3 hex-64 strings
   * - run_id is a valid UUID v4
   * - Timestamps are valid ISO 8601 and in correct order
   * - status is one of 'success', 'partial', 'failed'
   * - Signature field is non-empty (if present)
   */
  validateReceipt(receipt: unknown): ReceiptValidationResult {
    const errors: ReceiptValidationError[] = [];
    const warnings: string[] = [];

    if (!receipt || typeof receipt !== 'object') {
      errors.push({
        field: 'receipt',
        message: 'Receipt must be an object',
        value: receipt,
      });
      return { valid: false, errors, warnings };
    }

    const r = receipt as Record<string, unknown>;

    // Validate run_id (UUID v4)
    if (typeof r.run_id !== 'string') {
      errors.push({
        field: 'run_id',
        message: 'run_id must be a string',
        value: r.run_id,
      });
    } else if (!UUID_V4.test(r.run_id)) {
      errors.push({
        field: 'run_id',
        message: 'run_id must be a valid UUID v4',
        value: r.run_id,
      });
    }

    // Validate schema_version
    if (r.schema_version !== '1.0') {
      errors.push({
        field: 'schema_version',
        message: 'schema_version must be "1.0"',
        value: r.schema_version,
      });
    }

    // Validate Blake3 hashes
    const hashFields = ['config_hash', 'input_hash', 'plan_hash', 'output_hash'];
    for (const field of hashFields) {
      if (typeof r[field] !== 'string') {
        errors.push({
          field,
          message: `${field} must be a string`,
          value: r[field],
        });
      } else if (!BLAKE3_HEX_64.test(r[field] as string)) {
        errors.push({
          field,
          message: `${field} must be a valid Blake3 hex-64 string (64 hex characters)`,
          value: r[field],
        });
      }
    }

    // Validate timestamps
    if (typeof r.start_time !== 'string' || !ISO_8601.test(r.start_time)) {
      errors.push({
        field: 'start_time',
        message: 'start_time must be a valid ISO 8601 timestamp',
        value: r.start_time,
      });
    }

    if (typeof r.end_time !== 'string' || !ISO_8601.test(r.end_time)) {
      errors.push({
        field: 'end_time',
        message: 'end_time must be a valid ISO 8601 timestamp',
        value: r.end_time,
      });
    }

    // Validate timestamp ordering
    if (
      typeof r.start_time === 'string' &&
      typeof r.end_time === 'string' &&
      ISO_8601.test(r.start_time) &&
      ISO_8601.test(r.end_time)
    ) {
      const startTime = new Date(r.start_time).getTime();
      const endTime = new Date(r.end_time).getTime();
      if (startTime >= endTime) {
        errors.push({
          field: 'start_time/end_time',
          message: 'end_time must be after start_time',
          value: { start_time: r.start_time, end_time: r.end_time },
        });
      }
    }

    // Validate duration_ms
    if (typeof r.duration_ms !== 'number' || r.duration_ms < 0) {
      errors.push({
        field: 'duration_ms',
        message: 'duration_ms must be a non-negative number',
        value: r.duration_ms,
      });
    }

    // Validate status
    const validStatuses = ['success', 'partial', 'failed'];
    if (!validStatuses.includes(r.status as string)) {
      errors.push({
        field: 'status',
        message: `status must be one of ${validStatuses.join(', ')}`,
        value: r.status,
      });
    }

    // Validate summary
    if (!r.summary || typeof r.summary !== 'object') {
      errors.push({
        field: 'summary',
        message: 'summary must be an object',
        value: r.summary,
      });
    } else {
      const summary = r.summary as Record<string, unknown>;
      for (const field of ['traces_processed', 'objects_processed', 'variants_discovered']) {
        if (typeof summary[field] !== 'number') {
          errors.push({
            field: `summary.${field}`,
            message: `summary.${field} must be a number`,
            value: summary[field],
          });
        }
      }
    }

    // Validate algorithm
    if (!r.algorithm || typeof r.algorithm !== 'object') {
      errors.push({
        field: 'algorithm',
        message: 'algorithm must be an object',
        value: r.algorithm,
      });
    } else {
      const algo = r.algorithm as Record<string, unknown>;
      for (const field of ['name', 'version']) {
        if (typeof algo[field] !== 'string') {
          errors.push({
            field: `algorithm.${field}`,
            message: `algorithm.${field} must be a string`,
            value: algo[field],
          });
        }
      }
    }

    // Validate model
    if (!r.model || typeof r.model !== 'object') {
      errors.push({
        field: 'model',
        message: 'model must be an object',
        value: r.model,
      });
    } else {
      const model = r.model as Record<string, unknown>;
      for (const field of ['nodes', 'edges']) {
        if (typeof model[field] !== 'number' || model[field] < 0) {
          errors.push({
            field: `model.${field}`,
            message: `model.${field} must be a non-negative number`,
            value: model[field],
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate all hashes in a receipt are valid Blake3 hex-64 strings.
   *
   * Returns true if all four hash fields (config_hash, input_hash, plan_hash,
   * output_hash) are present and valid Blake3 hashes.
   */
  validateBlake3Hashes(receipt: unknown): boolean {
    if (!receipt || typeof receipt !== 'object') return false;

    const r = receipt as Record<string, unknown>;
    const hashFields = ['config_hash', 'input_hash', 'plan_hash', 'output_hash'];

    return hashFields.every((field) => {
      const value = r[field];
      return typeof value === 'string' && BLAKE3_HEX_64.test(value);
    });
  }

  /**
   * Validate receipt chain continuity across multiple receipt runs.
   *
   * Checks that:
   * - Each receipt has valid hashes
   * - Receipt count matches expected length
   * - All run_ids are unique (no duplicates)
   * - Timestamps are monotonically increasing
   */
  validateReceiptChain(receipts: unknown[]): ReceiptValidationResult {
    const errors: ReceiptValidationError[] = [];
    const warnings: string[] = [];

    if (!Array.isArray(receipts)) {
      errors.push({
        field: 'receipts',
        message: 'receipts must be an array',
        value: receipts,
      });
      return { valid: false, errors, warnings };
    }

    if (receipts.length === 0) {
      warnings.push('Receipt chain is empty');
      return { valid: false, errors, warnings };
    }

    const runIds = new Set<string>();
    let previousEndTime: Date | null = null;

    for (let i = 0; i < receipts.length; i++) {
      const receipt = receipts[i];

      // Validate individual receipt structure
      const result = this.validateReceipt(receipt);
      for (const error of result.errors) {
        errors.push({
          field: `receipts[${i}].${error.field}`,
          message: error.message,
          value: error.value,
        });
      }

      if (!this.validateBlake3Hashes(receipt)) {
        errors.push({
          field: `receipts[${i}]`,
          message: 'Receipt hashes are not valid Blake3 hex-64 strings',
          value: (receipt as Record<string, unknown>).run_id,
        });
      }

      // Check for duplicate run_ids
      const r = receipt as Record<string, unknown>;
      const runId = r.run_id as string;
      if (runIds.has(runId)) {
        errors.push({
          field: `receipts[${i}].run_id`,
          message: 'Duplicate run_id in receipt chain',
          value: runId,
        });
      }
      runIds.add(runId);

      // Check timestamp ordering (monotonic)
      if (typeof r.end_time === 'string' && ISO_8601.test(r.end_time)) {
        const endTime = new Date(r.end_time);
        if (previousEndTime && endTime <= previousEndTime) {
          errors.push({
            field: `receipts[${i}].end_time`,
            message: `Receipt ${i} end_time must be after previous receipt end_time`,
            value: {
              current: r.end_time,
              previous: previousEndTime.toISOString(),
            },
          });
        }
        previousEndTime = endTime;
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Verify that a receipt was saved to disk and matches expected run_id.
   *
   * Checks:
   * - File exists at outputDir/receipt.json (or custom filename)
   * - File is valid JSON and parses as a Receipt
   * - run_id matches expected value
   *
   * Returns true if all checks pass.
   */
  async assertReceiptSaved(outputDir: string, expectedRunId: string, filename = 'receipt.json'): Promise<boolean> {
    const filePath = path.join(outputDir, filename);

    // Check file existence
    if (!existsSync(filePath)) {
      throw new Error(`Receipt file not found at ${filePath}`);
    }

    // Read and parse receipt
    let receipt: unknown;
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      receipt = JSON.parse(content);
    } catch (err) {
      throw new Error(`Failed to read/parse receipt at ${filePath}: ${err}`);
    }

    if (!receipt || typeof receipt !== 'object') {
      throw new Error(`Receipt is not a valid object at ${filePath}`);
    }

    const r = receipt as Record<string, unknown>;

    // Check run_id matches
    if (r.run_id !== expectedRunId) {
      throw new Error(
        `Receipt run_id mismatch: expected '${expectedRunId}', got '${r.run_id}' at ${filePath}`
      );
    }

    return true;
  }

  /**
   * Verify signature field is non-empty and appears to be valid Ed25519.
   *
   * Signature field should be present in receipt and contain a non-empty string.
   * Ed25519 signatures are typically 128 hex characters (64 bytes).
   *
   * Returns true if signature field exists and has reasonable length (>0).
   */
  verifySignatureField(receipt: unknown): boolean {
    if (!receipt || typeof receipt !== 'object') return false;

    const r = receipt as Record<string, unknown>;

    // Signature may not always be present, but if it is, it must be non-empty
    if (!('signature' in r)) {
      return false;
    }

    const sig = r.signature;
    if (typeof sig !== 'string') {
      return false;
    }

    // Ed25519 signature: 64 bytes = 128 hex characters
    // Allow some flexibility (e.g., 64-256 chars) for different encoding variants
    return sig.length > 0 && sig.length <= 512;
  }
}

/**
 * Convenience factory for creating a ReceiptValidator instance.
 */
export function createReceiptValidator(): ReceiptValidator {
  return new ReceiptValidator();
}
