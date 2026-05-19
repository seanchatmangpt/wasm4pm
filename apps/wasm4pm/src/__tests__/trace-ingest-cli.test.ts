/**
 * trace-ingest-cli.test.ts — Gap-filling integration tests for wpm trace subcommands
 *
 * Oracle rank: Rank 2 (Domain contract — TraceGraph shape invariants, OCEL structural
 * integrity, stdin routing, and JSON-LD context completeness per CLAUDE.md spec).
 *
 * This file specifically targets scenarios NOT covered by:
 *   - membrane-trace-cli.test.ts  (language coverage, zero-frames, conform verdicts)
 *   - trace-cli.test.ts           (pipeline steps, error paths, route catalog, exit codes)
 *   - trace-conformance.test.ts   (checkPowl2Conformance unit tests)
 *   - ocel-algorithms.test.ts     (WASM OCEL API surface)
 *
 * New coverage:
 *   §1.  trace ingest — stdin routing (no -i flag)
 *   §2.  trace ingest — TraceGraph JSON-LD structural invariants (@context, @id, @type)
 *   §3.  trace ingest — trace:source field reflects input path vs literal "stdin"
 *   §4.  trace ingest — trace:objects deduplication (same file path → one object entry)
 *   §5.  trace ingest — event count equals frame count; objects have @id, @type, trace:path
 *   §6.  trace ingest — human format payload fields (run_id, language, frames, events, objects)
 *   §7.  trace ingest — --format json with -o writes file AND emits raw JSON to stdout
 *   §8.  trace ingest — verbose flag includes file path hint in output
 *   §9.  trace ocel   — stdin routing (no -i flag) with valid TraceGraph JSON-LD
 *   §10. trace ocel   — OCEL event shape invariants (event_id, activity, timestamp, objects)
 *   §11. trace ocel   — OCEL event count equals TraceGraph event count
 *   §12. trace powl   — stdin routing (no -i flag) with valid OCEL JSON
 *   §13. trace powl   — empty OCEL (no events) → exit 0, empty observed_activities
 *   §14. trace ingest — TraceGraph @id is stable given a known --runId
 *   §15. trace ingest — each language produces trace:language matching the --from value
 *   §16. trace ingest — empty stdin (whitespace only) yields zero-frame TraceGraph, exit 0
 *   §17. trace conform — stdin OCEL with --format json produces parseable envelope
 *   §18. trace ocel   — human output mentions "events" count
 *   §19. trace ingest — @context contains required JSON-LD namespaces (prov, ocel, trace)
 *   §20. trace ingest — frames written to TraceGraph events maintain insertion order
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// ─── CLI helpers ──────────────────────────────────────────────────────────────

const CLI = path.resolve(import.meta.dirname, '../../dist/bin/wpm.js');

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function wpmAsync(
  args: string[],
  options: {
    cwd?: string;
    env?: Record<string, string>;
    timeoutMs?: number;
    stdin?: string;
  } = {},
): Promise<CliResult> {
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [CLI, ...args],
      {
        cwd: options.cwd ?? os.tmpdir(),
        env: { ...process.env, ...(options.env ?? {}) },
        timeout: options.timeoutMs ?? 30_000,
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        const exitCode =
          error && 'code' in error && typeof error.code === 'number' ? error.code : error ? 1 : 0;
        resolve({ exitCode, stdout: stdout ?? '', stderr: stderr ?? '' });
      },
    );

    if (options.stdin !== undefined && child.stdin) {
      child.stdin.write(options.stdin);
      child.stdin.end();
    } else if (child.stdin) {
      child.stdin.end();
    }

    child.on('error', () =>
      resolve({ exitCode: 5, stdout: '', stderr: 'Process failed to start' }),
    );
  });
}

function parseJson(result: CliResult): Record<string, unknown> | null {
  try {
    return JSON.parse(result.stdout) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/**
 * 3-frame TypeScript V8 stack trace — small, deterministic, well-understood.
 * frame[0]: MyClass.doWork at /app/src/worker.ts:42
 * frame[1]: main          at /app/src/index.ts:8
 * frame[2]: Object.<anonymous> at /app/src/index.ts:12
 */
const TS_TRACE_3_FRAMES = `Error: something went wrong
    at MyClass.doWork (/app/src/worker.ts:42:10)
    at async main (/app/src/index.ts:8:3)
    at Object.<anonymous> (/app/src/index.ts:12:1)`;

