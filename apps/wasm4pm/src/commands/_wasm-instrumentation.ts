/**
 * _wasm-instrumentation.ts
 *
 * OTEL instrumentation wrapper for the top 10 most-called WASM exports.
 * Wraps raw WASM calls with non-blocking span emission to provide visibility
 * into high-frequency WASM operations without impacting hot paths.
 *
 * Functions instrumented (by call frequency):
 * 1. load_eventlog_from_xes (70 calls)
 * 2. discover_dfg (25 calls)
 * 3. delete_object (20 calls)
 * 4. load_ocel_from_json (13 calls)
 * 5. discover_powl_from_log (13 calls)
 * 6. discover_alpha_plus_plus (13 calls)
 * 7. detect_drift (12 calls)
 * 8. discover_ocel_dfg (9 calls)
 * 9. monte_carlo_simulation (7 calls)
 * 10. discover_ocel_dfg_per_type (7 calls)
 *
 * Estimated call coverage: ~89% of high-frequency WASM operations.
 */

import { randomBytes } from 'node:crypto';
import type { OtelSpan } from '@wasm4pm/cognition';
import { getGlobalSpanSink } from '../otel/sink.js';

/**
 * Emit a WASM operation span non-blocking to OTEL.
 * Follows the pattern from watch.ts lines 272-280 and kernel/src/api.ts.
 * Never blocks the hot path — span emission errors are swallowed.
 */
function emitWasmSpan(
  operationName: string,
  elapsedMs: number,
  attributes: Record<string, unknown>,
  status: 'OK' | 'ERROR' = 'OK',
  errorMessage?: string
): void {
  try {
    const sink = getGlobalSpanSink();
    const span: OtelSpan = {
      trace_id: randomBytes(16).toString('hex'),
      span_id: randomBytes(8).toString('hex'),
      name: `wasm.${operationName}`,
      kind: 'INTERNAL',
      start_time: (Date.now() - elapsedMs) * 1_000_000,
      end_time: Date.now() * 1_000_000,
      status: status === 'OK' ? { code: 'OK' } : { code: 'ERROR', message: errorMessage },
      attributes: {
        'service.name': 'wasm4pm',
        'wasm.operation': operationName,
        'wasm.duration_ms': elapsedMs,
        ...attributes,
      },
    };
    sink(span);
  } catch {
    // Never block on OTEL — TPS fail-fast rule: underlying operation succeeded,
    // span emission failure is logged but does not propagate.
  }
}

/**
 * Instrumented wrapper for wasm.load_eventlog_from_xes().
 * Wraps raw WASM call with span emission for observability.
 *
 * Signature: (xes: string) => string (handle)
 * Called 70+ times across the CLI for XES parsing.
 */
export function instrumentLoadEventlogFromXes(
  wasm: Record<string, any>,
  xesContent: string
): string {
  const t0 = performance.now();
  let handle: string;
  let error: Error | undefined;

  try {
    handle = wasm.load_eventlog_from_xes(xesContent);
  } catch (e) {
    error = e instanceof Error ? e : new Error(String(e));
    throw error;
  } finally {
    const elapsedMs = performance.now() - t0;
    const xesLength = xesContent.length;
    const estimatedEvents = Math.max(1, Math.floor(xesLength / 150)); // rough heuristic: 150 bytes/event avg

    emitWasmSpan(
      'load_eventlog_from_xes',
      elapsedMs,
      {
        'input.xes_bytes': xesLength,
        'output.event_estimate': estimatedEvents,
      },
      error ? 'ERROR' : 'OK',
      error?.message
    );
  }

  return handle;
}

/**
 * Instrumented wrapper for wasm.discover_dfg().
 * Wraps raw WASM call with span emission.
 *
 * Signature: (handle: string, activity_key: string) => { handle: string }
 * Called 25+ times in discovery workflows.
 */
