/**
 * Precedence-gap tests for the 5-layer config system.
 *
 * These tests cover gaps identified in the existing suite:
 *   1. WASM4PM_ALGORITHM env var (happy path + invalid value rejection)
 *   2. Invalid non-empty algorithm name rejected by z.enum(ALGORITHM_IDS)
 *   3. Invalid profile from ENV rejected at Zod validation
 *   4. Invalid prediction.tasks from ENV rejected at Zod validation
 *   5. CLI algorithm override wins over WASM4PM_ALGORITHM env var
 *   6. CLI profile override wins over WASM4PM_PROFILE env var (isolated assertion)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { resolveConfig } from '../resolver.js';
import { validate } from '../schema.js';
import { ALGORITHM_IDS } from '@wasm4pm/contracts';

const minimal = {
  version: '26.4.5',
  source: { kind: 'file' as const },
};

// ---------------------------------------------------------------------------
// 1. WASM4PM_ALGORITHM env var
// ---------------------------------------------------------------------------
describe('ENV: WASM4PM_ALGORITHM', () => {
  let tmpDir: string;
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wasm4pm-prec-'));
  });
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('sets algorithm.name from WASM4PM_ALGORITHM env var', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmpDir],
      env: { WASM4PM_ALGORITHM: 'heuristic_miner' },
    });
    expect(cfg.algorithm.name).toBe('heuristic_miner');
    expect(cfg.metadata.provenance['algorithm.name']?.source).toBe('env');
  });

  it('rejects an invalid algorithm name from WASM4PM_ALGORITHM (Zod enum)', async () => {
    await expect(
      resolveConfig({
        configSearchPaths: [tmpDir],
        env: { WASM4PM_ALGORITHM: 'cloud_miner' },
      })
    ).rejects.toThrow(/validation failed/i);
  });

  it('CLI algorithm override wins over WASM4PM_ALGORITHM env var', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmpDir],
      cliOverrides: { algorithm: 'genetic_algorithm' },
      env: { WASM4PM_ALGORITHM: 'dfg' },
    });
    expect(cfg.algorithm.name).toBe('genetic_algorithm');
    expect(cfg.metadata.provenance['algorithm.name']?.source).toBe('cli');
  });
});

// ---------------------------------------------------------------------------
// 2. Schema: invalid non-empty algorithm name rejected by z.enum
// ---------------------------------------------------------------------------
describe('Schema: algorithm.name enum validation', () => {
  it('rejects a non-empty algorithm name that is not in ALGORITHM_IDS', () => {
    expect(() =>
      validate({ ...minimal, algorithm: { name: 'not_a_real_algorithm' } })
    ).toThrow(/validation failed/i);
  });

  it('rejects algorithm names with wrong casing', () => {
    // Algorithm IDs are lowercase with underscores; uppercase variants must fail
    expect(() => validate({ ...minimal, algorithm: { name: 'DFG' } })).toThrow(
      /validation failed/i
    );
    expect(() => validate({ ...minimal, algorithm: { name: 'Heuristic_Miner' } })).toThrow(
      /validation failed/i
    );
  });

  it('accepts all 36 registered algorithm IDs', () => {
    // Every ID in ALGORITHM_IDS must pass validation individually
    const failures: string[] = [];
    for (const id of ALGORITHM_IDS) {
      try {
        validate({ ...minimal, algorithm: { name: id } });
      } catch {
        failures.push(id);
      }
    }
    expect(failures).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 3. ENV: invalid profile rejected by Zod
// ---------------------------------------------------------------------------
describe('ENV: WASM4PM_PROFILE invalid value', () => {
  let tmpDir: string;
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wasm4pm-prec-'));
  });
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('rejects WASM4PM_PROFILE=cloud (not an allowed profile)', async () => {
    await expect(
      resolveConfig({
        configSearchPaths: [tmpDir],
        env: { WASM4PM_PROFILE: 'cloud' },
      })
    ).rejects.toThrow(/validation failed/i);
  });

  it('rejects WASM4PM_PROFILE=turbo (not an allowed profile)', async () => {
    await expect(
      resolveConfig({
        configSearchPaths: [tmpDir],
        env: { WASM4PM_PROFILE: 'turbo' },
      })
    ).rejects.toThrow(/validation failed/i);
  });

  it('CLI profile=fast wins over WASM4PM_PROFILE=quality (isolated)', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmpDir],
      cliOverrides: { profile: 'fast' },
      env: { WASM4PM_PROFILE: 'quality' },
    });
    expect(cfg.execution.profile).toBe('fast');
    expect(cfg.metadata.provenance['execution.profile']?.source).toBe('cli');
  });
});

// ---------------------------------------------------------------------------
// 4. ENV: invalid prediction.tasks rejected by Zod
// ---------------------------------------------------------------------------
describe('ENV: WASM4PM_PREDICTION_TASKS invalid task', () => {
  let tmpDir: string;
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wasm4pm-prec-'));
  });
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('rejects WASM4PM_PREDICTION_TASKS with an unknown task name', async () => {
    await expect(
      resolveConfig({
        configSearchPaths: [tmpDir],
        env: { WASM4PM_PREDICTION_TASKS: 'next_activity,bogus_task' },
      })
    ).rejects.toThrow(/validation failed/i);
  });

  it('rejects WASM4PM_PREDICTION_TASKS with hyphen form (must use underscore)', async () => {
    // CLI slugs use hyphens; config schema uses underscores.
    // Passing hyphen form via ENV must fail at Zod validation.
    await expect(
      resolveConfig({
        configSearchPaths: [tmpDir],
        env: { WASM4PM_PREDICTION_TASKS: 'next-activity' },
      })
    ).rejects.toThrow(/validation failed/i);
  });

  it('accepts all 6 valid prediction tasks via WASM4PM_PREDICTION_TASKS', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmpDir],
      env: {
        WASM4PM_PREDICTION_ENABLED: 'true',
        WASM4PM_PREDICTION_TASKS:
          'drift,features,next_activity,outcome,remaining_time,resource',
      },
    });
    expect(cfg.prediction!.tasks).toHaveLength(6);
    expect(cfg.prediction!.tasks).toContain('next_activity');
    expect(cfg.prediction!.tasks).toContain('remaining_time');
  });
});

// ---------------------------------------------------------------------------
// 5. Full 5-layer precedence: algorithm name
// ---------------------------------------------------------------------------
describe('5-layer precedence: algorithm name', () => {
  let tmpDir: string;
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wasm4pm-prec-'));
  });
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('resolves algorithm.name: default < env < file < cli', async () => {
    // Default
    const cfgDefault = await resolveConfig({ configSearchPaths: [tmpDir] });
    expect(cfgDefault.algorithm.name).toBe('dfg');
    expect(cfgDefault.metadata.provenance['algorithm.name']?.source).toBe('default');

    // ENV overrides default
    const cfgEnv = await resolveConfig({
      configSearchPaths: [tmpDir],
      env: { WASM4PM_ALGORITHM: 'alpha_plus_plus' },
    });
    expect(cfgEnv.algorithm.name).toBe('alpha_plus_plus');
    expect(cfgEnv.metadata.provenance['algorithm.name']?.source).toBe('env');

    // File overrides ENV
    await fs.writeFile(
      path.join(tmpDir, 'wasm4pm.toml'),
      'version = "26.4.5"\n[source]\nkind = "file"\n[algorithm]\nname = "inductive_miner"\n'
    );
    const cfgFile = await resolveConfig({
      configSearchPaths: [tmpDir],
      env: { WASM4PM_ALGORITHM: 'alpha_plus_plus' },
    });
    expect(cfgFile.algorithm.name).toBe('inductive_miner');
    expect(cfgFile.metadata.provenance['algorithm.name']?.source).toBe('toml');

    // CLI overrides file
    const cfgCli = await resolveConfig({
      configSearchPaths: [tmpDir],
      cliOverrides: { algorithm: 'ilp' },
      env: { WASM4PM_ALGORITHM: 'alpha_plus_plus' },
    });
    expect(cfgCli.algorithm.name).toBe('ilp');
    expect(cfgCli.metadata.provenance['algorithm.name']?.source).toBe('cli');
  });
});
