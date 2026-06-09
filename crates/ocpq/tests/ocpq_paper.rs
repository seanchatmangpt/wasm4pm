//! OCPQ runtime tests — oracle is *Küsters & van der Aalst, "OCPQ" (2025)*.
//!
//! These tests reproduce the paper's formal objects (Defs. 3–9, Fig. 6) over a
//! hand-authored Order-to-Cash OCED. **No FM-5 self-reference**: every expected
//! value is derived from the paper's definitions and the hand-told story, never
//! by calling the function under test to compute its own oracle.
//!
//! The OCED uses the paper's own type names — object types `orders`,
//! `customers`; event types `confirm order`, `pay order`, `payment reminder` —
//! so the Fig. 6 constraint maps verbatim.

use std::collections::BTreeMap;

use ocpq::{
    evaluate_constraint, evaluate_query, BasicPredicate, Binding, BindingBox, ChildSet,
    ConstraintPredicate, Edge, Node, QueryTree, VarDecl, VarKind,
};
use wasm4pm_compat::ocel::OCEL;

/// Four-weeks-in-seconds, the `tmax` of the Fig. 6 `TBE` interval.
const FOUR_WEEKS_SECS: i64 = 28 * 24 * 3600;

/// Order-to-Cash OCED for the Fig. 6 story, with exactly the structure the
/// paper's constraint reasons about:
///
/// - `o_a` (orders): confirmed `ev_ca` (Mar-01), paid `ev_pa` (Mar-08, +7 d)
///   → **paid within 4 weeks, exactly once** ⇒ should be *satisfied* (✓).
/// - `o_b` (orders): confirmed `ev_cb` (Mar-01), paid `ev_pb` (Apr-15, +45 d)
///   → **not paid within 4 weeks** ⇒ should be *violated* (✗).
/// - `o_c` (orders): confirmed `ev_cc` (Mar-01), **never paid**
///   → no payment in [0, 4w] ⇒ should be *violated* (✗).
///
/// O2O wiring: every order placed_by customer `cust`. E2O wiring: each
/// confirm/pay/reminder event references its order with qualifier `order`.
fn order_to_cash_fig6() -> OCEL {
    let json = r#"
    {
      "eventTypes": [
        {"name": "confirm order"},
        {"name": "pay order"},
        {"name": "payment reminder"}
      ],
      "objectTypes": [
        {"name": "orders"},
        {"name": "customers"}
      ],
      "objects": [
        {"id": "cust", "type": "customers", "attributes": [], "relationships": []},
        {"id": "o_a", "type": "orders", "attributes": [],
         "relationships": [{"objectId": "cust", "qualifier": "placed_by"}]},
        {"id": "o_b", "type": "orders", "attributes": [],
         "relationships": [{"objectId": "cust", "qualifier": "placed_by"}]},
        {"id": "o_c", "type": "orders", "attributes": [],
         "relationships": [{"objectId": "cust", "qualifier": "placed_by"}]}
      ],
      "events": [
        {"id": "ev_ca", "type": "confirm order", "time": "2024-03-01T09:00:00Z",
         "attributes": [],
         "relationships": [{"objectId": "o_a", "qualifier": "order"}]},
        {"id": "ev_pa", "type": "pay order", "time": "2024-03-08T09:00:00Z",
         "attributes": [],
         "relationships": [{"objectId": "o_a", "qualifier": "order"}]},

        {"id": "ev_cb", "type": "confirm order", "time": "2024-03-01T09:00:00Z",
         "attributes": [],
         "relationships": [{"objectId": "o_b", "qualifier": "order"}]},
        {"id": "ev_pb", "type": "pay order", "time": "2024-04-15T09:00:00Z",
         "attributes": [],
         "relationships": [{"objectId": "o_b", "qualifier": "order"}]},

        {"id": "ev_cc", "type": "confirm order", "time": "2024-03-01T09:00:00Z",
         "attributes": [],
         "relationships": [{"objectId": "o_c", "qualifier": "order"}]}
      ]
    }"#;
    serde_json::from_str(json).expect("fixture must parse")
}

// ---------------------------------------------------------------------------
// Def. 5 — BASIC predicates: E2O, O2O, TBE
// ---------------------------------------------------------------------------

