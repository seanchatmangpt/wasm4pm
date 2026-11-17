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
import { z } from 'zod';
import type { OcelEvent } from './ocel-bridge.js';
/**
 * A raw AtomVM process lifecycle event as emitted by AtomVM's monitoring
 * subsystem. The `tag`, `pid`, `event`, and `ts` fields are mandatory for
 * adaptation. All remaining fields (module, function, arity, parent, reason,
 * scheduler, duration_ms, mfa, etc.) become the OCEL value map.
 */
export declare const AtomVmProcEventSchema: z.ZodObject<{
    tag: z.ZodLiteral<"atomvm_proc">;
    pid: z.ZodString;
    event: z.ZodString;
    ts: z.ZodString;
}, "strip", z.ZodUnknown, z.objectOutputType<{
    tag: z.ZodLiteral<"atomvm_proc">;
    pid: z.ZodString;
    event: z.ZodString;
    ts: z.ZodString;
}, z.ZodUnknown, "strip">, z.objectInputType<{
    tag: z.ZodLiteral<"atomvm_proc">;
    pid: z.ZodString;
    event: z.ZodString;
    ts: z.ZodString;
}, z.ZodUnknown, "strip">>;
export type AtomVmProcEvent = z.infer<typeof AtomVmProcEventSchema>;
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
export declare function isAtomVmProcEvent(raw: unknown): raw is AtomVmProcEvent;
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
export declare function adaptAtomVmProcEvent(evt: AtomVmProcEvent): OcelEvent;
/**
 * Structured parse result returned by `fromAtomVmJsonl`.
 *
 * Carries the successfully converted OCEL events alongside a detailed record
 * of every line that failed JSON parsing.  Lines that are valid JSON but do not
 * satisfy `isAtomVmProcEvent` (wrong tag, unrelated telemetry from the same
 * NDJSON stream) are silently skipped — they are NOT recorded in `parseErrors`
 * because heterogeneous NDJSON streams are normal in real deployments.
 *
 * Only structurally corrupt lines (JSON parse failures) are recorded in
 * `parseErrors`, making data corruption visible without rejecting valid
 * mixed-source streams.
 */
