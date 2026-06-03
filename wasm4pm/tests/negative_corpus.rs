//! Negative / sabotage corpus refusal proof (Agent A8).
//!
//! This suite proves the wasm4pm primitive kernel *refuses* invalid traces and
//! invalid models — the dual of the foundry's positive convergence proof. Each
//! fixture in `fixtures/negative/` carries exactly one defect; the test loads the
//! fixture and asserts that the *appropriate primitive* rejects it for the
//! *specific* reason (mapped to a canonical `AndonPull` variant). A passing run
//! is proof of refusal, not proof of success.
//!
//! Oracles are drawn from the papers and the kernel's own validators — never from
//! the fixture's self-claimed verdict (no FM-5 self-reference). The fixture's
//! `expected_refusal` / declared codes are cross-checked against what the
//! independent primitive actually reports, so a fixture cannot pass by lying
//! about its own defect.
//!
//! Primitives exercised:
//! - `ocel_core::validate::validate` — OCEDO / OCPQ Def. 2 meta-model invariants
//!   (E2O, dangling refs, id uniqueness, undeclared types, cardinality window).
//! - `ocel_core::flatten::flatten` — lossy projection (convergence / divergence).
//! - `wasm4pm::soundness::analyze_petri_net` — Separable-WF-nets Def 3.5 soundness
//!   + 1-bounded safety (dead transitions, unsafe markings).
//! - `wasm4pm::wf_to_powl::{wf_net_language, powl_language}` — closed-form model
//!   language; an off-language trace cannot replay at fitness 1.0.
//!
//! Refusal → AndonPull mapping used here:
//! - control-flow gap (off WF-net / POWL language)        → `RouteConformanceGap`
//! - undeclared move present in a conforming-shaped trace → `IllegalRouteMotion`
//! - object lifecycle never closed by a `terminated_by`   → `LifecycleNotTerminated`
//! - OCEL meta-model / structural net defect              → `ObjectLifecycleViolation`

#![cfg(feature = "ocel")]

use std::collections::HashMap;
use std::path::PathBuf;

use serde_json::Value;

use ocel_core::flatten::flatten;
use ocel_core::validate::validate;
use ocel_core::{ObjectTypeCardinality, OCEL};

use wasm4pm::foundry::{field_net, field_powl};
use wasm4pm::models::PetriNet;
use wasm4pm::soundness::analyze_petri_net;
use wasm4pm::testing::conformance::AndonPull;
use wasm4pm::wf_to_powl::{powl_language, wf_net_language, PowlSpec};

// ── fixture loading ─────────────────────────────────────────────────────────

/// Absolute path to `fixtures/negative/`. `CARGO_MANIFEST_DIR` = `…/wasm4pm/wasm4pm`;
/// the workspace root (which owns `fixtures/`) is its parent.
fn negative_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("workspace root")
        .join("fixtures")
        .join("negative")
}

fn read_json(file: &str) -> Value {
    let path = negative_dir().join(file);
    let raw = std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("read fixture {}: {e}", path.display()));
    serde_json::from_str(&raw).unwrap_or_else(|e| panic!("parse fixture {file}: {e}"))
}

/// Parse a fixture's `trace` field into a `Vec<String>`.
fn trace_of(file: &str) -> Vec<String> {
    let v = read_json(file);
    v["trace"]
        .as_array()
        .unwrap_or_else(|| panic!("fixture {file} has no trace array"))
        .iter()
        .map(|s| s.as_str().expect("trace element is a string").to_string())
        .collect()
}

/// Parse a fixture into an `OCEL`. The OCEL fields are a superset of the meta
/// keys (`_comment`, `cardinality`, …); serde with the default `OCEL` derive
/// ignores the unknown keys.
fn ocel_of(file: &str) -> OCEL {
    serde_json::from_value(read_json(file)).unwrap_or_else(|e| panic!("OCEL parse {file}: {e}"))
}

/// Parse a fixture into a `PetriNet` (the soundness analyser's net type).
fn net_of(file: &str) -> PetriNet {
    serde_json::from_value(read_json(file)).unwrap_or_else(|e| panic!("net parse {file}: {e}"))
}

