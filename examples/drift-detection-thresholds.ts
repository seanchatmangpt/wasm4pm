/**
 * Example — Drift Detection: Threshold Management and EWMA
 *
 * Demonstrates: `set_drift_thresholds()`, `get_drift_thresholds()`, `reset_drift_thresholds()`, `compute_ewma()`
 * Docs reference: WASM_API.md § Drift Detection — Threshold Management
 *
 * The drift threshold API controls what Jaccard-distance values trigger alerts:
 *   - low threshold (default 0.3): below this → "stable" (no drift)
 *   - high threshold (default 0.7): above this → "drifting" (significant change)
 *   - between low and high → "warning" (trend developing)
 *
 * `compute_ewma()` smooths a raw Jaccard-distance series using exponential
 * weighted moving average (alpha controls recency weight, clamped to (0,1]).
 * It returns `{ smoothed: number[], trend: "rising"|"falling"|"stable", last_value: number }`.
 *
 * This example fails if the threshold round-trip breaks or EWMA produces
 * a structurally invalid result — making it a regression witness for both APIs.
 */
import assert from 'node:assert/strict';
import * as core from '@wasm4pm/core';
import { logger } from './utils/logger.js';

async function main(): Promise<void> {
  logger.header('📈', 'Drift Threshold Management + EWMA', 'set/get/reset thresholds and compute_ewma');

  if (typeof (core as any).default === 'function') {
    await (core as any).default();
  }

  // ── Step 1: Read default thresholds ─────────────────────────────────────────
  logger.step(1, 4, 'Reading default drift thresholds (get_drift_thresholds)');
  const defaultsRaw = (core as any).get_drift_thresholds();
  const defaults = JSON.parse(typeof defaultsRaw === 'string' ? defaultsRaw : JSON.stringify(defaultsRaw));

  assert.ok(typeof defaults.low === 'number', 'Default thresholds missing low field');
  assert.ok(typeof defaults.high === 'number', 'Default thresholds missing high field');
  assert.ok(defaults.low < defaults.high, 'Default low must be less than high');
  logger.success(`Default thresholds: low=${defaults.low}, high=${defaults.high}`);

  // Contract: documented defaults are 0.3 and 0.7
  assert.strictEqual(defaults.low, 0.3, `Expected default low=0.3, got ${defaults.low}`);
  assert.strictEqual(defaults.high, 0.7, `Expected default high=0.7, got ${defaults.high}`);

  // ── Step 2: Set custom thresholds ───────────────────────────────────────────
  logger.step(2, 4, 'Setting custom thresholds (set_drift_thresholds)');
  const setResult = (core as any).set_drift_thresholds(0.2, 0.8);
  assert.ok(typeof setResult === 'string', 'set_drift_thresholds must return a string');
  logger.success(`Threshold set. Response: ${setResult}`);

  // Verify the round-trip
  const customRaw = (core as any).get_drift_thresholds();
  const custom = JSON.parse(typeof customRaw === 'string' ? customRaw : JSON.stringify(customRaw));
  assert.strictEqual(custom.low, 0.2, `Expected low=0.2 after set, got ${custom.low}`);
  assert.strictEqual(custom.high, 0.8, `Expected high=0.8 after set, got ${custom.high}`);
  logger.success(`Round-trip verified: low=${custom.low}, high=${custom.high}`);

  // ── Step 3: Reset to defaults and verify ────────────────────────────────────
  logger.step(3, 4, 'Resetting thresholds (reset_drift_thresholds)');
  const resetResult = (core as any).reset_drift_thresholds();
  assert.ok(typeof resetResult === 'string', 'reset_drift_thresholds must return a string');
  logger.success(`Reset response: ${resetResult}`);

  const afterResetRaw = (core as any).get_drift_thresholds();
  const afterReset = JSON.parse(typeof afterResetRaw === 'string' ? afterResetRaw : JSON.stringify(afterResetRaw));
  assert.strictEqual(afterReset.low, 0.3, `Expected low=0.3 after reset, got ${afterReset.low}`);
  assert.strictEqual(afterReset.high, 0.7, `Expected high=0.7 after reset, got ${afterReset.high}`);
  logger.success('Thresholds restored to defaults.');

  // ── Step 4: Compute EWMA on a Jaccard-distance series ───────────────────────
  // A rising series → EWMA trend should be "rising"
  // A falling series → EWMA trend should be "falling"
  logger.step(4, 4, 'Computing EWMA on drift distance series (compute_ewma)');

  const risingSeries = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
  const risingRaw = (core as any).compute_ewma(JSON.stringify(risingSeries), 0.3);
  const rising = JSON.parse(typeof risingRaw === 'string' ? risingRaw : JSON.stringify(risingRaw));

  assert.ok(Array.isArray(rising.smoothed), 'EWMA result missing smoothed array');
  assert.strictEqual(rising.smoothed.length, risingSeries.length, 'Smoothed length must match input length');
  assert.ok(typeof rising.trend === 'string', 'EWMA result missing trend field');
  assert.ok(['rising', 'falling', 'stable'].includes(rising.trend), `Unexpected trend: ${rising.trend}`);
  assert.ok(typeof rising.last_value === 'number', 'EWMA result missing last_value');

  logger.success(`Rising series EWMA: trend=${rising.trend}, last_value=${rising.last_value.toFixed(4)}`);
  assert.strictEqual(rising.trend, 'rising', `Expected trend=rising for monotone-increasing series, got ${rising.trend}`);

  const fallingSeries = [0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1];
  const fallingRaw = (core as any).compute_ewma(JSON.stringify(fallingSeries), 0.3);
  const falling = JSON.parse(typeof fallingRaw === 'string' ? fallingRaw : JSON.stringify(fallingRaw));
  assert.strictEqual(falling.trend, 'falling', `Expected trend=falling for monotone-decreasing series, got ${falling.trend}`);
  logger.success(`Falling series EWMA: trend=${falling.trend}, last_value=${falling.last_value.toFixed(4)}`);

  logger.info('✅ Drift threshold management and EWMA witness complete.');
}

main().catch(err => {
  console.error('Drift threshold example failed:', err);
  process.exit(1);
});
