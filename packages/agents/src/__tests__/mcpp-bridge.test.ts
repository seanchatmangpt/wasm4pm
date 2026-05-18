/**
 * mcpp-bridge.test.ts — Unit tests for the mcpp→AgentOrchestrator bridge.
 *
 * Oracle rank: Rank 2 — Domain contract.
 *
 * Validates the TypeScript bridge (mcpp-bridge.ts) that closes GAP-1:
 *   mcpp emits OCEL-style events with agent correction data; this bridge
 *   converts them into AuditEntry objects and ingests them into AgentOrchestrator.
 *
 * No WASM binary required. All functions are pure TypeScript or use the
 * in-memory AuditStore. Gemba principle — no mocks of init.js.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mcppEventToAuditEntry, ingestMcppJsonl } from '../mcpp-bridge.js';
import type { IngestResult } from '../mcpp-bridge.js';
import { AgentOrchestrator } from '../orchestration.js';
import type { AuditEntry } from '../types.js';

/**
 * Minimal OCEL event shape — mirrors OcelEvent from @wasm4pm/contracts.
 * Defined inline to avoid the vitest .js→.ts alias mangling that breaks
 * resolution of @wasm4pm/contracts main entry (which re-exports ./types.js).
 */
type OcelEventLike = {
  'ocel:eid': string;
  'ocel:activity': string;
  'ocel:timestamp': string;
  'ocel:omap': string[];
  'ocel:vmap': Record<string, unknown>;
};

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** A well-formed mcpp agent OCEL event (already adapted from native format). */
function makeAgentOcelEvent(overrides: Partial<OcelEventLike> = {}): OcelEventLike {
  return {
    'ocel:eid': 'evt-001',
    'ocel:activity': 'agent.diagnose',
    'ocel:timestamp': '2026-05-18T10:00:00Z',
    'ocel:omap': ['mcpp-run-001'],
    'ocel:vmap': {
      agent_name: 'receipt-chain-attacker',
      correction_type: 'receipt_chain_repair',
      artifact_id: 'log-42',
      success: true,
    },
    ...overrides,
  };
}

/** A well-formed mcpp native NDJSON line (before OCEL adaptation). */
function makeMcppNativeLine(attrs: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: 'evt-001',
    activity: 'agent.diagnose',
    time: '2026-05-18T10:00:00Z',
    outcome: 'success',
    session_id: 'sess-001',
    part_name: 'wasm4pm',
    attrs: {
      agent_name: 'receipt-chain-attacker',
      correction_type: 'receipt_chain_repair',
      artifact_id: 'log-42',
      success: true,
      ...attrs,
    },
  });
}

/** A non-agent mcpp native NDJSON line (manufacturing stage). */
function makeStageLine(activity = 'seed-ontology'): string {
  return JSON.stringify({
    id: 'evt-stage-001',
    activity,
    time: '2026-05-18T10:00:00Z',
    outcome: 'success',
    session_id: 'sess-001',
    part_name: 'wasm4pm',
    attrs: { stage_index: 0 },
  });
}

// ── Group 1: mcppEventToAuditEntry — valid agent events ──────────────────────

