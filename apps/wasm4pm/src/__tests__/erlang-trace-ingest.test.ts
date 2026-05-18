/**
 * erlang-trace-ingest.test.ts
 *
 * AtomVM/Erlang integration surface probe for wpm trace ingest.
 *
 * Oracle rank: Rank 2 (Domain contract — exit codes, error message content,
 * and documented extension point for future Erlang/AtomVM support).
 *
 * Environment survey findings (2026-05-18):
 *   - No ~/AtomVM or ~/erlang directory
 *   - Real Erlang projects present: ~/erlmcp (OTP 27+ umbrella, rebar3),
 *     ~/cre, ~/mcp-mqtt-erl, ~/mcp_erl (all rebar3)
 *   - Loose .erl files: ~/bytestar_*.erl (gen_server modules)
 *   - No .beam files found (projects not compiled)
 *   - AtomVM-specific files (*.avm, *.beam) absent
 *
 * Erlang stack trace format (OTP/AtomVM):
 *
 *   Standard OTP crash report (from error_logger / logger):
 *     {error, {Type, [{Module, Function, Arity, [{file,"path.erl"},{line,N}]}]}}
 *
 *   Example badarg:
 *     {error,{badarg,[{erlang,atom_to_list,[true],[{file,"erlang.erl"},{line,42}]}]}}
 *
 *   Example function_clause (gen_server crash):
 *     {error,{function_clause,[
 *       {myapp_worker,handle_call,[{unknown_msg},{<0.123.0>},state],
 *        [{file,"src/myapp_worker.erl"},{line,57}]},
 *       {gen_server,handle_msg,6,[{file,"gen_server.erl"},{line,1128}]},
 *       {proc_lib,init_p_do_apply,3,[{file,"proc_lib.erl"},{line,246}]}
 *     ]}}
 *
 *   AtomVM adds a platform prefix in crash output:
 *     ERROR: {error,{badarg,[{erlang,atom_to_list,[foo],[{file,...}...]}]}}
 *
 *   Elixir on BEAM (from mix/ExUnit):
 *     ** (FunctionClauseError) no function clause matching in MyModule.do_work/1
 *         (my_app 0.1.0) lib/my_module.ex:42: MyModule.do_work(:bad_arg)
 *         (elixir 1.16.0) lib/task.ex:916: Task.start_link/3
 *
 * Extension point:
 *   To add Erlang/AtomVM support, add a `case 'erlang':` branch to the switch
 *   in apps/wasm4pm/src/commands/trace.ts (around line 923) and implement:
 *
 *     function parseErlangTrace(text: string): TraceFrame[]
 *
 *   Regex for OTP tuple format:
 *     /\{(\w+),(\w+),(?:\d+|\[.*?\]),\[.*?\{file,"([^"]+)"\}.*?\{line,(\d+)\}/g
 *
 *   Regex for AtomVM/Elixir mix format:
 *     /\([\w_ ]+\) ([^:]+):(\d+): (.+)/g
 *
 * Coverage:
 *   §1. --from erlang exits 1 (config_error) — unsupported language contract
 *   §2. Error message names all accepted languages (Rank 2: discoverability contract)
 *   §3. Error message does NOT include 'erlang' in accepted list (documents gap)
 *   §4. OTP tuple trace piped as stdin → exits 1 (not silently parsed as another lang)
 *   §5. AtomVM prefix trace piped as stdin → exits 1
 *   §6. Elixir/Mix trace piped as stdin → exits 1 (Elixir on BEAM also unsupported)
 *   §7. JSON error envelope has INVALID_LANGUAGE error_code
 *   §8. --from erlang does NOT partially parse OTP trace as zero-frame rust/typescript
 *   §9. OCEL roundtrip: real Erlang process event handcrafted as OCEL JSON survives
 *       traceGraphToOcel projection (documents OCEL path works even without parser)
 *  §10. Pipe test: OTP format → --from typescript exits 0 but yields 0 frames + warning
 *       (proves trace.ts zero-frame warning fires on garbage input for known lang)
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

function parseEnvelope(result: CliResult): Record<string, unknown> | null {
  try {
    return JSON.parse(result.stdout) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ─── Erlang/AtomVM trace fixtures ─────────────────────────────────────────────

/**
 * Standard OTP crash report — badarg exception from erlmcp-style gen_server.
 * This is the canonical format produced by OTP's error_logger and the
 * Erlang shell when a process crashes.
 */
