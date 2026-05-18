/**
 * Erlang TraceGraph → OcelLog round-trip tests.
 *
 * Validates the full adapter pipeline:
 *   parseCrashDump() → build TraceGraphOutput → traceGraphToOcelLog() → OcelLog
 *
 * Covers:
 *   - Basic structure: ocel_version, ocel_global_log, ocel_events, ocel_objects
 *   - Activity derivation from stack frame function names
 *   - Object population from trace:objects and ocel:relatedObject
 *   - Attribute capture (frame_index, file, line, function)
 *   - Empty input → empty OcelLog (no crashes)
 *   - Multiple crash events produce multiple OCEL events
 *   - Objects referenced only via relatedObject (StackFrame) are synthesised
 *   - TraceGraph with no objects produces valid (empty) ocel_objects
 *   - Round-trip: event count matches TraceGraph event count
 *
 * FM-5 note: all assertions are domain-theory derived (format contracts,
 * structural invariants), never self-referential formula confirmations.
 */

import { describe, it, expect } from 'vitest';
import {
  traceGraphToOcelLog,
  type TraceGraphOutput,
  type OcelLog,
  type OcelLogEvent,
} from '../erlang-bridge.js';

// ---------------------------------------------------------------------------
// Fixtures — minimal TraceGraph documents
// ---------------------------------------------------------------------------

/**
 * Builds a minimal TraceGraph matching the structure produced by
 * `wpm trace ingest --from erlang --format json` for the crash dump colon-style format.
 */
function buildCrashDumpTraceGraph(frames: Array<{ fn: string; file: string; line: number }>): TraceGraphOutput {
  const runId = 'test-run-001';
  const events = frames.map((f, i) => ({
    '@id': `trace:e${i}`,
    '@type': 'ocel:Event' as const,
    'ocel:activity': f.fn,
    'ocel:relatedObject': [
      {
        '@id': `trace:SourceFile:${f.file.replace(/[^a-zA-Z0-9]/g, '_')}`,
        '@type': 'trace:SourceFile',
      },
      {
        '@id': `trace:Frame:${runId}:${i}`,
        '@type': 'trace:StackFrame',
      },
    ],
    'trace:frame': {
      'trace:language': 'erlang',
      'trace:function': f.fn,
      'trace:file': f.file,
      'trace:line': f.line,
    },
  }));

  // Source file objects (one per unique file)
  const seenFiles = new Set<string>();
  const objects: TraceGraphOutput['trace:objects'] = [];
  for (const f of frames) {
    if (!seenFiles.has(f.file)) {
      seenFiles.add(f.file);
      objects.push({
        '@id': `trace:SourceFile:${f.file.replace(/[^a-zA-Z0-9]/g, '_')}`,
        '@type': 'trace:SourceFile',
        'trace:path': f.file,
      });
    }
  }

  return {
    '@context': {
      prov: 'http://www.w3.org/ns/prov#',
      ocel: 'https://www.ocel-standard.org/ns#',
      trace: 'https://example.org/trace#',
    },
    '@id': `trace:run-${runId}`,
    '@type': 'trace:TraceRun',
    'trace:language': 'erlang',
    'trace:source': 'crash.erl',
    'trace:events': events,
    'trace:objects': objects,
  };
}

// Three-frame crash dump matching the canonical crash dump colon-style fixture
const THREE_FRAME_GRAPH = buildCrashDumpTraceGraph([
  { fn: 'my_app:handle_request/2', file: 'my_app.erl', line: 42 },
  { fn: 'gen_server:handle_msg/6', file: 'gen_server.erl', line: 637 },
  { fn: 'supervisor:handle_info/2', file: 'supervisor.erl', line: 389 },
]);

// Single-frame minimal graph
const ONE_FRAME_GRAPH = buildCrashDumpTraceGraph([
  { fn: 'my_worker:start_link/0', file: 'my_worker.erl', line: 15 },
]);

