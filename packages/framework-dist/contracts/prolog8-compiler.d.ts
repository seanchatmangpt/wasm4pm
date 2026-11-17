/**
 * prolog8-compiler.ts — Rule8 / Fact8 construction helpers for the Prolog8 engine.
 *
 * CONTEXT: The Prolog8 kernel rejects text-form Horn clauses at the WASM boundary
 * (`RejectionCode::StringQueryNotAdmitted`). Callers must pre-compile all rules
 * and facts into `Rule8`-shaped JSON before passing them to `prolog8_query` or
 * `prolog8_replay`. This module is the canonical TypeScript-side compiler.
 *
 * ## Prolog8 intern scheme (from crates/prolog8/src/catalog.rs)
 *
 *   - `TermId(0)` is the sentinel — it represents an UNBOUND variable position
 *     in a rule head or body atom. It is NEVER assigned to a real term label.
 *   - Terms are interned sequentially starting at `TermId(1)`.
 *   - Predicate IDs are assigned by the caller and must match the catalog entries.
 *   - The catalog is the ONLY mapping from string labels to numeric IDs.
 *
 * ## Key caps (from crates/prolog8/src/types.rs)
 *
 *   - ARITY_CAP  = 8  (max predicate arity)
 *   - BODY_CAP   = 8  (max body atoms in a rule)
 *   - VAR_CAP    = 8  (max variables per rule)
 *
 * ## Rule8 JSON shape (as expected by wasm.rs)
 *
 * ```json
 * {
 *   "rule_id":       { "0": <uint32> },
 *   "head":          { "pred_id": <uint32>, "arity": <uint8>, "args": [<uint32>×8], "binding_mask": <uint8> },
 *   "body":          [ <8 Atom8 entries, padded with sentinel atoms> ],
 *   "body_len":      <uint8>,         // number of significant body atoms (≤ 8)
 *   "body_mask":     <uint8>,         // (1 << body_len) - 1
 *   "negation_mask": <uint8>,         // bit i = body[i] is negated
 *   "builtin_mask":  <uint8>,         // bit i = body[i] is a built-in
 *   "var_count":     <uint8>,         // number of distinct logical variables
 *   "var_live_mask": <uint8>,         // bit i = variable i appears in head
 *   "feature_mask":  <uint8>,         // FeatureBit bitmap (Facts=bit0, HornRules=bit1, ...)
 *   "proof_mask":    <uint8>,         // bit i = emit proof for body[i]
 *   "plan_id":       { "0": 0 }       // pre-compiled plan ref (0 = unplanned)
 * }
 * ```
 *
 * ## TermId encoding in rules
 *
 * In rules, argument slots use a DIFFERENT encoding than in facts:
 *   - `TermId(0)` = unbound variable (sentinel) — used for logical variables
 *   - `TermId(N)` for N ≥ 1 = a ground constant from the intern table
 *
 * For facts, ALL argument positions must be bound constants (TermId ≥ 1).
 *
 * ## Catalog JSON shape (as expected by wasm.rs / catalog.rs)
 *
 * ```json
 * {
 *   "catalog_id": <uint32>,
 *   "predicates": {
 *     "<pred_id_str>": {
 *       "pred_id": <uint32>,
 *       "label":   "<string>",
 *       "arity":   <uint8>,
 *       "proof_policy": "OnRequest",   // "Always" | "OnRequest" | "Never"
 *       "materialized": false,
 *       "access_orders": []
 *     }
 *   },
 *   "term_labels":       { "<term_id_str>": "<label_string>" },
 *   "predicate_by_label": { "<label_string>": <pred_id_uint32> },
 *   "term_by_label":     { "<label_string>": <term_id_uint32> }
 * }
 * ```
 */
import { z } from 'zod';
/** Maximum predicate arity (ARD FR-3). */
export declare const ARITY_CAP: 8;
/** Maximum atoms in a rule body (ARD FR-4). */
export declare const BODY_CAP: 8;
/** Maximum variables per rule (ARD FR-5). */
export declare const VAR_CAP: 8;
/** Sentinel TermId — represents an unbound variable slot. NEVER a real term. */
export declare const TERM_SENTINEL: 0;
/**
 * FeatureBit values (ARD section 5).
 * Bitmap over `feature_mask` in a Rule8.
 */
