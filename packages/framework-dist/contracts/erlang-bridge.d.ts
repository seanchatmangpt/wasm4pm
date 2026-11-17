/**
 * Erlang/OTP crash dump OCEL bridge for wasm4pm.
 *
 * Parses Erlang OTP crash dumps and supervisor error reports into OCEL 2.0
 * events suitable for process mining. Bridges the gap between Erlang's
 * supervisor/gen_server crash reporting and Van der Aalst conformance checking.
 *
 * Supported input formats:
 *   1. OTP exception tuples:
 *      {Module,Function,Arity,Args,[{file,"module.erl"},{line,42},...]}
 *
 *   2. Crash dump colon-style (erl_crash.dump):
 *      Module:Function/Arity (file.erl:42)
 *
 *   3. SASL error_logger supervisor reports:
 *      supervisor: {local, my_sup}
 *      errorContext: child_terminated
 *      reason: normal
 *      offender: [{pid,<0.101.0>},{name,my_worker},{mfa,{my_worker,start_link,[]}}]
 *
 * OCEL mapping:
 *   - `ocel:activity`  = "erlang_proc." + event_type
 *     (e.g. "erlang_proc.crash", "erlang_proc.supervisor_child_terminated")
 *   - `ocel:timestamp` = extracted ISO-8601 timestamp (or ingestion time if absent)
 *   - `ocel:eid`       = pid + ":" + event_type + ":" + sequence_index
 *   - `ocel:omap`      = [pid] (the Erlang process identifier)
 *   - `ocel:vmap`      = { mfa, exit_reason, file, line, module, function, arity }
 *
 * Van der Aalst process mining insight:
 *   `parseCrashDump` answers the outcome prediction question ("Will this case
 *   end normally or crash?") for Erlang processes: it emits `erlang_proc.crash`
 *   events that, when process-mined against an OTP supervisor lifecycle model,
 *   reveal whether restart thresholds were breached and whether the supervisor
 *   itself terminated.
 */
import { z } from 'zod';
import type { OcelEvent } from './ocel-bridge.js';
/**
 * A single event node in a TraceGraph JSON-LD document produced by
 * `wpm trace ingest --from erlang --format json`.
 */
