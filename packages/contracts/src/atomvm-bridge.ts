/**
 * AtomVM process lifecycle OCEL bridge for wasm4pm.
 *
 * AtomVM is an Erlang/Elixir VM designed for embedded and IoT systems used in
 * the mcpp ecosystem. This bridge adapts AtomVM process monitor messages into
 * OCEL 2.0 events suitable for process mining with wasm4pm.
 *
 * AtomVM process lifecycle:
 *   spawn → running → waiting → running → exit
 *
 * Each lifecycle transition is an event tagged as `atomvm_proc`:
 *
 *   {"tag":"atomvm_proc","pid":"<0.5.0>","event":"spawn","module":"my_app","function":"start","arity":0,"parent":"<0.1.0>","ts":"2026-05-18T10:00:00Z"}
 *   {"tag":"atomvm_proc","pid":"<0.5.0>","event":"running","scheduler":0,"ts":"2026-05-18T10:00:01Z"}
 *   {"tag":"atomvm_proc","pid":"<0.5.0>","event":"waiting","reason":"receive","ts":"2026-05-18T10:00:02Z"}
 *   {"tag":"atomvm_proc","pid":"<0.5.0>","event":"exit","reason":"normal","duration_ms":1500,"ts":"2026-05-18T10:00:03Z"}
 *   {"tag":"atomvm_proc","pid":"<0.5.0>","event":"crash","reason":"badarg","mfa":"lists:nth/2","ts":"2026-05-18T10:00:04Z"}
 *
 * OCEL mapping:
 *   - `ocel:activity`  = "atomvm_proc." + event  (e.g. "atomvm_proc.spawn")
 *   - `ocel:timestamp` = ts (ISO-8601)
 *   - `ocel:eid`       = pid + ":" + event + ":" + ts
 *   - `ocel:omap`      = { processes: [pid] }
 *   - `ocel:vmap`      = remaining fields (module/function/arity assembled into mfa)
 *
 * Van der Aalst process mining insight:
 *   The `detectCrashes` utility answers the outcome prediction question
 *   ("Will this case end in a good outcome?") for the AtomVM domain:
 *   it identifies process IDs that terminated abnormally via `atomvm_proc.crash`.
 */

import type { OcelEvent } from './ocel-bridge.js';

// ---------------------------------------------------------------------------
// AtomVmProcEvent type
// ---------------------------------------------------------------------------

/**
 * A raw AtomVM process lifecycle event as emitted by AtomVM's monitoring
 * subsystem. The `tag`, `pid`, `event`, and `ts` fields are mandatory for
 * adaptation. All remaining fields (module, function, arity, parent, reason,
 * scheduler, duration_ms, mfa, etc.) become the OCEL value map.
 */
export type AtomVmProcEvent = {
  /** Discriminator — must be "atomvm_proc" */
  tag: 'atomvm_proc';
  /** Erlang-style process identifier, e.g. "<0.5.0>" */
  pid: string;
  /** Lifecycle event name: "spawn" | "running" | "waiting" | "exit" | "crash" */
  event: string;
  /** ISO-8601 timestamp string */
  ts: string;
  /** Any additional AtomVM-specific fields */
  [key: string]: unknown;
};

// ---------------------------------------------------------------------------
// isAtomVmProcEvent — type guard
// ---------------------------------------------------------------------------

/**
 * Type guard that checks whether an unknown value is an `AtomVmProcEvent`.
 *
 * Requirements:
 * - Must be a non-null, non-array object.
 * - `tag` must equal the string `"atomvm_proc"`.
 * - `pid` must be a non-empty string.
 * - `event` must be a non-empty string.
 * - `ts` must be a non-empty string.
 *
 * @param raw - The value to check
 * @returns true if value satisfies the AtomVmProcEvent contract
 */
export function isAtomVmProcEvent(raw: unknown): raw is AtomVmProcEvent {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const r = raw as Record<string, unknown>;
  return (
    r['tag'] === 'atomvm_proc' &&
    typeof r['pid'] === 'string' &&
    r['pid'].length > 0 &&
    typeof r['event'] === 'string' &&
    r['event'].length > 0 &&
    typeof r['ts'] === 'string' &&
    r['ts'].length > 0
  );
}

// ---------------------------------------------------------------------------
// MFA assembly helper
// ---------------------------------------------------------------------------

