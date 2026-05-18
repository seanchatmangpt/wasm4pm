import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { resolveConfig, getExampleTomlConfig, getExampleJsonConfig } from '../resolver.js';
import { SCHEMA_VERSION } from '../schema.js';
import { hashConfig, fingerprintConfig, diffConfigs } from '../hash.js';

describe('Resolution', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(process.cwd(), `.test-resolve-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  // ---------------------------------------------------------------------------
  // Resolution order: CLI > TOML > JSON > ENV > defaults
  // ---------------------------------------------------------------------------
  describe('resolution order: CLI > TOML > JSON > ENV > defaults', () => {
    it('uses defaults and env/json/toml/cli in precedence order', async () => {
      const cfg = await resolveConfig({ configSearchPaths: [tmpDir] });
      expect(cfg.execution.profile).toBe('balanced');
      expect(cfg.algorithm.name).toBe('dfg');
      expect(cfg.sink.kind).toBe('stdout');
      expect(cfg.metadata.provenance['execution.profile']?.source).toBe('default');

      const cfgEnv = await resolveConfig({ configSearchPaths: [tmpDir], env: { WASM4PM_PROFILE: 'stream' } });
      expect(cfgEnv.execution.profile).toBe('stream');
      expect(cfgEnv.metadata.provenance['execution.profile']?.source).toBe('env');

      await fs.writeFile(path.join(tmpDir, 'wasm4pm.json'), JSON.stringify({
        version: '26.4.5', source: { kind: 'file' }, execution: { profile: 'fast' },
      }));
      const cfgJson = await resolveConfig({ configSearchPaths: [tmpDir], env: { WASM4PM_PROFILE: 'stream' } });
      expect(cfgJson.execution.profile).toBe('fast');
      expect(cfgJson.metadata.provenance['execution.profile']?.source).toBe('json');

      await fs.writeFile(path.join(tmpDir, 'wasm4pm.toml'), '[execution]\nprofile = "quality"');
      const cfgToml = await resolveConfig({ configSearchPaths: [tmpDir] });
      expect(cfgToml.execution.profile).toBe('quality');
      expect(cfgToml.metadata.provenance['execution.profile']?.source).toBe('toml');

      const cfgCli = await resolveConfig({
        cliOverrides: { profile: 'fast' },
        configSearchPaths: [tmpDir],
        env: { WASM4PM_PROFILE: 'stream' },
      });
      expect(cfgCli.execution.profile).toBe('fast');
      expect(cfgCli.metadata.provenance['execution.profile']?.source).toBe('cli');
    });
  });

  // ---------------------------------------------------------------------------
  // Source, sink, algorithm
  // ---------------------------------------------------------------------------
  describe('source, sink, algorithm', () => {
    it('loads source, sink, and algorithm config from TOML, CLI, and env overrides', async () => {
      await fs.writeFile(path.join(tmpDir, 'wasm4pm.toml'),
        `version = "1.0.0"\n[source]\nkind = "http"\nurl = "http://localhost:9000/events"`);
      const cfgSrc = await resolveConfig({ configSearchPaths: [tmpDir] });
      expect(cfgSrc.source.kind).toBe('http');
      expect(cfgSrc.source.url).toBe('http://localhost:9000/events');

      await fs.writeFile(path.join(tmpDir, 'wasm4pm.toml'),
        `version = "1.0.0"\n[source]\nkind = "file"\n[sink]\nkind = "file"\npath = "./out.pnml"`);
      const cfgSink = await resolveConfig({ configSearchPaths: [tmpDir] });
      expect(cfgSink.sink.kind).toBe('file');
      expect(cfgSink.sink.path).toBe('./out.pnml');

      await fs.writeFile(path.join(tmpDir, 'wasm4pm.toml'),
        `version = "1.0.0"\n[source]\nkind = "file"\n[algorithm]\nname = "heuristic_miner"\n[algorithm.parameters]\nthreshold = 0.8`);
      const cfgAlgo = await resolveConfig({ configSearchPaths: [tmpDir] });
      expect(cfgAlgo.algorithm.name).toBe('heuristic_miner');
      expect(cfgAlgo.algorithm.parameters).toEqual({ threshold: 0.8 });

      await fs.writeFile(path.join(tmpDir, 'wasm4pm.toml'),
        `version = "1.0.0"\n[source]\nkind = "file"`);
      const cfgAlgoCli = await resolveConfig({
        cliOverrides: { algorithm: 'genetic_algorithm', algorithmParams: { generations: 100 } },
        configSearchPaths: [tmpDir],
      });
      expect(cfgAlgoCli.algorithm.name).toBe('genetic_algorithm');
      expect(cfgAlgoCli.algorithm.parameters).toEqual({ generations: 100 });

      const cfgSinkCli = await resolveConfig({
        cliOverrides: { sinkKind: 'http', sinkUrl: 'http://localhost:3000/ingest' },
        configSearchPaths: [tmpDir],
      });
      expect(cfgSinkCli.sink.kind).toBe('http');
      expect(cfgSinkCli.sink.url).toBe('http://localhost:3000/ingest');

      await fs.rm(path.join(tmpDir, 'wasm4pm.toml'), { force: true });
      const cfgSrcEnv = await resolveConfig({ configSearchPaths: [tmpDir], env: { WASM4PM_SOURCE_KIND: 'stream' } });
      expect(cfgSrcEnv.source.kind).toBe('stream');

      // sink.kind='file' requires a path — use 'stdout' to test ENV var propagation
      const cfgSinkEnv = await resolveConfig({ configSearchPaths: [tmpDir], env: { WASM4PM_SINK_KIND: 'stdout' } });
      expect(cfgSinkEnv.sink.kind).toBe('stdout');
    });
  });

  // ---------------------------------------------------------------------------
  // Observability and watch config
  // ---------------------------------------------------------------------------
  describe('observability and watch config', () => {
    it('loads otel and watch config from TOML, env, and CLI', async () => {
      await fs.writeFile(path.join(tmpDir, 'wasm4pm.toml'),
        `version = "1.0.0"\n[source]\nkind = "file"\n[observability.otel]\nenabled = true\nexporter = "console"\nendpoint = "http://localhost:4318"\nrequired = true`);
      const cfg = await resolveConfig({ configSearchPaths: [tmpDir] });
      expect(cfg.observability.otel?.enabled).toBe(true);
      expect(cfg.observability.otel?.exporter).toBe('console');
      expect(cfg.observability.otel?.endpoint).toBe('http://localhost:4318');
      expect(cfg.observability.otel?.required).toBe(true);

      await fs.writeFile(path.join(tmpDir, 'wasm4pm.toml'),
        `version = "1.0.0"\n[source]\nkind = "file"`);
      const cfgEnv = await resolveConfig({
        configSearchPaths: [tmpDir],
        env: { WASM4PM_OTEL_ENABLED: 'true', WASM4PM_OTEL_ENDPOINT: 'http://collector:4318' },
      });
      expect(cfgEnv.observability.otel?.enabled).toBe(true);
      expect(cfgEnv.observability.otel?.endpoint).toBe('http://collector:4318');

      await fs.writeFile(path.join(tmpDir, 'wasm4pm.toml'),
        `version = "1.0.0"\n[source]\nkind = "file"\n[watch]\nenabled = true\npoll_interval = 500\ncheckpoint_dir = "/tmp/ckpts"`);
      const cfgWatch = await resolveConfig({ configSearchPaths: [tmpDir] });
      expect(cfgWatch.watch?.enabled).toBe(true);
      expect(cfgWatch.watch?.poll_interval).toBe(500);
      expect(cfgWatch.watch?.checkpoint_dir).toBe('/tmp/ckpts');

      const cfgWatchEnv = await resolveConfig({ configSearchPaths: [tmpDir], env: { WASM4PM_WATCH: '1' } });
      expect(cfgWatchEnv.watch?.enabled).toBe(true);

      const cfgWatchCli = await resolveConfig({ cliOverrides: { watchEnabled: true }, configSearchPaths: [tmpDir] });
      expect(cfgWatchCli.watch?.enabled).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Schema version
  // ---------------------------------------------------------------------------
  describe('schema version', () => {
    it('defaults to SCHEMA_VERSION and preserves explicit value from file', async () => {
      const cfg = await resolveConfig({ configSearchPaths: [tmpDir] });
      expect(cfg.schemaVersion).toBe(SCHEMA_VERSION);

      await fs.writeFile(path.join(tmpDir, 'wasm4pm.toml'),
        `version = "1.0.0"\nschema_version = 1\n[source]\nkind = "file"`);
      const cfgFile = await resolveConfig({ configSearchPaths: [tmpDir] });
      expect(cfgFile.schemaVersion).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Metadata
  // ---------------------------------------------------------------------------
  describe('metadata', () => {
    it('includes loadTime, hash, and provenance for all resolved values', async () => {
      const before = Date.now();
      const cfg = await resolveConfig({ configSearchPaths: [tmpDir] });
      const after = Date.now();
      expect(cfg.metadata.loadTime).toBeGreaterThanOrEqual(before);
      expect(cfg.metadata.loadTime).toBeLessThanOrEqual(after);
      expect(cfg.metadata.hash).toBeDefined();
      expect(/^[0-9a-f]+$/.test(cfg.metadata.hash)).toBe(true);

      const cfg2 = await resolveConfig({ configSearchPaths: [tmpDir] });
      expect(cfg.metadata.hash).toBe(cfg2.metadata.hash);

      await fs.writeFile(path.join(tmpDir, 'wasm4pm.toml'),
        '[source]\nkind = "file"\n[execution]\nprofile = "fast"');
      const cfgProv = await resolveConfig({
        cliOverrides: { outputFormat: 'json' },
        configSearchPaths: [tmpDir],
        env: { WASM4PM_LOG_LEVEL: 'debug' },
      });
      expect(cfgProv.metadata.provenance['execution.profile']?.source).toBe('toml');
      expect(cfgProv.metadata.provenance['observability.logLevel']?.source).toBe('env');
      expect(cfgProv.metadata.provenance['output.format']?.source).toBe('cli');
    });
  });

  // ---------------------------------------------------------------------------
  // Deep merge, error handling, and env booleans
  // ---------------------------------------------------------------------------
  describe('deep merge, error handling, and env booleans', () => {
    it('merges partial file config with defaults and CLI merges with file', async () => {
      await fs.writeFile(path.join(tmpDir, 'wasm4pm.toml'),
        `version = "1.0.0"\n[source]\nkind = "file"\n[execution]\ntimeout = 60000`);
      const cfg = await resolveConfig({ configSearchPaths: [tmpDir] });
      expect(cfg.execution.timeout).toBe(60000);
      expect(cfg.execution.profile).toBe('balanced');

      await fs.writeFile(path.join(tmpDir, 'wasm4pm.toml'),
        `version = "1.0.0"\n[source]\nkind = "file"\n[output]\nformat = "json"`);
      const cfgMerge = await resolveConfig({
        cliOverrides: { outputDestination: '/tmp/out.json' },
        configSearchPaths: [tmpDir],
      });
      expect(cfgMerge.output.format).toBe('json');
      expect(cfgMerge.output.destination).toBe('/tmp/out.json');
    });

    it('throws on invalid TOML/JSON syntax and schema-invalid config; handles missing/empty gracefully', async () => {
      await fs.writeFile(path.join(tmpDir, 'wasm4pm.toml'), '[execution\nbad');
      await expect(resolveConfig({ configSearchPaths: [tmpDir] })).rejects.toThrow(/Failed to parse TOML/);

      await fs.rm(path.join(tmpDir, 'wasm4pm.toml'), { force: true });
      await fs.writeFile(path.join(tmpDir, 'wasm4pm.json'), '{ bad }');
      await expect(resolveConfig({ configSearchPaths: [tmpDir] })).rejects.toThrow(/Failed to parse JSON/);

      await fs.rm(path.join(tmpDir, 'wasm4pm.json'), { force: true });
      await fs.writeFile(path.join(tmpDir, 'wasm4pm.toml'), '[execution]\nprofile = "turbo"');
      await expect(resolveConfig({ configSearchPaths: [tmpDir] })).rejects.toThrow(/validation failed/i);

      await fs.writeFile(path.join(tmpDir, 'wasm4pm.toml'), '');
      const cfgEmpty = await resolveConfig({ configSearchPaths: [tmpDir] });
      expect(cfgEmpty.version).toBe('26.4.5');

      const cfgMissing = await resolveConfig({ configSearchPaths: [path.join(tmpDir, 'nonexistent')] });
      expect(cfgMissing.version).toBe('26.4.5');
    });

    it('parses env booleans correctly', async () => {
      const cfg1 = await resolveConfig({ configSearchPaths: [tmpDir], env: { WASM4PM_WATCH: 'true' } });
      const cfg2 = await resolveConfig({ configSearchPaths: [tmpDir], env: { WASM4PM_WATCH: '1' } });
      expect(cfg1.watch?.enabled).toBe(true);
      expect(cfg2.watch?.enabled).toBe(true);

      const cfg3 = await resolveConfig({ configSearchPaths: [tmpDir], env: { WASM4PM_WATCH: 'false' } });
      expect(cfg3.watch?.enabled).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Example configs and hashing integration
  // ---------------------------------------------------------------------------
  describe('example configs and hashing integration', () => {
    it('provides valid TOML and JSON examples, fingerprint is 8 hex chars, and diff detects profile change', async () => {
      await fs.writeFile(path.join(tmpDir, 'wasm4pm.toml'), getExampleTomlConfig());
      const cfgToml = await resolveConfig({ configSearchPaths: [tmpDir] });
      expect(cfgToml.version).toBe('26.4.5');
      expect(cfgToml.execution.profile).toBe('balanced');

      await fs.writeFile(path.join(tmpDir, 'wasm4pm.json'), getExampleJsonConfig());
      const cfgJson = await resolveConfig({ configSearchPaths: [tmpDir] });
      expect(cfgJson.version).toBe('26.4.5');
      expect(cfgJson.execution.profile).toBe('balanced');

      const cfg1 = await resolveConfig({ configSearchPaths: [tmpDir] });
      const fp = fingerprintConfig(cfg1);
      expect(/^[0-9a-f]{8}$/.test(fp)).toBe(true);

      const cfg2 = await resolveConfig({ cliOverrides: { profile: 'quality' }, configSearchPaths: [tmpDir] });
      const diff = diffConfigs(cfg1, cfg2);
      expect(diff.changed).toBe(true);
      expect(diff.differences.some((d) => d.path.includes('profile'))).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases: algorithm env var, log level env var, output format env var
  // ---------------------------------------------------------------------------
  describe('env var: algorithm, log level, output format', () => {
    it('picks up WASM4PM_ALGORITHM from env', async () => {
      const cfg = await resolveConfig({
        configSearchPaths: [tmpDir],
        env: { WASM4PM_ALGORITHM: 'inductive_miner' },
      });
      expect(cfg.algorithm.name).toBe('inductive_miner');
      expect(cfg.metadata.provenance['algorithm.name']?.source).toBe('env');
    });

    it('picks up WASM4PM_LOG_LEVEL from env', async () => {
      const cfg = await resolveConfig({
        configSearchPaths: [tmpDir],
        env: { WASM4PM_LOG_LEVEL: 'debug' },
      });
      expect(cfg.observability.logLevel).toBe('debug');
    });

    it('picks up WASM4PM_OUTPUT_FORMAT from env', async () => {
      const cfg = await resolveConfig({
        configSearchPaths: [tmpDir],
        env: { WASM4PM_OUTPUT_FORMAT: 'json' },
      });
      expect(cfg.output.format).toBe('json');
    });

    it('CLI algorithm overrides env algorithm', async () => {
      const cfg = await resolveConfig({
        cliOverrides: { algorithm: 'ilp' },
        configSearchPaths: [tmpDir],
        env: { WASM4PM_ALGORITHM: 'inductive_miner' },
      });
      expect(cfg.algorithm.name).toBe('ilp');
      expect(cfg.metadata.provenance['algorithm.name']?.source).toBe('cli');
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases: prediction env vars
  // ---------------------------------------------------------------------------
  describe('env var: prediction configuration', () => {
    it('picks up WASM4PM_PREDICTION_ENABLED=true from env', async () => {
      const cfg = await resolveConfig({
        configSearchPaths: [tmpDir],
        env: {
          WASM4PM_PREDICTION_ENABLED: 'true',
          WASM4PM_PREDICTION_TASKS: 'next_activity,drift',
        },
      });
      expect(cfg.prediction?.enabled).toBe(true);
    });

    it('throws on invalid WASM4PM_PREDICTION_NGRAM_ORDER (non-integer)', async () => {
      await expect(
        resolveConfig({
          configSearchPaths: [tmpDir],
          env: { WASM4PM_PREDICTION_NGRAM_ORDER: 'abc' },
        })
      ).rejects.toThrow(/WASM4PM_PREDICTION_NGRAM_ORDER/);
    });

    it('throws on out-of-range WASM4PM_PREDICTION_NGRAM_ORDER (6)', async () => {
      await expect(
        resolveConfig({
          configSearchPaths: [tmpDir],
          env: { WASM4PM_PREDICTION_NGRAM_ORDER: '6' },
        })
      ).rejects.toThrow(/WASM4PM_PREDICTION_NGRAM_ORDER/);
    });

    it('throws on non-positive WASM4PM_PREDICTION_DRIFT_WINDOW', async () => {
      await expect(
        resolveConfig({
          configSearchPaths: [tmpDir],
          env: { WASM4PM_PREDICTION_DRIFT_WINDOW: '0' },
        })
      ).rejects.toThrow(/WASM4PM_PREDICTION_DRIFT_WINDOW/);
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases: RL env vars
  // ---------------------------------------------------------------------------
  describe('env var: RL configuration', () => {
    it('picks up WASM4PM_RL_ENABLED=true from env', async () => {
      const cfg = await resolveConfig({
        configSearchPaths: [tmpDir],
        env: { WASM4PM_RL_ENABLED: 'true' },
      });
      expect(cfg.rl?.enabled).toBe(true);
    });

    it('throws on invalid WASM4PM_RL_LEARNING_RATE (NaN)', async () => {
      await expect(
        resolveConfig({
          configSearchPaths: [tmpDir],
          env: { WASM4PM_RL_LEARNING_RATE: 'not-a-number' },
        })
      ).rejects.toThrow(/WASM4PM_RL_LEARNING_RATE/);
    });

    it('throws on out-of-range WASM4PM_RL_LEARNING_RATE (> 1)', async () => {
      await expect(
        resolveConfig({
          configSearchPaths: [tmpDir],
          env: { WASM4PM_RL_LEARNING_RATE: '1.5' },
        })
      ).rejects.toThrow(/WASM4PM_RL_LEARNING_RATE/);
    });

    it('throws on out-of-range WASM4PM_RL_EPSILON (< 0)', async () => {
      await expect(
        resolveConfig({
          configSearchPaths: [tmpDir],
          env: { WASM4PM_RL_EPSILON: '-0.1' },
        })
      ).rejects.toThrow(/WASM4PM_RL_EPSILON/);
    });
  });

  // ---------------------------------------------------------------------------
  // hashConfig determinism
  // ---------------------------------------------------------------------------
  describe('hashConfig determinism', () => {
    it('same inputs produce identical hashes across two resolveConfig calls', async () => {
      const cfg1 = await resolveConfig({ configSearchPaths: [tmpDir] });
      const cfg2 = await resolveConfig({ configSearchPaths: [tmpDir] });
      expect(hashConfig(cfg1)).toBe(hashConfig(cfg2));
    });

    it('different profiles produce different hashes', async () => {
      const fast = await resolveConfig({ cliOverrides: { profile: 'fast' }, configSearchPaths: [tmpDir] });
      const quality = await resolveConfig({ cliOverrides: { profile: 'quality' }, configSearchPaths: [tmpDir] });
      expect(hashConfig(fast)).not.toBe(hashConfig(quality));
    });
  });
});
