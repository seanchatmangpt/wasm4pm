//! Shared receipt helpers for the published wpm CLI.
//!
//! Command receipts are fail-closed, self-hashed, atomically persisted, and
//! replay-verifiable. An admission receipt must exist before the published
//! binary dispatches a verb; every observed outcome links to the prior receipt.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { hashJsonString } from '@wasm4pm/contracts';

export type CommandReceiptStatus = 'pending' | 'success' | 'partial' | 'failed';
export type CommandReceiptPhase = 'admission' | 'outcome' | 'consequence';

export interface CommandReceipt {
  schema?: 'wasm4pm.command-receipt.v2';
  run_id: string;
  session_id?: string;
  command: string;
  phase?: CommandReceiptPhase;
  predecessor_hash?: string;
  input_hash: string;
  output_hash: string;
  status: CommandReceiptStatus;
  timestamp: string;
  summary?: Record<string, unknown>;
  receipt_hash?: string;
}

export interface PersistedCommandReceipt extends CommandReceipt {
  schema: 'wasm4pm.command-receipt.v2';
  phase: CommandReceiptPhase;
  receipt_hash: string;
}

export interface PersistedReceipt {
  path: string;
  receipt: PersistedCommandReceipt;
}

export interface ReceiptVerification {
  valid: boolean;
  issues: string[];
  receipt?: PersistedCommandReceipt;
}

const HEX64 = /^[0-9a-f]{64}$/;
const SAFE_ID = /^[A-Za-z0-9._-]+$/;
const RECEIPT_SCHEMA = 'wasm4pm.command-receipt.v2' as const;
const COMMAND_RECEIPT_FIELDS = new Set([
  'schema',
  'run_id',
  'session_id',
  'command',
  'phase',
  'predecessor_hash',
  'input_hash',
  'output_hash',
  'status',
  'timestamp',
  'summary',
  'receipt_hash',
]);

function canonicalValue(value: unknown, seen: Set<object>): unknown {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('non-finite number is not canonical JSON');
    return value;
  }
  if (typeof value === 'undefined') return null;
  if (typeof value === 'bigint' || typeof value === 'function' || typeof value === 'symbol') {
    throw new Error(`unsupported canonical JSON value: ${typeof value}`);
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new Error('cyclic value is not canonical JSON');
    seen.add(value);
    try {
      return value.map((entry) => canonicalValue(entry, seen));
    } finally {
      seen.delete(value);
    }
  }
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    if (seen.has(object)) throw new Error('cyclic value is not canonical JSON');
    seen.add(object);
    try {
      const result: Record<string, unknown> = {};
      for (const key of Object.keys(object).sort()) {
        if (object[key] !== undefined) result[key] = canonicalValue(object[key], seen);
      }
      return result;
    } finally {
      seen.delete(object);
    }
  }
  throw new Error('unsupported canonical JSON value');
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value, new Set<object>()));
}

/** BLAKE3 hex-64 of an arbitrary buffer/string via @wasm4pm/contracts. */
export function blake3Hex(buf: Buffer | string): string {
  const value = typeof buf === 'string' ? buf : buf.toString('utf-8');
  return hashJsonString(value);
}

function fsyncDirectoryBestEffort(directory: string): void {
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(directory, 'r');
    fs.fsyncSync(descriptor);
  } catch {
    // Directory fsync is not supported on every host (notably some Windows filesystems).
  } finally {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor); } catch { /* best effort */ }
    }
  }
}

export function atomicWriteSync(
  target: string,
  content: string,
  options: { exclusiveTarget?: boolean } = {}
): void {
  const directory = path.dirname(target);
  const tmp = `${target}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
  let descriptor: number | undefined;
  try {
    if (options.exclusiveTarget && fs.existsSync(target)) {
      const error = new Error(`receipt target already exists: ${target}`) as NodeJS.ErrnoException;
      error.code = 'EEXIST';
      throw error;
    }
    descriptor = fs.openSync(tmp, 'wx', 0o600);
    fs.writeFileSync(descriptor, content, { encoding: 'utf-8' });
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(tmp, target);
    fsyncDirectoryBestEffort(directory);
  } catch (error) {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor); } catch { /* best effort */ }
    }
    try { fs.unlinkSync(tmp); } catch { /* best effort */ }
    throw error;
  }
}

export function newReceipt(
  command: string,
  options: { runId?: string; now?: () => Date } = {}
): { run_id: string; command: string; timestamp: string } {
  return {
    run_id: options.runId ?? randomUUID(),
    command,
    timestamp: (options.now ?? (() => new Date()))().toISOString(),
  };
}

function assertNonEmpty(value: unknown, field: string, maxLength = 512): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${field} missing`);
  if (value.length > maxLength) throw new Error(`${field} exceeds ${maxLength} characters`);
}

function assertHash(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !HEX64.test(value)) throw new Error(`${field} not blake3-hex`);
}

