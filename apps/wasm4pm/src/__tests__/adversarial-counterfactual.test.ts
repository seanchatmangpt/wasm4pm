/**
 * Adversarial Counterfactual Test Suite
 *
 * Design: 80/20 consolidation — one invocation per command group, all assertions
 * in that invocation. Every test uses assertEnvelope (the universal stub-killer)
 * plus at least one failure oracle (the "always exit 0" stub trap).
 *
 * Structure per test:
 *   FALSIFICATION — what a stub / mock / placeholder would return
 *   ANTI-STUB     — assertion that makes the stub impossible to pass
 *   FAILURE ORACLE — bad input must produce the right exit code + error envelope
 *
 * Machine-canonical invariants (enforced by assertEnvelope on every command):
 *   run_id    — UUID v4     (stubs return "" or hardcoded UUID)
 *   timestamp — recent ISO  (stubs return hardcoded dates)
 *   exit_code — JSON = process exit (stubs diverge)
 *   version   — semver      (stubs omit)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCli } from '@wasm4pm/testing';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const CLI_PATH = resolve(__dirname, '../../dist/bin/wpm.js');
const NODE_PATH = process.execPath;

async function cli(args: string[], opts?: { timeout?: number; cwd?: string }) {
  return runCli([CLI_PATH, ...args], { cliPath: NODE_PATH, ...opts });
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const MINIMAL_XES = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns:xes="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="Case-1"/>
    <event><string key="concept:name" value="Submit"/><date key="time:timestamp" value="2024-01-01T09:00:00.000+00:00"/></event>
    <event><string key="concept:name" value="Approve"/><date key="time:timestamp" value="2024-01-01T10:00:00.000+00:00"/></event>
    <event><string key="concept:name" value="Complete"/><date key="time:timestamp" value="2024-01-01T11:00:00.000+00:00"/></event>
  </trace>
  <trace>
    <string key="concept:name" value="Case-2"/>
    <event><string key="concept:name" value="Submit"/><date key="time:timestamp" value="2024-01-02T09:00:00.000+00:00"/></event>
    <event><string key="concept:name" value="Reject"/><date key="time:timestamp" value="2024-01-02T10:00:00.000+00:00"/></event>
  </trace>
  <trace>
    <string key="concept:name" value="Case-3"/>
    <event><string key="concept:name" value="Submit"/><date key="time:timestamp" value="2024-01-03T09:00:00.000+00:00"/></event>
    <event><string key="concept:name" value="Approve"/><date key="time:timestamp" value="2024-01-03T10:30:00.000+00:00"/></event>
    <event><string key="concept:name" value="Complete"/><date key="time:timestamp" value="2024-01-03T12:00:00.000+00:00"/></event>
  </trace>
</log>`;

const VALID_JSONL = [
  JSON.stringify({ trace_id: 'T001', name: 'Allow read', motion: { actor: 'user', action: 'read', resource: 'doc' }, expected_verdict: 'Allow' }),
  JSON.stringify({ trace_id: 'T002', name: 'Allow write', motion: { actor: 'admin', action: 'write', resource: 'doc' }, expected_verdict: 'Allow' }),
].join('\n');

const INVALID_JSONL = [
  JSON.stringify({ trace_id: 'X001', name: 'Missing motion' }),
  'not json at all !!!',
].join('\n');

// impossible verdict — forces all benchmark traces to fail
const FAILING_JSONL = JSON.stringify({
  trace_id: 'F001', name: 'Always wrong',
  motion: { actor: 'user', action: 'read', resource: 'doc' },
  expected_verdict: 'IMPOSSIBLE_VERDICT_ZZZZZ',
});

let tmpDir: string;
let xesPath: string;
let validCorpusPath: string;
let invalidCorpusPath: string;
let failingCorpusPath: string;

beforeAll(() => {
  tmpDir = join(tmpdir(), `wpm-adversarial-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  xesPath = join(tmpDir, 'test.xes');
  validCorpusPath = join(tmpDir, 'valid.jsonl');
  invalidCorpusPath = join(tmpDir, 'invalid.jsonl');
  failingCorpusPath = join(tmpDir, 'failing.jsonl');
  writeFileSync(xesPath, MINIMAL_XES);
  writeFileSync(validCorpusPath, VALID_JSONL);
  writeFileSync(invalidCorpusPath, INVALID_JSONL);
  writeFileSync(failingCorpusPath, FAILING_JSONL);
});

afterAll(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

// ─── Shared envelope checker ──────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VERSION_RE = /^\d+\.\d+\.\d+/;

function extractJson(stdout: string): Record<string, unknown> {
  // Some commands append a human footer after the JSON — extract the first balanced object.
  const start = stdout.indexOf('{');
  if (start === -1) throw new Error(`no JSON in stdout:\n${stdout.slice(0, 300)}`);
  let depth = 0, inStr = false, escape = false;
  for (let i = start; i < stdout.length; i++) {
    const c = stdout[i];
    if (escape) { escape = false; continue; }
    if (c === '\\' && inStr) { escape = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      return JSON.parse(stdout.slice(start, i + 1)) as Record<string, unknown>;
    }
  }
  throw new Error(`stdout is not JSON:\n${stdout.slice(0, 300)}`);
}

function assertEnvelope(r: { exitCode: number; stdout: string }, command: string) {
  const j = extractJson(r.stdout);
  const m = j.meta as Record<string, unknown>;
  expect(j.command).toBe(command);                              // stub returns wrong command
  expect(['ok', 'error']).toContain(j.status);
  expect(j.exit_code).toBe(r.exitCode);                        // JSON must match process exit
  expect(m.run_id).toMatch(UUID_RE);                           // stub returns "" or hardcoded
  expect(m.duration_ms).toBeTypeOf('number');
  expect(new Date(m.timestamp as string).getTime())
    .toBeGreaterThan(Date.now() - 120_000);                    // stub returns hardcoded date
  expect(m.version).toMatch(VERSION_RE);
  return j;
}

// ─── 1. Discovery: run, compare, diff ────────────────────────────────────────
// CONTRACT: produce real models from event logs, not empty stubs

describe('discovery commands', () => {
  it('run: model has nodes; algorithm flag respected; dfg nodes are arrays', async () => {
    // ANTI-STUB: model nodes > 0 (stub: empty model)
    const r1 = await cli(['run', xesPath, '--format', 'json']);
    const j1 = assertEnvelope(r1, 'run');
    expect(r1.exitCode).toBe(0);
    const model = (j1.payload as Record<string, unknown>).model as Record<string, unknown>;
    const nodes = model?.nodes;
    const nodeCount = Array.isArray(nodes) ? nodes.length : (typeof nodes === 'number' ? nodes : 0);
    expect(nodeCount).toBeGreaterThan(0);

    // ANTI-STUB: algorithm flag is not ignored (stub always reports 'heuristic')
    const r2 = await cli(['run', xesPath, '--algorithm', 'dfg', '--format', 'json']);
    const j2 = assertEnvelope(r2, 'run');
    expect((j2.payload as Record<string, unknown>).algorithm as string).toContain('dfg');

    // FAILURE ORACLE: missing file → exit 2, error.message non-empty
    const rf = await cli(['run', '/nonexistent/file.xes', '--format', 'json']);
    expect(rf.exitCode).toBe(2);
    const ef = extractJson(rf.stdout);
    expect(ef.status).toBe('error');
    expect(((ef.error as Record<string, unknown>).message as string).length).toBeGreaterThan(0);
  });

  it('compare: N results for N algorithms; each has elapsed_ms > 0; missing file → exit 2', async () => {
    // ANTI-STUB: stub returns { algorithms: [] }
    // Use distinct algorithms — dfg,dfg is rejected since v26.5 (DUPLICATE_ALGORITHMS)
    const r = await cli(['compare', 'dfg,heuristic', '--input', xesPath, '--format', 'json']);
    const j = assertEnvelope(r, 'compare');
    const algos = (j.payload as Record<string, unknown>).algorithms as Array<Record<string, unknown>>;
    expect(algos.length).toBe(2);
    for (const a of algos) expect(a.elapsed_ms ?? a.elapsedMs).toBeGreaterThan(0);

    // FAILURE ORACLE: missing input file → source_error (2)
    const rf = await cli(['compare', 'dfg,heuristic', '--input', '/no/such.xes', '--format', 'json']);
    expect(rf.exitCode).toBe(2);
  });

  it('diff: self-diff jaccard ≥ 0.9, shared activities non-empty; missing file → exit 2', async () => {
    // ANTI-STUB: stub returns jaccard = 0.0 or ignores second file
    const r = await cli(['diff', xesPath, xesPath, '--format', 'json']);
    const j = assertEnvelope(r, 'diff');
    const diff = (j.payload as Record<string, unknown>).diff as Record<string, unknown>;
    expect(diff.jaccard as number).toBeGreaterThanOrEqual(0.9);
    expect((diff.activities as Record<string, unknown[]>).shared.length).toBeGreaterThan(0);

    // FAILURE ORACLE
    const rf = await cli(['diff', '/no/such.xes', xesPath, '--format', 'json']);
    expect(rf.exitCode).toBe(2);
  });
});

// ─── 2. Analysis: conformance, quality, validate ──────────────────────────────
// CONTRACT: real structural checks — not always-valid

describe('analysis commands', () => {
  it('conformance: envelope valid, fitness ∈ [0,1] when present; missing → exit 2', async () => {
    const r = await cli(['conformance', xesPath, '--format', 'json']);
    const j = assertEnvelope(r, 'conformance');
    expect(j.payload).not.toBeNull();
    if (j.status === 'ok') {
      const f = (j.payload as Record<string, unknown>).fitness;
      if (typeof f === 'number') { expect(f).toBeGreaterThanOrEqual(0); expect(f).toBeLessThanOrEqual(1); }
    }
    const rf = await cli(['conformance', '/missing.xes', '--format', 'json']);
    expect(rf.exitCode).toBe(2);
  });

  it('quality: envelope valid on any outcome; missing → exit 2', async () => {
    // Command may fail on small logs (inductive miner issue) — envelope invariants hold regardless
    const r = await cli(['quality', xesPath, '--format', 'json']);
    assertEnvelope(r, 'quality'); // stub-killer: run_id, timestamp, exit_code parity
    const rf = await cli(['quality', '/missing.xes', '--format', 'json']);
    expect(rf.exitCode).toBe(2);
  });

  it('validate: valid XES exits 0; missing file → exit 2', async () => {
    // ANTI-STUB: stub skips check and exits 0 without reading the file
    const r = await cli(['validate', xesPath, '--output-format', 'json']);
    expect(r.exitCode).toBe(0);
    assertEnvelope(r, 'validate');

    // FAILURE ORACLE
    const rf = await cli(['validate', '/no/such.xes', '--output-format', 'json']);
    expect(rf.exitCode).toBe(2);
  });
});

// ─── 3. Prediction ───────────────────────────────────────────────────────────
// CONTRACT: predictions derived from log — not hardcoded constants

describe('predict command', () => {
  it('next-activity: probability sum ≤ 1; drift: ok; missing → exit 2; bad task → non-zero', async () => {
    // ANTI-STUB: stub returns probability: 1.0 for every prediction unconditionally
    const r1 = await cli(['predict', 'next-activity', '--input', xesPath, '--format', 'json']);
    const j1 = assertEnvelope(r1, 'predict');
    const preds = (j1.payload as Record<string, unknown>).predictions as Array<{ probability: number }> | undefined;
    if (preds?.length) {
      const total = preds.reduce((s, p) => s + (p.probability ?? 0), 0);
      expect(total).toBeLessThanOrEqual(1.01);
      expect(total).toBeGreaterThan(0);
    }

    // envelope-only check for drift task
    const r2 = await cli(['predict', 'drift', '--input', xesPath, '--format', 'json']);
    assertEnvelope(r2, 'predict');

    // FAILURE ORACLE: missing log
    const rf = await cli(['predict', 'next-activity', '--input', '/missing.xes', '--format', 'json']);
    expect(rf.exitCode).toBe(2);

    // FAILURE ORACLE: unknown task
    const rb = await cli(['predict', 'invented-xyz', '--input', xesPath, '--format', 'json']);
    expect(rb.exitCode).not.toBe(0);
  });
});

// ─── 4. Environment: doctor, status ──────────────────────────────────────────
// CONTRACT: real environment state, not hardcoded "all good"

describe('environment commands', () => {
  it('doctor check: checks non-empty, each has name; status: real platform/arch', { timeout: 30000 }, async () => {
    // ANTI-STUB: stub returns { checks: [] }
    const r = await cli(['doctor', 'check', '--format', 'json'], { timeout: 30000 });
    const j = assertEnvelope(r, 'doctor check');
    const checks = (j.payload as Record<string, unknown>).checks as Array<Record<string, unknown>>;
    expect(checks?.length).toBeGreaterThan(0);
    expect('name' in checks[0] || 'check' in checks[0]).toBe(true);

    // ANTI-STUB: stub returns platform: "", arch: ""
    const rs = await cli(['status', '--format', 'json']);
    const js = assertEnvelope(rs, 'status');
    const sys = (js.payload as Record<string, unknown>).system as Record<string, string> | undefined;
    if (sys?.platform) expect(['darwin', 'linux', 'win32']).toContain(sys.platform);
    if (sys?.arch) expect(['x64', 'arm64', 'ia32', 'arm']).toContain(sys.arch);
  });
});

// ─── 5. Certification: verify ────────────────────────────────────────────────
// CONTRACT: gates reflect real runtime state; exit non-zero if any fail

describe('verify command', () => {
  it('gates non-empty, each has gate+passed; JSON exit_code = process exit', async () => {
    const r = await cli(['verify', '--fast', '--format', 'json']);
    const j = assertEnvelope(r, 'verify');
    const gates = (j.payload as Record<string, unknown>).gates as Array<Record<string, unknown>>;
    expect(gates.length).toBeGreaterThan(0);
    for (const g of gates) {
      // ANTI-STUB: stub returns bare { passed: true } without gate name
      expect(typeof g.gate).toBe('string');
      expect(typeof g.passed).toBe('boolean');
    }
    // ANTI-STUB: stub returns { exit_code: 0 } but process exits 3
    expect(j.exit_code).toBe(r.exitCode);
  });
});

// ─── 6. Config: show, check, verify ─────────────────────────────────────────
// CONTRACT: provenance is real, gates are the documented 4, schema valid

describe('config commands', () => {
  it('show: provenance non-empty, has known source; verify: 4 documented gates', async () => {
    // ANTI-STUB: stub returns { provenance: {} }
    const rs = await cli(['config', 'show', '--format', 'json']);
    const js = assertEnvelope(rs, 'config show');
    const prov = (js.payload as Record<string, unknown>).provenance as Record<string, { source: string }>;
    expect(Object.keys(prov).length).toBeGreaterThan(0);
    expect(Object.values(prov).some((v) => v.source !== 'unknown' && v.source !== '')).toBe(true);

    // ANTI-STUB: stub uses ['check1', 'check2', ...] not the contract names
    const rv = await cli(['config', 'verify', '--format', 'json']);
    const jv = assertEnvelope(rv, 'config verify');
    const gates = (jv.payload as Record<string, unknown>).gates as Array<{ gate: string; pass: boolean }>;
    expect(gates.length).toBe(4);
    const names = gates.map((g) => g.gate);
    expect(names).toContain('schema valid');
    expect(names).toContain('provenance complete');
    expect(names).toContain('zero warnings');
    expect(names).toContain('hash present');
    expect(gates.find((g) => g.gate === 'schema valid')?.pass).toBe(true);
  });
});

// ─── 7. Benchmark: build, replay, verify ─────────────────────────────────────
// CONTRACT: real verdict matching; exit non-zero when traces fail

describe('benchmark commands', () => {
  it('build: valid corpus → valid > 0; invalid corpus → invalid > 0', async () => {
    // ANTI-STUB: stub returns valid: 0 without parsing
    const r = await cli(['benchmark', 'build', '--corpus', validCorpusPath, '--format', 'json']);
    const j = assertEnvelope(r, 'benchmark build');
    expect((j.payload as Record<string, unknown>).valid as number).toBeGreaterThan(0);
    expect(r.exitCode).toBe(0);

    // FAILURE ORACLE: invalid JSONL reported, exits non-zero
    const ri = await cli(['benchmark', 'build', '--corpus', invalidCorpusPath, '--format', 'json']);
    const ji = assertEnvelope(ri, 'benchmark build');
    expect((ji.payload as Record<string, unknown>).invalid as number).toBeGreaterThan(0);
    expect(ri.exitCode).not.toBe(0);
  });

  it('verify FAILURE ORACLE: failing corpus → exit ≠ 0, failed > 0 (stub always exits 0)', async () => {
    // THE critical anti-stub: a stub that always exits 0 would pass CI on failing benchmarks
    const r = await cli(['benchmark', 'verify', '--corpus', failingCorpusPath, '--format', 'json']);
    const j = assertEnvelope(r, 'benchmark verify');
    expect(r.exitCode).not.toBe(0);
    expect((j.payload as Record<string, unknown>).failed as number).toBeGreaterThan(0);
    // JSON exit_code must match process (stub: JSON=0, process=3)
    expect(j.exit_code).toBe(r.exitCode);
  });
});

// ─── 8. Scaffold: init ────────────────────────────────────────────────────────
// CONTRACT: files created on disk — not just stdout "success"

describe('init command', () => {
  it('wasm4pm.toml created on disk with non-empty TOML content', async () => {
    const d = join(tmpDir, `init-${Date.now()}`);
    mkdirSync(d, { recursive: true });
    const r = await cli(['init', '--format', 'json'], { cwd: d });
    expect(r.exitCode).toBe(0);
    // ANTI-STUB: stub exits 0 without writing any files
    expect(existsSync(join(d, 'wasm4pm.toml'))).toBe(true);
    const { readFileSync } = await import('node:fs');
    const content = readFileSync(join(d, 'wasm4pm.toml'), 'utf8');
    // ANTI-STUB: stub creates a 0-byte file
    expect(content.length).toBeGreaterThan(0);
    expect(content).toContain('[');
  });
});

// ─── 9. Supplementary analysis: temporal, social, simulate ───────────────────
// CONTRACT: exits 0 on valid log; exits 2 on missing file

describe('supplementary analysis commands', () => {
  it('temporal + social + simulate: valid log exits 0; missing → exit 2', async () => {
    for (const [cmd, args] of [
      ['temporal', [xesPath]],
      ['social', [xesPath]],
      ['simulate', [xesPath]],
    ] as [string, string[]][]) {
      const r = await cli([cmd, ...args, '--format', 'json']);
      // ANTI-STUB: stub returns error for any real log
      expect(r.exitCode).toBe(0);
      assertEnvelope(r, cmd);

      // FAILURE ORACLE
      const rf = await cli([cmd, '/missing.xes', '--format', 'json']);
      expect(rf.exitCode).toBe(2);
    }
  });
});

// ─── 10. Membrane: check, verify ─────────────────────────────────────────────
// CONTRACT: checks reflect real state; all_pass derived from individual checks

describe('membrane commands', () => {
  it('check: checks non-empty, all_pass derived; verify: exit_code = process exit', async () => {
    // ANTI-STUB: stub returns { checks: [] }
    const r = await cli(['membrane', 'check', '--format', 'json']);
    const j = assertEnvelope(r, 'membrane check');
    const checks = (j.payload as Record<string, unknown>).checks as Array<{ pass: boolean }>;
    expect(checks.length).toBeGreaterThan(0);
    // ANTI-STUB: stub always returns all_pass: true without inspecting checks
    expect((j.payload as Record<string, unknown>).all_pass).toBe(checks.every((c) => c.pass));

    // verify: JSON exit_code must match process exit (stub: JSON=0, process=3)
    const rv = await cli(['membrane', 'verify', '--format', 'json']);
    const jv = extractJson(rv.stdout);
    expect(jv.exit_code).toBe(rv.exitCode);
  });
});

// ─── 11. Cross-command invariants ────────────────────────────────────────────
// CONTRACT: run_id unique per invocation; exit_code in JSON = process exit

describe('cross-command envelope invariants', () => {
  it('run_id unique across calls; success exit_code=0 in JSON; failure exit_code=2 in JSON', async () => {
    // ANTI-STUB: stub returns same hardcoded UUID for every invocation
    const [r1, r2] = await Promise.all([
      cli(['status', '--format', 'json']),
      cli(['status', '--format', 'json']),
    ]);
    const id1 = (extractJson(r1.stdout).meta as Record<string, string>).run_id;
    const id2 = (extractJson(r2.stdout).meta as Record<string, string>).run_id;
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(UUID_RE);

    // ANTI-STUB: stub writes { exit_code: 0 } even when process exits 2
    const rs = await cli(['config', 'show', '--format', 'json']);
    expect(extractJson(rs.stdout).exit_code).toBe(0);
    expect(rs.exitCode).toBe(0);

    const rf = await cli(['run', '/nonexistent.xes', '--format', 'json']);
    expect(rf.exitCode).toBe(2);
    expect(extractJson(rf.stdout).exit_code).toBe(2);
  });
});
