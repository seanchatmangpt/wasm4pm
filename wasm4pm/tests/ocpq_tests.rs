#[cfg(feature = "ocel")]
use wasm4pm::ocpq_parser::{parse, OcpqClause, OcpqRelation, OcpqScope};
#[cfg(feature = "ocel")]
use wasm4pm::ocpq_runtime::evaluate;
#[cfg(feature = "ocel")]
use wasm4pm::models::{OCEL, OCELEvent, OCELObject};
#[cfg(feature = "ocel")]
use std::collections::HashMap;

#[test]
#[cfg(feature = "ocel")]
fn test_parser_basic() {
    let q = parse("REQUIRE DiagnosticRaised BEFORE RouteSelected").unwrap();
    assert_eq!(q.clauses.len(), 1);
    match &q.clauses[0] {
        OcpqClause::Require { left, relation, right, scope } => {
            assert_eq!(left, "DiagnosticRaised");
            assert_eq!(*relation, OcpqRelation::Before);
            assert_eq!(right, "RouteSelected");
            assert_eq!(*scope, OcpqScope::Global);
        }
        _ => panic!("Expected Require clause"),
    }

    let q2 = parse("FORBID AndonPull").unwrap();
    assert_eq!(q2.clauses.len(), 1);
    match &q2.clauses[0] {
        OcpqClause::Forbid { activity } => {
            assert_eq!(activity, "AndonPull");
        }
        _ => panic!("Expected Forbid clause"),
    }
}

#[test]
#[cfg(feature = "ocel")]
fn test_parser_scope() {
    let q = parse("REQUIRE DiagnosticRaised BEFORE RouteSelected ON SAME OBJECT").unwrap();
    assert_eq!(q.clauses.len(), 1);
    match &q.clauses[0] {
        OcpqClause::Require { scope, .. } => {
            assert_eq!(*scope, OcpqScope::SameObject { object_type: None });
        }
        _ => panic!("Expected Require clause"),
    }

    let q2 = parse("REQUIRE DiagnosticRaised BEFORE RouteSelected ON SAME OBJECT OF TYPE diagnostic").unwrap();
    assert_eq!(q2.clauses.len(), 1);
    match &q2.clauses[0] {
        OcpqClause::Require { scope, .. } => {
            assert_eq!(*scope, OcpqScope::SameObject { object_type: Some("diagnostic".to_string()) });
        }
        _ => panic!("Expected Require clause"),
    }
}

#[test]
#[cfg(feature = "ocel")]
fn test_parser_multiple_clauses() {
    let q = parse("REQUIRE A BEFORE B; FORBID C AND REQUIRE D AFTER E").unwrap();
    assert_eq!(q.clauses.len(), 3);
    assert!(matches!(q.clauses[0], OcpqClause::Require { .. }));
    assert!(matches!(q.clauses[1], OcpqClause::Forbid { .. }));
    assert!(matches!(q.clauses[2], OcpqClause::Require { .. }));
}

#[test]
#[cfg(feature = "ocel")]
fn test_parser_quoted_strings() {
    let q = parse("REQUIRE \"Diagnostic Raised\" BEFORE \"Route Selected\" ON SAME OBJECT OF TYPE \"diag-type\"").unwrap();
    assert_eq!(q.clauses.len(), 1);
    match &q.clauses[0] {
        OcpqClause::Require { left, right, scope, .. } => {
            assert_eq!(left, "Diagnostic Raised");
            assert_eq!(right, "Route Selected");
            assert_eq!(*scope, OcpqScope::SameObject { object_type: Some("diag-type".to_string()) });
        }
        _ => panic!("Expected Require clause"),
    }
}

