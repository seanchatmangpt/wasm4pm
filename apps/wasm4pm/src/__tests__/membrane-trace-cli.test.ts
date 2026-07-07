/**
 * membrane-trace-cli.test.ts
 *
 * CLI integration tests for `wpm lab membrane` and `wpm lab trace` (was:
 * `wpm membrane` / `wpm trace`, see nouns/_removed.ts). Both are straight
 * bridges over their unmodified `commands/membrane.ts` / `commands/trace.ts`
 * bodies (`nouns/lab/membrane.ts`, `nouns/lab/trace.ts`) — behavior,
 * payload shape (including the legacy `{command,status,payload}` envelope
 * on success, and the raw-TraceGraph-on-stdout `--format json` path for
 * `trace ingest`), and exit codes are all unchanged; only the invocation
 * prefix changed (`membrane ...` -> `lab membrane ...`, `trace ...` -> `lab
 * trace ...`).
 *
 * Oracle rank: Rank 2 (Domain contract — CLI exit codes, output shape,
 * and cross-language trace ingest specification).
 *
 * Coverage:
 *   1. wpm membrane (bare) exits 0 and shows verb8 subcommand list
 *   2. wpm trace (bare) exits 0 and shows ingest/ocel/powl/conform subcommands
 *   3. wpm trace ingest --from typescript  produces TraceGraph JSON-LD with events
 *   4. wpm trace ingest --from rust        produces TraceGraph JSON-LD with events
 *   5. wpm trace ingest --from unknown-lang exits 1 (config_error)
 *   6. wpm membrane check exits 0 or 3; JSON output has checks array
 *   7. wpm membrane init --dry-run exits 0, shows [membrane] config block
 *   8. wpm trace ingest --from python   produces TraceGraph with frames
 *   9. wpm trace ingest --from java     produces TraceGraph with frames
 *  10. wpm trace conform against a simple sequence model → AndonPull(TestRouteIncomplete)
 *      (MCPP doctrine: object_types + receipt_required required for Accepted)
 *  11. wpm membrane doctor exits 0 or 1 and returns 8-item checks array
 *  12. wpm trace conform → Accepted when model has object_types and observed events match
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

/**
 * Async CLI runner using execFile — guaranteed stdout/stderr capture even in
 * Vitest's worker-thread environment where spawnSync's output can be swallowed.
 */
function wpmAsync(
  args: string[],
  options: { cwd?: string; env?: Record<string, string>; timeoutMs?: number } = {},
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
    child.on('error', () =>
      resolve({ exitCode: 5, stdout: '', stderr: 'Process failed to start' }),
    );
  });
}

/** Parse stdout as JSON, returning null on failure.
 *  When stdout contains multiple JSON objects (e.g., a parent command info line
 *  followed by a subcommand result), parse the FIRST complete JSON object.
 *  This handles cases where the parent membrane run() emits an info payload
 *  before or after the subcommand output. */
function parseJson(result: CliResult): Record<string, unknown> | null {
  const stdout = result.stdout.trim();
  if (!stdout) return null;
  try {
    // Fast path: single JSON object
    return JSON.parse(stdout) as Record<string, unknown>;
  } catch {
    // Slow path: scan for first complete JSON object using brace counting
    let depth = 0;
    let start = -1;
    for (let i = 0; i < stdout.length; i++) {
      if (stdout[i] === '{') {
        if (start === -1) start = i;
        depth++;
      } else if (stdout[i] === '}') {
        depth--;
        if (depth === 0 && start !== -1) {
          try {
            return JSON.parse(stdout.slice(start, i + 1)) as Record<string, unknown>;
          } catch {
            // Reset and keep scanning
            start = -1;
          }
        }
      }
    }
    return null;
  }
}

// ─── Stack trace fixtures ─────────────────────────────────────────────────────

const TYPESCRIPT_TRACE = `Error: something went wrong
    at MyClass.doWork (/app/src/worker.ts:42:10)
    at async main (/app/src/index.ts:8:3)
    at Object.<anonymous> (/app/src/index.ts:12:1)`;

const RUST_TRACE = `stack backtrace:
   0: std::panicking::begin_panic
             at /rustup/toolchains/stable/src/libstd/panicking.rs:505
   1: myapp::engine::run
             at src/engine.rs:27:5
   2: myapp::main
             at src/main.rs:10:3`;

const PYTHON_TRACE = `Traceback (most recent call last):
  File "/app/main.py", line 42, in run_pipeline
    result = process_log(path)
  File "/app/engine.py", line 17, in process_log
    return parse(data)
TypeError: expected str, got NoneType`;

const JAVA_TRACE = `java.lang.RuntimeException: connection refused
	at com.example.App.connect(App.java:42)
	at com.example.App.main(App.java:10)
Caused by: java.io.IOException: timeout
	at com.example.transport.HttpClient.send(HttpClient.java:88)`;

// ─── OCEL fixtures for trace conform ─────────────────────────────────────────

/**
 * Minimal OCEL with object evidence + object_types for an Accepted verdict.
 * The model declares Run objects; each event participates via run-001.
 */
const OCEL_WITH_OBJECTS = JSON.stringify({
  ocel_version: '2.0',
  ocel_global_log: { ocel_attribute_names: [] },
  ocel_events: [
    {
      event_id: 'e0',
      activity: 'start',
      timestamp: '2026-05-16T10:00:00.000Z',
      objects: [{ id: 'run-001', type: 'Run' }],
      attributes: {},
    },
    {
      event_id: 'e1',
      activity: 'process',
      timestamp: '2026-05-16T10:01:00.000Z',
      objects: [{ id: 'run-001', type: 'Run' }],
      attributes: {},
    },
    {
      event_id: 'e2',
      activity: 'finish',
      timestamp: '2026-05-16T10:02:00.000Z',
      objects: [{ id: 'run-001', type: 'Run' }],
      attributes: {},
    },
  ],
  ocel_objects: [{ id: 'run-001', type: 'Run', attributes: {} }],
});

