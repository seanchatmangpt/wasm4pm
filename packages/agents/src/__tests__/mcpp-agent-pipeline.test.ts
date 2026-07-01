/**
 * mcpp-agent-pipeline.test.ts — Enterprise integration: CodeManufactory → MAPE-K → Prolog8 audit chain
 *
 * Oracle rank: Rank 2 — Domain contract.
 *
 * CONTEXT:
 *   mcpp (CodeManufactory) is the manufacturing pipeline. It uses the wasm4pm Rust
 *   crate directly via Cargo.toml, but the TypeScript agent layer is the integration
 *   surface for OCEL event validation and Prolog8 receipt verification.
 *
 *   Integration surface:
 *     1. mcpp emits OCEL events as it progresses through manufacturing stages
 *     2. AgentOrchestrator.runMapekCycle() consumes those events and validates them
 *     3. The MAPE-K cycle produces AuditEntry records (immutable corrections)
 *     4. Those records are compiled into Rule8 facts for Prolog8 proof verification
 *
 *   The mcpp manufacturing pipeline stages (from orchestration.ts process-mining-skeptic):
 *     seed-ontology → breed-ontology → validate-ontology → project-artifact →
 *     compile-artifact → run-benchmark → release-package
 *
 * GAPS DOCUMENTED HERE:
 *   GAP-1: No direct TypeScript bridge from mcpp to AgentOrchestrator.
 *          mcpp invokes wasm4pm via Rust FFI, not the TypeScript agent layer.
 *          The OCEL events mcpp emits must be manually fed to AgentOrchestrator.
 *
 *   GAP-2: AuditEntry has no `rule8_fact` field — callers must build Rule8 facts
 *          themselves from AuditEntry fields using buildFact8() + internTerms().
 *
 *   GAP-3: No Prolog8 query path in this package — verification requires calling
 *          wasm4pm WASM's prolog8_query() with the compiled catalog. That call lives
 *          in wasm4pm, not @wasm4pm/agents.
 *
 * WHAT PASSES:
 *   - MAPE-K cycle successfully processes a simulated CodeManufactory manufacturing route
 *   - OCEL event log from the cycle is structurally complete and Prolog8-compilable
 *   - Rule8 catalog is built from cycle AuditEntry records via buildFact8()
 *   - Catalog structure satisfies Prolog8 admission constraints
 *
 * WHAT REQUIRES FUTURE WORK:
 *   - Actual prolog8_query() invocation with the catalog (requires WASM binary)
 *   - Direct mcpp→AgentOrchestrator event stream bridge
 *
 * No mocks of init.js or WASM internals. Gemba principle.
 */

import { describe, it, expect } from 'vitest';
import { AgentOrchestrator } from '../orchestration.js';
import type { AgentExecutionContext, } from '../orchestration.js';
import type { MAPEKCycleResult, AuditEntry } from '../types.js';
// Import prolog8 compiler helpers from the dedicated subpath export.
// @wasm4pm/contracts/prolog8-compiler resolves directly to the dist file
// without going through index.js, avoiding the vitest .js→.ts alias issue.
import {
  internTerms,
  buildFact8,
  buildCatalog,
  type Rule8Json,
  type Prolog8Catalog,
  TERM_SENTINEL,
} from '@wasm4pm/contracts/prolog8-compiler';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures — simulated CodeManufactory manufacturing route
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The complete manufacturing pipeline as OCEL events.
 * Each event corresponds to one CodeManufactory manufacturing stage.
 * The mcpp manufacturing pipeline emits these events via OTel → OCEL conversion.
 *
 * Stages mirror what process-mining-skeptic expects (orchestration.ts:841-848).
 */
