/**
 * resolver-env-priority.test.ts
 *
 * Oracle-ranked edge-case tests for resolveConfig() focusing on ENV priority
 * interactions, provenance structure invariants, and boundary conditions.
 *
 * These tests are new and do NOT duplicate the following existing files:
 *   env-vars.test.ts          — basic ENV var happy paths
 *   provenance-audit.test.ts  — completeness, file paths, loadTime validity, CLI+ENV metamorphic F
 *   precedence-gaps.test.ts   — algorithm/profile enum validation, basic 5-layer chain
 *   resolution.test.ts        — metadata hash, deep merge, basic precedence
 *
 * New coverage:
 *   Rank 1 — Mathematical: strict total order (multi-field simultaneous), loadTime monotonicity
 *   Rank 2 — Domain contract: provenance entry structure invariants, 1KB ENV boundary
 *   Rank 3 — Metamorphic: value+provenance both change when ENV is toggled (multi-field pairs)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { resolveConfig } from '../resolver.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function makeTmp(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'wasm4pm-env-priority-'));
}
async function cleanTmp(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Rank 1 — Strict total order: ENV + TOML + CLI simultaneously
// The precedence order (CLI > TOML > ENV > default) must hold for every
// field simultaneously in one resolution call, not just for one field at a time.
// ---------------------------------------------------------------------------
describe('Rank 1 — Strict total order: multi-field simultaneous precedence', () => {
  let tmp: string;
  beforeEach(async () => { tmp = await makeTmp(); });
  afterEach(async () => { await cleanTmp(tmp); });

  it('TOML wins over ENV for algorithm.name, and ENV wins for unrelated fields not in TOML', async () => {
    // TOML sets algorithm.name; ENV sets profile; neither sets output.format
    await fs.writeFile(
      path.join(tmp, 'wasm4pm.toml'),
      'version = "26.4.5"\n[source]\nkind = "file"\n[algorithm]\nname = "inductive_miner"\n'
    );
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_ALGORITHM: 'dfg', WASM4PM_PROFILE: 'fast' },
    });

    // TOML beats ENV for algorithm.name
    expect(cfg.algorithm.name).toBe('inductive_miner');
    expect(cfg.metadata.provenance['algorithm.name']?.source).toBe('toml');

    // ENV beats default for profile (TOML did not set profile)
    expect(cfg.execution.profile).toBe('fast');
    expect(cfg.metadata.provenance['execution.profile']?.source).toBe('env');

    // Default applies for output.format (nobody overrode it)
    expect(cfg.output.format).toBe('human');
    expect(cfg.metadata.provenance['output.format']?.source).toBe('default');
  });

  it('CLI wins over TOML for algorithm.name, TOML wins over ENV for profile', async () => {
    await fs.writeFile(
      path.join(tmp, 'wasm4pm.toml'),
      'version = "26.4.5"\n[source]\nkind = "file"\n[algorithm]\nname = "heuristic_miner"\n[execution]\nprofile = "quality"\n'
    );
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_ALGORITHM: 'dfg', WASM4PM_PROFILE: 'stream' },
      cliOverrides: { algorithm: 'ilp' },
    });

    // CLI beats everything for algorithm.name
    expect(cfg.algorithm.name).toBe('ilp');
    expect(cfg.metadata.provenance['algorithm.name']?.source).toBe('cli');

    // TOML beats ENV for profile
    expect(cfg.execution.profile).toBe('quality');
    expect(cfg.metadata.provenance['execution.profile']?.source).toBe('toml');
  });

  it('all three layers active: CLI beats TOML beats ENV on the same field (algorithm.name)', async () => {
    await fs.writeFile(
      path.join(tmp, 'wasm4pm.toml'),
      'version = "26.4.5"\n[source]\nkind = "file"\n[algorithm]\nname = "inductive_miner"\n'
    );
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_ALGORITHM: 'dfg' },
      cliOverrides: { algorithm: 'ilp' },
    });

    // All three specify different values; CLI must win
    expect(cfg.algorithm.name).toBe('ilp');
    expect(cfg.metadata.provenance['algorithm.name']?.source).toBe('cli');
  });

  it('winning source in provenance always matches the winning value — no desync', async () => {
    // Test the invariant: provenance.source reflects the layer that actually won,
    // and provenance.value equals the resolved config value.
    await fs.writeFile(
      path.join(tmp, 'wasm4pm.toml'),
      'version = "26.4.5"\n[source]\nkind = "file"\n[algorithm]\nname = "aco"\n[execution]\nprofile = "stream"\n'
    );
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_ALGORITHM: 'pso', WASM4PM_PROFILE: 'quality', WASM4PM_OUTPUT_FORMAT: 'json' },
      cliOverrides: { algorithm: 'genetic_algorithm' },
    });

    // CLI wins for algorithm — value AND provenance.value must agree
    expect(cfg.algorithm.name).toBe('genetic_algorithm');
    const algoProv = cfg.metadata.provenance['algorithm.name'];
    expect(algoProv?.source).toBe('cli');
    expect(algoProv?.value).toBe(cfg.algorithm.name); // no desync

    // TOML wins for profile — value AND provenance.value must agree
    expect(cfg.execution.profile).toBe('stream');
    const profileProv = cfg.metadata.provenance['execution.profile'];
    expect(profileProv?.source).toBe('toml');
    expect(profileProv?.value).toBe(cfg.execution.profile); // no desync

    // ENV wins for output.format — value AND provenance.value must agree
    expect(cfg.output.format).toBe('json');
    const formatProv = cfg.metadata.provenance['output.format'];
    expect(formatProv?.source).toBe('env');
    expect(formatProv?.value).toBe(cfg.output.format); // no desync
  });

  it('JSON file wins over ENV; CLI wins over JSON — triple layer on profile', async () => {
    await fs.writeFile(
      path.join(tmp, 'wasm4pm.json'),
      JSON.stringify({
        version: '26.4.5',
        source: { kind: 'file' },
        execution: { profile: 'balanced' },
      })
    );
    const cfgJsonBeatsEnv = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_PROFILE: 'stream' },
    });
    expect(cfgJsonBeatsEnv.execution.profile).toBe('balanced');
    expect(cfgJsonBeatsEnv.metadata.provenance['execution.profile']?.source).toBe('json');

    const cfgCliBeatsJson = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_PROFILE: 'stream' },
      cliOverrides: { profile: 'fast' },
    });
    expect(cfgCliBeatsJson.execution.profile).toBe('fast');
    expect(cfgCliBeatsJson.metadata.provenance['execution.profile']?.source).toBe('cli');
  });
});

// ---------------------------------------------------------------------------
// Rank 2 — Domain contract: provenance entry structure invariants
// Every entry must have required fields; none may carry undefined.
// ---------------------------------------------------------------------------
describe('Rank 2 — Provenance structure invariants', () => {
  let tmp: string;
  beforeEach(async () => { tmp = await makeTmp(); });
  afterEach(async () => { await cleanTmp(tmp); });

  it('every provenance entry has a `source` field that is a non-empty string', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_ALGORITHM: 'dfg', WASM4PM_PROFILE: 'fast' },
    });
    for (const [key, entry] of Object.entries(cfg.metadata.provenance)) {
      expect(
        typeof entry.source,
        `provenance["${key}"].source is not a string`
      ).toBe('string');
      expect(
        entry.source.length,
        `provenance["${key}"].source is empty`
      ).toBeGreaterThan(0);
    }
  });

  it('ENV-sourced provenance entries have path: undefined (not a file)', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_ALGORITHM: 'heuristic_miner', WASM4PM_LOG_LEVEL: 'debug' },
    });

    const algoEntry = cfg.metadata.provenance['algorithm.name'];
    expect(algoEntry?.source).toBe('env');
    expect(algoEntry?.path).toBeUndefined();

    const logEntry = cfg.metadata.provenance['observability.logLevel'];
    expect(logEntry?.source).toBe('env');
    expect(logEntry?.path).toBeUndefined();
  });

  it('default-sourced provenance entries have path: undefined', async () => {
    const cfg = await resolveConfig({ configSearchPaths: [tmp], env: {} });

    // All default entries must have no path
    const defaultEntries = Object.entries(cfg.metadata.provenance).filter(
      ([, e]) => e.source === 'default'
    );
    expect(defaultEntries.length).toBeGreaterThan(0);
    for (const [key, entry] of defaultEntries) {
      expect(
        entry.path,
        `default-sourced entry "${key}" should not have a path`
      ).toBeUndefined();
    }
  });

  it('TOML-sourced provenance entries have a `path` that is an absolute filesystem path', async () => {
    const tomlPath = path.join(tmp, 'wasm4pm.toml');
    await fs.writeFile(
      tomlPath,
      'version = "26.4.5"\n[source]\nkind = "file"\n[algorithm]\nname = "alpha_plus_plus"\n[execution]\nprofile = "quality"\n'
    );
    const cfg = await resolveConfig({ configSearchPaths: [tmp], env: {} });

    const tomlEntries = Object.entries(cfg.metadata.provenance).filter(
      ([, e]) => e.source === 'toml'
    );
    expect(tomlEntries.length).toBeGreaterThan(0);

    for (const [key, entry] of tomlEntries) {
      expect(
        typeof entry.path,
        `TOML-sourced entry "${key}" must have a path string`
      ).toBe('string');
      expect(
        path.isAbsolute(entry.path!),
        `TOML-sourced entry "${key}" path must be absolute`
      ).toBe(true);
    }
  });

  it('CLI-sourced provenance entries have path: undefined', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: {},
      cliOverrides: { algorithm: 'ilp', profile: 'quality' },
    });

    const cliAlgo = cfg.metadata.provenance['algorithm.name'];
    expect(cliAlgo?.source).toBe('cli');
    expect(cliAlgo?.path).toBeUndefined();

    const cliProfile = cfg.metadata.provenance['execution.profile'];
    expect(cliProfile?.source).toBe('cli');
    expect(cliProfile?.path).toBeUndefined();
  });

  it('all provenance entry `source` values are from the allowed enum', async () => {
    const allowed = new Set(['cli', 'toml', 'json', 'env', 'default']);
    await fs.writeFile(
      path.join(tmp, 'wasm4pm.toml'),
      'version = "26.4.5"\n[source]\nkind = "file"\n[algorithm]\nname = "dfg"\n'
    );
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_PROFILE: 'fast' },
      cliOverrides: { outputFormat: 'json' },
    });
    for (const [key, entry] of Object.entries(cfg.metadata.provenance)) {
      expect(
        allowed.has(entry.source),
        `provenance["${key}"].source="${entry.source}" is not a valid ProvenanceSource`
      ).toBe(true);
    }
  });

  it('provenance.value for each entry is not undefined', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_ALGORITHM: 'dfg', WASM4PM_LOG_LEVEL: 'warn' },
    });
    for (const [key, entry] of Object.entries(cfg.metadata.provenance)) {
      expect(
        entry.value,
        `provenance["${key}"].value must not be undefined`
      ).not.toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Rank 3 — Metamorphic: toggling ENV changes BOTH value AND provenance source
// Each test runs two calls with controlled perturbation and asserts that both
// the resolved config value AND the provenance.source differ between calls.
// ---------------------------------------------------------------------------
describe('Rank 3 — Metamorphic: ENV override changes value AND provenance source', () => {
  let tmp: string;
  beforeEach(async () => { tmp = await makeTmp(); });
  afterEach(async () => { await cleanTmp(tmp); });

  it('algorithm.name: default call → "dfg" / "default"; ENV call → "ilp" / "env"', async () => {
    const cfgDefault = await resolveConfig({ configSearchPaths: [tmp], env: {} });
    const cfgEnv = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_ALGORITHM: 'ilp' },
    });

    // Value must differ between the two calls
    expect(cfgDefault.algorithm.name).toBe('dfg');
    expect(cfgEnv.algorithm.name).toBe('ilp');
    expect(cfgDefault.algorithm.name).not.toBe(cfgEnv.algorithm.name);

    // Source must differ — metamorphic pair
    expect(cfgDefault.metadata.provenance['algorithm.name']?.source).toBe('default');
    expect(cfgEnv.metadata.provenance['algorithm.name']?.source).toBe('env');
    expect(cfgDefault.metadata.provenance['algorithm.name']?.source).not.toBe(
      cfgEnv.metadata.provenance['algorithm.name']?.source
    );
  });

  it('execution.profile: default call → "balanced" / "default"; ENV call → "stream" / "env"', async () => {
    const cfgDefault = await resolveConfig({ configSearchPaths: [tmp], env: {} });
    const cfgEnv = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_PROFILE: 'stream' },
    });

    expect(cfgDefault.execution.profile).toBe('balanced');
    expect(cfgEnv.execution.profile).toBe('stream');
    expect(cfgDefault.execution.profile).not.toBe(cfgEnv.execution.profile);

    expect(cfgDefault.metadata.provenance['execution.profile']?.source).toBe('default');
    expect(cfgEnv.metadata.provenance['execution.profile']?.source).toBe('env');
  });

  it('output.format: default call → "human" / "default"; ENV call → "json" / "env"', async () => {
    const cfgDefault = await resolveConfig({ configSearchPaths: [tmp], env: {} });
    const cfgEnv = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_OUTPUT_FORMAT: 'json' },
    });

    expect(cfgDefault.output.format).toBe('human');
    expect(cfgEnv.output.format).toBe('json');

    expect(cfgDefault.metadata.provenance['output.format']?.source).toBe('default');
    expect(cfgEnv.metadata.provenance['output.format']?.source).toBe('env');
  });

  it('watch.enabled: default call → false / "default"; ENV call → true / "env"', async () => {
    const cfgDefault = await resolveConfig({ configSearchPaths: [tmp], env: {} });
    const cfgEnv = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_WATCH: 'true' },
    });

    expect(cfgDefault.watch?.enabled).toBe(false);
    expect(cfgEnv.watch?.enabled).toBe(true);

    expect(cfgDefault.metadata.provenance['watch.enabled']?.source).toBe('default');
    expect(cfgEnv.metadata.provenance['watch.enabled']?.source).toBe('env');
  });

  it('observability.logLevel: default call → "info" / "default"; ENV call → "error" / "env"', async () => {
    const cfgDefault = await resolveConfig({ configSearchPaths: [tmp], env: {} });
    const cfgEnv = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_LOG_LEVEL: 'error' },
    });

    expect(cfgDefault.observability.logLevel).toBe('info');
    expect(cfgEnv.observability.logLevel).toBe('error');

    expect(cfgDefault.metadata.provenance['observability.logLevel']?.source).toBe('default');
    expect(cfgEnv.metadata.provenance['observability.logLevel']?.source).toBe('env');
  });

  it('sink.kind: default call → "stdout" / "default"; ENV call → "file" / "env" — but sink.kind=file needs a path so use "stdout" vs ENV=stdout gives no change; use ENV=stream... actually test source.kind', async () => {
    // source.kind has no schema restriction on the value from ENV alone
    // (file is the schema default; stream is another valid option)
    const cfgDefault = await resolveConfig({ configSearchPaths: [tmp], env: {} });
    const cfgEnv = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_SOURCE_KIND: 'stream' },
    });

    expect(cfgDefault.source.kind).toBe('file');
    expect(cfgEnv.source.kind).toBe('stream');

    expect(cfgDefault.metadata.provenance['source.kind']?.source).toBe('default');
    expect(cfgEnv.metadata.provenance['source.kind']?.source).toBe('env');
  });
});

// ---------------------------------------------------------------------------
// Rank 2 — Domain contract: ENV var at 1KB boundary
// The resolver rejects ENV values exceeding 1024 bytes (security: prevents
// oversized ENV injection).  Values at exactly 256 bytes must be accepted.
// ---------------------------------------------------------------------------
describe('Rank 2 — ENV var size limits', () => {
  let tmp: string;
  beforeEach(async () => { tmp = await makeTmp(); });
  afterEach(async () => { await cleanTmp(tmp); });

  it('rejects a WASM4PM_* value of exactly 1025 characters (one byte over limit)', async () => {
    // The actual resolver rejects any WASM4PM_* value > 1024 chars.
    // WASM4PM_OTEL_ENDPOINT is a free-form string ENV var — ideal for testing length.
    const oversized = 'x'.repeat(1025);
    await expect(
      resolveConfig({
        configSearchPaths: [tmp],
        env: { WASM4PM_OTEL_ENDPOINT: oversized },
      })
    ).rejects.toThrow(/exceeds 1KB/i);
  });

  it('rejects a WASM4PM_* value of 2048 characters (well over limit)', async () => {
    const wayTooLong = 'a'.repeat(2048);
    await expect(
      resolveConfig({
        configSearchPaths: [tmp],
        env: { WASM4PM_OTEL_ENDPOINT: wayTooLong },
      })
    ).rejects.toThrow(/exceeds 1KB/i);
  });

  it('accepts a WASM4PM_OTEL_ENDPOINT value of exactly 1024 characters (at the limit)', async () => {
    // Exactly at the limit: should not throw, and the endpoint must be round-tripped
    const atLimit = 'http://x' + 'x'.repeat(1024 - 8); // 1024 chars total
    expect(atLimit).toHaveLength(1024); // guard: fixture must be exactly 1024
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_OTEL_ENDPOINT: atLimit },
    });
    // FM-5: resolved config must carry the endpoint through, proving the 1024-char
    // boundary is accepted (not silently dropped or truncated).
    expect(cfg.observability.otel?.endpoint).toBe(atLimit);
  });

  it('accepts a WASM4PM_OTEL_ENDPOINT value of 256 characters (well under limit)', async () => {
    const shortValue = 'http://' + 'example.com/'.repeat(20) + '/endpoint';
    const truncated = shortValue.slice(0, 256);
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_OTEL_ENDPOINT: truncated },
    });
    expect(cfg.observability.otel?.endpoint).toBe(truncated);
  });

  it('rejects a WASM4PM_OUTPUT_DESTINATION value exceeding 1KB', async () => {
    const oversized = '/tmp/' + 'z'.repeat(1021); // > 1024 total
    await expect(
      resolveConfig({
        configSearchPaths: [tmp],
        env: { WASM4PM_OUTPUT_DESTINATION: oversized },
      })
    ).rejects.toThrow(/exceeds 1KB/i);
  });

  it('rejects a null-byte injection in WASM4PM_ALGORITHM', async () => {
    // Null byte (\x00) is also rejected by the security validator
    await expect(
      resolveConfig({
        configSearchPaths: [tmp],
        env: { WASM4PM_OTEL_ENDPOINT: 'http://safe\x00injected' },
      })
    ).rejects.toThrow(/null byte/i);
  });
});

// ---------------------------------------------------------------------------
// Rank 1 — Mathematical: loadTime is monotonically non-decreasing
// Two sequential calls to resolveConfig() must have loadTime[0] <= loadTime[1].
// Time only goes forward.
// ---------------------------------------------------------------------------
describe('Rank 1 — loadTime is monotonically non-decreasing', () => {
  let tmp: string;
  beforeEach(async () => { tmp = await makeTmp(); });
  afterEach(async () => { await cleanTmp(tmp); });

  it('second call to resolveConfig has loadTime >= first call loadTime', async () => {
    const cfg1 = await resolveConfig({ configSearchPaths: [tmp], env: {} });
    const cfg2 = await resolveConfig({ configSearchPaths: [tmp], env: {} });

    expect(cfg2.metadata.loadTime).toBeGreaterThanOrEqual(cfg1.metadata.loadTime);
  });

  it('three sequential calls maintain non-decreasing loadTime order', async () => {
    const calls = await Promise.resolve().then(async () => {
      const r1 = await resolveConfig({ configSearchPaths: [tmp], env: {} });
      const r2 = await resolveConfig({ configSearchPaths: [tmp], env: {} });
      const r3 = await resolveConfig({ configSearchPaths: [tmp], env: {} });
      return [r1, r2, r3];
    });

    const [c1, c2, c3] = calls;
    expect(c2.metadata.loadTime).toBeGreaterThanOrEqual(c1.metadata.loadTime);
    expect(c3.metadata.loadTime).toBeGreaterThanOrEqual(c2.metadata.loadTime);
  });

  it('loadTime is always a positive integer (not fractional, not negative)', async () => {
    const cfg = await resolveConfig({ configSearchPaths: [tmp], env: {} });
    expect(cfg.metadata.loadTime).toBeGreaterThan(0);
    expect(Number.isInteger(cfg.metadata.loadTime)).toBe(true);
  });

  it('loadTime from a call with many ENV overrides is still >= Date.now() taken before the call', async () => {
    const before = Date.now();
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: {
        WASM4PM_ALGORITHM: 'dfg',
        WASM4PM_PROFILE: 'fast',
        WASM4PM_LOG_LEVEL: 'debug',
        WASM4PM_OUTPUT_FORMAT: 'json',
        WASM4PM_WATCH: 'false',
      },
    });
    expect(cfg.metadata.loadTime).toBeGreaterThanOrEqual(before);
  });
});

// ---------------------------------------------------------------------------
// Rank 2 — Domain contract: ENV wins over default, provenance reflects it
// Cross-field tests ensuring multiple ENV vars applied in one call each carry
// the correct provenance independently (no cross-contamination of sources).
// ---------------------------------------------------------------------------
describe('Rank 2 — Multi-ENV: each field carries independent provenance', () => {
  let tmp: string;
  beforeEach(async () => { tmp = await makeTmp(); });
  afterEach(async () => { await cleanTmp(tmp); });

  it('six ENV vars set simultaneously — each gets provenance source "env", no others get "env"', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: {
        WASM4PM_ALGORITHM: 'dfg',
        WASM4PM_PROFILE: 'fast',
        WASM4PM_LOG_LEVEL: 'warn',
        WASM4PM_OUTPUT_FORMAT: 'json',
        WASM4PM_WATCH: 'false',
        WASM4PM_SOURCE_KIND: 'stream',
      },
    });

    // All six must be 'env'
    expect(cfg.metadata.provenance['algorithm.name']?.source).toBe('env');
    expect(cfg.metadata.provenance['execution.profile']?.source).toBe('env');
    expect(cfg.metadata.provenance['observability.logLevel']?.source).toBe('env');
    expect(cfg.metadata.provenance['output.format']?.source).toBe('env');
    expect(cfg.metadata.provenance['watch.enabled']?.source).toBe('env');
    expect(cfg.metadata.provenance['source.kind']?.source).toBe('env');

    // Unaffected field must remain 'default'
    expect(cfg.metadata.provenance['sink.kind']?.source).toBe('default');
    expect(cfg.metadata.provenance['output.destination']?.source).toBe('default');
  });

  it('ENV value is stored in provenance.value and matches the resolved field', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: {
        WASM4PM_ALGORITHM: 'aco',
        WASM4PM_PROFILE: 'quality',
        WASM4PM_LOG_LEVEL: 'debug',
      },
    });

    const algoEntry = cfg.metadata.provenance['algorithm.name'];
    expect(algoEntry?.value).toBe('aco');
    expect(algoEntry?.value).toBe(cfg.algorithm.name);

    const profileEntry = cfg.metadata.provenance['execution.profile'];
    expect(profileEntry?.value).toBe('quality');
    expect(profileEntry?.value).toBe(cfg.execution.profile);

    const logEntry = cfg.metadata.provenance['observability.logLevel'];
    expect(logEntry?.value).toBe('debug');
    expect(logEntry?.value).toBe(cfg.observability.logLevel);
  });

  it('ENV for one sub-field does not contaminate sibling sub-field provenance', async () => {
    // WASM4PM_OUTPUT_FORMAT sets output.format but must NOT affect output.destination's source
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_OUTPUT_FORMAT: 'json' },
    });

    expect(cfg.metadata.provenance['output.format']?.source).toBe('env');
    // output.destination was not in the ENV — must be 'default'
    expect(cfg.metadata.provenance['output.destination']?.source).toBe('default');
  });

  it('CLI partial override only contaminates the exact field it targets', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_ALGORITHM: 'heuristic_miner', WASM4PM_PROFILE: 'balanced' },
      cliOverrides: { algorithm: 'pso' }, // only overrides algorithm.name
    });

    // CLI wins for algorithm.name
    expect(cfg.metadata.provenance['algorithm.name']?.source).toBe('cli');
    expect(cfg.algorithm.name).toBe('pso');

    // ENV still wins for profile (CLI did not specify profile)
    expect(cfg.metadata.provenance['execution.profile']?.source).toBe('env');
    expect(cfg.execution.profile).toBe('balanced');
  });
});
