/**
 * @wasm4pm/autopm — Candidate scorer + genetic operators.
 *
 * Provides the process-mining-aware pieces the (pure) engine needs:
 *   - makeEvaluator(log)  -> deterministic genome -> Objectives
 *   - mutate / crossover  -> valid genome transforms (seeded RNG only)
 *   - seedPopulation      -> diverse valid initial genomes
 *   - receiptForCandidate -> BLAKE3 receipt hash over (genome + objectives)
 *
 * DETERMINISM IS LAW. Nothing here calls Math.random, reads IO, or depends on
 * clock/order. Every stochastic choice flows through the injected SeededRng, and
 * every collection is built from a stably-sorted source key. Same inputs ->
 * byte-identical outputs, which is what makes the Pareto front receiptable.
 *
 * Scoring is grounded in @wasm4pm/planner's published algorithm metadata
 * (ALGORITHM_PROFILES = the discovery search space) and the bench-calibrated cost
 * model (ALGO_BENCH_COSTS / estimateDurationMs), restricted to algorithm ids that
 * are actually registered in @wasm4pm/config's ALGORITHM_IDS.
 */

import { ALGORITHM_PROFILES, estimateDurationMs, benchSpeedTier, type AlgorithmHints } from '@wasm4pm/planner';
import { ALGORITHM_IDS } from '@wasm4pm/config';
import { hashData } from '@wasm4pm/contracts';
import type {
  Candidate,
  LogCharacteristics,
  Objectives,
  PipelineGenome,
  PipelineStage,
} from './types.js';
import { canonicalGenome } from './engine.js';
import type { SeededRng } from './rng.js';

/** Set of registered algorithm ids (from @wasm4pm/config / contracts). */
const REGISTERED_IDS: ReadonlySet<string> = new Set<string>(ALGORITHM_IDS as readonly string[]);

/**
 * Discovery algorithm pool: profiled (has speed/quality metadata) AND registered.
 * Sorted for a stable, deterministic ordering — every RNG pick draws from this
 * exact frozen list so the same seed always picks the same algorithm.
 */
export const DISCOVERY_ALGORITHMS: readonly string[] = Object.freeze(
  Object.keys(ALGORITHM_PROFILES)
    .filter((id) => REGISTERED_IDS.has(id))
    .sort(),
);

/**
 * Diagnostic 'reason' breeds. The breeds catalog is an optional dependency; we
 * use a small, fixed, sorted whitelist of well-known breed ids so the package
 * builds without the catalog while still exercising the 'reason' stage. Each adds
 * a small, fixed diagnostic-value bonus to quality.
 */
export const REASON_BREEDS: readonly string[] = Object.freeze(
  ['bayes', 'dempster_shafer', 'mycin'].sort(),
);

/** Conformance parameter knobs that mutate() may tweak (stable, sorted keys). */
const CONFORM_PARAM_KEYS = ['noise_threshold', 'weight'] as const;

function profileOf(algorithm: string | undefined): AlgorithmHints | undefined {
  if (!algorithm) return undefined;
  return ALGORITHM_PROFILES[algorithm];
}

/** The single discovery stage of a genome (genomes always have exactly one). */
function discoveryStage(g: PipelineGenome): PipelineStage | undefined {
  return g.stages.find((s) => s.kind === 'discover');
}

/**
 * Estimate the noisiness of a log from its shape, in [0, 1]. Longer-than-average
 * max traces and high activity counts relative to trace length indicate variant
 * spread / noise. Pure function of LogCharacteristics.
 */
function noiseLevel(log: LogCharacteristics): number {
  if (log.avgTraceLength <= 0) return 0;
  const spread = (log.maxTraceLength - log.avgTraceLength) / log.avgTraceLength; // >=0
  const activityRatio = log.activityCount / Math.max(1, log.avgTraceLength);
  const raw = 0.5 * Math.min(1, spread) + 0.5 * Math.min(1, activityRatio / 4);
  return Math.max(0, Math.min(1, raw));
}