/// Parse the fixture's declared `expected_refusal` string into the canonical
/// `AndonPull` variant the suite uses. This is the *declared* refusal; each test
/// independently proves the primitive actually rejects, then asserts the declared
/// variant matches the proven cause (so the manifest cannot lie).
fn declared_andon(file: &str) -> AndonPull {
    let v = read_json(file);
    let code = v["expected_refusal"].as_str().unwrap_or_else(|| {
        panic!("fixture {file} missing expected_refusal");
    });
    map_andon(code)
}

/// Map a canonical mcpp AndonReason code to the local `AndonPull` taxonomy.
/// (The richer 11-variant mcpp chain collapses onto the 8 route-conformance
/// `AndonPull` variants the Rust testing harness exposes; this mapping is the
/// documented correspondence.)
fn map_andon(code: &str) -> AndonPull {
    match code {
        "RouteConformanceGap" => AndonPull::RouteConformanceGap,
        "IllegalRouteMotion" => AndonPull::IllegalRouteMotion,
        // mcpp LifecycleNotTerminated / ObjectLifecycleViolation / cardinality /
        // schema all surface as lifecycle/structural object violations in the
        // route harness.
        "LifecycleNotTerminated"
        | "ObjectLifecycleViolation"
        | "CardinalityViolation"
        | "ReceiptSchemaViolation" => AndonPull::ObjectLifecycleViolation,
        "MissingReceiptCoverage" | "InsufficientReceiptCoverage" => {
            AndonPull::MissingReceiptCoverage
        }
        "MissingRequiredStages" | "MissingRouteActivity" => AndonPull::MissingRouteActivity,
        other => panic!("unknown expected_refusal code {other}"),
    }
}

// ── N01 / N02 / N03: control-flow defects vs the field WF-net language ───────
//
// Oracle: a trace conforms at fitness 1.0 IFF it is a member of the closed-form
// WF-net language (a sound, safe net replays an in-language trace with no missing
// and no remaining tokens). A trace NOT in the language cannot reach fitness 1.0,
// so the exact-1.0 admission gate raises AndonPull::RouteConformanceGap.

fn assert_off_wf_language(file: &str) {
    let net = field_net();
    let lang = wf_net_language(&net).expect("field net has a defined language");
    let t = trace_of(file);
    assert!(
        !lang.contains(&t),
        "{file}: trace {t:?} must NOT be in the field WF-net language (must be refused)"
    );
    // Refusal cause: control-flow gap.
    assert_eq!(
        declared_andon(file),
        AndonPull::RouteConformanceGap,
        "{file}: declared refusal must be RouteConformanceGap"
    );
}

#[test]
fn n01_missing_required_event_is_refused() {
    // 'Confirm Order' omitted: token-replay leaves a missing token at p_open.
    assert_off_wf_language("n01-missing-required-event.trace.json");
}

#[test]
fn n02_event_out_of_order_is_refused() {
    // 'Ship Package' before 'Confirm Order': not a linear extension of the order.
    assert_off_wf_language("n02-event-out-of-order.trace.json");
}

#[test]
fn n03_duplicate_terminal_event_is_refused() {
    // 'Receive Payment' twice: the second cannot replay, leaving a remaining token.
    assert_off_wf_language("n03-duplicate-terminal-event.trace.json");
}

// ── N04: receipt-before-gate vs an inline route POWL partial order ───────────
//
// Oracle: the route declares collect < verify < emit. A trace that emits the
// receipt before verifying is not a linear extension of the partial order, so it
// is not in powl_language => RouteConformanceGap.

#[test]
fn n04_receipt_before_gate_is_refused() {
    let file = "n04-receipt-before-gate.trace.json";
    let v = read_json(file);
    let spec: PowlSpec =
        serde_json::from_value(v["model"].clone()).expect("inline POWL model parses");
    let lang = powl_language(&spec);
    let t = trace_of(file);
    // The lawful in-order trace IS in the language (sanity: the model is real).
    let lawful = vec![
        "collect_evidence".to_string(),
        "verify_evidence".to_string(),
        "emit_receipt".to_string(),
    ];
    assert!(
        lang.contains(&lawful),
        "{file}: the in-order proof trace must be in the route language"
    );
    // The sabotaged (receipt-before-gate) trace must be refused.
    assert!(
        !lang.contains(&t),
        "{file}: emit_receipt before verify_evidence must NOT be in the route language"
    );
    assert_eq!(declared_andon(file), AndonPull::RouteConformanceGap);
}