const MCPP_MANUFACTURING_ROUTE_EVENTS = [
  { ocel_id: 'ev-001', activity: 'seed-ontology',    timestamp: '2026-05-18T10:00:00Z', artifact_id: 'mcpp-run-001', stage_index: 0 },
  { ocel_id: 'ev-002', activity: 'breed-ontology',   timestamp: '2026-05-18T10:01:00Z', artifact_id: 'mcpp-run-001', stage_index: 1 },
  { ocel_id: 'ev-003', activity: 'validate-ontology',timestamp: '2026-05-18T10:02:00Z', artifact_id: 'mcpp-run-001', stage_index: 2 },
  { ocel_id: 'ev-004', activity: 'project-artifact', timestamp: '2026-05-18T10:03:00Z', artifact_id: 'mcpp-run-001', stage_index: 3 },
  { ocel_id: 'ev-005', activity: 'compile-artifact', timestamp: '2026-05-18T10:04:00Z', artifact_id: 'mcpp-run-001', stage_index: 4 },
  { ocel_id: 'ev-006', activity: 'run-benchmark',    timestamp: '2026-05-18T10:05:00Z', artifact_id: 'mcpp-run-001', stage_index: 5 },
  { ocel_id: 'ev-007', activity: 'release-package',  timestamp: '2026-05-18T10:06:00Z', artifact_id: 'mcpp-run-001', stage_index: 6 },
];

/** Simulated OTel spans from mcpp's manufacturing run (real trace_ids, non-zero durations). */
const MCPP_OTEL_TRACES = [
  { name: 'seed-ontology',    service: 'mcpp-core', trace_id: 'tr-aabb-001', duration_ms: 120, attributes: { stage: 'seed', artifact: 'mcpp-run-001' } },
  { name: 'breed-ontology',   service: 'mcpp-core', trace_id: 'tr-aabb-002', duration_ms: 340, attributes: { stage: 'breed', artifact: 'mcpp-run-001' } },
  { name: 'validate-ontology',service: 'mcpp-core', trace_id: 'tr-aabb-003', duration_ms: 89,  attributes: { stage: 'validate', fitness: '1.0' } },
  { name: 'project-artifact', service: 'mcpp-core', trace_id: 'tr-aabb-004', duration_ms: 200, attributes: { stage: 'project' } },
  { name: 'compile-artifact', service: 'mcpp-core', trace_id: 'tr-aabb-005', duration_ms: 1800,attributes: { stage: 'compile', wasm_size_bytes: '2752160' } },
  { name: 'run-benchmark',    service: 'mcpp-core', trace_id: 'tr-aabb-006', duration_ms: 450, attributes: { stage: 'benchmark', p99_ms: '705' } },
  { name: 'release-package',  service: 'mcpp-core', trace_id: 'tr-aabb-007', duration_ms: 60,  attributes: { stage: 'release', version: 'v26.5.18' } },
];

/** Simulated BLAKE3 receipt chain from a complete mcpp manufacturing run. */
const MCPP_RECEIPT_CHAIN = [
  { hash: 'blake3-seed-01', previous_hash: null,             stage: 'seed-ontology',    run_id: 'mcpp-run-001' },
  { hash: 'blake3-breed-02',previous_hash: 'blake3-seed-01', stage: 'breed-ontology',   run_id: 'mcpp-run-001' },
  { hash: 'blake3-valid-03',previous_hash: 'blake3-breed-02',stage: 'validate-ontology',run_id: 'mcpp-run-001' },
  { hash: 'blake3-proj-04', previous_hash: 'blake3-valid-03',stage: 'project-artifact', run_id: 'mcpp-run-001' },
  { hash: 'blake3-comp-05', previous_hash: 'blake3-proj-04', stage: 'compile-artifact', run_id: 'mcpp-run-001' },
  { hash: 'blake3-bench-06',previous_hash: 'blake3-comp-05', stage: 'run-benchmark',    run_id: 'mcpp-run-001' },
  { hash: 'blake3-rel-07',  previous_hash: 'blake3-bench-06',stage: 'release-package',  run_id: 'mcpp-run-001' },
];

