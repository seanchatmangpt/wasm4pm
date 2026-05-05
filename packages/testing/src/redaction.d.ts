/**
 * Security redaction verification.
 *
 * Tests that secrets, tokens, passwords, and PII are never leaked
 * in logs, receipts, error messages, OTEL spans, or CLI output.
 */
/** Patterns that should NEVER appear in output */
declare const SECRET_PATTERNS: Array<{
  name: string;
  pattern: RegExp;
}>;
/** Well-known env var names that contain secrets */
declare const SECRET_ENV_VARS: Set<string>;
interface RedactionViolation {
  pattern: string;
  location: string;
  snippet: string;
}
interface RedactionResult {
  passed: boolean;
  violations: RedactionViolation[];
  scannedFields: number;
  details: string;
}
/**
 * Test data with known secrets for negative testing.
 * @internal
 */
declare const TEST_SECRETS: {
  awsKey: string;
  awsSecret: string;
  bearer: string;
  basicAuth: string;
  jwt: string;
  connectionString: string;
  privateKey: string;
};
/** Properly redacted values for positive testing
 * @internal
 */
declare const REDACTED_VALUES: {
  star: string;
  bracket: string;
  hash: string;
  empty: string;
  partial: string;
};
//# sourceMappingURL=redaction.d.ts.map
