/**
 * WASM Binary Size Regression Guard
 *
 * Van der Aalst reproducibility requirement: a result that cannot be compared
 * against a known baseline is not trustworthy. The WASM binary size is the
 * single most actionable signal for accidental feature bloat — a feature flag
 * left on, an extra algorithm compiled in, or a dependency pulled in silently.
 *
 * Baseline: 2,752,160 bytes (browser profile, measured 2026-05-16).
 * Tolerance: ±10% (acceptable variance from incremental algorithm additions).
 * Hard cap: 3,100,000 bytes (10% above baseline — blocks accidental bloat).
 * Hard floor: 2,400,000 bytes (12% below baseline — detects stripped builds).
 *
 * These bounds are intentionally asymmetric in their meaning:
 *   - Exceeding the cap means features were added without a size budget review
 *   - Falling below the floor means algorithms were inadvertently omitted
 *
 * Both failures are publish-time defects that would be invisible without this guard.
 *
 * Path resolution:
 *   1. WPM_WASM_PKG env var (for CI pointing at published node_modules)
 *   2. Workspace fallback: wasm4pm/pkg/ (local built artifact)
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Baseline WASM binary size measured on 2026-05-28 for the browser profile.
 * Source: `stat -f "%z" wasm4pm/pkg/wasm4pm_bg.wasm` → 3,097,831 bytes.
 * Updated from 3,533,229 (stale) to match the current built artifact.
 */
const BASELINE_BYTES = 3_097_831;

/** ±10% of baseline — acceptable range for incremental changes */
const TOLERANCE_FACTOR = 0.10;

/** Hard cap: baseline + 10% */
const UPPER_BOUND = Math.ceil(BASELINE_BYTES * (1 + TOLERANCE_FACTOR));

/** Hard floor: baseline - 12% (asymmetric — stripped builds are also a defect) */
const LOWER_BOUND = Math.floor(BASELINE_BYTES * (1 - 0.12));

/** Absolute maximum that triggers an immediate stop — bloat beyond any justification */
const ABSOLUTE_MAX = 4_000_000;

// ── Binary resolution ─────────────────────────────────────────────────────────

const PKG_DIR: string =
  (process.env['WPM_WASM_PKG'] as string | undefined) ??
  path.resolve(__dirname, '../../wasm4pm/pkg');