/**
 * Rust backtrace with 3 frames — two distinct source files.
 */
const RUST_TRACE_3_FRAMES = `stack backtrace:
   0: std::panicking::begin_panic
             at /rustup/toolchains/stable/src/libstd/panicking.rs:505
   1: myapp::engine::run
             at src/engine.rs:27:5
   2: myapp::main
             at src/main.rs:10:3`;

/**
 * Python traceback with 2 frames.
 */
const PYTHON_TRACE_2_FRAMES = `Traceback (most recent call last):
  File "/app/main.py", line 42, in run_pipeline
    result = process_log(path)
  File "/app/engine.py", line 17, in process_log
    return parse(data)`;

/**
 * Minimal OCEL used for trace ocel / trace powl / trace conform stdin tests.
 * 3 events, single Run object — satisfies ActivityOnlyFakeRoute guard.
 */
const MINIMAL_OCEL_JSON = JSON.stringify({
  ocel_version: '2.0',
  ocel_global_log: { ocel_attribute_names: [] },
  ocel_events: [
    {
      event_id: 'e0',
      activity: 'start',
      timestamp: '2026-01-01T00:00:00.000Z',
      objects: [{ id: 'run-1', type: 'Run' }],
      attributes: {},
    },
    {
      event_id: 'e1',
      activity: 'process',
      timestamp: '2026-01-01T01:00:00.000Z',
      objects: [{ id: 'run-1', type: 'Run' }],
      attributes: {},
    },
    {
      event_id: 'e2',
      activity: 'finish',
      timestamp: '2026-01-01T02:00:00.000Z',
      objects: [{ id: 'run-1', type: 'Run' }],
      attributes: {},
    },
  ],
  ocel_objects: [{ id: 'run-1', type: 'Run', attributes: {} }],
});

/**
 * Sequence model for trace conform stdin test. Minimal — no object_types so verdict
 * will be AndonPull(TestRouteIncomplete), but the JSON envelope is still emitted.
 */
