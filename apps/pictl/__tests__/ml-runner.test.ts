/**
 * Unit tests for apps/pictl/src/ml-runner.ts
 *
 * Tests ML task validation — verifies that invalid parameters are rejected
 * with descriptive error messages. Chicago TDD: tests observable behavior
 * (what errors are thrown), not internal implementation (which WASM
 * functions are called or in what order).
 */

import { describe, it, expect } from 'vitest';
import { VALID_ML_TASKS, executeMlTask } from '../src/ml-runner.js';

describe('VALID_ML_TASKS', () => {
  it('contains exactly 6 tasks', () => {
    expect(VALID_ML_TASKS).toHaveLength(6);
  });

  it('includes all expected ML tasks', () => {
    expect(VALID_ML_TASKS).toContain('classify');
    expect(VALID_ML_TASKS).toContain('cluster');
    expect(VALID_ML_TASKS).toContain('forecast');
    expect(VALID_ML_TASKS).toContain('anomaly');
    expect(VALID_ML_TASKS).toContain('regress');
    expect(VALID_ML_TASKS).toContain('pca');
  });

  it('is a const assertion (readonly at type level)', () => {
    expect(Array.isArray(VALID_ML_TASKS)).toBe(true);
    expect(VALID_ML_TASKS.length).toBe(6);
  });
});

describe('executeMlTask — parameter validation', () => {
  const mockWasm = {
    extract_case_features: () => JSON.stringify({ features: [], caseIds: [] }),
    detect_drift: () => JSON.stringify({ drifts: [] }),
  };
  const logHandle = 'test-handle';
  const activityKey = 'concept:name';

  // ── classify ────────────────────────────────────────────────────────────

  it('classify rejects negative k', async () => {
    await expect(
      executeMlTask(mockWasm, 'classify', logHandle, activityKey, { k: -1 })
    ).rejects.toThrow('positive number');
  });

  it('classify rejects NaN k', async () => {
    await expect(
      executeMlTask(mockWasm, 'classify', logHandle, activityKey, { k: 'abc' })
    ).rejects.toThrow('positive number');
  });

  it('classify rejects zero k', async () => {
    await expect(
      executeMlTask(mockWasm, 'classify', logHandle, activityKey, { k: 0 })
    ).rejects.toThrow('positive number');
  });

  // ── cluster ─────────────────────────────────────────────────────────────

  it('cluster rejects negative k', async () => {
    await expect(
      executeMlTask(mockWasm, 'cluster', logHandle, activityKey, { k: -1 })
    ).rejects.toThrow('positive number');
  });

  it('cluster rejects NaN eps', async () => {
    await expect(
      executeMlTask(mockWasm, 'cluster', logHandle, activityKey, { eps: 'not-a-number' })
    ).rejects.toThrow('positive number');
  });

  // ── forecast ────────────────────────────────────────────────────────────

  it('forecast rejects negative forecastPeriods', async () => {
    await expect(
      executeMlTask(mockWasm, 'forecast', logHandle, activityKey, { forecastPeriods: -5 })
    ).rejects.toThrow('positive number');
  });

  it('forecast returns trend structure with empty data', async () => {
    const result = await executeMlTask(mockWasm, 'forecast', logHandle, activityKey, { forecastPeriods: 3 });
    expect(result).toBeDefined();
    expect('trend' in result).toBe(true);
  });

  // ── anomaly ────────────────────────────────────────────────────────────

  it('anomaly returns peakIndices with empty data', async () => {
    const result = await executeMlTask(mockWasm, 'anomaly', logHandle, activityKey);
    expect(result).toBeDefined();
    expect('peakIndices' in result).toBe(true);
  });

  // ── pca ────────────────────────────────────────────────────────────────

  it('pca rejects zero nComponents', async () => {
    await expect(
      executeMlTask(mockWasm, 'pca', logHandle, activityKey, { nComponents: 0 })
    ).rejects.toThrow('positive number');
  });

  it('pca rejects negative nComponents', async () => {
    await expect(
      executeMlTask(mockWasm, 'pca', logHandle, activityKey, { nComponents: -1 })
    ).rejects.toThrow('positive number');
  });
});
