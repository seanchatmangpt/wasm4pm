import { describe, it, expect } from 'vitest';
import { MINIMAL_XES } from './fixtures/canon.js';

/**
 * PROOF: one minimal trace validates end-to-end through the WASM discovery path.
 *
 * INVARIANT — loading the canonical minimal XES and running discover_dfg must
 * yield a structurally valid DFG result that carries `nodes` and `edges`
 * (the shape the CLI discriminator requires — see
 * apps/wasm4pm/src/__tests__/discovery-shape-contract.test.ts).
 *
 * Grounded in real exports:
 *  - MINIMAL_XES from ./fixtures/canon.ts (Agent 1)
 *  - wasm.load_eventlog_from_xes + wasm.discover_dfg (adversarial-metamorphic-ef.test.ts)
 *  - DFG nodes/edges array shape (discovery-shape-contract.test.ts:10-21)
 *
 * Anti-FM-5: assert array-ness of nodes/edges (Array.isArray), NOT exact counts.
 */

/** Some WASM exports return a JSON string, others a JS object. */
function parseWasm<T>(r: unknown): T {
  if (typeof r === 'string') return JSON.parse(r) as T;
  return r as T;
}

describe('ocel.proof — one minimal trace validates end-to-end', () => {
  it('discover_dfg over MINIMAL_XES yields nodes[] and edges[]', async () => {
    const wasm = await import('wasm4pm');
    const handle = wasm.load_eventlog_from_xes(MINIMAL_XES);
    expect(handle).toBeDefined();

    const dfg = parseWasm<{ nodes?: unknown; edges?: unknown }>(
      wasm.discover_dfg(handle as string, 'concept:name')
    );
    expect(dfg).toBeTypeOf('object');
    expect(dfg).not.toBeNull();
    expect(Array.isArray(dfg.nodes)).toBe(true);
    expect(Array.isArray(dfg.edges)).toBe(true);
  });
});
