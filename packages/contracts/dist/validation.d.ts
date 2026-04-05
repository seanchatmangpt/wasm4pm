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
 * Detect if receipt has been tampered with by comparing hashes
 * @param receipt Receipt to check
 * @param config Configuration object
 * @param input Input data
 * @param plan Execution plan
 * @returns True if any hash mismatches detected
 */
export declare function detectTampering(receipt: unknown, config: Record<string, any>, input: any, plan: Record<string, any>): boolean;
//# sourceMappingURL=validation.d.ts.map