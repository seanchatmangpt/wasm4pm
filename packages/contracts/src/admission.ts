/**
 * Admission framework types — Accept(x) = C1 through C7
 *
 * Mirrors the Rust structs in wasm4pm/src/admission.rs.
 */

import { z } from 'zod';

export const PolicyGrantSchema = z.object({
  actor_pattern: z.string(),
  event_types: z.array(z.string()),
});

export type PolicyGrant = z.infer<typeof PolicyGrantSchema>;

export const AdmissionPolicySchema = z.object({
  version: z.string(),
  policy_hash: z.string(),
  grants: z.array(PolicyGrantSchema),
});

export type AdmissionPolicy = z.infer<typeof AdmissionPolicySchema>;

export const BoundaryMapSchema = z.object({
  transitions: z.record(z.string(), z.array(z.string())),
});

export type BoundaryMap = z.infer<typeof BoundaryMapSchema>;

export const AdmissionConfigSchema = z.object({
  ledger_path: z.string(),
  policy_path: z.string(),
  boundary_map_path: z.string(),
  revocation_path: z.string(),
});

export type AdmissionConfig = z.infer<typeof AdmissionConfigSchema>;

export const AdmissionResultSchema = z.object({
  admitted: z.boolean(),
  failing_conjunct: z.string().optional(),
  refusal_code: z.string().optional(),
  receipt_hash: z.string().optional(),
});

export type AdmissionResult = z.infer<typeof AdmissionResultSchema>;

// Default file paths for admission framework
export const DEFAULT_NONCE_LEDGER_PATH = '.wasm4pm/nonce-ledger.jsonl';
export const DEFAULT_POLICY_PATH = '.wasm4pm/admission-policy.json';
export const DEFAULT_BOUNDARY_MAP_PATH = '.wasm4pm/boundary-map.json';
export const DEFAULT_REVOCATION_PATH = '.wasm4pm/revoked-validators.json';
