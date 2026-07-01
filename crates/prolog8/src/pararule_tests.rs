//! PARARULE-Plus–derived correctness tests for the Prolog8 kernel.
//!
//! Tests are extracted from Mensfelt et al., "PrologMCP: A Standardized Prolog
//! Tool Interface for LLM Agents" (2026), Appendix A and Section 5 case studies.
//!
//! Each test encodes one PARARULE-Plus instance into prolog8 kernel types, then
//! asserts the ground-truth Boolean answer. Counterfactual (negation) assertions
//! immediately follow every positive test — a test that cannot fail proves nothing.
//!
//! # Encoding convention
//!
//! PARARULE-Plus uses unary predicates: `smart(charlie)` is encoded as
//! `Atom8 { pred_id: SMART, arity: 1, args: [charlie_tid, ...] }`.
//! Variables are encoded as `TermId(VAR_SENTINEL_BASE + N)`.
//!
//! # Depth-limitation contract
//!
//! prolog8 rule evaluation is ONE-STEP: each body atom is resolved against
//! base facts only (`scan_facts`), not against derived predicates. Multi-hop
//! chains (rule A fires → result feeds rule B) require multiple `query()` calls
//! from the caller. Tests here document this boundary explicitly.

#![allow(clippy::too_many_lines)]

use crate::catalog::{Catalog, PredicateMeta, PredicateProofPolicy};
use crate::kernel::{Decision, Kernel, QueryResult};
use crate::types::{
    Atom8, CatalogId, DecisionKind, EpochId, FactBlock8, FactRow8, FeatureBit, PlanId, PredicateId,
    ProofKind, ProofMode, QueryAtom8, Rule8, RuleId, SourceId, TermId,
};

const EPOCH: EpochId = EpochId(0);
const VAR_BASE: u32 = 0x8000_0000;
const SRC: SourceId = SourceId(0);

fn v(n: u32) -> TermId {
    TermId(VAR_BASE + n)
}

fn feature() -> u8 {
    FeatureBit::Facts.mask() | FeatureBit::HornRules.mask()
}

fn simple_rule(id: u32, head: Atom8, body: &[Atom8]) -> Rule8 {
    assert!(body.len() <= 8, "body exceeds BODY_CAP");
    let mut body_arr = [Atom8::new(PredicateId(0), 0, &[]); 8];
    for (i, b) in body.iter().enumerate() {
        body_arr[i] = *b;
    }
    Rule8 {
        rule_id: RuleId(id),
        head,
        body: body_arr,
        body_len: body.len() as u8,
        body_mask: (1u8 << body.len()) - 1,
        negation_mask: 0,
        builtin_mask: 0,
        var_count: 8,
        var_live_mask: 0xFF,
        feature_mask: feature(),
        proof_mask: 0,
        plan_id: PlanId::default(),
    }
}

fn full_query(atom: Atom8, output_mask: u8) -> QueryAtom8 {
    QueryAtom8 {
        atom,
        output_mask,
        proof_mode: ProofMode::Both,
        epoch: EPOCH,
    }
}

fn bound(mut atom: Atom8, mask: u8) -> Atom8 {
    atom.binding_mask = mask;
    atom
}

fn answered(r: QueryResult) -> Vec<Decision> {
    match r {
        QueryResult::Answered(a) => a,
        other => panic!("expected Answered, got {other:?}"),
    }
}

fn denied(r: QueryResult) -> Decision {
    match r {
        QueryResult::Denied(d) => *d,
        other => panic!("expected Denied, got {other:?}"),
    }
}

// ---------------------------------------------------------------------------
// Shared fixture builder — PARARULE-Plus "people" domain (Appendix A)
//
// Predicates (unary, arity=1):
//   1=strong 2=high 3=huge 4=thin 5=small 6=quiet 7=smart 8=kind
//   9=bad 10=sad 11=rough 12=short 13=wealthy 14=nice 15=poor 16=dull
//   17=little
//
// Entities: 100=charlie 101=erin 102=bob 103=anne
// ---------------------------------------------------------------------------

struct PeopleWorld {
    k: Kernel,
    charlie: TermId,
    erin: TermId,
    bob: TermId,
    anne: TermId,
    // predicate ids
    strong: PredicateId,
    thin: PredicateId,
    quiet: PredicateId,
    smart: PredicateId,
    kind: PredicateId,
    bad: PredicateId,
    sad: PredicateId,
    short: PredicateId,
    wealthy: PredicateId,
    nice: PredicateId,
    poor: PredicateId,
    dull: PredicateId,
    little: PredicateId,
}

