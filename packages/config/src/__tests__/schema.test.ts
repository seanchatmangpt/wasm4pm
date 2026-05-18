import { describe, it, expect } from 'vitest';
import * as toml from 'toml';
import {
  validate,
  validatePartial,
  toJsonSchema,
  SCHEMA_VERSION,
  configSchema,
} from '../schema.js';
import { resolveConfig, configToToml, configToEnv } from '../resolver.js';

const minimal = {
  version: '26.4.5',
  source: { kind: 'file' as const },
};

// ---------------------------------------------------------------------------
// validate — acceptance
// ---------------------------------------------------------------------------
describe('Schema', () => {
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
        source: { kind: 'http', url: 'https://example.com/events' },
        sink: { kind: 'file', path: './output.pnml' },
        algorithm: { name: 'heuristic_miner', parameters: { threshold: 0.8 } },
        execution: { profile: 'quality', timeout: 600000, maxMemory: 2147483648 },
        observability: {
          logLevel: 'debug',
          metricsEnabled: true,
          otel: {
            enabled: true,
            exporter: 'otlp',
            endpoint: 'https://otel-collector.example.com:4318',
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

      // source kinds: 'file' and 'stream' need no url; 'http' requires url
      for (const kind of ['file', 'stream'] as const) {
        expect(() => validate({ ...minimal, source: { kind } })).not.toThrow();
      }
      expect(() =>
        validate({ ...minimal, source: { kind: 'http', url: 'https://example.com/events.xes' } })
      ).not.toThrow();
      // sink kinds: 'stdout' needs no extra field; 'file' requires path; 'http' requires url
      expect(() => validate({ ...minimal, sink: { kind: 'stdout' } })).not.toThrow();
      expect(() =>
        validate({ ...minimal, sink: { kind: 'file', path: './output.pnml' } })
      ).not.toThrow();
      expect(() =>
        validate({ ...minimal, sink: { kind: 'http', url: 'https://example.com/results' } })
      ).not.toThrow();
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

  // ---------------------------------------------------------------------------
  // validatePartial
  // ---------------------------------------------------------------------------
  describe('validatePartial', () => {
    it('allows empty object, valid sections, and rejects invalid values', () => {
      expect(() => validatePartial({})).not.toThrow();
      expect(() => validatePartial({ execution: { profile: 'fast' } })).not.toThrow();
      expect(() => validatePartial({ algorithm: { name: 'alpha_plus_plus' } })).not.toThrow();
      // sink.kind='http' without url is now always rejected — cross-field constraint
      // fires even in partial validation because the constraint is on the object itself.
      expect(() => validatePartial({ sink: { kind: 'http' } })).toThrow(/sink\.url is required/);
      expect(() =>
        validatePartial({ sink: { kind: 'http', url: 'https://example.com/results' } })
      ).not.toThrow();
      expect(() => validatePartial({ execution: { profile: 'turbo' } })).toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // toJsonSchema
  // ---------------------------------------------------------------------------
  describe('toJsonSchema', () => {
    it('returns valid JSON schema with all top-level properties, required fields, nested schemas, enum values, defaults, and is serializable', () => {
      const schema = toJsonSchema();
      expect(schema.type).toBe('object');
      const props = schema.properties as Record<string, unknown>;
      expect(props.version).toBeDefined();
      expect(props.source).toBeDefined();
      expect(props.sink).toBeDefined();
      expect(props.algorithm).toBeDefined();
      expect(props.execution).toBeDefined();
      expect(props.observability).toBeDefined();
      expect(props.output).toBeDefined();
      expect(props.ml).toBeDefined();
      expect((props.ml as Record<string, unknown>).type).toBe('object');
      const required = schema.required as string[];
      expect(required).toContain('version');
      expect(required).toContain('source');
      expect(required).not.toContain('ml');

      const src = (props.source as Record<string, unknown>);
      expect(src.type).toBe('object');
      const srcProps = src.properties as Record<string, unknown>;
      expect(srcProps.kind).toBeDefined();
      expect((srcProps.kind as Record<string, unknown>).enum).toEqual(['file', 'stream', 'http']);
      expect((props.sink as Record<string, unknown>).type).toBe('object');
      expect((props.algorithm as Record<string, unknown>).type).toBe('object');
      expect((props.schemaVersion as Record<string, unknown>).default).toBe(SCHEMA_VERSION);
      expect(() => JSON.stringify(schema)).not.toThrow();
      const mlProps = (props.ml as Record<string, unknown>).properties as Record<string, unknown>;
      expect(mlProps.enabled).toBeDefined();
      expect(mlProps.tasks).toBeDefined();
      expect(mlProps.method).toBeDefined();
      expect(mlProps.k).toBeDefined();
      expect(mlProps.targetKey).toBeDefined();
      expect(mlProps.forecastPeriods).toBeDefined();
      expect(mlProps.nComponents).toBeDefined();
      expect(mlProps.eps).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // ML configuration — nested sub-sections
  // ---------------------------------------------------------------------------
  describe('ML configuration', () => {
    it('accepts valid ML config with all tasks, full params, and defaults', () => {
      const full = validate({
        ...minimal,
        ml: { enabled: true, tasks: ['classify', 'cluster'], method: 'knn', k: 5 },
      });
      expect(full.ml?.enabled).toBe(true);
      expect(full.ml?.tasks).toEqual(['classify', 'cluster']);
      expect(full.ml?.method).toBe('knn');
      expect(full.ml?.k).toBe(5);

      const allTasks = validate({
        ...minimal,
        ml: { enabled: true, tasks: ['classify', 'cluster', 'forecast', 'anomaly', 'regress', 'pca'] },
      });
      expect(allTasks.ml?.tasks).toHaveLength(6);

      const withParams = validate({
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
      });
      expect(withParams.ml?.method).toBe('knn');
      expect(withParams.ml?.k).toBe(10);
      expect(withParams.ml?.targetKey).toBe('result');
      expect(withParams.ml?.forecastPeriods).toBe(12);
      expect(withParams.ml?.nComponents).toBe(5);
      expect(withParams.ml?.eps).toBe(2.5);

      const minimal_ml = validate({ ...minimal, ml: { enabled: true } });
      expect(minimal_ml.ml?.enabled).toBe(true);
      expect(minimal_ml.ml?.tasks).toEqual([]);
      expect(minimal_ml.ml?.targetKey).toBe('outcome');
      expect(minimal_ml.ml?.forecastPeriods).toBe(5);
      expect(minimal_ml.ml?.nComponents).toBe(2);
      expect(minimal_ml.ml?.eps).toBe(1.0);

      expect(validate(minimal).ml).toBeUndefined();

      const noEnabled = validate({ ...minimal, ml: { tasks: ['classify'] } });
      expect(noEnabled.ml?.enabled).toBe(false);
      expect(noEnabled.ml?.tasks).toEqual(['classify']);
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

  // ---------------------------------------------------------------------------
  // resolveConfig profile enum enforcement
  // ---------------------------------------------------------------------------
  describe('resolveConfig profile enum enforcement', () => {
    it('throws a ZodError when an invalid profile is supplied via cliOverrides', async () => {
      await expect(
        resolveConfig({
          cliOverrides: { profile: 'cloud' as 'fast' },
          configSearchPaths: [],
        })
      ).rejects.toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// configToToml — serialization
// ---------------------------------------------------------------------------
describe('configToToml', () => {
  let baseConfig: Awaited<ReturnType<typeof resolveConfig>>;

  // Re-use a single resolved config for all toml tests
  beforeAll(async () => {
    baseConfig = await resolveConfig({ configSearchPaths: [] });
  });

  it('returns a non-empty string', () => {
    const tomlStr = configToToml(baseConfig);
    expect(typeof tomlStr).toBe('string');
    expect(tomlStr.length).toBeGreaterThan(0);
  });

  it('contains [source] section', () => {
    expect(configToToml(baseConfig)).toContain('[source]');
  });

  it('contains [algorithm] section', () => {
    expect(configToToml(baseConfig)).toContain('[algorithm]');
  });

  it('contains [execution] section', () => {
    expect(configToToml(baseConfig)).toContain('[execution]');
  });

  it('contains [output] section', () => {
    expect(configToToml(baseConfig)).toContain('[output]');
  });

  it('contains [observability] section', () => {
    expect(configToToml(baseConfig)).toContain('[observability]');
  });

  it('embeds the resolved algorithm name', () => {
    const tomlStr = configToToml(baseConfig);
    expect(tomlStr).toContain(`name = "${baseConfig.algorithm.name}"`);
  });

  it('embeds the resolved execution profile', () => {
    const tomlStr = configToToml(baseConfig);
    expect(tomlStr).toContain(`profile = "${baseConfig.execution.profile}"`);
  });

  it('output is parseable TOML (round-trip)', () => {
    const tomlStr = configToToml(baseConfig);
    // toml.parse should not throw — the output must be syntactically valid
    expect(() => toml.parse(tomlStr)).not.toThrow();
  });

  it('round-trip preserves algorithm name', () => {
    const tomlStr = configToToml(baseConfig);
    const parsed = toml.parse(tomlStr) as Record<string, unknown>;
    const algo = parsed.algorithm as Record<string, unknown>;
    expect(algo?.name).toBe(baseConfig.algorithm.name);
  });

  it('round-trip preserves execution profile', () => {
    const tomlStr = configToToml(baseConfig);
    const parsed = toml.parse(tomlStr) as Record<string, unknown>;
    const exec = parsed.execution as Record<string, unknown>;
    expect(exec?.profile).toBe(baseConfig.execution.profile);
  });

  it('serializes custom algorithm and quality profile', async () => {
    const cfg = await resolveConfig({
      cliOverrides: { algorithm: 'genetic_algorithm', profile: 'quality' },
      configSearchPaths: [],
    });
    const tomlStr = configToToml(cfg);
    expect(tomlStr).toContain('genetic_algorithm');
    expect(tomlStr).toContain('quality');
  });
});

// ---------------------------------------------------------------------------
// configToEnv — serialization
// ---------------------------------------------------------------------------
describe('configToEnv', () => {
  let baseConfig: Awaited<ReturnType<typeof resolveConfig>>;

  beforeAll(async () => {
    baseConfig = await resolveConfig({ configSearchPaths: [] });
  });

  it('returns a non-empty string', () => {
    const envStr = configToEnv(baseConfig);
    expect(typeof envStr).toBe('string');
    expect(envStr.length).toBeGreaterThan(0);
  });

  it('every non-comment, non-blank line starts with WASM4PM_', () => {
    const lines = configToEnv(baseConfig)
      .split('\n')
      .filter((l) => l.trim().length > 0 && !l.startsWith('#'));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).toMatch(/^WASM4PM_/);
    }
  });

  it('contains WASM4PM_ALGORITHM', () => {
    expect(configToEnv(baseConfig)).toContain('WASM4PM_ALGORITHM=');
  });

  it('contains WASM4PM_PROFILE', () => {
    expect(configToEnv(baseConfig)).toContain('WASM4PM_PROFILE=');
  });

  it('contains WASM4PM_OUTPUT_FORMAT', () => {
    expect(configToEnv(baseConfig)).toContain('WASM4PM_OUTPUT_FORMAT=');
  });

  it('contains WASM4PM_LOG_LEVEL', () => {
    expect(configToEnv(baseConfig)).toContain('WASM4PM_LOG_LEVEL=');
  });

  it('contains WASM4PM_SOURCE_KIND', () => {
    expect(configToEnv(baseConfig)).toContain('WASM4PM_SOURCE_KIND=');
  });

  it('embeds the resolved algorithm name value', () => {
    const envStr = configToEnv(baseConfig);
    expect(envStr).toContain(`WASM4PM_ALGORITHM="${baseConfig.algorithm.name}"`);
  });

  it('embeds the resolved profile value', () => {
    const envStr = configToEnv(baseConfig);
    expect(envStr).toContain(`WASM4PM_PROFILE="${baseConfig.execution.profile}"`);
  });

  it('serializes custom algorithm name correctly', async () => {
    const cfg = await resolveConfig({
      cliOverrides: { algorithm: 'ilp', profile: 'quality' },
      configSearchPaths: [],
    });
    const envStr = configToEnv(cfg);
    expect(envStr).toContain('WASM4PM_ALGORITHM="ilp"');
    expect(envStr).toContain('WASM4PM_PROFILE="quality"');
  });
});

// ---------------------------------------------------------------------------
// Security: HTTP SSRF Prevention (Fix 1)
// ---------------------------------------------------------------------------
describe('Security: HTTP SSRF Prevention', () => {
  it('rejects sink.url targeting localhost', () => {
    expect(() =>
      validate({ ...minimal, sink: { kind: 'http', url: 'https://localhost:8080/results' } })
    ).toThrow(/localhost/);
  });

  it('rejects sink.url targeting 127.0.0.1', () => {
    expect(() =>
      validate({ ...minimal, sink: { kind: 'http', url: 'https://127.0.0.1:8080/results' } })
    ).toThrow(/localhost|must not target/);
  });

  it('rejects sink.url using plaintext http:// on remote server', () => {
    expect(() =>
      validate({ ...minimal, sink: { kind: 'http', url: 'http://api.example.com/results' } })
    ).toThrow(/https/);
  });

  it('rejects sink.url targeting 169.254.169.254 (AWS metadata)', () => {
    expect(() =>
      validate({ ...minimal, sink: { kind: 'http', url: 'https://169.254.169.254/results' } })
    ).toThrow(/169.254.169.254/);
  });

  it('rejects sink.url using plaintext http://', () => {
    expect(() =>
      validate({ ...minimal, sink: { kind: 'http', url: 'http://example.com/results' } })
    ).toThrow(/https/);
  });

  it('accepts sink.url using https:// to remote server', () => {
    expect(() =>
      validate({ ...minimal, sink: { kind: 'http', url: 'https://example.com/results' } })
    ).not.toThrow();
  });

  it('accepts sink.url using https:// with custom port', () => {
    expect(() =>
      validate({ ...minimal, sink: { kind: 'http', url: 'https://example.com:9443/results' } })
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Import beforeAll from vitest (used in describe blocks above)
// ---------------------------------------------------------------------------
import { beforeAll } from 'vitest';
