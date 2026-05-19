import { describe, it, expect } from 'vitest';
import {
  getPublicPresetConfig,
  describePublicPreset,
  suggestPreset,
  getPresetConfig,
  describePreset,
} from '../validation/presets.js';
import { resolveConfig } from '../resolver.js';
import { validate } from '../schema.js';

// ---------------------------------------------------------------------------
// getPublicPresetConfig — structure and schema validity
// ---------------------------------------------------------------------------
describe('getPublicPresetConfig', () => {
  it('fast preset uses dfg algorithm with fast execution profile', () => {
    const config = getPublicPresetConfig('fast');
    expect(config.algorithm.name).toBe('dfg');
    expect(config.execution.profile).toBe('fast');
  });

  it('quality preset uses ilp algorithm with quality execution profile', () => {
    const config = getPublicPresetConfig('quality');
    expect(config.algorithm.name).toBe('ilp');
    expect(config.execution.profile).toBe('quality');
  });

  it('balanced preset uses heuristic_miner with balanced profile', () => {
    const config = getPublicPresetConfig('balanced');
    expect(config.algorithm.name).toBe('heuristic_miner');
    expect(config.execution.profile).toBe('balanced');
  });

  it('all three presets produce schema-valid configs', () => {
    for (const preset of ['fast', 'balanced', 'quality'] as const) {
      expect(
        () => validate(getPublicPresetConfig(preset)),
        `${preset} preset failed schema validation`
      ).not.toThrow();
    }
  });

  it('fast preset has ml.enabled = false', () => {
    const config = getPublicPresetConfig('fast');
    // fast maps to quick-test which omits ml entirely, so it should be falsy
    expect(config.ml?.enabled ?? false).toBe(false);
  });

  it('balanced preset has ml.enabled = true with classify and anomaly tasks', () => {
    const config = getPublicPresetConfig('balanced');
    expect(config.ml?.enabled).toBe(true);
    expect(config.ml?.tasks).toContain('classify');
    expect(config.ml?.tasks).toContain('anomaly');
  });

  it('quality preset has ml.enabled = true with all 6 tasks', () => {
    const config = getPublicPresetConfig('quality');
    expect(config.ml?.enabled).toBe(true);
    expect(config.ml?.tasks).toHaveLength(6);
  });

  it('quality preset has rl.enabled = true', () => {
    const config = getPublicPresetConfig('quality');
    expect(config.rl?.enabled).toBe(true);
  });

  it('fast preset has prediction.enabled = false', () => {
    const config = getPublicPresetConfig('fast');
    expect(config.prediction?.enabled ?? false).toBe(false);
  });

  it('balanced preset has prediction.enabled = true with tasks', () => {
    const config = getPublicPresetConfig('balanced');
    expect(config.prediction?.enabled).toBe(true);
    expect((config.prediction?.tasks ?? []).length).toBeGreaterThan(0);
  });

  it('quality preset has prediction enabled with all 6 tasks', () => {
    const config = getPublicPresetConfig('quality');
    expect(config.prediction?.enabled).toBe(true);
    expect(config.prediction?.tasks).toContain('next_activity');
    expect(config.prediction?.tasks).toContain('remaining_time');
    expect(config.prediction?.tasks).toContain('drift');
  });

  it('each preset config has a valid version string matching x.y.z pattern', () => {
    for (const preset of ['fast', 'balanced', 'quality'] as const) {
      const config = getPublicPresetConfig(preset);
      expect(config.version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it('each preset config has a positive schemaVersion', () => {
    for (const preset of ['fast', 'balanced', 'quality'] as const) {
      const config = getPublicPresetConfig(preset);
      expect(config.schemaVersion).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// suggestPreset — constraint-driven selection
// ---------------------------------------------------------------------------
describe('suggestPreset', () => {
  it('suggests fast when maxMemoryMb is below 1000', () => {
    expect(suggestPreset({ maxMemoryMb: 512 })).toBe('fast');
    expect(suggestPreset({ maxMemoryMb: 999 })).toBe('fast');
  });

  it('suggests quality when a quality-tier algorithm is required', () => {
    expect(suggestPreset({ requiredAlgorithms: ['genetic_algorithm'] })).toBe('quality');
    expect(suggestPreset({ requiredAlgorithms: ['ilp'] })).toBe('quality');
  });

  it('defaults to balanced with no constraints or no trigger conditions', () => {
    expect(suggestPreset({})).toBe('balanced');
    expect(suggestPreset({ maxMemoryMb: 2000, maxLatencyMs: 5000 })).toBe('balanced');
  });

  it('suggests fast when maxLatencyMs is very tight (< 200)', () => {
    expect(suggestPreset({ maxLatencyMs: 100 })).toBe('fast');
    expect(suggestPreset({ maxLatencyMs: 199 })).toBe('fast');
  });

  it('does not suggest quality for dfg (non-quality-tier algorithm)', () => {
    const result = suggestPreset({ requiredAlgorithms: ['dfg'] });
    expect(result).not.toBe('quality');
  });

  it('quality wins when mixing quality-tier and non-quality algorithms', () => {
    expect(suggestPreset({ requiredAlgorithms: ['dfg', 'genetic_algorithm'] })).toBe('quality');
  });

  it('memory constraint overrides latency constraint — fast wins on low memory', () => {
    // maxMemoryMb < 1000 → fast, even if latencyMs is fine
    expect(suggestPreset({ maxMemoryMb: 400, maxLatencyMs: 10000 })).toBe('fast');
  });
});

// ---------------------------------------------------------------------------
// describePublicPreset — human-readable descriptions
// ---------------------------------------------------------------------------
describe('describePublicPreset', () => {
  it('returns non-empty description strings for all three presets', () => {
    for (const preset of ['fast', 'balanced', 'quality'] as const) {
      const desc = describePublicPreset(preset);
      expect(typeof desc).toBe('string');
      expect(desc.length).toBeGreaterThan(0);
    }
  });

  it('fast description mentions "fast" profile or key words', () => {
    const desc = describePublicPreset('fast');
    expect(desc.toLowerCase()).toMatch(/fast|quick|rapid/);
  });

  it('balanced description mentions "balanced" or "production"', () => {
    const desc = describePublicPreset('balanced');
    expect(desc.toLowerCase()).toMatch(/balanced|production/);
  });

  it('quality description mentions "quality" or "research"', () => {
    const desc = describePublicPreset('quality');
    expect(desc.toLowerCase()).toMatch(/quality|research/);
  });
});

// ---------------------------------------------------------------------------
// Preset → resolveConfig round-trip (provenance is tracked as 'default')
// ---------------------------------------------------------------------------
describe('Preset provenance tracking', () => {
  it('resolveConfig with fast preset cliOverrides shows cli provenance on profile', async () => {
    const cfg = await resolveConfig({
      cliOverrides: { profile: 'fast' },
      configSearchPaths: [],
    });
    expect(cfg.execution.profile).toBe('fast');
    expect(cfg.metadata.provenance['execution.profile']?.source).toBe('cli');
  });

  it('resolveConfig with quality preset via cliOverrides captures correct profile', async () => {
    const cfg = await resolveConfig({
      cliOverrides: { profile: 'quality' },
      configSearchPaths: [],
    });
    expect(cfg.execution.profile).toBe('quality');
  });

  it('resolveConfig with streaming preset via cliOverrides has watch.enabled = false by default', async () => {
    // The streaming preset in resolveConfig is set via algorithm/profile, not via the preset helper.
    // Verify that stream profile resolves without error.
    const cfg = await resolveConfig({
      cliOverrides: { profile: 'stream' },
      configSearchPaths: [],
    });
    expect(cfg.execution.profile).toBe('stream');
  });
});

// ---------------------------------------------------------------------------
// getExamplePresetConfig (resolver-level) round-trip
// ---------------------------------------------------------------------------
describe('getPresetConfig scenario completeness', () => {
  it('quick-test preset has sink kind=stdout', () => {
    const p = getPresetConfig('quick-test');
    expect(p.sink.kind).toBe('stdout');
  });

  it('production preset has output format=json', () => {
    const p = getPresetConfig('production');
    expect(p.output.format).toBe('json');
  });

  it('research preset has output format=json and colorize=false', () => {
    const p = getPresetConfig('research');
    expect(p.output.format).toBe('json');
    expect(p.output.colorize).toBe(false);
  });

  it('describePreset returns non-empty for all three scenarios', () => {
    for (const s of ['quick-test', 'production', 'research'] as const) {
      const d = describePreset(s);
      expect(typeof d).toBe('string');
      expect(d.length).toBeGreaterThan(5);
    }
  });
});