impl PeopleWorld {
    fn build() -> Self {
        let pred_labels: &[(u32, &str)] = &[
            (1, "strong"),
            (2, "high"),
            (3, "huge"),
            (4, "thin"),
            (5, "small"),
            (6, "quiet"),
            (7, "smart"),
            (8, "kind"),
            (9, "bad"),
            (10, "sad"),
            (11, "rough"),
            (12, "short"),
            (13, "wealthy"),
            (14, "nice"),
            (15, "poor"),
            (16, "dull"),
            (17, "little"),
        ];
        let mut cat = Catalog::new(CatalogId(1));
        for (id, label) in pred_labels {
            cat.add_predicate(PredicateMeta {
                pred_id: PredicateId(*id),
                label: label.to_string(),
                arity: 1,
                access_orders: vec![],
                proof_policy: PredicateProofPolicy::OnRequest,
                materialized: false,
            });
        }
        let charlie = cat.intern_term("charlie");
        let erin = cat.intern_term("erin");
        let bob = cat.intern_term("bob");
        let anne = cat.intern_term("anne");

        let mut k = Kernel::new(cat);

        // NonNegationRule-D2-11112 facts:
        //   charlie: strong, high, huge
        //   bob:     thin, small
        //   erin:    quiet, smart, kind
        //   anne:    bad, sad, rough
        macro_rules! load_unary {
            ($pid:expr, $entities:expr) => {{
                let rows: Vec<FactRow8> = $entities
                    .iter()
                    .map(|&e| FactRow8::new(PredicateId($pid), 1, &[e], SRC))
                    .collect();
                k.load_facts(FactBlock8::new(PredicateId($pid), 1, rows))
                    .unwrap();
            }};
        }

        load_unary!(1, [charlie]); // strong(charlie)
        load_unary!(4, [bob]); // thin(bob)
        load_unary!(5, [bob]); // small(bob)
        load_unary!(6, [erin]); // quiet(erin)
        load_unary!(7, [erin]); // smart(erin)
        load_unary!(8, [erin]); // kind(erin)
        load_unary!(9, [anne]); // bad(anne)
        load_unary!(10, [anne]); // sad(anne)
        load_unary!(11, [anne]); // rough(anne)

        // Rules from NonNegationRule-D2-11112:
        //   strong(X) ∧ thin(X)  → short(X)
        //   bad(X)   ∧ sad(X)    → poor(X)
        //   quiet(X) ∧ smart(X)  → wealthy(X)
        //   short(X)             → little(X)    [depth-2 step — NOT derivable in single query]
        //   quiet(X)             → smart(X)     [NOTE: erin already has smart as fact]
        //   wealthy(X)           → nice(X)      [depth-2 step — NOT derivable in single query]
        //   poor(X)              → dull(X)      [depth-2 step — NOT derivable in single query]

        let rules: Vec<Rule8> = vec![
            // strong∧thin→short
            simple_rule(
                1,
                Atom8::new(PredicateId(12), 1, &[v(0)]),
                &[
                    Atom8::new(PredicateId(1), 1, &[v(0)]),
                    Atom8::new(PredicateId(4), 1, &[v(0)]),
                ],
            ),
            // bad∧sad→poor
            simple_rule(
                2,
                Atom8::new(PredicateId(15), 1, &[v(0)]),
                &[
                    Atom8::new(PredicateId(9), 1, &[v(0)]),
                    Atom8::new(PredicateId(10), 1, &[v(0)]),
                ],
            ),
            // quiet∧smart→wealthy
            simple_rule(
                3,
                Atom8::new(PredicateId(13), 1, &[v(0)]),
                &[
                    Atom8::new(PredicateId(6), 1, &[v(0)]),
                    Atom8::new(PredicateId(7), 1, &[v(0)]),
                ],
            ),
            // quiet→smart (erin already has smart; this tests idempotence)
            simple_rule(
                4,
                Atom8::new(PredicateId(7), 1, &[v(0)]),
                &[Atom8::new(PredicateId(6), 1, &[v(0)])],
            ),
        ];
        for r in rules {
            k.load_rule(r).unwrap();
        }

        PeopleWorld {
            k,
            charlie,
            erin,
            bob,
            anne,
            strong: PredicateId(1),
            thin: PredicateId(4),
            quiet: PredicateId(6),
            smart: PredicateId(7),
            kind: PredicateId(8),
            bad: PredicateId(9),
            sad: PredicateId(10),
            short: PredicateId(12),
            wealthy: PredicateId(13),
            nice: PredicateId(14),
            poor: PredicateId(15),
            dull: PredicateId(16),
            little: PredicateId(17),
        }
    }

    fn query_unary(&self, pid: PredicateId, entity: TermId) -> QueryResult {
        let atom = bound(Atom8::new(pid, 1, &[entity]), 0b1);
        self.k.query(&full_query(atom, 0))
    }
}

// ---------------------------------------------------------------------------
// 1. NonNegationRule-D2-11112: direct fact retrieval
// ---------------------------------------------------------------------------

#[test]
fn pararule_d2_erin_is_quiet_fact() {
    let w = PeopleWorld::build();
    let ans = answered(w.query_unary(w.quiet, w.erin));
    assert_eq!(ans.len(), 1);
    assert_eq!(ans[0].kind, DecisionKind::Allow);
    // proof must reference a Fact node
    assert!(ans[0].proof.iter().any(|n| n.kind == ProofKind::Fact));
}

/// Counterfactual: charlie is NOT quiet (not in facts, no rule derives it).
#[test]
fn pararule_d2_charlie_is_not_quiet_denied() {
    let w = PeopleWorld::build();
    let d = denied(w.query_unary(w.quiet, w.charlie));
    assert_eq!(d.kind, DecisionKind::Deny);
    assert_ne!(d.receipt.receipt_hash, [0u8; 32]);
}

// ---------------------------------------------------------------------------
// 2. NonNegationRule-D2: one-step rule application (quiet∧smart→wealthy)
// ---------------------------------------------------------------------------

/// Erin is quiet AND smart (base facts) → wealthy(erin) derived by rule.
#[test]
fn pararule_d2_wealthy_erin_via_rule() {
    let w = PeopleWorld::build();
    let ans = answered(w.query_unary(w.wealthy, w.erin));
    assert_eq!(ans.len(), 1);
    assert_eq!(ans[0].kind, DecisionKind::Allow);
    // Proof must include a Rule node (not just Fact)
    assert!(ans[0].proof.iter().any(|n| n.kind == ProofKind::Rule));
    // and two Fact nodes (one for quiet, one for smart)
    let fact_nodes: Vec<_> = ans[0]
        .proof
        .iter()
        .filter(|n| n.kind == ProofKind::Fact)
        .collect();
    assert_eq!(fact_nodes.len(), 2, "rule had 2 body atoms → 2 fact nodes");
}

/// Counterfactual: charlie is NOT wealthy (strong but not quiet∧smart).
#[test]
fn pararule_d2_charlie_not_wealthy_denied() {
    let w = PeopleWorld::build();
    let d = denied(w.query_unary(w.wealthy, w.charlie));
    assert_eq!(d.kind, DecisionKind::Deny);
}

/// Counterfactual: bob is NOT wealthy (thin+small but no quiet or smart fact).
#[test]
fn pararule_d2_bob_not_wealthy_denied() {
    let w = PeopleWorld::build();
    let d = denied(w.query_unary(w.wealthy, w.bob));
    assert_eq!(d.kind, DecisionKind::Deny);
}

// ---------------------------------------------------------------------------
// 3. Conjunction falsification: BOTH premises required
//    Rule: short(?0) :- strong(?0), thin(?0)
//    charlie is strong but NOT thin → short(charlie) must be Denied.
//    bob is thin but NOT strong → short(bob) must be Denied.
// ---------------------------------------------------------------------------

