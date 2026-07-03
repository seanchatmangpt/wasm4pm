//! prolog8-backed admission: every fired action label is gated through a
//! real `prolog8::Kernel::query` — the one piece of genuine code reuse in
//! this crate, via the existing path dependency (same as
//! `wasm4pm-cognition` already consumes `prolog8`). Permissive by default
//! (every distinct action label is pre-admitted as a fact), mirroring
//! bcinr-pddl's `manufacture_world` convention of "empty policy_rules =
//! permissive" — this crate has no policy-rule layer yet.

use prolog8::catalog::{Catalog, PredicateMeta, PredicateProofPolicy};
use prolog8::kernel::{Kernel, QueryResult};
use prolog8::types::{
    Atom8, CatalogId, EpochId, FactBlock8, FactRow8, PredicateId, ProofMode, QueryAtom8, SourceId,
};
use std::collections::BTreeSet;

const MAY_FIRE_PREDICATE: PredicateId = PredicateId(1);

/// Build a permissive admission kernel: one `may_fire/1` predicate, with a
/// fact loaded for every distinct action label the plan uses. Returns the
/// kernel plus whether every label was admitted without rejection.
pub fn admit_plan_labels(labels: &BTreeSet<String>) -> (Kernel, bool) {
    let mut catalog = Catalog::new(CatalogId(1));
    catalog.add_predicate(PredicateMeta {
        pred_id: MAY_FIRE_PREDICATE,
        label: "may_fire".to_string(),
        arity: 1,
        access_orders: vec![],
        proof_policy: PredicateProofPolicy::OnRequest,
        materialized: false,
    });

    let mut kernel = Kernel::new(catalog);
    let mut all_ok = true;

    let term_ids: Vec<_> = labels
        .iter()
        .map(|label| kernel.catalog.intern_term(label.clone()))
        .collect();

    let rows: Vec<_> = term_ids
        .iter()
        .map(|t| FactRow8::new(MAY_FIRE_PREDICATE, 1, &[*t], SourceId(0)))
        .collect();
    if kernel
        .load_facts(FactBlock8::new(MAY_FIRE_PREDICATE, 1, rows))
        .is_err()
    {
        all_ok = false;
    }

    for t in &term_ids {
        let atom = Atom8::new(MAY_FIRE_PREDICATE, 1, &[*t]).with_binding(0b1);
        let q = QueryAtom8 {
            atom,
            output_mask: 0,
            proof_mode: ProofMode::Both,
            epoch: EpochId(0),
        };
        match kernel.query(&q) {
            QueryResult::Answered(_) => {}
            _ => all_ok = false,
        }
    }

    (kernel, all_ok)
}
