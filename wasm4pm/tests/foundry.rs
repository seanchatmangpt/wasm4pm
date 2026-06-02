//! Chicago-TDD convergence proof for the Process-World Foundry
//! ([`wasm4pm::foundry`]).
//!
//! The foundry manufactures ONE Order-to-Cash process field and emits every
//! lawful projection of it. These tests assert the *convergence* contract — one
//! field, every projection coherent — with oracles drawn from the papers, not
//! from the code under test (no FM-5 self-reference):
//!
//! - **OCEL validates** — oracle: OCEDO meta-model `L=(E,O,eval,oaval)` + OCPQ
//!   Def. 2 invariants, evaluated by the independent `ocel-core` validator (A2).
//! - **WF-net sound + safe** — oracle: Separable-WF-nets Def 3.5 soundness +
//!   1-bounded safety, evaluated by the independent soundness analyzer (A5).
//! - **POWL is the lawful decomposition** — oracle: the net's language equals the
//!   POWL's language (Separable-WF-nets Section 5 language preservation, A4).
//! - **Process tree language == POWL language** — oracle: process-tree algebra
//!   semantics match the POWL semantics (the projection is language-preserving).
//! - **Positive traces conform at fitness 1.0** — oracle: each trace is in
//!   `wf_net_language` (a trace in the model's language replays with no missing /
//!   no remaining tokens ⇒ token-replay fitness exactly 1.0). We also assert an
//!   off-language (negative) trace is NOT in the language ⇒ would refuse.

#![cfg(feature = "ocel")]

use std::collections::HashMap;

use wasm4pm::foundry::{
    field_csv, field_net, field_ocel, field_powl, field_process_tree, field_xes,
    ocpq_query_fixtures, positive_order_traces, tree_language, world_artifacts, FieldTree,
    EVENT_TYPES, OBJECT_TYPES,
};
use wasm4pm::soundness::analyze_petri_net;
use wasm4pm::wf_to_powl::{powl_language, wf_net_language};

use ocel_core::validate::validate;
use ocel_core::ObjectTypeCardinality;

// ─── Positive leg 1: the OCEL log validates against the meta-model ──────────

/// Oracle: OCEDO/OCPQ Def. 2 — every event has >=1 qualified object ref, all
/// types declared, ids unique, no dangling refs. The validator is independent of
/// the foundry (lives in `ocel-core`), so a clean report is a real proof.
#[test]
fn manufactured_ocel_validates() {
    let ocel = field_ocel();
    let card: HashMap<String, ObjectTypeCardinality> = HashMap::new();
    let report = validate(&ocel, &card);
    assert!(
        report.valid,
        "manufactured OCEL must validate; defects: {:?}",
        report.errors
    );
}

/// Oracle: the world's declared vocabulary is exactly the 7 object / 9 event
/// types named in the foundry mission. (Structural completeness of the field.)
#[test]
fn manufactured_ocel_declares_full_vocabulary() {
    let ocel = field_ocel();
    let declared_objs: Vec<&str> = ocel.object_types.iter().map(|t| t.name.as_str()).collect();
    let declared_evts: Vec<&str> = ocel.event_types.iter().map(|t| t.name.as_str()).collect();
    for ot in OBJECT_TYPES {
        assert!(declared_objs.contains(&ot), "object type {ot} not declared");
    }
    for et in EVENT_TYPES {
        assert!(declared_evts.contains(&et), "event type {et} not declared");
    }
}

/// Oracle: OCEDO O2O leg — the manufactured log carries qualified object→object
/// relations (Order→Item/Package/Invoice, Invoice→Payment), not just E2O.
#[test]
fn manufactured_ocel_has_o2o_relations() {
    let ocel = field_ocel();
    let order_o2o = ocel.o2o("order-1");
    assert!(
        order_o2o.iter().any(|(to, q)| *to == "item-1" && *q == "contains"),
        "Order should reference Item via a qualified O2O relation; got {order_o2o:?}"
    );
    let inv_o2o = ocel.o2o("inv-1");
    assert!(
        inv_o2o.iter().any(|(to, q)| *to == "pay-1" && *q == "settled_by"),
        "Invoice should reference Payment via a qualified O2O relation; got {inv_o2o:?}"
    );
}

// ─── Positive leg 2: the field WF-net is sound + safe ───────────────────────

/// Oracle: Separable-WF-nets Def 3.5 (soundness) + 1-bounded safety, evaluated by
/// the independent reachability-graph analyzer (A5). A sound, safe net is the
/// admissible class; an unsound or unsafe field would be a manufacturing defect.
#[test]
fn field_net_is_sound_and_safe() {
    let net = field_net();
    let report = analyze_petri_net(&net);
    assert!(report.is_wf_net, "field net must be a structural WF-net: {}", report.reason);
    assert!(report.is_sound, "field net must be sound: {}", report.reason);
    assert!(report.is_safe, "field net must be safe (1-bounded): {}", report.reason);
    assert!(
        report.dead_transitions.is_empty(),
        "field net must have no dead transitions; got {:?}",
        report.dead_transitions
    );
    assert!(
        report.is_sound_and_safe(),
        "field net must be sound AND safe (the admissible class)"
    );
}

