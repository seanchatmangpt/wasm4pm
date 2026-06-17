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

// ---------------------------------------------------------------------------
// TraceGraph → OcelLog adapter types
// ---------------------------------------------------------------------------

/**
 * A single event node in a TraceGraph JSON-LD document produced by
 * `wpm trace ingest --from erlang --format json`.
 */
export const TraceGraphEventSchema = z.object({
  '@id': z.string(),
  '@type': z.literal('ocel:Event'),
  'ocel:activity': z.string(),
  'ocel:relatedObject': z.array(z.object({ '@id': z.string(), '@type': z.string() })),
  'trace:frame': z.object({
    'trace:language': z.string(),
    'trace:function': z.string(),
    'trace:file': z.string().optional(),
    'trace:line': z.number().optional(),
  }),
});
export type TraceGraphEvent = z.infer<typeof TraceGraphEventSchema>;

/**
 * TraceGraph JSON-LD document — output of `wpm trace ingest --format json`.
 * Contains a set of stack-frame-derived OCEL events and source file objects.
 */
export const TraceGraphOutputSchema = z.object({
  '@context': z.record(z.string(), z.string()),
  '@id': z.string(),
  '@type': z.literal('trace:TraceRun'),
  'trace:language': z.string(),
  'trace:source': z.string(),
  'trace:events': z.array(TraceGraphEventSchema),
  'trace:objects': z.array(z.object({
    '@id': z.string(),
    '@type': z.string(),
    'trace:path': z.string().optional(),
  })),
});
export type TraceGraphOutput = z.infer<typeof TraceGraphOutputSchema>;

/**
 * A single event in the local OCEL log format used by `wpm trace conform`.
 * Uses plain keys (not the `ocel:` prefix format used by `wpm run`/OCEL 2.0 wire format).
 */
export const OcelLogEventSchema = z.object({
  event_id: z.string(),
  activity: z.string(),
  timestamp: z.string(),
  objects: z.array(z.object({ id: z.string(), type: z.string() })),
  attributes: z.record(z.string(), z.unknown()),
});
export type OcelLogEvent = z.infer<typeof OcelLogEventSchema>;

/**
 * Local OCEL log format consumed by `wpm trace conform -i <file>`.
 * This is the wasm4pm-internal OCEL representation (not the OCEL 2.0 wire format).
 */
export const OcelLogSchema = z.object({
  ocel_version: z.string(),
  ocel_global_log: z.object({ ocel_attribute_names: z.array(z.string()) }),
  ocel_events: z.array(OcelLogEventSchema),
  ocel_objects: z.array(z.object({
    id: z.string(),
    type: z.string(),
    attributes: z.record(z.string(), z.unknown()),
  })),
});
export type OcelLog = z.infer<typeof OcelLogSchema>;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single frame extracted from an Erlang crash dump or exception tuple.
 * Represents one entry in the process stack trace.
 */
export const ErlangFrameSchema = z.object({
  /** Module name, e.g. "supervisor" */
  module: z.string(),
  /** Function name, e.g. "handle_info" */
  function: z.string(),
  /** Arity (number of arguments), e.g. 2 */
  arity: z.number(),
  /** Source file name, e.g. "supervisor.erl" (may be absent in minified builds) */
  file: z.string().optional(),
  /** Line number in source file (may be absent) */
  line: z.number().optional(),
});
export type ErlangFrame = z.infer<typeof ErlangFrameSchema>;

/**
 * A parsed Erlang process crash event. Derived from any of the three
 * supported crash dump formats.
 */
export const ErlangCrashEventSchema = z.object({
  pid: z.string(),
  mfa: z.string(),
  exit_reason: z.string().optional(),
  file: z.string().optional(),
  line: z.number().optional(),
  frames: z.array(ErlangFrameSchema),
  timestamp: z.string(),
});
export type ErlangCrashEvent = z.infer<typeof ErlangCrashEventSchema>;

/**
 * A parsed SASL supervisor error report.
 * Supervisor reports have richer context than raw crash frames — they include
 * the supervisor identity, restart strategy context, and offender metadata.
 */
export const ErlangSupervisorReportSchema = z.object({
  supervisor: z.string(),
  error_context: z.string(),
  reason: z.string(),
  child_pid: z.string().optional(),
  child_name: z.string().optional(),
  child_mfa: z.string().optional(),
  timestamp: z.string(),
});
export type ErlangSupervisorReport = z.infer<typeof ErlangSupervisorReportSchema>;