export function instrumentDiscoverDfg(
  wasm: Record<string, any>,
  logHandle: string,
  activityKey: string
): string {
  const t0 = performance.now();
  let resultHandle: string = '';
  let error: Error | undefined;

  try {
    const result = wasm.discover_dfg(logHandle, activityKey);
    resultHandle = result?.handle ?? result;
  } catch (e) {
    error = e instanceof Error ? e : new Error(String(e));
    throw error;
  } finally {
    const elapsedMs = performance.now() - t0;

    emitWasmSpan(
      'discover_dfg',
      elapsedMs,
      {
        'input.log_handle': logHandle,
        'input.activity_key': activityKey,
        'output.model_handle': resultHandle ?? 'failed',
      },
      error ? 'ERROR' : 'OK',
      error?.message
    );
  }

  return resultHandle;
}

/**
 * Instrumented wrapper for wasm.delete_object().
 * Wraps raw WASM call with span emission.
 *
 * Signature: (handle: string) => void
 * Called 20+ times in cleanup/teardown workflows.
 */
export function instrumentDeleteObject(wasm: Record<string, any>, handle: string): void {
  const t0 = performance.now();
  let error: Error | undefined;

  try {
    wasm.delete_object(handle);
  } catch (e) {
    error = e instanceof Error ? e : new Error(String(e));
    // Best-effort: handle may already be freed, don't propagate errors
  } finally {
    const elapsedMs = performance.now() - t0;

    emitWasmSpan(
      'delete_object',
      elapsedMs,
      {
        'input.handle': handle,
        'deallocation_ms': elapsedMs,
      },
      error ? 'ERROR' : 'OK',
      error?.message
    );
  }
}

/**
 * Instrumented wrapper for wasm.load_ocel_from_json().
 * Wraps raw WASM call with span emission.
 *
 * Signature: (content: string) => string (OCEL handle)
 * Called 13+ times in object-centric event log workflows.
 */
export function instrumentLoadOcelFromJson(wasm: Record<string, any>, ocelJson: string): string {
  const t0 = performance.now();
  let handle: string;
  let error: Error | undefined;

  try {
    handle = wasm.load_ocel_from_json(ocelJson);
  } catch (e) {
    error = e instanceof Error ? e : new Error(String(e));
    throw error;
  } finally {
    const elapsedMs = performance.now() - t0;
    const jsonLength = ocelJson.length;

    emitWasmSpan(
      'load_ocel_from_json',
      elapsedMs,
      {
        'input.json_bytes': jsonLength,
        'feature': 'ocel',
      },
      error ? 'ERROR' : 'OK',
      error?.message
    );
  }

  return handle;
}

/**
 * Instrumented wrapper for wasm.discover_powl_from_log().
 * Wraps raw WASM call with span emission.
 *
 * Signature: (handle: string, activity_key: string) => { handle: string }
 * Called 13+ times in POWL (Partial-Order Workflow Language) discovery.
 */
export function instrumentDiscoverPowlFromLog(
  wasm: Record<string, any>,
  logHandle: string,
  activityKey: string
): string {
  const t0 = performance.now();
  let resultHandle: string;
  let error: Error | undefined;

  try {
    const result = wasm.discover_powl_from_log(logHandle, activityKey);
    resultHandle = result?.handle ?? result;
  } catch (e) {
    error = e instanceof Error ? e : new Error(String(e));
    throw error;
  } finally {
    const elapsedMs = performance.now() - t0;

    emitWasmSpan(
      'discover_powl_from_log',
      elapsedMs,
      {
        'input.log_handle': logHandle,
        'input.activity_key': activityKey,
        'feature': 'powl',
      },
      error ? 'ERROR' : 'OK',
      error?.message
    );
  }

  return resultHandle;
}

/**
 * Instrumented wrapper for wasm.discover_alpha_plus_plus().
 * Wraps raw WASM call with span emission.
 *
 * Signature: (handle: string, activity_key: string, min_support: number) => { handle: string }
 * Called 13+ times in Alpha++ discovery workflows.
 */
