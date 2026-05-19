/**
 * beam-message-validator.ts
 *
 * Validates and parses BEAM messages exchanged between the Erlang/AtomVM runtime
 * (mcpp) and the wasm4pm TypeScript swarm.
 *
 * This module closes GAP-1 from the mcpp-swarm-coordination audit:
 *   "No shared module between wasm4pm and mcpp for the BEAM message format.
 *    Contract is maintained by convention (both sides use the same JSON shape),
 *    not by a shared schema or generated types."
 *
 * The canonical schema is `beam-message-schema.json` (JSON Schema draft-07) in the
 * same directory. TypeScript types here mirror that schema exactly; any change to
 * the schema MUST be reflected in the types and vice versa.
 *
 * PID format: pid:<node.serial.creation>
 *   Examples: pid:<0.42.0>, pid:<0.7.0>, pid:<1.100.3>
 *
 * Ref format: ref:<node.creation.serial1.serial2>
 *   Examples: ref:<0.1.0.42>, ref:<0.2.0.999>
 *
 * Discriminated by `tag`:
 *   "beam_msg"     → BeamMsg (inter-process message with from/to/payload/sent_at)
 *   "beam_monitor" → BeamMonitor (process monitor notification with ref/event/reason/pid/at)
 */

// ── Regex patterns (exported for consumers who need to validate identifiers) ──

/**
 * Pattern matching a valid Erlang/AtomVM process identifier.
 * Format: pid:<node.serial.creation>
 * - node, serial, creation are non-negative integers.
 * - Examples: pid:<0.42.0>, pid:<1.100.3>
 */
export const BEAM_PID_PATTERN: RegExp = /^pid:<[0-9]+\.[0-9]+\.[0-9]+>$/;

/**
 * Pattern matching a valid Erlang/AtomVM monitor reference.
 * Format: ref:<node.creation.serial1.serial2>
 * - All components are non-negative integers.
 * - Examples: ref:<0.1.0.42>, ref:<0.2.0.999>
 */
