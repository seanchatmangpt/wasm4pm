//! OCEL-v2 primitive tests — Order-to-Cash.
//!
//! Oracles are the OCEDO meta-model (Latif et al., Fig. 1) and OCPQ Def. 2
//! (`L = (E, O, eval, oaval)`), NOT the implementation. Each test states the
//! formal property it checks. No self-reference (FM-5): expected values come
//! from the hand-authored Order-to-Cash story, not from calling the code under
//! test to produce the expected.

use std::collections::HashMap;

use ocel_core::flatten::flatten;
use ocel_core::validate::validate;
use ocel_core::{ObjectTypeCardinality, OCELAttributeValue, OCEL};

/// A small but complete Order-to-Cash OCEL-v2 log:
/// objects: Customer c1, Order o1, Items i1/i2, Package p1, Invoice inv1,
/// Payment pay1, Employee emp1.
/// events (time-ordered): place_order, confirm_order, pick_item x2, pack,
/// send_invoice, receive_payment, ship.
///
/// O2O wiring (time-stable): order -> customer (placed_by), order -> item
/// (contains) x2, package -> item (packs) x2, invoice -> order (bills),
/// payment -> invoice (settles).
fn order_to_cash() -> OCEL {
    let json = r#"
    {
      "eventTypes": [
        {"name": "place_order"},
        {"name": "confirm_order"},
        {"name": "pick_item"},
        {"name": "pack"},
        {"name": "send_invoice"},
        {"name": "receive_payment"},
        {"name": "ship"}
      ],
      "objectTypes": [
        {"name": "Customer"},
        {"name": "Order"},
        {"name": "Item"},
        {"name": "Package"},
        {"name": "Invoice"},
        {"name": "Payment"},
        {"name": "Employee"}
      ],
      "objects": [
        {"id": "c1", "type": "Customer",
         "attributes": [{"name": "tier", "value": "gold", "time": "2024-01-01T00:00:00Z"}],
         "relationships": []},
        {"id": "o1", "type": "Order",
         "attributes": [
           {"name": "total", "value": 100, "time": "2024-01-02T09:00:00Z"},
           {"name": "total", "value": 120, "time": "2024-01-02T10:00:00Z"}
         ],
         "relationships": [
           {"objectId": "c1", "qualifier": "placed_by"},
           {"objectId": "i1", "qualifier": "contains"},
           {"objectId": "i2", "qualifier": "contains"}
         ]},
        {"id": "i1", "type": "Item", "attributes": [], "relationships": []},
        {"id": "i2", "type": "Item", "attributes": [], "relationships": []},
        {"id": "p1", "type": "Package", "attributes": [],
         "relationships": [
           {"objectId": "i1", "qualifier": "packs"},
           {"objectId": "i2", "qualifier": "packs"}
         ]},
        {"id": "inv1", "type": "Invoice", "attributes": [],
         "relationships": [{"objectId": "o1", "qualifier": "bills"}]},
        {"id": "pay1", "type": "Payment", "attributes": [],
         "relationships": [{"objectId": "inv1", "qualifier": "settles"}]},
        {"id": "emp1", "type": "Employee", "attributes": [], "relationships": []}
      ],
      "events": [
        {"id": "ev1", "type": "place_order", "time": "2024-01-02T09:00:00Z",
         "attributes": [{"name": "channel", "value": "web"}],
         "relationships": [{"objectId": "o1", "qualifier": "order"}, {"objectId": "c1", "qualifier": "customer"}]},
        {"id": "ev2", "type": "confirm_order", "time": "2024-01-02T10:00:00Z",
         "attributes": [],
         "relationships": [{"objectId": "o1", "qualifier": "order"}, {"objectId": "emp1", "qualifier": "actor"}]},
        {"id": "ev3", "type": "pick_item", "time": "2024-01-02T11:00:00Z",
         "attributes": [],
         "relationships": [{"objectId": "i1", "qualifier": "item"}, {"objectId": "emp1", "qualifier": "actor"}]},
        {"id": "ev4", "type": "pick_item", "time": "2024-01-02T11:30:00Z",
         "attributes": [],
         "relationships": [{"objectId": "i2", "qualifier": "item"}, {"objectId": "emp1", "qualifier": "actor"}]},
        {"id": "ev5", "type": "pack", "time": "2024-01-02T12:00:00Z",
         "attributes": [],
         "relationships": [{"objectId": "p1", "qualifier": "package"}, {"objectId": "i1", "qualifier": "item"}, {"objectId": "i2", "qualifier": "item"}]},
        {"id": "ev6", "type": "send_invoice", "time": "2024-01-02T13:00:00Z",
         "attributes": [],
         "relationships": [{"objectId": "inv1", "qualifier": "invoice"}, {"objectId": "o1", "qualifier": "order"}]},
        {"id": "ev7", "type": "receive_payment", "time": "2024-01-03T09:00:00Z",
         "attributes": [],
         "relationships": [{"objectId": "pay1", "qualifier": "payment"}, {"objectId": "inv1", "qualifier": "invoice"}]},
        {"id": "ev8", "type": "ship", "time": "2024-01-03T10:00:00Z",
         "attributes": [],
         "relationships": [{"objectId": "p1", "qualifier": "package"}, {"objectId": "o1", "qualifier": "order"}]}
      ]
    }
    "#;
    serde_json::from_str(json).expect("Order-to-Cash OCEL must parse")
}