// ── N09: non-conforming POWL route (undeclared move) ─────────────────────────
//
// Oracle: 'Cancel Order' is not a node of the manufactured field POWL, so any
// trace containing it is outside powl_language. A move the route never declared
// is illegal motion => AndonPull::IllegalRouteMotion.

#[test]
fn n09_nonconforming_powl_route_is_refused() {
    let file = "n09-nonconforming-powl-route.trace.json";
    let powl = field_powl();
    let lang = powl_language(&powl.powl);
    let t = trace_of(file);
    assert!(
        !lang.contains(&t),
        "{file}: a trace with the undeclared 'Cancel Order' move must NOT be in the field POWL language"
    );
    // The undeclared activity is genuinely absent from the model alphabet.
    let alphabet: std::collections::BTreeSet<String> = lang.iter().flatten().cloned().collect();
    assert!(
        !alphabet.contains("Cancel Order"),
        "{file}: 'Cancel Order' must not appear anywhere in the field POWL language"
    );
    assert_eq!(declared_andon(file), AndonPull::IllegalRouteMotion);
}

// ── N05 / N10 / N12 / N13 / N14: OCEL meta-model defects vs the validator ────
//
// Oracle: ocel_core::validate implements the OCEDO / OCPQ Def. 2 invariants
// independently of the fixtures. A clean log validates; each fixture must produce
// the specific error code, and the declared refusal must be a lifecycle/object
// structural violation.

fn cardinality_of(file: &str) -> HashMap<String, ObjectTypeCardinality> {
    let v = read_json(file);
    match v.get("cardinality") {
        Some(c) => serde_json::from_value(c.clone()).expect("cardinality parses"),
        None => HashMap::new(),
    }
}

fn assert_validate_fails_with(file: &str, code: &str) {
    let ocel = ocel_of(file);
    let report = validate(&ocel, &cardinality_of(file));
    assert!(
        !report.valid,
        "{file}: OCEL must be INVALID (was reported valid); errors: {:?}",
        report.errors
    );
    assert!(
        report.errors.iter().any(|e| e.code == code),
        "{file}: expected error code {code}; got {:?}",
        report.errors.iter().map(|e| &e.code).collect::<Vec<_>>()
    );
    assert_eq!(
        declared_andon(file),
        AndonPull::ObjectLifecycleViolation,
        "{file}: meta-model defect must map to ObjectLifecycleViolation"
    );
}

#[test]
fn n05_o2o_dangling_is_refused() {
    assert_validate_fails_with("n05-o2o-dangling.ocel.json", "DANGLING_O2O");
}

#[test]
fn n10_cardinality_max_is_refused() {
    assert_validate_fails_with("n10-cardinality-max.ocel.json", "CARDINALITY_MAX");
}

#[test]
fn n12_e2o_empty_is_refused() {
    assert_validate_fails_with("n12-e2o-empty.ocel.json", "E2O_EMPTY");
}

#[test]
fn n13_duplicate_object_id_is_refused() {
    assert_validate_fails_with("n13-duplicate-object-id.ocel.json", "DUPLICATE_OBJECT_ID");
}

#[test]
fn n14_undeclared_event_type_is_refused() {
    assert_validate_fails_with(
        "n14-undeclared-event-type.ocel.json",
        "UNDECLARED_EVENT_TYPE",
    );
}

// ── N06: OCEL flattening loss (convergence + divergence) ─────────────────────
//
// Oracle (van der Aalst, OCEL flattening): projecting a many-to-many E2O graph
// onto a single object type is lossy. We prove the loss two ways:
//   (divergence) an event referencing no object of the type is dropped;
//   (convergence) an event referencing >1 object of the type is duplicated.
// The flattened (case, event) incidence count therefore does NOT equal the raw
// event count, so the projection cannot round-trip — refusal of a lossless claim.

