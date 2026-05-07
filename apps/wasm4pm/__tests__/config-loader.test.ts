import { describe, it, expect } from 'vitest';
import { loadWasm4pmConfig, buildCliOverrides } from '../src/config-loader.js';
import type { CliOverrides } from '@wasm4pm/config';

describe('Config Loader', () => {
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
  });

  describe('loadWasm4pmConfig', () => {
    it('applies CLI overrides, falls back to defaults, and merges partial overrides', async () => {
      const fastConfig = await loadWasm4pmConfig({ profile: 'fast' });
      expect(fastConfig.execution.profile).toBe('fast');

      const defaultConfig = await loadWasm4pmConfig({});
      expect(defaultConfig.version).toBeDefined();
      expect(defaultConfig.execution.profile).toBe('balanced');
      expect(defaultConfig.metadata).toBeDefined();
      expect(defaultConfig.metadata.hash).toBeDefined();

      const mergedConfig = await loadWasm4pmConfig({ outputFormat: 'json' });
      expect(mergedConfig.output?.format).toBe('json');
      expect(mergedConfig.execution.profile).toBe('balanced');
    });
  });
});
