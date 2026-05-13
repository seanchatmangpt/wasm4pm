//! Admission Law — ARD section 6 + section 7.
//!
//! `admit_atom` and `admit_rule` enforce the byte caps and structural
//! invariants. Every kernel-facing API must run admission before execution;
//! a caller that bypasses admission is a kernel-safety violation.

use crate::catalog::Catalog;
use crate::types::{Atom8, Rule8, ARITY_CAP, BODY_CAP, FeatureBit, VAR_CAP};
use serde::{Deserialize, Serialize};

/// Structured rejection codes per ARD section 7.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RejectionCode {
    /// Atom or rule head exceeds arity cap.
    ArityCapExceeded,
    /// Rule body exceeds body cap.
    RuleBodyCapExceeded,
    /// Rule declares more variables than VAR_CAP.
    VariableCapExceeded,
    /// Proof DAG node has more than 8 children.
    ProofFanInExceeded,
    /// Local rule-family state surface exceeds 256.
    StateSurfaceExceeded,
    /// Kernel API was given a string query.
    StringQueryNotAdmitted,
    /// Kernel attempted to parse source text.
    RuntimeParseRejected,
    /// Textual meta-call.
    TextualMetaCallRejected,
    /// An argument refers to an uninterned term.
    UninternedTerm,
    /// Operator declarations are not admitted.
    OperatorDeclarationRejected,
    /// Negation is not stratified.
    UnstratifiedNegation,
    /// Recursion is not bounded or declared.
    UnboundedRecursion,
    /// Built-in predicate is not indexable.
    NonIndexableBuiltin,
    /// Dynamic mutation (assert/retract) is not admitted.
    DynamicMutationNotAdmitted,
    /// Cut is not admitted.
    CutNotAdmitted,
    /// Foreign predicate has no replay contract.
    ForeignContractMissing,
    /// Foreign predicate is non-deterministic.
    NondeterministicForeignCall,
    /// Side-effect inside the kernel boundary.
    SideEffectInKernel,
    /// Replay contract is missing.
    ReplayContractMissing,
    /// Predicate identifier not in catalog.
    PredicateNotInCatalog,
    /// Atom arity does not match catalog metadata.
    ArityMismatch,
    /// `binding_mask` references positions beyond `arity`.
    BindingMaskOutOfRange,
    /// Padding slot ≥ arity is not the sentinel.
    PaddingNotSentinel,
    /// `body_mask` does not equal `(1 << body_len) - 1`.
    BodyMaskMismatch,
    /// `negation_mask` references positions beyond `body_len`.
    NegationMaskOutOfRange,
    /// `builtin_mask` references positions beyond `body_len`.
    BuiltinMaskOutOfRange,
    /// `proof_mask` references positions beyond `body_len`.
    ProofMaskOutOfRange,
    /// Feature bit set in `feature_mask` is not admitted.
    FeatureBitNotAdmitted,
    /// Negation requires `FeatureBit::StratifiedNegation`.
    NegationRequiresFeature,
    /// Built-ins require `FeatureBit::Equality` or `TypedComparisons`.
    BuiltinRequiresFeature,
}

/// Run admission on an atom against a catalog.
pub fn admit_atom(atom: &Atom8, catalog: &Catalog) -> Result<(), RejectionCode> {
    if atom.arity > ARITY_CAP {
        return Err(RejectionCode::ArityCapExceeded);
    }
    let meta = catalog
        .predicate(atom.pred_id)
        .ok_or(RejectionCode::PredicateNotInCatalog)?;
    if meta.arity != atom.arity {
        return Err(RejectionCode::ArityMismatch);
    }
    // Binding mask must not bind positions ≥ arity.
    let live_mask: u8 = if atom.arity == 8 {
        0xFFu8
    } else {
        ((1u16 << atom.arity) as u8).wrapping_sub(1)
    };
    if atom.binding_mask & !live_mask != 0 {
        return Err(RejectionCode::BindingMaskOutOfRange);
    }
    // Padding slots must equal the sentinel.
    for i in atom.arity as usize..ARITY_CAP as usize {
        if !atom.args[i].is_sentinel() {
            return Err(RejectionCode::PaddingNotSentinel);
        }
    }
    // Live args may be the sentinel only if the position is unbound.
    // (Sentinel as a bound argument is forbidden — ID 0 is reserved.)
    for i in 0..atom.arity as usize {
        if atom.is_bound(i as u8) && atom.args[i].is_sentinel() {
            return Err(RejectionCode::UninternedTerm);
        }
    }
    Ok(())
}

