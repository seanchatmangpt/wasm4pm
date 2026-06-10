//! Zod schemas for all pure-data WASM boundary types.
//!
//! Every schema mirrors the Rust serde shape from `wasm4pm-cognition`.
//! Use `Schema.parse(raw)` at the WASM boundary instead of hand-rolled guards.
//!
//! Source of truth: `.claude/rules/cognition-contracts.md` and
//! `crates/wasm4pm-cognition/src/wasm.rs`.

import { z } from 'zod';

// =============================================================================
// Foundational data
// =============================================================================

export const FactSchema = z.object({
  key: z.string(),
  value: z.string(),
});
export type Fact = z.infer<typeof FactSchema>;

export const CaseSchema = z.object({
  id: z.string(),
  intent: z.string(),
  architecture: z.string(),
  outcome_score: z.number(),
  facts: z.array(FactSchema),
});
export type Case = z.infer<typeof CaseSchema>;

export const CandidateSchema = z.object({
  id: z.string(),
  score: z.number(),
  eliminated: z.boolean(),
  elimination_reason: z.string().optional(),
});
export type Candidate = z.infer<typeof CandidateSchema>;

export const RuleSchema = z.object({
  id: z.string(),
  premise: z.array(z.string()),
  conclusion: z.string(),
  /** Certainty factor (-1.0..1.0). Required by Rust `Rule` struct (no serde default). */
  certainty: z.number().min(-1).max(1),
});
export type Rule = z.infer<typeof RuleSchema>;

export const GoalSchema = z.object({
  id: z.string(),
  predicate: z.string(),
  value: z.string(),
});
export type Goal = z.infer<typeof GoalSchema>;

export const StateAtomSchema = z.object({
  predicate: z.string(),
  value: z.string(),
});
export type StateAtom = z.infer<typeof StateAtomSchema>;

// =============================================================================
// Breed catalogue (returned by cognition_show)
// =============================================================================

export const BreedIdSchema = z.enum([
  'eliza',
  'cbr',
  'dendral',
  'strips',
  'prolog',
  'mycin',
  'gps',
  'soar',
  'hearsay',
  'autoinstinct_neurosis',
  'autoinstinct_semantics',
  'autoinstinct_vision',
  'autoinstinct_learning',
]);
export type BreedId = z.infer<typeof BreedIdSchema>;

export const BreedDescriptorSchema = z.object({
  id: BreedIdSchema,
  name: z.string(),
  year: z.number(),
});
export type BreedDescriptor = z.infer<typeof BreedDescriptorSchema>;

export const ShowReportSchema = z.object({
  breeds: z.array(BreedDescriptorSchema),
});
export type ShowReport = z.infer<typeof ShowReportSchema>;

// =============================================================================
// Run input/output
// =============================================================================

export const BreedInputSchema = z.object({
  intent: z.string(),
  candidates: z.array(CandidateSchema),
  facts: z.array(FactSchema),
  cases: z.array(CaseSchema),
  rules: z.array(RuleSchema),
  goals: z.array(GoalSchema),
  state: z.array(StateAtomSchema),
});
export type BreedInput = z.infer<typeof BreedInputSchema>;

export const TraceStepSchema = z.object({
  step: z.number(),
  kind: z.string(),
  detail: z.string(),
  depth: z.number(),
});
export type TraceStep = z.infer<typeof TraceStepSchema>;

export const BreedOutputSchema = z.object({
  breed: z.string(),
  candidates: z.array(CandidateSchema),
  facts: z.array(FactSchema),
  selected: z.string().optional(),
  explanation: z.string(),
  inference_trace: z.array(TraceStepSchema).optional(),
});
export type BreedOutput = z.infer<typeof BreedOutputSchema>;

export const ReceiptSchema = z.object({
  breed: BreedIdSchema,
  input_hash: z.string(),
  output_hash: z.string(),
  combined_hash: z.string(),
});
export type Receipt = z.infer<typeof ReceiptSchema>;

export const ReceiptLinkSchema = z.object({
  index: z.number(),
  input_hash: z.string(),
  output_hash: z.string(),
  combined_hash: z.string(),
  prev_hash: z.string().optional(),
});
export type ReceiptLink = z.infer<typeof ReceiptLinkSchema>;

export const ReceiptChainSnapshotSchema = z.object({
  links: z.array(ReceiptLinkSchema),
  head_hash: z.string().optional(),
  replay_pointer: z.string().optional(),
});
export type ReceiptChainSnapshot = z.infer<typeof ReceiptChainSnapshotSchema>;

