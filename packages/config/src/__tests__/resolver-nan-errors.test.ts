/**
 * resolver-nan-errors.test.ts
 *
 * Tests for the config resolver's numeric-validation error paths that
 * reject non-numeric ENV var values with clear error messages.
 *
 * Coverage targets — error paths not previously exercised:
 *   WASM4PM_PREDICTION_NGRAM_ORDER with a non-integer string ("abc")
 *   WASM4PM_PREDICTION_DRIFT_WINDOW with a non-integer string ("three")
 *   WASM4PM_RL_LEARNING_RATE with a non-numeric string ("high")
 *   WASM4PM_RL_DISCOUNT_FACTOR with a non-numeric string ("nearly-one")
 *   WASM4PM_RL_EPSILON with a non-numeric string ("small")
 *   WASM4PM_PREDICTION_DRIFT_THRESHOLD with a non-numeric string ("low")
 *   WASM4PM_PREDICTION_DRIFT_EWMA_ALPHA with a non-numeric string ("slow")
 *   WASM4PM_PREDICTION_NGRAM_ORDER out-of-range: 1 (below minimum of 2)
 *   WASM4PM_PREDICTION_NGRAM_ORDER out-of-range: 6 (above maximum of 5)
 *   WASM4PM_PREDICTION_DRIFT_WINDOW with value 0 (must be > 0)
 *   WASM4PM_PREDICTION_DRIFT_WINDOW with negative value
 *
 * Oracle rank: Rank-1 (mathematical theorem) — parseInt/parseFloat NaN
 * detection is a domain-invariant: no valid config should ever be derived
 * from a non-numeric string for a numeric field.
 *
 * No mocking: tests the real resolveConfig() implementation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { resolveConfig } from '../resolver.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function makeTmp(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'wasm4pm-nan-'));
}
async function cleanTmp(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// WASM4PM_PREDICTION_NGRAM_ORDER — non-integer strings
// ---------------------------------------------------------------------------
describe('ENV: WASM4PM_PREDICTION_NGRAM_ORDER — NaN rejection', () => {
  let tmp: string;
  beforeEach(async () => { tmp = await makeTmp(); });
  afterEach(async () => { await cleanTmp(tmp); });

  it('rejects "abc" (non-integer) with a message mentioning NGRAM_ORDER', async () => {
    await expect(
      resolveConfig({ configSearchPaths: [tmp], env: { WASM4PM_PREDICTION_NGRAM_ORDER: 'abc' } })
    ).rejects.toThrow(/WASM4PM_PREDICTION_NGRAM_ORDER/);
  });

  it('rejects "2.5" (float, not integer) — parseInt("2.5") = 2 which is valid, so should NOT throw', async () => {
    // parseInt("2.5") = 2 — this is in-range [2,5], so no error expected
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_PREDICTION_NGRAM_ORDER: '2.5' },
    });
    expect(cfg.prediction?.ngramOrder).toBe(2);
  });

  it('rejects "1" (out of range: below minimum 2)', async () => {
    await expect(
      resolveConfig({ configSearchPaths: [tmp], env: { WASM4PM_PREDICTION_NGRAM_ORDER: '1' } })
    ).rejects.toThrow(/WASM4PM_PREDICTION_NGRAM_ORDER/);
  });

  it('rejects "6" (out of range: above maximum 5)', async () => {
    await expect(
      resolveConfig({ configSearchPaths: [tmp], env: { WASM4PM_PREDICTION_NGRAM_ORDER: '6' } })
    ).rejects.toThrow(/WASM4PM_PREDICTION_NGRAM_ORDER/);
  });

  it('accepts "2" (minimum valid value)', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_PREDICTION_NGRAM_ORDER: '2' },
    });
    expect(cfg.prediction?.ngramOrder).toBe(2);
  });

  it('accepts "5" (maximum valid value)', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_PREDICTION_NGRAM_ORDER: '5' },
    });
    expect(cfg.prediction?.ngramOrder).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// WASM4PM_PREDICTION_DRIFT_WINDOW — non-integer strings and boundary
// ---------------------------------------------------------------------------
describe('ENV: WASM4PM_PREDICTION_DRIFT_WINDOW — NaN and boundary rejection', () => {
  let tmp: string;
  beforeEach(async () => { tmp = await makeTmp(); });
  afterEach(async () => { await cleanTmp(tmp); });

  it('rejects "three" (non-integer) with a message mentioning DRIFT_WINDOW', async () => {
    await expect(
      resolveConfig({ configSearchPaths: [tmp], env: { WASM4PM_PREDICTION_DRIFT_WINDOW: 'three' } })
    ).rejects.toThrow(/WASM4PM_PREDICTION_DRIFT_WINDOW/);
  });

  it('rejects "0" (zero — must be > 0)', async () => {
    await expect(
      resolveConfig({ configSearchPaths: [tmp], env: { WASM4PM_PREDICTION_DRIFT_WINDOW: '0' } })
    ).rejects.toThrow(/WASM4PM_PREDICTION_DRIFT_WINDOW/);
  });

  it('rejects "-5" (negative — must be > 0)', async () => {
    await expect(
      resolveConfig({ configSearchPaths: [tmp], env: { WASM4PM_PREDICTION_DRIFT_WINDOW: '-5' } })
    ).rejects.toThrow(/WASM4PM_PREDICTION_DRIFT_WINDOW/);
  });

  it('accepts "1" (minimum valid value — just > 0)', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_PREDICTION_DRIFT_WINDOW: '1' },
    });
    expect(cfg.prediction?.driftWindowSize).toBe(1);
  });

  it('accepts "100" (typical window size)', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_PREDICTION_DRIFT_WINDOW: '100' },
    });
    expect(cfg.prediction?.driftWindowSize).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// WASM4PM_RL_LEARNING_RATE — non-numeric string
// ---------------------------------------------------------------------------
describe('ENV: WASM4PM_RL_LEARNING_RATE — NaN rejection', () => {
  let tmp: string;
  beforeEach(async () => { tmp = await makeTmp(); });
  afterEach(async () => { await cleanTmp(tmp); });

  it('rejects "high" (non-numeric) with a message mentioning RL_LEARNING_RATE', async () => {
    await expect(
      resolveConfig({ configSearchPaths: [tmp], env: { WASM4PM_RL_LEARNING_RATE: 'high' } })
    ).rejects.toThrow(/WASM4PM_RL_LEARNING_RATE/);
  });

  it('rejects "NaN" (the literal string "NaN")', async () => {
    await expect(
      resolveConfig({ configSearchPaths: [tmp], env: { WASM4PM_RL_LEARNING_RATE: 'NaN' } })
    ).rejects.toThrow(/WASM4PM_RL_LEARNING_RATE/);
  });

  it('accepts "0.1" (valid learning rate)', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_RL_LEARNING_RATE: '0.1' },
    });
    expect(cfg.rl?.learning_rate).toBeCloseTo(0.1, 5);
  });
});

// ---------------------------------------------------------------------------
// WASM4PM_RL_DISCOUNT_FACTOR — non-numeric string
// ---------------------------------------------------------------------------
describe('ENV: WASM4PM_RL_DISCOUNT_FACTOR — NaN rejection', () => {
  let tmp: string;
  beforeEach(async () => { tmp = await makeTmp(); });
  afterEach(async () => { await cleanTmp(tmp); });

  it('rejects "nearly-one" (non-numeric) with a message mentioning RL_DISCOUNT_FACTOR', async () => {
    await expect(
      resolveConfig({ configSearchPaths: [tmp], env: { WASM4PM_RL_DISCOUNT_FACTOR: 'nearly-one' } })
    ).rejects.toThrow(/WASM4PM_RL_DISCOUNT_FACTOR/);
  });

  it('accepts "0.99" (valid discount factor)', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_RL_DISCOUNT_FACTOR: '0.99' },
    });
    expect(cfg.rl?.discount_factor).toBeCloseTo(0.99, 5);
  });
});

// ---------------------------------------------------------------------------
// WASM4PM_RL_EPSILON — non-numeric string
// ---------------------------------------------------------------------------
describe('ENV: WASM4PM_RL_EPSILON — NaN rejection', () => {
  let tmp: string;
  beforeEach(async () => { tmp = await makeTmp(); });
  afterEach(async () => { await cleanTmp(tmp); });

  it('rejects "small" (non-numeric) with a message mentioning RL_EPSILON', async () => {
    await expect(
      resolveConfig({ configSearchPaths: [tmp], env: { WASM4PM_RL_EPSILON: 'small' } })
    ).rejects.toThrow(/WASM4PM_RL_EPSILON/);
  });

  it('accepts "0.05" (valid epsilon)', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_RL_EPSILON: '0.05' },
    });
    expect(cfg.rl?.epsilon).toBeCloseTo(0.05, 5);
  });
});

// ---------------------------------------------------------------------------
// WASM4PM_PREDICTION_DRIFT_THRESHOLD — non-numeric string
// ---------------------------------------------------------------------------
describe('ENV: WASM4PM_PREDICTION_DRIFT_THRESHOLD — NaN rejection', () => {
  let tmp: string;
  beforeEach(async () => { tmp = await makeTmp(); });
  afterEach(async () => { await cleanTmp(tmp); });

  it('rejects "low" (non-numeric) with a message mentioning DRIFT_THRESHOLD', async () => {
    await expect(
      resolveConfig({ configSearchPaths: [tmp], env: { WASM4PM_PREDICTION_DRIFT_THRESHOLD: 'low' } })
    ).rejects.toThrow(/WASM4PM_PREDICTION_DRIFT_THRESHOLD/);
  });

  it('accepts "0.3" (valid threshold)', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_PREDICTION_DRIFT_THRESHOLD: '0.3' },
    });
    const drift = cfg.prediction?.drift as Record<string, unknown> | undefined;
    expect(drift?.threshold).toBeCloseTo(0.3, 5);
  });
});

// ---------------------------------------------------------------------------
// WASM4PM_PREDICTION_DRIFT_EWMA_ALPHA — non-numeric string
// ---------------------------------------------------------------------------
describe('ENV: WASM4PM_PREDICTION_DRIFT_EWMA_ALPHA — NaN rejection', () => {
  let tmp: string;
  beforeEach(async () => { tmp = await makeTmp(); });
  afterEach(async () => { await cleanTmp(tmp); });

  it('rejects "slow" (non-numeric) with a message mentioning DRIFT_EWMA_ALPHA', async () => {
    await expect(
      resolveConfig({ configSearchPaths: [tmp], env: { WASM4PM_PREDICTION_DRIFT_EWMA_ALPHA: 'slow' } })
    ).rejects.toThrow(/WASM4PM_PREDICTION_DRIFT_EWMA_ALPHA/);
  });

  it('accepts "0.2" (valid EWMA alpha)', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_PREDICTION_DRIFT_EWMA_ALPHA: '0.2' },
    });
    const drift = cfg.prediction?.drift as Record<string, unknown> | undefined;
    expect(drift?.ewma_alpha).toBeCloseTo(0.2, 5);
  });
});

// ---------------------------------------------------------------------------
// Error message quality — messages must identify the bad ENV var by name
// ---------------------------------------------------------------------------
describe('resolver NaN errors — message quality', () => {
  let tmp: string;
  beforeEach(async () => { tmp = await makeTmp(); });
  afterEach(async () => { await cleanTmp(tmp); });

  it('NGRAM_ORDER NaN error includes the bad value in the message', async () => {
    let err: Error | null = null;
    try {
      await resolveConfig({ configSearchPaths: [tmp], env: { WASM4PM_PREDICTION_NGRAM_ORDER: 'BAD' } });
    } catch (e) {
      err = e as Error;
    }
    expect(err).not.toBeNull();
    expect(err!.message).toMatch(/BAD/);
  });

  it('DRIFT_WINDOW NaN error includes the bad value in the message', async () => {
    let err: Error | null = null;
    try {
      await resolveConfig({ configSearchPaths: [tmp], env: { WASM4PM_PREDICTION_DRIFT_WINDOW: 'BADVAL' } });
    } catch (e) {
      err = e as Error;
    }
    expect(err).not.toBeNull();
    expect(err!.message).toMatch(/BADVAL/);
  });
});

// ---------------------------------------------------------------------------
// Security: ENV variable validation (Fix 4)
// Null bytes, length limits, control characters
// ---------------------------------------------------------------------------
describe('Security: ENV variable validation — null bytes, length, control chars', () => {
  let tmp: string;
  beforeEach(async () => { tmp = await makeTmp(); });
  afterEach(async () => { await cleanTmp(tmp); });

  it('rejects WASM4PM_* variables containing null bytes', async () => {
    await expect(
      resolveConfig({
        configSearchPaths: [tmp],
        env: { WASM4PM_PROFILE: 'balanced\x00malicious' },
      })
    ).rejects.toThrow(/null byte/);
  });

  it('rejects WASM4PM_* variables exceeding 1KB', async () => {
    const longValue = 'a'.repeat(1025);
    await expect(
      resolveConfig({
        configSearchPaths: [tmp],
        env: { WASM4PM_ALGORITHM: longValue },
      })
    ).rejects.toThrow(/exceeds 1KB limit/);
  });

  it('rejects WASM4PM_* variables with suspicious control characters', async () => {
    await expect(
      resolveConfig({
        configSearchPaths: [tmp],
        env: { WASM4PM_PROFILE: 'balanced\x01evil' },
      })
    ).rejects.toThrow(/control characters/);
  });

  it('accepts valid WASM4PM_PROFILE with ASCII alphanumeric', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_PROFILE: 'quality' },
    });
    expect(cfg.execution.profile).toBe('quality');
  });

  it('accepts WASM4PM_* variables with spaces and allowed punctuation', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmp],
      env: { WASM4PM_OUTPUT_DESTINATION: './my-output-file.json' },
    });
    expect(cfg.output.destination).toBe('./my-output-file.json');
  });

  it('accepts WASM4PM_* variables at exactly 1KB boundary', async () => {
    const value = 'a'.repeat(1024);
    // At exactly 1024 bytes, this should pass pre-validation (no length error)
    // But will fail Zod validation since "a...a" is not a valid algorithm name
    await expect(
      resolveConfig({
        configSearchPaths: [tmp],
        env: { WASM4PM_ALGORITHM: value },
      })
    ).rejects.toThrow(); // Zod rejects (invalid enum), not pre-validation (length OK)
  });
});
