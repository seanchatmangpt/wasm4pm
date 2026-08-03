import { WasmLoader } from '@wasm4pm/engine';
import type { Diagnosis } from './types.js';
import {
  VisionSessionError,
  executeVisionSession,
  replayVisionSession,
  type OcelPowlWasmModule,
} from '../../vision/session-v2.js';

const DOCTOR_OCEL_V2 = JSON.stringify({
  eventTypes: [{ name: 'Create' }, { name: 'Ship' }],
  objectTypes: [{ name: 'Order' }],
  events: [
    {
      id: 'doctor-e1',
      type: 'Create',
      time: '2030-01-01T00:00:00Z',
      relationships: [{ objectId: 'doctor-o1' }],
    },
    {
      id: 'doctor-e2',
      type: 'Ship',
      time: '2030-01-01T00:01:00Z',
      relationships: [{ objectId: 'doctor-o1' }],
    },
  ],
  objects: [{ id: 'doctor-o1', type: 'Order' }],
});

/** Execute and immediately replay the complete OCEL-v2 → POWL → WASM route. */
export async function checkOcelPowlWasmSession(): Promise<Diagnosis> {
  try {
    const loader = WasmLoader.getInstance();
    await loader.init();
    const wasm = loader.get() as unknown as OcelPowlWasmModule;
    const options = {
      groupByObjectType: 'Order',
      variant: 'decision_graph_cyclic_strict',
      maxIters: 3,
    } as const;
    const first = await executeVisionSession(wasm, DOCTOR_OCEL_V2, options);
    const second = await executeVisionSession(wasm, DOCTOR_OCEL_V2, options);
    const replay = replayVisionSession(first, second);
    if (replay.standing !== 'ALIVE') {
      return {
        name: 'OCEL POWL WASM session',
        pathology: 'REPRODUCIBILITY_TRUTH_FAULT',
        severity: 'STOP_THE_LINE',
        message: `Exact session replay drift: ${replay.mismatches.join(', ')}`,
        repairMode: 'MANUAL_INTERVENTION',
        fixGuide: 'Locate the first mismatched hash edge and repair its deterministic boundary.',
      };
    }
    return {
      name: 'OCEL POWL WASM session',
      pathology: 'REPRODUCIBILITY_TRUTH_FAULT',
      severity: 'INFO',
      message: `OCEL-v2 normalization, object flattening, POWL discovery/validation, WASM execution, and replay passed (${first.evidence_hash})`,
    };
  } catch (error) {
    if (error instanceof VisionSessionError) {
      const unsupported = error.code.endsWith('_UNSUPPORTED');
      return {
        name: 'OCEL POWL WASM session',
        pathology: 'REPRODUCIBILITY_TRUTH_FAULT',
        severity: unsupported ? 'WARNING' : 'STOP_THE_LINE',
        message: `${error.code}: ${error.message}`,
        repairMode: 'MANUAL_INTERVENTION',
        fixGuide: unsupported
          ? 'Build a WASM package exporting the exact OCEL-v2, POWL, and execution surfaces.'
          : 'Repair the failed OCEL-v2 → POWL → WASM transition and replay this check.',
      };
    }
    return {
      name: 'OCEL POWL WASM session',
      pathology: 'DEPLOYABILITY_TRUTH_FAULT',
      severity: 'STOP_THE_LINE',
      message: `Session check execution failed: ${error instanceof Error ? error.message : String(error)}`,
      repairMode: 'MANUAL_INTERVENTION',
      fixGuide: 'Repair the WASM build or loader, then replay the capability audit.',
    };
  }
}
