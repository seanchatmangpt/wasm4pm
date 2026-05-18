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
  diagnoseError,
  loadPublicDataset,
  getAvailableDatasets,
  getConfigValidators,
  getAlgorithmMetadata,
  listAlgorithmsByProfile,
  validateAlgorithmInProfile,
  getProfileCapabilities,
  validateWasmReadiness,
} from '../index.js';
import { getAllDatasets } from '../datasets.js';

describe('ML Algorithm Registry', () => {
  beforeEach(() => _resetMlRegistry());

  it('returns full metadata for a known algorithm', () => {
    const meta = getMlRegistry().getAlgorithmMetadata('classify');
    expect(meta?.id).toBe('classify');
    expect(meta?.speedEstimate).toBe(40);
    expect(meta?.useCases.length).toBeGreaterThan(0);
  });

  it('returns undefined for unknown and groups by category', () => {
    const reg = getMlRegistry();
    expect(reg.getAlgorithmMetadata('unknown' as any)).toBeUndefined();
    expect(reg.getByCategory('classification')).toHaveLength(1);
  });

  it('suggests correct algorithm per domain use case', () => {
    const reg = getMlRegistry();
    expect(reg.getSuggestedAlgorithm('outcome_prediction')?.id).toBe('classify');
    expect(reg.getSuggestedAlgorithm('remaining_time')?.id).toBe('regress');
    expect(reg.getSuggestedAlgorithm('variant_discovery')?.id).toBe('cluster');
  });
});

describe('Prediction Perspective Registry', () => {
  beforeEach(() => _resetPerspectiveRegistry());

  it('has all 6 perspectives registered with correct ids', () => {
    const ids = getPerspectiveRegistry().getAllPerspectives().map((p) => p.id);
    expect(ids).toEqual(
      expect.arrayContaining(['next_activity', 'remaining_time', 'outcome', 'drift', 'features', 'resource'])
    );
    expect(ids).toHaveLength(6);
  });

  it('returns full metadata for next_activity', () => {
    const meta = getPerspectiveRegistry().getPerspectiveMetadata('next_activity');
    expect(meta?.question).toContain('next activity');
    expect(meta?.parameters.length).toBeGreaterThan(0);
  });

  it('maps use cases to the right perspectives', () => {
    const reg = getPerspectiveRegistry();
    expect(reg.getPerspectivesForUseCase('resource_routing')).toContain('next_activity');
    expect(reg.getPerspectivesForUseCase('risk_mitigation')).toContain('outcome');
  });
});

describe('Diagnostics Engine', () => {
  it('generates actionable diagnostic with rootCauses and suggestions', () => {
    const diag = getDiagnostic('invalidFeatureMatrix', { actualType: 'mixed', expectedType: 'number[][]' });
    expect(diag.rootCauses.length).toBeGreaterThan(0);
    expect(diag.suggestions.length).toBeGreaterThan(0);
  });

  it('generates parameterized diagnostic for out-of-bounds values', () => {
    const diag = getDiagnostic('parameterOutOfBounds', { paramName: 'k', value: 1000, min: 2, max: 20, algorithmId: 'cluster' });
    expect(diag.message).toContain('k');
    expect(diag.suggestions.length).toBeGreaterThan(0);
  });

  it('formats diagnostic with required console sections', () => {
    const formatted = formatDiagnostic(getDiagnostic('emptyFeatureMatrix'));
    expect(formatted).toContain('❌');
    expect(formatted).toContain('Root causes');
    expect(formatted).toContain('Suggestions');
  });
});

describe('Sample Datasets', () => {
  it('lists 3 datasets and loads simple correctly', () => {
    expect(getAvailableDatasets()).toEqual(expect.arrayContaining(['simple', 'bpi2020', 'synthetic']));
    const ds = loadPublicDataset('simple');
    expect(ds.traceCount).toBe(10);
    expect(ds.log.traces[0].events.length).toBeGreaterThan(0);
  });

  it('throws on unknown dataset id', () => {
    expect(() => loadPublicDataset('unknown' as any)).toThrow();
  });

  it('all datasets have suggested perspectives and use cases', () => {
    getAllDatasets().forEach((ds: any) => {
      expect(ds.suggestedPerspectives.length).toBeGreaterThan(0);
      expect(ds.useCases.length).toBeGreaterThan(0);
    });
  });
});