export declare const TraceGraphEventSchema: z.ZodObject<{
    '@id': z.ZodString;
    '@type': z.ZodLiteral<"ocel:Event">;
    'ocel:activity': z.ZodString;
    'ocel:relatedObject': z.ZodArray<z.ZodObject<{
        '@id': z.ZodString;
        '@type': z.ZodString;
    }, "strip", z.ZodTypeAny, {
        '@id': string;
        '@type': string;
    }, {
        '@id': string;
        '@type': string;
    }>, "many">;
    'trace:frame': z.ZodObject<{
        'trace:language': z.ZodString;
        'trace:function': z.ZodString;
        'trace:file': z.ZodOptional<z.ZodString>;
        'trace:line': z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        'trace:language': string;
        'trace:function': string;
        'trace:file'?: string | undefined;
        'trace:line'?: number | undefined;
    }, {
        'trace:language': string;
        'trace:function': string;
        'trace:file'?: string | undefined;
        'trace:line'?: number | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    'ocel:activity': string;
    '@id': string;
    '@type': "ocel:Event";
    'ocel:relatedObject': {
        '@id': string;
        '@type': string;
    }[];
    'trace:frame': {
        'trace:language': string;
        'trace:function': string;
        'trace:file'?: string | undefined;
        'trace:line'?: number | undefined;
    };
}, {
    'ocel:activity': string;
    '@id': string;
    '@type': "ocel:Event";
    'ocel:relatedObject': {
        '@id': string;
        '@type': string;
    }[];
    'trace:frame': {
        'trace:language': string;
        'trace:function': string;
        'trace:file'?: string | undefined;
        'trace:line'?: number | undefined;
    };
}>;
export type TraceGraphEvent = z.infer<typeof TraceGraphEventSchema>;
/**
 * TraceGraph JSON-LD document — output of `wpm trace ingest --format json`.
 * Contains a set of stack-frame-derived OCEL events and source file objects.
 */
export declare const TraceGraphOutputSchema: z.ZodObject<{
    '@context': z.ZodRecord<z.ZodString, z.ZodString>;
    '@id': z.ZodString;
    '@type': z.ZodLiteral<"trace:TraceRun">;
    'trace:language': z.ZodString;
    'trace:source': z.ZodString;
    'trace:events': z.ZodArray<z.ZodObject<{
        '@id': z.ZodString;
        '@type': z.ZodLiteral<"ocel:Event">;
        'ocel:activity': z.ZodString;
        'ocel:relatedObject': z.ZodArray<z.ZodObject<{
            '@id': z.ZodString;
            '@type': z.ZodString;
        }, "strip", z.ZodTypeAny, {
            '@id': string;
            '@type': string;
        }, {
            '@id': string;
            '@type': string;
        }>, "many">;
        'trace:frame': z.ZodObject<{
            'trace:language': z.ZodString;
            'trace:function': z.ZodString;
            'trace:file': z.ZodOptional<z.ZodString>;
            'trace:line': z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            'trace:language': string;
            'trace:function': string;
            'trace:file'?: string | undefined;
            'trace:line'?: number | undefined;
        }, {
            'trace:language': string;
            'trace:function': string;
            'trace:file'?: string | undefined;
            'trace:line'?: number | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        'ocel:activity': string;
        '@id': string;
        '@type': "ocel:Event";
        'ocel:relatedObject': {
            '@id': string;
            '@type': string;
        }[];
        'trace:frame': {
            'trace:language': string;
            'trace:function': string;
            'trace:file'?: string | undefined;
            'trace:line'?: number | undefined;
        };
    }, {
        'ocel:activity': string;
        '@id': string;
        '@type': "ocel:Event";
        'ocel:relatedObject': {
            '@id': string;
            '@type': string;
        }[];
        'trace:frame': {
            'trace:language': string;
            'trace:function': string;
            'trace:file'?: string | undefined;
            'trace:line'?: number | undefined;
        };
    }>, "many">;
    'trace:objects': z.ZodArray<z.ZodObject<{
        '@id': z.ZodString;
        '@type': z.ZodString;
        'trace:path': z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        '@id': string;
        '@type': string;
        'trace:path'?: string | undefined;
    }, {
        '@id': string;
        '@type': string;
        'trace:path'?: string | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    '@id': string;
    '@type': "trace:TraceRun";
    'trace:language': string;
    '@context': Record<string, string>;
    'trace:source': string;
    'trace:events': {
        'ocel:activity': string;
        '@id': string;
        '@type': "ocel:Event";
        'ocel:relatedObject': {
            '@id': string;
            '@type': string;
        }[];
        'trace:frame': {
            'trace:language': string;
            'trace:function': string;
            'trace:file'?: string | undefined;
            'trace:line'?: number | undefined;
        };
    }[];
    'trace:objects': {
        '@id': string;
        '@type': string;
        'trace:path'?: string | undefined;
    }[];
}, {
    '@id': string;
    '@type': "trace:TraceRun";
    'trace:language': string;
    '@context': Record<string, string>;
    'trace:source': string;
    'trace:events': {
        'ocel:activity': string;
        '@id': string;
        '@type': "ocel:Event";
        'ocel:relatedObject': {
            '@id': string;
            '@type': string;
        }[];
        'trace:frame': {
            'trace:language': string;
            'trace:function': string;
            'trace:file'?: string | undefined;
            'trace:line'?: number | undefined;
        };
    }[];
    'trace:objects': {
        '@id': string;
        '@type': string;
        'trace:path'?: string | undefined;
    }[];
}>;
export type TraceGraphOutput = z.infer<typeof TraceGraphOutputSchema>;
/**
 * A single event in the local OCEL log format used by `wpm trace conform`.
 * Uses plain keys (not the `ocel:` prefix format used by `wpm run`/OCEL 2.0 wire format).
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
 * Local OCEL log format consumed by `wpm trace conform -i <file>`.
 * This is the wasm4pm-internal OCEL representation (not the OCEL 2.0 wire format).
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
 * A single frame extracted from an Erlang crash dump or exception tuple.
 * Represents one entry in the process stack trace.
 */
export declare const ErlangFrameSchema: z.ZodObject<{
    /** Module name, e.g. "supervisor" */
    module: z.ZodString;
    /** Function name, e.g. "handle_info" */
    function: z.ZodString;
    /** Arity (number of arguments), e.g. 2 */
    arity: z.ZodNumber;
    /** Source file name, e.g. "supervisor.erl" (may be absent in minified builds) */
    file: z.ZodOptional<z.ZodString>;
    /** Line number in source file (may be absent) */
    line: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    function: string;
    module: string;
    arity: number;
    line?: number | undefined;
    file?: string | undefined;
}, {
    function: string;
    module: string;
    arity: number;
    line?: number | undefined;
    file?: string | undefined;
}>;
export type ErlangFrame = z.infer<typeof ErlangFrameSchema>;
/**
 * A parsed Erlang process crash event. Derived from any of the three
 * supported crash dump formats.
 */
export declare const ErlangCrashEventSchema: z.ZodObject<{
    pid: z.ZodString;
    mfa: z.ZodString;
    exit_reason: z.ZodOptional<z.ZodString>;
    file: z.ZodOptional<z.ZodString>;
    line: z.ZodOptional<z.ZodNumber>;
    frames: z.ZodArray<z.ZodObject<{
        /** Module name, e.g. "supervisor" */
        module: z.ZodString;
        /** Function name, e.g. "handle_info" */
        function: z.ZodString;
        /** Arity (number of arguments), e.g. 2 */
        arity: z.ZodNumber;
        /** Source file name, e.g. "supervisor.erl" (may be absent in minified builds) */
        file: z.ZodOptional<z.ZodString>;
        /** Line number in source file (may be absent) */
        line: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        function: string;
        module: string;
        arity: number;
        line?: number | undefined;
        file?: string | undefined;
    }, {
        function: string;
        module: string;
        arity: number;
        line?: number | undefined;
        file?: string | undefined;
    }>, "many">;
    timestamp: z.ZodString;
}, "strip", z.ZodTypeAny, {
    pid: string;
    mfa: string;
    timestamp: string;
    frames: {
        function: string;
        module: string;
        arity: number;
        line?: number | undefined;
        file?: string | undefined;
    }[];
    line?: number | undefined;
    file?: string | undefined;
    exit_reason?: string | undefined;
}, {
    pid: string;
    mfa: string;
    timestamp: string;
    frames: {
        function: string;
        module: string;
        arity: number;
        line?: number | undefined;
        file?: string | undefined;
    }[];
    line?: number | undefined;
    file?: string | undefined;
    exit_reason?: string | undefined;
}>;
export type ErlangCrashEvent = z.infer<typeof ErlangCrashEventSchema>;
/**
 * A parsed SASL supervisor error report.
 * Supervisor reports have richer context than raw crash frames — they include
 * the supervisor identity, restart strategy context, and offender metadata.
 */
export declare const ErlangSupervisorReportSchema: z.ZodObject<{
    supervisor: z.ZodString;
    error_context: z.ZodString;
    reason: z.ZodString;
    child_pid: z.ZodOptional<z.ZodString>;
    child_name: z.ZodOptional<z.ZodString>;
    child_mfa: z.ZodOptional<z.ZodString>;
    timestamp: z.ZodString;
}, "strip", z.ZodTypeAny, {
    reason: string;
    timestamp: string;
    supervisor: string;
    error_context: string;
    child_pid?: string | undefined;
    child_name?: string | undefined;
    child_mfa?: string | undefined;
}, {
    reason: string;
    timestamp: string;
    supervisor: string;
    error_context: string;
    child_pid?: string | undefined;
    child_name?: string | undefined;
    child_mfa?: string | undefined;
}>;
export type ErlangSupervisorReport = z.infer<typeof ErlangSupervisorReportSchema>;
/**
 * Parse an Erlang crash dump text or OTP error logger output into a list of
 * `ErlangCrashEvent` objects.
 *
 * Handles three input formats:
 *   1. OTP exception tuple syntax:  `{mod,fun,arity,[...{file,"f.erl"},{line,N}...]}`
 *   2. Crash dump colon-style:      `mod:fun/arity (file.erl:N)`
 *   3. Verbose shell style:
 *        `in function mod:fun/arity (file.erl, line N)`
 *        `in call from mod:fun/arity (file.erl:N)`
 *        `called from mod:fun/arity (file.erl, line N)`
 *
 * Frames within a single crash dump are grouped into one `ErlangCrashEvent`
 * per contiguous block. A new block starts when a blank line separates the
 * stacks or when a PID context line (`PID: <A.B.C>`) is found.
 *
 * @param crashDumpText - Raw crash dump text from erl_crash.dump,
 *   error_logger, or interactive Erlang shell
 * @param fallbackPid - PID to use when the crash dump lacks PID metadata.
 *   Defaults to "proc:0". Provide the actual PID if known.
 * @returns Array of crash events, one per distinct crashed process or stack block
 */
export declare function parseCrashDump(crashDumpText: string, fallbackPid?: string): ErlangCrashEvent[];
/**
 * Parse SASL (System Application Support Libraries) supervisor error reports
 * into structured `ErlangSupervisorReport` objects.
 *
 * SASL reports are written by OTP's error_logger when a supervised child
 * terminates, fails to start, or exceeds the restart intensity. The format is:
 *
 *   supervisor: {local, my_sup}
 *   errorContext: child_terminated
 *   reason: normal
 *   offender: [{pid,<0.101.0>},{name,my_worker},{mfa,{my_worker,start_link,[]}}]
 *
 * @param reportText - Raw SASL supervisor report text
 * @returns Array of parsed supervisor reports (one per report block)
 */
export declare function parseSaslSupervisorReports(reportText: string): ErlangSupervisorReport[];
/**
 * Convert an array of `ErlangCrashEvent` objects into OCEL 2.0 events
 * for process mining with wasm4pm.
 *
 * Each crash event produces a single OCEL event with:
 *   - `ocel:activity` = `"erlang_proc.crash"`
 *   - `ocel:omap`     = [pid]
 *   - `ocel:vmap`     = { mfa, exit_reason, file, line, frame_count }
 *
 * When `exit_reason` is "normal" or "shutdown", the activity is
 * `"erlang_proc.exit"` (graceful), not `"erlang_proc.crash"` (error).
 *
 * @param events - Array of crash events from `parseCrashDump`
 * @returns OCEL 2.0 events suitable for `wpm run` discovery or `wpm trace conform`
 */
export declare function crashEventsToOcel(events: ErlangCrashEvent[]): OcelEvent[];
/**
 * Convert an array of `ErlangSupervisorReport` objects into OCEL 2.0 events.
 *
 * Each report produces a single event with:
 *   - `ocel:activity` = `"erlang_proc.supervisor_" + error_context`
 *     (e.g. "erlang_proc.supervisor_child_terminated")
 *   - `ocel:omap`     = [child_pid] when available, else [supervisor]
 *   - `ocel:vmap`     = { supervisor, reason, child_name, child_mfa }
 *
 * @param reports - Array of supervisor reports from `parseSaslSupervisorReports`
 * @returns OCEL 2.0 events
 */
export declare function supervisorReportsToOcel(reports: ErlangSupervisorReport[]): OcelEvent[];
/**
 * Identify processes that crashed abnormally (non-normal exit) from a list
 * of OCEL events produced by `crashEventsToOcel`.
 *
 * This is the outcome prediction helper: given a prefix of observed crash
 * events, it returns the set of PIDs that are in a failed state.
 *
 * @param ocelEvents - OCEL events from `crashEventsToOcel`
 * @returns Array of PID strings that had abnormal exits
 */
export declare function detectAbnormalExits(ocelEvents: OcelEvent[]): string[];
/**
 * Convert a `TraceGraph` JSON-LD document (output of `wpm trace ingest --from erlang
 * --format json`) into the local `OcelLog` format accepted by `wpm trace conform`.
 *
 * This adapter bridges the format mismatch in the Erlang→wasm4pm pipeline:
 *
 *   ```
 *   wpm trace ingest --from erlang --format json > graph.json
 *   # graph.json is TraceGraph JSON-LD (not directly usable by wpm run / wpm trace conform)
 *
 *   # Convert to local OCEL log:
 *   const ocel = traceGraphToOcelLog(graph);
 *   writeFileSync('trace.ocel.json', JSON.stringify(ocel));
 *
 *   # Now conformance-check against a POWL model:
 *   wpm trace conform -m model.powl.json -i trace.ocel.json
 *   ```
 *
 * Mapping:
 *   - Each `trace:events` entry → one `ocel_events` entry
 *   - `ocel:activity` is preserved verbatim
 *   - `@id` (stripped of `trace:` prefix) → `event_id`
 *   - `trace:objects` entries → `ocel_objects` entries
 *   - Objects referenced via `ocel:relatedObject` but absent from `trace:objects`
 *     are synthesised on-the-fly (StackFrame objects generated by `framesToTraceGraph`)
 *   - `trace:frame` metadata (file, line) is captured as event attributes
 *
 * Van der Aalst note: the resulting log is an object-centric event log where
 * each stack frame is an event and each source file / frame is an object.
 * Token-replay fitness against a POWL lifecycle model reveals whether the
 * crash sequence followed a lawful OTP process structure.
 *
 * @param traceGraph - TraceGraph JSON-LD from `wpm trace ingest --format json`
 * @returns Local OcelLog usable by `wpm trace conform`
 */
export declare function traceGraphToOcelLog(traceGraph: TraceGraphOutput): OcelLog;
//# sourceMappingURL=erlang-bridge.d.ts.map