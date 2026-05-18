/**
 * Tests for toOcelLog() — the AtomVM→wpm-trace-conform adapter.
 *
 * Closes:
 *   GAP-3  (HIGH)  — AtomVM traces can now be fed into `wpm trace conform`
 *   GAP-4a (MEDIUM) — toOcelLog() was absent; now exported from atomvm-bridge.ts
 *   GAP-4c (LOW)   — numeric POSIX ms timestamps are normalised to ISO-8601
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  fromAtomVmJsonl,
  adaptAtomVmProcEvent,
  toOcelLog,
  type AtomVmProcEvent,
  type OcelLog,
  type OcelLogEvent,
  type OcelLogObject,
} from '../atomvm-bridge.js';

// ── fixtures ──────────────────────────────────────────────────────────────────

const THREE_PID_NDJSON = [
  JSON.stringify({ tag: 'atomvm_proc', pid: '<0.1.0>', event: 'spawn', module: 'app', function: 'start', arity: 0, ts: '2026-05-18T10:00:00Z' }),
  JSON.stringify({ tag: 'atomvm_proc', pid: '<0.1.0>', event: 'running', scheduler: 0, ts: '2026-05-18T10:00:01Z' }),
  JSON.stringify({ tag: 'atomvm_proc', pid: '<0.1.0>', event: 'exit', reason: 'normal', duration_ms: 1000, ts: '2026-05-18T10:00:02Z' }),
  JSON.stringify({ tag: 'atomvm_proc', pid: '<0.2.0>', event: 'spawn', ts: '2026-05-18T10:00:01Z' }),
  JSON.stringify({ tag: 'atomvm_proc', pid: '<0.2.0>', event: 'crash', reason: 'badarg', mfa: 'lists:nth/2', ts: '2026-05-18T10:00:03Z' }),
  JSON.stringify({ tag: 'atomvm_proc', pid: '<0.3.0>', event: 'spawn', ts: '2026-05-18T10:00:02Z' }),
  JSON.stringify({ tag: 'atomvm_proc', pid: '<0.3.0>', event: 'waiting', reason: 'receive', ts: '2026-05-18T10:00:04Z' }),
  JSON.stringify({ tag: 'atomvm_proc', pid: '<0.3.0>', event: 'exit', reason: 'normal', ts: '2026-05-18T10:00:05Z' }),
].join('\n');

// ── Test 1: Round-trip shape ───────────────────────────────────────────────────

describe('toOcelLog(): round-trip — fromAtomVmJsonl → toOcelLog → OcelLog shape', () => {
  it('produces a valid OcelLog with all required top-level keys', () => {
    const events = fromAtomVmJsonl(THREE_PID_NDJSON);
    const log: OcelLog = toOcelLog(events);

    expect(log).toHaveProperty('ocel_version', '2.0');
    expect(log).toHaveProperty('ocel_global_log');
    expect(log.ocel_global_log).toHaveProperty('ocel_attribute_names');
    expect(Array.isArray(log.ocel_global_log.ocel_attribute_names)).toBe(true);
    expect(log).toHaveProperty('ocel_events');
    expect(log).toHaveProperty('ocel_objects');
    expect(Array.isArray(log.ocel_events)).toBe(true);
    expect(Array.isArray(log.ocel_objects)).toBe(true);
  });

  it('each ocel_event has the fields expected by wpm trace conform', () => {
    const events = fromAtomVmJsonl(THREE_PID_NDJSON);
    const log = toOcelLog(events);

    for (const ev of log.ocel_events) {
      expect(typeof ev.event_id).toBe('string');
      expect(ev.event_id.length).toBeGreaterThan(0);
      expect(typeof ev.activity).toBe('string');
      expect(ev.activity.length).toBeGreaterThan(0);
      expect(typeof ev.timestamp).toBe('string');
      expect(ev.timestamp.length).toBeGreaterThan(0);
      expect(Array.isArray(ev.objects)).toBe(true);
      expect(typeof ev.attributes).toBe('object');
    }
  });

  it('event count matches the number of input OcelEvents', () => {
    const events = fromAtomVmJsonl(THREE_PID_NDJSON);
    const log = toOcelLog(events);
    expect(log.ocel_events).toHaveLength(events.length);
  });

  it('activity names are preserved as atomvm_proc.<event>', () => {
    const events = fromAtomVmJsonl(THREE_PID_NDJSON);
    const log = toOcelLog(events);
    const activities = log.ocel_events.map((e) => e.activity);
    expect(activities).toContain('atomvm_proc.spawn');
    expect(activities).toContain('atomvm_proc.running');
    expect(activities).toContain('atomvm_proc.exit');
    expect(activities).toContain('atomvm_proc.crash');
    expect(activities).toContain('atomvm_proc.waiting');
  });
});

// ── Test 2: Timestamp conversion (GAP-4c) ────────────────────────────────────

describe('toOcelLog(): GAP-4c — numeric POSIX timestamps converted to ISO-8601', () => {
  it('numeric string timestamps are converted to ISO-8601', () => {
    const evt: AtomVmProcEvent = {
      tag: 'atomvm_proc',
      pid: '<0.1.0>',
      event: 'spawn',
      ts: '1716026400000', // POSIX ms as string — NOT ISO-8601
    };
    const ocelEvt = adaptAtomVmProcEvent(evt);
    const log = toOcelLog([ocelEvt]);
    // Must be ISO-8601, not a raw digit string
    const ts = log.ocel_events[0]!.timestamp;
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(ts).not.toMatch(/^\d+$/);
    // Must round-trip correctly through Date
    expect(new Date(ts).getTime()).toBe(1716026400000);
  });

  it('ISO-8601 timestamps are preserved unchanged', () => {
    const evt: AtomVmProcEvent = {
      tag: 'atomvm_proc',
      pid: '<0.1.0>',
      event: 'running',
      ts: '2026-05-18T10:00:00Z',
    };
    const ocelEvt = adaptAtomVmProcEvent(evt);
    const log = toOcelLog([ocelEvt]);
    expect(log.ocel_events[0]!.timestamp).toBe('2026-05-18T10:00:00Z');
  });
});

// ── Test 3: Object deduplication ─────────────────────────────────────────────

describe('toOcelLog(): object deduplication — 3 events from same PID → 1 object', () => {
  it('same PID across multiple events produces exactly one object entry', () => {
    const ndjson = [
      JSON.stringify({ tag: 'atomvm_proc', pid: '<0.5.0>', event: 'spawn', ts: '2026-05-18T10:00:00Z' }),
      JSON.stringify({ tag: 'atomvm_proc', pid: '<0.5.0>', event: 'running', ts: '2026-05-18T10:00:01Z' }),
      JSON.stringify({ tag: 'atomvm_proc', pid: '<0.5.0>', event: 'exit', reason: 'normal', ts: '2026-05-18T10:00:02Z' }),
    ].join('\n');

    const events = fromAtomVmJsonl(ndjson);
    const log = toOcelLog(events);

    // 3 events from 1 PID → 1 object
    expect(log.ocel_events).toHaveLength(3);
    expect(log.ocel_objects).toHaveLength(1);
    expect(log.ocel_objects[0]!.id).toBe('<0.5.0>');
  });

  it('3 distinct PIDs produce 3 object entries', () => {
    const events = fromAtomVmJsonl(THREE_PID_NDJSON);
    const log = toOcelLog(events);
    // THREE_PID_NDJSON has PIDs: <0.1.0>, <0.2.0>, <0.3.0>
    expect(log.ocel_objects).toHaveLength(3);
    const ids = log.ocel_objects.map((o) => o.id);
    expect(ids).toContain('<0.1.0>');
    expect(ids).toContain('<0.2.0>');
    expect(ids).toContain('<0.3.0>');
  });

  it('all objects have type "atomvm_process"', () => {
    const events = fromAtomVmJsonl(THREE_PID_NDJSON);
    const log = toOcelLog(events);
    for (const obj of log.ocel_objects) {
      expect(obj.type).toBe('atomvm_process');
    }
  });
});

// ── Test 4: Activity mapping ──────────────────────────────────────────────────

describe('toOcelLog(): activity mapping — event field → atomvm_proc.<event>', () => {
  it('maps event:"spawn" → activity:"atomvm_proc.spawn"', () => {
    const evt: AtomVmProcEvent = {
      tag: 'atomvm_proc', pid: '<0.1.0>', event: 'spawn', ts: '2026-05-18T10:00:00Z',
    };
    const log = toOcelLog([adaptAtomVmProcEvent(evt)]);
    expect(log.ocel_events[0]!.activity).toBe('atomvm_proc.spawn');
  });

  it('maps event:"crash" → activity:"atomvm_proc.crash"', () => {
    const evt: AtomVmProcEvent = {
      tag: 'atomvm_proc', pid: '<0.1.0>', event: 'crash', reason: 'badarg', ts: '2026-05-18T10:00:00Z',
    };
    const log = toOcelLog([adaptAtomVmProcEvent(evt)]);
    expect(log.ocel_events[0]!.activity).toBe('atomvm_proc.crash');
  });
});

// ── Test 5: Empty input ───────────────────────────────────────────────────────

describe('toOcelLog(): empty input returns valid empty OcelLog', () => {
  it('toOcelLog([]) returns a structurally valid OcelLog with no events or objects', () => {
    const log = toOcelLog([]);
    expect(log.ocel_version).toBe('2.0');
    expect(log.ocel_global_log).toEqual({ ocel_attribute_names: [] });
    expect(log.ocel_events).toEqual([]);
    expect(log.ocel_objects).toEqual([]);
  });
});

// ── Test 6: Crash events in ocel_events ──────────────────────────────────────

describe('toOcelLog(): crash events appear in ocel_events with correct type', () => {
  it('crash event is included and has activity "atomvm_proc.crash"', () => {
    const ndjson = [
      JSON.stringify({ tag: 'atomvm_proc', pid: '<0.9.0>', event: 'spawn', ts: '2026-05-18T10:00:00Z' }),
      JSON.stringify({ tag: 'atomvm_proc', pid: '<0.9.0>', event: 'crash', reason: 'noproc', mfa: 'gen_server:call/2', ts: '2026-05-18T10:00:01Z' }),
    ].join('\n');

    const events = fromAtomVmJsonl(ndjson);
    const log = toOcelLog(events);

    const crashEvents = log.ocel_events.filter((e) => e.activity === 'atomvm_proc.crash');
    expect(crashEvents).toHaveLength(1);
    // crash event should reference the crashed PID as an object
    expect(crashEvents[0]!.objects.some((o) => o.id === '<0.9.0>')).toBe(true);
    // vmap attributes are preserved
    expect(crashEvents[0]!.attributes).toMatchObject({ reason: 'noproc' });
  });
});

// ── Test 7: wpm trace conform integration ─────────────────────────────────────

describe('toOcelLog(): wpm trace conform integration', () => {
  it('wpm trace conform accepts OcelLog output and exits 0 or 3 (not a parse crash)', () => {
    // Build an OcelLog with activities that match the ai-code-review route
    // (lint → type_check → run_tests → summarize → emit_receipt)
    // We do not guarantee Accepted (fitness=1.0 requires all required_stages),
    // but we do guarantee the file is parseable — exit 0 OR 3 proves no parse crash.
    const ndjson = [
      JSON.stringify({ tag: 'atomvm_proc', pid: '<0.10.0>', event: 'spawn', ts: '2026-05-18T10:00:00Z' }),
      JSON.stringify({ tag: 'atomvm_proc', pid: '<0.10.0>', event: 'running', ts: '2026-05-18T10:00:01Z' }),
      JSON.stringify({ tag: 'atomvm_proc', pid: '<0.10.0>', event: 'exit', reason: 'normal', ts: '2026-05-18T10:00:02Z' }),
    ].join('\n');

    const events = fromAtomVmJsonl(ndjson);
    const log = toOcelLog(events);

    // Write OCEL log to a temp file
    const tmpDir = mkdtempSync(join(tmpdir(), 'atomvm-ocel-test-'));
    const ocelPath = join(tmpDir, 'atomvm.ocel.json');
    writeFileSync(ocelPath, JSON.stringify(log), 'utf8');

    // Pick a simple route model that ships with wasm4pm
    const modelPath = '/Users/sac/wasm4pm/routes/ai-code-review.powl.json';
    const cliPath = '/Users/sac/wasm4pm/apps/wasm4pm/dist/cli.js';

    try {
      execSync(`node ${cliPath} trace conform -m ${modelPath} -i ${ocelPath} --format json`, {
        encoding: 'utf8',
        timeout: 15_000,
      });
      // Exit 0 = Accepted — valid conformance
    } catch (err: unknown) {
      // Exit 3 = AndonPull — structurally parseable but conformance < 1.0
      // Exit 1 = config_error, Exit 2 = source_error — these would indicate a parse failure
      const exitCode = (err as { status?: number }).status ?? 99;
      // Any exit except 1 (config error) or 2 (source/parse error) is acceptable:
      // exit 3 means the OCEL was parsed and conformance was measured (just not 1.0)
      expect([0, 3]).toContain(exitCode);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('toOcelLog JSON output has the correct structure for wpm trace conform', () => {
    // Verify the JSON we write to disk is parseable as OcelLog by checking field names
    const events = fromAtomVmJsonl(THREE_PID_NDJSON);
    const log = toOcelLog(events);
    const json = JSON.stringify(log);
    const parsed = JSON.parse(json) as Record<string, unknown>;

    // These are the exact keys wpm trace conform uses (trace.ts OcelLog interface)
    expect(parsed).toHaveProperty('ocel_version');
    expect(parsed).toHaveProperty('ocel_global_log');
    expect(parsed).toHaveProperty('ocel_events');
    expect(parsed).toHaveProperty('ocel_objects');
    // Must NOT have WASM format keys or IEEE prefix keys
    expect(parsed).not.toHaveProperty('events');
    expect(parsed).not.toHaveProperty('objects');
    expect(parsed).not.toHaveProperty('ocel:events');
    expect(parsed).not.toHaveProperty('ocel:objects');
  });
});

// ── Test 8: ocel_global_log attribute names ───────────────────────────────────

describe('toOcelLog(): ocel_global_log.ocel_attribute_names collects vmap keys', () => {
  it('attribute names include keys from vmap of all events', () => {
    const ndjson = [
      JSON.stringify({ tag: 'atomvm_proc', pid: '<0.1.0>', event: 'spawn', module: 'app', function: 'start', arity: 0, ts: '2026-05-18T10:00:00Z' }),
      JSON.stringify({ tag: 'atomvm_proc', pid: '<0.1.0>', event: 'exit', reason: 'normal', duration_ms: 500, ts: '2026-05-18T10:00:01Z' }),
    ].join('\n');

    const events = fromAtomVmJsonl(ndjson);
    const log = toOcelLog(events);

    // spawn puts 'mfa' in vmap; exit puts 'reason', 'duration_ms'
    const names = log.ocel_global_log.ocel_attribute_names;
    expect(names).toContain('mfa');
    expect(names).toContain('reason');
    expect(names).toContain('duration_ms');
  });
});
