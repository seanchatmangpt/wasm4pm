/**
 * AutoInstincts gap-closure tests — G1 through G6.
 *
 * These tests target specific edge cases and new capabilities that were absent
 * from the existing automl.test.ts and automl-instincts.test.ts suites.
 *
 * Oracle ranks follow the Van der Aalst / Chicago-TDD hierarchy:
 *   Rank 1 — Mathematical theorem (deterministically derivable)
 *   Rank 2 — Domain contract (design-decided invariant)
 *   Rank 3 — Metamorphic relation (input perturbation → output relation)
 */

import { describe, it, expect } from 'vitest';
import {
  suggestPreset,
  suggestPresetFromBenchmarks,
  generateOptimalConfig,
  type BenchmarkData,
  type LogCharacteristics,
} from '../validation/presets.js';

// ---------------------------------------------------------------------------
// Shared benchmark fixture used across multiple describe blocks
// ---------------------------------------------------------------------------
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
    ilp: {
      median_ms_per_100_events: 200,
      speed_score: 80,
      quality_score: 90,
      profile: ['browser'],
    },
    genetic_algorithm: {
      median_ms_per_100_events: 400,
      speed_score: 75,
      quality_score: 80,
      profile: ['browser'],
    },
    simd_streaming_dfg: {
      median_ms_per_100_events: 0.2,
      speed_score: 2,
      quality_score: 28,
      profile: ['browser', 'fog'],
    },
  },
};

// ---------------------------------------------------------------------------
// G1 — Edge case: logSizeHint = 0 (degenerate log)
//
// Rank 2 domain contract: a zero logSizeHint must not silently pass ALL
// algorithms through the latency filter (0ms estimated for everything).
// The guard must detect this, add a _warning, and use a safe default (100).
// ---------------------------------------------------------------------------
describe('G1 — degenerate log: logSizeHint = 0', () => {
  it('does NOT crash when logSizeHint=0', () => {
    expect(() => generateOptimalConfig({ logSizeHint: 0 }, BENCHMARKS)).not.toThrow();
  });

  it('emits _warning when logSizeHint=0 (degenerate guard fires)', () => {
    const config = generateOptimalConfig({ logSizeHint: 0 }, BENCHMARKS);
    expect(config._warning).toBeDefined();
    expect(config._warning!.toLowerCase()).toContain('degenerate');
  });

  it('_warning mentions logSizeHint=0 when degenerate guard fires', () => {
    const config = generateOptimalConfig({ logSizeHint: 0 }, BENCHMARKS);
    expect(config._warning).toContain('logSizeHint=0');
  });

  it('latency filter uses 100-event baseline when logSizeHint=0 (not 0ms for everything)', () => {
    // With logSizeHint=0, naive math: 200 ms/100 events * (0/100) = 0 ms — ilp would pass.
    // The degenerate guard replaces 0 with the 100-event baseline, so:
    //   ilp: 200 * (100/100) = 200 ms > maxLatencyMs=1 → excluded
    //   dfg: 0.5 * 1 = 0.5 ms <= 1 → included
    const config = generateOptimalConfig({ logSizeHint: 0, maxLatencyMs: 1 }, BENCHMARKS);
    // dfg should win since it's the only algorithm that passes the 100-event baseline latency
    expect(config._selectedAlgorithm).toBe('dfg');
  });

  it('_selectionReason is always a non-empty string with logSizeHint=0', () => {
    const config = generateOptimalConfig({ logSizeHint: 0 }, BENCHMARKS);
    expect(typeof config._selectionReason).toBe('string');
    expect(config._selectionReason.length).toBeGreaterThan(0);
  });

  it('_selectedAlgorithm equals algorithm.name even with logSizeHint=0 (structural invariant)', () => {
    const config = generateOptimalConfig({ logSizeHint: 0 }, BENCHMARKS);
    expect(config._selectedAlgorithm).toBe(config.algorithm.name);
  });

  it('_instinctSource is auto when logSizeHint=0 and no userPreset', () => {
    const config = generateOptimalConfig({ logSizeHint: 0 }, BENCHMARKS);
    expect(config._instinctSource).toBe('auto');
  });
});

