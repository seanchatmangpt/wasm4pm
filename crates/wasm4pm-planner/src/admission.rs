//! prolog8-backed plan admission.
//!
//! Every fired action label is queried through a real `prolog8::Kernel`. The
//! authoritative surface is default-deny: callers must explicitly admit labels.
//! A permissive compatibility wrapper remains for legacy callers and is named as
//! such at the API boundary.

use prolog8::catalog::{Catalog, PredicateMeta, PredicateProofPolicy};
use prolog8::kernel::{Kernel, QueryResult};
use prolog8::types::{
    Atom8, CatalogId, EpochId, FactBlock8, FactRow8, PredicateId, ProofMode, QueryAtom8, SourceId,
};
use std::collections::BTreeSet;

const MAY_FIRE_PREDICATE: PredicateId = PredicateId(1);

/// Explicit policy controlling which grounded action labels may enter an admitted plan.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PlanAdmissionPolicy {
    allowed_labels: BTreeSet<String>,
}

impl PlanAdmissionPolicy {
    /// Create an empty default-deny policy.
    #[must_use]
    pub fn default_deny() -> Self {
        Self::default()
    }

    /// Admit one stable action label.
    #[must_use]
    pub fn allow_label(mut self, label: impl Into<String>) -> Self {
        self.allowed_labels.insert(label.into());
        self
    }

    /// Build an explicitly permissive policy for a known finite label set.
    ///
    /// This is intended only for legacy compatibility and tests. Production
    /// GMRW callers should construct a policy from admitted graph authority.
    #[must_use]
    pub fn permissive_for(labels: &BTreeSet<String>) -> Self {
        Self {
            allowed_labels: labels.clone(),
        }
    }

    /// Return whether the exact action label is admitted.
    #[must_use]
    pub fn allows(&self, label: &str) -> bool {
        self.allowed_labels.contains(label)
    }
}

/// Build a Prolog admission kernel from an explicit policy and verify every plan label.
///
/// The returned boolean is true only when every requested label appears in the policy
/// and every corresponding `may_fire/1` query is answered by the kernel.
pub fn admit_plan_labels_with_policy(
    labels: &BTreeSet<String>,
    policy: &PlanAdmissionPolicy,
) -> (Kernel, bool) {
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
    let permitted_labels: Vec<&String> =
        labels.iter().filter(|label| policy.allows(label)).collect();
    let term_ids: Vec<_> = permitted_labels
        .iter()
        .map(|label| kernel.catalog.intern_term((*label).clone()))
        .collect();
    let rows: Vec<_> = term_ids
        .iter()
        .map(|term| FactRow8::new(MAY_FIRE_PREDICATE, 1, &[*term], SourceId(0)))
        .collect();

    let loaded = kernel
        .load_facts(FactBlock8::new(MAY_FIRE_PREDICATE, 1, rows))
        .is_ok();
    if !loaded || permitted_labels.len() != labels.len() {
        return (kernel, false);
    }

    let all_answered = term_ids.iter().all(|term| {
        let atom = Atom8::new(MAY_FIRE_PREDICATE, 1, &[*term]).with_binding(0b1);
        let query = QueryAtom8 {
            atom,
            output_mask: 0,
            proof_mode: ProofMode::Both,
            epoch: EpochId(0),
        };
        matches!(kernel.query(&query), QueryResult::Answered(_))
    });

    (kernel, all_answered)
}

/// Legacy compatibility wrapper that explicitly permits the finite supplied label set.
///
/// New standing-bearing callers should use [`admit_plan_labels_with_policy`] instead.
pub fn admit_plan_labels(labels: &BTreeSet<String>) -> (Kernel, bool) {
    let policy = PlanAdmissionPolicy::permissive_for(labels);
    admit_plan_labels_with_policy(labels, &policy)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_deny_refuses_unlisted_action() {
        let labels = BTreeSet::from(["send-payment".to_string()]);
        let (_, admitted) =
            admit_plan_labels_with_policy(&labels, &PlanAdmissionPolicy::default_deny());
        assert!(!admitted);
    }

    #[test]
    fn explicit_policy_admits_only_complete_label_set() {
        let labels = BTreeSet::from(["inspect".to_string(), "repair".to_string()]);
        let incomplete = PlanAdmissionPolicy::default_deny().allow_label("inspect");
        let (_, admitted) = admit_plan_labels_with_policy(&labels, &incomplete);
        assert!(!admitted);

        let complete = incomplete.allow_label("repair");
        let (_, admitted) = admit_plan_labels_with_policy(&labels, &complete);
        assert!(admitted);
    }
}
