/**
 * Unit tests for apps/wasm4pm/src/ml-runner.ts
 *
 * Tests ML task validation — verifies that invalid parameters are rejected
 * with descriptive error messages. Chicago TDD: tests observable behavior
 * (what errors are thrown), not internal implementation (which WASM
 * functions are called or in what order).
 */

import { describe, it, expect } from 'vitest';
import { VALID_ML_TASKS, executeMlTask } from '../src/ml-runner.js';

describe('VALID_ML_TASKS', () => {
  it('contains exactly the 6 expected ML tasks as a readonly array', () => {
    expect(Array.isArray(VALID_ML_TASKS)).toBe(true);
    expect(VALID_ML_TASKS).toHaveLength(6);
    for (const task of ['classify', 'cluster', 'forecast', 'anomaly', 'regress', 'pca']) {
      expect(VALID_ML_TASKS).toContain(task);
    }
  });
});

describe('executeMlTask — parameter validation', () => {
  const mockWasm = {
    extract_case_features: () => JSON.stringify({ features: [], caseIds: [] }),
    detect_drift: () => JSON.stringify({ drifts: [] }),
    analyze_statistics: () => JSON.stringify({ trace_count: 10, variant_count: 5, num_activities: 8 }),
  };
  const logHandle = 'test-handle';
  const activityKey = 'concept:name';

  it('classify and cluster reject invalid k (negative, zero, NaN)', async () => {
    for (const task of ['classify', 'cluster'] as const) {
      await expect(executeMlTask(mockWasm, task, logHandle, activityKey, { k: -1 })).rejects.toThrow('positive number');
      await expect(executeMlTask(mockWasm, task, logHandle, activityKey, { k: 0 })).rejects.toThrow('positive number');
    }
    await expect(executeMlTask(mockWasm, 'classify', logHandle, activityKey, { k: 'abc' })).rejects.toThrow('positive number');
    await expect(executeMlTask(mockWasm, 'cluster', logHandle, activityKey, { eps: 'not-a-number' })).rejects.toThrow('positive number');
  });

  it('forecast rejects negative forecastPeriods, returns trend structure on valid input', async () => {
    await expect(executeMlTask(mockWasm, 'forecast', logHandle, activityKey, { forecastPeriods: -5 })).rejects.toThrow('positive number');
    const result = await executeMlTask(mockWasm, 'forecast', logHandle, activityKey, { forecastPeriods: 3 });
    expect(result).toBeDefined();
    expect('trend' in result).toBe(true);
  });

  it('anomaly returns result with peakIndices on empty data', async () => {
    const result = await executeMlTask(mockWasm, 'anomaly', logHandle, activityKey);
    expect(result).toBeDefined();
    expect('peakIndices' in result).toBe(true);
  });

  it('pca rejects non-positive nComponents (zero and negative)', async () => {
    await expect(executeMlTask(mockWasm, 'pca', logHandle, activityKey, { nComponents: 0 })).rejects.toThrow('positive number');
    await expect(executeMlTask(mockWasm, 'pca', logHandle, activityKey, { nComponents: -1 })).rejects.toThrow('positive number');
  });
});
