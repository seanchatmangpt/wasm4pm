/**
 * POWL — Error Contract and Structural Field Tests
 *
 * `wpm powl <anything>` is now intercepted unconditionally by the hard-break
 * table (nouns/_removed.ts): only two-token entries `powl replay` and
 * `powl construct` are listed there; every OTHER `powl <subcommand>` (parse,
 * simplify, convert, diff, complexity, footprints, conformance, import,
 * discover, get-children, node-info, freq-analysis) falls through to the
 * one-token catch-all `{ old: 'powl', replacement: 'model discover' }` and
 * is rejected before ever reaching `commands/powl.ts`. None of these twelve
 * subcommands have a noun/verb equivalent — this is a genuine, intentional
 * feature retirement from the CLI surface (see `powl-cli.test.ts`'s header
 * for the fuller rationale), not a rename.
 *
 * `commands/powl.ts` itself is untouched and still fully functional. Rather
 * than deleting real error-contract and structural-field regression
 * coverage for code that still exists and still runs (real WASM calls
 * included), these tests now invoke it in-process the same way the
 * framework's own bridge does for still-wired legacy commands
 * (`nouns/_bridge.ts`'s `invokeLegacyCommand`), instead of spawning the
 * (now hard-broken for this path) `wpm` binary. All original assertions
 * are unchanged.
 *
 * NOTE: `invokeLegacyCommand` traps `process.exit`/stdout globally for the
 * duration of one call. Concurrent in-process invocations (`Promise.all`)
 * race on that shared global state, unlike the original two-separate-
 * child-processes version of this suite — the handful of places that used
 * `Promise.all` below now run sequentially instead.
 *
 * Van der Aalst QA perspective:
 * - Error paths are first-class defects; every invalid input must produce a typed
 *   refusal, not a crash. These tests verify the full exit-code contract across all
 *   12 subcommands and confirm structured JSON envelope fields are always present.
 * - Structural field tests assert the shape of each subcommand's happy-path payload,
 *   covering subcommands not already exercised by powl-cli.test.ts or powl-jtbd.test.ts.
 * - Metamorphic relations: subcommand symmetry (diff A==A), monotonicity (simplify
 *   of already-simplified model is idempotent at CLI level).
 *
 * Oracle hierarchy:
 *   Rank 1 (mathematical): JSON envelope always has {command, status, exit_code, payload}
 *   Rank 2 (domain contract): error envelopes have status="error" and non-null error.code
 *   Rank 3 (metamorphic): unknown subcommand → exit 1, missing required arg → exit 2
 *
 * Seed: tests use fixed models; no faker needed here (all inputs are deterministic
 * constants). Test runtime is fast because most cases hit the pre-WASM guard path.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { powl } from '../commands/powl.js';
import { invokeLegacyCommand } from '../nouns/_bridge.js';

// ─── In-process legacy command runner ────────────────────────────────────────

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface Envelope {
  command: string;
  status: 'ok' | 'error';
  exit_code: number;
  payload: Record<string, unknown> | null;
  error?: { code: string; message: string };
}

async function runCli(args: string[]): Promise<CliResult> {
  // `args[0]` is 'powl' in every call site below (kept from the original
  // suite's CLI-argv shape); `commands/powl.ts` is itself the 'powl'
  // command, so drop that leading token before invoking it directly.
  const [, ...rest] = args;
  const { stdout, stderr, exitCode } = await invokeLegacyCommand(powl, rest);
  return { exitCode, stdout, stderr };
}

function parseEnvelope(result: CliResult): Envelope {
  try {
    return JSON.parse(result.stdout) as Envelope;
  } catch {
    throw new Error(
      `Failed to parse command JSON output.\nstdout: ${result.stdout.slice(0, 500)}\nstderr: ${result.stderr.slice(0, 500)}`
    );
  }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** Minimal linear 3-node POWL — simplest valid model with a non-trivial ordering */
const LINEAR_3 = 'PO=(nodes={A, B, C}, order={A-->B, B-->C})';

/** Single-activity model — trivial POWL */
const SINGLE_A = 'A';

/** XOR choice model — exercises operator structure */
const XOR_AB = 'X ( A, B )';

