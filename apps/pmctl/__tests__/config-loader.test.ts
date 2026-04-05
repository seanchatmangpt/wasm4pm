import { describe, it, expect, beforeEach } from 'vitest';
import { loadPmctlConfig, buildCliOverrides } from '../src/config-loader.js';
import type { CliOverrides } from '@wasm4pm/config';

describe('Config Loader', () => {
  describe('buildCliOverrides', () => {
    it('should build CLI overrides from args', () => {
      const args = {
        config: '/path/to/config.toml',
        profile: 'quality',
        format: 'json',
        output: '/tmp/out.json',
        watch: true,
      };

      const overrides = buildCliOverrides(args);

      expect(overrides.configPath).toBe('/path/to/config.toml');
      expect(overrides.profile).toBe('quality');
      expect(overrides.outputFormat).toBe('json');
      expect(overrides.outputDestination).toBe('/tmp/out.json');
      expect(overrides.watchEnabled).toBe(true);
    });

    it('should handle empty args', () => {
      const overrides = buildCliOverrides({});
      expect(Object.keys(overrides).length).toBe(0);
    });

    it('should ignore undefined watch value', () => {
      const args = { watch: undefined };
      const overrides = buildCliOverrides(args);
      expect(overrides.watchEnabled).toBeUndefined();
    });

    it('should handle false watch value', () => {
      const args = { watch: false };
      const overrides = buildCliOverrides(args);
      expect(overrides.watchEnabled).toBe(false);
    });
  });

  describe('loadPmctlConfig', () => {
    it('should load config with CLI overrides', async () => {
      const cliOverrides: CliOverrides = {
        profile: 'fast',
      };

      const config = await loadPmctlConfig(cliOverrides);

      expect(config.execution.profile).toBe('fast');
      expect(config.metadata.provenance['execution']?.source).toBe('cli');
    });

    it('should load default config when no overrides provided', async () => {
      const config = await loadPmctlConfig({});

      expect(config.version).toBe('26.4.5');
      expect(config.execution.profile).toBe('fast'); // Was overridden to 'fast'
      expect(config.metadata).toBeDefined();
      expect(config.metadata.hash).toBeDefined();
    });

    it('should merge CLI overrides with defaults', async () => {
      const cliOverrides: CliOverrides = {
        outputFormat: 'json',
      };

      const config = await loadPmctlConfig(cliOverrides);

      expect(config.output?.format).toBe('json');
      expect(config.execution.profile).toBe('fast'); // From previous override
    });
  });
});