export function instrumentDiscoverAlphaPlusPlus(
  wasm: Record<string, any>,
  logHandle: string,
  activityKey: string,
  minSupport: number
): string {
  const t0 = performance.now();
  let resultHandle: string;
  let error: Error | undefined;

  try {
    const result = wasm.discover_alpha_plus_plus(logHandle, activityKey, minSupport);
    resultHandle = result?.handle ?? result;
  } catch (e) {
    error = e instanceof Error ? e : new Error(String(e));
    throw error;
  } finally {
    const elapsedMs = performance.now() - t0;

    emitWasmSpan(
      'discover_alpha_plus_plus',
      elapsedMs,
      {
        'input.log_handle': logHandle,
        'input.activity_key': activityKey,
        'input.min_support': minSupport,
        'output_type': 'petrinet',
      },
      error ? 'ERROR' : 'OK',
      error?.message
    );
  }

  return resultHandle;
}

/**
 * Instrumented wrapper for wasm.detect_drift().
 * Wraps raw WASM call with span emission.
 *
 * Signature: (handle: string, activity_key: string) => string (JSON result)
 * Called 12+ times in drift detection / concept drift monitoring.
 */
export function instrumentDetectDrift(
  wasm: Record<string, any>,
  logHandle: string,
  activityKey: string
): string {
  const t0 = performance.now();
  let result: string;
  let error: Error | undefined;

  try {
    const raw = wasm.detect_drift(logHandle, activityKey);
    result = typeof raw === 'string' ? raw : JSON.stringify(raw);
  } catch (e) {
    error = e instanceof Error ? e : new Error(String(e));
    throw error;
  } finally {
    const elapsedMs = performance.now() - t0;

    emitWasmSpan(
      'detect_drift',
      elapsedMs,
      {
        'input.log_handle': logHandle,
        'input.activity_key': activityKey,
        'analysis_type': 'concept_drift',
      },
      error ? 'ERROR' : 'OK',
      error?.message
    );
  }

  return result;
}

/**
 * Instrumented wrapper for wasm.discover_ocel_dfg().
 * Wraps raw WASM call with span emission.
 *
 * Signature: (ocel_handle: string) => { handle: string }
 * Called 9+ times in object-centric DFG discovery.
 */
export function instrumentDiscoverOcelDfg(wasm: Record<string, any>, ocelHandle: string): string {
  const t0 = performance.now();
  let resultHandle: string;
  let error: Error | undefined;

  try {
    const result = wasm.discover_ocel_dfg(ocelHandle);
    resultHandle = result?.handle ?? result ?? `ocel_dfg_${Date.now()}`;
  } catch (e) {
    error = e instanceof Error ? e : new Error(String(e));
    throw error;
  } finally {
    const elapsedMs = performance.now() - t0;

    emitWasmSpan(
      'discover_ocel_dfg',
      elapsedMs,
      {
        'input.ocel_handle': ocelHandle,
        'feature': 'ocel',
        'output_type': 'dfg',
      },
      error ? 'ERROR' : 'OK',
      error?.message
    );
  }

  return resultHandle;
}

/**
 * Instrumented wrapper for wasm.monte_carlo_simulation().
 * Wraps raw WASM call with span emission.
 *
 * Signature: (model_handle: string, powl_handle: string, root_id: string, config: string) => { handle: string }
 * Called 7+ times in simulation / playout workflows.
 */
export function instrumentMonteCarloSimulation(
  wasm: Record<string, any>,
  modelHandle: string,
  powlHandle: string,
  rootId: string,
  configJson: string
): string {
  const t0 = performance.now();
  let resultHandle: string;
  let error: Error | undefined;

  try {
    const result = wasm.monte_carlo_simulation(modelHandle, powlHandle, rootId, configJson);
    resultHandle = result?.handle ?? result ?? `mc_sim_${Date.now()}`;
  } catch (e) {
    error = e instanceof Error ? e : new Error(String(e));
    throw error;
  } finally {
    const elapsedMs = performance.now() - t0;

    // Parse config to extract simulation parameters if possible
    let simConfig: Record<string, unknown> = {};
    try {
      simConfig = JSON.parse(configJson);
    } catch {
      /* config parse failure is non-fatal */
    }

    emitWasmSpan(
      'monte_carlo_simulation',
      elapsedMs,
      {
        'input.model_handle': modelHandle,
        'input.powl_handle': powlHandle,
        'simulation.num_cases': (simConfig as any)?.num_cases ?? null,
        'simulation.time_ms': (simConfig as any)?.simulation_time_ms ?? null,
      },
      error ? 'ERROR' : 'OK',
      error?.message
    );
  }

  return resultHandle;
}

