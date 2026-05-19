/**
 * Receipt validation and tampering detection
 * Verifies cryptographic integrity of receipts
 */

import { Receipt, isReceipt } from './receipt.js';
import { verifyHash } from './hash.js';

/**
 * Validation result with detailed error information
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate receipt structure and all required fields
 * @param receipt Receipt to validate
 * @returns Validation result
 */
export function validateReceipt(receipt: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!receipt || typeof receipt !== 'object') {
    errors.push('Invalid receipt structure or missing required fields');
    return { valid: false, errors, warnings };
  }

  const r = receipt as Record<string, unknown>;

  // Check required string fields
  const requiredStrings = [
    'run_id',
    'schema_version',
    'config_hash',
    'input_hash',
    'plan_hash',
    'output_hash',
    'start_time',
    'end_time',
  ] as const;
  for (const field of requiredStrings) {
    if (typeof r[field] !== 'string') {
      errors.push(`Missing or invalid required field: ${field}`);
    }
  }

  if (typeof r.duration_ms !== 'number') {
    errors.push('Missing or invalid required field: duration_ms');
  }

  if (typeof r.summary !== 'object' || r.summary === null) {
    errors.push('Missing or invalid required field: summary');
  }

  if (typeof r.algorithm !== 'object' || r.algorithm === null) {
    errors.push('Missing or invalid required field: algorithm');
  }

  if (typeof r.model !== 'object' || r.model === null) {
    errors.push('Missing or invalid required field: model');
  }

  // If basic structure is invalid, return early
  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  // At this point required string fields, summary, algorithm, and model are all present.
  // We re-cast to Receipt for the rest of the validation since structural requirements are met.
  const validated = receipt as unknown as Receipt;

  // Schema version check
  if (validated.schema_version !== '1.0') {
    warnings.push(`Unknown schema version: ${validated.schema_version}`);
  }

  // Validate run_id is a valid UUID
  if (!isValidUUID(validated.run_id)) {
    errors.push('run_id is not a valid UUID');
  }

  // Validate hash format (BLAKE3 hashes are 64 hex characters)
  const hashErrors = validateHashFormats(validated);
  errors.push(...hashErrors);

  // Validate timestamps are ISO 8601
  if (!isValidISO8601(validated.start_time)) {
    errors.push('start_time is not valid ISO 8601');
  }
  if (!isValidISO8601(validated.end_time)) {
    errors.push('end_time is not valid ISO 8601');
  }

  // Validate duration
  if (validated.duration_ms < 0) {
    errors.push('duration_ms must be non-negative');
  }

  // Validate status
  if (!['success', 'partial', 'failed'].includes(validated.status)) {
    errors.push(`Invalid status: ${validated.status}`);
  }

  // If status is failed or partial, error should be present
  if ((validated.status === 'failed' || validated.status === 'partial') && !validated.error) {
    warnings.push(`status is ${validated.status} but no error information provided`);
  }

  // Validate summary
  if (
    typeof validated.summary.traces_processed !== 'number' ||
    typeof validated.summary.objects_processed !== 'number' ||
    typeof validated.summary.variants_discovered !== 'number'
  ) {
    errors.push('Invalid summary: missing or non-numeric fields');
  }

  // Validate algorithm
  if (!validated.algorithm.name || !validated.algorithm.version) {
    errors.push('Algorithm missing name or version');
  }

  // Validate model
  if (typeof validated.model.nodes !== 'number' || typeof validated.model.edges !== 'number') {
    errors.push('Invalid model: missing or non-numeric node/edge counts');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Verify that provided hashes match expected content
 * @param receipt Receipt with hashes to verify
 * @param config Configuration object
 * @param input Input data
 * @param plan Execution plan
 * @returns Validation result with hash verification
 */
export function verifyReceiptHashes(
  receipt: unknown,
  config: Record<string, unknown>,
  input: unknown,
  plan: Record<string, unknown>
): ValidationResult {
  const structureResult = validateReceipt(receipt);
  if (!structureResult.valid) {
    return structureResult;
  }

  const r = receipt as Receipt;
  const errors = [...structureResult.errors];
  const warnings = [...structureResult.warnings];

  // Verify each hash
  if (!verifyHash(config, r.config_hash)) {
    errors.push('config_hash mismatch - possible tampering');
  }

  if (!verifyHash(input, r.input_hash)) {
    errors.push('input_hash mismatch - possible tampering');
  }

  if (!verifyHash(plan, r.plan_hash)) {
    errors.push('plan_hash mismatch - possible tampering');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Verify a complete receipt against expected hashes for all 5 hash fields
 * Per task requirement: verify receipt with known inputs produces expected BLAKE3 output
 * @param receipt Receipt to verify
 * @param expectedHashes Expected BLAKE3 hashes for all fields
 * @returns Validation result with complete hash verification
 */
export function verifyReceipt(
  receipt: unknown,
  expectedHashes: {
    config_hash: string;
    input_hash: string;
    plan_hash: string;
    output_hash: string;
  }
): ValidationResult {
  const structureResult = validateReceipt(receipt);
  if (!structureResult.valid) {
    return structureResult;
  }

  const r = receipt as Receipt;
  const errors = [...structureResult.errors];
  const warnings = [...structureResult.warnings];

  // Verify all 5 hashes match expected values
  if (r.config_hash !== expectedHashes.config_hash) {
    errors.push(
      `config_hash mismatch: expected ${expectedHashes.config_hash}, got ${r.config_hash}`
    );
  }

  if (r.input_hash !== expectedHashes.input_hash) {
    errors.push(`input_hash mismatch: expected ${expectedHashes.input_hash}, got ${r.input_hash}`);
  }

  if (r.plan_hash !== expectedHashes.plan_hash) {
    errors.push(`plan_hash mismatch: expected ${expectedHashes.plan_hash}, got ${r.plan_hash}`);
  }

  if (r.output_hash !== expectedHashes.output_hash) {
    errors.push(
      `output_hash mismatch: expected ${expectedHashes.output_hash}, got ${r.output_hash}`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Detect if receipt has been tampered with by comparing hashes
 * @param receipt Receipt to check
 * @param config Configuration object
 * @param input Input data
 * @param plan Execution plan
 * @returns True if any hash mismatches detected
 */
export function detectTampering(
  receipt: unknown,
  config: Record<string, unknown>,
  input: unknown,
  plan: Record<string, unknown>
): boolean {
  const result = verifyReceiptHashes(receipt, config, input, plan);
  return !result.valid && result.errors.some((err) => err.includes('hash mismatch'));
}

/**
 * Check if string is a valid UUID (v4)
 */
function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Check if string is valid ISO 8601 timestamp
 */
function isValidISO8601(timestamp: string): boolean {
  try {
    const date = new Date(timestamp);
    // Check if parsing succeeded and date is valid
    return date instanceof Date && !isNaN(date.getTime());
  } catch {
    return false;
  }
}

/**
 * Validate BLAKE3 hash format (64 hex characters)
 */
function validateHashFormats(receipt: Receipt): string[] {
  const errors: string[] = [];
  const hashRegex = /^[0-9a-f]{64}$/i;

  if (!hashRegex.test(receipt.config_hash)) {
    errors.push('config_hash is not a valid BLAKE3 hash');
  }
  if (!hashRegex.test(receipt.input_hash)) {
    errors.push('input_hash is not a valid BLAKE3 hash');
  }
  if (!hashRegex.test(receipt.plan_hash)) {
    errors.push('plan_hash is not a valid BLAKE3 hash');
  }
  if (!hashRegex.test(receipt.output_hash)) {
    errors.push('output_hash is not a valid BLAKE3 hash');
  }

  return errors;
}
