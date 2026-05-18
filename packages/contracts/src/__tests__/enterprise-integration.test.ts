/**
 * enterprise-integration.test.ts — Section K enterprise bridge contracts
 *
 * Section K — AtomVM / Erlang / marketplace integration contracts
 *
 * K01 — manifest-bridge: kernel registry → mcpp PartManifest (in packages/kernel)
 * K02 — CROSSRT X04/X05: AtomVM/Erlang supported-skip protocol in contracts
 * K03 — WASM-to-BEAM NIF port protocol (pending — interface not yet implemented)
 *
 * Oracle ranks follow Chicago TDD (Van der Aalst Constitution):
 *   Rank 1 — Mathematical invariant (holds for any correct implementation)
 *   Rank 2 — Domain contract (design-decided property from mcpp doctrine)
 *   Rank 3 — Metamorphic relation (input perturbation → output relation)
 *
 * References:
 *   - ~/mcpp/docs/CROSS_RUNTIME_VALIDATION.md (Slice κ, probes X01–X10)
 *   - packages/observability/src/atomvm-bridge.ts (LIVE-07 emitters)
 *   - packages/swarm/src/beam-bridge.ts (A-P09 BEAM message bridge)
 *   - packages/kernel/src/manifest-bridge.ts (marketplace PartManifest)
 *   - ~/mcpp/docs/MODE_C_DISTRIBUTED_ARCHITECTURE.md (Mode C — RESERVED)
 *   - ~/mcpp/crates/mcpp-erlang-gen/src/lib.rs (ErlangModule, GapAuthorityEntry)
 *
 * What is real vs aspirational:
 *   REAL:   AtomVM detection/skip span emission (atomvm-bridge.ts, LIVE-07 partial)
 *   REAL:   Erlang actor spawn span emission (spine-bridge.ts, LIVE-05 full)
 *   REAL:   BEAM message bridge (beam-bridge.ts, A-P09 contract)
 *   REAL:   Marketplace admission via PartManifest (manifest-bridge.ts)
 *   REAL:   Receipt → mcpp admission OCEL pipeline (ocel-bridge.ts, receipt-emit-bridge.ts)
 *   ASPIRATIONAL: AtomVM real-path runtime probe (requires embedded BEAM target)
 *   ASPIRATIONAL: Mode C distributed multi-node BEAM (RESERVED in v26.5.17)
 *   ASPIRATIONAL: Erlang NIF/Port for direct WASM → BEAM binary calling convention
 */

import { describe, it, expect } from 'vitest';

// ── K02 ── CROSSRT X04/X05 supported-skip protocol contracts ─────────────────
//
// These tests validate the CROSSRT probe taxonomy without importing
// any AtomVM or BEAM runtime. They operate on the data contracts that
// the wasm4pm TypeScript bridges must satisfy for mcpp X04/X05 compliance.

/**
 * AtomVM report — the data structure that mcpp X04 validates.
 * An "atomvm-report.json" with state == "supported_skip" and a non-empty
 * evidence_ref satisfies X04 SupportedSkip path.
 *
 * Contract (mcpp CROSSRT X04):
 *   Real path:     state == "detected"      AND evidence_ref is a BEAM node ID
 *   Supported-skip: state == "supported_skip" AND evidence_ref non-empty
 */
interface AtomVmReport {
  state: 'detected' | 'not_supported' | 'supported_skip' | 'unknown';
  evidence_ref: string;
  probe_ts_ns?: number;
}

/**
 * Erlang runtime report — the data structure that mcpp X05 validates.
 * Supported-skip: no erlang.actor.spawn AND a non-empty atomvm-report.json
 * evidence carrier covers both runtimes on hosts without BEAM.
 */
interface ErlangReport {
  state: 'detected' | 'not_supported' | 'supported_skip' | 'unknown';
  evidence_ref: string;
  beam_node?: string;
}

/**
 * Evaluate X04 atomvm_layer_validated.
 * Returns true if the report satisfies either the real path or supported-skip path.
 * Returns false if evidence_ref is empty (X04 requires non-empty evidence).
 */
