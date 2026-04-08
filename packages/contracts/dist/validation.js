/**
 * Receipt validation and tampering detection
 * Verifies cryptographic integrity of receipts
 */
import { verifyHash } from './hash.js';
/**
 * Validate receipt structure and all required fields
 * @param receipt Receipt to validate
 * @returns Validation result
 */
export function validateReceipt(receipt) {
    const errors = [];
    const warnings = [];
    if (!receipt || typeof receipt !== 'object') {
        errors.push('Invalid receipt structure or missing required fields');
        return { valid: false, errors, warnings };
    }
    const r = receipt;
    // Check required string fields
    const requiredStrings = ['run_id', 'schema_version', 'config_hash', 'input_hash', 'plan_hash', 'output_hash', 'start_time', 'end_time'];
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
    // Schema version check
    if (r.schema_version !== '1.0') {
        warnings.push(`Unknown schema version: ${r.schema_version}`);
    }
    // Validate run_id is a valid UUID
    if (!isValidUUID(r.run_id)) {
        errors.push('run_id is not a valid UUID');
    }
    // Validate hash format (BLAKE3 hashes are 64 hex characters)
    const hashErrors = validateHashFormats(r);
    errors.push(...hashErrors);
    // Validate timestamps are ISO 8601
    if (!isValidISO8601(r.start_time)) {
        errors.push('start_time is not valid ISO 8601');
    }
    if (!isValidISO8601(r.end_time)) {
        errors.push('end_time is not valid ISO 8601');
    }
    // Validate duration
    if (r.duration_ms < 0) {
        errors.push('duration_ms must be non-negative');
    }
    // Validate status
    if (!['success', 'partial', 'failed'].includes(r.status)) {
        errors.push(`Invalid status: ${r.status}`);
    }
    // If status is failed or partial, error should be present
    if ((r.status === 'failed' || r.status === 'partial') && !r.error) {
        warnings.push(`status is ${r.status} but no error information provided`);
    }
    // Validate summary
    if (typeof r.summary.traces_processed !== 'number' ||
        typeof r.summary.objects_processed !== 'number' ||
        typeof r.summary.variants_discovered !== 'number') {
        errors.push('Invalid summary: missing or non-numeric fields');
    }
    // Validate algorithm
    if (!r.algorithm.name || !r.algorithm.version) {
        errors.push('Algorithm missing name or version');
    }
    // Validate model
    if (typeof r.model.nodes !== 'number' || typeof r.model.edges !== 'number') {
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
export function verifyReceiptHashes(receipt, config, input, plan) {
    const structureResult = validateReceipt(receipt);
    if (!structureResult.valid) {
        return structureResult;
    }
    const r = receipt;
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
 * Detect if receipt has been tampered with by comparing hashes
 * @param receipt Receipt to check
 * @param config Configuration object
 * @param input Input data
 * @param plan Execution plan
 * @returns True if any hash mismatches detected
 */
export function detectTampering(receipt, config, input, plan) {
    const result = verifyReceiptHashes(receipt, config, input, plan);
    return !result.valid && result.errors.some((err) => err.includes('hash mismatch'));
}
/**
 * Check if string is a valid UUID (v4)
 */
function isValidUUID(uuid) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
}
/**
 * Check if string is valid ISO 8601 timestamp
 */
function isValidISO8601(timestamp) {
    try {
        const date = new Date(timestamp);
        // Check if parsing succeeded and date is valid
        return date instanceof Date && !isNaN(date.getTime());
    }
    catch {
        return false;
    }
}
/**
 * Validate BLAKE3 hash format (64 hex characters)
 */
function validateHashFormats(receipt) {
    const errors = [];
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
//# sourceMappingURL=validation.js.map