/**
 * Secret redaction utilities
 * Removes sensitive information before sending to observability layers
 * Per PRD §18.4: Secret redaction in OTEL and JSON logging
 */
/**
 * Secret redaction utility
 */
export declare class SecretRedaction {
    /**
     * Check if a field name is sensitive
     */
    static isSensitiveField(fieldName: string): boolean;
    /**
     * Check if a file path is sensitive
     */
    static isSensitivePath(path: string): boolean;
    /**
     * Redact sensitive fields from an object
     * Recursively processes nested objects and arrays
     */
    static redactObject(obj: any, maxDepth?: number): any;
    /**
     * Redact sensitive fields from configuration
     * Handles both standard config objects and nested values
     */
    static redactConfig(config: any): any;
    /**
     * Redact environment variables
     * Keeps non-sensitive env vars but redacts known sensitive ones
     */
    static redactEnvironment(env: Record<string, string>): Record<string, string>;
    /**
     * Redact file paths containing secrets
     */
    static redactPath(path: string): string;
    /**
     * Check if a string looks like sensitive content
     * (simple heuristics for detecting keys, tokens, etc.)
     */
    private static isSensitiveContent;
    /**
     * Create a redaction report showing what was redacted
     */
    static createRedactionReport(original: any, redacted: any, path?: string): {
        path: string;
        reason: string;
    }[];
}
//# sourceMappingURL=secret-redaction.d.ts.map