#[test]
fn n06_flattening_loss_is_refused() {
    let file = "n06-flattening-loss.ocel.json";
    let ocel = ocel_of(file);
    let v = read_json(file);
    let object_type = v["flatten_to"].as_str().expect("flatten_to");
    let raw_event_count = ocel.events.len();

    let flat = flatten(&ocel, object_type).expect("flatten to declared type");

    // Total (case, event) pairs across the flattened log.
    let flattened_pairs: usize = flat.cases.iter().map(|c| c.trace.len()).sum();

    // The set of events that actually reference >=1 object of the type.
    let referencing_events: std::collections::BTreeSet<&str> = ocel
        .events
        .iter()
        .filter(|e| {
            e.relationships.iter().any(|r| {
                ocel.objects
                    .iter()
                    .any(|o| o.id == r.object_id && o.object_type == object_type)
            })
        })
        .map(|e| e.id.as_str())
        .collect();

    // Divergence: at least one event references NO object of the type (dropped).
    assert!(
        referencing_events.len() < raw_event_count,
        "{file}: divergence — some event must reference no {object_type} and be dropped \
         (referencing {} of {} raw events)",
        referencing_events.len(),
        raw_event_count
    );

    // Convergence: the flattened pair count EXCEEDS the count of referencing
    // events, because a multi-object event is duplicated across cases.
    assert!(
        flattened_pairs > referencing_events.len(),
        "{file}: convergence — a multi-{object_type} event must be duplicated \
         (flattened pairs {flattened_pairs} must exceed referencing events {})",
        referencing_events.len()
    );

    // The projection is therefore NOT a faithful, round-trippable copy of the
    // object-centric log: divergence drops events and convergence duplicates
    // events. (We do NOT compare flattened_pairs to raw_event_count directly: a
    // single drop and a single duplication can coincidentally net to equality —
    // the loss is proven by the two strict inequalities above, not by counting.)
    assert!(
        flat.cases.len() > 1,
        "{file}: flattening must produce >1 case so convergence is observable; got {} case(s)",
        flat.cases.len()
    );

    // Cross-check the manifest's named loss exactly.
    let dropped: Vec<String> = v["expected_loss"]["dropped_events"]
        .as_array()
        .unwrap()
        .iter()
        .map(|s| s.as_str().unwrap().to_string())
        .collect();
    for ev in &dropped {
        assert!(
            !referencing_events.contains(ev.as_str()),
            "{file}: event {ev} is declared dropped but still references {object_type}"
        );
    }

    assert_eq!(declared_andon(file), AndonPull::ObjectLifecycleViolation);
}

// ── N07: dead transition vs the soundness analyser ───────────────────────────
//
// Oracle: Separable-WF-nets Def 3.5, soundness condition 1 — no dead transitions.
// A transition never enabled at any reachable marking makes the net unsound; the
// analyser names it in `dead_transitions`.

#[test]
fn n07_dead_transition_is_refused() {
    let file = "n07-dead-transition.wf-net.json";
    let net = net_of(file);
    let report = analyze_petri_net(&net);
    assert!(
        !report.is_sound,
        "{file}: net with a dead transition must be UNSOUND (reason: {})",
        report.reason
    );
    assert!(
        !report.dead_transitions.is_empty(),
        "{file}: analyser must name the dead transition; got {:?}",
        report.dead_transitions
    );
    let v = read_json(file);
    let expected_label = v["soundness_assertion"]["dead_transition_label"]
        .as_str()
        .expect("dead_transition_label");
    assert!(
        report.dead_transitions.iter().any(|d| d == expected_label),
        "{file}: expected dead transition '{expected_label}'; got {:?}",
        report.dead_transitions
    );
    assert_eq!(declared_andon(file), AndonPull::ObjectLifecycleViolation);
}

// ── N08: unsafe net vs the soundness analyser ────────────────────────────────
//
// Oracle: Separable-WF-nets Section 4 targets the safe (1-bounded) class. A net
// where a place ever holds >1 token is outside the admissible class; the analyser
// reports is_safe=false.

#[test]
fn n08_unsafe_net_is_refused() {
    let file = "n08-unsafe-net.wf-net.json";
    let net = net_of(file);
    let report = analyze_petri_net(&net);
    assert!(
        !report.is_safe,
        "{file}: net that reaches a 2-token marking must be UNSAFE (reason: {})",
        report.reason
    );
    assert!(
        !report.is_sound_and_safe(),
        "{file}: unsafe net cannot be in the admissible sound-and-safe class"
    );
    assert_eq!(declared_andon(file), AndonPull::ObjectLifecycleViolation);
}

// ── N11: object lifecycle not terminated ─────────────────────────────────────
//
// Oracle: the route's `object_types[Order].terminated_by` declares the lawful
// closing event types. We flatten the OCEL to the Order case and assert its last
// (latest) activity is NOT a terminating event ⇒ the lifecycle is left open ⇒
// AndonPull::LifecycleNotTerminated.

