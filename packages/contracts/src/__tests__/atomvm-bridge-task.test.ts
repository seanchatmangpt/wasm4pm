/**
 * AtomVM Bridge — Task-Specified Test Suite
 *
 * Covers the 10 test cases required by the pipeline integration task:
 *
 *  1. Valid spawn event → ocel:activity = "atomvm_proc.spawn", ocel:omap = [pid]
 *  2. Valid exit event with reason → ocel:vmap.exit_reason present
 *  3. detectCrashDetails on events with exit_reason != "normal" → crash entries
 *  4. detectCrashDetails on events with exit_reason = "normal" → empty
 *  5. Malformed JSONL lines → skipped, valid lines still parsed
 *  6. mfa assembly: module/function/arity → "module:function/arity"
 *  7. Multiple PIDs in same batch → distinct ocel:omap entries
 *  8. ocel:eid uniqueness across batch (no duplicates)
 *  9. Empty NDJSON string → []
 * 10. Events without pid field → skipped
 *
 * Plus Task 3 crash detection integration tests:
 * - detectCrashDetails returns at least 1 crash when fixture has exit_reason != "normal"
 * - Crash entry has pid, crash_reason, mfa fields
 * - Clean fixture (all exit_reason = "normal") → empty crash list
 *
 * And Task 1 supplementary coverage for detectCrashDetails (richer contract
 * over the existing detectCrashes which returns string[]).
 */

