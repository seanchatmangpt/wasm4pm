//! `prolog_query` — thin JSON wrapper over `prolog8`'s real `Kernel`.
//!
//! `prolog8`'s hot-tier types (`Catalog`, `Rule8`, `QueryAtom8`, `FactBlock8`,
//! `QueryResult`, …) already derive `Serialize`/`Deserialize` (verified by
//! reading `crates/prolog8/src/{catalog,types,kernel}.rs` directly — the
//! `phase2.rs` deferral note claiming otherwise is stale). What they do NOT
//! have is an ergonomic JSON surface: predicates must be registered in a
//! `Catalog` before any fact/rule/query is admitted, terms are opaque
//! `TermId`s that must be interned from string labels, and within a rule a
//! variable's identity is its *argument position* — but not necessarily the
//! same position across every atom it appears in. Prolog8 supports this via
//! `TermId`s in the high half of `u32` space (`0x8000_0000 + slot`, see
//! `kernel.rs`'s private `VAR_SENTINEL_BASE`/`var_term`/`var_index`): any
//! non-sentinel `TermId` whose value falls in that range is treated as
//! variable `slot` by `unify_terms`/`resolve_var`, *regardless of which
//! argument position it occupies in which atom*. This module re-derives that
//! same encoding externally (it is a public, constructible `TermId(pub u32)`
//! newtype, so no private kernel API needs to be reached into) and assigns
//! each distinct variable *name* in a rule (e.g. `"X"`) one global slot
//! shared across the rule's head and every body atom — which is what makes
//! `grandparent(X,Z) :- parent(X,Y), parent(Y,Z)` actually join on `Y`
//! instead of accidentally using position-local variables that never unify.
//!
//! Minimal slice, by design: unary/binary (in practice ≤ `ARITY_CAP` = 8)
//! predicates, ground facts as `(pred, args)` tuples, one rule as a
//! premise-list + conclusion (no negation, no built-ins, no recursion depth
//! beyond what the kernel itself already bounds), one query per request.
//! Term syntax: a bare string beginning with an ASCII uppercase letter is a
//! variable; anything else is a constant label, interned into the catalog.