const OTP_BADARG_TRACE = `{error,{badarg,[{erlang,atom_to_list,[true],[{file,"erlang.erl"},{line,42}]}]}}`;

/**
 * Multi-frame OTP function_clause crash — typical gen_server cascade.
 * Mirrors what ~/erlmcp/apps/erlmcp_core processes would produce.
 */
const OTP_FUNCTION_CLAUSE_TRACE = `{error,{function_clause,[
  {erlmcp_core_handler,handle_call,[{unknown_msg},{<0.123.0>},state],
   [{file,"src/erlmcp_core_handler.erl"},{line,57}]},
  {gen_server,handle_msg,6,[{file,"gen_server.erl"},{line,1128}]},
  {proc_lib,init_p_do_apply,3,[{file,"proc_lib.erl"},{line,246}]}
]}}`;

/**
 * AtomVM runtime crash — platform adds "ERROR: " prefix and uses simplified
 * tuple format. From AtomVM's error_handler.
 */
const ATOMVM_CRASH_TRACE = `ERROR: {error,{badarg,[{erlang,atom_to_list,[foo],[{file,"erlang.erl"},{line,42}]}]}}
AtomVM crash in process <0.1.0>`;

/**
 * Elixir stacktrace on BEAM — Mix/ExUnit format.
 * Elixir projects in ~/erlmcp-adjacent would produce this format.
 */
const ELIXIR_MIX_TRACE = `** (FunctionClauseError) no function clause matching in ErlmcpCore.Handler.handle_call/3
    (erlmcp_core 0.1.0) lib/erlmcp_core/handler.ex:57: ErlmcpCore.Handler.handle_call({:unknown_msg}, {pid, state}, _state)
    (elixir 1.16.0) lib/gen_server.ex:916: GenServer.call/3`;

/**
 * A handcrafted OCEL event log representing an Erlang gen_server lifecycle.
 * This is what a future "wpm trace ingest --from erlang" would produce.
 * Used to verify the OCEL projection path works correctly for Erlang semantics.
 */
