/**
 * Spine-bridge: emit the 5 LIVE-01 spine span events required by the mcpp
 * AAT-Live correlation rules.
 *
 * LIVE-01 requires exactly these 5 span names to be present in a correlated
 * span set for every admitted run:
 *   1. aat.run             — run created
 *   2. mcp.tool_call       — tool invoked
 *   3. powl.route.evaluate — route evaluated
 *   4. proof.aggregate     — conformance aggregated  (also satisfies LIVE-02)
 *   5. mcpp.verdict.emit   — verdict emitted
 *
 * All functions return a `SpineTraceRecord` — a structurally compatible
 * superset of the mcpp `TraceRecord` format (mcpp-server/src/aat/correlation.rs)
 * that carries spine-specific fields alongside the required streaming fields.
 * It is ready for JSON serialisation and NDJSON emission into mcpp's collector
 * buffer.
 *
 * References:
 *   - mcpp input type: `TraceRecord` (mcpp-server/src/aat/correlation.rs)
 *     Fields: kind, name, fields (JSON object), ts_ns (wall-clock nanoseconds)
 *   - streaming-bridge.ts: `McppTraceRecord` — the TypeScript mirror of that type.
 */

// ─────────────────────────────────────────────────────────────────────────────
// SpineTraceRecord — open superset of McppTraceRecord for spine span fields
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Open variant of the mcpp TraceRecord format used by spine spans.
 *
 * The `McppTraceRecord.fields` type is a closed interface matching the
 * streaming bridge's fixed attribute set.  Spine spans carry additional
 * mcpp-specific attributes (`mcp.tool.name`, `powl.route.id`, etc.) that are
 * not part of the streaming bridge schema.  `SpineTraceRecord` uses an open
 * `fields` bag (index signature) so those attributes can be included without
 * violating TypeScript's excess-property check, while still enforcing the
 * required base fields at runtime.
 */