/// Run admission on a rule against a catalog.
pub fn admit_rule(rule: &Rule8, catalog: &Catalog) -> Result<(), RejectionCode> {
    // Head admission.
    admit_atom(&rule.head, catalog)?;

    // Body length.
    if rule.body_len > BODY_CAP {
        return Err(RejectionCode::RuleBodyCapExceeded);
    }

    // Body mask consistency: must equal (1 << body_len) - 1.
    let expected_body_mask: u8 = if rule.body_len == 8 {
        0xFFu8
    } else {
        ((1u16 << rule.body_len) as u8).wrapping_sub(1)
    };
    if rule.body_mask != expected_body_mask {
        return Err(RejectionCode::BodyMaskMismatch);
    }

    // Negation / builtin / proof masks must reference present atoms.
    if rule.negation_mask & !expected_body_mask != 0 {
        return Err(RejectionCode::NegationMaskOutOfRange);
    }
    if rule.builtin_mask & !expected_body_mask != 0 {
        return Err(RejectionCode::BuiltinMaskOutOfRange);
    }
    if rule.proof_mask & !expected_body_mask != 0 {
        return Err(RejectionCode::ProofMaskOutOfRange);
    }

    // Variable count.
    if rule.var_count > VAR_CAP {
        return Err(RejectionCode::VariableCapExceeded);
    }

    // Feature mask: every set bit must be one of the 8 admitted features.
    // Since `FeatureBit` covers all 8 bit positions, any value of u8 is
    // valid; this check is a placeholder for future extension where some
    // bits become reserved.
    let admitted = FeatureBit::ALL
        .iter()
        .fold(0u8, |acc, f| acc | f.mask());
    if rule.feature_mask & !admitted != 0 {
        return Err(RejectionCode::FeatureBitNotAdmitted);
    }

    // Negation requires StratifiedNegation feature bit.
    if rule.negation_mask != 0 && (rule.feature_mask & FeatureBit::StratifiedNegation.mask()) == 0 {
        return Err(RejectionCode::NegationRequiresFeature);
    }

    // Body atom admission.
    for i in 0..rule.body_len as usize {
        admit_atom(&rule.body[i], catalog)?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::catalog::{PredicateMeta, PredicateProofPolicy};
    use crate::types::{Atom8, PredicateId, PlanId, RuleId, TermId, BINDING_PATTERNS};

    fn cat_with_p(arity: u8) -> Catalog {
        let mut cat = Catalog::new(crate::types::CatalogId(1));
        cat.add_predicate(PredicateMeta {
            pred_id: PredicateId(1),
            label: "p".into(),
            arity,
            access_orders: vec![],
            proof_policy: PredicateProofPolicy::OnRequest,
            materialized: false,
        });
        cat.intern_term("a");
        cat.intern_term("b");
        cat
    }

    fn rule_skeleton(head: Atom8, body: Vec<Atom8>) -> Rule8 {
        let mut body_arr = [Atom8::new(PredicateId(1), 0, &[]); BODY_CAP as usize];
        let body_len = body.len() as u8;
        for (i, a) in body.into_iter().enumerate() {
            body_arr[i] = a;
        }
        let body_mask = if body_len == 8 {
            0xFFu8
        } else {
            ((1u16 << body_len) as u8).wrapping_sub(1)
        };
        Rule8 {
            rule_id: RuleId(1),
            head,
            body: body_arr,
            body_len,
            body_mask,
            negation_mask: 0,
            builtin_mask: 0,
            var_count: 0,
            var_live_mask: 0,
            feature_mask: FeatureBit::Facts.mask() | FeatureBit::HornRules.mask(),
            proof_mask: 0,
            plan_id: PlanId::default(),
        }
    }

    #[test]
    fn binding_pattern_count_is_two_to_the_eighth() {
        assert_eq!(BINDING_PATTERNS, 256);
    }

    #[test]
    fn admit_atom_accepts_valid_input() {
        let cat = cat_with_p(2);
        let a = Atom8::new(PredicateId(1), 2, &[TermId(1), TermId(2)]).with_binding(0b11);
        assert!(admit_atom(&a, &cat).is_ok());
    }

    #[test]
    fn admit_atom_rejects_arity_mismatch() {
        let cat = cat_with_p(2);
        let a = Atom8::new(PredicateId(1), 3, &[TermId(1), TermId(2), TermId(3)]);
        assert_eq!(admit_atom(&a, &cat), Err(RejectionCode::ArityMismatch));
    }

    #[test]
    fn admit_atom_rejects_oob_binding_mask() {
        let cat = cat_with_p(2);
        let mut a = Atom8::new(PredicateId(1), 2, &[TermId(1), TermId(2)]);
        a.binding_mask = 0b1000;
        assert_eq!(
            admit_atom(&a, &cat),
            Err(RejectionCode::BindingMaskOutOfRange)
        );
    }

    #[test]
    fn admit_atom_rejects_uninterned_bound_term() {
        let cat = cat_with_p(1);
        let mut a = Atom8::new(PredicateId(1), 1, &[TermId(0)]);
        a.binding_mask = 0b1;
        assert_eq!(admit_atom(&a, &cat), Err(RejectionCode::UninternedTerm));
    }

    #[test]
    fn admit_rule_rejects_oversize_body() {
        let cat = cat_with_p(1);
        let head = Atom8::new(PredicateId(1), 1, &[TermId(1)]);
        // Construct a rule with body_len = 9 (ARD violates BODY_CAP).
        let body_atoms = vec![Atom8::new(PredicateId(1), 1, &[TermId(1)]); BODY_CAP as usize];
        let mut rule = rule_skeleton(head, body_atoms);
        rule.body_len = 9; // tampered
        rule.body_mask = 0xFF;
        // Caller deliberately broke invariants → admission must catch it.
        assert_eq!(admit_rule(&rule, &cat), Err(RejectionCode::RuleBodyCapExceeded));
    }

    #[test]
    fn admit_rule_rejects_negation_without_feature() {
        let cat = cat_with_p(1);
        let head = Atom8::new(PredicateId(1), 1, &[TermId(1)]);
        let body = vec![Atom8::new(PredicateId(1), 1, &[TermId(1)])];
        let mut rule = rule_skeleton(head, body);
        rule.negation_mask = 0b1; // negation declared
        rule.feature_mask = FeatureBit::Facts.mask() | FeatureBit::HornRules.mask();
        assert_eq!(
            admit_rule(&rule, &cat),
            Err(RejectionCode::NegationRequiresFeature)
        );
    }

    #[test]
    fn admit_rule_accepts_negation_with_feature() {
        let cat = cat_with_p(1);
        let head = Atom8::new(PredicateId(1), 1, &[TermId(1)]);
        let body = vec![Atom8::new(PredicateId(1), 1, &[TermId(1)])];
        let mut rule = rule_skeleton(head, body);
        rule.negation_mask = 0b1;
        rule.feature_mask = FeatureBit::Facts.mask()
            | FeatureBit::HornRules.mask()
            | FeatureBit::StratifiedNegation.mask();
        assert!(admit_rule(&rule, &cat).is_ok());
    }
}