#[test]
fn def5_e2o_holds_iff_event_references_object_with_qualifier() {
    // Oracle: Def. 5 E2O(v,v',q) ⇔ b(v')∈obj_L^q(b(v)). By the story, confirm
    // event ev_ca references o_a with qualifier "order" and references nothing
    // else. So E2O(e1,o1,order) holds for {e1↦ev_ca, o1↦o_a}, but NOT for o_b.
    let log = order_to_cash_fig6();
    let e2o = BasicPredicate::E2O {
        event: "e1".into(),
        object: "o1".into(),
        qualifier: Some("order".into()),
    };

    let b_hit = Binding::empty().with("e1", "ev_ca").with("o1", "o_a");
    assert!(e2o.holds(&b_hit, &log), "ev_ca references o_a as 'order'");

    let b_miss = Binding::empty().with("e1", "ev_ca").with("o1", "o_b");
    assert!(!e2o.holds(&b_miss, &log), "ev_ca does NOT reference o_b");

    // `*` qualifier (None) must also match the existing 'order' arc.
    let e2o_star = BasicPredicate::E2O {
        event: "e1".into(),
        object: "o1".into(),
        qualifier: None,
    };
    assert!(
        e2o_star.holds(&b_hit, &log),
        "* matches the 'order' qualifier"
    );

    // Wrong qualifier must fail (the arc exists, but as 'order', not 'foo').
    let e2o_wrongq = BasicPredicate::E2O {
        event: "e1".into(),
        object: "o1".into(),
        qualifier: Some("foo".into()),
    };
    assert!(
        !e2o_wrongq.holds(&b_hit, &log),
        "qualifier 'foo' does not exist"
    );
}

#[test]
fn def5_e2o_false_when_variable_unbound() {
    // Oracle: a referenced variable bound to ⊥ cannot be in any relation
    // (paper: b_5 ⊭ s_1 because b_5 does not assign o2). Here o1 is unbound.
    let log = order_to_cash_fig6();
    let e2o = BasicPredicate::E2O {
        event: "e1".into(),
        object: "o1".into(),
        qualifier: None,
    };
    let b = Binding::empty().with("e1", "ev_ca"); // o1 missing
    assert!(!e2o.holds(&b, &log));
}

#[test]
fn def5_o2o_holds_iff_object_references_object_with_qualifier() {
    // Oracle: Def. 5 O2O(v,v',q) ⇔ b(v')∈obj_L^q(b(v)). Story: o_a placed_by
    // cust. So O2O(order,customer,placed_by) holds for {order↦o_a, customer↦cust}.
    let log = order_to_cash_fig6();
    let o2o = BasicPredicate::O2O {
        from: "order".into(),
        to: "customer".into(),
        qualifier: Some("placed_by".into()),
    };
    let b = Binding::empty()
        .with("order", "o_a")
        .with("customer", "cust");
    assert!(o2o.holds(&b, &log));

    // Reverse direction is NOT an O2O arc in the data (customer has no refs).
    let rev = Binding::empty()
        .with("order", "cust")
        .with("customer", "o_a");
    assert!(
        !o2o.holds(&rev, &log),
        "no placed_by arc from customer to order"
    );
}

#[test]
fn def5_tbe_respects_time_window_inclusive() {
    // Oracle: Def. 5 TBE(v,v',tmin,tmax) ⇔ tmin ≤ time(v')−time(v) ≤ tmax.
    // ev_ca = Mar-01 09:00, ev_pa = Mar-08 09:00 ⇒ gap = 7 days = 604800 s.
    let log = order_to_cash_fig6();
    let seven_days = 7 * 24 * 3600;

    let in_window = BasicPredicate::Tbe {
        from: "e1".into(),
        to: "e2".into(),
        tmin_secs: 0,
        tmax_secs: FOUR_WEEKS_SECS,
    };
    let b_pa = Binding::empty().with("e1", "ev_ca").with("e2", "ev_pa");
    assert!(in_window.holds(&b_pa, &log), "7 days is within [0, 4w]");

    // o_b paid after 45 days ⇒ outside [0, 4w].
    let b_pb = Binding::empty().with("e1", "ev_cb").with("e2", "ev_pb");
    assert!(!in_window.holds(&b_pb, &log), "45 days exceeds 4 weeks");

    // Inclusive boundary: exact 7-day window must include the 7-day gap.
    let exact = BasicPredicate::Tbe {
        from: "e1".into(),
        to: "e2".into(),
        tmin_secs: seven_days,
        tmax_secs: seven_days,
    };
    assert!(
        exact.holds(&b_pa, &log),
        "boundary is inclusive (gap == tmin == tmax)"
    );

    // Negative gap (later confirm vs earlier pay) must fail a [0,*] window.
    let reversed = Binding::empty().with("e1", "ev_pa").with("e2", "ev_ca");
    assert!(
        !in_window.holds(&reversed, &log),
        "negative gap is below tmin=0"
    );
}

