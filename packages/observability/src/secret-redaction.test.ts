/**
 * Tests for secret redaction module
 */

import { describe, it, expect } from 'vitest';
import { SecretRedaction } from './secret-redaction';

describe('SecretRedaction', () => {
  describe('Field and path detection', () => {
    it('detects sensitive field names, non-sensitive fields, and is case-insensitive', () => {
      expect(SecretRedaction.isSensitiveField('password')).toBe(true);
      expect(SecretRedaction.isSensitiveField('api_key')).toBe(true);
      expect(SecretRedaction.isSensitiveField('apiSecret')).toBe(true);
      expect(SecretRedaction.isSensitiveField('refreshToken')).toBe(true);
      expect(SecretRedaction.isSensitiveField('sessionId')).toBe(true);
      expect(SecretRedaction.isSensitiveField('credentials')).toBe(true);

      expect(SecretRedaction.isSensitiveField('username')).toBe(false);
      expect(SecretRedaction.isSensitiveField('email')).toBe(false);
      expect(SecretRedaction.isSensitiveField('userId')).toBe(false);
      expect(SecretRedaction.isSensitiveField('name')).toBe(false);

      expect(SecretRedaction.isSensitiveField('PASSWORD')).toBe(true);
      expect(SecretRedaction.isSensitiveField('Api_Key')).toBe(true);
      expect(SecretRedaction.isSensitiveField('SECRET')).toBe(true);
    });

    it('detects sensitive and non-sensitive file paths', () => {
      expect(SecretRedaction.isSensitivePath('config.pem')).toBe(true);
      expect(SecretRedaction.isSensitivePath('private.key')).toBe(true);
      expect(SecretRedaction.isSensitivePath('.env')).toBe(true);
      expect(SecretRedaction.isSensitivePath('secrets/password.txt')).toBe(true);
      expect(SecretRedaction.isSensitivePath('/etc/credentials')).toBe(true);

      expect(SecretRedaction.isSensitivePath('config.json')).toBe(false);
      expect(SecretRedaction.isSensitivePath('data/events.log')).toBe(false);
      expect(SecretRedaction.isSensitivePath('/var/log/app.log')).toBe(false);
    });
  });

  describe('Object redaction', () => {
    it('redacts simple fields, nested objects, arrays, and respects max depth', () => {
      const simple = { username: 'alice', password: 'super-secret', email: 'alice@example.com' };
      const simpleRedacted = SecretRedaction.redactObject(simple);
      expect(simpleRedacted.username).toBe('alice');
      expect(simpleRedacted.password).toBe('[REDACTED]');
      expect(simpleRedacted.email).toBe('alice@example.com');

      const nested = { user: { name: 'alice', credentials: { password: 'secret123', token: 'token456' } } };
      const nestedRedacted = SecretRedaction.redactObject(nested);
      expect(nestedRedacted.user.name).toBe('alice');
      expect(nestedRedacted.user.credentials.password).toBe('[REDACTED]');
      expect(nestedRedacted.user.credentials.token).toBe('[REDACTED]');

      const withArray = { apiKeys: [{ name: 'prod', secret: 'prod-secret-key' }, { name: 'dev', secret: 'dev-secret-key' }] };
      const arrayRedacted = SecretRedaction.redactObject(withArray);
      expect(arrayRedacted.apiKeys[0].name).toBe('prod');
      expect(arrayRedacted.apiKeys[0].secret).toBe('[REDACTED]');
      expect(arrayRedacted.apiKeys[1].secret).toBe('[REDACTED]');

      const deep = { level1: { level2: { level3: { level4: { level5: { secret: 'deep-secret' } } } } } };
      const depthRedacted = SecretRedaction.redactObject(deep, 3);
      expect(depthRedacted.level1.level2.level3.level4).toBeDefined();
    });
  });

  describe('Config and environment redaction', () => {
    it('redacts configs and environments while filtering npm variables', () => {
      const config = {
        version: '1.0',
        database: { host: 'localhost', port: 5432, password: 'db-secret', apiToken: 'token123' },
        logging: { level: 'info' },
      };
      const configRedacted = SecretRedaction.redactConfig(config);
      expect(configRedacted.version).toBe('1.0');
      expect(configRedacted.database.host).toBe('localhost');
      expect(configRedacted.database.password).toBe('[REDACTED]');
      expect(configRedacted.database.apiToken).toBe('[REDACTED]');
      expect(configRedacted.logging.level).toBe('info');

      const env = {
        NODE_ENV: 'production', API_KEY: 'secret-key-123', DATABASE_PASSWORD: 'db-pass',
        HOME: '/home/user', USER: 'alice',
      };
      const envRedacted = SecretRedaction.redactEnvironment(env);
      expect(envRedacted.NODE_ENV).toBe('production');
      expect(envRedacted.API_KEY).toBe('[REDACTED]');
      expect(envRedacted.DATABASE_PASSWORD).toBe('[REDACTED]');
      expect(envRedacted.HOME).toBe('/home/user');
      expect(envRedacted.USER).toBe('alice');

      const npmEnv = { npm_package_name: 'my-app', npm_package_version: '1.0.0', _: '/bin/bash', PUBLIC_KEY: 'public-key' };
      const npmRedacted = SecretRedaction.redactEnvironment(npmEnv);
      expect('npm_package_name' in npmRedacted).toBe(false);
      expect('npm_package_version' in npmRedacted).toBe(false);
      expect('_' in npmRedacted).toBe(false);
      expect(npmRedacted.PUBLIC_KEY).toBe('public-key');
    });
  });

  describe('Path redaction', () => {
    it('redacts sensitive paths and preserves regular paths', () => {
      expect(SecretRedaction.redactPath('config.pem')).toBe('[REDACTED]');
      expect(SecretRedaction.redactPath('private.key')).toBe('[REDACTED]');
      expect(SecretRedaction.redactPath('.env')).toBe('[REDACTED]');
      expect(SecretRedaction.redactPath('/var/log/app.log')).toBe('/var/log/app.log');
    });
  });

  describe('Content detection', () => {
    it('detects base64-like tokens, JWT tokens, hex tokens, and skips short strings', () => {
      const base64Token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0';
      expect(SecretRedaction.redactObject({ bearerToken: base64Token }).bearerToken).toBe('[REDACTED]');

      const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      expect(SecretRedaction.redactObject({ token: jwt }).token).toBe('[REDACTED]');

      const hexHash = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
      expect(SecretRedaction.redactObject({ apiSecret: hexHash }).apiSecret).toBe('[REDACTED]');

      expect(SecretRedaction.redactObject({ token: 'abc' }).token).toBe('abc');
    });
  });

  describe('Redaction reporting and edge cases', () => {
    it('generates reports, handles null/undefined/dates correctly', () => {
      const original = { user: 'alice', password: 'secret', database: { host: 'localhost', apiKey: 'key123' } };
      const redacted = SecretRedaction.redactObject(original);
      const report = SecretRedaction.createRedactionReport(original, redacted);
      expect(report).toHaveLength(2);
      expect(report.some((r) => r.path === 'password')).toBe(true);
      expect(report.some((r) => r.path === 'database.apiKey')).toBe(true);

      const tokenOriginal = { token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0' };
      const tokenRedacted = SecretRedaction.redactObject(tokenOriginal);
      const tokenReport = SecretRedaction.createRedactionReport(tokenOriginal, tokenRedacted);
      expect(tokenReport.length).toBeGreaterThan(0);
      expect(tokenReport[0].reason).toBe('Sensitive content pattern');

      const nullObj = { password: null, username: 'alice' };
      const nullRedacted = SecretRedaction.redactObject(nullObj);
      expect(nullRedacted.password).toBeNull();
      expect(nullRedacted.username).toBe('alice');

      const undefObj = { password: undefined, username: 'alice' };
      const undefRedacted = SecretRedaction.redactObject(undefObj);
      expect(undefRedacted.password).toBeUndefined();
      expect(undefRedacted.username).toBe('alice');

      const date = new Date('2026-04-04T12:00:00Z');
      const dateObj = { created: date, password: 'secret' };
      const dateRedacted = SecretRedaction.redactObject(dateObj);
      expect(dateRedacted.created).toEqual(date);
      expect(dateRedacted.password).toBe('[REDACTED]');
    });
  });
});
