/**
 * Published wpm CLI registry and lifecycle contract.
 *
 * The registry is the single source of truth for dispatch, help, generated
 * documentation, and introspection. The published binary must call
 * `admitCliInvocation()` before any verb handler or OTEL exporter can run.
 */
import * as fs from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  buildCli,
  NounVerbError,
  type BuildCliOptions,
  type ErrorCodeMap,
} from '@wasm4pm/noun-verb';
import type { OtelSpan } from '@wasm4pm/cognition';
import { logNoun } from './nouns/log/index.js';
import { modelNoun } from './nouns/model/index.js';
import { pipelineNoun } from './nouns/pipeline/index.js';
import { evidenceNoun } from './nouns/evidence/index.js';
import { configNoun } from './nouns/config/index.js';
import { systemNoun } from './nouns/system/index.js';
import { labNoun } from './nouns/lab/index.js';
import { helpNoun } from './nouns/help/index.js';
import {
  blake3Hex,
  canonicalJson,
  newReceipt,
  persistCommandReceipt,
  type PersistedCommandReceipt,
} from './receipts/_shared.js';
import { getGlobalSpanSink } from './otel/sink.js';
import { EXIT_CODES } from './exit-codes.js';
import pkg from '../package.json' with { type: 'json' };

export const ALL_NOUNS = [
  logNoun,
  modelNoun,
  pipelineNoun,
  evidenceNoun,
  configNoun,
  systemNoun,
  labNoun,
  helpNoun,
];

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

interface CliInvocationState {
  invocationId: string;
  receiptDirectory?: string;
  admission: PersistedCommandReceipt;
  chainHead: string;
}

export interface CliAdmissionOptions {
  receiptDirectory?: string;
  invocationId?: string;
  runId?: string;
  now?: () => Date;
  entrypointHash?: string;
}

let activeInvocation: CliInvocationState | undefined;

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
    // Telemetry is observational and may not manufacture command success.
  }
}

function resultExitCode(result: unknown): number | undefined {
  if (!result || typeof result !== 'object') return undefined;
  const candidate = result as { exitCode?: unknown; exit_code?: unknown };
  if (typeof candidate.exitCode === 'number') return candidate.exitCode;
  if (typeof candidate.exit_code === 'number') return candidate.exit_code;
  return undefined;
}

function failure(message: string, cause: unknown): NounVerbError {
  return NounVerbError.internalError(message, cause);
}

function requireInvocation(): CliInvocationState {
  if (!activeInvocation) {
    throw failure(
      'RECEIPT_ADMISSION_MISSING: the published wpm binary did not persist an admission receipt before dispatch',
      undefined
    );
  }
  return activeInvocation;
}

/**
 * Persist the invocation-level admission receipt before OTEL initialization or
 * noun/verb dispatch. Raw argv and cwd never enter evidence; only their hashes
 * and bounded counts are retained.
 */
export function admitCliInvocation(
  argv: readonly string[],
  options: CliAdmissionOptions = {}
): PersistedCommandReceipt {
  if (activeInvocation) {
    throw failure('RECEIPT_SESSION_ALREADY_ACTIVE: wpm admits exactly one process invocation', undefined);
  }

  const invocationId = options.invocationId ?? randomUUID();
  let entrypointHash = options.entrypointHash;
  if (!entrypointHash) {
    const entrypoint = process.argv[1];
    if (!entrypoint) {
      throw failure('RECEIPT_SUBJECT_BLOCKED: published CLI entrypoint is unavailable', undefined);
    }
    try {
      entrypointHash = blake3Hex(fs.readFileSync(entrypoint));
    } catch (error) {
      throw failure(
        `RECEIPT_SUBJECT_BLOCKED: published CLI entrypoint could not be hashed: ${(error as Error).message}`,
        error
      );
    }
  }
  const subject = {
    package: '@wasm4pm/cli',
    version: pkg.version,
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    entrypoint_hash: entrypointHash,
  };
  const inputHash = blake3Hex(canonicalJson({ argv: [...argv] }));
  const admissionProjection = {
    admitted: true,
    authority: 'published-wpm-binary',
    subject,
    input_hash: inputHash,
  };

  try {
    const persisted = persistCommandReceipt(
      {
        ...newReceipt('wpm invocation', { runId: options.runId, now: options.now }),
        session_id: invocationId,
        phase: 'admission',
        input_hash: inputHash,
        output_hash: blake3Hex(canonicalJson(admissionProjection)),
        status: 'pending',
        summary: {
          authority: 'published-wpm-binary',
          subject,
          argv_count: argv.length,
        },
      },
      options.receiptDirectory
    );

    activeInvocation = {
      invocationId,
      receiptDirectory: options.receiptDirectory,
      admission: persisted.receipt,
      chainHead: persisted.receipt.receipt_hash,
    };
    return persisted.receipt;
  } catch (error) {
    throw failure(
      `RECEIPT_ADMISSION_BLOCKED: no command handler was dispatched because admission evidence could not be persisted: ${(error as Error).message}`,
      error
    );
  }
}