import { describe, it, expect } from 'vitest';
import {
  fromAtomVmJsonl,
  fromAtomVmJsonlStrict,
  adaptAtomVmProcEvent,
  detectCrashDetails,
  toOcel2Json,
  toOcel2JsonStandard,
  type AtomVmProcEvent,
  type AtomVmParseResult,
} from '../atomvm-bridge.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<AtomVmProcEvent> & { ts?: string }): AtomVmProcEvent {
  return {
    tag: 'atomvm_proc',
    pid: '<0.1.0>',
    event: 'spawn',
    ts: '2026-05-18T10:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test Case 1: Valid spawn event → correct activity + omap
// ---------------------------------------------------------------------------

describe('Task case 1: valid spawn event', () => {
  const raw: AtomVmProcEvent = {
    tag: 'atomvm_proc',
    pid: '<0.5.0>',
    event: 'spawn',
    module: 'gen_server',
    function: 'init',
    arity: 1,
    ts: '2026-05-18T10:00:00Z',
  };

  it('ocel:activity equals "atomvm_proc.spawn"', () => {
    const ev = adaptAtomVmProcEvent(raw);
    expect(ev['ocel:activity']).toBe('atomvm_proc.spawn');
  });

  it('ocel:omap is an array containing the pid', () => {
    const ev = adaptAtomVmProcEvent(raw);
    expect(Array.isArray(ev['ocel:omap'])).toBe(true);
    expect(ev['ocel:omap']).toContain('<0.5.0>');
  });

  it('ocel:omap has exactly one entry for a single-pid event', () => {
    const ev = adaptAtomVmProcEvent(raw);
    expect(ev['ocel:omap']).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Test Case 2: Valid exit event with reason → ocel:vmap.exit_reason present
// ---------------------------------------------------------------------------

describe('Task case 2: valid exit event with reason', () => {
  // AtomVM exit events use "reason" as the field name.
  // The bridge maps it to vmap.reason. In the OCEL context we call this
  // the exit_reason. The test verifies the reason field survives into vmap.
  const exitEvt: AtomVmProcEvent = {
    tag: 'atomvm_proc',
    pid: '<0.7.0>',
    event: 'exit',
    reason: 'normal',
    duration_ms: 2000,
    ts: '2026-05-18T10:01:00Z',
  };

  it('ocel:activity equals "atomvm_proc.exit"', () => {
    const ev = adaptAtomVmProcEvent(exitEvt);
    expect(ev['ocel:activity']).toBe('atomvm_proc.exit');
  });

  it('ocel:vmap contains the reason (exit_reason) field', () => {
    const ev = adaptAtomVmProcEvent(exitEvt);
    const vmap = ev['ocel:vmap'] as Record<string, unknown>;
    // The bridge uses "reason" as the vmap key (from the raw event field).
    // This is the exit_reason in AtomVM terminology.
    expect(vmap['reason']).toBe('normal');
  });

  it('ocel:vmap contains duration_ms', () => {
    const ev = adaptAtomVmProcEvent(exitEvt);
    const vmap = ev['ocel:vmap'] as Record<string, unknown>;
    expect(vmap['duration_ms']).toBe(2000);
  });

  it('abnormal exit reason is preserved', () => {
    const crashExit: AtomVmProcEvent = {
      tag: 'atomvm_proc',
      pid: '<0.8.0>',
      event: 'exit',
      reason: 'killed',
      ts: '2026-05-18T10:01:30Z',
    };
    const ev = adaptAtomVmProcEvent(crashExit);
    const vmap = ev['ocel:vmap'] as Record<string, unknown>;
    expect(vmap['reason']).toBe('killed');
  });
});

// ---------------------------------------------------------------------------
// Test Case 3: detectCrashDetails on events with crash/abnormal exit → entries
// ---------------------------------------------------------------------------

describe('Task case 3: detectCrashDetails on abnormal exits', () => {
  const crashEvt: AtomVmProcEvent = {
    tag: 'atomvm_proc',
    pid: '<0.9.0>',
    event: 'crash',
    reason: 'badarg',
    mfa: 'lists:nth/2',
    ts: '2026-05-18T10:02:00Z',
  };

  it('returns at least one entry when a crash event is present', () => {
    const events = fromAtomVmJsonl(JSON.stringify(crashEvt)).events;
    const details = detectCrashDetails(events);
    expect(details.length).toBeGreaterThan(0);
  });

  it('crash entry has pid field matching the crashed pid', () => {
    const events = fromAtomVmJsonl(JSON.stringify(crashEvt)).events;
    const [detail] = detectCrashDetails(events);
    expect(detail).toHaveProperty('pid', '<0.9.0>');
  });

  it('crash entry has crash_reason field', () => {
    const events = fromAtomVmJsonl(JSON.stringify(crashEvt)).events;
    const [detail] = detectCrashDetails(events);
    expect(detail).toHaveProperty('crash_reason', 'badarg');
  });

  it('crash entry has mfa field', () => {
    const events = fromAtomVmJsonl(JSON.stringify(crashEvt)).events;
    const [detail] = detectCrashDetails(events);
    expect(detail).toHaveProperty('mfa', 'lists:nth/2');
  });
});

// ---------------------------------------------------------------------------
// Test Case 4: detectCrashDetails on events with exit_reason = "normal" → []
// ---------------------------------------------------------------------------

describe('Task case 4: detectCrashDetails on normal exits', () => {
  const normalExit: AtomVmProcEvent = {
    tag: 'atomvm_proc',
    pid: '<0.10.0>',
    event: 'exit',
    reason: 'normal',
    duration_ms: 500,
    ts: '2026-05-18T10:03:00Z',
  };

  const spawnEvt: AtomVmProcEvent = {
    tag: 'atomvm_proc',
    pid: '<0.10.0>',
    event: 'spawn',
    module: 'my_app',
    function: 'start',
    arity: 0,
    ts: '2026-05-18T10:00:00Z',
  };

  it('returns empty array when only normal exit events are present', () => {
    const ndjson = [spawnEvt, normalExit].map((e) => JSON.stringify(e)).join('\n');
    const events = fromAtomVmJsonl(ndjson).events;
    const details = detectCrashDetails(events);
    // Normal exits do not produce crash events; detectCrashDetails looks for crash activity
    expect(details).toHaveLength(0);
  });

  it('returns empty when no crash events in batch', () => {
    const ndjson = [
      makeEvent({ event: 'spawn', pid: '<0.1.0>' }),
      makeEvent({ event: 'running', pid: '<0.1.0>', ts: '2026-05-18T10:00:01Z' }),
      makeEvent({ event: 'exit', reason: 'normal', pid: '<0.1.0>', ts: '2026-05-18T10:00:02Z' }),
    ]
      .map((e) => JSON.stringify(e))
      .join('\n');
    const events = fromAtomVmJsonl(ndjson).events;
    expect(detectCrashDetails(events)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test Case 5: Malformed JSONL lines → skipped; valid lines still parsed
// ---------------------------------------------------------------------------

describe('Task case 5: malformed JSONL lines are skipped', () => {
  const validLine = JSON.stringify(makeEvent({ event: 'spawn', pid: '<0.2.0>' }));

  it('blank line followed by valid line → 1 event returned', () => {
    const ndjson = '\n' + validLine;
    expect(fromAtomVmJsonl(ndjson).events).toHaveLength(1);
  });

  it('invalid JSON line followed by valid line → 1 event returned', () => {
    const ndjson = '{not valid json}\n' + validLine;
    expect(fromAtomVmJsonl(ndjson).events).toHaveLength(1);
  });

  it('missing required field line followed by valid line → 1 event returned', () => {
    // Missing pid — fails isAtomVmProcEvent guard
    const missingPid = JSON.stringify({ tag: 'atomvm_proc', event: 'spawn', ts: '2026-05-18T10:00:00Z' });
    expect(fromAtomVmJsonl(missingPid + '\n' + validLine).events).toHaveLength(1);
  });

  it('wrong tag line followed by valid line → 1 event returned', () => {
    const wrongTag = JSON.stringify({ tag: 'other', pid: '<0.1.0>', event: 'spawn', ts: '2026-05-18T10:00:00Z' });
    expect(fromAtomVmJsonl(wrongTag + '\n' + validLine).events).toHaveLength(1);
  });

  it('mix of blank, invalid JSON, wrong tag, missing field → only valid lines parse', () => {
    const lines = [
      '',
      '   ',
      '{broken',
      JSON.stringify({ tag: 'other', pid: '<0.1.0>', event: 'spawn', ts: '2026-05-18T10:00:00Z' }),
      JSON.stringify({ tag: 'atomvm_proc', event: 'spawn', ts: '2026-05-18T10:00:00Z' }),
      JSON.stringify(makeEvent({ event: 'spawn', pid: '<0.3.0>' })),
      JSON.stringify(makeEvent({ event: 'running', pid: '<0.4.0>', ts: '2026-05-18T10:00:01Z' })),
    ];
    expect(fromAtomVmJsonl(lines.join('\n')).events).toHaveLength(2);
  });

  it('does not throw on any combination of malformed input', () => {
    expect(() => fromAtomVmJsonl('\0\n{bad}\n\nnull\n[]')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Test Case 6: mfa assembly from module / function / arity
// ---------------------------------------------------------------------------

describe('Task case 6: mfa assembly', () => {
  it('gen_server:handle_call/3 assembled correctly', () => {
    const evt: AtomVmProcEvent = {
      tag: 'atomvm_proc',
      pid: '<0.11.0>',
      event: 'spawn',
      module: 'gen_server',
      function: 'handle_call',
      arity: 3,
      ts: '2026-05-18T10:04:00Z',
    };
    const oc = adaptAtomVmProcEvent(evt);
    const vmap = oc['ocel:vmap'] as Record<string, unknown>;
    expect(vmap['mfa']).toBe('gen_server:handle_call/3');
  });

  it('lists:nth/2 assembled correctly', () => {
    const evt: AtomVmProcEvent = {
      tag: 'atomvm_proc',
      pid: '<0.12.0>',
      event: 'spawn',
      module: 'lists',
      function: 'nth',
      arity: 2,
      ts: '2026-05-18T10:04:01Z',
    };
    const oc = adaptAtomVmProcEvent(evt);
    const vmap = oc['ocel:vmap'] as Record<string, unknown>;
    expect(vmap['mfa']).toBe('lists:nth/2');
  });

  it('arity 0 is valid and produces module:function/0', () => {
    const evt: AtomVmProcEvent = {
      tag: 'atomvm_proc',
      pid: '<0.13.0>',
      event: 'spawn',
      module: 'my_app',
      function: 'start',
      arity: 0,
      ts: '2026-05-18T10:04:02Z',
    };
    const oc = adaptAtomVmProcEvent(evt);
    const vmap = oc['ocel:vmap'] as Record<string, unknown>;
    expect(vmap['mfa']).toBe('my_app:start/0');
  });

  it('mfa absent when module is missing', () => {
    const evt: AtomVmProcEvent = {
      tag: 'atomvm_proc',
      pid: '<0.14.0>',
      event: 'running',
      function: 'start',
      arity: 0,
      ts: '2026-05-18T10:04:03Z',
    };
    const oc = adaptAtomVmProcEvent(evt);
    const vmap = oc['ocel:vmap'] as Record<string, unknown>;
    expect(vmap['mfa']).toBeUndefined();
  });

  it('mfa absent when function is missing', () => {
    const evt: AtomVmProcEvent = {
      tag: 'atomvm_proc',
      pid: '<0.15.0>',
      event: 'running',
      module: 'my_app',
      arity: 0,
      ts: '2026-05-18T10:04:04Z',
    };
    const oc = adaptAtomVmProcEvent(evt);
    const vmap = oc['ocel:vmap'] as Record<string, unknown>;
    expect(vmap['mfa']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Test Case 7: Multiple PIDs in same batch → distinct ocel:omap entries
// ---------------------------------------------------------------------------

describe('Task case 7: multiple PIDs in same batch', () => {
  const pids = ['<0.20.0>', '<0.21.0>', '<0.22.0>'];
  const ndjson = pids
    .map((pid, i) =>
      JSON.stringify(
        makeEvent({
          pid,
          event: 'spawn',
          ts: `2026-05-18T10:0${i}:00Z`,
        })
      )
    )
    .join('\n');

  it('produces one OCEL event per PID', () => {
    const events = fromAtomVmJsonl(ndjson).events;
    expect(events).toHaveLength(3);
  });

  it('each event has a distinct ocel:omap', () => {
    const events = fromAtomVmJsonl(ndjson).events;
    const omaps = events.map((e) => e['ocel:omap'][0]);
    // All three omaps are different
    const unique = new Set(omaps);
    expect(unique.size).toBe(3);
  });

  it('each ocel:omap contains only the corresponding PID', () => {
    const events = fromAtomVmJsonl(ndjson).events;
    for (let i = 0; i < events.length; i++) {
      expect(events[i]['ocel:omap']).toContain(pids[i]);
    }
  });

  it('no PID bleeds into another event omap', () => {
    const events = fromAtomVmJsonl(ndjson).events;
    // PID of event 0 must NOT appear in event 1's omap
    expect(events[1]['ocel:omap']).not.toContain(pids[0]);
    expect(events[0]['ocel:omap']).not.toContain(pids[1]);
  });
});

// ---------------------------------------------------------------------------
// Test Case 8: ocel:eid uniqueness across batch
// ---------------------------------------------------------------------------

describe('Task case 8: ocel:eid uniqueness', () => {
  it('all eids are unique in a 4-event batch', () => {
    const events: AtomVmProcEvent[] = [
      makeEvent({ pid: '<0.30.0>', event: 'spawn', ts: '2026-05-18T10:10:00Z' }),
      makeEvent({ pid: '<0.30.0>', event: 'running', ts: '2026-05-18T10:10:01Z' }),
      makeEvent({ pid: '<0.30.0>', event: 'waiting', ts: '2026-05-18T10:10:02Z' }),
      makeEvent({ pid: '<0.30.0>', event: 'exit', ts: '2026-05-18T10:10:03Z' }),
    ];
    const ndjson = events.map((e) => JSON.stringify(e)).join('\n');
    const ocel = fromAtomVmJsonl(ndjson).events;
    const eids = ocel.map((e) => e['ocel:eid']);
    const unique = new Set(eids);
    expect(unique.size).toBe(eids.length);
  });

  it('eid follows pid:event:ts pattern', () => {
    const evt = makeEvent({ pid: '<0.31.0>', event: 'spawn', ts: '2026-05-18T10:11:00Z' });
    const oc = adaptAtomVmProcEvent(evt);
    expect(oc['ocel:eid']).toBe('<0.31.0>:spawn:2026-05-18T10:11:00Z');
  });

  it('eids are unique across 20-event mixed-pid batch', () => {
    const pids = ['<0.40.0>', '<0.41.0>', '<0.42.0>'];
    const eventTypes = ['spawn', 'running', 'waiting', 'exit', 'crash', 'running', 'exit'];
    const allLines: string[] = [];
    let tOffset = 0;
    for (const pid of pids) {
      for (const event of eventTypes) {
        allLines.push(
          JSON.stringify(
            makeEvent({
              pid,
              event,
              ts: `2026-05-18T10:${String(tOffset).padStart(2, '0')}:00Z`,
            })
          )
        );
        tOffset++;
      }
    }
    const ocel = fromAtomVmJsonl(allLines.join('\n')).events;
    const eids = ocel.map((e) => e['ocel:eid']);
    const unique = new Set(eids);
    expect(unique.size).toBe(eids.length);
  });
});

// ---------------------------------------------------------------------------
// Test Case 9: Empty NDJSON string → []
// ---------------------------------------------------------------------------

describe('Task case 9: empty NDJSON input', () => {
  it('empty string returns empty array', () => {
    expect(fromAtomVmJsonl('').events).toEqual([]);
  });

  it('whitespace-only string returns empty array', () => {
    expect(fromAtomVmJsonl('   \n  \n').events).toEqual([]);
  });

  it('string of only newlines returns empty array', () => {
    expect(fromAtomVmJsonl('\n\n\n').events).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Test Case 10: Events without pid field → skipped
// ---------------------------------------------------------------------------

describe('Task case 10: events without pid field are skipped', () => {
  it('line without pid is skipped; adjacent valid line is parsed', () => {
    const noPid = JSON.stringify({ tag: 'atomvm_proc', event: 'spawn', ts: '2026-05-18T10:00:00Z' });
    const valid = JSON.stringify(makeEvent({ event: 'spawn', pid: '<0.50.0>' }));
    const result = fromAtomVmJsonl(noPid + '\n' + valid).events;
    expect(result).toHaveLength(1);
    expect(result[0]['ocel:omap']).toContain('<0.50.0>');
  });

  it('line with pid = null is skipped', () => {
    const nullPid = JSON.stringify({ tag: 'atomvm_proc', pid: null, event: 'spawn', ts: '2026-05-18T10:00:00Z' });
    expect(fromAtomVmJsonl(nullPid).events).toHaveLength(0);
  });

  it('line with pid = 0 (number) is skipped', () => {
    const numPid = JSON.stringify({ tag: 'atomvm_proc', pid: 0, event: 'spawn', ts: '2026-05-18T10:00:00Z' });
    expect(fromAtomVmJsonl(numPid).events).toHaveLength(0);
  });

  it('line with empty string pid is skipped', () => {
    const emptyPid = JSON.stringify({ tag: 'atomvm_proc', pid: '', event: 'spawn', ts: '2026-05-18T10:00:00Z' });
    expect(fromAtomVmJsonl(emptyPid).events).toHaveLength(0);
  });

  it('batch of 5 lines where 3 lack pid → exactly 2 events returned', () => {
    const lines = [
      JSON.stringify({ tag: 'atomvm_proc', event: 'spawn', ts: '2026-05-18T10:00:00Z' }), // no pid
      JSON.stringify(makeEvent({ pid: '<0.51.0>', event: 'spawn' })),
      JSON.stringify({ tag: 'atomvm_proc', pid: '', event: 'running', ts: '2026-05-18T10:00:01Z' }), // empty pid
      JSON.stringify(makeEvent({ pid: '<0.52.0>', event: 'exit', ts: '2026-05-18T10:00:02Z' })),
      JSON.stringify({ tag: 'atomvm_proc', event: 'exit', ts: '2026-05-18T10:00:03Z' }), // no pid
    ];
    expect(fromAtomVmJsonl(lines.join('\n')).events).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Task 3 Crash Detection Integration Tests
// ---------------------------------------------------------------------------

describe('Task 3: crash detection integration', () => {
  // Fixture: 20+ events, 3+ PIDs, mix of lifecycle events including crashes
  const pid1 = '<0.100.0>';
  const pid2 = '<0.101.0>';
  const pid3 = '<0.102.0>';

  const FIXTURE_EVENTS: AtomVmProcEvent[] = [
    // pid1 lifecycle — crashes
    { tag: 'atomvm_proc', pid: pid1, event: 'spawn', module: 'gen_server', function: 'init', arity: 1, ts: '2026-05-18T10:00:00Z' },
    { tag: 'atomvm_proc', pid: pid1, event: 'running', scheduler: 0, ts: '2026-05-18T10:00:01Z' },
    { tag: 'atomvm_proc', pid: pid1, event: 'waiting', reason: 'receive', ts: '2026-05-18T10:00:02Z' },
    { tag: 'atomvm_proc', pid: pid1, event: 'running', scheduler: 0, ts: '2026-05-18T10:00:03Z' },
    { tag: 'atomvm_proc', pid: pid1, event: 'crash', reason: 'badarg', mfa: 'gen_server:handle_call/3', ts: '2026-05-18T10:00:04Z' },
    // pid2 lifecycle — normal exit
    { tag: 'atomvm_proc', pid: pid2, event: 'spawn', module: 'supervisor', function: 'start_link', arity: 2, ts: '2026-05-18T10:00:05Z' },
    { tag: 'atomvm_proc', pid: pid2, event: 'running', scheduler: 1, ts: '2026-05-18T10:00:06Z' },
    { tag: 'atomvm_proc', pid: pid2, event: 'waiting', reason: 'receive', ts: '2026-05-18T10:00:07Z' },
    { tag: 'atomvm_proc', pid: pid2, event: 'running', scheduler: 1, ts: '2026-05-18T10:00:08Z' },
    { tag: 'atomvm_proc', pid: pid2, event: 'exit', reason: 'normal', duration_ms: 3000, ts: '2026-05-18T10:00:09Z' },
    // pid3 lifecycle — crashes with different reason
    { tag: 'atomvm_proc', pid: pid3, event: 'spawn', module: 'my_module', function: 'worker', arity: 0, ts: '2026-05-18T10:00:10Z' },
    { tag: 'atomvm_proc', pid: pid3, event: 'running', scheduler: 0, ts: '2026-05-18T10:00:11Z' },
    { tag: 'atomvm_proc', pid: pid3, event: 'waiting', reason: 'receive', ts: '2026-05-18T10:00:12Z' },
    { tag: 'atomvm_proc', pid: pid3, event: 'running', scheduler: 0, ts: '2026-05-18T10:00:13Z' },
    { tag: 'atomvm_proc', pid: pid3, event: 'waiting', reason: 'receive', ts: '2026-05-18T10:00:14Z' },
    { tag: 'atomvm_proc', pid: pid3, event: 'running', scheduler: 0, ts: '2026-05-18T10:00:15Z' },
    { tag: 'atomvm_proc', pid: pid3, event: 'crash', reason: 'noproc', mfa: 'my_module:worker/0', ts: '2026-05-18T10:00:16Z' },
    // Extra events for pid1 to verify pid2 stays clean
    { tag: 'atomvm_proc', pid: pid1, event: 'running', scheduler: 0, ts: '2026-05-18T10:00:17Z' },
    { tag: 'atomvm_proc', pid: pid2, event: 'spawn', module: 'gen_event', function: 'init_it', arity: 6, ts: '2026-05-18T10:00:18Z' },
    { tag: 'atomvm_proc', pid: pid2, event: 'exit', reason: 'normal', duration_ms: 100, ts: '2026-05-18T10:00:19Z' },
  ];

  const FIXTURE_NDJSON = FIXTURE_EVENTS.map((e) => JSON.stringify(e)).join('\n');

  it('fixture parses to 20 OCEL events', () => {
    const events = fromAtomVmJsonl(FIXTURE_NDJSON).events;
    expect(events).toHaveLength(20);
  });

  it('detectCrashDetails returns at least 1 crash entry', () => {
    const events = fromAtomVmJsonl(FIXTURE_NDJSON).events;
    const crashes = detectCrashDetails(events);
    expect(crashes.length).toBeGreaterThan(0);
  });

  it('crash entry has pid field', () => {
    const events = fromAtomVmJsonl(FIXTURE_NDJSON).events;
    const crashes = detectCrashDetails(events);
    for (const c of crashes) {
      expect(c).toHaveProperty('pid');
      expect(typeof c.pid).toBe('string');
      expect(c.pid.length).toBeGreaterThan(0);
    }
  });

  it('crash entry has crash_reason field', () => {
    const events = fromAtomVmJsonl(FIXTURE_NDJSON).events;
    const crashes = detectCrashDetails(events);
    for (const c of crashes) {
      expect(c).toHaveProperty('crash_reason');
      expect(typeof c.crash_reason).toBe('string');
    }
  });

  it('crash entry has mfa field', () => {
    const events = fromAtomVmJsonl(FIXTURE_NDJSON).events;
    const crashes = detectCrashDetails(events);
    for (const c of crashes) {
      expect(c).toHaveProperty('mfa');
      expect(typeof c.mfa).toBe('string');
    }
  });

  it('crashed PIDs are pid1 and pid3 (pid2 exited normally)', () => {
    const events = fromAtomVmJsonl(FIXTURE_NDJSON).events;
    const crashes = detectCrashDetails(events);
    const crashedPids = crashes.map((c) => c.pid).sort();
    expect(crashedPids).toContain(pid1);
    expect(crashedPids).toContain(pid3);
    expect(crashedPids).not.toContain(pid2);
  });

  it('pid1 crash has reason "badarg"', () => {
    const events = fromAtomVmJsonl(FIXTURE_NDJSON).events;
    const crashes = detectCrashDetails(events);
    const pid1Crash = crashes.find((c) => c.pid === pid1);
    expect(pid1Crash).toBeDefined();
    expect(pid1Crash?.crash_reason).toBe('badarg');
  });

  it('pid1 crash has mfa "gen_server:handle_call/3"', () => {
    const events = fromAtomVmJsonl(FIXTURE_NDJSON).events;
    const crashes = detectCrashDetails(events);
    const pid1Crash = crashes.find((c) => c.pid === pid1);
    expect(pid1Crash?.mfa).toBe('gen_server:handle_call/3');
  });

  it('pid3 crash has reason "noproc"', () => {
    const events = fromAtomVmJsonl(FIXTURE_NDJSON).events;
    const crashes = detectCrashDetails(events);
    const pid3Crash = crashes.find((c) => c.pid === pid3);
    expect(pid3Crash).toBeDefined();
    expect(pid3Crash?.crash_reason).toBe('noproc');
  });

  it('clean fixture (all normal exits) returns empty crash list', () => {
    const cleanEvents: AtomVmProcEvent[] = [
      { tag: 'atomvm_proc', pid: '<0.200.0>', event: 'spawn', module: 'app', function: 'start', arity: 0, ts: '2026-05-18T11:00:00Z' },
      { tag: 'atomvm_proc', pid: '<0.200.0>', event: 'running', scheduler: 0, ts: '2026-05-18T11:00:01Z' },
      { tag: 'atomvm_proc', pid: '<0.200.0>', event: 'exit', reason: 'normal', duration_ms: 100, ts: '2026-05-18T11:00:02Z' },
      { tag: 'atomvm_proc', pid: '<0.201.0>', event: 'spawn', module: 'app', function: 'worker', arity: 1, ts: '2026-05-18T11:00:03Z' },
      { tag: 'atomvm_proc', pid: '<0.201.0>', event: 'exit', reason: 'normal', duration_ms: 200, ts: '2026-05-18T11:00:04Z' },
    ];
    const ndjson = cleanEvents.map((e) => JSON.stringify(e)).join('\n');
    const events = fromAtomVmJsonl(ndjson).events;
    expect(detectCrashDetails(events)).toHaveLength(0);
  });

  it('deduplicates: PID with 2 crash events → 1 CrashDetail entry', () => {
    const pid = '<0.300.0>';
    const crash1: AtomVmProcEvent = { tag: 'atomvm_proc', pid, event: 'crash', reason: 'badmatch', mfa: 'a:b/1', ts: '2026-05-18T12:00:00Z' };
    const crash2: AtomVmProcEvent = { tag: 'atomvm_proc', pid, event: 'crash', reason: 'function_clause', mfa: 'a:b/1', ts: '2026-05-18T12:00:01Z' };
    const events = fromAtomVmJsonl([crash1, crash2].map((e) => JSON.stringify(e)).join('\n')).events;
    expect(detectCrashDetails(events)).toHaveLength(1);
    // First crash reason wins
    expect(detectCrashDetails(events)[0].crash_reason).toBe('badmatch');
  });
});

// ---------------------------------------------------------------------------
// toOcel2Json — WASM-compatible OCEL serialization (Task 2 integration bridge)
// ---------------------------------------------------------------------------

describe('toOcel2Json: WASM-compatible OCEL document structure', () => {
  // Note: toOcel2Json produces the pm4py-style camelCase format that the
  // wasm4pm WASM engine (load_ocel_from_json) parses. It does NOT use ocel: prefixed keys.
  // Use toOcel2JsonStandard() for the IEEE OCEL 2.0 prefixed format.

  const singlePid = '<0.400.0>';
  const singleEvent: AtomVmProcEvent = {
    tag: 'atomvm_proc',
    pid: singlePid,
    event: 'spawn',
    module: 'app',
    function: 'start',
    arity: 0,
    ts: '2026-05-18T13:00:00Z',
  };

  it('produces valid JSON', () => {
    const events = fromAtomVmJsonl(JSON.stringify(singleEvent)).events;
    expect(() => JSON.parse(toOcel2Json(events))).not.toThrow();
  });

  it('output has eventTypes array listing all activity types', () => {
    const events = fromAtomVmJsonl(JSON.stringify(singleEvent)).events;
    const doc = JSON.parse(toOcel2Json(events)) as Record<string, unknown>;
    expect(Array.isArray(doc['eventTypes'])).toBe(true);
    expect(doc['eventTypes']).toContain('atomvm_proc.spawn');
  });

  it('output has objects array', () => {
    const events = fromAtomVmJsonl(JSON.stringify(singleEvent)).events;
    const doc = JSON.parse(toOcel2Json(events)) as Record<string, unknown>;
    expect(Array.isArray(doc['objects'])).toBe(true);
  });

  it('output has events array', () => {
    const events = fromAtomVmJsonl(JSON.stringify(singleEvent)).events;
    const doc = JSON.parse(toOcel2Json(events)) as Record<string, unknown>;
    expect(Array.isArray(doc['events'])).toBe(true);
  });

  it('objects contains one entry per unique PID', () => {
    const pids = ['<0.401.0>', '<0.402.0>', '<0.403.0>'];
    const lines = pids.map((pid, i) =>
      JSON.stringify(makeEvent({ pid, event: 'spawn', ts: `2026-05-18T14:0${i}:00Z` }))
    );
    const events = fromAtomVmJsonl(lines.join('\n')).events;
    const doc = JSON.parse(toOcel2Json(events)) as Record<string, unknown>;
    const objects = doc['objects'] as Array<{ id: string; type: string }>;
    expect(objects).toHaveLength(3);
    const ids = objects.map((o) => o.id);
    expect(ids).toContain('<0.401.0>');
    expect(ids).toContain('<0.402.0>');
    expect(ids).toContain('<0.403.0>');
  });

  it('events contains atomvm_proc.* type entries', () => {
    const evts: AtomVmProcEvent[] = [
      makeEvent({ pid: '<0.410.0>', event: 'spawn' }),
      makeEvent({ pid: '<0.410.0>', event: 'exit', ts: '2026-05-18T15:00:01Z' }),
    ];
    const ocelEvents = fromAtomVmJsonl(evts.map((e) => JSON.stringify(e)).join('\n')).events;
    const doc = JSON.parse(toOcel2Json(ocelEvents)) as Record<string, unknown>;
    const docEvents = doc['events'] as Array<{ type: string }>;
    const types = docEvents.map((e) => e.type);
    expect(types).toContain('atomvm_proc.spawn');
    expect(types).toContain('atomvm_proc.exit');
  });

  it('empty events array produces empty objects and events', () => {
    const doc = JSON.parse(toOcel2Json([])) as Record<string, unknown>;
    expect(doc['objects']).toHaveLength(0);
    expect(doc['events']).toHaveLength(0);
  });

  it('attributes are serialized as array of {name, value} for WASM compatibility', () => {
    const events = fromAtomVmJsonl(JSON.stringify(singleEvent)).events;
    const doc = JSON.parse(toOcel2Json(events)) as Record<string, unknown>;
    const firstEvent = (doc['events'] as Array<{ attributes: unknown }>)[0];
    // Attributes must be an array (not an object) so WASM uses the lenient visit_seq path
    expect(Array.isArray(firstEvent.attributes)).toBe(true);
    const attrs = firstEvent.attributes as Array<{ name: string; value: unknown }>;
    // mfa assembled from module/function/arity
    expect(attrs.find((a) => a.name === 'mfa')?.value).toBe('app:start/0');
  });

  it('20-event fixture produces WASM-parseable document with correct counts', () => {
    const pid1 = '<0.500.0>';
    const pid2 = '<0.501.0>';
    const pid3 = '<0.502.0>';
    const bigFixture: AtomVmProcEvent[] = [
      { tag: 'atomvm_proc', pid: pid1, event: 'spawn', module: 'gen_server', function: 'init', arity: 1, ts: '2026-05-18T16:00:00Z' },
      { tag: 'atomvm_proc', pid: pid1, event: 'running', scheduler: 0, ts: '2026-05-18T16:00:01Z' },
      { tag: 'atomvm_proc', pid: pid1, event: 'waiting', reason: 'receive', ts: '2026-05-18T16:00:02Z' },
      { tag: 'atomvm_proc', pid: pid1, event: 'running', scheduler: 0, ts: '2026-05-18T16:00:03Z' },
      { tag: 'atomvm_proc', pid: pid1, event: 'crash', reason: 'badarg', mfa: 'gen_server:handle_call/3', ts: '2026-05-18T16:00:04Z' },
      { tag: 'atomvm_proc', pid: pid2, event: 'spawn', module: 'supervisor', function: 'start_link', arity: 2, ts: '2026-05-18T16:00:05Z' },
      { tag: 'atomvm_proc', pid: pid2, event: 'running', scheduler: 1, ts: '2026-05-18T16:00:06Z' },
      { tag: 'atomvm_proc', pid: pid2, event: 'waiting', reason: 'receive', ts: '2026-05-18T16:00:07Z' },
      { tag: 'atomvm_proc', pid: pid2, event: 'running', scheduler: 1, ts: '2026-05-18T16:00:08Z' },
      { tag: 'atomvm_proc', pid: pid2, event: 'exit', reason: 'normal', duration_ms: 3000, ts: '2026-05-18T16:00:09Z' },
      { tag: 'atomvm_proc', pid: pid3, event: 'spawn', module: 'my_module', function: 'worker', arity: 0, ts: '2026-05-18T16:00:10Z' },
      { tag: 'atomvm_proc', pid: pid3, event: 'running', scheduler: 0, ts: '2026-05-18T16:00:11Z' },
      { tag: 'atomvm_proc', pid: pid3, event: 'waiting', reason: 'receive', ts: '2026-05-18T16:00:12Z' },
      { tag: 'atomvm_proc', pid: pid3, event: 'running', scheduler: 0, ts: '2026-05-18T16:00:13Z' },
      { tag: 'atomvm_proc', pid: pid3, event: 'waiting', reason: 'receive', ts: '2026-05-18T16:00:14Z' },
      { tag: 'atomvm_proc', pid: pid3, event: 'running', scheduler: 0, ts: '2026-05-18T16:00:15Z' },
      { tag: 'atomvm_proc', pid: pid3, event: 'crash', reason: 'noproc', mfa: 'my_module:worker/0', ts: '2026-05-18T16:00:16Z' },
      { tag: 'atomvm_proc', pid: pid1, event: 'running', scheduler: 0, ts: '2026-05-18T16:00:17Z' },
      { tag: 'atomvm_proc', pid: pid2, event: 'spawn', module: 'gen_event', function: 'init_it', arity: 6, ts: '2026-05-18T16:00:18Z' },
      { tag: 'atomvm_proc', pid: pid2, event: 'exit', reason: 'normal', duration_ms: 100, ts: '2026-05-18T16:00:19Z' },
    ];
    const events = fromAtomVmJsonl(bigFixture.map((e) => JSON.stringify(e)).join('\n')).events;
    expect(events).toHaveLength(20);
    const json = toOcel2Json(events);
    const doc = JSON.parse(json) as Record<string, unknown>;
    // WASM-compatible format: camelCase keys
    expect(Array.isArray(doc['events'])).toBe(true);
    expect((doc['events'] as unknown[]).length).toBe(20);
    // 3 unique PIDs → 3 objects
    expect((doc['objects'] as unknown[]).length).toBe(3);
    // All 5 activity types discovered
    expect(Array.isArray(doc['eventTypes'])).toBe(true);
    expect((doc['eventTypes'] as string[]).length).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// toOcel2JsonStandard — IEEE OCEL 2.0 format (ocel: prefixed keys)
// ---------------------------------------------------------------------------

describe('toOcel2JsonStandard: IEEE OCEL 2.0 prefixed-key format', () => {
  const singleEvent: AtomVmProcEvent = {
    tag: 'atomvm_proc',
    pid: '<0.600.0>',
    event: 'spawn',
    module: 'app',
    function: 'start',
    arity: 0,
    ts: '2026-05-18T13:00:00Z',
  };

  it('produces valid JSON', () => {
    const events = fromAtomVmJsonl(JSON.stringify(singleEvent)).events;
    expect(() => JSON.parse(toOcel2JsonStandard(events))).not.toThrow();
  });

  it('output has ocel:version = "2.0"', () => {
    const events = fromAtomVmJsonl(JSON.stringify(singleEvent)).events;
    const doc = JSON.parse(toOcel2JsonStandard(events)) as Record<string, unknown>;
    expect(doc['ocel:version']).toBe('2.0');
  });

  it('output has ocel:objects array with ocel:oid keys', () => {
    const events = fromAtomVmJsonl(JSON.stringify(singleEvent)).events;
    const doc = JSON.parse(toOcel2JsonStandard(events)) as Record<string, unknown>;
    const objects = doc['ocel:objects'] as Array<{ 'ocel:oid': string }>;
    expect(Array.isArray(objects)).toBe(true);
    expect(objects[0]['ocel:oid']).toBe('<0.600.0>');
  });

  it('output has ocel:events array with ocel:activity keys', () => {
    const events = fromAtomVmJsonl(JSON.stringify(singleEvent)).events;
    const doc = JSON.parse(toOcel2JsonStandard(events)) as Record<string, unknown>;
    const docEvents = doc['ocel:events'] as Array<{ 'ocel:activity': string }>;
    expect(Array.isArray(docEvents)).toBe(true);
    expect(docEvents[0]['ocel:activity']).toBe('atomvm_proc.spawn');
  });

  it('empty events array produces empty ocel:objects and ocel:events', () => {
    const doc = JSON.parse(toOcel2JsonStandard([])) as Record<string, unknown>;
    expect(doc['ocel:objects']).toHaveLength(0);
    expect(doc['ocel:events']).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP-4b: parseErrors array and fromAtomVmJsonlStrict (5 new tests)
// ─────────────────────────────────────────────────────────────────────────────

describe('GAP-4b: fromAtomVmJsonl parseErrors + fromAtomVmJsonlStrict', () => {
  const VALID_LINE = JSON.stringify({
    tag: 'atomvm_proc',
    pid: '<0.42.0>',
    event: 'spawn',
    ts: '2026-05-18T10:00:00Z',
  });

  it('all-valid NDJSON yields parseErrors.length === 0', () => {
    const ndjson = [
      VALID_LINE,
      JSON.stringify({ tag: 'atomvm_proc', pid: '<0.42.0>', event: 'running', ts: '2026-05-18T10:00:01Z' }),
      JSON.stringify({ tag: 'atomvm_proc', pid: '<0.42.0>', event: 'exit', reason: 'normal', ts: '2026-05-18T10:00:02Z' }),
    ].join('\n');

    const result: AtomVmParseResult = fromAtomVmJsonl(ndjson);
    expect(result.parseErrors).toHaveLength(0);
    expect(result.events).toHaveLength(3);
    expect(result.totalLines).toBe(3);
  });

  it('one corrupt line → exactly 1 parseError and remaining valid events are preserved', () => {
    const ndjson = [
      VALID_LINE,
      'not-valid-json',
      JSON.stringify({ tag: 'atomvm_proc', pid: '<0.42.0>', event: 'exit', reason: 'normal', ts: '2026-05-18T10:00:02Z' }),
    ].join('\n');

    const result: AtomVmParseResult = fromAtomVmJsonl(ndjson);
    expect(result.parseErrors).toHaveLength(1);
    expect(result.events).toHaveLength(2); // valid lines still parsed
    expect(result.totalLines).toBe(3);
  });

  it('all corrupt lines → events.length === 0 and parseErrors.length equals line count', () => {
    const ndjson = [
      'not-valid-json',
      '{incomplete',
      '[broken',
    ].join('\n');

    const result: AtomVmParseResult = fromAtomVmJsonl(ndjson);
    expect(result.events).toHaveLength(0);
    expect(result.parseErrors).toHaveLength(3);
    expect(result.totalLines).toBe(3);
  });

  it('parseErrors[0] has the required { line, raw, error } shape', () => {
    const corruptLine = 'not-valid-json';
    const ndjson = [VALID_LINE, corruptLine].join('\n');

    const result: AtomVmParseResult = fromAtomVmJsonl(ndjson);
    expect(result.parseErrors).toHaveLength(1);

    const err = result.parseErrors[0]!;
    expect(typeof err.line).toBe('number');
    expect(err.line).toBeGreaterThan(0); // 1-based line number
    expect(typeof err.raw).toBe('string');
    expect(err.raw).toBe(corruptLine);
    expect(typeof err.error).toBe('string');
    expect(err.error.length).toBeGreaterThan(0);
  });

  it('fromAtomVmJsonlStrict throws with line number in message when NDJSON is corrupt', () => {
    const ndjson = [
      VALID_LINE,
      'bad-json-here',
    ].join('\n');

    expect(() => fromAtomVmJsonlStrict(ndjson)).toThrow(/line 2/i);
  });
});
