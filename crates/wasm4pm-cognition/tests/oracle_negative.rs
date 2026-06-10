//! Oracle-negative tests: one REFUSAL test per breed (13 total).
//!
//! Each test sends a degenerate or impossible input and asserts that the
//! breed either returns Err, or (where the breed succeeds on trivially
//! satisfied input) that the output carries an empty / trivial payload.
//!
//! Oracle rank: Rank-2 (domain contract — preconditions documented in each
//! breed's source file and the cognition-contracts rule).
//!
//! Pure Rust — no wasm_bindgen, no mocking.

use wasm4pm_cognition::breeds::{
    dispatch_breed_test, BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn empty_base() -> BreedInput {
    BreedInput {
        intent: "test".into(),
        candidates: vec![Candidate {
            id: "c1".into(),
            score: 0.5,
            eliminated: false,
            elimination_reason: None,
        }],
        facts: vec![],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    }
}

fn goal(id: &str, predicate: &str, value: &str) -> Goal {
    Goal {
        id: id.into(),
        predicate: predicate.into(),
        value: value.into(),
    }
}

fn state_atom(predicate: &str, value: &str) -> StateAtom {
    StateAtom {
        predicate: predicate.into(),
        value: value.into(),
    }
}

fn fact(key: &str, value: &str) -> Fact {
    Fact {
        key: key.into(),
        value: value.into(),
    }
}

fn rule(id: &str, premise: Vec<&str>, conclusion: &str, certainty: f32) -> Rule {
    Rule {
        id: id.into(),
        premise: premise.into_iter().map(|s| s.to_string()).collect(),
        conclusion: conclusion.into(),
        certainty,
    }
}

// ---------------------------------------------------------------------------
// 1. MYCIN — empty rules → precondition refuses
// ---------------------------------------------------------------------------

/// Rank-2: MYCIN requires at least one rule; empty rules must be refused.
#[test]
fn mycin_empty_rules_refused() {
    use wasm4pm_cognition::breeds::production_rules::Mycin;
    use wasm4pm_cognition::breeds::CognitionBreed;

    let mut input = empty_base();
    input.facts = vec![fact("symptom", "fever")];
    input.rules = vec![]; // violates MYCIN precondition

    let result = Mycin.preconditions(&input);
    assert!(result.is_err(), "MYCIN must refuse empty rules vec; got Ok");
    let msg = result.unwrap_err();
    assert!(
        msg.to_lowercase().contains("rule") || msg.to_lowercase().contains("mycin"),
        "error must mention rules or MYCIN, got: {msg}"
    );
}

// ---------------------------------------------------------------------------
// 2. Prolog — empty facts + impossible goal → refused or empty result
// ---------------------------------------------------------------------------

/// Rank-2: Prolog with all-empty input must refuse (preconditions gate fires).
#[test]
fn prolog_impossible_query_refused() {
    use wasm4pm_cognition::breeds::prolog::Prolog;
    use wasm4pm_cognition::breeds::CognitionBreed;

    let mut input = empty_base();
    input.intent = "".into(); // empty intent
    input.goals = vec![];
    input.rules = vec![]; // no clauses → nothing to prove

    // Precondition: intent, goals, AND rules all empty → Err
    let result = Prolog.preconditions(&input);
    assert!(
        result.is_err(),
        "Prolog must refuse fully empty input; got Ok"
    );
}

// ---------------------------------------------------------------------------
// 3. STRIPS — goal already in initial_state → empty plan (trivial success)
// ---------------------------------------------------------------------------

/// Rank-2: STRIPS goal already satisfied returns empty plan (selected == Some("")).
/// This mirrors strips_presatisfied_goal_returns_empty_plan in breed_oracle_gaps.rs
/// but uses dispatch_breed_test for full end-to-end coverage.
#[test]
fn strips_goal_already_achieved() {
    let mut input = empty_base();
    input.state = vec![state_atom("done", "true")];
    input.goals = vec![goal("g1", "done", "true")];
    input.rules = vec![rule("make-done", vec!["precond=met"], "done=true", 1.0)];

    let output = dispatch_breed_test("strips", &input).expect("STRIPS presatisfied must not panic");

    // Domain contract: no steps needed → plan is empty string
    assert_eq!(
        output.selected.as_deref(),
        Some(""),
        "STRIPS goal already in initial state must yield empty plan (selected=Some(\"\"))"
    );
}

// ---------------------------------------------------------------------------
// 4. SOAR — empty operators (candidates) → precondition refuses
// ---------------------------------------------------------------------------

/// Rank-2: SOAR requires at least one operator candidate; empty set must be refused.
#[test]
fn soar_no_operators_refused() {
    use wasm4pm_cognition::breeds::soar::Soar;
    use wasm4pm_cognition::breeds::CognitionBreed;

    let mut input = empty_base();
    input.candidates = vec![]; // violates SOAR precondition

    let result = Soar.preconditions(&input);
    assert!(
        result.is_err(),
        "SOAR must refuse empty candidates vec; got Ok"
    );
    let msg = result.unwrap_err();
    assert!(
        msg.to_lowercase().contains("operator")
            || msg.to_lowercase().contains("soar")
            || msg.to_lowercase().contains("candidate"),
        "error must mention operator/soar/candidate, got: {msg}"
    );
}

// ---------------------------------------------------------------------------
// 5. CBR — empty case_library → precondition refuses
// ---------------------------------------------------------------------------

/// Rank-2: CBR requires at least one past case; empty library must be refused.
#[test]
fn cbr_empty_library_refused() {
    use wasm4pm_cognition::breeds::cbr::Cbr;
    use wasm4pm_cognition::breeds::CognitionBreed;

    let mut input = empty_base();
    input.cases = vec![]; // empty library
    input.facts = vec![fact("need", "offline")];

    let result = Cbr.preconditions(&input);
    assert!(
        result.is_err(),
        "CBR must refuse empty case library; got Ok"
    );
    let msg = result.unwrap_err();
    assert!(
        msg.to_lowercase().contains("case") || msg.to_lowercase().contains("cbr"),
        "error must mention case/CBR, got: {msg}"
    );
}

// ---------------------------------------------------------------------------
// 6. GPS — goal equals current state → empty plan
// ---------------------------------------------------------------------------

/// Rank-2: GPS goal already in current state → no operators needed → empty plan.
#[test]
fn gps_goal_equals_state() {
    let mut input = empty_base();
    input.state = vec![state_atom("at", "B")];
    input.goals = vec![goal("g1", "at", "B")]; // already there
    input.rules = vec![rule("move-a-to-b", vec!["at=A"], "at=B", 1.0)];

    let output = dispatch_breed_test("gps", &input).expect("GPS presatisfied must not panic");

    assert_eq!(
        output.selected.as_deref(),
        Some(""),
        "GPS goal already in current state must yield empty plan (selected=Some(\"\"))"
    );
}

// ---------------------------------------------------------------------------
// 7. Hearsay — empty phonemes (facts) → trace has no seed steps
// ---------------------------------------------------------------------------

/// Rank-2: Hearsay with no facts produces no seed steps on the blackboard.
/// The breed still runs (rules are present), but seeds nothing.
#[test]
fn hearsay_empty_phonemes() {
    let mut input = empty_base();
    input.facts = vec![]; // no phonemes to seed
    input.rules = vec![rule("ks-phone-to-word", vec!["phone:T"], "word:THE", 0.9)];

    let output = dispatch_breed_test("hearsay", &input).expect("Hearsay must not panic");

    // With no seed facts there should be no "seed" trace steps.
    let seed_count = output
        .inference_trace
        .iter()
        .filter(|t| t.kind == "seed")
        .count();
    assert_eq!(
        seed_count, 0,
        "empty phoneme list must produce zero seed trace steps, got {seed_count}"
    );
}

// ---------------------------------------------------------------------------
// 8. DENDRAL — empty candidates → precondition refuses
// ---------------------------------------------------------------------------

/// Rank-2: DENDRAL requires at least one candidate; empty set must be refused.
#[test]
fn dendral_empty_candidates() {
    use wasm4pm_cognition::breeds::dendral::Dendral;
    use wasm4pm_cognition::breeds::CognitionBreed;

    let mut input = empty_base();
    input.candidates = vec![]; // violates DENDRAL precondition

    let result = Dendral.preconditions(&input);
    assert!(
        result.is_err(),
        "DENDRAL must refuse empty candidates vec; got Ok"
    );
}

// ---------------------------------------------------------------------------
// 9. ELIZA — empty string input → precondition refuses
// ---------------------------------------------------------------------------

/// Rank-2: ELIZA requires non-empty intent; empty string must be refused.
#[test]
fn eliza_empty_input() {
    use wasm4pm_cognition::breeds::frame::Eliza;
    use wasm4pm_cognition::breeds::CognitionBreed;

    let mut input = empty_base();
    input.intent = "".into(); // empty input violates ELIZA precondition

    let result = Eliza.preconditions(&input);
    assert!(result.is_err(), "ELIZA must refuse empty intent; got Ok");
    let msg = result.unwrap_err();
    assert!(
        msg.to_lowercase().contains("intent") || msg.to_lowercase().contains("eliza"),
        "error must mention intent/eliza, got: {msg}"
    );
}

// ---------------------------------------------------------------------------
// 10. AutoinstinctNeurosis — empty beliefs (facts) → precondition refuses
// ---------------------------------------------------------------------------

/// Rank-2: AutoinstinctNeurosis requires at least one fact to seed the belief
/// network; empty facts must be refused.
#[test]
fn autoinstinct_neurosis_empty_beliefs() {
    use wasm4pm_cognition::breeds::autoinstinct_neurosis::AutoinstinctNeurosis;
    use wasm4pm_cognition::breeds::CognitionBreed;

    let mut input = empty_base();
    input.facts = vec![]; // no beliefs → violates precondition

    let result = AutoinstinctNeurosis.preconditions(&input);
    assert!(
        result.is_err(),
        "AutoinstinctNeurosis must refuse empty beliefs; got Ok"
    );
    let msg = result.unwrap_err();
    assert!(
        msg.to_lowercase().contains("fact") || msg.to_lowercase().contains("belief"),
        "error must mention fact/belief, got: {msg}"
    );
}

// ---------------------------------------------------------------------------
// 11. AutoinstinctVision — empty objects (facts) → precondition refuses
// ---------------------------------------------------------------------------

/// Rank-2: AutoinstinctVision requires at least one fact as perceptual input;
/// empty facts must be refused.
#[test]
fn autoinstinct_vision_empty_objects() {
    use wasm4pm_cognition::breeds::autoinstinct_vision::AutoinstinctVision;
    use wasm4pm_cognition::breeds::CognitionBreed;

    let mut input = empty_base();
    input.facts = vec![]; // no objects → violates precondition

    let result = AutoinstinctVision.preconditions(&input);
    assert!(
        result.is_err(),
        "AutoinstinctVision must refuse empty objects; got Ok"
    );
    let msg = result.unwrap_err();
    assert!(
        msg.to_lowercase().contains("fact")
            || msg.to_lowercase().contains("vision")
            || msg.to_lowercase().contains("object"),
        "error must mention fact/vision/object, got: {msg}"
    );
}

// ---------------------------------------------------------------------------
// 12. AutoinstinctSemantics — empty sentence (intent) → precondition refuses
// ---------------------------------------------------------------------------

/// Rank-2: AutoinstinctSemantics requires a non-empty intent sentence; empty
/// intent must be refused.
#[test]
fn autoinstinct_semantics_empty_sentence() {
    use wasm4pm_cognition::breeds::autoinstinct_semantics::AutoinstinctSemantics;
    use wasm4pm_cognition::breeds::CognitionBreed;

    let mut input = empty_base();
    input.intent = "   ".into(); // whitespace-only also violates precondition

    let result = AutoinstinctSemantics.preconditions(&input);
    assert!(
        result.is_err(),
        "AutoinstinctSemantics must refuse empty/whitespace intent; got Ok"
    );
    let msg = result.unwrap_err();
    assert!(
        msg.to_lowercase().contains("intent") || msg.to_lowercase().contains("sentence"),
        "error must mention intent/sentence, got: {msg}"
    );
}

// ---------------------------------------------------------------------------
// 13. AutoinstinctLearning — all goals already achieved → trivial / empty plan
// ---------------------------------------------------------------------------

/// Rank-2: AutoinstinctLearning with all goals already satisfied (initial
/// bitmask == goal bitmask) must either refuse or return a trivial plan.
/// We verify via the preconditions gate (empty goals is refused) and separately
/// that a single pre-satisfied goal produces a zero-step plan or Err.
#[test]
fn autoinstinct_learning_all_goals_achieved() {
    use wasm4pm_cognition::breeds::autoinstinct_learning::AutoinstinctLearning;
    use wasm4pm_cognition::breeds::CognitionBreed;

    // Variant A: no goals at all → precondition refuses immediately.
    let mut input_no_goals = empty_base();
    input_no_goals.goals = vec![];
    let result_a = AutoinstinctLearning.preconditions(&input_no_goals);
    assert!(
        result_a.is_err(),
        "AutoinstinctLearning must refuse empty goals; got Ok"
    );

    // Variant B: goals provided but all already achieved via matching facts →
    // planner should find a 0-step plan or return Err (no work to do).
    // The breed encodes goals as bitmask; facts with matching goal values set
    // corresponding bits already — so plan has distance 0.
    let mut input_presatisfied = empty_base();
    input_presatisfied.goals = vec![goal("g0", "achieve", "sub-goal-0")];
    // Seed the fact that marks goal 0 as already achieved.
    input_presatisfied.facts = vec![fact("achieve", "sub-goal-0")];

    // Either Err or a plan with empty selected / 0 inference steps is acceptable.
    match dispatch_breed_test("autoinstinct_learning", &input_presatisfied) {
        Err(_) => {
            // Refused — acceptable refusal when no planning steps are needed.
        }
        Ok(output) => {
            // Succeeded but plan must be trivial: no inference steps beyond
            // the initial encode step, or selected describes 0 steps.
            let steps_to_goal = output
                .selected
                .as_deref()
                .unwrap_or("")
                .contains("0 steps to goal");
            let single_trace = output.inference_trace.len() <= 1;
            assert!(
                steps_to_goal || single_trace,
                "all-goals-achieved plan must be trivial (0 steps or single trace entry), \
                 got selected={:?}, trace_len={}",
                output.selected,
                output.inference_trace.len()
            );
        }
    }
}
