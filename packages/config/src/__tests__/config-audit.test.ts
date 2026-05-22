import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { resolveConfig } from '../resolver.js';

const tmpDir = async () => {
  const d = path.join(os.tmpdir(), `wasm4pm-audit-${Date.now()}-${Math.random()}`);
  await fs.mkdir(d, { recursive: true });
  return d;
};

// GOAL 1: 5-layer precedence testing
describe('AUDIT: 5-layer precedence testing', () => {
  let tmp: string;
  beforeEach(async () => { tmp = await tmpDir(); });
  afterEach(async () => { await fs.rm(tmp, { recursive: true, force: true }); });

  it('Layer 5 (defaults): algorithm=dfg, format=human, profile=balanced', async () => {
    const cfg = await resolveConfig({ configSearchPaths: [tmp] });
    expect(cfg.algorithm.name).toBe('dfg');
    expect(cfg.output.format).toBe('human');
    expect(cfg.execution.profile).toBe('balanced');
    expect(cfg.metadata.provenance['algorithm.name']?.source).toBe('default');
    expect(cfg.metadata.provenance['output.format']?.source).toBe('default');
    expect(cfg.metadata.provenance['execution.profile']?.source).toBe('default');
  });

  it('Layer 4 (ENV): WASM4PM_ALGORITHM=alpha overrides default', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_ALGORITHM: 'alpha_plus_plus' },
    });
    expect(cfg.algorithm.name).toBe('alpha_plus_plus');
    expect(cfg.metadata.provenance['algorithm.name']?.source).toBe('env');
  });

  it('Layer 3 (JSON): wasm4pm.json algorithm=heuristic overrides ENV', async () => {
    await fs.writeFile(
      path.join(tmp, 'wasm4pm.json'),
      JSON.stringify({
        version: '26.4.5',
        source: { kind: 'file' },
        algorithm: { name: 'heuristic_miner' },
      })
    );
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_ALGORITHM: 'alpha_plus_plus' },
    });
    expect(cfg.algorithm.name).toBe('heuristic_miner');
    expect(cfg.metadata.provenance['algorithm.name']?.source).toBe('json');
  });

  it('Layer 2 (TOML): wasm4pm.toml algorithm=inductive overrides JSON and ENV', async () => {
    await fs.writeFile(path.join(tmp, 'wasm4pm.json'), JSON.stringify({
      version: '26.4.5', source: { kind: 'file' }, algorithm: { name: 'heuristic_miner' },
    }));
    await fs.writeFile(path.join(tmp, 'wasm4pm.toml'), '[algorithm]\nname = "inductive_miner"');
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_ALGORITHM: 'alpha_plus_plus' },
    });
    expect(cfg.algorithm.name).toBe('inductive_miner');
    expect(cfg.metadata.provenance['algorithm.name']?.source).toBe('toml');
  });

  it('Layer 1 (CLI): --algorithm dfg overrides ALL layers', async () => {
    await fs.writeFile(path.join(tmp, 'wasm4pm.toml'), '[algorithm]\nname = "inductive_miner"');
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      cliOverrides: { algorithm: 'genetic_algorithm' },
      env: { WASM4PM_ALGORITHM: 'alpha_plus_plus' },
    });
    expect(cfg.algorithm.name).toBe('genetic_algorithm');
    expect(cfg.metadata.provenance['algorithm.name']?.source).toBe('cli');
  });

  it('All 5 layers: defaults < env < json < toml < cli (profile)', async () => {
    // Layer 5: default = balanced
    const default_cfg = await resolveConfig({ configSearchPaths: [tmp] });
    expect(default_cfg.execution.profile).toBe('balanced');

    // Layer 4: ENV = quality
    const env_cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_PROFILE: 'quality' },
    });
    expect(env_cfg.execution.profile).toBe('quality');

    // Layer 3: JSON = fast (overrides ENV)
    await fs.writeFile(
      path.join(tmp, 'wasm4pm.json'),
      JSON.stringify({ version: '26.4.5', source: { kind: 'file' }, execution: { profile: 'fast' } })
    );
    const json_cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_PROFILE: 'quality' },
    });
    expect(json_cfg.execution.profile).toBe('fast');

    // Layer 2: TOML = stream (overrides JSON and ENV)
    await fs.writeFile(path.join(tmp, 'wasm4pm.toml'), '[execution]\nprofile = "stream"');
    const toml_cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_PROFILE: 'quality' },
    });
    expect(toml_cfg.execution.profile).toBe('stream');

    // Layer 1: CLI = balanced (overrides everything)
    const cli_cfg = await resolveConfig({
      configSearchPaths: [tmp],
      cliOverrides: { profile: 'balanced' },
      env: { WASM4PM_PROFILE: 'quality' },
    });
    expect(cli_cfg.execution.profile).toBe('balanced');
    expect(cli_cfg.metadata.provenance['execution.profile']?.source).toBe('cli');
  });
});

