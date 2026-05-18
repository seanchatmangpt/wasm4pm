/**
 * beam-message-schema.test.ts
 *
 * Tests for the BEAM message format shared schema and validator (GAP-1 fix).
 *
 * Covers:
 *   - BeamMsg: valid round-trip, missing required fields, wrong tag, malformed PID
 *   - BeamMonitor: valid round-trip, missing required fields, wrong tag, malformed ref
 *   - parseBeamMessage: dispatch by tag, invalid JSON, unknown tag, non-object root
 *   - BEAM_PID_PATTERN / BEAM_REF_PATTERN: pattern contract tests
 *   - Payload flexibility: any object accepted, deeply nested payload passes
 *   - TypeScript discriminated union: BeamMsg vs BeamMonitor by tag
 *
 * Oracle rank: Rank 2 (domain contract) — all assertions derive from the
 * beam-message-schema.json field requirements and the GAP-1 protocol contract.
 */

import { describe, it, expect } from 'vitest';

import {
  validateBeamMsg,
  validateBeamMonitor,
  parseBeamMessage,
  BEAM_PID_PATTERN,
  BEAM_REF_PATTERN,
  type BeamMsg,
  type BeamMonitor,
  type BeamMessage,
} from '../beam-message-validator.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VALID_PID_A = 'pid:<0.42.0>';
const VALID_PID_B = 'pid:<0.7.0>';
const VALID_REF = 'ref:<0.1.0.42>';
const NOW_ISO = '2026-05-18T10:00:00Z';

const VALID_BEAM_MSG: BeamMsg = {
  tag: 'beam_msg',
  from: VALID_PID_A,
  to: VALID_PID_B,
  payload: { type: 'route_eval', route_id: 'r-001', conformance: 0.95 },
  sent_at: NOW_ISO,
};

const VALID_BEAM_MONITOR: BeamMonitor = {
  tag: 'beam_monitor',
  ref: VALID_REF,
  event: 'DOWN',
  reason: 'normal',
  pid: VALID_PID_A,
  at: NOW_ISO,
};

// ── BEAM_PID_PATTERN ──────────────────────────────────────────────────────────

