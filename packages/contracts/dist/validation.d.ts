/**
 * Receipt validation and tampering detection
 * Verifies cryptographic integrity of receipts
 */
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
export declare function validateReceipt(receipt: unknown): ValidationResult;
/**
 * Verify that provided hashes match expected content
 * @param receipt Receipt with hashes to verify
 * @param config Configuration object
 * @param input Input data
 * @param plan Execution plan
 * @returns Validation result with hash verification
 */
export declare function verifyReceiptHashes(receipt: unknown, config: Record<string, any>, input: any, plan: Record<string, any>): ValidationResult;
/**
 * Verify a complete receipt against expected hashes for all 5 hash fields
 * Per task requirement: verify receipt with known inputs produces expected BLAKE3 output
 * @param receipt Receipt to verify
 * @param expectedHashes Expected BLAKE3 hashes for all fields
 * @returns Validation result with complete hash verification
 */
export declare function verifyReceipt(receipt: unknown, expectedHashes: {
    config_hash: string;
    input_hash: string;
    plan_hash: string;
    output_hash: string;
}): ValidationResult;
/**
 * Detect if receipt has been tampered with by comparing hashes
 * @param receipt Receipt to check
 * @param config Configuration object
 * @param input Input data
 * @param plan Execution plan
 * @returns True if any hash mismatches detected
 */
export declare function detectTampering(receipt: unknown, config: Record<string, any>, input: any, plan: Record<string, any>): boolean;
//# sourceMappingURL=validation.d.ts.map