function appendOutcome(args: {
  noun: string;
  verb: string;
  input: unknown;
  output: unknown;
  status: 'success' | 'partial' | 'failed';
  durationMs: number;
  exitCode?: number;
  errorCode?: string;
}): PersistedCommandReceipt {
  const state = requireInvocation();
  const command = `${args.noun} ${args.verb}`;

  try {
    const persisted = persistCommandReceipt(
      {
        ...newReceipt(command),
        session_id: state.invocationId,
        phase: 'outcome',
        predecessor_hash: state.chainHead,
        input_hash: blake3Hex(canonicalJson(args.input)),
        output_hash: blake3Hex(canonicalJson(args.output)),
        status: args.status,
        summary: {
          duration_ms: args.durationMs,
          ...(args.exitCode !== undefined ? { exit_code: args.exitCode } : {}),
          ...(args.errorCode ? { error_code: args.errorCode } : {}),
        },
      },
      state.receiptDirectory
    );
    state.chainHead = persisted.receipt.receipt_hash;
    return persisted.receipt;
  } catch (error) {
    throw failure(
      `RECEIPT_OUTCOME_BLOCKED: ${command} executed but its outcome receipt could not be persisted; success is refused: ${(error as Error).message}`,
      error
    );
  }
}

export function recordCliFatal(
  error: unknown,
  exitCode = EXIT_CODES.system_error
): PersistedCommandReceipt {
  const normalized = error instanceof NounVerbError ? error : NounVerbError.from(error);
  return appendOutcome({
    noun: 'system',
    verb: 'fatal',
    input: { admitted: true },
    output: normalized.toEnvelope(),
    status: 'failed',
    durationMs: 0,
    exitCode,
    errorCode: normalized.code,
  });
}

export function hasActiveCliInvocation(): boolean {
  return activeInvocation !== undefined;
}

/** Test-only reset for isolated process-lifecycle witnesses. */
export function resetCliInvocationForTests(): void {
  activeInvocation = undefined;
}

export const cliOptions: BuildCliOptions = {
  name: 'wpm',
  version: pkg.version,
  description: 'High-performance process mining and workflow discovery CLI (wasm4pm)',
  errorCodeMap: ERROR_CODE_MAP,

  async onResult({ noun, verb, args, result, durationMs }) {
    const exitCode = resultExitCode(result) ?? EXIT_CODES.success;
    const status =
      exitCode === EXIT_CODES.success
        ? 'success'
        : exitCode === EXIT_CODES.partial_failure
          ? 'partial'
          : 'failed';
    try {
      appendOutcome({
        noun,
        verb,
        input: args,
        output: result,
        status,
        durationMs,
        exitCode,
      });
      emitSpan(noun, verb, durationMs, { code: exitCode === 0 ? 'OK' : 'ERROR' });
    } catch (error) {
      emitSpan(noun, verb, durationMs, { code: 'ERROR', message: (error as Error).message });
      throw error;
    }
  },

  async onError({ noun, verb, args, error, durationMs }) {
    try {
      appendOutcome({
        noun,
        verb,
        input: args,
        output: error.toEnvelope(),
        status: 'failed',
        durationMs,
        exitCode: ERROR_CODE_MAP[error.code] ?? EXIT_CODES.system_error,
        errorCode: error.code,
      });
      emitSpan(noun, verb, durationMs, { code: 'ERROR', message: error.message });
    } catch (receiptError) {
      emitSpan(noun, verb, durationMs, { code: 'ERROR', message: (receiptError as Error).message });
      throw receiptError;
    }
  },

  resolveResultExitCode: resultExitCode,
};

export const main = buildCli(ALL_NOUNS, cliOptions);