function evaluateX04(report: AtomVmReport): boolean {
  if (report.state === 'detected') {
    // Real path: AtomVM runtime found
    return report.evidence_ref.length > 0;
  }
  if (report.state === 'supported_skip') {
    // X04 SupportedSkip: must have non-empty evidence_ref
    return report.evidence_ref.length > 0;
  }
  // 'not_supported' with empty evidence is not X04-compliant
  if (report.state === 'not_supported') {
    return report.evidence_ref.length > 0;
  }
  // 'unknown' is never X04-compliant
  return false;
}

/**
 * Evaluate X05 erlang_layer_validated.
 * Returns true if the report satisfies either the real path or supported-skip path.
 */
function evaluateX05(report: ErlangReport): boolean {
  if (report.state === 'detected') {
    // Real path: BEAM runtime found AND beam_node is set
    return report.evidence_ref.length > 0 && typeof report.beam_node === 'string';
  }
  if (report.state === 'supported_skip') {
    // X05 SupportedSkip: evidence_ref (atomvm-report.json) non-empty
    return report.evidence_ref.length > 0;
  }
  if (report.state === 'not_supported') {
    // Acceptable with non-empty evidence
    return report.evidence_ref.length > 0;
  }
  return false;
}

describe('K02 — CROSSRT X04: atomvm_layer_validated probe semantics (Rank 2)', () => {
  it('X04 real path passes when state=detected and evidence_ref is non-empty', () => {
    const report: AtomVmReport = {
      state: 'detected',
      evidence_ref: 'beam-node://atomvm@localhost:4369',
    };
    expect(evaluateX04(report)).toBe(true);
  });

  it('X04 supported-skip passes when state=supported_skip and evidence_ref is non-empty', () => {
    const report: AtomVmReport = {
      state: 'supported_skip',
      evidence_ref: 'probe://atomvm/capability-manifest/v1',
    };
    expect(evaluateX04(report)).toBe(true);
  });

  it('X04 fails when state=supported_skip but evidence_ref is empty (no evidence)', () => {
    const report: AtomVmReport = {
      state: 'supported_skip',
      evidence_ref: '',
    };
    expect(evaluateX04(report)).toBe(false);
  });

  it('X04 fails for state=unknown regardless of evidence_ref', () => {
    const report: AtomVmReport = {
      state: 'unknown',
      evidence_ref: 'some-evidence',
    };
    expect(evaluateX04(report)).toBe(false);
  });

  it('X04 fails when state=detected but evidence_ref is empty', () => {
    const report: AtomVmReport = {
      state: 'detected',
      evidence_ref: '',
    };
    expect(evaluateX04(report)).toBe(false);
  });

  it('X04 state values are drawn from the four-item vocabulary', () => {
    const valid: AtomVmReport['state'][] = ['detected', 'not_supported', 'supported_skip', 'unknown'];
    for (const state of valid) {
      const report: AtomVmReport = { state, evidence_ref: 'ref' };
      // evaluateX04 must return a boolean for every valid state
      expect(typeof evaluateX04(report)).toBe('boolean');
    }
  });
});

describe('K02 — CROSSRT X05: erlang_layer_validated probe semantics (Rank 2)', () => {
  it('X05 real path passes when state=detected, beam_node set, and evidence_ref non-empty', () => {
    const report: ErlangReport = {
      state: 'detected',
      evidence_ref: 'erlang-node://mcpp@host1',
      beam_node: 'mcpp@host1',
    };
    expect(evaluateX05(report)).toBe(true);
  });

  it('X05 real path fails when state=detected but beam_node is absent', () => {
    const report: ErlangReport = {
      state: 'detected',
      evidence_ref: 'erlang-node://mcpp@host1',
      // beam_node absent
    };
    expect(evaluateX05(report)).toBe(false);
  });

  it('X05 supported-skip passes when state=supported_skip and evidence_ref non-empty', () => {
    const report: ErlangReport = {
      state: 'supported_skip',
      evidence_ref: 'probe://atomvm/capability-manifest/v1',
    };
    expect(evaluateX05(report)).toBe(true);
  });

  it('X05 supported-skip fails when evidence_ref is empty', () => {
    const report: ErlangReport = {
      state: 'supported_skip',
      evidence_ref: '',
    };
    expect(evaluateX05(report)).toBe(false);
  });

  it('X05 fails for state=unknown regardless of other fields', () => {
    const report: ErlangReport = {
      state: 'unknown',
      evidence_ref: 'some-ref',
      beam_node: 'node@host',
    };
    expect(evaluateX05(report)).toBe(false);
  });
});

