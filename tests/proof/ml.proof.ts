import { describe, it, expect } from 'vitest';
import { getRegistry } from 'wasm4pm';
import { assessFeatureQuality } from '@wasm4pm/ml';

/**
 * PROOF: registry surface + feature-quality empty-edge-case smoke.
 *
 * INVARIANT — the algorithm registry must expose at least the documented
 * browser-profile algorithm set, each algorithm metadata must carry numeric
 * speed/quality tiers, and assessFeatureQuality must degrade gracefully on
 * empty input (no throw, well-formed report).
 *
 * Grounded in real exports:
 *  - wasm4pm (kernel pkg) → getRegistry() returns AlgorithmRegistry
 *    (packages/kernel/src/registry.ts). Browser profile registers 38+ algorithms.
 *  - AlgorithmMetadata.speedTier / .qualityTier are numeric (registry.ts:114-117)
 *  - @wasm4pm/ml → assessFeatureQuality(number[][]) → QualityReport
 *    (feature-quality.ts:67). Empty input returns { qualityScore: 0, warnings:[...] }.
 *
 * Anti-FM-5: assert numeric typeof + a structural count floor (≥38) + the
 * documented empty-edge-case shape — NOT values derived from the registry impl.
 */
describe('ml.proof — registry + feature-quality smoke', () => {
  it('browser deployment profile exposes ≥38 algorithms', () => {
    const registry = getRegistry();
    const browserAlgos = registry.getForDeploymentProfile('browser');
    expect(Array.isArray(browserAlgos)).toBe(true);
    expect(browserAlgos.length).toBeGreaterThanOrEqual(38);
  });

  it('dfg algorithm metadata carries numeric speed and quality tiers', () => {
    const registry = getRegistry();
    const dfg = registry.get('dfg');
    expect(dfg).toBeDefined();
    expect(dfg).not.toBeNull();
    if (!dfg) return;
    expect(typeof dfg.speedTier).toBe('number');
    expect(typeof dfg.qualityTier).toBe('number');
    expect(Number.isFinite(dfg.speedTier)).toBe(true);
    expect(Number.isFinite(dfg.qualityTier)).toBe(true);
  });

  it('assessFeatureQuality([]) returns the documented empty-input report shape', () => {
    const report = assessFeatureQuality([]);
    expect(report).toBeTypeOf('object');
    // feature-quality.ts:73-82 — empty matrix yields score 0 with a warning.
    expect(report.qualityScore).toBe(0);
    expect(Array.isArray(report.warnings)).toBe(true);
    expect(report.warnings.length).toBeGreaterThan(0);
    expect(Array.isArray(report.recommendations)).toBe(true);
    expect(report.zeroVarianceColumns).toBe(0);
    expect(Array.isArray(report.correlatedPairs)).toBe(true);
  });
});
