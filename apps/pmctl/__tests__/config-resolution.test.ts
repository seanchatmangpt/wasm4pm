import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { resolveConfig as loadConfig } from "@pictl/config";;
import type { CliOverrides } from '@pictl/config';

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
    it('should apply CLI override with highest priority', async () => {
      // Set up files with conflicting values
      const tomlPath = path.join(tmpDir, 'pictl.toml');
      await fs.writeFile(
        tomlPath,
        `version = "26.4.5"
[execution]
profile = "balanced"
`
      );

      const config = await loadConfig({
        configSearchPaths: [tmpDir],
        cliOverrides: { profile: 'quality' },
      });

      // CLI override should win
      expect(config.execution.profile).toBe('quality');
      expect(config.metadata.provenance['execution.profile']?.source).toBe('cli');
    });

    it('should load from TOML with second priority', async () => {
      const tomlPath = path.join(tmpDir, 'pictl.toml');
      await fs.writeFile(
        tomlPath,
        `version = "26.4.5"
[execution]
profile = "fast"
timeout = 60000
`
      );

      const config = await loadConfig({
        configSearchPaths: [tmpDir],
      });

      // TOML should be applied
      expect(config.execution.profile).toBe('fast');
      expect(config.execution.timeout).toBe(60000);
      expect(config.metadata.provenance['execution.profile']?.source).toBe('toml');
    });

    it('should prefer TOML over JSON', async () => {
      // Create both TOML and JSON
      const tomlPath = path.join(tmpDir, 'pictl.toml');
      const jsonPath = path.join(tmpDir, 'wasm4pm.json');

      await fs.writeFile(
        tomlPath,
        `version = "26.4.5"
[execution]
profile = "fast"
`
      );

      await fs.writeFile(
        jsonPath,
        JSON.stringify({
          version: '26.4.5',
          execution: { profile: 'quality' },
        })
      );

      const config = await loadConfig({
        configSearchPaths: [tmpDir],
      });

      // TOML should win
      expect(config.execution.profile).toBe('fast');
      expect(config.source.kind).toBe('file');
      expect(config.metadata.provenance['execution.profile']?.path).toBe(tomlPath);
    });

    it('should load from JSON when TOML not present', async () => {
      const jsonPath = path.join(tmpDir, 'wasm4pm.json');
      await fs.writeFile(
        jsonPath,
        JSON.stringify({
          version: '26.4.5',
          execution: { profile: 'balanced' },
          output: { format: 'json', destination: 'stdout' },
        })
      );

      const config = await loadConfig({
        configSearchPaths: [tmpDir],
      });

      expect(config.execution.profile).toBe('balanced');
      expect(config.output?.format).toBe('json');
      expect(config.metadata.provenance['execution.profile']?.path).toBe(jsonPath);
    });

    it('should merge CLI overrides with file config', async () => {
      const tomlPath = path.join(tmpDir, 'pictl.toml');
      await fs.writeFile(
        tomlPath,
        `version = "26.4.5"
[execution]
profile = "balanced"
timeout = 300000

[output]
format = "human"
destination = "stdout"
`
      );

      const config = await loadConfig({
        configSearchPaths: [tmpDir],
        cliOverrides: {
          outputFormat: 'json',
        },
      });

      // File config
      expect(config.execution.profile).toBe('balanced');
      expect(config.execution.timeout).toBe(300000);

      // CLI override
      expect(config.output?.format).toBe('json');

      // Verify provenance
      expect(config.metadata.provenance['execution.profile']?.source).toBe('toml');
      expect(config.metadata.provenance['output.format']?.source).toBe('cli');
    });

    it('should track file path in provenance', async () => {
      const tomlPath = path.join(tmpDir, 'pictl.toml');
      await fs.writeFile(
        tomlPath,
        `version = "26.4.5"
[execution]
profile = "quality"
`
      );

      const config = await loadConfig({
        configSearchPaths: [tmpDir],
      });

      expect(config.metadata.provenance['execution.profile']?.path).toBe(tomlPath);
      expect(config.metadata.provenance['execution.profile']?.value).toBe('quality');
    });

    it('should apply defaults for missing config fields', async () => {
      const config = await loadConfig({
        configSearchPaths: [tmpDir],
      });

      // Verify defaults are applied
      expect(config.version).toBe('26.4.5');
      expect(config.execution.timeout).toBe(300000);
      expect(config.execution.maxMemory).toBe(1073741824);
      expect(config.output?.format).toBe('human');

      // Check provenance
      expect(config.metadata.provenance['version']?.source).toBe('default');
      expect(config.metadata.provenance['execution.profile']?.source).toBe('default');
    });
  });

  describe('Configuration Validation', () => {
    it('should reject invalid TOML', async () => {
      const tomlPath = path.join(tmpDir, 'pictl.toml');
      await fs.writeFile(tomlPath, `invalid toml content [[[`);

      try {
        await loadConfig({
          configSearchPaths: [tmpDir],
        });
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Failed to parse TOML');
      }
    });

    it('should reject invalid JSON', async () => {
      const jsonPath = path.join(tmpDir, 'wasm4pm.json');
      await fs.writeFile(jsonPath, `{ invalid json ]`);

      try {
        await loadConfig({
          configSearchPaths: [tmpDir],
        });
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Failed to parse JSON');
      }
    });

    it('should validate execution profile enum', async () => {
      const tomlPath = path.join(tmpDir, 'pictl.toml');
      await fs.writeFile(
        tomlPath,
        `version = "26.4.5"
[execution]
profile = "invalid_profile"
`
      );

      try {
        await loadConfig({
          configSearchPaths: [tmpDir],
        });
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        // Should catch invalid enum value
      }
    });

    it('should validate output format enum', async () => {
      const jsonPath = path.join(tmpDir, 'wasm4pm.json');
      await fs.writeFile(
        jsonPath,
        JSON.stringify({
          version: '26.4.5',
          execution: { profile: 'balanced' },
          output: { format: 'invalid' },
        })
      );

      try {
        await loadConfig({
          configSearchPaths: [tmpDir],
        });
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        // Should catch invalid format value
      }
    });

    it('should validate timeout is positive', async () => {
      const tomlPath = path.join(tmpDir, 'pictl.toml');
      await fs.writeFile(
        tomlPath,
        `version = "26.4.5"
[execution]
profile = "balanced"
timeout = -1000
`
      );

      try {
        await loadConfig({
          configSearchPaths: [tmpDir],
        });
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        // Should catch negative timeout
      }
    });
  });

  describe('Environment Variables', () => {
    it('should load from WASM4PM_ prefixed env vars', async () => {
      const env = {
        WASM4PM_PROFILE: 'fast',
        WASM4PM_LOG_LEVEL: 'debug',
      };

      const config = await loadConfig({
        configSearchPaths: [tmpDir],
        env,
      });

      // Env vars should override defaults but lose to file/CLI
      expect(config.execution.profile).toBe('fast');
      expect(config.observability?.logLevel).toBe('debug');
      expect(config.metadata.provenance['execution.profile']?.source).toBe('env');
    });

    it('should parse boolean WASM4PM_WATCH from env', async () => {
      const env = {
        WASM4PM_WATCH: 'true',
      };

      const config = await loadConfig({
        configSearchPaths: [tmpDir],
        env,
      });

      expect(config.watch?.enabled).toBe(true);
    });

    it('should parse boolean WASM4PM_WATCH with 1', async () => {
      const env = {
        WASM4PM_WATCH: '1',
      };

      const config = await loadConfig({
        configSearchPaths: [tmpDir],
        env,
      });

      expect(config.watch?.enabled).toBe(true);
    });

    it('should parse false for WASM4PM_WATCH', async () => {
      const env = {
        WASM4PM_WATCH: 'false',
      };

      const config = await loadConfig({
        configSearchPaths: [tmpDir],
        env,
      });

      expect(config.watch?.enabled).toBe(false);
    });
  });

  describe('Hash and Provenance', () => {
    it('should compute deterministic config hash', async () => {
      const tomlPath = path.join(tmpDir, 'pictl.toml');
      await fs.writeFile(
        tomlPath,
        `version = "26.4.5"
[execution]
profile = "balanced"
`
      );

      const config1 = await loadConfig({
        configSearchPaths: [tmpDir],
      });

      const config2 = await loadConfig({
        configSearchPaths: [tmpDir],
      });

      // Same config should produce same hash
      expect(config1.metadata.hash).toBe(config2.metadata.hash);
    });

    it('should detect config changes in hash', async () => {
      const tomlPath = path.join(tmpDir, 'pictl.toml');

      // First config
      await fs.writeFile(
        tomlPath,
        `version = "26.4.5"
[execution]
profile = "balanced"
`
      );
      const config1 = await loadConfig({
        configSearchPaths: [tmpDir],
      });

      // Modified config
      await fs.writeFile(
        tomlPath,
        `version = "26.4.5"
[execution]
profile = "fast"
`
      );
      const config2 = await loadConfig({
        configSearchPaths: [tmpDir],
      });

      // Different profiles should have different hashes
      expect(config1.metadata.hash).not.toBe(config2.metadata.hash);
    });

    it('should include all config values in provenance', async () => {
      const tomlPath = path.join(tmpDir, 'pictl.toml');
      await fs.writeFile(
        tomlPath,
        `version = "26.4.5"
[execution]
profile = "quality"
timeout = 600000
`
      );

      const config = await loadConfig({
        configSearchPaths: [tmpDir],
      });

      const prov = config.metadata.provenance;
      expect(prov['version']).toBeDefined();
      expect(prov['execution.profile']).toBeDefined();
      expect(prov['execution.profile']?.value).toBe('quality');
      expect(prov['execution.timeout']?.value).toBe(600000);
    });
  });

  describe('Multiple Search Paths', () => {
    it('should search paths in order', async () => {
      const dir1 = path.join(tmpDir, 'dir1');
      const dir2 = path.join(tmpDir, 'dir2');

      await fs.mkdir(dir1, { recursive: true });
      await fs.mkdir(dir2, { recursive: true });

      // Write to dir2
      await fs.writeFile(
        path.join(dir2, 'pictl.toml'),
        `version = "26.4.5"
[execution]
profile = "balanced"
`
      );

      // Search dir1 first (will not find), then dir2
      const config = await loadConfig({
        configSearchPaths: [dir1, dir2],
      });

      expect(config.execution.profile).toBe('balanced');
      expect(config.metadata.provenance['execution.profile']?.path).toBe(path.join(dir2, 'pictl.toml'));
    });

    it('should use first matching config file', async () => {
      const dir1 = path.join(tmpDir, 'dir1');
      const dir2 = path.join(tmpDir, 'dir2');

      await fs.mkdir(dir1, { recursive: true });
      await fs.mkdir(dir2, { recursive: true });

      // Write to both
      await fs.writeFile(
        path.join(dir1, 'pictl.toml'),
        `version = "26.4.5"
[execution]
profile = "fast"
`
      );

      await fs.writeFile(
        path.join(dir2, 'pictl.toml'),
        `version = "26.4.5"
[execution]
profile = "balanced"
`
      );

      // Should use first match
      const config = await loadConfig({
        configSearchPaths: [dir1, dir2],
      });

      expect(config.execution.profile).toBe('fast');
      expect(config.metadata.provenance['execution.profile']?.path).toBe(path.join(dir1, 'pictl.toml'));
    });
  });
});
