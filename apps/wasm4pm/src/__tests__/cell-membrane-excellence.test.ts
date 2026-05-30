/**
 * cell-membrane-excellence.test.ts
 *
 * Validates the dramatically improved wpm cell and wpm membrane commands:
 *
 *  Cell tests:
 *  1. `wpm cell build --help` exits 0 and shows build options
 *  2. `wpm cell list` exits 0 (even if parts dir is empty)
 *  3. `wpm cell verify --help` exits 0
 *  4. `wpm cell list --format json` exits 0 and produces valid JSON payload
 *
 *  Membrane tests:
 *  5. `wpm membrane features` exits 0 (browser default profile)
 *  6. `wpm membrane features --format json` contains enabled_features and disabled_features
 *  7. `wpm membrane features --profile mobile` shows mobile profile features
 *  8. JSON output from `wpm membrane features` contains `active_algorithms` count
 *  9. `wpm membrane features --profile fog --format json` shows fog profile
 * 10. `wpm membrane features --profile invalid` exits non-zero (config error)
 * 11. `wpm membrane list` exits 0 (even if no envelopes)
 */

import { describe, it, expect } from 'vitest';
import { runCli, EXIT_CODES } from '@wasm4pm/testing';

/**
 * Parse the first complete JSON object from stdout.
 * Some membrane subcommands emit an extra info line at the end (parent command fires).
 */
