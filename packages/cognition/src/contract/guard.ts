//! Runtime field-contract guards for cognition WASM outputs.
//!
//! Source of truth: `.claude/rules/cognition-contracts.md` and Rust
//! `crates/wasm4pm-cognition/src/wasm.rs`. Refuses parsed JSON whose shape
//! diverges from the Rust contract so drift surfaces as a typed
//! `CognitionError('OUTPUT_PARSE_INVALID')` at the WASM boundary, not as a
//! downstream `undefined` many call-frames away.
//!
//! Guards delegate to Zod schemas from `../schemas.ts` — no bespoke
//! field-walking code required.

import { CognitionError } from '../errors.js';
import {
  ContractResultSchema,
  ReplayRecordSchema,
  SystemBuildResultSchema,
  SystemVerifyResultSchema,
  VerifyResultSchema,
  type ContractResult,
  type ReplayRecord,
  type SystemBuildResult,
  type SystemVerifyResult,
  type VerifyResult,
} from '../schemas.js';

function reject(op: string, reason: string): never {
  throw new CognitionError(
    `${op}: WASM output rejected by field-contract guard: ${reason}`,
    'OUTPUT_SHAPE_INVALID',
  );
}

function parseWith<T>(
  schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: { message: string } } },
  raw: unknown,
  op: string,
): T {
  const result = schema.safeParse(raw);
  if (!result.success) {
    reject(op, result.error?.message ?? 'schema validation failed');
  }
  return result.data as T;
}

/** `cognition_run` output per `wasm.rs:182-190`. */
export function assertContractResult(raw: unknown): ContractResult {
  const result = ContractResultSchema.safeParse(raw);
  if (!result.success) {
    reject('cognition_run', result.error.message);
  }
  const data = result.data!;
  // Structural invariant from Rust wasm.rs:173 — pointer is hash prefix.
  if (data.replay_pointer.length !== 16 || !data.output_hash.startsWith(data.replay_pointer)) {
    reject(
      'cognition_run',
      `replay_pointer (len=${data.replay_pointer.length}) must be the 16-char prefix of output_hash`,
    );
  }
  return data;
}

/** `cognition_verify` output per `wasm.rs:226-228`. Never accepts 'rejected'. */
export function assertVerifyResult(raw: unknown): VerifyResult {
  return parseWith(VerifyResultSchema, raw, 'cognition_verify');
}

/** `system_build` output per `wasm.rs:287-290`. Refuses `candidates`. */
export function assertSystemBuildResult(raw: unknown): SystemBuildResult {
  const isObj = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);
  if (isObj(raw) && 'candidates' in raw) {
    reject('system_build', `'candidates' field — Rust emits pareto_front/dominated`);
  }
  return parseWith(SystemBuildResultSchema, raw, 'system_build');
}

/** `system_verify` output per `wasm.rs:331-336`. Rust emits only 'verified' or 'has_findings'. */
export function assertSystemVerifyResult(raw: unknown): SystemVerifyResult {
  return parseWith(SystemVerifyResultSchema, raw, 'system_verify');
}

/** `cognition_replay` output per `wasm.rs:235-243`. */
export function assertReplayRecord(raw: unknown): ReplayRecord {
  return parseWith(ReplayRecordSchema, raw, 'cognition_replay');
}
