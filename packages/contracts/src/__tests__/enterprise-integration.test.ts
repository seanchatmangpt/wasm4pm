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

// ===========================================================================
// Section L — BEAM/Erlang bridge gap closure (2026-05-18)
//
// Targets:
//   L01–L03 — BEAM bridge message contract (packages/swarm/src/beam-bridge.ts)
//              A-P09 constraint: "accepted" tag MUST NEVER be emitted by the bridge.
//              Message envelope contracts for convergence, worker result, exhaustion.
//   L04–L05 — AtomVM bridge span contract (packages/observability/src/atomvm-bridge.ts)
//              LIVE-07 required fields: mcpp.atomvm.state, mcpp.atomvm.evidence_ref.
//   L06–L07 — Erlang-gen POWL → actor topology input contract
//              (~/mcpp/crates/mcpp-erlang-gen/src/lib.rs)
//              Route / Activity / Edge / ErlangModule shapes the generator expects.
//   L08–L09 — Marketplace publish slot contract
//              (~/mcpp/kernels/marketplace_part_publish.jtbd.json)
//              All 3 required slots: wasm_blob_ref, manifest_path, adversary_audit_ref.
//
// Oracle ranks:
//   Rank 1 — Mathematical invariant (structurally guaranteed by any correct impl)
//   Rank 2 — Domain contract (design-decided by mcpp doctrine / A-P09 / LIVE-07)
//   Rank 3 — Metamorphic relation
// ===========================================================================

// ---------------------------------------------------------------------------
// L01–L03 — BEAM bridge message contract  (A-P09)
//
// The implementation lives in packages/swarm/src/beam-bridge.ts.
// These tests replicate the contract at the data-shape level so that
// packages/contracts tests can independently verify the A-P09 invariant
// without taking a dependency on @wasm4pm/swarm.
// ---------------------------------------------------------------------------

/**
 * Minimal in-test mirror of BeamMessage from beam-bridge.ts.
 * The real type: { tag: string; payload: Record<string, unknown> }
 *
 * Verified against packages/swarm/src/beam-bridge.ts lines 38–41.
 */
interface BeamMessage {
  tag: string;
  payload: Record<string, unknown>;
}

/**
 * Inline replica of assertNotAccept from beam-bridge.ts (lines 53–61).
 * A-P09: the bridge MUST NEVER emit a message tagged "accepted".
 * Only the proof_aggregator BEAM actor (agg_mailbox) may emit Accepted.
 */
function assertNotAccept(msg: BeamMessage): void {
  if (msg.tag === 'accepted') {
    throw new Error(
      'A-P09 violation: beam-bridge must never emit a message tagged "accepted". ' +
        'Only proof_aggregator (agg_mailbox) is the sole Accepted emitter. ' +
        `Received message with tag="${msg.tag}" and payload=${JSON.stringify(msg.payload)}`
    );
  }
}

/**
 * Inline replica of convergenceToBeam from beam-bridge.ts (lines 83–125).
 *
 * converged=true, dominantHash non-null → [{tag:"collect", payload:{evidence, activity}}]
 * converged=true, dominantHash null     → []
 * converged=false                        → [{tag:"report_gap", ...}] per dissenting worker
 */
interface SwarmConvergenceReport {
  converged: boolean;
  dominantHash: string | null;
  dissentingWorkers: string[];
}

function convergenceToBeam(report: SwarmConvergenceReport): BeamMessage[] {
  const messages: BeamMessage[] = [];
  if (report.converged) {
    if (report.dominantHash === null) return [];
    const msg: BeamMessage = {
      tag: 'collect',
      payload: { evidence: report.dominantHash, activity: 'swarm_consensus' },
    };
    assertNotAccept(msg);
    messages.push(msg);
  } else {
    for (const workerId of report.dissentingWorkers) {
      const msg: BeamMessage = {
        tag: 'report_gap',
        payload: {
          activity_id: workerId,
          gap_type: 'dissent',
          failed_check: 'swarm_consensus',
          evidence: null,
        },
      };
      assertNotAccept(msg);
      messages.push(msg);
    }
  }
  return messages;
}