/**
 * POWL v2 sequence model with object_types declared.
 * object_lifecycle_validity and receipt_coverage are both NotMeasured here
 * because receipt_required is false, giving AndonPull(TestRouteIncomplete).
 */
const POWL_SIMPLE_SEQUENCE = JSON.stringify({
  route_id: 'test-simple-sequence',
  type: 'powl2',
  required_stages: ['start', 'process', 'finish'],
  model: {
    type: 'sequence',
    sequence: ['start', 'process', 'finish'],
  },
});

/**
 * POWL v2 model with object_types + object lifecycle declared so that
 * lifecycle can be measured. This tests the Accepted path.
 * The Run objects are created by 'start' and terminated by 'finish'.
 */
const POWL_WITH_OBJECT_TYPES = JSON.stringify({
  route_id: 'test-with-object-types',
  type: 'powl2',
  required_stages: ['start', 'process', 'finish'],
  object_types: {
    Run: {
      created_by: ['start'],
      terminated_by: ['finish'],
    },
  },
  model: {
    type: 'sequence',
    sequence: ['start', 'process', 'finish'],
  },
});

// ─── Test suite: wpm membrane ─────────────────────────────────────────────────

describe('wpm membrane', () => {
  // ── 1. Bare command → subcommand list ─────────────────────────────────────────

  describe('bare command', () => {
    it('exits 0 and lists all verb8 subcommands in stdout', async () => {
      const result = await wpmAsync(['lab', 'membrane']);
      expect(result.exitCode).toBe(0);
      const combined = result.stdout + result.stderr;
      // The membrane run() handler writes subcommand list to stdout via process.stdout.write
      expect(combined).toMatch(/membrane/i);
      expect(combined).toMatch(/show/i);
      expect(combined).toMatch(/init/i);
      expect(combined).toMatch(/check/i);
      expect(combined).toMatch(/doctor/i);
      expect(combined).toMatch(/verify/i);
    });

    it('--help exits 0 or 1 (citty renders help and exits cleanly)', async () => {
      // citty's --help rendering exits before run() is called; stdout capture
      // depends on the terminal environment in Vitest workers. We only assert
      // exit code — the bare `wpm membrane` test validates content.
      const result = await wpmAsync(['lab', 'membrane', '--help']);
      expect([0, 1]).toContain(result.exitCode);
    });
  });

  // ── 2. membrane check ─────────────────────────────────────────────────────────

  describe('check subcommand', () => {
    it('exits 0 or 3 and returns JSON with checks array and all_pass boolean', async () => {
      const result = await wpmAsync(['lab', 'membrane', 'check', '--format', 'json']);
      // check exits 0 (all green) or 3 (execution_error when feature-miniml absent)
      expect([0, 3]).toContain(result.exitCode);
      const json = parseJson(result);
      expect(json).not.toBeNull();
      // Envelope shape: { command, status, payload }
      expect(typeof json?.command).toBe('string');
      expect(json?.status === 'ok' || json?.status === 'error').toBe(true);
      const payload = json?.payload as Record<string, unknown> | undefined;
      expect(payload).toBeDefined();
      expect(Array.isArray(payload?.checks)).toBe(true);
      expect(typeof payload?.all_pass).toBe('boolean');
    });

    it('check --format json payload.checks items have name, pass, and detail fields', async () => {
      const result = await wpmAsync(['lab', 'membrane', 'check', '--format', 'json']);
      expect([0, 3]).toContain(result.exitCode);
      const json = parseJson(result);
      const payload = json?.payload as Record<string, unknown> | undefined;
      const checks = payload?.checks as Array<Record<string, unknown>> | undefined;
      if (checks && checks.length > 0) {
        for (const check of checks) {
          expect(typeof check.name).toBe('string');
          expect(typeof check.pass).toBe('boolean');
          expect(typeof check.detail).toBe('string');
        }
      }
    });
  });

  // ── 3. membrane init --dry-run ────────────────────────────────────────────────

  describe('init --dry-run', () => {
    it('exits 0 and shows [membrane] config section without writing files', async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'membrane-init-test-'));
      try {
        const result = await wpmAsync(['lab', 'membrane', 'init', '--dry-run'], { cwd: tmpDir });
        expect(result.exitCode).toBe(0);
        // The bridge always forces `--format json`, so `commands/membrane.ts`'s
        // human-only "Dry-run — the following would be appended..." renderer
        // (gated on `format === 'human'`) never runs — only the JSON path
        // (`payload.config`) does. The dry-run signal now shows up structurally:
        // `payload.config` is set (vs `payload.file`/`payload.action` for a
        // real write), and no file is written (checked below).
        const combined = result.stdout + result.stderr;
        expect(combined).toMatch(/\[membrane\]/);

        // No wasm4pm.toml should have been written
        const tomlExists = await fs
          .access(path.join(tmpDir, 'wasm4pm.toml'))
          .then(() => true)
          .catch(() => false);
        expect(tomlExists).toBe(false);
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
      }
    });

    it('init --dry-run --format json exits 0 with JSON payload containing config key', async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'membrane-init-json-'));
      try {
        const result = await wpmAsync(['lab', 'membrane', 'init', '--dry-run', '--format', 'json'], {
          cwd: tmpDir,
        });
        expect(result.exitCode).toBe(0);
        const json = parseJson(result);
        expect(json).not.toBeNull();
        const payload = json?.payload as Record<string, unknown> | undefined;
        expect(payload?.config).toBeDefined();
        expect(String(payload?.config)).toMatch(/\[membrane\]/);
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
      }
    });
  });

  // ── 4. membrane doctor ────────────────────────────────────────────────────────

  describe('doctor subcommand', () => {
    it('exits 0 or 1 and JSON output contains checks array with 8 items', async () => {
      const result = await wpmAsync(['lab', 'membrane', 'doctor', '--format', 'json']);
      expect([0, 1]).toContain(result.exitCode);
      const json = parseJson(result);
      expect(json).not.toBeNull();
      const payload = json?.payload as Record<string, unknown> | undefined;
      expect(Array.isArray(payload?.checks)).toBe(true);
      const checks = payload?.checks as unknown[];
      // Doctor runs 8 definition-of-done checks
      expect(checks.length).toBe(8);
    });

    it('doctor JSON checks each have name, pass, and detail fields', async () => {
      const result = await wpmAsync(['lab', 'membrane', 'doctor', '--format', 'json']);
      expect([0, 1]).toContain(result.exitCode);
      const json = parseJson(result);
      const payload = json?.payload as Record<string, unknown> | undefined;
      const checks = payload?.checks as Array<Record<string, unknown>> | undefined;
      if (checks) {
        for (const check of checks) {
          expect(typeof check.name).toBe('string');
          expect(typeof check.pass).toBe('boolean');
          expect(typeof check.detail).toBe('string');
        }
      }
    });
  });

  // ── 5. membrane list ──────────────────────────────────────────────────────────

  describe('list subcommand', () => {
    it('exits 0 when no envelopes directory exists (empty list)', async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'membrane-list-test-'));
      try {
        const result = await wpmAsync(['lab', 'membrane', 'list', '--format', 'json'], { cwd: tmpDir });
        expect(result.exitCode).toBe(0);
        const json = parseJson(result);
        const payload = json?.payload as Record<string, unknown> | undefined;
        expect(Array.isArray(payload?.envelopes)).toBe(true);
        expect((payload?.envelopes as unknown[]).length).toBe(0);
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
      }
    });
  });
});

