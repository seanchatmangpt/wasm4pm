/**
 * log-fingerprint.test.ts
 *
 * Integration tests for computeFingerprint (Layer 2 — Log Structure Fingerprint).
 *
 * Oracle rank: Rank-2 (domain contract) — all 8 fingerprint fields must be
 * finite and non-negative; structural invariants (density in [0,1], entropy
 * in [0,1], traceCount > 0, meanTraceLength > 0) must hold for a well-formed log.
 *
 * Uses real WASM binary (@wasm4pm/core) against the canonical running-example.xes
 * fixture. Suite is skipped gracefully when the WASM pkg is absent.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { Kernel } from '../api.js';
import type { KernelWasmModule } from '../api.js';
import { computeFingerprint, type LogFingerprint } from '../log-fingerprint.js';

// ── Guard: skip integration tests if WASM binary or fixture is absent ─────────

const WASM_PKG_PATH = '/Users/sac/wasm4pm/wasm4pm/pkg';
const FIXTURE_PATH = '/Users/sac/wasm4pm/wasm4pm/tests/fixtures/running-example.xes';
const WASM_AVAILABLE = existsSync(WASM_PKG_PATH) && existsSync(FIXTURE_PATH);

// ── Module-scope state ────────────────────────────────────────────────────────

let kernel: Kernel | null = null;
let wasmModule: KernelWasmModule | null = null;
let handle: string | null = null;
let fingerprint: LogFingerprint | null = null;
let ready = false;

beforeAll(async () => {
  if (!WASM_AVAILABLE) return;

  wasmModule = (await import('@wasm4pm/core')) as unknown as KernelWasmModule;
  kernel = new Kernel(wasmModule);
  await kernel.init();

  const xesContent = readFileSync(FIXTURE_PATH, 'utf-8');
  handle = await kernel.loadEventLog(xesContent);
  fingerprint = await computeFingerprint(kernel, wasmModule, handle);
  ready = true;
});

// ── Helper: skip integration tests when WASM absent ──────────────────────────

function integrationIt(name: string, fn: () => void) {
  if (!WASM_AVAILABLE) {
    it.skip(`${name} (WASM binary absent)`, fn);
  } else {
    it(name, fn);
  }
}

// ── Integration tests — running-example.xes ──────────────────────────────────

describe('computeFingerprint — running-example.xes', () => {
  integrationIt('returns a LogFingerprint object with 8 fields', () => {
    if (!ready || !fingerprint) return;
    expect(fingerprint).toBeDefined();
    const fields: (keyof LogFingerprint)[] = [
      'traceCount', 'activityCount', 'variantCount', 'totalEvents',
      'meanTraceLength', 'dfgDensity', 'eventEntropy', 'variantTopCoverage',
    ];
    expect(Object.keys(fingerprint).sort()).toEqual(fields.slice().sort());
  });

  integrationIt('all 8 fields are finite and non-negative', () => {
    if (!ready || !fingerprint) return;
    const fields: (keyof LogFingerprint)[] = [
      'traceCount', 'activityCount', 'variantCount', 'totalEvents',
      'meanTraceLength', 'dfgDensity', 'eventEntropy', 'variantTopCoverage',
    ];
    for (const field of fields) {
      const val = fingerprint[field];
      expect(Number.isFinite(val), `${field} must be finite`).toBe(true);
      expect(val, `${field} must be non-negative`).toBeGreaterThanOrEqual(0);
    }
  });

  integrationIt('traceCount > 0 for a non-empty log', () => {
    if (!ready || !fingerprint) return;
    expect(fingerprint.traceCount).toBeGreaterThan(0);
  });

  integrationIt('meanTraceLength > 0 for a non-empty log', () => {
    if (!ready || !fingerprint) return;
    expect(fingerprint.meanTraceLength).toBeGreaterThan(0);
  });

  integrationIt('dfgDensity is in [0, 1]', () => {
    if (!ready || !fingerprint) return;
    expect(fingerprint.dfgDensity).toBeGreaterThanOrEqual(0);
    expect(fingerprint.dfgDensity).toBeLessThanOrEqual(1);
  });

  integrationIt('eventEntropy is in [0, 1]', () => {
    if (!ready || !fingerprint) return;
    expect(fingerprint.eventEntropy).toBeGreaterThanOrEqual(0);
    expect(fingerprint.eventEntropy).toBeLessThanOrEqual(1);
  });

  integrationIt('variantTopCoverage is in [0, 1]', () => {
    if (!ready || !fingerprint) return;
    expect(fingerprint.variantTopCoverage).toBeGreaterThanOrEqual(0);
    expect(fingerprint.variantTopCoverage).toBeLessThanOrEqual(1);
  });

  integrationIt('variantCount <= traceCount', () => {
    if (!ready || !fingerprint) return;
    expect(fingerprint.variantCount).toBeLessThanOrEqual(fingerprint.traceCount);
  });

  integrationIt('totalEvents >= traceCount (at least one event per trace)', () => {
    if (!ready || !fingerprint) return;
    expect(fingerprint.totalEvents).toBeGreaterThanOrEqual(fingerprint.traceCount);
  });
});

// ── Unit tests — sentinel fallbacks (no WASM required) ───────────────────────

describe('computeFingerprint — sentinel fallbacks', () => {
  it('returns sentinels when all three data sources fail', async () => {
    // Duck-typed stub: only kernel.runRaw is called, and wasm.get_* methods.
    const stubKernel = {
      runRaw: async () => { throw new Error('simulated kernel failure'); },
    } as unknown as Kernel;

    const stubWasm = {
      get_trace_count: () => { throw new Error('simulated wasm failure'); },
      get_activities: () => { throw new Error('simulated wasm failure'); },
      get_event_count: () => { throw new Error('simulated wasm failure'); },
      get_trace_length_statistics: () => { throw new Error('simulated wasm failure'); },
    } as unknown as KernelWasmModule;

    const fp = await computeFingerprint(stubKernel, stubWasm, 'fake-handle');

    expect(fp.traceCount).toBe(0);
    expect(fp.activityCount).toBe(0);
    expect(fp.variantCount).toBe(0);
    expect(fp.totalEvents).toBe(0);
    expect(fp.meanTraceLength).toBe(0);
    expect(fp.dfgDensity).toBe(0);
    expect(fp.eventEntropy).toBe(0.5);      // sentinel
    expect(fp.variantTopCoverage).toBe(0);  // sentinel
  });
});