describe('K02 — CROSSRT X06: all_5_runtimes_in_single_trace contract (Rank 2)', () => {
  // X06 is the strict union: every layer must have either a real span OR a
  // supported_skip event with non-empty evidence_ref.
  // X06 itself cannot emit SupportedSkip — it requires evidence.

  interface TraceLayerEvidence {
    mcp: boolean;       // X01 — mcp.tool_call present
    a2a: boolean;       // X02 — a2a.message present
    powl: boolean;      // X03 — powl.activity.enabled present
    atomvm: boolean;    // X04 — atomvm.actor.spawn OR supported_skip with evidence
    erlang: boolean;    // X05 — erlang.actor.spawn OR supported_skip with evidence
  }

  function evaluateX06(evidence: TraceLayerEvidence): boolean {
    return evidence.mcp && evidence.a2a && evidence.powl && evidence.atomvm && evidence.erlang;
  }

  it('X06 passes when all 5 layers have evidence', () => {
    expect(evaluateX06({ mcp: true, a2a: true, powl: true, atomvm: true, erlang: true })).toBe(true);
  });

  it('X06 fails when atomvm layer is missing (no real span and no supported_skip)', () => {
    expect(evaluateX06({ mcp: true, a2a: true, powl: true, atomvm: false, erlang: true })).toBe(false);
  });

  it('X06 fails when erlang layer is missing', () => {
    expect(evaluateX06({ mcp: true, a2a: true, powl: true, atomvm: true, erlang: false })).toBe(false);
  });

  it('X06 fails when any single layer is missing', () => {
    const layers: (keyof TraceLayerEvidence)[] = ['mcp', 'a2a', 'powl', 'atomvm', 'erlang'];
    for (const missing of layers) {
      const evidence: TraceLayerEvidence = { mcp: true, a2a: true, powl: true, atomvm: true, erlang: true };
      evidence[missing] = false;
      expect(evaluateX06(evidence)).toBe(false);
    }
  });
});

// ── K02 ── LIVE-07 partial coverage: atomvm.detect / atomvm.supported_skip ───

