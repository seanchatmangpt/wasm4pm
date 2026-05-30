import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
    const loader = (await import('@wasm4pm/engine')).WasmLoader.getInstance();
    await loader.init();
    const wasm = loader.get() as any;
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

describe('M3: ocel.proof — validation and provenance query traversal with real WASM', () => {
  it('loads valid.json and validates successfully, and performs query traversal', async () => {
    const loader = (await import('@wasm4pm/engine')).WasmLoader.getInstance();
    await loader.init();
    const wasm = loader.get() as any;
    const validJsonStr = readFileSync(resolve(__dirname, '../../fixtures/ocpq/valid.json'), 'utf8');
    const handle = wasm.load_ocel2_from_json(validJsonStr);
    expect(handle).toBeDefined();

    // 1. Validate
    const reportVal = wasm.validate_ocel(handle);
    const report = JSON.parse(reportVal as string);
    expect(report.valid).toBe(true);
    expect(report.error_count).toBe(0);

    // 2. Traversal query
    const query = {
      start_object_id: 'receipt_1',
      start_object_type: 'Receipt',
      steps: [
        {
          step_type: 'ObjectToObject',
          object_type: 'File',
          qualifier: 'basis',
          direction: 'forward'
        }
      ]
    };
    const resVal = wasm.query_provenance_traversal(handle, JSON.stringify(query));
    const res = JSON.parse(resVal);
    expect(res.paths.length).toBe(1);
    expect(res.paths[0][0].id).toBe('receipt_1');
    expect(res.paths[0][1].id).toBe('file_1');
  });

  it('loads invalid_o2o.json and fails validation with referential integrity error', async () => {
    const loader = (await import('@wasm4pm/engine')).WasmLoader.getInstance();
    await loader.init();
    const wasm = loader.get() as any;
    const invalidJsonStr = readFileSync(resolve(__dirname, '../../fixtures/ocpq/invalid_o2o.json'), 'utf8');
    const handle = wasm.load_ocel2_from_json(invalidJsonStr);
    expect(handle).toBeDefined();

    const reportVal = wasm.validate_ocel(handle);
    const report = JSON.parse(reportVal as string);
    expect(report.valid).toBe(false);
    expect(report.error_count).toBeGreaterThan(0);
    expect(report.errors.some((e: string) => e.includes('references non-existent object'))).toBe(true);
  });

  it('loads invalid_monotonicity.json and fails validation with monotonicity error', async () => {
    const loader = (await import('@wasm4pm/engine')).WasmLoader.getInstance();
    await loader.init();
    const wasm = loader.get() as any;
    const invalidJsonStr = readFileSync(resolve(__dirname, '../../fixtures/ocpq/invalid_monotonicity.json'), 'utf8');
    const handle = wasm.load_ocel2_from_json(invalidJsonStr);
    expect(handle).toBeDefined();

    const reportVal = wasm.validate_ocel(handle);
    const report = JSON.parse(reportVal as string);
    expect(report.valid).toBe(false);
    expect(report.error_count).toBeGreaterThan(0);
    expect(report.errors.some((e: string) => e.includes('Monotonicity violation'))).toBe(true);
  });
});
