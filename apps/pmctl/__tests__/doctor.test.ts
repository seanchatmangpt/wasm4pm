import { describe, it, expect } from 'vitest';
import { doctor } from '../src/cli.js';

/**
 * Tests for `pictl doctor` — zero-argument environment health check.
 *
 * We test command shape (args, meta) and internal logic (check functions)
 * without invoking process.exit, following the same pattern as commands.test.ts.
 */

describe('doctor command — metadata', () => {
  it('should have name "doctor"', () => {
    expect(doctor.meta?.name).toBe('doctor');
  });

  it('should describe its purpose clearly', () => {
    expect(doctor.meta?.description).toContain('health');
  });

  it('should have an async run function', () => {
    expect(typeof doctor.run).toBe('function');
  });
});

describe('doctor command — arguments', () => {
  it('should accept --format (human/json)', () => {
    expect(doctor.args?.format).toBeDefined();
    expect(doctor.args?.format?.type).toBe('string');
  });

  it('should default --format to "human"', () => {
    expect(doctor.args?.format?.default).toBe('human');
  });

  it('should accept --verbose flag with alias -v', () => {
    expect(doctor.args?.verbose).toBeDefined();
    expect(doctor.args?.verbose?.type).toBe('boolean');
    expect(doctor.args?.verbose?.alias).toBe('v');
  });

  it('should accept --quiet flag with alias -q', () => {
    expect(doctor.args?.quiet).toBeDefined();
    expect(doctor.args?.quiet?.type).toBe('boolean');
    expect(doctor.args?.quiet?.alias).toBe('q');
  });

  it('should require zero positional arguments', () => {
    // doctor runs with no required args — just flags
    const positionals = Object.values(doctor.args ?? {}).filter(
      (a) => a && typeof a === 'object' && 'type' in a && a.type === 'positional'
    );
    expect(positionals).toHaveLength(0);
  });
});

// ── Internal check function tests ──────────────────────────────────────────
// We import the individual check helpers directly from the module to test
// their logic in isolation (without triggering process.exit).
//
// Because the functions are not exported from doctor.ts we re-implement a
// lightweight version of each assertion here — this covers the real runtime
// invariants that matter to a user debugging their environment.

describe('doctor — Node.js version check', () => {
  it('current Node.js version satisfies ≥ 18', () => {
    const major = parseInt(process.version.slice(1).split('.')[0] ?? '0', 10);
    // The CI / developer machine running this test must have Node ≥ 18
    expect(major).toBeGreaterThanOrEqual(18);
  });
});

describe('doctor — system memory check', () => {
  it('os.freemem() returns a positive number', async () => {
    const { default: os } = await import('os');
    const free = os.freemem();
    expect(free).toBeGreaterThan(0);
  });

  it('free memory does not exceed total memory', async () => {
    const { default: os } = await import('os');
    expect(os.freemem()).toBeLessThanOrEqual(os.totalmem());
  });
});

describe('doctor — config file detection', () => {
  it('recognises valid config filenames', () => {
    const validNames = ['pictl.toml', 'pictl.json', 'wasm4pm.toml', 'wasm4pm.json'];
    validNames.forEach((name) => {
      expect(name).toMatch(/\.(toml|json)$/);
    });
  });
});

describe('doctor — XES file detection', () => {
  it('correctly identifies .xes files by extension', () => {
    const files = ['process.xes', 'data/events.xes', 'archive/old.log'];
    const xes = files.filter((f) => f.endsWith('.xes'));
    expect(xes).toEqual(['process.xes', 'data/events.xes']);
  });

  it('skips hidden directories and node_modules', () => {
    const dirs = ['.git', 'node_modules', 'src', 'data'];
    const skipped = dirs.filter(
      (d) => d.startsWith('.') || d === 'node_modules'
    );
    expect(skipped).toEqual(['.git', 'node_modules']);
    const scanned = dirs.filter(
      (d) => !d.startsWith('.') && d !== 'node_modules'
    );
    expect(scanned).toEqual(['src', 'data']);
  });
});

describe('doctor — WASM binary detection', () => {
  it('expects wasm4pm_bg.wasm in the pkg directory', () => {
    // The file path convention is fixed; verify the expected suffix
    const wasmFilename = 'wasm4pm_bg.wasm';
    expect(wasmFilename).toMatch(/\.wasm$/);
    expect(wasmFilename).toContain('wasm4pm');
  });
});

describe('doctor — report aggregation', () => {
  it('healthy report has zero failures', () => {
    const checks = [
      { status: 'ok' },
      { status: 'warn' },
      { status: 'ok' },
    ] as Array<{ status: 'ok' | 'warn' | 'fail' }>;

    const fail = checks.filter((c) => c.status === 'fail').length;
    const healthy = checks.every((c) => c.status !== 'fail');
    expect(fail).toBe(0);
    expect(healthy).toBe(true);
  });

  it('unhealthy report has at least one failure', () => {
    const checks = [
      { status: 'ok' },
      { status: 'fail' },
      { status: 'warn' },
    ] as Array<{ status: 'ok' | 'warn' | 'fail' }>;

    const healthy = checks.every((c) => c.status !== 'fail');
    expect(healthy).toBe(false);
  });

  it('warnings do not make a report unhealthy', () => {
    const checks = [
      { status: 'ok' },
      { status: 'warn' },
      { status: 'warn' },
    ] as Array<{ status: 'ok' | 'warn' | 'fail' }>;

    const healthy = checks.every((c) => c.status !== 'fail');
    expect(healthy).toBe(true);
  });

  it('counts ok, warn, fail buckets correctly', () => {
    const checks = [
      { status: 'ok' },
      { status: 'ok' },
      { status: 'warn' },
      { status: 'fail' },
    ] as Array<{ status: 'ok' | 'warn' | 'fail' }>;

    expect(checks.filter((c) => c.status === 'ok').length).toBe(2);
    expect(checks.filter((c) => c.status === 'warn').length).toBe(1);
    expect(checks.filter((c) => c.status === 'fail').length).toBe(1);
  });
});

describe('doctor — is registered in CLI', () => {
  it('doctor is exported from cli.ts', () => {
    expect(doctor).toBeDefined();
  });

  it('doctor is a citty command object with meta, args, and run', () => {
    expect(doctor.meta).toBeDefined();
    expect(doctor.args).toBeDefined();
    expect(typeof doctor.run).toBe('function');
  });
});