#[test]
fn conjunction_requires_both_premises_charlie_not_short() {
    let w = PeopleWorld::build();
    // charlie is strong (fact) but not thin → rule body fails
    let d = denied(w.query_unary(w.short, w.charlie));
    assert_eq!(d.kind, DecisionKind::Deny);
}

#[test]
fn conjunction_requires_both_premises_bob_not_short() {
    let w = PeopleWorld::build();
    // bob is thin (fact) but not strong → rule body fails
    let d = denied(w.query_unary(w.short, w.bob));
    assert_eq!(d.kind, DecisionKind::Deny);
}

/// Tamper test: add thin(charlie) as a fact, now short(charlie) must be Answered.
/// This proves the test above is not passing because of implementation blindness.
#[test]
fn conjunction_charlie_becomes_short_when_thin_added() {
    let mut w = PeopleWorld::build();
    let thin_fact = FactRow8::new(w.thin, 1, &[w.charlie], SRC);
    w.k.load_facts(FactBlock8::new(w.thin, 1, vec![thin_fact]))
        .unwrap();
    let ans = answered(w.query_unary(w.short, w.charlie));
    assert_eq!(ans.len(), 1);
    assert_eq!(ans[0].kind, DecisionKind::Allow);
}

// ---------------------------------------------------------------------------
// 4. Rule: bad∧sad→poor (anne is both)
// ---------------------------------------------------------------------------

#[test]
fn pararule_d2_poor_anne_via_rule() {
    let w = PeopleWorld::build();
    let ans = answered(w.query_unary(w.poor, w.anne));
    assert_eq!(ans.len(), 1);
    assert_eq!(ans[0].kind, DecisionKind::Allow);
    assert!(ans[0].proof.iter().any(|n| n.kind == ProofKind::Rule));
}

/// Counterfactual: erin is NOT poor (kind,quiet,smart but not bad or sad).
#[test]
fn pararule_d2_erin_not_poor_denied() {
    let w = PeopleWorld::build();
    let d = denied(w.query_unary(w.poor, w.erin));
    assert_eq!(d.kind, DecisionKind::Deny);
}

// ---------------------------------------------------------------------------
// 5. Depth-2 chaining — now fully supported via recursive SLD resolution.
//
//    PARARULE-Plus at depth 2:
//      quiet(erin) ∧ smart(erin) → wealthy(erin)   [step 1]
//      wealthy(erin)              → nice(erin)       [step 2]
//
//    derive_atom_with_support recurses into rules, so both hops fire in a
//    single query() call. The depth counter caps at MAX_DERIVE_DEPTH=32.
// ---------------------------------------------------------------------------

#[test]
fn depth_2_chain_works_in_single_query() {
    let mut w = PeopleWorld::build();
    // Load the nice rule: wealthy(?0) → nice(?0)
    let nice_rule = simple_rule(
        99,
        Atom8::new(w.nice, 1, &[v(0)]),
        &[Atom8::new(w.wealthy, 1, &[v(0)])],
    );
    w.k.load_rule(nice_rule).unwrap();

    // nice(erin): quiet+smart → wealthy → nice  (two rule hops, one query call)
    let ans = answered(w.query_unary(w.nice, w.erin));
    assert_eq!(ans.len(), 1);
    assert_eq!(ans[0].kind, DecisionKind::Allow);

    // Counterfactual: charlie is not nice (not quiet, not wealthy)
    let d = denied(w.query_unary(w.nice, w.charlie));
    assert_eq!(d.kind, DecisionKind::Deny);

    // Counterfactual: anne is not nice (poor, but poor→nice is not a rule here)
    let d2 = denied(w.query_unary(w.nice, w.anne));
    assert_eq!(d2.kind, DecisionKind::Deny);
}

// ---------------------------------------------------------------------------
// 6. Variable binding extraction — findall semantics
//    Rule: wealthy(?0) :- quiet(?0), smart(?0)
//    Unbound query: wealthy(?) with output_mask=1 should return erin.
// ---------------------------------------------------------------------------

#[test]
fn variable_output_binding_returns_erin() {
    let w = PeopleWorld::build();
    let atom = Atom8::new(w.wealthy, 1, &[TermId::sentinel()]);
    let q = full_query(atom, 0b1); // output_mask: return pos-0
    let ans = answered(w.k.query(&q));
    assert_eq!(ans.len(), 1);
    assert_eq!(
        ans[0].bindings.first().copied(),
        Some(w.erin),
        "only erin should be derived wealthy"
    );
}

/// Add quiet+smart facts for another entity; both should appear.
#[test]
fn variable_output_binding_returns_multiple_entities() {
    let mut w = PeopleWorld::build();
    // Give bob quiet and smart too
    let bob_quiet = FactRow8::new(w.quiet, 1, &[w.bob], SRC);
    let bob_smart = FactRow8::new(w.smart, 1, &[w.bob], SRC);
    w.k.load_facts(FactBlock8::new(w.quiet, 1, vec![bob_quiet]))
        .unwrap();
    w.k.load_facts(FactBlock8::new(w.smart, 1, vec![bob_smart]))
        .unwrap();

    let atom = Atom8::new(w.wealthy, 1, &[TermId::sentinel()]);
    let q = full_query(atom, 0b1);
    let ans = answered(w.k.query(&q));
    assert_eq!(ans.len(), 2, "both erin and bob should be derived wealthy");

    let bindings: Vec<TermId> = ans
        .iter()
        .filter_map(|a| a.bindings.first().copied())
        .collect();
    assert!(bindings.contains(&w.erin));
    assert!(bindings.contains(&w.bob));
}

// ---------------------------------------------------------------------------
// 7. Multiple rules deriving the same head — all must fire (completeness)
//    From PrologMCP Section 5.1 accuracy-by-rule-type analysis.
//
//    Rule A: smart(?0) :- kind(?0)
//    Rule B: smart(?0) :- quiet(?0)
//    Facts:  kind(alice), quiet(alice)   ← both rules applicable to alice
//            kind(bob)                   ← only rule A applicable
//            quiet(carol)                ← only rule B applicable
// ---------------------------------------------------------------------------

