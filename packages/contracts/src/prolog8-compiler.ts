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

// ── Constants ─────────────────────────────────────────────────────────────────

/** Maximum predicate arity (ARD FR-3). */
export const ARITY_CAP = 8 as const;

/** Maximum atoms in a rule body (ARD FR-4). */
export const BODY_CAP = 8 as const;

/** Maximum variables per rule (ARD FR-5). */
export const VAR_CAP = 8 as const;

/** Sentinel TermId — represents an unbound variable slot. NEVER a real term. */
export const TERM_SENTINEL = 0 as const;

/**
 * FeatureBit values (ARD section 5).
 * Bitmap over `feature_mask` in a Rule8.
 */
export const FeatureBit = {
  Facts: 0,
  HornRules: 1,
  Equality: 2,
  TypedComparisons: 3,
  StratifiedNegation: 4,
  BoundedRecursion: 5,
  ControlledAggregates: 6,
  ContractedForeign: 7,
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

/** Atom8 JSON shape as expected by the WASM boundary. */
export interface Atom8Json {
  pred_id: number;
  arity: number;
  /** Always exactly 8 elements; positions ≥ arity are TERM_SENTINEL (0). */
  args: [number, number, number, number, number, number, number, number];
  binding_mask: number;
}

/** Rule8 JSON shape as expected by the WASM boundary (`prolog8_query`). */
export interface Rule8Json {
  rule_id: { 0: number };
  head: Atom8Json;
  /** Always exactly 8 elements; elements ≥ body_len are sentinel atoms. */
  body: [Atom8Json, Atom8Json, Atom8Json, Atom8Json, Atom8Json, Atom8Json, Atom8Json, Atom8Json];
  body_len: number;
  body_mask: number;
  negation_mask: number;
  builtin_mask: number;
  var_count: number;
  var_live_mask: number;
  feature_mask: number;
  proof_mask: number;
  plan_id: { 0: number };
}

/** FactBlock JSON shape for a single predicate. */
export interface FactBlockJson {
  pred_id: number;
  arity: number;
  rows: FactRowJson[];
}

/** FactRow JSON shape. */
export interface FactRowJson {
  pred_id: number;
  arity: number;
  /** Exactly `arity` elements, all TermId ≥ 1 (constants). */
  args: number[];
  source_id: number;
}

/** Predicate descriptor for a Prolog8 catalog. */
export interface PredicateDescriptor {
  label: string;
  arity: number;
  proofPolicy?: 'Always' | 'OnRequest' | 'Never';
}

/**
 * The intern table maps string labels to their assigned numeric TermIds.
 *
 * IDs are assigned deterministically starting at 1, in the order terms were
 * first seen by `internTerms()`. TermId 0 is reserved as sentinel.
 */
export interface TermInternTable {
  /** term label → TermId (1-based, never 0) */
  termByLabel: Map<string, number>;
  /** TermId → term label (inverse lookup) */
  labelByTerm: Map<number, string>;
}

/** A compiled Prolog8 catalog ready to pass to `prolog8_query`. */
export interface Prolog8Catalog {
  catalog_id: number;
  predicates: Record<string, {
    pred_id: number;
    label: string;
    arity: number;
    proof_policy: string;
    materialized: boolean;
    access_orders: unknown[];
  }>;
  term_labels: Record<string, string>;
  predicate_by_label: Record<string, number>;
  term_by_label: Record<string, number>;
}

// ── Intern helpers ────────────────────────────────────────────────────────────

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
export function internTerms(terms: string[]): TermInternTable {
  const termByLabel = new Map<string, number>();
  const labelByTerm = new Map<number, string>();
  let nextId = 1; // TermId 0 is reserved as sentinel
  for (const label of terms) {
    if (!termByLabel.has(label)) {
      termByLabel.set(label, nextId);
      labelByTerm.set(nextId, label);
      nextId++;
    }
  }
  return { termByLabel, labelByTerm };
}

// ── Atom8 construction ────────────────────────────────────────────────────────

/**
 * Build a sentinel Atom8 (used to pad the body array of a Rule8 to 8 entries).
 *
 * A sentinel atom has arity=0, all args=0, and binding_mask=0. The pred_id is
 * set to 1 by convention (matching the pattern in the existing test suite).
 */
function sentinelAtom(): Atom8Json {
  return {
    pred_id: 1,
    arity: 0,
    args: [0, 0, 0, 0, 0, 0, 0, 0],
    binding_mask: 0,
  };
}

/**
 * Build an Atom8Json from a predicate ID, arity, argument TermIds, and binding mask.
 *
 * Argument slots beyond `arity` are padded with TERM_SENTINEL (0).
 *
 * @param predId    Predicate identifier from the catalog.
 * @param arity     Number of arguments (must be ≤ ARITY_CAP = 8).
 * @param args      Array of TermId values. TermId(0) = unbound variable.
 * @param bindingMask Bit i = position i is bound (ground constant). Default 0.
 */
function buildAtom8(
  predId: number,
  arity: number,
  args: number[],
  bindingMask = 0,
): Atom8Json {
  if (arity > ARITY_CAP) {
    throw new Error(
      `Arity ${arity} exceeds ARITY_CAP (${ARITY_CAP}). ` +
      'Prolog8 does not admit predicates with more than 8 arguments.'
    );
  }
  const padded: [number, number, number, number, number, number, number, number] =
    [0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < arity; i++) {
    padded[i] = args[i] ?? TERM_SENTINEL;
  }
  return { pred_id: predId, arity, args: padded, binding_mask: bindingMask };
}

// ── Public API ────────────────────────────────────────────────────────────────

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
export function buildFact8(
  predId: number,
  arity: number,
  args: number[],
  ruleId = 1,
): Rule8Json {
  // Validate: all args must be ground (non-sentinel) for a fact
  for (let i = 0; i < arity; i++) {
    const arg = args[i] ?? TERM_SENTINEL;
    if (arg === TERM_SENTINEL) {
      throw new Error(
        `Argument at position ${i} is sentinel (TermId 0) — facts must have all ground arguments. ` +
        'Use buildRule8() if you need variables.'
      );
    }
  }

  const head = buildAtom8(predId, arity, args, (1 << arity) - 1);
  const padding = sentinelAtom();
  const body: Rule8Json['body'] = [
    padding, padding, padding, padding,
    padding, padding, padding, padding,
  ];

  return {
    rule_id: { 0: ruleId },
    head,
    body,
    body_len: 0,
    body_mask: 0,         // (1 << 0) - 1 = 0 — no body
    negation_mask: 0,
    builtin_mask: 0,
    var_count: 0,
    var_live_mask: 0,
    feature_mask: 1 << FeatureBit.Facts,   // FeatureBit::Facts only
    proof_mask: 0,
    plan_id: { 0: 0 },
  };
}

/**
 * A single body atom specification for `buildRule8`.
 */
export interface BodyAtomSpec {
  /** Predicate ID from the catalog. */
  predId: number;
  /** Arity of this predicate. */
  arity: number;
  /**
   * Argument terms for this atom. Use TERM_SENTINEL (0) for unbound variable
   * positions; use a TermId ≥ 1 for ground/bound constants.
   */
  args: number[];
  /**
   * Bit mask for bound (ground) argument positions.
   * Bit i = 1 means args[i] is a ground constant from the intern table.
   * Bit i = 0 means args[i] is an unbound variable (sentinel).
   * Defaults to 0 (all positions unbound).
   */
  bindingMask?: number;
}

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
export function buildRule8(
  head: BodyAtomSpec,
  bodyAtoms: BodyAtomSpec[],
  opts: {
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
  } = {}
): Rule8Json {
  const bodyLen = bodyAtoms.length;
  if (bodyLen === 0) {
    // A rule with empty body is a unit clause (fact). Use buildFact8 for clarity,
    // but we handle it here too.
  }
  if (bodyLen > BODY_CAP) {
    throw new Error(
      `Rule body has ${bodyLen} atoms but BODY_CAP is ${BODY_CAP}. ` +
      'Prolog8 does not admit rules with more than 8 body atoms.'
    );
  }

  const headAtom = buildAtom8(head.predId, head.arity, head.args, head.bindingMask ?? 0);

  // Build body, padding to BODY_CAP with sentinel atoms
  const padding = sentinelAtom();
  const bodyFull: [Atom8Json, Atom8Json, Atom8Json, Atom8Json,
                   Atom8Json, Atom8Json, Atom8Json, Atom8Json] = [
    padding, padding, padding, padding,
    padding, padding, padding, padding,
  ];
  for (let i = 0; i < bodyLen; i++) {
    const ba = bodyAtoms[i];
    bodyFull[i] = buildAtom8(ba.predId, ba.arity, ba.args, ba.bindingMask ?? 0);
  }

  const bodyMask = bodyLen === 0 ? 0 : (1 << bodyLen) - 1;
  const negationMask = opts.negationMask ?? 0;
  const builtinMask = opts.builtinMask ?? 0;

  // Default feature mask: Facts (bit 0) | HornRules (bit 1)
  let featureMask = opts.featureMask ?? ((1 << FeatureBit.Facts) | (1 << FeatureBit.HornRules));
  // Auto-add StratifiedNegation if negation is used
  if (negationMask !== 0) {
    featureMask |= (1 << FeatureBit.StratifiedNegation);
  }

  return {
    rule_id: { 0: opts.ruleId ?? 1 },
    head: headAtom,
    body: bodyFull,
    body_len: bodyLen,
    body_mask: bodyMask,
    negation_mask: negationMask,
    builtin_mask: builtinMask,
    var_count: opts.varCount ?? 0,
    var_live_mask: opts.varLiveMask ?? 0,
    feature_mask: featureMask,
    proof_mask: opts.proofMask ?? 0,
    plan_id: { 0: 0 },
  };
}

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
export function buildFactBlock(
  predId: number,
  arity: number,
  rows: number[][],
  sourceId = 0,
): FactBlockJson {
  const factRows: FactRowJson[] = rows.map((args, rowIdx) => {
    if (args.length !== arity) {
      throw new Error(
        `Row ${rowIdx}: expected ${arity} args but got ${args.length}.`
      );
    }
    for (let i = 0; i < arity; i++) {
      if (args[i] === TERM_SENTINEL) {
        throw new Error(
          `Row ${rowIdx}, position ${i}: sentinel (TermId 0) is not allowed in fact blocks. ` +
          'All fact arguments must be ground constants.'
        );
      }
    }
    return { pred_id: predId, arity, args: [...args], source_id: sourceId };
  });
  return { pred_id: predId, arity, rows: factRows };
}

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
export function buildCatalog(
  catalogId: number,
  predicates: Array<{ predId: number } & PredicateDescriptor>,
  termTable: TermInternTable,
): Prolog8Catalog {
  const predicatesObj: Prolog8Catalog['predicates'] = {};
  const predicateByLabel: Record<string, number> = {};

  for (const p of predicates) {
    if (p.arity > ARITY_CAP) {
      throw new Error(
        `Predicate "${p.label}" has arity ${p.arity} which exceeds ARITY_CAP (${ARITY_CAP}).`
      );
    }
    predicatesObj[String(p.predId)] = {
      pred_id: p.predId,
      label: p.label,
      arity: p.arity,
      proof_policy: p.proofPolicy ?? 'OnRequest',
      materialized: false,
      access_orders: [],
    };
    predicateByLabel[p.label] = p.predId;
  }

  // Convert intern table to JSON-serialisable plain objects
  const termLabels: Record<string, string> = {};
  const termByLabel: Record<string, number> = {};
  for (const [termId, label] of termTable.labelByTerm) {
    termLabels[String(termId)] = label;
  }
  for (const [label, termId] of termTable.termByLabel) {
    termByLabel[label] = termId;
  }

  return {
    catalog_id: catalogId,
    predicates: predicatesObj,
    term_labels: termLabels,
    predicate_by_label: predicateByLabel,
    term_by_label: termByLabel,
  };
}

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
export function buildQueryAtom(
  predId: number,
  arity: number,
  args: number[],
  bindingMask = 0,
  outputMask = 0,
  proofMode: 'PositiveOnly' | 'NegativeOnly' | 'Both' | 'Hashed' = 'PositiveOnly',
  epoch = 0,
): {
  atom: Atom8Json;
  binding_mask: number;
  output_mask: number;
  proof_mode: string;
  epoch: number;
} {
  return {
    atom: buildAtom8(predId, arity, args, bindingMask),
    binding_mask: bindingMask,
    output_mask: outputMask,
    proof_mode: proofMode,
    epoch,
  };
}