use prolog8::admission::RejectionCode;
use prolog8::catalog::{Catalog, PredicateMeta, PredicateProofPolicy};
use prolog8::kernel::{Kernel, QueryResult};
use prolog8::types::{
    Atom8, CatalogId, EpochId, FactBlock8, FactRow8, FeatureBit, PredicateId, ProofMode,
    QueryAtom8, Rule8, RuleId, SourceId, TermId, ARITY_CAP, VAR_CAP,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Mirrors `prolog8::kernel`'s private `VAR_SENTINEL_BASE`. Any `TermId`
/// with a value in `[VAR_SENTINEL_BASE, VAR_SENTINEL_BASE + ARITY_CAP)` is
/// treated by the real kernel as a variable at slot `value - VAR_SENTINEL_BASE`,
/// independent of its argument position. Duplicated here (not `pub` in
/// `prolog8`) rather than reached into privately.
const VAR_SENTINEL_BASE: u32 = 0x8000_0000;

fn var_term(slot: u8) -> TermId {
    TermId(VAR_SENTINEL_BASE + slot as u32)
}

// ---------------------------------------------------------------------------
// Request DTOs — plain, hand-written, converted into real prolog8 types.
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct PredicateDecl {
    name: String,
    arity: u8,
}

#[derive(Debug, Deserialize)]
struct FactDecl {
    pred: String,
    args: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct AtomDecl {
    pred: String,
    args: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct RuleDecl {
    head: AtomDecl,
    body: Vec<AtomDecl>,
}

#[derive(Debug, Deserialize)]
struct PrologRequest {
    /// Predicate catalog: every predicate used by facts/rules/query must be
    /// declared here first.
    predicates: Vec<PredicateDecl>,
    #[serde(default)]
    facts: Vec<FactDecl>,
    #[serde(default)]
    rules: Vec<RuleDecl>,
    query: AtomDecl,
    /// Emit proof nodes on the response. Default `false` (bindings only).
    #[serde(default)]
    with_proof: bool,
}

// ---------------------------------------------------------------------------
// Response DTOs.
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
struct ProofNodeOut {
    kind: String,
    pred: Option<String>,
    fact_hash: Option<String>,
    rule_index: Option<u32>,
}

#[derive(Debug, Serialize)]
struct DecisionOut {
    kind: String,
    /// Output-variable name -> resolved constant label, in query-argument order.
    bindings: HashMap<String, String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    proof: Vec<ProofNodeOut>,
    receipt_hash: String,
}

#[derive(Debug, Serialize)]
struct PrologResponse {
    result: String, // "answered" | "denied" | "invalid"
    #[serde(skip_serializing_if = "Vec::is_empty")]
    answers: Vec<DecisionOut>,
    #[serde(skip_serializing_if = "Option::is_none")]
    denied: Option<DecisionOut>,
    #[serde(skip_serializing_if = "Option::is_none")]
    rejection: Option<String>,
}

// ---------------------------------------------------------------------------
// Conversion: request DTOs -> real prolog8 types.
// ---------------------------------------------------------------------------

/// True if `s` is a variable reference (bare identifier starting uppercase).
fn is_var(s: &str) -> bool {
    s.chars().next().is_some_and(|c| c.is_ascii_uppercase())
}

struct Builder {
    catalog: Catalog,
    pred_ids: HashMap<String, PredicateId>,
}

impl Builder {
    fn new(predicates: &[PredicateDecl]) -> Result<Self, String> {
        let mut catalog = Catalog::new(CatalogId(1));
        let mut pred_ids = HashMap::new();
        for (i, p) in predicates.iter().enumerate() {
            if p.arity > ARITY_CAP {
                return Err(format!(
                    "predicate '{}' arity {} exceeds ARITY_CAP {}",
                    p.name, p.arity, ARITY_CAP
                ));
            }
            let pred_id = PredicateId((i + 1) as u32);
            catalog.add_predicate(PredicateMeta {
                pred_id,
                label: p.name.clone(),
                arity: p.arity,
                access_orders: Vec::new(),
                proof_policy: PredicateProofPolicy::OnRequest,
                materialized: false,
            });
            pred_ids.insert(p.name.clone(), pred_id);
        }
        Ok(Self { catalog, pred_ids })
    }

    fn pred_id(&self, name: &str) -> Result<(PredicateId, u8), String> {
        let id = self
            .pred_ids
            .get(name)
            .copied()
            .ok_or_else(|| format!("predicate '{name}' not declared in `predicates`"))?;
        let arity = self.catalog.predicate(id).expect("just registered").arity;
        Ok((id, arity))
    }

    /// Build a ground fact atom: every arg must be a constant.
    fn build_fact_row(&mut self, decl: &FactDecl) -> Result<FactRow8, String> {
        let (pred_id, arity) = self.pred_id(&decl.pred)?;
        if decl.args.len() != arity as usize {
            return Err(format!(
                "fact for '{}' has {} args, predicate arity is {}",
                decl.pred,
                decl.args.len(),
                arity
            ));
        }
        let mut args = Vec::with_capacity(arity as usize);
        for a in &decl.args {
            if is_var(a) {
                return Err(format!(
                    "fact for '{}' has variable arg '{}' — facts must be ground",
                    decl.pred, a
                ));
            }
            args.push(self.catalog.intern_term(a.clone()));
        }
        Ok(FactRow8::new(pred_id, arity, &args, SourceId(0)))
    }

    /// Build a rule-body/head atom using a shared per-rule variable-name -> slot map.
    fn build_rule_atom(
        &mut self,
        decl: &AtomDecl,
        var_slots: &mut HashMap<String, u8>,
    ) -> Result<Atom8, String> {
        let (pred_id, arity) = self.pred_id(&decl.pred)?;
        if decl.args.len() != arity as usize {
            return Err(format!(
                "atom for '{}' has {} args, predicate arity is {}",
                decl.pred,
                decl.args.len(),
                arity
            ));
        }
        let mut args = Vec::with_capacity(arity as usize);
        for a in &decl.args {
            if is_var(a) {
                let next = var_slots.len() as u8;
                let slot = *var_slots.entry(a.clone()).or_insert(next);
                if slot >= VAR_CAP {
                    return Err(format!(
                        "rule uses more than VAR_CAP ({VAR_CAP}) distinct variables"
                    ));
                }
                args.push(var_term(slot));
            } else {
                args.push(self.catalog.intern_term(a.clone()));
            }
        }
        Ok(Atom8::new(pred_id, arity, &args))
    }

    fn build_rule(&mut self, rule_id: u32, decl: &RuleDecl) -> Result<Rule8, String> {
        if decl.body.len() > prolog8::types::BODY_CAP as usize {
            return Err(format!(
                "rule body has {} atoms, BODY_CAP is {}",
                decl.body.len(),
                prolog8::types::BODY_CAP
            ));
        }
        let mut var_slots: HashMap<String, u8> = HashMap::new();
        let head = self.build_rule_atom(&decl.head, &mut var_slots)?;

        let mut body = [Atom8::new(PredicateId(0), 0, &[]); prolog8::types::BODY_CAP as usize];
        for (i, b) in decl.body.iter().enumerate() {
            body[i] = self.build_rule_atom(b, &mut var_slots)?;
        }
        let body_len = decl.body.len() as u8;
        let body_mask: u8 = if body_len == 8 {
            0xFF
        } else {
            ((1u16 << body_len) as u8).wrapping_sub(1)
        };

        let mut var_live_mask: u8 = 0;
        for i in 0..head.arity {
            if let Some(slot) = var_slot_of(head.args[i as usize]) {
                var_live_mask |= 1u8 << slot;
            }
        }

        Ok(Rule8 {
            rule_id: RuleId(rule_id),
            head,
            body,
            body_len,
            body_mask,
            negation_mask: 0,
            builtin_mask: 0,
            var_count: var_slots.len() as u8,
            var_live_mask,
            feature_mask: FeatureBit::Facts.mask() | FeatureBit::HornRules.mask(),
            proof_mask: 0,
            plan_id: Default::default(),
        })
    }

    /// Build the query atom. Uppercase args are unbound outputs (sentinel,
    /// bit clear in `output_mask`/`binding_mask`); everything else is an
    /// interned constant, bound. Returns the atom plus the list of
    /// output-variable names in ascending argument-position order (the same
    /// order `Kernel::query`'s `Decision::bindings` are emitted in).
    fn build_query(&mut self, decl: &AtomDecl) -> Result<(QueryAtom8, Vec<String>), String> {
        let (pred_id, arity) = self.pred_id(&decl.pred)?;
        if decl.args.len() != arity as usize {
            return Err(format!(
                "query for '{}' has {} args, predicate arity is {}",
                decl.pred,
                decl.args.len(),
                arity
            ));
        }
        let mut args = Vec::with_capacity(arity as usize);
        let mut binding_mask: u8 = 0;
        let mut output_mask: u8 = 0;
        let mut output_names = Vec::new();
        for (i, a) in decl.args.iter().enumerate() {
            if is_var(a) {
                args.push(TermId::sentinel());
                output_mask |= 1u8 << i;
                output_names.push(a.clone());
            } else {
                args.push(self.catalog.intern_term(a.clone()));
                binding_mask |= 1u8 << i;
            }
        }
        let mut atom = Atom8::new(pred_id, arity, &args);
        atom.binding_mask = binding_mask;
        Ok((
            QueryAtom8 {
                atom,
                output_mask,
                proof_mode: ProofMode::Both,
                epoch: EpochId(0),
            },
            output_names,
        ))
    }
}

fn var_slot_of(t: TermId) -> Option<u8> {
    if t.0 >= VAR_SENTINEL_BASE && t.0 < VAR_SENTINEL_BASE + ARITY_CAP as u32 {
        Some((t.0 - VAR_SENTINEL_BASE) as u8)
    } else {
        None
    }
}

// ---------------------------------------------------------------------------
// Response rendering: real TermId -> catalog label, real Decision -> DTO.
// ---------------------------------------------------------------------------

fn render_decision(
    catalog: &Catalog,
    decision: &prolog8::kernel::Decision,
    output_names: &[String],
) -> DecisionOut {
    let mut bindings = HashMap::new();
    for (name, term) in output_names.iter().zip(decision.bindings.iter()) {
        let label = catalog
            .term_label(*term)
            .map(str::to_string)
            .unwrap_or_else(|| format!("<term:{}>", term.as_u32()));
        bindings.insert(name.clone(), label);
    }
    let proof = decision
        .proof
        .iter()
        .map(|n| ProofNodeOut {
            kind: format!("{:?}", n.kind),
            pred: catalog.predicate(n.pred_id).map(|m| m.label.clone()),
            fact_hash: n.fact_hash.map(|h| hex_encode(&h)),
            rule_index: n.rule_id.map(|r| r.0),
        })
        .collect();
    DecisionOut {
        kind: format!("{:?}", decision.kind),
        bindings,
        proof,
        receipt_hash: hex_encode(&decision.receipt.receipt_hash),
    }
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

// ---------------------------------------------------------------------------
// Entry point.
// ---------------------------------------------------------------------------

/// Run one end-to-end prolog8 query from a JSON request. Follows the
/// `phase2.rs` convention: parse request, call the real implementation
/// (here: build `Catalog`/`FactBlock8`s/`Rule8`s/`QueryAtom8` and call the
/// real `Kernel::query`), serialize the real result. No mock/stand-in
/// kernel — every fact, rule, and the query itself is admitted by
/// `prolog8`'s real admission law before the real solver runs.
pub fn prolog_query(request_json: &str) -> String {
    let req: PrologRequest = match serde_json::from_str(request_json) {
        Ok(r) => r,
        Err(e) => return crate::error_response(&format!("invalid prolog_query request: {e}")),
    };

    let mut builder = match Builder::new(&req.predicates) {
        Ok(b) => b,
        Err(e) => return crate::error_response(&e),
    };

    // Group facts by predicate into one FactBlock8 per predicate (kernel
    // admits per-block, and a block must be homogeneous in predicate+arity).
    let mut rows_by_pred: HashMap<PredicateId, (u8, Vec<FactRow8>)> = HashMap::new();
    for f in &req.facts {
        let row = match builder.build_fact_row(f) {
            Ok(r) => r,
            Err(e) => return crate::error_response(&e),
        };
        rows_by_pred
            .entry(row.pred_id)
            .or_insert_with(|| (row.arity, Vec::new()))
            .1
            .push(row);
    }

    let rules: Vec<Rule8> = {
        let mut out = Vec::with_capacity(req.rules.len());
        for (i, r) in req.rules.iter().enumerate() {
            match builder.build_rule((i + 1) as u32, r) {
                Ok(rule) => out.push(rule),
                Err(e) => return crate::error_response(&e),
            }
        }
        out
    };

    let (query_atom, output_names) = match builder.build_query(&req.query) {
        Ok(q) => q,
        Err(e) => return crate::error_response(&e),
    };

    let mut kernel = Kernel::new(builder.catalog);

    for (pred_id, (arity, rows)) in rows_by_pred {
        let block = FactBlock8::new(pred_id, arity, rows);
        if let Err(code) = kernel.load_facts(block) {
            return crate::error_response(&format!("fact load rejected: {}", rejection_str(code)));
        }
    }

    for rule in rules {
        if let Err(code) = kernel.load_rule(rule) {
            return crate::error_response(&format!("rule load rejected: {}", rejection_str(code)));
        }
    }

    let result = kernel.query(&query_atom);

    let response = match result {
        QueryResult::Answered(decisions) => PrologResponse {
            result: "answered".to_string(),
            answers: decisions
                .iter()
                .map(|d| render_decision(&kernel.catalog, d, &output_names))
                .collect(),
            denied: None,
            rejection: None,
        },
        QueryResult::Denied(decision) => PrologResponse {
            result: "denied".to_string(),
            answers: Vec::new(),
            denied: Some(render_decision(&kernel.catalog, &decision, &output_names)),
            rejection: None,
        },
        QueryResult::Invalid(code) => PrologResponse {
            result: "invalid".to_string(),
            answers: Vec::new(),
            denied: None,
            rejection: Some(rejection_str(code).to_string()),
        },
    };

    crate::respond(&response)
}

fn rejection_str(code: RejectionCode) -> &'static str {
    // RejectionCode has a `Display`-free enum; render via the variant name.
    match code {
        RejectionCode::ArityCapExceeded => "ArityCapExceeded",
        RejectionCode::RuleBodyCapExceeded => "RuleBodyCapExceeded",
        RejectionCode::VariableCapExceeded => "VariableCapExceeded",
        RejectionCode::ProofFanInExceeded => "ProofFanInExceeded",
        RejectionCode::StateSurfaceExceeded => "StateSurfaceExceeded",
        RejectionCode::StringQueryNotAdmitted => "StringQueryNotAdmitted",
        RejectionCode::RuntimeParseRejected => "RuntimeParseRejected",
        RejectionCode::TextualMetaCallRejected => "TextualMetaCallRejected",
        RejectionCode::UninternedTerm => "UninternedTerm",
        RejectionCode::OperatorDeclarationRejected => "OperatorDeclarationRejected",
        RejectionCode::UnstratifiedNegation => "UnstratifiedNegation",
        RejectionCode::UnboundedRecursion => "UnboundedRecursion",
        RejectionCode::NonIndexableBuiltin => "NonIndexableBuiltin",
        RejectionCode::DynamicMutationNotAdmitted => "DynamicMutationNotAdmitted",
        RejectionCode::CutNotAdmitted => "CutNotAdmitted",
        RejectionCode::ForeignContractMissing => "ForeignContractMissing",
        RejectionCode::NondeterministicForeignCall => "NondeterministicForeignCall",
        RejectionCode::SideEffectInKernel => "SideEffectInKernel",
        RejectionCode::ReplayContractMissing => "ReplayContractMissing",
        RejectionCode::PredicateNotInCatalog => "PredicateNotInCatalog",
        RejectionCode::ArityMismatch => "ArityMismatch",
        RejectionCode::BindingMaskOutOfRange => "BindingMaskOutOfRange",
        RejectionCode::PaddingNotSentinel => "PaddingNotSentinel",
        _ => "Rejected",
    }
}

/// # Safety
/// See `crate`'s module-level ABI contract (`read_input`/`write_output`).
#[unsafe(export_name = "wasm4pm_ex4pm_prolog_query_v1")]
pub unsafe extern "C" fn prolog_query_v1(
    ptr: *const u8,
    len: usize,
    out_len: *mut usize,
) -> *mut u8 {
    let input = unsafe { crate::read_input(ptr, len) };
    crate::write_output(prolog_query(&input), out_len)
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_prolog_query_replay_v1")]
pub unsafe extern "C" fn prolog_query_replay_v1(ptr: *const u8, len: usize) -> u32 {
    let input = unsafe { crate::read_input(ptr, len) };
    crate::replay_ok(&prolog_query(&input)) as u32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn grandparent_rule_joins_shared_variable_across_body_atoms() {
        let req = r#"{
            "predicates": [
                {"name": "parent", "arity": 2},
                {"name": "grandparent", "arity": 2}
            ],
            "facts": [
                {"pred": "parent", "args": ["alice", "bob"]},
                {"pred": "parent", "args": ["bob", "carol"]}
            ],
            "rules": [
                {
                    "head": {"pred": "grandparent", "args": ["X", "Z"]},
                    "body": [
                        {"pred": "parent", "args": ["X", "Y"]},
                        {"pred": "parent", "args": ["Y", "Z"]}
                    ]
                }
            ],
            "query": {"pred": "grandparent", "args": ["alice", "Z"]}
        }"#;
        let out = prolog_query(req);
        assert!(out.contains("\"result\":\"answered\""), "unexpected: {out}");
        assert!(out.contains("\"Z\":\"carol\""), "unexpected: {out}");
    }

    #[test]
    fn direct_fact_lookup_answers() {
        let req = r#"{
            "predicates": [{"name": "parent", "arity": 2}],
            "facts": [{"pred": "parent", "args": ["alice", "bob"]}],
            "rules": [],
            "query": {"pred": "parent", "args": ["alice", "Y"]}
        }"#;
        let out = prolog_query(req);
        assert!(out.contains("\"result\":\"answered\""), "unexpected: {out}");
        assert!(out.contains("\"Y\":\"bob\""), "unexpected: {out}");
    }

    #[test]
    fn unmatched_query_is_denied_not_an_error() {
        let req = r#"{
            "predicates": [{"name": "parent", "arity": 2}],
            "facts": [{"pred": "parent", "args": ["alice", "bob"]}],
            "rules": [],
            "query": {"pred": "parent", "args": ["nobody", "Y"]}
        }"#;
        let out = prolog_query(req);
        assert!(out.contains("\"result\":\"denied\""), "unexpected: {out}");
    }

    #[test]
    fn undeclared_predicate_in_query_is_a_typed_rejection_not_a_panic() {
        let req = r#"{
            "predicates": [{"name": "parent", "arity": 2}],
            "facts": [],
            "rules": [],
            "query": {"pred": "unknown_pred", "args": ["a", "b"]}
        }"#;
        let out = prolog_query(req);
        assert!(out.contains("\"error\""), "unexpected: {out}");
    }
}
