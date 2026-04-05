import { describe, it, expect } from 'vitest';
import {
  scanForSecrets,
  scanObjectForSecrets,
  verifyRedaction,
  verifyEnvRedaction,
  TEST_SECRETS,
  REDACTED_VALUES,
} from '../../src/redaction.js';

describe('Redaction Verification', () => {
  describe('scanForSecrets', () => {
    it('detects AWS access keys', () => {
      const violations = scanForSecrets(`Key: ${TEST_SECRETS.awsKey}`);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations.some(v => v.pattern.includes('AWS'))).toBe(true);
    });

    it('detects Bearer tokens', () => {
      const violations = scanForSecrets(`Auth: ${TEST_SECRETS.bearer}`);
      expect(violations.some(v => v.pattern.includes('Bearer'))).toBe(true);
    });

    it('detects Basic auth', () => {
      const violations = scanForSecrets(`Auth: ${TEST_SECRETS.basicAuth}`);
      expect(violations.some(v => v.pattern.includes('Basic'))).toBe(true);
    });

    it('detects JWT tokens', () => {
      const violations = scanForSecrets(`Token: ${TEST_SECRETS.jwt}`);
      expect(violations.some(v => v.pattern.includes('JWT'))).toBe(true);
    });

    it('detects private keys', () => {
      const violations = scanForSecrets(TEST_SECRETS.privateKey);
      expect(violations.some(v => v.pattern.includes('Private Key'))).toBe(true);
    });

    it('detects connection string passwords', () => {
      const violations = scanForSecrets(TEST_SECRETS.connectionString);
      expect(violations.length).toBeGreaterThan(0);
    });

    it('returns empty for clean text', () => {
      const violations = scanForSecrets('This is normal log output with no secrets');
      expect(violations).toHaveLength(0);
    });

    it('includes location info', () => {
      const violations = scanForSecrets(TEST_SECRETS.bearer, 'otel.span.attributes');
      expect(violations[0].location).toBe('otel.span.attributes');
    });

    it('includes snippet', () => {
      const violations = scanForSecrets(`prefix ${TEST_SECRETS.bearer} suffix`);
      expect(violations[0].snippet).toBeDefined();
      expect(violations[0].snippet.length).toBeGreaterThan(0);
    });
  });

  describe('scanObjectForSecrets', () => {
    it('scans nested objects', () => {
      const obj = {
        config: { auth: { password: 's3cretP@ss' } },
      };
      const violations = scanObjectForSecrets(obj);
      expect(violations.some(v => v.pattern.includes('password'))).toBe(true);
    });

    it('scans arrays', () => {
      const obj = {
        headers: [`Authorization: ${TEST_SECRETS.bearer}`],
      };
      const violations = scanObjectForSecrets(obj);
      expect(violations.length).toBeGreaterThan(0);
    });

    it('detects sensitive field names with values', () => {
      const obj = {
        apiToken: 'my-secret-token-value',
        secretKey: 'abc123',
      };
      const violations = scanObjectForSecrets(obj);
      expect(violations.some(v => v.location.includes('apiToken'))).toBe(true);
      expect(violations.some(v => v.location.includes('secretKey'))).toBe(true);
    });

    it('allows redacted sensitive fields', () => {
      const obj = {
        password: '[REDACTED]',
        token: '***',
        secret: '***REDACTED***',
      };
      const violations = scanObjectForSecrets(obj);
      const sensitiveFieldViolations = violations.filter(v => v.pattern.includes('Sensitive field'));
      expect(sensitiveFieldViolations).toHaveLength(0);
    });

    it('handles null and undefined', () => {
      const violations = scanObjectForSecrets(null);
      expect(violations).toHaveLength(0);
    });
  });

  describe('verifyRedaction', () => {
    it('passes for clean output', () => {
      const result = verifyRedaction({
        status: 'success',
        algorithm: 'dfg',
        event_count: 100,
      });
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.scannedFields).toBeGreaterThan(0);
    });

    it('fails for output with secrets', () => {
      const result = verifyRedaction({
        status: 'success',
        auth: { token: TEST_SECRETS.jwt },
      });
      expect(result.passed).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it('includes scan count in details', () => {
      const result = verifyRedaction({ a: 'b', c: 'd' });
      expect(result.details).toContain('fields scanned');
    });
  });

  describe('verifyEnvRedaction', () => {
    it('detects leaked env var values', () => {
      const env = { AWS_SECRET_ACCESS_KEY: 'super-secret-key-123' };
      const output = 'Log: AWS_SECRET_ACCESS_KEY=super-secret-key-123 leaked';
      const violations = verifyEnvRedaction(output, env);
      expect(violations.length).toBeGreaterThan(0);
    });

    it('passes when env values not in output', () => {
      const env = { AWS_SECRET_ACCESS_KEY: 'super-secret-key-123' };
      const output = 'Log: All clear, no secrets here';
      const violations = verifyEnvRedaction(output, env);
      expect(violations).toHaveLength(0);
    });

    it('ignores short env values', () => {
      const env = { API_KEY: 'ab' };
      const output = 'ab is common text';
      const violations = verifyEnvRedaction(output, env);
      expect(violations).toHaveLength(0);
    });
  });

  describe('Test Data', () => {
    it('TEST_SECRETS contains all pattern types', () => {
      expect(TEST_SECRETS.awsKey).toBeDefined();
      expect(TEST_SECRETS.awsSecret).toBeDefined();
      expect(TEST_SECRETS.bearer).toBeDefined();
      expect(TEST_SECRETS.basicAuth).toBeDefined();
      expect(TEST_SECRETS.jwt).toBeDefined();
      expect(TEST_SECRETS.connectionString).toBeDefined();
      expect(TEST_SECRETS.privateKey).toBeDefined();
    });

    it('REDACTED_VALUES provides standard redaction formats', () => {
      expect(REDACTED_VALUES.star).toBe('***');
      expect(REDACTED_VALUES.bracket).toBe('[REDACTED]');
      expect(REDACTED_VALUES.hash).toBe('***REDACTED***');
    });
  });
});
