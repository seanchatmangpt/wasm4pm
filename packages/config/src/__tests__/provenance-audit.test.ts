/**
 * provenance-audit.test.ts
 *
 * Fills the gaps left by existing provenance tests.  The existing suite
 * (`provenance.test.ts`, `status-provenance.test.ts`, `config-audit.test.ts`,
 * `precedence-gaps.test.ts`) covers the unit-level helpers and spot-checks a
 * handful of "interesting keys".  These tests cover what is NOT yet exercised:
 *
 *   Rank 1 — Mathematical / Completeness
 *     A. Every default-layer key has a provenance entry (no silent omissions).
 *     B. When no config file exists, no entry carries source "toml" or "json"
 *        (provenance never references a source that wasn't consulted).
 *
 *   Rank 2 — Domain contract
 *     C. File-sourced entries in resolveConfig() output carry a non-empty
 *        `path` field pointing to the actual config file (TOML case).
 *     D. File-sourced entries in resolveConfig() output carry a non-empty
 *        `path` field pointing to the actual config file (JSON case).
 *     E. `metadata.loadTime` is a positive finite integer (real timestamp, not 0).
 *
 *   Rank 3 — Metamorphic
 *     F. ENV WASM4PM_ALGORITHM=dfg + CLI algorithm=inductive_miner → resolved
 *        value is "inductive_miner" AND provenance source is "cli" (both value
 *        and provenance attributes are verified together).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { resolveConfig } from '../resolver.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function makeTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'wasm4pm-prov-audit-'));
}

// ---------------------------------------------------------------------------
// A. Provenance completeness: every default key has a provenance entry
// ---------------------------------------------------------------------------
describe('Rank 1 — Provenance completeness', () => {
  let tmpDir: string;
  beforeEach(async () => { tmpDir = await makeTmpDir(); });
  afterEach(async () => { await fs.rm(tmpDir, { recursive: true, force: true }); });

  it('every key produced by the defaults layer has a corresponding provenance entry', async () => {
    // Resolve with nothing but defaults (empty env, no config file, no CLI)
    const cfg = await resolveConfig({
      configSearchPaths: [tmpDir],
      env: {},
    });

    const prov = cfg.metadata.provenance;

    // The defaults object in resolver.ts has these leaf paths.
    // Each one must appear in the provenance map with source "default".
    // Note: algorithm.parameters is {} (empty object) — trackProvenance recurses into it
    // but emits no leaf entries since there are no keys.  That is correct behaviour.
    const expectedDefaultKeys = [
      'algorithm.name',
      // 'algorithm.parameters' — intentionally excluded: empty {} produces no leaf
      'execution.profile',
      'execution.timeout',
      'execution.maxMemory',
      'observability.logLevel',
      'observability.metricsEnabled',
      'watch.enabled',
      'watch.poll_interval',
      'output.format',
      'output.destination',
      'output.pretty',
      'output.colorize',
      'source.kind',
      'sink.kind',
      'prediction.enabled',
      'prediction.activityKey',
      'prediction.ngramOrder',
      'prediction.driftWindowSize',
      'prediction.tasks',
    ];

    const missing: string[] = [];
    for (const key of expectedDefaultKeys) {
      if (!prov[key]) missing.push(key);
    }
    expect(missing, `Missing provenance for default keys: ${missing.join(', ')}`).toHaveLength(0);
  });

  it('all provenance entries that exist have a valid source value', async () => {
    const cfg = await resolveConfig({ configSearchPaths: [tmpDir], env: {} });
    const validSources = new Set(['cli', 'toml', 'json', 'env', 'default']);
    const bad: string[] = [];
    for (const [key, entry] of Object.entries(cfg.metadata.provenance)) {
      if (!validSources.has(entry.source)) bad.push(`${key}=${entry.source}`);
    }
    expect(bad, `Entries with invalid source: ${bad.join(', ')}`).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// B. No unconsumed source: when no config file exists, no toml/json entries
// ---------------------------------------------------------------------------
describe('Rank 1 — No provenance references unconsumed source', () => {
  let tmpDir: string;
  beforeEach(async () => { tmpDir = await makeTmpDir(); });
  afterEach(async () => { await fs.rm(tmpDir, { recursive: true, force: true }); });

  it('when no config file is present, no provenance entry has source "toml" or "json"', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmpDir], // empty directory — no wasm4pm.toml / .json
      env: {},
    });

    const fileSourced = Object.entries(cfg.metadata.provenance).filter(
      ([, entry]) => entry.source === 'toml' || entry.source === 'json'
    );
    expect(
      fileSourced.map(([k]) => k),
      'No file-sourced entries should exist when no config file was loaded'
    ).toHaveLength(0);
  });

  it('when only ENV overrides are applied, no provenance entry has source "toml" or "json"', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmpDir],
      env: { WASM4PM_ALGORITHM: 'heuristic_miner', WASM4PM_PROFILE: 'fast' },
    });

    const fileSourced = Object.entries(cfg.metadata.provenance).filter(
      ([, entry]) => entry.source === 'toml' || entry.source === 'json'
    );
    expect(fileSourced.map(([k]) => k)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// C & D. File-sourced entries include path pointing to the real file
// ---------------------------------------------------------------------------
describe('Rank 2 — File-sourced provenance entries include `path`', () => {
  let tmpDir: string;
  beforeEach(async () => { tmpDir = await makeTmpDir(); });
  afterEach(async () => { await fs.rm(tmpDir, { recursive: true, force: true }); });

  it('TOML file-sourced provenance entries carry the absolute path to wasm4pm.toml', async () => {
    const tomlPath = path.join(tmpDir, 'wasm4pm.toml');
    await fs.writeFile(
      tomlPath,
      'version = "26.4.5"\n[source]\nkind = "file"\n[algorithm]\nname = "inductive_miner"\n'
    );

    const cfg = await resolveConfig({ configSearchPaths: [tmpDir], env: {} });

    // algorithm.name was set by the TOML file — its provenance must include path
    const entry = cfg.metadata.provenance['algorithm.name'];
    expect(entry).toBeDefined();
    expect(entry.source).toBe('toml');
    expect(typeof entry.path).toBe('string');
    expect(entry.path!.length).toBeGreaterThan(0);
    expect(entry.path).toBe(tomlPath);
  });

  it('all TOML-sourced provenance entries carry the same file path', async () => {
    const tomlPath = path.join(tmpDir, 'wasm4pm.toml');
    await fs.writeFile(
      tomlPath,
      'version = "26.4.5"\n[source]\nkind = "file"\n[execution]\nprofile = "quality"\ntimeout = 60000\n'
    );

    const cfg = await resolveConfig({ configSearchPaths: [tmpDir], env: {} });

    const tomlEntries = Object.entries(cfg.metadata.provenance).filter(
      ([, entry]) => entry.source === 'toml'
    );

    expect(tomlEntries.length).toBeGreaterThanOrEqual(2);
    for (const [key, entry] of tomlEntries) {
      expect(entry.path, `Entry "${key}" missing path`).toBe(tomlPath);
    }
  });

  it('JSON file-sourced provenance entries carry the absolute path to wasm4pm.json', async () => {
    const jsonPath = path.join(tmpDir, 'wasm4pm.json');
    await fs.writeFile(
      jsonPath,
      JSON.stringify({
        version: '26.4.5',
        source: { kind: 'file' },
        algorithm: { name: 'alpha_plus_plus', parameters: {} },
        execution: { profile: 'balanced' },
      })
    );

    const cfg = await resolveConfig({ configSearchPaths: [tmpDir], env: {} });

    const entry = cfg.metadata.provenance['algorithm.name'];
    expect(entry).toBeDefined();
    expect(entry.source).toBe('json');
    expect(typeof entry.path).toBe('string');
    expect(entry.path!.length).toBeGreaterThan(0);
    expect(entry.path).toBe(jsonPath);
  });

  it('CLI and ENV-sourced provenance entries do NOT carry a path field', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmpDir],
      env: { WASM4PM_PROFILE: 'fast' },
      cliOverrides: { algorithm: 'dfg' },
    });

    // CLI-sourced entry must not have a path
    const cliEntry = cfg.metadata.provenance['algorithm.name'];
    expect(cliEntry.source).toBe('cli');
    expect(cliEntry.path).toBeUndefined();

    // ENV-sourced entry must not have a path
    const envEntry = cfg.metadata.provenance['execution.profile'];
    expect(envEntry.source).toBe('env');
    expect(envEntry.path).toBeUndefined();

    // Default-sourced entries must not have a path
    const defaultEntry = cfg.metadata.provenance['output.format'];
    expect(defaultEntry.source).toBe('default');
    expect(defaultEntry.path).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// E. loadTime is a positive finite integer (real timestamp)
// ---------------------------------------------------------------------------
describe('Rank 2 — metadata.loadTime is a valid timestamp', () => {
  let tmpDir: string;
  beforeEach(async () => { tmpDir = await makeTmpDir(); });
  afterEach(async () => { await fs.rm(tmpDir, { recursive: true, force: true }); });

  it('loadTime is a positive finite number greater than zero', async () => {
    const cfg = await resolveConfig({ configSearchPaths: [tmpDir], env: {} });
    expect(typeof cfg.metadata.loadTime).toBe('number');
    expect(Number.isFinite(cfg.metadata.loadTime)).toBe(true);
    expect(cfg.metadata.loadTime).toBeGreaterThan(0);
  });

  it('loadTime is within a plausible range (between test start and now + 5s)', async () => {
    const before = Date.now();
    const cfg = await resolveConfig({ configSearchPaths: [tmpDir], env: {} });
    const after = Date.now() + 5000; // generous upper bound
    expect(cfg.metadata.loadTime).toBeGreaterThanOrEqual(before);
    expect(cfg.metadata.loadTime).toBeLessThanOrEqual(after);
  });

  it('loadTime is NOT zero (not a default/unset sentinel)', async () => {
    const cfg = await resolveConfig({ configSearchPaths: [tmpDir], env: {} });
    expect(cfg.metadata.loadTime).not.toBe(0);
  });
});

// ---------------------------------------------------------------------------
// F. Metamorphic: ENV algorithm + CLI algorithm — value AND provenance together
// ---------------------------------------------------------------------------
describe('Rank 3 — Metamorphic: CLI algorithm overrides ENV algorithm', () => {
  let tmpDir: string;
  beforeEach(async () => { tmpDir = await makeTmpDir(); });
  afterEach(async () => { await fs.rm(tmpDir, { recursive: true, force: true }); });

  it('resolved value is "inductive_miner" and provenance source is "cli" when ENV=dfg CLI=inductive_miner', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmpDir],
      env: { WASM4PM_ALGORITHM: 'dfg' },
      cliOverrides: { algorithm: 'inductive_miner' },
    });

    // Both the resolved config value AND the provenance source must be CLI-winning
    expect(cfg.algorithm.name).toBe('inductive_miner');
    const entry = cfg.metadata.provenance['algorithm.name'];
    expect(entry).toBeDefined();
    expect(entry.source).toBe('cli');
    expect(entry.value).toBe('inductive_miner');
  });

  it('ENV value is reflected when no CLI override is present (control leg)', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmpDir],
      env: { WASM4PM_ALGORITHM: 'dfg' },
      // no cliOverrides
    });

    expect(cfg.algorithm.name).toBe('dfg');
    const entry = cfg.metadata.provenance['algorithm.name'];
    expect(entry.source).toBe('env');
    expect(entry.value).toBe('dfg');
  });

  it('provenance value matches the resolved config value (no desync)', async () => {
    // If provenance records a different value than config, they are out of sync — a bug.
    const algorithms = ['dfg', 'heuristic_miner', 'alpha_plus_plus'] as const;
    for (const alg of algorithms) {
      const cfg = await resolveConfig({
        configSearchPaths: [tmpDir],
        env: {},
        cliOverrides: { algorithm: alg },
      });
      const entry = cfg.metadata.provenance['algorithm.name'];
      expect(entry.value, `Provenance value desync for ${alg}`).toBe(cfg.algorithm.name);
    }
  });
});
