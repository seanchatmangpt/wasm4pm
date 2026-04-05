/**
 * Security redaction verification.
 *
 * Tests that secrets, tokens, passwords, and PII are never leaked
 * in logs, receipts, error messages, OTEL spans, or CLI output.
 */

/** Patterns that should NEVER appear in output */
const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'AWS Access Key', pattern: /AKIA[0-9A-Z]{16}/ },
  { name: 'AWS Secret Key', pattern: /[0-9a-zA-Z/+]{40}/ },
  { name: 'Bearer Token', pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/i },
  { name: 'Basic Auth', pattern: /Basic\s+[A-Za-z0-9+/]+=*/i },
  { name: 'API Key Header', pattern: /x-api-key:\s*\S+/i },
  { name: 'Authorization Header', pattern: /authorization:\s*\S+/i },
  { name: 'Password Field', pattern: /"password"\s*:\s*"[^"]+"/i },
  { name: 'Secret Field', pattern: /"secret"\s*:\s*"[^"]+"/i },
  { name: 'Token Field', pattern: /"token"\s*:\s*"[^"]+"/i },
  { name: 'Private Key', pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/ },
  { name: 'Connection String Password', pattern: /password=[^;&\s]+/i },
  { name: 'JWT Token', pattern: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/ },
];

/** Well-known env var names that contain secrets */
const SECRET_ENV_VARS = new Set([
  'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN',
  'DATABASE_URL', 'DB_PASSWORD',
  'API_KEY', 'API_SECRET',
  'OTEL_EXPORTER_OTLP_HEADERS',
  'GITHUB_TOKEN', 'NPM_TOKEN',
  'ENCRYPTION_KEY', 'SIGNING_KEY',
]);

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
export function scanForSecrets(text: string, location = 'unknown'): RedactionViolation[] {
  const violations: RedactionViolation[] = [];
  for (const { name, pattern } of SECRET_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      const start = Math.max(0, match.index - 20);
      const end = Math.min(text.length, match.index + match[0].length + 20);
      violations.push({
        pattern: name,
        location,
        snippet: `...${text.slice(start, end)}...`,
      });
    }
  }
  return violations;
}

/**
 * Deep-scan an object for secret patterns in all string values.
 */
export function scanObjectForSecrets(
  obj: unknown,
  path = 'root',
): RedactionViolation[] {
  const violations: RedactionViolation[] = [];

  if (typeof obj === 'string') {
    violations.push(...scanForSecrets(obj, path));
  } else if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      violations.push(...scanObjectForSecrets(obj[i], `${path}[${i}]`));
    }
  } else if (obj !== null && typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const keyLower = key.toLowerCase();
      if (
        typeof value === 'string' &&
        value.length > 0 &&
        (keyLower.includes('password') ||
         keyLower.includes('secret') ||
         keyLower.includes('token') ||
         keyLower.includes('key') ||
         keyLower.includes('auth'))
      ) {
        // A sensitive-named field has a non-redacted value
        if (!isRedacted(value)) {
          violations.push({
            pattern: `Sensitive field '${key}'`,
            location: `${path}.${key}`,
            snippet: `${key}=${value.slice(0, 10)}...`,
          });
        }
      }
      violations.push(...scanObjectForSecrets(value, `${path}.${key}`));
    }
  }

  return violations;
}

/**
 * Verify that all secret-related fields in an object are properly redacted.
 */
export function verifyRedaction(obj: unknown, location = 'output'): RedactionResult {
  const violations = scanObjectForSecrets(obj, location);
  let scannedFields = 0;

  function count(val: unknown): void {
    if (typeof val === 'string') { scannedFields++; return; }
    if (Array.isArray(val)) { val.forEach(count); return; }
    if (val && typeof val === 'object') {
      scannedFields++;
      Object.values(val as Record<string, unknown>).forEach(count);
    }
  }
  count(obj);

  return {
    passed: violations.length === 0,
    violations,
    scannedFields,
    details: violations.length === 0
      ? `Redaction verified: ${scannedFields} fields scanned, no secrets found`
      : `Found ${violations.length} violations in ${scannedFields} fields: ${violations.map(v => v.pattern).join(', ')}`,
  };
}

/**
 * Verify that env vars with secret names are not present in output.
 */
export function verifyEnvRedaction(output: string, env: Record<string, string | undefined> = process.env as Record<string, string | undefined>): RedactionViolation[] {
  const violations: RedactionViolation[] = [];
  for (const varName of SECRET_ENV_VARS) {
    const value = env[varName];
    if (value && value.length > 3 && output.includes(value)) {
      violations.push({
        pattern: `Env var ${varName}`,
        location: 'output',
        snippet: `${varName}=${value.slice(0, 5)}...`,
      });
    }
  }
  return violations;
}

/**
 * Test data with known secrets for negative testing.
 */
export const TEST_SECRETS = {
  awsKey: 'AKIAIOSFODNN7EXAMPLE',
  awsSecret: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  bearer: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
  basicAuth: 'Basic dXNlcm5hbWU6cGFzc3dvcmQ=',
  jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
  connectionString: 'postgresql://user:password=s3cret@localhost:5432/db',
  privateKey: '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF=\n-----END RSA PRIVATE KEY-----',
};

/** Properly redacted values for positive testing */
export const REDACTED_VALUES = {
  star: '***',
  bracket: '[REDACTED]',
  hash: '***REDACTED***',
  empty: '',
  partial: 'AKI***MPLE',
};

function isRedacted(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    lower === '***' ||
    lower === '[redacted]' ||
    lower === '***redacted***' ||
    lower === 'redacted' ||
    lower.includes('***') ||
    lower.includes('[redacted]') ||
    value.length === 0
  );
}