// ─── Positive leg 3: the POWL decomposition is lawful (language-preserving) ──

/// Oracle: Separable-WF-nets Section 5 language preservation — for a separable
/// net, `L(POWL) == L(WF-net)`. We compute both languages in closed form and
/// compare as sets. Equality proves the POWL is the *lawful* decomposition of the
/// field, not merely "a" POWL.
#[test]
fn field_powl_preserves_language() {
    let net = field_net();
    let result = field_powl();
    assert!(result.is_wf_net, "input must be a WF-net");
    assert!(
        result.converted,
        "field net must be separable and fully convert; reason: {} repr: {}",
        result.reason, result.repr
    );

    let powl_lang = powl_language(&result.powl);
    let net_lang = wf_net_language(&net).expect("field net has a defined language");
    assert_eq!(
        powl_lang, net_lang,
        "POWL language must equal WF-net language (Section 5 preservation)"
    );
}

// ─── Positive leg 4: the process-tree projection is language-preserving ──────

/// Oracle: process-tree algebra semantics (→ concat, ∧ interleave, × union) must
/// reproduce the POWL language. Equality proves the tree projection is faithful.
#[test]
fn field_process_tree_preserves_language() {
    let tree = field_process_tree();
    let tree_lang = tree_language(&tree);
    let powl_lang = powl_language(&field_powl().powl);
    assert_eq!(
        tree_lang, powl_lang,
        "process-tree language must equal POWL language; tree = {}",
        tree.repr()
    );
    // The tree must actually use concurrency (the two branches run in parallel).
    fn has_parallel(t: &FieldTree) -> bool {
        match t {
            FieldTree::Parallel { .. } => true,
            FieldTree::Sequence { children } | FieldTree::Xor { children } => {
                children.iter().any(has_parallel)
            }
            _ => false,
        }
    }
    assert!(
        has_parallel(&tree),
        "field tree must contain a Parallel node (fulfilment ∥ billing): {}",
        tree.repr()
    );
}

// ─── Positive leg 5: every positive trace conforms at fitness 1.0 ───────────

/// Oracle: a trace in a sound, safe WF-net's language replays with zero missing
/// and zero remaining tokens, so token-replay fitness
/// `1 - (missing+remaining)/(produced+consumed) == 1.0`. We prove the corpus is
/// fitness-1.0 by proving each trace is a member of `wf_net_language` (the
/// closed-form language), which is the exact-1.0 admission-lawful condition.
#[test]
fn positive_traces_conform_at_fitness_one() {
    let net = field_net();
    let lang = wf_net_language(&net).expect("field net has a defined language");
    let traces = positive_order_traces();
    assert!(!traces.is_empty(), "positive corpus must not be empty");
    for t in &traces {
        assert!(
            lang.contains(t),
            "positive trace {t:?} must be in the field net language (fitness 1.0)"
        );
    }
    // And the corpus IS the language (complete coverage, not a strict subset).
    let corpus: std::collections::BTreeSet<Vec<String>> = traces.iter().cloned().collect();
    assert_eq!(corpus, lang, "positive corpus must equal the field net language");
}

/// The happy-path interleaving the OCEL log materialises (Pick→Pack→Ship before
/// the billing branch finishes) must be one of the lawful positive traces.
#[test]
fn ocel_order_trace_is_a_positive_trace() {
    let happy = vec![
        "Create Order".to_string(),
        "Confirm Order".to_string(),
        "Pick Item".to_string(),
        "Pack Package".to_string(),
        "Ship Package".to_string(),
        "Send Invoice".to_string(),
        "Receive Payment".to_string(),
    ];
    let traces = positive_order_traces();
    assert!(
        traces.contains(&happy),
        "the OCEL's order-flattened happy path must be a lawful positive trace"
    );
}

// ─── Negative leg: an off-language trace is refused (fitness < 1.0) ─────────

/// Oracle: a trace that violates the field's control flow (e.g. shipping before
/// confirming) is NOT in the net language, so it cannot replay at fitness 1.0 and
/// would raise an AndonPull at the exact-1.0 admission gate. Negative proof of
/// the same primitive.
#[test]
fn off_language_trace_is_refused() {
    let net = field_net();
    let lang = wf_net_language(&net).expect("field net has a defined language");
    // Ship before Confirm: structurally impossible in the field net.
    let bad = vec![
        "Create Order".to_string(),
        "Ship Package".to_string(),
        "Confirm Order".to_string(),
    ];
    assert!(
        !lang.contains(&bad),
        "an off-language trace must be refused (not in the field language)"
    );
    // An unknown activity is likewise refused.
    let unknown = vec!["Teleport Order".to_string()];
    assert!(!lang.contains(&unknown), "unknown-activity trace must be refused");
}

