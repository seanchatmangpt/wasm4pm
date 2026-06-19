// Fixed WASM contract types for the wasm4pm cognition layer.
// These are STATIC (shipped by the pack, not generated) — they do not vary per breed.
// Field names match crates/wasm4pm-cognition/src/wasm.rs EXACTLY.

export interface Fact {
  key: string;
  value: string;
}

export interface Rule {
  id: string;
  premise: string[];
  conclusion: string;
  /** Rule certainty (REQUIRED — no serde default on the Rust side). */
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

export interface Candidate {
  id: string;
  score: number;
  eliminated: boolean;
  elimination_reason?: string;
}

export interface Case {
  id: string;
  intent: string;
  architecture: string;
  outcome_score: number;
  facts: Fact[];
}

export interface BreedInput {
  intent: string;
  candidates: Candidate[];
  facts: Fact[];
  cases: Case[];
  rules: Rule[];
  goals: Goal[];
  state: StateAtom[];
}

export interface CognitionRunOptions {
  profile?: string;
}

/** Wire shape sent to cognition_run. */
export interface CognitionRunInput {
  breed: string;
  contract: BreedInput;
  options?: CognitionRunOptions;
}

/**
 * cognition_run output (ContractResult, wasm.rs).
 * NOTE: there is NO `decision`, `hash`, `exit_code`, or `findings` field here.
 * Success check is `status === "ok"`; receipts key off `run_id`.
 */
export interface ContractResult {
  status: "ok";
  breed: string;
  run_id: string;
  output_hash: string;
  /** First 16 chars of output_hash. */
  replay_pointer: string;
  options_profile: string;
  output: unknown;
}
