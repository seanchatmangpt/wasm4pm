//! WASM ABI — ARD section 13.
//!
//! Byte-buffer oriented surface. No source text accepted at the kernel
//! boundary; callers serialize `QueryAtom8` etc. via `serde_json::to_string`
//! and pass strings; on the Rust side we deserialize and run admission.
//!
//! ## Schema design
//!
//! The WASM boundary uses **friendlier input shapes** that differ slightly
//! from the internal kernel types:
//!
//! - `FactBlockInput`: only `pred_id`, `arity`, `rows` required; heavy
//!   metadata (`arg_order`, `block_hash`, etc.) is computed by `FactBlock8::new`.
//! - `FactRowInput`: only `pred_id`, `arity`, `args`, `source_id` required;
//!   `fact_hash` is recomputed automatically.
//! - `QueryInput`: `binding_mask` is a **top-level field on the query object**
//!   (not nested inside `atom`), matching the documented API surface.
//!
//! ## Answer cap
//!
//! `prolog8_query` caps returned answers at `MAX_ANSWERS` (128) to bound
//! WASM heap growth on large fact tables. Queries that match more than
//! `MAX_ANSWERS` facts return a `{ "TruncatedAnswers": [...] }` envelope
//! instead of `{ "Answered": [...] }`, signalling the caller that pagination
//! or a more selective binding mask is needed.

#![cfg(feature = "wasm")]

use crate::admission::RejectionCode;
use crate::catalog::Catalog;
use crate::kernel::Kernel;
use crate::types::{
    Atom8, EpochId, FactBlock8, FactRow8, PredicateId, ProofMode, QueryAtom8, SourceId, TermId,
};
use serde_json::json;
use wasm_bindgen::prelude::*;

const MAX_INPUT_LEN: usize = 10 * 1024 * 1024;

/// Maximum number of answers returned by `prolog8_query`.
///
/// Queries matching more rows than this cap return a `TruncatedAnswers`
/// envelope. Callers must narrow the `binding_mask` or paginate via `epoch`.
const MAX_ANSWERS: usize = 128;

fn js_err(message: &str) -> JsValue {
    JsValue::from_str(&serde_json::to_string(&json!({"error": message})).unwrap())
}

fn to_js_str<T: serde::Serialize>(v: &T) -> Result<JsValue, JsValue> {
    serde_json::to_string(v)
        .map(|s| JsValue::from_str(&s))
        .map_err(|e| js_err(&format!("serialize: {e}")))
}

/// Human-readable description for a `RejectionCode`.
fn rejection_message(code: RejectionCode) -> &'static str {
    match code {
        RejectionCode::ArityCapExceeded => "arity exceeds cap of 8",
        RejectionCode::RuleBodyCapExceeded => "rule body exceeds cap of 8 atoms",
        RejectionCode::VariableCapExceeded => "rule declares more than 8 variables",
        RejectionCode::ProofFanInExceeded => "proof node has more than 8 children",
        RejectionCode::StateSurfaceExceeded => "rule-family state surface exceeds 256",
        RejectionCode::StringQueryNotAdmitted => "string queries are not admitted (use interned IDs)",
        RejectionCode::RuntimeParseRejected => "runtime parsing is not admitted",
        RejectionCode::TextualMetaCallRejected => "textual meta-calls are not admitted",
        RejectionCode::UninternedTerm => "bound argument refers to an uninterned term (TermId 0 is sentinel)",
        RejectionCode::OperatorDeclarationRejected => "operator declarations are not admitted",
        RejectionCode::UnstratifiedNegation => "negation is not stratified",
        RejectionCode::UnboundedRecursion => "recursion must be bounded or declared",
        RejectionCode::NonIndexableBuiltin => "built-in predicate is not indexable",
        RejectionCode::DynamicMutationNotAdmitted => "assert/retract (dynamic mutation) is not admitted",
        RejectionCode::CutNotAdmitted => "cut (!) is not admitted",
        RejectionCode::ForeignContractMissing => "foreign predicate has no replay contract",
        RejectionCode::NondeterministicForeignCall => "foreign predicate is non-deterministic",
        RejectionCode::SideEffectInKernel => "side-effects inside the kernel boundary are not admitted",
        RejectionCode::ReplayContractMissing => "replay contract is missing",
        RejectionCode::PredicateNotInCatalog => "predicate id is not registered in the catalog",
        RejectionCode::ArityMismatch => "atom arity does not match catalog metadata",
        RejectionCode::BindingMaskOutOfRange => "binding_mask references bit positions beyond the atom arity",
        RejectionCode::PaddingNotSentinel => "argument slots beyond arity must be sentinel (TermId 0)",
        RejectionCode::BodyMaskMismatch => "body_mask must equal (1 << body_len) - 1",
        RejectionCode::NegationMaskOutOfRange => "negation_mask references positions beyond body_len",
        RejectionCode::BuiltinMaskOutOfRange => "builtin_mask references positions beyond body_len",
        RejectionCode::ProofMaskOutOfRange => "proof_mask references positions beyond body_len",
        RejectionCode::FeatureBitNotAdmitted => "feature_mask contains a reserved or unrecognised bit",
        RejectionCode::NegationRequiresFeature => "negation_mask is set but FeatureBit::StratifiedNegation is not in feature_mask",
        RejectionCode::BuiltinRequiresFeature => "builtin_mask is set but FeatureBit::Equality or TypedComparisons is not in feature_mask",
    }
}