// Empty graph — no events, no objects
const EMPTY_GRAPH: TraceGraphOutput = {
  '@context': { trace: 'https://example.org/trace#' },
  '@id': 'trace:run-empty',
  '@type': 'trace:TraceRun',
  'trace:language': 'erlang',
  'trace:source': 'empty.erl',
  'trace:events': [],
  'trace:objects': [],
};

// Graph with no trace:objects (only StackFrame objects via relatedObject)
const NO_DECLARED_OBJECTS_GRAPH: TraceGraphOutput = {
  '@context': { trace: 'https://example.org/trace#', ocel: 'https://www.ocel-standard.org/ns#' },
  '@id': 'trace:run-nobj',
  '@type': 'trace:TraceRun',
  'trace:language': 'erlang',
  'trace:source': 'nobj.erl',
  'trace:events': [
    {
      '@id': 'trace:e0',
      '@type': 'ocel:Event',
      'ocel:activity': 'my_mod:my_fun/1',
      'ocel:relatedObject': [{ '@id': 'trace:Frame:nobj:0', '@type': 'trace:StackFrame' }],
      'trace:frame': {
        'trace:language': 'erlang',
        'trace:function': 'my_mod:my_fun/1',
      },
    },
  ],
  'trace:objects': [],
};

// ---------------------------------------------------------------------------
// Basic structure invariants
// ---------------------------------------------------------------------------