fn build_multi_rule_world() -> (
    Kernel,
    TermId,
    TermId,
    TermId,
    PredicateId,
    PredicateId,
    PredicateId,
) {
    let mut cat = Catalog::new(CatalogId(50));
    for (id, label) in [(1u32, "kind"), (2u32, "quiet"), (3u32, "smart")] {
        cat.add_predicate(PredicateMeta {
            pred_id: PredicateId(id),
            label: label.into(),
            arity: 1,
            access_orders: vec![],
            proof_policy: PredicateProofPolicy::OnRequest,
            materialized: false,
        });
    }
    let alice = cat.intern_term("alice");
    let bob = cat.intern_term("bob");
    let carol = cat.intern_term("carol");

    let mut k = Kernel::new(cat);

    k.load_facts(FactBlock8::new(
        PredicateId(1),
        1,
        vec![
            FactRow8::new(PredicateId(1), 1, &[alice], SRC),
            FactRow8::new(PredicateId(1), 1, &[bob], SRC),
        ],
    ))
    .unwrap();
    k.load_facts(FactBlock8::new(
        PredicateId(2),
        1,
        vec![
            FactRow8::new(PredicateId(2), 1, &[alice], SRC),
            FactRow8::new(PredicateId(2), 1, &[carol], SRC),
        ],
    ))
    .unwrap();

    // Rule A: smart(?0) :- kind(?0)
    k.load_rule(simple_rule(
        10,
        Atom8::new(PredicateId(3), 1, &[v(0)]),
        &[Atom8::new(PredicateId(1), 1, &[v(0)])],
    ))
    .unwrap();
    // Rule B: smart(?0) :- quiet(?0)
    k.load_rule(simple_rule(
        11,
        Atom8::new(PredicateId(3), 1, &[v(0)]),
        &[Atom8::new(PredicateId(2), 1, &[v(0)])],
    ))
    .unwrap();

    (
        k,
        alice,
        bob,
        carol,
        PredicateId(1),
        PredicateId(2),
        PredicateId(3),
    )
}

/// alice has both kind and quiet → smart(alice) is proven (distinct-conclusion semantics).
/// Two rules both fire but the answer is deduplicated to one conclusion per binding.
/// To verify both rules fired, use an unbound query over distinct entities.
#[test]
fn multi_rule_alice_is_smart() {
    let (k, alice, _bob, _carol, _kind, _quiet, smart) = build_multi_rule_world();
    let atom = bound(Atom8::new(smart, 1, &[alice]), 0b1);
    let ans = answered(k.query(&full_query(atom, 0)));
    assert_eq!(
        ans.len(),
        1,
        "one conclusion: alice is smart (two proofs deduped to one)"
    );
    assert_eq!(ans[0].kind, DecisionKind::Allow);
}

/// Unbound query: smart(?) returns three entities via two different rules.
/// alice (kind+quiet), bob (kind only), carol (quiet only) — all distinct bindings.
#[test]
fn multi_rule_unbound_finds_all_entities() {
    let (k, alice, bob, carol, _kind, _quiet, smart) = build_multi_rule_world();
    let atom = Atom8::new(smart, 1, &[TermId::sentinel()]);
    let ans = answered(k.query(&full_query(atom, 0b1)));
    let bindings: Vec<TermId> = ans
        .iter()
        .filter_map(|a| a.bindings.first().copied())
        .collect();
    assert!(bindings.contains(&alice), "alice should be smart");
    assert!(bindings.contains(&bob), "bob should be smart via kind");
    assert!(bindings.contains(&carol), "carol should be smart via quiet");
    assert_eq!(bindings.len(), 3, "exactly three distinct entities");
}

/// bob has only kind → exactly ONE derivation.
#[test]
fn multi_rule_bob_gets_one_derivation() {
    let (k, _alice, bob, _carol, _kind, _quiet, smart) = build_multi_rule_world();
    let atom = bound(Atom8::new(smart, 1, &[bob]), 0b1);
    let ans = answered(k.query(&full_query(atom, 0)));
    assert_eq!(ans.len(), 1);
}

/// carol has only quiet → exactly ONE derivation.
#[test]
fn multi_rule_carol_gets_one_derivation() {
    let (k, _alice, _bob, carol, _kind, _quiet, smart) = build_multi_rule_world();
    let atom = bound(Atom8::new(smart, 1, &[carol]), 0b1);
    let ans = answered(k.query(&full_query(atom, 0)));
    assert_eq!(ans.len(), 1);
}

// ---------------------------------------------------------------------------
// 8. NegationRule-D2-6305 case study: NAF (negation-as-failure)
//    Paper Section 5.1:
//      Facts: Fiona=smart  (not rough — absence from fact base)
//      Rule:  quiet(?0) :- smart(?0), \+rough(?0)
//
//    PARARULE-Plus semantics: \+rough(X) checks the initial fact base only.
//    prolog8 NAF: \+P(X) succeeds iff derive_atom_with_support(P(X)) is empty.
// ---------------------------------------------------------------------------

