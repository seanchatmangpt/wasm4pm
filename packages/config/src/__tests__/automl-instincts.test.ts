/**
 * AutoML instinct tests — Rank 1 and Rank 2 oracles for edge-case behaviours
 * added to generateOptimalConfig() and suggestPresetFromBenchmarks().
 *
 * Oracle ranks follow the Van der Aalst / Chicago-TDD hierarchy:
 *   Rank 1 — Mathematical theorem (output is deterministically derivable)
 *   Rank 2 — Domain contract (design-decided invariant)
 */

import { describe, it, expect } from 'vitest';
import {
  suggestPreset,
  suggestPresetFromBenchmarks,
  generateOptimalConfig,
  type BenchmarkData,
} from '../validation/presets.js';

// --- Shared benchmark fixtures ---

const FULL_BENCHMARKS: BenchmarkData = {
  schema_version: '1',
  algorithms: {
    dfg: {
      median_ms_per_100_events: 0.5,
      speed_score: 5,
      quality_score: 30,
      profile: ['browser', 'fog', 'edge', 'iot', 'mobile'],
    },
    simd_streaming_dfg: {
      median_ms_per_100_events: 0.2,
      speed_score: 2,
      quality_score: 28,
      profile: ['browser', 'fog'],
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

// --- 1. Streaming source kind instinct ---
// Rank 2 domain contract: whenever a streaming algorithm is required, the
// returned config MUST reflect source.kind = 'stream' so downstream pipeline
// stages know to open a continuous ingest channel rather than a static file.

describe('AutoML instinct — streaming source kind', () => {
  it('sets source.kind=stream when simd_streaming_dfg is required', () => {
    const config = generateOptimalConfig(
      { requiredAlgorithms: ['simd_streaming_dfg'], logSizeHint: 100 },
      FULL_BENCHMARKS
    );
    expect(config.source.kind).toBe('stream');
  });

  it('does NOT set source.kind=stream when a non-streaming algorithm is required', () => {
    const config = generateOptimalConfig(
      { requiredAlgorithms: ['heuristic_miner'], logSizeHint: 100 },
      FULL_BENCHMARKS
    );
    // heuristic_miner is not a streaming algorithm; source must remain 'file' (preset default)
    expect(config.source.kind).not.toBe('stream');
  });

  it('sets source.kind=stream with simd_streaming_dfg even when no benchmarks provided', () => {
    // Streaming instinct must fire regardless of benchmark availability —
    // it is a structural consequence of the algorithm choice, not a benchmark property.
    const config = generateOptimalConfig({ requiredAlgorithms: ['simd_streaming_dfg'] });
    expect(config.source.kind).toBe('stream');
  });

  it('sets source.kind=stream for streaming_log algorithm requirement', () => {
    // streaming_log is the second registered streaming algorithm.
    const config = generateOptimalConfig({ requiredAlgorithms: ['streaming_log'] });
    expect(config.source.kind).toBe('stream');
  });

  it('_selectedAlgorithm is simd_streaming_dfg when it is the only passing candidate', () => {
    // maxLatencyMs=0.3: simd_streaming_dfg (0.2ms) passes; dfg (0.5ms) fails.
    const config = generateOptimalConfig(
      { requiredAlgorithms: ['simd_streaming_dfg'], maxLatencyMs: 0.3, logSizeHint: 100 },
      FULL_BENCHMARKS
    );
    expect(config._selectedAlgorithm).toBe('simd_streaming_dfg');
    expect(config.source.kind).toBe('stream');
  });
});

// --- 2. Unknown algorithm warning ---
// Rank 2 domain contract: an unknown required algorithm must surface a visible
// _warning field — it must not be silently ignored. This satisfies the
// practitioner's question: "why did my required algorithm not get selected?"

describe('AutoML instinct — unknown required algorithm warning', () => {
  it('emits _warning when requiredAlgorithms contains an unknown algorithm', () => {
    const config = generateOptimalConfig({ requiredAlgorithms: ['fake_algo'] }, FULL_BENCHMARKS);
    expect(config._warning).toBeDefined();
    expect(config._warning).toContain('fake_algo');
  });

  it('_warning mentions "unknown" or equivalent diagnostic term', () => {
    const config = generateOptimalConfig(
      { requiredAlgorithms: ['nonexistent_miner'] },
      FULL_BENCHMARKS
    );
    expect(config._warning?.toLowerCase()).toContain('unknown');
  });

  it('_warning lists ALL unknown algorithms when multiple are unknown', () => {
    const config = generateOptimalConfig(
      { requiredAlgorithms: ['ghost_algo', 'phantom_miner'] },
      FULL_BENCHMARKS
    );
    expect(config._warning).toContain('ghost_algo');
    expect(config._warning).toContain('phantom_miner');
  });

  it('does NOT emit _warning when all required algorithms are known', () => {
    const config = generateOptimalConfig({ requiredAlgorithms: ['dfg'] }, FULL_BENCHMARKS);
    expect(config._warning).toBeUndefined();
  });

  it('does NOT emit _warning when no benchmarks are provided (cannot validate)', () => {
    // Without benchmarks, there is no catalogue to validate against — silence is correct.
    const config = generateOptimalConfig({ requiredAlgorithms: ['fake_algo'] });
    expect(config._warning).toBeUndefined();
  });

  it('still returns a valid algorithm even when required algo is unknown', () => {
    // The system must degrade gracefully: select a working algorithm even when
    // the required one is unrecognised.
    const config = generateOptimalConfig(
      { requiredAlgorithms: ['totally_made_up'] },
      FULL_BENCHMARKS
    );
    expect(typeof config._selectedAlgorithm).toBe('string');
    expect(config._selectedAlgorithm.length).toBeGreaterThan(0);
  });
});

// --- 3. Memory pressure cascade ---
// Rank 2 domain contract: when maxMemoryMb < 1000 eliminates quality profiles,
// the selection reason must explicitly describe the cascade — not silently
// select 'fast'. Practitioners must be able to read why the result changed.

describe('AutoML instinct — memory pressure cascade fallback message', () => {
  it('_selectionReason mentions memory constraint when maxMemoryMb forces fast', () => {
    const config = generateOptimalConfig({ maxMemoryMb: 512 });
    // The cascade message must be present and explain the memory threshold.
    expect(config._selectionReason.toLowerCase()).toMatch(/memory|cascade/);
  });

  it('_selectionReason contains the MB value when cascading', () => {
    const config = generateOptimalConfig({ maxMemoryMb: 256 });
    expect(config._selectionReason).toContain('256');
  });

  it('suggestPreset returns fast for maxMemoryMb=512 (Rank 1 — threshold invariant)', () => {
    // The threshold is strictly < 1000 MB. This is a mathematical boundary.
    expect(suggestPreset({ maxMemoryMb: 512 })).toBe('fast');
    expect(suggestPreset({ maxMemoryMb: 999 })).toBe('fast');
    expect(suggestPreset({ maxMemoryMb: 1000 })).not.toBe('fast');
  });

  it('memory cascade does not apply when quality algorithm is also required', () => {
    // requiredAlgorithms check takes priority over memory in suggestPreset.
    // The selection reason should NOT mention memory cascade in this case.
    const config = generateOptimalConfig({ maxMemoryMb: 100, requiredAlgorithms: ['ilp'] });
    // Importantly, the cascade message should not dominate.
    expect(config._selectionReason.toLowerCase()).not.toContain('cascade');
  });
});

// --- 4. Profile + algorithm mismatch ---
// Rank 2 domain contract: when a required algorithm is absent from the
// requested deployment profile, the system must warn rather than silently
// ignoring the requirement. The practitioner asked for `ilp` on `mobile` —
// they need to know that did not happen.

describe('AutoML instinct — profile/algorithm mismatch', () => {
  it('emits _warning when required algo is absent from the requested profile', () => {
    // ilp is only in ['browser'] — requesting 'mobile' profile is a mismatch.
    const config = generateOptimalConfig(
      { requiredAlgorithms: ['ilp'], deploymentProfile: 'mobile', logSizeHint: 100 },
      FULL_BENCHMARKS
    );
    expect(config._warning).toBeDefined();
    expect(config._warning?.toLowerCase()).toMatch(/profile|mismatch|available/);
  });

  it('_warning names the missing algorithm when profile mismatch occurs', () => {
    const config = generateOptimalConfig(
      { requiredAlgorithms: ['genetic_algorithm'], deploymentProfile: 'edge', logSizeHint: 100 },
      FULL_BENCHMARKS
    );
    expect(config._warning).toContain('genetic_algorithm');
  });

  it('does NOT emit profile mismatch warning when algo is in the profile', () => {
    // dfg is available in every profile including 'mobile'.
    const config = generateOptimalConfig(
      { requiredAlgorithms: ['dfg'], deploymentProfile: 'mobile', logSizeHint: 100 },
      FULL_BENCHMARKS
    );
    // _warning may be undefined OR defined for other reasons — but must NOT
    // mention a profile mismatch for dfg.
    if (config._warning !== undefined) {
      expect(config._warning.toLowerCase()).not.toContain('not available in deployment profile');
    }
  });

  it('suggestPresetFromBenchmarks falls back to quality when ilp required but profile=mobile', () => {
    // ilp not in mobile profile -> required algo absent from candidates -> fallback to suggestPreset
    // suggestPreset({ requiredAlgorithms: ['ilp'] }) -> 'quality'
    const result = suggestPresetFromBenchmarks(FULL_BENCHMARKS, {
      requiredAlgorithms: ['ilp'],
      deploymentProfile: 'mobile',
      logSizeHint: 100,
    });
    expect(result).toBe('quality');
  });
});

// --- 5. Multi-constraint intersection ---
// Rank 1 mathematical theorem: when multiple constraints are combined, the
// system must find the intersection — not satisfy only one constraint while
// ignoring others.

describe('AutoML instinct — multi-constraint intersection', () => {
  it('finds heuristic_miner under maxLatencyMs=100 + maxMemoryMb=1500 + required=heuristic_miner', () => {
    // heuristic_miner: 25 ms/100 events * (100/100) = 25 ms <= 100 ms — passes with logSizeHint=100.
    const config = generateOptimalConfig(
      {
        maxLatencyMs: 100,
        maxMemoryMb: 1500,
        requiredAlgorithms: ['heuristic_miner'],
        logSizeHint: 100,
      },
      FULL_BENCHMARKS
    );
    expect(config._selectedAlgorithm).toBe('heuristic_miner');
  });

  it('falls back gracefully when latency eliminates the required algorithm under combined constraints', () => {
    // heuristic_miner: 25 ms/100 events * (10000/100) = 2500 ms > 1 ms -> eliminated.
    // System must not crash — it must fall back gracefully.
    const config = generateOptimalConfig(
      {
        maxLatencyMs: 1,
        maxMemoryMb: 1500,
        requiredAlgorithms: ['heuristic_miner'],
        logSizeHint: 10000,
      },
      FULL_BENCHMARKS
    );
    // Result may be dfg (only algo passing latency) or a fallback preset default.
    // The invariant is: the result is a valid algorithm name, never undefined.
    expect(typeof config._selectedAlgorithm).toBe('string');
    expect(config._selectedAlgorithm.length).toBeGreaterThan(0);
  });

  it('_selectionReason is always a non-empty string under any constraint combination', () => {
    // Rank 1 invariant: _selectionReason must never be empty regardless of constraints.
    const variants: Parameters<typeof generateOptimalConfig>[0][] = [
      { maxLatencyMs: 1, maxMemoryMb: 512, requiredAlgorithms: ['dfg'], logSizeHint: 100 },
      { maxLatencyMs: 99999, maxMemoryMb: 99999, requiredAlgorithms: ['ilp'], logSizeHint: 1 },
      { maxLatencyMs: 0.001, maxMemoryMb: 100, logSizeHint: 100000 },
    ];
    for (const constraints of variants) {
      const config = generateOptimalConfig(constraints, FULL_BENCHMARKS);
      expect(typeof config._selectionReason).toBe('string');
      expect(config._selectionReason.length).toBeGreaterThan(0);
    }
  });

  it('_selectedAlgorithm always equals algorithm.name (structural invariant)', () => {
    // Rank 1: these two fields must be kept in sync under all constraint combinations.
    const variants: Parameters<typeof generateOptimalConfig>[0][] = [
      { maxLatencyMs: 1, logSizeHint: 100 },
      { maxMemoryMb: 256 },
      { requiredAlgorithms: ['simd_streaming_dfg'], logSizeHint: 100 },
      { requiredAlgorithms: ['fake_algo'] },
      {
        maxLatencyMs: 100,
        maxMemoryMb: 1500,
        requiredAlgorithms: ['heuristic_miner'],
        logSizeHint: 100,
      },
    ];
    for (const constraints of variants) {
      const config = generateOptimalConfig(constraints, FULL_BENCHMARKS);
      expect(config.algorithm.name).toBe(config._selectedAlgorithm);
    }
  });
});

// --- 6. _selectionReason always names the selected algorithm (Rank 1 structural invariant) ---
// Gap A: previously, the no-benchmark memory-cascade path set _selectionReason to
// "default algorithm used" without embedding the algorithm name, violating the
// invariant established in automl.test.ts that _selectionReason must contain the
// algorithm name.  This section pins the invariant across all constraint paths.

describe('AutoML instinct — _selectionReason always names the selected algorithm', () => {
  it('names the algorithm in _selectionReason when no benchmarks and no constraints', () => {
    const config = generateOptimalConfig({});
    expect(config._selectionReason.toLowerCase()).toContain(
      config._selectedAlgorithm.toLowerCase()
    );
  });

  it('names the algorithm in _selectionReason under no-benchmark memory cascade', () => {
    // Gap A: memory cascade path (no benchmarks) previously said "default algorithm used"
    // without naming the algorithm — violated the structural invariant.
    const config = generateOptimalConfig({ maxMemoryMb: 200 });
    expect(config._selectionReason.toLowerCase()).toContain(
      config._selectedAlgorithm.toLowerCase()
    );
    expect(config._selectionReason.toLowerCase()).toMatch(/memory|cascade/);
  });

  it('names the algorithm in _selectionReason under benchmark-based memory cascade', () => {
    // Gap C: the benchmark scoring block previously silently overwrote the cascade
    // message, dropping the memory-constraint diagnostic.  Now both are present.
    const config = generateOptimalConfig({ maxMemoryMb: 200, logSizeHint: 100 }, FULL_BENCHMARKS);
    expect(config._selectionReason.toLowerCase()).toContain(
      config._selectedAlgorithm.toLowerCase()
    );
    expect(config._selectionReason.toLowerCase()).toMatch(/memory/);
  });

  it('names the algorithm in _selectionReason without memory cascade (normal benchmark path)', () => {
    const config = generateOptimalConfig({ logSizeHint: 100 }, FULL_BENCHMARKS);
    expect(config._selectionReason.toLowerCase()).toContain(
      config._selectedAlgorithm.toLowerCase()
    );
  });

  it('_selectionReason contains algorithm name across all constraint variants (Rank 1 sweep)', () => {
    const variants: Parameters<typeof generateOptimalConfig>[0][] = [
      { maxLatencyMs: 1, maxMemoryMb: 512, requiredAlgorithms: ['dfg'], logSizeHint: 100 },
      { maxMemoryMb: 256 },
      { maxMemoryMb: 999 },
      { maxMemoryMb: 1000 },
      { requiredAlgorithms: ['simd_streaming_dfg'], logSizeHint: 100 },
      { requiredAlgorithms: ['fake_algo'] },
      { maxLatencyMs: 0.001, maxMemoryMb: 100, logSizeHint: 100000 },
    ];
    for (const constraints of variants) {
      const config = generateOptimalConfig(constraints, FULL_BENCHMARKS);
      expect(config._selectionReason.toLowerCase()).toContain(
        config._selectedAlgorithm.toLowerCase(),
        `_selectionReason for constraints ${JSON.stringify(constraints)} must name the selected algorithm '${config._selectedAlgorithm}'`
      );
    }
  });
});

// --- 7. suggestPresetFromBenchmarks respects maxMemoryMb (Rank 2 domain contract) ---
// Gap B: suggestPresetFromBenchmarks previously ignored maxMemoryMb entirely —
// it only checked latency and profile, then delegated to suggestPreset only when
// the candidate list was empty.  A memory-constrained call with a populated
// benchmark catalogue would score all algorithms and potentially return 'quality',
// violating the domain contract that maxMemoryMb < 1000 forces 'fast'.

describe('AutoML instinct — suggestPresetFromBenchmarks respects maxMemoryMb', () => {
  it('returns fast when maxMemoryMb=512 even with quality-tier algorithms available', () => {
    // Gap B: previously would score all algorithms and might return 'quality' (ilp wins).
    // Now: memory constraint is a hard gate applied before benchmark scoring.
    const result = suggestPresetFromBenchmarks(FULL_BENCHMARKS, { maxMemoryMb: 512 });
    expect(result).toBe('fast');
  });

  it('returns fast for maxMemoryMb=999 (boundary — strictly < 1000)', () => {
    const result = suggestPresetFromBenchmarks(FULL_BENCHMARKS, { maxMemoryMb: 999 });
    expect(result).toBe('fast');
  });

  it('does NOT force fast for maxMemoryMb=1000 (threshold is exclusive)', () => {
    // Rank 1: threshold is strictly < 1000, so 1000 does not trigger the memory gate.
    const result = suggestPresetFromBenchmarks(FULL_BENCHMARKS, { maxMemoryMb: 1000 });
    expect(result).not.toBe('fast');
  });

  it('quality algorithm requirement overrides memory constraint in suggestPresetFromBenchmarks', () => {
    // Domain contract: requiredAlgorithms wins over maxMemoryMb, even in benchmark path.
    // ilp is a quality algorithm → no memory gate applied → scoring proceeds normally.
    const result = suggestPresetFromBenchmarks(FULL_BENCHMARKS, {
      maxMemoryMb: 100,
      requiredAlgorithms: ['ilp'],
      logSizeHint: 100,
    });
    expect(result).toBe('quality');
  });

  it('suggestPresetFromBenchmarks and suggestPreset agree on maxMemoryMb=512', () => {
    // Rank 1 consistency: both selectors must return the same preset for the same
    // memory constraint when no other constraints are present.
    const fromBench = suggestPresetFromBenchmarks(FULL_BENCHMARKS, { maxMemoryMb: 512 });
    const fromHardcoded = suggestPreset({ maxMemoryMb: 512 });
    expect(fromBench).toBe(fromHardcoded);
  });

  it('generateOptimalConfig memory cascade fires when benchmarks provided', () => {
    // End-to-end: generateOptimalConfig calls suggestPresetFromBenchmarks which
    // now gates on memory, so the cascade is properly reflected in the result.
    const config = generateOptimalConfig({ maxMemoryMb: 300, logSizeHint: 100 }, FULL_BENCHMARKS);
    expect(config.execution.profile).toBe('fast');
    expect(config._selectionReason.toLowerCase()).toMatch(/memory/);
  });
});