describe('Validators', () => {
  it('accepts a valid feature matrix', () => {
    const result = getConfigValidators().validateFeatureMatrix({
      data: [[1, 2], [3, 4]],
      featureNames: ['f1', 'f2'],
      caseIds: ['c1', 'c2'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects inconsistent column counts and NaN values', () => {
    const v = getConfigValidators();
    expect(v.validateFeatureMatrix({ data: [[1, 2], [3, 4, 5]], featureNames: ['f1', 'f2'], caseIds: ['c1', 'c2'] }).success).toBe(false);
    expect(v.validateFeatureMatrix({ data: [[1, NaN]], featureNames: ['f1', 'f2'], caseIds: ['c1'] }).success).toBe(false);
  });

  it('validates ranges and rejects invalid perspectives', () => {
    const v = getConfigValidators();
    expect(v.validateRange('k', 5, { min: 1, max: 10 }).success).toBe(true);
    expect(v.validateRange('k', 0, { min: 1, max: 10 }).success).toBe(false);
    expect(v.validatePerspective('next_activity').success).toBe(true);
    expect(v.validatePerspective('invalid').success).toBe(false);
  });
});

describe('getAlgorithmMetadata', () => {
  it('returns full metadata for dfg including speed, quality, profiles', () => {
    const meta = getAlgorithmMetadata('dfg');
    expect(meta?.speedTier).toBe(5);
    expect(meta?.qualityTier).toBe(30);
    expect(meta?.deploymentProfiles.length).toBeGreaterThan(0);
  });

  it('returns undefined for unknown algorithm', () => {
    expect(getAlgorithmMetadata('nonexistent_algo_xyz')).toBeUndefined();
  });

  it('returns metadata for heuristic_miner with dfg output type', () => {
    expect(getAlgorithmMetadata('heuristic_miner')?.outputType).toBe('dfg');
  });
});

describe('listAlgorithmsByProfile', () => {
  it('browser includes dfg and returns a non-empty string array', () => {
    const ids = listAlgorithmsByProfile('browser');
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).toContain('dfg');
    ids.forEach((id) => expect(typeof id).toBe('string'));
  });

  it('iot also contains dfg', () => {
    expect(listAlgorithmsByProfile('iot')).toContain('dfg');
  });

  it('browser has at least as many algorithms as iot', () => {
    expect(listAlgorithmsByProfile('browser').length).toBeGreaterThanOrEqual(listAlgorithmsByProfile('iot').length);
  });
});

describe('validateAlgorithmInProfile', () => {
  it('returns valid for dfg in browser with no reasons', () => {
    const result = validateAlgorithmInProfile('dfg', 'browser');
    expect(result.valid).toBe(true);
    expect(result.reasons).toBeUndefined();
  });

  it('returns invalid with alternatives for unknown algorithm', () => {
    const result = validateAlgorithmInProfile('nonexistent_algo', 'browser');
    expect(result.valid).toBe(false);
    expect(result.reasons?.length).toBeGreaterThan(0);
    expect(result.alternatives?.length).toBeGreaterThan(0);
  });

  it('always sets algorithm and profile fields regardless of validity', () => {
    const valid = validateAlgorithmInProfile('dfg', 'browser');
    const invalid = validateAlgorithmInProfile('nonexistent_algo', 'iot');
    expect(valid.algorithm).toBe('dfg');
    expect(invalid.algorithm).toBe('nonexistent_algo');
    expect(invalid.profile).toBe('iot');
  });
});

describe('getProfileCapabilities', () => {
  it('browser returns ~2.7MB with dfg available', () => {
    const caps = getProfileCapabilities('browser');
    expect(caps.estimatedBinarySize).toBe('~2.7MB');
    expect(caps.availableAlgorithms).toContain('dfg');
    expect(caps.supportedOutputTypes.length).toBeGreaterThan(0);
  });

  it('iot returns ~1.0MB with fewer algorithms than browser', () => {
    const iot = getProfileCapabilities('iot');
    const browser = getProfileCapabilities('browser');
    expect(iot.estimatedBinarySize).toBe('~1.0MB');
    expect(browser.count).toBeGreaterThanOrEqual(iot.count);
  });

  it('count equals availableAlgorithms.length for all profiles', () => {
    for (const p of ['browser', 'edge', 'fog', 'iot'] as const) {
      const caps = getProfileCapabilities(p);
      expect(caps.availableAlgorithms.length).toBe(caps.count);
    }
  });
});

describe('validateWasmReadiness', () => {
  it('returns a well-formed result with version and algorithms', async () => {
    const result = await validateWasmReadiness();
    expect(typeof result.ready).toBe('boolean');
    expect(result.version.length).toBeGreaterThan(0);
    expect(result.availableAlgorithms).toContain('dfg');
  });

  it('returns no warnings when registry is populated', async () => {
    const result = await validateWasmReadiness();
    if (result.ready) expect(result.warnings).toHaveLength(0);
  });

  it('warnings is always an array', async () => {
    expect(Array.isArray((await validateWasmReadiness()).warnings)).toBe(true);
  });
});

describe('diagnoseError', () => {
  it('matches known error patterns with specific rootCauses and suggestions', () => {
    const wasmDiag = diagnoseError(new Error('Failed to wasm init module'));
    expect(wasmDiag.rootCauses.length).toBeGreaterThanOrEqual(2);

    const algoDiag = diagnoseError(new Error('Algorithm not found: xyz'));
    expect(algoDiag.suggestions.join(' ').toLowerCase()).toMatch(/profile|algorithm|available/);
  });

  it('returns fallback diagnostic for unrecognised errors', () => {
    const diag = diagnoseError(new Error('some completely unexpected zzz error'));
    expect(diag.rootCauses.length).toBeGreaterThanOrEqual(1);
    expect(diag.suggestions.length).toBeGreaterThanOrEqual(1);
    expect(diag.message).toBeTruthy();
  });

  it('handles non-Error inputs without throwing', () => {
    const diag = diagnoseError('plain string error');
    expect(diag.suggestions.length).toBeGreaterThanOrEqual(1);
  });
});
