/**
 * @wasm4pm/autopm - Deterministic evolutionary AutoPM engine.
 *
 * A seeded NSGA-II-style multi-objective search over pipeline genomes. The engine
 * is pure over an injected evaluator (evaluate/mutate/crossover); process-mining
 * scoring and genetic operators are supplied by other modules. Determinism is law:
 * same (initialPopulation, operators, generations, populationSize, seed) yields a
 * byte-identical AutoPMResult, which is what makes the Pareto front receiptable.
 */

export type {
  PipelineStage,
  PipelineGenome,
  Objectives,
  LogCharacteristics,
  Candidate,
  AutoPMResult,
} from './types.js';

export type { SeededRng } from './rng.js';
export { mulberry32 } from './rng.js';

export type { EvolveOptions } from './engine.js';
export { evolve, dominates, nonDominatedSort, canonicalGenome } from './engine.js';

export {
  genomeToConfig,
  genomeToToml,
  tomlToGenome,
  validateEmittedConfig,
} from './emit.js';

export {
  makeEvaluator,
  mutate,
  crossover,
  seedPopulation,
  receiptForCandidate,
  DISCOVERY_ALGORITHMS,
  REASON_BREEDS,
} from './scoring.js';

import type { AutoPMResult, Candidate, LogCharacteristics } from './types.js';
import { mulberry32 } from './rng.js';
import { evolve } from './engine.js';
import {
  makeEvaluator,
  mutate,
  crossover,
  seedPopulation,
  receiptForCandidate,
} from './scoring.js';
import { genomeToToml } from './emit.js';

export interface RunAutoPMOptions {
  generations?: number;
  populationSize?: number;
  seed?: number;
}

/**
 * End-to-end AutoPM entry point.
 *
 * Seeds a diverse, valid initial population for the given log, runs the
 * deterministic NSGA-II engine with the process-mining-aware scorer + genetic
 * operators, receipts every Pareto candidate (BLAKE3 over genome+objectives),
 * and returns the Pareto front + winner.
 *
 * DETERMINISM IS LAW: same (log, seed, generations, populationSize) yields a
 * byte-identical AutoPMResult, receipt hashes included.
 */
export function runAutoPM(log: LogCharacteristics, opts: RunAutoPMOptions = {}): AutoPMResult {
  const generations = opts.generations ?? 12;
  const populationSize = opts.populationSize ?? 16;
  const seed = opts.seed ?? 42;

  // Seed population from a dedicated RNG stream (separate from the engine's).
  const seedRng = mulberry32(seed);
  const initialPopulation = seedPopulation(log, seedRng, populationSize);

  const evaluate = makeEvaluator(log);

  const result = evolve({
    initialPopulation,
    evaluate,
    mutate,
    crossover,
    generations,
    populationSize,
    seed,
  });

  // Receipt every Pareto candidate (and thereby the winner).
  const paretoFront: Candidate[] = result.paretoFront.map((c) => ({
    ...c,
    receiptHash: receiptForCandidate(c),
  }));
  const winner: Candidate = { ...result.winner, receiptHash: receiptForCandidate(result.winner) };

  return { ...result, paretoFront, winner };
}

/** Project the winning genome to a deterministic wasm4pm.toml string. */
export function winnerToToml(result: AutoPMResult, log?: LogCharacteristics): string {
  return genomeToToml(result.winner.genome, log, result.winner.objectives);
}
