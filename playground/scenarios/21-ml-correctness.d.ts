/**
 * Correctness validation: ML tasks produce meaningful results
 *
 * This scenario validates that ML algorithms actually work — not just that they
 * exit 0, but that they produce sensible outputs for the process mining domain.
 *
 * Key assertions:
 *   - classify: predictions contain at least one class
 *   - cluster: assignments are stable (deterministic clustering)
 *   - forecast: produces values in reasonable range
 *   - anomaly: peak indices are valid array indices (< signal length)
 *   - regress: predictions track actual values reasonably well
 *   - pca: produces reduced dimensions
 */
export {};
//# sourceMappingURL=21-ml-correctness.d.ts.map