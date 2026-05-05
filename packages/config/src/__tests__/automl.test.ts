import { describe, it, expect } from 'vitest';
import {
  suggestPreset,
  suggestPresetFromBenchmarks,
  generateOptimalConfig,
  type BenchmarkData,
} from '../validation/presets.js';

// Inline benchmark fixture — does not depend on the parallel agent's JSON file
const BENCHMARKS: BenchmarkData = {
  schema_version: '1',
  algorithms: {
    dfg: {
      median_ms_per_100_events: 0.5,
      speed_score: 5,
      quality_score: 30,
      profile: ['browser', 'fog', 'edge', 'iot', 'mobile'],
    },
    heuristic_miner: {
      median_ms_per_100_events: 25,
      speed_score: 25,
      quality_score: 50,
      profile: ['browser', 'fog'],
    },
    inductive_miner: {
      median_ms_per_100_events: 30,
      speed_score: 30,
      quality_score: 55,
      profile: ['browser', 'fog'],
    },
    genetic_algorithm: {
      median_ms_per_100_events: 400,
      speed_score: 75,
      quality_score: 80,
      profile: ['browser'],
    },
    ilp: {
      median_ms_per_100_events: 200,
      speed_score: 80,
      quality_score: 90,
      profile: ['browser'],
    },
  },
};

describe('suggestPresetFromBenchmarks', () => {
  it('returns fast when maxLatencyMs=1 (only dfg passes)', () => {
    const result = suggestPresetFromBenchmarks(BENCHMARKS, {
      maxLatencyMs: 1,
      logSizeHint: 100,
    });
    expect(result).toBe('fast');
  });

  it('returns quality when requiredAlgorithms includes genetic_algorithm', () => {
    const result = suggestPresetFromBenchmarks(BENCHMARKS, {
      requiredAlgorithms: ['genetic_algorithm'],
      logSizeHint: 100,
    });
    expect(result).toBe('quality');
  });

  it('falls back to suggestPreset when benchmarks has empty algorithms', () => {
    const empty: BenchmarkData = { schema_version: '1', algorithms: {} };
    // Low memory → fast via hardcoded fallback
    const result = suggestPresetFromBenchmarks(empty, { maxMemoryMb: 500 });
    expect(result).toBe('fast');
  });
});

describe('generateOptimalConfig', () => {
  it('selects dfg for tight latency (fast constraints)', () => {
    const config = generateOptimalConfig({ maxLatencyMs: 1, logSizeHint: 100 }, BENCHMARKS);
    expect(config._selectedAlgorithm).toBe('dfg');
    expect(config.algorithm.name).toBe('dfg');
  });

  it('selects genetic_algorithm when it is required', () => {
    const config = generateOptimalConfig(
      { requiredAlgorithms: ['genetic_algorithm'], logSizeHint: 100 },
      BENCHMARKS
    );
    expect(config._selectedAlgorithm).toBe('genetic_algorithm');
    expect(config.algorithm.name).toBe('genetic_algorithm');
  });

  it('attaches _selectedAlgorithm and _selectionReason fields', () => {
    const config = generateOptimalConfig({ logSizeHint: 100 }, BENCHMARKS);
    expect(typeof config._selectedAlgorithm).toBe('string');
    expect(config._selectedAlgorithm.length).toBeGreaterThan(0);
    expect(typeof config._selectionReason).toBe('string');
    expect(config._selectionReason.length).toBeGreaterThan(0);
  });
});

describe('integration: suggestPreset still works without benchmarks', () => {
  it('returns fast for low memory constraint', () => {
    expect(suggestPreset({ maxMemoryMb: 512 })).toBe('fast');
  });

  it('returns quality when genetic_algorithm is required', () => {
    expect(suggestPreset({ requiredAlgorithms: ['genetic_algorithm'] })).toBe('quality');
  });

  it('returns balanced as the default with no constraints', () => {
    expect(suggestPreset({})).toBe('balanced');
  });
});
