/**
 * erlang-trace-ingest.test.ts
 *
 * Integration tests for `wpm trace ingest --from erlang`.
 *
 * Oracle rank: Rank 2 (Domain contract — MFA canonical form, file/line extraction,
 * frame count, OCEL event shape, and exit-code contracts per CLAUDE.md).
 *
 * Three Erlang/BEAM stack trace formats are covered:
 *
 *   Format 1 — OTP exception tuple (error_logger / Erlang shell):
 *     {error,{badarg,[{Module,Function,Arity,[{file,"path.erl"},{line,N}]}]}}
 *
 *   Format 2 — Crash dump style (flat colon lines):
 *     my_module:function_name/2 (my_module.erl:45)
 *
 *   Format 3 — Verbose exception style (shell / observer / logger):
 *     in function  lists:nth/2 (lists.erl, line 312)
 *     in call from my_module:my_function/2 (my_module.erl, line 45)
 *     called from supervisor:init/1 (supervisor.erl, line 267)
 *
 * Coverage:
 *   §1.  --from erlang exits 0 and parses crash dump format (basic smoke)
 *   §2.  Crash dump format: frame count, file, line, MFA activity extraction
 *   §3.  OTP tuple format: badarg trace parses correctly
 *   §4.  OTP tuple format: multi-frame function_clause cascade
 *   §5.  Verbose exception format: "in function / in call from / called from"
 *   §6.  Mixed format: OTP tuple + crash dump lines in one input
 *   §7.  Empty input → exit 0, zero events (not an error)
 *   §8.  Whitespace-only input → exit 0, zero events, no zero-frame warning
 *   §9.  Unknown --from xyz → exit 1 (config_error, INVALID_LANGUAGE)
 *   §10. erlang now in accepted language list (discoverability regression)
 *   §11. TraceGraph @type, @context, trace:language invariants
 *   §12. Activity names follow module.function_arity dot form (Erlang convention)
 *   §13. Frame ordering: first parsed frame is trace:e0
 *   §14. OCEL roundtrip: ingest → ocel → event shapes correct
 *   §15. Crash dump style via --input file (not stdin)
 *   §16. OTP tuple format via --input file
 *   §17. AtomVM "ERROR: " prefixed crash trace is still rejected via unknown lang
 *   §18. Elixir/Mix format with --from elixir exits 1 (still unsupported)
 *   §19. Zero-frame warning fires on non-empty input that has no parseable frames
 *   §20. trace:language is "erlang" in the TraceGraph output
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// ─── CLI helpers ───────────────────────────────────────────────────────────────

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

// ─── Erlang trace fixtures ─────────────────────────────────────────────────────

/**
 * Format 2 — Crash dump style (flat colon/parenthesis lines).
 * Three frames: my_module, erl_eval, shell.
 */
const CRASH_DUMP_3_FRAMES = `my_module:function_name/2 (my_module.erl:45)
erl_eval:do_apply/6 (erl_eval.erl:689)
shell:eval_exprs/7 (shell.erl:686)`;

/**
 * Format 1 — OTP exception tuple, single frame (badarg).
 * Canonical output from the Erlang shell when a process crashes.
 */
const OTP_BADARG_TRACE = `{error,{badarg,[{erlang,atom_to_list,[true],[{file,"erlang.erl"},{line,42}]}]}}`;

/**
 * Format 1 — OTP exception tuple, multi-frame function_clause cascade.
 * Mirrors a gen_server crash with three stack frames.
 */
const OTP_FUNCTION_CLAUSE_TRACE = `{error,{function_clause,[
  {erlmcp_core_handler,handle_call,3,[{file,"src/erlmcp_core_handler.erl"},{line,57}]},
  {gen_server,handle_msg,6,[{file,"gen_server.erl"},{line,1128}]},
  {proc_lib,init_p_do_apply,3,[{file,"proc_lib.erl"},{line,246}]}
]}}`;

/**
 * Format 3 — Verbose exception style (Erlang shell observer output).
 * Three frames using "in function", "in call from", and "called from" prefixes.
 */