// ---------------------------------------------------------------------------
// Def. 4 — parent-child relation ⊑_L
// ---------------------------------------------------------------------------

#[test]
fn def4_refines_iff_child_agrees_on_all_parent_vars() {
    // Oracle: Def. 4  p ⊑_L c ⇔ ∀x∈dom(p) p(x)=c(x).
    let p = Binding::empty().with("o1", "o_a");
    let c_ok = Binding::empty().with("o1", "o_a").with("e1", "ev_ca");
    let c_bad = Binding::empty().with("o1", "o_b").with("e1", "ev_ca");

    assert!(p.refines(&c_ok), "{{o1↦o_a}} ⊑ {{o1↦o_a, e1↦ev_ca}}");
    assert!(!p.refines(&c_bad), "disagreement on o1 breaks ⊑");

    // Empty binding ⊑ everything (smallest element of B_L).
    assert!(Binding::empty().refines(&c_ok));
    assert!(Binding::empty().refines(&c_bad));
}

// ---------------------------------------------------------------------------
// Def. 6 — binding box output set out_L(box)
// ---------------------------------------------------------------------------

#[test]
fn def6_box_output_enumerates_typed_predicate_satisfying_bindings() {
    // Box: o1:orders, e1:confirm order, E2O(e1,o1,order).
    // Oracle: out_L = exactly the (confirm-event, its-order) pairs. There are
    // three confirm events (ev_ca/cb/cc), each pointing at one order. So |out|=3,
    // and each binding pairs a confirm event with its own order.
    let log = order_to_cash_fig6();
    let bbox = BindingBox {
        vars: vec![
            VarDecl {
                name: "o1".into(),
                kind: VarKind::Object,
                types: vec!["orders".into()],
            },
            VarDecl {
                name: "e1".into(),
                kind: VarKind::Event,
                types: vec!["confirm order".into()],
            },
        ],
        preds: vec![BasicPredicate::E2O {
            event: "e1".into(),
            object: "o1".into(),
            qualifier: Some("order".into()),
        }],
    };

    let out = bbox.output(&log);
    assert_eq!(out.len(), 3, "three confirmed orders ⇒ three bindings");

    // Each binding must pair the confirm event with ITS order, never another.
    let expected: BTreeMap<&str, &str> = [("ev_ca", "o_a"), ("ev_cb", "o_b"), ("ev_cc", "o_c")]
        .into_iter()
        .collect();
    for b in &out {
        let e = b.get("e1").unwrap();
        let o = b.get("o1").unwrap();
        assert_eq!(expected.get(e), Some(&o), "{e} must bind to its own order");
    }
}

#[test]
fn def6_box_output_empty_when_predicate_unsatisfiable() {
    // Type mismatch: ask for e1:pay order referencing o1 with qualifier 'order'.
    // o_c is never paid, but o_a/o_b are, so |out| = 2 (ev_pa/o_a, ev_pb/o_b).
    let log = order_to_cash_fig6();
    let bbox = BindingBox {
        vars: vec![
            VarDecl {
                name: "o1".into(),
                kind: VarKind::Object,
                types: vec!["orders".into()],
            },
            VarDecl {
                name: "e1".into(),
                kind: VarKind::Event,
                types: vec!["pay order".into()],
            },
        ],
        preds: vec![BasicPredicate::E2O {
            event: "e1".into(),
            object: "o1".into(),
            qualifier: None,
        }],
    };
    let out = bbox.output(&log);
    assert_eq!(out.len(), 2, "only o_a and o_b have pay events");
}