/** Is the log "large" enough that non-scaling / O(n²) algorithms hurt? */
function sizePressure(log: LogCharacteristics): number {
  // 0 at <=1k traces, ramps to 1 by ~50k traces (log scale).
  if (log.traceCount <= 1000) return 0;
  const p = Math.log10(log.traceCount / 1000) / Math.log10(50);
  return Math.max(0, Math.min(1, p));
}

/**
 * Quality contribution of the discovery algorithm given the log, in [0, 1].
 * Base = qualityTier/100, adjusted by log fit:
 *   - penalize non-scaling / O(n²)+ algorithms proportional to size pressure
 *   - reward noise-robust algorithms on noisy logs; penalize noise-fragile ones
 */
function discoveryQuality(algorithm: string | undefined, log: LogCharacteristics): number {
  const prof = profileOf(algorithm);
  if (!prof) return 0;
  let q = prof.qualityTier / 100; // base in [0,1]

  const pressure = sizePressure(log);
  const expensive = prof.complexity === 'O(n²)' || prof.complexity === 'Exponential' || prof.complexity === 'NP-Hard';
  if (pressure > 0) {
    if (!prof.scalesWell) q -= 0.45 * pressure;
    if (expensive) q -= 0.2 * pressure;
  }

  const noise = noiseLevel(log);
  if (noise > 0) {
    q += prof.robustToNoise ? 0.12 * noise : -0.25 * noise;
  }

  return Math.max(0, Math.min(1, q));
}

/**
 * Build a deterministic evaluator closure bound to a specific log.
 *
 * quality (maximize, [0,1]):
 *   discoveryQuality(algorithm, log)
 *   + 0.06 bonus if a 'conform' stage is present (validation improves trust)
 *   + 0.04 per 'reason' stage that names a known diagnostic breed (capped)
 *   renormalized into [0,1].
 *
 * cost (minimize, ms-ish):
 *   sum over stages of a per-stage ms estimate. Discovery uses the planner's
 *   bench-calibrated estimateDurationMs where available, else a speed-tier x
 *   size-factor fallback. conform/reason stages add a lighter size-scaled cost.
 */
export function makeEvaluator(log: LogCharacteristics): (g: PipelineGenome) => Objectives {
  const noise = noiseLevel(log);
  // Per-event size factor for fallback cost (cheap but monotonic in eventCount).
  const sizeFactorMs = Math.max(0.01, log.eventCount / 1_000_000); // ms per speed-tier unit

  return (g: PipelineGenome): Objectives => {
    const disc = discoveryStage(g);
    const algorithm = disc?.algorithm;

    // ---- quality ----
    let quality = discoveryQuality(algorithm, log);
    const hasConform = g.stages.some((s) => s.kind === 'conform');
    if (hasConform) quality += 0.06;

    const reasonStages = g.stages.filter(
      (s) => s.kind === 'reason' && s.breed && (REASON_BREEDS as readonly string[]).includes(s.breed),
    );
    // Diagnostic value adds up but with diminishing returns (cap at 3 stages).
    quality += 0.04 * Math.min(3, reasonStages.length);
    // Reason stages add more value on noisy logs (they reconcile uncertainty).
    if (reasonStages.length > 0) quality += 0.03 * noise;

    quality = Math.max(0, Math.min(1, quality));

    // ---- cost ----
    let cost = 0;
    for (const stage of g.stages) {
      if (stage.kind === 'discover') {
        const grounded = stage.algorithm ? estimateDurationMs(stage.algorithm, log.eventCount) : undefined;
        if (grounded !== undefined) {
          cost += grounded;
        } else {
          // Fallback: speed tier (bench-derived if possible, else profile) x size.
          const prof = profileOf(stage.algorithm);
          const tier = (stage.algorithm ? benchSpeedTier(stage.algorithm) : undefined) ?? prof?.speedTier ?? 50;
          cost += tier * sizeFactorMs;
        }
      } else if (stage.kind === 'conform') {
        // Conformance is roughly alignment-class work: scale with events, mid tier.
        cost += 20 * sizeFactorMs + 0.5;
      } else {
        // reason: lightweight per-event reasoning pass.
        cost += 8 * sizeFactorMs + 0.25;
      }
    }
    // Each extra stage carries fixed dispatch overhead (more stages => more cost).
    cost += g.stages.length * 0.1;

    return { quality, cost };
  };
}

