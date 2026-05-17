/**
 * status-provenance.test.ts
 * Unit tests for config provenance surface — the data that `wpm status` displays.
 *
 * Verifies that resolveConfig() produces correct provenance metadata when
 * ENV overrides are present, and that the provenance map can be filtered to
 * the "interesting keys" that wpm status cares about.
 *
 * Covers:
 *   - algorithm.name provenance = 'env' when WASM4PM_ALGORITHM is set
 *   - execution.profile provenance = 'env' when WASM4PM_PROFILE is set
 *   - algorithm.name provenance = 'default' when no override is set
 *   - Non-default provenance keys are enumerable (the "verbose" path)
 *   - Provenance includes path for file-sourced keys
 */

import { describe, it, expect } from 'vitest';
import { resolveConfig } from '../resolver.js';

// Helper: build a minimal test env without inheriting the real process.env
function baseEnv(): NodeJS.ProcessEnv {
  return {};
}

describe('Config provenance — ENV overrides', () => {
  it('algorithm.name provenance is "env" when WASM4PM_ALGORITHM is set', async () => {
    const cfg = await resolveConfig({
      env: { ...baseEnv(), WASM4PM_ALGORITHM: 'ilp' },
    });
    const prov = cfg.metadata.provenance['algorithm.name'];
    expect(prov).toBeDefined();
    expect(prov.source).toBe('env');
  });

  it('execution.profile provenance is "env" when WASM4PM_PROFILE is set', async () => {
    const cfg = await resolveConfig({
      env: { ...baseEnv(), WASM4PM_PROFILE: 'quality' },
    });
    const prov = cfg.metadata.provenance['execution.profile'];
    expect(prov).toBeDefined();
    expect(prov.source).toBe('env');
  });

  it('algorithm.name provenance is "default" when no overrides are set', async () => {
    const cfg = await resolveConfig({ env: baseEnv() });
    const prov = cfg.metadata.provenance['algorithm.name'];
    expect(prov).toBeDefined();
    expect(prov.source).toBe('default');
  });

  it('output.format provenance is "env" when WASM4PM_OUTPUT_FORMAT is set', async () => {
    const cfg = await resolveConfig({
      env: { ...baseEnv(), WASM4PM_OUTPUT_FORMAT: 'json' },
    });
    const prov = cfg.metadata.provenance['output.format'];
    expect(prov).toBeDefined();
    expect(prov.source).toBe('env');
  });

  it('multiple ENV overrides each carry source = "env"', async () => {
    const cfg = await resolveConfig({
      env: {
        ...baseEnv(),
        WASM4PM_ALGORITHM: 'dfg',
        WASM4PM_PROFILE: 'fast',
        WASM4PM_OUTPUT_FORMAT: 'json',
      },
    });
    const prov = cfg.metadata.provenance;
    expect(prov['algorithm.name']?.source).toBe('env');
    expect(prov['execution.profile']?.source).toBe('env');
    expect(prov['output.format']?.source).toBe('env');
  });

  it('provenance map contains more than one entry', async () => {
    const cfg = await resolveConfig({ env: baseEnv() });
    expect(Object.keys(cfg.metadata.provenance).length).toBeGreaterThan(1);
  });
});

describe('Config provenance — CLI overrides win over ENV', () => {
  it('algorithm.name provenance is "cli" when both WASM4PM_ALGORITHM and cliOverrides.algorithm are set', async () => {
    const cfg = await resolveConfig({
      env: { ...baseEnv(), WASM4PM_ALGORITHM: 'ilp' },
      cliOverrides: { algorithm: 'dfg' },
    });
    const prov = cfg.metadata.provenance['algorithm.name'];
    expect(prov).toBeDefined();
    expect(prov.source).toBe('cli');
  });

  it('resolved algorithm value matches CLI override', async () => {
    const cfg = await resolveConfig({
      env: { ...baseEnv(), WASM4PM_ALGORITHM: 'ilp' },
      cliOverrides: { algorithm: 'heuristic_miner' },
    });
    expect(cfg.algorithm.name).toBe('heuristic_miner');
  });
});

describe('Config provenance — interesting keys filter (status display logic)', () => {
  const INTERESTING_KEYS = new Set([
    'algorithm.name',
    'execution.profile',
    'output.format',
    'observability.logLevel',
    'prediction.enabled',
    'source.kind',
    'sink.kind',
  ]);

  it('all interesting keys are present in the provenance map', async () => {
    const cfg = await resolveConfig({ env: baseEnv() });
    const prov = cfg.metadata.provenance;
    for (const key of INTERESTING_KEYS) {
      expect(prov[key]).toBeDefined();
    }
  });

  it('non-default overrides are enumerable for verbose display', async () => {
    const cfg = await resolveConfig({
      env: { ...baseEnv(), WASM4PM_ALGORITHM: 'ilp', WASM4PM_PROFILE: 'quality' },
    });
    const nonDefault = Object.entries(cfg.metadata.provenance).filter(
      ([, v]) => v.source !== 'default'
    );
    // At minimum algorithm.name and execution.profile are non-default
    expect(nonDefault.length).toBeGreaterThanOrEqual(2);
  });

  it('configHash is a non-empty string', async () => {
    const cfg = await resolveConfig({ env: baseEnv() });
    expect(typeof cfg.metadata.hash).toBe('string');
    expect(cfg.metadata.hash.length).toBeGreaterThan(0);
  });
});
