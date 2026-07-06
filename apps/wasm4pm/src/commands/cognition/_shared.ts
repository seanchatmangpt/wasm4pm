//! Shared helpers for cognition verbs.
//! No stubs. No fakes. Real I/O, real errors.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { EXIT_CODES, type ExitCode } from '../../exit-codes.js';
import { atomicWriteSync } from '../../receipts/_shared.js';

// NOTE: `emitCognitionSpan` was removed in Plan E. Command-level OTEL is now
// handled uniformly by `apps/wasm4pm/src/commands/_otel.ts:withSpan`. Cognition
// verbs may call `withSpan('cognition.<verb>', ...)` directly when wired in
// Phase B.

/** Parse a JSON file into typed input. Throws with a precise message on any failure. */
export function parseInputJson<T = unknown>(inputPath: string): T {
  if (!inputPath) {
    const err = new Error('input path is required');
    (err as Error & { code?: string }).code = 'INPUT_REQUIRED';
    throw err;
  }
  let raw: string;
  try {
    raw = fs.readFileSync(inputPath, 'utf-8');
  } catch (e) {
    const err = new Error(
      `cannot read input file: ${inputPath} (${e instanceof Error ? e.message : String(e)})`,
    );
    (err as Error & { code?: string }).code = 'INPUT_NOT_FOUND';
    throw err;
  }
  if (!raw.trim()) {
    const err = new Error(`input file is empty: ${inputPath}`);
    (err as Error & { code?: string }).code = 'INPUT_EMPTY';
    throw err;
  }
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    const err = new Error(
      `invalid JSON in ${inputPath}: ${e instanceof Error ? e.message : String(e)}`,
    );
    (err as Error & { code?: string }).code = 'INPUT_INVALID_JSON';
    throw err;
  }
}

/** Persist a cognition receipt to disk keyed by `run_id`. Returns absolute path. */
export function saveReceipt(receipt: unknown, dirRel: string): string {
  const dir = path.resolve(dirRel);
  fs.mkdirSync(dir, { recursive: true });
  // Rust `CognitionReceipt` exposes `run_id` (BLAKE3 hex). Fall back to
  //  `id` for any callers that have not migrated yet.
  let id = '';
  if (receipt && typeof receipt === 'object') {
    const r = receipt as { run_id?: unknown; id?: unknown };
    if (typeof r.run_id === 'string' && r.run_id.length > 0) id = r.run_id;
    else if (typeof r.id === 'string' && r.id.length > 0) id = r.id;
  }
  if (!id) id = randomUUID();
  const file = path.join(dir, `${id}.json`);
  const json = JSON.stringify(receipt, null, 2) + '\n';
  fs.writeFileSync(file, json);
  atomicWriteSync(path.join(dir, 'latest.json'), json);
  return file;
}

/** Load a receipt by id. Throws with precise message if not found / unparseable. */
export function loadReceipt(receiptId: string, dirRel: string): unknown {
  if (!receiptId) {
    const err = new Error('receipt id is required');
    (err as Error & { code?: string }).code = 'RECEIPT_ID_REQUIRED';
    throw err;
  }
  const dir = path.resolve(dirRel);
  const file = path.join(dir, `${receiptId}.json`);
  if (!fs.existsSync(file)) {
    const err = new Error(`receipt not found: ${file}`);
    (err as Error & { code?: string }).code = 'RECEIPT_NOT_FOUND';
    throw err;
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (e) {
    const err = new Error(
      `corrupt receipt at ${file}: ${e instanceof Error ? e.message : String(e)}`,
    );
    (err as Error & { code?: string }).code = 'RECEIPT_CORRUPT';
    throw err;
  }
}

/** Translate any thrown error into a CLI exit code + machine code. */
export function mapWasmError(err: unknown): { code: string; exitCode: ExitCode } {
  const code = (err as { code?: string } | undefined)?.code;
  switch (code) {
    case 'INPUT_REQUIRED':
    case 'INPUT_NOT_FOUND':
    case 'INPUT_EMPTY':
    case 'INPUT_INVALID_JSON':
    case 'RECEIPT_ID_REQUIRED':
    case 'RECEIPT_NOT_FOUND':
    case 'RECEIPT_CORRUPT':
      return { code, exitCode: EXIT_CODES.source_error };
    case 'CONFIG_INVALID':
      return { code, exitCode: EXIT_CODES.config_error };
    case 'SYSTEM_ERROR':
      return { code, exitCode: EXIT_CODES.system_error };
    default:
      return { code: 'EXECUTION_ERROR', exitCode: EXIT_CODES.execution_error };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Run-one core (factored out of `cognition run` for reuse by `wpm compile --run`)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute a single breed contract through the real WASM kernel.
 * Thin wrapper over `runContract` so `wpm compile --run` and
 * `wpm cognition run` share one execution core.
 */
export async function runOne(
  breed: string,
  input: unknown,
  opts?: { spanSink?: unknown },
): Promise<{
  status?: string;
  breed?: string;
  run_id?: string;
  output_hash?: string;
  replay_pointer?: string;
  output?: {
    selected?: string | null;
    explanation?: string;
    facts?: Array<{ key: string; value: string }>;
    inference_trace?: unknown[];
  };
}> {
  const { runContract } = await import('@wasm4pm/cognition');
  return (await runContract(
    breed,
    input as never,
    opts as never,
  )) as never;
}
