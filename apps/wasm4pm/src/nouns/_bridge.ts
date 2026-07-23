/**
 * Legacy command bridge — lets a thin noun/verb wrap an existing
 * `commands/*.ts` citty `CommandDef` unmodified while still returning a
 * plain JSON-serializable result (the noun-verb framework's contract)
 * instead of printing.
 *
 * Used for verbs whose underlying command body is large/stateful enough
 * that re-deriving its logic from scratch in this pass would be riskier
 * than reusing it as-is (see the migration report in ORIGINAL_REQUEST.md /
 * the task summary for which verbs this applies to). Every bridged command
 * is otherwise completely unmodified — same WASM calls, same behavior.
 *
 * Mechanics:
 *  - citty's own `runCommand()` parses `rawArgs` against the command's
 *    (possibly nested) `args`/`subCommands` and calls its `run()`.
 *  - Almost every existing command calls `process.exit(code)` (directly or
 *    via `exitWithFlush()`) instead of returning a value. Left alone this
 *    would kill the whole wpm process — including a `++`-chained
 *    multi-step invocation — the instant a bridged verb's exit path fires.
 *    `process.exit` is trapped for the duration of the call: the requested
 *    code is captured in a closure variable and the trap returns WITHOUT
 *    throwing (every real exit call site is the final statement of its
 *    branch, so falling through is equivalent to the process terminating
 *    there). A throw-based sentinel does NOT work here: nearly every
 *    legacy command wraps its own success path in its OWN
 *    `try { ...; return await exitWithFlush(SUCCESS); } catch (error) { ... }`,
 *    so a thrown sentinel from a successful `exit(0)` gets swallowed by
 *    that command's own catch block and misreported as EXECUTION_ERROR.
 *  - stdout/stderr are captured so human-format side output never leaks
 *    onto the new CLI's stdout (which must stay pure JSON).
 *  - `--format json --quiet` is appended to force the command's own
 *    existing JSON output path (`emitResult()` writes a single
 *    `CommandResult` JSON blob — see `../output.ts`); the captured stdout
 *    is parsed back into that object and returned as the verb's result.
 */
import { runCommand, type ArgsDef, type CommandDef } from 'citty';
import { NounVerbError } from '@wasm4pm/noun-verb';

/**
 * Parse the FIRST complete top-level JSON value (object or array) from the
 * start of `text`, ignoring any trailing content. Several legacy commands
 * emit more than one `emitResult()` call on one path (e.g. a preliminary
 * result plus a later secondary error) — concatenating two JSON values with
 * no separator, which a plain `JSON.parse()` rejects outright. The first
 * value is the one that carries the actual command outcome in every
 * observed case, so it is authoritative here.
 */
function parseFirstJsonValue(text: string): unknown | undefined {
  const start = text.search(/[{[]/);
  if (start === -1) return undefined;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{' || ch === '[') {
      depth++;
    } else if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) {
        const candidate = text.slice(start, i + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          return undefined;
        }
      }
    }
  }
  return undefined;
}

/** Result of scrubbing a bridged invocation's output-related flags. */
interface StrippedArgs {
  readonly args: string[];
  /** True if `--format <value>` survived with a non-json/human (domain-specific) value. */
  readonly keptDomainFormat: boolean;
}

/**
 * Strip caller-supplied `--quiet`/`-q` tokens, and any `--format json` /
 * `--format human` token, from `rawArgs` before `invokeLegacyCommandAsJson`
 * appends its own forced output flags.
 *
 * The new framework's contract is that stdout is ALWAYS pure JSON for a
 * bridged verb — a caller-supplied `--format json` (very common: most
 * migrated CLI tests still pass it) or `--format human` must never survive
 * through to the legacy command unchanged, and appending the forced flags
 * without stripping first left BOTH occurrences in `rawArgs`; citty/mri
 * collapses a twice-given flag into an array (`['json', 'json']`), and the
 * legacy command's own `format === 'json'` string check then silently
 * fails, falling through to its human-text output path — which this
 * bridge can't parse, so the verb call quietly degraded to `{ ok: true }`
 * instead of returning real data.
 *
 * BUT: `commands/validate.ts` overloads bare `--format` for a completely
 * different purpose — the INPUT log format (`xes`/`csv`/`ocel`), with a
 * separate `--output-format` flag for the human/json rendering toggle a
 * caller actually wants to test (e.g. `--format PARQUET` to exercise its
 * own format-whitelist rejection). Blindly stripping every `--format`
 * value discarded that domain value before the legacy command ever saw
 * it. So only `json`/`human` values (the ones that actually collide with
 * what this bridge is about to force) are stripped; any other value is
 * left completely untouched, and `keptDomainFormat` tells the caller not
 * to re-append a second, colliding bare `--format json`.
 */
