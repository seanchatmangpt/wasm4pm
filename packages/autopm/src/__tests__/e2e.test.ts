/**
 * AutoPM end-to-end test.
 *
 * Proves: runAutoPM produces a non-empty receipted Pareto front + winner;
 * determinism (same seed -> identical winner incl. receipt hash); and the
 * emitted wasm4pm.toml round-trips through the REAL @wasm4pm/config schema.
 */
import { describe, it, expect } from 'vitest';
import * as toml from 'toml';
import { configSchema } from '@wasm4pm/config';
import { runAutoPM, winnerToToml } from '../index.js';
import type { LogCharacteristics } from '../types.js';

// sepsis.xes-like characteristics.
const SEPSIS: LogCharacteristics = {
  traceCount: 1050,
  eventCount: 15000,
  activityCount: 16,
  avgTraceLength: 14,
  maxTraceLength: 185,
};

describe('AutoPM end-to-end', () => {
  it('returns a non-empty receipted Pareto front and a receipted winner', () => {
    const result = runAutoPM(SEPSIS, { seed: 7, generations: 10, populationSize: 14 });

    expect(result.paretoFront.length).toBeGreaterThan(0);
    expect(result.winner).toBeDefined();
    expect(typeof result.winner.receiptHash).toBe('string');
    expect(result.winner.receiptHash!.length).toBeGreaterThan(0);
    for (const c of result.paretoFront) {
      expect(typeof c.receiptHash).toBe('string');
      expect(c.receiptHash!.length).toBeGreaterThan(0);
    }
    expect(result.winner.objectives.quality).toBeGreaterThan(0);
    expect(result.winner.objectives.quality).toBeLessThanOrEqual(1);
  });

  it('is deterministic: same seed -> identical winner', () => {
    const a = runAutoPM(SEPSIS, { seed: 7, generations: 10, populationSize: 14 });
    const b = runAutoPM(SEPSIS, { seed: 7, generations: 10, populationSize: 14 });

    expect(b.winner.receiptHash).toBe(a.winner.receiptHash);
    expect(JSON.stringify(b.winner.genome)).toBe(JSON.stringify(a.winner.genome));
    expect(b.winner.objectives).toEqual(a.winner.objectives);
    expect(b.paretoFront.map((c) => c.receiptHash)).toEqual(
      a.paretoFront.map((c) => c.receiptHash),
    );
  });

  it('different seeds can explore different winners but stay valid', () => {
    const a = runAutoPM(SEPSIS, { seed: 1 });
    const b = runAutoPM(SEPSIS, { seed: 2 });
    expect(a.paretoFront.length).toBeGreaterThan(0);
    expect(b.paretoFront.length).toBeGreaterThan(0);
  });

  it('emits a wasm4pm.toml that validates against the real @wasm4pm/config schema', () => {
    const result = runAutoPM(SEPSIS, { seed: 7, generations: 10, populationSize: 14 });
    const tomlText = winnerToToml(result, SEPSIS);

    // Parse the emitted TOML back through the `toml` lib...
    const parsed = toml.parse(tomlText);
    // ...and validate the parsed object against the canonical Zod schema.
    expect(() => configSchema.parse(parsed)).not.toThrow();

    const cfg = configSchema.parse(parsed) as { algorithm: { name: string } };
    expect(cfg.algorithm.name.length).toBeGreaterThan(0);
  });
});
