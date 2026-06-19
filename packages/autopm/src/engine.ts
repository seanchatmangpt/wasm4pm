/**
 * Deterministic NSGA-II-style evolutionary search.
 *
 * The engine is PURE over an injected evaluator: it knows NOTHING about process
 * mining. It only sees opaque PipelineGenomes plus injected evaluate / mutate /
 * crossover functions. Scoring and genetic operators live in other modules.
 *
 * Two objectives (see Objectives):
 *   - quality: maximize, [0,1]
 *   - cost:    minimize, ms-ish
 *
 * DETERMINISM IS LAW: every stochastic choice flows through a single SeededRng,
 * and every collection is sorted by a stable key before it influences control
 * flow or output. Therefore (initialPopulation, evaluate, mutate, crossover,
 * generations, populationSize, seed) -> byte-identical AutoPMResult.
 */

import type { AutoPMResult, Candidate, Objectives, PipelineGenome } from './types.js';
import { mulberry32, type SeededRng } from './rng.js';

export interface EvolveOptions {
  initialPopulation: PipelineGenome[];
  evaluate: (g: PipelineGenome) => Objectives;
  mutate: (g: PipelineGenome, rng: SeededRng) => PipelineGenome;
  crossover: (a: PipelineGenome, b: PipelineGenome, rng: SeededRng) => PipelineGenome;
  generations: number;
  populationSize: number;
  seed: number;
}

/** Internal working individual: genome + cached objectives + NSGA-II annotations. */
interface Individual {
  genome: PipelineGenome;
  objectives: Objectives;
  /** canonical JSON of the genome, used for stable sorting + dedup */
  key: string;
  rank: number;
  crowding: number;
}

/**
 * Stable canonical serialization of a genome. Object keys are emitted in sorted
 * order so two structurally-equal genomes always serialize identically — this is
 * the basis for both deduplication and stable sorting.
 */
export function canonicalGenome(g: PipelineGenome): string {
  const stages = g.stages.map((s) => {
    const paramKeys = Object.keys(s.params).sort();
    const params: Record<string, number | string | boolean> = {};
    for (const k of paramKeys) params[k] = s.params[k];
    return {
      kind: s.kind,
      algorithm: s.algorithm ?? null,
      breed: s.breed ?? null,
      params,
    };
  });
  return JSON.stringify({ stages });
}

/**
 * Pareto domination for (maximize quality, minimize cost).
 * `a` dominates `b` iff a is no worse on every objective and strictly better on
 * at least one.
 */
export function dominates(a: Objectives, b: Objectives): boolean {
  const qNoWorse = a.quality >= b.quality;
  const cNoWorse = a.cost <= b.cost;
  const strictlyBetter = a.quality > b.quality || a.cost < b.cost;
  return qNoWorse && cNoWorse && strictlyBetter;
}

/**
 * Fast non-dominated sort. Returns fronts as arrays of indices into `pop`.
 * Within the algorithm itself ranks are order-independent; callers stably sort
 * any collection that influences output.
 */
export function nonDominatedSort(pop: Individual[]): number[][] {
  const n = pop.length;
  const dominatedBy: number[][] = Array.from({ length: n }, () => []);
  const dominationCount: number[] = new Array(n).fill(0);
  const fronts: number[][] = [[]];

  for (let p = 0; p < n; p++) {
    for (let q = 0; q < n; q++) {
      if (p === q) continue;
      if (dominates(pop[p].objectives, pop[q].objectives)) {
        dominatedBy[p].push(q);
      } else if (dominates(pop[q].objectives, pop[p].objectives)) {
        dominationCount[p]++;
      }
    }
    if (dominationCount[p] === 0) {
      pop[p].rank = 0;
      fronts[0].push(p);
    }
  }

  let i = 0;
  while (fronts[i].length > 0) {
    const next: number[] = [];
    for (const p of fronts[i]) {
      for (const q of dominatedBy[p]) {
        dominationCount[q]--;
        if (dominationCount[q] === 0) {
          pop[q].rank = i + 1;
          next.push(q);
        }
      }
    }
    i++;
    fronts.push(next);
  }
  fronts.pop(); // last pushed front is empty
  return fronts;
}