/**
 * Assembles a module-function-arity (MFA) string from individual fields.
 * Returns "module:function/arity" when all three fields are present and valid.
 * Returns null when any required field is absent or the wrong type.
 *
 * Examples:
 *   module="my_app", function="start", arity=0 → "my_app:start/0"
 *   module="lists", function="nth", arity=2    → "lists:nth/2"
 */
function assembleMfa(
  module: unknown,
  fn: unknown,
  arity: unknown,
): string | null {
  if (
    typeof module === 'string' && module.length > 0 &&
    typeof fn === 'string' && fn.length > 0 &&
    (typeof arity === 'number' || typeof arity === 'string')
  ) {
    return `${module}:${fn}/${arity}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// adaptAtomVmProcEvent — single event conversion
// ---------------------------------------------------------------------------

/**
 * Converts a single `AtomVmProcEvent` to an OCEL 2.0 `OcelEvent`.
 *
 * Mapping:
 * - `"atomvm_proc." + event` → `ocel:activity` (e.g. "atomvm_proc.spawn")
 * - `ts`                     → `ocel:timestamp`
 * - `pid + ":" + event + ":" + ts` → `ocel:eid`
 * - `pid`                    → `ocel:omap` as `{ processes: [pid] }` (the pid value in the array)
 * - `module`/`function`/`arity` → assembled into `ocel:vmap.mfa` ("module:function/arity")
 * - All other fields         → `ocel:vmap` (excluding `tag`, `pid`, `event`, `ts`)
 *
 * Note: the `ocel:omap` field follows the OCEL 2.0 convention for object-centric
 * logs by listing the process ID in an array keyed by object type. For downstream
 * OCEL 2.0 consumers that need the typed map, the process type is "processes".
 *
 * @param evt - A validated AtomVmProcEvent
 * @returns An OcelEvent ready for the wasm4pm OCEL pipeline
 */
export function adaptAtomVmProcEvent(evt: AtomVmProcEvent): OcelEvent {
  const vmap: Record<string, unknown> = {};

  // Fields promoted to top-level OCEL keys — excluded from vmap
  const PROMOTED = new Set(['tag', 'pid', 'event', 'ts', 'module', 'function', 'arity']);

  // Assemble MFA if module/function/arity are all present
  const mfa = assembleMfa(evt['module'], evt['function'], evt['arity']);
  if (mfa !== null) {
    vmap['mfa'] = mfa;
  }

  // Copy remaining fields into vmap (skip promoted fields)
  for (const [key, value] of Object.entries(evt)) {
    if (PROMOTED.has(key)) continue;
    vmap[key] = value;
  }

  return {
    'ocel:eid': `${evt.pid}:${evt.event}:${evt.ts}`,
    'ocel:activity': `atomvm_proc.${evt.event}`,
    'ocel:timestamp': evt.ts,
    'ocel:omap': [evt.pid],
    'ocel:vmap': vmap,
  };
}

// ---------------------------------------------------------------------------
// fromAtomVmJsonl — lenient NDJSON parser
// ---------------------------------------------------------------------------

/**
 * Parses a newline-delimited JSON string where each line is a raw AtomVM
 * process event, and converts each valid AtomVM event to an OCEL 2.0 event.
 *
 * Lenient parsing rules:
 * - Blank lines (whitespace-only) are silently skipped.
 * - Lines that are not valid JSON are silently skipped.
 * - Lines whose parsed value fails `isAtomVmProcEvent` are silently skipped
 *   (missing `tag`, `pid`, `event`, or `ts`; or tag !== "atomvm_proc").
 *
 * This lenient mode is suitable for consuming mixed NDJSON streams that may
 * contain non-AtomVM events alongside AtomVM process events.
 *
 * @param ndjson - Newline-delimited JSON with one AtomVM event per line
 * @returns Array of OCEL events in input order (invalid/non-atomvm lines excluded)
 */
export function fromAtomVmJsonl(ndjson: string): OcelEvent[] {
  const result: OcelEvent[] = [];

  for (const line of ndjson.split('\n')) {
    if (line.trim().length === 0) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      // Silently skip invalid JSON
      continue;
    }

    if (!isAtomVmProcEvent(parsed)) continue;

    result.push(adaptAtomVmProcEvent(parsed));
  }

  return result;
}

// ---------------------------------------------------------------------------
// detectCrashes — process mining insight (outcome prediction)
// ---------------------------------------------------------------------------

/**
 * Identifies process IDs that terminated abnormally by scanning an array of
 * OCEL events for activities labelled `"atomvm_proc.crash"`.
 *
 * This answers the Van der Aalst outcome prediction question for the AtomVM
 * domain: "Which process instances ended in a crash outcome?"
 *
 * The returned list is deduplicated — a PID appears at most once regardless of
 * how many crash events were recorded for it.
 *
 * Each entry in `ocel:omap` for an `atomvm_proc.crash` event is treated as a
 * crashed PID (following the convention that the first element of `ocel:omap`
 * is the process ID, as set by `adaptAtomVmProcEvent`).
 *
 * @param events - Array of OCEL events produced by `fromAtomVmJsonl` or `adaptAtomVmProcEvent`
 * @returns Deduplicated list of PIDs that appeared in at least one crash event
 */
export function detectCrashes(events: OcelEvent[]): string[] {
  const crashed = new Set<string>();

  for (const evt of events) {
    if (evt['ocel:activity'] === 'atomvm_proc.crash') {
      for (const pid of evt['ocel:omap']) {
        crashed.add(pid);
      }
    }
  }

  return [...crashed];
}

// ---------------------------------------------------------------------------
// CrashDetail — structured crash report for outcome prediction
// ---------------------------------------------------------------------------

/**
 * Structured crash report produced by `detectCrashDetails`.
 * Carries the PID, crash reason, and (when available) the MFA string
 * identifying the function where the crash occurred.
 */
export type CrashDetail = {
  /** Erlang-style PID of the crashed process, e.g. "<0.5.0>" */
  pid: string;
  /** Crash reason string, e.g. "badarg", "noproc", "function_clause" */
  crash_reason: string;
  /**
   * Module:function/arity string of the crash site, e.g. "lists:nth/2".
   * Empty string when no MFA information is available in the event.
   */
  mfa: string;
};

/**
 * Returns rich crash detail records — one per unique crashed PID —
 * by scanning OCEL events for activities labelled `"atomvm_proc.crash"`.
 *
 * Unlike `detectCrashes` (which returns plain PID strings), this function
 * extracts the crash reason and MFA from `ocel:vmap` and returns structured
 * records suitable for downstream outcome prediction and root-cause analysis.
 *
 * When a PID has multiple crash events the first crash event's fields are used.
 *
 * @param events - OCEL events from `fromAtomVmJsonl` or `adaptAtomVmProcEvent`
 * @returns One `CrashDetail` per unique crashed PID
 */
export function detectCrashDetails(events: OcelEvent[]): CrashDetail[] {
  const seen = new Map<string, CrashDetail>();

  for (const evt of events) {
    if (evt['ocel:activity'] !== 'atomvm_proc.crash') continue;

    const vmap = evt['ocel:vmap'] as Record<string, unknown>;
    const reason = typeof vmap['reason'] === 'string' ? vmap['reason'] : '';
    const mfa =
      typeof vmap['mfa'] === 'string'
        ? vmap['mfa']
        : typeof vmap['reason'] === 'string' // crash event may have mfa field
          ? ''
          : '';

    for (const pid of evt['ocel:omap']) {
      if (!seen.has(pid)) {
        seen.set(pid, { pid, crash_reason: reason, mfa });
      }
    }
  }

  return [...seen.values()];
}

// ---------------------------------------------------------------------------
// toOcel2Json — serialize OcelEvent[] → OCEL 2.0 JSON document
// ---------------------------------------------------------------------------

/**
 * Serializes an array of OCEL events produced by `fromAtomVmJsonl` into an
 * OCEL 2.0 JSON document compatible with `wpm run <file>.ocel.json`.
 *
 * The wasm4pm WASM engine parses OCEL using a pm4py-style schema with camelCase
 * top-level keys. This function produces that format:
 *
 * ```json
 * {
 *   "eventTypes": ["atomvm_proc.spawn", ...],
 *   "objectTypes": ["atomvm_proc"],
 *   "events":   [ { "id", "type", "time", "object_ids", "attributes" } ... ],
 *   "objects":  [ { "id", "type", "attributes" } ... ]
 * }
 * ```
 *
 * Object deduplication: each unique PID produces exactly one object entry.
 * Object type is always `"atomvm_proc"` for AtomVM process events.
 *
 * Note on OCEL 2.0 standard: The IEEE OCEL 2.0 standard uses `ocel:` prefixed
 * keys (`ocel:events`, `ocel:objects`), but the wasm4pm WASM build parses the
 * pm4py camelCase variant. Use `toOcel2JsonStandard()` if you need the IEEE format
 * for interchange with other OCEL 2.0 tools.
 *
 * @param events - OCEL events from `fromAtomVmJsonl`
 * @param _logName - Optional log name (preserved for API compat; not written to output)
 * @returns Minified JSON string ready for `wpm run` or `wpm conformance`
 */
export function toOcel2Json(events: OcelEvent[], _logName = 'atomvm_proc_log'): string {
  // Collect unique PIDs and activity types across all events
  const pidSet = new Set<string>();
  const activitySet = new Set<string>();
  for (const evt of events) {
    activitySet.add(evt['ocel:activity']);
    for (const pid of evt['ocel:omap']) {
      pidSet.add(pid);
    }
  }

  const objects = [...pidSet].map((pid) => ({
    id: pid,
    type: 'atomvm_proc',
    attributes: {},
  }));

  // Convert vmap to array of {name, value} objects so the WASM deserializer
  // can use the lenient json_to_attr path (visit_seq) rather than the
  // adjacently-tagged AttributeValue map path (visit_map) which rejects plain strings.
  const vmapToAttributes = (vmap: unknown): Array<{ name: string; value: unknown }> => {
    if (!vmap || typeof vmap !== 'object' || Array.isArray(vmap)) return [];
    return Object.entries(vmap as Record<string, unknown>).map(([name, value]) => ({
      name,
      value,
    }));
  };

  const ocelEvents = events.map((evt) => ({
    id: evt['ocel:eid'],
    type: evt['ocel:activity'],
    time: evt['ocel:timestamp'],
    object_ids: evt['ocel:omap'],
    attributes: vmapToAttributes(evt['ocel:vmap']),
  }));

  const doc = {
    eventTypes: [...activitySet],
    objectTypes: ['atomvm_proc'],
    events: ocelEvents,
    objects,
  };

  return JSON.stringify(doc);
}

/**
 * Serializes an array of OCEL events produced by `fromAtomVmJsonl` into an
 * OCEL 2.0 JSON document using the IEEE standard `ocel:` prefixed key format.
 *
 * Use this format for interchange with pm4py, ProM, and other OCEL 2.0 compliant
 * tools that follow the IEEE standard schema. The wasm4pm WASM engine does NOT
 * parse this format — use `toOcel2Json()` for `wpm run` compatibility.
 *
 * @param events - OCEL events from `fromAtomVmJsonl`
 * @param logName - Optional log name for the `ocel:name` header field
 * @returns Minified JSON string in IEEE OCEL 2.0 format
 */
export function toOcel2JsonStandard(events: OcelEvent[], logName = 'atomvm_proc_log'): string {
  const pidSet = new Set<string>();
  for (const evt of events) {
    for (const pid of evt['ocel:omap']) {
      pidSet.add(pid);
    }
  }

  const objects = [...pidSet].map((pid) => ({
    'ocel:oid': pid,
    'ocel:type': 'atomvm_proc',
    'ocel:ovmap': {},
  }));

  const ocelEvents = events.map((evt) => ({
    'ocel:eid': evt['ocel:eid'],
    'ocel:activity': evt['ocel:activity'],
    'ocel:timestamp': evt['ocel:timestamp'],
    'ocel:omap': evt['ocel:omap'],
    'ocel:vmap': evt['ocel:vmap'],
  }));

  const doc = {
    'ocel:version': '2.0',
    'ocel:name': logName,
    'ocel:objects': objects,
    'ocel:events': ocelEvents,
  };

  return JSON.stringify(doc);
}

// ---------------------------------------------------------------------------
// OcelLogEvent / OcelLogObject — the trace.ts OcelLog shape
// ---------------------------------------------------------------------------

/**
 * A single event in the `OcelLog` format expected by `wpm trace conform`.
 * Uses underscore-delimited field names (distinct from both the WASM camelCase
 * format used by `toOcel2Json` and the IEEE `ocel:` prefix format).
 */
export type OcelLogEvent = {
  event_id: string;
  activity: string;
  timestamp: string;
  objects: Array<{ id: string; type: string }>;
  attributes: Record<string, unknown>;
};

/**
 * A single object entry in the `OcelLog` format expected by `wpm trace conform`.
 */
export type OcelLogObject = {
  id: string;
  type: string;
  attributes: Record<string, unknown>;
};

/**
 * The OCEL log shape consumed by `wpm trace conform -m <model> -i <file>`.
 *
 * This is the third of three distinct OCEL formats in wasm4pm:
 * - WASM camelCase   (`toOcel2Json`)          — for `wpm run`
 * - IEEE `ocel:` prefix (`toOcel2JsonStandard`) — for interop with pm4py/ProM
 * - trace.ts underscore (`toOcelLog`)           — for `wpm trace conform`
 */
export type OcelLog = {
  ocel_version: string;
  ocel_global_log: { ocel_attribute_names: string[] };
  ocel_events: OcelLogEvent[];
  ocel_objects: OcelLogObject[];
};

// ---------------------------------------------------------------------------
// toIso8601 — normalise numeric POSIX timestamps (GAP-4c fix)
// ---------------------------------------------------------------------------

/**
 * Converts a timestamp value to an ISO-8601 string.
 *
 * Handles two cases:
 * - Already-ISO string (e.g. "2026-05-18T10:00:00Z") — returned unchanged.
 * - Numeric POSIX milliseconds, either as a `number` or as a string of digits
 *   (e.g. `1716026400000` or `"1716026400000"`) — converted via `new Date(ms).toISOString()`.
 *
 * This closes GAP-4c: AtomVM's `System.monotonic_time/0` returns POSIX millisecond
 * integers, but the WASM kernel expects ISO-8601. Callers that use `toOcelLog`
 * therefore get correct timestamps regardless of what AtomVM emitted.
 *
 * @param ts - The raw timestamp from the AtomVM event's `ocel:timestamp` field
 * @returns ISO-8601 string
 */
function toIso8601(ts: string): string {
  // If the string is entirely digits (POSIX ms integer), convert it
  if (/^\d+$/.test(ts.trim())) {
    return new Date(Number(ts.trim())).toISOString();
  }
  return ts;
}

// ---------------------------------------------------------------------------
// toOcelLog — adapter: OcelEvent[] → OcelLog (wpm trace conform format)
// ---------------------------------------------------------------------------

/**
 * Converts an array of OCEL events (produced by `fromAtomVmJsonl`) into the
 * `OcelLog` format required by `wpm trace conform -m <model> -i <ocel>`.
 *
 * This closes **GAP-3** (AtomVM traces cannot be fed into `wpm trace conform`)
 * and **GAP-4a** (the adapter was absent from the bridge).
 *
 * Mapping rules:
 * - `ocel:eid`       → `event_id`
 * - `ocel:activity`  → `activity`   (e.g. "atomvm_proc.spawn")
 * - `ocel:timestamp` → `timestamp`  (ISO-8601; numeric POSIX ms converted — GAP-4c)
 * - `ocel:omap`      → `objects`    (each PID → `{ id: pid, type: "atomvm_process" }`)
 * - `ocel:vmap`      → `attributes` (plain object, no transformation)
 *
 * Object deduplication: each unique PID from `ocel:omap` produces exactly one
 * entry in `ocel_objects`. The object type is always `"atomvm_process"`.
 *
 * The `ocel_global_log.ocel_attribute_names` list is derived from the union of
 * all keys found in `ocel:vmap` across all events.
 *
 * @param events - OCEL events produced by `fromAtomVmJsonl` or `adaptAtomVmProcEvent`
 * @returns An `OcelLog` object ready to be written to a file and passed to
 *          `wpm trace conform -m <model.powl.json> -i <ocel.json>`
 */
export function toOcelLog(events: OcelEvent[]): OcelLog {
  // Collect unique PIDs for object deduplication and attribute key names
  const pidSet = new Set<string>();
  const attributeNames = new Set<string>();

  for (const evt of events) {
    for (const pid of evt['ocel:omap']) {
      pidSet.add(pid);
    }
    const vmap = evt['ocel:vmap'];
    if (vmap && typeof vmap === 'object' && !Array.isArray(vmap)) {
      for (const key of Object.keys(vmap as Record<string, unknown>)) {
        attributeNames.add(key);
      }
    }
  }

  const ocel_events: OcelLogEvent[] = events.map((evt) => ({
    event_id: evt['ocel:eid'],
    activity: evt['ocel:activity'],
    // GAP-4c: convert numeric POSIX ms timestamps to ISO-8601
    timestamp: toIso8601(evt['ocel:timestamp']),
    objects: evt['ocel:omap'].map((pid) => ({ id: pid, type: 'atomvm_process' })),
    attributes: (evt['ocel:vmap'] as Record<string, unknown>) ?? {},
  }));

  const ocel_objects: OcelLogObject[] = [...pidSet].map((pid) => ({
    id: pid,
    type: 'atomvm_process',
    attributes: {},
  }));

  return {
    ocel_version: '2.0',
    ocel_global_log: {
      ocel_attribute_names: [...attributeNames].sort(),
    },
    ocel_events,
    ocel_objects,
  };
}
