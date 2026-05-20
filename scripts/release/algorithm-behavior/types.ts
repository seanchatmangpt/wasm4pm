export type FailureCode = 
  | 'EMPTY_EVENT_LOG'
  | 'MALFORMED_EVENT_LOG'
  | 'MISSING_ACTIVITY_FIELD'
  | 'MISSING_TIMESTAMP_FIELD'
  | 'MISSING_OBJECT_ID'
  | 'UNSUPPORTED_PROFILE'
  | 'UNSUPPORTED_PARAMETER'
  | 'INVALID_MODEL_HANDLE'
  | 'INVALID_ALGORITHM_ID'
  | 'WASM_EXPORT_MISSING'
  | 'INSUFFICIENT_TRACES'
  | 'INVALID_OCEL_OBJECT_GRAPH'
  | 'CONFORMANCE_MODEL_REQUIRED'
  | 'PREDICTION_FEATURES_REQUIRED'
  | 'NONDETERMINISTIC_WITHOUT_SEED'
  | 'RECEIPT_HASH_MISMATCH';

export interface PositiveCaseEvidence {
  case_id: string;
  input_hash: string;
  status: 'passed' | 'failed';
  result_hash: string;
  duration_ms: number;
  receipt_hash: string;
}

export interface NegativeCaseEvidence {
  case_id: string;
  input_hash: string;
  status: 'failed_correctly' | 'failed_incorrectly';
  error_code: FailureCode;
  no_panic: boolean;
  no_false_success: boolean;
  receipt_hash: string;
}

export interface InvariantCaseEvidence {
  case_id: string;
  status: 'passed' | 'failed';
  stable?: boolean;
  first_result_hash?: string;
  second_result_hash?: string;
  seed?: number;
  result_schema_valid?: boolean;
  fitness_within_expected_range?: boolean;
}

export interface AlgorithmBehaviorRow {
  algorithm_id: string;
  category: string;
  profiles: string[];
  registry_present: boolean;
  ts_dispatch_present: boolean;
  cli_present: boolean;
  wasm_export_present: boolean;
  positive_cases: PositiveCaseEvidence[];
  negative_cases: NegativeCaseEvidence[];
  invariant_cases: InvariantCaseEvidence[];
  algorithm_evidence_hash: string;
}

export interface AlgorithmBehaviorEvidence {
  package: string;
  version: string;
  git_commit: string;
  generated_at: string;
  algorithm_count: number;
  summary: {
    positive_cases: number;
    negative_cases: number;
    invariant_cases: number;
    all_positive_passed: boolean;
    all_negative_failed_correctly: boolean;
    all_invariants_passed: boolean;
  };
  algorithms: AlgorithmBehaviorRow[];
  behavior_evidence_hash: string;
}