// ---------------------------------------------------------------------------
// Genetic operators
// ---------------------------------------------------------------------------

function cloneStage(s: PipelineStage): PipelineStage {
  return { ...s, params: { ...s.params } };
}

function cloneGenome(g: PipelineGenome): PipelineGenome {
  return { stages: g.stages.map(cloneStage) };
}

/** A fresh, valid discovery stage for `algorithm`. */
function makeDiscoverStage(algorithm: string): PipelineStage {
  return { kind: 'discover', algorithm, params: {} };
}

/**
 * Enforce structural validity: EXACTLY one 'discover' stage whose algorithm is a
 * registered discovery id, discover first, and at most a bounded number of
 * non-discover stages (keeps genomes small + the search space finite). Always
 * returns a new, valid genome. Deterministic given `rng`.
 */
function repair(g: PipelineGenome, rng: SeededRng): PipelineGenome {
  const discovers = g.stages.filter((s) => s.kind === 'discover');
  const others = g.stages.filter((s) => s.kind !== 'discover');

  // Pick / fix the discovery stage.
  let discover: PipelineStage;
  const valid = discovers.find((s) => s.algorithm && REGISTERED_IDS.has(s.algorithm) && profileOf(s.algorithm));
  if (valid) {
    discover = cloneStage(valid);
  } else if (discovers.length > 0 && discovers[0].algorithm) {
    // Has a discover stage but an unknown algorithm — reassign deterministically.
    discover = makeDiscoverStage(rng.pick(DISCOVERY_ALGORITHMS));
    discover.params = { ...discovers[0].params };
  } else {
    discover = makeDiscoverStage(rng.pick(DISCOVERY_ALGORITHMS));
  }

  // Sanitize non-discover stages; drop any malformed ones. Cap at 4 extra stages.
  const cleaned: PipelineStage[] = [];
  for (const s of others) {
    if (cleaned.length >= 4) break;
    if (s.kind === 'conform') {
      cleaned.push(cloneStage(s));
    } else if (s.kind === 'reason') {
      const breed = s.breed && (REASON_BREEDS as readonly string[]).includes(s.breed)
        ? s.breed
        : rng.pick(REASON_BREEDS);
      cleaned.push({ kind: 'reason', breed, params: { ...s.params } });
    }
  }

  return { stages: [discover, ...cleaned] };
}

/**
 * Mutate a genome. Picks one mutation deterministically via `rng`:
 *   0: swap the discovery algorithm to another registered discovery id
 *   1: tweak a numeric param on a random stage
 *   2: add a 'conform' or 'reason' stage (if room)
 *   3: remove a non-discover stage (if any)
 * Always returns a structurally valid genome.
 */