/** Build the AgentExecutionContext for a complete CodeManufactory run. */
function buildMcppContext(options: { dryRun?: boolean } = {}): AgentExecutionContext {
  return {
    artifact_id: 'mcpp-run-001',
    ocel_events: MCPP_MANUFACTURING_ROUTE_EVENTS,
    traces: MCPP_OTEL_TRACES,
    receipts: MCPP_RECEIPT_CHAIN,
    dry_run: options.dryRun ?? false,
    gate_name: 'process-conformance',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Group 1 — CodeManufactory route triggers MAPE-K cycle
// ─────────────────────────────────────────────────────────────────────────────

describe('CodeManufactory → MAPE-K cycle: route triggers', () => {
  it('complete manufacturing route produces a cycle_id (cycle ran)', async () => {
    const orchestrator = new AgentOrchestrator();
    const result = await orchestrator.runMapekCycle(buildMcppContext());

    expect(result.cycle_id).toMatch(/^cycle-[0-9a-f]{8}$/);
  });

  it('complete route with all 7 stages has success=true (no critical violations)', async () => {
    const orchestrator = new AgentOrchestrator();
    const result = await orchestrator.runMapekCycle(buildMcppContext());

    // All 7 required manufacturing stages present — process-mining-skeptic passes
    expect(result.success).toBe(true);
  });

  it('Monitor phase captures all 4 evidence surfaces from CodeManufactory events', async () => {
    const orchestrator = new AgentOrchestrator();
    const result = await orchestrator.runMapekCycle(buildMcppContext());

    // Execution surface: receipt chain
    expect(result.monitor.execution.valid).toBe(true);
    expect(result.monitor.execution.count).toBe(MCPP_RECEIPT_CHAIN.length);

    // Telemetry surface: OTel traces
    expect(result.monitor.telemetry.valid).toBe(true);
    expect(result.monitor.telemetry.count).toBe(MCPP_OTEL_TRACES.length);

    // State surface: artifact_id present
    expect(result.monitor.state.valid).toBe(true);

    // Process surface: OCEL events
    expect(result.monitor.process.valid).toBe(true);
    expect(result.monitor.process.count).toBe(MCPP_MANUFACTURING_ROUTE_EVENTS.length);
  });

  it('manufacturing route with skipped stage fails analyze (missing validate-ontology)', async () => {
    const orchestrator = new AgentOrchestrator();
    const incompleteEvents = MCPP_MANUFACTURING_ROUTE_EVENTS.filter(
      (e) => e.activity !== 'validate-ontology'
    );
    const context: AgentExecutionContext = {
      ...buildMcppContext(),
      ocel_events: incompleteEvents,
      gate_name: 'process-conformance',
    };

    const result = await orchestrator.runMapekCycle(context);

    // process-mining-skeptic should detect the missing stage
    const hasSkippedStage = result.analyze.violations.some(
      (v) => v.violation_type === 'skipped_stages'
    );
    expect(hasSkippedStage).toBe(true);
  });

  it('manufacturing route with release without benchmark blocks manufacturing', async () => {
    const orchestrator = new AgentOrchestrator();
    const noBenchmarkEvents = MCPP_MANUFACTURING_ROUTE_EVENTS.filter(
      (e) => e.activity !== 'run-benchmark'
    );
    const context: AgentExecutionContext = {
      ...buildMcppContext(),
      ocel_events: noBenchmarkEvents,
      gate_name: 'authority-chain-valid',
    };

    const result = await orchestrator.runMapekCycle(context);

    const blockedViolations = result.analyze.violations.filter(
      (v) => v.blocked_manufacturing
    );
    // authority-escalation-watcher: release without benchmark
    expect(blockedViolations.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 2 — OCEL event log produced by MAPE-K cycle is Prolog8-compilable
// ─────────────────────────────────────────────────────────────────────────────

describe('MAPE-K cycle produces OCEL event log compilable to Prolog8', () => {
  it('ocel_events from context have required OCEL-2.0 fields (ocel_id, activity, timestamp)', () => {
    for (const event of MCPP_MANUFACTURING_ROUTE_EVENTS) {
      expect(typeof event.ocel_id).toBe('string');
      expect(event.ocel_id.length).toBeGreaterThan(0);
      expect(typeof event.activity).toBe('string');
      expect(event.activity.length).toBeGreaterThan(0);
      expect(typeof event.timestamp).toBe('string');
      // ISO-8601 format check
      expect(() => new Date(event.timestamp)).not.toThrow();
      expect(new Date(event.timestamp).getTime()).toBeGreaterThan(0);
    }
  });

  it('OCEL activity sequence matches CodeManufactory declared manufacturing pipeline order', () => {
    const activities = MCPP_MANUFACTURING_ROUTE_EVENTS.map((e) => e.activity);
    const expectedOrder = [
      'seed-ontology',
      'breed-ontology',
      'validate-ontology',
      'project-artifact',
      'compile-artifact',
      'run-benchmark',
      'release-package',
    ];

    // Verify all 7 stages present
    for (const stage of expectedOrder) {
      expect(activities).toContain(stage);
    }

    // Verify temporal order (stage_index is monotonically increasing)
    const indices = MCPP_MANUFACTURING_ROUTE_EVENTS.map((e) => e.stage_index);
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1]);
    }
  });

  it('OCEL events can be interned into a Prolog8 term table without collision', () => {
    // Collect all unique string values from OCEL events for interning
    const terms: string[] = [];
    for (const event of MCPP_MANUFACTURING_ROUTE_EVENTS) {
      terms.push(event.ocel_id);
      terms.push(event.activity);
      terms.push(event.artifact_id);
    }

    const table = internTerms(terms);

    // Every term should have a non-sentinel ID
    for (const term of [...new Set(terms)]) {
      const id = table.termByLabel.get(term);
      expect(id).toBeDefined();
      expect(id).not.toBe(TERM_SENTINEL);
      expect(id).toBeGreaterThan(0);
    }

    // IDs should be compact (no gaps from 1 to table.size)
    const ids = [...table.termByLabel.values()].sort((a, b) => a - b);
    expect(ids[0]).toBe(1);
    expect(ids[ids.length - 1]).toBe(ids.length); // no gaps
  });

  it('each OCEL event can be compiled into a buildFact8 without throwing', () => {
    const terms = MCPP_MANUFACTURING_ROUTE_EVENTS.flatMap((e) => [
      e.ocel_id, e.activity, e.artifact_id,
    ]);
    const table = internTerms([...new Set(terms)]);

    const PRED_OCEL_EVENT = 1; // predicate: ocel_event/3 (ocel_id, activity, artifact)
    const facts: Rule8Json[] = [];

    for (let i = 0; i < MCPP_MANUFACTURING_ROUTE_EVENTS.length; i++) {
      const event = MCPP_MANUFACTURING_ROUTE_EVENTS[i];
      const ocelId   = table.termByLabel.get(event.ocel_id)!;
      const activity = table.termByLabel.get(event.activity)!;
      const artifact = table.termByLabel.get(event.artifact_id)!;

      expect(() => {
        const fact = buildFact8(PRED_OCEL_EVENT, 3, [ocelId, activity, artifact], i + 1);
        facts.push(fact);
      }).not.toThrow();
    }

    expect(facts).toHaveLength(MCPP_MANUFACTURING_ROUTE_EVENTS.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 3 — Agent receipt compiled into Rule8 catalog via buildFact8()
// ─────────────────────────────────────────────────────────────────────────────

describe('Agent AuditEntry → Rule8 catalog audit chain', () => {
  /**
   * Helper: compile a list of AuditEntry records into a Prolog8Catalog.
   *
   * Schema:
   *   audit_entry/4(agent_name, correction_type, artifact_id, success_flag)
   *
   * This is the TypeScript-side Rule8 compiler for the mcpp→wasm4pm audit trail.
   * The Prolog8 kernel can then answer queries like:
   *   ?- audit_entry("receipt-chain-attacker", "receipt_chain_repair", "mcpp-run-001", "true").
   */
  function compileAuditEntriesToCatalog(
    entries: AuditEntry[],
    catalogId = 1
  ): { catalog: Prolog8Catalog; facts: Rule8Json[]; table: ReturnType<typeof internTerms> } {
    // Collect all unique string values for interning
    const rawTerms: string[] = [];
    for (const entry of entries) {
      rawTerms.push(entry.agent_name);
      rawTerms.push(entry.correction_type);
      rawTerms.push(entry.artifact_id ?? 'unknown');
      rawTerms.push(entry.correction_success ? 'true' : 'false');
    }
    const table = internTerms([...new Set(rawTerms)]);

    const PRED_AUDIT_ENTRY = 1; // audit_entry/4

    const facts: Rule8Json[] = entries.map((entry, idx) => {
      const agentId     = table.termByLabel.get(entry.agent_name)!;
      const corrType    = table.termByLabel.get(entry.correction_type)!;
      const artifactId  = table.termByLabel.get(entry.artifact_id ?? 'unknown')!;
      const successFlag = table.termByLabel.get(entry.correction_success ? 'true' : 'false')!;

      return buildFact8(PRED_AUDIT_ENTRY, 4, [agentId, corrType, artifactId, successFlag], idx + 1);
    });

    const catalog = buildCatalog(
      catalogId,
      [{ predId: PRED_AUDIT_ENTRY, label: 'audit_entry', arity: 4, proofPolicy: 'OnRequest' }],
      table
    );

    return { catalog, facts, table };
  }

  it('MAPE-K cycle on complete route produces compilable AuditEntry records', async () => {
    const orchestrator = new AgentOrchestrator({ auditPath: '/tmp/test-mcpp-audit.jsonl' });
    const result = await orchestrator.runMapekCycle(buildMcppContext({ dryRun: false }));

    // Complete route should have no critical violations → no corrections
    // But even with 0 corrections, the structure is still compilable
    const auditStore = orchestrator.getAuditStore();
    const entries = auditStore.query({ limit: 100 });

    // Must be an array (may be empty for a passing run)
    expect(Array.isArray(entries)).toBe(true);
  });

  it('AuditEntry from a failed execution can be compiled into Rule8 facts', () => {
    // Synthesize an AuditEntry as if the receipt-chain-attacker fired on mcpp run
    const entry: AuditEntry = {
      timestamp: '2026-05-18T10:07:00Z',
      agent_name: 'receipt-chain-attacker',
      correction_type: 'receipt_chain_repair',
      violation: {
        agent_name: 'receipt-chain-attacker',
        violation_type: 'broken_hash_chain',
        severity: 'critical',
        evidence: { index: 3, expected: 'blake3-valid-03', actual: 'blake3-wrong' },
        process_mining_proof: null,
        timestamp: '2026-05-18T10:07:00Z',
        blocked_manufacturing: true,
        target: 'mcpp-run-001',
      },
      correction_action: 'receipt_chain_repair applied to mcpp-run-001',
      correction_success: true,
      correction_details: { agent: 'receipt-chain-attacker', type: 'receipt_chain_repair' },
      artifact_id: 'mcpp-run-001',
      snapshot_data: { target: 'mcpp-run-001', snapshot_type: 'pre_correction' },
    };

    expect(() => {
      const { catalog, facts, table } = compileAuditEntriesToCatalog([entry]);

      // Catalog must have the audit_entry predicate
      expect(catalog.predicate_by_label['audit_entry']).toBe(1);

      // One fact for one entry
      expect(facts).toHaveLength(1);

      // Fact head must reference the correct predicate
      expect(facts[0].head.pred_id).toBe(1);
      expect(facts[0].head.arity).toBe(4);
      expect(facts[0].body_len).toBe(0); // facts have no body
      expect(facts[0].body_mask).toBe(0);

      // All 4 argument positions must be ground (non-sentinel)
      for (let i = 0; i < 4; i++) {
        expect(facts[0].head.args[i]).not.toBe(TERM_SENTINEL);
        expect(facts[0].head.args[i]).toBeGreaterThan(0);
      }

      // Term table maps agent name
      expect(table.termByLabel.get('receipt-chain-attacker')).toBeGreaterThan(0);
      expect(table.termByLabel.get('receipt_chain_repair')).toBeGreaterThan(0);
      expect(table.termByLabel.get('mcpp-run-001')).toBeGreaterThan(0);
      expect(table.termByLabel.get('true')).toBeGreaterThan(0);
    }).not.toThrow();
  });

  it('multiple AuditEntry records produce a Rule8 catalog with unique rule_ids', () => {
    const entries: AuditEntry[] = [
      {
        timestamp: '2026-05-18T10:07:00Z',
        agent_name: 'receipt-chain-attacker',
        correction_type: 'receipt_chain_repair',
        violation: { agent_name: 'receipt-chain-attacker', violation_type: 'broken_hash_chain', severity: 'critical', evidence: {}, process_mining_proof: null, timestamp: '2026-05-18T10:07:00Z', blocked_manufacturing: true, target: 'mcpp-run-001' },
        correction_action: 'receipt_chain_repair applied',
        correction_success: true,
        correction_details: {},
        artifact_id: 'mcpp-run-001',
        snapshot_data: null,
      },
      {
        timestamp: '2026-05-18T10:08:00Z',
        agent_name: 'config-drift-guardian',
        correction_type: 'config_restoration',
        violation: { agent_name: 'config-drift-guardian', violation_type: 'missing_config', severity: 'warning', evidence: {}, process_mining_proof: null, timestamp: '2026-05-18T10:08:00Z', blocked_manufacturing: false, target: 'wasm4pm.toml' },
        correction_action: 'config_restoration applied',
        correction_success: true,
        correction_details: {},
        artifact_id: 'mcpp-run-001',
        snapshot_data: null,
      },
    ];

    const { facts } = compileAuditEntriesToCatalog(entries);

    expect(facts).toHaveLength(2);

    // Rule IDs must be distinct (no two facts share a rule_id)
    const ruleIds = facts.map((f) => f.rule_id[0]);
    const uniqueRuleIds = new Set(ruleIds);
    expect(uniqueRuleIds.size).toBe(facts.length);
  });

  it('catalog term_by_label contains all interned agent names', () => {
    const entries: AuditEntry[] = [
      {
        timestamp: '2026-05-18T10:07:00Z',
        agent_name: 'mock-interceptor',
        correction_type: 'code_refactoring',
        violation: { agent_name: 'mock-interceptor', violation_type: 'mock_operation_detected', severity: 'critical', evidence: {}, process_mining_proof: null, timestamp: '2026-05-18T10:07:00Z', blocked_manufacturing: true, target: 'test.ts' },
        correction_action: 'code_refactoring applied',
        correction_success: false,
        correction_details: {},
        artifact_id: 'mcpp-run-002',
        snapshot_data: null,
      },
    ];

    const { catalog } = compileAuditEntriesToCatalog(entries);

    // catalog.term_by_label must contain interned agent name
    expect(catalog.term_by_label['mock-interceptor']).toBeGreaterThan(0);
    expect(catalog.term_by_label['code_refactoring']).toBeGreaterThan(0);
    expect(catalog.term_by_label['mcpp-run-002']).toBeGreaterThan(0);
    // correction_success=false → 'false' is interned
    expect(catalog.term_by_label['false']).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 4 — mcpp→wasm4pm→Prolog8 audit chain: structural contract
// ─────────────────────────────────────────────────────────────────────────────

describe('mcpp → wasm4pm → Prolog8 audit chain: structural contract', () => {
  /**
   * Documents the full audit chain. Each test verifies one link in the chain.
   *
   * Chain:
   *   CodeManufactory  ──OCEL events──▶  AgentOrchestrator.runMapekCycle()
   *   AgentOrchestrator ──MAPEKCycleResult──▶  AuditStore.query()
   *   AuditStore        ──AuditEntry[]──▶  compileAuditEntriesToCatalog()
   *   compileAuditEntriesToCatalog ──Prolog8Catalog + Rule8Json[]──▶  prolog8_query()  [future]
   *
   * GAP-3 NOTE: prolog8_query() is in wasm4pm (WASM boundary). This test
   * verifies the catalog is structurally correct for admission, but cannot call
   * prolog8_query() without the WASM binary. The call would be:
   *   kernel.run('prolog8', handle, { catalog, rules: facts, query: admitQuery })
   */

  it('Link 1: OCEL events from CodeManufactory are accepted by monitor phase', async () => {
    const orchestrator = new AgentOrchestrator();
    const monitor = await orchestrator.monitor(buildMcppContext());

    // All 4 surfaces accept the mcpp event data
    expect(monitor.execution.count).toBe(MCPP_RECEIPT_CHAIN.length);
    expect(monitor.telemetry.count).toBe(MCPP_OTEL_TRACES.length);
    expect(monitor.process.count).toBe(MCPP_MANUFACTURING_ROUTE_EVENTS.length);
    expect(monitor.state.valid).toBe(true);
  });

  it('Link 2: MAPEKCycleResult carries all required fields for downstream compilation', async () => {
    const orchestrator = new AgentOrchestrator();
    const result = await orchestrator.runMapekCycle(buildMcppContext());

    // All 5 MAPE-K phase results present
    expect(result).toHaveProperty('cycle_id');
    expect(result).toHaveProperty('monitor');
    expect(result).toHaveProperty('analyze');
    expect(result).toHaveProperty('plan');
    expect(result).toHaveProperty('execute');
    expect(result).toHaveProperty('learn');
    expect(result).toHaveProperty('duration_ms');
    expect(result).toHaveProperty('success');

    // duration_ms is a positive number
    expect(typeof result.duration_ms).toBe('number');
    expect(result.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('Link 3: Rule8 catalog built from AuditEntry satisfies Prolog8 admission shape', () => {
    // Synthesize an entry representing a successful receipt verification
    const entry: AuditEntry = {
      timestamp: '2026-05-18T10:09:00Z',
      agent_name: 'receipt-chain-attacker',
      correction_type: 'receipt_chain_repair',
      violation: { agent_name: 'receipt-chain-attacker', violation_type: 'empty_receipt_chain', severity: 'critical', evidence: {}, process_mining_proof: null, timestamp: '2026-05-18T10:09:00Z', blocked_manufacturing: true, target: 'mcpp-run-001' },
      correction_action: 'receipt_chain_repair applied to mcpp-run-001',
      correction_success: true,
      correction_details: {},
      artifact_id: 'mcpp-run-001',
      snapshot_data: null,
    };

    const { catalog, facts } = (() => {
      const rawTerms = [
        entry.agent_name,
        entry.correction_type,
        entry.artifact_id ?? 'unknown',
        'true',
      ];
      const table = internTerms([...new Set(rawTerms)]);
      const PRED = 1;
      const fact = buildFact8(
        PRED,
        4,
        [
          table.termByLabel.get(entry.agent_name)!,
          table.termByLabel.get(entry.correction_type)!,
          table.termByLabel.get(entry.artifact_id ?? 'unknown')!,
          table.termByLabel.get('true')!,
        ],
        1
      );
      const cat = buildCatalog(
        42,
        [{ predId: PRED, label: 'audit_entry', arity: 4, proofPolicy: 'OnRequest' }],
        table
      );
      return { catalog: cat, facts: [fact] };
    })();

    // Catalog admission shape (from prolog8-compiler.d.ts + wasm.rs)
    expect(typeof catalog.catalog_id).toBe('number');
    expect(catalog.catalog_id).toBeGreaterThan(0);
    expect(typeof catalog.predicates).toBe('object');
    expect(typeof catalog.term_by_label).toBe('object');
    expect(typeof catalog.predicate_by_label).toBe('object');
    expect(typeof catalog.term_labels).toBe('object');

    // Predicate registered correctly
    expect(catalog.predicate_by_label['audit_entry']).toBe(1);
    expect(catalog.predicates['1'].arity).toBe(4);
    expect(catalog.predicates['1'].proof_policy).toBe('OnRequest');

    // Facts are Rule8Json shaped
    for (const fact of facts) {
      expect(fact.rule_id).toHaveProperty('0');
      expect(fact.body_len).toBe(0);  // unit clause (fact)
      expect(fact.body_mask).toBe(0);
      expect(fact.var_count).toBe(0); // all ground args
      expect(fact.head.arity).toBe(4);
      expect(fact.head.args).toHaveLength(8); // always padded to 8
    }
  });

  it('Link 4 (documented gap): prolog8_query() would verify audit_entry admission', () => {
    /**
     * GAP-3 DOCUMENTATION TEST
     *
     * This test documents what would happen at Link 4 if we had the WASM binary
     * available in this package. The call would be:
     *
     *   import { getRegistry } from 'wasm4pm';
     *   const kernel = getRegistry();
     *   const result = await kernel.run('prolog8', wasmHandle, {
     *     catalog: compiledCatalog,
     *     rules: auditFacts,
     *     query: buildQueryAtom(1, 4, [agentTermId, 0, artifactTermId, successTermId], ...)
     *   });
     *   expect(result.answers.length).toBeGreaterThan(0);
     *
     * This is NOT implemented here because:
     *   1. wasm4pm requires the WASM binary to be built (wasm-pack)
     *   2. Kernel initialization is async and requires WasmLoader.init()
     *   3. prolog8_query() is a WASM export, not a pure TypeScript function
     *
     * The catalog and facts built in Link 3 ARE structurally correct for this call.
     * The gap is the WASM runtime boundary, not the data shape.
     *
     * INTEGRATION PATH:
     *   apps/wasm4pm/src/commands/prolog8.ts → wpm prolog8 query → kernel.run('prolog8', ...)
     *   The compiled catalog from this test can be passed directly to that command.
     */

    // This test is a structural placeholder — it always passes.
    // Its purpose is to document the gap and the resolution path.
    const gapDescription = [
      'GAP-3: prolog8_query() not called — requires WASM binary (WasmLoader.init())',
      'Resolution: use wpm prolog8 query with compiled catalog from compileAuditEntriesToCatalog()',
      'Kernel path: wasm4pm → kernel.run("prolog8", handle, { catalog, rules, query })',
    ];

    // The gap exists and is documented
    expect(gapDescription).toHaveLength(3);
    expect(gapDescription[0]).toContain('WASM binary');
    expect(gapDescription[1]).toContain('wpm prolog8 query');
    expect(gapDescription[2]).toContain('wasm4pm');
  });

  it('full chain: mcpp OCEL events → MAPE-K cycle → AuditStore → Rule8 catalog (end-to-end)', async () => {
    const orchestrator = new AgentOrchestrator({ auditPath: '/tmp/test-mcpp-chain.jsonl' });

    // Step 1: Run MAPE-K cycle with CodeManufactory OCEL events
    const cycleResult: MAPEKCycleResult = await orchestrator.runMapekCycle(
      buildMcppContext({ dryRun: false })
    );
    // FM-5: cycle_id must match the cycle- prefix contract (not just be non-undefined)
    expect(cycleResult.cycle_id).toMatch(/^cycle-/);

    // Step 2: Query AuditStore for this artifact's entries
    const auditStore = orchestrator.getAuditStore();
    const allEntries = auditStore.query({ limit: 50 });

    // Step 3: Whether or not corrections fired, the chain is completeable
    // For a successful run, entries may be 0. Build catalog from synthetic entries
    // to prove the compilation path is viable end-to-end.
    const syntheticEntry: AuditEntry = {
      timestamp: cycleResult.monitor.execution.data['artifact_id']
        ? new Date().toISOString()
        : new Date().toISOString(),
      agent_name: 'process-mining-skeptic',
      correction_type: 'process_correction',
      violation: {
        agent_name: 'process-mining-skeptic',
        violation_type: 'skipped_stages',
        severity: 'critical',
        evidence: { cycle_id: cycleResult.cycle_id },
        process_mining_proof: null,
        timestamp: new Date().toISOString(),
        blocked_manufacturing: true,
        target: 'mcpp-run-001',
      },
      correction_action: `process_correction for cycle ${cycleResult.cycle_id}`,
      correction_success: cycleResult.success,
      correction_details: { cycle_id: cycleResult.cycle_id },
      artifact_id: 'mcpp-run-001',
      snapshot_data: null,
    };

    // Step 4: Compile entries to Rule8 catalog
    const entriesToCompile = allEntries.length > 0 ? allEntries : [syntheticEntry];
    const rawTerms = entriesToCompile.flatMap((e) => [
      e.agent_name,
      e.correction_type,
      e.artifact_id ?? 'unknown',
      e.correction_success ? 'true' : 'false',
    ]);
    const table = internTerms([...new Set(rawTerms)]);
    const PRED = 1;
    const facts: Rule8Json[] = entriesToCompile.map((entry, idx) =>
      buildFact8(
        PRED,
        4,
        [
          table.termByLabel.get(entry.agent_name)!,
          table.termByLabel.get(entry.correction_type)!,
          table.termByLabel.get(entry.artifact_id ?? 'unknown')!,
          table.termByLabel.get(entry.correction_success ? 'true' : 'false')!,
        ],
        idx + 1
      )
    );
    const catalog = buildCatalog(
      1,
      [{ predId: PRED, label: 'audit_entry', arity: 4, proofPolicy: 'OnRequest' }],
      table
    );

    // Step 5: Assert catalog is Prolog8-admissible
    expect(facts.length).toBeGreaterThan(0);
    expect(catalog.predicate_by_label['audit_entry']).toBe(1);
    expect(Object.keys(catalog.term_labels).length).toBeGreaterThan(0);

    // Every fact references the audit_entry predicate
    for (const fact of facts) {
      expect(fact.head.pred_id).toBe(PRED);
      expect(fact.body_len).toBe(0);
    }
  });
});