/**
 * Crowding-distance assignment within a single front (mutates pop[*].crowding).
 * Boundary points get Infinity so extremes are preserved.
 */
function assignCrowding(pop: Individual[], front: number[]): void {
  const m = front.length;
  if (m === 0) return;
  for (const idx of front) pop[idx].crowding = 0;
  if (m <= 2) {
    for (const idx of front) pop[idx].crowding = Infinity;
    return;
  }

  const objs: Array<{ get: (o: Objectives) => number }> = [
    { get: (o) => o.quality },
    { get: (o) => o.cost },
  ];

  for (const { get } of objs) {
    const sorted = front.slice().sort((a, b) => {
      const d = get(pop[a].objectives) - get(pop[b].objectives);
      if (d !== 0) return d;
      // stable tie-break on canonical key
      return pop[a].key < pop[b].key ? -1 : pop[a].key > pop[b].key ? 1 : 0;
    });
    pop[sorted[0]].crowding = Infinity;
    pop[sorted[m - 1]].crowding = Infinity;
    const min = get(pop[sorted[0]].objectives);
    const max = get(pop[sorted[m - 1]].objectives);
    const range = max - min || 1;
    for (let k = 1; k < m - 1; k++) {
      const prev = get(pop[sorted[k - 1]].objectives);
      const nextv = get(pop[sorted[k + 1]].objectives);
      pop[sorted[k]].crowding += (nextv - prev) / range;
    }
  }
}

/**
 * Crowded-comparison: lower rank wins; ties broken by larger crowding distance;
 * final ties broken by canonical key for full determinism.
 */
function crowdedLess(a: Individual, b: Individual): boolean {
  if (a.rank !== b.rank) return a.rank < b.rank;
  if (a.crowding !== b.crowding) return a.crowding > b.crowding;
  return a.key < b.key;
}

/** Binary tournament selection using crowded-comparison. */
function tournament(pop: Individual[], rng: SeededRng): Individual {
  const a = pop[rng.randInt(0, pop.length)];
  const b = pop[rng.randInt(0, pop.length)];
  return crowdedLess(a, b) ? a : b;
}

function makeIndividual(genome: PipelineGenome, evaluate: (g: PipelineGenome) => Objectives): Individual {
  return {
    genome,
    objectives: evaluate(genome),
    key: canonicalGenome(genome),
    rank: 0,
    crowding: 0,
  };
}

/** Deduplicate by canonical key, keeping first occurrence. */
function dedupByKey(pop: Individual[]): Individual[] {
  const seen = new Set<string>();
  const out: Individual[] = [];
  for (const ind of pop) {
    if (seen.has(ind.key)) continue;
    seen.add(ind.key);
    out.push(ind);
  }
  return out;
}

/**
 * Run the evolutionary search.
 *
 * Winner selection (tie-break, documented): among rank-0 (Pareto-optimal)
 * candidates, the winner MAXIMIZES quality; ties on quality are broken by
 * MINIMIZING cost; any remaining ties are broken by the canonical genome key
 * (lexicographically smallest) so the winner is always deterministic.
 */
