/**
 * Admission framework types — Accept(x) = C1 through C7
 *
 * Mirrors the Rust structs in wasm4pm/src/admission.rs.
 */
import { z } from 'zod';
export declare const PolicyGrantSchema: z.ZodObject<{
    actor_pattern: z.ZodString;
    event_types: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    actor_pattern: string;
    event_types: string[];
}, {
    actor_pattern: string;
    event_types: string[];
}>;
export type PolicyGrant = z.infer<typeof PolicyGrantSchema>;
export declare const AdmissionPolicySchema: z.ZodObject<{
    version: z.ZodString;
    policy_hash: z.ZodString;
    grants: z.ZodArray<z.ZodObject<{
        actor_pattern: z.ZodString;
        event_types: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        actor_pattern: string;
        event_types: string[];
    }, {
        actor_pattern: string;
        event_types: string[];
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    version: string;
    policy_hash: string;
    grants: {
        actor_pattern: string;
        event_types: string[];
    }[];
}, {
    version: string;
    policy_hash: string;
    grants: {
        actor_pattern: string;
        event_types: string[];
    }[];
}>;
export type AdmissionPolicy = z.infer<typeof AdmissionPolicySchema>;
export declare const BoundaryMapSchema: z.ZodObject<{
    transitions: z.ZodRecord<z.ZodString, z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    transitions: Record<string, string[]>;
}, {
    transitions: Record<string, string[]>;
}>;
export type BoundaryMap = z.infer<typeof BoundaryMapSchema>;
export declare const AdmissionConfigSchema: z.ZodObject<{
    ledger_path: z.ZodString;
    policy_path: z.ZodString;
    boundary_map_path: z.ZodString;
    revocation_path: z.ZodString;
}, "strip", z.ZodTypeAny, {
    ledger_path: string;
    policy_path: string;
    boundary_map_path: string;
    revocation_path: string;
}, {
    ledger_path: string;
    policy_path: string;
    boundary_map_path: string;
    revocation_path: string;
}>;
export type AdmissionConfig = z.infer<typeof AdmissionConfigSchema>;
export declare const AdmissionResultSchema: z.ZodObject<{
    admitted: z.ZodBoolean;
    failing_conjunct: z.ZodOptional<z.ZodString>;
    refusal_code: z.ZodOptional<z.ZodString>;
    receipt_hash: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    admitted: boolean;
    failing_conjunct?: string | undefined;
    refusal_code?: string | undefined;
    receipt_hash?: string | undefined;
}, {
    admitted: boolean;
    failing_conjunct?: string | undefined;
    refusal_code?: string | undefined;
    receipt_hash?: string | undefined;
}>;
export type AdmissionResult = z.infer<typeof AdmissionResultSchema>;
export declare const DEFAULT_NONCE_LEDGER_PATH = ".wasm4pm/nonce-ledger.jsonl";
export declare const DEFAULT_POLICY_PATH = ".wasm4pm/admission-policy.json";
export declare const DEFAULT_BOUNDARY_MAP_PATH = ".wasm4pm/boundary-map.json";
export declare const DEFAULT_REVOCATION_PATH = ".wasm4pm/revoked-validators.json";
/**
 * BVCAdmissionResult — typed gate marker for the Breed Validation Certificate
 * admission check.  Plain interface; no Zod schema required.
 *
 * Produced by evaluating computeBVC() and mapping to an admission decision.
 */
export interface BVCAdmissionResult {
    admitted: boolean;
    bvc_score: number;
    failing_dimensions: string[];
    breed: string;
}
//# sourceMappingURL=admission.d.ts.map