// ---------------------------------------------------------------------------
// Crash dump parser
// ---------------------------------------------------------------------------

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
export function parseCrashDump(
  crashDumpText: string,
  fallbackPid = 'proc:0',
): ErlangCrashEvent[] {
  const now = new Date().toISOString();
  const lines = crashDumpText.split('\n');

  // Regex patterns matching the three formats supported by wpm trace ingest --from erlang
  const otpTuplePattern =
    /\{(\w+),(\w+),(?:\d+|\[.*?\]),\[(?:[^\]]*\{file,"([^"]+)"\}[^\]]*\{line,(\d+)\}|[^\]]*\{line,(\d+)\}[^\]]*\{file,"([^"]+)"\})[^\]]*\]/g;

  const crashDumpLinePattern = /^[\s*]*(\w+):(\w+)\/(\d+)\s+\(([^):]+\.erl):(\d+)\)/;

  const verbosePattern =
    /(?:in (?:function|call from)|called from)\s+(?:(\w+):)?(\w+)\/(\d+)\s+\(([^),]+\.erl)(?:,\s*line\s+|:)(\d+)\)/;

  // PID context line: "PID: <0.101.0>" or "=proc:<0.101.0>"
  const pidPattern = /(?:PID:|=proc:)\s*(<[\d.]+>)/;

  // Timestamp line: "=created: <timestamp>"
  const timestampPattern = /=(?:created|time):\s*(.+)/;

  // Exit reason: "Error: ..." or "Reason: ..."
  const exitReasonPattern = /(?:Error|Reason|exit_reason):\s*(.+)/i;

  const events: ErlangCrashEvent[] = [];
  let currentFrames: ErlangFrame[] = [];
  let currentPid = fallbackPid;
  let currentTimestamp = now;
  let currentExitReason: string | undefined;

  const flushBlock = () => {
    if (currentFrames.length === 0) return;
    const top = currentFrames[0];
    events.push({
      pid: currentPid,
      mfa: `${top.module}:${top.function}/${top.arity}`,
      exit_reason: currentExitReason,
      file: top.file,
      line: top.line,
      frames: currentFrames,
      timestamp: currentTimestamp,
    });
    currentFrames = [];
    currentExitReason = undefined;
  };

  for (const line of lines) {
    // PID context
    const pidMatch = pidPattern.exec(line);
    if (pidMatch) {
      flushBlock();
      currentPid = pidMatch[1];
      continue;
    }

    // Timestamp context
    const tsMatch = timestampPattern.exec(line);
    if (tsMatch) {
      currentTimestamp = tsMatch[1].trim();
      continue;
    }

    // Exit reason
    const reasonMatch = exitReasonPattern.exec(line);
    if (reasonMatch) {
      currentExitReason = reasonMatch[1].trim();
      continue;
    }

    // Blank line: flush current block
    if (line.trim() === '') {
      flushBlock();
      continue;
    }

    // OTP tuple format (multi-frame, uses exec loop)
    let m: RegExpExecArray | null;
    otpTuplePattern.lastIndex = 0;
    let otpMatched = false;
    while ((m = otpTuplePattern.exec(line)) !== null) {
      otpMatched = true;
      const mod = m[1];
      const fn = m[2];
      const arity = 0; // OTP tuples don't always encode arity numerically in this position
      const file = m[3] ?? m[6];
      const lineNum = m[4] !== undefined ? parseInt(m[4], 10) : m[5] !== undefined ? parseInt(m[5], 10) : undefined;
      currentFrames.push({ module: mod, function: fn, arity, file, line: lineNum });
    }
    if (otpMatched) continue;

    // Verbose shell format
    const verboseMatch = verbosePattern.exec(line);
    if (verboseMatch) {
      const mod = verboseMatch[1] ?? '';
      const fn = verboseMatch[2];
      const arity = parseInt(verboseMatch[3], 10);
      const file = verboseMatch[4];
      const lineNum = parseInt(verboseMatch[5], 10);
      currentFrames.push({ module: mod, function: fn, arity, file, line: lineNum });
      continue;
    }

    // Crash dump colon-style (one frame per line)
    const crashMatch = crashDumpLinePattern.exec(line);
    if (crashMatch) {
      const mod = crashMatch[1];
      const fn = crashMatch[2];
      const arity = parseInt(crashMatch[3], 10);
      const file = crashMatch[4];
      const lineNum = parseInt(crashMatch[5], 10);
      currentFrames.push({ module: mod, function: fn, arity, file, line: lineNum });
    }
  }

  flushBlock();
  return events;
}