/**
 * Validate the author-supplied receipt fields. Persistence adds schema, phase,
 * and receipt_hash before performing the stricter persisted validation.
 */
export function validateCommandReceipt(receipt: unknown): asserts receipt is CommandReceipt {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    throw new Error('receipt must be an object');
  }
  const value = receipt as Record<string, unknown>;
  for (const key of Object.keys(value)) {
    if (!COMMAND_RECEIPT_FIELDS.has(key)) {
      throw new Error(`receipt contains unknown field: ${key}`);
    }
  }
  assertNonEmpty(value.run_id, 'receipt.run_id', 128);
  if (!SAFE_ID.test(value.run_id as string) || value.run_id === 'latest') {
    throw new Error('receipt.run_id contains unsafe path characters');
  }
  assertNonEmpty(value.command, 'receipt.command');
  assertHash(value.input_hash, 'receipt.input_hash');
  assertHash(value.output_hash, 'receipt.output_hash');
  if (!['pending', 'success', 'partial', 'failed'].includes(String(value.status))) {
    throw new Error('receipt.status invalid');
  }
  assertNonEmpty(value.timestamp, 'receipt.timestamp', 128);
  if (Number.isNaN(Date.parse(value.timestamp as string))) {
    throw new Error('receipt.timestamp invalid');
  }
  if (value.session_id !== undefined) {
    assertNonEmpty(value.session_id, 'receipt.session_id', 128);
    if (!SAFE_ID.test(value.session_id as string)) {
      throw new Error('receipt.session_id contains unsafe characters');
    }
  }
  if (value.predecessor_hash !== undefined) assertHash(value.predecessor_hash, 'receipt.predecessor_hash');
  if (value.receipt_hash !== undefined) assertHash(value.receipt_hash, 'receipt.receipt_hash');
  if (value.schema !== undefined && value.schema !== RECEIPT_SCHEMA) throw new Error('receipt.schema invalid');
  if (
    value.phase !== undefined &&
    !['admission', 'outcome', 'consequence'].includes(String(value.phase))
  ) {
    throw new Error('receipt.phase invalid');
  }
  if (
    value.summary !== undefined &&
    (!value.summary || typeof value.summary !== 'object' || Array.isArray(value.summary))
  ) {
    throw new Error('receipt.summary must be an object');
  }
}

function persistedUnsigned(receipt: CommandReceipt): Omit<PersistedCommandReceipt, 'receipt_hash'> {
  const phase = receipt.phase ?? (receipt.status === 'pending' ? 'admission' : 'outcome');
  if (phase === 'admission' && receipt.status !== 'pending') {
    throw new Error('admission receipt must have pending status');
  }
  if (phase !== 'admission' && receipt.status === 'pending') {
    throw new Error('pending status is only valid for admission receipts');
  }
  return {
    schema: RECEIPT_SCHEMA,
    run_id: receipt.run_id,
    ...(receipt.session_id ? { session_id: receipt.session_id } : {}),
    command: receipt.command,
    phase,
    ...(receipt.predecessor_hash ? { predecessor_hash: receipt.predecessor_hash } : {}),
    input_hash: receipt.input_hash,
    output_hash: receipt.output_hash,
    status: receipt.status,
    timestamp: receipt.timestamp,
    ...(receipt.summary ? { summary: receipt.summary } : {}),
  };
}

function receiptHash(receipt: Omit<PersistedCommandReceipt, 'receipt_hash'>): string {
  return blake3Hex(canonicalJson(receipt));
}

function resolveReceiptDirectory(dirRel?: string): string {
  if (dirRel) return path.resolve(dirRel);
  const configuredHome = process.env.WASM4PM_HOME;
  return configuredHome
    ? path.resolve(configuredHome, 'receipts')
    : path.resolve('.wasm4pm', 'receipts');
}

function permissionMessage(directory: string): string {
  return (
    `Cannot persist command receipt under ${directory}. ` +
    'Set WASM4PM_HOME to a writable, durable directory before invoking wpm.'
  );
}

export function persistCommandReceipt(receipt: CommandReceipt, dirRel?: string): PersistedReceipt {
  validateCommandReceipt(receipt);
  const unsigned = persistedUnsigned(receipt);
  const persisted: PersistedCommandReceipt = {
    ...unsigned,
    receipt_hash: receiptHash(unsigned),
  };
  validateCommandReceipt(persisted);

  const directory = resolveReceiptDirectory(dirRel);
  try {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const file = path.join(directory, `${persisted.run_id}.json`);
    const json = `${JSON.stringify(persisted, null, 2)}\n`;
    atomicWriteSync(file, json, { exclusiveTarget: true });
    // latest.json is a convenience projection, not receipt authority. The
    // immutable unique receipt already exists, so a concurrent projection
    // race may not manufacture command failure.
    try { atomicWriteSync(path.join(directory, 'latest.json'), json); } catch { /* projection only */ }
    return { path: file, receipt: persisted };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EACCES' || code === 'EROFS' || code === 'ENOTDIR') {
      const wrapped = new Error(permissionMessage(directory));
      (wrapped as { cause?: unknown }).cause = error;
      throw wrapped;
    }
    throw error;
  }
}