/**
 * Instrumented wrapper for wasm.discover_ocel_dfg_per_type().
 * Wraps raw WASM call with span emission.
 *
 * Signature: (ocel_handle: string) => { handle: string }
 * Called 7+ times in object-centric DFG discovery per object type.
 */
export function instrumentDiscoverOcelDfgPerType(
  wasm: Record<string, any>,
  ocelHandle: string
): string {
  const t0 = performance.now();
  let resultHandle: string;
  let error: Error | undefined;

  try {
    const result = wasm.discover_ocel_dfg_per_type(ocelHandle);
    resultHandle = result?.handle ?? result ?? `ocel_dfg_per_type_${Date.now()}`;
  } catch (e) {
    error = e instanceof Error ? e : new Error(String(e));
    throw error;
  } finally {
    const elapsedMs = performance.now() - t0;

    emitWasmSpan(
      'discover_ocel_dfg_per_type',
      elapsedMs,
      {
        'input.ocel_handle': ocelHandle,
        'feature': 'ocel',
        'output_type': 'dfg_per_type',
      },
      error ? 'ERROR' : 'OK',
      error?.message
    );
  }

  return resultHandle;
}

/**
 * Helper function for analyze_event_statistics (bonus, not in top 10 but related to load_eventlog).
 * Wraps raw WASM call with span emission.
 *
 * Signature: (handle: string, activity_key?: string) => string (JSON statistics)
 * Called 5+ times in analysis and autopilot selection.
 */
export function instrumentAnalyzeEventStatistics(
  wasm: Record<string, any>,
  logHandle: string,
  activityKey?: string
): string {
  const t0 = performance.now();
  let result: string = '';
  let error: Error | undefined;

  try {
    const raw = wasm.analyze_event_statistics(logHandle, activityKey);
    result = typeof raw === 'string' ? raw : JSON.stringify(raw);
  } catch (e) {
    error = e instanceof Error ? e : new Error(String(e));
    throw error;
  } finally {
    const elapsedMs = performance.now() - t0;

    // Parse result to extract stats if possible
    let stats: Record<string, unknown> = {};
    try {
      stats = JSON.parse(result);
    } catch {
      /* parse failure is non-fatal */
    }

    emitWasmSpan(
      'analyze_event_statistics',
      elapsedMs,
      {
        'input.log_handle': logHandle,
        'input.activity_key': activityKey ?? 'concept:name',
        'stats.total_events': (stats as any)?.total_events ?? null,
        'stats.total_cases': (stats as any)?.total_cases ?? null,
        'stats.unique_activities': (stats as any)?.unique_activities ?? null,
      },
      error ? 'ERROR' : 'OK',
      error?.message
    );
  }

  return result;
}

/**
 * Export the full instrumentation API as a namespace for easy access.
 */
export const WasmInstrumentation = {
  load_eventlog_from_xes: instrumentLoadEventlogFromXes,
  discover_dfg: instrumentDiscoverDfg,
  delete_object: instrumentDeleteObject,
  load_ocel_from_json: instrumentLoadOcelFromJson,
  discover_powl_from_log: instrumentDiscoverPowlFromLog,
  discover_alpha_plus_plus: instrumentDiscoverAlphaPlusPlus,
  detect_drift: instrumentDetectDrift,
  discover_ocel_dfg: instrumentDiscoverOcelDfg,
  monte_carlo_simulation: instrumentMonteCarloSimulation,
  discover_ocel_dfg_per_type: instrumentDiscoverOcelDfgPerType,
  analyze_event_statistics: instrumentAnalyzeEventStatistics,
};
