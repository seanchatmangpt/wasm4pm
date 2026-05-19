/**
 * Comprehensive WASM4PM_* environment variable tests.
 *
 * Coverage targets — ENV vars without dedicated focused assertions before this file:
 *   WASM4PM_ALGORITHM=dfg          → config.algorithm.name = 'dfg'
 *   WASM4PM_LOG_LEVEL=debug        → config.observability.logLevel = 'debug'
 *   WASM4PM_WATCH=true             → config.watch.enabled = true (isolated)
 *   WASM4PM_OTEL_ENABLED=false     → otel disabled boolean path
 *   WASM4PM_OTEL_ENDPOINT          → endpoint only (no ENABLED companion)
 *   WASM4PM_OUTPUT_FORMAT=json     → config.output.format = 'json'
 *   WASM4PM_OUTPUT_DESTINATION     → config.output.destination
 *   WASM4PM_PREDICTION_ACTIVITY_KEY
 *   WASM4PM_PREDICTION_NGRAM_ORDER (valid + invalid + out-of-range)
 *   WASM4PM_PREDICTION_DRIFT_WINDOW (valid + invalid)
 *   WASM4PM_MEMBRANE_* family
 *   CLI beats ENV for: OUTPUT_FORMAT, LOG_LEVEL, WATCH
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { resolveConfig } from '../resolver.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
async function makeTmp(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'wasm4pm-env-'));
}
async function cleanTmp(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// 1. WASM4PM_ALGORITHM=dfg
// ---------------------------------------------------------------------------
describe('ENV: WASM4PM_ALGORITHM=dfg', () => {
  let tmp: string;
  beforeEach(async () => { tmp = await makeTmp(); });
  afterEach(async () => { await cleanTmp(tmp); });

  it('sets config.algorithm.name to "dfg"', async () => {
    const cfg = await resolveConfig({ configSearchPaths: [tmp], env: { WASM4PM_ALGORITHM: 'dfg' } });
    expect(cfg.algorithm.name).toBe('dfg');
    expect(cfg.metadata.provenance['algorithm.name']?.source).toBe('env');
  });

  it('sets config.algorithm.name to "ilp" via ENV', async () => {
    const cfg = await resolveConfig({ configSearchPaths: [tmp], env: { WASM4PM_ALGORITHM: 'ilp' } });
    expect(cfg.algorithm.name).toBe('ilp');
  });
});

// ---------------------------------------------------------------------------
// 2. WASM4PM_LOG_LEVEL
// ---------------------------------------------------------------------------
describe('ENV: WASM4PM_LOG_LEVEL', () => {
  let tmp: string;
  beforeEach(async () => { tmp = await makeTmp(); });
  afterEach(async () => { await cleanTmp(tmp); });

  it('sets observability.logLevel to "debug"', async () => {
    const cfg = await resolveConfig({ configSearchPaths: [tmp], env: { WASM4PM_LOG_LEVEL: 'debug' } });
    expect(cfg.observability.logLevel).toBe('debug');
    expect(cfg.metadata.provenance['observability.logLevel']?.source).toBe('env');
  });

  it('sets observability.logLevel to "warn"', async () => {
    const cfg = await resolveConfig({ configSearchPaths: [tmp], env: { WASM4PM_LOG_LEVEL: 'warn' } });
    expect(cfg.observability.logLevel).toBe('warn');
  });

  it('sets observability.logLevel to "error"', async () => {
    const cfg = await resolveConfig({ configSearchPaths: [tmp], env: { WASM4PM_LOG_LEVEL: 'error' } });
    expect(cfg.observability.logLevel).toBe('error');
  });

  it('CLI outputFormat override does not affect LOG_LEVEL from ENV', async () => {
    // Regression: ensure the two fields are independent
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      cliOverrides: { outputFormat: 'json' },
      env: { WASM4PM_LOG_LEVEL: 'debug' },
    });
    expect(cfg.observability.logLevel).toBe('debug');
    expect(cfg.output.format).toBe('json');
  });
});

// ---------------------------------------------------------------------------
// 3. WASM4PM_WATCH (isolated boolean paths)
// ---------------------------------------------------------------------------
describe('ENV: WASM4PM_WATCH', () => {
  let tmp: string;
  beforeEach(async () => { tmp = await makeTmp(); });
  afterEach(async () => { await cleanTmp(tmp); });

  it('enables watch mode with "true"', async () => {
    const cfg = await resolveConfig({ configSearchPaths: [tmp], env: { WASM4PM_WATCH: 'true' } });
    expect(cfg.watch?.enabled).toBe(true);
    expect(cfg.metadata.provenance['watch.enabled']?.source).toBe('env');
  });

  it('enables watch mode with "1"', async () => {
    const cfg = await resolveConfig({ configSearchPaths: [tmp], env: { WASM4PM_WATCH: '1' } });
    expect(cfg.watch?.enabled).toBe(true);
  });

  it('disables watch mode with "false"', async () => {
    const cfg = await resolveConfig({ configSearchPaths: [tmp], env: { WASM4PM_WATCH: 'false' } });
    expect(cfg.watch?.enabled).toBe(false);
  });

  it('disables watch mode with "0"', async () => {
    const cfg = await resolveConfig({ configSearchPaths: [tmp], env: { WASM4PM_WATCH: '0' } });
    expect(cfg.watch?.enabled).toBe(false);
  });

  it('CLI watchEnabled=true beats WASM4PM_WATCH=false', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      cliOverrides: { watchEnabled: true },
      env: { WASM4PM_WATCH: 'false' },
    });
    expect(cfg.watch?.enabled).toBe(true);
    expect(cfg.metadata.provenance['watch.enabled']?.source).toBe('cli');
  });

  it('CLI watchEnabled=false beats WASM4PM_WATCH=true', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      cliOverrides: { watchEnabled: false },
      env: { WASM4PM_WATCH: 'true' },
    });
    expect(cfg.watch?.enabled).toBe(false);
    expect(cfg.metadata.provenance['watch.enabled']?.source).toBe('cli');
  });
});

// ---------------------------------------------------------------------------
// 4. WASM4PM_OTEL_ENABLED (false path) and WASM4PM_OTEL_ENDPOINT alone
// ---------------------------------------------------------------------------
describe('ENV: WASM4PM_OTEL_ENABLED and WASM4PM_OTEL_ENDPOINT', () => {
  let tmp: string;
  beforeEach(async () => { tmp = await makeTmp(); });
  afterEach(async () => { await cleanTmp(tmp); });

  it('disables OTEL with WASM4PM_OTEL_ENABLED=false', async () => {
    const cfg = await resolveConfig({ configSearchPaths: [tmp], env: { WASM4PM_OTEL_ENABLED: 'false' } });
    expect(cfg.observability.otel?.enabled).toBe(false);
  });

  it('disables OTEL with WASM4PM_OTEL_ENABLED=0', async () => {
    const cfg = await resolveConfig({ configSearchPaths: [tmp], env: { WASM4PM_OTEL_ENABLED: '0' } });
    expect(cfg.observability.otel?.enabled).toBe(false);
  });

  it('enables OTEL with WASM4PM_OTEL_ENABLED=1', async () => {
    const cfg = await resolveConfig({ configSearchPaths: [tmp], env: { WASM4PM_OTEL_ENABLED: '1' } });
    expect(cfg.observability.otel?.enabled).toBe(true);
  });

  it('sets OTEL endpoint without ENABLED env var', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_OTEL_ENDPOINT: 'http://custom-collector:4318' },
    });
    expect(cfg.observability.otel?.endpoint).toBe('http://custom-collector:4318');
  });

  it('sets both OTEL enabled and endpoint together', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: {
        WASM4PM_OTEL_ENABLED: 'true',
        WASM4PM_OTEL_ENDPOINT: 'http://otel-collector:4317',
      },
    });
    expect(cfg.observability.otel?.enabled).toBe(true);
    expect(cfg.observability.otel?.endpoint).toBe('http://otel-collector:4317');
  });

  it('OTEL endpoint from ENV is overridden by TOML file', async () => {
    await fs.writeFile(
      path.join(tmp, 'wasm4pm.toml'),
      'version = "1.0.0"\n[source]\nkind = "file"\n[observability.otel]\nenabled = true\nexporter = "otlp"\nendpoint = "http://toml-collector:4318"\n'
    );
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_OTEL_ENDPOINT: 'http://env-collector:4318' },
    });
    // TOML beats ENV for endpoint
    expect(cfg.observability.otel?.endpoint).toBe('http://toml-collector:4318');
  });
});

// ---------------------------------------------------------------------------
// 5. WASM4PM_OUTPUT_FORMAT
// ---------------------------------------------------------------------------
describe('ENV: WASM4PM_OUTPUT_FORMAT', () => {
  let tmp: string;
  beforeEach(async () => { tmp = await makeTmp(); });
  afterEach(async () => { await cleanTmp(tmp); });

  it('sets output.format to "json"', async () => {
    const cfg = await resolveConfig({ configSearchPaths: [tmp], env: { WASM4PM_OUTPUT_FORMAT: 'json' } });
    expect(cfg.output.format).toBe('json');
    expect(cfg.metadata.provenance['output.format']?.source).toBe('env');
  });

  it('sets output.format to "human"', async () => {
    const cfg = await resolveConfig({ configSearchPaths: [tmp], env: { WASM4PM_OUTPUT_FORMAT: 'human' } });
    expect(cfg.output.format).toBe('human');
  });

  it('CLI outputFormat=human beats WASM4PM_OUTPUT_FORMAT=json', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      cliOverrides: { outputFormat: 'human' },
      env: { WASM4PM_OUTPUT_FORMAT: 'json' },
    });
    expect(cfg.output.format).toBe('human');
    expect(cfg.metadata.provenance['output.format']?.source).toBe('cli');
  });

  it('CLI outputFormat=json beats WASM4PM_OUTPUT_FORMAT=human', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      cliOverrides: { outputFormat: 'json' },
      env: { WASM4PM_OUTPUT_FORMAT: 'human' },
    });
    expect(cfg.output.format).toBe('json');
    expect(cfg.metadata.provenance['output.format']?.source).toBe('cli');
  });
});

// ---------------------------------------------------------------------------
// 6. WASM4PM_OUTPUT_DESTINATION
// ---------------------------------------------------------------------------
describe('ENV: WASM4PM_OUTPUT_DESTINATION', () => {
  let tmp: string;
  beforeEach(async () => { tmp = await makeTmp(); });
  afterEach(async () => { await cleanTmp(tmp); });

  it('sets output.destination from ENV', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_OUTPUT_DESTINATION: '/tmp/output.json' },
    });
    expect(cfg.output.destination).toBe('/tmp/output.json');
    expect(cfg.metadata.provenance['output.destination']?.source).toBe('env');
  });

  it('OUTPUT_FORMAT and OUTPUT_DESTINATION can be set independently via ENV', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: {
        WASM4PM_OUTPUT_FORMAT: 'json',
        WASM4PM_OUTPUT_DESTINATION: '/tmp/results.json',
      },
    });
    expect(cfg.output.format).toBe('json');
    expect(cfg.output.destination).toBe('/tmp/results.json');
  });
});

// ---------------------------------------------------------------------------
// 7. WASM4PM_PREDICTION_ACTIVITY_KEY
// ---------------------------------------------------------------------------
describe('ENV: WASM4PM_PREDICTION_ACTIVITY_KEY', () => {
  let tmp: string;
  beforeEach(async () => { tmp = await makeTmp(); });
  afterEach(async () => { await cleanTmp(tmp); });

  it('sets prediction.activityKey from ENV', async () => {
    // prediction.enabled=true requires at least one task — add 'next_activity'
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: {
        WASM4PM_PREDICTION_ENABLED: 'true',
        WASM4PM_PREDICTION_TASKS: 'next_activity',
        WASM4PM_PREDICTION_ACTIVITY_KEY: 'lifecycle:transition',
      },
    });
    expect(cfg.prediction?.activityKey).toBe('lifecycle:transition');
    expect(cfg.metadata.provenance['prediction.activityKey']?.source).toBe('env');
  });

  it('default activityKey is "concept:name"', async () => {
    const cfg = await resolveConfig({ configSearchPaths: [tmp] });
    expect(cfg.prediction?.activityKey).toBe('concept:name');
    expect(cfg.metadata.provenance['prediction.activityKey']?.source).toBe('default');
  });
});

// ---------------------------------------------------------------------------
// 8. WASM4PM_PREDICTION_NGRAM_ORDER
// ---------------------------------------------------------------------------
describe('ENV: WASM4PM_PREDICTION_NGRAM_ORDER', () => {
  let tmp: string;
  beforeEach(async () => { tmp = await makeTmp(); });
  afterEach(async () => { await cleanTmp(tmp); });

  it('sets ngramOrder to 3 from ENV', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_PREDICTION_NGRAM_ORDER: '3' },
    });
    expect(cfg.prediction?.ngramOrder).toBe(3);
    expect(cfg.metadata.provenance['prediction.ngramOrder']?.source).toBe('env');
  });

  it('accepts minimum valid value 2', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_PREDICTION_NGRAM_ORDER: '2' },
    });
    expect(cfg.prediction?.ngramOrder).toBe(2);
  });

  it('accepts maximum valid value 5', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_PREDICTION_NGRAM_ORDER: '5' },
    });
    expect(cfg.prediction?.ngramOrder).toBe(5);
  });

  it('rejects non-integer value (NaN)', async () => {
    await expect(
      resolveConfig({ configSearchPaths: [tmp], env: { WASM4PM_PREDICTION_NGRAM_ORDER: 'abc' } })
    ).rejects.toThrow(/WASM4PM_PREDICTION_NGRAM_ORDER/);
  });

  it('rejects value below minimum (1)', async () => {
    await expect(
      resolveConfig({ configSearchPaths: [tmp], env: { WASM4PM_PREDICTION_NGRAM_ORDER: '1' } })
    ).rejects.toThrow(/WASM4PM_PREDICTION_NGRAM_ORDER/);
  });

  it('rejects value above maximum (6)', async () => {
    await expect(
      resolveConfig({ configSearchPaths: [tmp], env: { WASM4PM_PREDICTION_NGRAM_ORDER: '6' } })
    ).rejects.toThrow(/WASM4PM_PREDICTION_NGRAM_ORDER/);
  });
});

// ---------------------------------------------------------------------------
// 9. WASM4PM_PREDICTION_DRIFT_WINDOW
// ---------------------------------------------------------------------------
describe('ENV: WASM4PM_PREDICTION_DRIFT_WINDOW', () => {
  let tmp: string;
  beforeEach(async () => { tmp = await makeTmp(); });
  afterEach(async () => { await cleanTmp(tmp); });

  it('sets driftWindowSize to 20 from ENV', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_PREDICTION_DRIFT_WINDOW: '20' },
    });
    expect(cfg.prediction?.driftWindowSize).toBe(20);
    expect(cfg.metadata.provenance['prediction.driftWindowSize']?.source).toBe('env');
  });

  it('rejects non-integer drift window', async () => {
    await expect(
      resolveConfig({ configSearchPaths: [tmp], env: { WASM4PM_PREDICTION_DRIFT_WINDOW: 'ten' } })
    ).rejects.toThrow(/WASM4PM_PREDICTION_DRIFT_WINDOW/);
  });

  it('rejects zero drift window (must be > 0)', async () => {
    await expect(
      resolveConfig({ configSearchPaths: [tmp], env: { WASM4PM_PREDICTION_DRIFT_WINDOW: '0' } })
    ).rejects.toThrow(/WASM4PM_PREDICTION_DRIFT_WINDOW/);
  });

  it('rejects negative drift window', async () => {
    await expect(
      resolveConfig({ configSearchPaths: [tmp], env: { WASM4PM_PREDICTION_DRIFT_WINDOW: '-5' } })
    ).rejects.toThrow(/WASM4PM_PREDICTION_DRIFT_WINDOW/);
  });
});

// ---------------------------------------------------------------------------
// 10. WASM4PM_MEMBRANE_* family
// ---------------------------------------------------------------------------
describe('ENV: WASM4PM_MEMBRANE_*', () => {
  let tmp: string;
  beforeEach(async () => { tmp = await makeTmp(); });
  afterEach(async () => { await cleanTmp(tmp); });

  it('enables membrane with WASM4PM_MEMBRANE_ENABLED=true', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_MEMBRANE_ENABLED: 'true' },
    });
    expect((cfg as Record<string, unknown> & { membrane?: { enabled?: boolean } }).membrane?.enabled).toBe(true);
  });

  it('disables membrane with WASM4PM_MEMBRANE_ENABLED=false', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_MEMBRANE_ENABLED: 'false' },
    });
    expect((cfg as Record<string, unknown> & { membrane?: { enabled?: boolean } }).membrane?.enabled).toBe(false);
  });

  it('sets membrane custody_actions from comma-separated ENV value', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_MEMBRANE_CUSTODY_ACTIONS: 'emit,verify,archive' },
    }) as Record<string, unknown> & { membrane?: { custody_actions?: string[] } };
    expect(cfg.membrane?.custody_actions).toEqual(['emit', 'verify', 'archive']);
  });

  it('sets membrane envelopes.persist from ENV', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_MEMBRANE_PERSIST: 'true' },
    }) as Record<string, unknown> & { membrane?: { envelopes?: { persist?: boolean } } };
    expect(cfg.membrane?.envelopes?.persist).toBe(true);
  });

  it('sets membrane envelopes.path from ENV', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_MEMBRANE_PATH: '/tmp/membrane-envelopes' },
    }) as Record<string, unknown> & { membrane?: { envelopes?: { path?: string } } };
    expect(cfg.membrane?.envelopes?.path).toBe('/tmp/membrane-envelopes');
  });

  it('sets membrane actor_anomaly_escalate threshold from ENV', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_MEMBRANE_ACTOR_ESCALATE: '0.75' },
    }) as Record<string, unknown> & { membrane?: { thresholds?: { actor_anomaly_escalate?: number } } };
    expect(cfg.membrane?.thresholds?.actor_anomaly_escalate).toBeCloseTo(0.75);
  });

  it('rejects out-of-range WASM4PM_MEMBRANE_ACTOR_ESCALATE (> 1)', async () => {
    await expect(
      resolveConfig({ configSearchPaths: [tmp], env: { WASM4PM_MEMBRANE_ACTOR_ESCALATE: '1.5' } })
    ).rejects.toThrow(/WASM4PM_MEMBRANE_ACTOR_ESCALATE/);
  });

  it('sets membrane automl_escalate threshold from ENV', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_MEMBRANE_AUTOML_ESCALATE: '0.6' },
    }) as Record<string, unknown> & { membrane?: { thresholds?: { automl_escalate?: number } } };
    expect(cfg.membrane?.thresholds?.automl_escalate).toBeCloseTo(0.6);
  });

  it('rejects out-of-range WASM4PM_MEMBRANE_AUTOML_ESCALATE (< 0)', async () => {
    await expect(
      resolveConfig({ configSearchPaths: [tmp], env: { WASM4PM_MEMBRANE_AUTOML_ESCALATE: '-0.1' } })
    ).rejects.toThrow(/WASM4PM_MEMBRANE_AUTOML_ESCALATE/);
  });
});

// ---------------------------------------------------------------------------
// 11. Multi-ENV + CLI precedence: several fields at once
// ---------------------------------------------------------------------------
describe('CLI beats ENV: multiple fields simultaneously', () => {
  let tmp: string;
  beforeEach(async () => { tmp = await makeTmp(); });
  afterEach(async () => { await cleanTmp(tmp); });

  it('CLI outputFormat=human beats WASM4PM_OUTPUT_FORMAT=json, LOG_LEVEL from ENV survives', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      cliOverrides: { outputFormat: 'human' },
      env: { WASM4PM_OUTPUT_FORMAT: 'json', WASM4PM_LOG_LEVEL: 'debug' },
    });
    expect(cfg.output.format).toBe('human');
    expect(cfg.metadata.provenance['output.format']?.source).toBe('cli');
    // LOG_LEVEL has no CLI override so ENV value wins
    expect(cfg.observability.logLevel).toBe('debug');
    expect(cfg.metadata.provenance['observability.logLevel']?.source).toBe('env');
  });

  it('WASM4PM_PROFILE=quality + CLI fast → result is fast', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      cliOverrides: { profile: 'fast' },
      env: { WASM4PM_PROFILE: 'quality' },
    });
    expect(cfg.execution.profile).toBe('fast');
    expect(cfg.metadata.provenance['execution.profile']?.source).toBe('cli');
  });

  it('WASM4PM_ALGORITHM=aco + CLI genetic_algorithm → result is genetic_algorithm', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      cliOverrides: { algorithm: 'genetic_algorithm' },
      env: { WASM4PM_ALGORITHM: 'aco' },
    });
    expect(cfg.algorithm.name).toBe('genetic_algorithm');
    expect(cfg.metadata.provenance['algorithm.name']?.source).toBe('cli');
  });

  it('all ENV vars set simultaneously resolve independently without collision', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: {
        WASM4PM_ALGORITHM: 'dfg',
        WASM4PM_LOG_LEVEL: 'debug',
        WASM4PM_WATCH: 'true',
        WASM4PM_OTEL_ENABLED: 'true',
        WASM4PM_OUTPUT_FORMAT: 'json',
        WASM4PM_PROFILE: 'stream',
      },
    });
    expect(cfg.algorithm.name).toBe('dfg');
    expect(cfg.observability.logLevel).toBe('debug');
    expect(cfg.watch?.enabled).toBe(true);
    expect(cfg.observability.otel?.enabled).toBe(true);
    expect(cfg.output.format).toBe('json');
    expect(cfg.execution.profile).toBe('stream');
  });
});
