/**
 * wasm-backend-stub-fallback.unit.test.ts
 *
 * Sibling fix to PR #82 — covers the `parsed.fitness || 0.85` and
 * `parsed.precision || 0.8` stub-return pattern that previously lived in
 * `packages/kernel/src/backends/wasm-backend.ts`.
 *
 * Filename suffix `.unit.test.ts` per `.claude/hooks/test-purity.sh`:
 * mocks (vi.mock) are permitted in unit tests, banned in integration tests.
 *
 * Rank-1 oracles per .claude/rules/chicago-tdd.md:
 *   - Quality metrics MUST come from real WASM output, not silent constants.
 *   - Missing field => throw (no fabricated 0.85). This is a mathematical
 *     invariant of the conformance contract: "If the code says it worked but
 *     the event log cannot prove a lawful process happened, then it did not
 *     work." (Van der Aalst, .claude/rules/chicago-tdd.md)
 *   - Non-finite values (NaN/Infinity) MUST throw — they are not valid
 *     fitness/precision/generalization/simplicity.
 *   - When WASM returns no quality fields at all on discovery (typical
 *     for `discover_dfg`), the `quality` field MUST be omitted from
 *     ModelIR, not populated with constants.
 *
 * We mock the `wasm4pm` module so the test never depends on a real WASM
 * binary being present. This isolates the JS-side guard from build state.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@wasm4pm/core', () => {
  return {
    // WasmBackend.init() probes for an optional `init` export. Provide a noop.
    init: undefined,
    load_eventlog_from_json: vi.fn((_json: string) => 'handle-1'),
    discover_dfg: vi.fn((_h: string, _k: string) =>
      JSON.stringify({ nodes: [{ id: 'A', label: 'A', type: 'activity' }], edges: [] })
    ),
    check_token_based_replay: vi.fn(),
    get_capability_registry: vi.fn(() => '{}'),
  };
});

import * as wasm from '@wasm4pm/core';
import { WasmBackend } from '../backends/wasm-backend.js';
import type { EventLogIR, ModelIR, BudgetEnvelope } from '../mining-backend.js';

const log: EventLogIR = {
  format_version: '1.0',
  case_id_key: 'case:concept:name',
  activity_key: 'concept:name',
  timestamp_key: 'time:timestamp',
  traces: [],
} as unknown as EventLogIR;

const model: ModelIR = {
  format_version: '1.0',
  model_type: 'dfg',
  algorithm_id: 'dfg',
  capabilities: {
    online_safe: true,
    offline_only: false,
    replay_ready: true,
    alignment_ready: false,
    streaming_compatible: false,
    exportable_to_pnml: false,
    exportable_to_bpmn: false,
  },
  nodes: [],
  edges: [],
} as ModelIR;

const budget: BudgetEnvelope = {
  cycle_seq: 0,
  time_budget_ms: 1000,
  memory_budget_mb: 64,
  quality_floor: 'fast' as const,
} as unknown as BudgetEnvelope;

describe('WasmBackend stub-fallback fix (PR #82 sibling, wasm-backend.ts)', () => {
  let backend: WasmBackend;

  beforeEach(async () => {
    backend = new WasmBackend();
    await backend.init();
    vi.clearAllMocks();
  });

  it('discovery omits quality when WASM returns only nodes/edges (no fabrication)', async () => {
    const ddfg = wasm.discover_dfg as unknown as ReturnType<typeof vi.fn>;
    ddfg.mockReturnValueOnce(
      JSON.stringify({ nodes: [{ id: 'A', label: 'A', type: 'activity' }], edges: [] })
    );
    const lej = wasm.load_eventlog_from_json as unknown as ReturnType<typeof vi.fn>;
    lej.mockReturnValueOnce('h-disc-1');

    const res = await backend.discover(log, 'dfg', budget);
    expect(res.status).toBe('success');
    // Critical Rank-1 oracle: no fabricated 0.85 fitness.
    expect(res.model_ir?.quality).toBeUndefined();
  });

  it('discovery throws when WASM returns partial quality (e.g. only fitness, no precision)', async () => {
    const ddfg = wasm.discover_dfg as unknown as ReturnType<typeof vi.fn>;
    ddfg.mockReturnValueOnce(
      JSON.stringify({ nodes: [], edges: [], fitness: 0.92 /* missing other 3 */ })
    );
    const lej = wasm.load_eventlog_from_json as unknown as ReturnType<typeof vi.fn>;
    lej.mockReturnValueOnce('h-disc-2');

    const res = await backend.discover(log, 'dfg', budget);
    // discover() catches and converts to status: 'failed' — confirm the
    // failure was for the right reason (no silent 0.85 default).
    expect(res.status).toBe('failed');
    expect(String((res as unknown as { error?: string }).error ?? '')).toMatch(/missing 'precision'/);
  });

  it('discovery throws when WASM returns non-finite quality (NaN)', async () => {
    const ddfg = wasm.discover_dfg as unknown as ReturnType<typeof vi.fn>;
    ddfg.mockReturnValueOnce(
      JSON.stringify({
        nodes: [],
        edges: [],
        fitness: 'NaN', // serialized non-finite arrives as string
        precision: 0.8,
        generalization: 0.75,
        simplicity: 100,
      })
    );
    const lej = wasm.load_eventlog_from_json as unknown as ReturnType<typeof vi.fn>;
    lej.mockReturnValueOnce('h-disc-3');

    const res = await backend.discover(log, 'dfg', budget);
    expect(res.status).toBe('failed');
    expect(String((res as unknown as { error?: string }).error ?? '')).toMatch(/non-finite/);
  });

  it('conformance throws when check_token_based_replay export is missing', async () => {
    // Simulate stripped-down profile: function not present.
    const wasmAny = wasm as unknown as Record<string, unknown>;
    const orig = wasmAny.check_token_based_replay;
    wasmAny.check_token_based_replay = undefined;
    try {
      const res = await backend.conformance(log, model, budget);
      // conformance catches and returns failed envelope; error must name function.
      expect(res.status).toBe('failed');
      expect(String((res as unknown as { error?: string }).error ?? '')).toMatch(
        /check_token_based_replay/
      );
    } finally {
      wasmAny.check_token_based_replay = orig;
    }
  });

  it('conformance throws when WASM result is missing fitness (no 0.85 silent fallback)', async () => {
    const ctbr = wasm.check_token_based_replay as unknown as ReturnType<typeof vi.fn>;
    ctbr.mockReturnValueOnce(
      JSON.stringify({ precision: 0.9, generalization: 0.8, simplicity: 100 })
    );
    const lej = wasm.load_eventlog_from_json as unknown as ReturnType<typeof vi.fn>;
    lej.mockReturnValueOnce('h-conf-1');

    const res = await backend.conformance(log, model, budget);
    expect(res.status).toBe('failed');
    expect(String((res as unknown as { error?: string }).error ?? '')).toMatch(/missing 'fitness'/);
  });

  it('conformance succeeds and forwards real values when WASM returns full quality', async () => {
    const ctbr = wasm.check_token_based_replay as unknown as ReturnType<typeof vi.fn>;
    ctbr.mockReturnValueOnce(
      JSON.stringify({
        fitness: 0.73,
        precision: 0.61,
        generalization: 0.54,
        simplicity: 42,
      })
    );
    const lej = wasm.load_eventlog_from_json as unknown as ReturnType<typeof vi.fn>;
    lej.mockReturnValueOnce('h-conf-2');

    const res = await backend.conformance(log, model, budget);
    expect(res.status).toBe('success');
    // Rank-1 invariant: returned numbers are exactly what WASM produced,
    // not the previously-fabricated 0.85/0.8/0.75/100 constants.
    expect(res.payload).toMatchObject({
      fitness: 0.73,
      precision: 0.61,
      generalization: 0.54,
      simplicity: 42,
    });
  });
});
