/**
 * AtomVM Bridge Tests
 *
 * Validates the full pipeline from raw AtomVM process lifecycle NDJSON
 * → OCEL 2.0 events → crash detection.
 *
 * Covers:
 *   - isAtomVmProcEvent type guard (valid, missing tag/pid/event/ts, wrong tag)
 *   - adaptAtomVmProcEvent: each lifecycle event type round-trip
 *   - ocel:activity always prefixed with "atomvm_proc."
 *   - ocel:omap contains the PID
 *   - mfa field assembled correctly from module/function/arity
 *   - fromAtomVmJsonl lenient parsing (blank lines, invalid JSON, wrong tag)
 *   - detectCrashes identifies crashed PIDs and returns empty when no crashes
 */

import { describe, it, expect } from 'vitest';
import {
  isAtomVmProcEvent,
  adaptAtomVmProcEvent,
  fromAtomVmJsonl,
  detectCrashes,
  type AtomVmProcEvent,
} from '../atomvm-bridge.js';
import { isValidOcelEvent } from '../ocel-bridge.js';

// ---------------------------------------------------------------------------
// Fixtures — one for each lifecycle event type
// ---------------------------------------------------------------------------

const SPAWN_EVT: AtomVmProcEvent = {
  tag: 'atomvm_proc',
  pid: '<0.5.0>',
  event: 'spawn',
  module: 'my_app',
  function: 'start',
  arity: 0,
  parent: '<0.1.0>',
  ts: '2026-05-18T10:00:00Z',
};

const RUNNING_EVT: AtomVmProcEvent = {
  tag: 'atomvm_proc',
  pid: '<0.5.0>',
  event: 'running',
  scheduler: 0,
  ts: '2026-05-18T10:00:01Z',
};

const WAITING_EVT: AtomVmProcEvent = {
  tag: 'atomvm_proc',
  pid: '<0.5.0>',
  event: 'waiting',
  reason: 'receive',
  ts: '2026-05-18T10:00:02Z',
};

const EXIT_EVT: AtomVmProcEvent = {
  tag: 'atomvm_proc',
  pid: '<0.5.0>',
  event: 'exit',
  reason: 'normal',
  duration_ms: 1500,
  ts: '2026-05-18T10:00:03Z',
};

const CRASH_EVT: AtomVmProcEvent = {
  tag: 'atomvm_proc',
  pid: '<0.5.0>',
  event: 'crash',
  reason: 'badarg',
  mfa: 'lists:nth/2',
  ts: '2026-05-18T10:00:04Z',
};

const SAMPLE_NDJSON = [
  JSON.stringify(SPAWN_EVT),
  JSON.stringify(RUNNING_EVT),
  JSON.stringify(WAITING_EVT),
  JSON.stringify(EXIT_EVT),
].join('\n');

// ---------------------------------------------------------------------------
// isAtomVmProcEvent — type guard
// ---------------------------------------------------------------------------

