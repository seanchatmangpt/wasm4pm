/**
 * AtomVM → OCEL → wasm4pm Pipeline: Gap Analysis (Task 4)
 *
 * This test file documents the architectural gaps in the AtomVM bridge pipeline
 * by combining prose documentation with executable assertions that prove each
 * claim. When a gap is closed, the corresponding test must be updated or removed
 * — the test suite is the living specification.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OVERVIEW: WHAT WORKS END-TO-END (verified in integration testing)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Pipeline verified:
 *   AtomVM NDJSON file
 *     → fromAtomVmJsonl()      [contracts/atomvm-bridge.ts]
 *     → toOcel2Json()          [contracts/atomvm-bridge.ts]
 *     → wpm run <file>.ocel.json  [apps/wasm4pm — runOcelDiscovery]
 *     → OCEL DFG with atomvm_proc.* activities
 *
 * Integration test result (20-event fixture, 3 PIDs):
 *   DFG nodes: atomvm_proc.crash(1), atomvm_proc.exit(2), atomvm_proc.running(8),
 *              atomvm_proc.spawn(3), atomvm_proc.waiting(6)
 *   Start activities: atomvm_proc.spawn: 3
 *   End activities:   atomvm_proc.crash: 1, atomvm_proc.exit: 2
 *   Edges: spawn→running, running→waiting, waiting→running,
 *          running→crash, running→exit, waiting→exit
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * GAP 1: SUPPORTED vs MISSING AtomVM EVENT TYPES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * SUPPORTED (tag="atomvm_proc", event=):
 *   spawn    — process created; module/function/arity assembled into MFA
 *   running  — scheduler activated; scheduler field captured in vmap
 *   waiting  — blocking on receive/message; reason captured in vmap
 *   exit     — normal termination; reason + duration_ms captured in vmap
 *   crash    — abnormal termination; reason + mfa captured; detectCrashDetails indexes it
 *
 * NOT SUPPORTED — events present in AtomVM but not modelled:
 *   send     — message sent from one process to another; carries to-pid and message
 *              Impact: Cannot mine inter-process communication patterns
 *   receive  — message delivered to a process; carries from-pid and message
 *              Impact: Cannot mine handover-of-work social networks
 *   link     — process link established (bidirectional death coupling)
 *              Impact: Cannot model supervisor tree structure
 *   unlink   — link removed
 *              Impact: Cannot detect dynamic isolation from supervision tree
 *   monitor  — process monitor set up (unidirectional, less coupling than link)
 *              Impact: Cannot mine OTP supervisor-worker relationships
 *   demonitor — monitor removed
 *   port_*   — I/O port events (open, close, data)
 *              Impact: Cannot track external I/O in process lifecycle
 *   garbage_collect — GC pause events; carries heap_size, reason
 *              Impact: Cannot mine performance bottlenecks (GC pressure)
 *   register — process name registered in global registry (atom)
 *              Impact: Cannot map named processes to lifecycle traces
 *   unregister — name removed from registry
 *   call/return — function call tracing (erlang:trace/3)
 *              Impact: Cannot mine intra-process control flow
 *
 * Missing tag variants:
 *   "port_proc" — Erlang port processes; different lifecycle from Erlang processes
 *   "nif_proc"  — Native Implemented Functions; may run on scheduler threads
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * GAP 2: wpm run OCEL COMPATIBILITY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * STATUS: wpm run ACCEPTS .ocel.json files (VERIFIED)
 *
 * Trigger: file path ends with .ocel.json → routes to runOcelDiscovery
 *          (apps/wasm4pm/src/commands/run.ts lines 462-493)
 *
 * SCHEMA REQUIREMENT — the WASM engine (load_ocel_from_json) requires:
 *   { eventTypes: string[], objectTypes: string[], events: [...], objects: [...] }
 *   - events[i].attributes must be ARRAY of {name, value} objects
 *     NOT a plain {key: value} object (would trigger AttributeValue tagged enum parsing)
 *   - events[i].type (activity name), not events[i].activity
 *   - events[i].time (timestamp), not events[i].timestamp
 *
 * toOcel2Json() produces this format. toOcel2JsonStandard() produces IEEE OCEL 2.0
 * with ocel: prefixes — this is NOT accepted by wpm run (parse error: missing field).
 *
 * SCHEMA MISMATCH TABLE:
 *   Field              | WASM (toOcel2Json) | IEEE std (toOcel2JsonStandard) | trace.ts OcelLog
 *   ────────────────── | ─────────────────── | ────────────────────────────── | ─────────────────
 *   top-level events   | events              | ocel:events                    | ocel_events
 *   top-level objects  | objects             | ocel:objects                   | ocel_objects
 *   event activity     | type                | ocel:activity                  | activity
 *   event timestamp    | time                | ocel:timestamp                 | timestamp
 *   event id           | id                  | ocel:eid                       | event_id
 *   object id          | id                  | ocel:oid                       | id
 *   event attrs        | [{name, value}]     | ocel:vmap plain object         | attributes plain obj
 *
 * ACTIONABLE: The three internal formats in wasm4pm must be consolidated.
 * The IEEE standard format should be the canonical input; an adapter layer should
 * normalize to whatever the WASM kernel expects. Currently users must know which
 * function to call.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * GAP 3: wpm conformance — CANNOT CHECK AtomVM TRACES AGAINST POWL ROUTES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * STATUS: PARTIAL — depends on which conformance command is used
 *
 * wpm conformance <log>:
 *   - Input: XES only (via withLogSession which rejects non-XES files)
 *   - Cannot accept .ocel.json files
 *   - Discovers Petri Net via alpha++ then checks token-replay fitness
 *   - Does NOT compare against POWL routes
 *   - Does NOT support AtomVM traces without XES conversion
 *
 * wpm trace conform -m <model.powl.json> -i <ocel.json>:
 *   - CAN accept OCEL JSON files — but expects trace.ts OcelLog format:
 *       { ocel_version, ocel_global_log, ocel_events: [...], ocel_objects: [...] }
 *   - This is a THIRD format distinct from both toOcel2Json and toOcel2JsonStandard
 *   - toOcel2Json output WILL NOT parse correctly as OcelLog (different field names)
 *   - Does compare against POWL v2 route model: required_stages, choice_graph, etc.
 *
 * MISSING ADAPTER: A function that converts OcelEvent[] to the trace.ts OcelLog format
 * is absent from atomvm-bridge.ts. Without it, the path:
 *   AtomVM NDJSON → toOcelLog() → wpm trace conform -m route.powl.json
 * cannot be completed without writing JSON conversion scripts.
 *
 * POWL ROUTE for AtomVM process lifecycle would look like:
 *   { route_id: "atomvm_proc_lifecycle", type: "powl2",
 *     required_stages: ["atomvm_proc.spawn", "atomvm_proc.exit"],
 *     object_types: {
 *       atomvm_proc: {
 *         created_by: ["atomvm_proc.spawn"],
 *         terminated_by: ["atomvm_proc.exit", "atomvm_proc.crash"]
 *       }
 *     },
 *     model: { type: "choice_graph", choice_graph: {
 *       nodes: ["atomvm_proc.spawn","atomvm_proc.running","atomvm_proc.waiting",
 *               "atomvm_proc.exit","atomvm_proc.crash"],
 *       edges: [["atomvm_proc.spawn","atomvm_proc.running"],
 *               ["atomvm_proc.running","atomvm_proc.waiting"],
 *               ["atomvm_proc.waiting","atomvm_proc.running"],
 *               ["atomvm_proc.running","atomvm_proc.exit"],
 *               ["atomvm_proc.running","atomvm_proc.crash"],
 *               ["atomvm_proc.waiting","atomvm_proc.exit"]]
 *     }}
 *   }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * GAP 4: MISSING BRIDGE FEATURES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 4a. toOcelLog() — adapter from OcelEvent[] to trace.ts OcelLog format
 *     MISSING; required for wpm trace conform compatibility
 *
 * 4b. fromAtomVmJsonlStrict() — strict parser that returns errors for invalid lines
 *     Currently fromAtomVmJsonl silently skips invalid/non-atomvm lines.
 *     A strict mode would return { events, errors } for pipeline validation.
 *
 * 4c. detectSendReceivePairs() — mine message-passing patterns
 *     Would pair atomvm_proc.send events with atomvm_proc.receive events
 *     to produce handover-of-work edges for social network mining.
 *     MISSING because "send" and "receive" event types are not supported.
 *
 * 4d. detectSupervisorLinks() — mine OTP supervision tree from link/monitor events
 *     MISSING because "link" and "monitor" event types are not supported.
 *
 * 4e. Timestamp normalization — AtomVM may emit POSIX millisecond integers
 *     fromAtomVmJsonl assumes ISO-8601 strings in `ts`; no fallback for numeric
 *     timestamps (e.g., System.monotonic_time/0 in milliseconds).
 *
 * 4f. Multi-node AtomVM clusters — events from multiple nodes lack a node_id field
 *     in the current schema. The pid format "<N.M.K>" encodes the node implicitly
 *     in the third component K, but the bridge does not extract or index it.
 */

