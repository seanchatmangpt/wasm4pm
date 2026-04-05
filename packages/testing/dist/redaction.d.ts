/**
 * Security redaction verification.
 *
 * Tests that secrets, tokens, passwords, and PII are never leaked
 * in logs, receipts, error messages, OTEL spans, or CLI output.
 */
export interface RedactionViolation {
    pattern: string;
    location: string;
    snippet: string;
}
export interface RedactionResult {
    passed: boolean;
    violations: RedactionViolation[];
    scannedFields: number;
    details: string;
}
/**
 * Scan a string for secret patterns.
 */
export declare function scanForSecrets(text: string, location?: string): RedactionViolation[];
/**
 * Deep-scan an object for secret patterns in all string values.
 */
export declare function scanObjectForSecrets(obj: unknown, path?: string): RedactionViolation[];
/**
 * Verify that all secret-related fields in an object are properly redacted.
 */
export declare function verifyRedaction(obj: unknown, location?: string): RedactionResult;
/**
 * Verify that env vars with secret names are not present in output.
 */
export declare function verifyEnvRedaction(output: string, env?: Record<string, string | undefined>): RedactionViolation[];
/**
 * Test data with known secrets for negative testing.
 */
export declare const TEST_SECRETS: {
    awsKey: string;
    awsSecret: string;
    bearer: string;
    basicAuth: string;
    jwt: string;
    connectionString: string;
    privateKey: string;
};
/** Properly redacted values for positive testing */
export declare const REDACTED_VALUES: {
    star: string;
    bracket: string;
    hash: string;
    empty: string;
    partial: string;
};
//# sourceMappingURL=redaction.d.ts.map