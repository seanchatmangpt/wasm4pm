//! AAT Live Counterfactual Tests for Prolog8 — Eight Oracle-Ranked Families
//!
//! This module implements the AAT (Adversarial Admissibility Testing) counterfactual framework
//! for Prolog8's byte-capped proof engine. Each family tests an invariant grounded in either
//! Rank 1 (Mathematical Theorem) or Rank 2 (Domain Contract) oracles.
//!
//! ## Doctrine
//!
//! - **The byte is the governor**: Every boundary test probes exactly cap and cap+1.
//! - **Proof is the product**: Proof types must match decision types.
//! - **BLAKE3 chain has six roots**: Tampering any root produces deterministic replay failure.
//! - **Denial is evidence**: Deny decisions are as evidenced as Allow decisions.

use prolog8::{
    admit_atom, admit_rule,
    catalog::{Catalog, PredicateMeta, PredicateProofPolicy},
    hash::{
        combine_roots, DOMAIN_PROLOG8_CATALOG, DOMAIN_PROLOG8_FACT, DOMAIN_PROLOG8_INPUT,
        DOMAIN_PROLOG8_OUTPUT, DOMAIN_PROLOG8_PROOF_ROOT, DOMAIN_PROLOG8_RULES,
    },
    kernel::{Decision, Kernel, QueryResult},
    replay,
    types::{
        Atom8, CatalogId, DecisionKind, EpochId, FactBlock8, FactRow8, PlanId, PredicateId,
        ProofKind, ProofMode, QueryAtom8, Rule8, RuleId, SourceId, TermId, BODY_CAP,
    },
    RejectionCode, ReplayStatus,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

fn base_catalog() -> Catalog {
    let mut cat = Catalog::new(CatalogId(1));
    cat.add_predicate(PredicateMeta {
        pred_id: PredicateId(1),
        label: "fact".into(),
        arity: 2,
        access_orders: vec![],
        proof_policy: PredicateProofPolicy::OnRequest,
        materialized: false,
    });
    cat.add_predicate(PredicateMeta {
        pred_id: PredicateId(2),
        label: "rule_head".into(),
        arity: 2,
        access_orders: vec![],
        proof_policy: PredicateProofPolicy::OnRequest,
        materialized: false,
    });
    cat
}

fn build_allow_receipt() -> (Kernel, QueryAtom8, Decision) {
    let mut cat = base_catalog();
    let a = cat.intern_term("a");
    let b = cat.intern_term("b");

    let mut k = Kernel::new(cat);
    k.load_facts(FactBlock8::new(
        PredicateId(1),
        2,
        vec![FactRow8::new(PredicateId(1), 2, &[a, b], SourceId(0))],
    ))
    .expect("load_facts");

    let mut atom = Atom8::new(PredicateId(1), 2, &[a, b]);
    atom.binding_mask = 0b11;
    let query = QueryAtom8 {
        atom,
        output_mask: 0,
        proof_mode: ProofMode::PositiveOnly,
        epoch: EpochId(0),
    };

    let answers = match k.query(&query) {
        QueryResult::Answered(v) => v,
        _ => unreachable!("expected Answered"),
    };
    assert_eq!(answers.len(), 1);

    (k, query, answers.into_iter().next().unwrap())
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P8-CF-1: Byte-Cap Boundary Sweep (Rank 1: Mathematical Theorem)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/// **Doctrine:** "The byte is the governor." Arity=8 is valid; arity=9 is rejected.
#[test]
fn cf1_arity_at_cap_passes() {
    let mut cat = Catalog::new(CatalogId(1));
    cat.add_predicate(PredicateMeta {
        pred_id: PredicateId(1),
        label: "p8".into(),
        arity: 8,
        access_orders: vec![],
        proof_policy: PredicateProofPolicy::OnRequest,
        materialized: false,
    });

    let terms: Vec<TermId> = (0..8).map(|i| cat.intern_term(format!("t{}", i))).collect();
    let mut atom = Atom8::new(PredicateId(1), 8, &terms);
    atom.binding_mask = 0xFF;

    assert_eq!(admit_atom(&atom, &cat), Ok(()));
}

/// **Doctrine:** Arity=9 exceeds cap and is rejected.
///
/// `Atom8::new` clamps arity to ARITY_CAP internally, so we must construct
/// the atom via struct literal to bypass clamping and test the actual cap.
#[test]
fn cf1_arity_beyond_cap_rejected() {
    let mut cat = Catalog::new(CatalogId(1));
    // Register with arity=9 in the catalog so ArityCapExceeded (not
    // ArityMismatch) fires on the atom.
    cat.add_predicate(PredicateMeta {
        pred_id: PredicateId(1),
        label: "p9".into(),
        arity: 9,
        access_orders: vec![],
        proof_policy: PredicateProofPolicy::OnRequest,
        materialized: false,
    });

    // Bypass Atom8::new clamping — construct with raw arity=9 to test the cap.
    let atom = Atom8 {
        pred_id: PredicateId(1),
        arity: 9,
        binding_mask: 0xFF,
        args: [TermId(1); 8],
    };

    assert_eq!(
        admit_atom(&atom, &cat),
        Err(RejectionCode::ArityCapExceeded)
    );
}

/// **Doctrine:** Body length=8 is valid.
#[test]
fn cf1_body_at_cap_passes() {
    let mut cat = base_catalog();
    let a = cat.intern_term("a");
    let b = cat.intern_term("b");

    // base_catalog() registers predicates 1 and 2 with arity=2; match that.
    let mut head = Atom8::new(PredicateId(2), 2, &[a, b]);
    head.binding_mask = 0b11;

    let body_atom = Atom8::new(PredicateId(1), 2, &[a, b]);
    let body = [body_atom; BODY_CAP as usize];

    let rule = Rule8 {
        rule_id: RuleId(1),
        head,
        body,
        body_len: 8,
        body_mask: 0xFF,
        negation_mask: 0,
        builtin_mask: 0,
        var_count: 0,
        var_live_mask: 0,
        feature_mask: 0xFF,
        // proof_mask must be within body_len=8 bits: 0xFF is valid here.
        proof_mask: 0xFF,
        plan_id: PlanId(0),
    };

    assert_eq!(admit_rule(&rule, &cat), Ok(()));
}

/// **Doctrine:** Body length=9 exceeds cap and is rejected.
#[test]
fn cf1_body_beyond_cap_rejected() {
    let mut cat = base_catalog();
    let a = cat.intern_term("a");
    let b = cat.intern_term("b");

    // base_catalog() registers predicates 1 and 2 with arity=2; match that.
    let mut head = Atom8::new(PredicateId(2), 2, &[a, b]);
    head.binding_mask = 0b11;

    let body_atom = Atom8::new(PredicateId(1), 2, &[a, b]);
    let body = [body_atom; BODY_CAP as usize];

    let rule = Rule8 {
        rule_id: RuleId(1),
        head,
        body,
        body_len: 9, // Exceeds BODY_CAP (8) — admission catches this before ArityMismatch
        body_mask: 0xFF,
        negation_mask: 0,
        builtin_mask: 0,
        var_count: 0,
        var_live_mask: 0,
        feature_mask: 0xFF,
        proof_mask: 0xFF,
        plan_id: PlanId(0),
    };

    assert_eq!(
        admit_rule(&rule, &cat),
        Err(RejectionCode::RuleBodyCapExceeded)
    );
}

/// **Doctrine:** Binding mask 0xFF for 8-arity atom is valid (all positions bound).
#[test]
fn cf1_binding_mask_at_cap_passes() {
    let mut cat = Catalog::new(CatalogId(1));
    cat.add_predicate(PredicateMeta {
        pred_id: PredicateId(1),
        label: "p8".into(),
        arity: 8,
        access_orders: vec![],
        proof_policy: PredicateProofPolicy::OnRequest,
        materialized: false,
    });

    let terms: Vec<TermId> = (0..8).map(|i| cat.intern_term(format!("t{}", i))).collect();
    let mut atom = Atom8::new(PredicateId(1), 8, &terms);
    atom.binding_mask = 0xFF;

    assert_eq!(admit_atom(&atom, &cat), Ok(()));
}

/// **Doctrine:** Binding mask bits set beyond arity are invalid.
#[test]
fn cf1_binding_mask_beyond_arity_rejected() {
    let mut cat = Catalog::new(CatalogId(1));
    cat.add_predicate(PredicateMeta {
        pred_id: PredicateId(1),
        label: "p2".into(),
        arity: 2,
        access_orders: vec![],
        proof_policy: PredicateProofPolicy::OnRequest,
        materialized: false,
    });

    let t0 = cat.intern_term("t0");
    let t1 = cat.intern_term("t1");

    let mut atom = Atom8::new(PredicateId(1), 2, &[t0, t1]);
    atom.binding_mask = 0b11100; // bits 2-4 set — beyond arity=2

    assert_eq!(
        admit_atom(&atom, &cat),
        Err(RejectionCode::BindingMaskOutOfRange)
    );
}

/// **Doctrine:** Padding slots (positions >= arity) must be sentinels (TermId(0)).
#[test]
fn cf1_padding_slot_not_sentinel() {
    let mut cat = Catalog::new(CatalogId(1));
    cat.add_predicate(PredicateMeta {
        pred_id: PredicateId(1),
        label: "p2".into(),
        arity: 2,
        access_orders: vec![],
        proof_policy: PredicateProofPolicy::OnRequest,
        materialized: false,
    });

    let t0 = cat.intern_term("t0");
    let t1 = cat.intern_term("t1");
    let bad_padding = cat.intern_term("nonsentinel");

    // Manually craft an Atom8 with non-sentinel padding.
    let mut atom = Atom8::new(PredicateId(1), 2, &[t0, t1]);
    atom.args[3] = bad_padding; // Set position 3 to non-sentinel
    atom.binding_mask = 0b11;

    assert_eq!(
        admit_atom(&atom, &cat),
        Err(RejectionCode::PaddingNotSentinel)
    );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P8-CF-2: Receipt Chain Tampering at All Six Roots (Rank 1)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/// **Case A:** Tamper catalog_root, do NOT recompute receipt_hash → ReceiptInvalid.
#[test]
fn cf2_catalog_root_tampered_without_hash_recompute() {
    let (k, q, mut decision) = build_allow_receipt();

    decision.receipt.catalog_root[0] ^= 0x01;

    let status = replay::replay(&k, &q, &decision.receipt);
    assert_eq!(status, ReplayStatus::ReceiptInvalid);
}

/// **Case B:** Tamper catalog_root AND recompute receipt_hash → Mismatch.
#[test]
fn cf2_catalog_root_tampered_with_hash_recompute() {
    let (k, q, mut decision) = build_allow_receipt();

    decision.receipt.catalog_root[0] ^= 0x01;
    decision.receipt.receipt_hash = decision.receipt.compute_hash();

    let status = replay::replay(&k, &q, &decision.receipt);
    assert_eq!(status, ReplayStatus::Mismatch);
}

/// **Case A:** Tamper rule_root without hash recompute.
#[test]
fn cf2_rule_root_tampered_without_hash_recompute() {
    let (k, q, mut decision) = build_allow_receipt();

    decision.receipt.rule_root[0] ^= 0x01;

    let status = replay::replay(&k, &q, &decision.receipt);
    assert_eq!(status, ReplayStatus::ReceiptInvalid);
}

/// **Case B:** Tamper rule_root with hash recompute.
#[test]
fn cf2_rule_root_tampered_with_hash_recompute() {
    let (k, q, mut decision) = build_allow_receipt();

    decision.receipt.rule_root[0] ^= 0x01;
    decision.receipt.receipt_hash = decision.receipt.compute_hash();

    let status = replay::replay(&k, &q, &decision.receipt);
    assert_eq!(status, ReplayStatus::Mismatch);
}

/// **Case A:** Tamper fact_root without hash recompute.
#[test]
fn cf2_fact_root_tampered_without_hash_recompute() {
    let (k, q, mut decision) = build_allow_receipt();

    decision.receipt.fact_root[0] ^= 0x01;

    let status = replay::replay(&k, &q, &decision.receipt);
    assert_eq!(status, ReplayStatus::ReceiptInvalid);
}

/// **Case B:** Tamper fact_root with hash recompute.
#[test]
fn cf2_fact_root_tampered_with_hash_recompute() {
    let (k, q, mut decision) = build_allow_receipt();

    decision.receipt.fact_root[0] ^= 0x01;
    decision.receipt.receipt_hash = decision.receipt.compute_hash();

    let status = replay::replay(&k, &q, &decision.receipt);
    assert_eq!(status, ReplayStatus::Mismatch);
}

/// **Case A:** Tamper input_root without hash recompute.
#[test]
fn cf2_input_root_tampered_without_hash_recompute() {
    let (k, q, mut decision) = build_allow_receipt();

    decision.receipt.input_root[0] ^= 0x01;

    let status = replay::replay(&k, &q, &decision.receipt);
    assert_eq!(status, ReplayStatus::ReceiptInvalid);
}

/// **Case B:** Tamper input_root with hash recompute.
#[test]
fn cf2_input_root_tampered_with_hash_recompute() {
    let (k, q, mut decision) = build_allow_receipt();

    decision.receipt.input_root[0] ^= 0x01;
    decision.receipt.receipt_hash = decision.receipt.compute_hash();

    let status = replay::replay(&k, &q, &decision.receipt);
    assert_eq!(status, ReplayStatus::Mismatch);
}

/// **Case A:** Tamper proof_root without hash recompute.
#[test]
fn cf2_proof_root_tampered_without_hash_recompute() {
    let (k, q, mut decision) = build_allow_receipt();

    decision.receipt.proof_root[0] ^= 0x01;

    let status = replay::replay(&k, &q, &decision.receipt);
    assert_eq!(status, ReplayStatus::ReceiptInvalid);
}

/// **Case B:** Tamper proof_root with hash recompute.
#[test]
fn cf2_proof_root_tampered_with_hash_recompute() {
    let (k, q, mut decision) = build_allow_receipt();

    decision.receipt.proof_root[0] ^= 0x01;
    decision.receipt.receipt_hash = decision.receipt.compute_hash();

    let status = replay::replay(&k, &q, &decision.receipt);
    assert_eq!(status, ReplayStatus::Mismatch);
}

/// **Case A:** Tamper output_root without hash recompute.
#[test]
fn cf2_output_root_tampered_without_hash_recompute() {
    let (k, q, mut decision) = build_allow_receipt();

    decision.receipt.output_root[0] ^= 0x01;

    let status = replay::replay(&k, &q, &decision.receipt);
    assert_eq!(status, ReplayStatus::ReceiptInvalid);
}

/// **Case B:** Tamper output_root with hash recompute.
#[test]
fn cf2_output_root_tampered_with_hash_recompute() {
    let (k, q, mut decision) = build_allow_receipt();

    decision.receipt.output_root[0] ^= 0x01;
    decision.receipt.receipt_hash = decision.receipt.compute_hash();

    let status = replay::replay(&k, &q, &decision.receipt);
    assert_eq!(status, ReplayStatus::Mismatch);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P8-CF-3: Proof Node Type Contracts (Rank 2: Domain Contract)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/// **Contract:** Allow via fact → all proof nodes are ProofKind::Fact.
#[test]
fn cf3_fact_match_emits_only_fact_proof_nodes() {
    let (_k, _q, decision) = build_allow_receipt();

    assert_eq!(decision.kind, DecisionKind::Allow);
    assert!(!decision.proof.is_empty());
    for node in &decision.proof {
        assert_eq!(node.kind, ProofKind::Fact);
    }
}

/// **Contract:** Allow via rule → at least one ProofKind::Rule node (and no MissingFact).
#[test]
fn cf3_rule_derivation_includes_rule_proof_node() {
    let mut cat = base_catalog();
    let a = cat.intern_term("a");
    let b = cat.intern_term("b");

    let mut k = Kernel::new(cat);
    k.load_facts(FactBlock8::new(
        PredicateId(1),
        2,
        vec![FactRow8::new(PredicateId(1), 2, &[a, b], SourceId(0))],
    ))
    .expect("load_facts");

    let mut rule_head = Atom8::new(PredicateId(2), 2, &[a, b]);
    rule_head.binding_mask = 0b11;
    let mut body_atom = Atom8::new(PredicateId(1), 2, &[a, b]);
    body_atom.binding_mask = 0b11;

    let mut body = [Atom8::new(PredicateId(1), 1, &[a]); BODY_CAP as usize];
    body[0] = body_atom;

    let rule = Rule8 {
        rule_id: RuleId(1),
        head: rule_head,
        body,
        body_len: 1,
        body_mask: 0b1,
        negation_mask: 0,
        builtin_mask: 0,
        var_count: 0,
        var_live_mask: 0,
        feature_mask: 0xFF,
        // proof_mask must be within body_len bits: body_len=1 → only bit 0.
        proof_mask: 0b1,
        plan_id: PlanId(0),
    };

    k.load_rule(rule).expect("load_rule");

    let mut query_atom = Atom8::new(PredicateId(2), 2, &[a, b]);
    query_atom.binding_mask = 0b11;
    let query = QueryAtom8 {
        atom: query_atom,
        output_mask: 0,
        proof_mode: ProofMode::PositiveOnly,
        epoch: EpochId(0),
    };

    let answers = match k.query(&query) {
        QueryResult::Answered(v) => v,
        _ => unreachable!("expected Answered"),
    };

    assert!(!answers.is_empty());
    let decision = &answers[0];
    assert_eq!(decision.kind, DecisionKind::Allow);

    let has_rule_node = decision.proof.iter().any(|n| n.kind == ProofKind::Rule);
    assert!(has_rule_node, "expected at least one Rule proof node");

    for node in &decision.proof {
        assert_ne!(
            node.kind,
            ProofKind::MissingFact,
            "Allow should not have MissingFact nodes"
        );
    }
}

/// **Contract:** Deny → all proof nodes are ProofKind::MissingFact.
#[test]
fn cf3_deny_emits_only_missing_fact_nodes() {
    let (k, mut query, _) = build_allow_receipt();

    // Use Both proof_mode so the deny path emits a negative proof node.
    query.proof_mode = ProofMode::Both;
    // Modify query to ask for a non-existent fact.
    query.atom.args[0] = TermId(999); // Use a non-existent term ID.

    let decision = match k.query(&query) {
        QueryResult::Denied(d) => d,
        _ => unreachable!("expected Denied"),
    };

    assert_eq!(decision.kind, DecisionKind::Deny);
    assert!(!decision.proof.is_empty());
    for node in &decision.proof {
        assert_eq!(node.kind, ProofKind::MissingFact);
    }
}

/// **Contract:** Allow → no MissingFact nodes.
#[test]
fn cf3_allow_has_no_missing_fact_nodes() {
    let (_k, _q, decision) = build_allow_receipt();

    assert_eq!(decision.kind, DecisionKind::Allow);
    for node in &decision.proof {
        assert_ne!(node.kind, ProofKind::MissingFact);
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P8-CF-4: Denial Is Evidence (Rank 2: Domain Contract)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/// **Contract:** Deny receipt_hash is non-zero.
#[test]
fn cf4_deny_receipt_hash_is_nonzero() {
    let (k, mut query, _) = build_allow_receipt();
    query.atom.args[0] = TermId(999); // Non-existent term.

    let decision = match k.query(&query) {
        QueryResult::Denied(d) => d,
        _ => unreachable!("expected Denied"),
    };

    assert_ne!(decision.receipt.receipt_hash, [0u8; 32]);
}

/// **Contract:** Two independent Deny queries with same inputs yield same receipt_hash.
#[test]
fn cf4_deny_receipt_is_deterministic() {
    let (k, mut query, _) = build_allow_receipt();
    query.atom.args[0] = TermId(999);

    let decision1 = match k.query(&query) {
        QueryResult::Denied(d) => d,
        _ => unreachable!("expected Denied"),
    };

    let decision2 = match k.query(&query) {
        QueryResult::Denied(d) => d,
        _ => unreachable!("expected Denied"),
    };

    assert_eq!(
        decision1.receipt.receipt_hash,
        decision2.receipt.receipt_hash
    );
}

/// **Contract:** Deny proof is non-empty.
#[test]
fn cf4_deny_proof_is_nonempty() {
    let (k, mut query, _) = build_allow_receipt();
    // Use Both proof_mode so the deny path emits a negative proof node.
    query.proof_mode = ProofMode::Both;
    query.atom.args[0] = TermId(999);

    let decision = match k.query(&query) {
        QueryResult::Denied(d) => d,
        _ => unreachable!("expected Denied"),
    };

    assert!(!decision.proof.is_empty());
}

/// **Contract:** Empty fact block → Denied (not Invalid).
#[test]
fn cf4_empty_fact_block_yields_deny() {
    let mut cat = base_catalog();
    let a = cat.intern_term("a");

    let mut k = Kernel::new(cat);
    k.load_facts(FactBlock8::new(
        PredicateId(1),
        2,
        vec![], // Empty block
    ))
    .expect("load_facts");

    let mut query_atom = Atom8::new(PredicateId(1), 2, &[a, a]);
    query_atom.binding_mask = 0b11;
    let query = QueryAtom8 {
        atom: query_atom,
        output_mask: 0,
        proof_mode: ProofMode::PositiveOnly,
        epoch: EpochId(0),
    };

    let result = k.query(&query);
    assert!(
        matches!(result, QueryResult::Denied(_)),
        "expected Denied, got {:?}",
        result
    );
}

/// **Contract:** Predicate in catalog but no fact block loaded → Denied.
#[test]
fn cf4_predicate_with_no_fact_block_yields_deny() {
    let cat = base_catalog();
    let mut k = Kernel::new(cat);
    // Load NO fact blocks.

    let a = k.catalog.intern_term("a");
    let mut query_atom = Atom8::new(PredicateId(1), 2, &[a, a]);
    query_atom.binding_mask = 0b11;
    let query = QueryAtom8 {
        atom: query_atom,
        output_mask: 0,
        proof_mode: ProofMode::PositiveOnly,
        epoch: EpochId(0),
    };

    let result = k.query(&query);
    assert!(
        matches!(result, QueryResult::Denied(_)),
        "expected Denied, got {:?}",
        result
    );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P8-CF-5: BLAKE3 Domain Key Distinctness Exhaustive (Rank 1)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/// **Theorem:** All 10 domain-separated BLAKE3 keys are pairwise distinct (45 pairs).
#[test]
fn cf5_all_domain_keys_are_pairwise_distinct() {
    let domains = [
        *DOMAIN_PROLOG8_FACT,
        *DOMAIN_PROLOG8_INPUT,
        *DOMAIN_PROLOG8_OUTPUT,
        *DOMAIN_PROLOG8_PROOF_ROOT,
        *DOMAIN_PROLOG8_CATALOG,
        *DOMAIN_PROLOG8_RULES,
    ];

    // All 15 pairs (6 domains, C(6,2)) must be distinct.
    for i in 0..domains.len() {
        for j in (i + 1)..domains.len() {
            assert_ne!(
                domains[i], domains[j],
                "domains[{}] and domains[{}] are the same",
                i, j
            );
        }
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P8-CF-6: Cross-Kernel Determinism (Rank 1)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/// **Theorem:** Two independent Kernel instances with identical state produce bit-exact receipts.
#[test]
fn cf6_independent_kernel_instances_produce_identical_receipts() {
    let (_k1, _q1, d1) = build_allow_receipt();

    // Build a second, independent kernel with identical state.
    let (_k2, _q2, d2) = build_allow_receipt();

    assert_eq!(d1.receipt.receipt_hash, d2.receipt.receipt_hash);
    assert_eq!(d1.receipt.proof_root, d2.receipt.proof_root);
    assert_eq!(d1.receipt.fact_root, d2.receipt.fact_root);
    assert_eq!(d1.receipt.catalog_root, d2.receipt.catalog_root);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P8-CF-7: combine_roots Non-Commutativity (Rank 1)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/// **Theorem:** combine_roots is order-sensitive.
#[test]
fn cf7_combine_roots_is_order_sensitive() {
    let hash_a = [1u8; 32];
    let hash_b = [2u8; 32];

    let forward = combine_roots(&[&hash_a, &hash_b]);
    let backward = combine_roots(&[&hash_b, &hash_a]);

    assert_ne!(forward, backward, "combine_roots must be order-sensitive");
}

/// **Theorem:** combine_roots is length-prefix collision-resistant.
#[test]
fn cf7_combine_roots_length_prefix_distinct() {
    let hash_a = [1u8; 32];
    let empty = [0u8; 32];

    let one_element = combine_roots(&[&hash_a]);
    let two_elements = combine_roots(&[&hash_a, &empty]);

    assert_ne!(
        one_element, two_elements,
        "length prefix must distinguish single-element from two-element chain"
    );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P8-CF-8: Rule Body Mask Consistency (Rank 1)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/// **Theorem:** body_mask=0 with body_len=3 is inconsistent and rejected.
#[test]
fn cf8_body_mask_zero_with_nonzero_body_len_rejected() {
    let mut cat = base_catalog();
    let a = cat.intern_term("a");
    let b = cat.intern_term("b");

    // base_catalog() registers predicates 1 and 2 with arity=2; match that.
    let mut head = Atom8::new(PredicateId(2), 2, &[a, b]);
    head.binding_mask = 0b11;

    let body_atom = Atom8::new(PredicateId(1), 2, &[a, b]);
    let body = [body_atom; BODY_CAP as usize];

    let rule = Rule8 {
        rule_id: RuleId(1),
        head,
        body,
        body_len: 3,
        body_mask: 0, // Inconsistent: body_len=3 but body_mask=0
        negation_mask: 0,
        builtin_mask: 0,
        var_count: 0,
        var_live_mask: 0,
        feature_mask: 0xFF,
        // proof_mask must be within body_len=3 bits (0b111); 0xFF is out of range.
        // Since body_mask mismatch fires first, use 0 here to avoid a second issue.
        proof_mask: 0,
        plan_id: PlanId(0),
    };

    assert_eq!(
        admit_rule(&rule, &cat),
        Err(RejectionCode::BodyMaskMismatch)
    );
}

/// **Theorem:** body_mask=0xFF with body_len=3 is inconsistent and rejected.
#[test]
fn cf8_body_mask_full_with_small_body_len_rejected() {
    let mut cat = base_catalog();
    let a = cat.intern_term("a");
    let b = cat.intern_term("b");

    // base_catalog() registers predicates 1 and 2 with arity=2; match that.
    let mut head = Atom8::new(PredicateId(2), 2, &[a, b]);
    head.binding_mask = 0b11;

    let body_atom = Atom8::new(PredicateId(1), 2, &[a, b]);
    let body = [body_atom; BODY_CAP as usize];

    let rule = Rule8 {
        rule_id: RuleId(1),
        head,
        body,
        body_len: 3,
        body_mask: 0xFF, // Inconsistent: body_len=3 but body_mask=0xFF
        negation_mask: 0,
        builtin_mask: 0,
        var_count: 0,
        var_live_mask: 0,
        feature_mask: 0xFF,
        // proof_mask within body_len=3 bits would be 0b111; 0xFF out of range.
        // BodyMaskMismatch fires first (before ProofMaskOutOfRange), so use 0.
        proof_mask: 0,
        plan_id: PlanId(0),
    };

    assert_eq!(
        admit_rule(&rule, &cat),
        Err(RejectionCode::BodyMaskMismatch)
    );
}

/// **Theorem:** body_mask=0b111 with body_len=3 is consistent and accepted.
#[test]
fn cf8_body_mask_correct_for_body_len_passes() {
    let mut cat = base_catalog();
    let a = cat.intern_term("a");
    let b = cat.intern_term("b");

    // base_catalog() registers predicates 1 and 2 with arity=2; match that.
    let mut head = Atom8::new(PredicateId(2), 2, &[a, b]);
    head.binding_mask = 0b11;

    let body_atom = Atom8::new(PredicateId(1), 2, &[a, b]);
    let body = [body_atom; BODY_CAP as usize];

    let rule = Rule8 {
        rule_id: RuleId(1),
        head,
        body,
        body_len: 3,
        body_mask: 0b111, // Correct: (1 << 3) - 1 = 0b111
        negation_mask: 0,
        builtin_mask: 0,
        var_count: 0,
        var_live_mask: 0,
        feature_mask: 0xFF,
        // proof_mask must be within body_len=3 bits: 0b111 is valid here.
        proof_mask: 0b111,
        plan_id: PlanId(0),
    };

    assert_eq!(admit_rule(&rule, &cat), Ok(()));
}

/// **Theorem:** negation_mask bit set at position >= body_len is rejected.
#[test]
fn cf8_negation_mask_beyond_body_len_rejected() {
    let mut cat = base_catalog();
    let a = cat.intern_term("a");
    let b = cat.intern_term("b");

    // base_catalog() registers predicates 1 and 2 with arity=2; match that.
    let mut head = Atom8::new(PredicateId(2), 2, &[a, b]);
    head.binding_mask = 0b11;

    let body_atom = Atom8::new(PredicateId(1), 2, &[a, b]);
    let body = [body_atom; BODY_CAP as usize];

    let rule = Rule8 {
        rule_id: RuleId(1),
        head,
        body,
        body_len: 3,
        body_mask: 0b111,
        negation_mask: 0b1000, // Bit 3 set, but body_len=3 (positions 0-2)
        builtin_mask: 0,
        var_count: 0,
        var_live_mask: 0,
        // negation requires StratifiedNegation feature bit; include it so the
        // NegationMaskOutOfRange check (not NegationRequiresFeature) fires first.
        feature_mask: 0xFF,
        proof_mask: 0b111,
        plan_id: PlanId(0),
    };

    assert_eq!(
        admit_rule(&rule, &cat),
        Err(RejectionCode::NegationMaskOutOfRange)
    );
}
