/**
 * Admission framework types — Accept(x) = C1 through C7
 *
 * Mirrors the Rust structs in wasm4pm/src/admission.rs.
 */

export interface PolicyGrant {
  actor_pattern: string;
  event_types: string[];
}

export interface AdmissionPolicy {
  version: string;
  policy_hash: string;
  grants: PolicyGrant[];
}

export interface BoundaryMap {
  transitions: Record<string, string[]>;
}

export interface AdmissionConfig {
  ledger_path: string;
  policy_path: string;
  boundary_map_path: string;
  revocation_path: string;
}

export interface AdmissionResult {
  admitted: boolean;
  failing_conjunct?: string;
  refusal_code?: string;
  receipt_hash?: string;
}

// Default file paths for admission framework
export const DEFAULT_NONCE_LEDGER_PATH = '.wasm4pm/nonce-ledger.jsonl';
export const DEFAULT_POLICY_PATH = '.wasm4pm/admission-policy.json';
export const DEFAULT_BOUNDARY_MAP_PATH = '.wasm4pm/boundary-map.json';
export const DEFAULT_REVOCATION_PATH = '.wasm4pm/revoked-validators.json';