function parseFirstJson(stdout: string): Record<string, unknown> {
  // Try the whole thing first
  try {
    return JSON.parse(stdout) as Record<string, unknown>;
  } catch {
    // Extract the first top-level object by scanning for balanced braces
    let depth = 0;
    let start = -1;
    for (let i = 0; i < stdout.length; i++) {
      if (stdout[i] === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (stdout[i] === '}') {
        depth--;
        if (depth === 0 && start >= 0) {
          return JSON.parse(stdout.slice(start, i + 1)) as Record<string, unknown>;
        }
      }
    }
    throw new Error(`No valid JSON object found in: ${stdout.slice(0, 200)}`);
  }
}

// ---------------------------------------------------------------------------
// wpm cell tests
// ---------------------------------------------------------------------------

describe('wpm cell build --help', () => {
  it('exits 0 and shows build options', async () => {
    const result = await runCli(['cell', 'build', '--help']);
    expect(result.exitCode).toBe(EXIT_CODES.success);
    // Help text should mention ontology and key options
    const out = result.stdout + result.stderr;
    expect(out.toLowerCase()).toMatch(/ontology|cell|build|manufacture/);
  });
});

describe('wpm cell verify --help', () => {
  it('exits 0 and shows verify options', async () => {
    const result = await runCli(['cell', 'verify', '--help']);
    expect(result.exitCode).toBe(EXIT_CODES.success);
    const out = result.stdout + result.stderr;
    expect(out.toLowerCase()).toMatch(/verify|cell|blake3|layer/i);
  });
});

describe('wpm cell list', () => {
  it('exits 0 even when parts directory is empty or missing', async () => {
    const result = await runCli(['cell', 'list']);
    expect(result.exitCode).toBe(EXIT_CODES.success);
  });

  it('human output mentions manufactured parts or empty state', async () => {
    const result = await runCli(['cell', 'list']);
    const out = result.stdout + result.stderr;
    // Either shows the table header or the empty-state message
    expect(out.toLowerCase()).toMatch(/cell8|parts|manufactured|no parts found/i);
  });
});

describe('wpm cell list --format json', () => {
  it('exits 0 and produces valid JSON with parts array', async () => {
    const result = await runCli(['cell', 'list', '--format', 'json']);
    expect(result.exitCode).toBe(EXIT_CODES.success);

    let parsed: Record<string, unknown>;
    try {
      parsed = parseFirstJson(result.stdout);
    } catch {
      throw new Error(`stdout is not valid JSON: ${result.stdout.slice(0, 200)}`);
    }

    // The outer envelope
    expect(parsed).toHaveProperty('status');
    const payload = parsed.payload as Record<string, unknown>;
    expect(payload).toHaveProperty('count');
    expect(payload).toHaveProperty('parts');
    expect(Array.isArray(payload.parts)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// wpm membrane features tests
// ---------------------------------------------------------------------------

describe('wpm membrane features (default browser profile)', () => {
  it('exits 0', async () => {
    const result = await runCli(['membrane', 'features']);
    expect(result.exitCode).toBe(EXIT_CODES.success);
  });

  it('human output shows enabled and disabled features', async () => {
    const result = await runCli(['membrane', 'features']);
    expect(result.exitCode).toBe(EXIT_CODES.success);
    const out = result.stdout;
    expect(out).toMatch(/ENABLED features/i);
    expect(out).toMatch(/DISABLED features/i);
  });

  it('shows feature-conformance-basic as enabled', async () => {
    const result = await runCli(['membrane', 'features']);
    expect(result.exitCode).toBe(EXIT_CODES.success);
    expect(result.stdout).toContain('feature-conformance-basic');
  });
});

describe('wpm membrane features --format json', () => {
  it('exits 0 and produces valid JSON', async () => {
    const result = await runCli(['membrane', 'features', '--format', 'json']);
    expect(result.exitCode).toBe(EXIT_CODES.success);

    let parsed: Record<string, unknown>;
    try {
      parsed = parseFirstJson(result.stdout);
    } catch {
      throw new Error(`stdout is not valid JSON: ${result.stdout.slice(0, 200)}`);
    }
    expect(parsed).toHaveProperty('status');
    // status is 'ok' or 'success' depending on the command envelope
    expect(['ok', 'success']).toContain(parsed.status);
  });

  it('payload contains enabled_features and disabled_features arrays', async () => {
    const result = await runCli(['membrane', 'features', '--format', 'json']);
    const parsed = parseFirstJson(result.stdout) as Record<string, unknown>;
    const payload = parsed.payload as Record<string, unknown>;

    expect(payload).toHaveProperty('enabled_features');
    expect(payload).toHaveProperty('disabled_features');
    expect(Array.isArray(payload.enabled_features)).toBe(true);
    expect(Array.isArray(payload.disabled_features)).toBe(true);
    // Browser profile should have more enabled than disabled
    const enabled = payload.enabled_features as unknown[];
    const disabled = payload.disabled_features as unknown[];
    expect(enabled.length).toBeGreaterThan(disabled.length);
  });

  it('payload contains active_algorithms count', async () => {
    const result = await runCli(['membrane', 'features', '--format', 'json']);
    const parsed = parseFirstJson(result.stdout) as Record<string, unknown>;
    const payload = parsed.payload as Record<string, unknown>;

    expect(payload).toHaveProperty('active_algorithms');
    expect(typeof payload.active_algorithms).toBe('number');
    // browser profile has 38 algorithms
    expect(payload.active_algorithms as number).toBeGreaterThan(0);
  });

  it('payload contains profile field', async () => {
    const result = await runCli(['membrane', 'features', '--format', 'json']);
    const parsed = parseFirstJson(result.stdout) as Record<string, unknown>;
    const payload = parsed.payload as Record<string, unknown>;

    expect(payload).toHaveProperty('profile');
    expect(payload.profile).toBe('browser');
  });
});

describe('wpm membrane features --profile mobile', () => {
  it('exits 0 and shows mobile profile', async () => {
    const result = await runCli(['membrane', 'features', '--profile', 'mobile']);
    expect(result.exitCode).toBe(EXIT_CODES.success);
    expect(result.stdout).toContain('mobile');
  });

  it('mobile profile has fewer enabled features than browser', async () => {
    const [mobile, browser] = await Promise.all([
      runCli(['membrane', 'features', '--profile', 'mobile', '--format', 'json']),
      runCli(['membrane', 'features', '--profile', 'browser', '--format', 'json']),
    ]);

    const mobilePayload = parseFirstJson(mobile.stdout).payload as Record<string, unknown>;
    const browserPayload = parseFirstJson(browser.stdout).payload as Record<string, unknown>;

    const mobileEnabled = (mobilePayload.enabled_features as unknown[]).length;
    const browserEnabled = (browserPayload.enabled_features as unknown[]).length;
    expect(mobileEnabled).toBeLessThan(browserEnabled);
  });

  it('mobile active_algorithms is less than browser', async () => {
    const [mobile, browser] = await Promise.all([
      runCli(['membrane', 'features', '--profile', 'mobile', '--format', 'json']),
      runCli(['membrane', 'features', '--profile', 'browser', '--format', 'json']),
    ]);

    const mobileAlgos = (parseFirstJson(mobile.stdout).payload as Record<string, unknown>).active_algorithms as number;
    const browserAlgos = (parseFirstJson(browser.stdout).payload as Record<string, unknown>).active_algorithms as number;
    expect(mobileAlgos).toBeLessThan(browserAlgos);
  });
});

describe('wpm membrane features --profile fog --format json', () => {
  it('exits 0 and shows fog profile with correct algorithm count', async () => {
    const result = await runCli(['membrane', 'features', '--profile', 'fog', '--format', 'json']);
    expect(result.exitCode).toBe(EXIT_CODES.success);

    const parsed = parseFirstJson(result.stdout) as Record<string, unknown>;
    const payload = parsed.payload as Record<string, unknown>;
    expect(payload.profile).toBe('fog');
    // fog has 36 algorithms per registry
    expect(payload.active_algorithms as number).toBeGreaterThanOrEqual(30);
  });

  it('fog profile does not include feature-powl (browser only)', async () => {
    const result = await runCli(['membrane', 'features', '--profile', 'fog', '--format', 'json']);
    const parsed = parseFirstJson(result.stdout) as Record<string, unknown>;
    const payload = parsed.payload as Record<string, unknown>;
    const disabled = payload.disabled_features as Array<{ name: string }>;
    const powlDisabled = disabled.some((f) => f.name === 'feature-powl');
    expect(powlDisabled).toBe(true);
  });
});

describe('wpm membrane features --profile invalid', () => {
  it('exits non-zero (config error) for invalid profile', async () => {
    const result = await runCli(['membrane', 'features', '--profile', 'invalid']);
    expect(result.exitCode).not.toBe(EXIT_CODES.success);
    expect(result.exitCode).toBe(EXIT_CODES.config_error);
  });
});

describe('wpm membrane list', () => {
  it('exits 0 even if no envelopes exist', async () => {
    const result = await runCli(['membrane', 'list']);
    expect(result.exitCode).toBe(EXIT_CODES.success);
  });
});
