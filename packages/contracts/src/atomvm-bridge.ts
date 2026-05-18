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