// ---------------------------------------------------------------------------
// Def. 7 — refinement ⪯_L
// ---------------------------------------------------------------------------

#[test]
fn def7_refines_iff_vars_and_preds_are_subsets() {
    // Oracle: Def. 7  a ⪯_L b ⇔ Var(a)⊆Var(b) ∧ Pred(a)⊆Pred(b).
    let a = BindingBox {
        vars: vec![VarDecl {
            name: "o1".into(),
            kind: VarKind::Object,
            types: vec!["orders".into()],
        }],
        preds: vec![],
    };
    let b = BindingBox {
        vars: vec![
            VarDecl {
                name: "o1".into(),
                kind: VarKind::Object,
                types: vec!["orders".into()],
            },
            VarDecl {
                name: "e1".into(),
                kind: VarKind::Event,
                types: vec!["confirm order".into()],
            },
        ],
        preds: vec![BasicPredicate::E2O {
            event: "e1".into(),
            object: "o1".into(),
            qualifier: None,
        }],
    };
    assert!(a.refines(&b), "fewer vars, fewer preds ⇒ a ⪯ b");
    assert!(!b.refines(&a), "b has extra var/pred not in a");
}

// ---------------------------------------------------------------------------
// Fig. 6 (C4) — "every confirmed order paid within 4 weeks, exactly once"
// ---------------------------------------------------------------------------

/// Build the Fig. 6 constraint query tree exactly as the plan's C4 specifies:
///   box(v0) = { o1:Object(orders), e1:Event(confirm order) }
///             Pred: E2O(e1,o1,*)
///             constr(v0): CHILD SET(A, 1, 1)
///   child via edge "A": box(v1) adds e2:Event(pay order),
///             Pred: E2O(e1,o1,*), E2O(e2,o1,*), TBE(e1,e2,0,4w)
fn fig6_constraint_tree() -> QueryTree {
    let v0 = Node {
        id: "v0".into(),
        bbox: BindingBox {
            vars: vec![
                VarDecl {
                    name: "o1".into(),
                    kind: VarKind::Object,
                    types: vec!["orders".into()],
                },
                VarDecl {
                    name: "e1".into(),
                    kind: VarKind::Event,
                    types: vec!["confirm order".into()],
                },
            ],
            preds: vec![BasicPredicate::E2O {
                event: "e1".into(),
                object: "o1".into(),
                qualifier: None,
            }],
        },
        children: vec![Edge {
            label: "A".into(),
            child: "v1".into(),
        }],
        // exactly-once: the child set (paid-within-4w confirm/pay pairs) must
        // have size in [1, 1].
        constr: vec![ConstraintPredicate::ChildSet(ChildSet {
            edge: "A".into(),
            n_min: 1,
            n_max: Some(1),
        })],
    };
    let v1 = Node {
        id: "v1".into(),
        bbox: BindingBox {
            vars: vec![
                VarDecl {
                    name: "o1".into(),
                    kind: VarKind::Object,
                    types: vec!["orders".into()],
                },
                VarDecl {
                    name: "e1".into(),
                    kind: VarKind::Event,
                    types: vec!["confirm order".into()],
                },
                VarDecl {
                    name: "e2".into(),
                    kind: VarKind::Event,
                    types: vec!["pay order".into()],
                },
            ],
            preds: vec![
                BasicPredicate::E2O {
                    event: "e1".into(),
                    object: "o1".into(),
                    qualifier: None,
                },
                BasicPredicate::E2O {
                    event: "e2".into(),
                    object: "o1".into(),
                    qualifier: None,
                },
                BasicPredicate::Tbe {
                    from: "e1".into(),
                    to: "e2".into(),
                    tmin_secs: 0,
                    tmax_secs: FOUR_WEEKS_SECS,
                },
            ],
        },
        children: vec![],
        constr: vec![],
    };
    QueryTree {
        root: "v0".into(),
        nodes: vec![v0, v1],
    }
}