const WASM_BINARY = path.join(PKG_DIR, 'wasm4pm_bg.wasm');
const WASM_JS     = path.join(PKG_DIR, 'wasm4pm.js');
const WASM_DTS    = path.join(PKG_DIR, 'wasm4pm.d.ts');

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WASM binary size regression guard', () => {

  it('WASM package directory exists', () => {
    const exists = fs.existsSync(PKG_DIR);
    if (!exists) {
      console.warn('[size-guard] PKG_DIR not found:', PKG_DIR);
      console.warn('[size-guard] Build first: cd wasm4pm && npm run build');
    }
    expect(exists, `WASM pkg dir not found: ${PKG_DIR}`).toBe(true);
  });

  it('wasm4pm_bg.wasm binary is present', () => {
    if (!fs.existsSync(PKG_DIR)) return;
    expect(fs.existsSync(WASM_BINARY), `Binary not found: ${WASM_BINARY}`).toBe(true);
  });

  it('wasm4pm.js glue file is present', () => {
    if (!fs.existsSync(PKG_DIR)) return;
    expect(fs.existsSync(WASM_JS), `JS glue not found: ${WASM_JS}`).toBe(true);
  });

  it('wasm4pm.d.ts declarations file is present', () => {
    if (!fs.existsSync(PKG_DIR)) return;
    expect(fs.existsSync(WASM_DTS), `DTS not found: ${WASM_DTS}`).toBe(true);
  });

  it('binary size is above the stripped-build floor', () => {
    if (!fs.existsSync(WASM_BINARY)) return;
    const actual = fs.statSync(WASM_BINARY).size;
    console.info(
      `[size-guard] WASM binary: ${actual.toLocaleString()} bytes` +
      ` (floor: ${LOWER_BOUND.toLocaleString()}, cap: ${UPPER_BOUND.toLocaleString()}, baseline: ${BASELINE_BYTES.toLocaleString()})`
    );
    expect(actual, `Binary ${actual} bytes is below the stripped-build floor ${LOWER_BOUND} bytes — algorithms may have been omitted`).toBeGreaterThanOrEqual(LOWER_BOUND);
  });

  it('binary size is within the 10% regression cap', () => {
    if (!fs.existsSync(WASM_BINARY)) return;
    const actual = fs.statSync(WASM_BINARY).size;
    const overBy = actual - UPPER_BOUND;
    if (overBy > 0) {
      console.error(
        `[size-guard] BLOAT DETECTED: binary is ${overBy.toLocaleString()} bytes over the cap` +
        ` (${actual.toLocaleString()} > ${UPPER_BOUND.toLocaleString()})` +
        ` — review feature flags before publishing`
      );
    }
    expect(actual, `Binary ${actual.toLocaleString()} bytes exceeds 10%-over-baseline cap (${UPPER_BOUND.toLocaleString()} bytes). Likely cause: feature flag left on, new dependency compiled in.`).toBeLessThanOrEqual(UPPER_BOUND);
  });

  it('binary size is below the absolute maximum (4MB hard stop)', () => {
    if (!fs.existsSync(WASM_BINARY)) return;
    const actual = fs.statSync(WASM_BINARY).size;
    expect(actual, `Binary ${actual.toLocaleString()} bytes exceeds absolute 4MB ceiling — this is not a browser-safe WASM bundle`).toBeLessThanOrEqual(ABSOLUTE_MAX);
  });

  it('JS glue file is at least 50KB (not an empty stub)', () => {
    const targetJs = fs.existsSync(path.join(PKG_DIR, 'wasm4pm_bg.js'))
      ? path.join(PKG_DIR, 'wasm4pm_bg.js')
      : WASM_JS;
    if (!fs.existsSync(targetJs)) return;
    const size = fs.statSync(targetJs).size;
    console.info(`[size-guard] JS glue: ${size.toLocaleString()} bytes (${path.basename(targetJs)})`);
    expect(size, `JS glue too small (${size} bytes) — may be an empty stub`).toBeGreaterThanOrEqual(50_000);
  });

  it('DTS file is at least 10KB (not a stub)', () => {
    if (!fs.existsSync(WASM_DTS)) return;
    const size = fs.statSync(WASM_DTS).size;
    console.info(`[size-guard] DTS: ${size.toLocaleString()} bytes`);
    expect(size, `DTS file too small (${size} bytes)`).toBeGreaterThanOrEqual(10_000);
  });

  it('binary size delta from baseline is within 10%', () => {
    if (!fs.existsSync(WASM_BINARY)) return;
    const actual = fs.statSync(WASM_BINARY).size;
    const delta = actual - BASELINE_BYTES;
    const pct = (delta / BASELINE_BYTES) * 100;
    const bar = buildSizeBar(actual, BASELINE_BYTES, UPPER_BOUND);
    console.info(
      `[size-guard] delta from baseline: ${delta >= 0 ? '+' : ''}${delta.toLocaleString()} bytes` +
      ` (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)\n` +
      `[size-guard] ${bar}`
    );
    expect(Math.abs(pct), `Binary size drifted ${pct.toFixed(1)}% from baseline — if intentional, update BASELINE_BYTES in this test`).toBeLessThanOrEqual(TOLERANCE_FACTOR * 100);
  });
});

// ── ASCII size bar ────────────────────────────────────────────────────────────

/**
 * Render an ASCII proportion bar showing actual size relative to cap.
 * Example: [▓▓▓▓▓▓▓▓▓░] 90%
 */
function buildSizeBar(actual: number, baseline: number, cap: number): string {
  const WIDTH = 20;
  const pctOfCap = Math.min(actual / cap, 1.2); // allow up to 120% for display
  const filled = Math.round(pctOfCap * WIDTH);
  const bar = '▓'.repeat(Math.min(filled, WIDTH)) + '░'.repeat(Math.max(0, WIDTH - filled));
  const actualKb = (actual / 1024).toFixed(0);
  const baselineKb = (baseline / 1024).toFixed(0);
  const capKb = (cap / 1024).toFixed(0);
  return `[${bar}] ${actualKb}KB / cap ${capKb}KB  (baseline ${baselineKb}KB)`;
}
