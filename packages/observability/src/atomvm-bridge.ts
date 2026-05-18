/**
 * AtomVM bridge: emit LIVE-07 span events for AtomVM detection and silent skip.
 *
 * LIVE-07 (Silent AtomVM skip detection) requires these two span names:
 *   1. atomvm.detect         — AtomVM runtime detection probe
 *   2. atomvm.supported_skip — emitted instead of atomvm.detect when AtomVM
 *                              is unavailable on the current mcpp route
 *
 * AtomVM is an Erlang/Elixir runtime targeting embedded and WASM environments.
 * When an mcpp route requires AtomVM but the runtime is not available, the
 * system silently skips the AtomVM stage and emits atomvm.supported_skip in
 * place of atomvm.detect. wasm4pm models this detection/skip event pair from
 * the TypeScript side, providing partial LIVE-07 coverage. Full coverage
 * (including real AtomVM runtime probing) requires an embedded BEAM target.
 *
 * Both functions return a `SpineTraceRecord` carrying the two required LIVE-07
 * attributes on every record:
 *   - mcpp.atomvm.state       — one of 'detected' | 'not_supported' | 'skipped' | 'unknown'
 *   - mcpp.atomvm.evidence_ref — opaque reference string linking to external evidence
 */

import { SpineTraceRecord } from './spine-bridge.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lifecycle state of the AtomVM runtime on the current mcpp route target.
 *
 * - `'detected'`       — AtomVM runtime was found and is available
 * - `'not_supported'`  — target platform does not support AtomVM
 * - `'skipped'`        — AtomVM stage was skipped (silent skip path)
 * - `'unknown'`        — detection probe did not return a conclusive result
 */
export type AtomVmState = 'detected' | 'not_supported' | 'skipped' | 'unknown';

/**
 * Input record for AtomVM detection/skip span emission.
 */
export interface AtomVmRecord {
  /** AtomVM lifecycle state determined by the detection probe. */
  state: AtomVmState;
  /**
   * Opaque reference linking this event to external evidence (e.g. a probe
   * result document, a capability manifest, or a BEAM node identifier).
   */
  evidenceRef: string;
  /** Stable run identifier — propagated to `run.id` field. */
  runId: string;
  /**
   * Optional wall-clock nanoseconds override. When omitted, defaults to
   * `Date.now() * 1_000_000`.
   */
  tsNs?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Emitters
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Emits `atomvm.detect` — LIVE-07 partial coverage (detection path).
 *
 * Carries `mcpp.atomvm.state` and `mcpp.atomvm.evidence_ref`, both required by
 * the LIVE-07 correlation rule. Emit this span when the AtomVM probe runs and
 * returns a conclusive result (including `'not_supported'`).
 */
export function emitAtomVmDetect(rec: AtomVmRecord): SpineTraceRecord {
  return {
    kind: 'event',
    name: 'atomvm.detect',
    ts_ns: rec.tsNs ?? Date.now() * 1_000_000,
    fields: {
      'run.id': rec.runId,
      'service.name': 'wasm4pm.spine',
      'mcpp.atomvm.state': rec.state,
      'mcpp.atomvm.evidence_ref': rec.evidenceRef,
    },
  };
}

/**
 * Emits `atomvm.supported_skip` — LIVE-07 partial coverage (silent skip path).
 *
 * Carries `mcpp.atomvm.state` and `mcpp.atomvm.evidence_ref`, both required by
 * the LIVE-07 correlation rule. Emit this span instead of `atomvm.detect` when
 * an mcpp route requires AtomVM but the runtime is unavailable and the stage
 * is silently skipped.
 */
export function emitAtomVmSupportedSkip(rec: AtomVmRecord): SpineTraceRecord {
  return {
    kind: 'event',
    name: 'atomvm.supported_skip',
    ts_ns: rec.tsNs ?? Date.now() * 1_000_000,
    fields: {
      'run.id': rec.runId,
      'service.name': 'wasm4pm.spine',
      'mcpp.atomvm.state': rec.state,
      'mcpp.atomvm.evidence_ref': rec.evidenceRef,
    },
  };
}
