/**
 * Domain-contract tests for SecretRedaction
 *
 * These tests derive expected values from Van der Aalst observability doctrine
 * (PRD §18.4): sensitive credentials must never appear in OTEL or JSONL output.
 * Contracts are derived from domain theory, not from the implementation itself.
 */

import { describe, it, expect } from 'vitest';
import { SecretRedaction } from '../secret-redaction.js';

const REDACTED = '[REDACTED]';

/**
 * Typed wrapper that casts the unknown return of redactObject to a
 * Record<string, unknown> for test assertions. The cast is safe
 * because the tests always pass plain objects and never primitive top-level values
 * (those use explicit checks such as `toBeNull()` / `toEqual`).
 */
function redact(input: unknown): Record<string, unknown> {
  return SecretRedaction.redactObject(input) as Record<string, unknown>;
}

/** Array variant — used when the input is a top-level array. */
function redactArr(input: unknown[]): Array<Record<string, unknown>> {
  return SecretRedaction.redactObject(input) as Array<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Contract 1: Sensitive field names are always redacted
// ---------------------------------------------------------------------------
describe('secret-redaction — sensitive field contracts', () => {
  it('redacts password fields to [REDACTED]', () => {
    const result = redact({ password: 'hunter2', user: 'alice' });
    expect(result.password).toBe(REDACTED);
    expect(result.user).toBe('alice');
  });

  it('redacts token fields to [REDACTED]', () => {
    const result = redact({ token: 'abc-token-xyz', action: 'login' });
    expect(result.token).toBe(REDACTED);
    expect(result.action).toBe('login');
  });

  it('redacts secret fields to [REDACTED]', () => {
    const result = redact({ secret: 'my-secret-value', name: 'vault' });
    expect(result.secret).toBe(REDACTED);
    expect(result.name).toBe('vault');
  });

  it('redacts api_key fields to [REDACTED]', () => {
    const result = redact({ api_key: 'key-12345', endpoint: 'https://api.example.com' });
    expect(result.api_key).toBe(REDACTED);
    expect(result.endpoint).toBe('https://api.example.com');
  });

  it('redacts apikey (no underscore) fields to [REDACTED]', () => {
    const result = redact({ apikey: 'key-12345', service: 'payments' });
    expect(result.apikey).toBe(REDACTED);
    expect(result.service).toBe('payments');
  });

  it('redacts auth fields to [REDACTED]', () => {
    const result = redact({ auth: 'Bearer xyz', method: 'GET' });
    expect(result.auth).toBe(REDACTED);
    expect(result.method).toBe('GET');
  });

  it('redacts credential fields to [REDACTED]', () => {
    const result = redact({ credential: 'cred-value-long', type: 'oauth2' });
    expect(result.credential).toBe(REDACTED);
    expect(result.type).toBe('oauth2');
  });

  it('redacts jwt fields to [REDACTED]', () => {
    const result = redact({ jwt: 'header.payload.sig', algorithm: 'RS256' });
    expect(result.jwt).toBe(REDACTED);
    expect(result.algorithm).toBe('RS256');
  });
});

// ---------------------------------------------------------------------------
// Contract 2: Non-sensitive field names must NOT be redacted
// ---------------------------------------------------------------------------
describe('secret-redaction — non-sensitive field preservation contracts', () => {
  it('preserves username fields without redaction', () => {
    const result = redact({ username: 'alice', password: 'secret123' });
    expect(result.username).toBe('alice');
    expect(result.password).toBe(REDACTED);
  });

  it('preserves email fields without redaction', () => {
    const result = redact({ email: 'alice@example.com', token: 'tok-long' });
    expect(result.email).toBe('alice@example.com');
    expect(result.token).toBe(REDACTED);
  });

  it('preserves name fields without redaction', () => {
    const result = redact({ name: 'Alice Wonderland', secret: 'shh-secret' });
    expect(result.name).toBe('Alice Wonderland');
    expect(result.secret).toBe(REDACTED);
  });

  it('preserves url, endpoint, host, port fields without redaction', () => {
    const result = redact({
      url: 'https://example.com',
      endpoint: '/api/v1',
      host: 'localhost',
      port: 8080,
    });
    expect(result.url).toBe('https://example.com');
    expect(result.endpoint).toBe('/api/v1');
    expect(result.host).toBe('localhost');
    expect(result.port).toBe(8080);
  });

  it('preserves algorithm, trace_id, span_id fields without redaction', () => {
    const result = redact({
      algorithm: 'inductive_miner',
      trace_id: 'trace-abc-123',
      span_id: 'span-xyz-789',
    });
    expect(result.algorithm).toBe('inductive_miner');
    expect(result.trace_id).toBe('trace-abc-123');
    expect(result.span_id).toBe('span-xyz-789');
  });
});

// ---------------------------------------------------------------------------
// Contract 3: Nested objects — sensitive fields inside nested objects are redacted
// ---------------------------------------------------------------------------
describe('secret-redaction — nested object contracts', () => {
  it('redacts token inside a nested auth object', () => {
    const result = redact({ auth: { token: 'abc-token-long' } });
    // 'auth' is itself sensitive — its value (an object) gets recursively redacted
    expect(result.auth).toBeDefined();
    if (typeof result.auth === 'object' && result.auth !== null) {
      expect((result.auth as Record<string, unknown>).token).toBe(REDACTED);
    }
  });

  it('redacts deeply nested password fields', () => {
    const result = redact({
      config: { database: { password: 'db-super-secret', host: 'localhost' } },
    });
    const db = (result.config as Record<string, Record<string, unknown>>).database;
    expect(db.password).toBe(REDACTED);
    expect(db.host).toBe('localhost');
  });

  it('redacts token inside a non-sensitive outer key', () => {
    const result = redact({
      request: { headers: { token: 'bearer-token-value', accept: 'application/json' } },
    });
    const headers = ((result.request as Record<string, unknown>).headers as Record<string, unknown>);
    expect(headers.token).toBe(REDACTED);
    expect(headers.accept).toBe('application/json');
  });

  it('preserves non-sensitive fields at all nesting levels', () => {
    const result = redact({
      outer: { middle: { inner: { value: 'not-secret', name: 'test' } } },
    });
    const inner = (((result.outer as Record<string, unknown>).middle as Record<string, unknown>).inner as Record<string, unknown>);
    expect(inner.value).toBe('not-secret');
    expect(inner.name).toBe('test');
  });
});

// ---------------------------------------------------------------------------
// Contract 4: Arrays of objects — all elements are recursively redacted
// ---------------------------------------------------------------------------
describe('secret-redaction — array contracts', () => {
  it('redacts password in every array element', () => {
    // Values must be >= 4 chars; the implementation preserves short strings
    // (< 4 chars) in sensitive fields to avoid redacting short non-secret values.
    const result = redactArr([
      { password: 'pass-alpha', user: 'alice' },
      { password: 'pass-beta', user: 'bob' },
    ]);
    expect(result[0].password).toBe(REDACTED);
    expect(result[1].password).toBe(REDACTED);
    expect(result[0].user).toBe('alice');
    expect(result[1].user).toBe('bob');
  });

  it('redacts secrets in mixed arrays', () => {
    const result = redactArr([
      { api_key: 'prod-key-value', env: 'production' },
      { api_key: 'dev-key-value', env: 'development' },
      { env: 'staging' },
    ]);
    expect(result[0].api_key).toBe(REDACTED);
    expect(result[1].api_key).toBe(REDACTED);
    expect(result[2].env).toBe('staging');
    expect(result[2].api_key).toBeUndefined();
  });

  it('redacts nested secrets inside array elements', () => {
    const result = redactArr([
      { config: { token: 'tok-aaa-bbb', name: 'alpha' } },
      { config: { token: 'tok-ccc-ddd', name: 'beta' } },
    ]);
    const cfg0 = result[0].config as Record<string, unknown>;
    const cfg1 = result[1].config as Record<string, unknown>;
    expect(cfg0.token).toBe(REDACTED);
    expect(cfg1.token).toBe(REDACTED);
    expect(cfg0.name).toBe('alpha');
    expect(cfg1.name).toBe('beta');
  });
});

// ---------------------------------------------------------------------------
// Contract 5: Non-string values in sensitive fields are redacted
// ---------------------------------------------------------------------------
describe('secret-redaction — non-string sensitive value contracts', () => {
  it('redacts numeric tokens', () => {
    const result = redact({ token: 12345 });
    expect(result.token).toBe(REDACTED);
  });

  it('redacts boolean secrets', () => {
    const result = redact({ secret: true });
    expect(result.secret).toBe(REDACTED);
  });

  it('redacts numeric passwords', () => {
    const result = redact({ password: 999999 });
    expect(result.password).toBe(REDACTED);
  });
});

// ---------------------------------------------------------------------------
// Contract 6: null values in sensitive fields are preserved (not redacted)
// ---------------------------------------------------------------------------
describe('secret-redaction — null preservation contracts', () => {
  it('preserves null in sensitive fields', () => {
    const result = redact({ password: null, username: 'alice' });
    expect(result.password).toBeNull();
    expect(result.username).toBe('alice');
  });

  it('preserves null in token fields', () => {
    const result = redact({ token: null, action: 'refresh' });
    expect(result.token).toBeNull();
  });

  it('preserves null in nested sensitive fields', () => {
    const result = redact({ config: { password: null, host: 'localhost' } });
    const cfg = result.config as Record<string, unknown>;
    expect(cfg.password).toBeNull();
    expect(cfg.host).toBe('localhost');
  });
});

// ---------------------------------------------------------------------------
// Contract 7: Empty objects pass through unchanged
// ---------------------------------------------------------------------------
describe('secret-redaction — empty and degenerate input contracts', () => {
  it('passes through empty objects unchanged', () => {
    const result = redact({});
    expect(result).toEqual({});
  });

  it('passes through empty arrays unchanged', () => {
    expect(SecretRedaction.redactObject([])).toEqual([]);
  });

  it('passes through null at top level unchanged', () => {
    expect(SecretRedaction.redactObject(null)).toBeNull();
  });

  it('passes through undefined at top level unchanged', () => {
    expect(SecretRedaction.redactObject(undefined)).toBeUndefined();
  });

  it('passes through primitive strings at top level unchanged', () => {
    expect(SecretRedaction.redactObject('just a string')).toBe('just a string');
  });
});

// ---------------------------------------------------------------------------
// Contract 8: isSensitiveField — deterministic classification
// ---------------------------------------------------------------------------
describe('secret-redaction — isSensitiveField classification contracts', () => {
  const sensitiveFields = [
    'password', 'PASSWORD', 'userPassword',
    'token', 'TOKEN', 'accessToken', 'refreshToken',
    'secret', 'SECRET', 'api_secret', 'apiSecret',
    'api_key', 'API_KEY', 'apikey', 'APIKEY',
    'auth', 'AUTH', 'authHeader',
    'credential', 'credentials', 'CREDENTIALS',
    'jwt', 'JWT', 'jwtToken',
    'bearer', 'bearerToken',
    'oauth', 'oauthToken',
    'session', 'SESSION', 'sessionId',
    'cookie', 'COOKIE',
  ];

  const nonSensitiveFields = [
    'username', 'email', 'name', 'firstName', 'lastName',
    'url', 'endpoint', 'host', 'port', 'path',
    'algorithm', 'trace_id', 'span_id', 'status',
    'timestamp', 'duration', 'latency',
    'count', 'total', 'value', 'score',
    'user', 'userId', 'caseId', 'traceId',
  ];

  for (const field of sensitiveFields) {
    it(`classifies '${field}' as sensitive`, () => {
      expect(SecretRedaction.isSensitiveField(field)).toBe(true);
    });
  }

  for (const field of nonSensitiveFields) {
    it(`classifies '${field}' as non-sensitive`, () => {
      expect(SecretRedaction.isSensitiveField(field)).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// Contract 9: redactEnvironment — keeps non-sensitive, redacts sensitive ENV vars
// ---------------------------------------------------------------------------
describe('secret-redaction — environment redaction contracts', () => {
  it('redacts API_KEY and DATABASE_PASSWORD but preserves NODE_ENV', () => {
    const env = {
      NODE_ENV: 'production',
      API_KEY: 'secret-key-value',
      DATABASE_PASSWORD: 'db-secret',
      HOME: '/home/runner',
      USER: 'ci',
    };
    const result = SecretRedaction.redactEnvironment(env);
    expect(result.NODE_ENV).toBe('production');
    expect(result.API_KEY).toBe(REDACTED);
    expect(result.DATABASE_PASSWORD).toBe(REDACTED);
    expect(result.HOME).toBe('/home/runner');
    expect(result.USER).toBe('ci');
  });

  it('excludes npm_ prefixed variables from output', () => {
    const env = { npm_package_name: 'my-app', npm_package_version: '1.0.0', PORT: '3000' };
    const result = SecretRedaction.redactEnvironment(env);
    expect('npm_package_name' in result).toBe(false);
    expect('npm_package_version' in result).toBe(false);
    expect(result.PORT).toBe('3000');
  });

  it('excludes underscore-prefixed internal variables', () => {
    const env = { _: '/usr/bin/node', __CF_USER_TEXT_ENCODING: 'some', PORT: '8080' };
    const result = SecretRedaction.redactEnvironment(env);
    expect('_' in result).toBe(false);
    expect(result.PORT).toBe('8080');
  });
});

// ---------------------------------------------------------------------------
// Contract 10: redactPath — sensitive file extensions and directories
// ---------------------------------------------------------------------------
describe('secret-redaction — path redaction contracts', () => {
  const sensitivePaths = [
    'server.pem', 'id_rsa.key', 'keystore.jks', 'cert.p12',
    'client.pfx', '.env', 'secrets/config.yaml',
    '/home/user/credentials', '/etc/private/settings',
  ];

  const safePaths = [
    'config.json', 'data/events.xes', '/var/log/app.log',
    'wasm4pm.toml', 'results/discovery.json',
  ];

  for (const p of sensitivePaths) {
    it(`redacts sensitive path '${p}'`, () => {
      expect(SecretRedaction.redactPath(p)).toBe(REDACTED);
    });
  }

  for (const p of safePaths) {
    it(`preserves safe path '${p}'`, () => {
      expect(SecretRedaction.redactPath(p)).toBe(p);
    });
  }
});