fn naf_world() -> (
    Kernel,
    TermId,
    TermId,
    PredicateId,
    PredicateId,
    PredicateId,
) {
    let mut cat = Catalog::new(CatalogId(60));
    for (id, label) in [(1u32, "smart"), (2u32, "rough"), (3u32, "quiet")] {
        cat.add_predicate(PredicateMeta {
            pred_id: PredicateId(id),
            label: label.into(),
            arity: 1,
            access_orders: vec![],
            proof_policy: PredicateProofPolicy::OnRequest,
            materialized: false,
        });
    }
    let fiona = cat.intern_term("fiona");
    let gary = cat.intern_term("gary");
    let mut k = Kernel::new(cat);

    // fiona: smart only (not rough) → quiet should be derived
    // gary:  smart AND rough        → quiet must NOT be derived
    k.load_facts(FactBlock8::new(
        PredicateId(1),
        1,
        vec![
            FactRow8::new(PredicateId(1), 1, &[fiona], SRC),
            FactRow8::new(PredicateId(1), 1, &[gary], SRC),
        ],
    ))
    .unwrap();
    k.load_facts(FactBlock8::new(
        PredicateId(2),
        1,
        vec![
            FactRow8::new(PredicateId(2), 1, &[gary], SRC), // only gary is rough
        ],
    ))
    .unwrap();

    // Rule: quiet(?0) :- smart(?0), \+rough(?0)
    // negation_mask bit 1 = body[1] (rough) is negated
    let mut naf_rule = simple_rule(
        1,
        Atom8::new(PredicateId(3), 1, &[v(0)]),
        &[
            Atom8::new(PredicateId(1), 1, &[v(0)]), // body[0]: smart(?0)  — positive
            Atom8::new(PredicateId(2), 1, &[v(0)]), // body[1]: \+rough(?0) — negated
        ],
    );
    naf_rule.feature_mask |= FeatureBit::StratifiedNegation.mask();
    naf_rule.negation_mask = 0b10; // bit 1 set → body[1] is negated
    k.load_rule(naf_rule).unwrap();

    (
        k,
        fiona,
        gary,
        PredicateId(1),
        PredicateId(2),
        PredicateId(3),
    )
}

/// fiona is smart and NOT rough → quiet(fiona) must be derived.
#[test]
fn naf_quiet_fiona_derived_when_not_rough() {
    let (k, fiona, _gary, _smart, _rough, quiet) = naf_world();
    let atom = bound(Atom8::new(quiet, 1, &[fiona]), 0b1);
    let ans = answered(k.query(&full_query(atom, 0)));
    assert_eq!(ans.len(), 1);
    assert_eq!(ans[0].kind, DecisionKind::Allow);
}

/// gary is smart AND rough → \+rough(gary) fails → quiet(gary) must be DENIED.
#[test]
fn naf_quiet_gary_denied_when_rough() {
    let (k, _fiona, gary, _smart, _rough, quiet) = naf_world();
    let atom = bound(Atom8::new(quiet, 1, &[gary]), 0b1);
    let d = denied(k.query(&full_query(atom, 0)));
    assert_eq!(d.kind, DecisionKind::Deny);
}

/// Unbound query: quiet(?) returns only fiona, not gary.
#[test]
fn naf_unbound_quiet_returns_only_not_rough_entities() {
    let (k, fiona, gary, _smart, _rough, quiet) = naf_world();
    let atom = Atom8::new(quiet, 1, &[TermId::sentinel()]);
    let ans = answered(k.query(&full_query(atom, 0b1)));
    let bindings: Vec<TermId> = ans
        .iter()
        .filter_map(|a| a.bindings.first().copied())
        .collect();
    assert!(bindings.contains(&fiona), "fiona must be quiet");
    assert!(
        !bindings.contains(&gary),
        "gary must NOT be quiet (is rough)"
    );
    assert_eq!(bindings.len(), 1);
}

/// Tamper test: add rough(fiona) as a fact — now quiet(fiona) must be DENIED.
/// Proves the NAF check is live (not vacuous).
#[test]
fn naf_quiet_fiona_denied_after_rough_fact_added() {
    let (mut k, fiona, _gary, _smart, rough, quiet) = naf_world();
    k.load_facts(FactBlock8::new(
        rough,
        1,
        vec![FactRow8::new(rough, 1, &[fiona], SRC)],
    ))
    .unwrap();
    let atom = bound(Atom8::new(quiet, 1, &[fiona]), 0b1);
    let d = denied(k.query(&full_query(atom, 0)));
    assert_eq!(d.kind, DecisionKind::Deny);
}

/// NAF with derived negated atom: \+derived(X) fails when a rule derives it.
/// Tests NAF against rule-derived predicates, not just base facts.
#[test]
fn naf_blocks_when_negated_atom_derived_by_rule() {
    let mut cat = Catalog::new(CatalogId(62));
    for (id, label) in [(1u32, "base"), (2u32, "derived"), (3u32, "blocked")] {
        cat.add_predicate(PredicateMeta {
            pred_id: PredicateId(id),
            label: label.into(),
            arity: 1,
            access_orders: vec![],
            proof_policy: PredicateProofPolicy::OnRequest,
            materialized: false,
        });
    }
    let x = cat.intern_term("x");
    let mut k = Kernel::new(cat);

    k.load_facts(FactBlock8::new(
        PredicateId(1),
        1,
        vec![FactRow8::new(PredicateId(1), 1, &[x], SRC)],
    ))
    .unwrap();

    // Rule A: derived(?0) :- base(?0)
    k.load_rule(simple_rule(
        1,
        Atom8::new(PredicateId(2), 1, &[v(0)]),
        &[Atom8::new(PredicateId(1), 1, &[v(0)])],
    ))
    .unwrap();

    // Rule B: blocked(?0) :- base(?0), \+derived(?0)
    // Since derived(x) IS derivable, blocked(x) must be DENIED.
    let mut naf_rule = simple_rule(
        2,
        Atom8::new(PredicateId(3), 1, &[v(0)]),
        &[
            Atom8::new(PredicateId(1), 1, &[v(0)]),
            Atom8::new(PredicateId(2), 1, &[v(0)]),
        ],
    );
    naf_rule.feature_mask |= FeatureBit::StratifiedNegation.mask();
    naf_rule.negation_mask = 0b10;
    k.load_rule(naf_rule).unwrap();

    let atom = bound(Atom8::new(PredicateId(3), 1, &[x]), 0b1);
    let d = denied(k.query(&full_query(atom, 0)));
    assert_eq!(
        d.kind,
        DecisionKind::Deny,
        "blocked(x) must fail because \\+derived(x) fails (derived(x) IS derivable)"
    );
}

// ---------------------------------------------------------------------------
// 9. Receipt chain integrity across decisions
// ---------------------------------------------------------------------------

/// Same query twice → bit-exact receipt hashes.
#[test]
fn receipt_hash_is_deterministic_across_repeated_queries() {
    let w = PeopleWorld::build();
    let ans1 = answered(w.query_unary(w.wealthy, w.erin));
    let ans2 = answered(w.query_unary(w.wealthy, w.erin));
    assert_eq!(
        ans1[0].receipt.receipt_hash, ans2[0].receipt.receipt_hash,
        "receipt must be deterministic"
    );
}