#[test]
fn fig6_paid_within_four_weeks_exactly_once() {
    // Oracle (Fig. 6 + the story):
    //   o_a confirmed & paid +7d   → child set size 1 ∈ [1,1] → ✓ satisfied
    //   o_b confirmed & paid +45d  → no pay in [0,4w]; child set size 0 ∉ [1,1] → ✗ violated
    //   o_c confirmed, never paid  → child set size 0 ∉ [1,1] → ✗ violated
    // ⇒ satisfied = 1, violated = 2.
    let log = order_to_cash_fig6();
    let tree = fig6_constraint_tree();
    let res = evaluate_constraint(&tree, &log);

    assert_eq!(res.node, "v0");
    assert_eq!(res.satisfied, 1, "only o_a is paid-within-4w exactly once");
    assert_eq!(res.violated, 2, "o_b (late) and o_c (never) violate");

    // Pin the verdict to the specific order in each row.
    for v in &res.verdicts {
        let o = v.binding.get("o1").map(String::as_str).unwrap();
        match o {
            "o_a" => assert!(v.satisfied, "o_a satisfies"),
            "o_b" | "o_c" => assert!(!v.satisfied, "{o} violates"),
            other => unreachable!("unexpected order {other}"),
        }
    }
}

#[test]
fn fig6_widening_window_makes_late_order_satisfy() {
    // Metamorphic oracle: widen tmax from 4w to 60d. Now o_b's 45-day payment
    // falls inside the window, so its child set becomes size 1 ∈ [1,1] → ✓.
    // o_c (never paid) still violates. ⇒ satisfied = 2, violated = 1.
    let log = order_to_cash_fig6();
    let mut tree = fig6_constraint_tree();
    // mutate v1's TBE tmax to 60 days
    let v1 = tree.nodes.iter_mut().find(|n| n.id == "v1").unwrap();
    for p in &mut v1.bbox.preds {
        if let BasicPredicate::Tbe { tmax_secs, .. } = p {
            *tmax_secs = 60 * 24 * 3600;
        }
    }
    let res = evaluate_constraint(&tree, &log);
    assert_eq!(res.satisfied, 2, "o_a and o_b now within window");
    assert_eq!(res.violated, 1, "only o_c (never paid) violates");
}

// ---------------------------------------------------------------------------
// "every order confirmed exactly once" — the simpler paper-style query
// ---------------------------------------------------------------------------

/// Tree: root v0 = { o1:orders } with CHILD SET(A,1,1) over child v1 =
/// { o1:orders, e1:confirm order } with E2O(e1,o1,*). I.e. each order must have
/// exactly one confirm-order event. The story confirms each order once.
fn confirmed_exactly_once_tree() -> QueryTree {
    let v0 = Node {
        id: "v0".into(),
        bbox: BindingBox {
            vars: vec![VarDecl {
                name: "o1".into(),
                kind: VarKind::Object,
                types: vec!["orders".into()],
            }],
            preds: vec![],
        },
        children: vec![Edge {
            label: "A".into(),
            child: "v1".into(),
        }],
        constr: vec![ConstraintPredicate::ChildSet(ChildSet {
            edge: "A".into(),
            n_min: 1,
            n_max: Some(1),
        })],
    };
    let v1 = Node {
        id: "v1".into(),
        bbox: BindingBox {
            vars: vec![
                VarDecl {
                    name: "o1".into(),
                    kind: VarKind::Object,
                    types: vec!["orders".into()],
                },
                VarDecl {
                    name: "e1".into(),
                    kind: VarKind::Event,
                    types: vec!["confirm order".into()],
                },
            ],
            preds: vec![BasicPredicate::E2O {
                event: "e1".into(),
                object: "o1".into(),
                qualifier: None,
            }],
        },
        children: vec![],
        constr: vec![],
    };
    QueryTree {
        root: "v0".into(),
        nodes: vec![v0, v1],
    }
}

#[test]
fn every_order_confirmed_exactly_once_all_satisfied() {
    // Oracle: each of the three orders is confirmed exactly once in the story,
    // so the [1,1] child-set constraint holds for all ⇒ satisfied=3, violated=0.
    let log = order_to_cash_fig6();
    let res = evaluate_constraint(&confirmed_exactly_once_tree(), &log);
    assert_eq!(res.satisfied, 3, "all three orders confirmed exactly once");
    assert_eq!(res.violated, 0);
}

