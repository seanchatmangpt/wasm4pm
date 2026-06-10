//! TypeScript types mirroring Rust serde shapes from `wasm4pm-cognition`.
//!
//! Pure type declarations — zero runtime logic. Every type here is the shape
//! of a value that crosses the WASM boundary as JSON.

// =============================================================================
// Foundational data
// =============================================================================

export interface Fact {
  key: string;
  value: string;
}

export interface Case {
  id: string;
  intent: string;
  architecture: string;
  outcome_score: number;
  facts: Fact[];
}

export interface Candidate {
  id: string;
  score: number;
  eliminated: boolean;
  elimination_reason?: string;
}

export interface Rule {
  id: string;
  premise: string[];
  conclusion: string;
  /** Certainty factor (-1.0..1.0). Required by Rust `Rule` struct (no serde default). */
  certainty: number;
}

export interface Goal {
  id: string;
  predicate: string;
  value: string;
}

export interface StateAtom {
  predicate: string;
  value: string;
}

// =============================================================================
// Breed catalogue (returned by cognition_show)
// =============================================================================

export type BreedId = 'eliza' | 'cbr' | 'dendral' | 'strips' | 'prolog' | 'mycin' | 'gps' | 'soar' | 'hearsay' | 'autoinstinct_neurosis' | 'autoinstinct_semantics' | 'autoinstinct_vision' | 'autoinstinct_learning';

export interface BreedDescriptor {
  id: BreedId;
  name: string;
  year: number;
}

export interface ShowReport {
  breeds: BreedDescriptor[];
}

// =============================================================================
// Run input/output
// =============================================================================

export interface BreedInput {
  intent: string;
  candidates: Candidate[];
  facts: Fact[];
  cases: Case[];
  rules: Rule[];
  goals: Goal[];
  state: StateAtom[];
}

/**
 * A single inference step recorded by a breed during `run()`.
 *
 * Mirrors Rust `TraceStep` from `crates/wasm4pm-cognition/src/breeds/mod.rs`.
 * Trace steps are append-only evidence that a real algorithm executed.
 * An empty trace is a fraud signal: the breed did no work.
 */
export interface TraceStep {
  /** Monotonic step index (0-based). */
  step: number;
  /** Step kind (e.g. "fire-rule", "unify", "eliminate", "post-hypothesis"). */
  kind: string;
  /** Step detail (rule id, action id, candidate id, etc.). */
  detail: string;
  /** Recursion depth at the time of the step. */
  depth: number;
}

export interface BreedOutput {
  breed: BreedId;
  candidates: Candidate[];
  facts: Fact[];
  selected?: string;
  explanation: string;
  /**
   * Append-only inference trace emitted by Rust `BreedOutput.inference_trace`.
   *
   * Source of truth: `crates/wasm4pm-cognition/src/breeds/mod.rs` — field has
   * `#[serde(default)]` so it is always present (defaults to `[]`).
   * Real algorithms produce non-empty traces; an empty trace is a fraud signal.
   */
  inference_trace: TraceStep[];
}

export interface Receipt {
  breed: BreedId;
  input_hash: string;
  output_hash: string;
  combined_hash: string;
}

export interface ReceiptLink {
  index: number;
  input_hash: string;
  output_hash: string;
  combined_hash: string;
  prev_hash?: string;
}

export interface ReceiptChainSnapshot {
  links: ReceiptLink[];
  head_hash?: string;
  replay_pointer?: string;
}

/**
 * Finding emitted by `cognition_verify` / `system_verify`.
 *
 * `severity` is the Debug-formatted Rust `Severity` enum ("Info", "Warning",
 * "Error", "Fatal") — Rust uses `format!("{:?}", f.severity)` (PascalCase).
 * `evidence` is `Vec<String>` from Rust; there is no `details` field.
 */
export interface Finding {
  code: string;
  severity: 'Info' | 'Warning' | 'Error' | 'Fatal';
  message: string;
  evidence: string[];
}

/**
 * Output of `cognition_run`. Source of truth: Rust `wasm.rs` lines 182-190.
 *
 * Rust emits exactly: `{ status, breed, run_id, output_hash, replay_pointer,
 * options_profile, output }`. There is no `exit_code`, `receipt_chain`,
 * `findings`, `decision`, `hash`, or top-level `inference_trace`.
 */
export interface ContractResult {
  status: 'ok';
  breed: BreedId;
  run_id: string;
  output_hash: string;
  replay_pointer: string;
  options_profile: string | null;
  output: BreedOutput;
}

// =============================================================================
// Verify
// =============================================================================

/**
 * Output of `cognition_verify`. Source of truth: Rust `wasm.rs` lines 226-228.
 *
 * Rust emits `'verified'` when no findings, `'has_findings'` when detectors
 * fire. It NEVER emits `'rejected'`.
 */
export interface VerifyResult {
  status: 'verified' | 'has_findings';
  findings: Finding[];
}

// =============================================================================
// Replay
// =============================================================================

export interface ReplayRecord {
  run_id: string;
  output_hash: string;
  replay_pointer: string;
}

// =============================================================================
// System architecture build/verify
// =============================================================================

export interface SystemIntent {
  description: string;
  constraints?: Record<string, unknown>;
  preferences?: Record<string, unknown>;
}

export interface SystemCandidate {
  id: string;
  family_id: string;
  dimensions: Record<string, unknown>;
}

export interface SystemDominated {
  id: string;
  reason: string;
}

/**
 * Output of `system_build`. Source of truth: Rust `wasm.rs` lines 287-290.
 *
 * Rust emits `pareto_front` and `dominated`. It does NOT emit `candidates`.
 */
export interface SystemBuildResult {
  pareto_front: SystemCandidate[];
  dominated: SystemDominated[];
}

export interface SystemArtifact {
  id: string;
  kind: string;
  hash: string;
}

export interface SystemVerifyResult {
  target: string;
  status: 'verified' | 'has_findings';
  findings: Finding[];
}

// =============================================================================
// Adversarial detector descriptor
// =============================================================================

export type DetectorSeverity = 'fatal' | 'error' | 'warning' | 'info';

export interface DetectorDescriptor {
  code: string;
  severity: DetectorSeverity;
  description: string;
}
