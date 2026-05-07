//! Shared helpers for cognition verbs.
//! No stubs. No fakes. Real I/O, real errors.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { EXIT_CODES, type ExitCode } from '../../exit-codes.js';

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

/** Persist a receipt chain to disk. Returns absolute saved path. */
export function saveReceipt(receiptChain: unknown, dirRel: string): string {
  const dir = path.resolve(dirRel);
  fs.mkdirSync(dir, { recursive: true });
  const id =
    (receiptChain && typeof receiptChain === 'object' && 'id' in receiptChain
      ? String((receiptChain as { id: unknown }).id ?? '')
      : '') || randomUUID();
  const file = path.join(dir, `${id}.json`);
  fs.writeFileSync(file, JSON.stringify(receiptChain, null, 2) + '\n');
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
