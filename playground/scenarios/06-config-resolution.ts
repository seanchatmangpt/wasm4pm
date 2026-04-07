/**
 * Scenario: Config resolution — layer priority and provenance
 *
 * Dev action simulated: "I changed the config resolver. Does the precedence
 * still work? Does provenance correctly report where each field came from?"
 *
 * Resolution order (highest priority first):
 *   CLI overrides → TOML file → JSON file → ENV vars → defaults
 *
 * COMMON MISCONCEPTION: ENV vars do NOT beat file config. They only beat
 * defaults. A TOML file with profile="balanced" overrides WASM4PM_PROFILE=stream.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as fs from 'fs/promises';
import * as path from 'path';
import { resolveConfig } from '@wasm4pm/config';
import type { CliOverrides } from '@wasm4pm/config';

// ── Temp dir lifecycle ────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wasm4pm-cfg-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function printProvenance(label: string, prov: Record<string, { source: string; path?: string }>) {
  const table = Object.fromEntries(
    Object.entries(prov).map(([k, v]) => [k, `${v.source}${v.path ? ` (${path.basename(v.path)})` : ''}`]),
  );
  console.info(`[config] ${label}:`, table);
}

// ── CLI override wins over file ────────────────────────────────────────────────

describe('config resolution: CLI override wins over file', () => {
  it('CLI profile supersedes TOML profile', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'wasm4pm.toml'),
      `[source]\nkind = "file"\n[execution]\nprofile = "quality"\n`,
    );

    const cfg = await resolveConfig({
      cliOverrides: { profile: 'fast' } as CliOverrides,
      configSearchPaths: [tmpDir],
    });

    expect(cfg.execution.profile).toBe('fast');
    expect(cfg.metadata.provenance['execution.profile']?.source).toBe('cli');
    printProvenance('cli-beats-toml', cfg.metadata.provenance);
  });

  it('CLI algorithm supersedes JSON algorithm', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'wasm4pm.json'),
      JSON.stringify({
        source: { kind: 'file' },
        algorithm: { name: 'heuristic_miner', parameters: {} },
      }),
    );

    const cfg = await resolveConfig({
      cliOverrides: { algorithm: 'genetic_algorithm' } as CliOverrides,
      configSearchPaths: [tmpDir],
    });

    expect(cfg.algorithm.name).toBe('genetic_algorithm');
    expect(cfg.metadata.provenance['algorithm.name']?.source).toBe('cli');
  });
});

// ── ENV var scoping ───────────────────────────────────────────────────────────

describe('config resolution: ENV var scoping', () => {
  it('ENV profile wins over default when no file present', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmpDir], // empty — no file
      env: { WASM4PM_PROFILE: 'stream' },
    });
    expect(cfg.execution.profile).toBe('stream');
    expect(cfg.metadata.provenance['execution.profile']?.source).toBe('env');
    printProvenance('env-beats-default', cfg.metadata.provenance);
  });

  it('file beats ENV (common dev misconception)', async () => {
    // ENV does NOT always win — precedence is CLI > file > ENV > defaults
    // A TOML file with profile="balanced" overrides WASM4PM_PROFILE=stream
    await fs.writeFile(
      path.join(tmpDir, 'wasm4pm.toml'),
      `[source]\nkind = "file"\n[execution]\nprofile = "balanced"\n`,
    );

    const cfg = await resolveConfig({
      configSearchPaths: [tmpDir],
      env: { WASM4PM_PROFILE: 'stream' },
    });

    expect(cfg.execution.profile).toBe('balanced');
    expect(cfg.metadata.provenance['execution.profile']?.source).toBe('toml');
    console.info('[config] IMPORTANT: file beats ENV. profile from TOML wins over WASM4PM_PROFILE=stream');
    printProvenance('file-beats-env', cfg.metadata.provenance);
  });

  it('log level from ENV is visible in provenance', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmpDir],
      env: { WASM4PM_LOG_LEVEL: 'debug' },
    });
    expect(cfg.observability.logLevel).toBe('debug');
    expect(cfg.metadata.provenance['observability.logLevel']?.source).toBe('env');
  });
});

// ── Three-way mix ─────────────────────────────────────────────────────────────

describe('config resolution: provenance across all sources', () => {
  it('three-way mix: TOML + ENV + CLI each win for different fields', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'wasm4pm.toml'),
      ['[source]', 'kind = "file"', '[execution]', 'profile = "quality"', '[algorithm]', 'name = "heuristic_miner"', '[algorithm.parameters]'].join('\n'),
    );

    const cfg = await resolveConfig({
      cliOverrides: { profile: 'fast' } as CliOverrides,
      configSearchPaths: [tmpDir],
      env: { WASM4PM_LOG_LEVEL: 'warn', WASM4PM_OUTPUT_FORMAT: 'json' },
    });

    // CLI wins for profile
    expect(cfg.execution.profile).toBe('fast');
    expect(cfg.metadata.provenance['execution.profile']?.source).toBe('cli');

    // TOML wins for algorithm (no CLI or ENV override)
    expect(cfg.algorithm.name).toBe('heuristic_miner');
    expect(cfg.metadata.provenance['algorithm.name']?.source).toBe('toml');

    // ENV wins for logLevel and output.format (no file override)
    expect(cfg.observability.logLevel).toBe('warn');
    expect(cfg.metadata.provenance['observability.logLevel']?.source).toBe('env');

    printProvenance('three-way-mix', cfg.metadata.provenance);
  });

  it('config.hash changes when any field changes', async () => {
    const base = await resolveConfig({ configSearchPaths: [tmpDir] });
    const withProfile = await resolveConfig({
      cliOverrides: { profile: 'quality' } as CliOverrides,
      configSearchPaths: [tmpDir],
    });
    expect(base.metadata.hash).not.toBe(withProfile.metadata.hash);
    console.info('[config] hash(base):', base.metadata.hash.slice(0, 8), '≠ hash(quality):', withProfile.metadata.hash.slice(0, 8));
  });
});

// ── Zod validation ────────────────────────────────────────────────────────────

describe('config resolution: Zod validation', () => {
  it('rejects profile "ultra-fast" (not in enum)', async () => {
    await expect(
      resolveConfig({ configSearchPaths: [tmpDir], env: { WASM4PM_PROFILE: 'ultra-fast' } }),
    ).rejects.toThrow(/validation|invalid/i);
  });

  it('rejects profile "turbo" from TOML', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'wasm4pm.toml'),
      `[source]\nkind = "file"\n[execution]\nprofile = "turbo"\n`,
    );
    await expect(
      resolveConfig({ configSearchPaths: [tmpDir] }),
    ).rejects.toThrow(/validation|invalid/i);
  });

  it('accepts all four valid profiles without throwing', async () => {
    for (const profile of ['fast', 'balanced', 'quality', 'stream']) {
      const cfg = await resolveConfig({
        cliOverrides: { profile } as CliOverrides,
        configSearchPaths: [tmpDir],
      });
      expect(cfg.execution.profile).toBe(profile);
    }
  });
});
