/**
 * prediction/perspectives/handler.ts
 *
 * Contract every perspective implementation must satisfy.
 *
 * The dispatcher only ever talks to handlers through this interface, so adding
 * a new perspective is a matter of (1) extending the union types and (2)
 * registering an implementation of `PerspectiveHandler` in the registry.
 */

import {
  PredictionLog,
  PredictionModel,
  PredictionPerspective,
  PredictionRecord,
  PredictionTask,
  PredictionTrace,
} from '../types.js';

export interface PerspectiveHandler<T extends PredictionTask = PredictionTask> {
  readonly perspective: PredictionPerspective;

  /**
   * Train a perspective-specific model from a log. The returned `state` is
   * opaque to the dispatcher — only `predict` may interpret it.
   */
  fit(task: T, log: PredictionLog): PredictionModel;

  /**
   * Score one or more prefix traces. Implementations MUST treat `model.state`
   * as read-only and never mutate the supplied prefixes.
   */
  predict(
    task: T,
    model: PredictionModel,
    prefixes: readonly PredictionTrace[],
  ): readonly PredictionRecord[];
}

/**
 * Helper for handler implementations: trim a trace to `maxPrefixLength` events
 * if the task asked for it, otherwise return the trace unchanged.
 */
export function clipTrace(
  trace: PredictionTrace,
  maxPrefixLength?: number,
): PredictionTrace {
  if (!maxPrefixLength || trace.events.length <= maxPrefixLength) return trace;
  return { caseId: trace.caseId, events: trace.events.slice(0, maxPrefixLength) };
}

/**
 * Stable, allocation-free hash for short string sequences. Used by handlers
 * to fingerprint models without pulling in the kernel's BLAKE3 dependency.
 *
 * Algorithm: FNV-1a 32-bit, returned as zero-padded hex.
 */
export function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // Force unsigned and pad to 8 hex chars.
  return (hash >>> 0).toString(16).padStart(8, '0');
}
