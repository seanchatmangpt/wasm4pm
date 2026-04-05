import { describe, it, expect } from 'vitest';
import { validate, validatePartial, getExampleConfig } from '../validate.js';
import type { BaseConfig } from '../config.js';

describe('Configuration Validation', () => {
  describe('validate', () => {
    it('should validate valid configuration', () => {
      const config: BaseConfig = {
        version: '26.4.5',
        source: { kind: 'file', path: './wasm4pm.toml' },
        execution: { profile: 'balanced' },
        observability: { logLevel: 'info' },
        watch: { enabled: false, interval: 1000 },
        output: { format: 'human', destination: 'stdout' }
      };

      expect(() => validate(config)).not.toThrow();
    });

    it('should accept valid execution profiles', () => {
      const profiles: Array<'fast' | 'balanced' | 'quality' | 'stream'> = [
        'fast',
        'balanced',
        'quality',
        'stream'
      ];

      for (const profile of profiles) {
        const config = {
          version: '26.4.5',
          source: { kind: 'file' as const },
          execution: { profile }
        };
        expect(() => validate(config)).not.toThrow();
      }
    });

    it('should reject invalid execution profile', () => {
      const config = {
        version: '26.4.5',
        source: { kind: 'file' as const },
        execution: { profile: 'invalid' }
      } as any;

      expect(() => validate(config)).toThrow();
    });

    it('should accept valid log levels', () => {
      const levels = ['debug', 'info', 'warn', 'error'];

      for (const logLevel of levels) {
        const config = {
          version: '26.4.5',
          source: { kind: 'file' as const },
          execution: { profile: 'balanced' as const },
          observability: { logLevel: logLevel as any }
        };
        expect(() => validate(config)).not.toThrow();
      }
    });

    it('should reject invalid log level', () => {
      const config = {
        version: '26.4.5',
        source: { kind: 'file' as const },
        execution: { profile: 'balanced' as const },
        observability: { logLevel: 'verbose' }
      } as any;

      expect(() => validate(config)).toThrow();
    });

    it('should accept valid output formats', () => {
      const formats = ['human', 'json'];

      for (const format of formats) {
        const config = {
          version: '26.4.5',
          source: { kind: 'file' as const },
          execution: { profile: 'balanced' as const },
          output: { format: format as any, destination: 'stdout' }
        };
        expect(() => validate(config)).not.toThrow();
      }
    });

    it('should reject invalid output format', () => {
      const config = {
        version: '26.4.5',
        source: { kind: 'file' as const },
        execution: { profile: 'balanced' as const },
        output: { format: 'xml', destination: 'stdout' }
      } as any;

      expect(() => validate(config)).toThrow();
    });

    it('should require timeout to be positive', () => {
      const config = {
        version: '26.4.5',
        source: { kind: 'file' as const },
        execution: { profile: 'balanced' as const, timeout: -1000 }
      };

      expect(() => validate(config)).toThrow();
    });

    it('should require maxMemory to be positive', () => {
      const config = {
        version: '26.4.5',
        source: { kind: 'file' as const },
        execution: { profile: 'balanced' as const, maxMemory: 0 }
      };

      expect(() => validate(config)).toThrow();
    });

    it('should require version to be semantic versioning', () => {
      const validVersions = ['26.4.5', '0.1.0', '1.2.3'];
      const invalidVersions = ['26.4', 'v26.4.5', '26.4.5.1'];

      for (const version of validVersions) {
        const config = {
          version,
          source: { kind: 'file' as const },
          execution: { profile: 'balanced' as const }
        };
        expect(() => validate(config)).not.toThrow();
      }

      for (const version of invalidVersions) {
        const config = {
          version,
          source: { kind: 'file' as const },
          execution: { profile: 'balanced' as const }
        } as any;
        expect(() => validate(config)).toThrow();
      }
    });

    it('should require source kind to be valid', () => {
      const config = {
        version: '26.4.5',
        source: { kind: 'invalid' },
        execution: { profile: 'balanced' as const }
      } as any;

      expect(() => validate(config)).toThrow();
    });

    it('should accept optional fields', () => {
      const config = {
        version: '26.4.5',
        source: { kind: 'file' as const },
        execution: { profile: 'balanced' as const }
        // no observability, watch, output
      };

      expect(() => validate(config)).not.toThrow();
    });

    it('should accept watch interval as positive integer', () => {
      const config = {
        version: '26.4.5',
        source: { kind: 'file' as const },
        execution: { profile: 'balanced' as const },
        watch: { enabled: true, interval: 1000 }
      };

      expect(() => validate(config)).not.toThrow();
    });

    it('should reject watch interval as zero', () => {
      const config = {
        version: '26.4.5',
        source: { kind: 'file' as const },
        execution: { profile: 'balanced' as const },
        watch: { enabled: true, interval: 0 }
      };

      expect(() => validate(config)).toThrow();
    });

    it('should reject watch interval as negative', () => {
      const config = {
        version: '26.4.5',
        source: { kind: 'file' as const },
        execution: { profile: 'balanced' as const },
        watch: { enabled: true, interval: -1000 }
      };

      expect(() => validate(config)).toThrow();
    });

    it('should accept debounce as non-negative', () => {
      const config = {
        version: '26.4.5',
        source: { kind: 'file' as const },
        execution: { profile: 'balanced' as const },
        watch: { enabled: true, interval: 1000, debounce: 0 }
      };

      expect(() => validate(config)).not.toThrow();
    });

    it('should reject debounce as negative', () => {
      const config = {
        version: '26.4.5',
        source: { kind: 'file' as const },
        execution: { profile: 'balanced' as const },
        watch: { enabled: true, interval: 1000, debounce: -1 }
      };

      expect(() => validate(config)).toThrow();
    });

    it('should provide helpful error messages', () => {
      const config = {
        version: '26.4.5',
        source: { kind: 'file' as const },
        execution: { profile: 'invalid_profile' }
      } as any;

      let error: Error | null = null;
      try {
        validate(config);
      } catch (e) {
        error = e as Error;
      }

      expect(error).not.toBeNull();
      expect(error?.message).toContain('validation failed');
    });
  });

  describe('validatePartial', () => {
    it('should allow partial configuration', () => {
      const partialConfig = {
        execution: { profile: 'fast' as const }
      };

      expect(() => validatePartial(partialConfig)).not.toThrow();
    });

    it('should validate partial nested config', () => {
      const partialConfig = {
        observability: { logLevel: 'debug' as const }
      };

      expect(() => validatePartial(partialConfig)).not.toThrow();
    });

    it('should reject invalid values in partial config', () => {
      const partialConfig = {
        execution: { profile: 'invalid' }
      };

      expect(() => validatePartial(partialConfig)).toThrow();
    });

    it('should allow empty partial config', () => {
      expect(() => validatePartial({})).not.toThrow();
    });
  });

  describe('getExampleConfig', () => {
    it('should return valid example configuration', () => {
      const example = getExampleConfig();
      expect(() => validate(example)).not.toThrow();
    });

    it('should have all required fields', () => {
      const example = getExampleConfig();
      expect(example.version).toBeDefined();
      expect(example.source).toBeDefined();
      expect(example.execution).toBeDefined();
    });

    it('should use reasonable defaults', () => {
      const example = getExampleConfig();
      expect(example.execution.profile).toBe('balanced');
      expect(example.observability?.logLevel).toBe('info');
      expect(example.watch?.enabled).toBe(false);
    });

    it('should match documented schema', () => {
      const example = getExampleConfig();
      // Check that all values are documented in the schema
      expect(['fast', 'balanced', 'quality', 'stream']).toContain(
        example.execution.profile
      );
      expect(['debug', 'info', 'warn', 'error']).toContain(
        example.observability?.logLevel
      );
      expect(['human', 'json']).toContain(example.output?.format);
    });
  });

  describe('Error Messages', () => {
    it('should include field path in error message', () => {
      const config = {
        version: '26.4.5',
        source: { kind: 'file' as const },
        execution: { profile: 'invalid' }
      } as any;

      let error: Error | null = null;
      try {
        validate(config);
      } catch (e) {
        error = e as Error;
      }

      expect(error?.message).toMatch(/execution/);
    });

    it('should include remediation hints when available', () => {
      const config = {
        version: '26.4.5',
        source: { kind: 'file' as const },
        execution: { profile: 'invalid' }
      } as any;

      let error: Error | null = null;
      try {
        validate(config);
      } catch (e) {
        error = e as Error;
      }

      // Should suggest valid values
      const message = error?.message || '';
      expect(
        message.includes('fast') ||
        message.includes('balanced') ||
        message.includes('quality') ||
        message.includes('stream')
      ).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should reject non-string version', () => {
      const config = {
        version: 26.4,
        source: { kind: 'file' as const },
        execution: { profile: 'balanced' as const }
      } as any;

      expect(() => validate(config)).toThrow();
    });

    it('should reject non-boolean watch.enabled', () => {
      const config = {
        version: '26.4.5',
        source: { kind: 'file' as const },
        execution: { profile: 'balanced' as const },
        watch: { enabled: 'yes', interval: 1000 }
      } as any;

      expect(() => validate(config)).toThrow();
    });

    it('should reject non-boolean observability.metricsEnabled', () => {
      const config = {
        version: '26.4.5',
        source: { kind: 'file' as const },
        execution: { profile: 'balanced' as const },
        observability: { metricsEnabled: 'yes' }
      } as any;

      expect(() => validate(config)).toThrow();
    });

    it('should accept optional otel configuration', () => {
      const config = {
        version: '26.4.5',
        source: { kind: 'file' as const },
        execution: { profile: 'balanced' as const },
        observability: {
          otel: {
            enabled: true,
            endpoint: 'http://localhost:4318'
          }
        }
      };

      expect(() => validate(config)).not.toThrow();
    });

    it('should reject invalid otel endpoint', () => {
      const config = {
        version: '26.4.5',
        source: { kind: 'file' as const },
        execution: { profile: 'balanced' as const },
        observability: {
          otel: {
            enabled: true,
            endpoint: 'not-a-valid-url'
          }
        }
      } as any;

      expect(() => validate(config)).toThrow();
    });
  });
});