export const FindingSchema = z.object({
  code: z.string(),
  severity: z.enum(['Info', 'Warning', 'Error', 'Fatal']),
  message: z.string(),
  evidence: z.array(z.string()),
});
export type Finding = z.infer<typeof FindingSchema>;

/**
 * Output of `cognition_run`. Source of truth: Rust `wasm.rs` lines 182-190.
 *
 * Rust emits exactly: `{ status, breed, run_id, output_hash, replay_pointer,
 * options_profile, output }`. There is no `exit_code`, `receipt_chain`,
 * `findings`, `decision`, `hash`, or top-level `inference_trace`.
 */
export const ContractResultSchema = z.object({
  status: z.literal('ok'),
  breed: BreedIdSchema,
  run_id: z.string().min(1),
  output_hash: z.string().min(1),
  replay_pointer: z.string(),
  options_profile: z.string().nullable(),
  output: BreedOutputSchema,
});
export type ContractResult = z.infer<typeof ContractResultSchema>;

// =============================================================================
// Verify
// =============================================================================

/**
 * Output of `cognition_verify`. Source of truth: Rust `wasm.rs` lines 226-228.
 *
 * Rust emits `'verified'` when no findings, `'has_findings'` when detectors
 * fire. It NEVER emits `'rejected'`.
 */
export const VerifyResultSchema = z.object({
  status: z.enum(['verified', 'has_findings']),
  findings: z.array(FindingSchema),
});
export type VerifyResult = z.infer<typeof VerifyResultSchema>;

// =============================================================================
// Replay
// =============================================================================

export const ReplayRecordSchema = z.object({
  run_id: z.string(),
  output_hash: z.string(),
  replay_pointer: z.string(),
});
export type ReplayRecord = z.infer<typeof ReplayRecordSchema>;

// =============================================================================
// System architecture build/verify
// =============================================================================

export const SystemIntentSchema = z.object({
  description: z.string(),
  constraints: z.record(z.string(), z.unknown()).optional(),
  preferences: z.record(z.string(), z.unknown()).optional(),
});
export type SystemIntent = z.infer<typeof SystemIntentSchema>;

export const SystemCandidateSchema = z.object({
  id: z.string(),
  family_id: z.string(),
  dimensions: z.record(z.string(), z.unknown()),
});
export type SystemCandidate = z.infer<typeof SystemCandidateSchema>;

export const SystemDominatedSchema = z.object({
  id: z.string(),
  reason: z.string(),
});
export type SystemDominated = z.infer<typeof SystemDominatedSchema>;

/**
 * Output of `system_build`. Source of truth: Rust `wasm.rs` lines 287-290.
 *
 * Rust emits `pareto_front` and `dominated`. It does NOT emit `candidates`.
 */
export const SystemBuildResultSchema = z.object({
  pareto_front: z.array(SystemCandidateSchema),
  dominated: z.array(SystemDominatedSchema),
});
export type SystemBuildResult = z.infer<typeof SystemBuildResultSchema>;

export const SystemArtifactSchema = z.object({
  id: z.string(),
  kind: z.string(),
  hash: z.string(),
});
export type SystemArtifact = z.infer<typeof SystemArtifactSchema>;

export const SystemVerifyResultSchema = z.object({
  target: z.string(),
  status: z.enum(['verified', 'has_findings', 'ok']),
  findings: z.array(FindingSchema),
});
export type SystemVerifyResult = z.infer<typeof SystemVerifyResultSchema>;

// =============================================================================
// Adversarial detector descriptor
// =============================================================================

export const DetectorSeveritySchema = z.enum(['fatal', 'error', 'warning', 'info']);
export type DetectorSeverity = z.infer<typeof DetectorSeveritySchema>;

export const DetectorDescriptorSchema = z.object({
  code: z.string(),
  severity: DetectorSeveritySchema,
  description: z.string(),
});
export type DetectorDescriptor = z.infer<typeof DetectorDescriptorSchema>;

// =============================================================================
// Receipt chain verification results (from receipt/chain.ts)
// =============================================================================

export const ChainVerifyOutcomeSchema = z.object({
  ok: z.boolean(),
  reason: z
    .enum([
      'genesis_has_prev_hash',
      'missing_prev_hash',
      'prev_hash_mismatch',
      'missing_combined_hash',
      'non_monotonic_index',
    ])
    .optional(),
  at_index: z.number().optional(),
});
export type ChainVerifyOutcome = z.infer<typeof ChainVerifyOutcomeSchema>;

export const CausalCheckResultSchema = z.object({
  ok: z.boolean(),
  violations: z.array(z.string()),
});
export type CausalCheckResult = z.infer<typeof CausalCheckResultSchema>;