describe('mcppEventToAuditEntry — valid agent events', () => {
  it('maps ocel:activity starting with "agent." to a non-null AuditEntry', () => {
    const event = makeAgentOcelEvent();
    const entry = mcppEventToAuditEntry(event);

    expect(entry).not.toBeNull();
  });

  it('AuditEntry.timestamp matches ocel:timestamp', () => {
    const event = makeAgentOcelEvent({ 'ocel:timestamp': '2026-05-18T12:34:56Z' });
    const entry = mcppEventToAuditEntry(event)!;

    expect(entry.timestamp).toBe('2026-05-18T12:34:56Z');
  });

  it('AuditEntry.agent_name comes from ocel:vmap.agent_name', () => {
    const event = makeAgentOcelEvent({
      'ocel:vmap': {
        agent_name: 'mock-interceptor',
        correction_type: 'code_refactoring',
        artifact_id: 'art-99',
        success: false,
      },
    });
    const entry = mcppEventToAuditEntry(event)!;

    expect(entry.agent_name).toBe('mock-interceptor');
  });

  it('AuditEntry.correction_type is coerced from ocel:vmap.correction_type', () => {
    const event = makeAgentOcelEvent({
      'ocel:vmap': {
        agent_name: 'config-drift-guardian',
        correction_type: 'config_restoration',
        artifact_id: 'art-01',
        success: true,
      },
    });
    const entry = mcppEventToAuditEntry(event)!;

    expect(entry.correction_type).toBe('config_restoration');
  });

  it('AuditEntry.correction_success is true when ocel:vmap.success is boolean true', () => {
    const event = makeAgentOcelEvent({
      'ocel:vmap': {
        agent_name: 'receipt-chain-attacker',
        correction_type: 'receipt_chain_repair',
        artifact_id: 'art-02',
        success: true,
      },
    });
    const entry = mcppEventToAuditEntry(event)!;

    expect(entry.correction_success).toBe(true);
  });

  it('AuditEntry.correction_success is false when ocel:vmap.success is boolean false', () => {
    const event = makeAgentOcelEvent({
      'ocel:vmap': {
        agent_name: 'receipt-chain-attacker',
        correction_type: 'receipt_chain_repair',
        artifact_id: 'art-03',
        success: false,
      },
    });
    const entry = mcppEventToAuditEntry(event)!;

    expect(entry.correction_success).toBe(false);
  });

  it('AuditEntry.correction_success is true when ocel:vmap.success is string "true"', () => {
    const event = makeAgentOcelEvent({
      'ocel:vmap': {
        agent_name: 'receipt-chain-attacker',
        correction_type: 'receipt_chain_repair',
        artifact_id: 'art-04',
        success: 'true',
      },
    });
    const entry = mcppEventToAuditEntry(event)!;

    expect(entry.correction_success).toBe(true);
  });

  it('AuditEntry.artifact_id comes from ocel:vmap.artifact_id', () => {
    const event = makeAgentOcelEvent({
      'ocel:vmap': {
        agent_name: 'receipt-chain-attacker',
        correction_type: 'receipt_chain_repair',
        artifact_id: 'log-42',
        success: true,
      },
    });
    const entry = mcppEventToAuditEntry(event)!;

    expect(entry.artifact_id).toBe('log-42');
  });

  it('AuditEntry.artifact_id falls back to first ocel:omap entry when vmap has none', () => {
    const event = makeAgentOcelEvent({
      'ocel:omap': ['fallback-artifact-id'],
      'ocel:vmap': {
        agent_name: 'receipt-chain-attacker',
        correction_type: 'receipt_chain_repair',
        success: true,
        // no artifact_id in vmap
      },
    });
    const entry = mcppEventToAuditEntry(event)!;

    expect(entry.artifact_id).toBe('fallback-artifact-id');
  });

  it('AuditEntry.correction_action encodes the ocel:activity', () => {
    const event = makeAgentOcelEvent({ 'ocel:activity': 'agent.heal' });
    const entry = mcppEventToAuditEntry(event)!;

    expect(entry.correction_action).toContain('agent.heal');
    expect(entry.correction_action).toContain('mcpp');
  });

  it('AuditEntry.violation.agent_name matches AuditEntry.agent_name', () => {
    const event = makeAgentOcelEvent();
    const entry = mcppEventToAuditEntry(event)!;

    expect(entry.violation.agent_name).toBe(entry.agent_name);
  });

  it('unknown correction_type falls back to "process_correction"', () => {
    const event = makeAgentOcelEvent({
      'ocel:vmap': {
        agent_name: 'receipt-chain-attacker',
        correction_type: 'totally_unknown_type',
        artifact_id: 'art-05',
        success: true,
      },
    });
    const entry = mcppEventToAuditEntry(event)!;

    expect(entry.correction_type).toBe('process_correction');
  });

  it('extra vmap fields appear in correction_details', () => {
    const event = makeAgentOcelEvent({
      'ocel:vmap': {
        agent_name: 'receipt-chain-attacker',
        correction_type: 'receipt_chain_repair',
        artifact_id: 'art-06',
        success: true,
        extra_metric: 42,
        run_context: 'ci',
      },
    });
    const entry = mcppEventToAuditEntry(event)!;

    expect(entry.correction_details['extra_metric']).toBe(42);
    expect(entry.correction_details['run_context']).toBe('ci');
  });
});

// ── Group 2: mcppEventToAuditEntry — null cases ───────────────────────────────