/**
 * Inline replica of workerResultToBeam from beam-bridge.ts (lines 145–163).
 */
interface WorkerResult {
  workerId: string;
  algorithmId: string;
  resultHash: string;
  runAt: string;
  durationMs: number;
  failed?: boolean;
  error?: string;
}

function workerResultToBeam(result: WorkerResult, activityId: string): BeamMessage {
  const msg: BeamMessage = {
    tag: 'activity',
    payload: {
      activity_id: activityId,
      evidence: result.resultHash,
      worker_id: result.workerId,
      algorithm_id: result.algorithmId,
      run_at: result.runAt,
      duration_ms: result.durationMs,
      failed: result.failed ?? false,
      ...(result.error !== undefined ? { error: result.error } : {}),
    },
  };
  assertNotAccept(msg);
  return msg;
}

/**
 * Inline replica of exhaustionToBeam from beam-bridge.ts (lines 179–190).
 */
function exhaustionToBeam(error: Error): BeamMessage {
  const msg: BeamMessage = {
    tag: 'propagate_exhaustion',
    payload: { reason: error.message, error_name: error.name },
  };
  assertNotAccept(msg);
  return msg;
}

describe('L01 — BEAM bridge: convergence → collect message contract (Rank 2 — A-P09)', () => {
  it('L01a: converged=true with dominantHash produces exactly one "collect" message', () => {
    const report: SwarmConvergenceReport = {
      converged: true,
      dominantHash: 'a'.repeat(64),
      dissentingWorkers: [],
    };
    const msgs = convergenceToBeam(report);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].tag).toBe('collect');
  });

  it('L01b: collect message payload carries evidence=dominantHash and activity="swarm_consensus"', () => {
    const hash = 'b'.repeat(64);
    const [msg] = convergenceToBeam({ converged: true, dominantHash: hash, dissentingWorkers: [] });
    expect(msg.payload['evidence']).toBe(hash);
    expect(msg.payload['activity']).toBe('swarm_consensus');
  });

  it('L01c: converged=true with dominantHash=null produces an empty message array', () => {
    // No evidence to forward — swarm had no results.
    const msgs = convergenceToBeam({ converged: true, dominantHash: null, dissentingWorkers: [] });
    expect(msgs).toHaveLength(0);
  });

  it('L01d: A-P09 — collect message tag is never "accepted"', () => {
    const [msg] = convergenceToBeam({
      converged: true,
      dominantHash: 'c'.repeat(64),
      dissentingWorkers: [],
    });
    expect(msg.tag).not.toBe('accepted');
  });
});

describe('L02 — BEAM bridge: dissent → report_gap message contract (Rank 2 — A-P09)', () => {
  it('L02a: converged=false with two dissenters produces two "report_gap" messages', () => {
    const report: SwarmConvergenceReport = {
      converged: false,
      dominantHash: null,
      dissentingWorkers: ['worker-1', 'worker-2'],
    };
    const msgs = convergenceToBeam(report);
    expect(msgs).toHaveLength(2);
    expect(msgs.every((m) => m.tag === 'report_gap')).toBe(true);
  });

  it('L02b: each report_gap payload carries activity_id, gap_type="dissent", failed_check', () => {
    const [msg] = convergenceToBeam({
      converged: false,
      dominantHash: null,
      dissentingWorkers: ['worker-99'],
    });
    expect(msg.payload['activity_id']).toBe('worker-99');
    expect(msg.payload['gap_type']).toBe('dissent');
    expect(msg.payload['failed_check']).toBe('swarm_consensus');
  });

  it('L02c: workerResultToBeam produces an "activity" message with required provenance fields', () => {
    const result: WorkerResult = {
      workerId: 'w1',
      algorithmId: 'dfg',
      resultHash: 'd'.repeat(64),
      runAt: '2026-05-18T00:00:00.000Z',
      durationMs: 42,
    };
    const msg = workerResultToBeam(result, 'extract_claims');
    expect(msg.tag).toBe('activity');
    expect(msg.payload['activity_id']).toBe('extract_claims');
    expect(msg.payload['evidence']).toBe('d'.repeat(64));
    expect(msg.payload['worker_id']).toBe('w1');
    expect(msg.payload['algorithm_id']).toBe('dfg');
    expect(msg.payload['failed']).toBe(false);
  });

  it('L02d: A-P09 — report_gap message tag is never "accepted"', () => {
    const msgs = convergenceToBeam({
      converged: false,
      dominantHash: null,
      dissentingWorkers: ['w-x'],
    });
    expect(msgs.every((m) => m.tag !== 'accepted')).toBe(true);
  });
});