fn ts(s: &str) -> chrono::DateTime<chrono::FixedOffset> {
    chrono::DateTime::parse_from_rfc3339(s).unwrap()
}

// ---------------------------------------------------------------------------
// OCEDO meta-model structure: E, O, types declared, qualified refs.
// ---------------------------------------------------------------------------

#[test]
fn ocedo_log_has_event_and_object_sets() {
    // Oracle: L = (E, O, ...). E has 8 events, O has 8 objects in the story.
    let log = order_to_cash();
    assert_eq!(log.event_set().len(), 8);
    assert_eq!(log.object_set().len(), 8);
    assert_eq!(log.event_types.len(), 7);
    assert_eq!(log.object_types.len(), 7);
}

#[test]
fn ocpq_every_event_has_at_least_one_qualified_object_ref() {
    // Oracle: OCPQ Def. 2 — each event has >= 1 qualified object reference.
    let log = order_to_cash();
    for e in log.event_set() {
        assert!(
            !e.relationships.is_empty(),
            "event {} violates OCPQ Def. 2 (no E2O ref)",
            e.id
        );
        for r in &e.relationships {
            assert!(!r.qualifier.is_empty(), "E2O ref must be qualified");
        }
    }
}

#[test]
fn e2o_and_o2o_qualified_refs_resolve() {
    // Oracle: the `C` arc (event-qualifier-object) and `B` from/to arc both
    // carry a qualifier and resolve to declared objects.
    let log = order_to_cash();

    // E2O: place_order references o1 (qualifier "order") and c1 ("customer").
    let e2o = log.e2o("ev1");
    assert!(e2o.contains(&("o1", "order")));
    assert!(e2o.contains(&("c1", "customer")));

    // O2O: order o1 contains items i1, i2 and is placed_by c1 (time-stable).
    let o2o = log.o2o("o1");
    assert!(o2o.contains(&("c1", "placed_by")));
    assert!(o2o.contains(&("i1", "contains")));
    assert!(o2o.contains(&("i2", "contains")));

    // O2O chain payment -> invoice -> order (settles, bills).
    assert!(log.o2o("pay1").contains(&("inv1", "settles")));
    assert!(log.o2o("inv1").contains(&("o1", "bills")));
}

// ---------------------------------------------------------------------------
// Time-varying object attributes: oaval(o, t).
// ---------------------------------------------------------------------------

