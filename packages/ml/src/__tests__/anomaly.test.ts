import { describe, it, expect } from 'vitest';
import { detectEnhancedAnomalies } from '../anomaly.js';

describe('detectEnhancedAnomalies', () => {
  it('detects peaks in series with spike', async () => {
    // Normal series with a spike at index 5
    const distances = [0.1, 0.12, 0.11, 0.13, 0.10, 0.85, 0.11, 0.12, 0.10, 0.11];
    const result = await detectEnhancedAnomalies(distances);

    expect(result.originalLength).toBe(10);
    expect(result.smoothedSeries.length).toBe(10);
    expect(result.peakIndices.length).toBeGreaterThanOrEqual(1);
    // The spike at index 5 should be detected as a peak
    expect(result.peakIndices).toContain(5);
  });

  it('detects no peaks in flat series', async () => {
    const distances = [0.1, 0.1, 0.1, 0.1, 0.1, 0.1];
    const result = await detectEnhancedAnomalies(distances);

    expect(result.peakIndices).toHaveLength(0);
  });

  it('handles short series', async () => {
    const result = await detectEnhancedAnomalies([0.5]);
    expect(result.peakIndices).toEqual([]);
    expect(result.smoothedSeries).toEqual([0.5]);
  });

  it('handles empty series', async () => {
    const result = await detectEnhancedAnomalies([]);
    expect(result.peakIndices).toEqual([]);
    expect(result.smoothedSeries).toEqual([]);
  });

  it('detects peaks in multi-spike series', async () => {
    // Gradual rise to each spike (findPeaks needs neighbors lower than peak)
    const distances = [
      0.10, 0.11, 0.12, 0.80, 0.11, 0.10,
      0.10, 0.12, 0.13, 0.90, 0.11, 0.10,
    ];
    const result = await detectEnhancedAnomalies(distances);

    expect(result.peakIndices.length).toBeGreaterThanOrEqual(1);
  });
});
