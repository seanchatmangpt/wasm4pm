/**
 * type-safety.test.ts
 *
 * Runtime verification that formerly-any-typed code paths behave correctly
 * after narrowing to `unknown` + explicit guards.  These tests do not test
 * TypeScript types at compile time; they verify that the runtime logic
 * introduced by the narrowing (Array.isArray, typeof checks, null guards, etc.)
 * produces the same correct outputs the original `as any` code relied on.
 */

import { describe, it, expect } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { FileLogSinkAdapter } from '../sinks/file-log-sink.js';
import { buildModelIR } from '../federation-provenance.js';
import type { RawModelOutput } from '../federation-provenance.js';
import type { ModelCapabilities } from '@wasm4pm/contracts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'wasm4pm-type-safety-'));
}

// The Result<T> discriminant uses `type: 'ok'` (not `ok: true`)
function assertOk<T>(result: unknown): asserts result is { type: 'ok'; value: T } {
  expect(result).toMatchObject({ type: 'ok' });
}

// ---------------------------------------------------------------------------
// FileLogSinkAdapter — getFilename narrowing
// ---------------------------------------------------------------------------

describe('FileLogSinkAdapter — receipt filename narrowing', () => {
  it('uses run_id when it is a string', async () => {
    const dir = await makeTmpDir();
    const sink = new FileLogSinkAdapter({ directory: dir, onExists: 'overwrite' });

    const artifact = { run_id: 'my-run-001', status: 'success', algorithm: 'dfg', timestamp: new Date().toISOString() };
    const result = await sink.write(artifact, 'receipt');

    assertOk<string>(result);
    expect((result as { type: 'ok'; value: string }).value).toContain('my-run-001');
    expect((result as { type: 'ok'; value: string }).value).toContain('.receipt.json');
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('falls back to run-<timestamp> when run_id is missing', async () => {
    const dir = await makeTmpDir();
    const sink = new FileLogSinkAdapter({ directory: dir, onExists: 'overwrite' });

    const artifact = { status: 'success', algorithm: 'dfg', timestamp: new Date().toISOString() };
    const result = await sink.write(artifact, 'receipt');

    assertOk<string>(result);
    expect((result as { type: 'ok'; value: string }).value).toMatch(/^run-\d+\.receipt\.json$/);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('falls back to run-<timestamp> when run_id is a number (not a string)', async () => {
    const dir = await makeTmpDir();
    const sink = new FileLogSinkAdapter({ directory: dir, onExists: 'overwrite' });

    // run_id is a number — typeof check must prevent string coercion
    const artifact = { run_id: 42, status: 'success', algorithm: 'dfg', timestamp: new Date().toISOString() };
    const result = await sink.write(artifact, 'receipt');

    assertOk<string>(result);
    // Must NOT use "42" as the run_id prefix — narrowing requires `typeof === 'string'`
    expect((result as { type: 'ok'; value: string }).value).toMatch(/^run-\d+\.receipt\.json$/);
    await fs.rm(dir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// FileLogSinkAdapter — model filename narrowing
// ---------------------------------------------------------------------------

describe('FileLogSinkAdapter — model filename narrowing', () => {
  it('produces .pn.json when petriNet is present', async () => {
    const dir = await makeTmpDir();
    const sink = new FileLogSinkAdapter({ directory: dir, onExists: 'overwrite' });

    const artifact = { name: 'mymodel', petriNet: { places: [], transitions: [] } };
    const result = await sink.write(artifact, 'model');

    assertOk<string>(result);
    expect((result as { type: 'ok'; value: string }).value).toBe('mymodel.pn.json');
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('produces .dfg.json when petriNet is absent', async () => {
    const dir = await makeTmpDir();
    const sink = new FileLogSinkAdapter({ directory: dir, onExists: 'overwrite' });

    const artifact = { name: 'mygraph', nodes: [], edges: [] };
    const result = await sink.write(artifact, 'model');

    assertOk<string>(result);
    expect((result as { type: 'ok'; value: string }).value).toBe('mygraph.dfg.json');
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('falls back to model-<timestamp>.dfg.json when name is not a string', async () => {
    const dir = await makeTmpDir();
    const sink = new FileLogSinkAdapter({ directory: dir, onExists: 'overwrite' });

    const artifact = { name: 99 }; // name is a number — should not be used
    const result = await sink.write(artifact, 'model');

    assertOk<string>(result);
    // typeof check rejects numeric name; must fall back to model-<timestamp>
    expect((result as { type: 'ok'; value: string }).value).toMatch(/^model-\d+\.dfg\.json$/);
    await fs.rm(dir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// FileLogSinkAdapter — report filename & content narrowing
// ---------------------------------------------------------------------------

describe('FileLogSinkAdapter — report filename and content narrowing', () => {
  it('uses format and name from artifact when both are strings', async () => {
    const dir = await makeTmpDir();
    const sink = new FileLogSinkAdapter({ directory: dir, onExists: 'overwrite' });

    const artifact = { name: 'exec-report', format: 'html', content: '<html/>' };
    const result = await sink.write(artifact, 'report');

    assertOk<string>(result);
    const filename = (result as { type: 'ok'; value: string }).value;
    expect(filename).toBe('exec-report.html');

    // Content should be written directly (not JSON-stringified)
    const written = await fs.readFile(path.join(dir, filename), 'utf-8');
    expect(written).toBe('<html/>');
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('returns empty string for HTML report with non-string content', async () => {
    const dir = await makeTmpDir();
    const sink = new FileLogSinkAdapter({ directory: dir, onExists: 'overwrite' });

    const artifact = { name: 'empty-report', format: 'html', content: 42 }; // content is a number
    const result = await sink.write(artifact, 'report');

    assertOk<string>(result);
    const filename = (result as { type: 'ok'; value: string }).value;
    const written = await fs.readFile(path.join(dir, filename), 'utf-8');
    // typeof check returns '' for non-string content
    expect(written).toBe('');
    await fs.rm(dir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// FileLogSinkAdapter — appendArtifact narrowing (let existing: unknown)
// ---------------------------------------------------------------------------

describe('FileLogSinkAdapter — appendArtifact unknown narrowing', () => {
  it('appends to an existing JSON array without any-escape', async () => {
    const dir = await makeTmpDir();
    const sink = new FileLogSinkAdapter({ directory: dir, onExists: 'append' });

    // Pre-seed the exact file the sink will target (r2.receipt.json)
    const targetFile = path.join(dir, 'r2.receipt.json');
    await fs.writeFile(targetFile, JSON.stringify([{ run_id: 'r1' }]));

    const artifact = { run_id: 'r2', status: 'success', algorithm: 'dfg', timestamp: new Date().toISOString() };
    const result = await sink.write(artifact, 'receipt');

    assertOk<string>(result);
    const written = JSON.parse(await fs.readFile(targetFile, 'utf-8')) as unknown[];
    expect(Array.isArray(written)).toBe(true);
    // Should have r1 entry + r2 artifact appended = 2 entries
    expect(written.length).toBe(2);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('handles non-JSON existing file gracefully (text append path)', async () => {
    const dir = await makeTmpDir();
    const sink = new FileLogSinkAdapter({ directory: dir, onExists: 'append' });

    const targetFile = path.join(dir, 'r3.receipt.json');
    await fs.writeFile(targetFile, 'not-valid-json');

    const artifact = { run_id: 'r3', status: 'success', algorithm: 'dfg', timestamp: new Date().toISOString() };
    const result = await sink.write(artifact, 'receipt');

    // Text-append path returns the full path as the value
    expect(result).toMatchObject({ type: 'ok' });
    // The file should still exist and contain the original prefix
    const written = await fs.readFile(targetFile, 'utf-8');
    expect(written).toContain('not-valid-json');
    await fs.rm(dir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// buildModelIR — node/edge narrowing (federation-provenance)
// ---------------------------------------------------------------------------

describe('buildModelIR — node and edge narrowing', () => {
  const capabilities: ModelCapabilities = {
    online_safe: true,
    offline_only: false,
    replay_ready: true,
    alignment_ready: true,
    streaming_compatible: false,
    exportable_to_pnml: true,
    exportable_to_bpmn: true,
  };

  it('maps nodes with id, label, type fields correctly', () => {
    const raw: RawModelOutput = {
      model: {
        nodes: [{ id: 'a', label: 'Start', type: 'start' }],
        edges: [],
      },
      model_hash: 'abc123',
      deterministic: true,
      algorithm_version: '1.0',
      latency_class: 'low_ms',
      algorithm_duration_ms: 10,
    };

    const ir = buildModelIR(raw, 'dfg', capabilities);
    expect(ir.nodes).toHaveLength(1);
    expect(ir.nodes[0]).toEqual({ id: 'a', label: 'Start', type: 'start' });
  });

  it('defaults type to "activity" when node.type is missing', () => {
    const raw: RawModelOutput = {
      model: {
        nodes: [{ id: 'b', label: 'Task' }], // no type field
        edges: [],
      },
      model_hash: 'def456',
      deterministic: true,
      algorithm_version: '1.0',
      latency_class: 'low_ms',
      algorithm_duration_ms: 5,
    };

    const ir = buildModelIR(raw, 'dfg', capabilities);
    expect(ir.nodes[0].type).toBe('activity');
  });

  it('maps edges with from, to, and optional weight', () => {
    const raw: RawModelOutput = {
      model: {
        nodes: [],
        edges: [
          { from: 'a', to: 'b', weight: 3 },
          { from: 'b', to: 'c' }, // no weight
        ],
      },
      model_hash: 'ghi789',
      deterministic: true,
      algorithm_version: '1.0',
      latency_class: 'low_ms',
      algorithm_duration_ms: 8,
    };

    const ir = buildModelIR(raw, 'dfg', capabilities);
    expect(ir.edges).toHaveLength(2);
    expect(ir.edges[0].weight).toBe(3);
    expect(ir.edges[1].weight).toBeUndefined();
  });

  it('returns empty nodes and edges when model lacks those arrays', () => {
    const raw: RawModelOutput = {
      model: {}, // no nodes or edges
      model_hash: 'jkl000',
      deterministic: true,
      algorithm_version: '1.0',
      latency_class: 'low_ms',
      algorithm_duration_ms: 2,
    };

    const ir = buildModelIR(raw, 'dfg', capabilities);
    expect(ir.nodes).toEqual([]);
    expect(ir.edges).toEqual([]);
  });

  it('coerces numeric ids to strings without any-escape', () => {
    const raw: RawModelOutput = {
      model: {
        nodes: [{ id: 99, label: 'NumericId', type: 'activity' }],
        edges: [{ from: 1, to: 2, weight: 1 }],
      },
      model_hash: 'mno111',
      deterministic: true,
      algorithm_version: '1.0',
      latency_class: 'low_ms',
      algorithm_duration_ms: 3,
    };

    const ir = buildModelIR(raw, 'dfg', capabilities);
    expect(typeof ir.nodes[0].id).toBe('string');
    expect(ir.nodes[0].id).toBe('99');
    expect(typeof ir.edges[0].from).toBe('string');
    expect(ir.edges[0].from).toBe('1');
  });
});