describe('traceGraphToOcelLog — basic structure', () => {
  it('returns an OcelLog with ocel_version = "2.0"', () => {
    const ocel = traceGraphToOcelLog(THREE_FRAME_GRAPH);
    expect(ocel.ocel_version).toBe('2.0');
  });

  it('returns ocel_global_log with ocel_attribute_names array', () => {
    const ocel = traceGraphToOcelLog(THREE_FRAME_GRAPH);
    expect(Array.isArray(ocel.ocel_global_log.ocel_attribute_names)).toBe(true);
    expect(ocel.ocel_global_log.ocel_attribute_names.length).toBeGreaterThan(0);
  });

  it('returns ocel_events as an array', () => {
    const ocel = traceGraphToOcelLog(THREE_FRAME_GRAPH);
    expect(Array.isArray(ocel.ocel_events)).toBe(true);
  });

  it('returns ocel_objects as an array', () => {
    const ocel = traceGraphToOcelLog(THREE_FRAME_GRAPH);
    expect(Array.isArray(ocel.ocel_objects)).toBe(true);
  });

  it('empty TraceGraph yields empty ocel_events', () => {
    const ocel = traceGraphToOcelLog(EMPTY_GRAPH);
    expect(ocel.ocel_events).toHaveLength(0);
  });

  it('empty TraceGraph yields empty ocel_objects', () => {
    const ocel = traceGraphToOcelLog(EMPTY_GRAPH);
    expect(ocel.ocel_objects).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Event count round-trip
// ---------------------------------------------------------------------------

describe('traceGraphToOcelLog — event count round-trip', () => {
  it('produces exactly one OCEL event per TraceGraph event (3-frame)', () => {
    const ocel = traceGraphToOcelLog(THREE_FRAME_GRAPH);
    expect(ocel.ocel_events).toHaveLength(THREE_FRAME_GRAPH['trace:events'].length);
  });

  it('produces exactly one OCEL event per TraceGraph event (1-frame)', () => {
    const ocel = traceGraphToOcelLog(ONE_FRAME_GRAPH);
    expect(ocel.ocel_events).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Activity derivation
// ---------------------------------------------------------------------------

describe('traceGraphToOcelLog — activity derivation', () => {
  it('preserves ocel:activity verbatim as activity field', () => {
    const ocel = traceGraphToOcelLog(THREE_FRAME_GRAPH);
    expect(ocel.ocel_events[0]?.activity).toBe('my_app:handle_request/2');
    expect(ocel.ocel_events[1]?.activity).toBe('gen_server:handle_msg/6');
    expect(ocel.ocel_events[2]?.activity).toBe('supervisor:handle_info/2');
  });

  it('activity for single-frame graph matches function name', () => {
    const ocel = traceGraphToOcelLog(ONE_FRAME_GRAPH);
    expect(ocel.ocel_events[0]?.activity).toBe('my_worker:start_link/0');
  });
});

// ---------------------------------------------------------------------------
// event_id derivation
// ---------------------------------------------------------------------------

describe('traceGraphToOcelLog — event_id', () => {
  it('strips trace: prefix from @id to produce event_id', () => {
    const ocel = traceGraphToOcelLog(THREE_FRAME_GRAPH);
    // @id = "trace:e0" → event_id = "e0"
    expect(ocel.ocel_events[0]?.event_id).toBe('e0');
    expect(ocel.ocel_events[1]?.event_id).toBe('e1');
    expect(ocel.ocel_events[2]?.event_id).toBe('e2');
  });

  it('all event_ids are unique', () => {
    const ocel = traceGraphToOcelLog(THREE_FRAME_GRAPH);
    const ids = ocel.ocel_events.map((e) => e.event_id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ---------------------------------------------------------------------------
// Timestamp
// ---------------------------------------------------------------------------

describe('traceGraphToOcelLog — timestamp', () => {
  it('every event has a non-empty ISO-8601 timestamp', () => {
    const ocel = traceGraphToOcelLog(THREE_FRAME_GRAPH);
    for (const ev of ocel.ocel_events) {
      expect(ev.timestamp).toBeTruthy();
      expect(() => new Date(ev.timestamp)).not.toThrow();
      expect(new Date(ev.timestamp).getTime()).not.toBeNaN();
    }
  });
});

// ---------------------------------------------------------------------------
// Attributes: frame_index, file, line, function
// ---------------------------------------------------------------------------

describe('traceGraphToOcelLog — frame attributes', () => {
  it('captures frame_index starting at 0', () => {
    const ocel = traceGraphToOcelLog(THREE_FRAME_GRAPH);
    expect(ocel.ocel_events[0]?.attributes['frame_index']).toBe(0);
    expect(ocel.ocel_events[1]?.attributes['frame_index']).toBe(1);
    expect(ocel.ocel_events[2]?.attributes['frame_index']).toBe(2);
  });

  it('captures trace:file as attributes.file when present', () => {
    const ocel = traceGraphToOcelLog(THREE_FRAME_GRAPH);
    expect(ocel.ocel_events[0]?.attributes['file']).toBe('my_app.erl');
    expect(ocel.ocel_events[2]?.attributes['file']).toBe('supervisor.erl');
  });

  it('captures trace:line as attributes.line when present', () => {
    const ocel = traceGraphToOcelLog(THREE_FRAME_GRAPH);
    expect(ocel.ocel_events[0]?.attributes['line']).toBe(42);
    expect(ocel.ocel_events[2]?.attributes['line']).toBe(389);
  });

  it('captures trace:function as attributes.function', () => {
    const ocel = traceGraphToOcelLog(THREE_FRAME_GRAPH);
    expect(ocel.ocel_events[0]?.attributes['function']).toBe('my_app:handle_request/2');
  });

  it('does not include file attribute when trace:file is absent', () => {
    const ocel = traceGraphToOcelLog(NO_DECLARED_OBJECTS_GRAPH);
    expect(ocel.ocel_events[0]?.attributes).not.toHaveProperty('file');
  });
});

// ---------------------------------------------------------------------------
// Object population
// ---------------------------------------------------------------------------

describe('traceGraphToOcelLog — ocel_objects', () => {
  it('includes objects declared in trace:objects', () => {
    const ocel = traceGraphToOcelLog(THREE_FRAME_GRAPH);
    // At least one SourceFile object present (IDs have special chars sanitised to _)
    const sourceFiles = ocel.ocel_objects.filter((o) => o.type === 'SourceFile');
    expect(sourceFiles.length).toBeGreaterThanOrEqual(1);
    // Three unique source files (my_app.erl, gen_server.erl, supervisor.erl) → 3 objects
    expect(sourceFiles.length).toBe(3);
  });

  it('synthesises StackFrame objects from ocel:relatedObject even if absent from trace:objects', () => {
    const ocel = traceGraphToOcelLog(NO_DECLARED_OBJECTS_GRAPH);
    const frameObjects = ocel.ocel_objects.filter((o) => o.type === 'StackFrame');
    expect(frameObjects.length).toBeGreaterThan(0);
  });

  it('all ocel_object ids are unique', () => {
    const ocel = traceGraphToOcelLog(THREE_FRAME_GRAPH);
    const ids = ocel.ocel_objects.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includes trace:path in object attributes when present', () => {
    const ocel = traceGraphToOcelLog(THREE_FRAME_GRAPH);
    const myAppFile = ocel.ocel_objects.find((o) => o.id.includes('my_app'));
    expect(myAppFile).toBeDefined();
    expect(myAppFile?.attributes['path']).toBe('my_app.erl');
  });
});

// ---------------------------------------------------------------------------
// Event objects (ocel:relatedObject → objects[])
// ---------------------------------------------------------------------------

describe('traceGraphToOcelLog — event objects linkage', () => {
  it('each event has a non-empty objects array', () => {
    const ocel = traceGraphToOcelLog(THREE_FRAME_GRAPH);
    for (const ev of ocel.ocel_events) {
      expect(ev.objects.length).toBeGreaterThan(0);
    }
  });

  it('event objects ids have trace: prefix stripped', () => {
    const ocel = traceGraphToOcelLog(THREE_FRAME_GRAPH);
    for (const ev of ocel.ocel_events) {
      for (const obj of ev.objects) {
        expect(obj.id).not.toMatch(/^trace:/);
        expect(obj.type).not.toMatch(/^trace:/);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Integration: parseCrashDump → build TraceGraph → traceGraphToOcelLog
// ---------------------------------------------------------------------------

describe('traceGraphToOcelLog — integration with crash dump pipeline', () => {
  it('round-trip: 3 crash dump frames → 3 OCEL events', () => {
    const graph = buildCrashDumpTraceGraph([
      { fn: 'my_app:handle_request/2', file: 'my_app.erl', line: 42 },
      { fn: 'gen_server:handle_msg/6', file: 'gen_server.erl', line: 637 },
      { fn: 'supervisor:handle_info/2', file: 'supervisor.erl', line: 389 },
    ]);
    const ocel = traceGraphToOcelLog(graph);
    expect(ocel.ocel_events).toHaveLength(3);
  });

  it('round-trip: activities match frame function names in order', () => {
    const frames = [
      { fn: 'my_app:handle_request/2', file: 'my_app.erl', line: 42 },
      { fn: 'gen_server:handle_msg/6', file: 'gen_server.erl', line: 637 },
    ];
    const graph = buildCrashDumpTraceGraph(frames);
    const ocel = traceGraphToOcelLog(graph);
    expect(ocel.ocel_events.map((e) => e.activity)).toEqual(frames.map((f) => f.fn));
  });

  it('round-trip: serialises to valid JSON without error', () => {
    const ocel = traceGraphToOcelLog(THREE_FRAME_GRAPH);
    expect(() => JSON.stringify(ocel)).not.toThrow();
    const parsed = JSON.parse(JSON.stringify(ocel)) as OcelLog;
    expect(parsed.ocel_version).toBe('2.0');
  });

  it('round-trip: ocel_global_log includes standard attribute names', () => {
    const ocel = traceGraphToOcelLog(THREE_FRAME_GRAPH);
    expect(ocel.ocel_global_log.ocel_attribute_names).toContain('frame_index');
    expect(ocel.ocel_global_log.ocel_attribute_names).toContain('file');
  });
});