export function mutate(g: PipelineGenome, rng: SeededRng): PipelineGenome {
  const base = repair(g, rng);
  const op = rng.randInt(0, 4);

  if (op === 0) {
    // Swap discovery algorithm.
    const disc = base.stages[0]; // repair guarantees discover is first
    disc.algorithm = rng.pick(DISCOVERY_ALGORITHMS);
  } else if (op === 1) {
    // Tweak a param. Choose a stage; set/adjust a known numeric knob.
    const stage = base.stages[rng.randInt(0, base.stages.length)];
    const key = rng.pick(CONFORM_PARAM_KEYS);
    // Quantized values keep the space finite + the canonical key stable.
    const choices = [0.1, 0.2, 0.3, 0.5, 0.8];
    stage.params = { ...stage.params, [key]: rng.pick(choices) };
  } else if (op === 2) {
    // Add a stage if there's room (cap 4 non-discover).
    const nonDiscover = base.stages.length - 1;
    if (nonDiscover < 4) {
      if (rng.next() < 0.5) {
        base.stages.push({ kind: 'conform', params: {} });
      } else {
        base.stages.push({ kind: 'reason', breed: rng.pick(REASON_BREEDS), params: {} });
      }
    }
  } else {
    // Remove a non-discover stage if any exist.
    if (base.stages.length > 1) {
      const removeIdx = 1 + rng.randInt(0, base.stages.length - 1);
      base.stages.splice(removeIdx, 1);
    }
  }

  return repair(base, rng);
}

/**
 * Crossover two genomes by splicing their non-discover stage lists. The child
 * inherits one parent's discovery stage (chosen by rng) and a deterministic
 * splice of both parents' extra stages. Always structurally valid.
 */
export function crossover(a: PipelineGenome, b: PipelineGenome, rng: SeededRng): PipelineGenome {
  const ra = repair(a, rng);
  const rb = repair(b, rng);

  const discover = rng.next() < 0.5 ? cloneStage(ra.stages[0]) : cloneStage(rb.stages[0]);

  const aExtra = ra.stages.slice(1);
  const bExtra = rb.stages.slice(1);
  // One-point splice: prefix from a, suffix from b.
  const cutA = aExtra.length > 0 ? rng.randInt(0, aExtra.length + 1) : 0;
  const cutB = bExtra.length > 0 ? rng.randInt(0, bExtra.length + 1) : 0;
  const spliced = [...aExtra.slice(0, cutA), ...bExtra.slice(cutB)].map(cloneStage);

  return repair({ stages: [discover, ...spliced] }, rng);
}

/**
 * Seed a diverse, valid initial population. Each genome is built deterministically
 * from `rng`. Coverage: one minimal genome per discovery algorithm (cycled), with
 * randomized conform/reason augmentation, deduped by canonical key, capped at size.
 */
export function seedPopulation(log: LogCharacteristics, rng: SeededRng, size: number): PipelineGenome[] {
  void log; // log shape does not change validity; reserved for future log-aware seeding
  const out: PipelineGenome[] = [];
  const seen = new Set<string>();
  const algos = DISCOVERY_ALGORITHMS;

  let guard = 0;
  const maxGuard = Math.max(size * 8, algos.length * 4);
  while (out.length < size && guard < maxGuard) {
    guard++;
    const algorithm = algos[(out.length + guard) % algos.length];
    const stages: PipelineStage[] = [makeDiscoverStage(algorithm)];
    // Deterministic augmentation.
    if (rng.next() < 0.5) stages.push({ kind: 'conform', params: {} });
    if (rng.next() < 0.4) stages.push({ kind: 'reason', breed: rng.pick(REASON_BREEDS), params: {} });

    const genome = repair({ stages }, rng);
    const key = canonicalGenome(genome);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(genome);
  }

  // Guarantee at least one genome even if size <= 0 or everything collided.
  if (out.length === 0) {
    out.push(repair({ stages: [makeDiscoverStage(rng.pick(algos))] }, rng));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Receipts
// ---------------------------------------------------------------------------

/**
 * BLAKE3 receipt hash over the canonical (genome + objectives) JSON. The genome is
 * canonicalized (sorted param keys, normalized null fields) so structurally-equal
 * candidates hash identically — the Pareto front becomes auditable. Pure; does not
 * mutate the candidate (callers assign the result to candidate.receiptHash).
 */
export function receiptForCandidate(c: Candidate): string {
  const canonical = {
    genome: JSON.parse(canonicalGenome(c.genome)) as unknown,
    objectives: { quality: c.objectives.quality, cost: c.objectives.cost },
  };
  return hashData(canonical);
}