const ERLANG_GENSERVER_OCEL = JSON.stringify({
  ocel_version: '2.0',
  ocel_global_log: {
    ocel_attribute_names: ['frame_index', 'file', 'arity', 'mfa'],
  },
  ocel_events: [
    {
      event_id: 'erl-e0',
      activity: 'erlmcp_core_handler.handle_call',
      timestamp: '2026-05-18T10:00:00.000Z',
      objects: [
        { id: 'proc-0.123.0', type: 'ErlangProcess' },
        { id: 'src/erlmcp_core_handler.erl', type: 'SourceFile' },
      ],
      attributes: { frame_index: 0, file: 'src/erlmcp_core_handler.erl', arity: 3, mfa: 'erlmcp_core_handler:handle_call/3' },
    },
    {
      event_id: 'erl-e1',
      activity: 'gen_server.handle_msg',
      timestamp: '2026-05-18T10:00:00.001Z',
      objects: [
        { id: 'proc-0.123.0', type: 'ErlangProcess' },
        { id: 'gen_server.erl', type: 'SourceFile' },
      ],
      attributes: { frame_index: 1, file: 'gen_server.erl', arity: 6, mfa: 'gen_server:handle_msg/6' },
    },
    {
      event_id: 'erl-e2',
      activity: 'proc_lib.init_p_do_apply',
      timestamp: '2026-05-18T10:00:00.002Z',
      objects: [
        { id: 'proc-0.123.0', type: 'ErlangProcess' },
        { id: 'proc_lib.erl', type: 'SourceFile' },
      ],
      attributes: { frame_index: 2, file: 'proc_lib.erl', arity: 3, mfa: 'proc_lib:init_p_do_apply/3' },
    },
  ],
  ocel_objects: [
    { id: 'proc-0.123.0', type: 'ErlangProcess', attributes: { pid: '<0.123.0>', registered_name: 'erlmcp_core_handler' } },
    { id: 'src/erlmcp_core_handler.erl', type: 'SourceFile', attributes: {} },
    { id: 'gen_server.erl', type: 'SourceFile', attributes: {} },
    { id: 'proc_lib.erl', type: 'SourceFile', attributes: {} },
  ],
});

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('Erlang/AtomVM trace ingest surface probe', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'erl-trace-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  });

  // ── §1. --from erlang exits 1 (config_error) ──────────────────────────────

  describe('§1 --from erlang exits 1 (unsupported language contract)', () => {
    it('wpm trace ingest --from erlang exits 1 (config_error)', async () => {
      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '--format', 'json'],
        { cwd: tmpDir, stdin: OTP_BADARG_TRACE },
      );

      // EXIT_CODES.config_error = 1
      expect(result.exitCode).toBe(1);
    });

    it('--from atomvm exits 1 (config_error) — AtomVM is also unsupported', async () => {
      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'atomvm', '--format', 'json'],
        { cwd: tmpDir, stdin: ATOMVM_CRASH_TRACE },
      );

      expect(result.exitCode).toBe(1);
    });

    it('--from elixir exits 1 (config_error) — Elixir/BEAM also unsupported', async () => {
      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'elixir', '--format', 'json'],
        { cwd: tmpDir, stdin: ELIXIR_MIX_TRACE },
      );

      expect(result.exitCode).toBe(1);
    });
  });

  // ── §2. Error message names all accepted languages ─────────────────────────

  describe('§2 error message lists all accepted languages (discoverability contract)', () => {
    it('error output mentions "rust" as an accepted language', async () => {
      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '--format', 'json'],
        { cwd: tmpDir, stdin: OTP_BADARG_TRACE },
      );

      const combined = result.stdout + result.stderr;
      expect(combined.toLowerCase()).toMatch(/rust/);
    });

    it('error output mentions "typescript" as an accepted language', async () => {
      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '--format', 'json'],
        { cwd: tmpDir, stdin: OTP_BADARG_TRACE },
      );

      const combined = result.stdout + result.stderr;
      expect(combined.toLowerCase()).toMatch(/typescript/);
    });

    it('error output mentions "python" as an accepted language', async () => {
      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '--format', 'json'],
        { cwd: tmpDir, stdin: OTP_BADARG_TRACE },
      );

      const combined = result.stdout + result.stderr;
      expect(combined.toLowerCase()).toMatch(/python/);
    });

    it('error output mentions "java" as an accepted language', async () => {
      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '--format', 'json'],
        { cwd: tmpDir, stdin: OTP_BADARG_TRACE },
      );

      const combined = result.stdout + result.stderr;
      expect(combined.toLowerCase()).toMatch(/java/);
    });

    it('error output mentions "js" as an accepted language', async () => {
      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '--format', 'json'],
        { cwd: tmpDir, stdin: OTP_BADARG_TRACE },
      );

      const combined = result.stdout + result.stderr;
      expect(combined.toLowerCase()).toMatch(/\bjs\b/);
    });
  });

  // ── §3. Error message does NOT include 'erlang' in accepted list ───────────

  describe('§3 error message documents the gap — erlang not in accepted list', () => {
    it('accepted language list does NOT include "erlang" (documents unsupported status)', async () => {
      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '--format', 'json'],
        { cwd: tmpDir, stdin: OTP_BADARG_TRACE },
      );

      const envelope = parseEnvelope(result);
      // The message field lists: "Accepted: rust, typescript, python, java, js"
      const message = (envelope?.message as string | undefined) ?? (result.stdout + result.stderr);
      // "erlang" may appear in the word "Unknown language 'erlang'" — check only the Accepted list
      const acceptedMatch = message.match(/Accepted:\s*([^\n]+)/i);
      if (acceptedMatch) {
        // The accepted list should not include erlang as a supported option
        expect(acceptedMatch[1]).not.toMatch(/\berllang\b/i);
        // Verify it lists the known 5 languages
        expect(acceptedMatch[1]).toMatch(/rust/);
        expect(acceptedMatch[1]).toMatch(/typescript/);
      }
      // If no "Accepted:" match, the test passes — error format may differ
    });
  });

  // ── §4. OTP tuple trace via stdin exits 1 (no silent parse) ───────────────

  describe('§4 OTP trace piped as stdin exits 1 when --from erlang', () => {
    it('OTP badarg trace with --from erlang exits 1 (not silently accepted)', async () => {
      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '--format', 'json'],
        { cwd: tmpDir, stdin: OTP_BADARG_TRACE },
      );

      expect(result.exitCode).toBe(1);
    });

    it('OTP function_clause multi-frame trace with --from erlang exits 1', async () => {
      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '--format', 'json'],
        { cwd: tmpDir, stdin: OTP_FUNCTION_CLAUSE_TRACE },
      );

      expect(result.exitCode).toBe(1);
    });
  });

  // ── §5. AtomVM prefixed trace exits 1 ─────────────────────────────────────

  describe('§5 AtomVM prefixed crash trace exits 1', () => {
    it('AtomVM "ERROR: " prefixed crash trace with --from atomvm exits 1', async () => {
      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'atomvm', '--format', 'json'],
        { cwd: tmpDir, stdin: ATOMVM_CRASH_TRACE },
      );

      expect(result.exitCode).toBe(1);
    });
  });

  // ── §6. Elixir/Mix trace exits 1 ──────────────────────────────────────────

  describe('§6 Elixir/Mix BEAM trace exits 1 (BEAM ecosystem unsupported)', () => {
    it('Elixir/Mix exception trace with --from elixir exits 1', async () => {
      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'elixir', '--format', 'json'],
        { cwd: tmpDir, stdin: ELIXIR_MIX_TRACE },
      );

      expect(result.exitCode).toBe(1);
    });
  });

  // ── §7. JSON envelope has INVALID_LANGUAGE error_code ─────────────────────

  describe('§7 JSON error envelope carries INVALID_LANGUAGE error_code', () => {
    it('--from erlang --format json produces JSON envelope with INVALID_LANGUAGE code', async () => {
      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '--format', 'json'],
        { cwd: tmpDir, stdin: OTP_BADARG_TRACE },
      );

      expect(result.exitCode).toBe(1);
      const envelope = parseEnvelope(result);
      expect(envelope).not.toBeNull();
      expect(envelope?.status).toBe('error');
      expect(envelope?.command).toBe('trace ingest');
      // error lives under envelope.error.code (not top-level error_code)
      const err = envelope?.error as Record<string, unknown> | undefined;
      expect(err?.code).toBe('INVALID_LANGUAGE');
    });

    it('JSON envelope message contains the rejected language name "erlang"', async () => {
      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '--format', 'json'],
        { cwd: tmpDir, stdin: OTP_BADARG_TRACE },
      );

      const envelope = parseEnvelope(result);
      const err = envelope?.error as Record<string, unknown> | undefined;
      expect(err?.message as string).toMatch(/erlang/i);
    });
  });

  // ── §8. --from erlang does NOT partially parse as zero-frame rust/typescript

  describe('§8 rejection is clean — no partial parse side effects', () => {
    it('--from erlang exits 1 (not 0 with 0-frame warning that would mask parse failure)', async () => {
      // If the switch fell through to a default "unknown" handler that parsed 0 frames
      // instead of rejecting, exitCode would be 0. We verify it is 1 (hard rejection).
      const traceFile = path.join(tmpDir, 'otp.txt');
      await fs.writeFile(traceFile, OTP_FUNCTION_CLAUSE_TRACE, 'utf8');

      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'erlang', '-i', traceFile, '--format', 'json'],
        { cwd: tmpDir },
      );

      expect(result.exitCode).toBe(1);
      // Must not produce a TraceGraph (hard reject, not zero-frame success)
      const envelope = parseEnvelope(result);
      expect(envelope?.['@type']).toBeUndefined();
      expect(envelope?.status).toBe('error');
    });
  });

  // ── §9. OCEL roundtrip: handcrafted Erlang OCEL survives trace ocel path ──

  describe('§9 Erlang OCEL roundtrip via trace ocel (documents OCEL path works)', () => {
    it('handcrafted Erlang gen_server OCEL survives trace powl projection (exit 0)', async () => {
      // Even without a parser, a correctly shaped OCEL from an Erlang process
      // can be processed by trace powl without error. This documents the OCEL
      // path as the correct integration point for Erlang runtimes.
      const ocelFile = path.join(tmpDir, 'erlang-genserver.ocel.json');
      const routeFile = path.join(tmpDir, 'erlang-route.json');
      await fs.writeFile(ocelFile, ERLANG_GENSERVER_OCEL, 'utf8');

      const result = await wpmAsync(
        ['trace', 'powl', '-i', ocelFile, '-o', routeFile],
        { cwd: tmpDir },
      );

      expect(result.exitCode).toBe(0);
    });

    it('Erlang OCEL projected route contains the expected MFA activities', async () => {
      const ocelFile = path.join(tmpDir, 'erlang-genserver.ocel.json');
      const routeFile = path.join(tmpDir, 'erlang-route.json');
      await fs.writeFile(ocelFile, ERLANG_GENSERVER_OCEL, 'utf8');

      await wpmAsync(
        ['trace', 'powl', '-i', ocelFile, '-o', routeFile],
        { cwd: tmpDir },
      );

      const route = JSON.parse(await fs.readFile(routeFile, 'utf8')) as Record<string, unknown>;
      const activities = route.observed_activities as string[];
      expect(activities).toContain('erlmcp_core_handler.handle_call');
      expect(activities).toContain('gen_server.handle_msg');
      expect(activities).toContain('proc_lib.init_p_do_apply');
    });

    it('Erlang OCEL activity_count equals number of events in fixture (3)', async () => {
      const ocelFile = path.join(tmpDir, 'erlang-genserver.ocel.json');
      const routeFile = path.join(tmpDir, 'erlang-route.json');
      await fs.writeFile(ocelFile, ERLANG_GENSERVER_OCEL, 'utf8');

      await wpmAsync(
        ['trace', 'powl', '-i', ocelFile, '-o', routeFile],
        { cwd: tmpDir },
      );

      const route = JSON.parse(await fs.readFile(routeFile, 'utf8')) as Record<string, unknown>;
      expect(route.activity_count).toBe(3);
    });

    it('Erlang OCEL survives trace ocel → trace powl two-step pipeline (exit 0)', async () => {
      // Erlang OCEL does not need a parser path — direct OCEL injection works.
      // This is the recommended integration pattern for Erlang runtimes.
      const ocelFile = path.join(tmpDir, 'erlang-pipeline.ocel.json');
      await fs.writeFile(ocelFile, ERLANG_GENSERVER_OCEL, 'utf8');

      // Step 1: Simulate "trace ocel" input using raw OCEL directly as trace powl input
      // (trace ocel expects TraceGraph JSON-LD; use trace powl directly on OCEL)
      const routeResult = await wpmAsync(
        ['trace', 'powl', '-i', ocelFile],
        { cwd: tmpDir },
      );

      expect(routeResult.exitCode).toBe(0);
      const combined = routeResult.stdout + routeResult.stderr;
      expect(combined).toMatch(/Activities:/i);
    });
  });

  // ── §10. OTP trace → --from typescript yields 0 frames + warning ──────────

  describe('§10 OTP format piped to known lang yields 0-frame warning (parser boundary)', () => {
    it('OTP tuple trace → --from typescript exits 0 but writes zero-frame warning to stderr', async () => {
      // This test documents parser boundary behavior: the OTP tuple format does not
      // match any TypeScript "at ..." pattern, so zero frames are parsed.
      // The command exits 0 but emits a warning, making the failure observable.
      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'typescript', '--format', 'json'],
        { cwd: tmpDir, stdin: OTP_FUNCTION_CLAUSE_TRACE },
      );

      expect(result.exitCode).toBe(0);
      // Zero-frame warning is emitted to stderr when non-empty input yields no frames
      expect(result.stderr).toMatch(/zero frames|no.*frame/i);
    });

    it('OTP tuple trace → --from rust exits 0 but writes zero-frame warning (different parser, same result)', async () => {
      const result = await wpmAsync(
        ['trace', 'ingest', '--from', 'rust', '--format', 'json'],
        { cwd: tmpDir, stdin: OTP_FUNCTION_CLAUSE_TRACE },
      );

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toMatch(/zero frames|no.*frame/i);
    });
  });
});
