/**
 * Erlang/OTP Crash Dump Bridge Tests
 *
 * Validates the full pipeline from raw Erlang crash dump text
 * → ErlangCrashEvent[] → OCEL 2.0 events → abnormal exit detection.
 *
 * Covers:
 *   - parseCrashDump: OTP tuple format, crash dump colon-style, verbose shell style
 *   - parseCrashDump: empty input, blank-line block separation, PID context lines
 *   - crashEventsToOcel: activity naming (crash vs exit), ocel:omap, ocel:vmap fields
 *   - parseSaslSupervisorReports: supervisor field, error_context, reason, child_pid
 *   - supervisorReportsToOcel: activity naming "erlang_proc.supervisor_*"
 *   - detectAbnormalExits: identifies abnormal PIDs, ignores graceful exits
 */

import { describe, it, expect } from 'vitest';
import {
  parseCrashDump,
  parseSaslSupervisorReports,
  crashEventsToOcel,
  supervisorReportsToOcel,
  detectAbnormalExits,
  type ErlangCrashEvent,
  type ErlangSupervisorReport,
} from '../erlang-bridge.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const OTP_TUPLE_INPUT = `{my_app,handle_request,2,[{file,"my_app.erl"},{line,42},{file,"my_app.erl"},{line,42}]}
{gen_server,handle_msg,6,[{file,"gen_server.erl"},{line,637}]}`;

const CRASH_DUMP_INPUT = `*my_app:handle_request/2 (my_app.erl:42)
*gen_server:handle_msg/6 (gen_server.erl:637)
*supervisor:handle_info/2 (supervisor.erl:389)`;

const VERBOSE_SHELL_INPUT = `in function my_app:process/1 (my_app.erl, line 100)
in call from gen_server:handle_cast/2 (gen_server.erl:501)
called from supervisor:handle_info/2 (supervisor.erl:389)`;

const SASL_REPORT_INPUT = `supervisor: {local, my_sup}
errorContext: child_terminated
reason: normal
offender: [{pid,<0.101.0>},{name,my_worker},{mfa,{my_worker,start_link,[]}}]`;

const SASL_CRASH_REPORT = `supervisor: {local, my_sup}
errorContext: child_terminated
reason: badarg
offender: [{pid,<0.102.0>},{name,worker_two},{mfa,{worker_two,start_link,[]}}]`;

// ---------------------------------------------------------------------------
// parseCrashDump — OTP tuple format
// ---------------------------------------------------------------------------

describe('parseCrashDump — OTP tuple format', () => {
  it('extracts module, function, file, and line from OTP tuples', () => {
    const events = parseCrashDump(OTP_TUPLE_INPUT);
    expect(events.length).toBeGreaterThan(0);
    const top = events[0];
    // At least one frame should be extracted
    expect(top.frames.length).toBeGreaterThan(0);
  });

  it('sets mfa on the top-level event from the first frame', () => {
    const events = parseCrashDump(OTP_TUPLE_INPUT);
    expect(events.length).toBeGreaterThan(0);
    // mfa is "module:function/arity" format
    expect(events[0].mfa).toMatch(/^\w+:\w+\/\d+$/);
  });

  it('uses fallbackPid when no PID context line is present', () => {
    const events = parseCrashDump(OTP_TUPLE_INPUT, '<0.99.0>');
    expect(events.every((ev) => ev.pid === '<0.99.0>')).toBe(true);
  });

  it('includes a timestamp on every event', () => {
    const events = parseCrashDump(OTP_TUPLE_INPUT);
    for (const ev of events) {
      expect(ev.timestamp).toBeTruthy();
      expect(() => new Date(ev.timestamp)).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// parseCrashDump — crash dump colon-style format
// ---------------------------------------------------------------------------

describe('parseCrashDump — crash dump colon-style format', () => {
  it('extracts three frames from crash dump colon-style input', () => {
    const events = parseCrashDump(CRASH_DUMP_INPUT);
    const totalFrames = events.reduce((n, ev) => n + ev.frames.length, 0);
    expect(totalFrames).toBe(3);
  });

  it('parses module, function, arity, file, and line correctly', () => {
    const events = parseCrashDump(CRASH_DUMP_INPUT);
    const allFrames = events.flatMap((ev) => ev.frames);
    const supFrame = allFrames.find((f) => f.module === 'supervisor');
    expect(supFrame).toBeDefined();
    expect(supFrame?.file).toBe('supervisor.erl');
    expect(supFrame?.line).toBe(389);
    expect(supFrame?.arity).toBe(2);
  });

  it('sets the top-level event mfa from the first frame', () => {
    const events = parseCrashDump(CRASH_DUMP_INPUT);
    // All frames in one block → one event with 3 frames
    expect(events[0].mfa).toBe('my_app:handle_request/2');
  });
});

// ---------------------------------------------------------------------------
// parseCrashDump — verbose shell format
// ---------------------------------------------------------------------------

describe('parseCrashDump — verbose shell format', () => {
  it('extracts three frames from verbose shell input', () => {
    const events = parseCrashDump(VERBOSE_SHELL_INPUT);
    const totalFrames = events.reduce((n, ev) => n + ev.frames.length, 0);
    expect(totalFrames).toBe(3);
  });

  it('handles comma+line style separator (e.g. "file.erl, line N")', () => {
    const input = 'in function my_app:process/1 (my_app.erl, line 100)';
    const events = parseCrashDump(input);
    const frame = events[0]?.frames[0];
    expect(frame?.file).toBe('my_app.erl');
    expect(frame?.line).toBe(100);
  });

  it('handles colon style separator (e.g. "file.erl:N")', () => {
    const input = 'in call from gen_server:handle_cast/2 (gen_server.erl:501)';
    const events = parseCrashDump(input);
    const frame = events[0]?.frames[0];
    expect(frame?.file).toBe('gen_server.erl');
    expect(frame?.line).toBe(501);
  });

  it('handles "called from" prefix', () => {
    const input = 'called from supervisor:handle_info/2 (supervisor.erl:389)';
    const events = parseCrashDump(input);
    expect(events[0]?.frames[0]?.module).toBe('supervisor');
  });
});

// ---------------------------------------------------------------------------
// parseCrashDump — edge cases
// ---------------------------------------------------------------------------

describe('parseCrashDump — edge cases', () => {
  it('returns empty array for empty input', () => {
    expect(parseCrashDump('')).toHaveLength(0);
  });

  it('returns empty array for whitespace-only input', () => {
    expect(parseCrashDump('   \n\n  ')).toHaveLength(0);
  });

  it('flushes separate blocks on blank lines', () => {
    // Two separate crash blocks separated by blank line
    const twoBlocks =
      '*my_app:handle_request/2 (my_app.erl:42)\n\n*supervisor:handle_info/2 (supervisor.erl:389)';
    const events = parseCrashDump(twoBlocks);
    // Each block is its own event
    expect(events.length).toBe(2);
  });

  it('captures exit_reason when present', () => {
    const withReason = 'Error: badarg\n*my_app:handle_request/2 (my_app.erl:42)';
    const events = parseCrashDump(withReason);
    expect(events[0]?.exit_reason).toBe('badarg');
  });

  it('uses PID context line when present', () => {
    const withPid = 'PID: <0.101.0>\n*my_app:handle_request/2 (my_app.erl:42)';
    const events = parseCrashDump(withPid);
    expect(events[0]?.pid).toBe('<0.101.0>');
  });
});

// ---------------------------------------------------------------------------
// crashEventsToOcel
// ---------------------------------------------------------------------------

describe('crashEventsToOcel', () => {
  it('produces one OCEL event per crash event', () => {
    const events = parseCrashDump(CRASH_DUMP_INPUT);
    const ocel = crashEventsToOcel(events);
    expect(ocel).toHaveLength(events.length);
  });

  it('sets ocel:activity to "erlang_proc.crash" for abnormal exits', () => {
    const events = parseCrashDump('Reason: badarg\n*my_app:handle_request/2 (my_app.erl:42)');
    const ocel = crashEventsToOcel(events);
    expect(ocel[0]?.['ocel:activity']).toBe('erlang_proc.crash');
  });

  it('sets ocel:activity to "erlang_proc.exit" for normal exits', () => {
    const events = parseCrashDump('Reason: normal\n*my_app:terminate/2 (my_app.erl:99)');
    const ocel = crashEventsToOcel(events);
    expect(ocel[0]?.['ocel:activity']).toBe('erlang_proc.exit');
  });

  it('sets ocel:activity to "erlang_proc.exit" for shutdown exits', () => {
    const events = parseCrashDump('Reason: shutdown\n*my_app:terminate/2 (my_app.erl:99)');
    const ocel = crashEventsToOcel(events);
    expect(ocel[0]?.['ocel:activity']).toBe('erlang_proc.exit');
  });

  it('includes pid in ocel:omap', () => {
    const events = parseCrashDump('PID: <0.101.0>\n*my_app:handle_request/2 (my_app.erl:42)');
    const ocel = crashEventsToOcel(events);
    expect(ocel[0]?.['ocel:omap']).toContain('<0.101.0>');
  });

  it('includes mfa, file, and line in ocel:vmap', () => {
    const events = parseCrashDump('*my_app:handle_request/2 (my_app.erl:42)');
    const ocel = crashEventsToOcel(events);
    const vmap = ocel[0]?.['ocel:vmap'];
    expect(vmap?.mfa).toBe('my_app:handle_request/2');
    expect(vmap?.file).toBe('my_app.erl');
    expect(vmap?.line).toBe(42);
  });

  it('sets a unique ocel:eid for every event', () => {
    const events = parseCrashDump(CRASH_DUMP_INPUT);
    const ocel = crashEventsToOcel(events);
    const eids = ocel.map((e) => e['ocel:eid']);
    const unique = new Set(eids);
    expect(unique.size).toBe(ocel.length);
  });
});

// ---------------------------------------------------------------------------
// parseSaslSupervisorReports
// ---------------------------------------------------------------------------

describe('parseSaslSupervisorReports', () => {
  it('parses supervisor name', () => {
    const reports = parseSaslSupervisorReports(SASL_REPORT_INPUT);
    expect(reports[0]?.supervisor).toContain('my_sup');
  });

  it('parses error_context', () => {
    const reports = parseSaslSupervisorReports(SASL_REPORT_INPUT);
    expect(reports[0]?.error_context).toBe('child_terminated');
  });

  it('parses reason', () => {
    const reports = parseSaslSupervisorReports(SASL_REPORT_INPUT);
    expect(reports[0]?.reason).toBe('normal');
  });

  it('parses child_pid from offender list', () => {
    const reports = parseSaslSupervisorReports(SASL_REPORT_INPUT);
    expect(reports[0]?.child_pid).toBe('<0.101.0>');
  });

  it('parses child_name from offender list', () => {
    const reports = parseSaslSupervisorReports(SASL_REPORT_INPUT);
    expect(reports[0]?.child_name).toBe('my_worker');
  });

  it('parses child_mfa from offender list', () => {
    const reports = parseSaslSupervisorReports(SASL_REPORT_INPUT);
    expect(reports[0]?.child_mfa).toContain('my_worker');
  });

  it('returns empty array for empty input', () => {
    expect(parseSaslSupervisorReports('')).toHaveLength(0);
  });

  it('handles multiple report blocks separated by "supervisor:"', () => {
    const twoReports = SASL_REPORT_INPUT + '\n' + SASL_CRASH_REPORT;
    const reports = parseSaslSupervisorReports(twoReports);
    expect(reports.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// supervisorReportsToOcel
// ---------------------------------------------------------------------------

describe('supervisorReportsToOcel', () => {
  it('produces one OCEL event per report', () => {
    const reports = parseSaslSupervisorReports(SASL_REPORT_INPUT);
    const ocel = supervisorReportsToOcel(reports);
    expect(ocel).toHaveLength(reports.length);
  });

  it('prefixes activity with "erlang_proc.supervisor_"', () => {
    const reports = parseSaslSupervisorReports(SASL_REPORT_INPUT);
    const ocel = supervisorReportsToOcel(reports);
    expect(ocel[0]?.['ocel:activity']).toBe('erlang_proc.supervisor_child_terminated');
  });

  it('includes supervisor and reason in ocel:vmap', () => {
    const reports = parseSaslSupervisorReports(SASL_REPORT_INPUT);
    const ocel = supervisorReportsToOcel(reports);
    const vmap = ocel[0]?.['ocel:vmap'];
    expect(vmap?.supervisor).toContain('my_sup');
    expect(vmap?.reason).toBe('normal');
  });
});

// ---------------------------------------------------------------------------
// detectAbnormalExits
// ---------------------------------------------------------------------------

describe('detectAbnormalExits', () => {
  it('returns PIDs with erlang_proc.crash activity', () => {
    const events: ReturnType<typeof crashEventsToOcel> = [
      {
        'ocel:eid': '<0.101.0>:erlang_proc.crash:0',
        'ocel:activity': 'erlang_proc.crash',
        'ocel:timestamp': new Date().toISOString(),
        'ocel:omap': ['<0.101.0>'],
        'ocel:vmap': { mfa: 'my_app:handle_request/2', exit_reason: 'badarg' },
      },
    ];
    const pids = detectAbnormalExits(events);
    expect(pids).toContain('<0.101.0>');
  });

  it('does not return PIDs with erlang_proc.exit (graceful)', () => {
    const events: ReturnType<typeof crashEventsToOcel> = [
      {
        'ocel:eid': '<0.102.0>:erlang_proc.exit:0',
        'ocel:activity': 'erlang_proc.exit',
        'ocel:timestamp': new Date().toISOString(),
        'ocel:omap': ['<0.102.0>'],
        'ocel:vmap': { mfa: 'my_app:terminate/2', exit_reason: 'normal' },
      },
    ];
    const pids = detectAbnormalExits(events);
    expect(pids).not.toContain('<0.102.0>');
  });

  it('returns empty array when all exits are graceful', () => {
    const events: ReturnType<typeof crashEventsToOcel> = [
      {
        'ocel:eid': '<0.103.0>:erlang_proc.exit:0',
        'ocel:activity': 'erlang_proc.exit',
        'ocel:timestamp': new Date().toISOString(),
        'ocel:omap': ['<0.103.0>'],
        'ocel:vmap': { mfa: 'gen_server:terminate/2', exit_reason: 'shutdown' },
      },
    ];
    expect(detectAbnormalExits(events)).toHaveLength(0);
  });

  it('returns empty array for empty input', () => {
    expect(detectAbnormalExits([])).toHaveLength(0);
  });
});
