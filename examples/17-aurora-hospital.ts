/**
 * Case Study: "Aurora" — Fully Autonomic Hospital Supply Chain & Patient Flow
 *
 * The maximal composition on the triad: PDDL figures out the FUTURE,
 * POWL v2 is the PRESENT, OCEL 2.0 is the PAST.
 *
 *   Phase 1 (PAST):    sweep ALL registered algorithms over the Aurora log
 *   Phase 2 (ANALYZE): run ALL 55 cognitive breeds (BLAKE3-receipted)
 *   Phase 3 (FUTURE):  consume the PDDL plan (solved natively in
 *                      crates/wasm4pm-planner/tests/aurora_loop.rs — the
 *                      planner is a Rust library/MCP server, not WASM) as a
 *                      plan-derived POWL v2 model
 *   Phase 4 (PRESENT): execute it on the proof-carrying bcinr-powl engine,
 *                      then close the loop by re-mining the emitted OCEL 2.0
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Kernel } from '../packages/kernel/src/api.js';
import { getRegistry } from '../packages/kernel/src/registry.js';
import {
  buildPositiveParams,
  logHandleForAlgorithm,
  type BoundaryContext,
} from '../scripts/release/algorithm-behavior/boundary.js';
import { runContract } from '../packages/cognition/src/contract/run.js';
import { BREED_IDS } from '../packages/cognition/src/breed-ids.js';

const ROOT = process.cwd();

// ─── Aurora synthetic dataset (deterministic; mirrors aurora_loop.rs) ───────

const VARIANT_A1 = ['register', 'triage', 'sterile_prep', 'lab_order', 'vitals_check', 'lab_collect', 'lab_analyze', 'treat', 'discharge'];
const VARIANT_A2 = ['register', 'triage', 'sterile_prep', 'lab_order', 'lab_collect', 'vitals_check', 'lab_analyze', 'treat', 'discharge'];
const VARIANT_B = ['register', 'triage', 'assess', 'treat', 'discharge'];
const VARIANT_C = ['register', 'triage', 'sepsis_alert', 'antibiotics', 'icu_transfer'];
const VARIANT_LATE = ['register', 'triage', 'rapid_test', 'treat', 'discharge'];

function auroraXes(): string {
  const traces: string[] = [];
  let caseId = 0;
  const emit = (day: number, gapMin: number, acts: string[]) => {
    const events = acts
      .map((a, i) => {
        const total = i * gapMin;
        const ts = `2026-02-${String(day).padStart(2, '0')}T${String(8 + Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}:00.000+00:00`;
        return `      <event><string key="concept:name" value="${a}"/><date key="time:timestamp" value="${ts}"/></event>`;
      })
      .join('\n');
    traces.push(`    <trace><string key="concept:name" value="aurora-${caseId++}"/>\n${events}\n    </trace>`);
  };
  for (let day = 1; day <= 14; day++) {
    emit(day, 12, day % 2 === 0 ? VARIANT_A1 : VARIANT_A2);
    emit(day, 12, VARIANT_B);
    if (day % 3 === 0) emit(day, 12, VARIANT_C);
  }
  for (let day = 15; day <= 28; day++) {
    emit(day, 4, VARIANT_LATE);
    emit(day, 4, VARIANT_B);
    if (day % 3 === 0) emit(day, 4, VARIANT_C);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<log xes.version="1.0">\n${traces.join('\n')}\n</log>`;
}

/** Aurora OCEL 2.0: multi-object hospital events (patient/order/specimen/bed/nurse/device). */
function auroraOcel(): string {
  const objectTypes = ['patient', 'order', 'specimen', 'bed', 'nurse', 'device'].map((name) => ({
    name,
    attributes: [],
  }));
  const eventTypes = ['admit', 'order_lab', 'collect', 'analyze', 'assign_bed', 'treat', 'discharge'].map(
    (name) => ({ name, attributes: [] })
  );
  const objects: any[] = [];
  const events: any[] = [];
  let eid = 0;
  for (let p = 0; p < 12; p++) {
    const pid = `patient-${p}`;
    const oid = `order-${p}`;
    const sid = `specimen-${p}`;
    const bid = `bed-${p % 4}`;
    const nid = `nurse-${p % 3}`;
    objects.push({ id: pid, type: 'patient', attributes: [] }, { id: oid, type: 'order', attributes: [] }, { id: sid, type: 'specimen', attributes: [] });
    const day = 1 + p;
    const at = (h: number) => `2026-02-${String(day).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00Z`;
    const rel = (...ids: string[]) => ids.map((objectId) => ({ objectId, qualifier: 'involves' }));
    events.push(
      { id: `e${eid++}`, type: 'admit', time: at(8), attributes: [], relationships: rel(pid, bid, nid) },
      { id: `e${eid++}`, type: 'order_lab', time: at(9), attributes: [], relationships: rel(pid, oid) },
      { id: `e${eid++}`, type: 'collect', time: at(10), attributes: [], relationships: rel(oid, sid, nid) },
      { id: `e${eid++}`, type: 'analyze', time: at(11), attributes: [], relationships: rel(sid, `device-0`) },
      { id: `e${eid++}`, type: 'treat', time: at(12), attributes: [], relationships: rel(pid, nid) },
      { id: `e${eid++}`, type: 'discharge', time: at(14), attributes: [], relationships: rel(pid, bid) }
    );
  }
  objects.push({ id: 'bed-0', type: 'bed', attributes: [] }, { id: 'bed-1', type: 'bed', attributes: [] }, { id: 'bed-2', type: 'bed', attributes: [] }, { id: 'bed-3', type: 'bed', attributes: [] });
  objects.push({ id: 'nurse-0', type: 'nurse', attributes: [] }, { id: 'nurse-1', type: 'nurse', attributes: [] }, { id: 'nurse-2', type: 'nurse', attributes: [] });
  objects.push({ id: 'device-0', type: 'device', attributes: [] });
  return JSON.stringify({ objectTypes, eventTypes, objects, events });
}