describe('mcppEventToAuditEntry — non-agent and invalid events return null', () => {
  it('returns null for a manufacturing stage event (activity does not start with "agent.")', () => {
    const stageEvent: OcelEvent = {
      'ocel:eid': 'ev-stage',
      'ocel:activity': 'seed-ontology',
      'ocel:timestamp': '2026-05-18T10:00:00Z',
      'ocel:omap': [],
      'ocel:vmap': { stage_index: 0 },
    };

    expect(mcppEventToAuditEntry(stageEvent)).toBeNull();
  });

  it('returns null for an "algorithm.complete" event (activity does not start with "agent.")', () => {
    const algoEvent: OcelEvent = {
      'ocel:eid': 'ev-algo',
      'ocel:activity': 'algorithm.complete',
      'ocel:timestamp': '2026-05-18T10:00:00Z',
      'ocel:omap': [],
      'ocel:vmap': { status: 'success' },
    };

    expect(mcppEventToAuditEntry(algoEvent)).toBeNull();
  });

  it('returns null when ocel:vmap.agent_name is missing', () => {
    const event = makeAgentOcelEvent({
      'ocel:vmap': {
        // no agent_name
        correction_type: 'receipt_chain_repair',
        artifact_id: 'art-07',
        success: true,
      },
    });

    expect(mcppEventToAuditEntry(event)).toBeNull();
  });

  it('returns null when ocel:vmap.agent_name is an empty string', () => {
    const event = makeAgentOcelEvent({
      'ocel:vmap': {
        agent_name: '',
        correction_type: 'receipt_chain_repair',
        artifact_id: 'art-08',
        success: true,
      },
    });

    expect(mcppEventToAuditEntry(event)).toBeNull();
  });

  it('returns null for an "admitted" verdict event (activity does not start with "agent.")', () => {
    const verdictEvent: OcelEvent = {
      'ocel:eid': 'ev-admitted',
      'ocel:activity': 'admitted',
      'ocel:timestamp': '2026-05-18T10:00:00Z',
      'ocel:omap': ['mcpp-run-001'],
      'ocel:vmap': { fitness: 1.0 },
    };

    expect(mcppEventToAuditEntry(verdictEvent)).toBeNull();
  });
});

// ── Group 3: ingestMcppJsonl — parsing and ingestion ─────────────────────────