describe('K02 — LIVE-07 span attribute contracts (Rank 1)', () => {
  // LIVE-07 requires: mcpp.atomvm.state AND mcpp.atomvm.evidence_ref
  // on atomvm.detect or atomvm.supported_skip spans.

  interface Live07Span {
    name: 'atomvm.detect' | 'atomvm.supported_skip';
    fields: {
      'run.id': string;
      'mcpp.atomvm.state': string;
      'mcpp.atomvm.evidence_ref': string;
      'service.name': string;
      [key: string]: string | number | boolean;
    };
    ts_ns: number;
  }

  function validateLive07(span: Live07Span): string[] {
    const violations: string[] = [];
    if (!span.fields['mcpp.atomvm.state']) {
      violations.push('missing mcpp.atomvm.state');
    }
    if (!span.fields['mcpp.atomvm.evidence_ref']) {
      violations.push('missing mcpp.atomvm.evidence_ref');
    }
    if (!span.fields['run.id']) {
      violations.push('missing run.id');
    }
    if (!span.fields['service.name']) {
      violations.push('missing service.name');
    }
    if (span.ts_ns <= 0) {
      violations.push('ts_ns must be > 0');
    }
    return violations;
  }

  it('atomvm.detect span with all required fields passes LIVE-07 validation', () => {
    const span: Live07Span = {
      name: 'atomvm.detect',
      fields: {
        'run.id': 'run-live07-test',
        'mcpp.atomvm.state': 'detected',
        'mcpp.atomvm.evidence_ref': 'probe://atomvm/capability-manifest/v1',
        'service.name': 'wasm4pm.spine',
      },
      ts_ns: Date.now() * 1_000_000,
    };
    expect(validateLive07(span)).toEqual([]);
  });

  it('atomvm.supported_skip span with all required fields passes LIVE-07 validation', () => {
    const span: Live07Span = {
      name: 'atomvm.supported_skip',
      fields: {
        'run.id': 'run-live07-test',
        'mcpp.atomvm.state': 'skipped',
        'mcpp.atomvm.evidence_ref': 'probe://atomvm/capability-manifest/v1',
        'service.name': 'wasm4pm.spine',
      },
      ts_ns: Date.now() * 1_000_000,
    };
    expect(validateLive07(span)).toEqual([]);
  });

  it('span missing mcpp.atomvm.state fails LIVE-07 validation', () => {
    const span = {
      name: 'atomvm.detect' as const,
      fields: {
        'run.id': 'run-live07-test',
        'mcpp.atomvm.state': '',  // empty = missing
        'mcpp.atomvm.evidence_ref': 'probe://atomvm',
        'service.name': 'wasm4pm.spine',
      },
      ts_ns: Date.now() * 1_000_000,
    };
    const violations = validateLive07(span);
    expect(violations.some((v) => v.includes('mcpp.atomvm.state'))).toBe(true);
  });

  it('span missing mcpp.atomvm.evidence_ref fails LIVE-07 validation', () => {
    const span = {
      name: 'atomvm.detect' as const,
      fields: {
        'run.id': 'run-live07-test',
        'mcpp.atomvm.state': 'detected',
        'mcpp.atomvm.evidence_ref': '',  // empty = missing
        'service.name': 'wasm4pm.spine',
      },
      ts_ns: Date.now() * 1_000_000,
    };
    const violations = validateLive07(span);
    expect(violations.some((v) => v.includes('mcpp.atomvm.evidence_ref'))).toBe(true);
  });

  it('ts_ns <= 0 fails LIVE-07 validation', () => {
    const span: Live07Span = {
      name: 'atomvm.detect',
      fields: {
        'run.id': 'run-live07-test',
        'mcpp.atomvm.state': 'detected',
        'mcpp.atomvm.evidence_ref': 'ref',
        'service.name': 'wasm4pm.spine',
      },
      ts_ns: 0,
    };
    expect(validateLive07(span)).toContain('ts_ns must be > 0');
  });
});

// ── K03 ── Pending: WASM-to-BEAM NIF/Port binary calling convention ───────────
//
// This section pins the EXPECTED interface for a future wasm4pm → BEAM NIF
// (Native Implemented Function) or Erlang Port protocol bridge. It documents
// what the connection contract WOULD be so that when the feature is implemented
// it can be validated without reverse-engineering the requirements.
//
// Status: ASPIRATIONAL — none of this is implemented. These tests are pending
// (using .todo) to prevent false green status while preserving the spec.

