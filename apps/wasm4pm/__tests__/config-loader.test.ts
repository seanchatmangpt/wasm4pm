import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';
import { loadWasm4pmConfig, buildCliOverrides } from '../src/config-loader.js';
import type { CliOverrides } from '@wasm4pm/config';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create an isolated temp directory for config tests.
 * Passing this as `configPath` prevents loadWasm4pmConfig from picking up
 * the (possibly invalid) wasm4pm.toml in the working directory.
 */
async function makeTempConfigDir(): Promise<string> {
  return fs.mkdtemp(path.join(tmpdir(), 'wasm4pm-config-test-'));
}

// ─────────────────────────────────────────────────────────────────────────────
// buildCliOverrides
// ─────────────────────────────────────────────────────────────────────────────

describe('buildCliOverrides', () => {
  it('maps known args to override fields, returns empty object for empty args, and handles undefined/false watch', () => {
    const full = buildCliOverrides({
      config: '/path/to/config.toml',
      profile: 'quality',
      format: 'json',
      output: '/tmp/out.json',
      watch: true,
    });
    expect(full.configPath).toBe('/path/to/config.toml');
    expect(full.profile).toBe('quality');
    expect(full.outputFormat).toBe('json');
    expect(full.outputDestination).toBe('/tmp/out.json');
    expect(full.watchEnabled).toBe(true);

    expect(Object.keys(buildCliOverrides({})).length).toBe(0);
    expect(buildCliOverrides({ watch: undefined }).watchEnabled).toBeUndefined();
    expect(buildCliOverrides({ watch: false }).watchEnabled).toBe(false);
  });

  it('ignores unknown/extra keys — only maps documented flags', () => {
    const overrides = buildCliOverrides({ unknownFlag: 'value', anotherExtra: 42 });
    expect((overrides as Record<string, unknown>).unknownFlag).toBeUndefined();
    expect((overrides as Record<string, unknown>).anotherExtra).toBeUndefined();
  });

  it('maps all four execution profiles', () => {
    for (const profile of ['fast', 'balanced', 'quality', 'stream'] as const) {
      const o = buildCliOverrides({ profile });
      expect(o.profile).toBe(profile);
    }
  });

  it('maps both output formats', () => {
    expect(buildCliOverrides({ format: 'human' }).outputFormat).toBe('human');
    expect(buildCliOverrides({ format: 'json' }).outputFormat).toBe('json');
  });

  it('maps watch: true → watchEnabled: true', () => {
    expect(buildCliOverrides({ watch: true }).watchEnabled).toBe(true);
  });

  it('maps prediction overrides', () => {
    const o = buildCliOverrides({
      predictionEnabled: true,
      predictionTasks: 'drift,next_activity',
      predictionActivityKey: 'concept:name',
      predictionNgramOrder: '3',
      predictionDriftWindow: '20',
    });
    expect(o.predictionEnabled).toBe(true);
    expect(o.predictionTasks).toEqual(['drift', 'next_activity']);
    expect(o.predictionActivityKey).toBe('concept:name');
    expect(o.predictionNgramOrder).toBe(3);
    expect(o.predictionDriftWindow).toBe(20);
  });

  it('skips NaN for numeric prediction fields', () => {
    const o = buildCliOverrides({ predictionNgramOrder: 'not-a-number' });
    expect(o.predictionNgramOrder).toBeUndefined();
  });

  it('trims whitespace from predictionTasks items', () => {
    const o = buildCliOverrides({ predictionTasks: ' drift , next_activity ' });
    expect(o.predictionTasks).toEqual(['drift', 'next_activity']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// loadWasm4pmConfig
// ─────────────────────────────────────────────────────────────────────────────

describe('loadWasm4pmConfig', () => {
  let tmpDir: string;

  beforeEach(async () => {
    // Isolated directory with no config file → uses defaults.
    // Pass as configPath so resolver searches only tmpDir, not the CWD
    // (which may have an invalid wasm4pm.toml).
    tmpDir = await makeTempConfigDir();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('uses balanced profile by default when no config exists', async () => {
    const config = await loadWasm4pmConfig({ configPath: tmpDir });
    expect(config.execution.profile).toBe('balanced');
  });

  it('version field is always present in returned config', async () => {
    const config = await loadWasm4pmConfig({ configPath: tmpDir });
    expect(config.version).toBeDefined();
    expect(typeof config.version).toBe('string');
  });

  it('metadata.hash is always present and non-empty', async () => {
    const config = await loadWasm4pmConfig({ configPath: tmpDir });
    expect(config.metadata).toBeDefined();
    expect(config.metadata.hash).toBeDefined();
    expect(config.metadata.hash.length).toBeGreaterThan(0);
  });

  it('applies CLI override: fast profile wins over default balanced', async () => {
    const config = await loadWasm4pmConfig({ configPath: tmpDir, profile: 'fast' });
    expect(config.execution.profile).toBe('fast');
  });

  it('applies CLI override: outputFormat json overrides default human', async () => {
    const config = await loadWasm4pmConfig({ configPath: tmpDir, outputFormat: 'json' });
    expect(config.output?.format).toBe('json');
    // Profile should still be default
    expect(config.execution.profile).toBe('balanced');
  });

  it('applies CLI override: quality profile', async () => {
    const config = await loadWasm4pmConfig({ configPath: tmpDir, profile: 'quality' });
    expect(config.execution.profile).toBe('quality');
  });

  it('reads TOML config from dir and overrides defaults', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'wasm4pm.toml'),
      `version = "26.4.5"\n[execution]\nprofile = "fast"\ntimeout = 60000\n`
    );
    const config = await loadWasm4pmConfig({ configPath: tmpDir });
    expect(config.execution.profile).toBe('fast');
    expect(config.execution.timeout).toBe(60000);
  });

  it('CLI override wins over TOML file setting', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'wasm4pm.toml'),
      `version = "26.4.5"\n[execution]\nprofile = "balanced"\ntimeout = 60000\n`
    );
    const config = await loadWasm4pmConfig({ configPath: tmpDir, profile: 'quality' });
    expect(config.execution.profile).toBe('quality');
  });

  it('throws when TOML config has invalid timeout (0)', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'wasm4pm.toml'),
      `version = "26.4.5"\n[execution]\nprofile = "balanced"\ntimeout = 0\n`
    );
    await expect(loadWasm4pmConfig({ configPath: tmpDir })).rejects.toThrow();
  });

  it('throws when TOML config has negative timeout', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'wasm4pm.toml'),
      `version = "26.4.5"\n[execution]\nprofile = "balanced"\ntimeout = -1\n`
    );
    await expect(loadWasm4pmConfig({ configPath: tmpDir })).rejects.toThrow();
  });

  it('two calls with same empty dir produce identical metadata.hash', async () => {
    const c1 = await loadWasm4pmConfig({ configPath: tmpDir });
    const c2 = await loadWasm4pmConfig({ configPath: tmpDir });
    expect(c1.metadata.hash).toBe(c2.metadata.hash);
  });
});