describe('BEAM_PID_PATTERN', () => {
  it('matches minimal valid PID pid:<0.0.0>', () => {
    expect(BEAM_PID_PATTERN.test('pid:<0.0.0>')).toBe(true);
  });

  it('matches a real-world PID pid:<0.42.0>', () => {
    expect(BEAM_PID_PATTERN.test(VALID_PID_A)).toBe(true);
  });

  it('matches a PID with large integers pid:<1.100.3>', () => {
    expect(BEAM_PID_PATTERN.test('pid:<1.100.3>')).toBe(true);
  });

  it('rejects PID missing the pid: prefix', () => {
    expect(BEAM_PID_PATTERN.test('<0.42.0>')).toBe(false);
  });

  it('rejects PID with alphabetic node component', () => {
    expect(BEAM_PID_PATTERN.test('pid:<a.42.0>')).toBe(false);
  });

  it('rejects PID with only two components', () => {
    expect(BEAM_PID_PATTERN.test('pid:<0.42>')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(BEAM_PID_PATTERN.test('')).toBe(false);
  });
});

// ── BEAM_REF_PATTERN ──────────────────────────────────────────────────────────

describe('BEAM_REF_PATTERN', () => {
  it('matches minimal valid ref ref:<0.0.0.0>', () => {
    expect(BEAM_REF_PATTERN.test('ref:<0.0.0.0>')).toBe(true);
  });

  it('matches a real-world ref ref:<0.1.0.42>', () => {
    expect(BEAM_REF_PATTERN.test(VALID_REF)).toBe(true);
  });

  it('rejects ref missing the ref: prefix', () => {
    expect(BEAM_REF_PATTERN.test('<0.1.0.42>')).toBe(false);
  });

  it('rejects ref with only three components (PID-like)', () => {
    expect(BEAM_REF_PATTERN.test('ref:<0.1.42>')).toBe(false);
  });

  it('rejects ref with alphabetic component', () => {
    expect(BEAM_REF_PATTERN.test('ref:<0.x.0.42>')).toBe(false);
  });
});

// ── validateBeamMsg — valid round-trip ────────────────────────────────────────

describe('validateBeamMsg — valid messages', () => {
  it('returns a typed BeamMsg for a fully valid message', () => {
    const result = validateBeamMsg(VALID_BEAM_MSG);
    expect(result).not.toBeNull();
    expect(result!.tag).toBe('beam_msg');
    expect(result!.from).toBe(VALID_PID_A);
    expect(result!.to).toBe(VALID_PID_B);
    expect(result!.sent_at).toBe(NOW_ISO);
  });

  it('preserves the payload object exactly', () => {
    const result = validateBeamMsg(VALID_BEAM_MSG);
    expect(result!.payload).toEqual(VALID_BEAM_MSG.payload);
    expect(result!.payload['conformance']).toBe(0.95);
  });

  it('accepts payload without a type field (payload.type is optional)', () => {
    const msg = { ...VALID_BEAM_MSG, payload: { route_id: 'r-002' } };
    expect(validateBeamMsg(msg)).not.toBeNull();
  });

  it('accepts a deeply nested payload object', () => {
    const msg = {
      ...VALID_BEAM_MSG,
      payload: { nested: { deep: { value: 42 } } },
    };
    const result = validateBeamMsg(msg);
    expect(result).not.toBeNull();
    expect((result!.payload['nested'] as Record<string, unknown>)['deep']).toEqual({ value: 42 });
  });

  it('accepts any valid ISO-8601 date-time string in sent_at', () => {
    const variants = [
      '2026-05-18T10:00:00Z',
      '2026-05-18T10:00:00.000Z',
      '2026-05-18T10:00:00+05:30',
    ];
    for (const sent_at of variants) {
      const msg = { ...VALID_BEAM_MSG, sent_at };
      expect(validateBeamMsg(msg)).not.toBeNull();
    }
  });
});

// ── validateBeamMsg — missing / wrong fields ──────────────────────────────────

describe('validateBeamMsg — invalid messages return null', () => {
  it('returns null when tag is missing', () => {
    const { tag: _tag, ...noTag } = VALID_BEAM_MSG;
    expect(validateBeamMsg(noTag)).toBeNull();
  });

  it('returns null when tag is "beam_monitor" (wrong variant)', () => {
    const msg = { ...VALID_BEAM_MSG, tag: 'beam_monitor' };
    expect(validateBeamMsg(msg)).toBeNull();
  });

  it('returns null when tag is an arbitrary string', () => {
    const msg = { ...VALID_BEAM_MSG, tag: 'something_else' };
    expect(validateBeamMsg(msg)).toBeNull();
  });

  it('returns null when from is missing', () => {
    const { from: _from, ...noFrom } = VALID_BEAM_MSG;
    expect(validateBeamMsg(noFrom)).toBeNull();
  });

  it('returns null when from is a malformed PID (no pid: prefix)', () => {
    const msg = { ...VALID_BEAM_MSG, from: '<0.42.0>' };
    expect(validateBeamMsg(msg)).toBeNull();
  });

  it('returns null when to is a malformed PID (only two components)', () => {
    const msg = { ...VALID_BEAM_MSG, to: 'pid:<0.7>' };
    expect(validateBeamMsg(msg)).toBeNull();
  });

  it('returns null when payload is null', () => {
    const msg = { ...VALID_BEAM_MSG, payload: null };
    expect(validateBeamMsg(msg)).toBeNull();
  });

  it('returns null when payload is an array (not an object)', () => {
    const msg = { ...VALID_BEAM_MSG, payload: [{ type: 'route_eval' }] };
    expect(validateBeamMsg(msg)).toBeNull();
  });

  it('returns null when sent_at is missing', () => {
    const { sent_at: _s, ...noSentAt } = VALID_BEAM_MSG;
    expect(validateBeamMsg(noSentAt)).toBeNull();
  });

  it('returns null when sent_at is not a parseable date string', () => {
    const msg = { ...VALID_BEAM_MSG, sent_at: 'not-a-date' };
    expect(validateBeamMsg(msg)).toBeNull();
  });

  it('returns null when input is not an object (primitive)', () => {
    expect(validateBeamMsg('beam_msg')).toBeNull();
    expect(validateBeamMsg(42)).toBeNull();
    expect(validateBeamMsg(null)).toBeNull();
    expect(validateBeamMsg(undefined)).toBeNull();
  });
});

// ── validateBeamMonitor — valid round-trip ────────────────────────────────────

describe('validateBeamMonitor — valid messages', () => {
  it('returns a typed BeamMonitor for a fully valid DOWN event', () => {
    const result = validateBeamMonitor(VALID_BEAM_MONITOR);
    expect(result).not.toBeNull();
    expect(result!.tag).toBe('beam_monitor');
    expect(result!.ref).toBe(VALID_REF);
    expect(result!.event).toBe('DOWN');
    expect(result!.reason).toBe('normal');
    expect(result!.pid).toBe(VALID_PID_A);
    expect(result!.at).toBe(NOW_ISO);
  });

  it('accepts UP event', () => {
    const msg = { ...VALID_BEAM_MONITOR, event: 'UP' as const };
    const result = validateBeamMonitor(msg);
    expect(result).not.toBeNull();
    expect(result!.event).toBe('UP');
  });

  it('accepts EXIT event', () => {
    const msg = { ...VALID_BEAM_MONITOR, event: 'EXIT' as const };
    const result = validateBeamMonitor(msg);
    expect(result).not.toBeNull();
    expect(result!.event).toBe('EXIT');
  });

  it('accepts various reason strings (normal, noproc, killed, timeout)', () => {
    for (const reason of ['normal', 'noproc', 'killed', 'timeout', 'custom_reason_42']) {
      const msg = { ...VALID_BEAM_MONITOR, reason };
      expect(validateBeamMonitor(msg)).not.toBeNull();
    }
  });
});

// ── validateBeamMonitor — missing / wrong fields ──────────────────────────────

describe('validateBeamMonitor — invalid messages return null', () => {
  it('returns null when tag is "beam_msg" (wrong variant)', () => {
    const msg = { ...VALID_BEAM_MONITOR, tag: 'beam_msg' };
    expect(validateBeamMonitor(msg)).toBeNull();
  });

  it('returns null when ref is malformed (only 3 components, PID-like format)', () => {
    const msg = { ...VALID_BEAM_MONITOR, ref: 'ref:<0.1.42>' };
    expect(validateBeamMonitor(msg)).toBeNull();
  });

  it('returns null when event is not one of DOWN|UP|EXIT', () => {
    const msg = { ...VALID_BEAM_MONITOR, event: 'CRASH' };
    expect(validateBeamMonitor(msg)).toBeNull();
  });

  it('returns null when reason is empty string', () => {
    const msg = { ...VALID_BEAM_MONITOR, reason: '' };
    expect(validateBeamMonitor(msg)).toBeNull();
  });

  it('returns null when pid is malformed', () => {
    const msg = { ...VALID_BEAM_MONITOR, pid: '0.42.0' };
    expect(validateBeamMonitor(msg)).toBeNull();
  });

  it('returns null when at is missing', () => {
    const { at: _a, ...noAt } = VALID_BEAM_MONITOR;
    expect(validateBeamMonitor(noAt)).toBeNull();
  });
});

// ── parseBeamMessage ──────────────────────────────────────────────────────────

describe('parseBeamMessage — dispatch by tag', () => {
  it('returns a BeamMsg for a valid beam_msg JSON string', () => {
    const raw = JSON.stringify(VALID_BEAM_MSG);
    const result = parseBeamMessage(raw);
    expect(result).not.toBeNull();
    expect(result!.tag).toBe('beam_msg');
  });

  it('returns a BeamMonitor for a valid beam_monitor JSON string', () => {
    const raw = JSON.stringify(VALID_BEAM_MONITOR);
    const result = parseBeamMessage(raw);
    expect(result).not.toBeNull();
    expect(result!.tag).toBe('beam_monitor');
  });

  it('returns null for invalid JSON (no throw)', () => {
    expect(() => parseBeamMessage('not-json{')).not.toThrow();
    expect(parseBeamMessage('not-json{')).toBeNull();
  });

  it('returns null for an empty string (no throw)', () => {
    expect(() => parseBeamMessage('')).not.toThrow();
    expect(parseBeamMessage('')).toBeNull();
  });

  it('returns null for a JSON string that is a primitive (number)', () => {
    expect(parseBeamMessage('42')).toBeNull();
  });

  it('returns null for a JSON null value', () => {
    expect(parseBeamMessage('null')).toBeNull();
  });

  it('returns null for a JSON array root', () => {
    expect(parseBeamMessage('[{"tag":"beam_msg"}]')).toBeNull();
  });

  it('returns null when tag is an unknown value', () => {
    const raw = JSON.stringify({ tag: 'erlang_cast', data: 'something' });
    expect(parseBeamMessage(raw)).toBeNull();
  });

  it('returns null when tag is missing entirely', () => {
    const raw = JSON.stringify({ from: VALID_PID_A, to: VALID_PID_B });
    expect(parseBeamMessage(raw)).toBeNull();
  });

  it('dispatches beam_msg and preserves payload round-trip', () => {
    const payload = { type: 'route_eval', conformance: 0.87, route_id: 'r-999' };
    const original: BeamMsg = { ...VALID_BEAM_MSG, payload };
    const result = parseBeamMessage(JSON.stringify(original)) as BeamMsg;
    expect(result).not.toBeNull();
    expect(result.payload['conformance']).toBe(0.87);
    expect(result.payload['route_id']).toBe('r-999');
  });

  it('dispatches beam_monitor and preserves event and reason', () => {
    const monitor: BeamMonitor = { ...VALID_BEAM_MONITOR, event: 'EXIT', reason: 'killed' };
    const result = parseBeamMessage(JSON.stringify(monitor)) as BeamMonitor;
    expect(result).not.toBeNull();
    expect(result.event).toBe('EXIT');
    expect(result.reason).toBe('killed');
  });

  it('returns null for a valid beam_msg JSON with a malformed PID (validates, not just parses)', () => {
    const malformed = { ...VALID_BEAM_MSG, from: 'not-a-pid' };
    expect(parseBeamMessage(JSON.stringify(malformed))).toBeNull();
  });
});

// ── TypeScript discriminated union narrowing ──────────────────────────────────

describe('BeamMessage discriminated union (type narrowing)', () => {
  it('tag "beam_msg" narrows to BeamMsg with from/to/payload/sent_at fields', () => {
    const result: BeamMessage | null = parseBeamMessage(JSON.stringify(VALID_BEAM_MSG));
    expect(result).not.toBeNull();
    if (result!.tag === 'beam_msg') {
      // TypeScript should narrow here; these properties must exist at runtime too.
      expect(typeof result.from).toBe('string');
      expect(typeof result.to).toBe('string');
      expect(typeof result.sent_at).toBe('string');
      expect(isObject(result.payload)).toBe(true);
    } else {
      // Force failure if tag was not beam_msg
      expect(result!.tag).toBe('beam_msg');
    }
  });

  it('tag "beam_monitor" narrows to BeamMonitor with ref/event/reason/pid/at fields', () => {
    const result: BeamMessage | null = parseBeamMessage(JSON.stringify(VALID_BEAM_MONITOR));
    expect(result).not.toBeNull();
    if (result!.tag === 'beam_monitor') {
      expect(typeof result.ref).toBe('string');
      expect(['DOWN', 'UP', 'EXIT']).toContain(result.event);
      expect(typeof result.reason).toBe('string');
      expect(typeof result.pid).toBe('string');
      expect(typeof result.at).toBe('string');
    } else {
      expect(result!.tag).toBe('beam_monitor');
    }
  });
});

// ── Helper used in union narrowing tests ─────────────────────────────────────

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