// -- Friendly WASM-boundary input types ---------------------------------------

/// Simplified fact-row input. The `fact_hash` is recomputed automatically.
#[derive(serde::Deserialize)]
struct FactRowInput {
    pred_id: u32,
    arity: u8,
    /// Term IDs in catalog order (positions 0..arity-1).
    args: Vec<u32>,
    #[serde(default)]
    source_id: u32,
}

impl FactRowInput {
    fn into_fact_row(self) -> FactRow8 {
        let pid = PredicateId(self.pred_id);
        let args: Vec<TermId> = self.args.iter().map(|&v| TermId(v)).collect();
        FactRow8::new(pid, self.arity, &args, SourceId(self.source_id))
    }
}

/// Simplified fact-block input. Heavy metadata is computed by `FactBlock8::new`.
///
/// Only `pred_id`, `arity`, and `rows` are required:
/// ```json
/// { "pred_id": 1, "arity": 2, "rows": [...] }
/// ```
#[derive(serde::Deserialize)]
struct FactBlockInput {
    pred_id: u32,
    arity: u8,
    #[serde(default)]
    rows: Vec<FactRowInput>,
}

impl FactBlockInput {
    fn into_fact_block(self) -> FactBlock8 {
        let pid = PredicateId(self.pred_id);
        let rows: Vec<FactRow8> = self.rows.into_iter().map(|r| r.into_fact_row()).collect();
        FactBlock8::new(pid, self.arity, rows)
    }
}

/// Simplified atom input for the WASM boundary. `binding_mask` defaults to 0
/// (all positions unbound).
#[derive(serde::Deserialize)]
struct AtomInput {
    pred_id: u32,
    arity: u8,
    #[serde(default)]
    args: Vec<u32>,
    #[serde(default)]
    binding_mask: u8,
}

impl AtomInput {
    fn into_atom(self) -> Atom8 {
        let pid = PredicateId(self.pred_id);
        let args: Vec<TermId> = self.args.iter().map(|&v| TermId(v)).collect();
        let mut atom = Atom8::new(pid, self.arity, &args);
        atom.binding_mask = self.binding_mask;
        atom
    }
}

/// Query input with `binding_mask` lifted to the top level (for ergonomic JSON).
///
/// Accepted shape:
/// ```json
/// {
///   "atom":         { "pred_id": 1, "arity": 2, "args": [1, 2] },
///   "binding_mask": 3,
///   "output_mask":  0,
///   "proof_mode":   "PositiveOnly",
///   "epoch":        0
/// }
/// ```
///
/// `binding_mask` is merged into `atom.binding_mask` before the query is
/// dispatched to the kernel. This matches the documented API contract in
/// `WASM_API.md`.
#[derive(serde::Deserialize)]
struct QueryInput {
    atom: AtomInput,
    /// Bit i set means position i is bound (used for matching). Defaults to 0.
    #[serde(default)]
    binding_mask: u8,
    /// Bit i set means position i is requested as output. Defaults to 0.
    #[serde(default)]
    output_mask: u8,
    #[serde(default = "default_proof_mode")]
    proof_mode: ProofMode,
    #[serde(default)]
    epoch: u64,
}

fn default_proof_mode() -> ProofMode {
    ProofMode::PositiveOnly
}

impl QueryInput {
    fn into_query_atom(mut self) -> QueryAtom8 {
        // Top-level binding_mask overrides any binding_mask inside the atom.
        self.atom.binding_mask = self.binding_mask;
        QueryAtom8 {
            atom: self.atom.into_atom(),
            output_mask: self.output_mask,
            proof_mode: self.proof_mode,
            epoch: EpochId(self.epoch),
        }
    }
}

// -- Public WASM exports ------------------------------------------------------

/// Capability report.
///
/// Returns a JSON object describing the engine name, version, and byte caps:
/// ```json
/// { "engine": "prolog8", "version": "0.1.0",
///   "caps": { "arity": 8, "body": 8, "vars": 8, "binding_patterns": 256,
///             "max_answers": 128 } }
/// ```
#[wasm_bindgen]
pub fn prolog8_show() -> Result<JsValue, JsValue> {
    to_js_str(&json!({
        "engine": crate::ENGINE_NAME,
        "version": crate::ENGINE_VERSION,
        "caps": {
            "arity": crate::ARITY_CAP,
            "body": crate::BODY_CAP,
            "vars": crate::VAR_CAP,
            "binding_patterns": crate::BINDING_PATTERNS,
            "max_answers": MAX_ANSWERS,
        }
    }))
}