// ---------------------------------------------------------------------------
// SASL supervisor report parser
// ---------------------------------------------------------------------------

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
export function parseSaslSupervisorReports(reportText: string): ErlangSupervisorReport[] {
  const now = new Date().toISOString();
  const reports: ErlangSupervisorReport[] = [];
  const blocks = reportText.split(/(?=supervisor:)/);

  for (const block of blocks) {
    if (!block.trim()) continue;

    const supMatch = /supervisor:\s*\{(?:local|global),\s*(\w+)\}/.exec(block);
    if (!supMatch) continue;

    const ctxMatch = /errorContext:\s*(\w+)/.exec(block);
    const reasonMatch = /reason:\s*([^\n]+)/.exec(block);
    const pidMatch = /\{pid,(<[\d.]+>)\}/.exec(block);
    const nameMatch = /\{name,(\w+)\}/.exec(block);
    const mfaMatch = /\{mfa,\{(\w+),(\w+),\[.*?\]\}\}/.exec(block);

    const childMfa = mfaMatch ? `${mfaMatch[1]}:${mfaMatch[2]}/0` : undefined;

    reports.push({
      supervisor: `{local, ${supMatch[1]}}`,
      error_context: ctxMatch?.[1] ?? 'unknown',
      reason: reasonMatch?.[1]?.trim() ?? 'unknown',
      child_pid: pidMatch?.[1],
      child_name: nameMatch?.[1],
      child_mfa: childMfa,
      timestamp: now,
    });
  }

  return reports;
}

// ---------------------------------------------------------------------------
// OCEL adapters
// ---------------------------------------------------------------------------

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
export function crashEventsToOcel(events: ErlangCrashEvent[]): OcelEvent[] {
  return events.map((ev, idx) => {
    const graceful = ev.exit_reason === 'normal' || ev.exit_reason === 'shutdown';
    const activity = graceful ? 'erlang_proc.exit' : 'erlang_proc.crash';

    return {
      'ocel:eid': `${ev.pid}:${activity}:${idx}`,
      'ocel:activity': activity,
      'ocel:timestamp': ev.timestamp,
      'ocel:omap': [ev.pid],
      'ocel:vmap': {
        mfa: ev.mfa,
        exit_reason: ev.exit_reason,
        file: ev.file,
        line: ev.line,
        frame_count: ev.frames.length,
      },
    };
  });
}

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
export function supervisorReportsToOcel(reports: ErlangSupervisorReport[]): OcelEvent[] {
  return reports.map((r, idx) => {
    const activity = `erlang_proc.supervisor_${r.error_context}`;
    const pid = r.child_pid ?? r.supervisor;

    return {
      'ocel:eid': `${pid}:${activity}:${idx}`,
      'ocel:activity': activity,
      'ocel:timestamp': r.timestamp,
      'ocel:omap': [pid],
      'ocel:vmap': {
        supervisor: r.supervisor,
        reason: r.reason,
        child_name: r.child_name,
        child_mfa: r.child_mfa,
      },
    };
  });
}

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
export function detectAbnormalExits(ocelEvents: OcelEvent[]): string[] {
  return ocelEvents
    .filter((ev) => ev['ocel:activity'] === 'erlang_proc.crash')
    .flatMap((ev) => ev['ocel:omap']);
}

// ---------------------------------------------------------------------------
// TraceGraph → OcelLog adapter
// ---------------------------------------------------------------------------

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
export function traceGraphToOcelLog(traceGraph: TraceGraphOutput): OcelLog {
  const now = new Date().toISOString();

  // Build the object registry from declared objects in the graph.
  const objectSet = new Map<string, { id: string; type: string; attributes: Record<string, unknown> }>();

  for (const obj of traceGraph['trace:objects']) {
    const id = obj['@id'].replace(/^trace:/, '');
    const type = obj['@type'].replace(/^trace:/, '');
    const attributes: Record<string, unknown> = {};
    if (obj['trace:path']) attributes['path'] = obj['trace:path'];
    objectSet.set(id, { id, type, attributes });
  }

  // Convert each TraceGraph event to a local OcelLogEvent.
  const ocelEvents: OcelLogEvent[] = traceGraph['trace:events'].map((ev, i) => {
    const eventId = ev['@id'].replace(/^trace:/, '');
    const objects = ev['ocel:relatedObject'].map((o) => ({
      id: o['@id'].replace(/^trace:/, ''),
      type: o['@type'].replace(/^trace:/, ''),
    }));

    // Ensure referenced objects exist in the object registry
    // (StackFrame objects are generated dynamically by framesToTraceGraph but not
    // always listed in trace:objects — synthesise them here).
    for (const o of objects) {
      if (!objectSet.has(o.id)) {
        objectSet.set(o.id, { id: o.id, type: o.type, attributes: {} });
      }
    }

    const frame = ev['trace:frame'];
    const attributes: Record<string, unknown> = { frame_index: i };
    if (frame['trace:file']) attributes['file'] = frame['trace:file'];
    if (frame['trace:line'] !== undefined) attributes['line'] = frame['trace:line'];
    if (frame['trace:function']) attributes['function'] = frame['trace:function'];

    return {
      event_id: eventId,
      activity: ev['ocel:activity'],
      timestamp: now,
      objects,
      attributes,
    };
  });

  return {
    ocel_version: '2.0',
    ocel_global_log: { ocel_attribute_names: ['frame_index', 'file', 'line', 'function'] },
    ocel_events: ocelEvents,
    ocel_objects: Array.from(objectSet.values()),
  };
}