function stripLegacyOutputFlags(rawArgs: readonly string[]): StrippedArgs {
  const out: string[] = [];
  let keptDomainFormat = false;
  for (let i = 0; i < rawArgs.length; i++) {
    const a = rawArgs[i];
    if (a === '--format') {
      const value = rawArgs[i + 1];
      if (value === 'json' || value === 'human' || value === undefined) {
        i++; // also skip its value token, e.g. `--format json`
        continue;
      }
      // Domain-specific value (e.g. validate's log-format) — keep verbatim.
      out.push(a, value);
      i++;
      keptDomainFormat = true;
      continue;
    }
    if (a.startsWith('--format=')) {
      const value = a.slice('--format='.length);
      if (value === 'json' || value === 'human') continue;
      out.push(a);
      keptDomainFormat = true;
      continue;
    }
    // `--output-format` (only `commands/validate.ts` declares it) is ALWAYS
    // a rendering toggle, never domain-overloaded — always strip it so the
    // forced `--output-format=json` below can't collide with a caller's own
    // `--output-format json`/`--output-format=json` and turn into an array.
    if (a === '--output-format') {
      i++; // also skip its value token
      continue;
    }
    if (a.startsWith('--output-format=')) continue;
    if (a === '--quiet' || a === '-q') continue;
    out.push(a);
  }
  return { args: out, keptDomainFormat };
}

export interface BridgeInvocation {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly returned: unknown;
}

/**
 * Invoke a legacy `CommandDef` with `rawArgs`, trapping process-exit and
 * capturing stdio. Never lets the bridged command terminate the host process.
 */
export async function invokeLegacyCommand<T extends ArgsDef = ArgsDef>(
  cmd: CommandDef<T>,
  rawArgs: string[]
): Promise<BridgeInvocation> {
  const origStdoutWrite = process.stdout.write.bind(process.stdout);
  const origStderrWrite = process.stderr.write.bind(process.stderr);
  const origExit = process.exit.bind(process);
  const origExitCode = process.exitCode;

  let stdout = '';
  let stderr = '';
  let exitCode = 0;
  let returned: unknown;
  // Set the instant a trapped `process.exit(code)` fires — see the trap below
  // for why this can't be signalled via `throw` instead.
  let capturedExitCode: number | undefined;

  (process.stdout.write as unknown as (chunk: unknown, ...rest: unknown[]) => boolean) = (
    chunk: unknown,
    ...rest: unknown[]
  ): boolean => {
    stdout += Buffer.isBuffer(chunk) ? chunk.toString('utf-8') : String(chunk);
    const maybeCb = rest.find((a) => typeof a === 'function') as (() => void) | undefined;
    maybeCb?.();
    return true;
  };
  (process.stderr.write as unknown as (chunk: unknown, ...rest: unknown[]) => boolean) = (
    chunk: unknown,
    ...rest: unknown[]
  ): boolean => {
    stderr += Buffer.isBuffer(chunk) ? chunk.toString('utf-8') : String(chunk);
    const maybeCb = rest.find((a) => typeof a === 'function') as (() => void) | undefined;
    maybeCb?.();
    return true;
  };
  process.exitCode = 0;
  // Record the requested code and return WITHOUT throwing. Every real
  // `process.exit(code)` call site in commands/*.ts is the final statement
  // of its branch (`return await exitWithFlush(code)` or a bare call with
  // nothing after it — verified across the codebase), so falling through
  // silently is equivalent to the process actually terminating there.
  //
  // A throw-based sentinel (the previous approach) does NOT work: nearly
  // every legacy command wraps its own success path in
  // `try { ...; return await exitWithFlush(SUCCESS); } catch (error) { ...
  // return await exitWithFlush(EXECUTION_ERROR); }`. A thrown sentinel from
  // the SUCCESSFUL exit(0) is an `Error` instance, so it gets swallowed by
  // the command's OWN `catch (error)` block and re-exits as a bogus
  // EXECUTION_ERROR (3) — turning every successful bridged invocation into
  // a reported failure. Capturing the code instead of throwing avoids this
  // entirely.
  (process as { exit: typeof process.exit }).exit = ((code?: number): never => {
    if (capturedExitCode === undefined) capturedExitCode = code ?? 0;
    return undefined as never;
  }) as typeof process.exit;

  try {
    const { result } = await runCommand(cmd, { rawArgs });
    returned = result;
    exitCode = capturedExitCode ?? (typeof process.exitCode === 'number' ? process.exitCode : 0);
  } finally {
    process.stdout.write = origStdoutWrite;
    process.stderr.write = origStderrWrite;
    process.exit = origExit;
    process.exitCode = origExitCode;
  }

  return { stdout, stderr, exitCode, returned };
}