const VERBOSE_3_FRAMES = `** exception error: no function clause matching lists:nth(0, [])
     in function  lists:nth/2 (lists.erl, line 312)
     in call from my_module:my_function/2 (my_module.erl, line 45)
     called from supervisor:init/1 (supervisor.erl, line 267)`;

/**
 * Mixed format: a verbose header line followed by crash-dump-style frames.
 * Tests that the parser cleanly switches between recognisable formats.
 */
const MIXED_FORMAT = `** exception error: badarg
my_module:my_fun/3 (my_module.erl:100)
gen_server:handle_cast/2 (gen_server.erl:550)`;

/**
 * AtomVM prefixed crash trace — still unsupported because the language tag
 * is "atomvm", not "erlang".
 */
const ATOMVM_CRASH_TRACE = `ERROR: {error,{badarg,[{erlang,atom_to_list,[foo],[{file,"erlang.erl"},{line,42}]}]}}
AtomVM crash in process <0.1.0>`;

/**
 * Elixir Mix trace — still unsupported via --from elixir.
 */
const ELIXIR_MIX_TRACE = `** (FunctionClauseError) no function clause matching in ErlmcpCore.Handler.handle_call/3
    (erlmcp_core 0.1.0) lib/erlmcp_core/handler.ex:57: ErlmcpCore.Handler.handle_call({:unknown_msg}, {pid, state}, _state)
    (elixir 1.16.0) lib/gen_server.ex:916: GenServer.call/3`;

/**
 * Input that contains no parseable Erlang frames at all — plain prose text.
 * Used to verify the zero-frame warning path.
 */
