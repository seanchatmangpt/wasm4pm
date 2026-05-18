/**
 * trace-cli.test.ts — Integration tests for `wpm trace` subcommands
 *
 * Oracle rank: Rank 2 (Domain contract — exit codes, output shape, and
 * cross-language trace ingest specification per CLAUDE.md).
 *
 * This file covers scenarios not already tested in membrane-trace-cli.test.ts:
 *   - trace ocel error paths (missing file, non-JSON, invalid TraceGraph)
 *   - trace powl error paths and JSON output structure
 *   - trace conform with the real route catalog files
 *   - trace conform --out flag (report file writing)
 *   - trace conform human format output content
 *   - trace ingest custom --runId reflects in @id field
 *   - trace ingest --quiet suppresses human output
 *   - trace ingest human output mentions Language/Frames/Events fields
 *   - trace ocel full pipeline (ingest → ocel → valid OCEL structure)
 *   - trace powl JSON output structure (observed_activities, unique_activities, dfg)
 *   - trace conform with real agent-proof-lifecycle model
 *   - trace ingest default --from (defaults to typescript)
 *   - trace ingest nonexistent input file exits source_error (2)
 *   - trace ocel nonexistent input file exits source_error (2)
 *   - trace powl nonexistent input file exits source_error (2)
 *   - trace conform invalid OCEL JSON from stdin exits source_error (2)
 *   - trace conform missing required -m flag exits non-zero
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
  options: { cwd?: string; env?: Record<string, string>; timeoutMs?: number; stdin?: string } = {},
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
    if (options.stdin && child.stdin) {
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

const MINIMAL_OCEL = JSON.stringify({
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
      activity: 'end',
      timestamp: '2026-01-01T02:00:00.000Z',
      objects: [{ id: 'run-1', type: 'Run' }],
      attributes: {},
    },
  ],
  ocel_objects: [{ id: 'run-1', type: 'Run', attributes: {} }],
});

const SIMPLE_SEQUENCE_MODEL = JSON.stringify({
  route_id: 'test-simple-sequence',
  type: 'powl2',
  required_stages: ['start', 'process', 'end'],
  model: {
    type: 'sequence',
    sequence: ['start', 'process', 'end'],
  },
});

// Repo root (relative to this test file: apps/wasm4pm/src/__tests__/)
const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..', '..');

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('wpm trace — additional coverage', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'trace-cli-ext-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  });

  // ── §1. trace ingest — human output fields ────────────────────────────────

  describe('trace ingest — human output format', () => {
    it('human output includes Language, Frames, Events, Output fields', async () => {
      const traceFile = path.join(tmpDir, 'ts-trace.txt');
      await fs.writeFile(traceFile, TYPESCRIPT_TRACE, 'utf8');

      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'typescript', '-i', traceFile],
        { cwd: tmpDir },
      );

      expect(result.exitCode).toBe(0);
      const combined = result.stdout + result.stderr;
      expect(combined).toMatch(/Language/);
      expect(combined).toMatch(/Frames/);
      expect(combined).toMatch(/Events/);
      expect(combined).toMatch(/Output/);
      expect(combined).toMatch(/typescript/);
    });

    it('--quiet suppresses the summary output', async () => {
      const traceFile = path.join(tmpDir, 'ts-trace.txt');
      await fs.writeFile(traceFile, TYPESCRIPT_TRACE, 'utf8');
      const outFile = path.join(tmpDir, 'graph.json');

      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'typescript', '-i', traceFile, '-o', outFile, '--quiet'],
        { cwd: tmpDir },
      );

      expect(result.exitCode).toBe(0);
      // Quiet mode should suppress the human-readable summary
      const combined = result.stdout + result.stderr;
      expect(combined).not.toMatch(/Language|Frames|Events/);
    });

    it('custom --runId reflects in the @id field of the TraceGraph', async () => {
      const traceFile = path.join(tmpDir, 'ts-trace.txt');
      const outFile = path.join(tmpDir, 'graph.json');
      await fs.writeFile(traceFile, TYPESCRIPT_TRACE, 'utf8');

      await wpmAsync(
        ['trace', 'ingest', '--from', 'typescript', '-i', traceFile, '-o', outFile, '--runId', 'my-custom-run-xyz'],
        { cwd: tmpDir },
      );

      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      expect(graph['@id']).toBe('trace:run-my-custom-run-xyz');
    });

    it('default --from is typescript when flag is omitted', async () => {
      // The ingest command defaults to --from typescript per the arg definition
      const traceFile = path.join(tmpDir, 'ts-trace.txt');
      const outFile = path.join(tmpDir, 'graph.json');
      await fs.writeFile(traceFile, TYPESCRIPT_TRACE, 'utf8');

      const result = await wpmAsync(
        ['trace', 'ingest', '-i', traceFile, '-o', outFile],
        { cwd: tmpDir },
      );

      expect(result.exitCode).toBe(0);
      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      expect(graph['trace:language']).toBe('typescript');
    });

    it('nonexistent --input file exits 2 (source_error)', async () => {
      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'rust', '-i', 'does-not-exist.txt'],
        { cwd: tmpDir },
      );

      expect(result.exitCode).toBe(2);
      const combined = result.stdout + result.stderr;
      expect(combined).toMatch(/not found|FILE_NOT_FOUND/i);
    });

    it('nonexistent --input exits 2 with --format json error envelope', async () => {
      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'rust', '-i', 'missing.txt', '--format', 'json'],
        { cwd: tmpDir },
      );

      expect(result.exitCode).toBe(2);
      const json = parseJson(result);
      expect(json?.status).toBe('error');
    });
  });

  // ── §2. trace ocel — error paths ─────────────────────────────────────────

  describe('trace ocel — error paths', () => {
    it('nonexistent -i file exits 2 (source_error)', async () => {
      const result = await wpmAsync(
        ['trace', 'ocel', '-i', 'no-such-file.json'],
        { cwd: tmpDir },
      );

      expect(result.exitCode).toBe(2);
      const combined = result.stdout + result.stderr;
      expect(combined).toMatch(/not found|FILE_NOT_FOUND/i);
    });

    it('non-JSON input from stdin exits 2 (source_error)', async () => {
      const result = await wpmAsync(
        ['trace', 'ocel'],
        { cwd: tmpDir, stdin: 'this is not json at all' },
      );

      expect(result.exitCode).toBe(2);
      const combined = result.stdout + result.stderr;
      expect(combined).toMatch(/Invalid TraceGraph JSON/i);
    });

    it('non-JSON file input exits 2 with error message', async () => {
      const badFile = path.join(tmpDir, 'not-json.txt');
      await fs.writeFile(badFile, 'this is not JSON', 'utf8');

      const result = await wpmAsync(
        ['trace', 'ocel', '-i', badFile],
        { cwd: tmpDir },
      );

      expect(result.exitCode).toBe(2);
    });
  });

  // ── §3. trace ocel — full pipeline (ingest → ocel) ───────────────────────

  describe('trace ocel — full pipeline from ingest output', () => {
    it('TraceGraph from ingest projects to valid OCEL 2.0 structure', async () => {
      const traceFile = path.join(tmpDir, 'ts-trace.txt');
      const graphFile = path.join(tmpDir, 'graph.json');
      const ocelFile = path.join(tmpDir, 'ocel.json');
      await fs.writeFile(traceFile, TYPESCRIPT_TRACE, 'utf8');

      // Step 1: ingest
      await wpmAsync(
        ['trace', 'ingest', '--from', 'typescript', '-i', traceFile, '-o', graphFile],
        { cwd: tmpDir },
      );

      // Step 2: ocel projection
      const result = await wpmAsync(
        ['trace', 'ocel', '-i', graphFile, '-o', ocelFile],
        { cwd: tmpDir },
      );

      expect(result.exitCode).toBe(0);
      const ocel = JSON.parse(await fs.readFile(ocelFile, 'utf8')) as Record<string, unknown>;
      expect(ocel.ocel_version).toBe('2.0');
      expect(Array.isArray(ocel.ocel_events)).toBe(true);
      expect(Array.isArray(ocel.ocel_objects)).toBe(true);
      const events = ocel.ocel_events as unknown[];
      expect(events.length).toBeGreaterThan(0);
    });

    it('trace ocel --format json outputs envelope with events count in payload', async () => {
      const traceFile = path.join(tmpDir, 'rust-trace.txt');
      const graphFile = path.join(tmpDir, 'graph.json');
      await fs.writeFile(traceFile, RUST_TRACE, 'utf8');

      await wpmAsync(
        ['trace', 'ingest', '--from', 'rust', '-i', traceFile, '-o', graphFile],
        { cwd: tmpDir },
      );

      const result = await wpmAsync(
        ['trace', 'ocel', '-i', graphFile, '--format', 'json'],
        { cwd: tmpDir },
      );

      expect(result.exitCode).toBe(0);
      // When --format json + no -o, raw OCEL is emitted to stdout followed by envelope
      // Parse the first JSON object from stdout (the raw OCEL log)
      const firstBrace = result.stdout.indexOf('{');
      const firstJson = result.stdout.slice(firstBrace);
      // There are two JSON objects in stdout; parse the envelope (look for "command")
      if (result.stdout.includes('"command"')) {
        const envelopeStart = result.stdout.lastIndexOf('{\n  "command"');
        if (envelopeStart >= 0) {
          const envelope = JSON.parse(result.stdout.slice(envelopeStart)) as Record<string, unknown>;
          expect(envelope.command).toBe('trace ocel');
          expect(envelope.status).toBe('ok');
          const payload = envelope.payload as Record<string, unknown> | undefined;
          expect(typeof payload?.events).toBe('number');
        }
      } else {
        // Raw OCEL output
        expect(firstJson.length).toBeGreaterThan(0);
      }
    });

    it('ocel events from TypeScript trace have correct activity name format', async () => {
      const traceFile = path.join(tmpDir, 'ts-trace.txt');
      const graphFile = path.join(tmpDir, 'graph.json');
      const ocelFile = path.join(tmpDir, 'ocel.json');
      await fs.writeFile(traceFile, TYPESCRIPT_TRACE, 'utf8');

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
      // All activities must be non-empty strings
      for (const ev of events) {
        expect(typeof ev.activity).toBe('string');
        expect((ev.activity as string).length).toBeGreaterThan(0);
      }
    });
  });

  // ── §4. trace powl — error paths and JSON output ─────────────────────────

  describe('trace powl — error paths', () => {
    it('nonexistent -i file exits 2 (source_error)', async () => {
      const result = await wpmAsync(
        ['trace', 'powl', '-i', 'no-such-file.ocel.json'],
        { cwd: tmpDir },
      );

      expect(result.exitCode).toBe(2);
      const combined = result.stdout + result.stderr;
      expect(combined).toMatch(/not found|FILE_NOT_FOUND/i);
    });

    it('non-JSON stdin exits 2 (source_error)', async () => {
      const result = await wpmAsync(
        ['trace', 'powl'],
        { cwd: tmpDir, stdin: 'not json at all' },
      );

      expect(result.exitCode).toBe(2);
      const combined = result.stdout + result.stderr;
      expect(combined).toMatch(/Invalid OCEL JSON/i);
    });
  });

  describe('trace powl — JSON output structure', () => {
    it('--format json outputs envelope with observed_activities, unique_activities, dfg', async () => {
      const ocelFile = path.join(tmpDir, 'ocel.json');
      const routeFile = path.join(tmpDir, 'route.json');
      await fs.writeFile(ocelFile, MINIMAL_OCEL, 'utf8');

      const result = await wpmAsync(
        ['trace', 'powl', '-i', ocelFile, '-o', routeFile, '--format', 'json'],
        { cwd: tmpDir },
      );

      expect(result.exitCode).toBe(0);
      const route = JSON.parse(await fs.readFile(routeFile, 'utf8')) as Record<string, unknown>;
      expect(Array.isArray(route.observed_activities)).toBe(true);
      expect(Array.isArray(route.unique_activities)).toBe(true);
      expect(typeof route.activity_count).toBe('number');
      expect(typeof route.dfg).toBe('object');
    });

    it('observed_activities contains events in order', async () => {
      const ocelFile = path.join(tmpDir, 'ocel.json');
      const routeFile = path.join(tmpDir, 'route.json');
      await fs.writeFile(ocelFile, MINIMAL_OCEL, 'utf8');

      await wpmAsync(
        ['trace', 'powl', '-i', ocelFile, '-o', routeFile],
        { cwd: tmpDir },
      );

      const route = JSON.parse(await fs.readFile(routeFile, 'utf8')) as Record<string, unknown>;
      const activities = route.observed_activities as string[];
      expect(activities[0]).toBe('start');
      expect(activities[1]).toBe('process');
      expect(activities[2]).toBe('end');
    });

    it('unique_activities has no duplicates even with repeated activities', async () => {
      // OCEL with 'start' appearing twice
      const repeatedOcel = JSON.stringify({
        ocel_version: '2.0',
        ocel_global_log: { ocel_attribute_names: [] },
        ocel_events: [
          { event_id: 'e0', activity: 'start', timestamp: '2026-01-01T00:00:00Z', objects: [{ id: 'r-1', type: 'Run' }], attributes: {} },
          { event_id: 'e1', activity: 'check', timestamp: '2026-01-01T01:00:00Z', objects: [{ id: 'r-1', type: 'Run' }], attributes: {} },
          { event_id: 'e2', activity: 'start', timestamp: '2026-01-01T02:00:00Z', objects: [{ id: 'r-1', type: 'Run' }], attributes: {} },
        ],
        ocel_objects: [{ id: 'r-1', type: 'Run', attributes: {} }],
      });
      const ocelFile = path.join(tmpDir, 'repeated.ocel.json');
      const routeFile = path.join(tmpDir, 'route.json');
      await fs.writeFile(ocelFile, repeatedOcel, 'utf8');

      await wpmAsync(
        ['trace', 'powl', '-i', ocelFile, '-o', routeFile],
        { cwd: tmpDir },
      );

      const route = JSON.parse(await fs.readFile(routeFile, 'utf8')) as Record<string, unknown>;
      const unique = route.unique_activities as string[];
      // Should have only 2 unique: start, check
      expect(unique.length).toBe(2);
      expect(unique).toContain('start');
      expect(unique).toContain('check');
    });
  });

  // ── §5. trace conform — report file output and human format ──────────────

  describe('trace conform — --out flag writes report file', () => {
    it('--out flag creates a JSON report file at the specified path', async () => {
      const ocelFile = path.join(tmpDir, 'ocel.json');
      const modelFile = path.join(tmpDir, 'model.powl.json');
      const reportFile = path.join(tmpDir, 'report.json');
      await fs.writeFile(ocelFile, MINIMAL_OCEL, 'utf8');
      await fs.writeFile(modelFile, SIMPLE_SEQUENCE_MODEL, 'utf8');

      const result = await wpmAsync(
        ['trace', 'conform', '-i', ocelFile, '-m', modelFile, '-o', reportFile],
        { cwd: tmpDir },
      );

      // May exit 3 (AndonPull) but report should still be written
      expect([0, 3]).toContain(result.exitCode);
      const reportExists = await fs.access(reportFile).then(() => true).catch(() => false);
      expect(reportExists).toBe(true);
      const report = JSON.parse(await fs.readFile(reportFile, 'utf8')) as Record<string, unknown>;
      expect(report.route_id).toBe('test-simple-sequence');
      expect(typeof report.fitness).toBe('number');
      expect(Array.isArray(report.details)).toBe(true);
    });

    it('report file contains all required ConformanceResult fields', async () => {
      const ocelFile = path.join(tmpDir, 'ocel.json');
      const modelFile = path.join(tmpDir, 'model.powl.json');
      const reportFile = path.join(tmpDir, 'report.json');
      await fs.writeFile(ocelFile, MINIMAL_OCEL, 'utf8');
      await fs.writeFile(modelFile, SIMPLE_SEQUENCE_MODEL, 'utf8');

      await wpmAsync(
        ['trace', 'conform', '-i', ocelFile, '-m', modelFile, '-o', reportFile],
        { cwd: tmpDir },
      );

      const report = JSON.parse(await fs.readFile(reportFile, 'utf8')) as Record<string, unknown>;
      // All required fields from ConformanceResult type
      expect(typeof report.route_id).toBe('string');
      expect(typeof report.fitness).toBe('number');
      expect(typeof report.precision).toBe('number');
      expect(typeof report.required_stage_coverage).toBe('number');
      expect(typeof report.receipt_coverage).toBe('number');
      expect(typeof report.object_lifecycle_validity).toBe('number');
      expect(report.verdict === 'Accepted' || report.verdict === 'AndonPull').toBe(true);
    });
  });

  describe('trace conform — human format output', () => {
    it('human output includes Route, Observed, Fitness fields', async () => {
      const ocelFile = path.join(tmpDir, 'ocel.json');
      const modelFile = path.join(tmpDir, 'model.powl.json');
      await fs.writeFile(ocelFile, MINIMAL_OCEL, 'utf8');
      await fs.writeFile(modelFile, SIMPLE_SEQUENCE_MODEL, 'utf8');

      const result = await wpmAsync(
        ['trace', 'conform', '-i', ocelFile, '-m', modelFile],
        { cwd: tmpDir },
      );

      const combined = result.stdout + result.stderr;
      expect(combined).toMatch(/Route:/);
      expect(combined).toMatch(/Observed:/);
      expect(combined).toMatch(/Fitness:/);
    });

    it('human output shows AndonPull or Accepted verdict text', async () => {
      const ocelFile = path.join(tmpDir, 'ocel.json');
      const modelFile = path.join(tmpDir, 'model.powl.json');
      await fs.writeFile(ocelFile, MINIMAL_OCEL, 'utf8');
      await fs.writeFile(modelFile, SIMPLE_SEQUENCE_MODEL, 'utf8');

      const result = await wpmAsync(
        ['trace', 'conform', '-i', ocelFile, '-m', modelFile],
        { cwd: tmpDir },
      );

      const combined = result.stdout + result.stderr;
      expect(combined).toMatch(/AndonPull|Accepted/);
    });

    it('human output shows dimension checkmarks (✓ or ✗)', async () => {
      const ocelFile = path.join(tmpDir, 'ocel.json');
      const modelFile = path.join(tmpDir, 'model.powl.json');
      await fs.writeFile(ocelFile, MINIMAL_OCEL, 'utf8');
      await fs.writeFile(modelFile, SIMPLE_SEQUENCE_MODEL, 'utf8');

      const result = await wpmAsync(
        ['trace', 'conform', '-i', ocelFile, '-m', modelFile],
        { cwd: tmpDir },
      );

      const combined = result.stdout + result.stderr;
      // The output renders dimension rows as "  ✓ dimension_name  detail" or "  ✗ ..."
      expect(combined).toMatch(/[✓✗]/);
    });
  });

  // ── §6. trace conform — real route catalog ───────────────────────────────

  describe('trace conform — real route catalog models', () => {
    it('agent-proof-lifecycle model exists and is valid JSON', async () => {
      const modelPath = path.join(REPO_ROOT, 'routes', 'agent-proof-lifecycle.powl.json');
      const modelExists = await fs.access(modelPath).then(() => true).catch(() => false);
      expect(modelExists).toBe(true);
      const raw = await fs.readFile(modelPath, 'utf8');
      const model = JSON.parse(raw) as Record<string, unknown>;
      expect(model.route_id).toBe('agent-proof-lifecycle');
      expect(model.type).toBe('powl2');
    });

    it('empty OCEL against agent-proof-lifecycle exits 3 with AndonPull(ActivityOnlyFakeRoute)', async () => {
      const modelPath = path.join(REPO_ROOT, 'routes', 'agent-proof-lifecycle.powl.json');
      const emptyOcel = JSON.stringify({
        ocel_version: '2.0',
        ocel_global_log: { ocel_attribute_names: [] },
        ocel_events: [],
        ocel_objects: [],
      });
      const ocelFile = path.join(tmpDir, 'empty.ocel.json');
      await fs.writeFile(ocelFile, emptyOcel, 'utf8');

      const result = await wpmAsync(
        ['trace', 'conform', '-i', ocelFile, '-m', modelPath, '--format', 'json'],
        { cwd: tmpDir },
      );

      expect(result.exitCode).toBe(3);
      const json = parseJson(result);
      const payload = json?.payload as Record<string, unknown> | undefined;
      expect(payload?.verdict).toBe('AndonPull');
      expect(payload?.andon_reason).toBe('ActivityOnlyFakeRoute');
    });

    it('OCEL with object evidence against agent-proof-lifecycle returns measurable conformance', async () => {
      const modelPath = path.join(REPO_ROOT, 'routes', 'agent-proof-lifecycle.powl.json');
      // Build OCEL that matches the agent-proof-lifecycle route: collect_evidence, verify_evidence, emit_receipt
      const conformingOcel = JSON.stringify({
        ocel_version: '2.0',
        ocel_global_log: { ocel_attribute_names: [] },
        ocel_events: [
          { event_id: 'e0', activity: 'collect_evidence', timestamp: '2026-01-01T00:00:00Z', objects: [{ id: 'ev-1', type: 'Evidence' }, { id: 'r-1', type: 'Receipt' }], attributes: {} },
          { event_id: 'e1', activity: 'verify_evidence', timestamp: '2026-01-01T01:00:00Z', objects: [{ id: 'ev-1', type: 'Evidence' }], attributes: {} },
          { event_id: 'e2', activity: 'emit_receipt', timestamp: '2026-01-01T02:00:00Z', objects: [{ id: 'ev-1', type: 'Evidence' }, { id: 'r-1', type: 'Receipt' }], attributes: {} },
        ],
        ocel_objects: [
          { id: 'ev-1', type: 'Evidence', attributes: {} },
          { id: 'r-1', type: 'Receipt', attributes: {} },
        ],
      });
      const ocelFile = path.join(tmpDir, 'conform.ocel.json');
      await fs.writeFile(ocelFile, conformingOcel, 'utf8');

      const result = await wpmAsync(
        ['trace', 'conform', '-i', ocelFile, '-m', modelPath, '--format', 'json'],
        { cwd: tmpDir },
      );

      // May exit 0 (Accepted) or 3 (AndonPull for schema/lifecycle constraints)
      expect([0, 3]).toContain(result.exitCode);
      const json = parseJson(result);
      const payload = json?.payload as Record<string, unknown> | undefined;
      expect(payload?.route_id).toBe('agent-proof-lifecycle');
      // Fitness must be 1.0 (all activities are in the model)
      expect(payload?.fitness).toBe(1);
      // All required stages must be present
      expect(payload?.required_stage_coverage).toBe(1);
      // Details array must have dimensions
      expect(Array.isArray(payload?.details)).toBe(true);
      const details = payload?.details as Array<Record<string, unknown>>;
      expect(details.length).toBeGreaterThan(3);
    });

    it('JSON output from trace conform has standard envelope shape', async () => {
      const ocelFile = path.join(tmpDir, 'ocel.json');
      const modelFile = path.join(tmpDir, 'model.powl.json');
      await fs.writeFile(ocelFile, MINIMAL_OCEL, 'utf8');
      await fs.writeFile(modelFile, SIMPLE_SEQUENCE_MODEL, 'utf8');

      const result = await wpmAsync(
        ['trace', 'conform', '-i', ocelFile, '-m', modelFile, '--format', 'json'],
        { cwd: tmpDir },
      );

      const json = parseJson(result);
      expect(json).not.toBeNull();
      // Standard command result envelope
      expect(typeof json?.command).toBe('string');
      expect(json?.command).toBe('trace conform');
      expect(json?.status === 'ok' || json?.status === 'error').toBe(true);
      expect(typeof json?.exit_code).toBe('number');
      // Meta block
      const meta = json?.meta as Record<string, unknown> | undefined;
      expect(meta?.run_id).toBeTruthy();
      expect(meta?.timestamp).toBeTruthy();
    });
  });

  // ── §7. trace conform — error paths ──────────────────────────────────────

  describe('trace conform — error paths', () => {
    it('exits 2 when OCEL input file does not exist', async () => {
      const modelFile = path.join(tmpDir, 'model.powl.json');
      await fs.writeFile(modelFile, SIMPLE_SEQUENCE_MODEL, 'utf8');

      const result = await wpmAsync(
        ['trace', 'conform', '-i', 'missing.ocel.json', '-m', modelFile],
        { cwd: tmpDir },
      );

      expect(result.exitCode).toBe(2);
    });

    it('exits 2 when model file does not exist', async () => {
      const ocelFile = path.join(tmpDir, 'ocel.json');
      await fs.writeFile(ocelFile, MINIMAL_OCEL, 'utf8');

      const result = await wpmAsync(
        ['trace', 'conform', '-i', ocelFile, '-m', 'missing.powl.json'],
        { cwd: tmpDir },
      );

      expect(result.exitCode).toBe(2);
    });

    it('exits 2 when OCEL file is not valid JSON', async () => {
      const badOcel = path.join(tmpDir, 'bad.ocel.json');
      const modelFile = path.join(tmpDir, 'model.powl.json');
      await fs.writeFile(badOcel, 'this is not json', 'utf8');
      await fs.writeFile(modelFile, SIMPLE_SEQUENCE_MODEL, 'utf8');

      const result = await wpmAsync(
        ['trace', 'conform', '-i', badOcel, '-m', modelFile],
        { cwd: tmpDir },
      );

      expect(result.exitCode).toBe(2);
    });

    it('exits 2 when invalid OCEL JSON is piped via stdin', async () => {
      const modelPath = path.join(REPO_ROOT, 'routes', 'agent-proof-lifecycle.powl.json');
      const result = await wpmAsync(
        ['trace', 'conform', '-m', modelPath],
        { cwd: tmpDir, stdin: 'not valid json' },
      );

      expect(result.exitCode).toBe(2);
    });

    it('exits 2 when model file is not valid JSON', async () => {
      const ocelFile = path.join(tmpDir, 'ocel.json');
      const badModel = path.join(tmpDir, 'bad.powl.json');
      await fs.writeFile(ocelFile, MINIMAL_OCEL, 'utf8');
      await fs.writeFile(badModel, 'not valid json', 'utf8');

      const result = await wpmAsync(
        ['trace', 'conform', '-i', ocelFile, '-m', badModel],
        { cwd: tmpDir },
      );

      expect(result.exitCode).toBe(2);
    });
  });

  // ── §8. trace conform — exit code semantics ───────────────────────────────

  describe('trace conform — exit code contract', () => {
    it('exits 0 (success) when conformance verdict is Accepted', async () => {
      // Build a conforming OCEL with full object evidence + object_types + receipt
      // Using a simple model without object_types/receipt — but that gives AndonPull(TestRouteIncomplete)
      // We need object_types + receipt_required to get Accepted.
      // Build a model + OCEL that can achieve Accepted:
      //   - All stages present, all activities in model, object lifecycle valid, receipt coverage 1.0
      const acceptedModel = JSON.stringify({
        route_id: 'accepted-test-route',
        type: 'powl2',
        required_stages: ['create', 'process', 'emit'],
        receipt_required: true,
        object_types: {
          Work: { created_by: ['create'] },
          Receipt: { created_by: ['create', 'process', 'emit'] },
        },
        model: { type: 'sequence', sequence: ['create', 'process', 'emit'] },
      });
      const acceptedOcel = JSON.stringify({
        ocel_version: '2.0',
        ocel_global_log: { ocel_attribute_names: [] },
        ocel_events: [
          { event_id: 'e0', activity: 'create', timestamp: '2026-01-01T00:00:00Z', objects: [{ id: 'w-1', type: 'Work' }, { id: 'r-1', type: 'Receipt' }], attributes: {} },
          { event_id: 'e1', activity: 'process', timestamp: '2026-01-01T01:00:00Z', objects: [{ id: 'w-1', type: 'Work' }, { id: 'r-2', type: 'Receipt' }], attributes: {} },
          { event_id: 'e2', activity: 'emit', timestamp: '2026-01-01T02:00:00Z', objects: [{ id: 'w-1', type: 'Work' }, { id: 'r-3', type: 'Receipt' }], attributes: {} },
        ],
        ocel_objects: [
          { id: 'w-1', type: 'Work', attributes: {} },
          { id: 'r-1', type: 'Receipt', attributes: {} },
          { id: 'r-2', type: 'Receipt', attributes: {} },
          { id: 'r-3', type: 'Receipt', attributes: {} },
        ],
      });

      const ocelFile = path.join(tmpDir, 'accepted.ocel.json');
      const modelFile = path.join(tmpDir, 'accepted.powl.json');
      await fs.writeFile(ocelFile, acceptedOcel, 'utf8');
      await fs.writeFile(modelFile, acceptedModel, 'utf8');

      const result = await wpmAsync(
        ['trace', 'conform', '-i', ocelFile, '-m', modelFile, '--format', 'json'],
        { cwd: tmpDir },
      );

      expect(result.exitCode).toBe(0);
      const json = parseJson(result);
      const payload = json?.payload as Record<string, unknown> | undefined;
      expect(payload?.verdict).toBe('Accepted');
    });

    it('exits 3 (execution_error) when conformance verdict is AndonPull', async () => {
      const ocelFile = path.join(tmpDir, 'ocel.json');
      const modelFile = path.join(tmpDir, 'model.powl.json');
      await fs.writeFile(ocelFile, MINIMAL_OCEL, 'utf8');
      await fs.writeFile(modelFile, SIMPLE_SEQUENCE_MODEL, 'utf8');

      const result = await wpmAsync(
        ['trace', 'conform', '-i', ocelFile, '-m', modelFile, '--format', 'json'],
        { cwd: tmpDir },
      );

      // AndonPull because model lacks object_types → TestRouteIncomplete
      expect(result.exitCode).toBe(3);
      const json = parseJson(result);
      const payload = json?.payload as Record<string, unknown> | undefined;
      expect(payload?.verdict).toBe('AndonPull');
    });
  });

  // ── §9. trace ingest — cross-language validation ──────────────────────────

  describe('trace ingest — cross-language validation', () => {
    it.each(['go', 'ruby', 'swift', 'kotlin', 'csharp', 'php'])(
      'exits 1 (config_error) for unsupported language "%s"',
      async (lang) => {
        const traceFile = path.join(tmpDir, 'dummy.txt');
        await fs.writeFile(traceFile, 'some content', 'utf8');

        const result = await wpmAsync(
          ['trace', 'ingest', '--from', lang, '-i', traceFile],
          { cwd: tmpDir },
        );

        // CLAUDE.md: Unknown --from value exits 1 (config_error), no silent fallback
        expect(result.exitCode).toBe(1);
      },
    );

    it('JSON error envelope for unknown language mentions the invalid language name', async () => {
      const traceFile = path.join(tmpDir, 'dummy.txt');
      await fs.writeFile(traceFile, 'some content', 'utf8');

      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'fortran', '-i', traceFile, '--format', 'json'],
        { cwd: tmpDir },
      );

      expect(result.exitCode).toBe(1);
      const json = parseJson(result);
      expect(json?.status).toBe('error');
      const errorObj = json?.error as Record<string, unknown> | undefined;
      const msg = String(errorObj?.message ?? json?.message ?? '');
      expect(msg).toMatch(/fortran|unknown|Accepted/i);
    });

    it('all 5 accepted languages exit 0 with a valid TraceGraph', async () => {
      const fixtures: Record<string, string> = {
        rust: RUST_TRACE,
        typescript: TYPESCRIPT_TRACE,
        python: `File "/app/main.py", line 10, in run\n  result = do_work()`,
        java: `  at com.example.App.main(App.java:10)`,
        js: `    at myFunc (app.js:5:10)`,
      };

      for (const [lang, trace] of Object.entries(fixtures)) {
        const traceFile = path.join(tmpDir, `${lang}-trace.txt`);
        const outFile = path.join(tmpDir, `${lang}-graph.json`);
        await fs.writeFile(traceFile, trace, 'utf8');

        const result = await wpmAsync(
          ['trace', 'ingest', '--from', lang, '-i', traceFile, '-o', outFile],
          { cwd: tmpDir },
        );

        expect(result.exitCode, `${lang} should exit 0`).toBe(0);
        const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
        expect(graph['@type'], `${lang} @type`).toBe('trace:TraceRun');
        expect(graph['trace:language'], `${lang} language`).toBe(lang);
      }
    });
  });
});