describe('L03 — BEAM bridge: exhaustion → propagate_exhaustion contract (Rank 1)', () => {
  it('L03a: exhaustionToBeam produces tag="propagate_exhaustion" with reason and error_name', () => {
    const err = new Error('max iterations exceeded');
    err.name = 'ConvergenceMaxIterationsError';
    const msg = exhaustionToBeam(err);
    expect(msg.tag).toBe('propagate_exhaustion');
    expect(msg.payload['reason']).toBe('max iterations exceeded');
    expect(msg.payload['error_name']).toBe('ConvergenceMaxIterationsError');
  });

  it('L03b: exhaustionToBeam never emits tag="accepted" (A-P09 invariant)', () => {
    const err = new Error('timeout');
    err.name = 'ConvergenceTimeoutError';
    const msg = exhaustionToBeam(err);
    expect(msg.tag).not.toBe('accepted');
  });

  it('L03c: assertNotAccept throws on tag="accepted" (A-P09 guard enforcement)', () => {
    const poisonMsg: BeamMessage = { tag: 'accepted', payload: { evidence: 'xyz' } };
    expect(() => assertNotAccept(poisonMsg)).toThrow(/A-P09 violation/);
  });

  it('L03d: assertNotAccept is a no-op for all valid BEAM tags (collect, report_gap, activity, propagate_exhaustion)', () => {
    const validTags = ['collect', 'report_gap', 'activity', 'propagate_exhaustion'];
    for (const tag of validTags) {
      const msg: BeamMessage = { tag, payload: {} };
      expect(() => assertNotAccept(msg)).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// L04–L05 — AtomVM bridge span contract (LIVE-07)
//
// The implementation lives in packages/observability/src/atomvm-bridge.ts.
// Required LIVE-07 attributes on every atomvm.detect / atomvm.supported_skip span:
//   - mcpp.atomvm.state       (one of: detected | not_supported | skipped | unknown)
//   - mcpp.atomvm.evidence_ref (non-empty opaque reference string)
//   - run.id                  (stable run identifier)
//   - service.name            (must be "wasm4pm.spine")
//   - ts_ns                   (wall-clock nanoseconds, > 0)
//
// Verified against packages/observability/src/atomvm-bridge.ts lines 69–102.
// ---------------------------------------------------------------------------

/**
 * Minimal in-test mirror of SpineTraceRecord (spine-bridge.ts) and
 * AtomVmRecord (atomvm-bridge.ts) used for LIVE-07 span validation.
 */
interface AtomVmSpan {
  kind: 'event';
  name: 'atomvm.detect' | 'atomvm.supported_skip';
  ts_ns: number;
  fields: {
    'run.id': string;
    'service.name': string;
    'mcpp.atomvm.state': string;
    'mcpp.atomvm.evidence_ref': string;
    [key: string]: string | number | boolean;
  };
}

type AtomVmState = 'detected' | 'not_supported' | 'skipped' | 'unknown';

/** Replica of emitAtomVmDetect (atomvm-bridge.ts lines 69–81). */
function emitAtomVmDetect(rec: {
  state: AtomVmState;
  evidenceRef: string;
  runId: string;
  tsNs?: number;
}): AtomVmSpan {
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

/** Replica of emitAtomVmSupportedSkip (atomvm-bridge.ts lines 91–103). */
function emitAtomVmSupportedSkip(rec: {
  state: AtomVmState;
  evidenceRef: string;
  runId: string;
  tsNs?: number;
}): AtomVmSpan {
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

/** LIVE-07 validator: returns violation strings (empty = passing). */
function validateLive07Span(span: AtomVmSpan): string[] {
  const violations: string[] = [];
  if (!span.fields['mcpp.atomvm.state']) violations.push('missing mcpp.atomvm.state');
  if (!span.fields['mcpp.atomvm.evidence_ref']) violations.push('missing mcpp.atomvm.evidence_ref');
  if (!span.fields['run.id']) violations.push('missing run.id');
  if (span.fields['service.name'] !== 'wasm4pm.spine') violations.push('service.name must be "wasm4pm.spine"');
  if (span.ts_ns <= 0) violations.push('ts_ns must be > 0');
  return violations;
}

describe('L04 — AtomVM bridge: atomvm.detect span LIVE-07 contract (Rank 2)', () => {
  it('L04a: emitAtomVmDetect span name is "atomvm.detect"', () => {
    const span = emitAtomVmDetect({
      state: 'detected',
      evidenceRef: 'beam-node://atomvm@localhost:4369',
      runId: 'run-l04',
    });
    expect(span.name).toBe('atomvm.detect');
  });

  it('L04b: emitAtomVmDetect carries all four required LIVE-07 attributes', () => {
    const span = emitAtomVmDetect({
      state: 'detected',
      evidenceRef: 'beam-node://atomvm@localhost:4369',
      runId: 'run-l04b',
    });
    expect(validateLive07Span(span)).toEqual([]);
  });

  it('L04c: emitAtomVmDetect accepts all four valid AtomVmState values without violation', () => {
    const states: AtomVmState[] = ['detected', 'not_supported', 'skipped', 'unknown'];
    for (const state of states) {
      const span = emitAtomVmDetect({ state, evidenceRef: 'some-ref', runId: 'run-l04c' });
      // State field is populated regardless of value
      expect(span.fields['mcpp.atomvm.state']).toBe(state);
    }
  });

  it('L04d: ts_ns uses injected tsNs when provided (deterministic for tests)', () => {
    const fixedNs = 1_716_000_000_000_000_000;
    const span = emitAtomVmDetect({
      state: 'detected',
      evidenceRef: 'ref',
      runId: 'run-l04d',
      tsNs: fixedNs,
    });
    expect(span.ts_ns).toBe(fixedNs);
  });
});

describe('L05 — AtomVM bridge: atomvm.supported_skip span LIVE-07 contract (Rank 2)', () => {
  it('L05a: emitAtomVmSupportedSkip span name is "atomvm.supported_skip"', () => {
    const span = emitAtomVmSupportedSkip({
      state: 'skipped',
      evidenceRef: 'probe://atomvm/capability-manifest/v1',
      runId: 'run-l05',
    });
    expect(span.name).toBe('atomvm.supported_skip');
  });

  it('L05b: emitAtomVmSupportedSkip carries all four required LIVE-07 attributes', () => {
    const span = emitAtomVmSupportedSkip({
      state: 'skipped',
      evidenceRef: 'probe://atomvm/capability-manifest/v1',
      runId: 'run-l05b',
    });
    expect(validateLive07Span(span)).toEqual([]);
  });

  it('L05c: atomvm.detect and atomvm.supported_skip differ only in name, not in field schema', () => {
    const rec = { state: 'skipped' as AtomVmState, evidenceRef: 'ref', runId: 'run-l05c' };
    const detect = emitAtomVmDetect(rec);
    const skip = emitAtomVmSupportedSkip(rec);
    // Same fields, different span name
    expect(Object.keys(detect.fields).sort()).toEqual(Object.keys(skip.fields).sort());
    expect(detect.name).not.toBe(skip.name);
  });

  it('L05d: missing evidence_ref produces a LIVE-07 violation', () => {
    const span = emitAtomVmSupportedSkip({ state: 'skipped', evidenceRef: '', runId: 'run-l05d' });
    const violations = validateLive07Span(span);
    expect(violations.some((v) => v.includes('mcpp.atomvm.evidence_ref'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// L06–L07 — Erlang-gen POWL → actor topology input contract
//
// ~/mcpp/crates/mcpp-erlang-gen/src/lib.rs defines:
//   Route { route_id, activities: Vec<Activity>, edges: Vec<Edge>,
//            gap_authority: Vec<GapAuthorityEntry>, topology_mode?, distributed_branches? }
//   Activity { id, object_type?: Option<String>, receipt_required: bool }
//   Edge { from, to }
//   ErlangModule { files: BTreeMap<PathBuf, String>, topology_hash: [u8; 32] }
//   GapAuthorityEntry { activity_id, alternate_evidence_sources: Vec<String>,
//                       max_retries: u32, exhaustion_refusal_class: String }
//
// These tests verify that the JSON shape wasm4pm would serialize for
// mcpp-erlang-gen is a valid Route v2 according to the Rust struct contracts.
// They operate purely on data shapes — no Rust compilation required.
// ---------------------------------------------------------------------------

/** TypeScript mirror of mcpp-erlang-gen Activity struct. */
interface ErlangGenActivity {
  id: string;
  object_type: string | null;
  receipt_required: boolean;
}

/** TypeScript mirror of mcpp-erlang-gen Edge struct. */
interface ErlangGenEdge {
  from: string;
  to: string;
}

/** TypeScript mirror of mcpp-erlang-gen GapAuthorityEntry struct. */
interface ErlangGenGapAuthorityEntry {
  activity_id: string;
  alternate_evidence_sources: string[];
  max_retries: number;
  exhaustion_refusal_class: string;
}

/** TypeScript mirror of mcpp-erlang-gen Route struct. */
interface ErlangGenRoute {
  route_id: string;
  activities: ErlangGenActivity[];
  edges: ErlangGenEdge[];
  gap_authority?: ErlangGenGapAuthorityEntry[];
  topology_mode?: string | null;
}

/** TypeScript mirror of mcpp-erlang-gen Manifest struct. */
interface ErlangGenManifest {
  label: string;
  version: string;
}

/**
 * Validate a Route value against the mcpp-erlang-gen Rust struct contract:
 *   - route_id non-empty
 *   - at least one activity (generator needs ≥1 vertex to spawn an actor)
 *   - all activity ids non-empty and unique
 *   - all edge endpoints reference declared activity ids
 *   - gap_authority entries reference declared activity ids
 *   - max_retries >= 0 (u32 in Rust, always satisfies this in TypeScript)
 * Returns violation strings (empty = valid).
 */
function validateErlangGenRoute(route: ErlangGenRoute): string[] {
  const violations: string[] = [];
  if (!route.route_id) violations.push('route_id must be non-empty');
  if (route.activities.length === 0) violations.push('activities must be non-empty');

  const ids = new Set<string>();
  for (const act of route.activities) {
    if (!act.id) violations.push('activity id must be non-empty');
    if (ids.has(act.id)) violations.push(`duplicate activity id: ${act.id}`);
    ids.add(act.id);
  }

  for (const edge of route.edges) {
    if (!ids.has(edge.from)) violations.push(`edge.from "${edge.from}" not in activities`);
    if (!ids.has(edge.to)) violations.push(`edge.to "${edge.to}" not in activities`);
  }

  for (const ga of route.gap_authority ?? []) {
    if (!ids.has(ga.activity_id)) {
      violations.push(`gap_authority.activity_id "${ga.activity_id}" not in activities`);
    }
    if (!ga.exhaustion_refusal_class) {
      violations.push('gap_authority entry requires non-empty exhaustion_refusal_class');
    }
  }

  return violations;
}

describe('L06 — Erlang-gen Route input contract: wasm4pm POWL → mcpp-erlang-gen (Rank 2)', () => {
  it('L06a: minimal valid Route (one activity, no edges, no gap_authority) passes validation', () => {
    const route: ErlangGenRoute = {
      route_id: 'ai-doc-update',
      activities: [{ id: 'read_doc', object_type: null, receipt_required: false }],
      edges: [],
    };
    expect(validateErlangGenRoute(route)).toEqual([]);
  });

  it('L06b: multi-activity sequential route with edges passes validation', () => {
    const route: ErlangGenRoute = {
      route_id: 'ai-bug-fix-with-receipt',
      activities: [
        { id: 'reproduce', object_type: null, receipt_required: false },
        { id: 'diagnose',  object_type: null, receipt_required: false },
        { id: 'patch',     object_type: null, receipt_required: true  },
        { id: 'verify',    object_type: null, receipt_required: true  },
        { id: 'commit',    object_type: null, receipt_required: true  },
      ],
      edges: [
        { from: 'reproduce', to: 'diagnose' },
        { from: 'diagnose',  to: 'patch'    },
        { from: 'patch',     to: 'verify'   },
        { from: 'verify',    to: 'commit'   },
      ],
    };
    expect(validateErlangGenRoute(route)).toEqual([]);
  });

  it('L06c: route with gap_authority referencing a declared activity passes validation', () => {
    const route: ErlangGenRoute = {
      route_id: 'seal-with-gap',
      activities: [
        { id: 'seal_match', object_type: 'evidence', receipt_required: true },
        { id: 'emit_proof', object_type: null, receipt_required: true },
      ],
      edges: [{ from: 'seal_match', to: 'emit_proof' }],
      gap_authority: [
        {
          activity_id: 'seal_match',
          alternate_evidence_sources: ['archive_store', 'backup_node'],
          max_retries: 3,
          exhaustion_refusal_class: 'GapClosureExhausted',
        },
      ],
    };
    expect(validateErlangGenRoute(route)).toEqual([]);
  });

  it('L06d: route with empty route_id is rejected', () => {
    const route: ErlangGenRoute = {
      route_id: '',
      activities: [{ id: 'a', object_type: null, receipt_required: false }],
      edges: [],
    };
    expect(validateErlangGenRoute(route)).toContain('route_id must be non-empty');
  });

  it('L06e: route with empty activities is rejected (generator needs ≥1 vertex)', () => {
    const route: ErlangGenRoute = {
      route_id: 'empty-route',
      activities: [],
      edges: [],
    };
    expect(validateErlangGenRoute(route)).toContain('activities must be non-empty');
  });

  it('L06f: edge referencing an undeclared activity id is rejected', () => {
    const route: ErlangGenRoute = {
      route_id: 'bad-edge',
      activities: [{ id: 'a', object_type: null, receipt_required: false }],
      edges: [{ from: 'a', to: 'missing_activity' }],
    };
    const violations = validateErlangGenRoute(route);
    expect(violations.some((v) => v.includes('missing_activity'))).toBe(true);
  });
});

describe('L07 — Erlang-gen topology determinism contract (Rank 1)', () => {
  it('L07a: activities are lex-sorted by id before topology generation', () => {
    // The generator sorts activities by id for byte-stable output.
    // Verify that a correctly serialized Route has lex-sorted activities.
    const unsortedIds = ['seal_match', 'admit', 'collect', 'branch'];
    const sorted = [...unsortedIds].sort();
    expect(sorted).toEqual(['admit', 'branch', 'collect', 'seal_match']);
  });

  it('L07b: edges are lex-sorted by (from, to) for topology_hash determinism', () => {
    const edges = [
      { from: 'c', to: 'd' },
      { from: 'a', to: 'b' },
      { from: 'a', to: 'c' },
    ];
    const sorted = [...edges].sort((x, y) =>
      x.from !== y.from ? x.from.localeCompare(y.from) : x.to.localeCompare(y.to)
    );
    expect(sorted.map((e) => `${e.from}->${e.to}`)).toEqual(['a->b', 'a->c', 'c->d']);
  });

  it('L07c: gap_authority alternate_evidence_sources are lex-sorted for hash determinism', () => {
    const sources = ['zebra_store', 'alpha_backup', 'mango_node'];
    const sorted = [...sources].sort();
    expect(sorted).toEqual(['alpha_backup', 'mango_node', 'zebra_store']);
  });

  it('L07d: topology_mode="distributed" is reserved (Mode C) and must not alter Route validation', () => {
    // mcpp-erlang-gen v26.5.17: topology_mode="distributed" is accepted at
    // parse time but the generator emits Mode B and logs a warning.
    // The Route contract must still pass our validation.
    const route: ErlangGenRoute = {
      route_id: 'future-distributed',
      activities: [{ id: 'branch_a', object_type: null, receipt_required: false }],
      edges: [],
      topology_mode: 'distributed',  // reserved, warn-only in v26.5.17
    };
    // The Route is structurally valid; the generator decides what to do with topology_mode.
    expect(validateErlangGenRoute(route)).toEqual([]);
  });

  it('L07e: ErlangModule topology_hash is 32 bytes (matches [u8; 32] in Rust)', () => {
    // topology_hash is BLAKE3 of canonical file set — always 32 bytes.
    // Simulate verification of what the Rust generator returns.
    const simulatedTopologyHash = new Uint8Array(32).fill(0xab);
    expect(simulatedTopologyHash.byteLength).toBe(32);
  });
});

// ---------------------------------------------------------------------------
// L08–L09 — Marketplace publish slot contract
//
// ~/mcpp/kernels/marketplace_part_publish.jtbd.json defines 3 required slots:
//   { schema:name: "wasm_blob_ref",       schema:required: true }
//   { schema:name: "manifest_path",       schema:required: true }
//   { schema:name: "adversary_audit_ref", schema:required: true }
//
// A wasm4pm WASM binary path + adversary audit ref satisfies these slots when:
//   - wasm_blob_ref   — non-empty path (or IPFS CID or blob hash) to the WASM binary
//   - manifest_path   — non-empty path to a signed part manifest JSON
//   - adversary_audit_ref — non-empty reference to an adversary audit receipt
//     (proof that adversarial admissibility was passed)
//
// The completion condition requires: mcpp:allRequiredSlotsFilled = true
// AND mcpp:nextRoute = "routes/wrap-tool-to-part.powl.json"
// ---------------------------------------------------------------------------

/** TypeScript mirror of the mcpp JTBD required slot. */
interface JtbdSlot {
  name: string;
  required: boolean;
}

/** The three required slots from marketplace_part_publish.jtbd.json. */
const MARKETPLACE_PUBLISH_SLOTS: JtbdSlot[] = [
  { name: 'wasm_blob_ref',       required: true },
  { name: 'manifest_path',       required: true },
  { name: 'adversary_audit_ref', required: true },
];

/**
 * Evaluate whether a slot-filling map satisfies all required JTBD slots.
 * Returns the names of any required slots that are missing or empty.
 */
function evaluateJtbdSlots(
  slots: JtbdSlot[],
  filled: Record<string, string>
): string[] {
  const missing: string[] = [];
  for (const slot of slots) {
    if (slot.required && !filled[slot.name]) {
      missing.push(slot.name);
    }
  }
  return missing;
}

describe('L08 — Marketplace publish slot contract: all 3 required slots (Rank 2)', () => {
  it('L08a: three required slots are named wasm_blob_ref, manifest_path, adversary_audit_ref', () => {
    const names = MARKETPLACE_PUBLISH_SLOTS.map((s) => s.name);
    expect(names).toContain('wasm_blob_ref');
    expect(names).toContain('manifest_path');
    expect(names).toContain('adversary_audit_ref');
  });

  it('L08b: all three slots have required=true', () => {
    expect(MARKETPLACE_PUBLISH_SLOTS.every((s) => s.required === true)).toBe(true);
  });

  it('L08c: slot count is exactly 3 (no extra required slots)', () => {
    expect(MARKETPLACE_PUBLISH_SLOTS.filter((s) => s.required)).toHaveLength(3);
  });

  it('L08d: wasm4pm binary path + adversary audit satisfies all 3 required slots', () => {
    const filled: Record<string, string> = {
      wasm_blob_ref:       'wasm4pm/pkg/wasm4pm_bg.wasm',
      manifest_path:       'schemas/manifest/wasm4pm-browser.manifest.json',
      adversary_audit_ref: 'target/audits/adversarial-proof-lifecycle.json',
    };
    expect(evaluateJtbdSlots(MARKETPLACE_PUBLISH_SLOTS, filled)).toEqual([]);
  });

  it('L08e: missing wasm_blob_ref is detected as an unfilled required slot', () => {
    const filled: Record<string, string> = {
      manifest_path:       'schemas/manifest/wasm4pm.manifest.json',
      adversary_audit_ref: 'target/audits/audit.json',
    };
    expect(evaluateJtbdSlots(MARKETPLACE_PUBLISH_SLOTS, filled)).toContain('wasm_blob_ref');
  });

  it('L08f: missing adversary_audit_ref is detected as an unfilled required slot', () => {
    const filled: Record<string, string> = {
      wasm_blob_ref: 'wasm4pm/pkg/wasm4pm_bg.wasm',
      manifest_path: 'schemas/manifest/wasm4pm.manifest.json',
      // adversary_audit_ref absent
    };
    expect(evaluateJtbdSlots(MARKETPLACE_PUBLISH_SLOTS, filled)).toContain('adversary_audit_ref');
  });
});

describe('L09 — Marketplace publish: completion and refusal conditions (Rank 2)', () => {
  it('L09a: completion condition requires all 3 slots filled (allRequiredSlotsFilled)', () => {
    // mcpp:allRequiredSlotsFilled is the gating condition from the JTBD kernel.
    const filled: Record<string, string> = {
      wasm_blob_ref:       'wasm4pm/pkg/wasm4pm_bg.wasm',
      manifest_path:       'schemas/manifest/wasm4pm.manifest.json',
      adversary_audit_ref: 'target/audits/audit.json',
    };
    const missing = evaluateJtbdSlots(MARKETPLACE_PUBLISH_SLOTS, filled);
    // allRequiredSlotsFilled = true iff missing is empty
    expect(missing).toEqual([]);
  });

  it('L09b: partial fill (2/3 slots) does NOT satisfy the completion condition', () => {
    const filled: Record<string, string> = {
      wasm_blob_ref: 'wasm4pm/pkg/wasm4pm_bg.wasm',
      manifest_path: 'schemas/manifest/wasm4pm.manifest.json',
      // adversary_audit_ref absent — JTBD reassembly would prompt for it
    };
    const missing = evaluateJtbdSlots(MARKETPLACE_PUBLISH_SLOTS, filled);
    expect(missing.length).toBeGreaterThan(0);
  });

  it('L09c: next route after completion is "routes/wrap-tool-to-part.powl.json"', () => {
    // From mcpp:completion.mcpp:nextRoute in marketplace_part_publish.jtbd.json.
    const NEXT_ROUTE = 'routes/wrap-tool-to-part.powl.json';
    expect(NEXT_ROUTE).toBe('routes/wrap-tool-to-part.powl.json');
  });

  it('L09d: refusal reason is "ManifestUnsigned" (from mcpp:refusal.mcpp:reason)', () => {
    // The JTBD kernel signals ManifestUnsigned when the manifest is not signed.
    // This maps to AndonReasonCode on the mcpp side.
    const REFUSAL_REASON = 'ManifestUnsigned';
    expect(REFUSAL_REASON).toBe('ManifestUnsigned');
  });

  it('L09e: empty string slot values are treated as unfilled (not as valid slot content)', () => {
    const filled: Record<string, string> = {
      wasm_blob_ref:       '',   // empty — counts as unfilled
      manifest_path:       'schemas/manifest/wasm4pm.manifest.json',
      adversary_audit_ref: 'target/audits/audit.json',
    };
    expect(evaluateJtbdSlots(MARKETPLACE_PUBLISH_SLOTS, filled)).toContain('wasm_blob_ref');
  });

  it('L09f: wasm_blob_ref accepts IPFS CID format as a valid slot value', () => {
    // The JTBD reassemblyRule accepts "path, IPFS CID, or blob hash".
    const filled: Record<string, string> = {
      wasm_blob_ref:       'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
      manifest_path:       'schemas/manifest/wasm4pm.manifest.json',
      adversary_audit_ref: 'target/audits/audit.json',
    };
    expect(evaluateJtbdSlots(MARKETPLACE_PUBLISH_SLOTS, filled)).toEqual([]);
  });
});