export const BEAM_REF_PATTERN: RegExp = /^ref:<[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+>$/;

// ── TypeScript types (mirror beam-message-schema.json) ───────────────────────

/**
 * A BEAM message payload. Intentionally loose — the schema leaves payload open
 * so new payload types can be added without a breaking change.
 */
export type BeamMsgPayload = Record<string, unknown> & {
  type?: string;
};

/**
 * A message sent from one BEAM process to another.
 *
 * tag:     "beam_msg" (discriminant)
 * from:    sender PID — pid:<node.serial.creation>
 * to:      recipient PID — pid:<node.serial.creation>
 * payload: message body (any JSON object; `type` field recommended)
 * sent_at: ISO-8601 timestamp
 */
export type BeamMsg = {
  tag: 'beam_msg';
  from: string;
  to: string;
  payload: BeamMsgPayload;
  sent_at: string;
};

/**
 * Valid monitor event types emitted by AtomVM/Erlang process monitors.
 */
export type BeamMonitorEvent = 'DOWN' | 'UP' | 'EXIT';

/**
 * A process monitor notification from AtomVM/Erlang.
 *
 * tag:    "beam_monitor" (discriminant)
 * ref:    monitor reference — ref:<node.creation.serial1.serial2>
 * event:  "DOWN" | "UP" | "EXIT"
 * reason: exit reason string (e.g. "normal", "noproc", "timeout")
 * pid:    monitored process PID — pid:<node.serial.creation>
 * at:     ISO-8601 timestamp of the monitor event
 */
export type BeamMonitor = {
  tag: 'beam_monitor';
  ref: string;
  event: BeamMonitorEvent;
  reason: string;
  pid: string;
  at: string;
};

/**
 * Union of all recognised BEAM message variants (discriminated by `tag`).
 */
export type BeamMessage = BeamMsg | BeamMonitor;

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Returns true if the value is a non-null object (not an array).
 * Used as the first structural guard in all validators.
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Returns true if the string is a valid ISO-8601 date-time.
 * Accepts any string that the Date constructor can parse as a finite timestamp.
 * This mirrors the JSON Schema `format: "date-time"` behaviour.
 */
function isDateTime(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  const ms = Date.parse(value);
  return !isNaN(ms);
}

// ── validateBeamMsg ───────────────────────────────────────────────────────────

/**
 * Validates that `msg` conforms to the BeamMsg schema.
 *
 * Returns a typed `BeamMsg` if valid, or `null` if any required field is
 * missing, has the wrong type, or violates a pattern constraint.
 *
 * Required fields and constraints:
 *   - tag:     must be the string literal "beam_msg"
 *   - from:    non-empty string matching BEAM_PID_PATTERN
 *   - to:      non-empty string matching BEAM_PID_PATTERN
 *   - payload: any non-null object (internal fields are not validated here)
 *   - sent_at: parseable ISO-8601 date-time string
 */
export function validateBeamMsg(msg: unknown): BeamMsg | null {
  if (!isObject(msg)) return null;
  if (msg['tag'] !== 'beam_msg') return null;
  if (typeof msg['from'] !== 'string' || !BEAM_PID_PATTERN.test(msg['from'])) return null;
  if (typeof msg['to'] !== 'string' || !BEAM_PID_PATTERN.test(msg['to'])) return null;
  if (!isObject(msg['payload'])) return null;
  if (!isDateTime(msg['sent_at'])) return null;

  return {
    tag: 'beam_msg',
    from: msg['from'] as string,
    to: msg['to'] as string,
    payload: msg['payload'] as BeamMsgPayload,
    sent_at: msg['sent_at'] as string,
  };
}

// ── validateBeamMonitor ───────────────────────────────────────────────────────

/** Valid monitor event values (mirrors enum in JSON schema). */
const BEAM_MONITOR_EVENTS: readonly BeamMonitorEvent[] = ['DOWN', 'UP', 'EXIT'];

/**
 * Validates that `msg` conforms to the BeamMonitor schema.
 *
 * Returns a typed `BeamMonitor` if valid, or `null` if any required field is
 * missing, has the wrong type, or violates a constraint.
 *
 * Required fields and constraints:
 *   - tag:    must be the string literal "beam_monitor"
 *   - ref:    non-empty string matching BEAM_REF_PATTERN
 *   - event:  one of "DOWN" | "UP" | "EXIT"
 *   - reason: non-empty string
 *   - pid:    non-empty string matching BEAM_PID_PATTERN
 *   - at:     parseable ISO-8601 date-time string
 */
export function validateBeamMonitor(msg: unknown): BeamMonitor | null {
  if (!isObject(msg)) return null;
  if (msg['tag'] !== 'beam_monitor') return null;
  if (typeof msg['ref'] !== 'string' || !BEAM_REF_PATTERN.test(msg['ref'])) return null;
  if (!BEAM_MONITOR_EVENTS.includes(msg['event'] as BeamMonitorEvent)) return null;
  if (typeof msg['reason'] !== 'string' || msg['reason'].length === 0) return null;
  if (typeof msg['pid'] !== 'string' || !BEAM_PID_PATTERN.test(msg['pid'])) return null;
  if (!isDateTime(msg['at'])) return null;

  return {
    tag: 'beam_monitor',
    ref: msg['ref'] as string,
    event: msg['event'] as BeamMonitorEvent,
    reason: msg['reason'] as string,
    pid: msg['pid'] as string,
    at: msg['at'] as string,
  };
}

// ── parseBeamMessage ──────────────────────────────────────────────────────────

/**
 * Parses a JSON string and returns a typed `BeamMessage` (BeamMsg | BeamMonitor),
 * or `null` if the string is not valid JSON or does not match either schema.
 *
 * Dispatch is performed by the `tag` field:
 *   - "beam_msg"     → validated as BeamMsg
 *   - "beam_monitor" → validated as BeamMonitor
 *   - anything else  → null
 *
 * Never throws — all errors are suppressed and represented as `null`.
 *
 * @param raw - JSON string received from the BEAM/AtomVM transport layer
 * @returns typed BeamMessage, or null if invalid
 */
export function parseBeamMessage(raw: string): BeamMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isObject(parsed)) return null;

  const tag = parsed['tag'];

  if (tag === 'beam_msg') return validateBeamMsg(parsed);
  if (tag === 'beam_monitor') return validateBeamMonitor(parsed);

  return null;
}