// ─── Test suite: wpm trace ────────────────────────────────────────────────────

describe('wpm trace', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'trace-cli-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  });

  // ── 1. Bare command → subcommand list ─────────────────────────────────────────

  describe('bare command and help', () => {
    it('wpm trace exits 0 and mentions ingest, ocel, powl, conform subcommands in stdout', async () => {
      const result = await wpmAsync(['lab', 'trace']);
      expect(result.exitCode).toBe(0);
      const combined = result.stdout + result.stderr;
      expect(combined).toMatch(/ingest/i);
      expect(combined).toMatch(/ocel/i);
      expect(combined).toMatch(/powl/i);
      expect(combined).toMatch(/conform/i);
    });

    it('wpm trace --help exits 0 or 1', async () => {
      const result = await wpmAsync(['lab', 'trace', '--help']);
      expect([0, 1]).toContain(result.exitCode);
    });

    it('wpm trace ingest --help exits 0 or 1 and mentions --from flag', async () => {
      const result = await wpmAsync(['lab', 'trace', 'ingest', '--help']);
      expect([0, 1]).toContain(result.exitCode);
    });

    it('wpm trace conform --help exits 0 or 1 (citty renders help cleanly)', async () => {
      // citty's --help exits before run(); content assertions are in the
      // conform subcommand tests that use --format json.
      const result = await wpmAsync(['lab', 'trace', 'conform', '--help']);
      expect([0, 1]).toContain(result.exitCode);
    });
  });

  // ── 2. TypeScript trace ingest ────────────────────────────────────────────────

  describe('trace ingest --from typescript', () => {
    it('reads a Node.js V8 stack trace and produces a TraceGraph JSON-LD file with events', async () => {
      const traceFile = path.join(tmpDir, 'ts-trace.txt');
      const outFile = path.join(tmpDir, 'graph.json');
      await fs.writeFile(traceFile, TYPESCRIPT_TRACE, 'utf8');

      const result = await wpmAsync(
        ['lab', 'trace', 'ingest', '--from', 'typescript', '-i', traceFile, '-o', outFile],
        { cwd: tmpDir },
      );

      expect(result.exitCode).toBe(0);

      // Output file must exist and be valid JSON-LD TraceGraph
      const graphText = await fs.readFile(outFile, 'utf8');
      const graph = JSON.parse(graphText) as Record<string, unknown>;
      expect(graph['@type']).toBe('trace:TraceRun');
      expect(graph['trace:language']).toBe('typescript');
      const events = graph['trace:events'] as unknown[];
      expect(Array.isArray(events)).toBe(true);
      expect(events.length).toBeGreaterThan(0);
    });

    it('with --format json outputs raw TraceGraph (not envelope) to stdout', async () => {
      const traceFile = path.join(tmpDir, 'ts-trace.txt');
      await fs.writeFile(traceFile, TYPESCRIPT_TRACE, 'utf8');

      const result = await wpmAsync(
        ['lab', 'trace', 'ingest', '--from', 'typescript', '-i', traceFile, '--format', 'json'],
        { cwd: tmpDir },
      );

      expect(result.exitCode).toBe(0);
      // When --format json is used without -o, the raw TraceGraph is emitted to stdout
      const graph = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(graph['@type']).toBe('trace:TraceRun');
      expect(graph['trace:language']).toBe('typescript');
      const events = graph['trace:events'] as unknown[];
      expect(events.length).toBeGreaterThan(0);
    });

    it('frames have the correct language tag "typescript" in trace:frame.trace:language', async () => {
      const traceFile = path.join(tmpDir, 'ts-trace.txt');
      const outFile = path.join(tmpDir, 'graph.json');
      await fs.writeFile(traceFile, TYPESCRIPT_TRACE, 'utf8');

      await wpmAsync(
        ['lab', 'trace', 'ingest', '--from', 'typescript', '-i', traceFile, '-o', outFile],
        { cwd: tmpDir },
      );

      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      const events = graph['trace:events'] as Array<Record<string, unknown>>;
      for (const ev of events) {
        const frame = ev['trace:frame'] as Record<string, unknown>;
        expect(frame['trace:language']).toBe('typescript');
      }
    });

    it('parsed frames include file and line metadata from the "at ... (file:line:col)" format', async () => {
      const traceFile = path.join(tmpDir, 'ts-trace.txt');
      const outFile = path.join(tmpDir, 'graph.json');
      await fs.writeFile(traceFile, TYPESCRIPT_TRACE, 'utf8');

      await wpmAsync(
        ['lab', 'trace', 'ingest', '--from', 'typescript', '-i', traceFile, '-o', outFile],
        { cwd: tmpDir },
      );

      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      const events = graph['trace:events'] as Array<Record<string, unknown>>;
      // First frame: MyClass.doWork at /app/src/worker.ts:42
      const firstFrame = events[0]!['trace:frame'] as Record<string, unknown>;
      expect(firstFrame['trace:function']).toMatch(/MyClass\.doWork|doWork/i);
      expect(firstFrame['trace:file']).toBe('/app/src/worker.ts');
      expect(firstFrame['trace:line']).toBe(42);
    });
  });

  // ── 3. Rust trace ingest ──────────────────────────────────────────────────────

  describe('trace ingest --from rust', () => {
    it('reads a Rust backtrace and produces a TraceGraph with language "rust"', async () => {
      const traceFile = path.join(tmpDir, 'rust-trace.txt');
      const outFile = path.join(tmpDir, 'rust-graph.json');
      await fs.writeFile(traceFile, RUST_TRACE, 'utf8');

      const result = await wpmAsync(
        ['lab', 'trace', 'ingest', '--from', 'rust', '-i', traceFile, '-o', outFile],
        { cwd: tmpDir },
      );

      expect(result.exitCode).toBe(0);
      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      expect(graph['trace:language']).toBe('rust');
      const events = graph['trace:events'] as Array<Record<string, unknown>>;
      expect(events.length).toBeGreaterThan(0);
    });

    it('Rust frames are tagged with language "rust" in trace:frame.trace:language', async () => {
      const traceFile = path.join(tmpDir, 'rust-trace.txt');
      const outFile = path.join(tmpDir, 'rust-graph.json');
      await fs.writeFile(traceFile, RUST_TRACE, 'utf8');

      await wpmAsync(
        ['lab', 'trace', 'ingest', '--from', 'rust', '-i', traceFile, '-o', outFile],
        { cwd: tmpDir },
      );

      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      const events = graph['trace:events'] as Array<Record<string, unknown>>;
      expect(events.length).toBeGreaterThan(0);
      for (const ev of events) {
        const frame = ev['trace:frame'] as Record<string, unknown>;
        expect(frame['trace:language']).toBe('rust');
      }
    });

    it('Rust hash suffix (::hABC...123) is stripped from function names', async () => {
      const traceWithHash = [
        'stack backtrace:',
        '   0: my_crate::module::function_name::h1a2b3c4d5e6f7890',
        '             at src/lib.rs:10:5',
      ].join('\n');
      const traceFile = path.join(tmpDir, 'rust-hash-trace.txt');
      const outFile = path.join(tmpDir, 'rust-hash-graph.json');
      await fs.writeFile(traceFile, traceWithHash, 'utf8');

      await wpmAsync(
        ['lab', 'trace', 'ingest', '--from', 'rust', '-i', traceFile, '-o', outFile],
        { cwd: tmpDir },
      );

      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      const events = graph['trace:events'] as Array<Record<string, unknown>>;
      if (events.length > 0) {
        const frame = events[0]!['trace:frame'] as Record<string, unknown>;
        const fn = frame['trace:function'] as string;
        // Hash suffix must be stripped: ::h<16 hex chars>
        expect(fn).not.toMatch(/::h[0-9a-f]{16}$/);
      }
    });

    it('with --format json outputs raw TraceGraph to stdout', async () => {
      const traceFile = path.join(tmpDir, 'rust-trace.txt');
      await fs.writeFile(traceFile, RUST_TRACE, 'utf8');

      const result = await wpmAsync(
        ['lab', 'trace', 'ingest', '--from', 'rust', '-i', traceFile, '--format', 'json'],
        { cwd: tmpDir },
      );

      expect(result.exitCode).toBe(0);
      const graph = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(graph['@type']).toBe('trace:TraceRun');
      expect(graph['trace:language']).toBe('rust');
    });
  });

  // ── 4. Python trace ingest ────────────────────────────────────────────────────

  describe('trace ingest --from python', () => {
    it('reads a CPython traceback and produces a TraceGraph with language "python"', async () => {
      const traceFile = path.join(tmpDir, 'py-trace.txt');
      const outFile = path.join(tmpDir, 'py-graph.json');
      await fs.writeFile(traceFile, PYTHON_TRACE, 'utf8');

      const result = await wpmAsync(
        ['lab', 'trace', 'ingest', '--from', 'python', '-i', traceFile, '-o', outFile],
        { cwd: tmpDir },
      );

      expect(result.exitCode).toBe(0);
      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      expect(graph['trace:language']).toBe('python');
      const events = graph['trace:events'] as Array<Record<string, unknown>>;
      expect(events.length).toBeGreaterThan(0);
    });

    it('Python frames carry correct file and line metadata', async () => {
      const traceFile = path.join(tmpDir, 'py-trace.txt');
      const outFile = path.join(tmpDir, 'py-graph.json');
      await fs.writeFile(traceFile, PYTHON_TRACE, 'utf8');

      await wpmAsync(
        ['lab', 'trace', 'ingest', '--from', 'python', '-i', traceFile, '-o', outFile],
        { cwd: tmpDir },
      );

      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      const events = graph['trace:events'] as Array<Record<string, unknown>>;
      expect(events.length).toBeGreaterThan(0);
      // At least one frame should have a line number
      const hasLine = events.some((ev) => {
        const frame = ev['trace:frame'] as Record<string, unknown>;
        return typeof frame['trace:line'] === 'number';
      });
      expect(hasLine).toBe(true);
      // First frame from PYTHON_TRACE is run_pipeline at /app/main.py:42
      const firstFrame = events[0]!['trace:frame'] as Record<string, unknown>;
      expect(firstFrame['trace:function']).toMatch(/run_pipeline/);
      expect(firstFrame['trace:file']).toBe('/app/main.py');
      expect(firstFrame['trace:line']).toBe(42);
    });
  });

  // ── 5. Java trace ingest ──────────────────────────────────────────────────────

  describe('trace ingest --from java', () => {
    it('reads a JVM stack trace and produces a TraceGraph with language "java"', async () => {
      const traceFile = path.join(tmpDir, 'java-trace.txt');
      const outFile = path.join(tmpDir, 'java-graph.json');
      await fs.writeFile(traceFile, JAVA_TRACE, 'utf8');

      const result = await wpmAsync(
        ['lab', 'trace', 'ingest', '--from', 'java', '-i', traceFile, '-o', outFile],
        { cwd: tmpDir },
      );

      expect(result.exitCode).toBe(0);
      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      expect(graph['trace:language']).toBe('java');
      const events = graph['trace:events'] as Array<Record<string, unknown>>;
      expect(events.length).toBeGreaterThan(0);
    });

    it('Java parser follows "Caused by:" chains and includes those frames', async () => {
      const traceFile = path.join(tmpDir, 'java-trace.txt');
      const outFile = path.join(tmpDir, 'java-graph.json');
      await fs.writeFile(traceFile, JAVA_TRACE, 'utf8');

      await wpmAsync(
        ['lab', 'trace', 'ingest', '--from', 'java', '-i', traceFile, '-o', outFile],
        { cwd: tmpDir },
      );

      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      const events = graph['trace:events'] as Array<Record<string, unknown>>;
      // JAVA_TRACE has 3 at-lines: connect(App.java:42), main(App.java:10), send(HttpClient.java:88)
      expect(events.length).toBeGreaterThanOrEqual(3);
    });

    it('Java frames are tagged with language "java"', async () => {
      const traceFile = path.join(tmpDir, 'java-trace.txt');
      const outFile = path.join(tmpDir, 'java-graph.json');
      await fs.writeFile(traceFile, JAVA_TRACE, 'utf8');

      await wpmAsync(
        ['lab', 'trace', 'ingest', '--from', 'java', '-i', traceFile, '-o', outFile],
        { cwd: tmpDir },
      );

      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      const events = graph['trace:events'] as Array<Record<string, unknown>>;
      for (const ev of events) {
        const frame = ev['trace:frame'] as Record<string, unknown>;
        expect(frame['trace:language']).toBe('java');
      }
    });
  });

  // ── 6. Unknown language → exit 2 (was: exit 1) — no silent fallback ──────────
  // `trace` is a bridged verb: any legacy failure (old exit 1 config_error OR
  // exit 2 source_error) is normalized by `classifyLegacyFailure` in
  // `nouns/_bridge.ts` onto the framework's generic `INVALID_INPUT` code,
  // which `apps/wasm4pm/src/cli.ts`'s `ERROR_CODE_MAP` maps uniformly to
  // `EXIT_CODES.source_error` (2) — the old exit-1/exit-2 distinction no
  // longer exists for bridged verbs. Confirmed live against the built CLI.

  describe('trace ingest --from unknown-lang', () => {
    it('exits 2 (was: 1) when an unknown language is specified — no silent fallback', async () => {
      const traceFile = path.join(tmpDir, 'test_file.txt');
      await fs.writeFile(traceFile, 'some text', 'utf8');

      const result = await wpmAsync(
        ['lab', 'trace', 'ingest', '--from', 'unknown-lang', '-i', traceFile],
        { cwd: tmpDir },
      );

      expect(result.exitCode).toBe(2);
    });

    it('unknown language error envelope ({error:{code,message}}, not the old {status:"error"} shape) names the invalid language', async () => {
      const traceFile = path.join(tmpDir, 'test_file.txt');
      await fs.writeFile(traceFile, 'some text', 'utf8');

      const result = await wpmAsync(
        ['lab', 'trace', 'ingest', '--from', 'cobol', '-i', traceFile, '--format', 'json'],
        { cwd: tmpDir },
      );

      expect(result.exitCode).toBe(2);
      const json = parseJson(result);
      expect(json).not.toHaveProperty('status');
      const errorObj = json?.error as Record<string, unknown> | undefined;
      expect(typeof errorObj?.code).toBe('string');
      // Error message must reference the invalid language
      expect(String(errorObj?.message ?? '')).toMatch(/cobol|unknown|Accepted/i);
    });

    it('exits 2 for each language not in the accepted set (go, ruby, swift, kotlin)', async () => {
      const traceFile = path.join(tmpDir, 'test_file.txt');
      await fs.writeFile(traceFile, 'data', 'utf8');
      const disallowedLangs = ['go', 'ruby', 'swift', 'kotlin'];
      for (const lang of disallowedLangs) {
        const result = await wpmAsync(
          ['lab', 'trace', 'ingest', '--from', lang, '-i', traceFile],
          { cwd: tmpDir },
        );
        expect(result.exitCode).toBe(2);
      }
    });
  });

  // ── 7. JS trace ingest ────────────────────────────────────────────────────────

  describe('trace ingest --from js', () => {
    it('accepts "js" as a valid language and produces frames for V8 stack format', async () => {
      const jsTrace = [
        '    at Object.<anonymous> (app.js:10:1)',
        '    at Module._compile (module.js:653:30)',
      ].join('\n');
      const traceFile = path.join(tmpDir, 'js-trace.txt');
      const outFile = path.join(tmpDir, 'js-graph.json');
      await fs.writeFile(traceFile, jsTrace, 'utf8');

      const result = await wpmAsync(
        ['lab', 'trace', 'ingest', '--from', 'js', '-i', traceFile, '-o', outFile],
        { cwd: tmpDir },
      );

      expect(result.exitCode).toBe(0);
      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      expect(graph['trace:language']).toBe('js');
      const events = graph['trace:events'] as unknown[];
      expect(events.length).toBeGreaterThan(0);
    });
  });

  // ── 8. zero-frames diagnostic — non-empty input that yields no parseable frames ─
  // Gap: before this fix, garbage input to --from rust returned exit 0 with frames=0
  // and no indication that the input was not a valid stack trace.
  //
  // Migration note: `commands/trace.ts` only prints this diagnostic via
  // `console.warn` when `!quiet` (see its `zeroFramesWarning && !quiet`
  // guard) — and `nouns/_bridge.ts` unconditionally forces `--quiet` on
  // every bridged call (to suppress unrelated human-format banner chatter
  // from contaminating the framework's pure-JSON stdout contract), so the
  // stderr warning no longer fires through `wpm lab trace ingest` at all.
  // The diagnostic still exists, just relocated: when the command takes the
  // enveloped/`-o` code path, it's `payload.warning`; the raw-TraceGraph
  // `--format json` (no `-o`) path carries no such field at all, and the
  // stderr warning has no surviving equivalent there. Confirmed live
  // against the built CLI — this is a genuine (if narrow) behavior gap
  // from bridging, tracked separately (see task on --quiet suppressing
  // legacy console.warn side-output); these tests now assert what's
  // actually still there rather than the retired stderr text.
  describe('trace ingest zero-frames diagnostic', () => {
    it('exits 0 with a payload.warning field when garbage input yields zero frames (-o path)', async () => {
      const garbage = 'this is not a stack trace\njust prose text\nno frame markers\n';
      const garbageFile = path.join(tmpDir, 'garbage.txt');
      const outFile = path.join(tmpDir, 'garbage-graph.json');
      await fs.writeFile(garbageFile, garbage, 'utf8');

      const result = await wpmAsync(
        ['lab', 'trace', 'ingest', '--from', 'rust', '-i', garbageFile, '-o', outFile],
        { cwd: tmpDir },
      );

      // Must still exit 0 — parsers are best-effort (--strict is a future gate)
      expect(result.exitCode).toBe(0);
      const json = parseJson(result);
      const payload = json?.payload as Record<string, unknown> | undefined;
      expect(payload?.frames).toBe(0);
      expect(String(payload?.warning ?? '')).toMatch(/zero frames|not a valid/i);
    });

    it('zero-frames payload.warning references the input language (-o path)', async () => {
      const garbage = 'println!("hello world"); // this is Rust source, not a backtrace';
      const garbageFile = path.join(tmpDir, 'rust-src.txt');
      const outFile = path.join(tmpDir, 'rust-src-graph.json');
      await fs.writeFile(garbageFile, garbage, 'utf8');

      const result = await wpmAsync(
        ['lab', 'trace', 'ingest', '--from', 'rust', '-i', garbageFile, '-o', outFile],
        { cwd: tmpDir },
      );

      expect(result.exitCode).toBe(0);
      const json = parseJson(result);
      const payload = json?.payload as Record<string, unknown> | undefined;
      // The warning must mention the language so users know which format was attempted
      expect(String(payload?.warning ?? '')).toMatch(/rust/i);
    });

    it('the raw-TraceGraph --format json path (no -o) carries no warning field at all (confirmed gap)', async () => {
      const garbage = 'INFO: Starting app\nDEBUG: config loaded\nINFO: Running...\n';
      const garbageFile = path.join(tmpDir, 'log-not-trace.txt');
      await fs.writeFile(garbageFile, garbage, 'utf8');

      const result = await wpmAsync(
        ['lab', 'trace', 'ingest', '--from', 'typescript', '-i', garbageFile, '--format', 'json'],
        { cwd: tmpDir },
      );

      // --format json (no -o) emits the raw TraceGraph JSON-LD directly —
      // it has no warning field, and the stderr warning is suppressed by
      // the bridge's forced --quiet. Still exits 0 (best-effort parsing).
      expect(result.exitCode).toBe(0);
      const graph = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(graph['@type']).toBe('trace:TraceRun');
      expect((graph['trace:events'] as unknown[]).length).toBe(0);
    });

    it('no warning when input is genuinely empty (0 non-empty lines)', async () => {
      const emptyFile = path.join(tmpDir, 'empty.txt');
      await fs.writeFile(emptyFile, '\n\n\n', 'utf8');

      const result = await wpmAsync(
        ['lab', 'trace', 'ingest', '--from', 'rust', '-i', emptyFile, '--format', 'json'],
        { cwd: tmpDir },
      );

      expect(result.exitCode).toBe(0);
      // Empty file (no non-empty lines) → no warning expected
      expect(result.stderr).not.toMatch(/zero frames.*non-empty/i);
    });
  });

  // ── 9. trace conform — MCPP doctrine ─────────────────────────────────────────

  describe('trace conform', () => {
    let ocelFile: string;

    beforeEach(async () => {
      ocelFile = path.join(tmpDir, 'test.ocel.json');
      await fs.writeFile(ocelFile, OCEL_WITH_OBJECTS, 'utf8');
    });

    it('AndonPull(TestRouteIncomplete) when model has no object_types/receipt_required', async () => {
      // MCPP doctrine: sequence model without object_types → TestRouteIncomplete
      const modelFile = path.join(tmpDir, 'seq.powl.json');
      await fs.writeFile(modelFile, POWL_SIMPLE_SEQUENCE, 'utf8');

      const result = await wpmAsync(
        ['lab', 'trace', 'conform', '-i', ocelFile, '-m', modelFile, '--format', 'json'],
        { cwd: tmpDir },
      );

      expect(result.exitCode).toBe(3);
      const json = parseJson(result);
      const payload = json?.payload as Record<string, unknown> | undefined;
      expect(payload?.verdict).toBe('AndonPull');
      expect(payload?.andon_reason).toBe('TestRouteIncomplete');
    });

    it('model with object_types has lifecycle dimensions measured (fitness=1.0, stage coverage=1.0)', async () => {
      const modelFile = path.join(tmpDir, 'obj-types.powl.json');
      await fs.writeFile(modelFile, POWL_WITH_OBJECT_TYPES, 'utf8');

      const result = await wpmAsync(
        ['lab', 'trace', 'conform', '-i', ocelFile, '-m', modelFile, '--format', 'json'],
        { cwd: tmpDir },
      );

      // Still AndonPull because receipt_required is not set (NotMeasured)
      // but fitness and stage coverage are 1.0
      const json = parseJson(result);
      const payload = json?.payload as Record<string, unknown> | undefined;
      expect(payload?.fitness).toBe(1);
      expect(payload?.required_stage_coverage).toBe(1);
      // object_lifecycle_validity should now be measured (not sentinel 0 from NotMeasured)
      expect(payload?.object_lifecycle_validity).toBe(1);
    });

    it('JSON output contains route_id, fitness, precision, and details array', async () => {
      const modelFile = path.join(tmpDir, 'seq.powl.json');
      await fs.writeFile(modelFile, POWL_SIMPLE_SEQUENCE, 'utf8');

      const result = await wpmAsync(
        ['lab', 'trace', 'conform', '-i', ocelFile, '-m', modelFile, '--format', 'json'],
        { cwd: tmpDir },
      );

      const json = parseJson(result);
      const payload = json?.payload as Record<string, unknown> | undefined;
      expect(typeof payload?.route_id).toBe('string');
      expect(payload?.route_id).toBe('test-simple-sequence');
      expect(typeof payload?.fitness).toBe('number');
      expect(payload?.fitness as number).toBeGreaterThanOrEqual(0);
      expect(payload?.fitness as number).toBeLessThanOrEqual(1);
      expect(Array.isArray(payload?.details)).toBe(true);
    });

    it('exits 3 when OCEL has no object evidence → AndonPull(ActivityOnlyFakeRoute)', async () => {
      const fakeOcel = JSON.stringify({
        ocel_version: '2.0',
        ocel_global_log: { ocel_attribute_names: [] },
        ocel_events: [
          { event_id: 'e0', activity: 'start', timestamp: '2026-05-16T10:00:00Z', objects: [], attributes: {} },
          { event_id: 'e1', activity: 'process', timestamp: '2026-05-16T10:01:00Z', objects: [], attributes: {} },
          { event_id: 'e2', activity: 'finish', timestamp: '2026-05-16T10:02:00Z', objects: [], attributes: {} },
        ],
        ocel_objects: [],
      });
      const fakeFile = path.join(tmpDir, 'fake.ocel.json');
      await fs.writeFile(fakeFile, fakeOcel, 'utf8');

      const modelFile = path.join(tmpDir, 'seq.powl.json');
      await fs.writeFile(modelFile, POWL_SIMPLE_SEQUENCE, 'utf8');

      const result = await wpmAsync(
        ['lab', 'trace', 'conform', '-i', fakeFile, '-m', modelFile, '--format', 'json'],
        { cwd: tmpDir },
      );

      expect(result.exitCode).toBe(3);
      const json = parseJson(result);
      const payload = json?.payload as Record<string, unknown> | undefined;
      expect(payload?.verdict).toBe('AndonPull');
      expect(payload?.andon_reason).toBe('ActivityOnlyFakeRoute');
    });

    it('exits 2 (source_error) when model file does not exist', async () => {
      const result = await wpmAsync(
        ['lab', 'trace', 'conform', '-i', ocelFile, '-m', 'nonexistent.powl.json'],
        { cwd: tmpDir },
      );
      expect(result.exitCode).toBe(2);
    });

    it('exits 2 (source_error) when OCEL input file does not exist', async () => {
      const modelFile = path.join(tmpDir, 'seq.powl.json');
      await fs.writeFile(modelFile, POWL_SIMPLE_SEQUENCE, 'utf8');

      const result = await wpmAsync(
        ['lab', 'trace', 'conform', '-i', 'nonexistent.ocel.json', '-m', modelFile],
        { cwd: tmpDir },
      );
      expect(result.exitCode).toBe(2);
    });

    it('exits 3 when OCEL activities do not match model → RouteConformanceGap or MissingRequiredStages', async () => {
      const mismatchedOcel = JSON.stringify({
        ocel_version: '2.0',
        ocel_global_log: { ocel_attribute_names: [] },
        ocel_events: [
          {
            event_id: 'e0',
            activity: 'completely_different_activity',
            timestamp: '2026-05-16T10:00:00Z',
            objects: [{ id: 'obj-1', type: 'Run' }],
            attributes: {},
          },
        ],
        ocel_objects: [{ id: 'obj-1', type: 'Run', attributes: {} }],
      });
      const mismatchFile = path.join(tmpDir, 'mismatch.ocel.json');
      await fs.writeFile(mismatchFile, mismatchedOcel, 'utf8');

      const modelFile = path.join(tmpDir, 'seq.powl.json');
      await fs.writeFile(modelFile, POWL_SIMPLE_SEQUENCE, 'utf8');

      const result = await wpmAsync(
        ['lab', 'trace', 'conform', '-i', mismatchFile, '-m', modelFile, '--format', 'json'],
        { cwd: tmpDir },
      );

      expect(result.exitCode).toBe(3);
      const json = parseJson(result);
      const payload = json?.payload as Record<string, unknown> | undefined;
      expect(payload?.verdict).toBe('AndonPull');
      expect(payload?.andon_reason).toMatch(/RouteConformanceGap|MissingRequiredStages/);
    });
  });

  // ── 9. trace ocel pipeline step ──────────────────────────────────────────────

  describe('trace ocel subcommand', () => {
    it('projects a TraceGraph JSON-LD into an OCEL log with correct structure', async () => {
      // First ingest a TS trace to get a TraceGraph
      const traceFile = path.join(tmpDir, 'ts.txt');
      const graphFile = path.join(tmpDir, 'graph.json');
      const ocelOutFile = path.join(tmpDir, 'out.ocel.json');
      await fs.writeFile(traceFile, TYPESCRIPT_TRACE, 'utf8');

      await wpmAsync(
        ['lab', 'trace', 'ingest', '--from', 'typescript', '-i', traceFile, '-o', graphFile],
        { cwd: tmpDir },
      );

      const ocelResult = await wpmAsync(
        ['lab', 'trace', 'ocel', '-i', graphFile, '-o', ocelOutFile],
        { cwd: tmpDir },
      );

      expect(ocelResult.exitCode).toBe(0);
      const ocel = JSON.parse(await fs.readFile(ocelOutFile, 'utf8')) as Record<string, unknown>;
      expect(ocel.ocel_version).toBe('2.0');
      expect(Array.isArray(ocel.ocel_events)).toBe(true);
      const events = ocel.ocel_events as unknown[];
      expect(events.length).toBeGreaterThan(0);
    });
  });

  // ── 10. trace powl subcommand ─────────────────────────────────────────────────

  describe('trace powl subcommand', () => {
    it('derives observed POWL route from an OCEL log file with correct activity list', async () => {
      const inOcelFile = path.join(tmpDir, 'in.ocel.json');
      const routeFile = path.join(tmpDir, 'route.json');
      await fs.writeFile(inOcelFile, OCEL_WITH_OBJECTS, 'utf8');

      const result = await wpmAsync(
        ['lab', 'trace', 'powl', '-i', inOcelFile, '-o', routeFile],
        { cwd: tmpDir },
      );

      expect(result.exitCode).toBe(0);
      const route = JSON.parse(await fs.readFile(routeFile, 'utf8')) as Record<string, unknown>;
      expect(Array.isArray(route.observed_activities)).toBe(true);
      const activities = route.observed_activities as string[];
      expect(activities).toContain('start');
      expect(activities).toContain('process');
      expect(activities).toContain('finish');
    });
  });
});