/**
 * `invokeLegacyCommand` + force JSON output + parse the result back into an
 * object. Throws a `NounVerbError` if the bridged command exited non-zero
 * (using its own `CommandResult.error` if present) or if stdout was not
 * parseable JSON (a bridged command that doesn't support `--format json`
 * needs its own dedicated verb, not this generic bridge).
 */
export async function invokeLegacyCommandAsJson<T extends ArgsDef = ArgsDef>(
  cmd: CommandDef<T>,
  rawArgs: string[]
): Promise<unknown> {
  // `--format=json` (one token, single `=` form) rather than `'--format', 'json'`
  // (two tokens): citty@0.1.6's subcommand resolver is `rawArgs.findIndex(arg =>
  // !arg.startsWith('-'))` — it has no notion of which flags consume a value, so
  // a bare invocation of a legacy command that itself has `subCommands` (e.g.
  // `doctor`, `trace`) misreads the *value* token `json` as an attempted
  // subcommand name and throws `Unknown command \`json\`` before `cmd.run()`
  // ever executes. Folding the value into the flag token via `=` means every
  // token this bridge appends still starts with `-`, so it can never be
  // mistaken for a subcommand positional. `stripLegacyOutputFlags` already
  // strips a caller-supplied `--format=value` form, so this is symmetric.
  //
  // `keptDomainFormat` is true when `stripLegacyOutputFlags` left a
  // caller-supplied `--format <non-json/human value>` in place (e.g.
  // `commands/validate.ts` overloads bare `--format` for the INPUT log
  // format, not output rendering) — in that case skip re-forcing
  // `--format=json` so the two don't collide, and rely on the separately
  // forced `--output-format=json` (validate's own dedicated rendering
  // flag) instead. Harmless no-op flag for every other legacy command.
  const { args: stripped, keptDomainFormat } = stripLegacyOutputFlags(rawArgs);
  const forced = [
    ...stripped,
    ...(keptDomainFormat ? [] : ['--format=json']),
    '--output-format=json',
    '--quiet',
  ];
  const { stdout, stderr, exitCode, returned } = await invokeLegacyCommand(cmd, forced);

  // Re-emit the legacy command's captured stderr to the REAL process.stderr.
  // `invokeLegacyCommand` traps stderr right alongside stdout so a bridged
  // command's human-format side chatter never leaks onto the new CLI's
  // stdout — but that trap silently swallowed it entirely on the success
  // path (it was previously used only to build a message for the *failure*
  // path below). Several legacy commands (e.g. `commands/trace.ts`'s
  // zero-frames diagnostic) intentionally warn on stderr on an otherwise
  // successful run; callers/tests inspecting real stderr saw nothing.
  if (stderr.length > 0) {
    process.stderr.write(stderr);
  }

  const text = stdout.trim();
  let parsed: unknown;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      // Not every legacy command's stdout is a single clean JSON value even
      // with --format json — some concatenate a second `emitResult()` call
      // with no separator (see `parseFirstJsonValue`'s doc comment), some
      // print a banner. Take the first complete top-level JSON value.
      parsed = parseFirstJsonValue(text);
    }
  }

  if (parsed === undefined) {
    if (exitCode !== 0) {
      throw classifyLegacyFailure(
        exitCode,
        (stderr || stdout || `command exited with code ${exitCode}`).trim().slice(0, 2000)
      );
    }
    // Command succeeded but returned no parseable JSON body. Some legacy
    // commands have a raw-output escape hatch (e.g. `social --export csv`
    // writes plain CSV/DOT straight to stdout, bypassing `emitResult()`
    // entirely) — that text is real command output, not nothing, so it must
    // survive the always-JSON-on-stdout contract as `{ raw: <text> }`
    // rather than being silently dropped to `{ ok: true }`. Genuinely empty
    // stdout (true void/help commands) still falls back to `{ ok: true }`.
    if (text.length > 0) {
      return returned ?? { raw: text };
    }
    return returned ?? { ok: true };
  }

  const obj = parsed as Record<string, unknown>;
  // `CommandResult.status === 'error'` can mean either "the verb itself
  // failed to execute" OR "the verb ran fine and reports its *subject* as
  // invalid" (e.g. `log validate` on a bad log: exit_code 2, status
  // 'error', but `payload.checks`/`payload.errors` is the real, useful
  // finding — not an execution failure). Surface the legacy payload's own
  // diagnostics in the thrown message (readable) rather than dumping the
  // entire result object, and classify the exit code from the legacy
  // `exit_code`/`error.code` rather than always collapsing to a generic
  // EXECUTION_ERROR.
  if (obj && typeof obj === 'object' && obj['status'] === 'error') {
    const errorInfo = obj['error'] as Record<string, unknown> | undefined;
    const legacyExitCode = typeof obj['exit_code'] === 'number' ? (obj['exit_code'] as number) : exitCode;
    const message = summarizeLegacyFailure(obj, errorInfo);
    throw classifyLegacyFailure(legacyExitCode, message);
  }
  if (exitCode !== 0 && (!obj || obj['status'] !== 'ok')) {
    throw classifyLegacyFailure(exitCode, `command exited with code ${exitCode}`);
  }

  return parsed;
}