#[test]
fn oaval_is_time_varying_latest_le_t() {
    // Oracle: oaval(o, t) returns the latest attribute value with stamp <= t.
    // Order o1.total is 100 @09:00 then 120 @10:00.
    let log = order_to_cash();

    // Before any change: empty (first stamp is 09:00).
    let before = log.oaval("o1", ts("2024-01-02T08:00:00Z")).unwrap();
    assert!(before.get("total").is_none());

    // At 09:30: total = 100.
    let at0930 = log.oaval("o1", ts("2024-01-02T09:30:00Z")).unwrap();
    assert_eq!(
        at0930.get("total"),
        Some(&&OCELAttributeValue::Integer(100))
    );

    // At 11:00 (after both changes): total = 120 (the later value wins).
    let at1100 = log.oaval("o1", ts("2024-01-02T11:00:00Z")).unwrap();
    assert_eq!(
        at1100.get("total"),
        Some(&&OCELAttributeValue::Integer(120))
    );
}

#[test]
fn object_attr_timeline_is_the_temporal_support() {
    // Oracle: timeline = distinct change stamps, ascending. o1 changes @09:00,10:00.
    let log = order_to_cash();
    let tl = log.object_attr_timeline("o1");
    assert_eq!(tl, vec![ts("2024-01-02T09:00:00Z"), ts("2024-01-02T10:00:00Z")]);
}

#[test]
fn eval_returns_event_attribute_values() {
    // Oracle: eval(e) is the event-attribute-value map. ev1.channel = "web".
    let log = order_to_cash();
    let m = log.eval("ev1").unwrap();
    assert_eq!(
        m.get("channel"),
        Some(&&OCELAttributeValue::String("web".to_string()))
    );
    // confirm_order (ev2) has no event attributes.
    assert!(log.eval("ev2").unwrap().is_empty());
}

// ---------------------------------------------------------------------------
// Validation: lawful passes, unlawful refuses for the SPECIFIC reason.
// ---------------------------------------------------------------------------

#[test]
fn lawful_order_to_cash_validates() {
    // Positive proof: the well-formed story passes with no cardinality limits.
    let log = order_to_cash();
    let report = validate(&log, &HashMap::new());
    assert!(report.valid, "lawful O2C must validate: {:?}", report.errors);
}

#[test]
fn lawful_with_cardinality_window_validates() {
    // Positive: Order min=1,max=1 (exactly one order) and Item max=2 are satisfied.
    let log = order_to_cash();
    let mut card = HashMap::new();
    card.insert(
        "Order".to_string(),
        ObjectTypeCardinality {
            min_count: Some(1),
            max_count: Some(1),
            ..Default::default()
        },
    );
    card.insert(
        "Item".to_string(),
        ObjectTypeCardinality {
            max_count: Some(2),
            ..Default::default()
        },
    );
    let report = validate(&log, &card);
    assert!(report.valid, "{:?}", report.errors);
}

#[test]
fn event_without_object_ref_refuses_with_e2o_empty() {
    // Negative: strip an event's object refs -> OCPQ Def. 2 violation.
    let mut log = order_to_cash();
    log.events[1].relationships.clear(); // ev2 confirm_order
    let report = validate(&log, &HashMap::new());
    assert!(!report.valid);
    assert!(
        report.errors.iter().any(|e| e.code == "E2O_EMPTY"),
        "expected E2O_EMPTY, got {:?}",
        report.errors
    );
}

#[test]
fn dangling_e2o_refuses() {
    // Negative: point an event at a non-existent object -> referential integrity.
    let mut log = order_to_cash();
    log.events[0].relationships[0].object_id = "ghost".to_string();
    let report = validate(&log, &HashMap::new());
    assert!(report.errors.iter().any(|e| e.code == "DANGLING_E2O"));
}

#[test]
fn dangling_o2o_refuses() {
    // Negative: point an object O2O ref at a non-existent object.
    let mut log = order_to_cash();
    log.objects[1].relationships[0].object_id = "ghost".to_string(); // o1.placed_by
    let report = validate(&log, &HashMap::new());
    assert!(report.errors.iter().any(|e| e.code == "DANGLING_O2O"));
}

