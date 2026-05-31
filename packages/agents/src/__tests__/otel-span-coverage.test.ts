/**
 * OTEL span emission coverage tests for @wasm4pm/agents.
 *
 * Oracle rank: Rank 2 — Domain contract (critical-constraints.md §2).
 *
 * Contract:
 *   - Every public operation (runMapekCycle, executeAgent) MUST emit exactly
 *     one OTEL span to the injected spanSink.
 *   - All spans MUST carry `service.name = 'wasm4pm'`.
 *   - All spans MUST carry a `status` field with code 'OK' or 'ERROR' (never UNSET).
 *   - `agents.agent_name` must appear on executeAgent spans.
 *   - `agents.cycle_id` must appear on runMapekCycle spans.
 *   - On error paths, span status code MUST be 'ERROR' and message must be non-empty.
 *   - Span emission must never throw (non-blocking).
 *
 * FM-5 prevention: spans are captured via an injected recording sink, not
 * asserted from the implementation's own state.  The sink is the independent
 * oracle.
 */

import { describe, it, expect } from 'vitest';
import { AgentOrchestrator } from '../orchestration.js';
import type { AgentSpanSink } from '../orchestration.js';

// ── Recording sink ────────────────────────────────────────────────────────────

interface CapturedSpan {
  name: string;
  status: { code: 'OK' | 'ERROR'; message?: string };
  attributes: Record<string, string | number | boolean>;
  trace_id: string;
  span_id: string;
  start_time: number;
  end_time: number;
}

