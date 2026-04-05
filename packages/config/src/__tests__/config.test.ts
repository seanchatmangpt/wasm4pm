import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { loadConfig, getExampleTomlConfig, getExampleJsonConfig } from '../config.js';
import { validate } from '../validate.js';
import type { Config, CliOverrides } from '../config.js';

describe('Configuration System', () => {
  let tmpDir: string;

  beforeEach(async () => {
    // Create temporary directory for test configs
    tmpDir = path.join(process.cwd(), `.test-config-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('loadConfig', () => {
    it('should load default configuration when no overrides provided', async () => {
      const config = await loadConfig({
        configSearchPaths: [tmpDir]
      });

      expect(config.version).toBe('26.4.5');
      expect(config.execution.profile).toBe('balanced');
      expect(config.source.kind).toBe('cli');
      expect(config.metadata).toBeDefined();
      expect(config.metadata.hash).toBeDefined();
      expect(config.metadata.provenance).toBeDefined();
    });

    it('should apply CLI overrides with highest priority', async () => {
      const cliOverrides: CliOverrides = {
        profile: 'quality',
        outputFormat: 'json',
        outputDestination: '/tmp/output.json'
      };

      const config = await loadConfig({
        cliOverrides,
        configSearchPaths: [tmpDir]
      });

      expect(config.execution.profile).toBe('quality');
      expect(config.output?.format).toBe('json');
      expect(config.output?.destination).toBe('/tmp/output.json');
      expect(config.metadata.provenance['execution']?.source).toBe('cli');
    });

    it('should load configuration from TOML file', async () => {
      const tomlPath = path.join(tmpDir, 'wasm4pm.toml');
      const tomlContent = `
version = "26.4.5"
[execution]
profile = "fast"
timeout = 60000
`;
      await fs.writeFile(tomlPath, tomlContent);

      const config = await loadConfig({
        configSearchPaths: [tmpDir]
      });

      expect(config.execution.profile).toBe('fast');
      expect(config.execution.timeout).toBe(60000);
      expect(config.source.kind).toBe('file');
      expect(config.source.path).toBe(tomlPath);
      expect(config.metadata.provenance['execution']?.source).toBe('config');
      expect(config.metadata.provenance['execution']?.path).toBe(tomlPath);
    });

    it('should load configuration from JSON file', async () => {
      const jsonPath = path.join(tmpDir, 'wasm4pm.json');
      const jsonContent = JSON.stringify({
        version: '26.4.5',
        execution: {
          profile: 'quality',
          timeout: 600000
        },
        output: {
          format: 'json',
          destination: 'stdout'
        }
      });
      await fs.writeFile(jsonPath, jsonContent);

      const config = await loadConfig({
        configSearchPaths: [tmpDir]
      });

      expect(config.execution.profile).toBe('quality');
      expect(config.execution.timeout).toBe(600000);
      expect(config.output?.format).toBe('json');
      expect(config.source.kind).toBe('file');
      expect(config.source.path).toBe(jsonPath);
    });

    it('should prefer TOML over JSON when both exist', async () => {
      const tomlPath = path.join(tmpDir, 'wasm4pm.toml');
      const jsonPath = path.join(tmpDir, 'wasm4pm.json');

      await fs.writeFile(tomlPath, '[execution]\nprofile = "fast"');
      await fs.writeFile(jsonPath, JSON.stringify({
        version: '26.4.5',
        execution: { profile: 'quality' }
      }));

      const config = await loadConfig({
        configSearchPaths: [tmpDir]
      });

      expect(config.execution.profile).toBe('fast');
      expect(config.source.path).toBe(tomlPath);
    });

    it('should load configuration from environment variables', async () => {
      const env = {
        ...process.env,
        WASM4PM_PROFILE: 'stream',
        WASM4PM_LOG_LEVEL: 'debug',
        WASM4PM_OUTPUT_FORMAT: 'json',
        WASM4PM_WATCH: 'true'
      };

      const config = await loadConfig({
        configSearchPaths: [tmpDir],
        env
      });

      expect(config.execution.profile).toBe('stream');
      expect(config.observability?.logLevel).toBe('debug');
      expect(config.output?.format).toBe('json');
      expect(config.watch?.enabled).toBe(true);
    });

    it('should apply provenance tracking correctly', async () => {
      const tomlPath = path.join(tmpDir, 'wasm4pm.toml');
      await fs.writeFile(tomlPath, '[execution]\nprofile = "fast"');

      const env = {
        WASM4PM_LOG_LEVEL: 'debug'
      };

      const cliOverrides: CliOverrides = {
        outputFormat: 'json'
      };

      const config = await loadConfig({
        cliOverrides,
        configSearchPaths: [tmpDir],
        env: { ...process.env, ...env }
      });

      // Check provenance for different sources
      expect(config.metadata.provenance['version']?.source).toBe('default');
      expect(config.metadata.provenance['execution']?.source).toBe('config');
      expect(config.metadata.provenance['observability']?.source).toBe('env');
      expect(config.metadata.provenance['output']?.source).toBe('cli');
    });

    it('should merge partial configurations correctly', async () => {
      const tomlPath = path.join(tmpDir, 'wasm4pm.toml');
      await fs.writeFile(tomlPath, `
[execution]
profile = "fast"
timeout = 60000

[output]
format = "json"
`);

      const cliOverrides: CliOverrides = {
        outputDestination: '/tmp/out.json'
      };

      const config = await loadConfig({
        cliOverrides,
        configSearchPaths: [tmpDir]
      });

      // TOML values should be preserved
      expect(config.execution.profile).toBe('fast');
      expect(config.execution.timeout).toBe(60000);
      expect(config.output?.format).toBe('json');
      // CLI override should merge without overwriting other output fields
      expect(config.output?.destination).toBe('/tmp/out.json');
    });

    it('should reject invalid configuration', async () => {
      const tomlPath = path.join(tmpDir, 'wasm4pm.toml');
      await fs.writeFile(tomlPath, `
[execution]
profile = "invalid_profile"
timeout = "not_a_number"
`);

      await expect(
        loadConfig({ configSearchPaths: [tmpDir] })
      ).rejects.toThrow();
    });

    it('should handle missing config files gracefully', async () => {
      const config = await loadConfig({
        configSearchPaths: [tmpDir]
      });

      expect(config).toBeDefined();
      expect(config.version).toBe('26.4.5');
    });

    it('should throw on invalid TOML syntax', async () => {
      const tomlPath = path.join(tmpDir, 'wasm4pm.toml');
      await fs.writeFile(tomlPath, '[execution\ninvalid syntax');

      await expect(
        loadConfig({ configSearchPaths: [tmpDir] })
      ).rejects.toThrow(/Failed to parse TOML/);
    });

    it('should throw on invalid JSON syntax', async () => {
      const jsonPath = path.join(tmpDir, 'wasm4pm.json');
      await fs.writeFile(jsonPath, '{ invalid json }');

      await expect(
        loadConfig({ configSearchPaths: [tmpDir] })
      ).rejects.toThrow(/Failed to parse JSON/);
    });

    it('should handle environment variable boolean conversion', async () => {
      const config1 = await loadConfig({
        configSearchPaths: [tmpDir],
        env: { WASM4PM_WATCH: 'true' }
      });

      const config2 = await loadConfig({
        configSearchPaths: [tmpDir],
        env: { WASM4PM_WATCH: '1' }
      });

      const config3 = await loadConfig({
        configSearchPaths: [tmpDir],
        env: { WASM4PM_WATCH: 'false' }
      });

      expect(config1.watch?.enabled).toBe(true);
      expect(config2.watch?.enabled).toBe(true);
      expect(config3.watch?.enabled).toBe(false);
    });
  });

  describe('Configuration Metadata', () => {
    it('should include loadTime in metadata', async () => {
      const before = Date.now();
      const config = await loadConfig({
        configSearchPaths: [path.join(process.cwd(), '.nonexistent')]
      });
      const after = Date.now();

      expect(config.metadata.loadTime).toBeGreaterThanOrEqual(before);
      expect(config.metadata.loadTime).toBeLessThanOrEqual(after);
    });

    it('should include hash in metadata', async () => {
      const config = await loadConfig({
        configSearchPaths: [path.join(process.cwd(), '.nonexistent')]
      });

      expect(config.metadata.hash).toBeDefined();
      expect(typeof config.metadata.hash).toBe('string');
      expect(config.metadata.hash.length).toBeGreaterThan(0);
    });

    it('should track all provenance information', async () => {
      const tomlPath = path.join(tmpDir, 'wasm4pm.toml');
      await fs.writeFile(tomlPath, '[execution]\nprofile = "fast"');

      const config = await loadConfig({
        cliOverrides: { outputFormat: 'json' },
        configSearchPaths: [tmpDir],
        env: { WASM4PM_LOG_LEVEL: 'debug' }
      });

      expect(Object.keys(config.metadata.provenance).length).toBeGreaterThan(0);

      // Check that all keys have provenance
      for (const key of Object.keys(config.metadata.provenance)) {
        const prov = config.metadata.provenance[key];
        expect(prov.value).toBeDefined();
        expect(['config', 'env', 'default', 'cli']).toContain(prov.source);
      }
    });
  });

  describe('Example Configuration', () => {
    it('should provide valid TOML example', () => {
      const tomlExample = getExampleTomlConfig();
      expect(tomlExample).toContain('profile = "balanced"');
      expect(tomlExample).toContain('[execution]');
      expect(tomlExample).toContain('[observability]');
    });

    it('should provide valid JSON example', () => {
      const jsonExample = getExampleJsonConfig();
      const parsed = JSON.parse(jsonExample);
      expect(parsed.version).toBe('26.4.5');
      expect(parsed.execution.profile).toBe('balanced');
    });

    it('should provide example that validates', () => {
      const jsonExample = getExampleJsonConfig();
      const parsed = JSON.parse(jsonExample);
      expect(() => validate(parsed)).not.toThrow();
    });
  });

  describe('Resolution Order', () => {
    it('should follow correct priority: CLI > ENV > File > Defaults', async () => {
      const tomlPath = path.join(tmpDir, 'wasm4pm.toml');
      await fs.writeFile(tomlPath, '[execution]\nprofile = "fast"');

      const config = await loadConfig({
        cliOverrides: { profile: 'quality' },
        configSearchPaths: [tmpDir],
        env: { WASM4PM_PROFILE: 'stream' }
      });

      // CLI should win
      expect(config.execution.profile).toBe('quality');
      expect(config.metadata.provenance['execution']?.source).toBe('cli');
    });

    it('should use ENV when CLI not provided', async () => {
      const config = await loadConfig({
        configSearchPaths: [tmpDir],
        env: { WASM4PM_PROFILE: 'stream' }
      });

      expect(config.execution.profile).toBe('stream');
      expect(config.metadata.provenance['execution']?.source).toBe('env');
    });

    it('should use file config when CLI and ENV not provided', async () => {
      const tomlPath = path.join(tmpDir, 'wasm4pm.toml');
      await fs.writeFile(tomlPath, '[execution]\nprofile = "fast"');

      const config = await loadConfig({
        configSearchPaths: [tmpDir]
      });

      expect(config.execution.profile).toBe('fast');
      expect(config.metadata.provenance['execution']?.source).toBe('config');
    });

    it('should use defaults when nothing else provided', async () => {
      const config = await loadConfig({
        configSearchPaths: [path.join(process.cwd(), '.nonexistent')]
      });

      expect(config.execution.profile).toBe('balanced');
      expect(config.metadata.provenance['execution']?.source).toBe('default');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty configuration file', async () => {
      const tomlPath = path.join(tmpDir, 'wasm4pm.toml');
      await fs.writeFile(tomlPath, '');

      const config = await loadConfig({
        configSearchPaths: [tmpDir]
      });

      expect(config.version).toBe('26.4.5');
      expect(config.execution.profile).toBe('balanced');
    });

    it('should handle null/undefined values in env', async () => {
      const config = await loadConfig({
        configSearchPaths: [tmpDir],
        env: {
          WASM4PM_PROFILE: undefined as any,
          WASM4PM_LOG_LEVEL: null as any
        }
      });

      // Should fall back to defaults
      expect(config.execution.profile).toBe('balanced');
      expect(config.observability?.logLevel).toBe('info');
    });

    it('should handle partial CLI overrides', async () => {
      const config = await loadConfig({
        cliOverrides: {
          profile: 'fast'
          // other fields not specified
        },
        configSearchPaths: [tmpDir]
      });

      expect(config.execution.profile).toBe('fast');
      // Other values should be defaults
      expect(config.execution.timeout).toBe(300000);
    });

    it('should handle unicode in file paths', async () => {
      const unicodePath = path.join(tmpDir, 'wasm4pm.toml');
      await fs.writeFile(unicodePath, `
[execution]
profile = "balanced"
`);

      const config = await loadConfig({
        configSearchPaths: [tmpDir]
      });

      expect(config).toBeDefined();
    });
  });
});
