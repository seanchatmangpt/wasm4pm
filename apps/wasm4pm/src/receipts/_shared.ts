//! Shared receipt helpers for Phase A commands (run/compare/diff/conformance/quality).
//!
//! Receipts capture proof of execution: BLAKE3 hashes of input + output,
//! a UUID `run_id`, command name, status, and an optional summary. Saved to
//! `.wasm4pm/receipts/<run_id>.json` plus `.wasm4pm/receipts/latest.json`.
//!
//! BLAKE3 comes from `@wasm4pm/contracts` (`hashJsonString`); when contracts
//! is unavailable in unusual environments, callers may pass a precomputed
//! hex string directly.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { hashJsonString } from '@wasm4pm/contracts';

export function atomicWriteSync(target: string, content: string): void {
  const tmp = `${target}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, content);
  try {
    fs.renameSync(tmp, target);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* ignore cleanup failure */ }
    throw err;
  }
}

export interface CommandReceipt {
  run_id: string;
  command: string;
  input_hash: string;
  output_hash: string;
  status: 'success' | 'partial' | 'failed';
  timestamp: string;
  summary?: Record<string, unknown>;
}

/** BLAKE3 hex-64 of an arbitrary buffer/string via @wasm4pm/contracts. */
export function blake3Hex(buf: Buffer | string): string {
  const s = typeof buf === 'string' ? buf : buf.toString('utf-8');
  return hashJsonString(s);
}

export function newReceipt(command: string): { run_id: string; command: string; timestamp: string } {
  return {
    run_id: randomUUID(),
    command,
    timestamp: new Date().toISOString(),
  };
}

const HEX64 = /^[0-9a-f]{64}$/;

/**
 * Schema validator for CommandReceipt. Asserts shape + that input/output
 * hashes are blake3-hex-64 (no path strings, no shorthand). Invalid receipts
 * are refused and are never persisted.
 */
export function validateCommandReceipt(r: unknown): asserts r is CommandReceipt {
  if (!r || typeof r !== 'object' || Array.isArray(r)) throw new Error('receipt must be an object');
  const o = r as Record<string, unknown>;
  if (typeof o.run_id !== 'string' || o.run_id.length === 0) throw new Error('receipt.run_id missing');
  if (typeof o.command !== 'string' || o.command.length === 0) throw new Error('receipt.command missing');
  if (typeof o.input_hash !== 'string' || !HEX64.test(o.input_hash))
    throw new Error(`receipt.input_hash not blake3-hex: ${String(o.input_hash).slice(0, 16)}`);
  if (typeof o.output_hash !== 'string' || !HEX64.test(o.output_hash))
    throw new Error('receipt.output_hash not blake3-hex');
  if (!['success', 'partial', 'failed'].includes(o.status as string))
    throw new Error('receipt.status invalid');
  if (typeof o.timestamp !== 'string' || Number.isNaN(Date.parse(o.timestamp)))
    throw new Error('receipt.timestamp missing or invalid');
}

export function saveCommandReceipt(receipt: CommandReceipt, dirRel = '.wasm4pm/receipts'): string {
  validateCommandReceipt(receipt);
  const dir = path.resolve(dirRel);
  try {
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${receipt.run_id}.json`);
    const json = JSON.stringify(receipt, null, 2) + '\n';
    atomicWriteSync(file, json);
    atomicWriteSync(path.join(dir, 'latest.json'), json);
    return file;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EACCES' || code === 'EROFS') {
      const msg = `Permission denied when writing to ${dir}. ` +
                  `You are running in a restricted filesystem (e.g. read-only container or Docker). ` +
                  `Please set WASM4PM_HOME or PMC_CONFIG_PATH to a writable directory. ` +
                  `Example: export WASM4PM_HOME=/tmp`;
      throw new Error(msg);
    }
    throw err;
  }
}

export interface PiReceipt {
  algorithm: string;
  replay_pointer: string;   // first 16 hex chars of output_hash
  input_hash: string;       // BLAKE3 hex-64
  output_hash: string;      // BLAKE3 hex-64
  run_id: string;           // 32 random bytes as hex-64
  timestamp: string;        // ISO 8601
}

export function emitPiReceipt(
  algoId: string,
  inputJson: string,
  outputJson: string,
  dirRel = '.wasm4pm/receipts',
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
  const dir = path.resolve(dirRel);
  try {
    fs.mkdirSync(dir, { recursive: true });
    const json = JSON.stringify(receipt, null, 2) + '\n';
    atomicWriteSync(path.join(dir, 'latest.json'), json);
    atomicWriteSync(path.join(dir, `pi-${algoId}-latest.json`), json);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EACCES' || code === 'EROFS') {
      throw new Error(`Permission denied writing receipt to ${dir}`);
    }
    throw err;
  }
  return receipt;
}

export function emitCrownReceipt(
  command: string,
  inputJson: string,
  outputJson: string,
  dirRel = '.wasm4pm/receipts',
): PiReceipt {
  return emitPiReceipt(command, inputJson, outputJson, dirRel);
}
