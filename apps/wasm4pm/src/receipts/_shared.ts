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
import { randomUUID } from 'node:crypto';
import { hashJsonString } from '@wasm4pm/contracts';

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

export function saveCommandReceipt(receipt: CommandReceipt, dirRel = '.wasm4pm/receipts'): string {
  const dir = path.resolve(dirRel);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${receipt.run_id}.json`);
  const json = JSON.stringify(receipt, null, 2) + '\n';
  fs.writeFileSync(file, json);
  fs.writeFileSync(path.join(dir, 'latest.json'), json);
  return file;
}