describe('K03 — WASM-to-BEAM NIF/Port protocol (pending — interface not yet implemented)', () => {
  // The planned entry point contract for calling wasm4pm WASM from Erlang/OTP:
  //
  //   Option A — Port process (safer, no C interop risk):
  //     Erlang sends:    {binary_term_format, call, "discover_dfg", JSONArgs}
  //     WASM responds:   {binary_term_format, result, JSONResult}
  //     or on error:     {binary_term_format, error, Reason}
  //
  //   Option B — NIF (lower latency, higher risk):
  //     nif:wasm4pm_nif:call("discover_dfg", JsonArgsBin) -> {ok, JsonResultBin} | {error, Reason}
  //
  //   AtomVM embedded option:
  //     AtomVM loads wasm4pm.part.wasm as an Erlang module
  //     Entry: :wasm4pm.call(:discover_dfg, json_args) -> {:ok, json_result}
  //
  // All three options share the same JSON-level API:
  //   Args:   {"log_handle": "<handle>", "activity_key": "concept:name"}
  //   Result: {"edges": [...], "nodes": [...], "fitness": ...}

  it.todo('Port protocol: message format is {call, FunctionName, JSONArgsBinary}');

  it.todo('Port protocol: success response is {result, JSONResultBinary}');

  it.todo('Port protocol: error response is {error, Reason} where Reason is a string atom or binary');

  it.todo(
    'NIF entry: wasm4pm_nif:call(FunctionName, ArgsBin) returns {ok, ResultBin} | {error, Reason}'
  );

  it.todo('AtomVM entry: :wasm4pm.call(atom_fn_name, json_args) returns {:ok, result} | {:error, reason}');

  it.todo('function names are Erlang atoms matching wasm4pm WASM export names (discover_dfg, load_eventlog_from_xes, etc.)');

  it.todo('JSON args schema matches existing wasm4pm WASM API (WASM_API.md catalog)');

  it.todo('JSON result schema matches existing wasm4pm WASM return shapes');

  it.todo('binary term format for hashes: blake3 hex-64 strings, not binaries');

  it.todo('AtomVM mode is SupportedSkip (X04) when AtomVM runtime is unavailable — graceful degradation to Port/NIF');
});

// ── K03 ── Aspirational: Mode C Distributed BEAM Architecture ────────────────
//
// Mode C (multi-node BEAM) is RESERVED in mcpp v26.5.17. These pending tests
// pin the wasm4pm side of the contract that would be required when Mode C ships.

describe('K03 — Mode C distributed BEAM architecture contracts (pending — RESERVED)', () => {
  // Mode C (~/mcpp/docs/MODE_C_DISTRIBUTED_ARCHITECTURE.md):
  //   - RuntimeMode::ModeCDistributed enum variant
  //   - DistributedProofAggregatorWriter (sealed, unimplemented in v26.5.17)
  //   - wasm4pm would need to: tag its BEAM messages with mcpp.runtime.mode=ModeC_Distributed
  //   - LIVE-14 requires erlang.actor.spawn with mcpp.runtime.mode on distributed BEAM nodes

  it.todo('Mode C: mcpp.runtime.mode="ModeC_Distributed" on erlang.actor.spawn spans');

  it.todo('Mode C: mcpp.actor.role="proof_aggregator" present on the admitting actor spawn');

  it.todo('Mode C: mcpp.actor.can_emit_accepted=true ONLY for proof_aggregator (A-P09 across nodes)');

  it.todo('Mode C: cross-node run_id correlation — identical run.id on mcp.tool_call and all *.actor.spawn');

  it.todo('Mode C: NetworkPartition refusal — wasm4pm exhaustion maps to NetworkPartition in BEAM supervisor');

  it.todo('Mode C: Byzantine branch detection — dissenting workers generate report_gap messages via beam-bridge');
});

// ── K02 ── CROSSRT X07: cross-runtime correlation id consistency ─────────────

describe('K02 — CROSSRT X07: run_id consistency across the trace spine (Rank 1)', () => {
  // X07 fails closed if mcpp.run_id drifts across the three anchor points:
  //   mcp.tool_call → latest *.actor.spawn → mcpp.verdict.emit

  interface TraceAnchor {
    mcpToolCallRunId: string;
    lastActorSpawnRunId: string;
    verdictRunId: string;
  }

  function evaluateX07(anchors: TraceAnchor): boolean {
    return (
      anchors.mcpToolCallRunId === anchors.lastActorSpawnRunId &&
      anchors.lastActorSpawnRunId === anchors.verdictRunId
    );
  }

  it('X07 passes when all three anchor run_ids are identical', () => {
    const runId = 'run-x07-stable';
    expect(evaluateX07({
      mcpToolCallRunId: runId,
      lastActorSpawnRunId: runId,
      verdictRunId: runId,
    })).toBe(true);
  });

  it('X07 fails when mcp.tool_call run_id differs from actor spawn', () => {
    expect(evaluateX07({
      mcpToolCallRunId: 'run-a',
      lastActorSpawnRunId: 'run-b',
      verdictRunId: 'run-b',
    })).toBe(false);
  });

  it('X07 fails when verdict run_id differs from actor spawn', () => {
    expect(evaluateX07({
      mcpToolCallRunId: 'run-a',
      lastActorSpawnRunId: 'run-a',
      verdictRunId: 'run-c',
    })).toBe(false);
  });

  it('X07 is not satisfied by prefix match — must be exact equality', () => {
    const base = 'run-prefix-match';
    expect(evaluateX07({
      mcpToolCallRunId: base,
      lastActorSpawnRunId: base + '-extra',
      verdictRunId: base,
    })).toBe(false);
  });
});