#[test]
fn double_confirm_makes_an_order_violate() {
    // Negative oracle: add a SECOND 'confirm order' event for o_a. Now o_a's
    // confirm child set has size 2 ∉ [1,1] ⇒ violated. The other two stay ✓.
    // ⇒ satisfied=2, violated=1, and the violating order is exactly o_a.
    let mut log = order_to_cash_fig6();
    log.events.push(wasm4pm_compat::ocel::OCELEvent {
        id: "ev_ca2".into(),
        event_type: "confirm order".into(),
        time: "2024-03-02T09:00:00Z".parse().unwrap(),
        attributes: vec![],
        relationships: vec![wasm4pm_compat::ocel::OCELRelationship {
            object_id: "o_a".into(),
            qualifier: "order".into(),
        }],
    });
    let res = evaluate_constraint(&confirmed_exactly_once_tree(), &log);
    assert_eq!(res.satisfied, 2);
    assert_eq!(res.violated, 1);
    let violator = res.verdicts.iter().find(|v| !v.satisfied).unwrap();
    assert_eq!(violator.binding.get("o1").map(String::as_str), Some("o_a"));
}

// ---------------------------------------------------------------------------
// CHILD SET membership window (Sect. 4) — direct
// ---------------------------------------------------------------------------

#[test]
fn child_set_membership_counts_refining_child_bindings() {
    // Build a [2,*] child-set: orders with >=2 confirm events. In the base
    // story every order has exactly 1, so all violate (count 1 < 2).
    let log = order_to_cash_fig6();
    let mut tree = confirmed_exactly_once_tree();
    let v0 = tree.nodes.iter_mut().find(|n| n.id == "v0").unwrap();
    v0.constr = vec![ConstraintPredicate::ChildSet(ChildSet {
        edge: "A".into(),
        n_min: 2,
        n_max: None, // unbounded above
    })];
    let res = evaluate_constraint(&tree, &log);
    assert_eq!(res.satisfied, 0, "no order has >=2 confirms");
    assert_eq!(res.violated, 3);
}

// ---------------------------------------------------------------------------
// Plain query evaluation (no constraint) — out_L surfaced
// ---------------------------------------------------------------------------

#[test]
fn evaluate_query_returns_raw_output_set() {
    let log = order_to_cash_fig6();
    let tree = confirmed_exactly_once_tree();
    // v1 = (orders, confirm order) with E2O ⇒ 3 confirm/order pairs.
    let out = evaluate_query(&tree, "v1", &log).unwrap();
    assert_eq!(out.len(), 3);
    // unknown node id ⇒ None
    assert!(evaluate_query(&tree, "nope", &log).is_none());
}

// ---------------------------------------------------------------------------
// JSON / WASM-shaped surface — ocpq_eval_json (the reachable entry point)
// ---------------------------------------------------------------------------

#[test]
fn ocpq_eval_json_reproduces_fig6_over_json_inputs() {
    // Exercises the exact code path the #[wasm_bindgen] ocpq_eval calls:
    // serialize the Fig. 6 tree + the OCED to JSON, run ocpq_eval_json, and
    // assert the satisfied/violated counts match the hand-derived oracle.
    let log = order_to_cash_fig6();
    let tree = fig6_constraint_tree();
    let query_json = serde_json::to_string(&tree).unwrap();
    let ocel_json = serde_json::to_string(&log).unwrap();

    let out = ocpq::ocpq_eval_json(&query_json, &ocel_json).expect("eval ok");
    let parsed: ocpq::ConstraintResult = serde_json::from_str(&out).unwrap();
    assert_eq!(parsed.satisfied, 1);
    assert_eq!(parsed.violated, 2);
}

#[test]
fn ocpq_eval_json_surfaces_parse_errors() {
    // Malformed query JSON ⇒ Err, not panic (the WASM boundary needs this).
    let err = ocpq::ocpq_eval_json("{ not json", "{}").unwrap_err();
    assert!(err.contains("query parse error"), "got: {err}");
}