describe('isAtomVmProcEvent', () => {
  it('returns true for a well-formed spawn event', () => {
    expect(isAtomVmProcEvent(SPAWN_EVT)).toBe(true);
  });

  it('returns true for a well-formed running event', () => {
    expect(isAtomVmProcEvent(RUNNING_EVT)).toBe(true);
  });

  it('returns true for a well-formed crash event', () => {
    expect(isAtomVmProcEvent(CRASH_EVT)).toBe(true);
  });

  it('returns false for null', () => {
    expect(isAtomVmProcEvent(null)).toBe(false);
  });

  it('returns false for an array', () => {
    expect(isAtomVmProcEvent([])).toBe(false);
  });

  it('returns false for a plain string', () => {
    expect(isAtomVmProcEvent('atomvm_proc')).toBe(false);
  });

  it('returns false when tag is missing', () => {
    const raw = { pid: '<0.5.0>', event: 'spawn', ts: '2026-05-18T10:00:00Z' };
    expect(isAtomVmProcEvent(raw)).toBe(false);
  });

  it('returns false when tag is not "atomvm_proc"', () => {
    const raw = { tag: 'beam_proc', pid: '<0.5.0>', event: 'spawn', ts: '2026-05-18T10:00:00Z' };
    expect(isAtomVmProcEvent(raw)).toBe(false);
  });

  it('returns false when pid is missing', () => {
    const raw = { tag: 'atomvm_proc', event: 'spawn', ts: '2026-05-18T10:00:00Z' };
    expect(isAtomVmProcEvent(raw)).toBe(false);
  });

  it('returns false when pid is empty string', () => {
    const raw = { tag: 'atomvm_proc', pid: '', event: 'spawn', ts: '2026-05-18T10:00:00Z' };
    expect(isAtomVmProcEvent(raw)).toBe(false);
  });

  it('returns false when event is missing', () => {
    const raw = { tag: 'atomvm_proc', pid: '<0.5.0>', ts: '2026-05-18T10:00:00Z' };
    expect(isAtomVmProcEvent(raw)).toBe(false);
  });

  it('returns false when event is empty string', () => {
    const raw = { tag: 'atomvm_proc', pid: '<0.5.0>', event: '', ts: '2026-05-18T10:00:00Z' };
    expect(isAtomVmProcEvent(raw)).toBe(false);
  });

  it('returns false when ts is missing', () => {
    const raw = { tag: 'atomvm_proc', pid: '<0.5.0>', event: 'spawn' };
    expect(isAtomVmProcEvent(raw)).toBe(false);
  });

  it('returns false when ts is empty string', () => {
    const raw = { tag: 'atomvm_proc', pid: '<0.5.0>', event: 'spawn', ts: '' };
    expect(isAtomVmProcEvent(raw)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// adaptAtomVmProcEvent — single event conversion, each lifecycle type
// ---------------------------------------------------------------------------

describe('adaptAtomVmProcEvent — spawn', () => {
  it('ocel:activity is "atomvm_proc.spawn"', () => {
    const ev = adaptAtomVmProcEvent(SPAWN_EVT);
    expect(ev['ocel:activity']).toBe('atomvm_proc.spawn');
  });

  it('ocel:timestamp matches ts field', () => {
    const ev = adaptAtomVmProcEvent(SPAWN_EVT);
    expect(ev['ocel:timestamp']).toBe('2026-05-18T10:00:00Z');
  });

  it('ocel:eid is pid:event:ts', () => {
    const ev = adaptAtomVmProcEvent(SPAWN_EVT);
    expect(ev['ocel:eid']).toBe('<0.5.0>:spawn:2026-05-18T10:00:00Z');
  });

  it('ocel:omap contains the pid', () => {
    const ev = adaptAtomVmProcEvent(SPAWN_EVT);
    expect(ev['ocel:omap']).toContain('<0.5.0>');
  });

  it('mfa is assembled from module:function/arity', () => {
    const ev = adaptAtomVmProcEvent(SPAWN_EVT);
    expect((ev['ocel:vmap'] as Record<string, unknown>)['mfa']).toBe('my_app:start/0');
  });

  it('parent field is carried through to vmap', () => {
    const ev = adaptAtomVmProcEvent(SPAWN_EVT);
    expect((ev['ocel:vmap'] as Record<string, unknown>)['parent']).toBe('<0.1.0>');
  });

  it('tag is NOT in vmap (excluded as discriminator)', () => {
    const ev = adaptAtomVmProcEvent(SPAWN_EVT);
    expect((ev['ocel:vmap'] as Record<string, unknown>)['tag']).toBeUndefined();
  });

  it('pid is NOT in vmap (promoted to ocel:omap)', () => {
    const ev = adaptAtomVmProcEvent(SPAWN_EVT);
    expect((ev['ocel:vmap'] as Record<string, unknown>)['pid']).toBeUndefined();
  });

  it('event is NOT in vmap (promoted to ocel:activity suffix)', () => {
    const ev = adaptAtomVmProcEvent(SPAWN_EVT);
    expect((ev['ocel:vmap'] as Record<string, unknown>)['event']).toBeUndefined();
  });

  it('ts is NOT in vmap (promoted to ocel:timestamp)', () => {
    const ev = adaptAtomVmProcEvent(SPAWN_EVT);
    expect((ev['ocel:vmap'] as Record<string, unknown>)['ts']).toBeUndefined();
  });

  it('produces a valid OCEL 2.0 event structure', () => {
    expect(isValidOcelEvent(adaptAtomVmProcEvent(SPAWN_EVT))).toBe(true);
  });
});

describe('adaptAtomVmProcEvent — running', () => {
  it('ocel:activity is "atomvm_proc.running"', () => {
    const ev = adaptAtomVmProcEvent(RUNNING_EVT);
    expect(ev['ocel:activity']).toBe('atomvm_proc.running');
  });

  it('ocel:omap contains the pid', () => {
    const ev = adaptAtomVmProcEvent(RUNNING_EVT);
    expect(ev['ocel:omap']).toContain('<0.5.0>');
  });

  it('scheduler field is carried through to vmap', () => {
    const ev = adaptAtomVmProcEvent(RUNNING_EVT);
    expect((ev['ocel:vmap'] as Record<string, unknown>)['scheduler']).toBe(0);
  });

  it('mfa is absent when module/function/arity not present', () => {
    const ev = adaptAtomVmProcEvent(RUNNING_EVT);
    expect((ev['ocel:vmap'] as Record<string, unknown>)['mfa']).toBeUndefined();
  });

  it('produces a valid OCEL 2.0 event structure', () => {
    expect(isValidOcelEvent(adaptAtomVmProcEvent(RUNNING_EVT))).toBe(true);
  });
});

describe('adaptAtomVmProcEvent — waiting', () => {
  it('ocel:activity is "atomvm_proc.waiting"', () => {
    const ev = adaptAtomVmProcEvent(WAITING_EVT);
    expect(ev['ocel:activity']).toBe('atomvm_proc.waiting');
  });

  it('reason field is carried through to vmap', () => {
    const ev = adaptAtomVmProcEvent(WAITING_EVT);
    expect((ev['ocel:vmap'] as Record<string, unknown>)['reason']).toBe('receive');
  });

  it('produces a valid OCEL 2.0 event structure', () => {
    expect(isValidOcelEvent(adaptAtomVmProcEvent(WAITING_EVT))).toBe(true);
  });
});

describe('adaptAtomVmProcEvent — exit', () => {
  it('ocel:activity is "atomvm_proc.exit"', () => {
    const ev = adaptAtomVmProcEvent(EXIT_EVT);
    expect(ev['ocel:activity']).toBe('atomvm_proc.exit');
  });

  it('reason field is carried through to vmap', () => {
    const ev = adaptAtomVmProcEvent(EXIT_EVT);
    expect((ev['ocel:vmap'] as Record<string, unknown>)['reason']).toBe('normal');
  });

  it('duration_ms field is carried through to vmap', () => {
    const ev = adaptAtomVmProcEvent(EXIT_EVT);
    expect((ev['ocel:vmap'] as Record<string, unknown>)['duration_ms']).toBe(1500);
  });

  it('produces a valid OCEL 2.0 event structure', () => {
    expect(isValidOcelEvent(adaptAtomVmProcEvent(EXIT_EVT))).toBe(true);
  });
});

describe('adaptAtomVmProcEvent — crash', () => {
  it('ocel:activity is "atomvm_proc.crash"', () => {
    const ev = adaptAtomVmProcEvent(CRASH_EVT);
    expect(ev['ocel:activity']).toBe('atomvm_proc.crash');
  });

  it('ocel:omap contains the crashed pid', () => {
    const ev = adaptAtomVmProcEvent(CRASH_EVT);
    expect(ev['ocel:omap']).toContain('<0.5.0>');
  });

  it('reason field is carried through to vmap', () => {
    const ev = adaptAtomVmProcEvent(CRASH_EVT);
    expect((ev['ocel:vmap'] as Record<string, unknown>)['reason']).toBe('badarg');
  });

  it('pre-assembled mfa string field is preserved in vmap', () => {
    // CRASH_EVT has no module/function/arity but does have an mfa string
    const ev = adaptAtomVmProcEvent(CRASH_EVT);
    expect((ev['ocel:vmap'] as Record<string, unknown>)['mfa']).toBe('lists:nth/2');
  });

  it('produces a valid OCEL 2.0 event structure', () => {
    expect(isValidOcelEvent(adaptAtomVmProcEvent(CRASH_EVT))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ocel:activity prefix invariant
// ---------------------------------------------------------------------------

describe('ocel:activity prefix invariant', () => {
  const allEvents = [SPAWN_EVT, RUNNING_EVT, WAITING_EVT, EXIT_EVT, CRASH_EVT];

  it('every adapted event has ocel:activity starting with "atomvm_proc."', () => {
    for (const evt of allEvents) {
      const oc = adaptAtomVmProcEvent(evt);
      expect(oc['ocel:activity']).toMatch(/^atomvm_proc\./);
    }
  });
});

// ---------------------------------------------------------------------------
// fromAtomVmJsonl — lenient NDJSON parser
// ---------------------------------------------------------------------------

describe('fromAtomVmJsonl', () => {
  it('parses all four lifecycle events from sample NDJSON', () => {
    const events = fromAtomVmJsonl(SAMPLE_NDJSON);
    expect(events).toHaveLength(4);
  });

  it('returns an empty array for an empty string', () => {
    expect(fromAtomVmJsonl('')).toHaveLength(0);
  });

  it('skips blank lines silently', () => {
    const withBlanks = '\n' + SAMPLE_NDJSON + '\n\n';
    expect(fromAtomVmJsonl(withBlanks)).toHaveLength(4);
  });

  it('skips whitespace-only lines silently', () => {
    const withSpaces = '   \n' + SAMPLE_NDJSON;
    expect(fromAtomVmJsonl(withSpaces)).toHaveLength(4);
  });

  it('skips invalid JSON lines without throwing', () => {
    const withBad = 'not-json\n' + SAMPLE_NDJSON;
    expect(fromAtomVmJsonl(withBad)).toHaveLength(4);
  });

  it('skips lines missing the "atomvm_proc" tag', () => {
    const wrongTag = JSON.stringify({ tag: 'other_system', pid: '<0.5.0>', event: 'spawn', ts: '2026-05-18T10:00:00Z' });
    const ndjson = wrongTag + '\n' + JSON.stringify(SPAWN_EVT);
    const events = fromAtomVmJsonl(ndjson);
    expect(events).toHaveLength(1);
  });

  it('skips lines missing pid without throwing', () => {
    const noPid = JSON.stringify({ tag: 'atomvm_proc', event: 'spawn', ts: '2026-05-18T10:00:00Z' });
    const ndjson = noPid + '\n' + JSON.stringify(RUNNING_EVT);
    const events = fromAtomVmJsonl(ndjson);
    expect(events).toHaveLength(1);
  });

  it('skips lines missing event without throwing', () => {
    const noEvent = JSON.stringify({ tag: 'atomvm_proc', pid: '<0.5.0>', ts: '2026-05-18T10:00:00Z' });
    const ndjson = noEvent + '\n' + JSON.stringify(WAITING_EVT);
    const events = fromAtomVmJsonl(ndjson);
    expect(events).toHaveLength(1);
  });

  it('skips lines missing ts without throwing', () => {
    const noTs = JSON.stringify({ tag: 'atomvm_proc', pid: '<0.5.0>', event: 'spawn' });
    const ndjson = noTs + '\n' + JSON.stringify(EXIT_EVT);
    const events = fromAtomVmJsonl(ndjson);
    expect(events).toHaveLength(1);
  });

  it('all returned events pass isValidOcelEvent', () => {
    const events = fromAtomVmJsonl(SAMPLE_NDJSON);
    for (const ev of events) {
      expect(isValidOcelEvent(ev)).toBe(true);
    }
  });

  it('activities match the event field with "atomvm_proc." prefix', () => {
    const events = fromAtomVmJsonl(SAMPLE_NDJSON);
    const activities = events.map((e) => e['ocel:activity']);
    expect(activities).toContain('atomvm_proc.spawn');
    expect(activities).toContain('atomvm_proc.running');
    expect(activities).toContain('atomvm_proc.waiting');
    expect(activities).toContain('atomvm_proc.exit');
  });

  it('handles a mixed stream of atomvm and non-atomvm lines', () => {
    const mixed = [
      JSON.stringify({ tag: 'sys_log', level: 'info', msg: 'boot' }),
      JSON.stringify(SPAWN_EVT),
      '{"invalid json',
      JSON.stringify(CRASH_EVT),
      '',
      JSON.stringify({ event_type: 'listing.created', ts: '2026-05-18T10:00:00Z' }),
    ].join('\n');
    const events = fromAtomVmJsonl(mixed);
    // Only SPAWN_EVT and CRASH_EVT are valid atomvm_proc events
    expect(events).toHaveLength(2);
    expect(events[0]['ocel:activity']).toBe('atomvm_proc.spawn');
    expect(events[1]['ocel:activity']).toBe('atomvm_proc.crash');
  });

  it('handles a single-event NDJSON string', () => {
    const single = JSON.stringify(EXIT_EVT);
    const events = fromAtomVmJsonl(single);
    expect(events).toHaveLength(1);
    expect(events[0]['ocel:activity']).toBe('atomvm_proc.exit');
  });
});

// ---------------------------------------------------------------------------
// detectCrashes — outcome prediction
// ---------------------------------------------------------------------------

describe('detectCrashes', () => {
  it('returns empty array when no crash events are present', () => {
    const events = fromAtomVmJsonl(SAMPLE_NDJSON); // spawn/running/waiting/exit, no crash
    expect(detectCrashes(events)).toHaveLength(0);
  });

  it('identifies a single crashed PID', () => {
    const events = fromAtomVmJsonl(
      [SPAWN_EVT, CRASH_EVT].map((e) => JSON.stringify(e)).join('\n')
    );
    const crashed = detectCrashes(events);
    expect(crashed).toContain('<0.5.0>');
    expect(crashed).toHaveLength(1);
  });

  it('deduplicates a PID that has multiple crash events', () => {
    const crash2: AtomVmProcEvent = {
      tag: 'atomvm_proc',
      pid: '<0.5.0>',
      event: 'crash',
      reason: 'function_clause',
      ts: '2026-05-18T10:00:05Z',
    };
    const events = fromAtomVmJsonl(
      [CRASH_EVT, crash2].map((e) => JSON.stringify(e)).join('\n')
    );
    const crashed = detectCrashes(events);
    expect(crashed).toHaveLength(1); // deduplicated
    expect(crashed).toContain('<0.5.0>');
  });

  it('returns multiple distinct crashed PIDs', () => {
    const otherCrash: AtomVmProcEvent = {
      tag: 'atomvm_proc',
      pid: '<0.9.0>',
      event: 'crash',
      reason: 'noproc',
      ts: '2026-05-18T10:00:06Z',
    };
    const events = fromAtomVmJsonl(
      [CRASH_EVT, otherCrash].map((e) => JSON.stringify(e)).join('\n')
    );
    const crashed = detectCrashes(events);
    expect(crashed).toHaveLength(2);
    expect(crashed).toContain('<0.5.0>');
    expect(crashed).toContain('<0.9.0>');
  });

  it('returns empty array for an empty event list', () => {
    expect(detectCrashes([])).toHaveLength(0);
  });

  it('ignores exit events — only crash events count', () => {
    const events = fromAtomVmJsonl(JSON.stringify(EXIT_EVT));
    expect(detectCrashes(events)).toHaveLength(0);
  });
});