/** Build a short, readable failure message from a legacy `CommandResult`-shaped object. */
function summarizeLegacyFailure(obj: Record<string, unknown>, errorInfo: Record<string, unknown> | undefined): string {
  const parts: string[] = [];
  const topMessage = errorInfo?.['message'] ?? obj['message'];
  if (typeof topMessage === 'string') parts.push(topMessage);

  const payload = obj['payload'] as Record<string, unknown> | undefined;
  const errors = payload?.['errors'] ?? payload?.['violations'];
  if (Array.isArray(errors) && errors.length > 0) {
    parts.push(`(${errors.length}) ${errors.slice(0, 5).join('; ')}`);
  }
  return (parts.join(' — ') || 'command reported failure').slice(0, 2000);
}

/**
 * Map a legacy 0-6 `EXIT_CODES` value onto the closest `NounVerbError`
 * classification. The framework's `ErrorCode` vocabulary (9 generic codes)
 * is coarser than wpm's legacy 7-value exit-code contract, so this is a
 * best-effort mapping, not a lossless one — see the migration report.
 */
function classifyLegacyFailure(legacyExitCode: number, message: string): NounVerbError {
  switch (legacyExitCode) {
    case 1: // config_error
    case 2: // source_error
      return NounVerbError.invalidInput(message);
    case 5: // system_error
      return NounVerbError.internalError(message);
    default: // execution_error, partial_failure, conformance_fail, or unknown
      return NounVerbError.executionError(message);
  }
}
