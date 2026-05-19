/**
 * OTEL Span Sampling Strategy Implementation
 *
 * Per Iteration 21 Audit: Implement configurable sampling to reduce observability cost
 * while maintaining proof coverage per chicago-tdd.md.
 *
 * Three strategies:
 * 1. ALWAYS (100% sampling) — all spans emitted (default, highest cost, complete proof)
 * 2. RANDOM_10 (10% sampling) — ~90% cost reduction, ~10% span coverage
 * 3. ADAPTIVE (log-size adaptive) — 100% for small logs, 10% for large logs
 *
 * Cost model (empirical from Iteration 21 measurements):
 * - Queue enqueue: 0.1ms per span
 * - Serialization: 0.5ms per 100 spans
 * - Network I/O: 10-50ms per batch (depends on collector latency)
 * - Total per command: ~5-100ms depending on log size and OTEL health
 *
 * Coverage model (proof requirements per chicago-tdd.md):
 * - Rank 1 (mathematical): 100% coverage required
 *   Example: Bellman equation validation, SPC Western Electric rules
 *   Strategy: ALWAYS (must sample 100%)
 *
 * - Rank 2 (domain contract): ~50% coverage sufficient
 *   Example: Agent selection decisions, health state transitions
 *   Strategy: ADAPTIVE or RANDOM_10
 *
 * - Rank 3-5 (metamorphic/regression): ~10% coverage sufficient
 *   Example: Policy improvement trends, per-algorithm performance
 *   Strategy: RANDOM_10 or ADAPTIVE
 *
 * Default: ADAPTIVE (balances cost and proof coverage)
 * Override: --span-sampling {100|10|adaptive} or WASM4PM_SPAN_SAMPLING env var
 */

import { OtelEvent } from './types.js';

/**
 * Sampling decision result
 */
export interface SamplingDecision {
  should_emit: boolean;
  strategy: SamplingStrategy;
  reason: string; // For debugging/observability
  sampling_rate: number; // 0.0 to 1.0
}

/**
 * Available sampling strategies
 */
export type SamplingStrategy = 'always' | 'random_10' | 'adaptive';

/**
 * Span sampling configuration
 */
export interface SpanSamplingConfig {
  strategy: SamplingStrategy;
  adaptive_log_size_small_kb: number; // default: 5 KB
  adaptive_log_size_large_kb: number; // default: 50 KB
  adaptive_threshold_small: number; // default: 1.0 (100% for small logs)
  adaptive_threshold_large: number; // default: 0.1 (10% for large logs)
  random_seed?: number; // for deterministic testing
}

/**
 * Span sampler: decides whether to emit spans based on strategy
 */
export class SpanSampler {
  private config: SpanSamplingConfig;
  private rng: { next: () => number }; // PRNG for deterministic sampling
  private decision_counts: Map<SamplingStrategy, { total: number; emitted: number }> = new Map();

  constructor(config: Partial<SpanSamplingConfig> = {}) {
    this.config = {
      strategy: 'adaptive',
      adaptive_log_size_small_kb: 5,
      adaptive_log_size_large_kb: 50,
      adaptive_threshold_small: 1.0,
      adaptive_threshold_large: 0.1,
      ...config,
    };

    // Simple seeded PRNG (xorshift32) for deterministic sampling
    // Only used if random_seed provided (testing)
    const seed = config.random_seed ?? Date.now();
    let state = seed;
    this.rng = {
      next: () => {
        state ^= state << 13;
        state ^= state >> 17;
        state ^= state << 5;
        return (state >>> 0) / 0xffffffff; // normalize to [0, 1)
      },
    };
  }

