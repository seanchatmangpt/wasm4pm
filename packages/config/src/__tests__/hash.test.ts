import { describe, it, expect } from 'vitest';
import {
  hashConfig,
  verifyConfigHash,
  fingerprintConfig,
  hashConfigSection,
  diffConfigs
} from '../hash.js';
import type { BaseConfig } from '../config.js';

describe('Configuration Hashing', () => {
  const baseConfig: BaseConfig = {
    version: '26.4.5',
    source: { kind: 'file', path: './wasm4pm.toml' },
    execution: { profile: 'balanced', timeout: 300000 },
    observability: { logLevel: 'info', metricsEnabled: false },
    watch: { enabled: false, interval: 1000 },
    output: { format: 'human', destination: 'stdout' }
  };

  describe('hashConfig', () => {
    it('should return consistent hash for same config', () => {
      const hash1 = hashConfig(baseConfig);
      const hash2 = hashConfig(baseConfig);

      expect(hash1).toBe(hash2);
    });

    it('should return different hash for different config', () => {
      const config2: BaseConfig = {
        ...baseConfig,
        execution: { profile: 'fast', timeout: 300000 }
      };

      const hash1 = hashConfig(baseConfig);
      const hash2 = hashConfig(config2);

      expect(hash1).not.toBe(hash2);
    });

    it('should return hex string', () => {
      const hash = hashConfig(baseConfig);

      expect(typeof hash).toBe('string');
      expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
    });

    it('should be deterministic regardless of field order in source', () => {
      const config1: BaseConfig = {
        version: '26.4.5',
        source: { kind: 'file' },
        execution: { profile: 'balanced' }
      };

      const config2: BaseConfig = {
        execution: { profile: 'balanced' },
        version: '26.4.5',
        source: { kind: 'file' }
      } as any;

      const hash1 = hashConfig(config1);
      const hash2 = hashConfig(config2);

      expect(hash1).toBe(hash2);
    });

    it('should ignore source.path changes', () => {
      const config1: BaseConfig = {
        ...baseConfig,
        source: { kind: 'file', path: './wasm4pm.toml' }
      };

      const config2: BaseConfig = {
        ...baseConfig,
        source: { kind: 'file', path: '/etc/wasm4pm.toml' }
      };

      const hash1 = hashConfig(config1);
      const hash2 = hashConfig(config2);

      // Hashes should be different because source.kind is included
      expect(hash1).toBe(hash2);
    });

    it('should detect execution profile changes', () => {
      const config1 = hashConfig({
        ...baseConfig,
        execution: { profile: 'fast' }
      });

      const config2 = hashConfig({
        ...baseConfig,
        execution: { profile: 'quality' }
      });

      expect(config1).not.toBe(config2);
    });

    it('should detect output format changes', () => {
      const config1 = hashConfig({
        ...baseConfig,
        output: { format: 'human', destination: 'stdout' }
      });

      const config2 = hashConfig({
        ...baseConfig,
        output: { format: 'json', destination: 'stdout' }
      });

      expect(config1).not.toBe(config2);
    });

    it('should handle missing optional fields', () => {
      const config1: BaseConfig = {
        version: '26.4.5',
        source: { kind: 'file' },
        execution: { profile: 'balanced' }
      };

      const config2: BaseConfig = {
        version: '26.4.5',
        source: { kind: 'file' },
        execution: { profile: 'balanced' },
        observability: undefined,
        watch: undefined,
        output: undefined
      };

      const hash1 = hashConfig(config1);
      const hash2 = hashConfig(config2);

      expect(hash1).toBe(hash2);
    });
  });

  describe('verifyConfigHash', () => {
    it('should return true for matching hash', () => {
      const hash = hashConfig(baseConfig);
      expect(verifyConfigHash(baseConfig, hash)).toBe(true);
    });

    it('should return false for non-matching hash', () => {
      const wrongHash = 'deadbeef123456789';
      expect(verifyConfigHash(baseConfig, wrongHash)).toBe(false);
    });

    it('should return false when config changes', () => {
      const hash = hashConfig(baseConfig);
      const modifiedConfig: BaseConfig = {
        ...baseConfig,
        execution: { profile: 'quality' }
      };

      expect(verifyConfigHash(modifiedConfig, hash)).toBe(false);
    });

    it('should work for determinism checking', () => {
      const config1 = baseConfig;
      const hash1 = hashConfig(config1);

      // Simulate loading same config twice
      const config2 = JSON.parse(JSON.stringify(config1)) as BaseConfig;
      expect(verifyConfigHash(config2, hash1)).toBe(true);
    });
  });

  describe('fingerprintConfig', () => {
    it('should return short string', () => {
      const fingerprint = fingerprintConfig(baseConfig);

      expect(typeof fingerprint).toBe('string');
      expect(fingerprint.length).toBe(8);
    });

    it('should be deterministic', () => {
      const fp1 = fingerprintConfig(baseConfig);
      const fp2 = fingerprintConfig(baseConfig);

      expect(fp1).toBe(fp2);
    });

    it('should differ for different configs', () => {
      const fp1 = fingerprintConfig(baseConfig);
      const fp2 = fingerprintConfig({
        ...baseConfig,
        execution: { profile: 'fast' }
      });

      expect(fp1).not.toBe(fp2);
    });

    it('should use only hex characters', () => {
      const fingerprint = fingerprintConfig(baseConfig);
      expect(/^[0-9a-f]{8}$/.test(fingerprint)).toBe(true);
    });

    it('should be suitable for logging', () => {
      const fp = fingerprintConfig(baseConfig);
      // Should be short enough to include in log lines
      expect(fp.length).toBeLessThan(20);
    });
  });

  describe('hashConfigSection', () => {
    it('should hash individual sections', () => {
      const hash = hashConfigSection(baseConfig.execution);

      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(0);
    });

    it('should be deterministic', () => {
      const section = { profile: 'balanced', timeout: 300000 };
      const hash1 = hashConfigSection(section);
      const hash2 = hashConfigSection(section);

      expect(hash1).toBe(hash2);
    });

    it('should differ for different sections', () => {
      const hash1 = hashConfigSection({ profile: 'fast' });
      const hash2 = hashConfigSection({ profile: 'quality' });

      expect(hash1).not.toBe(hash2);
    });

    it('should work with nested structures', () => {
      const section = {
        otel: { enabled: true, endpoint: 'http://localhost' }
      };
      expect(() => hashConfigSection(section)).not.toThrow();
    });
  });

  describe('diffConfigs', () => {
    it('should detect no changes in identical configs', () => {
      const config1 = baseConfig;
      const config2 = { ...baseConfig };

      const diff = diffConfigs(config1, config2);

      expect(diff.changed).toBe(false);
      expect(diff.differences.length).toBe(0);
    });

    it('should detect execution profile change', () => {
      const config1 = baseConfig;
      const config2: BaseConfig = {
        ...baseConfig,
        execution: { profile: 'fast' }
      };

      const diff = diffConfigs(config1, config2);

      expect(diff.changed).toBe(true);
      expect(diff.differences.length).toBeGreaterThan(0);
      expect(diff.differences[0].path).toContain('profile');
    });

    it('should track before and after values', () => {
      const config1 = baseConfig;
      const config2: BaseConfig = {
        ...baseConfig,
        execution: { profile: 'fast' }
      };

      const diff = diffConfigs(config1, config2);

      const change = diff.differences.find(d => d.path.includes('profile'));
      expect(change?.before).toBe('balanced');
      expect(change?.after).toBe('fast');
    });

    it('should detect multiple changes', () => {
      const config1 = baseConfig;
      const config2: BaseConfig = {
        ...baseConfig,
        execution: { profile: 'fast' },
        output: { format: 'json', destination: 'stderr' }
      };

      const diff = diffConfigs(config1, config2);

      expect(diff.differences.length).toBeGreaterThanOrEqual(2);
    });

    it('should include hash comparison', () => {
      const config1 = baseConfig;
      const config2: BaseConfig = {
        ...baseConfig,
        execution: { profile: 'fast' }
      };

      const diff = diffConfigs(config1, config2);

      expect(diff.hash1).toBeDefined();
      expect(diff.hash2).toBeDefined();
      expect(diff.hash1).not.toBe(diff.hash2);
    });

    it('should handle nested property changes', () => {
      const config1 = baseConfig;
      const config2: BaseConfig = {
        ...baseConfig,
        observability: { logLevel: 'debug' }
      };

      const diff = diffConfigs(config1, config2);

      expect(diff.changed).toBe(true);
      const logChange = diff.differences.find(d =>
        d.path.includes('logLevel')
      );
      expect(logChange?.before).toBe('info');
      expect(logChange?.after).toBe('debug');
    });

    it('should handle adding new optional fields', () => {
      const config1: BaseConfig = {
        version: '26.4.5',
        source: { kind: 'file' },
        execution: { profile: 'balanced' }
      };

      const config2: BaseConfig = {
        ...config1,
        observability: { logLevel: 'debug' }
      };

      const diff = diffConfigs(config1, config2);

      expect(diff.changed).toBe(true);
    });

    it('should handle removing optional fields', () => {
      const config1 = baseConfig;
      const config2: BaseConfig = {
        version: '26.4.5',
        source: { kind: 'file' },
        execution: { profile: 'balanced' }
      };

      const diff = diffConfigs(config1, config2);

      expect(diff.changed).toBe(true);
    });
  });

  describe('Determinism Checks', () => {
    it('should maintain same hash across serialization rounds', () => {
      const config1 = baseConfig;
      const serialized = JSON.stringify(config1);
      const config2 = JSON.parse(serialized) as BaseConfig;

      expect(hashConfig(config1)).toBe(hashConfig(config2));
    });

    it('should be usable for caching', () => {
      const cache = new Map<string, string>();

      const hash1 = hashConfig(baseConfig);
      cache.set(hash1, 'result1');

      const hash2 = hashConfig(baseConfig);
      expect(cache.has(hash2)).toBe(true);
      expect(cache.get(hash2)).toBe('result1');
    });

    it('should work for integrity checking', () => {
      const config = baseConfig;
      const storedHash = hashConfig(config);

      // Later, verify config hasn't been tampered with
      expect(verifyConfigHash(config, storedHash)).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle minimal config', () => {
      const minimalConfig: BaseConfig = {
        version: '26.4.5',
        source: { kind: 'cli' },
        execution: { profile: 'balanced' }
      };

      const hash = hashConfig(minimalConfig);
      expect(hash).toBeDefined();
      expect(hash.length).toBeGreaterThan(0);
    });

    it('should handle config with all optional fields', () => {
      const fullConfig: BaseConfig = {
        version: '26.4.5',
        source: { kind: 'file', path: './wasm4pm.toml' },
        execution: {
          profile: 'quality',
          timeout: 600000,
          maxMemory: 2147483648
        },
        observability: {
          otel: {
            enabled: true,
            endpoint: 'http://localhost:4318',
            headers: { 'Authorization': 'Bearer token' }
          },
          logLevel: 'debug',
          metricsEnabled: true
        },
        watch: {
          enabled: true,
          interval: 500,
          debounce: 100
        },
        output: {
          format: 'json',
          destination: '/var/log/wasm4pm.log',
          pretty: false,
          colorize: false
        }
      };

      const hash = hashConfig(fullConfig);
      expect(hash).toBeDefined();
    });

    it('should handle boolean values in watch config', () => {
      const config1 = hashConfig({
        ...baseConfig,
        watch: { enabled: true, interval: 1000 }
      });

      const config2 = hashConfig({
        ...baseConfig,
        watch: { enabled: false, interval: 1000 }
      });

      expect(config1).not.toBe(config2);
    });
  });
});