/// Evaluate a query.
///
/// ## Input JSON shape
///
/// ```json
/// {
///   "catalog": {
///     "catalog_id": 1,
///     "predicates": { "1": { "pred_id": 1, "label": "parent", "arity": 2,
///                            "proof_policy": "OnRequest", "materialized": false,
///                            "access_orders": [] } },
///     "term_labels": { "1": "alice", "2": "bob" },
///     "predicate_by_label": { "parent": 1 },
///     "term_by_label": { "alice": 1, "bob": 2 }
///   },
///   "facts": [
///     { "pred_id": 1, "arity": 2,
///       "rows": [ { "pred_id": 1, "arity": 2, "args": [1, 2], "source_id": 0 } ] }
///   ],
///   "rules": [],
///   "query": {
///     "atom":         { "pred_id": 1, "arity": 2, "args": [1, 2] },
///     "binding_mask": 3,
///     "proof_mode":   "PositiveOnly",
///     "epoch":        0
///   }
/// }
/// ```
///
/// `binding_mask` is a **top-level field on the `query` object** (not nested
/// inside `atom`). Term IDs in `args` are 1-based (TermId 0 is sentinel).
///
/// ## Output variants
///
/// - `{ "Answered": [...] }` — one or more Allow decisions
/// - `{ "TruncatedAnswers": [...] }` — more than `max_answers` (128) matched
/// - `{ "Denied": { ... } }` — query denied (negative proof)
/// - `{ "Invalid": "reason string" }` — admission rejected
#[wasm_bindgen]
pub fn prolog8_query(input_json: &str) -> Result<JsValue, JsValue> {
    if input_json.len() > MAX_INPUT_LEN {
        return Err(js_err(&format!(
            "input exceeds {MAX_INPUT_LEN} bytes (got {})",
            input_json.len()
        )));
    }

    #[derive(serde::Deserialize)]
    struct Input {
        catalog: Catalog,
        #[serde(default)]
        facts: Vec<FactBlockInput>,
        #[serde(default)]
        rules: Vec<crate::types::Rule8>,
        query: QueryInput,
    }

    let parsed: Input =
        serde_json::from_str(input_json).map_err(|e| js_err(&format!("schema rejected: {e}")))?;

    let mut kernel = Kernel::new(parsed.catalog);
    for block in parsed.facts {
        kernel
            .load_facts(block.into_fact_block())
            .map_err(|c| js_err(&format!("fact admission rejected: {}", rejection_message(c))))?;
    }
    for rule in parsed.rules {
        kernel
            .load_rule(rule)
            .map_err(|c| js_err(&format!("rule admission rejected: {}", rejection_message(c))))?;
    }

    let query = parsed.query.into_query_atom();
    match kernel.query(&query) {
        crate::kernel::QueryResult::Answered(mut answers) => {
            if answers.len() > MAX_ANSWERS {
                answers.truncate(MAX_ANSWERS);
                to_js_str(&json!({ "TruncatedAnswers": answers }))
            } else {
                to_js_str(&json!({ "Answered": answers }))
            }
        }
        other => to_js_str(&other),
    }
}

/// Replay a receipt — verify that a previously issued receipt is still valid
/// against the same kernel state.
///
/// Input shape is identical to `prolog8_query` plus a `receipt` field
/// containing the receipt from a prior `prolog8_query` call.
///
/// ## Output variants
///
/// - `"Verified"` — receipt intact, proof replays correctly
/// - `"ReceiptInvalid"` — receipt_hash tampering detected
/// - `"Mismatch"` — proof root tampering detected
/// - `"VersionIncompatible"` — engine version mismatch
/// - `"MissingArtifact"` — required fact or rule is absent
#[wasm_bindgen]
pub fn prolog8_replay(input_json: &str) -> Result<JsValue, JsValue> {
    if input_json.len() > MAX_INPUT_LEN {
        return Err(js_err("input exceeds 10MiB"));
    }

    #[derive(serde::Deserialize)]
    struct Input {
        catalog: Catalog,
        #[serde(default)]
        facts: Vec<FactBlockInput>,
        #[serde(default)]
        rules: Vec<crate::types::Rule8>,
        query: QueryInput,
        receipt: crate::types::Receipt,
    }

    let parsed: Input =
        serde_json::from_str(input_json).map_err(|e| js_err(&format!("schema rejected: {e}")))?;

    let mut kernel = Kernel::new(parsed.catalog);
    for block in parsed.facts {
        kernel
            .load_facts(block.into_fact_block())
            .map_err(|c: RejectionCode| {
                js_err(&format!("fact admission rejected: {}", rejection_message(c)))
            })?;
    }
    for rule in parsed.rules {
        kernel
            .load_rule(rule)
            .map_err(|c: RejectionCode| {
                js_err(&format!("rule admission rejected: {}", rejection_message(c)))
            })?;
    }

    let query = parsed.query.into_query_atom();
    let status = crate::replay::replay(&kernel, &query, &parsed.receipt);
    to_js_str(&status)
}
