import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  loadConfig,
  validate,
  hashConfig,
  fingerprintConfig,
  diffConfigs,
  getExampleTomlConfig,
  getExampleJsonConfig
} from '../index.js';
import type { Config, BaseConfig } from '../config.js';

describe('Integration Tests', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(process.cwd(), `.test-integration-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Complete Workflow', () => {
    it('should load, validate, and hash configuration end-to-end', async () => {
      // Create a config file
      const tomlPath = path.join(tmpDir, 'wasm4pm.toml');
      const tomlContent = `
version = "26.4.5"

[execution]
profile = "quality"
timeout = 600000
max_memory = 2147483648

[observability]
log_level = "debug"
metrics_enabled = true

[output]
format = "json"
destination = "/tmp/output.json"
`;
      await fs.writeFile(tomlPath, tomlContent);

      // Load with CLI overrides
      const config = await loadConfig({
        cliOverrides: { outputDestination: '/var/log/wasm4pm.json' },
        configSearchPaths: [tmpDir],
        env: { WASM4PM_LOG_LEVEL: 'warn' } // This should be overridden by file
      });

      // Verify structure
      expect(config).toBeDefined();
      expect(config.version).toBe('26.4.5');
      expect(config.execution.profile).toBe('quality');
      expect(config.execution.timeout).toBe(600000);
      expect(config.output?.format).toBe('json');

      // CLI override should take precedence
      expect(config.output?.destination).toBe('/var/log/wasm4pm.json');

      // Verify metadata
      expect(config.metadata.loadTime).toBeGreaterThan(0);
      expect(config.metadata.hash).toBeDefined();
      expect(config.metadata.hash.length).toBeGreaterThan(0);

      // Verify provenance
      expect(config.metadata.provenance['version']?.source).toBe('config');
      expect(config.metadata.provenance['execution']?.source).toBe('config');
      expect(config.metadata.provenance['output']?.source).toBe('cli');
    });

    it('should validate configuration from loaded config', async () => {
      const config = await loadConfig({
        configSearchPaths: [tmpDir]
      });

      // Should not throw - already validated
      expect(() => validate(config)).not.toThrow();
    });

    it('should compute consistent hash across loads', async () => {
      const tomlPath = path.join(tmpDir, 'wasm4pm.toml');
      await fs.writeFile(tomlPath, `
[execution]
profile = "fast"
`);

      const config1 = await loadConfig({
        configSearchPaths: [tmpDir]
      });

      const config2 = await loadConfig({
        configSearchPaths: [tmpDir]
      });

      expect(config1.metadata.hash).toBe(config2.metadata.hash);
    });

    it('should detect config changes with diff', async () => {
      const tomlPath = path.join(tmpDir, 'wasm4pm.toml');
      await fs.writeFile(tomlPath, `
[execution]
profile = "fast"
`);

      const config1 = await loadConfig({
        configSearchPaths: [tmpDir]
      });

      // Simulate config file change
      await fs.writeFile(tomlPath, `
[execution]
profile = "quality"
`);

      const config2 = await loadConfig({
        configSearchPaths: [tmpDir]
      });

      const diff = diffConfigs(config1, config2);
      expect(diff.changed).toBe(true);
      expect(diff.differences.length).toBeGreaterThan(0);
    });

    it('should handle migration from JSON to TOML', async () => {
      // Start with JSON
      const jsonPath = path.join(tmpDir, 'wasm4pm.json');
      await fs.writeFile(jsonPath, JSON.stringify({
        version: '26.4.5',
        execution: { profile: 'fast' }
      }));

      const config1 = await loadConfig({
        configSearchPaths: [tmpDir]
      });
      expect(config1.execution.profile).toBe('fast');
      expect(config1.source.path).toBe(jsonPath);

      // Switch to TOML
      await fs.rm(jsonPath);
      const tomlPath = path.join(tmpDir, 'wasm4pm.toml');
      await fs.writeFile(tomlPath, '[execution]\nprofile = "fast"');

      const config2 = await loadConfig({
        configSearchPaths: [tmpDir]
      });
      expect(config2.execution.profile).toBe('fast');
      expect(config2.source.path).toBe(tomlPath);
    });

    it('should support gradual config updates', async () => {
      const tomlPath = path.join(tmpDir, 'wasm4pm.toml');
      await fs.writeFile(tomlPath, `
[execution]
profile = "balanced"

[output]
format = "human"
`);

      const config1 = await loadConfig({
        configSearchPaths: [tmpDir]
      });

      // Update one section
      await fs.writeFile(tomlPath, `
[execution]
profile = "quality"

[output]
format = "human"
`);

      const config2 = await loadConfig({
        configSearchPaths: [tmpDir]
      });

      const diff = diffConfigs(config1, config2);
      expect(diff.differences.some(d => d.path.includes('profile'))).toBe(true);
      expect(diff.differences.some(d => d.path.includes('format'))).toBe(false);
    });
  });

  describe('Real-World Scenarios', () => {
    it('should support development environment setup', async () => {
      const tomlPath = path.join(tmpDir, 'wasm4pm.toml');
      await fs.writeFile(tomlPath, `
[execution]
profile = "balanced"

[observability]
log_level = "debug"
metrics_enabled = true

[watch]
enabled = true
interval = 500
debounce = 100

[output]
format = "human"
pretty = true
colorize = true
`);

      const config = await loadConfig({
        configSearchPaths: [tmpDir]
      });

      expect(config.execution.profile).toBe('balanced');
      expect(config.observability?.logLevel).toBe('debug');
      expect(config.watch?.enabled).toBe(true);
      expect(config.output?.pretty).toBe(true);
    });

    it('should support production environment setup', async () => {
      const config = await loadConfig({
        cliOverrides: {
          profile: 'quality'
        },
        env: {
          WASM4PM_LOG_LEVEL: 'warn',
          WASM4PM_OUTPUT_FORMAT: 'json',
          WASM4PM_OUTPUT_DESTINATION: '/var/log/wasm4pm.json'
        },
        configSearchPaths: [tmpDir]
      });

      expect(config.execution.profile).toBe('quality');
      expect(config.observability?.logLevel).toBe('warn');
      expect(config.output?.format).toBe('json');
      expect(config.output?.destination).toBe('/var/log/wasm4pm.json');
    });

    it('should support containerized deployment', async () => {
      const config = await loadConfig({
        env: {
          WASM4PM_PROFILE: 'fast',
          WASM4PM_LOG_LEVEL: 'info',
          WASM4PM_OUTPUT_DESTINATION: 'stdout'
        },
        configSearchPaths: [tmpDir]
      });

      expect(config.execution.profile).toBe('fast');
      expect(config.output?.destination).toBe('stdout');
    });

    it('should support config validation in CI/CD', async () => {
      const tomlPath = path.join(tmpDir, 'wasm4pm.toml');
      await fs.writeFile(tomlPath, `
[execution]
profile = "quality"
timeout = 600000
max_memory = 2147483648

[observability]
log_level = "info"

[output]
format = "json"
destination = "/tmp/output.json"
`);

      const config = await loadConfig({
        configSearchPaths: [tmpDir]
      });

      // Should pass validation
      expect(() => validate(config)).not.toThrow();

      // Should be hashable
      const hash = hashConfig(config);
      expect(hash).toBeDefined();

      // Should produce fingerprint for reporting
      const fingerprint = fingerprintConfig(config);
      expect(fingerprint.length).toBe(8);
    });
  });

  describe('Example Configs', () => {
    it('should provide valid TOML example', async () => {
      const tomlExample = getExampleTomlConfig();
      const tomlPath = path.join(tmpDir, 'wasm4pm.toml');
      await fs.writeFile(tomlPath, tomlExample);

      const config = await loadConfig({
        configSearchPaths: [tmpDir]
      });

      expect(config.version).toBe('26.4.5');
      expect(config.execution.profile).toBe('balanced');
    });

    it('should provide valid JSON example', async () => {
      const jsonExample = getExampleJsonConfig();
      const jsonPath = path.join(tmpDir, 'wasm4pm.json');
      await fs.writeFile(jsonPath, jsonExample);

      const config = await loadConfig({
        configSearchPaths: [tmpDir]
      });

      expect(config.version).toBe('26.4.5');
      expect(config.execution.profile).toBe('balanced');
    });
  });

  describe('Error Handling', () => {
    it('should recover from invalid TOML', async () => {
      const invalidTomlPath = path.join(tmpDir, 'wasm4pm.toml');
      await fs.writeFile(invalidTomlPath, 'invalid [toml content');

      await expect(
        loadConfig({ configSearchPaths: [tmpDir] })
      ).rejects.toThrow(/Failed to parse TOML/);
    });

    it('should recover from invalid JSON', async () => {
      const invalidJsonPath = path.join(tmpDir, 'wasm4pm.json');
      await fs.writeFile(invalidJsonPath, '{ invalid: }');

      await expect(
        loadConfig({ configSearchPaths: [tmpDir] })
      ).rejects.toThrow(/Failed to parse JSON/);
    });

    it('should reject invalid config values', async () => {
      const tomlPath = path.join(tmpDir, 'wasm4pm.toml');
      await fs.writeFile(tomlPath, `
[execution]
profile = "unknown_profile"
`);

      await expect(
        loadConfig({ configSearchPaths: [tmpDir] })
      ).rejects.toThrow(/validation failed/i);
    });
  });

  describe('Multi-Source Resolution', () => {
    it('should correctly merge configs from all sources', async () => {
      // Create config file with base settings
      const tomlPath = path.join(tmpDir, 'wasm4pm.toml');
      await fs.writeFile(tomlPath, `
[execution]
profile = "balanced"
timeout = 300000

[output]
format = "human"
`);

      // Load with all sources
      const config = await loadConfig({
        cliOverrides: {
          outputDestination: '/tmp/cli-output.json'
        },
        env: {
          WASM4PM_LOG_LEVEL: 'debug'
        },
        configSearchPaths: [tmpDir]
      });

      // Verify merging:
      // - File config
      expect(config.execution.profile).toBe('balanced');
      expect(config.execution.timeout).toBe(300000);
      expect(config.output?.format).toBe('human');

      // - Env config
      expect(config.observability?.logLevel).toBe('debug');

      // - CLI config
      expect(config.output?.destination).toBe('/tmp/cli-output.json');

      // - Default values
      expect(config.version).toBe('26.4.5');
    });

    it('should track provenance for each source', async () => {
      const tomlPath = path.join(tmpDir, 'wasm4pm.toml');
      await fs.writeFile(tomlPath, '[execution]\nprofile = "fast"');

      const config = await loadConfig({
        cliOverrides: { outputFormat: 'json' },
        env: { WASM4PM_LOG_LEVEL: 'debug' },
        configSearchPaths: [tmpDir]
      });

      // Check each source
      expect(config.metadata.provenance['version']?.source).toBe('default');
      expect(config.metadata.provenance['execution']?.source).toBe('config');
      expect(config.metadata.provenance['observability']?.source).toBe('env');
      expect(config.metadata.provenance['output']?.source).toBe('cli');
    });
  });

  describe('Performance', () => {
    it('should load config quickly', async () => {
      const tomlPath = path.join(tmpDir, 'wasm4pm.toml');
      await fs.writeFile(tomlPath, `
[execution]
profile = "balanced"
timeout = 300000
max_memory = 1073741824

[observability]
log_level = "info"
metrics_enabled = false

[watch]
enabled = false
interval = 1000

[output]
format = "human"
destination = "stdout"
`);

      const start = performance.now();
      const config = await loadConfig({
        configSearchPaths: [tmpDir]
      });
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(1000); // Should load in under 1 second
      expect(config).toBeDefined();
    });

    it('should compute hash quickly', () => {
      const config: BaseConfig = {
        version: '26.4.5',
        source: { kind: 'file' },
        execution: { profile: 'balanced' }
      };

      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        hashConfig(config);
      }
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(1000); // 1000 hashes in under 1 second
    });
  });
});