/// Different queries → DIFFERENT receipt hashes (receipt binds to the query).
#[test]
fn receipt_hash_differs_for_different_queries() {
    let w = PeopleWorld::build();
    // wealthy(erin) — Allow
    let r_allow = answered(w.query_unary(w.wealthy, w.erin));
    // wealthy(charlie) — Deny
    let r_deny = denied(w.query_unary(w.wealthy, w.charlie));

    assert_ne!(
        r_allow[0].receipt.receipt_hash, r_deny.receipt.receipt_hash,
        "allow and deny receipts must differ"
    );
}

/// Different predicates on the same entity → different receipts.
#[test]
fn receipt_hash_differs_for_different_predicates() {
    let w = PeopleWorld::build();
    let r1 = answered(w.query_unary(w.quiet, w.erin));
    let r2 = answered(w.query_unary(w.smart, w.erin));
    assert_ne!(
        r1[0].receipt.receipt_hash, r2[0].receipt.receipt_hash,
        "different queries must produce different receipts"
    );
}

/// Every Deny receipt is non-zero (cannot be forged as uninitialised).
#[test]
fn all_deny_receipts_are_nonzero() {
    let w = PeopleWorld::build();
    let entities = [w.charlie, w.erin, w.bob, w.anne];
    // neither charlie nor bob nor anne can be derived wealthy
    for entity in [w.charlie, w.bob, w.anne] {
        let d = denied(w.query_unary(w.wealthy, entity));
        assert_ne!(
            d.receipt.receipt_hash, [0u8; 32],
            "deny receipt_hash must be non-zero for entity {entity:?}"
        );
    }
    // none of the entities are nice (requires two-hop derivation)
    for entity in entities {
        let d = denied(w.query_unary(w.nice, entity));
        assert_ne!(
            d.receipt.receipt_hash, [0u8; 32],
            "deny receipt_hash must be non-zero for entity {entity:?}"
        );
    }
}

// ---------------------------------------------------------------------------
// 10. Proof DAG structure invariants (from paper's trace_goal semantics)
// ---------------------------------------------------------------------------

/// Every rule-derived Allow answer has exactly: N Fact nodes + 1 Rule node.
#[test]
fn proof_dag_has_correct_structure_for_rule_answer() {
    let w = PeopleWorld::build();
    // wealthy(erin) via quiet∧smart→wealthy (2-body rule)
    let ans = answered(w.query_unary(w.wealthy, w.erin));
    let proof = &ans[0].proof;

    let fact_count = proof.iter().filter(|n| n.kind == ProofKind::Fact).count();
    let rule_count = proof.iter().filter(|n| n.kind == ProofKind::Rule).count();

    assert_eq!(fact_count, 2, "2-body rule needs 2 fact nodes");
    assert_eq!(rule_count, 1, "exactly one rule application");

    // Rule node must have child_count = 2
    let rule_node = proof.iter().find(|n| n.kind == ProofKind::Rule).unwrap();
    assert_eq!(rule_node.child_count, 2);

    // All node_hashes must be non-zero
    for node in proof {
        assert_ne!(node.node_hash, [0u8; 32], "node hash must be computed");
    }
}

/// Fact answers have a single Fact node and no Rule node.
#[test]
fn proof_dag_has_single_fact_node_for_direct_lookup() {
    let w = PeopleWorld::build();
    let ans = answered(w.query_unary(w.quiet, w.erin));
    let proof = &ans[0].proof;

    assert_eq!(
        proof.iter().filter(|n| n.kind == ProofKind::Fact).count(),
        1
    );
    assert_eq!(
        proof.iter().filter(|n| n.kind == ProofKind::Rule).count(),
        0
    );
}

/// Deny answers have exactly one MissingFact node.
#[test]
fn proof_dag_missing_fact_node_for_deny() {
    let w = PeopleWorld::build();
    let d = denied(w.query_unary(w.wealthy, w.charlie));
    assert_eq!(d.proof.len(), 1);
    assert_eq!(d.proof[0].kind, ProofKind::MissingFact);
    assert_ne!(d.proof[0].node_hash, [0u8; 32]);
}

// ---------------------------------------------------------------------------
// 11. Receipt hash covers the rule set (rule_root binds to loaded rules)
// ---------------------------------------------------------------------------

/// Same facts, different rules → different receipt hash.
#[test]
fn receipt_changes_when_rule_set_changes() {
    let w = PeopleWorld::build();

    // Query wealthy(erin) with the default rule set
    let ans_with_rule = answered(w.query_unary(w.wealthy, w.erin));
    let hash_with_rule = ans_with_rule[0].receipt.receipt_hash;

    // Build an identical kernel but WITHOUT the wealthy rule
    let mut cat2 = Catalog::new(CatalogId(1));
    for (id, label) in [(6u32, "quiet"), (7u32, "smart"), (13u32, "wealthy")] {
        cat2.add_predicate(PredicateMeta {
            pred_id: PredicateId(id),
            label: label.into(),
            arity: 1,
            access_orders: vec![],
            proof_policy: PredicateProofPolicy::OnRequest,
            materialized: false,
        });
    }
    let erin2 = cat2.intern_term("erin");
    let mut k2 = Kernel::new(cat2);
    k2.load_facts(FactBlock8::new(
        PredicateId(6),
        1,
        vec![FactRow8::new(PredicateId(6), 1, &[erin2], SRC)],
    ))
    .unwrap();
    k2.load_facts(FactBlock8::new(
        PredicateId(7),
        1,
        vec![FactRow8::new(PredicateId(7), 1, &[erin2], SRC)],
    ))
    .unwrap();
    // No wealthy rule loaded — deny path
    let d = denied(k2.query(&full_query(
        bound(Atom8::new(PredicateId(13), 1, &[erin2]), 0b1),
        0,
    )));

    assert_ne!(
        hash_with_rule, d.receipt.receipt_hash,
        "different rule sets must produce different receipts"
    );
}

// ---------------------------------------------------------------------------
// 12. Cycle termination via visited-set
//    Rule A: p(?0) :- q(?0)
//    Rule B: q(?0) :- p(?0)
//    No base facts. Query p(x) must terminate (not infinite loop) and return Denied.
// ---------------------------------------------------------------------------