/** Backwards-compatible path-returning wrapper used by existing commands. */
export function saveCommandReceipt(receipt: CommandReceipt, dirRel?: string): string {
  return persistCommandReceipt(receipt, dirRel).path;
}

export function verifyCommandReceipt(receipt: unknown): ReceiptVerification {
  const issues: string[] = [];
  try {
    validateCommandReceipt(receipt);
    const candidate = receipt as CommandReceipt;
    if (candidate.schema !== RECEIPT_SCHEMA) issues.push('RECEIPT_SCHEMA_MISMATCH');
    if (!candidate.phase) issues.push('RECEIPT_PHASE_MISSING');
    if (!candidate.receipt_hash) {
      issues.push('RECEIPT_HASH_MISSING');
    } else {
      const unsigned = persistedUnsigned(candidate);
      const expected = receiptHash(unsigned);
      if (candidate.receipt_hash !== expected) issues.push('RECEIPT_HASH_MISMATCH');
    }
    return {
      valid: issues.length === 0,
      issues,
      ...(issues.length === 0 ? { receipt: candidate as PersistedCommandReceipt } : {}),
    };
  } catch (error) {
    issues.push(`RECEIPT_INVALID:${(error as Error).message}`);
    return { valid: false, issues };
  }
}

export function readAndVerifyCommandReceipt(file: string): ReceiptVerification {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf-8')) as unknown;
    return verifyCommandReceipt(value);
  } catch (error) {
    return { valid: false, issues: [`RECEIPT_READ_FAILED:${(error as Error).message}`] };
  }
}

export function verifyCommandReceiptChain(receipts: readonly unknown[]): ReceiptVerification {
  if (receipts.length === 0) return { valid: false, issues: ['RECEIPT_CHAIN_EMPTY'] };
  const issues: string[] = [];
  const verified: PersistedCommandReceipt[] = [];
  for (const [index, receipt] of receipts.entries()) {
    const result = verifyCommandReceipt(receipt);
    if (!result.valid || !result.receipt) {
      issues.push(...result.issues.map((issue) => `RECEIPT_${index}:${issue}`));
    } else {
      verified.push(result.receipt);
    }
  }
  if (verified.length !== receipts.length) return { valid: false, issues };
  if (verified[0]?.phase !== 'admission') issues.push('RECEIPT_CHAIN_MISSING_ADMISSION');
  if (verified[0]?.predecessor_hash !== undefined) issues.push('RECEIPT_CHAIN_ADMISSION_HAS_PREDECESSOR');
  const session = verified[0]?.session_id;
  for (let index = 0; index < verified.length; index += 1) {
    const current = verified[index]!;
    if (current.session_id !== session) issues.push(`RECEIPT_CHAIN_SESSION_MISMATCH:${index}`);
    if (index > 0 && current.phase === 'admission') {
      issues.push(`RECEIPT_CHAIN_MULTIPLE_ADMISSIONS:${index}`);
    }
    if (index > 0 && current.predecessor_hash !== verified[index - 1]!.receipt_hash) {
      issues.push(`RECEIPT_CHAIN_PREDECESSOR_MISMATCH:${index}`);
    }
  }
  return { valid: issues.length === 0, issues };
}

export interface PiReceipt {
  algorithm: string;
  replay_pointer: string;
  input_hash: string;
  output_hash: string;
  run_id: string;
  timestamp: string;
}

export function emitPiReceipt(
  algoId: string,
  inputJson: string,
  outputJson: string,
  dirRel?: string,
): PiReceipt {
  const output_hash = blake3Hex(outputJson);
  const receipt: PiReceipt = {
    algorithm: algoId,
    replay_pointer: output_hash.slice(0, 16),
    input_hash: blake3Hex(inputJson),
    output_hash,
    run_id: randomBytes(32).toString('hex'),
    timestamp: new Date().toISOString(),
  };
  const directory = resolveReceiptDirectory(dirRel);
  try {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const json = `${JSON.stringify(receipt, null, 2)}\n`;
    atomicWriteSync(path.join(directory, 'latest.json'), json);
    atomicWriteSync(path.join(directory, `pi-${algoId}-latest.json`), json);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EACCES' || code === 'EROFS' || code === 'ENOTDIR') {
      const wrapped = new Error(permissionMessage(directory));
      (wrapped as { cause?: unknown }).cause = error;
      throw wrapped;
    }
    throw error;
  }
  return receipt;
}

export function emitCrownReceipt(
  command: string,
  inputJson: string,
  outputJson: string,
  dirRel?: string,
): PiReceipt {
  return emitPiReceipt(command, inputJson, outputJson, dirRel);
}