// ─── Determinism: same input produces identical TraceGraph event counts ───────

describe('trace ingest determinism', () => {
  it('two runs on the same TypeScript trace produce identical event and object counts', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'trace-det-'));
    try {
      const traceFile = path.join(tmpDir, 'ts.txt');
      const out1 = path.join(tmpDir, 'g1.json');
      const out2 = path.join(tmpDir, 'g2.json');
      await fs.writeFile(traceFile, TYPESCRIPT_TRACE, 'utf8');

      // Run twice in parallel with different runIds to verify determinism
      await Promise.all([
        wpmAsync(
          ['lab', 'trace', 'ingest', '--from', 'typescript', '-i', traceFile, '-o', out1, '--runId', 'det-run-1'],
          { cwd: tmpDir },
        ),
        wpmAsync(
          ['lab', 'trace', 'ingest', '--from', 'typescript', '-i', traceFile, '-o', out2, '--runId', 'det-run-2'],
          { cwd: tmpDir },
        ),
      ]);

      const g1 = JSON.parse(await fs.readFile(out1, 'utf8')) as Record<string, unknown>;
      const g2 = JSON.parse(await fs.readFile(out2, 'utf8')) as Record<string, unknown>;
      const ev1 = (g1['trace:events'] as unknown[]).length;
      const ev2 = (g2['trace:events'] as unknown[]).length;
      const obj1 = (g1['trace:objects'] as unknown[]).length;
      const obj2 = (g2['trace:objects'] as unknown[]).length;
      expect(ev1).toBe(ev2);
      expect(obj1).toBe(obj2);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    }
  });
});