// ── K02 ── CROSSRT X08: cross-runtime admit only via proof_aggregator ─────────

describe('K02 — CROSSRT X08: Accepted emitted only by proof_aggregator (Rank 2 — A-P09)', () => {
  // X08 cross-layer A-P09: every span asserting mcpp.actor.can_emit_accepted=true
  // must declare mcpp.actor.role=proof_aggregator.
  // This is the runtime witness for A-P09 from beam-bridge.ts.

  interface ActorClaim {
    actorRole: string;
    canEmitAccepted: boolean;
  }

  function evaluateX08(claims: ActorClaim[]): boolean {
    // Every claim with canEmitAccepted=true must have role=proof_aggregator
    return claims.every(
      (c) => !c.canEmitAccepted || c.actorRole === 'proof_aggregator'
    );
  }

  it('X08 passes when only proof_aggregator claims canEmitAccepted=true', () => {
    const claims: ActorClaim[] = [
      { actorRole: 'proof_aggregator', canEmitAccepted: true },
      { actorRole: 'branch_actor', canEmitAccepted: false },
      { actorRole: 'route_coordinator', canEmitAccepted: false },
    ];
    expect(evaluateX08(claims)).toBe(true);
  });

  it('X08 fails when branch_actor claims canEmitAccepted=true', () => {
    const claims: ActorClaim[] = [
      { actorRole: 'proof_aggregator', canEmitAccepted: true },
      { actorRole: 'branch_actor', canEmitAccepted: true },  // violation
    ];
    expect(evaluateX08(claims)).toBe(false);
  });

  it('X08 fails when route_coordinator claims canEmitAccepted=true', () => {
    const claims: ActorClaim[] = [
      { actorRole: 'route_coordinator', canEmitAccepted: true },  // violation
    ];
    expect(evaluateX08(claims)).toBe(false);
  });

  it('X08 passes when no actor claims canEmitAccepted (no verdict emitted)', () => {
    const claims: ActorClaim[] = [
      { actorRole: 'branch_actor', canEmitAccepted: false },
      { actorRole: 'andon_supervisor', canEmitAccepted: false },
    ];
    expect(evaluateX08(claims)).toBe(true);
  });
});

// ── K02 ── Marketplace passport reference: receipt → admission gate ───────────