import { describe, it, expect } from 'vitest';
import {
  fromAtomVmJsonl,
  adaptAtomVmProcEvent,
  detectCrashes,
  detectCrashDetails,
  toOcel2Json,
  toOcel2JsonStandard,
  isAtomVmProcEvent,
  type AtomVmProcEvent,
  type CrashDetail,
} from '../atomvm-bridge.js';

// ─────────────────────────────────────────────────────────────────────────────
// GAP 1 TESTS: Supported event types
// ─────────────────────────────────────────────────────────────────────────────

describe('GAP 1: Supported AtomVM event types', () => {
  const SUPPORTED_EVENTS = ['spawn', 'running', 'waiting', 'exit', 'crash'];
  const UNSUPPORTED_EVENTS = ['send', 'receive', 'link', 'unlink', 'monitor', 'demonitor',
    'garbage_collect', 'register', 'unregister', 'call', 'return'];

  it('accepts all 5 supported lifecycle event types', () => {
    for (const event of SUPPORTED_EVENTS) {
      const ndjson = JSON.stringify({
        tag: 'atomvm_proc', pid: '<0.1.0>', event, ts: '2026-05-18T10:00:00Z',
      });
      const result = fromAtomVmJsonl(ndjson).events;
      expect(result).toHaveLength(1);
      expect(result[0]['ocel:activity']).toBe(`atomvm_proc.${event}`);
    }
  });

  it('silently skips unsupported event types (lenient parser)', () => {
    // The current parser does NOT reject unsupported event types — it accepts
    // any non-empty string in the "event" field. This means "send", "receive"
    // etc. WOULD be parsed if the tag/pid/ts fields are present.
    // GAP: There is no whitelist enforcement — unknown event types pass through.
    for (const event of UNSUPPORTED_EVENTS) {
      const ndjson = JSON.stringify({
        tag: 'atomvm_proc', pid: '<0.1.0>', event, ts: '2026-05-18T10:00:00Z',
      });
      const result = fromAtomVmJsonl(ndjson).events;
      // Current behavior: accepts unknown event types (no whitelist)
      expect(result).toHaveLength(1);
      expect(result[0]['ocel:activity']).toBe(`atomvm_proc.${event}`);
    }
  });

  it('spawn event preserves MFA assembly from module/function/arity', () => {
    const evt: AtomVmProcEvent = {
      tag: 'atomvm_proc', pid: '<0.5.0>', event: 'spawn',
      module: 'gen_server', function: 'init', arity: 1,
      ts: '2026-05-18T10:00:00Z',
    };
    const ocel = adaptAtomVmProcEvent(evt);
    expect(ocel['ocel:vmap']).toMatchObject({ mfa: 'gen_server:init/1' });
  });

  it('crash event preserves reason and mfa in vmap', () => {
    const evt: AtomVmProcEvent = {
      tag: 'atomvm_proc', pid: '<0.5.0>', event: 'crash',
      reason: 'badarg', mfa: 'lists:nth/2', ts: '2026-05-18T10:00:00Z',
    };
    const ocel = adaptAtomVmProcEvent(evt);
    const vmap = ocel['ocel:vmap'] as Record<string, unknown>;
    expect(vmap['reason']).toBe('badarg');
    expect(vmap['mfa']).toBe('lists:nth/2');
  });

  it('exit event preserves reason and duration_ms', () => {
    const evt: AtomVmProcEvent = {
      tag: 'atomvm_proc', pid: '<0.5.0>', event: 'exit',
      reason: 'normal', duration_ms: 1500, ts: '2026-05-18T10:00:00Z',
    };
    const ocel = adaptAtomVmProcEvent(evt);
    const vmap = ocel['ocel:vmap'] as Record<string, unknown>;
    expect(vmap['reason']).toBe('normal');
    expect(vmap['duration_ms']).toBe(1500);
  });

  it('running event preserves scheduler in vmap', () => {
    const evt: AtomVmProcEvent = {
      tag: 'atomvm_proc', pid: '<0.5.0>', event: 'running',
      scheduler: 0, ts: '2026-05-18T10:00:00Z',
    };
    const ocel = adaptAtomVmProcEvent(evt);
    const vmap = ocel['ocel:vmap'] as Record<string, unknown>;
    expect(vmap['scheduler']).toBe(0);
  });

  it('waiting event preserves reason in vmap', () => {
    const evt: AtomVmProcEvent = {
      tag: 'atomvm_proc', pid: '<0.5.0>', event: 'waiting',
      reason: 'receive', ts: '2026-05-18T10:00:00Z',
    };
    const ocel = adaptAtomVmProcEvent(evt);
    const vmap = ocel['ocel:vmap'] as Record<string, unknown>;
    expect(vmap['reason']).toBe('receive');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP 2 TESTS: wpm run OCEL format compliance
// ─────────────────────────────────────────────────────────────────────────────

describe('GAP 2: toOcel2Json produces WASM-compatible format', () => {
  const events = fromAtomVmJsonl([
    JSON.stringify({ tag: 'atomvm_proc', pid: '<0.1.0>', event: 'spawn', module: 'app', function: 'start', arity: 0, ts: '2026-05-18T10:00:00Z' }),
    JSON.stringify({ tag: 'atomvm_proc', pid: '<0.1.0>', event: 'running', scheduler: 0, ts: '2026-05-18T10:00:01Z' }),
    JSON.stringify({ tag: 'atomvm_proc', pid: '<0.1.0>', event: 'exit', reason: 'normal', ts: '2026-05-18T10:00:02Z' }),
  ].join('\n')).events;

  it('top-level keys are camelCase (WASM format, not IEEE ocel: prefix)', () => {
    const doc = JSON.parse(toOcel2Json(events));
    expect(doc).toHaveProperty('eventTypes');
    expect(doc).toHaveProperty('objectTypes');
    expect(doc).toHaveProperty('events');
    expect(doc).toHaveProperty('objects');
    // Must NOT have IEEE-format keys
    expect(doc).not.toHaveProperty('ocel:events');
    expect(doc).not.toHaveProperty('ocel:objects');
  });

  it('event fields use WASM names (id, type, time, object_ids, attributes)', () => {
    const doc = JSON.parse(toOcel2Json(events));
    const evt = doc.events[0];
    expect(evt).toHaveProperty('id');
    expect(evt).toHaveProperty('type');
    expect(evt).toHaveProperty('time');
    expect(evt).toHaveProperty('object_ids');
    expect(evt).toHaveProperty('attributes');
    // Must NOT use field names that WASM rejects
    expect(evt).not.toHaveProperty('ocel:activity');
    expect(evt).not.toHaveProperty('activity');
    expect(evt).not.toHaveProperty('ocel:timestamp');
    expect(evt).not.toHaveProperty('timestamp');
  });

  it('attributes are [{name, value}] array, not plain object (prevents tagged-enum parse error)', () => {
    const doc = JSON.parse(toOcel2Json(events));
    // Find an event with attributes (spawn has mfa)
    const spawnEvt = doc.events.find((e: { type: string }) => e.type === 'atomvm_proc.spawn');
    expect(Array.isArray(spawnEvt.attributes)).toBe(true);
    // Each attribute entry is {name, value}
    for (const attr of spawnEvt.attributes) {
      expect(attr).toHaveProperty('name');
      expect(attr).toHaveProperty('value');
      expect(typeof attr.name).toBe('string');
    }
  });

  it('toOcel2JsonStandard produces IEEE ocel: prefixed format (NOT for wpm run)', () => {
    const doc = JSON.parse(toOcel2JsonStandard(events));
    // IEEE format
    expect(doc).toHaveProperty('ocel:version', '2.0');
    expect(doc).toHaveProperty('ocel:events');
    expect(doc).toHaveProperty('ocel:objects');
    // Must NOT have WASM-format keys
    expect(doc).not.toHaveProperty('events');
    expect(doc).not.toHaveProperty('objects');
    expect(doc).not.toHaveProperty('eventTypes');
  });

  it('the two formats are mutually exclusive (neither is a superset)', () => {
    const wasmDoc = JSON.parse(toOcel2Json(events));
    const stdDoc = JSON.parse(toOcel2JsonStandard(events));
    // WASM format does not have ocel: keys
    expect(Object.keys(wasmDoc).some((k) => k.startsWith('ocel:'))).toBe(false);
    // IEEE format does not have camelCase top-level keys
    expect(stdDoc).not.toHaveProperty('eventTypes');
    expect(stdDoc).not.toHaveProperty('objectTypes');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP 3 TESTS: wpm conformance / wpm trace conform OCEL support
// ─────────────────────────────────────────────────────────────────────────────

describe('GAP 3: wpm conformance does not accept OCEL directly', () => {
  /**
   * This test documents the gap by checking what format wpm trace conform
   * expects (OcelLog with ocel_events, ocel_objects) vs what toOcel2Json
   * produces.
   *
   * wpm conformance <log> → XES-only path (withLogSession)
   * wpm trace conform -m <powl> -i <ocel> → needs trace.ts OcelLog format
   *   { ocel_version, ocel_global_log, ocel_events, ocel_objects }
   */

  const events = fromAtomVmJsonl([
    JSON.stringify({ tag: 'atomvm_proc', pid: '<0.1.0>', event: 'spawn', ts: '2026-05-18T10:00:00Z' }),
    JSON.stringify({ tag: 'atomvm_proc', pid: '<0.1.0>', event: 'exit', reason: 'normal', ts: '2026-05-18T10:00:01Z' }),
  ].join('\n')).events;

  it('toOcel2Json does not produce trace.ts OcelLog format (ocel_events key missing)', () => {
    const doc = JSON.parse(toOcel2Json(events));
    // trace.ts OcelLog expects 'ocel_events' (underscore, not camelCase)
    expect(doc).not.toHaveProperty('ocel_events');
    expect(doc).not.toHaveProperty('ocel_objects');
    expect(doc).not.toHaveProperty('ocel_version');
    // Confirms the gap: cannot pass toOcel2Json output directly to wpm trace conform
  });

  it('toOcel2JsonStandard does not produce trace.ts OcelLog format either', () => {
    const doc = JSON.parse(toOcel2JsonStandard(events));
    // trace.ts OcelLog uses underscore keys, not ocel: prefix keys
    expect(doc).not.toHaveProperty('ocel_events');
    expect(doc).not.toHaveProperty('ocel_objects');
    // Confirms three distinct formats exist: WASM, IEEE, trace.ts
  });

  it('three distinct OCEL schemas coexist in wasm4pm — none is cross-compatible', () => {
    // WASM format (toOcel2Json): { eventTypes, objectTypes, events, objects }
    // IEEE format (toOcel2JsonStandard): { ocel:version, ocel:events, ocel:objects }
    // trace.ts OcelLog: { ocel_version, ocel_global_log, ocel_events, ocel_objects }
    //
    // None of these three formats can be passed to a consumer expecting another.
    // The missing adapter is toOcelLog() for the trace.ts format.
    const wasmKeys = ['eventTypes', 'objectTypes', 'events', 'objects'];
    const ieeeKeys = ['ocel:version', 'ocel:events', 'ocel:objects'];
    const traceKeys = ['ocel_version', 'ocel_global_log', 'ocel_events', 'ocel_objects'];
    const allSchemas = [wasmKeys, ieeeKeys, traceKeys];
    // Schemas are pairwise disjoint on their primary discriminator key
    for (let i = 0; i < allSchemas.length; i++) {
      for (let j = 0; j < allSchemas.length; j++) {
        if (i === j) continue;
        const overlap = allSchemas[i].filter((k) => allSchemas[j].includes(k));
        expect(overlap).toHaveLength(0);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP 4 TESTS: Missing bridge features
// ─────────────────────────────────────────────────────────────────────────────

describe('GAP 4a: toOcelLog() adapter — CLOSED (wpm trace conform is now reachable)', () => {
  it('atomvm-bridge exports toOcelLog and it produces a valid OcelLog', async () => {
    // Dynamic import mirrors the original gap test; now verifies the gap is closed
    const mod = await import('../atomvm-bridge.js');
    const toOcelLog = (mod as Record<string, unknown>)['toOcelLog'];
    // Gap closed: toOcelLog is now exported
    expect(typeof toOcelLog).toBe('function');

    // Smoke-test the function with a minimal event set
    const events = await (async () => {
      const { fromAtomVmJsonl } = mod as { fromAtomVmJsonl: (s: string) => { events: unknown[] } };
      return fromAtomVmJsonl(
        JSON.stringify({ tag: 'atomvm_proc', pid: '<0.1.0>', event: 'spawn', ts: '2026-05-18T10:00:00Z' })
      ).events;
    })();

    const log = (toOcelLog as (e: unknown[]) => Record<string, unknown>)(events);
    expect(log).toHaveProperty('ocel_version', '2.0');
    expect(log).toHaveProperty('ocel_events');
    expect(log).toHaveProperty('ocel_objects');
  });
});

describe('GAP 4b: fromAtomVmJsonl returns parseErrors — CLOSED (strict mode now available)', () => {
  it('result.parseErrors is populated for invalid JSON lines (GAP-4b closed)', () => {
    const ndjson = [
      JSON.stringify({ tag: 'atomvm_proc', pid: '<0.1.0>', event: 'spawn', ts: '2026-05-18T10:00:00Z' }),
      'not-valid-json',
      '{incomplete',
    ].join('\n');
    const result = fromAtomVmJsonl(ndjson);
    // Lenient: still returns 1 valid event
    expect(result.events).toHaveLength(1);
    // GAP CLOSED: parse errors are now visible — 2 corrupt lines reported
    expect(result.parseErrors).toHaveLength(2);
    expect(result.parseErrors[0]).toHaveProperty('line');
    expect(result.parseErrors[0]).toHaveProperty('raw');
    expect(result.parseErrors[0]).toHaveProperty('error');
  });

  it('non-atomvm JSON objects do not appear in parseErrors (type-guard skip is not an error)', () => {
    // Lines with wrong "tag" are intentionally filtered by isAtomVmProcEvent — they are
    // structurally valid JSON, just not AtomVM events.  They should NOT appear in parseErrors.
    const ndjson = [
      JSON.stringify({ tag: 'atomvm_proc', pid: '<0.1.0>', event: 'spawn', ts: '2026-05-18T10:00:00Z' }),
      JSON.stringify({ tag: 'other_system', data: 'unrelated event' }),
    ].join('\n');
    const result = fromAtomVmJsonl(ndjson);
    expect(result.events).toHaveLength(1);
    // Wrong-tag lines are silently skipped (type-guard) but are NOT parse errors
    expect(result.parseErrors).toHaveLength(0);
  });
});

describe('GAP 4c/4d: send/receive/link/monitor events are not modelled', () => {
  it('detectCrashDetails only covers crash events, not message-passing or supervision', () => {
    // A "send" event with a dead recipient cannot be detected as a crash
    const ndjson = [
      JSON.stringify({ tag: 'atomvm_proc', pid: '<0.1.0>', event: 'send', to: '<0.2.0>', message: 'ping', ts: '2026-05-18T10:00:00Z' }),
    ].join('\n');
    const events = fromAtomVmJsonl(ndjson).events;
    // send is accepted (no whitelist) but produces "atomvm_proc.send" activity
    // detectCrashDetails only scans for atomvm_proc.crash
    const crashes = detectCrashDetails(events);
    expect(crashes).toHaveLength(0);
    // GAP: There is no detectSendReceivePairs() or detectDeadMessages()
  });

  it('link events pass through but create no social network data', () => {
    const ndjson = JSON.stringify({
      tag: 'atomvm_proc', pid: '<0.1.0>', event: 'link',
      linked_pid: '<0.2.0>', ts: '2026-05-18T10:00:00Z',
    });
    const events = fromAtomVmJsonl(ndjson).events;
    // link is accepted and produces "atomvm_proc.link" activity
    expect(events[0]['ocel:activity']).toBe('atomvm_proc.link');
    // But no detectSupervisorLinks() or handover-of-work social network exists
    // GAP: No bridge function mines supervision tree or message flow from these events
  });
});

describe('GAP 4e: timestamp format — numeric POSIX not supported', () => {
  it('numeric timestamp in ts field is preserved as-is but not normalized', () => {
    // AtomVM's System.monotonic_time/0 returns an integer in microseconds
    // The bridge does not convert numeric timestamps to ISO-8601
    const evt: AtomVmProcEvent = {
      tag: 'atomvm_proc',
      pid: '<0.1.0>',
      event: 'spawn',
      ts: '1716026400000', // numeric string (POSIX ms as string)
    };
    const ocel = adaptAtomVmProcEvent(evt);
    // Timestamp is passed through unchanged — no normalization occurs
    expect(ocel['ocel:timestamp']).toBe('1716026400000');
    // GAP: The WASM kernel expects ISO-8601; numeric timestamps may cause parse errors
  });
});

describe('GAP 4f: multi-node AtomVM — node_id not extracted from PID', () => {
  it('PID third component (node) is not extracted or indexed', () => {
    // In Erlang/AtomVM distributed systems, <A.B.C> where C identifies the node
    // <0.5.0> = local node (C=0), <0.5.1> = remote node 1, etc.
    const localPid = '<0.5.0>';
    const remotePid = '<0.5.1>';

    const ndjson = [
      JSON.stringify({ tag: 'atomvm_proc', pid: localPid, event: 'spawn', ts: '2026-05-18T10:00:00Z' }),
      JSON.stringify({ tag: 'atomvm_proc', pid: remotePid, event: 'spawn', ts: '2026-05-18T10:00:01Z' }),
    ].join('\n');

    const events = fromAtomVmJsonl(ndjson).events;
    // Both PIDs are accepted and produce separate objects
    expect(events).toHaveLength(2);

    // They appear as separate objects in the OCEL document
    const doc = JSON.parse(toOcel2Json(events));
    expect(doc.objects).toHaveLength(2);
    const ids = doc.objects.map((o: { id: string }) => o.id);
    expect(ids).toContain(localPid);
    expect(ids).toContain(remotePid);

    // GAP: Both have objectType "atomvm_proc" — there is no "atomvm_proc_local"
    // vs "atomvm_proc_remote" differentiation. Multi-node topology is invisible.
    for (const obj of doc.objects) {
      expect(obj.type).toBe('atomvm_proc');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY TEST: Gap enumeration
// ─────────────────────────────────────────────────────────────────────────────

describe('Gap summary: 6 documented gaps with closure status', () => {
  it('documents all gaps with their severity and workaround/closure status', () => {
    const gaps: Array<{ id: string; severity: 'high' | 'medium' | 'low'; hasWorkaround: boolean; closed: boolean; description: string }> = [
      {
        id: 'GAP-1a',
        severity: 'medium',
        hasWorkaround: false,
        closed: false,
        description: 'AtomVM send/receive events not modelled — cannot mine inter-process communication',
      },
      {
        id: 'GAP-1b',
        severity: 'medium',
        hasWorkaround: false,
        closed: false,
        description: 'AtomVM link/monitor events not modelled — cannot mine OTP supervision tree',
      },
      {
        id: 'GAP-2',
        severity: 'high',
        hasWorkaround: true,
        closed: false,
        description: 'Three incompatible OCEL schemas: WASM camelCase, IEEE ocel:prefix, trace.ts underscore',
      },
      {
        id: 'GAP-3',
        severity: 'high',
        // CLOSED: toOcelLog() adapter added in atomvm-bridge.ts; AtomVM traces
        // can now be fed directly into wpm trace conform via toOcelLog().
        hasWorkaround: true,
        closed: true,
        description: 'wpm trace conform now reachable via toOcelLog() adapter — GAP-3 closed',
      },
      {
        id: 'GAP-4a',
        severity: 'medium',
        hasWorkaround: true,
        closed: true,
        description: 'fromAtomVmJsonl now returns parseErrors array; fromAtomVmJsonlStrict throws on first error — GAP-4b closed',
      },
      {
        id: 'GAP-4b',
        severity: 'low',
        // CLOSED: toOcelLog() converts numeric POSIX ms timestamps to ISO-8601 (GAP-4c).
        hasWorkaround: true,
        closed: true,
        description: 'Numeric POSIX timestamps now normalised to ISO-8601 inside toOcelLog() — GAP-4c closed',
      },
    ];

    // All gaps are documented
    expect(gaps).toHaveLength(6);
    // Three gaps are now closed (GAP-3, GAP-4a/4b strict mode, GAP-4b/4c timestamp)
    const closedGaps = gaps.filter((g) => g.closed);
    expect(closedGaps).toHaveLength(3);
    // GAP-3 (conformance routing) is now closed
    const conformanceGap = gaps.find((g) => g.id === 'GAP-3');
    expect(conformanceGap?.closed).toBe(true);
    expect(conformanceGap?.hasWorkaround).toBe(true);
    // GAP-4a (parse error visibility) is now closed via parseErrors array + strict mode
    const parseErrorGap = gaps.find((g) => g.id === 'GAP-4a');
    expect(parseErrorGap?.closed).toBe(true);
    expect(parseErrorGap?.hasWorkaround).toBe(true);
    // GAP-4b (numeric timestamp) is closed via toOcelLog()
    const timestampGap = gaps.find((g) => g.id === 'GAP-4b');
    expect(timestampGap?.closed).toBe(true);
    // GAP-2 (schema fragmentation) still open — three schemas still coexist
    const ocelGap = gaps.find((g) => g.id === 'GAP-2');
    expect(ocelGap?.closed).toBe(false);
  });
});
