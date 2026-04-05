/**
 * Secret redaction utilities
 * Removes sensitive information before sending to observability layers
 * Per PRD §18.4: Secret redaction in OTEL and JSON logging
 */

/**
 * Sensitive field patterns that should be redacted
 */
const SENSITIVE_FIELD_PATTERNS = [
  // Explicit field names
  /password/i,
  /token/i,
  /secret/i,
  /api_?key/i,
  /apikey/i,
  /api_?secret/i,
  /access_?key/i,
  /secret_?key/i,
  /auth/i,
  /credential/i,
  /jwt/i,
  /bearer/i,
  /oauth/i,
  /refresh_?token/i,
  /session/i,
  /cookie/i,
];

/**
 * Path patterns indicating sensitive files
 */
const SENSITIVE_PATH_PATTERNS = [
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /\.jks$/i,
  /\.keystore$/i,
  /\.env$/i,
  /secrets/i,
  /credentials/i,
  /private/i,
];

/**
 * Placeholder for redacted values
 */
const REDACTED_PLACEHOLDER = '[REDACTED]';

/**
 * Secret redaction utility
 */
export class SecretRedaction {
  /**
   * Check if a field name is sensitive
   */
  static isSensitiveField(fieldName: string): boolean {
    return SENSITIVE_FIELD_PATTERNS.some((pattern) => pattern.test(fieldName));
  }

  /**
   * Check if a file path is sensitive
   */
  static isSensitivePath(path: string): boolean {
    return SENSITIVE_PATH_PATTERNS.some((pattern) => pattern.test(path));
  }

  /**
   * Redact sensitive fields from an object
   * Recursively processes nested objects and arrays
   */
  static redactObject(obj: any, maxDepth = 10): any {
    if (maxDepth <= 0) {
      return obj;
    }

    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj !== 'object') {
      return obj;
    }

    if (obj instanceof Date) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.redactObject(item, maxDepth - 1));
    }

    const redacted: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (this.isSensitiveField(key)) {
        redacted[key] = REDACTED_PLACEHOLDER;
      } else if (typeof value === 'object' && value !== null) {
        redacted[key] = this.redactObject(value, maxDepth - 1);
      } else if (typeof value === 'string' && this.isSensitiveContent(value)) {
        redacted[key] = REDACTED_PLACEHOLDER;
      } else {
        redacted[key] = value;
      }
    }

    return redacted;
  }

  /**
   * Redact sensitive fields from configuration
   * Handles both standard config objects and nested values
   */
  static redactConfig(config: any): any {
    return this.redactObject(config);
  }

  /**
   * Redact environment variables
   * Keeps non-sensitive env vars but redacts known sensitive ones
   */
  static redactEnvironment(env: Record<string, string>): Record<string, string> {
    const redacted: Record<string, string> = {};

    for (const [key, value] of Object.entries(env)) {
      if (this.isSensitiveField(key)) {
        redacted[key] = REDACTED_PLACEHOLDER;
      } else if (key.startsWith('_') || key.startsWith('npm_')) {
        // Skip internal variables
        continue;
      } else {
        redacted[key] = value;
      }
    }

    return redacted;
  }

  /**
   * Redact file paths containing secrets
   */
  static redactPath(path: string): string {
    if (this.isSensitivePath(path)) {
      return REDACTED_PLACEHOLDER;
    }
    return path;
  }

  /**
   * Check if a string looks like sensitive content
   * (simple heuristics for detecting keys, tokens, etc.)
   */
  private static isSensitiveContent(value: string): boolean {
    if (typeof value !== 'string') {
      return false;
    }

    // Skip short strings
    if (value.length < 10) {
      return false;
    }

    // Detect base64-like tokens (common for API keys, JWTs)
    if (/^[A-Za-z0-9\-_+/=]{40,}$/.test(value)) {
      return true;
    }

    // Detect hex-like tokens (UUIDs, hashes)
    if (/^[a-f0-9]{32,}$/i.test(value)) {
      return true;
    }

    // Detect JWT pattern (three base64 parts separated by dots)
    if (/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(value)) {
      return true;
    }

    return false;
  }

  /**
   * Create a redaction report showing what was redacted
   */
  static createRedactionReport(original: any, redacted: any, path = ''): { path: string; reason: string }[] {
    const report: { path: string; reason: string }[] = [];

    if (typeof original !== 'object' || original === null) {
      return report;
    }

    if (Array.isArray(original)) {
      for (let i = 0; i < original.length; i++) {
        report.push(...this.createRedactionReport(original[i], redacted[i], `${path}[${i}]`));
      }
      return report;
    }

    for (const [key, value] of Object.entries(original)) {
      const currentPath = path ? `${path}.${key}` : key;

      if (this.isSensitiveField(key)) {
        report.push({
          path: currentPath,
          reason: 'Sensitive field name',
        });
      } else if (typeof value === 'string' && this.isSensitiveContent(value)) {
        report.push({
          path: currentPath,
          reason: 'Sensitive content pattern',
        });
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)) {
        report.push(...this.createRedactionReport(value, redacted[key], currentPath));
      }
    }

    return report;
  }
}