#[test]
fn cardinality_max_refuses() {
    // Negative: declare Item max_count = 1 but the log has 2 items.
    let log = order_to_cash();
    let mut card = HashMap::new();
    card.insert(
        "Item".to_string(),
        ObjectTypeCardinality {
            max_count: Some(1),
            ..Default::default()
        },
    );
    let report = validate(&log, &card);
    assert!(report.errors.iter().any(|e| e.code == "CARDINALITY_MAX"));
}

#[test]
fn cardinality_min_refuses() {
    // Negative: declare Payment min_count = 2 but the log has 1 payment.
    let log = order_to_cash();
    let mut card = HashMap::new();
    card.insert(
        "Payment".to_string(),
        ObjectTypeCardinality {
            min_count: Some(2),
            ..Default::default()
        },
    );
    let report = validate(&log, &card);
    assert!(report.errors.iter().any(|e| e.code == "CARDINALITY_MIN"));
}

#[test]
fn undeclared_object_type_refuses() {
    // Negative: an object with a type not in objectTypes.
    let mut log = order_to_cash();
    log.objects[0].object_type = "Alien".to_string();
    let report = validate(&log, &HashMap::new());
    assert!(report.errors.iter().any(|e| e.code == "UNDECLARED_OBJECT_TYPE"));
}

// ---------------------------------------------------------------------------
// Flatten / projection.
// ---------------------------------------------------------------------------

#[test]
fn flatten_order_yields_one_case_with_full_order_trace() {
    // Oracle: flattening to Order projects o1 to a single case whose trace is
    // the time-ordered event types referencing o1:
    // place_order, confirm_order, send_invoice, ship.
    let log = order_to_cash();
    let flat = flatten(&log, "Order").unwrap();
    assert_eq!(flat.cases.len(), 1);
    let case = &flat.cases[0];
    assert_eq!(case.case_id, "o1");
    assert_eq!(
        case.trace,
        vec![
            "place_order".to_string(),
            "confirm_order".to_string(),
            "send_invoice".to_string(),
            "ship".to_string()
        ]
    );
}

#[test]
fn flatten_item_yields_one_case_per_item_convergent_pack() {
    // Oracle: flattening to Item -> 2 cases (i1, i2). Each item is picked then
    // packed; the pack event references BOTH items, so it appears in both cases
    // (convergence). i1: [pick_item, pack]; i2: [pick_item, pack].
    let log = order_to_cash();
    let flat = flatten(&log, "Item").unwrap();
    assert_eq!(flat.cases.len(), 2);
    assert_eq!(flat.cases[0].case_id, "i1");
    assert_eq!(
        flat.cases[0].trace,
        vec!["pick_item".to_string(), "pack".to_string()]
    );
    assert_eq!(
        flat.cases[1].trace,
        vec!["pick_item".to_string(), "pack".to_string()]
    );
}

#[test]
fn flatten_is_deterministic() {
    // Oracle (G1 determinism): same input -> identical projection.
    let log = order_to_cash();
    let a = flatten(&log, "Order").unwrap();
    let b = flatten(&log, "Order").unwrap();
    assert_eq!(a, b);
}

#[test]
fn flatten_unknown_type_errors() {
    let log = order_to_cash();
    assert!(flatten(&log, "Nope").is_err());
}

#[test]
fn flatten_employee_aggregates_resource_work() {
    // Oracle: Employee emp1 is the actor of confirm_order + 2 pick_item events.
    let log = order_to_cash();
    let flat = flatten(&log, "Employee").unwrap();
    assert_eq!(flat.cases.len(), 1);
    assert_eq!(
        flat.cases[0].trace,
        vec![
            "confirm_order".to_string(),
            "pick_item".to_string(),
            "pick_item".to_string()
        ]
    );
}