#[test]
fn cyclic_rules_terminate_with_deny() {
    let mut cat = Catalog::new(CatalogId(70));
    cat.add_predicate(PredicateMeta {
        pred_id: PredicateId(1),
        label: "p".into(),
        arity: 1,
        access_orders: vec![],
        proof_policy: PredicateProofPolicy::OnRequest,
        materialized: false,
    });
    cat.add_predicate(PredicateMeta {
        pred_id: PredicateId(2),
        label: "q".into(),
        arity: 1,
        access_orders: vec![],
        proof_policy: PredicateProofPolicy::OnRequest,
        materialized: false,
    });
    let x = cat.intern_term("x");
    let mut k = Kernel::new(cat);

    // p(?0) :- q(?0) and q(?0) :- p(?0) — mutual recursion, no base facts
    k.load_rule(simple_rule(
        1,
        Atom8::new(PredicateId(1), 1, &[v(0)]),
        &[Atom8::new(PredicateId(2), 1, &[v(0)])],
    ))
    .unwrap();
    k.load_rule(simple_rule(
        2,
        Atom8::new(PredicateId(2), 1, &[v(0)]),
        &[Atom8::new(PredicateId(1), 1, &[v(0)])],
    ))
    .unwrap();

    // Must terminate (visited-set cap) and return Denied
    let atom = bound(Atom8::new(PredicateId(1), 1, &[x]), 0b1);
    let d = denied(k.query(&full_query(atom, 0)));
    assert_eq!(d.kind, DecisionKind::Deny);
    assert_ne!(d.receipt.receipt_hash, [0u8; 32]);
}

// ---------------------------------------------------------------------------
// 13. PARARULE-Plus depth-5 equivalent (all-base-fact body)
//    The paper shows Prolog reaches perfect accuracy at depth 5 while LLMs fail.
//    prolog8 can handle this for the SINGLE RULE APPLICATION case where all 5
//    conjuncts are base facts.
//
//    Rule: conclusion(?0) :- a(?0), b(?0), c(?0), d(?0), e(?0)
//    Facts: all 5 facts hold for entity "x"
//    Query: conclusion(x) → Answered
//    Counterfactual: conclusion(y) where only 4/5 facts hold → Denied
// ---------------------------------------------------------------------------

#[test]
fn depth5_five_conjunct_rule_all_facts_present() {
    let mut cat = Catalog::new(CatalogId(80));
    for (id, label) in [
        (1u32, "a"),
        (2u32, "b"),
        (3u32, "c"),
        (4u32, "d"),
        (5u32, "e"),
        (6u32, "concl"),
    ] {
        cat.add_predicate(PredicateMeta {
            pred_id: PredicateId(id),
            label: label.into(),
            arity: 1,
            access_orders: vec![],
            proof_policy: PredicateProofPolicy::OnRequest,
            materialized: false,
        });
    }
    let x = cat.intern_term("x");
    let y = cat.intern_term("y");
    let mut k = Kernel::new(cat);

    // x has all 5 base facts; y is missing fact e
    for pid in 1u32..=5 {
        let mut rows = vec![FactRow8::new(PredicateId(pid), 1, &[x], SRC)];
        if pid < 5 {
            rows.push(FactRow8::new(PredicateId(pid), 1, &[y], SRC));
        }
        k.load_facts(FactBlock8::new(PredicateId(pid), 1, rows))
            .unwrap();
    }

    // Rule: concl(?0) :- a(?0), b(?0), c(?0), d(?0), e(?0)
    k.load_rule(simple_rule(
        1,
        Atom8::new(PredicateId(6), 1, &[v(0)]),
        &[
            Atom8::new(PredicateId(1), 1, &[v(0)]),
            Atom8::new(PredicateId(2), 1, &[v(0)]),
            Atom8::new(PredicateId(3), 1, &[v(0)]),
            Atom8::new(PredicateId(4), 1, &[v(0)]),
            Atom8::new(PredicateId(5), 1, &[v(0)]),
        ],
    ))
    .unwrap();

    // x: all 5 premises → Answered
    let ans = answered(k.query(&full_query(
        bound(Atom8::new(PredicateId(6), 1, &[x]), 0b1),
        0,
    )));
    assert_eq!(ans.len(), 1);
    assert_eq!(ans[0].kind, DecisionKind::Allow);
    let fact_nodes = ans[0]
        .proof
        .iter()
        .filter(|n| n.kind == ProofKind::Fact)
        .count();
    assert_eq!(fact_nodes, 5, "5-body rule needs 5 fact nodes in proof");

    // y: missing e → Denied
    let d = denied(k.query(&full_query(
        bound(Atom8::new(PredicateId(6), 1, &[y]), 0b1),
        0,
    )));
    assert_eq!(d.kind, DecisionKind::Deny);
}

// ---------------------------------------------------------------------------
// 14. Fact hash collision resistance
//    Different predicates on same args → different hashes.
//    Same predicate, permuted args → different hashes.
// ---------------------------------------------------------------------------

#[test]
fn fact_hash_encodes_predicate_id() {
    let r1 = FactRow8::new(PredicateId(1), 1, &[TermId(42)], SRC);
    let r2 = FactRow8::new(PredicateId(2), 1, &[TermId(42)], SRC);
    assert_ne!(
        r1.fact_hash, r2.fact_hash,
        "predicate id must influence hash"
    );
}

#[test]
fn fact_hash_encodes_argument_order() {
    let r1 = FactRow8::new(PredicateId(1), 2, &[TermId(10), TermId(20)], SRC);
    let r2 = FactRow8::new(PredicateId(1), 2, &[TermId(20), TermId(10)], SRC);
    assert_ne!(
        r1.fact_hash, r2.fact_hash,
        "argument order must influence hash"
    );
}

#[test]
fn fact_hash_is_nonzero() {
    let r = FactRow8::new(PredicateId(1), 1, &[TermId(1)], SRC);
    assert_ne!(r.fact_hash, [0u8; 32]);
}