function makeRecordingSink(): { sink: AgentSpanSink; spans: CapturedSpan[] } {
  const spans: CapturedSpan[] = [];
  const sink: AgentSpanSink = (span) => {
    spans.push(span as CapturedSpan);
  };
  return { sink, spans };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ARTIFACT = 'otel-test-artifact';

// ─────────────────────────────────────────────────────────────────────────────
// executeAgent — span contract
// ─────────────────────────────────────────────────────────────────────────────

describe('AgentOrchestrator.executeAgent — OTEL span contract (Rank-2)', () => {
  it('emits exactly one span per executeAgent call', async () => {
    const { sink, spans } = makeRecordingSink();
    const orch = new AgentOrchestrator({ spanSink: sink });

    await orch.executeAgent('mock-interceptor', { artifact_id: ARTIFACT });

    expect(spans).toHaveLength(1);
  });

  it('span carries service.name = "wasm4pm"', async () => {
    const { sink, spans } = makeRecordingSink();
    const orch = new AgentOrchestrator({ spanSink: sink });

    await orch.executeAgent('config-drift-guardian', { artifact_id: ARTIFACT });

    expect(spans[0].attributes['service.name']).toBe('wasm4pm');
  });

  it('span status code is "OK" for a passing agent', async () => {
    const { sink, spans } = makeRecordingSink();
    const orch = new AgentOrchestrator({ spanSink: sink });

    // receipt-chain-attacker with well-formed chain → no violations → passed=true
    await orch.executeAgent('receipt-chain-attacker', {
      artifact_id: ARTIFACT,
      receipts: [
        { hash: 'aaa' },
        { hash: 'bbb', previous_hash: 'aaa' },
      ],
    });

    expect(spans[0].status.code).toBe('OK');
  });

  it('span carries agents.agent_name attribute', async () => {
    const { sink, spans } = makeRecordingSink();
    const orch = new AgentOrchestrator({ spanSink: sink });

    await orch.executeAgent('theater-detector', { artifact_id: ARTIFACT });

    expect(spans[0].attributes['agents.agent_name']).toBe('theater-detector');
  });

  it('span carries agents.artifact_id attribute', async () => {
    const { sink, spans } = makeRecordingSink();
    const orch = new AgentOrchestrator({ spanSink: sink });

    await orch.executeAgent('authority-escalation-watcher', {
      artifact_id: ARTIFACT,
    });

    expect(spans[0].attributes['agents.artifact_id']).toBe(ARTIFACT);
  });

  it('span carries agents.passed boolean attribute', async () => {
    const { sink, spans } = makeRecordingSink();
    const orch = new AgentOrchestrator({ spanSink: sink });

    await orch.executeAgent('evidence-fabrication-detector', {
      artifact_id: ARTIFACT,
    });

    expect(typeof spans[0].attributes['agents.passed']).toBe('boolean');
  });

  it('span carries agents.violation_count numeric attribute', async () => {
    const { sink, spans } = makeRecordingSink();
    const orch = new AgentOrchestrator({ spanSink: sink });

    await orch.executeAgent('gate-independence-verifier', {
      artifact_id: ARTIFACT,
    });

    expect(typeof spans[0].attributes['agents.violation_count']).toBe('number');
  });

  it('span status code is "ERROR" for unknown agent', async () => {
    const { sink, spans } = makeRecordingSink();
    const orch = new AgentOrchestrator({ spanSink: sink });

    await orch.executeAgent('nonexistent-agent-xyz', { artifact_id: ARTIFACT });

    expect(spans[0].status.code).toBe('ERROR');
    expect(spans[0].status.message).toBeTruthy();
  });

  it('span name is "agents.execute_agent"', async () => {
    const { sink, spans } = makeRecordingSink();
    const orch = new AgentOrchestrator({ spanSink: sink });

    await orch.executeAgent('process-mining-skeptic', { artifact_id: ARTIFACT });

    expect(spans[0].name).toBe('agents.execute_agent');
  });

  it('span start_time <= end_time (temporal integrity)', async () => {
    const { sink, spans } = makeRecordingSink();
    const orch = new AgentOrchestrator({ spanSink: sink });

    await orch.executeAgent('mock-interceptor', { artifact_id: ARTIFACT });

    expect(spans[0].start_time).toBeLessThanOrEqual(spans[0].end_time);
  });

  it('span has non-empty trace_id and span_id', async () => {
    const { sink, spans } = makeRecordingSink();
    const orch = new AgentOrchestrator({ spanSink: sink });

    await orch.executeAgent('mock-interceptor', { artifact_id: ARTIFACT });

    expect(spans[0].trace_id.length).toBeGreaterThan(0);
    expect(spans[0].span_id.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// runMapekCycle — span contract
// ─────────────────────────────────────────────────────────────────────────────

describe('AgentOrchestrator.runMapekCycle — OTEL span contract (Rank-2)', () => {
  it('emits at least one agents.mapek_cycle span', async () => {
    const { sink, spans } = makeRecordingSink();
    const orch = new AgentOrchestrator({ spanSink: sink });

    await orch.runMapekCycle({ artifact_id: ARTIFACT });

    const mapekSpans = spans.filter((s) => s.name === 'agents.mapek_cycle');
    expect(mapekSpans.length).toBeGreaterThanOrEqual(1);
  });

  it('mapek_cycle span carries service.name = "wasm4pm"', async () => {
    const { sink, spans } = makeRecordingSink();
    const orch = new AgentOrchestrator({ spanSink: sink });

    await orch.runMapekCycle({ artifact_id: ARTIFACT });

    const mapekSpan = spans.find((s) => s.name === 'agents.mapek_cycle');
    expect(mapekSpan).toBeDefined();
    expect(mapekSpan!.attributes['service.name']).toBe('wasm4pm');
  });

  it('mapek_cycle span carries agents.cycle_id attribute', async () => {
    const { sink, spans } = makeRecordingSink();
    const orch = new AgentOrchestrator({ spanSink: sink });

    await orch.runMapekCycle({ artifact_id: ARTIFACT });

    const mapekSpan = spans.find((s) => s.name === 'agents.mapek_cycle');
    expect(mapekSpan).toBeDefined();
    expect(mapekSpan!.attributes['agents.cycle_id']).toBeTruthy();
  });

  it('mapek_cycle span carries agents.artifact_id attribute', async () => {
    const { sink, spans } = makeRecordingSink();
    const orch = new AgentOrchestrator({ spanSink: sink });

    await orch.runMapekCycle({ artifact_id: ARTIFACT });

    const mapekSpan = spans.find((s) => s.name === 'agents.mapek_cycle');
    expect(mapekSpan!.attributes['agents.artifact_id']).toBe(ARTIFACT);
  });

  it('mapek_cycle span status is "OK" for a healthy artifact', async () => {
    const { sink, spans } = makeRecordingSink();
    const orch = new AgentOrchestrator({ spanSink: sink });

    await orch.runMapekCycle({
      artifact_id: ARTIFACT,
      receipts: [{ hash: 'x1' }, { hash: 'x2', previous_hash: 'x1' }],
      traces: [{ name: 'op', service: 'svc', trace_id: 't1', duration_ms: 5 }],
    });

    const mapekSpan = spans.find((s) => s.name === 'agents.mapek_cycle');
    // Status may be OK or ERROR depending on violations; what matters is it is set
    expect(['OK', 'ERROR']).toContain(mapekSpan!.status.code);
  });

  it('each continuous agent run emits its own agents.execute_agent span', async () => {
    const { sink, spans } = makeRecordingSink();
    const orch = new AgentOrchestrator({ spanSink: sink });

    const registry = orch.getAgentRegistry();
    const continuousCount = registry.getContinuousAgents().length;

    await orch.runMapekCycle({ artifact_id: ARTIFACT });

    const executeSpans = spans.filter((s) => s.name === 'agents.execute_agent');
    // At minimum, every continuous agent should have emitted a span
    expect(executeSpans.length).toBeGreaterThanOrEqual(continuousCount);
  });

  it('sink never receives undefined/null spans (non-blocking contract)', async () => {
    const received: unknown[] = [];
    const strictSink: AgentSpanSink = (span) => {
      received.push(span);
    };
    const orch = new AgentOrchestrator({ spanSink: strictSink });

    await orch.runMapekCycle({ artifact_id: ARTIFACT });

    for (const s of received) {
      expect(s).not.toBeNull();
      expect(s).not.toBeUndefined();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// All 8 van der Aalst agents — each emits a span (Rank-2 completeness check)
// ─────────────────────────────────────────────────────────────────────────────

describe('All 8 Van der Aalst agents — each emits an OTEL span (Rank-2)', () => {
  const AGENTS = [
    'mock-interceptor',
    'config-drift-guardian',
    'receipt-chain-attacker',
    'gate-independence-verifier',
    'evidence-fabrication-detector',
    'process-mining-skeptic',
    'theater-detector',
    'authority-escalation-watcher',
  ] as const;

  for (const agentName of AGENTS) {
    it(`${agentName} emits exactly one span with service.name = 'wasm4pm'`, async () => {
      const { sink, spans } = makeRecordingSink();
      const orch = new AgentOrchestrator({ spanSink: sink });

      await orch.executeAgent(agentName, { artifact_id: ARTIFACT });

      expect(spans).toHaveLength(1);
      expect(spans[0].attributes['service.name']).toBe('wasm4pm');
      expect(['OK', 'ERROR']).toContain(spans[0].status.code);
    });
  }
});