#[test]
#[cfg(feature = "ocel")]
fn test_runtime_evaluation() {
    // Construct mock OCEL:
    // Events:
    // e1: DiagnosticStarted (obj: d1), time: 2026-05-30T00:00:00Z
    // e2: DiagnosticRaised (obj: d1), time: 2026-05-30T00:01:00Z
    // e3: RouteSelected (obj: d1, r1), time: 2026-05-30T00:02:00Z
    // e4: RouteExecuted (obj: r1), time: 2026-05-30T00:03:00Z
    let mut ocel = OCEL::new();
    
    ocel.objects.push(OCELObject {
        id: "d1".to_string(),
        object_type: "diagnostic".to_string(),
        attributes: HashMap::new(),
        changes: Vec::new(),
        embedded_relations: Vec::new(),
    });
    ocel.objects.push(OCELObject {
        id: "r1".to_string(),
        object_type: "route".to_string(),
        attributes: HashMap::new(),
        changes: Vec::new(),
        embedded_relations: Vec::new(),
    });

    ocel.events.push(OCELEvent {
        id: "e1".to_string(),
        event_type: "DiagnosticStarted".to_string(),
        timestamp: "2026-05-30T00:00:00Z".to_string(),
        attributes: HashMap::new(),
        object_ids: vec!["d1".to_string()],
        object_refs: Vec::new(),
    });
    ocel.events.push(OCELEvent {
        id: "e2".to_string(),
        event_type: "DiagnosticRaised".to_string(),
        timestamp: "2026-05-30T00:01:00Z".to_string(),
        attributes: HashMap::new(),
        object_ids: vec!["d1".to_string()],
        object_refs: Vec::new(),
    });
    ocel.events.push(OCELEvent {
        id: "e3".to_string(),
        event_type: "RouteSelected".to_string(),
        timestamp: "2026-05-30T00:02:00Z".to_string(),
        attributes: HashMap::new(),
        object_ids: vec!["d1".to_string(), "r1".to_string()],
        object_refs: Vec::new(),
    });
    ocel.events.push(OCELEvent {
        id: "e4".to_string(),
        event_type: "RouteExecuted".to_string(),
        timestamp: "2026-05-30T00:03:00Z".to_string(),
        attributes: HashMap::new(),
        object_ids: vec!["r1".to_string()],
        object_refs: Vec::new(),
    });

    // 1. Check Allow precedence
    let q1 = parse("REQUIRE DiagnosticRaised BEFORE RouteSelected ON SAME OBJECT OF TYPE diagnostic").unwrap();
    let v1 = evaluate(&ocel, &q1);
    assert_eq!(v1.status, "Allow");
    assert!(v1.violations.is_empty());

    // 2. Check Forbid success (AndonPull does not occur)
    let q2 = parse("FORBID AndonPull").unwrap();
    let v2 = evaluate(&ocel, &q2);
    assert_eq!(v2.status, "Allow");

    // 3. Check Forbid failure
    let q3 = parse("FORBID RouteExecuted").unwrap();
    let v3 = evaluate(&ocel, &q3);
    assert_eq!(v3.status, "Deny");
    assert_eq!(v3.violations.len(), 1);
    assert!(v3.violations[0].contains("Forbidden event 'RouteExecuted'"));

    // 4. Check Immediately After success
    // RouteExecuted IMMEDIATELY AFTER RouteSelected.
    // Wait, on same object (r1 has RouteSelected, RouteExecuted).
    // Let's check: for r1, the events are e3 (RouteSelected) at 00:02:00 and e4 (RouteExecuted) at 00:03:00.
    // Sorted events for r1: [e3, e4].
    // Relation: RouteExecuted (left) IMMEDIATELY AFTER RouteSelected (right).
    // Predecessor of left (RouteExecuted) must be right (RouteSelected).
    // e4 predecessor is e3, which is RouteSelected. Yes, matches!
    let q4 = parse("REQUIRE RouteExecuted IMMEDIATELY AFTER RouteSelected ON SAME OBJECT").unwrap();
    let v4 = evaluate(&ocel, &q4);
    assert_eq!(v4.status, "Allow");

    // 5. Check Immediately After failure on Global (since e4 is not immediately after e3 globally, e3 is RouteSelected, e4 is RouteExecuted)
    // Wait, is there any intervening event globally?
    // Globally: [e1: DiagnosticStarted, e2: DiagnosticRaised, e3: RouteSelected, e4: RouteExecuted].
    // Predecessor of e4 (RouteExecuted) is e3 (RouteSelected). So it actually passes globally too!
    // What if we check DiagnosticRaised IMMEDIATELY AFTER DiagnosticStarted?
    // Globally: [e1, e2, e3, e4]. Predecessor of e2 is e1. It passes.
    // What if we check RouteSelected IMMEDIATELY AFTER DiagnosticStarted?
    // Predecessor of e3 (RouteSelected) is e2 (DiagnosticRaised), not DiagnosticStarted. So it should fail!
    let q5 = parse("REQUIRE RouteSelected IMMEDIATELY AFTER DiagnosticStarted").unwrap();
    let v5 = evaluate(&ocel, &q5);
    assert_eq!(v5.status, "Deny");
    assert_eq!(v5.violations.len(), 1);
}

