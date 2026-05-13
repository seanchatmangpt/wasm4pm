import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { resolveConfig as loadConfig } from "@wasm4pm/config";;
import type { CliOverrides } from '@wasm4pm/config';

describe('Config Resolution Order', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(process.cwd(), `.test-config-resolution-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('CLI > TOML > JSON > ENV > defaults', () => {
    it('CLI override wins over TOML, TOML wins over JSON, and defaults fill missing fields', async () => {
      // Write TOML with profile=balanced
      const tomlPath = path.join(tmpDir, 'wasm4pm.toml');
      await fs.writeFile(tomlPath, `version = "26.4.5"\n[execution]\nprofile = "balanced"\ntimeout = 60000\n`);

      // CLI override should win
      const cliConfig = await loadConfig({ configSearchPaths: [tmpDir], cliOverrides: { profile: 'quality' } });
      expect(cliConfig.execution.profile).toBe('quality');
      expect(cliConfig.metadata.provenance['execution.profile']?.source).toBe('cli');

      // TOML should be applied when no CLI override
      const tomlConfig = await loadConfig({ configSearchPaths: [tmpDir] });
      expect(tomlConfig.execution.profile).toBe('balanced');
      expect(tomlConfig.execution.timeout).toBe(60000);
      expect(tomlConfig.metadata.provenance['execution.profile']?.source).toBe('toml');
    });

    it('TOML beats JSON when both exist; JSON beats defaults when TOML absent', async () => {
      const tomlPath = path.join(tmpDir, 'wasm4pm.toml');
      const jsonPath = path.join(tmpDir, 'wasm4pm.json');

      await fs.writeFile(tomlPath, `version = "26.4.5"\n[execution]\nprofile = "fast"\n`);
      await fs.writeFile(jsonPath, JSON.stringify({ version: '26.4.5', execution: { profile: 'quality' } }));

      const config = await loadConfig({ configSearchPaths: [tmpDir] });
      expect(config.execution.profile).toBe('fast');
      expect(config.metadata.provenance['execution.profile']?.path).toBe(tomlPath);

      // Remove TOML, JSON should win
      await fs.rm(tomlPath);
      const jsonConfig = await loadConfig({ configSearchPaths: [tmpDir] });
      expect(jsonConfig.execution.profile).toBe('quality');
      expect(jsonConfig.metadata.provenance['execution.profile']?.path).toBe(jsonPath);
    });

    it('merges CLI overrides with file config and tracks provenance per field', async () => {
      const tomlPath = path.join(tmpDir, 'wasm4pm.toml');
      await fs.writeFile(tomlPath, `version = "26.4.5"\n[execution]\nprofile = "balanced"\ntimeout = 300000\n\n[output]\nformat = "human"\ndestination = "stdout"\n`);

      const config = await loadConfig({ configSearchPaths: [tmpDir], cliOverrides: { outputFormat: 'json' } });
      expect(config.execution.profile).toBe('balanced');
      expect(config.execution.timeout).toBe(300000);
      expect(config.output?.format).toBe('json');
      expect(config.metadata.provenance['execution.profile']?.source).toBe('toml');
      expect(config.metadata.provenance['output.format']?.source).toBe('cli');
    });

    it('applies defaults for missing config fields with correct provenance', async () => {
      const config = await loadConfig({ configSearchPaths: [tmpDir] });
      expect(config.version).toBe('26.4.5');
      expect(config.execution.timeout).toBe(300000);
      expect(config.execution.maxMemory).toBe(1073741824);
      expect(config.output?.format).toBe('human');
      expect(config.metadata.provenance['version']?.source).toBe('default');
      expect(config.metadata.provenance['execution.profile']?.source).toBe('default');
    });

    it('tracks file path and value in provenance', async () => {
      const tomlPath = path.join(tmpDir, 'wasm4pm.toml');
      await fs.writeFile(tomlPath, `version = "26.4.5"\n[execution]\nprofile = "quality"\ntimeout = 600000\n`);

      const config = await loadConfig({ configSearchPaths: [tmpDir] });
      expect(config.metadata.provenance['execution.profile']?.path).toBe(tomlPath);
      expect(config.metadata.provenance['execution.profile']?.value).toBe('quality');
      expect(config.metadata.provenance['execution.timeout']?.value).toBe(600000);
    });
  });

  describe('Configuration Validation', () => {
    it('rejects invalid TOML, invalid JSON, and invalid enum values', async () => {
      // Invalid TOML
      await fs.writeFile(path.join(tmpDir, 'wasm4pm.toml'), `invalid toml content [[[`);
      await expect(loadConfig({ configSearchPaths: [tmpDir] })).rejects.toThrow('Failed to parse TOML');

      // Invalid JSON (remove TOML first, write JSON)
      await fs.rm(path.join(tmpDir, 'wasm4pm.toml'));
      await fs.writeFile(path.join(tmpDir, 'wasm4pm.json'), `{ invalid json ]`);
      await expect(loadConfig({ configSearchPaths: [tmpDir] })).rejects.toThrow('Failed to parse JSON');
    });

    it('rejects invalid execution profile enum', async () => {
      await fs.writeFile(
        path.join(tmpDir, 'wasm4pm.toml'),
        `version = "26.4.5"\n[execution]\nprofile = "invalid_profile"\n`
      );
      await expect(loadConfig({ configSearchPaths: [tmpDir] })).rejects.toBeInstanceOf(Error);
    });

    it('rejects negative timeout', async () => {
      await fs.writeFile(
        path.join(tmpDir, 'wasm4pm.toml'),
        `version = "26.4.5"\n[execution]\nprofile = "balanced"\ntimeout = -1000\n`
      );
      await expect(loadConfig({ configSearchPaths: [tmpDir] })).rejects.toBeInstanceOf(Error);
    });
  });

  describe('Environment Variables', () => {
    it('loads WASM4PM_PROFILE and WASM4PM_LOG_LEVEL from env with correct provenance', async () => {
      const config = await loadConfig({ configSearchPaths: [tmpDir], env: { WASM4PM_PROFILE: 'fast', WASM4PM_LOG_LEVEL: 'debug' } });
      expect(config.execution.profile).toBe('fast');
      expect(config.observability?.logLevel).toBe('debug');
      expect(config.metadata.provenance['execution.profile']?.source).toBe('env');
    });

    it('parses WASM4PM_WATCH as boolean (true/1/false)', async () => {
      const t = await loadConfig({ configSearchPaths: [tmpDir], env: { WASM4PM_WATCH: 'true' } });
      expect(t.watch?.enabled).toBe(true);
      const one = await loadConfig({ configSearchPaths: [tmpDir], env: { WASM4PM_WATCH: '1' } });
      expect(one.watch?.enabled).toBe(true);
      const f = await loadConfig({ configSearchPaths: [tmpDir], env: { WASM4PM_WATCH: 'false' } });
      expect(f.watch?.enabled).toBe(false);
    });
  });

  describe('Hash and Multiple Search Paths', () => {
    it('produces deterministic hash and detects config changes', async () => {
      const tomlPath = path.join(tmpDir, 'wasm4pm.toml');
      await fs.writeFile(tomlPath, `version = "26.4.5"\n[execution]\nprofile = "balanced"\n`);
      const c1 = await loadConfig({ configSearchPaths: [tmpDir] });
      const c2 = await loadConfig({ configSearchPaths: [tmpDir] });
      expect(c1.metadata.hash).toBe(c2.metadata.hash);

      await fs.writeFile(tomlPath, `version = "26.4.5"\n[execution]\nprofile = "fast"\n`);
      const c3 = await loadConfig({ configSearchPaths: [tmpDir] });
      expect(c1.metadata.hash).not.toBe(c3.metadata.hash);
    });

    it('searches paths in order and uses first matching config file', async () => {
      const dir1 = path.join(tmpDir, 'dir1');
      const dir2 = path.join(tmpDir, 'dir2');
      await fs.mkdir(dir1, { recursive: true });
      await fs.mkdir(dir2, { recursive: true });

      // Only dir2 has a config
      await fs.writeFile(path.join(dir2, 'wasm4pm.toml'), `version = "26.4.5"\n[execution]\nprofile = "balanced"\n`);
      const c = await loadConfig({ configSearchPaths: [dir1, dir2] });
      expect(c.execution.profile).toBe('balanced');
      expect(c.metadata.provenance['execution.profile']?.path).toBe(path.join(dir2, 'wasm4pm.toml'));

      // Add dir1 config — should win
      await fs.writeFile(path.join(dir1, 'wasm4pm.toml'), `version = "26.4.5"\n[execution]\nprofile = "fast"\n`);
      const c2 = await loadConfig({ configSearchPaths: [dir1, dir2] });
      expect(c2.execution.profile).toBe('fast');
      expect(c2.metadata.provenance['execution.profile']?.path).toBe(path.join(dir1, 'wasm4pm.toml'));
    });
  });
});