#[test]
fn n11_lifecycle_not_terminated_is_refused() {
    let file = "n11-lifecycle-not-terminated.ocel.json";
    let ocel = ocel_of(file);
    let v = read_json(file);
    let object_type = v["flatten_to"].as_str().expect("flatten_to");
    let card = cardinality_of(file);
    let order_card = card
        .get(object_type)
        .unwrap_or_else(|| panic!("{file}: cardinality for {object_type} missing"));
    let terminators = &order_card.terminated_by;
    assert!(
        !terminators.is_empty(),
        "{file}: the object type must declare terminated_by to test termination"
    );

    let flat = flatten(&ocel, object_type).expect("flatten to the lifecycle type");
    assert!(
        !flat.cases.is_empty(),
        "{file}: must have at least one case"
    );
    for case in &flat.cases {
        let last = case
            .trace
            .last()
            .unwrap_or_else(|| panic!("{file}: case {} has an empty trace", case.case_id));
        assert!(
            !terminators.contains(last),
            "{file}: case {} ends in '{last}' which IS a terminator — fixture must leave the lifecycle open",
            case.case_id
        );
    }
    // The positive control: the field OCEL's Order case DOES terminate lawfully,
    // proving the check is real (it does not reject everything).
    let lawful = wasm4pm::foundry::field_ocel();
    let lawful_flat = flatten(&lawful, "Order").expect("flatten field OCEL to Order");
    let lawful_last = lawful_flat.cases[0].trace.last().expect("non-empty");
    let lawful_card = wasm4pm::foundry::field_cardinality();
    assert!(
        lawful_card["Order"].terminated_by.contains(lawful_last),
        "sanity: the lawful field Order case must end in a terminating event (ends in '{lawful_last}')"
    );

    // The fixture declares the mcpp code "LifecycleNotTerminated", which maps onto
    // the route harness's lifecycle/object violation taxonomy.
    assert_eq!(declared_andon(file), AndonPull::ObjectLifecycleViolation);
    assert_eq!(
        map_andon("LifecycleNotTerminated"),
        AndonPull::ObjectLifecycleViolation
    );
}

// ── Corpus-wide invariant: every fixture has a manifest entry that refuses ───
//
// This guards against a fixture being added without a refusal test, and proves
// the manifest is complete: every entry names a fixture that exists, a refusal
// reason in the known taxonomy, and a minimal counterexample.

#[test]
fn manifest_is_complete_and_every_entry_declares_a_refusal() {
    let manifest = read_json("manifest.json");
    let fixtures = manifest["fixtures"]
        .as_array()
        .expect("manifest.fixtures is an array");
    assert!(
        fixtures.len() >= 11,
        "negative corpus must cover at least the 11 required categories; got {}",
        fixtures.len()
    );
    for entry in fixtures {
        let id = entry["id"].as_str().expect("entry id");
        let file = entry["file"].as_str().expect("entry file");
        // Every named fixture file exists on disk.
        let path = negative_dir().join(file);
        assert!(path.exists(), "{id}: manifest names missing fixture {file}");
        // Every entry declares a known refusal reason …
        let code = entry["expected_refusal"]
            .as_str()
            .expect("expected_refusal");
        let _ = map_andon(code); // panics on unknown code
                                 // … names the rejecting primitive …
        assert!(
            entry["rejecting_primitive"].as_str().is_some(),
            "{id}: must name the rejecting primitive"
        );
        // … and gives a minimal counterexample.
        assert!(
            entry["minimal_counterexample"].as_str().is_some(),
            "{id}: must give a minimal counterexample"
        );
    }

    // The 11 demanded categories are all represented.
    let categories: Vec<&str> = fixtures
        .iter()
        .map(|e| e["category"].as_str().unwrap())
        .collect();
    for required in [
        "missing required event",
        "event out of order",
        "duplicate terminal event",
        "receipt-before-gate",
        "object relation missing/impossible",
        "OCEL flattening loss",
        "dead transition",
        "unsafe net",
        "non-conforming POWL route",
        "OCEL O2O cardinality violation",
        "lifecycle-not-terminated",
    ] {
        assert!(
            categories.iter().any(|c| *c == required),
            "negative corpus is missing the required category: {required}"
        );
    }
}
