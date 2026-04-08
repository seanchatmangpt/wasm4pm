import { describe, it, expect } from 'vitest';
import {
  validate,
  validatePartial,
  toJsonSchema,
  SCHEMA_VERSION,
  configSchema,
} from '../schema.js';

describe('Schema', () => {
  const minimal = {
    version: '26.4.5',
    source: { kind: 'file' as const },
  };

  describe('validate', () => {
    it('accepts minimal config and fills defaults', () => {
      const result = validate(minimal);
      expect(result.schemaVersion).toBe(SCHEMA_VERSION);
      expect(result.execution.profile).toBe('balanced');
      expect(result.sink.kind).toBe('stdout');
      expect(result.algorithm.name).toBe('dfg');
      expect(result.output.format).toBe('human');
      expect(result.observability.logLevel).toBe('info');
    });

    it('accepts full config', () => {
      const full = {
        schemaVersion: 1,
        version: '1.0.0',
        source: { kind: 'http', url: 'http://localhost:8080/events' },
        sink: { kind: 'file', path: './output.pnml' },
        algorithm: { name: 'heuristic_miner', parameters: { threshold: 0.8 } },
        execution: { profile: 'quality', timeout: 600000, maxMemory: 2147483648 },
        observability: {
          logLevel: 'debug',
          metricsEnabled: true,
          otel: {
            enabled: true,
            exporter: 'otlp',
            endpoint: 'http://localhost:4318',
            required: true,
            headers: { Authorization: 'Bearer tok' },
          },
        },
        watch: { enabled: true, poll_interval: 500, checkpoint_dir: '/tmp/ckpt' },
        output: { format: 'json', destination: '/var/log/out.json', pretty: false, colorize: false },
      };
      expect(() => validate(full)).not.toThrow();
      const result = validate(full);
      expect(result.source.kind).toBe('http');
      expect(result.sink.kind).toBe('file');
      expect(result.algorithm.parameters).toEqual({ threshold: 0.8 });
      expect(result.observability.otel?.exporter).toBe('otlp');
      expect(result.observability.otel?.required).toBe(true);
      expect(result.watch?.poll_interval).toBe(500);
      expect(result.watch?.checkpoint_dir).toBe('/tmp/ckpt');
    });

    it('accepts all source kinds', () => {
      for (const kind of ['file', 'stream', 'http'] as const) {
        expect(() => validate({ ...minimal, source: { kind } })).not.toThrow();
      }
    });

    it('accepts all sink kinds', () => {
      for (const kind of ['stdout', 'file', 'http'] as const) {
        expect(() => validate({ ...minimal, sink: { kind } })).not.toThrow();
      }
    });

    it('accepts all execution profiles', () => {
      for (const profile of ['fast', 'balanced', 'quality', 'stream'] as const) {
        expect(() =>
          validate({ ...minimal, execution: { profile } }),
        ).not.toThrow();
      }
    });

    it('accepts all otel exporters', () => {
      for (const exporter of ['otlp', 'console', 'none'] as const) {
        expect(() =>
          validate({
            ...minimal,
            observability: { otel: { enabled: true, exporter } },
          }),
        ).not.toThrow();
      }
    });

    it('rejects invalid version format', () => {
      expect(() => validate({ ...minimal, version: 'v1.0' })).toThrow(/validation failed/i);
      expect(() => validate({ ...minimal, version: '1.0' })).toThrow();
      expect(() => validate({ ...minimal, version: '' })).toThrow();
    });

    it('rejects invalid source kind', () => {
      expect(() => validate({ ...minimal, source: { kind: 'ftp' } })).toThrow();
    });

    it('rejects invalid sink kind', () => {
      expect(() => validate({ ...minimal, sink: { kind: 'kafka' } })).toThrow();
    });

    it('rejects invalid execution profile', () => {
      expect(() =>
        validate({ ...minimal, execution: { profile: 'turbo' } }),
      ).toThrow();
    });

    it('rejects invalid otel exporter', () => {
      expect(() =>
        validate({
          ...minimal,
          observability: { otel: { enabled: true, exporter: 'zipkin' } },
        }),
      ).toThrow();
    });

    it('rejects negative timeout', () => {
      expect(() =>
        validate({ ...minimal, execution: { timeout: -1 } }),
      ).toThrow();
    });

    it('rejects zero maxMemory', () => {
      expect(() =>
        validate({ ...minimal, execution: { maxMemory: 0 } }),
      ).toThrow();
    });

    it('rejects non-positive poll_interval', () => {
      expect(() =>
        validate({ ...minimal, watch: { enabled: true, poll_interval: 0 } }),
      ).toThrow();
      expect(() =>
        validate({ ...minimal, watch: { enabled: true, poll_interval: -10 } }),
      ).toThrow();
    });

    it('rejects invalid log level', () => {
      expect(() =>
        validate({ ...minimal, observability: { logLevel: 'verbose' } }),
      ).toThrow();
    });

    it('rejects empty algorithm name', () => {
      expect(() =>
        validate({ ...minimal, algorithm: { name: '' } }),
      ).toThrow();
    });

    it('rejects non-numeric version', () => {
      expect(() => validate({ ...minimal, version: 123 })).toThrow();
    });

    it('includes schemaVersion in output', () => {
      const result = validate(minimal);
      expect(result.schemaVersion).toBe(SCHEMA_VERSION);
    });
  });

  describe('validatePartial', () => {
    it('allows empty object', () => {
      expect(() => validatePartial({})).not.toThrow();
    });

    it('validates individual sections', () => {
      expect(() => validatePartial({ execution: { profile: 'fast' } })).not.toThrow();
      expect(() => validatePartial({ algorithm: { name: 'alpha_plus_plus' } })).not.toThrow();
      expect(() => validatePartial({ sink: { kind: 'http' } })).not.toThrow();
    });

    it('rejects invalid values', () => {
      expect(() => validatePartial({ execution: { profile: 'turbo' } })).toThrow();
    });
  });

  describe('toJsonSchema', () => {
    it('returns valid JSON schema with properties', () => {
      const schema = toJsonSchema();
      expect(schema.type).toBe('object');
      expect(schema.properties).toBeDefined();
      const props = schema.properties as Record<string, any>;
      expect(props.version).toBeDefined();
      expect(props.source).toBeDefined();
      expect(props.sink).toBeDefined();
      expect(props.algorithm).toBeDefined();
      expect(props.execution).toBeDefined();
      expect(props.observability).toBeDefined();
      expect(props.output).toBeDefined();
    });

    it('includes required fields', () => {
      const schema = toJsonSchema();
      const required = schema.required as string[];
      expect(required).toContain('version');
      expect(required).toContain('source');
    });

    it('includes nested object schemas', () => {
      const schema = toJsonSchema();
      const props = schema.properties as Record<string, any>;
      expect(props.source.type).toBe('object');
      expect(props.source.properties.kind).toBeDefined();
      expect(props.sink.type).toBe('object');
      expect(props.algorithm.type).toBe('object');
    });

    it('includes enum values for source.kind', () => {
      const schema = toJsonSchema();
      const sourceKind = (schema.properties as any).source.properties.kind;
      expect(sourceKind.enum).toEqual(['file', 'stream', 'http']);
    });

    it('includes default values where set', () => {
      const schema = toJsonSchema();
      const props = schema.properties as Record<string, any>;
      expect(props.schemaVersion.default).toBe(SCHEMA_VERSION);
    });

    it('returns serializable JSON', () => {
      const schema = toJsonSchema();
      expect(() => JSON.stringify(schema)).not.toThrow();
    });
  });

  describe('ML configuration', () => {
    it('accepts valid ML config with classify and cluster tasks', () => {
      const config = {
        ...minimal,
        ml: { enabled: true, tasks: ['classify', 'cluster'], method: 'knn', k: 5 },
      };
      const result = validate(config);
      expect(result.ml.enabled).toBe(true);
      expect(result.ml.tasks).toEqual(['classify', 'cluster']);
      expect(result.ml.method).toBe('knn');
      expect(result.ml.k).toBe(5);
    });

    it('accepts all 6 ML tasks', () => {
      const config = {
        ...minimal,
        ml: { enabled: true, tasks: ['classify', 'cluster', 'forecast', 'anomaly', 'regress', 'pca'] },
      };
      const result = validate(config);
      expect(result.ml.tasks).toHaveLength(6);
    });

    it('accepts ML config with all parameters', () => {
      const config = {
        ...minimal,
        ml: {
          enabled: true,
          tasks: ['classify'],
          method: 'knn',
          k: 10,
          targetKey: 'result',
          forecastPeriods: 12,
          nComponents: 5,
          eps: 2.5,
        },
      };
      const result = validate(config);
      expect(result.ml.enabled).toBe(true);
      expect(result.ml.method).toBe('knn');
      expect(result.ml.k).toBe(10);
      expect(result.ml.targetKey).toBe('result');
      expect(result.ml.forecastPeriods).toBe(12);
      expect(result.ml.nComponents).toBe(5);
      expect(result.ml.eps).toBe(2.5);
    });

    it('accepts ML config with only enabled flag', () => {
      const config = { ...minimal, ml: { enabled: true } };
      const result = validate(config);
      expect(result.ml.enabled).toBe(true);
      expect(result.ml.tasks).toEqual([]);
      expect(result.ml.targetKey).toBe('outcome');
      expect(result.ml.forecastPeriods).toBe(5);
      expect(result.ml.nComponents).toBe(2);
      expect(result.ml.eps).toBe(1.0);
    });

    it('defaults ml to disabled with empty tasks', () => {
      const result = validate(minimal);
      expect(result.ml).toBeUndefined();
    });

    it('defaults ml.enabled to false when ml section present but enabled omitted', () => {
      const config = { ...minimal, ml: { tasks: ['classify'] } };
      const result = validate(config);
      expect(result.ml.enabled).toBe(false);
      expect(result.ml.tasks).toEqual(['classify']);
    });

    it('rejects invalid ML task names', () => {
      expect(() =>
        validate({ ...minimal, ml: { enabled: true, tasks: ['unknown_task'] } }),
      ).toThrow();
      expect(() =>
        validate({ ...minimal, ml: { enabled: true, tasks: ['CLASSIFY'] } }),
      ).toThrow();
      expect(() =>
        validate({ ...minimal, ml: { enabled: true, tasks: ['classify', 'bogus'] } }),
      ).toThrow();
    });

    it('rejects non-positive k', () => {
      expect(() =>
        validate({ ...minimal, ml: { enabled: true, k: 0 } }),
      ).toThrow();
      expect(() =>
        validate({ ...minimal, ml: { enabled: true, k: -1 } }),
      ).toThrow();
    });

    it('rejects non-positive forecastPeriods', () => {
      expect(() =>
        validate({ ...minimal, ml: { enabled: true, forecastPeriods: 0 } }),
      ).toThrow();
      expect(() =>
        validate({ ...minimal, ml: { enabled: true, forecastPeriods: -3 } }),
      ).toThrow();
    });

    it('rejects non-positive nComponents', () => {
      expect(() =>
        validate({ ...minimal, ml: { enabled: true, nComponents: 0 } }),
      ).toThrow();
      expect(() =>
        validate({ ...minimal, ml: { enabled: true, nComponents: -1 } }),
      ).toThrow();
    });

    it('rejects non-positive eps', () => {
      expect(() =>
        validate({ ...minimal, ml: { enabled: true, eps: 0 } }),
      ).toThrow();
      expect(() =>
        validate({ ...minimal, ml: { enabled: true, eps: -1.5 } }),
      ).toThrow();
    });

    it('rejects non-boolean enabled', () => {
      expect(() =>
        validate({ ...minimal, ml: { enabled: 'yes' } }),
      ).toThrow();
      expect(() =>
        validate({ ...minimal, ml: { enabled: 1 } }),
      ).toThrow();
    });

    it('rejects non-array tasks', () => {
      expect(() =>
        validate({ ...minimal, ml: { enabled: true, tasks: 'classify' } }),
      ).toThrow();
      expect(() =>
        validate({ ...minimal, ml: { enabled: true, tasks: 42 } }),
      ).toThrow();
    });

    it('includes ml in JSON schema', () => {
      const schema = toJsonSchema();
      const props = schema.properties as Record<string, any>;
      expect(props.ml).toBeDefined();
      expect(props.ml.type).toBe('object');
      expect(props.ml.properties.enabled).toBeDefined();
      expect(props.ml.properties.tasks).toBeDefined();
      expect(props.ml.properties.method).toBeDefined();
      expect(props.ml.properties.k).toBeDefined();
      expect(props.ml.properties.targetKey).toBeDefined();
      expect(props.ml.properties.forecastPeriods).toBeDefined();
      expect(props.ml.properties.nComponents).toBeDefined();
      expect(props.ml.properties.eps).toBeDefined();
    });

    it('ml is optional in JSON schema', () => {
      const schema = toJsonSchema();
      const required = schema.required as string[];
      expect(required).not.toContain('ml');
    });
  });
});
