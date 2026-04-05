/**
 * Tests for secret redaction module
 * Verifies sensitive data is properly removed before observability emission
 */
import { describe, it, expect } from 'vitest';
import { SecretRedaction } from './secret-redaction';
describe('SecretRedaction', () => {
    describe('Field detection', () => {
        it('should detect sensitive field names', () => {
            expect(SecretRedaction.isSensitiveField('password')).toBe(true);
            expect(SecretRedaction.isSensitiveField('api_key')).toBe(true);
            expect(SecretRedaction.isSensitiveField('apiSecret')).toBe(true);
            expect(SecretRedaction.isSensitiveField('refreshToken')).toBe(true);
            expect(SecretRedaction.isSensitiveField('sessionId')).toBe(true);
            expect(SecretRedaction.isSensitiveField('credentials')).toBe(true);
        });
        it('should not flag non-sensitive fields', () => {
            expect(SecretRedaction.isSensitiveField('username')).toBe(false);
            expect(SecretRedaction.isSensitiveField('email')).toBe(false);
            expect(SecretRedaction.isSensitiveField('userId')).toBe(false);
            expect(SecretRedaction.isSensitiveField('name')).toBe(false);
        });
        it('should be case-insensitive', () => {
            expect(SecretRedaction.isSensitiveField('PASSWORD')).toBe(true);
            expect(SecretRedaction.isSensitiveField('Api_Key')).toBe(true);
            expect(SecretRedaction.isSensitiveField('SECRET')).toBe(true);
        });
    });
    describe('Path detection', () => {
        it('should detect sensitive file paths', () => {
            expect(SecretRedaction.isSensitivePath('config.pem')).toBe(true);
            expect(SecretRedaction.isSensitivePath('private.key')).toBe(true);
            expect(SecretRedaction.isSensitivePath('.env')).toBe(true);
            expect(SecretRedaction.isSensitivePath('secrets/password.txt')).toBe(true);
            expect(SecretRedaction.isSensitivePath('/etc/credentials')).toBe(true);
        });
        it('should not flag regular paths', () => {
            expect(SecretRedaction.isSensitivePath('config.json')).toBe(false);
            expect(SecretRedaction.isSensitivePath('data/events.log')).toBe(false);
            expect(SecretRedaction.isSensitivePath('/var/log/app.log')).toBe(false);
        });
    });
    describe('Object redaction', () => {
        it('should redact simple sensitive fields', () => {
            const obj = {
                username: 'alice',
                password: 'super-secret',
                email: 'alice@example.com',
            };
            const redacted = SecretRedaction.redactObject(obj);
            expect(redacted.username).toBe('alice');
            expect(redacted.password).toBe('[REDACTED]');
            expect(redacted.email).toBe('alice@example.com');
        });
        it('should redact nested objects', () => {
            const obj = {
                user: {
                    name: 'alice',
                    credentials: {
                        password: 'secret123',
                        token: 'token456',
                    },
                },
            };
            const redacted = SecretRedaction.redactObject(obj);
            expect(redacted.user.name).toBe('alice');
            expect(redacted.user.credentials.password).toBe('[REDACTED]');
            expect(redacted.user.credentials.token).toBe('[REDACTED]');
        });
        it('should redact arrays of objects', () => {
            const obj = {
                apiKeys: [
                    { name: 'prod', secret: 'prod-secret-key' },
                    { name: 'dev', secret: 'dev-secret-key' },
                ],
            };
            const redacted = SecretRedaction.redactObject(obj);
            expect(redacted.apiKeys[0].name).toBe('prod');
            expect(redacted.apiKeys[0].secret).toBe('[REDACTED]');
            expect(redacted.apiKeys[1].secret).toBe('[REDACTED]');
        });
        it('should respect max depth', () => {
            const obj = {
                level1: {
                    level2: {
                        level3: {
                            level4: {
                                level5: {
                                    secret: 'deep-secret',
                                },
                            },
                        },
                    },
                },
            };
            const redacted = SecretRedaction.redactObject(obj, 3);
            // Should stop recursing after 3 levels
            expect(redacted.level1.level2.level3.level4).toBeDefined();
        });
    });
    describe('Configuration redaction', () => {
        it('should redact config objects', () => {
            const config = {
                version: '1.0',
                database: {
                    host: 'localhost',
                    port: 5432,
                    password: 'db-secret',
                    apiToken: 'token123',
                },
                logging: {
                    level: 'info',
                },
            };
            const redacted = SecretRedaction.redactConfig(config);
            expect(redacted.version).toBe('1.0');
            expect(redacted.database.host).toBe('localhost');
            expect(redacted.database.password).toBe('[REDACTED]');
            expect(redacted.database.apiToken).toBe('[REDACTED]');
            expect(redacted.logging.level).toBe('info');
        });
    });
    describe('Environment variable redaction', () => {
        it('should redact sensitive environment variables', () => {
            const env = {
                NODE_ENV: 'production',
                API_KEY: 'secret-key-123',
                DATABASE_PASSWORD: 'db-pass',
                HOME: '/home/user',
                USER: 'alice',
            };
            const redacted = SecretRedaction.redactEnvironment(env);
            expect(redacted.NODE_ENV).toBe('production');
            expect(redacted.API_KEY).toBe('[REDACTED]');
            expect(redacted.DATABASE_PASSWORD).toBe('[REDACTED]');
            expect(redacted.HOME).toBe('/home/user');
            expect(redacted.USER).toBe('alice');
        });
        it('should filter internal npm variables', () => {
            const env = {
                npm_package_name: 'my-app',
                npm_package_version: '1.0.0',
                _: '/bin/bash',
                PUBLIC_KEY: 'public-key',
            };
            const redacted = SecretRedaction.redactEnvironment(env);
            // npm_ and _ prefixed vars should be filtered
            expect('npm_package_name' in redacted).toBe(false);
            expect('npm_package_version' in redacted).toBe(false);
            expect('_' in redacted).toBe(false);
            expect(redacted.PUBLIC_KEY).toBe('public-key');
        });
    });
    describe('Path redaction', () => {
        it('should redact sensitive paths', () => {
            expect(SecretRedaction.redactPath('config.pem')).toBe('[REDACTED]');
            expect(SecretRedaction.redactPath('private.key')).toBe('[REDACTED]');
            expect(SecretRedaction.redactPath('.env')).toBe('[REDACTED]');
        });
        it('should preserve regular paths', () => {
            const path = '/var/log/app.log';
            expect(SecretRedaction.redactPath(path)).toBe(path);
        });
    });
    describe('Content detection', () => {
        it('should detect base64-like tokens', () => {
            const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0';
            const redacted = SecretRedaction.redactObject({
                bearerToken: token,
            });
            expect(redacted.bearerToken).toBe('[REDACTED]');
        });
        it('should detect JWT tokens', () => {
            const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
            const redacted = SecretRedaction.redactObject({
                token: jwt,
            });
            expect(redacted.token).toBe('[REDACTED]');
        });
        it('should detect hex-like tokens', () => {
            const hash = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
            const redacted = SecretRedaction.redactObject({
                apiSecret: hash,
            });
            expect(redacted.apiSecret).toBe('[REDACTED]');
        });
        it('should skip short strings', () => {
            const redacted = SecretRedaction.redactObject({
                token: 'abc',
            });
            expect(redacted.token).toBe('abc');
        });
    });
    describe('Redaction reporting', () => {
        it('should generate redaction report', () => {
            const original = {
                user: 'alice',
                password: 'secret',
                database: {
                    host: 'localhost',
                    apiKey: 'key123',
                },
            };
            const redacted = SecretRedaction.redactObject(original);
            const report = SecretRedaction.createRedactionReport(original, redacted);
            expect(report).toHaveLength(2);
            expect(report.some((r) => r.path === 'password')).toBe(true);
            expect(report.some((r) => r.path === 'database.apiKey')).toBe(true);
        });
        it('should report sensitive content patterns', () => {
            const original = {
                token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0',
            };
            const redacted = SecretRedaction.redactObject(original);
            const report = SecretRedaction.createRedactionReport(original, redacted);
            expect(report.length).toBeGreaterThan(0);
            expect(report[0].reason).toBe('Sensitive content pattern');
        });
    });
    describe('Null and undefined handling', () => {
        it('should handle null values', () => {
            const obj = {
                password: null,
                username: 'alice',
            };
            const redacted = SecretRedaction.redactObject(obj);
            expect(redacted.password).toBeNull();
            expect(redacted.username).toBe('alice');
        });
        it('should handle undefined values', () => {
            const obj = {
                password: undefined,
                username: 'alice',
            };
            const redacted = SecretRedaction.redactObject(obj);
            expect(redacted.password).toBeUndefined();
            expect(redacted.username).toBe('alice');
        });
    });
    describe('Date handling', () => {
        it('should preserve dates', () => {
            const date = new Date('2026-04-04T12:00:00Z');
            const obj = {
                created: date,
                password: 'secret',
            };
            const redacted = SecretRedaction.redactObject(obj);
            expect(redacted.created).toEqual(date);
            expect(redacted.password).toBe('[REDACTED]');
        });
    });
});