// ─── Projection surface: XES / CSV / OCPQ fixtures are well-formed ──────────

/// The case-centric XES projection contains the order's activities in order.
#[test]
fn xes_projection_well_formed() {
    let xes = field_xes();
    assert!(xes.contains("<log"), "XES must have a log element");
    assert!(xes.contains("order-1"), "XES must name the case");
    // Activities appear in flattened time order.
    let pos_create = xes.find("Create Order").expect("Create Order in XES");
    let pos_confirm = xes.find("Confirm Order").expect("Confirm Order in XES");
    assert!(pos_create < pos_confirm, "Create Order must precede Confirm Order in XES");
}

/// The CSV projection has a header and one data row per flattened event.
#[test]
fn csv_projection_well_formed() {
    let csv = field_csv();
    let lines: Vec<&str> = csv.lines().collect();
    assert_eq!(lines[0], "case_id,activity,timestamp,event_id");
    // 7 happy-path events qualify order-1 ⇒ 7 data rows.
    assert_eq!(lines.len(), 1 + 7, "CSV should have header + 7 event rows; got {csv}");
    assert!(lines[1].starts_with("order-1,Create Order,"));
}

/// The OCPQ fixtures are valid JSON binding-box query trees (A3 surface) and
/// faithfully encode the paper Fig.6 "confirmed order paid within 4 weeks,
/// exactly once" constraint.
#[test]
fn ocpq_fixtures_well_formed() {
    let fixtures = ocpq_query_fixtures();
    assert_eq!(fixtures.len(), 2, "expected 2 OCPQ fixtures");
    let (name, q) = &fixtures[1];
    assert_eq!(name, "confirmed_order_paid_within_4w");
    // box binds an Order object and a Confirm Order event.
    assert_eq!(q["box"]["v0"]["object_type"], "Order");
    assert_eq!(q["box"]["e1"]["event_type"], "Confirm Order");
    // constr is a CBS (CHILD BINDING SET / cardinality) of exactly 1.
    assert_eq!(q["constr"]["activity"], "Receive Payment");
    assert_eq!(q["constr"]["min"], 1);
    assert_eq!(q["constr"]["max"], 1);
    // child box adds the TBE [0, 4 weeks] predicate (4w = 2419200 s).
    assert_eq!(q["child"]["predicates"][1]["kind"], "TBE");
    assert_eq!(q["child"]["predicates"][1]["tmax_s"], 2_419_200);
}

// ─── Emission: materialize every projection to fixtures/world/ ──────────────

/// Manufacture the whole world to `fixtures/world/` and re-validate the written
/// OCEL from disk (round-trip): the on-disk OCEL must still parse and validate.
/// This is the single-field-many-projections deliverable made concrete on disk.
#[test]
fn emits_world_fixtures_to_disk() {
    use std::path::PathBuf;
    // CARGO_MANIFEST_DIR = …/wasm4pm/wasm4pm ; workspace root is its parent.
    let workspace_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("workspace root")
        .to_path_buf();
    let out_dir = workspace_root.join("fixtures").join("world");
    std::fs::create_dir_all(&out_dir).expect("create fixtures/world");

    let artifacts = world_artifacts();
    // Expect: ocel, cardinality, powl, tree, wf-net, positive-traces, xes, csv,
    // plus the 2 OCPQ fixtures = 10 files.
    assert_eq!(artifacts.len(), 10, "expected 10 world artifacts");
    let mut names: Vec<&str> = artifacts.iter().map(|(n, _)| n.as_str()).collect();
    names.sort();
    for (name, contents) in &artifacts {
        assert!(!contents.is_empty(), "artifact {name} must not be empty");
        std::fs::write(out_dir.join(name), contents)
            .unwrap_or_else(|e| panic!("write {name}: {e}"));
    }
    for required in [
        "ocel-v2.json",
        "powl.json",
        "process-tree.json",
        "wf-net.json",
        "positive-traces.json",
        "order.xes",
        "order.csv",
    ] {
        assert!(names.contains(&required), "missing artifact {required}");
    }

    // Round-trip: the written OCEL re-parses and re-validates from disk.
    let on_disk = std::fs::read_to_string(out_dir.join("ocel-v2.json")).expect("read OCEL");
    let parsed: ocel_core::OCEL =
        serde_json::from_str(&on_disk).expect("on-disk OCEL re-parses");
    let report = validate(&parsed, &HashMap::new());
    assert!(
        report.valid,
        "on-disk OCEL must re-validate; defects: {:?}",
        report.errors
    );
}