// ---------------------------------------------------------------------------
// G2 — Edge case: logSizeHint = 1 (minimal log)
//
// Rank 1 mathematical theorem: with a 1-event log, the latency estimate is
// 1/100th of the per-100-events measurement. ilp (200ms/100) has estimated
// latency 2ms for a 1-event log. This must correctly fail a 1ms constraint.
// ---------------------------------------------------------------------------
describe('G2 — minimal log: logSizeHint = 1', () => {
  it('does NOT crash when logSizeHint=1', () => {
    expect(() => generateOptimalConfig({ logSizeHint: 1 }, BENCHMARKS)).not.toThrow();
  });

  it('does NOT emit degenerate guard warning when logSizeHint=1 (only 0 is degenerate)', () => {
    const config = generateOptimalConfig({ logSizeHint: 1 }, BENCHMARKS);
    // The degenerate guard fires ONLY for 0; logSizeHint=1 is a valid (tiny) log.
    if (config._warning !== undefined) {
      expect(config._warning.toLowerCase()).not.toContain('degenerate');
    }
  });

  it('ilp (200ms/100) exceeds maxLatencyMs=1 for a 1-event log', () => {
    // ilp: 200 * (1/100) = 2 ms > 1 ms → filtered out
    // dfg: 0.5 * (1/100) = 0.005 ms <= 1 ms → survives
    // inductive_miner: 30 * (1/100) = 0.3 ms <= 1 ms → also survives (higher score than dfg)
    // Winner is whichever has highest composite score among passing candidates — NOT necessarily dfg.
    const config = generateOptimalConfig({ logSizeHint: 1, maxLatencyMs: 1 }, BENCHMARKS);
    // The critical invariant: ilp MUST be excluded (it exceeds the 1ms budget)
    expect(config._selectedAlgorithm).not.toBe('ilp');
    // structural invariant holds regardless of winner
    expect(config._selectedAlgorithm).toBe(config.algorithm.name);
  });

  it('_selectedAlgorithm equals algorithm.name with logSizeHint=1', () => {
    const config = generateOptimalConfig({ logSizeHint: 1 }, BENCHMARKS);
    expect(config._selectedAlgorithm).toBe(config.algorithm.name);
  });

  it('suggestPresetFromBenchmarks handles logSizeHint=1 without crash', () => {
    expect(() =>
      suggestPresetFromBenchmarks(BENCHMARKS, { logSizeHint: 1 })
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// G3 — Threshold boundary correctness (Rank 1 — mathematical theorem)
//
// Speed score → preset mapping:
//   speed_score <= 30 → 'fast'
//   speed_score <= 55 → 'balanced'   (31..55 inclusive)
//   speed_score >  55 → 'quality'    (56+)
//
// The existing tests cover speed_score=5 (fast) and speed_score=80 (quality).
// These tests pin the exact boundary cases: 30, 31, 55, 56.
// ---------------------------------------------------------------------------

// Helper: build a benchmark with a single algorithm at the given speed_score.
function singleAlgoBench(speed_score: number): BenchmarkData {
  return {
    schema_version: '1',
    algorithms: {
      the_algo: {
        median_ms_per_100_events: 10,
        speed_score,
        quality_score: 50,
        profile: ['browser'],
      },
    },
  };
}

describe('G3 — speed_score threshold boundaries', () => {
  // --- Lower boundary: <= 30 maps to fast ---
  it('speed_score=30 maps to fast (inclusive upper limit of fast tier)', () => {
    expect(suggestPresetFromBenchmarks(singleAlgoBench(30), { logSizeHint: 100 })).toBe('fast');
  });

  it('speed_score=31 maps to balanced (first value above fast tier)', () => {
    expect(suggestPresetFromBenchmarks(singleAlgoBench(31), { logSizeHint: 100 })).toBe('balanced');
  });

  // --- Middle boundary: <= 55 maps to balanced ---
  it('speed_score=55 maps to balanced (inclusive upper limit of balanced tier)', () => {
    expect(suggestPresetFromBenchmarks(singleAlgoBench(55), { logSizeHint: 100 })).toBe('balanced');
  });

  it('speed_score=56 maps to quality (first value above balanced tier)', () => {
    expect(suggestPresetFromBenchmarks(singleAlgoBench(56), { logSizeHint: 100 })).toBe('quality');
  });

  // --- Additional safety pins ---
  it('speed_score=0 maps to fast (minimum possible speed score)', () => {
    expect(suggestPresetFromBenchmarks(singleAlgoBench(0), { logSizeHint: 100 })).toBe('fast');
  });

  it('speed_score=100 maps to quality (maximum possible speed score)', () => {
    expect(suggestPresetFromBenchmarks(singleAlgoBench(100), { logSizeHint: 100 })).toBe('quality');
  });

  // --- generateOptimalConfig reflects the preset-tier mapping ---
  it('generateOptimalConfig for speed_score=31 produces balanced profile', () => {
    const config = generateOptimalConfig({ logSizeHint: 100 }, singleAlgoBench(31));
    expect(config.execution.profile).toBe('balanced');
  });

  it('generateOptimalConfig for speed_score=56 produces quality profile', () => {
    const config = generateOptimalConfig({ logSizeHint: 100 }, singleAlgoBench(56));
    expect(config.execution.profile).toBe('quality');
  });

  // --- suggestPreset threshold matches suggestPresetFromBenchmarks for memory ---
  it('suggestPreset boundary: maxMemoryMb=999 returns fast', () => {
    expect(suggestPreset({ maxMemoryMb: 999 })).toBe('fast');
  });

  it('suggestPreset boundary: maxMemoryMb=1000 does NOT return fast', () => {
    expect(suggestPreset({ maxMemoryMb: 1000 })).not.toBe('fast');
  });

  it('suggestPreset boundary: maxLatencyMs=199 returns fast', () => {
    expect(suggestPreset({ maxLatencyMs: 199 })).toBe('fast');
  });

  it('suggestPreset boundary: maxLatencyMs=200 does NOT return fast (threshold is < 200, not <=)', () => {
    expect(suggestPreset({ maxLatencyMs: 200 })).not.toBe('fast');
  });
});

// ---------------------------------------------------------------------------
// G4 — Determinism (Rank 1 — mathematical theorem)
//
// generateOptimalConfig and suggestPresetFromBenchmarks contain no random
// elements: same inputs must always produce bit-identical outputs.
// ---------------------------------------------------------------------------
describe('G4 — determinism', () => {
  it('generateOptimalConfig returns identical results on repeated calls (no random state)', () => {
    const constraints = { maxLatencyMs: 100, logSizeHint: 200 };
    const c1 = generateOptimalConfig(constraints, BENCHMARKS);
    const c2 = generateOptimalConfig(constraints, BENCHMARKS);
    expect(c1._selectedAlgorithm).toBe(c2._selectedAlgorithm);
    expect(c1._selectionReason).toBe(c2._selectionReason);
    expect(c1.execution.profile).toBe(c2.execution.profile);
    expect(c1._instinctSource).toBe(c2._instinctSource);
  });

  it('generateOptimalConfig is deterministic under memory cascade path (no benchmarks)', () => {
    const constraints = { maxMemoryMb: 256 };
    const c1 = generateOptimalConfig(constraints);
    const c2 = generateOptimalConfig(constraints);
    expect(c1._selectedAlgorithm).toBe(c2._selectedAlgorithm);
    expect(c1._selectionReason).toBe(c2._selectionReason);
    expect(c1.execution.profile).toBe(c2.execution.profile);
  });

  it('suggestPresetFromBenchmarks is deterministic for identical inputs', () => {
    const constraints = { maxLatencyMs: 50, logSizeHint: 100 };
    const r1 = suggestPresetFromBenchmarks(BENCHMARKS, constraints);
    const r2 = suggestPresetFromBenchmarks(BENCHMARKS, constraints);
    expect(r1).toBe(r2);
  });

  it('suggestPreset is deterministic for identical inputs', () => {
    const r1 = suggestPreset({ maxMemoryMb: 800, maxLatencyMs: 150 });
    const r2 = suggestPreset({ maxMemoryMb: 800, maxLatencyMs: 150 });
    expect(r1).toBe(r2);
  });

  it('generateOptimalConfig produces stable _selectionReason under repeated calls (Rank 1 sweep)', () => {
    const variants: Parameters<typeof generateOptimalConfig>[0][] = [
      { logSizeHint: 100 },
      { maxMemoryMb: 512 },
      { requiredAlgorithms: ['ilp'], logSizeHint: 10 },
      { maxLatencyMs: 0.6, logSizeHint: 100 },
    ];
    for (const constraints of variants) {
      const a = generateOptimalConfig(constraints, BENCHMARKS);
      const b = generateOptimalConfig(constraints, BENCHMARKS);
      expect(a._selectionReason).toBe(
        b._selectionReason,
        `_selectionReason must be stable for constraints ${JSON.stringify(constraints)}`
      );
    }
  });
});

// ---------------------------------------------------------------------------
// G5 — logCharacteristics enriches the selection reason
//
// Rank 2 domain contract: when log characteristics (event/trace/activity counts)
// are provided, the _selectionReason must include them and _logCharacteristics
// must be echoed back in the result for downstream consumers.
// ---------------------------------------------------------------------------
describe('G5 — logCharacteristics enrichment', () => {
  const characteristics: LogCharacteristics = {
    eventCount: 15000,
    traceCount: 500,
    activityCount: 42,
  };

  it('_logCharacteristics is echoed in the result when provided', () => {
    const config = generateOptimalConfig({ logSizeHint: 100, logCharacteristics: characteristics }, BENCHMARKS);
    expect(config._logCharacteristics).toEqual(characteristics);
  });

  it('_logCharacteristics is undefined when not provided', () => {
    const config = generateOptimalConfig({ logSizeHint: 100 }, BENCHMARKS);
    expect(config._logCharacteristics).toBeUndefined();
  });

  it('_selectionReason includes eventCount when logCharacteristics provided', () => {
    const config = generateOptimalConfig({ logSizeHint: 100, logCharacteristics: characteristics }, BENCHMARKS);
    expect(config._selectionReason).toContain('15000 events');
  });

  it('_selectionReason includes traceCount when logCharacteristics provided', () => {
    const config = generateOptimalConfig({ logSizeHint: 100, logCharacteristics: characteristics }, BENCHMARKS);
    expect(config._selectionReason).toContain('500 traces');
  });

  it('_selectionReason includes activityCount when logCharacteristics provided', () => {
    const config = generateOptimalConfig({ logSizeHint: 100, logCharacteristics: characteristics }, BENCHMARKS);
    expect(config._selectionReason).toContain('42 activities');
  });

  it('_selectionReason is still non-empty when only partial characteristics are provided', () => {
    const partial: LogCharacteristics = { eventCount: 8000 };
    const config = generateOptimalConfig({ logSizeHint: 100, logCharacteristics: partial }, BENCHMARKS);
    expect(config._selectionReason.length).toBeGreaterThan(0);
    expect(config._selectionReason).toContain('8000 events');
  });

  it('logCharacteristics does not affect the selected algorithm — it is metadata only', () => {
    // Same constraints, with and without logCharacteristics, must select the same algorithm.
    const without = generateOptimalConfig({ logSizeHint: 100 }, BENCHMARKS);
    const withChars = generateOptimalConfig(
      { logSizeHint: 100, logCharacteristics: characteristics },
      BENCHMARKS
    );
    expect(withChars._selectedAlgorithm).toBe(without._selectedAlgorithm);
    expect(withChars.execution.profile).toBe(without.execution.profile);
  });

  it('user override + logCharacteristics: both fields present in result', () => {
    // G5 × G6 intersection: userPreset override combined with logCharacteristics
    const config = generateOptimalConfig(
      { userPreset: 'quality', logCharacteristics: characteristics },
      BENCHMARKS
    );
    expect(config._instinctSource).toBe('user');
    expect(config._logCharacteristics).toEqual(characteristics);
    // The selection reason should mention user override AND log characteristics
    expect(config._selectionReason.toLowerCase()).toContain('user override');
    expect(config._selectionReason).toContain('15000 events');
  });
});

// ---------------------------------------------------------------------------
// G6 — Override detection (userPreset parameter)
//
// Rank 2 domain contract: when the caller explicitly supplies `userPreset`,
// the AutoInstincts selection logic must be bypassed entirely. The result
// must use the specified preset, set _instinctSource='user', and not run
// suggestPreset or suggestPresetFromBenchmarks.
// ---------------------------------------------------------------------------
describe('G6 — userPreset override bypasses instinct selection', () => {
  it('userPreset=quality forces quality profile even when memory constraint would force fast', () => {
    // Without override: maxMemoryMb=100 → suggestPreset → fast
    // With override: userPreset=quality → must be quality regardless
    const auto = generateOptimalConfig({ maxMemoryMb: 100 });
    const overridden = generateOptimalConfig({ maxMemoryMb: 100, userPreset: 'quality' });
    expect(auto.execution.profile).toBe('fast');
    expect(overridden.execution.profile).toBe('quality');
  });

  it('userPreset=fast forces fast profile even when quality algorithm is required', () => {
    // Without override: requiredAlgorithms=['ilp'] → suggestPreset → quality
    // With override: userPreset=fast → must be fast
    const auto = generateOptimalConfig({ requiredAlgorithms: ['ilp'] });
    const overridden = generateOptimalConfig({ requiredAlgorithms: ['ilp'], userPreset: 'fast' });
    expect(auto.execution.profile).toBe('quality');
    expect(overridden.execution.profile).toBe('fast');
  });

  it('_instinctSource is user when userPreset is provided', () => {
    const config = generateOptimalConfig({ userPreset: 'balanced' });
    expect(config._instinctSource).toBe('user');
  });

  it('_instinctSource is auto when userPreset is NOT provided', () => {
    const config = generateOptimalConfig({});
    expect(config._instinctSource).toBe('auto');
  });

  it('_selectionReason mentions user override when userPreset is provided', () => {
    const config = generateOptimalConfig({ userPreset: 'balanced' });
    expect(config._selectionReason.toLowerCase()).toContain('user override');
  });

  it('_selectionReason does NOT mention user override in auto mode', () => {
    const config = generateOptimalConfig({ logSizeHint: 100 }, BENCHMARKS);
    expect(config._selectionReason.toLowerCase()).not.toContain('user override');
  });

  it('userPreset=balanced selects the balanced preset default algorithm', () => {
    const config = generateOptimalConfig({ userPreset: 'balanced' });
    // balanced preset → production preset → heuristic_miner
    expect(config.execution.profile).toBe('balanced');
    expect(config._selectedAlgorithm).toBe(config.algorithm.name);
  });

  it('userPreset overrides both suggestPreset AND suggestPresetFromBenchmarks paths', () => {
    // With benchmarks: suggestPresetFromBenchmarks would select quality (ilp wins by score)
    // With userPreset=fast: must override that
    const withBenchmarks = generateOptimalConfig({ logSizeHint: 100, userPreset: 'fast' }, BENCHMARKS);
    const withoutBenchmarks = generateOptimalConfig({ userPreset: 'fast' });
    expect(withBenchmarks.execution.profile).toBe('fast');
    expect(withoutBenchmarks.execution.profile).toBe('fast');
    expect(withBenchmarks._instinctSource).toBe('user');
    expect(withoutBenchmarks._instinctSource).toBe('user');
  });

  it('_selectedAlgorithm always equals algorithm.name even with userPreset override', () => {
    for (const preset of ['fast', 'balanced', 'quality'] as const) {
      const config = generateOptimalConfig({ userPreset: preset });
      expect(config._selectedAlgorithm).toBe(
        config.algorithm.name,
        `_selectedAlgorithm must equal algorithm.name for userPreset='${preset}'`
      );
    }
  });

  it('streaming instinct still fires when userPreset provided AND requiredAlgorithms includes streaming algo', () => {
    // Even with a user override, the streaming source instinct must fire —
    // it is a structural consequence of the algorithm, not a preset choice.
    const config = generateOptimalConfig({
      userPreset: 'fast',
      requiredAlgorithms: ['simd_streaming_dfg'],
    });
    expect(config.source.kind).toBe('stream');
    expect(config._instinctSource).toBe('user');
  });

  it('_instinctSource is always a string (auto or user) — never undefined', () => {
    const variants: Parameters<typeof generateOptimalConfig>[0][] = [
      {},
      { userPreset: 'fast' },
      { userPreset: 'quality' },
      { maxMemoryMb: 512 },
      { requiredAlgorithms: ['ilp'] },
      { logSizeHint: 0 },
    ];
    for (const constraints of variants) {
      const config = generateOptimalConfig(constraints, BENCHMARKS);
      expect(['auto', 'user']).toContain(
        config._instinctSource,
        `_instinctSource must be 'auto' or 'user' for ${JSON.stringify(constraints)}`
      );
    }
  });
});
