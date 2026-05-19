/**
 * LIVE rule coverage map — wasm4pm bridge implementations for mcpp AAT-Live rules.
 *
 * Each entry documents which wasm4pm module satisfies the rule and which span/attr
 * pair the mcpp correlation check looks for.
 *
 * Status values:
 *   'covered'   — this bridge emits the required span with required attributes
 *   'partial'   — span is emitted but some required attributes may be missing
 *   'none'      — no wasm4pm bridge covers this rule yet
 */

export type LiveRuleStatus = 'covered' | 'partial' | 'none';

export interface LiveRuleCoverage {
  rule: string;
  description: string;
  requiredSpan: string;
  requiredAttributes: string[];
  status: LiveRuleStatus;
  coveredBy: string | null;
}

export const LIVE_COVERAGE: LiveRuleCoverage[] = [
  {
    rule: 'LIVE-01',
    description: 'All 5 spine spans present in correlated set',
    requiredSpan: 'aat.run | mcp.tool_call | powl.route.evaluate | proof.aggregate | mcpp.verdict.emit',
    requiredAttributes: ['run.id'],
    status: 'covered',
    coveredBy: 'observability/spine-bridge.ts → emitSpineRecord()',
  },
  {
    rule: 'LIVE-02',
    description: 'proof.aggregate carries conformance dimensions',
    requiredSpan: 'proof.aggregate',
    requiredAttributes: ['mcpp.conformance.fitness', 'mcpp.conformance.precision', 'run.id'],
    status: 'covered',
    coveredBy: 'contracts/ocel-bridge.ts → algorithm.complete vmap + observability/spine-bridge.ts',
  },
  {
    rule: 'LIVE-03',
    description: 'Refused verdict carries refusal class',
    requiredSpan: 'refused',
    requiredAttributes: ['mcpp.refusal_class'],
    status: 'covered',
    coveredBy: 'contracts/ocel-bridge.ts → refused verdict vmap',
  },
  {
    rule: 'LIVE-04',
    description: 'Actor cannot emit Accepted (authority check)',
    requiredSpan: 'varies',
    requiredAttributes: ['mcpp.actor.role', 'mcpp.actor.can_emit_accepted'],
    status: 'covered',
    coveredBy: 'observability/streaming-bridge.ts → toMcppLiveCorrelationEvent()',
  },
  {
    rule: 'LIVE-05',
    description: 'Route conformance gap: erlang.actor.spawn with activity enablement proof',
    requiredSpan: 'erlang.actor.spawn',
    requiredAttributes: ['mcpp.activity.id', 'powl.activity.id', 'powl.activity.predecessors_satisfied', 'powl.activity.objects_valid'],
    status: 'covered',
    coveredBy: 'observability/spine-bridge.ts → emitErlangActorSpawn()',
  },
  {
    rule: 'LIVE-06',
    description: 'Part unbound: wasm.part.invoke with part manifest binding',
    requiredSpan: 'wasm.part.invoke',
    requiredAttributes: ['wasm.part.id', 'wasm.part.manifest_hash', 'mcpp.part_hash', 'mcpp.route_hash'],
    status: 'none',
    coveredBy: null,
  },
  {
    rule: 'LIVE-07',
    description: 'Silent AtomVM skip detection',
    requiredSpan: 'atomvm.detect | atomvm.supported_skip',
    requiredAttributes: ['mcpp.atomvm.state', 'mcpp.atomvm.evidence_ref'],
    status: 'partial',
    coveredBy: 'observability/atomvm-bridge.ts → emitAtomVmDetect/emitAtomVmSupportedSkip (real AtomVM detection requires embedded runtime)',
  },
  {
    rule: 'LIVE-08',
    description: 'Non-LLM origin marker on streaming records',
    requiredSpan: 'varies',
    requiredAttributes: ['service.name', 'mcpp.llm_origin'],
    status: 'covered',
    coveredBy: 'observability/streaming-bridge.ts → service.name: "wasm4pm.streaming" + mcpp.llm_origin: false',
  },
  {
    rule: 'LIVE-09',
    description: 'Gap closure lawful: gap events with correlation_id + alternate_evidence_received',
    requiredSpan: 'powl.gap.detected | powl.gap.closed | powl.gap.exhausted | powl.gap.alternate_evidence_received',
    requiredAttributes: ['powl.gap.correlation_id', 'powl.gap.activity_id'],
    status: 'covered',
    coveredBy: 'swarm/gap-events.ts → emitGapDetected/Closed/Exhausted/AlternateEvidence (14 tests)',
  },
  {
    rule: 'LIVE-10',
    description: 'Cross-enterprise relay: a2a.message with relay signature verification',
    requiredSpan: 'a2a.message | a2a.message.relay_send | a2a.message.relay_receive | a2a.message.relay_forward',
    requiredAttributes: ['relay.cross_enterprise', 'relay.id', 'relay.signature', 'relay.signature_verified', 'relay.freshness_valid'],
    status: 'partial',
    coveredBy: 'observability/relay-bridge.ts → emitA2aMessage/RelaySend/RelayReceive/RelayForward (all 5 required attributes; cryptographic verification performed by BEAM runtime)',
  },
  {
    rule: 'LIVE-11',
    description: 'Real BEAM spawn latency: erlang.actor.spawn → powl.route.evaluate delta ≤ 500ms',
    requiredSpan: 'erlang.actor.spawn | powl.route.evaluate',
    requiredAttributes: ['ts_ns'],
    status: 'partial',
    coveredBy: 'observability/spine-bridge.ts → computeSpawnLatencyMs() (delta ≤ 500ms check; real BEAM spawn requires BEAM runtime)',
  },
  {
    rule: 'LIVE-12',
    description: 'OTel export success span with positive span_count after flush',
    requiredSpan: 'otel.trace.export_success',
    requiredAttributes: ['otel.exporter.span_count'],
    status: 'covered',
    coveredBy: 'observability/otel-exporter.ts → doFlush() with events.length > 0 guard (span_count is always >0 when span exists)',
  },
  {
    rule: 'LIVE-13',
    description: 'Receipt signed by live aggregator: receipt.emit with signer=proof_aggregator',
    requiredSpan: 'receipt.emit',
    requiredAttributes: ['mcpp.receipt.signer', 'mcpp.receipt.signature'],
    status: 'covered',
    coveredBy: 'contracts/receipt-emit-bridge.ts → emitReceiptEmit() (signer: "proof_aggregator", signature: output_hash)',
  },
  {
    rule: 'LIVE-14',
    description: 'Distributed aggregator origin: mcpp.verdict.emit in ModeC_Distributed with proof_aggregator role',
    requiredSpan: 'mcpp.verdict.emit | erlang.actor.spawn',
    requiredAttributes: ['mcpp.runtime.mode', 'mcpp.actor.role', 'mcpp.actor.can_emit_accepted'],
    status: 'partial',
    coveredBy: 'observability/spine-bridge.ts → emitMcppVerdict (runtimeMode field covers mcpp.runtime.mode; full ModeC_Distributed requires BEAM runtime)',
  },
  {
    rule: 'LIVE-15',
    description: 'Healthcare privacy compliance: patient data with consent present',
    requiredSpan: 'any',
    requiredAttributes: ['mcpp.healthcare.patient_data', 'mcpp.consent_present'],
    status: 'partial',
    coveredBy: 'observability/healthcare-bridge.ts → emitHealthcarePrivacyCheck',
  },
  {
    rule: 'LIVE-16',
    description: 'MedWatch temporal filing compliance gate',
    requiredSpan: 'any',
    requiredAttributes: ['fda.medwatch.filing', 'mcpp.healthcare.awareness_timestamp'],
    status: 'partial',
    coveredBy: 'observability/healthcare-bridge.ts → emitMedWatchFiling',
  },
];

/** Returns all rules with status 'covered'. */
export function coveredRules(): LiveRuleCoverage[] {
  return LIVE_COVERAGE.filter(r => r.status === 'covered');
}

/** Returns all rules with status 'none' or 'partial'. */
export function uncoveredRules(): LiveRuleCoverage[] {
  return LIVE_COVERAGE.filter(r => r.status !== 'covered');
}

/** Coverage ratio: covered / total. */
export function coverageRatio(): number {
  return coveredRules().length / LIVE_COVERAGE.length;
}