describe('ingestMcppJsonl — parsing and ingestion', () => {
  let orchestrator: AgentOrchestrator;

  beforeEach(() => {
    orchestrator = new AgentOrchestrator({ auditPath: '/tmp/test-mcpp-bridge.jsonl' });
    // Clear any leftover state
    orchestrator.getAuditStore().clear();
  });

  it('ingests a valid agent event from a single mcpp native NDJSON line', () => {
    const ndjson = makeMcppNativeLine();

    const result: IngestResult = ingestMcppJsonl(orchestrator, ndjson);

    expect(result.ingested).toBe(1);
    expect(result.skipped).toBe(0);
  });

  it('AuditStore contains the ingested entry after ingest', () => {
    const ndjson = makeMcppNativeLine({ artifact_id: 'bridge-test-artifact' });

    ingestMcppJsonl(orchestrator, ndjson);

    const entries = orchestrator.getAuditStore().query({ limit: 10 });
    expect(entries.length).toBeGreaterThanOrEqual(1);
    const last = entries[entries.length - 1];
    expect(last.artifact_id).toBe('bridge-test-artifact');
  });

  it('non-agent stage events are counted as skipped', () => {
    const ndjson = makeStageLine('seed-ontology');

    const result = ingestMcppJsonl(orchestrator, ndjson);

    expect(result.ingested).toBe(0);
    expect(result.skipped).toBeGreaterThanOrEqual(1);
  });

  it('malformed JSON line is skipped and counted', () => {
    const ndjson = '{not valid json';

    const result = ingestMcppJsonl(orchestrator, ndjson);

    expect(result.ingested).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('empty NDJSON string produces 0 ingested, 0 or more skipped (blank lines)', () => {
    const result = ingestMcppJsonl(orchestrator, '');

    expect(result.ingested).toBe(0);
  });

  it('blank lines are skipped', () => {
    // '\n\n\n' splits into 4 elements (before, between, and after each newline),
    // all empty — so 4 blank-line skips.
    const ndjson = '\n\n\n';

    const result = ingestMcppJsonl(orchestrator, ndjson);

    expect(result.ingested).toBe(0);
    expect(result.skipped).toBeGreaterThanOrEqual(3);
  });

  it('mixed NDJSON: 2 agent events + 1 stage event + 1 malformed line', () => {
    const lines = [
      makeMcppNativeLine({ artifact_id: 'art-A' }),
      makeMcppNativeLine({ artifact_id: 'art-B' }),
      makeStageLine('breed-ontology'),
      '{bad json',
    ];
    const ndjson = lines.join('\n');

    const result = ingestMcppJsonl(orchestrator, ndjson);

    expect(result.ingested).toBe(2);
    // 1 stage + 1 malformed = 2 skipped minimum
    expect(result.skipped).toBeGreaterThanOrEqual(2);
  });

  it('ingested count matches AuditStore entry growth', () => {
    const storeBefore = orchestrator.getAuditStore().count;

    const lines = [
      makeMcppNativeLine({ artifact_id: 'art-C' }),
      makeMcppNativeLine({ artifact_id: 'art-D' }),
    ];
    const result = ingestMcppJsonl(orchestrator, lines.join('\n'));

    const storeAfter = orchestrator.getAuditStore().count;
    expect(storeAfter - storeBefore).toBe(result.ingested);
  });
});

// ── Group 4: Full pipeline round-trip ────────────────────────────────────────

describe('Full pipeline: ingestMcppJsonl round-trip (native NDJSON → AgentOrchestrator)', () => {
  it('round-trip from mcpp native JSON: agent_name is preserved in AuditStore', () => {
    const orchestrator = new AgentOrchestrator({ auditPath: '/tmp/test-mcpp-bridge-rt1.jsonl' });
    orchestrator.getAuditStore().clear();

    const ndjson = makeMcppNativeLine({ agent_name: 'theater-detector' });
    const result = ingestMcppJsonl(orchestrator, ndjson);

    expect(result.ingested).toBe(1);
    const entries = orchestrator.getAuditStore().query({ limit: 5 });
    expect(entries[entries.length - 1].agent_name).toBe('theater-detector');
  });

  it('round-trip: correction_type is preserved from native attrs through AuditEntry', () => {
    const orchestrator = new AgentOrchestrator({ auditPath: '/tmp/test-mcpp-bridge-rt2.jsonl' });
    orchestrator.getAuditStore().clear();

    const ndjson = makeMcppNativeLine({ correction_type: 'stub_elimination' });
    ingestMcppJsonl(orchestrator, ndjson);

    const entries = orchestrator.getAuditStore().query({ limit: 5 });
    expect(entries[entries.length - 1].correction_type).toBe('stub_elimination');
  });

  it('round-trip: stage event (non-agent activity) produces 0 ingested', () => {
    const orchestrator = new AgentOrchestrator({ auditPath: '/tmp/test-mcpp-bridge-rt3.jsonl' });
    orchestrator.getAuditStore().clear();

    const stageLine = makeStageLine('compile-artifact');
    const result = ingestMcppJsonl(orchestrator, stageLine);

    expect(result.ingested).toBe(0);
    expect(result.skipped).toBeGreaterThanOrEqual(1);
  });

  it('ingestMcppJsonl with a complete manufacturing route: only agent events ingested', () => {
    const orchestrator = new AgentOrchestrator({ auditPath: '/tmp/test-mcpp-bridge-pipeline.jsonl' });
    orchestrator.getAuditStore().clear();

    // Simulate a real mcpp run: 7 stage events + 2 agent correction events
    const lines = [
      makeStageLine('seed-ontology'),
      makeStageLine('breed-ontology'),
      makeStageLine('validate-ontology'),
      makeStageLine('project-artifact'),
      makeStageLine('compile-artifact'),
      makeMcppNativeLine({ agent_name: 'receipt-chain-attacker', artifact_id: 'mcpp-run-final' }),
      makeStageLine('run-benchmark'),
      makeStageLine('release-package'),
      makeMcppNativeLine({ agent_name: 'process-mining-skeptic', correction_type: 'process_correction', artifact_id: 'mcpp-run-final' }),
    ];
    const ndjson = lines.join('\n');

    const result = ingestMcppJsonl(orchestrator, ndjson);

    // Exactly 2 agent events
    expect(result.ingested).toBe(2);

    // AuditStore has exactly those 2 entries
    const entries = orchestrator.getAuditStore().query({ limit: 20 });
    const agentNames = entries.map((e: AuditEntry) => e.agent_name);
    expect(agentNames).toContain('receipt-chain-attacker');
    expect(agentNames).toContain('process-mining-skeptic');
  });
});