// GOAL 2: Config validation error messages
describe('AUDIT: Config validation error messages', () => {
  let tmp: string;
  beforeEach(async () => { tmp = await tmpDir(); });
  afterEach(async () => { await fs.rm(tmp, { recursive: true, force: true }); });

  it('Invalid profile: --profile invalid rejects with helpful message', async () => {
    await expect(
      resolveConfig({
        configSearchPaths: [tmp],
        cliOverrides: { profile: 'invalid' as any },
      })
    ).rejects.toThrow(/validation failed/i);
  });

  it('Invalid algorithm: --algorithm bad_algo rejects with helpful message', async () => {
    await expect(
      resolveConfig({
        configSearchPaths: [tmp],
        cliOverrides: { algorithm: 'bad_algo' },
      })
    ).rejects.toThrow(/validation failed/i);
  });

  it('Invalid output format: --format xml rejects with helpful message', async () => {
    await expect(
      resolveConfig({
        configSearchPaths: [tmp],
        cliOverrides: { outputFormat: 'xml' as any },
      })
    ).rejects.toThrow(/validation failed/i);
  });

  it('Timeout field is not part of CLI overrides (architectural decision)', async () => {
    // Note: Timeout is only settable via config file or ENV, not CLI
    // This is intentional - CLI shouldn't override execution parameters
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      cliOverrides: { timeout: -1 } as any, // Ignored field
    });
    // Should use default timeout
    expect(cfg.execution.timeout).toBe(300000);
  });
});

// GOAL 3: Malformed config file handling
describe('AUDIT: Malformed config file handling', () => {
  let tmp: string;
  beforeEach(async () => { tmp = await tmpDir(); });
  afterEach(async () => { await fs.rm(tmp, { recursive: true, force: true }); });

  it('Malformed TOML (invalid syntax) produces clear error', async () => {
    await fs.writeFile(path.join(tmp, 'wasm4pm.toml'), 'this is [[ not valid toml');
    await expect(
      resolveConfig({ configSearchPaths: [tmp] })
    ).rejects.toThrow(/Failed to parse TOML/i);
  });

  it('Invalid JSON (trailing comma) produces clear error', async () => {
    await fs.writeFile(path.join(tmp, 'wasm4pm.json'), '{ "version": "26.4.5", }');
    await expect(
      resolveConfig({ configSearchPaths: [tmp] })
    ).rejects.toThrow(/Failed to parse JSON/i);
  });

  it('TOML with unknown fields still loads (ignored)', async () => {
    await fs.writeFile(path.join(tmp, 'wasm4pm.toml'), `
version = "26.4.5"
[source]
kind = "file"
[unknown_section]
foo = "bar"
`);
    const cfg = await resolveConfig({ configSearchPaths: [tmp] });
    expect(cfg.version).toBe('26.4.5');
  });

  it('JSON config file path shown in error message on validation failure', async () => {
    const jsonPath = path.join(tmp, 'wasm4pm.json');
    await fs.writeFile(jsonPath, JSON.stringify({
      version: '26.4.5',
      source: { kind: 'file' },
      algorithm: { name: 'nonexistent_algo' },
    }));
    try {
      await resolveConfig({ configSearchPaths: [tmp] });
      throw new Error('Should have thrown');
    } catch (e) {
      expect((e as Error).message).toMatch(/wasm4pm.json/);
    }
  });

  it('TOML config file path shown in error message on validation failure', async () => {
    const tomlPath = path.join(tmp, 'wasm4pm.toml');
    await fs.writeFile(tomlPath, '[algorithm]\nname = "nonexistent_algo"');
    try {
      await resolveConfig({ configSearchPaths: [tmp] });
      throw new Error('Should have thrown');
    } catch (e) {
      expect((e as Error).message).toMatch(/wasm4pm.toml/);
    }
  });
});