// ─── Phase 3 artifact: the plan-derived POWL v2 model ────────────────────────
// Produced by plan_to_powl_v2(find_temporal_plan(...)) in aurora_loop.rs:
// two response tasks, two nurses → parallel (no precedence edges).
const AURORA_PLAN_POWL =
  'PartialOrder(plan) { nodes: [perform_task_restock_rapid_tests, perform_task_transfer_icu], edges: [] }';

async function main(): Promise<void> {
  const pkgPath = path.resolve(ROOT, 'wasm4pm/pkg/wasm4pm.js');
  const wasm: Record<string, any> = await import(pathToFileURL(pkgPath).href);
  if (typeof wasm.default === 'function') await wasm.default();
  const kernel = new Kernel(wasm as never);
  await kernel.init();

  // ── Phase 1: THE PAST — full-battery mining sweep ─────────────────────────
  const xesLogHandle = wasm.load_eventlog_from_xes(auroraXes());
  assert.ok(xesLogHandle, 'Aurora XES must load');
  const ocelLogHandle = wasm.load_ocel_from_json(auroraOcel());
  assert.ok(ocelLogHandle, 'Aurora OCEL 2.0 must load');

  const ctx = { wasm, kernel, xesLogHandle, ocelLogHandle, cleanup: () => {} } as BoundaryContext;
  const algorithms = getRegistry().list().map((a) => a.id);
  assert.ok(algorithms.length >= 60, `registry must expose ≥60 algorithms, got ${algorithms.length}`);

  const failures: string[] = [];
  for (const id of algorithms) {
    try {
      const params = await buildPositiveParams(ctx, id);
      const handle = logHandleForAlgorithm(ctx, id);
      const result = await kernel.runRaw(id, handle, 'concept:name', params);
      assert.ok(result, `${id} returned nothing`);
    } catch (e) {
      failures.push(`${id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  assert.equal(
    failures.length,
    0,
    `PAST phase: every algorithm must mine the Aurora log; failures:\n${failures.join('\n')}`
  );
  console.log(`[aurora] PAST: ${algorithms.length}/${algorithms.length} algorithms mined the history`);

  // Spot-check planted phenomena through the kernel path.
  const outcome = await kernel.runRaw('predict_outcome', xesLogHandle, 'concept:name', {
    prefix_json: JSON.stringify(['triage', 'sepsis_alert']),
  });
  const outcomeResult = (outcome as any).metadata.result;
  assert.equal(outcomeResult.outcome, 'icu_transfer', 'sepsis prefix must predict ICU transfer');
  assert.ok(outcomeResult.probability > 0.7, `ICU probability must be high, got ${outcomeResult.probability}`);

  // ── Phase 2: ANALYZE — all 55 breeds deliberate ───────────────────────────
  const breedFailures: string[] = [];
  let receipts = 0;
  for (const breed of BREED_IDS) {
    const fixturePath = path.resolve(ROOT, `packages/cognition/src/__tests__/fixtures/papers/${breed}.json`);
    if (!fs.existsSync(fixturePath)) {
      breedFailures.push(`${breed}: MISSING FIXTURE (must not skip)`);
      continue;
    }
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    // Most fixtures wrap the contract in `input`; a few are bare BreedInputs.
    const contract = fixture.input ?? fixture;
    try {
      const result = await runContract(breed, contract);
      assert.equal(result.status, 'ok', `${breed} status`);
      assert.ok(result.output_hash?.length === 64, `${breed} must emit a BLAKE3 output hash`);
      receipts++;
    } catch (e) {
      breedFailures.push(`${breed}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  assert.equal(
    breedFailures.length,
    0,
    `ANALYZE phase: all breeds must deliberate; failures:\n${breedFailures.join('\n')}`
  );
  assert.equal(receipts, BREED_IDS.length);
  console.log(`[aurora] ANALYZE: ${receipts}/${BREED_IDS.length} breeds deliberated with receipts`);

  // ── Phase 3+4: FUTURE → PRESENT — execute the PDDL-derived POWL v2 plan ───
  assert.equal(typeof wasm.powl_execute, 'function', 'WASM build must include the powl-engine feature');
  const execRaw = wasm.powl_execute(AURORA_PLAN_POWL, JSON.stringify({ max_iters: 3 }));
  const exec = typeof execRaw === 'string' ? JSON.parse(execRaw) : execRaw;
  assert.equal(exec.conformance, 'conforms', 'plan execution must conform to its own tape');
  assert.equal(exec.receipt.overflow, false);
  assert.equal(exec.receipt.chain_hash.length, 64, 'proof-carrying BLAKE3 chain hash');
  const fired = exec.fired.filter((f: any) => f.activity).map((f: any) => f.activity);
  assert.ok(fired.includes('perform_task_transfer_icu') && fired.includes('perform_task_restock_rapid_tests'));
  console.log(`[aurora] PRESENT: plan executed, chain ${exec.receipt.chain_hash.slice(0, 16)}…`);

  // ── Loop closure: the emitted OCEL 2.0 is tomorrow's PAST ─────────────────
  const emittedOcel = JSON.stringify(exec.ocel);
  assert.ok(emittedOcel.includes('op_fired') && emittedOcel.includes('run_sealed'));
  const nextPastHandle = wasm.load_ocel_from_json(emittedOcel);
  assert.ok(nextPastHandle, 'emitted OCEL must be loadable as next cycle input');
  const nextDfg = await kernel.runRaw('ocel_dfg', nextPastHandle, 'concept:name', {});
  assert.ok(nextDfg, 'the loop closes: executed present re-mines as past');
  console.log('[aurora] CLOSURE: emitted OCEL re-mined — past → present → future → past ✓');
}

main().catch((error: Error) => {
  console.error('[aurora] FAILED:', error.message);
  process.exit(1);
});
