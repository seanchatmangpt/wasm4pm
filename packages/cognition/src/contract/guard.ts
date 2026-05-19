//! Runtime field-contract guards for cognition WASM outputs.
//!
//! Source of truth: `.claude/rules/cognition-contracts.md` and Rust
//! `crates/wasm4pm-cognition/src/wasm.rs`. Refuses parsed JSON whose shape
//! diverges from the Rust contract so drift surfaces as a typed
//! `CognitionError('OUTPUT_PARSE_FAILED')` at the WASM boundary, not as a
//! downstream `undefined` many call-frames away.

import { CognitionError } from '../errors.js';
import type {
  ContractResult,
  ReplayRecord,
  SystemBuildResult,
  SystemVerifyResult,
  VerifyResult,
} from '../types.js';

const isStr = (v: unknown): v is string => typeof v === 'string';
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function reject(op: string, reason: string): never {
  throw new CognitionError(
    `${op}: WASM output rejected by field-contract guard: ${reason}`,
    'OUTPUT_SHAPE_INVALID',
  );
}

/** `cognition_run` output per `wasm.rs:182-190`. */
export function assertContractResult(raw: unknown): ContractResult {
  if (!isObj(raw)) reject('cognition_run', `expected object, got ${typeof raw}`);
  if (raw.status !== 'ok')
    reject('cognition_run', `status must be 'ok', got ${JSON.stringify(raw.status)}`);
  if (!isStr(raw.breed) || raw.breed.length === 0)
    reject('cognition_run', `breed must be non-empty string`);
  if (!isStr(raw.run_id) || raw.run_id.length === 0)
    reject('cognition_run', `run_id must be non-empty string`);
  if (!isStr(raw.output_hash) || raw.output_hash.length === 0)
    reject('cognition_run', `output_hash must be non-empty string`);
  if (!isStr(raw.replay_pointer))
    reject('cognition_run', `replay_pointer must be string`);
  // Structural invariant from Rust wasm.rs:173 — pointer is hash prefix.
  if (raw.replay_pointer.length !== 16 || !raw.output_hash.startsWith(raw.replay_pointer))
    reject(
      'cognition_run',
      `replay_pointer (len=${raw.replay_pointer.length}) must be the 16-char prefix of output_hash`,
    );
  if (raw.options_profile !== null && !isStr(raw.options_profile))
    reject('cognition_run', `options_profile must be string or null`);
  if (!isObj(raw.output)) reject('cognition_run', `output must be a BreedOutput object`);
  return raw as unknown as ContractResult;
}

/** `cognition_verify` output per `wasm.rs:226-228`. Never accepts 'rejected'. */
export function assertVerifyResult(raw: unknown): VerifyResult {
  if (!isObj(raw)) reject('cognition_verify', `expected object`);
  if (raw.status !== 'verified' && raw.status !== 'has_findings')
    reject(
      'cognition_verify',
      `status must be 'verified' | 'has_findings', got ${JSON.stringify(raw.status)}`,
    );
  if (!Array.isArray(raw.findings))
    reject('cognition_verify', `findings must be an array`);
  return raw as unknown as VerifyResult;
}

/** `system_build` output per `wasm.rs:287-290`. Refuses legacy `candidates`. */
export function assertSystemBuildResult(raw: unknown): SystemBuildResult {
  if (!isObj(raw)) reject('system_build', `expected object`);
  if (!Array.isArray(raw.pareto_front))
    reject('system_build', `pareto_front must be an array`);
  if (!Array.isArray(raw.dominated))
    reject('system_build', `dominated must be an array`);
  if ('candidates' in raw)
    reject('system_build', `legacy 'candidates' field — Rust emits pareto_front/dominated`);
  return raw as unknown as SystemBuildResult;
}

/** `system_verify` output per `wasm.rs:331-336`. Rust emits only 'verified' or 'has_findings'. */
export function assertSystemVerifyResult(raw: unknown): SystemVerifyResult {
  if (!isObj(raw)) reject('system_verify', `expected object`);
  if (!isStr(raw.target)) reject('system_verify', `target must be string`);
  if (raw.status !== 'verified' && raw.status !== 'has_findings' && raw.status !== 'ok')
    reject(
      'system_verify',
      `status must be 'verified' | 'has_findings', got ${JSON.stringify(raw.status)}`,
    );
  if (!Array.isArray(raw.findings))
    reject('system_verify', `findings must be an array`);
  return raw as unknown as SystemVerifyResult;
}

/** `cognition_replay` output per `wasm.rs:235-243`. */
export function assertReplayRecord(raw: unknown): ReplayRecord {
  if (!isObj(raw)) reject('cognition_replay', `expected object`);
  if (!isStr(raw.run_id) || raw.run_id.length === 0)
    reject('cognition_replay', `run_id must be non-empty string`);
  if (!isStr(raw.output_hash) || raw.output_hash.length === 0)
    reject('cognition_replay', `output_hash must be non-empty string`);
  if (!isStr(raw.replay_pointer))
    reject('cognition_replay', `replay_pointer must be string`);
  return raw as unknown as ReplayRecord;
}
