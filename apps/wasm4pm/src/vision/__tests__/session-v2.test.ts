import { describe, expect, it } from 'vitest';
import {
  VisionSessionError,
  executeVisionSession,
  replayVisionSession,
  type OcelPowlWasmModule,
} from '../session-v2.js';

const OCEL = JSON.stringify({
  eventTypes: [{ name: 'Create' }, { name: 'Ship' }],
  objectTypes: [{ name: 'Order' }],
  events: [
    {
      id: 'e1',
      type: 'Create',
      time: '2030-01-01T00:00:00Z',
      relationships: [{ objectId: 'o1' }],
    },
    {
      id: 'e2',
      type: 'Ship',
      time: '2030-01-01T00:01:00Z',
      relationships: [{ objectId: 'o1' }],
    },
  ],
  objects: [{ id: 'o1', type: 'Order' }],
});

function fakeWasm(output: unknown = { completed: true }): OcelPowlWasmModule {
  return {
    load_ocel_v2: (content) => content,
    flatten_ocel_v2: (_content, objectType) =>
      JSON.stringify({
        object_type: objectType,
        cases: [{ case_id: 'o1', trace: ['Create', 'Ship'], event_ids: ['e1', 'e2'] }],
      }),
    discover_powl_from_log: () => ({ root: 2, node_count: 3, repr: '->(Create, Ship)' }),
    parse_powl: () => ({ root: 2, node_count: 3, repr: '->(Create, Ship)' }),
    validate_partial_orders: () => ({ valid: true }),
    powl_execute: () => output,
  } as OcelPowlWasmModule;
}

const OPTIONS = {
  groupByObjectType: 'Order',
  variant: 'decision_graph_cyclic_strict',
};

describe('exact OCEL-v2 → POWL → WASM session', () => {
  it('manufactures ALIVE evidence only after all exact runtime edges execute', async () => {
    const evidence = await executeVisionSession(fakeWasm(), OCEL, OPTIONS);

    expect(evidence.standing).toBe('ALIVE');
    expect(evidence.subject).toMatchObject({ event_count: 2, object_count: 1 });
    expect(evidence.route).toMatchObject({
      episode_count: 1,
      ungrouped_event_count: 0,
      partial_orders_valid: true,
    });
    expect(evidence.evidence_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(replayVisionSession(evidence, evidence)).toMatchObject({
      standing: 'ALIVE',
      mismatches: [],
    });
  });

  it('blocks replay when WASM execution output changes', async () => {
    const expected = await executeVisionSession(fakeWasm({ completed: true }), OCEL, OPTIONS);
    const observed = await executeVisionSession(fakeWasm({ completed: false }), OCEL, OPTIONS);

    expect(replayVisionSession(expected, observed)).toMatchObject({
      standing: 'BLOCKED',
    });
    expect(replayVisionSession(expected, observed).mismatches).toContain(
      'execution_output_hash'
    );
  });

  it('typed-refuses a build without the exact OCEL-v2 WASM export', async () => {
    await expect(
      executeVisionSession(
        {
          flatten_ocel_v2: fakeWasm().flatten_ocel_v2,
        } as OcelPowlWasmModule,
        OCEL,
        OPTIONS
      )
    ).rejects.toMatchObject({ code: 'OCEL_V2_WASM_LOAD_UNSUPPORTED' });
  });

  it('typed-refuses OCEL-v1 rather than substituting a TypeScript-only route', async () => {
    const v1 = JSON.stringify({
      'ocel:global-log': { 'ocel:version': '1.0' },
      'ocel:events': {},
      'ocel:objects': {},
    });
    await expect(executeVisionSession(fakeWasm(), v1, OPTIONS)).rejects.toMatchObject({
      code: 'OCEL_V1_WASM_UNSUPPORTED',
    });
  });

  it('refuses disagreement between WASM flattening and the independent reader', async () => {
    const divergent = fakeWasm();
    divergent.flatten_ocel_v2 = (_content, objectType) =>
      JSON.stringify({
        object_type: objectType,
        cases: [{ case_id: 'o1', trace: ['Ship', 'Create'] }],
      });

    try {
      await executeVisionSession(divergent, OCEL, OPTIONS);
      throw new Error('expected refusal');
    } catch (error) {
      expect(error).toBeInstanceOf(VisionSessionError);
      expect(error).toMatchObject({ code: 'OCEL_FLATTEN_DISAGREEMENT_REFUSED' });
    }
  });
});
