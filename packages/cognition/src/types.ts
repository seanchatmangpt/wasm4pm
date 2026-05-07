//! TypeScript types mirroring Rust structs

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

export interface ContractResult {
  output: BreedOutput;
  findings: any[];
  receipt_chain: any;
  exit_code: number;
}