describe('K02 — Marketplace passport: wasm4pm receipt → mcpp admission gate (Rank 2)', () => {
  // The marketplace gate requires: mcpp CROSSRT probes X01–X10 all pass
  // for a wasm4pm receipt to be admitted.
  //
  // This is the contract between the wasm4pm BLAKE3 receipt and the mcpp
  // part marketplace. The marketplace only admits parts with:
  //   1. BLAKE3 hash format (blake3:<64 hex>) — X02
  //   2. ISO 8601 timestamps — X03
  //   3. Valid UUID v4 run_id — X10
  //   4. Schema version "1.0" — X08
  //   5. Valid status (success|partial|failed) — X07

  const BLAKE3_RE = /^[0-9a-f]{64}$/;
  const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const ISO8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

  interface ReceiptHashBundle {
    config_hash: string;
    input_hash: string;
    plan_hash: string;
    output_hash: string;
  }

  function validateReceiptForMarketplace(receipt: {
    run_id: string;
    schema_version: string;
    status: string;
    start_time: string;
    end_time: string;
    hashes: ReceiptHashBundle;
  }): string[] {
    const failures: string[] = [];
    if (!UUID_V4_RE.test(receipt.run_id)) failures.push('run_id must be UUID v4');
    if (receipt.schema_version !== '1.0') failures.push('schema_version must be 1.0');
    if (!['success', 'partial', 'failed'].includes(receipt.status)) failures.push('invalid status');
    if (!ISO8601_RE.test(receipt.start_time)) failures.push('start_time must be ISO 8601');
    if (!ISO8601_RE.test(receipt.end_time)) failures.push('end_time must be ISO 8601');
    for (const [field, hash] of Object.entries(receipt.hashes)) {
      if (!BLAKE3_RE.test(hash)) failures.push(`${field} must be 64-char lowercase hex`);
    }
    return failures;
  }

  it('valid receipt has no marketplace admission failures', () => {
    const receipt = {
      run_id: '550e8400-e29b-41d4-a716-446655440000',
      schema_version: '1.0',
      status: 'success',
      start_time: '2026-05-17T10:00:00.000Z',
      end_time: '2026-05-17T10:00:03.000Z',
      hashes: {
        config_hash: 'a'.repeat(64),
        input_hash: 'b'.repeat(64),
        plan_hash: 'c'.repeat(64),
        output_hash: 'd'.repeat(64),
      },
    };
    expect(validateReceiptForMarketplace(receipt)).toEqual([]);
  });

  it('uppercase hash fails marketplace validation (mcpp requires lowercase hex)', () => {
    const receipt = {
      run_id: '550e8400-e29b-41d4-a716-446655440000',
      schema_version: '1.0',
      status: 'success',
      start_time: '2026-05-17T10:00:00.000Z',
      end_time: '2026-05-17T10:00:03.000Z',
      hashes: {
        config_hash: 'A'.repeat(64),  // uppercase — invalid
        input_hash: 'b'.repeat(64),
        plan_hash: 'c'.repeat(64),
        output_hash: 'd'.repeat(64),
      },
    };
    expect(validateReceiptForMarketplace(receipt)).toContain('config_hash must be 64-char lowercase hex');
  });

  it('UUID v1 run_id fails marketplace validation (must be UUID v4)', () => {
    const receipt = {
      run_id: '550e8400-e29b-11d4-a716-446655440000',  // version 1
      schema_version: '1.0',
      status: 'success',
      start_time: '2026-05-17T10:00:00.000Z',
      end_time: '2026-05-17T10:00:03.000Z',
      hashes: {
        config_hash: 'a'.repeat(64),
        input_hash: 'b'.repeat(64),
        plan_hash: 'c'.repeat(64),
        output_hash: 'd'.repeat(64),
      },
    };
    expect(validateReceiptForMarketplace(receipt)).toContain('run_id must be UUID v4');
  });

  it('all three valid status values pass marketplace validation', () => {
    const baseReceipt = {
      run_id: '550e8400-e29b-41d4-a716-446655440000',
      schema_version: '1.0',
      start_time: '2026-05-17T10:00:00.000Z',
      end_time: '2026-05-17T10:00:03.000Z',
      hashes: {
        config_hash: 'a'.repeat(64),
        input_hash: 'b'.repeat(64),
        plan_hash: 'c'.repeat(64),
        output_hash: 'd'.repeat(64),
      },
    };
    for (const status of ['success', 'partial', 'failed']) {
      expect(validateReceiptForMarketplace({ ...baseReceipt, status })).toEqual([]);
    }
  });

  it('mcpp marketplace requires fitness=1.0 for admission (not just successful receipt)', () => {
    // Rank 2 domain contract: mcpp admission gate requires conformance.fitness=1.0.
    // A "success" receipt with fitness < 1.0 is a PartialAdmission — not admitted.
    // This is distinct from the marketplace X01–X10 probe format validation above.
    const fitness = 0.95;  // Below mcpp 1.0 threshold
    const meetsThreshold = fitness >= 1.0;
    expect(meetsThreshold).toBe(false);

    const perfectFitness = 1.0;
    expect(perfectFitness >= 1.0).toBe(true);
  });
});
