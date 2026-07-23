/**
 * wpm CLI entry — noun/verb tree built from `@wasm4pm/noun-verb`'s
 * `buildCli()`. The registry (`nouns/*`) is the single source of truth for
 * dispatch, `--help`, and (once wired) generated docs/introspection; this
 * file's only job is folding that registry into a citty `CommandDef` and
 * wiring the receipt/OTEL middleware hooks so every verb gets a BLAKE3
 * receipt + span automatically (Absolute Rules 6/7), without every verb
 * handler having to remember to do it itself.
 */
import { randomBytes } from 'node:crypto';
import { buildCli, type BuildCliOptions, type ErrorCodeMap } from '@wasm4pm/noun-verb';
import type { OtelSpan } from '@wasm4pm/cognition';
import { logNoun } from './nouns/log/index.js';
import { modelNoun } from './nouns/model/index.js';
import { pipelineNoun } from './nouns/pipeline/index.js';
import { evidenceNoun } from './nouns/evidence/index.js';
import { configNoun } from './nouns/config/index.js';
import { systemNoun } from './nouns/system/index.js';
import { labNoun } from './nouns/lab/index.js';
import { helpNoun } from './nouns/help/index.js';
import { saveCommandReceipt, blake3Hex, newReceipt } from './receipts/_shared.js';
import { getGlobalSpanSink } from './otel/sink.js';
import { EXIT_CODES } from './exit-codes.js';
import pkg from '../package.json' with { type: 'json' };

/**
 * Exported so tooling (docs generation, introspection audits) can walk the
 * exact same registry `buildCli()` dispatches from — never a hand-maintained
 * copy that can drift. See `scripts/gen-cli-docs.ts`.
 */
export const ALL_NOUNS = [logNoun, modelNoun, pipelineNoun, evidenceNoun, configNoun, systemNoun, labNoun, helpNoun];

/** Map the framework's generic ErrorCode contract onto wpm's existing 0-5 EXIT_CODES. */
const ERROR_CODE_MAP: ErrorCodeMap = {
  INVALID_INPUT: EXIT_CODES.source_error,
  COMMAND_NOT_FOUND: EXIT_CODES.config_error,
  VERB_NOT_FOUND: EXIT_CODES.config_error,
  PERMISSION_DENIED: EXIT_CODES.system_error,
  INVARIANT_BREACH: EXIT_CODES.execution_error,
  DEADLINE_EXCEEDED: EXIT_CODES.execution_error,
  GUARD_EXCEEDED: EXIT_CODES.execution_error,
  EXECUTION_ERROR: EXIT_CODES.execution_error,
  INTERNAL_ERROR: EXIT_CODES.system_error,
};

function emitSpan(noun: string, verb: string, durationMs: number, status: OtelSpan['status']): void {
  try {
    const nowNs = Date.now() * 1_000_000;
    const span: OtelSpan = {
      trace_id: randomBytes(16).toString('hex'),
      span_id: randomBytes(8).toString('hex'),
      name: `wpm.${noun}.${verb}`,
      kind: 'INTERNAL',
      start_time: nowNs - Math.round(durationMs * 1_000_000),
      end_time: nowNs,
      status,
      attributes: { 'service.name': 'wpm', noun, verb, duration_ms: durationMs },
    };
    getGlobalSpanSink()(span);
  } catch {
    /* never block on OTEL */
  }
}

/**
 * Shared `buildCli()`/`runCli()` options — the single definition of wpm's
 * receipt/OTEL middleware and exit-code contracts. `main` (below, a plain
 * citty `CommandDef`) and the real binary's `runCli()` call (in
 * `bin/wpm.ts`, which additionally needs `++` chaining and `@-` stdin
 * extraction) must use the *same* options object so neither surface can
 * drift from the other.
 */
export const cliOptions: BuildCliOptions = {
  name: 'wpm',
  version: pkg.version,
  description: 'High-performance process mining and workflow discovery CLI (wasm4pm)',
  errorCodeMap: ERROR_CODE_MAP,

  // Absolute Rule 6: every verb invocation gets a chained BLAKE3 receipt.
  // Absolute Rule 7: every verb invocation gets an OTEL span with status ok|error.
  async onResult({ noun, verb, args, result, durationMs }) {
    try {
      saveCommandReceipt({
        ...newReceipt(`${noun} ${verb}`),
        input_hash: blake3Hex(JSON.stringify(args) ?? 'null'),
        output_hash: blake3Hex(JSON.stringify(result) ?? 'null'),
        status: 'success',
        summary: { durationMs },
      });
    } catch {
      /* receipts are best-effort — never fail a successful command over them */
    }
    emitSpan(noun, verb, durationMs, { code: 'OK' });
  },

  async onError({ noun, verb, args, error, durationMs }) {
    try {
      saveCommandReceipt({
        ...newReceipt(`${noun} ${verb}`),
        input_hash: blake3Hex(JSON.stringify(args) ?? 'null'),
        output_hash: blake3Hex(error.message),
        status: 'failed',
        summary: { durationMs, code: error.code },
      });
    } catch {
      /* best-effort */
    }
    emitSpan(noun, verb, durationMs, { code: 'ERROR', message: error.message });
  },

  // Fail-closed exit-code propagation: a verb like `model check` can
  // resolve normally (no throw) while still reporting a failed *outcome*
  // (REJECTED/INDETERMINATE) via its own `exitCode` field. Surface that as
  // the real process exit code instead of the framework's default 0.
  //
  // Bridged `lab`/legacy-command verbs (`nouns/_bridge.ts`) return the raw
  // legacy `CommandResult` on success — which carries the same 0-6 exit
  // code but under the snake_case `exit_code` key (see `output.ts`), not
  // the camelCase `exitCode` key native verbs use. Both are checked here
  // (camelCase first) so a bridged verb's own partial_failure/
  // conformance_fail verdict propagates to `$?` exactly like a native
  // verb's does, instead of always reporting 0 on the non-throwing path.
  resolveResultExitCode(result) {
    if (result && typeof result === 'object') {
      const r = result as { exitCode?: unknown; exit_code?: unknown };
      if (typeof r.exitCode === 'number') return r.exitCode;
      if (typeof r.exit_code === 'number') return r.exit_code;
    }
    return undefined;
  },
};

export const main = buildCli(ALL_NOUNS, cliOptions);