  /**
   * Decide whether to emit a span based on configured strategy and context
   *
   * @param event OTEL event
   * @param context Additional context (log size, span type, etc.)
   * @returns SamplingDecision
   */
  should_emit(
    _event: OtelEvent,
    context?: {
      log_size_bytes?: number;
      trace_count?: number;
      event_count?: number;
      span_type?: string; // 'kernel', 'ml', 'rl', 'conformance', etc.
    }
  ): SamplingDecision {
    const strategy = this.config.strategy;

    // Track decision for statistics
    if (!this.decision_counts.has(strategy)) {
      this.decision_counts.set(strategy, { total: 0, emitted: 0 });
    }
    const counts = this.decision_counts.get(strategy)!;
    counts.total++;

    let should_emit = false;
    let reason = '';
    let sampling_rate = 1.0;

    switch (strategy) {
      case 'always':
        should_emit = true;
        reason = 'Always sample (100% coverage)';
        sampling_rate = 1.0;
        break;

      case 'random_10':
        // Random 10% sampling
        const rand = this.rng.next();
        should_emit = rand < 0.1;
        reason = `Random 10% sampling (${rand.toFixed(3)})`;
        sampling_rate = 0.1;
        break;

      case 'adaptive':
        // Adaptive based on log size
        const log_size_kb = (context?.log_size_bytes ?? 0) / 1024;

        if (log_size_kb <= this.config.adaptive_log_size_small_kb) {
          // Small log: 100% sampling
          should_emit = true;
          reason = `Adaptive: small log (${log_size_kb.toFixed(1)} KB <= ${this.config.adaptive_log_size_small_kb} KB)`;
          sampling_rate = 1.0;
        } else if (log_size_kb >= this.config.adaptive_log_size_large_kb) {
          // Large log: 10% sampling
          const rand = this.rng.next();
          should_emit = rand < 0.1;
          reason = `Adaptive: large log (${log_size_kb.toFixed(1)} KB >= ${this.config.adaptive_log_size_large_kb} KB), random 10%`;
          sampling_rate = 0.1;
        } else {
          // Medium log: linear interpolation between 100% and 10%
          const progress = (log_size_kb - this.config.adaptive_log_size_small_kb) /
            (this.config.adaptive_log_size_large_kb - this.config.adaptive_log_size_small_kb);
          const rate = 1.0 - (progress * 0.9); // linearly from 1.0 to 0.1
          const rand = this.rng.next();
          should_emit = rand < rate;
          reason = `Adaptive: medium log (${log_size_kb.toFixed(1)} KB), rate ${rate.toFixed(1)}`;
          sampling_rate = rate;
        }
        break;
    }

    if (should_emit) {
      counts.emitted++;
    }

    return {
      should_emit,
      strategy,
      reason,
      sampling_rate,
    };
  }

  /**
   * Get sampling statistics
   */
  get_stats(): {
    strategy: SamplingStrategy;
    total_decisions: number;
    emitted_spans: number;
    effective_sampling_rate: number;
  } {
    const counts = this.decision_counts.get(this.config.strategy);
    if (!counts) {
      return {
        strategy: this.config.strategy,
        total_decisions: 0,
        emitted_spans: 0,
        effective_sampling_rate: 1.0,
      };
    }

    return {
      strategy: this.config.strategy,
      total_decisions: counts.total,
      emitted_spans: counts.emitted,
      effective_sampling_rate: counts.total > 0 ? counts.emitted / counts.total : 1.0,
    };
  }

  /**
   * Reset statistics
   */
  reset_stats(): void {
    this.decision_counts.clear();
  }

  /**
   * Parse sampling strategy from CLI/ENV string
   */
  static parse_strategy(input: string | undefined): SamplingStrategy {
    switch ((input ?? 'adaptive').toLowerCase()) {
      case '100':
      case 'always':
      case 'full':
        return 'always';
      case '10':
      case 'random_10':
      case 'random':
        return 'random_10';
      case 'adaptive':
      case 'auto':
        return 'adaptive';
      default:
        return 'adaptive'; // fallback
    }
  }
}

/**
 * Integration helper: parse sampling config from CLI/ENV
 */
export function parse_span_sampling_config(
  cli_arg?: string,
  env_var?: string
): Partial<SpanSamplingConfig> {
  const strategy = SpanSampler.parse_strategy(cli_arg ?? env_var);
  return { strategy };
}
