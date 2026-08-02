import { blake3Hex } from '../receipts/_shared.js';
import {
  detectFormat,
  isOcelFormat,
  readToEpisodeSet,
  type ConformanceWasmModule,
  type EpisodeSet,
  type LogFormat,
} from '../engines/conformance/index.js';

export const VISION_SESSION_SCHEMA = 'wasm4pm.vision-session.v1' as const;

export interface OcelPowlWasmModule extends ConformanceWasmModule {
  load_ocel_from_json?: (content: string) => string;
  export_ocel_to_json?: (handle: string) => string;
  get_ocel_event_count?: (handle: string) => number;
  get_ocel_object_count?: (handle: string) => number;
  delete_object?: (handle: string) => void;
  discover_powl_from_log?: (logJson: string, variant: string) => unknown;
  discover_powl_from_log_config?: (
    logJson: string,
    activityKey: string,
    variant: string,
    minTraceCount: number,
    noiseThreshold: number
  ) => unknown;
  parse_powl?: (model: string) => unknown;
  validate_partial_orders?: (model: string) => unknown;
  powl_execute?: (model: string, configJson: string) => unknown;
}

export interface VisionSessionOptions {
  readonly groupByObjectType: string;
  readonly variant: string;
  readonly activityKey?: string;
  readonly minTraceCount?: number;
  readonly noiseThreshold?: number;
  readonly maxIters?: number;
}

export interface VisionSessionEvidence {
  readonly schema_version: typeof VISION_SESSION_SCHEMA;
  readonly standing: 'ALIVE';
  readonly subject: {
    readonly format: Exclude<LogFormat, 'xes' | 'csv' | 'ocel-ndjson'>;
    readonly input_hash: string;
    readonly admitted_ocel_hash: string;
    readonly object_type: string;
    readonly event_count: number;
    readonly object_count: number;
  };
  readonly route: {
    readonly variant: string;
    readonly activity_key: string;
    readonly min_trace_count: number;
    readonly noise_threshold: number;
    readonly episode_count: number;
    readonly total_events: number;
    readonly ungrouped_event_count: number;
    readonly event_log_hash: string;
    readonly model_hash: string;
    readonly model_repr: string;
    readonly model_node_count: number | null;
    readonly partial_orders_valid: boolean;
  };
  readonly execution: {
    readonly max_iters: number;
    readonly output_hash: string;
    readonly output: unknown;
  };
  readonly evidence_hash: string;
}

export interface VisionSessionReplay {
  readonly schema_version: 'wasm4pm.vision-session-replay.v1';
  readonly standing: 'ALIVE' | 'BLOCKED';
  readonly expected_evidence_hash: string;
  readonly observed_evidence_hash: string;
  readonly mismatches: readonly string[];
}

export class VisionSessionError extends Error {
  constructor(readonly code: string, message: string, readonly details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'VisionSessionError';
  }
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, child]) => [key, sortJson(child)])
    );
  }
  return value;
}

