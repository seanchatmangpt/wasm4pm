import { describe, it, expect } from 'vitest';
import { configSchema, ALGORITHM_IDS } from '@wasm4pm/config';
import { genomeToConfig, genomeToToml, tomlToGenome } from '../emit.js';
import type { PipelineGenome } from '../types.js';

function discoverGenome(algorithm: string): PipelineGenome {
  return {
    stages: [
      { kind: 'discover', algorithm, params: { threshold: 0.5, mode: 'strict' } },
    ],
  };
}

describe('genomeToConfig', () => {
  it('emits a config that validates against the real @wasm4pm/config schema', () => {
    const config = genomeToConfig(discoverGenome('inductive_miner'));
    expect(() => configSchema.parse(config)).not.toThrow();
  });

  it('names a valid ALGORITHM_ID in [algorithm].name', () => {
    const config = configSchema.parse(genomeToConfig(discoverGenome('heuristic_miner')));
    expect((ALGORITHM_IDS as readonly string[])).toContain(config.algorithm.name);
    expect(config.algorithm.name).toBe('heuristic_miner');
  });

  it('rejects an invalid algorithm id', () => {
    expect(() => genomeToConfig(discoverGenome('not_a_real_algo'))).toThrow();
  });

  it('streaming algorithm yields source.kind = "stream" and stream profile', () => {
    const config = configSchema.parse(genomeToConfig(discoverGenome('simd_streaming_dfg')));
    expect(config.source.kind).toBe('stream');
    expect(config.execution.profile).toBe('stream');
  });

  it('non-streaming algorithm yields source.kind = "file"', () => {
    const config = configSchema.parse(genomeToConfig(discoverGenome('inductive_miner')));
    expect(config.source.kind).toBe('file');
  });
});

describe('genomeToToml', () => {
  it('includes the AutoPM emitter header and winner objectives', () => {
    const toml = genomeToToml(discoverGenome('dfg'), undefined, { quality: 0.92, cost: 1234 });
    expect(toml).toContain('emitted by AutoPM');
    expect(toml).toContain('quality=0.92');
    expect(toml).toContain('cost=1234');
  });

  it('is deterministic — same genome produces byte-identical TOML', () => {
    const g = discoverGenome('heuristic_miner');
    expect(genomeToToml(g)).toBe(genomeToToml(g));
  });

  it('round-trips the discovery algorithm via tomlToGenome', () => {
    const g = discoverGenome('alpha_plus_plus');
    const back = tomlToGenome(genomeToToml(g));
    const discover = back.stages.find((s) => s.kind === 'discover');
    expect(discover?.algorithm).toBe('alpha_plus_plus');
    expect(discover?.params.threshold).toBe(0.5);
    expect(discover?.params.mode).toBe('strict');
  });

  it('emitted TOML parses back into a schema-valid config', () => {
    const g = discoverGenome('inductive_miner');
    const back = tomlToGenome(genomeToToml(g));
    expect(() => configSchema.parse(genomeToConfig(back))).not.toThrow();
  });
});
