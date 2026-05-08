/**
 * TypeScript types mirroring Rust serde shapes from `wasm4pm-cognition`.
 *
 * Pure type declarations — zero runtime logic. Every type here is the shape
 * of a value that crosses the WASM boundary as JSON.
 */

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

export interface BreedDescriptor {
  id: string;
  name: string;
  year: number;
}

export interface ShowReport {
  breeds: BreedDescriptor[];
}

// =============================================================================
// Run input/output
// =============================================================================

/**
 * Primary input to a cognition contract run.
 * `intent` drives breed selection; all other fields provide evidence.
 */
export interface BreedInput {
  intent: string;
  candidates: Candidate[];
  facts: Fact[];
  cases: Case[];
  rules: Rule[];
  goals: Goal[];
  state: StateAtom[];
}

export interface BreedOutput {
  breed: string;
  candidates: Candidate[];
  facts: Fact[];
  selected?: string;
  explanation: string;
}

export interface Receipt {
  breed: string;
  input_hash: string;
  output_hash: string;
  combined_hash: string;
}

/**
 * One link in a receipt chain. `combined_hash` of link N must equal
 * `prev_hash` of link N+1 for the chain to be valid.
 */
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

export interface Finding {
  code: string;
  severity: 'fatal' | 'error' | 'warning' | 'info';
  message: string;
  details?: Record<string, unknown>;
}

/** Direct return type of `runContract()`. Exit code 0 = success. */
export interface ContractResult {
  output?: BreedOutput;
  findings?: Finding[];
  receipt_chain?: ReceiptChainSnapshot;
  receipt?: Receipt;
  exit_code?: number;
  status?: string;
  message?: string;
}

// =============================================================================
// Verify
// =============================================================================

export interface VerifyResult {
  status: 'verified' | 'rejected' | string;
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
  score: number;
}

export interface SystemBuildResult {
  candidates: SystemCandidate[];
}

export interface SystemArtifact {
  id: string;
  kind: string;
  hash: string;
}

export interface SystemVerifyResult {
  target: string;
  status: string;
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
