import { blake3Hex } from '../receipts/_shared.js';
import {
  detectFormat,
  readToEpisodeSet,
  type ConformanceWasmModule,
  type Episode,
  type EpisodeSet,
} from '../engines/conformance/index.js';

export const VISION_SESSION_SCHEMA = 'wasm4pm.vision-session.v1' as const;

export interface OcelPowlWasmModule extends ConformanceWasmModule {
  load_ocel_v2?: (content: string) => unknown;
  flatten_ocel_v2?: (content: string, objectType: string) => unknown;
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
    readonly format: 'ocel-v2';
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
    readonly partial_orders_valid: true;
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
  constructor(
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'VisionSessionError';
  }
}

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, sorted(child)])
    );
  }
  return value;
}

export function canonicalVisionJson(value: unknown): string {
  return JSON.stringify(sorted(value));
}

function objectResult(value: unknown, label: string): Record<string, unknown> {
  let result = value;
  if (typeof result === 'string') {
    try {
      result = JSON.parse(result) as unknown;
    } catch (error) {
      throw new VisionSessionError(
        'INVALID_WASM_RESULT',
        `${label} returned non-JSON text: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  } else if (result instanceof Map) {
    result = Object.fromEntries(result);
  }
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new VisionSessionError('INVALID_WASM_RESULT', `${label} did not return an object`);
  }
  return result as Record<string, unknown>;
}

function required<K extends keyof OcelPowlWasmModule>(
  wasm: OcelPowlWasmModule,
  key: K,
  code: string
): NonNullable<OcelPowlWasmModule[K]> {
  const value = wasm[key];
  if (typeof value !== 'function') {
    throw new VisionSessionError(code, `Current WASM build does not export ${String(key)}`);
  }
  return value as NonNullable<OcelPowlWasmModule[K]>;
}

function admitOptions(options: VisionSessionOptions): Required<VisionSessionOptions> {
  const admitted = {
    groupByObjectType: options.groupByObjectType.trim(),
    variant: options.variant.trim() || 'decision_graph_cyclic_strict',
    activityKey: options.activityKey?.trim() || 'concept:name',
    minTraceCount: options.minTraceCount ?? 1,
    noiseThreshold: options.noiseThreshold ?? 0,
    maxIters: options.maxIters ?? 3,
  };
  if (!admitted.groupByObjectType) {
    throw new VisionSessionError('OBJECT_TYPE_REQUIRED', 'An OCEL object type is required');
  }
  if (!Number.isInteger(admitted.minTraceCount) || admitted.minTraceCount < 1) {
    throw new VisionSessionError('INVALID_MIN_TRACE_COUNT', 'minTraceCount must be an integer >= 1');
  }
  if (
    !Number.isFinite(admitted.noiseThreshold) ||
    admitted.noiseThreshold < 0 ||
    admitted.noiseThreshold > 1
  ) {
    throw new VisionSessionError('INVALID_NOISE_THRESHOLD', 'noiseThreshold must be in [0, 1]');
  }
  if (!Number.isInteger(admitted.maxIters) || admitted.maxIters < 0 || admitted.maxIters > 255) {
    throw new VisionSessionError('INVALID_MAX_ITERS', 'maxIters must be an integer in [0, 255]');
  }
  return admitted;
}

function flattenedEpisodes(value: unknown, objectType: string): EpisodeSet {
  const flattened = objectResult(value, 'flatten_ocel_v2');
  if (flattened.object_type !== objectType || !Array.isArray(flattened.cases)) {
    throw new VisionSessionError(
      'OCEL_FLATTEN_SCHEMA_INVALID',
      'flatten_ocel_v2 returned a mismatched object type or no cases array'
    );
  }
  const episodes = flattened.cases.map<Episode>((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new VisionSessionError('OCEL_FLATTEN_SCHEMA_INVALID', `case ${index} is not an object`);
    }
    const item = raw as Record<string, unknown>;
    if (typeof item.case_id !== 'string' || !Array.isArray(item.trace)) {
      throw new VisionSessionError('OCEL_FLATTEN_SCHEMA_INVALID', `case ${index} lacks case_id or trace`);
    }
    const activities = item.trace.map((activity, activityIndex) => {
      if (typeof activity !== 'string' || activity.length === 0) {
        throw new VisionSessionError(
          'OCEL_FLATTEN_SCHEMA_INVALID',
          `case ${index} activity ${activityIndex} is invalid`
        );
      }
      return activity;
    });
    return { id: item.case_id, activities, eventCount: activities.length };
  });
  return {
    sourceFormat: 'ocel-v2-wasm-flatten',
    episodes,
    totalEvents: episodes.reduce((sum, episode) => sum + episode.eventCount, 0),
    ungroupedEventCount: 0,
  };
}

function episodeFingerprint(episode: Episode): string {
  return `${episode.id}\u0000${episode.activities.join('\u0000')}`;
}

function assertReaderAgreement(wasmSet: EpisodeSet, readerSet: EpisodeSet): void {
  if (readerSet.ungroupedEventCount > 0) {
    throw new VisionSessionError(
      'UNGROUPED_EVENTS_REFUSED',
      `${readerSet.ungroupedEventCount} event(s) are not bound to the admitted object type`
    );
  }
  const wasm = wasmSet.episodes.map(episodeFingerprint).sort();
  const reader = readerSet.episodes.map(episodeFingerprint).sort();
  if (canonicalVisionJson(wasm) !== canonicalVisionJson(reader)) {
    throw new VisionSessionError(
      'OCEL_FLATTEN_DISAGREEMENT_REFUSED',
      'WASM flattening disagrees with the dialect-erased reader'
    );
  }
}

function modelsEventLog(episodes: EpisodeSet, activityKey: string): string {
  return canonicalVisionJson({
    attributes: {},
    traces: episodes.episodes.map((episode) => ({
      attributes: { 'concept:name': { tag: 'String', value: episode.id } },
      events: episode.activities.map((activity) => ({
        attributes: { [activityKey]: { tag: 'String', value: activity } },
      })),
    })),
  });
}

export async function executeVisionSession(
  wasm: OcelPowlWasmModule,
  content: string,
  options: VisionSessionOptions
): Promise<VisionSessionEvidence> {
  const admitted = admitOptions(options);
  const format = detectFormat(content);
  if (format !== 'ocel-v2') {
    const code =
      format === 'ocel-v1'
        ? 'OCEL_V1_WASM_UNSUPPORTED'
        : format === 'ocel-ndjson'
          ? 'OCEL_NDJSON_WASM_UNSUPPORTED'
          : 'OCEL_REQUIRED';
    throw new VisionSessionError(
      code,
      `Vision session requires the executable OCEL-v2 WASM route; detected ${format}`
    );
  }

  const loadOcel = required(wasm, 'load_ocel_v2', 'OCEL_V2_WASM_LOAD_UNSUPPORTED');
  const flattenOcel = required(wasm, 'flatten_ocel_v2', 'OCEL_V2_WASM_FLATTEN_UNSUPPORTED');
  const canonicalOcel = objectResult(loadOcel(content), 'load_ocel_v2');
  const wasmSet = flattenedEpisodes(
    flattenOcel(content, admitted.groupByObjectType),
    admitted.groupByObjectType
  );
  const readerSet = readToEpisodeSet(content, undefined, {
    format,
    groupByObjectType: admitted.groupByObjectType,
  });
  assertReaderAgreement(wasmSet, readerSet);

  const eventCount = Array.isArray(canonicalOcel.events) ? canonicalOcel.events.length : 0;
  const objectCount = Array.isArray(canonicalOcel.objects) ? canonicalOcel.objects.length : 0;
  if (eventCount === 0) throw new VisionSessionError('EMPTY_OCEL_REFUSED', 'OCEL has no events');
  if (objectCount === 0) throw new VisionSessionError('OBJECTLESS_OCEL_REFUSED', 'OCEL has no objects');
  if (wasmSet.episodes.length === 0) {
    throw new VisionSessionError('EMPTY_EPISODE_SET_REFUSED', 'No object-type episodes were manufactured');
  }
  if (wasmSet.episodes.some((episode) => episode.activities.length === 0)) {
    throw new VisionSessionError('EMPTY_EPISODE_REFUSED', 'At least one episode has no activities');
  }

  const logJson = modelsEventLog(wasmSet, admitted.activityKey);
  let discovered: Record<string, unknown>;
  if (
    admitted.activityKey !== 'concept:name' ||
    admitted.minTraceCount !== 1 ||
    admitted.noiseThreshold !== 0
  ) {
    const discover = required(
      wasm,
      'discover_powl_from_log_config',
      'POWL_CONFIG_DISCOVERY_UNSUPPORTED'
    );
    discovered = objectResult(
      discover(
        logJson,
        admitted.activityKey,
        admitted.variant,
        admitted.minTraceCount,
        admitted.noiseThreshold
      ),
      'discover_powl_from_log_config'
    );
  } else {
    const discover = required(wasm, 'discover_powl_from_log', 'POWL_DISCOVERY_UNSUPPORTED');
    discovered = objectResult(discover(logJson, admitted.variant), 'discover_powl_from_log');
  }
  if (typeof discovered.repr !== 'string' || discovered.repr.length === 0) {
    throw new VisionSessionError('POWL_MODEL_MISSING', 'Discovery returned no POWL representation');
  }
  const model = discovered.repr;
  const parsed = objectResult(required(wasm, 'parse_powl', 'POWL_PARSE_UNSUPPORTED')(model), 'parse_powl');
  const validation = objectResult(
    required(wasm, 'validate_partial_orders', 'POWL_VALIDATION_UNSUPPORTED')(model),
    'validate_partial_orders'
  );
  if (validation.valid !== true) {
    throw new VisionSessionError('POWL_PARTIAL_ORDER_INVALID', 'Partial-order validation failed');
  }

  const execute = required(wasm, 'powl_execute', 'POWL_EXECUTION_UNSUPPORTED');
  let output: unknown = execute(model, JSON.stringify({ max_iters: admitted.maxIters }));
  if (typeof output === 'string') {
    try {
      output = JSON.parse(output) as unknown;
    } catch {
      // String output is still deterministic and hashable.
    }
  } else if (output instanceof Map) {
    output = Object.fromEntries(output);
  }

  const unsigned: Omit<VisionSessionEvidence, 'evidence_hash'> = {
    schema_version: VISION_SESSION_SCHEMA,
    standing: 'ALIVE',
    subject: {
      format,
      input_hash: blake3Hex(content),
      admitted_ocel_hash: blake3Hex(canonicalVisionJson(canonicalOcel)),
      object_type: admitted.groupByObjectType,
      event_count: eventCount,
      object_count: objectCount,
    },
    route: {
      variant: admitted.variant,
      activity_key: admitted.activityKey,
      min_trace_count: admitted.minTraceCount,
      noise_threshold: admitted.noiseThreshold,
      episode_count: wasmSet.episodes.length,
      total_events: readerSet.totalEvents,
      ungrouped_event_count: readerSet.ungroupedEventCount,
      event_log_hash: blake3Hex(logJson),
      model_hash: blake3Hex(model),
      model_repr: model,
      model_node_count: typeof parsed.node_count === 'number' ? parsed.node_count : null,
      partial_orders_valid: true,
    },
    execution: {
      max_iters: admitted.maxIters,
      output_hash: blake3Hex(canonicalVisionJson(output)),
      output,
    },
  };
  return { ...unsigned, evidence_hash: blake3Hex(canonicalVisionJson(unsigned)) };
}

export function replayVisionSession(
  expected: VisionSessionEvidence,
  observed: VisionSessionEvidence
): VisionSessionReplay {
  const mismatches: string[] = [];
  const compare = (name: string, left: string, right: string): void => {
    if (left !== right) mismatches.push(name);
  };
  compare('input_hash', expected.subject.input_hash, observed.subject.input_hash);
  compare(
    'admitted_ocel_hash',
    expected.subject.admitted_ocel_hash,
    observed.subject.admitted_ocel_hash
  );
  compare('event_log_hash', expected.route.event_log_hash, observed.route.event_log_hash);
  compare('model_hash', expected.route.model_hash, observed.route.model_hash);
  compare(
    'execution_output_hash',
    expected.execution.output_hash,
    observed.execution.output_hash
  );
  compare('evidence_hash', expected.evidence_hash, observed.evidence_hash);
  return {
    schema_version: 'wasm4pm.vision-session-replay.v1',
    standing: mismatches.length === 0 ? 'ALIVE' : 'BLOCKED',
    expected_evidence_hash: expected.evidence_hash,
    observed_evidence_hash: observed.evidence_hash,
    mismatches,
  };
}
