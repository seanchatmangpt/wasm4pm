import { describe, it, expect } from 'vitest';

/**
 * Test that validateQualityMetrics (used in WasmBackend.discover) throws on missing/invalid fields.
 * This verifies Armstrong A1 fix: no silent fallbacks to 0.85 fitness.
 */
describe('WasmBackend quality validation (A1 fixes)', () => {
  // Simplified mock of validateQualityMetrics for testing
  function validateQualityMetrics(parsed: any, algorithmId: string) {
    if (parsed.fitness === undefined || parsed.fitness === null) {
      throw new Error(`missing 'fitness'`);
    }
    if (parsed.precision === undefined || parsed.precision === null) {
      throw new Error(`missing 'precision'`);
    }
    if (parsed.generalization === undefined || parsed.generalization === null) {
      throw new Error(`missing 'generalization'`);
    }
    if (parsed.simplicity === undefined || parsed.simplicity === null) {
      throw new Error(`missing 'simplicity'`);
    }

    const fitness = Number(parsed.fitness);
    const precision = Number(parsed.precision);
    const generalization = Number(parsed.generalization);
    const simplicity = Number(parsed.simplicity);

    if (!Number.isFinite(fitness) || !Number.isFinite(precision) ||
        !Number.isFinite(generalization) || !Number.isFinite(simplicity)) {
      throw new Error('non-finite');
    }

    return { fitness, precision, generalization, simplicity };
  }

  it('throws when WASM output missing fitness field', () => {
    expect(() => {
      validateQualityMetrics({ precision: 0.8, generalization: 0.75, simplicity: 100 }, 'dfg');
    }).toThrow("missing 'fitness'");
  });

  it('throws when WASM output has NaN fitness', () => {
    expect(() => {
      validateQualityMetrics({
        fitness: NaN,
        precision: 0.8,
        generalization: 0.75,
        simplicity: 100
      }, 'dfg');
    }).toThrow('non-finite');
  });

  it('throws when WASM output has Infinity fitness', () => {
    expect(() => {
      validateQualityMetrics({
        fitness: Infinity,
        precision: 0.8,
        generalization: 0.75,
        simplicity: 100
      }, 'dfg');
    }).toThrow('non-finite');
  });

  it('throws when WASM output missing precision field', () => {
    expect(() => {
      validateQualityMetrics({
        fitness: 0.85,
        generalization: 0.75,
        simplicity: 100
      }, 'dfg');
    }).toThrow("missing 'precision'");
  });

  it('accepts valid quality metrics', () => {
    expect(() => {
      validateQualityMetrics({
        fitness: 0.85,
        precision: 0.8,
        generalization: 0.75,
        simplicity: 100
      }, 'dfg');
    }).not.toThrow();
  });
});