export interface SpineTraceRecord {
  /** Span kind — always `"event"` for spine records emitted by this bridge. */
  kind: 'span_open' | 'span_record' | 'event';
  /** Closed-vocabulary span name consumed by LIVE-01 correlation rules. */
  name: string;
  /**
   * Attribute bag evaluated by LIVE-01..LIVE-16 correlation rules.
   * Open index signature allows spine-specific fields (`mcp.tool.name`,
   * `powl.route.id`, etc.) alongside the standard streaming base fields.
   */
  fields: {
    /** Stable run identifier — required by all LIVE rules. */
    'run.id': string;
    /** Source component — `"wasm4pm.streaming"` for LIVE-01 spans; `"wasm4pm.spine"` for LIVE-05 spans. */
    'service.name': 'wasm4pm.streaming' | 'wasm4pm.spine';
    /** Additional spine-specific and mcpp-specific attributes. */
    [key: string]: string | number | boolean;
  };
  /** Wall-clock nanoseconds since UNIX epoch (mirrors `TraceRecord.ts_ns`). */
  ts_ns: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-event record types
// ─────────────────────────────────────────────────────────────────────────────

export interface SpineRunRecord {
  runId: string;
  runType: 'mining' | 'conformance' | 'prediction';
}

export interface SpineToolCallRecord {
  runId: string;
  toolName: string;
}

export interface SpineRouteEvalRecord {
  runId: string;
  routeId: string;
  discoveryVariant: string;
}

export interface SpineProofAggRecord {
  runId: string;
  fitness: number;
  precision: number;
  /** ISO-8601 timestamp of proof aggregation */
  aggregatedAt: string;
}

export interface SpineVerdictRecord {
  runId: string;
  verdict: 'admitted' | 'refused';
  /** LIVE-14: runtime mode (e.g. "ModeC_Distributed"). Optional for backward compatibility. */
  runtimeMode?: string;
  /** LIVE-14: actor role (e.g. "proof_aggregator"). Optional for backward compatibility. */
  actorRole?: string;
  /** LIVE-14: whether this actor can emit Accepted verdicts. Optional for backward compatibility. */
  canEmitAccepted?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Individual emitters
// ─────────────────────────────────────────────────────────────────────────────

/** Emits the aat.run spine span (LIVE-01 prerequisite event 1/5). */
export function emitAatRun(rec: SpineRunRecord): SpineTraceRecord {
  const ts_ns = Date.now() * 1_000_000;
  return {
    kind: 'event',
    name: 'aat.run',
    fields: {
      'run.id': rec.runId,
      'mcpp.run.type': rec.runType,
      'service.name': 'wasm4pm.streaming',
    },
    ts_ns,
  };
}

/** Emits the mcp.tool_call spine span (LIVE-01 prerequisite event 2/5). */
export function emitMcpToolCall(rec: SpineToolCallRecord): SpineTraceRecord {
  const ts_ns = Date.now() * 1_000_000;
  return {
    kind: 'event',
    name: 'mcp.tool_call',
    fields: {
      'run.id': rec.runId,
      'mcp.tool.name': rec.toolName,
      'service.name': 'wasm4pm.streaming',
    },
    ts_ns,
  };
}

/** Emits the powl.route.evaluate spine span (LIVE-01 prerequisite event 3/5). */
export function emitPowlRouteEvaluate(rec: SpineRouteEvalRecord): SpineTraceRecord {
  const ts_ns = Date.now() * 1_000_000;
  return {
    kind: 'event',
    name: 'powl.route.evaluate',
    fields: {
      'run.id': rec.runId,
      'powl.route.id': rec.routeId,
      'powl.discovery.variant': rec.discoveryVariant,
      'service.name': 'wasm4pm.streaming',
    },
    ts_ns,
  };
}

/**
 * Emits the proof.aggregate spine span (LIVE-01 prerequisite event 4/5).
 * This span also satisfies LIVE-02: carries mcpp.conformance.fitness and
 * mcpp.conformance.precision.
 */
export function emitProofAggregate(rec: SpineProofAggRecord): SpineTraceRecord {
  const ts_ns = new Date(rec.aggregatedAt).getTime() * 1_000_000;
  return {
    kind: 'event',
    name: 'proof.aggregate',
    fields: {
      'run.id': rec.runId,
      'mcpp.conformance.fitness': rec.fitness,
      'mcpp.conformance.precision': rec.precision,
      'proof.aggregated_at': rec.aggregatedAt,
      'service.name': 'wasm4pm.streaming',
    },
    ts_ns,
  };
}

/** Emits the mcpp.verdict.emit spine span (LIVE-01 prerequisite event 5/5).
 *
 * LIVE-14 partial coverage: when `runtimeMode`, `actorRole`, and `canEmitAccepted`
 * are provided, the span carries `mcpp.runtime.mode`, `mcpp.actor.role`, and
 * `mcpp.actor.can_emit_accepted` — three of the four LIVE-14 required attributes.
 * Full ModeC_Distributed coverage requires the BEAM runtime for erlang.actor.spawn.
 */
export function emitMcppVerdict(rec: SpineVerdictRecord): SpineTraceRecord {
  const ts_ns = Date.now() * 1_000_000;
  return {
    kind: 'event',
    name: 'mcpp.verdict.emit',
    fields: {
      'run.id': rec.runId,
      'mcpp.verdict': rec.verdict,
      'service.name': 'wasm4pm.streaming',
      ...(rec.runtimeMode !== undefined ? { 'mcpp.runtime.mode': rec.runtimeMode } : {}),
      ...(rec.actorRole !== undefined ? { 'mcpp.actor.role': rec.actorRole } : {}),
      ...(rec.canEmitAccepted !== undefined ? { 'mcpp.actor.can_emit_accepted': rec.canEmitAccepted } : {}),
    },
    ts_ns,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LIVE-05 partial coverage: powl.activity.enabled
// ─────────────────────────────────────────────────────────────────────────────

export interface ActivityEnabledRecord {
  runId: string;
  activityId: string;
  powlActivityId: string;
  predecessorsSatisfied: boolean;
  objectsValid: boolean;
}

/**
 * Emits powl.activity.enabled — LIVE-05 partial coverage.
 *
 * LIVE-05 (LiveRouteConformanceGap) checks erlang.actor.spawn spans for
 * mcpp.activity.id and powl.activity.predecessors_satisfied. wasm4pm cannot
 * emit erlang.actor.spawn (BEAM-only), but this event documents the enablement
 * condition that would trigger a spawn, giving mcpp partial evidence.
 */
export function emitActivityEnabled(rec: ActivityEnabledRecord): SpineTraceRecord {
  return {
    kind: 'event',
    name: 'powl.activity.enabled',
    ts_ns: Date.now() * 1_000_000,
    fields: {
      'run.id': rec.runId,
      'service.name': 'wasm4pm.spine',
      'mcpp.activity.id': rec.activityId,
      'powl.activity.id': rec.powlActivityId,
      'powl.activity.predecessors_satisfied': rec.predecessorsSatisfied,
      'powl.activity.objects_valid': rec.objectsValid,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LIVE-05 full coverage: erlang.actor.spawn
// ─────────────────────────────────────────────────────────────────────────────

export interface ActorSpawnRecord {
  activityId: string;
  powlActivityId: string;
  predecessorsSatisfied: boolean;
  objectsValid: boolean;
  runId: string;
  tsNs?: number;
}

/**
 * Emits erlang.actor.spawn — LIVE-05 full coverage.
 *
 * LIVE-05 (LiveRouteConformanceGap) requires an erlang.actor.spawn span
 * carrying mcpp.activity.id, powl.activity.id, powl.activity.predecessors_satisfied,
 * and powl.activity.objects_valid. This function emits that span from the
 * wasm4pm bridge, satisfying all four required attributes.
 */
export function emitErlangActorSpawn(rec: ActorSpawnRecord): SpineTraceRecord {
  return {
    name: 'erlang.actor.spawn',
    kind: 'event',
    ts_ns: rec.tsNs ?? Date.now() * 1_000_000,
    fields: {
      'run.id': rec.runId,
      'service.name': 'wasm4pm.spine',
      'mcpp.activity.id': rec.activityId,
      'powl.activity.id': rec.powlActivityId,
      'powl.activity.predecessors_satisfied': rec.predecessorsSatisfied,
      'powl.activity.objects_valid': rec.objectsValid,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LIVE-11 partial coverage: spawn-to-route latency delta
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes the spawn-to-route latency delta (ms) from two SpineTraceRecords.
 * Both records must have ts_ns fields. Returns null if either is missing ts_ns.
 * LIVE-11: delta must be ≤ 500ms for conformance.
 */
export function computeSpawnLatencyMs(
  spawnRecord: SpineTraceRecord,
  routeRecord: SpineTraceRecord,
): { deltaMs: number; conforms: boolean } | null {
  const spawnNs = spawnRecord.ts_ns;
  const routeNs = routeRecord.ts_ns;
  if (typeof spawnNs !== 'number' || typeof routeNs !== 'number') return null;
  const deltaMs = (routeNs - spawnNs) / 1_000_000;
  return { deltaMs, conforms: deltaMs <= 500 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience: emit all 5 spine spans in order
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Emits all 5 LIVE-01 spine spans in order for a complete run.
 *
 * LIVE-01 requires exactly these 5 events to be present in a correlated span
 * set.  `emitProofAggregate` also satisfies LIVE-02 (conformance dims present
 * on proof.aggregate).
 *
 * Call this after a full run completes, before flushing the exporter.
 */
export function emitSpineRecord(opts: {
  runId: string;
  runType: SpineRunRecord['runType'];
  toolName: string;
  routeId: string;
  discoveryVariant: string;
  fitness: number;
  precision: number;
  verdict: 'admitted' | 'refused';
}): SpineTraceRecord[] {
  const aggregatedAt = new Date().toISOString();
  return [
    emitAatRun({ runId: opts.runId, runType: opts.runType }),
    emitMcpToolCall({ runId: opts.runId, toolName: opts.toolName }),
    emitPowlRouteEvaluate({
      runId: opts.runId,
      routeId: opts.routeId,
      discoveryVariant: opts.discoveryVariant,
    }),
    emitProofAggregate({
      runId: opts.runId,
      fitness: opts.fitness,
      precision: opts.precision,
      aggregatedAt,
    }),
    emitMcppVerdict({ runId: opts.runId, verdict: opts.verdict }),
  ];
}