const NON_ERLANG_TEXT = `This is a plain text file.
It has no Erlang stack frames.
Nothing to parse here.`;

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('wpm trace ingest --from erlang', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'erl-trace-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  });

  // ── §1. Basic smoke: --from erlang exits 0 with crash dump format ─────────

  describe('§1 --from erlang exits 0 (basic smoke)', () => {
    it('wpm trace ingest --from erlang exits 0 on crash dump input', async () => {
      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '--format', 'json'],
        { cwd: tmpDir, stdin: CRASH_DUMP_3_FRAMES },
      );

      expect(result.exitCode).toBe(0);
    });

    it('crash dump trace produces a TraceGraph JSON-LD output', async () => {
      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '--format', 'json'],
        { cwd: tmpDir, stdin: CRASH_DUMP_3_FRAMES },
      );

      expect(result.exitCode).toBe(0);
      const graph = parseJson(result);
      expect(graph?.['@type']).toBe('trace:TraceRun');
    });
  });

  // ── §2. Crash dump format: frame count, file, line, activity ─────────────

  describe('§2 crash dump format correctness', () => {
    it('crash dump 3-frame input produces exactly 3 events', async () => {
      const outFile = path.join(tmpDir, 'graph.json');
      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '-o', outFile],
        { cwd: tmpDir, stdin: CRASH_DUMP_3_FRAMES },
      );

      expect(result.exitCode).toBe(0);
      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      const events = graph['trace:events'] as unknown[];
      expect(events.length).toBe(3);
    });

    it('first frame from crash dump has file "my_module.erl" and line 45', async () => {
      const outFile = path.join(tmpDir, 'graph.json');
      await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '-o', outFile],
        { cwd: tmpDir, stdin: CRASH_DUMP_3_FRAMES },
      );

      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      const events = graph['trace:events'] as Array<Record<string, unknown>>;
      const frame0 = events[0]!['trace:frame'] as Record<string, unknown>;
      expect(frame0['trace:file']).toBe('my_module.erl');
      expect(frame0['trace:line']).toBe(45);
    });

    it('crash dump frame functions contain the MFA in canonical form', async () => {
      const outFile = path.join(tmpDir, 'graph.json');
      await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '-o', outFile],
        { cwd: tmpDir, stdin: CRASH_DUMP_3_FRAMES },
      );

      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      const events = graph['trace:events'] as Array<Record<string, unknown>>;
      // trace:function should contain "my_module:function_name/2" for the first frame
      const frame0 = events[0]!['trace:frame'] as Record<string, unknown>;
      expect(frame0['trace:function']).toMatch(/my_module.*function_name.*2/);
    });

    it('human output shows "Frames: 3" for crash dump 3-frame input', async () => {
      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang'],
        { cwd: tmpDir, stdin: CRASH_DUMP_3_FRAMES },
      );

      expect(result.exitCode).toBe(0);
      const combined = result.stdout + result.stderr;
      expect(combined).toMatch(/Frames:\s+3/);
    });
  });

  // ── §3. OTP tuple format: single-frame badarg ─────────────────────────────

  describe('§3 OTP tuple format — single-frame badarg', () => {
    it('OTP badarg trace exits 0', async () => {
      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '--format', 'json'],
        { cwd: tmpDir, stdin: OTP_BADARG_TRACE },
      );

      expect(result.exitCode).toBe(0);
    });

    it('OTP badarg trace produces exactly 1 event', async () => {
      const outFile = path.join(tmpDir, 'badarg.json');
      await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '-o', outFile],
        { cwd: tmpDir, stdin: OTP_BADARG_TRACE },
      );

      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      const events = graph['trace:events'] as unknown[];
      expect(events.length).toBe(1);
    });

    it('OTP badarg frame has file "erlang.erl" and line 42', async () => {
      const outFile = path.join(tmpDir, 'badarg.json');
      await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '-o', outFile],
        { cwd: tmpDir, stdin: OTP_BADARG_TRACE },
      );

      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      const events = graph['trace:events'] as Array<Record<string, unknown>>;
      const frame0 = events[0]!['trace:frame'] as Record<string, unknown>;
      expect(frame0['trace:file']).toBe('erlang.erl');
      expect(frame0['trace:line']).toBe(42);
    });

    it('OTP badarg frame function contains "erlang" and "atom_to_list"', async () => {
      const outFile = path.join(tmpDir, 'badarg.json');
      await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '-o', outFile],
        { cwd: tmpDir, stdin: OTP_BADARG_TRACE },
      );

      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      const events = graph['trace:events'] as Array<Record<string, unknown>>;
      const frame0 = events[0]!['trace:frame'] as Record<string, unknown>;
      expect(frame0['trace:function']).toMatch(/erlang.*atom_to_list/i);
    });
  });

  // ── §4. OTP tuple format: multi-frame function_clause cascade ─────────────

  describe('§4 OTP tuple format — multi-frame function_clause', () => {
    it('OTP function_clause trace exits 0', async () => {
      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '--format', 'json'],
        { cwd: tmpDir, stdin: OTP_FUNCTION_CLAUSE_TRACE },
      );

      expect(result.exitCode).toBe(0);
    });

    it('OTP function_clause trace produces exactly 3 events', async () => {
      const outFile = path.join(tmpDir, 'fc.json');
      await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '-o', outFile],
        { cwd: tmpDir, stdin: OTP_FUNCTION_CLAUSE_TRACE },
      );

      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      const events = graph['trace:events'] as unknown[];
      expect(events.length).toBe(3);
    });

    it('OTP function_clause first frame references erlmcp_core_handler', async () => {
      const outFile = path.join(tmpDir, 'fc.json');
      await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '-o', outFile],
        { cwd: tmpDir, stdin: OTP_FUNCTION_CLAUSE_TRACE },
      );

      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      const events = graph['trace:events'] as Array<Record<string, unknown>>;
      const frame0 = events[0]!['trace:frame'] as Record<string, unknown>;
      expect(frame0['trace:function']).toMatch(/erlmcp_core_handler.*handle_call/i);
    });

    it('OTP function_clause second frame references gen_server at line 1128', async () => {
      const outFile = path.join(tmpDir, 'fc.json');
      await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '-o', outFile],
        { cwd: tmpDir, stdin: OTP_FUNCTION_CLAUSE_TRACE },
      );

      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      const events = graph['trace:events'] as Array<Record<string, unknown>>;
      const frame1 = events[1]!['trace:frame'] as Record<string, unknown>;
      expect(frame1['trace:file']).toBe('gen_server.erl');
      expect(frame1['trace:line']).toBe(1128);
    });
  });

  // ── §5. Verbose exception format ──────────────────────────────────────────

  describe('§5 verbose exception format ("in function / in call from / called from")', () => {
    it('verbose format exits 0', async () => {
      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '--format', 'json'],
        { cwd: tmpDir, stdin: VERBOSE_3_FRAMES },
      );

      expect(result.exitCode).toBe(0);
    });

    it('verbose format produces exactly 3 events (skips header line)', async () => {
      const outFile = path.join(tmpDir, 'verbose.json');
      await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '-o', outFile],
        { cwd: tmpDir, stdin: VERBOSE_3_FRAMES },
      );

      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      const events = graph['trace:events'] as unknown[];
      expect(events.length).toBe(3);
    });

    it('verbose format first frame is lists:nth at lists.erl line 312', async () => {
      const outFile = path.join(tmpDir, 'verbose.json');
      await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '-o', outFile],
        { cwd: tmpDir, stdin: VERBOSE_3_FRAMES },
      );

      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      const events = graph['trace:events'] as Array<Record<string, unknown>>;
      const frame0 = events[0]!['trace:frame'] as Record<string, unknown>;
      expect(frame0['trace:function']).toMatch(/lists.*nth.*2/i);
      expect(frame0['trace:file']).toBe('lists.erl');
      expect(frame0['trace:line']).toBe(312);
    });

    it('verbose format last frame is supervisor:init at supervisor.erl line 267', async () => {
      const outFile = path.join(tmpDir, 'verbose.json');
      await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '-o', outFile],
        { cwd: tmpDir, stdin: VERBOSE_3_FRAMES },
      );

      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      const events = graph['trace:events'] as Array<Record<string, unknown>>;
      const lastFrame = events[events.length - 1]!['trace:frame'] as Record<string, unknown>;
      expect(lastFrame['trace:function']).toMatch(/supervisor.*init.*1/i);
      expect(lastFrame['trace:file']).toBe('supervisor.erl');
      expect(lastFrame['trace:line']).toBe(267);
    });
  });

  // ── §6. Mixed format ──────────────────────────────────────────────────────

  describe('§6 mixed format (exception header + crash dump lines)', () => {
    it('mixed format exits 0', async () => {
      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '--format', 'json'],
        { cwd: tmpDir, stdin: MIXED_FORMAT },
      );

      expect(result.exitCode).toBe(0);
    });

    it('mixed format parses the two crash dump frame lines (skips header)', async () => {
      const outFile = path.join(tmpDir, 'mixed.json');
      await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '-o', outFile],
        { cwd: tmpDir, stdin: MIXED_FORMAT },
      );

      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      const events = graph['trace:events'] as unknown[];
      // The "** exception error:" line is skipped; two parseable frame lines remain.
      expect(events.length).toBe(2);
    });
  });

  // ── §7. Empty input → exit 0, zero events ─────────────────────────────────

  describe('§7 empty input', () => {
    it('empty stdin exits 0', async () => {
      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '--format', 'json'],
        { cwd: tmpDir, stdin: '' },
      );

      expect(result.exitCode).toBe(0);
    });

    it('empty stdin produces zero events in the TraceGraph', async () => {
      const outFile = path.join(tmpDir, 'empty.json');
      await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '-o', outFile],
        { cwd: tmpDir, stdin: '' },
      );

      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      const events = graph['trace:events'] as unknown[];
      expect(events.length).toBe(0);
    });
  });

  // ── §8. Whitespace-only input ─────────────────────────────────────────────

  describe('§8 whitespace-only input', () => {
    it('whitespace-only stdin exits 0', async () => {
      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '--format', 'json'],
        { cwd: tmpDir, stdin: '\n  \n\n' },
      );

      expect(result.exitCode).toBe(0);
    });

    it('whitespace-only stdin does NOT emit a zero-frame warning (no non-empty lines)', async () => {
      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '--format', 'json'],
        { cwd: tmpDir, stdin: '\n\n   \n' },
      );

      expect(result.exitCode).toBe(0);
      expect(result.stderr).not.toMatch(/zero frames.*non-empty/i);
    });
  });

  // ── §9. Unknown language → exit 1 ────────────────────────────────────────

  describe('§9 unknown --from value exits 1 (config_error)', () => {
    it('--from xyz exits 1 (INVALID_LANGUAGE)', async () => {
      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'xyz', '--format', 'json'],
        { cwd: tmpDir, stdin: CRASH_DUMP_3_FRAMES },
      );

      expect(result.exitCode).toBe(1);
      const envelope = parseJson(result);
      const err = envelope?.error as Record<string, unknown> | undefined;
      expect(err?.code).toBe('INVALID_LANGUAGE');
    });

    it('--from cobol exits 1 (INVALID_LANGUAGE)', async () => {
      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'cobol', '--format', 'json'],
        { cwd: tmpDir, stdin: CRASH_DUMP_3_FRAMES },
      );

      expect(result.exitCode).toBe(1);
    });
  });

  // ── §10. erlang now in accepted language list (regression guard) ──────────

  describe('§10 erlang in accepted language list (discoverability regression)', () => {
    it('INVALID_LANGUAGE error for unknown lang still lists erlang as accepted', async () => {
      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'xyz', '--format', 'json'],
        { cwd: tmpDir, stdin: '' },
      );

      const combined = result.stdout + result.stderr;
      expect(combined.toLowerCase()).toMatch(/erlang/);
    });

    it('error message for unknown lang also lists rust and typescript', async () => {
      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'xyz', '--format', 'json'],
        { cwd: tmpDir, stdin: '' },
      );

      const combined = result.stdout + result.stderr;
      expect(combined.toLowerCase()).toMatch(/rust/);
      expect(combined.toLowerCase()).toMatch(/typescript/);
    });
  });

  // ── §11. TraceGraph structural invariants ─────────────────────────────────

  describe('§11 TraceGraph structural invariants', () => {
    it('@type is "trace:TraceRun" for erlang ingest', async () => {
      const outFile = path.join(tmpDir, 'graph.json');
      await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '-o', outFile],
        { cwd: tmpDir, stdin: CRASH_DUMP_3_FRAMES },
      );

      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      expect(graph['@type']).toBe('trace:TraceRun');
    });

    it('@context has prov, ocel, and trace namespaces', async () => {
      const outFile = path.join(tmpDir, 'graph.json');
      await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '-o', outFile],
        { cwd: tmpDir, stdin: CRASH_DUMP_3_FRAMES },
      );

      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      const ctx = graph['@context'] as Record<string, string> | undefined;
      expect(typeof ctx).toBe('object');
      // FM-5: these three keys must be non-empty URI strings in the @context map —
      // toBeDefined() verifies the keys exist (absent = undefined); the prefix IRIs
      // are what make the output valid JSON-LD. A tighter assertion follows below
      // but absence detection is the primary regression catch here.
      expect(ctx?.prov).toBeDefined();
      expect(ctx?.ocel).toBeDefined();
      expect(ctx?.trace).toBeDefined();
      // Stronger: each prefix must be a string URI (not a number or boolean)
      expect(typeof ctx?.prov).toBe('string');
      expect(typeof ctx?.ocel).toBe('string');
      expect(typeof ctx?.trace).toBe('string');
    });

    it('@id follows "trace:run-{runId}" pattern', async () => {
      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '--format', 'json', '--runId', 'erl-run-42'],
        { cwd: tmpDir, stdin: CRASH_DUMP_3_FRAMES },
      );

      expect(result.exitCode).toBe(0);
      const graph = parseJson(result);
      expect(graph?.['@id']).toBe('trace:run-erl-run-42');
    });
  });

  // ── §12. Activity names follow module.function_arity form ─────────────────

  describe('§12 activity names: module.function_arity dot form', () => {
    it('crash dump frame activity uses dots (not colons or slashes)', async () => {
      const outFile = path.join(tmpDir, 'graph.json');
      await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '-o', outFile],
        { cwd: tmpDir, stdin: CRASH_DUMP_3_FRAMES },
      );

      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      const events = graph['trace:events'] as Array<Record<string, unknown>>;
      const activity = events[0]!['ocel:activity'] as string;
      // Activity should use dots as separators, not colons or raw slashes
      expect(activity).not.toMatch(/:/);
      expect(activity).toMatch(/\./);
    });

    it('erl_eval frame activity contains "erl_eval" and "do_apply"', async () => {
      const outFile = path.join(tmpDir, 'graph.json');
      await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '-o', outFile],
        { cwd: tmpDir, stdin: CRASH_DUMP_3_FRAMES },
      );

      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      const events = graph['trace:events'] as Array<Record<string, unknown>>;
      const activity = events[1]!['ocel:activity'] as string;
      expect(activity).toMatch(/erl_eval/);
      expect(activity).toMatch(/do_apply/);
    });
  });

  // ── §13. Frame ordering: first parsed frame is trace:e0 ──────────────────

  describe('§13 frame ordering', () => {
    it('first frame from crash dump is trace:e0', async () => {
      const outFile = path.join(tmpDir, 'graph.json');
      await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '-o', outFile],
        { cwd: tmpDir, stdin: CRASH_DUMP_3_FRAMES },
      );

      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      const events = graph['trace:events'] as Array<{ '@id': string }>;
      expect(events[0]?.['@id']).toBe('trace:e0');
      expect(events[1]?.['@id']).toBe('trace:e1');
      expect(events[2]?.['@id']).toBe('trace:e2');
    });
  });

  // ── §14. OCEL roundtrip ───────────────────────────────────────────────────

  describe('§14 OCEL roundtrip: ingest → ocel → event shapes correct', () => {
    it('erlang ingest → trace ocel produces OCEL 2.0 with correct event count', async () => {
      const graphFile = path.join(tmpDir, 'graph.json');
      const ocelFile = path.join(tmpDir, 'ocel.json');
      await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '-o', graphFile],
        { cwd: tmpDir, stdin: CRASH_DUMP_3_FRAMES },
      );
      await wpmAsync(
        ['trace', 'ocel', '-i', graphFile, '-o', ocelFile],
        { cwd: tmpDir },
      );

      const ocel = JSON.parse(await fs.readFile(ocelFile, 'utf8')) as Record<string, unknown>;
      expect(ocel.ocel_version).toBe('2.0');
      const events = ocel.ocel_events as unknown[];
      expect(events.length).toBe(3);
    });

    it('OCEL events have event_id, activity, timestamp, and objects fields', async () => {
      const graphFile = path.join(tmpDir, 'graph.json');
      const ocelFile = path.join(tmpDir, 'ocel.json');
      await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '-o', graphFile],
        { cwd: tmpDir, stdin: CRASH_DUMP_3_FRAMES },
      );
      await wpmAsync(
        ['trace', 'ocel', '-i', graphFile, '-o', ocelFile],
        { cwd: tmpDir },
      );

      const ocel = JSON.parse(await fs.readFile(ocelFile, 'utf8')) as Record<string, unknown>;
      const events = ocel.ocel_events as Array<Record<string, unknown>>;
      for (const ev of events) {
        expect(typeof ev.event_id).toBe('string');
        expect(typeof ev.activity).toBe('string');
        expect(typeof ev.timestamp).toBe('string');
        expect(Array.isArray(ev.objects)).toBe(true);
      }
    });
  });

  // ── §15. Crash dump via --input file ─────────────────────────────────────

  describe('§15 crash dump via --input file (not stdin)', () => {
    it('ingest from file with -i flag exits 0 and produces correct frame count', async () => {
      const traceFile = path.join(tmpDir, 'crash.txt');
      const outFile = path.join(tmpDir, 'graph.json');
      await fs.writeFile(traceFile, CRASH_DUMP_3_FRAMES, 'utf8');

      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '-i', traceFile, '-o', outFile],
        { cwd: tmpDir },
      );

      expect(result.exitCode).toBe(0);
      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      const events = graph['trace:events'] as unknown[];
      expect(events.length).toBe(3);
    });

    it('trace:source is the file path when -i is used', async () => {
      const traceFile = path.join(tmpDir, 'crash.txt');
      const outFile = path.join(tmpDir, 'graph.json');
      await fs.writeFile(traceFile, CRASH_DUMP_3_FRAMES, 'utf8');

      await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '-i', traceFile, '-o', outFile],
        { cwd: tmpDir },
      );

      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      expect(graph['trace:source']).toBe(traceFile);
    });
  });

  // ── §16. OTP tuple via --input file ──────────────────────────────────────

  describe('§16 OTP tuple format via --input file', () => {
    it('OTP function_clause trace from file produces 3 events', async () => {
      const traceFile = path.join(tmpDir, 'otp.txt');
      const outFile = path.join(tmpDir, 'otp-graph.json');
      await fs.writeFile(traceFile, OTP_FUNCTION_CLAUSE_TRACE, 'utf8');

      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '-i', traceFile, '-o', outFile],
        { cwd: tmpDir },
      );

      expect(result.exitCode).toBe(0);
      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      const events = graph['trace:events'] as unknown[];
      expect(events.length).toBe(3);
    });
  });

  // ── §17. AtomVM prefix trace rejected via unknown lang ───────────────────

  describe('§17 AtomVM trace still unsupported via --from atomvm', () => {
    it('--from atomvm exits 1 (INVALID_LANGUAGE) — atomvm is not a registered lang', async () => {
      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'atomvm', '--format', 'json'],
        { cwd: tmpDir, stdin: ATOMVM_CRASH_TRACE },
      );

      expect(result.exitCode).toBe(1);
      const envelope = parseJson(result);
      const err = envelope?.error as Record<string, unknown> | undefined;
      expect(err?.code).toBe('INVALID_LANGUAGE');
    });

    it('AtomVM OTP trace IS parseable via --from erlang (OTP tuple format)', async () => {
      // AtomVM uses OTP tuple format; stripping the "ERROR: " prefix leaves a valid
      // OTP tuple that the erlang parser can handle.
      const atomvmOtpPart = `{error,{badarg,[{erlang,atom_to_list,[foo],[{file,"erlang.erl"},{line,42}]}]}}`;
      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '--format', 'json'],
        { cwd: tmpDir, stdin: atomvmOtpPart },
      );

      expect(result.exitCode).toBe(0);
      const graph = parseJson(result);
      const events = graph?.['trace:events'] as unknown[] | undefined;
      expect((events ?? []).length).toBe(1);
    });
  });

  // ── §18. Elixir/Mix still unsupported via --from elixir ──────────────────

  describe('§18 Elixir/Mix format still unsupported via --from elixir', () => {
    it('--from elixir exits 1 (INVALID_LANGUAGE) — elixir not registered', async () => {
      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'elixir', '--format', 'json'],
        { cwd: tmpDir, stdin: ELIXIR_MIX_TRACE },
      );

      expect(result.exitCode).toBe(1);
      const envelope = parseJson(result);
      const err = envelope?.error as Record<string, unknown> | undefined;
      expect(err?.code).toBe('INVALID_LANGUAGE');
    });
  });

  // ── §19. Zero-frame warning on non-Erlang input with --from erlang ────────

  describe('§19 zero-frame warning fires on non-Erlang prose text', () => {
    it('plain prose text via --from erlang exits 0 but emits zero-frame warning', async () => {
      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang'],
        { cwd: tmpDir, stdin: NON_ERLANG_TEXT },
      );

      expect(result.exitCode).toBe(0);
      // Non-empty input, no parseable frames → zero-frame warning on stderr
      expect(result.stderr).toMatch(/zero frames|no.*frame/i);
    });
  });

  // ── §20. trace:language is "erlang" in TraceGraph output ─────────────────

  describe('§20 trace:language is "erlang" in TraceGraph', () => {
    it('trace:language equals "erlang" in output graph for --from erlang', async () => {
      const outFile = path.join(tmpDir, 'graph.json');
      await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '-o', outFile],
        { cwd: tmpDir, stdin: CRASH_DUMP_3_FRAMES },
      );

      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      expect(graph['trace:language']).toBe('erlang');
    });

    it('each trace:frame carries trace:language "erlang"', async () => {
      const outFile = path.join(tmpDir, 'graph.json');
      await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '-o', outFile],
        { cwd: tmpDir, stdin: CRASH_DUMP_3_FRAMES },
      );

      const graph = JSON.parse(await fs.readFile(outFile, 'utf8')) as Record<string, unknown>;
      const events = graph['trace:events'] as Array<Record<string, unknown>>;
      for (const ev of events) {
        const frame = ev['trace:frame'] as Record<string, unknown>;
        expect(frame['trace:language']).toBe('erlang');
      }
    });
  });
});