// GOAL 4: ENV var override completeness
describe('AUDIT: ENV var override completeness', () => {
  let tmp: string;
  beforeEach(async () => { tmp = await tmpDir(); });
  afterEach(async () => { await fs.rm(tmp, { recursive: true, force: true }); });

  const envVars = [
    { env: 'WASM4PM_PROFILE', path: 'execution.profile', value: 'fast', verify: (cfg: any) => cfg.execution.profile === 'fast' },
    { env: 'WASM4PM_ALGORITHM', path: 'algorithm.name', value: 'heuristic_miner', verify: (cfg: any) => cfg.algorithm.name === 'heuristic_miner' },
    { env: 'WASM4PM_OUTPUT_FORMAT', path: 'output.format', value: 'json', verify: (cfg: any) => cfg.output.format === 'json' },
    { env: 'WASM4PM_LOG_LEVEL', path: 'observability.logLevel', value: 'debug', verify: (cfg: any) => cfg.observability.logLevel === 'debug' },
    { env: 'WASM4PM_WATCH', path: 'watch.enabled', value: 'true', verify: (cfg: any) => cfg.watch.enabled === true },
    { env: 'WASM4PM_OTEL_ENABLED', path: 'observability.otel.enabled', value: 'true', verify: (cfg: any) => cfg.observability.otel?.enabled === true },
    { env: 'WASM4PM_SOURCE_KIND', path: 'source.kind', value: 'stream', verify: (cfg: any) => cfg.source.kind === 'stream' },
    { env: 'WASM4PM_SINK_KIND', path: 'sink.kind', value: 'stdout', verify: (cfg: any) => cfg.sink.kind === 'stdout' }, // stdout doesn't require path
    // Prediction test moved to separate test with proper task setup
  ];

  for (const { env, path: envPath, value, verify } of envVars) {
    it(`${env} overrides config[${envPath}]`, async () => {
      const cfg = await resolveConfig({
        configSearchPaths: [tmp],
        env: { [env]: value },
      });
      expect(verify(cfg)).toBe(true);
      // Also verify provenance
      const provenanceKey = envPath;
      expect(cfg.metadata.provenance[provenanceKey]?.source).toBe('env');
    });
  }

  it('WASM4PM_PREDICTION_ENABLED=true with tasks works correctly', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: {
        WASM4PM_PREDICTION_ENABLED: 'true',
        WASM4PM_PREDICTION_TASKS: 'next_activity,remaining_time'
      },
    });
    expect(cfg.prediction?.enabled).toBe(true);
    expect(cfg.prediction?.tasks).toContain('next_activity');
    expect(cfg.metadata.provenance['prediction.enabled']?.source).toBe('env');
  });
});

// GOAL 5: Config provenance tracking
describe('AUDIT: Config provenance tracking', () => {
  let tmp: string;
  beforeEach(async () => { tmp = await tmpDir(); });
  afterEach(async () => { await fs.rm(tmp, { recursive: true, force: true }); });

  it('Mixed config (CLI + ENV + file) shows provenance for each field', async () => {
    await fs.writeFile(path.join(tmp, 'wasm4pm.toml'), `
version = "26.4.5"
[source]
kind = "file"
[algorithm]
name = "inductive_miner"
[execution]
profile = "quality"
`);

    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      cliOverrides: { algorithm: 'genetic_algorithm' },
      env: { WASM4PM_OUTPUT_FORMAT: 'json' },
    });

    // CLI should override TOML for algorithm
    expect(cfg.algorithm.name).toBe('genetic_algorithm');
    expect(cfg.metadata.provenance['algorithm.name']?.source).toBe('cli');

    // TOML should be used for profile
    expect(cfg.execution.profile).toBe('quality');
    expect(cfg.metadata.provenance['execution.profile']?.source).toBe('toml');

    // ENV should be used for output format
    expect(cfg.output.format).toBe('json');
    expect(cfg.metadata.provenance['output.format']?.source).toBe('env');

    // Default for other fields
    expect(cfg.sink.kind).toBe('stdout');
    expect(cfg.metadata.provenance['sink.kind']?.source).toBe('default');
  });

  it('Provenance metadata includes loadTime and hash', async () => {
    const cfg = await resolveConfig({ configSearchPaths: [tmp] });
    expect(cfg.metadata.loadTime).toBeGreaterThan(0);
    expect(cfg.metadata.hash).toBeTruthy();
    expect(cfg.metadata.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('Same config produces same hash (deterministic)', async () => {
    const cfg1 = await resolveConfig({ configSearchPaths: [tmp] });
    const cfg2 = await resolveConfig({ configSearchPaths: [tmp] });
    expect(cfg1.metadata.hash).toBe(cfg2.metadata.hash);
  });

  it('Different configs produce different hashes', async () => {
    const cfg1 = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_ALGORITHM: 'dfg' },
    });
    const cfg2 = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_ALGORITHM: 'alpha_plus_plus' },
    });
    expect(cfg1.metadata.hash).not.toBe(cfg2.metadata.hash);
  });
});