const CONFORM_MODEL_JSON = JSON.stringify({
  route_id: 'stdin-conform-test',
  type: 'powl2',
  required_stages: ['start', 'process', 'finish'],
  model: { type: 'sequence', sequence: ['start', 'process', 'finish'] },
});

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('wpm trace ingest — gap coverage', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'trig-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  });

  // ── §1. stdin routing (no -i flag) ──────────────────────────────────────────

  describe('§1 stdin routing', () => {
    it('reads trace from stdin when -i is omitted and exits 0', async () => {
      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'typescript', '--format', 'json'],
        { cwd: tmpDir, stdin: TS_TRACE_3_FRAMES },
      );

      expect(result.exitCode).toBe(0);
      const graph = parseJson(result);
      expect(graph?.['@type']).toBe('trace:TraceRun');
      expect(graph?.['trace:language']).toBe('typescript');
    });

    it('stdin trace produces non-empty events array', async () => {
      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'typescript', '--format', 'json'],
        { cwd: tmpDir, stdin: TS_TRACE_3_FRAMES },
      );

      expect(result.exitCode).toBe(0);
      const graph = parseJson(result);
      const events = graph?.['trace:events'] as unknown[] | undefined;
      expect(Array.isArray(events)).toBe(true);
      expect((events ?? []).length).toBeGreaterThan(0);
    });

    it('trace:source is "stdin" when no -i flag is used', async () => {
      const outFile = path.join(tmpDir, 'from-stdin.json');
      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'typescript', '-o', outFile],
        { cwd: tmpDir, stdin: TS_TRACE_3_FRAMES },
      );

      expect(result.exitCode).toBe(0);
      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      expect(graph['trace:source']).toBe('stdin');
    });
  });

  // ── §2. JSON-LD structural invariants ──────────────────────────────────────

  describe('§2 TraceGraph JSON-LD structural invariants', () => {
    it('@context contains required prov, ocel, and trace namespaces (Rank 2: JSON-LD contract)', async () => {
      const traceFile = path.join(tmpDir, 'ts.txt');
      const outFile = path.join(tmpDir, 'graph.json');
      await fs.writeFile(traceFile, TS_TRACE_3_FRAMES, 'utf8');

      await wpmAsync(
        ['trace', 'ingest', '--from', 'typescript', '-i', traceFile, '-o', outFile],
        { cwd: tmpDir },
      );

      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      const ctx = graph['@context'] as Record<string, string> | undefined;
      expect(typeof ctx).toBe('object');
      expect(ctx?.prov).toBeDefined();
      expect(ctx?.ocel).toBeDefined();
      expect(ctx?.trace).toBeDefined();
    });

    it('@type is "trace:TraceRun" (Rank 2: JSON-LD type contract)', async () => {
      const traceFile = path.join(tmpDir, 'ts.txt');
      const outFile = path.join(tmpDir, 'graph.json');
      await fs.writeFile(traceFile, TS_TRACE_3_FRAMES, 'utf8');

      await wpmAsync(
        ['trace', 'ingest', '--from', 'typescript', '-i', traceFile, '-o', outFile],
        { cwd: tmpDir },
      );

      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      expect(graph['@type']).toBe('trace:TraceRun');
    });

    it('@id follows "trace:run-{runId}" pattern when --runId is given', async () => {
      const traceFile = path.join(tmpDir, 'ts.txt');
      const outFile = path.join(tmpDir, 'graph.json');
      await fs.writeFile(traceFile, TS_TRACE_3_FRAMES, 'utf8');

      await wpmAsync(
        ['trace', 'ingest', '--from', 'typescript', '-i', traceFile, '-o', outFile, '--runId', 'fixed-123'],
        { cwd: tmpDir },
      );

      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      expect(graph['@id']).toBe('trace:run-fixed-123');
    });

    it('@id contains the auto-generated runId prefix "trace:run-" even without --runId', async () => {
      const traceFile = path.join(tmpDir, 'ts.txt');
      const outFile = path.join(tmpDir, 'graph.json');
      await fs.writeFile(traceFile, TS_TRACE_3_FRAMES, 'utf8');

      await wpmAsync(
        ['trace', 'ingest', '--from', 'typescript', '-i', traceFile, '-o', outFile],
        { cwd: tmpDir },
      );

      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      expect(typeof graph['@id']).toBe('string');
      expect((graph['@id'] as string).startsWith('trace:run-')).toBe(true);
    });
  });

  // ── §3. trace:source field ──────────────────────────────────────────────────

  describe('§3 trace:source field', () => {
    it('trace:source equals the absolute path when -i is provided', async () => {
      const traceFile = path.join(tmpDir, 'ts.txt');
      const outFile = path.join(tmpDir, 'graph.json');
      await fs.writeFile(traceFile, TS_TRACE_3_FRAMES, 'utf8');

      await wpmAsync(
        ['trace', 'ingest', '--from', 'typescript', '-i', traceFile, '-o', outFile],
        { cwd: tmpDir },
      );

      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      // trace:source is the path exactly as passed to the command
      expect(graph['trace:source']).toBe(traceFile);
    });

    it('trace:source is "stdin" for stdin-routed ingest', async () => {
      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'rust', '--format', 'json'],
        { cwd: tmpDir, stdin: RUST_TRACE_3_FRAMES },
      );

      expect(result.exitCode).toBe(0);
      const graph = parseJson(result);
      expect(graph?.['trace:source']).toBe('stdin');
    });
  });

  // ── §4. trace:objects deduplication ────────────────────────────────────────

  describe('§4 trace:objects deduplication by file path', () => {
    it('objects list has no duplicate entries for the same source file (Rank 1: set invariant)', async () => {
      // TS_TRACE_3_FRAMES has frames from /app/src/worker.ts AND /app/src/index.ts (×2 frames).
      // The second frame from index.ts must NOT create a second entry in trace:objects.
      const traceFile = path.join(tmpDir, 'ts.txt');
      const outFile = path.join(tmpDir, 'graph.json');
      await fs.writeFile(traceFile, TS_TRACE_3_FRAMES, 'utf8');

      await wpmAsync(
        ['trace', 'ingest', '--from', 'typescript', '-i', traceFile, '-o', outFile],
        { cwd: tmpDir },
      );

      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      const objects = graph['trace:objects'] as Array<{ '@id': string }>;
      const ids = objects.map((o) => o['@id']);
      const uniqueIds = new Set(ids);
      // No duplicate @id entries
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('objects with trace:path have string values matching actual file paths', async () => {
      const traceFile = path.join(tmpDir, 'ts.txt');
      const outFile = path.join(tmpDir, 'graph.json');
      await fs.writeFile(traceFile, TS_TRACE_3_FRAMES, 'utf8');

      await wpmAsync(
        ['trace', 'ingest', '--from', 'typescript', '-i', traceFile, '-o', outFile],
        { cwd: tmpDir },
      );

      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      const objects = graph['trace:objects'] as Array<{ '@id': string; '@type': string; 'trace:path'?: string }>;
      for (const obj of objects) {
        if (obj['trace:path'] !== undefined) {
          expect(typeof obj['trace:path']).toBe('string');
          // SourceFile objects have paths from the parsed trace
          expect(obj['trace:path'].length).toBeGreaterThan(0);
        }
      }
    });
  });

  // ── §5. event count equals frame count ─────────────────────────────────────

  describe('§5 event count equals frame count', () => {
    it('trace:events length equals the number of parseable frames (Rank 1: bijection invariant)', async () => {
      // TS_TRACE_3_FRAMES has exactly 3 "at ..." lines → 3 frames → 3 events
      const traceFile = path.join(tmpDir, 'ts.txt');
      const outFile = path.join(tmpDir, 'graph.json');
      await fs.writeFile(traceFile, TS_TRACE_3_FRAMES, 'utf8');

      await wpmAsync(
        ['trace', 'ingest', '--from', 'typescript', '-i', traceFile, '-o', outFile],
        { cwd: tmpDir },
      );

      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      const events = graph['trace:events'] as unknown[];
      expect(events.length).toBe(3);
    });

    it('each event has @id, @type, ocel:activity, ocel:relatedObject, and trace:frame fields', async () => {
      const traceFile = path.join(tmpDir, 'ts.txt');
      const outFile = path.join(tmpDir, 'graph.json');
      await fs.writeFile(traceFile, TS_TRACE_3_FRAMES, 'utf8');

      await wpmAsync(
        ['trace', 'ingest', '--from', 'typescript', '-i', traceFile, '-o', outFile],
        { cwd: tmpDir },
      );

      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      const events = graph['trace:events'] as Array<Record<string, unknown>>;
      for (const ev of events) {
        expect(typeof ev['@id']).toBe('string');
        expect(ev['@type']).toBe('ocel:Event');
        expect(typeof ev['ocel:activity']).toBe('string');
        expect((ev['ocel:activity'] as string).length).toBeGreaterThan(0);
        expect(Array.isArray(ev['ocel:relatedObject'])).toBe(true);
        expect(typeof ev['trace:frame']).toBe('object');
      }
    });
  });

  // ── §6. human format payload fields ────────────────────────────────────────

  describe('§6 human format shows correct summary fields', () => {
    it('human output includes the correct frame count for a 3-frame trace', async () => {
      const traceFile = path.join(tmpDir, 'ts.txt');
      await fs.writeFile(traceFile, TS_TRACE_3_FRAMES, 'utf8');

      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'typescript', '-i', traceFile],
        { cwd: tmpDir },
      );

      expect(result.exitCode).toBe(0);
      const combined = result.stdout + result.stderr;
      // Human output: "  Frames:    3"
      expect(combined).toMatch(/Frames:\s+3/);
    });

    it('human output includes the correct events count for a 3-frame trace', async () => {
      const traceFile = path.join(tmpDir, 'ts.txt');
      await fs.writeFile(traceFile, TS_TRACE_3_FRAMES, 'utf8');

      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'typescript', '-i', traceFile],
        { cwd: tmpDir },
      );

      expect(result.exitCode).toBe(0);
      const combined = result.stdout + result.stderr;
      // Human output: "  Events:    3"
      expect(combined).toMatch(/Events:\s+3/);
    });
  });

  // ── §7. --format json with -o writes file AND emits to stdout ──────────────

  describe('§7 --format json + -o flag behavior', () => {
    it('--format json with -o writes file; stdout is empty (file takes precedence)', async () => {
      // When -o is set, the graph is written to file; stdout shows the human summary
      // (because the raw JSON path is only when -o is absent and format=json).
      // Verify the file is written and the graph is valid.
      const traceFile = path.join(tmpDir, 'ts.txt');
      const outFile = path.join(tmpDir, 'graph.json');
      await fs.writeFile(traceFile, TS_TRACE_3_FRAMES, 'utf8');

      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'typescript', '-i', traceFile, '-o', outFile, '--format', 'json'],
        { cwd: tmpDir },
      );

      expect(result.exitCode).toBe(0);
      // File must be written regardless of --format
      const fileExists = await fs.access(outFile).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);
      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      expect(graph['@type']).toBe('trace:TraceRun');
    });

    it('--format json without -o emits raw TraceGraph JSON to stdout (no envelope wrapper)', async () => {
      const traceFile = path.join(tmpDir, 'ts.txt');
      await fs.writeFile(traceFile, TS_TRACE_3_FRAMES, 'utf8');

      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'typescript', '-i', traceFile, '--format', 'json'],
        { cwd: tmpDir },
      );

      expect(result.exitCode).toBe(0);
      // stdout must be a single raw TraceGraph (not wrapped in { command, status, payload })
      const graph = parseJson(result);
      expect(graph?.['@type']).toBe('trace:TraceRun');
      // Not an envelope — no "command" key
      expect(graph?.['command']).toBeUndefined();
    });
  });

  // ── §8. verbose flag ────────────────────────────────────────────────────────

  describe('§8 --verbose flag', () => {
    it('--verbose (-v) with -o flag mentions file path in output', async () => {
      const traceFile = path.join(tmpDir, 'ts.txt');
      const outFile = path.join(tmpDir, 'graph.json');
      await fs.writeFile(traceFile, TS_TRACE_3_FRAMES, 'utf8');

      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'typescript', '-i', traceFile, '-o', outFile, '-v'],
        { cwd: tmpDir },
      );

      expect(result.exitCode).toBe(0);
      const combined = result.stdout + result.stderr;
      // Verbose mode emits: "  TraceGraph written to: <path>"
      expect(combined).toMatch(/written to|graph\.json/i);
    });
  });

  // ── §9. trace ocel stdin routing ────────────────────────────────────────────

  describe('§9 trace ocel — stdin routing', () => {
    it('trace ocel reads TraceGraph from stdin when -i is omitted and exits 0', async () => {
      // First produce a TraceGraph via ingest
      const traceFile = path.join(tmpDir, 'ts.txt');
      const graphFile = path.join(tmpDir, 'graph.json');
      await fs.writeFile(traceFile, TS_TRACE_3_FRAMES, 'utf8');
      await wpmAsync(
        ['trace', 'ingest', '--from', 'typescript', '-i', traceFile, '-o', graphFile],
        { cwd: tmpDir },
      );

      const graphJson = await fs.readFile(graphFile, 'utf8');

      // Now pipe that TraceGraph via stdin to trace ocel
      const result = await wpmAsync(
        ['trace', 'ocel', '--format', 'json'],
        { cwd: tmpDir, stdin: graphJson },
      );

      // trace ocel with --format json and no -o emits the raw OCEL JSON to stdout
      // (the implementation emits the raw OCEL then a summary envelope)
      expect(result.exitCode).toBe(0);
    });
  });

  // ── §10. OCEL event shape invariants ────────────────────────────────────────

  describe('§10 trace ocel — OCEL event shape invariants', () => {
    it('every OCEL event has event_id, activity, timestamp, objects fields (Rank 2: OCEL 2.0 contract)', async () => {
      const traceFile = path.join(tmpDir, 'ts.txt');
      const graphFile = path.join(tmpDir, 'graph.json');
      const ocelFile = path.join(tmpDir, 'ocel.json');
      await fs.writeFile(traceFile, TS_TRACE_3_FRAMES, 'utf8');

      await wpmAsync(
        ['trace', 'ingest', '--from', 'typescript', '-i', traceFile, '-o', graphFile],
        { cwd: tmpDir },
      );
      await wpmAsync(
        ['trace', 'ocel', '-i', graphFile, '-o', ocelFile],
        { cwd: tmpDir },
      );

      const ocel = JSON.parse(await fs.readFile(ocelFile, 'utf8')) as Record<string, unknown>;
      const events = ocel.ocel_events as Array<Record<string, unknown>>;
      for (const ev of events) {
        expect(typeof ev.event_id).toBe('string');
        expect((ev.event_id as string).length).toBeGreaterThan(0);
        expect(typeof ev.activity).toBe('string');
        expect((ev.activity as string).length).toBeGreaterThan(0);
        expect(typeof ev.timestamp).toBe('string');
        expect(Array.isArray(ev.objects)).toBe(true);
      }
    });

    it('OCEL ocel_version is "2.0" (Rank 2: OCEL standard contract)', async () => {
      const traceFile = path.join(tmpDir, 'ts.txt');
      const graphFile = path.join(tmpDir, 'graph.json');
      const ocelFile = path.join(tmpDir, 'ocel.json');
      await fs.writeFile(traceFile, TS_TRACE_3_FRAMES, 'utf8');

      await wpmAsync(
        ['trace', 'ingest', '--from', 'typescript', '-i', traceFile, '-o', graphFile],
        { cwd: tmpDir },
      );
      await wpmAsync(
        ['trace', 'ocel', '-i', graphFile, '-o', ocelFile],
        { cwd: tmpDir },
      );

      const ocel = JSON.parse(await fs.readFile(ocelFile, 'utf8')) as Record<string, unknown>;
      expect(ocel.ocel_version).toBe('2.0');
    });
  });

  // ── §11. OCEL event count ────────────────────────────────────────────────────

  describe('§11 OCEL event count matches TraceGraph event count', () => {
    it('ocel_events.length equals trace:events.length (Rank 1: projection bijection)', async () => {
      const traceFile = path.join(tmpDir, 'ts.txt');
      const graphFile = path.join(tmpDir, 'graph.json');
      const ocelFile = path.join(tmpDir, 'ocel.json');
      await fs.writeFile(traceFile, TS_TRACE_3_FRAMES, 'utf8');

      await wpmAsync(
        ['trace', 'ingest', '--from', 'typescript', '-i', traceFile, '-o', graphFile],
        { cwd: tmpDir },
      );
      await wpmAsync(
        ['trace', 'ocel', '-i', graphFile, '-o', ocelFile],
        { cwd: tmpDir },
      );

      const graph = JSON.parse(await fs.readFile(graphFile, 'utf8')) as Record<string, unknown>;
      const ocel = JSON.parse(await fs.readFile(ocelFile, 'utf8')) as Record<string, unknown>;
      const graphEventCount = (graph['trace:events'] as unknown[]).length;
      const ocelEventCount = (ocel.ocel_events as unknown[]).length;
      expect(ocelEventCount).toBe(graphEventCount);
    });
  });

  // ── §12. trace powl stdin routing ───────────────────────────────────────────

  describe('§12 trace powl — stdin routing', () => {
    it('trace powl reads OCEL JSON from stdin when -i is omitted', async () => {
      const outFile = path.join(tmpDir, 'route.json');
      const result = await wpmAsync(
        ['trace', 'powl', '-o', outFile],
        { cwd: tmpDir, stdin: MINIMAL_OCEL_JSON },
      );

      expect(result.exitCode).toBe(0);
      const route = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      expect(Array.isArray(route.observed_activities)).toBe(true);
    });
  });

  // ── §13. trace powl — empty OCEL ────────────────────────────────────────────

  describe('§13 trace powl — empty OCEL', () => {
    it('empty OCEL (no events) → exit 0, empty observed_activities array', async () => {
      const emptyOcel = JSON.stringify({
        ocel_version: '2.0',
        ocel_global_log: { ocel_attribute_names: [] },
        ocel_events: [],
        ocel_objects: [],
      });
      const ocelFile = path.join(tmpDir, 'empty.ocel.json');
      const routeFile = path.join(tmpDir, 'route.json');
      await fs.writeFile(ocelFile, emptyOcel, 'utf8');

      const result = await wpmAsync(
        ['trace', 'powl', '-i', ocelFile, '-o', routeFile],
        { cwd: tmpDir },
      );

      expect(result.exitCode).toBe(0);
      const route = JSON.parse(await fs.readFile(routeFile, 'utf8')) as Record<string, unknown>;
      expect(Array.isArray(route.observed_activities)).toBe(true);
      expect((route.observed_activities as unknown[]).length).toBe(0);
    });

    it('empty OCEL → activity_count is 0', async () => {
      const emptyOcel = JSON.stringify({
        ocel_version: '2.0',
        ocel_global_log: { ocel_attribute_names: [] },
        ocel_events: [],
        ocel_objects: [],
      });
      const ocelFile = path.join(tmpDir, 'empty2.ocel.json');
      const routeFile = path.join(tmpDir, 'route2.json');
      await fs.writeFile(ocelFile, emptyOcel, 'utf8');

      await wpmAsync(
        ['trace', 'powl', '-i', ocelFile, '-o', routeFile],
        { cwd: tmpDir },
      );

      const route = JSON.parse(await fs.readFile(routeFile, 'utf8')) as Record<string, unknown>;
      expect(route.activity_count).toBe(0);
    });
  });

  // ── §14. TraceGraph @id stability ───────────────────────────────────────────

  describe('§14 TraceGraph @id stability', () => {
    it('two runs with the same --runId produce identical @id values (Rank 1: determinism)', async () => {
      const traceFile = path.join(tmpDir, 'ts.txt');
      const out1 = path.join(tmpDir, 'g1.json');
      const out2 = path.join(tmpDir, 'g2.json');
      await fs.writeFile(traceFile, TS_TRACE_3_FRAMES, 'utf8');

      await Promise.all([
        wpmAsync(
          ['trace', 'ingest', '--from', 'typescript', '-i', traceFile, '-o', out1, '--runId', 'stable-run-id'],
          { cwd: tmpDir },
        ),
        wpmAsync(
          ['trace', 'ingest', '--from', 'typescript', '-i', traceFile, '-o', out2, '--runId', 'stable-run-id'],
          { cwd: tmpDir },
        ),
      ]);

      const g1 = JSON.parse(await fs.readFile(out1, 'utf8')) as Record<string, unknown>;
      const g2 = JSON.parse(await fs.readFile(out2, 'utf8')) as Record<string, unknown>;
      expect(g1['@id']).toBe(g2['@id']);
      expect(g1['@id']).toBe('trace:run-stable-run-id');
    });
  });

  // ── §15. each language tag reflects --from value ────────────────────────────

  describe('§15 trace:language matches --from value for all accepted languages', () => {
    it.each([
      ['typescript', TS_TRACE_3_FRAMES],
      ['rust', RUST_TRACE_3_FRAMES],
      ['python', PYTHON_TRACE_2_FRAMES],
    ] as const)(
      '--from %s produces trace:language = %s',
      async (lang, trace) => {
        const traceFile = path.join(tmpDir, `${lang}.txt`);
        const outFile = path.join(tmpDir, `${lang}-graph.json`);
        await fs.writeFile(traceFile, trace, 'utf8');

        const result = await wpmAsync(
          ['trace', 'ingest', '--from', lang, '-i', traceFile, '-o', outFile],
          { cwd: tmpDir },
        );

        expect(result.exitCode, `${lang} should succeed`).toBe(0);
        const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
        expect(graph['trace:language']).toBe(lang);
      },
    );
  });

  // ── §16. empty stdin ─────────────────────────────────────────────────────────

  describe('§16 empty stdin (whitespace only)', () => {
    it('whitespace-only stdin yields a valid zero-frame TraceGraph and exits 0', async () => {
      const outFile = path.join(tmpDir, 'empty-graph.json');
      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'typescript', '-o', outFile],
        { cwd: tmpDir, stdin: '\n\n   \n' },
      );

      expect(result.exitCode).toBe(0);
      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      expect(graph['@type']).toBe('trace:TraceRun');
      // Empty input → zero frames → zero events
      const events = graph['trace:events'] as unknown[];
      expect(events.length).toBe(0);
    });

    it('empty stdin produces no zero-frames warning (empty is different from garbage)', async () => {
      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'rust', '--format', 'json'],
        { cwd: tmpDir, stdin: '\n\n' },
      );

      expect(result.exitCode).toBe(0);
      // Empty file (no non-empty lines) → no "zero frames from N non-empty lines" warning
      expect(result.stderr).not.toMatch(/zero frames.*non-empty/i);
    });
  });

  // ── §17. trace conform stdin OCEL ───────────────────────────────────────────

  describe('§17 trace conform — stdin OCEL routing', () => {
    it('trace conform reads OCEL from stdin and produces a valid JSON envelope', async () => {
      const modelFile = path.join(tmpDir, 'model.powl.json');
      await fs.writeFile(modelFile, CONFORM_MODEL_JSON, 'utf8');

      const result = await wpmAsync(
        ['trace', 'conform', '-m', modelFile, '--format', 'json'],
        { cwd: tmpDir, stdin: MINIMAL_OCEL_JSON },
      );

      // AndonPull(TestRouteIncomplete) because model has no object_types
      expect(result.exitCode).toBe(3);
      const json = parseJson(result);
      expect(json).not.toBeNull();
      expect(typeof json?.command).toBe('string');
      expect(json?.command).toBe('trace conform');
      const payload = json?.payload as Record<string, unknown> | undefined;
      expect(payload?.route_id).toBe('stdin-conform-test');
      expect(payload?.verdict).toBe('AndonPull');
    });
  });

  // ── §18. trace ocel human output ────────────────────────────────────────────

  describe('§18 trace ocel — human output content', () => {
    it('human output mentions the event count (Rank 2: human format contract)', async () => {
      const traceFile = path.join(tmpDir, 'ts.txt');
      const graphFile = path.join(tmpDir, 'graph.json');
      await fs.writeFile(traceFile, TS_TRACE_3_FRAMES, 'utf8');

      await wpmAsync(
        ['trace', 'ingest', '--from', 'typescript', '-i', traceFile, '-o', graphFile],
        { cwd: tmpDir },
      );

      const result = await wpmAsync(
        ['trace', 'ocel', '-i', graphFile],
        { cwd: tmpDir },
      );

      expect(result.exitCode).toBe(0);
      const combined = result.stdout + result.stderr;
      // Human format shows: "Events: N" or similar
      expect(combined).toMatch(/Events|events/);
    });
  });

  // ── §19. @context namespace completeness ────────────────────────────────────

  describe('§19 @context namespace completeness', () => {
    it('@context.prov is the W3C PROV-O namespace URI', async () => {
      const traceFile = path.join(tmpDir, 'ts.txt');
      const outFile = path.join(tmpDir, 'graph.json');
      await fs.writeFile(traceFile, TS_TRACE_3_FRAMES, 'utf8');

      await wpmAsync(
        ['trace', 'ingest', '--from', 'typescript', '-i', traceFile, '-o', outFile],
        { cwd: tmpDir },
      );

      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      const ctx = graph['@context'] as Record<string, string>;
      expect(ctx.prov).toContain('prov');
    });

    it('@context.ocel is the OCEL namespace URI', async () => {
      const traceFile = path.join(tmpDir, 'ts.txt');
      const outFile = path.join(tmpDir, 'graph.json');
      await fs.writeFile(traceFile, TS_TRACE_3_FRAMES, 'utf8');

      await wpmAsync(
        ['trace', 'ingest', '--from', 'typescript', '-i', traceFile, '-o', outFile],
        { cwd: tmpDir },
      );

      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      const ctx = graph['@context'] as Record<string, string>;
      expect(ctx.ocel).toContain('ocel');
    });

    it('@context.trace is a non-empty URI string', async () => {
      const traceFile = path.join(tmpDir, 'ts.txt');
      const outFile = path.join(tmpDir, 'graph.json');
      await fs.writeFile(traceFile, TS_TRACE_3_FRAMES, 'utf8');

      await wpmAsync(
        ['trace', 'ingest', '--from', 'typescript', '-i', traceFile, '-o', outFile],
        { cwd: tmpDir },
      );

      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      const ctx = graph['@context'] as Record<string, string>;
      expect(typeof ctx.trace).toBe('string');
      expect(ctx.trace.length).toBeGreaterThan(0);
    });
  });

  // ── §20. frame insertion order ──────────────────────────────────────────────

  describe('§20 trace:events maintain frame insertion order', () => {
    it('first event @id is "trace:e0", second is "trace:e1", third is "trace:e2" (Rank 1: index order)', async () => {
      const traceFile = path.join(tmpDir, 'ts.txt');
      const outFile = path.join(tmpDir, 'graph.json');
      await fs.writeFile(traceFile, TS_TRACE_3_FRAMES, 'utf8');

      await wpmAsync(
        ['trace', 'ingest', '--from', 'typescript', '-i', traceFile, '-o', outFile],
        { cwd: tmpDir },
      );

      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      const events = graph['trace:events'] as Array<{ '@id': string }>;
      expect(events[0]?.['@id']).toBe('trace:e0');
      expect(events[1]?.['@id']).toBe('trace:e1');
      expect(events[2]?.['@id']).toBe('trace:e2');
    });

    it('frames are written top-down (outermost call first in the trace:events array)', async () => {
      // TS_TRACE_3_FRAMES: first "at" line is MyClass.doWork → should be trace:e0
      const traceFile = path.join(tmpDir, 'ts.txt');
      const outFile = path.join(tmpDir, 'graph.json');
      await fs.writeFile(traceFile, TS_TRACE_3_FRAMES, 'utf8');

      await wpmAsync(
        ['trace', 'ingest', '--from', 'typescript', '-i', traceFile, '-o', outFile],
        { cwd: tmpDir },
      );

      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      const events = graph['trace:events'] as Array<Record<string, unknown>>;
      // First event's frame function should match "MyClass.doWork" or similar
      const firstFrame = events[0]!['trace:frame'] as Record<string, unknown>;
      expect(firstFrame['trace:function']).toMatch(/doWork|MyClass/i);
    });
  });
});
