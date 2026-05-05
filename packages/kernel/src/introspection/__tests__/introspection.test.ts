/**
 * introspection/__tests__/introspection.test.ts
 *
 * Test suite for ML/RL introspection APIs.
 * Verifies discovery, metadata, and error diagnostics are accurate and complete.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  getMlRegistry,
  _resetMlRegistry,
  getPerspectiveRegistry,
  _resetPerspectiveRegistry,
  getDiagnostic,
  formatDiagnostic,
  loadPublicDataset,
  getAvailableDatasets,
  getConfigValidators,
} from '../index.js';
import { getAllDatasets } from '../datasets.js';

describe('ML Algorithm Registry', () => {
  beforeEach(() => {
    _resetMlRegistry();
  });

  it('should have exactly 6 ML algorithms', () => {
    const registry = getMlRegistry();
    const all = registry.getAllAlgorithms();
    expect(all).toHaveLength(6);
  });

  it('should return metadata for classify algorithm', () => {
    const registry = getMlRegistry();
    const classify = registry.getAlgorithmMetadata('classify');

    expect(classify).toBeDefined();
    expect(classify?.id).toBe('classify');
    expect(classify?.name).toContain('Classification');
    expect(classify?.speedEstimate).toBe(40);
    expect(classify?.qualityEstimate).toBe(60);
    expect(classify?.useCases.length).toBeGreaterThan(0);
    expect(classify?.parameters.length).toBeGreaterThan(0);
  });

  it('should return undefined for unknown algorithm', () => {
    const registry = getMlRegistry();
    const unknown = registry.getAlgorithmMetadata('unknown' as any);
    expect(unknown).toBeUndefined();
  });

  it('should group algorithms by category', () => {
    const registry = getMlRegistry();
    const classifiers = registry.getByCategory('classification');
    expect(classifiers).toHaveLength(1);
    expect(classifiers[0].id).toBe('classify');

    const forecasters = registry.getByCategory('forecasting');
    expect(forecasters).toHaveLength(1);
    expect(forecasters[0].id).toBe('forecast');
  });

  it('should suggest algorithms based on domain', () => {
    const registry = getMlRegistry();

    const suggested = registry.getSuggestedAlgorithm('outcome_prediction');
    expect(suggested?.id).toBe('classify');

    const timeEstimate = registry.getSuggestedAlgorithm('remaining_time');
    expect(timeEstimate?.id).toBe('regress');

    const variantDiscovery = registry.getSuggestedAlgorithm('variant_discovery');
    expect(variantDiscovery?.id).toBe('cluster');
  });

  it('should suggest algorithms respecting speed constraints', () => {
    const registry = getMlRegistry();

    // dfg is very fast (speedEstimate 5)
    const fastAlgo = registry.getSuggestedAlgorithm('outcome_prediction', {
      speedBudgetMs: 50,
    });
    // Should get classify which is 40ms estimate
    expect(fastAlgo).toBeDefined();
  });

  it('should provide example configurations', () => {
    const registry = getMlRegistry();

    const config = registry.getExampleConfig('classify');
    expect(config).toBeDefined();
    expect(config?.method).toBe('decision_tree');
    expect(config?.testSplit).toBe(0.2);
  });

  it('should list all 6 algorithms', () => {
    const registry = getMlRegistry();
    const all = registry.getAllAlgorithms();

    const ids = all.map((a) => a.id);
    expect(ids).toContain('classify');
    expect(ids).toContain('cluster');
    expect(ids).toContain('forecast');
    expect(ids).toContain('anomaly');
    expect(ids).toContain('regress');
    expect(ids).toContain('pca');
  });
});

describe('Prediction Perspective Registry', () => {
  beforeEach(() => {
    _resetPerspectiveRegistry();
  });

  it('should have exactly 6 prediction perspectives', () => {
    const registry = getPerspectiveRegistry();
    const all = registry.getAllPerspectives();
    expect(all).toHaveLength(6);
  });

  it('should return metadata for next_activity perspective', () => {
    const registry = getPerspectiveRegistry();
    const nextActivity = registry.getPerspectiveMetadata('next_activity');

    expect(nextActivity).toBeDefined();
    expect(nextActivity?.id).toBe('next_activity');
    expect(nextActivity?.name).toContain('Next Activity');
    expect(nextActivity?.question).toContain('next activity');
    expect(nextActivity?.useCases.length).toBeGreaterThan(0);
    expect(nextActivity?.parameters.length).toBeGreaterThan(0);
  });

  it('should have all 6 perspectives registered', () => {
    const registry = getPerspectiveRegistry();
    const perspectives = registry.getAllPerspectives();

    const ids = perspectives.map((p) => p.id);
    expect(ids).toContain('next_activity');
    expect(ids).toContain('remaining_time');
    expect(ids).toContain('outcome');
    expect(ids).toContain('drift');
    expect(ids).toContain('features');
    expect(ids).toContain('resource');
  });

  it('should map use cases to perspectives', () => {
    const registry = getPerspectiveRegistry();

    const routing = registry.getPerspectivesForUseCase('resource_routing');
    expect(routing).toContain('next_activity');
    expect(routing).toContain('resource');

    const riskMitigation = registry.getPerspectivesForUseCase('risk_mitigation');
    expect(riskMitigation).toContain('outcome');
    expect(riskMitigation).toContain('drift');
  });

  it('should provide example configurations for each perspective', () => {
    const registry = getPerspectiveRegistry();

    const config = registry.getExampleConfig('next_activity');
    expect(config?.perspective).toBe('next_activity');
    expect(config?.ngramOrder).toBe(2);
    expect(config?.topK).toBe(3);
  });
});

describe('Diagnostics Engine', () => {
  it('should generate diagnostic for invalid feature matrix', () => {
    const diag = getDiagnostic('invalidFeatureMatrix', {
      actualType: 'mixed array',
      expectedType: 'number[][]',
    });

    expect(diag.message).toContain('Invalid feature matrix');
    expect(diag.rootCauses.length).toBeGreaterThan(0);
    expect(diag.suggestions.length).toBeGreaterThan(0);
  });

  it('should generate diagnostic for empty feature matrix', () => {
    const diag = getDiagnostic('emptyFeatureMatrix');

    expect(diag.message).toContain('empty');
    expect(diag.suggestions.length).toBeGreaterThan(0);
  });

  it('should generate diagnostic for NaN predictions', () => {
    const diag = getDiagnostic('nanInPredictions');

    expect(diag.message).toContain('NaN');
    expect(diag.rootCauses.length).toBeGreaterThan(0);
    expect(diag.suggestions.some((s) => s.includes('Validate'))).toBe(true);
  });

  it('should generate diagnostic for parameter out of bounds', () => {
    const diag = getDiagnostic('parameterOutOfBounds', {
      paramName: 'k',
      value: 1000,
      min: 2,
      max: 20,
      algorithmId: 'cluster',
    });

    expect(diag.message).toContain('out of bounds');
    expect(diag.message).toContain('k');
    expect(diag.suggestions.length).toBeGreaterThan(0);
  });

  it('should format diagnostic for console output', () => {
    const diag = getDiagnostic('emptyFeatureMatrix');
    const formatted = formatDiagnostic(diag);

    expect(formatted).toContain('❌');
    expect(formatted).toContain('Root causes');
    expect(formatted).toContain('Suggestions');
  });
});

describe('Sample Datasets', () => {
  it('should list available datasets', () => {
    const available = getAvailableDatasets();
    expect(available).toContain('simple');
    expect(available).toContain('bpi2020');
    expect(available).toContain('synthetic');
    expect(available).toHaveLength(3);
  });

  it('should load simple dataset', () => {
    const dataset = loadPublicDataset('simple');

    expect(dataset.id).toBe('simple');
    expect(dataset.traceCount).toBe(10);
    expect(dataset.log.traces).toHaveLength(10);
    expect(dataset.activityCount).toBe(4);
  });

  it('should load bpi2020 dataset', () => {
    const dataset = loadPublicDataset('bpi2020');

    expect(dataset.id).toBe('bpi2020');
    expect(dataset.traceCount).toBe(50);
    expect(dataset.log.traces).toHaveLength(50);
    expect(dataset.activityCount).toBeGreaterThanOrEqual(4);
  });

  it('should load synthetic dataset', () => {
    const dataset = loadPublicDataset('synthetic');

    expect(dataset.id).toBe('synthetic');
    expect(dataset.traceCount).toBe(100);
    expect(dataset.log.traces).toHaveLength(100);
  });

  it('should throw on unknown dataset', () => {
    expect(() => loadPublicDataset('unknown' as any)).toThrow();
  });

  it('should provide all datasets via getAllDatasets', () => {
    const all = getAllDatasets();
    expect(all).toHaveLength(3);

    const ids = all.map((d) => d.id);
    expect(ids).toContain('simple');
    expect(ids).toContain('bpi2020');
    expect(ids).toContain('synthetic');
  });

  it('simple dataset should have valid event structure', () => {
    const { log } = loadPublicDataset('simple');

    log.traces.forEach((trace) => {
      expect(trace.caseId).toBeTruthy();
      expect(trace.events.length).toBeGreaterThan(0);

      trace.events.forEach((event) => {
        expect(event.activity).toBeTruthy();
        expect(event.timestamp).toBeGreaterThan(0);
      });
    });
  });

  it('datasets should have suggested perspectives', () => {
    const all = getAllDatasets();

    all.forEach((ds: any) => {
      expect(ds.suggestedPerspectives.length).toBeGreaterThan(0);
      expect(ds.useCases.length).toBeGreaterThan(0);
    });
  });
});

describe('Validators', () => {
  it('should validate feature matrix successfully', () => {
    const validators = getConfigValidators();

    const result = validators.validateFeatureMatrix({
      data: [[1, 2], [3, 4]],
      featureNames: ['f1', 'f2'],
      caseIds: ['c1', 'c2'],
    });

    expect(result.success).toBe(true);
  });

  it('should reject empty feature matrix', () => {
    const validators = getConfigValidators();

    const result = validators.validateFeatureMatrix({
      data: [],
      featureNames: [],
      caseIds: [],
    });

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
  });

  it('should reject inconsistent column counts', () => {
    const validators = getConfigValidators();

    const result = validators.validateFeatureMatrix({
      data: [[1, 2], [3, 4, 5]], // second row has 3 columns
      featureNames: ['f1', 'f2'],
      caseIds: ['c1', 'c2'],
    });

    expect(result.success).toBe(false);
    expect(result.errors?.[0].message).toContain('Inconsistent');
  });

  it('should reject NaN values', () => {
    const validators = getConfigValidators();

    const result = validators.validateFeatureMatrix({
      data: [[1, NaN]],
      featureNames: ['f1', 'f2'],
      caseIds: ['c1'],
    });

    expect(result.success).toBe(false);
  });

  it('should validate prediction task configuration', () => {
    const validators = getConfigValidators();

    const result = validators.validatePredictionTask({
      perspective: 'next_activity',
      ngramOrder: 2,
      topK: 3,
    });

    expect(result.success).toBe(true);
  });

  it('should reject invalid perspective', () => {
    const validators = getConfigValidators();

    const result = validators.validatePerspective('invalid_perspective');
    expect(result.success).toBe(false);
  });

  it('should validate perspective', () => {
    const validators = getConfigValidators();

    const result = validators.validatePerspective('next_activity');
    expect(result.success).toBe(true);
  });

  it('should validate numeric ranges', () => {
    const validators = getConfigValidators();

    const valid = validators.validateRange('k', 5, { min: 1, max: 10 });
    expect(valid.success).toBe(true);

    const tooLow = validators.validateRange('k', 0, { min: 1, max: 10 });
    expect(tooLow.success).toBe(false);

    const tooHigh = validators.validateRange('k', 20, { min: 1, max: 10 });
    expect(tooHigh.success).toBe(false);
  });
});