export declare const FeatureBit: {
    readonly Facts: 0;
    readonly HornRules: 1;
    readonly Equality: 2;
    readonly TypedComparisons: 3;
    readonly StratifiedNegation: 4;
    readonly BoundedRecursion: 5;
    readonly ControlledAggregates: 6;
    readonly ContractedForeign: 7;
};
/** Atom8 JSON shape as expected by the WASM boundary. */
export declare const Atom8JsonSchema: z.ZodObject<{
    pred_id: z.ZodNumber;
    arity: z.ZodNumber;
    /** Always exactly 8 elements; positions ≥ arity are TERM_SENTINEL (0). */
    args: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
    binding_mask: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    arity: number;
    pred_id: number;
    args: [number, number, number, number, number, number, number, number];
    binding_mask: number;
}, {
    arity: number;
    pred_id: number;
    args: [number, number, number, number, number, number, number, number];
    binding_mask: number;
}>;
export type Atom8Json = z.infer<typeof Atom8JsonSchema>;
/** Rule8 JSON shape as expected by the WASM boundary (`prolog8_query`). */
export declare const Rule8JsonSchema: z.ZodObject<{
    rule_id: z.ZodObject<{
        0: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        0: number;
    }, {
        0: number;
    }>;
    head: z.ZodObject<{
        pred_id: z.ZodNumber;
        arity: z.ZodNumber;
        /** Always exactly 8 elements; positions ≥ arity are TERM_SENTINEL (0). */
        args: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
        binding_mask: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        arity: number;
        pred_id: number;
        args: [number, number, number, number, number, number, number, number];
        binding_mask: number;
    }, {
        arity: number;
        pred_id: number;
        args: [number, number, number, number, number, number, number, number];
        binding_mask: number;
    }>;
    /** Always exactly 8 elements; elements ≥ body_len are sentinel atoms. */
    body: z.ZodTuple<[z.ZodObject<{
        pred_id: z.ZodNumber;
        arity: z.ZodNumber;
        /** Always exactly 8 elements; positions ≥ arity are TERM_SENTINEL (0). */
        args: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
        binding_mask: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        arity: number;
        pred_id: number;
        args: [number, number, number, number, number, number, number, number];
        binding_mask: number;
    }, {
        arity: number;
        pred_id: number;
        args: [number, number, number, number, number, number, number, number];
        binding_mask: number;
    }>, z.ZodObject<{
        pred_id: z.ZodNumber;
        arity: z.ZodNumber;
        /** Always exactly 8 elements; positions ≥ arity are TERM_SENTINEL (0). */
        args: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
        binding_mask: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        arity: number;
        pred_id: number;
        args: [number, number, number, number, number, number, number, number];
        binding_mask: number;
    }, {
        arity: number;
        pred_id: number;
        args: [number, number, number, number, number, number, number, number];
        binding_mask: number;
    }>, z.ZodObject<{
        pred_id: z.ZodNumber;
        arity: z.ZodNumber;
        /** Always exactly 8 elements; positions ≥ arity are TERM_SENTINEL (0). */
        args: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
        binding_mask: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        arity: number;
        pred_id: number;
        args: [number, number, number, number, number, number, number, number];
        binding_mask: number;
    }, {
        arity: number;
        pred_id: number;
        args: [number, number, number, number, number, number, number, number];
        binding_mask: number;
    }>, z.ZodObject<{
        pred_id: z.ZodNumber;
        arity: z.ZodNumber;
        /** Always exactly 8 elements; positions ≥ arity are TERM_SENTINEL (0). */
        args: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
        binding_mask: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        arity: number;
        pred_id: number;
        args: [number, number, number, number, number, number, number, number];
        binding_mask: number;
    }, {
        arity: number;
        pred_id: number;
        args: [number, number, number, number, number, number, number, number];
        binding_mask: number;
    }>, z.ZodObject<{
        pred_id: z.ZodNumber;
        arity: z.ZodNumber;
        /** Always exactly 8 elements; positions ≥ arity are TERM_SENTINEL (0). */
        args: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
        binding_mask: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        arity: number;
        pred_id: number;
        args: [number, number, number, number, number, number, number, number];
        binding_mask: number;
    }, {
        arity: number;
        pred_id: number;
        args: [number, number, number, number, number, number, number, number];
        binding_mask: number;
    }>, z.ZodObject<{
        pred_id: z.ZodNumber;
        arity: z.ZodNumber;
        /** Always exactly 8 elements; positions ≥ arity are TERM_SENTINEL (0). */
        args: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
        binding_mask: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        arity: number;
        pred_id: number;
        args: [number, number, number, number, number, number, number, number];
        binding_mask: number;
    }, {
        arity: number;
        pred_id: number;
        args: [number, number, number, number, number, number, number, number];
        binding_mask: number;
    }>, z.ZodObject<{
        pred_id: z.ZodNumber;
        arity: z.ZodNumber;
        /** Always exactly 8 elements; positions ≥ arity are TERM_SENTINEL (0). */
        args: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
        binding_mask: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        arity: number;
        pred_id: number;
        args: [number, number, number, number, number, number, number, number];
        binding_mask: number;
    }, {
        arity: number;
        pred_id: number;
        args: [number, number, number, number, number, number, number, number];
        binding_mask: number;
    }>, z.ZodObject<{
        pred_id: z.ZodNumber;
        arity: z.ZodNumber;
        /** Always exactly 8 elements; positions ≥ arity are TERM_SENTINEL (0). */
        args: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
        binding_mask: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        arity: number;
        pred_id: number;
        args: [number, number, number, number, number, number, number, number];
        binding_mask: number;
    }, {
        arity: number;
        pred_id: number;
        args: [number, number, number, number, number, number, number, number];
        binding_mask: number;
    }>], null>;
    body_len: z.ZodNumber;
    body_mask: z.ZodNumber;
    negation_mask: z.ZodNumber;
    builtin_mask: z.ZodNumber;
    var_count: z.ZodNumber;
    var_live_mask: z.ZodNumber;
    feature_mask: z.ZodNumber;
    proof_mask: z.ZodNumber;
    plan_id: z.ZodObject<{
        0: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        0: number;
    }, {
        0: number;
    }>;
}, "strip", z.ZodTypeAny, {
    plan_id: {
        0: number;
    };
    rule_id: {
        0: number;
    };
    head: {
        arity: number;
        pred_id: number;
        args: [number, number, number, number, number, number, number, number];
        binding_mask: number;
    };
    body: [{
        arity: number;
        pred_id: number;
        args: [number, number, number, number, number, number, number, number];
        binding_mask: number;
    }, {
        arity: number;
        pred_id: number;
        args: [number, number, number, number, number, number, number, number];
        binding_mask: number;
    }, {
        arity: number;
        pred_id: number;
        args: [number, number, number, number, number, number, number, number];
        binding_mask: number;
    }, {
        arity: number;
        pred_id: number;
        args: [number, number, number, number, number, number, number, number];
        binding_mask: number;
    }, {
        arity: number;
        pred_id: number;
        args: [number, number, number, number, number, number, number, number];
        binding_mask: number;
    }, {
        arity: number;
        pred_id: number;
        args: [number, number, number, number, number, number, number, number];
        binding_mask: number;
    }, {
        arity: number;
        pred_id: number;
        args: [number, number, number, number, number, number, number, number];
        binding_mask: number;
    }, {
        arity: number;
        pred_id: number;
        args: [number, number, number, number, number, number, number, number];
        binding_mask: number;
    }];
    body_len: number;
    body_mask: number;
    negation_mask: number;
    builtin_mask: number;
    var_count: number;
    var_live_mask: number;
    feature_mask: number;
    proof_mask: number;
}, {
    plan_id: {
        0: number;
    };
    rule_id: {
        0: number;
    };
    head: {
        arity: number;
        pred_id: number;
        args: [number, number, number, number, number, number, number, number];
        binding_mask: number;
    };
    body: [{
        arity: number;
        pred_id: number;
        args: [number, number, number, number, number, number, number, number];
        binding_mask: number;
    }, {
        arity: number;
        pred_id: number;
        args: [number, number, number, number, number, number, number, number];
        binding_mask: number;
    }, {
        arity: number;
        pred_id: number;
        args: [number, number, number, number, number, number, number, number];
        binding_mask: number;
    }, {
        arity: number;
        pred_id: number;
        args: [number, number, number, number, number, number, number, number];
        binding_mask: number;
    }, {
        arity: number;
        pred_id: number;
        args: [number, number, number, number, number, number, number, number];
        binding_mask: number;
    }, {
        arity: number;
        pred_id: number;
        args: [number, number, number, number, number, number, number, number];
        binding_mask: number;
    }, {
        arity: number;
        pred_id: number;
        args: [number, number, number, number, number, number, number, number];
        binding_mask: number;
    }, {
        arity: number;
        pred_id: number;
        args: [number, number, number, number, number, number, number, number];
        binding_mask: number;
    }];
    body_len: number;
    body_mask: number;
    negation_mask: number;
    builtin_mask: number;
    var_count: number;
    var_live_mask: number;
    feature_mask: number;
    proof_mask: number;
}>;
export type Rule8Json = z.infer<typeof Rule8JsonSchema>;
/** FactRow JSON shape. */
export declare const FactRowJsonSchema: z.ZodObject<{
    pred_id: z.ZodNumber;
    arity: z.ZodNumber;
    /** Exactly `arity` elements, all TermId ≥ 1 (constants). */
    args: z.ZodArray<z.ZodNumber, "many">;
    source_id: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    arity: number;
    pred_id: number;
    args: number[];
    source_id: number;
}, {
    arity: number;
    pred_id: number;
    args: number[];
    source_id: number;
}>;
export type FactRowJson = z.infer<typeof FactRowJsonSchema>;
/** FactBlock JSON shape for a single predicate. */
export declare const FactBlockJsonSchema: z.ZodObject<{
    pred_id: z.ZodNumber;
    arity: z.ZodNumber;
    rows: z.ZodArray<z.ZodObject<{
        pred_id: z.ZodNumber;
        arity: z.ZodNumber;
        /** Exactly `arity` elements, all TermId ≥ 1 (constants). */
        args: z.ZodArray<z.ZodNumber, "many">;
        source_id: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        arity: number;
        pred_id: number;
        args: number[];
        source_id: number;
    }, {
        arity: number;
        pred_id: number;
        args: number[];
        source_id: number;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    arity: number;
    pred_id: number;
    rows: {
        arity: number;
        pred_id: number;
        args: number[];
        source_id: number;
    }[];
}, {
    arity: number;
    pred_id: number;
    rows: {
        arity: number;
        pred_id: number;
        args: number[];
        source_id: number;
    }[];
}>;
export type FactBlockJson = z.infer<typeof FactBlockJsonSchema>;
/** Predicate descriptor for a Prolog8 catalog. */
export declare const PredicateDescriptorSchema: z.ZodObject<{
    label: z.ZodString;
    arity: z.ZodNumber;
    proofPolicy: z.ZodOptional<z.ZodEnum<["Always", "OnRequest", "Never"]>>;
}, "strip", z.ZodTypeAny, {
    arity: number;
    label: string;
    proofPolicy?: "Always" | "OnRequest" | "Never" | undefined;
}, {
    arity: number;
    label: string;
    proofPolicy?: "Always" | "OnRequest" | "Never" | undefined;
}>;
export type PredicateDescriptor = z.infer<typeof PredicateDescriptorSchema>;
/**
 * The intern table maps string labels to their assigned numeric TermIds.
 *
 * IDs are assigned deterministically starting at 1, in the order terms were
 * first seen by `internTerms()`. TermId 0 is reserved as sentinel.
 *
 * Note: Map<> is not directly representable in Zod; this interface is kept
 * as a TypeScript-only construct (runtime Maps, not serialised).
 */
export interface TermInternTable {
    /** term label → TermId (1-based, never 0) */
    termByLabel: Map<string, number>;
    /** TermId → term label (inverse lookup) */
    labelByTerm: Map<number, string>;
}
/** A compiled Prolog8 catalog ready to pass to `prolog8_query`. */
export declare const Prolog8CatalogSchema: z.ZodObject<{
    catalog_id: z.ZodNumber;
    predicates: z.ZodRecord<z.ZodString, z.ZodObject<{
        pred_id: z.ZodNumber;
        label: z.ZodString;
        arity: z.ZodNumber;
        proof_policy: z.ZodString;
        materialized: z.ZodBoolean;
        access_orders: z.ZodArray<z.ZodUnknown, "many">;
    }, "strip", z.ZodTypeAny, {
        arity: number;
        label: string;
        pred_id: number;
        proof_policy: string;
        materialized: boolean;
        access_orders: unknown[];
    }, {
        arity: number;
        label: string;
        pred_id: number;
        proof_policy: string;
        materialized: boolean;
        access_orders: unknown[];
    }>>;
    term_labels: z.ZodRecord<z.ZodString, z.ZodString>;
    predicate_by_label: z.ZodRecord<z.ZodString, z.ZodNumber>;
    term_by_label: z.ZodRecord<z.ZodString, z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    catalog_id: number;
    predicates: Record<string, {
        arity: number;
        label: string;
        pred_id: number;
        proof_policy: string;
        materialized: boolean;
        access_orders: unknown[];
    }>;
    term_labels: Record<string, string>;
    predicate_by_label: Record<string, number>;
    term_by_label: Record<string, number>;
}, {
    catalog_id: number;
    predicates: Record<string, {
        arity: number;
        label: string;
        pred_id: number;
        proof_policy: string;
        materialized: boolean;
        access_orders: unknown[];
    }>;
    term_labels: Record<string, string>;
    predicate_by_label: Record<string, number>;
    term_by_label: Record<string, number>;
}>;
export type Prolog8Catalog = z.infer<typeof Prolog8CatalogSchema>;
/**
 * Build a `TermInternTable` from an ordered list of term labels.
 *
 * Assignment is deterministic: terms are assigned IDs in the order they appear
 * in `terms`, starting at 1. Duplicate labels are deduplicated (same ID returned
 * for the same label, identical to Catalog::intern_term() in Rust).
 *
 * ```ts
 * const table = internTerms(['run-001', '1.0', 'seeded', 'bred', 'validated']);
 * table.termByLabel.get('run-001'); // 1
 * table.termByLabel.get('1.0');     // 2
 * ```
 */
export declare function internTerms(terms: string[]): TermInternTable;
/**
 * Build a Rule8Json for a ground **fact** (unit clause — body_len = 0).
 *
 * A fact has no body: `predicate(arg1, arg2, ...) :- .`
 * All argument positions must be ground constants (TermId ≥ 1).
 *
 * Example:
 * ```ts
 * const table = internTerms(['run-001']);
 * const fact = buildFact8(
 *   1,                                   // pred_id for "receipt" in catalog
 *   1,                                   // arity
 *   [table.termByLabel.get('run-001')!], // args: [1]
 *   1                                    // rule_id
 * );
 * ```
 *
 * NOTE: Facts are more efficiently expressed as `FactBlockJson` rows, which
 * the engine optimises via sorted block scans. `buildFact8` produces a Rule8
 * unit clause, which is valid but less efficient than a FactBlock. Use
 * `buildFactBlock` for bulk fact loading and `buildFact8` when you need a
 * fact in the `rules[]` array.
 *
 * @param predId    Predicate identifier (must exist in the catalog).
 * @param arity     Number of arguments.
 * @param args      Ground TermIds (must all be ≥ 1 — no sentinel/variable allowed).
 * @param ruleId    Unique rule identifier (must be distinct within a rule set).
 */
export declare function buildFact8(predId: number, arity: number, args: number[], ruleId?: number): Rule8Json;
/**
 * A single body atom specification for `buildRule8`.
 */
export declare const BodyAtomSpecSchema: z.ZodObject<{
    predId: z.ZodNumber;
    arity: z.ZodNumber;
    args: z.ZodArray<z.ZodNumber, "many">;
    bindingMask: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    arity: number;
    args: number[];
    predId: number;
    bindingMask?: number | undefined;
}, {
    arity: number;
    args: number[];
    predId: number;
    bindingMask?: number | undefined;
}>;
export type BodyAtomSpec = z.infer<typeof BodyAtomSpecSchema>;
/**
 * Build a Rule8Json for a Horn rule.
 *
 * A Horn rule has the form: `head :- body[0], body[1], ..., body[N-1].`
 *
 * The head typically uses sentinel (0) arguments for logical variables. The
 * engine unifies variables across head and body during proof search.
 *
 * Example — `admitted(X) :- receipt(X), conformance(X, "1.0")`:
 * ```ts
 * // Variable X = slot 0 (sentinel). "1.0" = TermId 2 (ground constant).
 * const rule = buildRule8(
 *   { predId: 2, arity: 1, args: [0] },           // head: admitted(X)
 *   [
 *     { predId: 1, arity: 1, args: [0] },          // body[0]: receipt(X)
 *     { predId: 3, arity: 2, args: [0, 2],         // body[1]: conformance(X, "1.0")
 *       bindingMask: 0b10 },                        //   position 1 is ground
 *   ],
 *   { varCount: 2, varLiveMask: 0b01, ruleId: 1 }
 * );
 * ```
 *
 * @param head       Head atom specification.
 * @param bodyAtoms  Body atom specifications (1–8 atoms).
 * @param opts       Rule metadata options.
 */
export declare function buildRule8(head: BodyAtomSpec, bodyAtoms: BodyAtomSpec[], opts?: {
    /** Unique rule ID. Default: 1. */
    ruleId?: number;
    /**
     * Number of distinct logical variables in head ∪ body.
     * Default: 0 (suitable only for ground rules / facts with no variables).
     * Incorrect values will cause admission errors.
     */
    varCount?: number;
    /**
     * Bit i = variable i appears in head (output position).
     * Default: 0 (no head outputs — query-only rule).
     */
    varLiveMask?: number;
    /**
     * Feature classes bitmap. Default includes Facts | HornRules (0b0011).
     * Add FeatureBit.StratifiedNegation if negation_mask is non-zero.
     */
    featureMask?: number;
    /** Bit i = body[i] is negated (requires FeatureBit.StratifiedNegation). */
    negationMask?: number;
    /** Bit i = body[i] is a built-in (requires FeatureBit.Equality or TypedComparisons). */
    builtinMask?: number;
    /** Bit i = emit proof for body[i]. Default: 0. */
    proofMask?: number;
}): Rule8Json;
/**
 * Build a `FactBlockJson` for a single predicate with multiple rows.
 *
 * This is the preferred way to load bulk facts — the engine sorts and indexes
 * blocks for efficient scan. Each row is a ground fact; all args must be TermId ≥ 1.
 *
 * @param predId  Predicate ID from the catalog.
 * @param arity   Arity of the predicate.
 * @param rows    Array of argument lists. Each inner array must have exactly `arity` elements.
 * @param sourceId Provenance source ID (default 0).
 */
export declare function buildFactBlock(predId: number, arity: number, rows: number[][], sourceId?: number): FactBlockJson;
/**
 * Build a complete `Prolog8Catalog` from predicate descriptors and a term intern table.
 *
 * The catalog is the entry point for every `prolog8_query` call. It maps string
 * labels to numeric IDs and provides proof-policy and arity metadata.
 *
 * @param catalogId   Unique catalog ID (arbitrary positive integer).
 * @param predicates  Array of predicate descriptors with their assigned pred_ids.
 * @param termTable   A TermInternTable built by `internTerms()`.
 */
export declare function buildCatalog(catalogId: number, predicates: Array<{
    predId: number;
} & PredicateDescriptor>, termTable: TermInternTable): Prolog8Catalog;
/**
 * Build a query atom for `prolog8_query`.
 *
 * @param predId      Predicate to query.
 * @param arity       Arity of the predicate.
 * @param args        Argument terms (TermId values). Use 0 for free (output) positions.
 * @param bindingMask Bit i = position i is bound (input). Default 0.
 * @param outputMask  Bit i = position i is requested as output. Default 0.
 * @param proofMode   Proof emission policy. Default 'PositiveOnly'.
 * @param epoch       Epoch ID (monotonic). Default 0.
 */
export declare function buildQueryAtom(predId: number, arity: number, args: number[], bindingMask?: number, outputMask?: number, proofMode?: 'PositiveOnly' | 'NegativeOnly' | 'Both' | 'Hashed', epoch?: number): {
    atom: Atom8Json;
    binding_mask: number;
    output_mask: number;
    proof_mode: string;
    epoch: number;
};
//# sourceMappingURL=prolog8-compiler.d.ts.map