export function canonicalVisionJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function normalizeWasmResult(value: unknown, label: string): Record<string, unknown> {
  let normalized = value;
  if (typeof normalized === 'string') {
    try {
      normalized = JSON.parse(normalized) as unknown;
    } catch (error) {
      throw new VisionSessionError(
        'INVALID_WASM_RESULT',
        `${label} returned non-JSON text: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  } else if (normalized instanceof Map) {
    normalized = Object.fromEntries(normalized);
  }
  if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) {
    throw new VisionSessionError('INVALID_WASM_RESULT', `${label} did not return an object`);
  }
  return normalized as Record<string, unknown>;
}

function requireFunction<K extends keyof OcelPowlWasmModule>(
  wasm: OcelPowlWasmModule,
  name: K,
  code: string
): NonNullable<OcelPowlWasmModule[K]> {
  const value = wasm[name];
  if (typeof value !== 'function') {
    throw new VisionSessionError(code, `Current WASM build does not export ${String(name)}`);
  }
  return value as NonNullable<OcelPowlWasmModule[K]>;
}

function validateOptions(options: VisionSessionOptions): Required<VisionSessionOptions> {
  const normalized: Required<VisionSessionOptions> = {
    groupByObjectType: options.groupByObjectType.trim(),
    variant: options.variant.trim() || 'decision_graph_cyclic_strict',
    activityKey: options.activityKey?.trim() || 'concept:name',
    minTraceCount: options.minTraceCount ?? 1,
    noiseThreshold: options.noiseThreshold ?? 0,
    maxIters: options.maxIters ?? 3,
  };
  if (!normalized.groupByObjectType) {
    throw new VisionSessionError(
      'OBJECT_TYPE_REQUIRED',
      'An OCEL object type is required to manufacture process episodes'
    );
  }
  if (!Number.isInteger(normalized.minTraceCount) || normalized.minTraceCount < 1) {
    throw new VisionSessionError(
      'INVALID_MIN_TRACE_COUNT',
      'minTraceCount must be an integer greater than or equal to 1'
    );
  }
  if (
    !Number.isFinite(normalized.noiseThreshold) ||
    normalized.noiseThreshold < 0 ||
    normalized.noiseThreshold > 1
  ) {
    throw new VisionSessionError(
      'INVALID_NOISE_THRESHOLD',
      'noiseThreshold must be a finite number in [0, 1]'
    );
  }
  if (!Number.isInteger(normalized.maxIters) || normalized.maxIters < 0 || normalized.maxIters > 255) {
    throw new VisionSessionError('INVALID_MAX_ITERS', 'maxIters must be an integer in [0, 255]');
  }
  return normalized;
}

function modelsEventLog(episodes: EpisodeSet, activityKey: string): string {
  const log = {
    attributes: {},
    traces: episodes.episodes.map((episode) => ({
      attributes: {
        'concept:name': { tag: 'String', value: episode.id },
      },
      events: episode.activities.map((activity) => ({
        attributes: {
          [activityKey]: { tag: 'String', value: activity },
        },
      })),
    })),
  };
  return canonicalVisionJson(log);
}

function evidenceHash(evidence: Omit<VisionSessionEvidence, 'evidence_hash'>): string {
  return blake3Hex(canonicalVisionJson(evidence));
}

/**
 * Execute the exact admitted OCEL → episode graph → POWL → WASM path.
 * This function performs no filesystem writes. Callers own BRCE receipts.
 */
export async function executeVisionSession(
  wasm: OcelPowlWasmModule,
  content: string,
  options: VisionSessionOptions
): Promise<VisionSessionEvidence> {
  const admitted = validateOptions(options);
  let format: LogFormat;
  try {
    format = detectFormat(content);
  } catch (error) {
    throw new VisionSessionError(
      'UNRECOGNIZED_OCEL_REFUSED',
      error instanceof Error ? error.message : String(error)
    );
  }
  if (!isOcelFormat(format)) {
    throw new VisionSessionError(
      'OCEL_REQUIRED',
      `Vision session requires OCEL; detected ${format}`
    );
  }
  if (format === 'ocel-ndjson') {
    throw new VisionSessionError(
      'OCEL_NDJSON_WASM_UNSUPPORTED',
      'OCEL NDJSON can be normalized by the TypeScript reader but has no exact load_ocel_from_json WASM admission route'
    );
  }

  const loadOcel = requireFunction(wasm, 'load_ocel_from_json', 'OCEL_WASM_LOAD_UNSUPPORTED');
  const exportOcel = requireFunction(wasm, 'export_ocel_to_json', 'OCEL_WASM_EXPORT_UNSUPPORTED');
  const eventCountFn = requireFunction(
    wasm,
    'get_ocel_event_count',
    'OCEL_EVENT_COUNT_UNSUPPORTED'
  );
  const objectCountFn = requireFunction(
    wasm,
    'get_ocel_object_count',
    'OCEL_OBJECT_COUNT_UNSUPPORTED'
  );
  const deleteObject = requireFunction(wasm, 'delete_object', 'OCEL_DELETE_UNSUPPORTED');

  let handle: string | undefined;
  let canonicalOcel: string;
  let eventCount: number;
  let objectCount: number;
  try {
    handle = loadOcel(content);
    canonicalOcel = exportOcel(handle);
    eventCount = Number(eventCountFn(handle));
    objectCount = Number(objectCountFn(handle));
  } catch (error) {
    throw new VisionSessionError(
      'OCEL_WASM_ADMISSION_REFUSED',
      `OCEL WASM admission failed: ${error instanceof Error ? error.message : String(error)}`
    );
  } finally {
    if (handle) {
      try {
        deleteObject(handle);
      } catch {
        // Admission evidence is still valid; leaked handle cleanup is surfaced by runtime diagnostics.
      }
    }
  }
  if (!Number.isInteger(eventCount) || eventCount <= 0) {
    throw new VisionSessionError('EMPTY_OCEL_REFUSED', 'OCEL contains no admitted events');
  }
  if (!Number.isInteger(objectCount) || objectCount <= 0) {
    throw new VisionSessionError('OBJECTLESS_OCEL_REFUSED', 'OCEL contains no admitted objects');
  }

  let episodeSet: EpisodeSet;
  try {
    episodeSet = readToEpisodeSet(content, undefined, {
      format,
      groupByObjectType: admitted.groupByObjectType,
    });
  } catch (error) {
    throw new VisionSessionError(
      'OCEL_EPISODE_ADMISSION_REFUSED',
      `Cannot construct ${admitted.groupByObjectType} episodes: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (episodeSet.episodes.length === 0) {
    throw new VisionSessionError(
      'EMPTY_EPISODE_SET_REFUSED',
      `No episodes were manufactured for object type ${admitted.groupByObjectType}`,
      { totalEvents: episodeSet.totalEvents }
    );
  }
  if (episodeSet.ungroupedEventCount > 0) {
    throw new VisionSessionError(
      'UNGROUPED_EVENTS_REFUSED',
      `${episodeSet.ungroupedEventCount} event(s) are not bound to ${admitted.groupByObjectType} objects`,
      {
        ungroupedEventCount: episodeSet.ungroupedEventCount,
        totalEvents: episodeSet.totalEvents,
      }
    );
  }
  const emptyEpisode = episodeSet.episodes.find((episode) => episode.activities.length === 0);
  if (emptyEpisode) {
    throw new VisionSessionError(
      'EMPTY_EPISODE_REFUSED',
      `Episode ${emptyEpisode.id} has no activities`
    );
  }

  const logJson = modelsEventLog(episodeSet, admitted.activityKey);
  const discover =
    admitted.activityKey !== 'concept:name' ||
    admitted.minTraceCount !== 1 ||
    admitted.noiseThreshold !== 0
      ? requireFunction(
          wasm,
          'discover_powl_from_log_config',
          'POWL_CONFIG_DISCOVERY_UNSUPPORTED'
        )
      : requireFunction(wasm, 'discover_powl_from_log', 'POWL_DISCOVERY_UNSUPPORTED');

  let discovered: Record<string, unknown>;
  try {
    const raw =
      discover === wasm.discover_powl_from_log_config
        ? (
            discover as NonNullable<OcelPowlWasmModule['discover_powl_from_log_config']>
          )(
            logJson,
            admitted.activityKey,
            admitted.variant,
            admitted.minTraceCount,
            admitted.noiseThreshold
          )
        : (discover as NonNullable<OcelPowlWasmModule['discover_powl_from_log']>)(
            logJson,
            admitted.variant
          );
    discovered = normalizeWasmResult(raw, 'discover_powl_from_log');
  } catch (error) {
    if (error instanceof VisionSessionError) throw error;
    throw new VisionSessionError(
      'POWL_DISCOVERY_REFUSED',
      `POWL discovery failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const modelRepr = discovered.repr;
  if (typeof modelRepr !== 'string' || modelRepr.length === 0) {
    throw new VisionSessionError(
      'POWL_MODEL_MISSING',
      'POWL discovery returned no canonical model representation'
    );
  }

  const parsePowl = requireFunction(wasm, 'parse_powl', 'POWL_PARSE_UNSUPPORTED');
  const validatePartialOrders = requireFunction(
    wasm,
    'validate_partial_orders',
    'POWL_VALIDATION_UNSUPPORTED'
  );
  let parsed: Record<string, unknown>;
  try {
    parsed = normalizeWasmResult(parsePowl(modelRepr), 'parse_powl');
    const validation = normalizeWasmResult(
      validatePartialOrders(modelRepr),
      'validate_partial_orders'
    );
    if (validation.valid !== true) {
      throw new VisionSessionError(
        'POWL_PARTIAL_ORDER_INVALID',
        'POWL partial-order validation did not return valid=true'
      );
    }
  } catch (error) {
    if (error instanceof VisionSessionError) throw error;
    throw new VisionSessionError(
      'POWL_VALIDATION_REFUSED',
      `POWL validation failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const execute = requireFunction(wasm, 'powl_execute', 'POWL_EXECUTION_UNSUPPORTED');
  let output: unknown;
  try {
    const raw = execute(modelRepr, JSON.stringify({ max_iters: admitted.maxIters }));
    if (typeof raw === 'string') {
      try {
        output = JSON.parse(raw) as unknown;
      } catch {
        output = raw;
      }
    } else if (raw instanceof Map) {
      output = Object.fromEntries(raw);
    } else {
      output = raw;
    }
  } catch (error) {
    throw new VisionSessionError(
      'POWL_EXECUTION_REFUSED',
      `POWL execution failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const withoutHash: Omit<VisionSessionEvidence, 'evidence_hash'> = {
    schema_version: VISION_SESSION_SCHEMA,
    standing: 'ALIVE',
    subject: {
      format,
      input_hash: blake3Hex(content),
      admitted_ocel_hash: blake3Hex(canonicalOcel),
      object_type: admitted.groupByObjectType,
      event_count: eventCount,
      object_count: objectCount,
    },
    route: {
      variant: admitted.variant,
      activity_key: admitted.activityKey,
      min_trace_count: admitted.minTraceCount,
      noise_threshold: admitted.noiseThreshold,
      episode_count: episodeSet.episodes.length,
      total_events: episodeSet.totalEvents,
      ungrouped_event_count: episodeSet.ungroupedEventCount,
      event_log_hash: blake3Hex(logJson),
      model_hash: blake3Hex(modelRepr),
      model_repr: modelRepr,
      model_node_count:
        typeof parsed.node_count === 'number' && Number.isFinite(parsed.node_count)
          ? parsed.node_count
          : null,
      partial_orders_valid: true,
    },
    execution: {
      max_iters: admitted.maxIters,
      output_hash: blake3Hex(canonicalVisionJson(output)),
      output,
    },
  };
  return { ...withoutHash, evidence_hash: evidenceHash(withoutHash) };
}

export function replayVisionSession(
  expected: VisionSessionEvidence,
  observed: VisionSessionEvidence
): VisionSessionReplay {
  const mismatches: string[] = [];
  if (expected.subject.input_hash !== observed.subject.input_hash) mismatches.push('input_hash');
  if (expected.subject.admitted_ocel_hash !== observed.subject.admitted_ocel_hash) {
    mismatches.push('admitted_ocel_hash');
  }
  if (expected.route.event_log_hash !== observed.route.event_log_hash) {
    mismatches.push('event_log_hash');
  }
  if (expected.route.model_hash !== observed.route.model_hash) mismatches.push('model_hash');
  if (expected.execution.output_hash !== observed.execution.output_hash) {
    mismatches.push('execution_output_hash');
  }
  if (expected.evidence_hash !== observed.evidence_hash) mismatches.push('evidence_hash');
  return {
    schema_version: 'wasm4pm.vision-session-replay.v1',
    standing: mismatches.length === 0 ? 'ALIVE' : 'BLOCKED',
    expected_evidence_hash: expected.evidence_hash,
    observed_evidence_hash: observed.evidence_hash,
    mismatches,
  };
}