// ---------------------------------------------------------------------------
// 15. NonNegationRule-Animal-D2-13824: wolf is lazy
//    wolf: dull, sleepy → dull∧sleepy→slow (rule), slow→lazy (depth-2, needs materialise)
//    depth-1 portion: dull∧sleepy→slow is directly testable.
// ---------------------------------------------------------------------------

#[test]
fn animal_wolf_is_slow_via_dull_and_sleepy() {
    let mut cat = Catalog::new(CatalogId(90));
    for (id, label) in [(1u32, "dull"), (2u32, "sleepy"), (3u32, "slow")] {
        cat.add_predicate(PredicateMeta {
            pred_id: PredicateId(id),
            label: label.into(),
            arity: 1,
            access_orders: vec![],
            proof_policy: PredicateProofPolicy::OnRequest,
            materialized: false,
        });
    }
    let wolf = cat.intern_term("wolf");
    let mouse = cat.intern_term("mouse"); // smart, kind, round, small — NOT dull or sleepy
    let mut k = Kernel::new(cat);

    k.load_facts(FactBlock8::new(
        PredicateId(1),
        1,
        vec![FactRow8::new(PredicateId(1), 1, &[wolf], SRC)],
    ))
    .unwrap();
    k.load_facts(FactBlock8::new(
        PredicateId(2),
        1,
        vec![FactRow8::new(PredicateId(2), 1, &[wolf], SRC)],
    ))
    .unwrap();

    // Rule: slow(?0) :- dull(?0), sleepy(?0)
    k.load_rule(simple_rule(
        1,
        Atom8::new(PredicateId(3), 1, &[v(0)]),
        &[
            Atom8::new(PredicateId(1), 1, &[v(0)]),
            Atom8::new(PredicateId(2), 1, &[v(0)]),
        ],
    ))
    .unwrap();

    // wolf: dull∧sleepy → slow
    let ans = answered(k.query(&full_query(
        bound(Atom8::new(PredicateId(3), 1, &[wolf]), 0b1),
        0,
    )));
    assert_eq!(ans.len(), 1);
    assert_eq!(ans[0].kind, DecisionKind::Allow);

    // mouse: NOT dull, NOT sleepy → NOT slow (counterfactual)
    let d = denied(k.query(&full_query(
        bound(Atom8::new(PredicateId(3), 1, &[mouse]), 0b1),
        0,
    )));
    assert_eq!(d.kind, DecisionKind::Deny);
}

// ---------------------------------------------------------------------------
// 16. Rule ordering independence
//    Result must not change regardless of rule load order.
// ---------------------------------------------------------------------------

#[test]
fn rule_ordering_does_not_affect_derivability() {
    // Each entity satisfies exactly one base predicate → exactly one rule.
    // Three distinct entities x,y,z → three distinct binding answers regardless of rule order.
    fn make_kernel_with_order(rule_order: &[u32]) -> (Kernel, TermId, TermId, TermId, PredicateId) {
        let mut cat = Catalog::new(CatalogId(100));
        for (id, label) in [(1u32, "a"), (2u32, "b"), (3u32, "c"), (4u32, "target")] {
            cat.add_predicate(PredicateMeta {
                pred_id: PredicateId(id),
                label: label.into(),
                arity: 1,
                access_orders: vec![],
                proof_policy: PredicateProofPolicy::OnRequest,
                materialized: false,
            });
        }
        let x = cat.intern_term("x"); // has only fact a(x) → matched by rule A
        let y = cat.intern_term("y"); // has only fact b(y) → matched by rule B
        let z = cat.intern_term("z"); // has only fact c(z) → matched by rule C
        let mut k = Kernel::new(cat);

        k.load_facts(FactBlock8::new(
            PredicateId(1),
            1,
            vec![FactRow8::new(PredicateId(1), 1, &[x], SRC)],
        ))
        .unwrap();
        k.load_facts(FactBlock8::new(
            PredicateId(2),
            1,
            vec![FactRow8::new(PredicateId(2), 1, &[y], SRC)],
        ))
        .unwrap();
        k.load_facts(FactBlock8::new(
            PredicateId(3),
            1,
            vec![FactRow8::new(PredicateId(3), 1, &[z], SRC)],
        ))
        .unwrap();

        let rules: Vec<Rule8> = vec![
            simple_rule(
                1,
                Atom8::new(PredicateId(4), 1, &[v(0)]),
                &[Atom8::new(PredicateId(1), 1, &[v(0)])],
            ),
            simple_rule(
                2,
                Atom8::new(PredicateId(4), 1, &[v(0)]),
                &[Atom8::new(PredicateId(2), 1, &[v(0)])],
            ),
            simple_rule(
                3,
                Atom8::new(PredicateId(4), 1, &[v(0)]),
                &[Atom8::new(PredicateId(3), 1, &[v(0)])],
            ),
        ];
        let rule_map: std::collections::HashMap<u32, Rule8> =
            rules.into_iter().map(|r| (r.rule_id.0, r)).collect();
        for &id in rule_order {
            k.load_rule(rule_map[&id].clone()).unwrap();
        }
        (k, x, y, z, PredicateId(4))
    }

    let orders = [
        [1u32, 2, 3],
        [1, 3, 2],
        [2, 1, 3],
        [2, 3, 1],
        [3, 1, 2],
        [3, 2, 1],
    ];

    for order in &orders {
        let (k, x, y, z, target) = make_kernel_with_order(order);
        // Unbound query: target(?) → should find x, y, z (three distinct entities)
        let atom = Atom8::new(target, 1, &[TermId::sentinel()]);
        let ans = answered(k.query(&full_query(atom, 0b1)));
        let bindings: Vec<TermId> = ans
            .iter()
            .filter_map(|a| a.bindings.first().copied())
            .collect();
        assert!(
            bindings.contains(&x),
            "x must be target via rule A (order {order:?})"
        );
        assert!(
            bindings.contains(&y),
            "y must be target via rule B (order {order:?})"
        );
        assert!(
            bindings.contains(&z),
            "z must be target via rule C (order {order:?})"
        );
        assert_eq!(
            bindings.len(),
            3,
            "exactly three distinct entities (order {order:?})"
        );
    }
}