export declare const AtomVmParseResultSchema: z.ZodObject<{
    events: z.ZodArray<z.ZodObject<{
        'ocel:eid': z.ZodString;
        'ocel:activity': z.ZodString;
        'ocel:timestamp': z.ZodString;
        'ocel:omap': z.ZodArray<z.ZodString, "many">;
        'ocel:vmap': z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, "strip", z.ZodTypeAny, {
        'ocel:eid': string;
        'ocel:activity': string;
        'ocel:timestamp': string;
        'ocel:omap': string[];
        'ocel:vmap': Record<string, unknown>;
    }, {
        'ocel:eid': string;
        'ocel:activity': string;
        'ocel:timestamp': string;
        'ocel:omap': string[];
        'ocel:vmap': Record<string, unknown>;
    }>, "many">;
    parseErrors: z.ZodArray<z.ZodObject<{
        line: z.ZodNumber;
        raw: z.ZodString;
        error: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        error: string;
        line: number;
        raw: string;
    }, {
        error: string;
        line: number;
        raw: string;
    }>, "many">;
    totalLines: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    events: {
        'ocel:eid': string;
        'ocel:activity': string;
        'ocel:timestamp': string;
        'ocel:omap': string[];
        'ocel:vmap': Record<string, unknown>;
    }[];
    parseErrors: {
        error: string;
        line: number;
        raw: string;
    }[];
    totalLines: number;
}, {
    events: {
        'ocel:eid': string;
        'ocel:activity': string;
        'ocel:timestamp': string;
        'ocel:omap': string[];
        'ocel:vmap': Record<string, unknown>;
    }[];
    parseErrors: {
        error: string;
        line: number;
        raw: string;
    }[];
    totalLines: number;
}>;
export type AtomVmParseResult = z.infer<typeof AtomVmParseResultSchema>;
/**
 * Parses a newline-delimited JSON string where each line is a raw AtomVM
 * process event, and converts each valid AtomVM event to an OCEL 2.0 event.
 *
 * Lenient parsing rules:
 * - Blank lines (whitespace-only) are silently skipped (not counted as errors).
 * - Lines that fail `JSON.parse` are recorded in `parseErrors` and skipped.
 * - Lines that are valid JSON but do not satisfy `isAtomVmProcEvent` (e.g.
 *   wrong tag, unrelated telemetry) are silently skipped without recording an
 *   error — heterogeneous NDJSON streams are normal in real deployments.
 *
 * This lenient mode is suitable for consuming mixed NDJSON streams that may
 * contain non-AtomVM events alongside AtomVM process events.  Unlike the
 * previous silent-swallow behaviour, callers can now inspect `parseErrors` to
 * detect structurally corrupt lines in the pipeline.
 *
 * For a strict alternative that throws on the first parse error, use
 * `fromAtomVmJsonlStrict`.
 *
 * @param ndjson - Newline-delimited JSON with one AtomVM event per line
 * @returns `AtomVmParseResult` with `events`, `parseErrors`, and `totalLines`
 */
export declare function fromAtomVmJsonl(ndjson: string): AtomVmParseResult;
/**
 * Strict variant of `fromAtomVmJsonl` that throws on the first parse error.
 *
 * Use this when the input stream is expected to contain only well-formed
 * AtomVM events and any deviation should be treated as a hard failure.
 *
 * Throws an `Error` whose message includes the 1-based line number and a
 * description of the failure.  Blank lines are still silently skipped.
 *
 * @param ndjson - Newline-delimited JSON with one AtomVM event per line
 * @returns Array of OCEL events in input order
 * @throws `Error` if any non-blank line fails JSON parsing (structural corruption)
 */
export declare function fromAtomVmJsonlStrict(ndjson: string): OcelEvent[];
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
export declare function detectCrashes(events: OcelEvent[]): string[];
/**
 * Structured crash report produced by `detectCrashDetails`.
 * Carries the PID, crash reason, and (when available) the MFA string
 * identifying the function where the crash occurred.
 */
export declare const CrashDetailSchema: z.ZodObject<{
    pid: z.ZodString;
    crash_reason: z.ZodString;
    mfa: z.ZodString;
}, "strip", z.ZodTypeAny, {
    pid: string;
    mfa: string;
    crash_reason: string;
}, {
    pid: string;
    mfa: string;
    crash_reason: string;
}>;
export type CrashDetail = z.infer<typeof CrashDetailSchema>;
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
export declare function detectCrashDetails(events: OcelEvent[]): CrashDetail[];
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
export declare function toOcel2Json(events: OcelEvent[], _logName?: string): string;
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
export declare function toOcel2JsonStandard(events: OcelEvent[], logName?: string): string;
/**
 * A single event in the `OcelLog` format expected by `wpm trace conform`.
 * Uses underscore-delimited field names (distinct from both the WASM camelCase
 * format used by `toOcel2Json` and the IEEE `ocel:` prefix format).
 */
export declare const OcelLogEventSchema: z.ZodObject<{
    event_id: z.ZodString;
    activity: z.ZodString;
    timestamp: z.ZodString;
    objects: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        type: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: string;
        id: string;
    }, {
        type: string;
        id: string;
    }>, "many">;
    attributes: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, "strip", z.ZodTypeAny, {
    activity: string;
    event_id: string;
    timestamp: string;
    objects: {
        type: string;
        id: string;
    }[];
    attributes: Record<string, unknown>;
}, {
    activity: string;
    event_id: string;
    timestamp: string;
    objects: {
        type: string;
        id: string;
    }[];
    attributes: Record<string, unknown>;
}>;
export type OcelLogEvent = z.infer<typeof OcelLogEventSchema>;
/**
 * A single object entry in the `OcelLog` format expected by `wpm trace conform`.
 */
export declare const OcelLogObjectSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodString;
    attributes: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, "strip", z.ZodTypeAny, {
    type: string;
    id: string;
    attributes: Record<string, unknown>;
}, {
    type: string;
    id: string;
    attributes: Record<string, unknown>;
}>;
export type OcelLogObject = z.infer<typeof OcelLogObjectSchema>;
/**
 * The OCEL log shape consumed by `wpm trace conform -m <model> -i <file>`.
 *
 * This is the third of three distinct OCEL formats in wasm4pm:
 * - WASM camelCase   (`toOcel2Json`)          — for `wpm run`
 * - IEEE `ocel:` prefix (`toOcel2JsonStandard`) — for interop with pm4py/ProM
 * - trace.ts underscore (`toOcelLog`)           — for `wpm trace conform`
 */
export declare const OcelLogSchema: z.ZodObject<{
    ocel_version: z.ZodString;
    ocel_global_log: z.ZodObject<{
        ocel_attribute_names: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        ocel_attribute_names: string[];
    }, {
        ocel_attribute_names: string[];
    }>;
    ocel_events: z.ZodArray<z.ZodObject<{
        event_id: z.ZodString;
        activity: z.ZodString;
        timestamp: z.ZodString;
        objects: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            type: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            type: string;
            id: string;
        }, {
            type: string;
            id: string;
        }>, "many">;
        attributes: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, "strip", z.ZodTypeAny, {
        activity: string;
        event_id: string;
        timestamp: string;
        objects: {
            type: string;
            id: string;
        }[];
        attributes: Record<string, unknown>;
    }, {
        activity: string;
        event_id: string;
        timestamp: string;
        objects: {
            type: string;
            id: string;
        }[];
        attributes: Record<string, unknown>;
    }>, "many">;
    ocel_objects: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        type: z.ZodString;
        attributes: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, "strip", z.ZodTypeAny, {
        type: string;
        id: string;
        attributes: Record<string, unknown>;
    }, {
        type: string;
        id: string;
        attributes: Record<string, unknown>;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    ocel_version: string;
    ocel_global_log: {
        ocel_attribute_names: string[];
    };
    ocel_events: {
        activity: string;
        event_id: string;
        timestamp: string;
        objects: {
            type: string;
            id: string;
        }[];
        attributes: Record<string, unknown>;
    }[];
    ocel_objects: {
        type: string;
        id: string;
        attributes: Record<string, unknown>;
    }[];
}, {
    ocel_version: string;
    ocel_global_log: {
        ocel_attribute_names: string[];
    };
    ocel_events: {
        activity: string;
        event_id: string;
        timestamp: string;
        objects: {
            type: string;
            id: string;
        }[];
        attributes: Record<string, unknown>;
    }[];
    ocel_objects: {
        type: string;
        id: string;
        attributes: Record<string, unknown>;
    }[];
}>;
export type OcelLog = z.infer<typeof OcelLogSchema>;
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
export declare function toOcelLog(events: OcelEvent[]): OcelLog;
//# sourceMappingURL=atomvm-bridge.d.ts.map