#[test]
#[cfg(feature = "ocel")]
fn test_ocpq_evaluator_compat() {
    use wasm4pm::ocpq_runtime::OcpqEvaluator;
    use wasm4pm_compat::ocpq::{OcpqQuery, ObjectScope, Predicate, PredicateKind, OcpqQueryConst, ObjectScopeConst, OcpqScopeKind};

    // Build OCEL
    let mut ocel = OCEL::new();
    ocel.objects.push(OCELObject {
        id: "d1".to_string(),
        object_type: "diagnostic".to_string(),
        attributes: HashMap::new(),
        changes: Vec::new(),
        embedded_relations: Vec::new(),
    });
    ocel.events.push(OCELEvent {
        id: "e1".to_string(),
        event_type: "DiagnosticStarted".to_string(),
        timestamp: "2026-05-30T00:00:00Z".to_string(),
        attributes: HashMap::new(),
        object_ids: vec!["d1".to_string()],
        object_refs: Vec::new(),
    });
    ocel.events.push(OCELEvent {
        id: "e2".to_string(),
        event_type: "DiagnosticRaised".to_string(),
        timestamp: "2026-05-30T00:01:00Z".to_string(),
        attributes: HashMap::new(),
        object_ids: vec!["d1".to_string()],
        object_refs: Vec::new(),
    });

    // 1. E2ORelation predicate
    let query_e2o = OcpqQuery {
        scope: ObjectScope::new(["diagnostic"]),
        predicates: vec![
            Predicate::new(PredicateKind::E2ORelation {
                event_var: "DiagnosticStarted".to_string(),
                object_var: "diagnostic".to_string(),
                qualifier: None,
            })
        ],
        sub_queries: Vec::new(),
    };
    let v_e2o = OcpqEvaluator::evaluate_compat(&ocel, &query_e2o);
    assert_eq!(v_e2o.status, "Allow");

    // 2. TimeBetweenEvents predicate
    let query_tbe = OcpqQuery {
        scope: ObjectScope::new(["diagnostic"]),
        predicates: vec![
            Predicate::new(PredicateKind::TimeBetweenEvents {
                event_var1: "DiagnosticStarted".to_string(),
                event_var2: "DiagnosticRaised".to_string(),
                t_min: 0,
                t_max: 120000, // 2 minutes (it's 1 minute in log, so it should allow)
            })
        ],
        sub_queries: Vec::new(),
    };
    let v_tbe = OcpqEvaluator::evaluate_compat(&ocel, &query_tbe);
    assert_eq!(v_tbe.status, "Allow");

    // 3. TimeBetweenEvents predicate (should deny)
    let query_tbe_deny = OcpqQuery {
        scope: ObjectScope::new(["diagnostic"]),
        predicates: vec![
            Predicate::new(PredicateKind::TimeBetweenEvents {
                event_var1: "DiagnosticStarted".to_string(),
                event_var2: "DiagnosticRaised".to_string(),
                t_min: 0,
                t_max: 30000, // 30s
            })
        ],
        sub_queries: Vec::new(),
    };
    let v_tbe_deny = OcpqEvaluator::evaluate_compat(&ocel, &query_tbe_deny);
    assert_eq!(v_tbe_deny.status, "Deny");

    // 4. evaluate_compat_const
    let query_const = OcpqQueryConst::<{ OcpqScopeKind::Closed }>::new(
        ObjectScopeConst::new(["diagnostic"]),
    ).with_predicate(
        Predicate::new(PredicateKind::E2ORelation {
            event_var: "DiagnosticStarted".to_string(),
            object_var: "diagnostic".to_string(),
            qualifier: None,
        })
    );
    let v_const = OcpqEvaluator::evaluate_compat_const(&ocel, &query_const);
    assert_eq!(v_const.status, "Allow");
}

