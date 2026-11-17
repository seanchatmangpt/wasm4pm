/**
 * Type definitions and JS helper wrappers for wasm4pm cognition kernel.
 */

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
  elimination_reason?: string | null;
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

export interface BreedContract {
  intent: string;
  candidates?: Candidate[];
  facts?: Fact[];
  cases?: Case[];
  rules?: Rule[];
  goals?: Goal[];
  state?: StateAtom[];
}

export interface CognitionRunInput {
  breed:
    | 'eliza'
    | 'mycin'
    | 'prolog'
    | 'strips'
    | 'cbr'
    | 'hearsay'
    | 'soar'
    | 'dendral'
    | 'gps'
    | 'autoinstinct_neurosis'
    | 'autoinstinct_semantics'
    | 'autoinstinct_vision'
    | 'autoinstinct_learning'
    | string;
  contract: BreedContract;
}

export interface TraceStep {
  step: number;
  kind: string;
  detail: string;
  depth: number;
  objects?: [string, string][];
}

export interface BreedOutput {
  breed: string;
  candidates: Candidate[];
  facts: Fact[];
  selected?: string | null;
  explanation: string;
  inference_trace: TraceStep[];
  ocel_log?: any;
  retained_cases?: Case[];
}

export interface CognitionResult {
  status: 'ok' | 'refused' | 'error';
  breed: string;
  run_id: string;
  output_hash: string;
  replay_pointer: string;
  output: BreedOutput;
  error?: string;
}