export function evolve(opts: EvolveOptions): AutoPMResult {
  const { initialPopulation, evaluate, mutate, crossover, generations, populationSize, seed } = opts;
  const rng = mulberry32(seed);
  let evaluated = 0;

  const evalGenome = (g: PipelineGenome): Objectives => {
    evaluated++;
    return evaluate(g);
  };

  // Seed population: take the provided genomes, dedup, then pad up to
  // populationSize by mutating existing members (deterministic).
  let population: Individual[] = dedupByKey(
    initialPopulation.map((g) => makeIndividual(g, evalGenome)),
  );
  if (population.length === 0) {
    throw new Error('evolve: initialPopulation must contain at least one genome');
  }
  {
    // Pad up to populationSize by mutating existing members. Bound the number of
    // attempts so a non-novel mutate() cannot loop forever; if we cannot reach
    // populationSize, proceed with whatever distinct genomes we have.
    let stagnation = 0;
    const maxStagnation = Math.max(8, populationSize * 4);
    while (population.length < populationSize && stagnation < maxStagnation) {
      const before = population.length;
      const parent = population[rng.randInt(0, population.length)];
      const child = makeIndividual(mutate(parent.genome, rng), evalGenome);
      population.push(child);
      population = dedupByKey(population);
      stagnation = population.length > before ? 0 : stagnation + 1;
    }
  }
  // Trim if initial population already exceeded populationSize.
  if (population.length > populationSize) {
    const fronts = nonDominatedSort(population);
    population = selectNext(population, fronts, populationSize);
  }

  // Generational loop.
  for (let gen = 0; gen < generations; gen++) {
    const fronts = nonDominatedSort(population);
    for (const f of fronts) assignCrowding(population, f);

    // Produce offspring via tournament selection + crossover + mutation.
    const offspring: Individual[] = [];
    while (offspring.length < populationSize) {
      const p1 = tournament(population, rng);
      const p2 = tournament(population, rng);
      let childGenome = crossover(p1.genome, p2.genome, rng);
      childGenome = mutate(childGenome, rng);
      offspring.push(makeIndividual(childGenome, evalGenome));
    }

    // Combine parents + offspring, dedup, re-sort, elitist truncation.
    let combined = dedupByKey([...population, ...offspring]);
    const combinedFronts = nonDominatedSort(combined);
    for (const f of combinedFronts) assignCrowding(combined, f);
    population = selectNext(combined, combinedFronts, populationSize);
  }

  // Final ranking for output.
  const finalFronts = nonDominatedSort(population);
  for (const f of finalFronts) assignCrowding(population, f);

  // Pareto front = rank-0, deduped, stably sorted by (quality desc, cost asc, key).
  const front0 = dedupByKey(population.filter((ind) => ind.rank === 0));
  front0.sort(compareForOutput);

  const paretoFront: Candidate[] = front0.map((ind) => ({
    genome: ind.genome,
    objectives: ind.objectives,
    rank: ind.rank,
  }));

  // Winner: first of the output-sorted front (max quality, then min cost, then key).
  const winner = paretoFront[0];

  return {
    paretoFront,
    winner,
    generations,
    seed,
    evaluated,
  };
}

/** Stable output ordering: quality desc, cost asc, canonical key asc. */
function compareForOutput(a: Individual, b: Individual): number {
  if (a.objectives.quality !== b.objectives.quality) {
    return b.objectives.quality - a.objectives.quality;
  }
  if (a.objectives.cost !== b.objectives.cost) {
    return a.objectives.cost - b.objectives.cost;
  }
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

/**
 * Elitist environmental selection: fill the next generation front-by-front; the
 * last partially-included front is ordered by crowding distance (desc) with a
 * stable key tie-break.
 */
function selectNext(pop: Individual[], fronts: number[][], target: number): Individual[] {
  const next: Individual[] = [];
  for (const front of fronts) {
    if (next.length + front.length <= target) {
      for (const idx of front) next.push(pop[idx]);
    } else {
      const remaining = target - next.length;
      const sorted = front.slice().sort((a, b) => {
        if (pop[a].crowding !== pop[b].crowding) return pop[b].crowding - pop[a].crowding;
        return pop[a].key < pop[b].key ? -1 : pop[a].key > pop[b].key ? 1 : 0;
      });
      for (let i = 0; i < remaining; i++) next.push(pop[sorted[i]]);
      break;
    }
    if (next.length >= target) break;
  }
  return next;
}
