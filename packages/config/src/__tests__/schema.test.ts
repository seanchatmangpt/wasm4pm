import { describe, it, expect } from 'vitest';
import {
  validate,
  validatePartial,
  toJsonSchema,
  SCHEMA_VERSION,
  configSchema,
} from '../schema.js';
import { resolveConfig } from '../resolver.js';

describe('Schema', () => {
  const minimal = {
    version: '26.4.5',
    source: { kind: 'file' as const },
  };

  describe('validate', () => {
    it('accepts minimal config, full config, and all valid enum values', () => {
      const result = validate(minimal);
      expect(result.schemaVersion).toBe(SCHEMA_VERSION);
      expect(result.execution.profile).toBe('balanced');
      expect(result.sink.kind).toBe('stdout');
      expect(result.algorithm.name).toBe('dfg');
      expect(result.output.format).toBe('human');
      expect(result.observability.logLevel).toBe('info');

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
      const fullResult = validate(full);
      expect(fullResult.source.kind).toBe('http');
      expect(fullResult.sink.kind).toBe('file');
      expect(fullResult.algorithm.parameters).toEqual({ threshold: 0.8 });
      expect(fullResult.observability.otel?.exporter).toBe('otlp');
      expect(fullResult.observability.otel?.required).toBe(true);
      expect(fullResult.watch?.poll_interval).toBe(500);
      expect(fullResult.watch?.checkpoint_dir).toBe('/tmp/ckpt');

      for (const kind of ['file', 'stream', 'http'] as const) {
        expect(() => validate({ ...minimal, source: { kind } })).not.toThrow();
      }
      for (const kind of ['stdout', 'file', 'http'] as const) {
        expect(() => validate({ ...minimal, sink: { kind } })).not.toThrow();
      }
      for (const profile of ['fast', 'balanced', 'quality', 'stream'] as const) {
        expect(() => validate({ ...minimal, execution: { profile } })).not.toThrow();
      }
      for (const exporter of ['otlp', 'console', 'none'] as const) {
        expect(() =>
          validate({ ...minimal, observability: { otel: { enabled: true, exporter } } })
        ).not.toThrow();
      }
    });

    it('rejects invalid enum values and constraint violations', () => {
      expect(() => validate({ ...minimal, version: 'v1.0' })).toThrow(/validation failed/i);
      expect(() => validate({ ...minimal, version: '1.0' })).toThrow();
      expect(() => validate({ ...minimal, version: '' })).toThrow();
      expect(() => validate({ ...minimal, source: { kind: 'ftp' } })).toThrow();
      expect(() => validate({ ...minimal, sink: { kind: 'kafka' } })).toThrow();
      expect(() => validate({ ...minimal, execution: { profile: 'turbo' } })).toThrow();
      expect(() =>
        validate({ ...minimal, observability: { otel: { enabled: true, exporter: 'zipkin' } } })
      ).toThrow();
      expect(() => validate({ ...minimal, execution: { timeout: -1 } })).toThrow();
      expect(() => validate({ ...minimal, execution: { maxMemory: 0 } })).toThrow();
      expect(() => validate({ ...minimal, watch: { enabled: true, poll_interval: 0 } })).toThrow();
      expect(() => validate({ ...minimal, watch: { enabled: true, poll_interval: -10 } })).toThrow();
      expect(() => validate({ ...minimal, observability: { logLevel: 'verbose' } })).toThrow();
      expect(() => validate({ ...minimal, algorithm: { name: '' } })).toThrow();
      expect(() => validate({ ...minimal, version: 123 })).toThrow();
    });
  });

  describe('validatePartial', () => {
    it('allows empty object, valid sections, and rejects invalid values', () => {
      expect(() => validatePartial({})).not.toThrow();
      expect(() => validatePartial({ execution: { profile: 'fast' } })).not.toThrow();
      expect(() => validatePartial({ algorithm: { name: 'alpha_plus_plus' } })).not.toThrow();
      expect(() => validatePartial({ sink: { kind: 'http' } })).not.toThrow();
      expect(() => validatePartial({ execution: { profile: 'turbo' } })).toThrow();
    });
  });

  describe('toJsonSchema', () => {
    it('returns valid JSON schema with all top-level properties, required fields, nested schemas, enum values, defaults, and is serializable', () => {
      const schema = toJsonSchema();
      expect(schema.type).toBe('object');
      const props = schema.properties as Record<string, any>;
      expect(props.version).toBeDefined();
      expect(props.source).toBeDefined();
      expect(props.sink).toBeDefined();
      expect(props.algorithm).toBeDefined();
      expect(props.execution).toBeDefined();
      expect(props.observability).toBeDefined();
      expect(props.output).toBeDefined();
      expect(props.ml).toBeDefined();
      expect(props.ml.type).toBe('object');
      const required = schema.required as string[];
      expect(required).toContain('version');
      expect(required).toContain('source');
      expect(required).not.toContain('ml');

      expect(props.source.type).toBe('object');
      expect(props.source.properties.kind).toBeDefined();
      expect(props.source.properties.kind.enum).toEqual(['file', 'stream', 'http']);
      expect(props.sink.type).toBe('object');
      expect(props.algorithm.type).toBe('object');
      expect(props.schemaVersion.default).toBe(SCHEMA_VERSION);
      expect(() => JSON.stringify(schema)).not.toThrow();
      expect(props.ml.properties.enabled).toBeDefined();
      expect(props.ml.properties.tasks).toBeDefined();
      expect(props.ml.properties.method).toBeDefined();
      expect(props.ml.properties.k).toBeDefined();
      expect(props.ml.properties.targetKey).toBeDefined();
      expect(props.ml.properties.forecastPeriods).toBeDefined();
      expect(props.ml.properties.nComponents).toBeDefined();
      expect(props.ml.properties.eps).toBeDefined();
    });
  });

  describe('ML configuration', () => {
    it('accepts valid ML config with all tasks, full params, and defaults', () => {
      const full = validate({
        ...minimal,
        ml: { enabled: true, tasks: ['classify', 'cluster'], method: 'knn', k: 5 },
      });
      expect(full.ml.enabled).toBe(true);
      expect(full.ml.tasks).toEqual(['classify', 'cluster']);
      expect(full.ml.method).toBe('knn');
      expect(full.ml.k).toBe(5);

      const allTasks = validate({
        ...minimal,
        ml: { enabled: true, tasks: ['classify', 'cluster', 'forecast', 'anomaly', 'regress', 'pca'] },
      });
      expect(allTasks.ml.tasks).toHaveLength(6);

      const withParams = validate({
        ...minimal,
        ml: { enabled: true, tasks: ['classify'], method: 'knn', k: 10, targetKey: 'result',
              forecastPeriods: 12, nComponents: 5, eps: 2.5 },
      });
      expect(withParams.ml.method).toBe('knn');
      expect(withParams.ml.k).toBe(10);
      expect(withParams.ml.targetKey).toBe('result');
      expect(withParams.ml.forecastPeriods).toBe(12);
      expect(withParams.ml.nComponents).toBe(5);
      expect(withParams.ml.eps).toBe(2.5);

      const minimal_ml = validate({ ...minimal, ml: { enabled: true } });
      expect(minimal_ml.ml.enabled).toBe(true);
      expect(minimal_ml.ml.tasks).toEqual([]);
      expect(minimal_ml.ml.targetKey).toBe('outcome');
      expect(minimal_ml.ml.forecastPeriods).toBe(5);
      expect(minimal_ml.ml.nComponents).toBe(2);
      expect(minimal_ml.ml.eps).toBe(1.0);

      expect(validate(minimal).ml).toBeUndefined();

      const noEnabled = validate({ ...minimal, ml: { tasks: ['classify'] } });
      expect(noEnabled.ml.enabled).toBe(false);
      expect(noEnabled.ml.tasks).toEqual(['classify']);
    });

    it('rejects invalid ML tasks, non-positive numerics, and wrong types', () => {
      expect(() => validate({ ...minimal, ml: { enabled: true, tasks: ['unknown_task'] } })).toThrow();
      expect(() => validate({ ...minimal, ml: { enabled: true, tasks: ['CLASSIFY'] } })).toThrow();
      expect(() => validate({ ...minimal, ml: { enabled: true, tasks: ['classify', 'bogus'] } })).toThrow();
      expect(() => validate({ ...minimal, ml: { enabled: true, k: 0 } })).toThrow();
      expect(() => validate({ ...minimal, ml: { enabled: true, k: -1 } })).toThrow();
      expect(() => validate({ ...minimal, ml: { enabled: true, forecastPeriods: 0 } })).toThrow();
      expect(() => validate({ ...minimal, ml: { enabled: true, forecastPeriods: -3 } })).toThrow();
      expect(() => validate({ ...minimal, ml: { enabled: true, nComponents: 0 } })).toThrow();
      expect(() => validate({ ...minimal, ml: { enabled: true, nComponents: -1 } })).toThrow();
      expect(() => validate({ ...minimal, ml: { enabled: true, eps: 0 } })).toThrow();
      expect(() => validate({ ...minimal, ml: { enabled: true, eps: -1.5 } })).toThrow();
      expect(() => validate({ ...minimal, ml: { enabled: 'yes' } })).toThrow();
      expect(() => validate({ ...minimal, ml: { enabled: 1 } })).toThrow();
      expect(() => validate({ ...minimal, ml: { enabled: true, tasks: 'classify' } })).toThrow();
      expect(() => validate({ ...minimal, ml: { enabled: true, tasks: 42 } })).toThrow();
    });
  });
  describe("resolveConfig profile enum enforcement", () => {
    it("throws a ZodError when an invalid profile is supplied via cliOverrides", async () => {
      await expect(
        resolveConfig({
          cliOverrides: { profile: "cloud" as any },
          configSearchPaths: [],
        })
      ).rejects.toThrow();
    });
  });

});