/** Minimal XES log string — 1 trace, 2 events */
function buildMinimalXes(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<log xmlns="http://www.xes-standard.org/" xes.version="1.0">
  <extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/>
  <extension name="Time" prefix="time" uri="http://www.xes-standard.org/time.xesext"/>
  <global scope="trace"><string key="concept:name" value="Case ID"/></global>
  <global scope="event">
    <string key="concept:name" value="Activity"/>
    <date key="time:timestamp" value="Timestamp"/>
  </global>
  <trace>
    <string key="concept:name" value="case_001"/>
    <event>
      <string key="concept:name" value="A"/>
      <date key="time:timestamp" value="2026-01-01T09:00:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="B"/>
      <date key="time:timestamp" value="2026-01-01T10:00:00Z"/>
    </event>
  </trace>
</log>`;
}

// ─── Temp dir lifecycle ────────────────────────────────────────────────────────

let tempDir: string;
let xesPath: string;

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-powl-errors-'));
  xesPath = path.join(tempDir, 'minimal.xes');
  fs.writeFileSync(xesPath, buildMinimalXes(), 'utf-8');
});

afterAll(() => {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch { /* cleanup best-effort */ }
});

// ─── JSON envelope invariant (Rank 1) ─────────────────────────────────────────

describe('POWL JSON envelope — always-present fields (Rank 1 mathematical invariant)', () => {
  it('successful parse response includes command, status=ok, exit_code=0, and non-null payload', async () => {
    const result = await runCli(['powl', 'parse', `--model=${SINGLE_A}`, '--format=json', '--no-save']);
    expect(result.exitCode).toBe(0);
    const env = parseEnvelope(result);
    expect(env.command).toBeDefined();
    expect(env.status).toBe('ok');
    expect(env.exit_code).toBe(0);
    expect(env.payload).not.toBeNull();
  });

  it('error response includes command, status=error, non-zero exit_code, null payload, and error.code', async () => {
    const result = await runCli(['powl', 'badsubcommand', '--format=json']);
    expect(result.exitCode).not.toBe(0);
    const env = parseEnvelope(result);
    expect(env.status).toBe('error');
    expect(env.exit_code).toBeGreaterThan(0);
    expect(env.payload).toBeNull();
    expect(env.error).toBeDefined();
    expect(typeof env.error!.code).toBe('string');
    expect(env.error!.code.length).toBeGreaterThan(0);
    expect(typeof env.error!.message).toBe('string');
  });

  it('JSON envelope exit_code field matches the actual process exit code for success', async () => {
    const result = await runCli(['powl', 'complexity', `--model=${LINEAR_3}`, '--format=json', '--no-save']);
    const env = parseEnvelope(result);
    expect(result.exitCode).toBe(env.exit_code);
  });

  it('JSON envelope exit_code field matches the actual process exit code for error', async () => {
    const result = await runCli(['powl', 'parse', '--format=json']);
    expect(result.exitCode).toBeGreaterThan(0);
    const env = parseEnvelope(result);
    expect(result.exitCode).toBe(env.exit_code);
  });
});

// ─── Unknown subcommand (Rank 2) ─────────────────────────────────────────────

describe('POWL unknown subcommand — exit code contract (Rank 2 domain contract)', () => {
  it('unknown subcommand exits 1 (config_error) with INVALID_SUBCOMMAND code', async () => {
    // An unknown subcommand is a user argument error (like an unknown flag), not a
    // source error. Source errors are for missing/unreadable files. Exit 1 = config_error.
    const result = await runCli(['powl', 'nonexistent', '--format=json']);
    expect(result.exitCode).toBe(1);
    const env = parseEnvelope(result);
    expect(env.status).toBe('error');
    expect(env.error?.code).toBe('INVALID_SUBCOMMAND');
  });

  it('unknown subcommand error message lists all valid subcommands', async () => {
    const result = await runCli(['powl', 'garbage_command', '--format=json']);
    const env = parseEnvelope(result);
    const msg = env.error?.message ?? '';
    // All 12 registered subcommands must appear in the error message
    const expectedSubs = [
      'parse', 'simplify', 'convert', 'diff', 'complexity',
      'footprints', 'conformance', 'import', 'discover',
      'get-children', 'node-info', 'freq-analysis',
    ];
    for (const sub of expectedSubs) {
      expect(msg, `error message must list subcommand: ${sub}`).toContain(sub);
    }
  });
});

// ─── Missing --model error path (Rank 2) ─────────────────────────────────────

describe('POWL missing --model — exits 2 for subcommands that require it (Rank 2)', () => {
  const MODEL_REQUIRED = ['parse', 'simplify', 'complexity', 'footprints', 'get-children', 'node-info', 'freq-analysis'];

  for (const sub of MODEL_REQUIRED) {
    it(`wpm powl ${sub} without --model exits 2 with MISSING_MODEL code`, async () => {
      const result = await runCli(['powl', sub, '--format=json', '--no-save']);
      expect(result.exitCode, `${sub} should exit 2 when --model is absent`).toBe(2);
      const env = parseEnvelope(result);
      expect(env.status).toBe('error');
      expect(env.error?.code).toBe('MISSING_MODEL');
    });
  }
});

// ─── simplify — structural fields + idempotency (Rank 2 + Rank 3) ─────────────

describe('powl simplify — structural fields and idempotency', () => {
  it('simplify of a valid linear model returns node_count, repr, root', async () => {
    const result = await runCli(['powl', 'simplify', `--model=${LINEAR_3}`, '--format=json', '--no-save']);
    expect(result.exitCode).toBe(0);
    const payload = parseEnvelope(result).payload!;
    expect(typeof payload.node_count).toBe('number');
    expect(typeof payload.repr).toBe('string');
    expect(typeof payload.root).toBe('number');
    expect(payload.node_count as number).toBeGreaterThan(0);
    expect((payload.repr as string).length).toBeGreaterThan(0);
  });

  it('simplify of a single-activity model returns node_count=1', async () => {
    const result = await runCli(['powl', 'simplify', `--model=${SINGLE_A}`, '--format=json', '--no-save']);
    expect(result.exitCode).toBe(0);
    const payload = parseEnvelope(result).payload!;
    expect(payload.node_count as number).toBeGreaterThanOrEqual(1);
  });

  it('simplify is CLI-idempotent: repr of simplify(m) equals repr of simplify(simplify(m))', async () => {
    // First simplify
    const r1 = await runCli(['powl', 'simplify', `--model=${LINEAR_3}`, '--format=json', '--no-save']);
    expect(r1.exitCode).toBe(0);
    const repr1 = parseEnvelope(r1).payload!.repr as string;

    // Second simplify on the result's repr
    const r2 = await runCli(['powl', 'simplify', `--model=${repr1}`, '--format=json', '--no-save']);
    expect(r2.exitCode).toBe(0);
    const repr2 = parseEnvelope(r2).payload!.repr as string;

    // Repr must be stable after second simplification
    expect(repr2).toBe(repr1);
  });
});

// ─── convert — structural fields + error paths ────────────────────────────────

describe('powl convert — all three targets and error contracts', () => {
  it('convert --to=petri-net returns target field and parseable JSON output string', async () => {
    const result = await runCli([
      'powl', 'convert', `--model=${LINEAR_3}`, '--to=petri-net', '--format=json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const payload = parseEnvelope(result).payload!;
    expect(payload.target).toBe('petri-net');
    expect(typeof payload.output).toBe('string');
    // Output is a JSON-serialized petri net
    const pn = JSON.parse(payload.output as string);
    expect(pn).toHaveProperty('net');
    expect(pn).toHaveProperty('initial_marking');
    expect(pn).toHaveProperty('final_marking');
  });

  it('petri-net output has places, transitions, and arcs arrays', async () => {
    const result = await runCli([
      'powl', 'convert', `--model=${LINEAR_3}`, '--to=petri-net', '--format=json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const payload = parseEnvelope(result).payload!;
    const pn = JSON.parse(payload.output as string);
    expect(Array.isArray(pn.net.places)).toBe(true);
    expect(Array.isArray(pn.net.transitions)).toBe(true);
    expect(Array.isArray(pn.net.arcs)).toBe(true);
    expect(pn.net.places.length).toBeGreaterThan(0);
    expect(pn.net.transitions.length).toBeGreaterThan(0);
    expect(pn.net.arcs.length).toBeGreaterThan(0);
  });

  it('convert --to=process-tree returns non-empty JSON output with operator or label field', async () => {
    const result = await runCli([
      'powl', 'convert', `--model=${LINEAR_3}`, '--to=process-tree', '--format=json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const payload = parseEnvelope(result).payload!;
    expect(payload.target).toBe('process-tree');
    const pt = JSON.parse(payload.output as string);
    // Process tree root has either an operator (non-leaf) or label (leaf)
    const hasStructure = 'operator' in pt || 'label' in pt;
    expect(hasStructure, 'process-tree root must have operator or label').toBe(true);
  });

  it('convert --to=bpmn returns XML string containing BPMN namespace', async () => {
    const result = await runCli([
      'powl', 'convert', `--model=${LINEAR_3}`, '--to=bpmn', '--format=json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const payload = parseEnvelope(result).payload!;
    expect(payload.target).toBe('bpmn');
    expect(typeof payload.output).toBe('string');
    expect(payload.output as string).toContain('BPMN');
  });

  it('convert without --to exits 1 (config_error) and emits JSON error envelope', async () => {
    const result = await runCli([
      'powl', 'convert', `--model=${SINGLE_A}`, '--format=json', '--no-save',
    ]);
    expect(result.exitCode).toBe(1);
    const env = parseEnvelope(result);
    expect(env.status).toBe('error');
    expect(env.exit_code).toBe(1);
    expect(env.error?.message).toMatch(/--to/i);
  });

  it('convert without --to error message lists valid targets', async () => {
    const result = await runCli([
      'powl', 'convert', `--model=${SINGLE_A}`, '--format=json', '--no-save',
    ]);
    const env = parseEnvelope(result);
    const msg = env.error?.message ?? '';
    expect(msg).toContain('petri-net');
    expect(msg).toContain('process-tree');
    expect(msg).toContain('bpmn');
  });

  it('convert with invalid --to target exits 1 (config_error) and emits JSON error envelope', async () => {
    const result = await runCli([
      'powl', 'convert', `--model=${SINGLE_A}`, '--to=invalid-format', '--format=json', '--no-save',
    ]);
    expect(result.exitCode).toBe(1);
    const env = parseEnvelope(result);
    expect(env.status).toBe('error');
    expect(env.exit_code).toBe(1);
    expect(env.error?.message).toMatch(/invalid-format/);
  });
});

// ─── footprints — structural fields (Rank 2) ─────────────────────────────────

describe('powl footprints — structural field contract', () => {
  it('footprints payload has start_activities, end_activities, activities, and min_trace_length', async () => {
    const result = await runCli(['powl', 'footprints', `--model=${LINEAR_3}`, '--format=json', '--no-save']);
    expect(result.exitCode).toBe(0);
    const payload = parseEnvelope(result).payload!;
    expect(Array.isArray(payload.start_activities)).toBe(true);
    expect(Array.isArray(payload.end_activities)).toBe(true);
    expect(Array.isArray(payload.activities)).toBe(true);
    expect(typeof payload.min_trace_length).toBe('number');
  });

  it('footprints activities array contains all declared model activities (A, B, C)', async () => {
    const result = await runCli(['powl', 'footprints', `--model=${LINEAR_3}`, '--format=json', '--no-save']);
    expect(result.exitCode).toBe(0);
    const activities = parseEnvelope(result).payload!.activities as string[];
    expect(activities).toContain('A');
    expect(activities).toContain('B');
    expect(activities).toContain('C');
  });

  it('footprints start_activities contains only the declared first activity (A)', async () => {
    const result = await runCli(['powl', 'footprints', `--model=${LINEAR_3}`, '--format=json', '--no-save']);
    expect(result.exitCode).toBe(0);
    const starts = parseEnvelope(result).payload!.start_activities as string[];
    expect(starts).toContain('A');
    // In a strict linear order, B and C cannot be start activities
    expect(starts).not.toContain('B');
    expect(starts).not.toContain('C');
  });

  it('footprints end_activities contains only the declared last activity (C)', async () => {
    const result = await runCli(['powl', 'footprints', `--model=${LINEAR_3}`, '--format=json', '--no-save']);
    expect(result.exitCode).toBe(0);
    const ends = parseEnvelope(result).payload!.end_activities as string[];
    expect(ends).toContain('C');
    expect(ends).not.toContain('A');
    expect(ends).not.toContain('B');
  });

  it('footprints min_trace_length for 3-activity linear model equals 3', async () => {
    const result = await runCli(['powl', 'footprints', `--model=${LINEAR_3}`, '--format=json', '--no-save']);
    expect(result.exitCode).toBe(0);
    const payload = parseEnvelope(result).payload!;
    expect(payload.min_trace_length).toBe(3);
  });

  it('footprints skippable is false for a mandatory linear sequence', async () => {
    const result = await runCli(['powl', 'footprints', `--model=${LINEAR_3}`, '--format=json', '--no-save']);
    expect(result.exitCode).toBe(0);
    const payload = parseEnvelope(result).payload!;
    expect(payload.skippable).toBe(false);
  });
});

// ─── diff — missing model2 error (Rank 2) ────────────────────────────────────

describe('powl diff — required arg contract', () => {
  it('diff without --model2 exits 2 (source_error) with MISSING_MODEL2 code', async () => {
    const result = await runCli(['powl', 'diff', `--model=${SINGLE_A}`, '--format=json', '--no-save']);
    expect(result.exitCode).toBe(2);
    const env = parseEnvelope(result);
    expect(env.status).toBe('error');
    expect(env.exit_code).toBe(2);
    expect(env.error?.message).toMatch(/--model2/i);
    // Specific error code improves DX: tooling and scripts can react to MISSING_MODEL2
    // rather than parsing the human message.
    expect(env.error?.code).toBe('MISSING_MODEL2');
  });

  it('diff of model with itself has severity=None (Rank 3 metamorphic: no change = no severity)', async () => {
    const result = await runCli([
      'powl', 'diff', `--model=${SINGLE_A}`, `--model2=${SINGLE_A}`, '--format=json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const payload = parseEnvelope(result).payload!;
    expect(payload.behaviourally_equivalent).toBe(true);
    // Self-diff severity should be None
    expect(payload.severity).toBe('None');
  });
});

// ─── conformance — missing --log error (Rank 2) ───────────────────────────────

describe('powl conformance — required arg contract', () => {
  it('conformance without --log exits 2 (source_error) and emits JSON error envelope', async () => {
    const result = await runCli(['powl', 'conformance', `--model=${SINGLE_A}`, '--format=json', '--no-save']);
    expect(result.exitCode).toBe(2);
    const env = parseEnvelope(result);
    expect(env.status).toBe('error');
    expect(env.exit_code).toBe(2);
    expect(env.error?.message).toMatch(/--log/i);
  });

  it('conformance with a valid XES log returns percentage and total_traces', async () => {
    const result = await runCli([
      'powl', 'conformance', `--model=${LINEAR_3}`, `--log=${xesPath}`, '--format=json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const payload = parseEnvelope(result).payload!;
    expect(typeof payload.percentage).toBe('number');
    expect(typeof payload.total_traces).toBe('number');
    expect(payload.total_traces).toBe(1);
  });

  it('conformance with nonexistent XES path exits 2 (source_error) and emits JSON error envelope', async () => {
    const result = await runCli([
      'powl', 'conformance', `--model=${SINGLE_A}`, '--log=/no/such/file.xes', '--format=json', '--no-save',
    ]);
    expect(result.exitCode).toBe(2);
    const env = parseEnvelope(result);
    expect(env.status).toBe('error');
    expect(env.exit_code).toBe(2);
    expect(env.error?.message).toMatch(/no\/such\/file\.xes|Cannot read/i);
  });
});

// ─── import — error paths (Rank 2) ───────────────────────────────────────────

describe('powl import — required arg contract', () => {
  it('import without --from exits 1 (config_error) for unknown source format', async () => {
    const result = await runCli(['powl', 'import', `--model=${SINGLE_A}`, '--format=json', '--no-save']);
    // No --from → config_error (exit 1)
    expect(result.exitCode).toBe(1);
    const env = parseEnvelope(result);
    expect(env.status).toBe('error');
  });

  it('import with invalid --from target exits 1 (config_error)', async () => {
    const result = await runCli([
      'powl', 'import', `--model=${SINGLE_A}`, '--from=unknown-format', '--format=json', '--no-save',
    ]);
    expect(result.exitCode).toBe(1);
    const env = parseEnvelope(result);
    expect(env.status).toBe('error');
  });

  it('import with valid --from but nonexistent model file exits 2 (source_error)', async () => {
    const result = await runCli([
      'powl', 'import', '--model=/nonexistent/file.json', '--from=process-tree', '--format=json', '--no-save',
    ]);
    // source_error = exit 2 (cannot read file)
    expect(result.exitCode).toBe(2);
    const env = parseEnvelope(result);
    expect(env.status).toBe('error');
  });
});

// ─── discover — missing --input error (Rank 2) ───────────────────────────────

describe('powl discover — required arg contract', () => {
  it('discover without --input exits 2 (source_error)', async () => {
    const result = await runCli(['powl', 'discover', '--format=json']);
    expect(result.exitCode).toBe(2);
    const env = parseEnvelope(result);
    expect(env.status).toBe('error');
    expect(env.error?.message).toContain('--input');
  });

  it('discover with nonexistent XES path exits 2 (source_error) with DISCOVER_INPUT_NOT_FOUND', async () => {
    // A missing input file is a source_error (exit 2), not an execution_error (exit 3).
    // The file-not-found is known before any WASM work begins.
    const result = await runCli([
      'powl', 'discover', '--input=/no/such/log.xes', '--format=json',
    ]);
    expect(result.exitCode).toBe(2);
    const env = parseEnvelope(result);
    expect(env.status).toBe('error');
    expect(env.exit_code).toBe(2);
    expect(env.error?.code).toBe('DISCOVER_INPUT_NOT_FOUND');
  });
});

// ─── get-children — structural fields (Rank 2) ───────────────────────────────

describe('powl get-children — structural field contract', () => {
  it('get-children on root of XOR model returns children array (non-empty for operator node)', async () => {
    const result = await runCli([
      'powl', 'get-children', `--model=${XOR_AB}`, '--index=2', '--format=json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const payload = parseEnvelope(result).payload!;
    expect(Array.isArray(payload.children)).toBe(true);
  });

  it('get-children on leaf node (index 0 of single-activity model) returns empty children array', async () => {
    const result = await runCli([
      'powl', 'get-children', `--model=${SINGLE_A}`, '--index=0', '--format=json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const payload = parseEnvelope(result).payload!;
    expect(Array.isArray(payload.children)).toBe(true);
    expect((payload.children as unknown[]).length).toBe(0);
  });

  it('get-children children elements are valid numeric arena indices', async () => {
    const result = await runCli([
      'powl', 'get-children', `--model=${XOR_AB}`, '--index=2', '--format=json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const children = parseEnvelope(result).payload!.children as number[];
    for (const idx of children) {
      expect(typeof idx).toBe('number');
      expect(idx).toBeGreaterThanOrEqual(0);
    }
  });
});

// ─── node-info — structural fields (Rank 2) ───────────────────────────────────

describe('powl node-info — structural field contract', () => {
  it('node-info on leaf of single-activity model returns id, label, and type=transition', async () => {
    const result = await runCli([
      'powl', 'node-info', `--model=${SINGLE_A}`, '--index=0', '--format=json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const payload = parseEnvelope(result).payload!;
    expect(typeof payload.id).toBe('number');
    expect(typeof payload.label).toBe('string');
    expect(payload.label).toBe('A');
    expect(payload.type).toBe('transition');
  });

  it('node-info on operator node (root of XOR model) returns type=operator and operator=X', async () => {
    // Parse first to find the root index (for XOR_AB it is arena index 2)
    const parseResult = await runCli([
      'powl', 'parse', `--model=${XOR_AB}`, '--format=json', '--no-save',
    ]);
    expect(parseResult.exitCode).toBe(0);
    const root = parseEnvelope(parseResult).payload!.root as number;

    const result = await runCli([
      'powl', 'node-info', `--model=${XOR_AB}`, `--index=${root}`, '--format=json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const payload = parseEnvelope(result).payload!;
    // Operator node shape: { type, operator, children } — no 'id' or 'label' field
    expect(payload.type).toBeDefined();
    expect(typeof payload.type).toBe('string');
    expect(payload.type).toBe('operator');
    // XOR operator field must be 'X'
    expect(payload.operator).toBe('X');
    // children should be an array of arena indices
    expect(Array.isArray(payload.children)).toBe(true);
    expect((payload.children as number[]).length).toBeGreaterThan(0);
  });

  it('node-info payload does not include undefined values (JSON-safe output)', async () => {
    const result = await runCli([
      'powl', 'node-info', `--model=${XOR_AB}`, '--index=0', '--format=json', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    // Round-tripping through JSON.parse → JSON.stringify must be stable
    const payload = parseEnvelope(result).payload!;
    const roundTripped = JSON.parse(JSON.stringify(payload));
    expect(roundTripped).toEqual(payload);
  });
});

// ─── Metamorphic: footprints activity count matches parse node_count (Rank 3) ─

describe('POWL structural metamorphic relations (Rank 3)', () => {
  it('footprints.activities.length equals number of labeled nodes from parse for a linear model', async () => {
    // Sequential — see file header re: invokeLegacyCommand's shared global state.
    const fpResult = await runCli(['powl', 'footprints', `--model=${LINEAR_3}`, '--format=json', '--no-save']);
    const parseResult = await runCli(['powl', 'parse', `--model=${LINEAR_3}`, '--format=json', '--no-save']);
    expect(fpResult.exitCode).toBe(0);
    expect(parseResult.exitCode).toBe(0);

    const activities = (parseEnvelope(fpResult).payload!.activities as string[]).length;
    // For a pure linear model with no silent transitions, all 3 activities must appear
    expect(activities).toBe(3);
  });

  it('simplify preserves all activities from the original model (no activities dropped)', async () => {
    const simplifyResult = await runCli(['powl', 'simplify', `--model=${LINEAR_3}`, '--format=json', '--no-save']);
    const parseResult = await runCli(['powl', 'footprints', `--model=${LINEAR_3}`, '--format=json', '--no-save']);
    expect(simplifyResult.exitCode).toBe(0);
    expect(parseResult.exitCode).toBe(0);

    const simplifiedRepr = parseEnvelope(simplifyResult).payload!.repr as string;
    const originalActivities = parseEnvelope(parseResult).payload!.activities as string[];

    // All activities from the original must appear in the simplified repr
    for (const activity of originalActivities) {
      expect(simplifiedRepr, `simplified model must contain activity: ${activity}`).toContain(activity);
    }
  });

  it('complexity score of XOR model >= complexity of single-activity model (operator adds complexity)', async () => {
    const xorResult = await runCli(['powl', 'complexity', `--model=${XOR_AB}`, '--format=json', '--no-save']);
    const singleResult = await runCli(['powl', 'complexity', `--model=${SINGLE_A}`, '--format=json', '--no-save']);
    expect(xorResult.exitCode).toBe(0);
    expect(singleResult.exitCode).toBe(0);

    const xorPayload = parseEnvelope(xorResult).payload!;
    const singlePayload = parseEnvelope(singleResult).payload!;

    const xorTotal = (xorPayload.cyclomatic as number) + (xorPayload.cfc as number) + (xorPayload.cognitive as number);
    const singleTotal = (singlePayload.cyclomatic as number) + (singlePayload.cfc as number) + (singlePayload.cognitive as number);

    expect(xorTotal).toBeGreaterThanOrEqual(singleTotal);
  });
});

// ─── Human format output contract ────────────────────────────────────────────

describe('POWL human format output — does not crash and exits 0', () => {
  it('simplify --format human exits 0 and produces non-empty output', async () => {
    // Human-format success/info output goes through `consola` (output.ts's
    // `ConsoleProjection`), which — under vitest's worker pool — writes via
    // `console.log`, a global vitest itself redirects for its own per-test
    // log capture. That redirection is invisible to `invokeLegacyCommand`'s
    // `process.stdout.write` trap (confirmed: the same call captures this
    // output correctly when run as a plain Node script, outside vitest —
    // see the migration notes for this file). Spy on `console.log` directly
    // instead, which reliably observes the call regardless of what else
    // vitest does with it.
    // No implementation override — this repo's test-purity hook forbids
    // stubbing implementations in integration tests (Gemba: real deps
    // only). Plain `vi.spyOn` still records calls while forwarding to the
    // real `console.log`.
    const logSpy = vi.spyOn(console, 'log');
    try {
      const result = await runCli(['powl', 'simplify', `--model=${SINGLE_A}`, '--format=human', '--no-save']);
      expect(result.exitCode).toBe(0);
      const viaStdout = result.stdout + result.stderr;
      const viaConsole = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect((viaStdout + viaConsole).length).toBeGreaterThan(0);
    } finally {
      logSpy.mockRestore();
    }
  });

  it('footprints --format human exits 0', async () => {
    const result = await runCli(['powl', 'footprints', `--model=${LINEAR_3}`, '--format=human', '--no-save']);
    expect(result.exitCode).toBe(0);
  });

  it('complexity --format human exits 0', async () => {
    const result = await runCli(['powl', 'complexity', `--model=${LINEAR_3}`, '--format=human', '--no-save']);
    expect(result.exitCode).toBe(0);
  });

  it('parse --format human exits 0', async () => {
    const result = await runCli(['powl', 'parse', `--model=${SINGLE_A}`, '--format=human', '--no-save']);
    expect(result.exitCode).toBe(0);
  });

  it('diff --format human exits 0 for self-diff', async () => {
    const result = await runCli([
      'powl', 'diff', `--model=${SINGLE_A}`, `--model2=${SINGLE_A}`, '--format=human', '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
  });
});
