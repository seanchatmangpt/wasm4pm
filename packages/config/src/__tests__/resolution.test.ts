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

  // --- Priority Order ---

  describe('resolution order: CLI > TOML > JSON > ENV > defaults', () => {
    it('uses defaults when no other source present', async () => {
      const cfg = await resolveConfig({ configSearchPaths: [tmpDir] });
      expect(cfg.execution.profile).toBe('balanced');
      expect(cfg.algorithm.name).toBe('alpha');
      expect(cfg.sink.kind).toBe('stdout');
      expect(cfg.metadata.provenance['execution.profile']?.source).toBe('default');
    });

    it('env overrides defaults', async () => {
      const cfg = await resolveConfig({
        configSearchPaths: [tmpDir],
        env: { WASM4PM_PROFILE: 'stream' },
      });
      expect(cfg.execution.profile).toBe('stream');
      expect(cfg.metadata.provenance['execution.profile']?.source).toBe('env');
    });

    it('JSON file overrides env', async () => {
      await fs.writeFile(
        path.join(tmpDir, 'wasm4pm.json'),
        JSON.stringify({ version: '26.4.5', source: { kind: 'file' }, execution: { profile: 'fast' } }),
      );
      const cfg = await resolveConfig({
        configSearchPaths: [tmpDir],
        env: { WASM4PM_PROFILE: 'stream' },
      });
      // File config merges on top of env, so file wins
      expect(cfg.execution.profile).toBe('fast');
      expect(cfg.metadata.provenance['execution.profile']?.source).toBe('json');
    });

    it('TOML file overrides JSON when both exist', async () => {
      await fs.writeFile(path.join(tmpDir, 'wasm4pm.toml'), '[execution]\nprofile = "quality"');
      await fs.writeFile(
        path.join(tmpDir, 'wasm4pm.json'),
        JSON.stringify({ version: '26.4.5', source: { kind: 'file' }, execution: { profile: 'fast' } }),
      );
      const cfg = await resolveConfig({ configSearchPaths: [tmpDir] });
      expect(cfg.execution.profile).toBe('quality');
      expect(cfg.metadata.provenance['execution.profile']?.source).toBe('toml');
    });

    it('CLI overrides everything', async () => {
      await fs.writeFile(path.join(tmpDir, 'wasm4pm.toml'), '[execution]\nprofile = "quality"');
      const cfg = await resolveConfig({
        cliOverrides: { profile: 'fast' },
        configSearchPaths: [tmpDir],
        env: { WASM4PM_PROFILE: 'stream' },
      });
      expect(cfg.execution.profile).toBe('fast');
      expect(cfg.metadata.provenance['execution.profile']?.source).toBe('cli');
    });
  });

  // --- Source/Sink/Algorithm ---

  describe('source, sink, algorithm', () => {
    it('loads source config from TOML', async () => {
      await fs.writeFile(
        path.join(tmpDir, 'wasm4pm.toml'),
        `version = "1.0.0"\n[source]\nkind = "http"\nurl = "http://localhost:9000/events"`,
      );
      const cfg = await resolveConfig({ configSearchPaths: [tmpDir] });
      expect(cfg.source.kind).toBe('http');
      expect(cfg.source.url).toBe('http://localhost:9000/events');
    });

    it('loads sink config from TOML', async () => {
      await fs.writeFile(
        path.join(tmpDir, 'wasm4pm.toml'),
        `version = "1.0.0"\n[source]\nkind = "file"\n[sink]\nkind = "file"\npath = "./out.pnml"`,
      );
      const cfg = await resolveConfig({ configSearchPaths: [tmpDir] });
      expect(cfg.sink.kind).toBe('file');
      expect(cfg.sink.path).toBe('./out.pnml');
    });

    it('loads algorithm config from TOML', async () => {
      await fs.writeFile(
        path.join(tmpDir, 'wasm4pm.toml'),
        `version = "1.0.0"\n[source]\nkind = "file"\n[algorithm]\nname = "heuristic"\n[algorithm.parameters]\nthreshold = 0.8`,
      );
      const cfg = await resolveConfig({ configSearchPaths: [tmpDir] });
      expect(cfg.algorithm.name).toBe('heuristic');
      expect(cfg.algorithm.parameters).toEqual({ threshold: 0.8 });
    });

    it('overrides algorithm via CLI', async () => {
      const cfg = await resolveConfig({
        cliOverrides: { algorithm: 'genetic', algorithmParams: { generations: 100 } },
        configSearchPaths: [tmpDir],
      });
      expect(cfg.algorithm.name).toBe('genetic');
      expect(cfg.algorithm.parameters).toEqual({ generations: 100 });
    });

    it('overrides sink via CLI', async () => {
      const cfg = await resolveConfig({
        cliOverrides: { sinkKind: 'http', sinkUrl: 'http://localhost:3000/ingest' },
        configSearchPaths: [tmpDir],
      });
      expect(cfg.sink.kind).toBe('http');
      expect(cfg.sink.url).toBe('http://localhost:3000/ingest');
    });

    it('overrides source kind via ENV', async () => {
      const cfg = await resolveConfig({
        configSearchPaths: [tmpDir],
        env: { WASM4PM_SOURCE_KIND: 'stream' },
      });
      expect(cfg.source.kind).toBe('stream');
    });

    it('overrides sink kind via ENV', async () => {
      const cfg = await resolveConfig({
        configSearchPaths: [tmpDir],
        env: { WASM4PM_SINK_KIND: 'file' },
      });
      expect(cfg.sink.kind).toBe('file');
    });
  });

  // --- Observability / OTel ---

  describe('observability config', () => {
    it('loads otel config with exporter and required fields', async () => {
      await fs.writeFile(
        path.join(tmpDir, 'wasm4pm.toml'),
        `version = "1.0.0"\n[source]\nkind = "file"\n[observability.otel]\nenabled = true\nexporter = "console"\nendpoint = "http://localhost:4318"\nrequired = true`,
      );
      const cfg = await resolveConfig({ configSearchPaths: [tmpDir] });
      expect(cfg.observability.otel?.enabled).toBe(true);
      expect(cfg.observability.otel?.exporter).toBe('console');
      expect(cfg.observability.otel?.endpoint).toBe('http://localhost:4318');
      expect(cfg.observability.otel?.required).toBe(true);
    });

    it('otel enabled via env', async () => {
      const cfg = await resolveConfig({
        configSearchPaths: [tmpDir],
        env: { WASM4PM_OTEL_ENABLED: 'true', WASM4PM_OTEL_ENDPOINT: 'http://collector:4318' },
      });
      expect(cfg.observability.otel?.enabled).toBe(true);
      expect(cfg.observability.otel?.endpoint).toBe('http://collector:4318');
    });
  });

  // --- Watch ---

  describe('watch config', () => {
    it('loads watch with poll_interval and checkpoint_dir', async () => {
      await fs.writeFile(
        path.join(tmpDir, 'wasm4pm.toml'),
        `version = "1.0.0"\n[source]\nkind = "file"\n[watch]\nenabled = true\npoll_interval = 500\ncheckpoint_dir = "/tmp/ckpts"`,
      );
      const cfg = await resolveConfig({ configSearchPaths: [tmpDir] });
      expect(cfg.watch?.enabled).toBe(true);
      expect(cfg.watch?.poll_interval).toBe(500);
      expect(cfg.watch?.checkpoint_dir).toBe('/tmp/ckpts');
    });

    it('watch enabled via env', async () => {
      const cfg = await resolveConfig({
        configSearchPaths: [tmpDir],
        env: { WASM4PM_WATCH: '1' },
      });
      expect(cfg.watch?.enabled).toBe(true);
    });

    it('watch enabled via CLI', async () => {
      const cfg = await resolveConfig({
        cliOverrides: { watchEnabled: true },
        configSearchPaths: [tmpDir],
      });
      expect(cfg.watch?.enabled).toBe(true);
    });
  });

  // --- Schema version ---

  describe('schema version', () => {
    it('defaults to current SCHEMA_VERSION', async () => {
      const cfg = await resolveConfig({ configSearchPaths: [tmpDir] });
      expect(cfg.schemaVersion).toBe(SCHEMA_VERSION);
    });

    it('preserves explicit schema version from file', async () => {
      await fs.writeFile(
        path.join(tmpDir, 'wasm4pm.toml'),
        `version = "1.0.0"\nschema_version = 1\n[source]\nkind = "file"`,
      );
      const cfg = await resolveConfig({ configSearchPaths: [tmpDir] });
      expect(cfg.schemaVersion).toBe(1);
    });
  });

  // --- Metadata ---

  describe('metadata', () => {
    it('includes loadTime', async () => {
      const before = Date.now();
      const cfg = await resolveConfig({ configSearchPaths: [tmpDir] });
      const after = Date.now();
      expect(cfg.metadata.loadTime).toBeGreaterThanOrEqual(before);
      expect(cfg.metadata.loadTime).toBeLessThanOrEqual(after);
    });

    it('includes hash', async () => {
      const cfg = await resolveConfig({ configSearchPaths: [tmpDir] });
      expect(cfg.metadata.hash).toBeDefined();
      expect(/^[0-9a-f]+$/.test(cfg.metadata.hash)).toBe(true);
    });

    it('produces same hash for same config', async () => {
      const cfg1 = await resolveConfig({ configSearchPaths: [tmpDir] });
      const cfg2 = await resolveConfig({ configSearchPaths: [tmpDir] });
      expect(cfg1.metadata.hash).toBe(cfg2.metadata.hash);
    });

    it('includes provenance for all resolved values', async () => {
      await fs.writeFile(path.join(tmpDir, 'wasm4pm.toml'), '[source]\nkind = "file"\n[execution]\nprofile = "fast"');
      const cfg = await resolveConfig({
        cliOverrides: { outputFormat: 'json' },
        configSearchPaths: [tmpDir],
        env: { WASM4PM_LOG_LEVEL: 'debug' },
      });

      // Check provenance exists and has correct sources
      expect(cfg.metadata.provenance['execution.profile']?.source).toBe('toml');
      expect(cfg.metadata.provenance['observability.logLevel']?.source).toBe('env');
      expect(cfg.metadata.provenance['output.format']?.source).toBe('cli');
    });
  });

  // --- Deep merge ---

  describe('deep merge behavior', () => {
    it('merges partial file config with defaults', async () => {
      await fs.writeFile(
        path.join(tmpDir, 'wasm4pm.toml'),
        `version = "1.0.0"\n[source]\nkind = "file"\n[execution]\ntimeout = 60000`,
      );
      const cfg = await resolveConfig({ configSearchPaths: [tmpDir] });
      // File value
      expect(cfg.execution.timeout).toBe(60000);
      // Default value preserved
      expect(cfg.execution.profile).toBe('balanced');
    });

    it('CLI output.destination merges with file output.format', async () => {
      await fs.writeFile(
        path.join(tmpDir, 'wasm4pm.toml'),
        `version = "1.0.0"\n[source]\nkind = "file"\n[output]\nformat = "json"`,
      );
      const cfg = await resolveConfig({
        cliOverrides: { outputDestination: '/tmp/out.json' },
        configSearchPaths: [tmpDir],
      });
      expect(cfg.output.format).toBe('json');
      expect(cfg.output.destination).toBe('/tmp/out.json');
    });
  });

  // --- Error handling ---

  describe('error handling', () => {
    it('throws on invalid TOML syntax', async () => {
      await fs.writeFile(path.join(tmpDir, 'wasm4pm.toml'), '[execution\nbad');
      await expect(resolveConfig({ configSearchPaths: [tmpDir] })).rejects.toThrow(/Failed to parse TOML/);
    });

    it('throws on invalid JSON syntax', async () => {
      await fs.writeFile(path.join(tmpDir, 'wasm4pm.json'), '{ bad }');
      await expect(resolveConfig({ configSearchPaths: [tmpDir] })).rejects.toThrow(/Failed to parse JSON/);
    });

    it('throws on schema-invalid file config', async () => {
      await fs.writeFile(path.join(tmpDir, 'wasm4pm.toml'), '[execution]\nprofile = "turbo"');
      await expect(resolveConfig({ configSearchPaths: [tmpDir] })).rejects.toThrow(/validation failed/i);
    });

    it('handles empty config file gracefully', async () => {
      await fs.writeFile(path.join(tmpDir, 'wasm4pm.toml'), '');
      const cfg = await resolveConfig({ configSearchPaths: [tmpDir] });
      expect(cfg.version).toBe('26.4.5');
    });

    it('handles missing config directory', async () => {
      const cfg = await resolveConfig({
        configSearchPaths: [path.join(tmpDir, 'nonexistent')],
      });
      expect(cfg.version).toBe('26.4.5');
    });
  });

  // --- Env booleans ---

  describe('env boolean parsing', () => {
    it('treats "true" and "1" as true', async () => {
      const cfg1 = await resolveConfig({ configSearchPaths: [tmpDir], env: { WASM4PM_WATCH: 'true' } });
      const cfg2 = await resolveConfig({ configSearchPaths: [tmpDir], env: { WASM4PM_WATCH: '1' } });
      expect(cfg1.watch?.enabled).toBe(true);
      expect(cfg2.watch?.enabled).toBe(true);
    });

    it('treats other values as false', async () => {
      const cfg = await resolveConfig({ configSearchPaths: [tmpDir], env: { WASM4PM_WATCH: 'false' } });
      expect(cfg.watch?.enabled).toBe(false);
    });
  });

  // --- Example configs ---

  describe('example configs', () => {
    it('provides valid TOML example', async () => {
      await fs.writeFile(path.join(tmpDir, 'wasm4pm.toml'), getExampleTomlConfig());
      const cfg = await resolveConfig({ configSearchPaths: [tmpDir] });
      expect(cfg.version).toBe('26.4.5');
      expect(cfg.execution.profile).toBe('balanced');
    });

    it('provides valid JSON example', async () => {
      await fs.writeFile(path.join(tmpDir, 'wasm4pm.json'), getExampleJsonConfig());
      const cfg = await resolveConfig({ configSearchPaths: [tmpDir] });
      expect(cfg.version).toBe('26.4.5');
      expect(cfg.execution.profile).toBe('balanced');
    });
  });

  // --- Hashing integration ---

  describe('hashing integration', () => {
    it('fingerprint is 8 hex chars', async () => {
      const cfg = await resolveConfig({ configSearchPaths: [tmpDir] });
      const fp = fingerprintConfig(cfg);
      expect(/^[0-9a-f]{8}$/.test(fp)).toBe(true);
    });

    it('diff detects profile change', async () => {
      const cfg1 = await resolveConfig({ configSearchPaths: [tmpDir] });
      const cfg2 = await resolveConfig({
        cliOverrides: { profile: 'quality' },
        configSearchPaths: [tmpDir],
      });
      const diff = diffConfigs(cfg1, cfg2);
      expect(diff.changed).toBe(true);
      expect(diff.differences.some(d => d.path.includes('profile'))).toBe(true);
    });
  });
});
