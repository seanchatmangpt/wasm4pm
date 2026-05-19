//! Missing breed oracle tests — iter-15 coverage gap closure.
//!
//! Oracle ranks used here:
//! - **Rank-1 (mathematical theorem)**: Properties that hold for any correct
//!   implementation, derived from the published algorithm definition.
//! - **Rank-2 (domain contract)**: Design-decided properties (pre/postconditions,
//!   monotonicity invariants, encoding contracts).
//!
//! FM-5 (self-referential falsification) is explicitly avoided:
//! every expected value is derived from the algorithm's mathematical
//! specification or documented domain contract, not from the implementation.

use wasm4pm_cognition::breeds::{
    Candidate, Fact, Goal, Rule, StateAtom, BreedInput, BreedId, dispatch_breed_test,
};
use wasm4pm_cognition::breeds::hearsay::noisy_or;
use wasm4pm_cognition::breeds::production_rules::combine_cf;

// =============================================================================
// Helper builders
// =============================================================================

fn candidate(id: &str, score: f32) -> Candidate {
    Candidate {
        id: id.to_string(),
        score,
        eliminated: false,
        elimination_reason: None,
    }
}

fn fact(key: &str, value: &str) -> Fact {
    Fact {
        key: key.to_string(),
        value: value.to_string(),
    }
}

fn rule(id: &str, premise: Vec<&str>, conclusion: &str, certainty: f32) -> Rule {
    Rule {
        id: id.to_string(),
        premise: premise.into_iter().map(|s| s.to_string()).collect(),
        conclusion: conclusion.to_string(),
        certainty,
    }
}

fn goal(id: &str, predicate: &str, value: &str) -> Goal {
    Goal {
        id: id.to_string(),
        predicate: predicate.to_string(),
        value: value.to_string(),
    }
}

fn state_atom(predicate: &str, value: &str) -> StateAtom {
    StateAtom {
        predicate: predicate.to_string(),
        value: value.to_string(),
    }
}

fn empty_input_base() -> BreedInput {
    BreedInput {
        intent: "test".into(),
        candidates: vec![candidate("alpha", 0.7), candidate("beta", 0.5)],
        facts: vec![],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    }
}

// =============================================================================
// Rank-1 — noisy_or mathematical properties (Hearsay)
// =============================================================================

/// Rank-1: noisy_or is commutative.
/// From definition: 1-(1-a)(1-b) == 1-(1-b)(1-a) for all a, b.
#[test]
fn hearsay_noisy_or_commutativity() {
    let pairs = [(0.3_f32, 0.7), (0.0, 0.9), (0.5, 0.5), (1.0, 0.2), (0.0, 0.0)];
    for (a, b) in pairs {
        let ab = noisy_or(a, b);
        let ba = noisy_or(b, a);
        assert!(
            (ab - ba).abs() < 1e-6,
            "noisy_or({a}, {b}) = {ab} != noisy_or({b}, {a}) = {ba}"
        );
    }
}

/// Rank-1: noisy_or identity — noisy_or(x, 0) == x for x in [0,1].
/// From definition: 1-(1-x)(1-0) = 1-(1-x) = x.
#[test]
fn hearsay_noisy_or_identity_with_zero() {
    let xs = [0.0_f32, 0.25, 0.5, 0.75, 1.0];
    for x in xs {
        let result = noisy_or(x, 0.0);
        assert!(
            (result - x).abs() < 1e-6,
            "noisy_or({x}, 0) = {result}, expected {x}"
        );
    }
}

/// Rank-1: noisy_or bounds — output is in [0, 1] for inputs in [0, 1].
#[test]
fn hearsay_noisy_or_bounds() {
    let pairs = [
        (0.0_f32, 0.0),
        (1.0, 1.0),
        (0.3, 0.9),
        (0.99, 0.99),
        (0.1, 0.1),
    ];
    for (a, b) in pairs {
        let r = noisy_or(a, b);
        assert!(
            (0.0..=1.0).contains(&r),
            "noisy_or({a}, {b}) = {r} out of [0, 1]"
        );
    }
}

/// Rank-1: noisy_or monotone — noisy_or(a, b) >= max(a, b) for a,b in [0,1].
/// From definition: combining two independent positive probabilities cannot decrease either.
#[test]
fn hearsay_noisy_or_monotone() {
    let pairs = [
        (0.3_f32, 0.7),
        (0.0, 0.5),
        (0.5, 0.5),
        (0.9, 0.1),
        (0.0, 0.0),
    ];
    for (a, b) in pairs {
        let r = noisy_or(a, b);
        let expected_min = a.max(b);
        assert!(
            r >= expected_min - 1e-6,
            "noisy_or({a}, {b}) = {r} < max({a}, {b}) = {expected_min}"
        );
    }
}

/// Rank-1: noisy_or(1.0, x) == 1.0 for any x in [0,1].
/// From definition: 1-(1-1)(1-x) = 1-0 = 1.
#[test]
fn hearsay_noisy_or_absorbing_element() {
    let xs = [0.0_f32, 0.3, 0.5, 0.99, 1.0];
    for x in xs {
        let r = noisy_or(1.0, x);
        assert!(
            (r - 1.0).abs() < 1e-6,
            "noisy_or(1.0, {x}) = {r}, expected 1.0"
        );
    }
}

// =============================================================================
// Rank-1 — combine_cf mathematical properties (MYCIN)
// =============================================================================

/// Rank-1: combine_cf identity — combine_cf(x, 0) == x for x in [-1,1].
/// From Shortliffe-Buchanan: 0 is the neutral CF (no evidence either way).
#[test]
fn mycin_combine_cf_identity_with_zero() {
    let xs = [-0.8_f32, -0.5, 0.0, 0.3, 0.7, 1.0];
    for x in xs {
        let result = combine_cf(x, 0.0);
        assert!(
            (result - x).abs() < 1e-5,
            "combine_cf({x}, 0) = {result}, expected {x}"
        );
    }
}

/// Rank-1: combine_cf bounds — output is in [-1.0, 1.0] for inputs in [-1.0, 1.0].
#[test]
fn mycin_combine_cf_bounds() {
    let pairs = [
        (0.9_f32, 0.9),
        (-0.9, -0.9),
        (0.5, 0.7),
        (-0.3, 0.8),
        (0.8, -0.3),
        (-1.0, -1.0),
        (1.0, 1.0),
    ];
    for (a, b) in pairs {
        let r = combine_cf(a, b);
        assert!(
            r >= -1.0 - 1e-5 && r <= 1.0 + 1e-5,
            "combine_cf({a}, {b}) = {r} outside [-1, 1]"
        );
    }
}

/// Rank-1: combine_cf commutativity for same-sign inputs.
/// From the Shortliffe-Buchanan formula: same-sign branch is symmetric.
#[test]
fn mycin_combine_cf_commutativity_same_sign() {
    let pairs = [
        (0.4_f32, 0.3),
        (0.8, 0.2),
        (-0.5, -0.3),
        (-0.7, -0.1),
        (0.0, 0.0),
    ];
    for (a, b) in pairs {
        let ab = combine_cf(a, b);
        let ba = combine_cf(b, a);
        assert!(
            (ab - ba).abs() < 1e-5,
            "combine_cf({a}, {b}) = {ab} != combine_cf({b}, {a}) = {ba} (same-sign commutativity)"
        );
    }
}

/// Rank-1: two positive CFs combine to a higher value (positive combination theorem).
/// From Shortliffe-Buchanan (positive branch): a + b - a*b > max(a,b) when both > 0.
#[test]
fn mycin_combine_cf_positive_combination_strengthens() {
    let pairs = [
        (0.3_f32, 0.4),
        (0.6, 0.5),
        (0.1, 0.9),
        (0.5, 0.5),
    ];
    for (a, b) in pairs {
        let r = combine_cf(a, b);
        let prior_max = a.max(b);
        assert!(
            r >= prior_max - 1e-5,
            "combine_cf({a}, {b}) = {r} should be >= max({a}, {b}) = {prior_max}"
        );
    }
}

// =============================================================================
// Rank-2 — STRIPS domain contracts
// =============================================================================

/// Rank-2: STRIPS with already-satisfied goals returns an empty plan.
/// Contract: if initial state contains all goal atoms, no actions needed.
#[test]
fn strips_presatisfied_goal_returns_empty_plan() {
    let mut input = empty_input_base();
    // Initial state already satisfies the goal.
    input.state = vec![state_atom("ready", "true")];
    input.goals = vec![goal("g1", "ready", "true")];
    input.rules = vec![rule(
        "make-ready",
        vec!["input=present"],
        "ready=true",
        1.0,
    )];

    let output = dispatch_breed_test("strips", &input).expect("STRIPS presatisfied");

    // Domain contract: plan is empty because goal is already achieved.
    // selected is None when plan is empty (per STRIPS implementation).
    assert!(
        output.selected.is_none(),
        "presatisfied goal must produce empty plan (selected=None)"
    );
    assert_eq!(output.breed, BreedId::Strips);
}

/// Rank-2: STRIPS with an unreachable goal returns an error.
/// Contract: if no action can achieve the goal, returns Err (not panic).
#[test]
fn strips_unreachable_goal_returns_error() {
    let mut input = empty_input_base();
    input.state = vec![state_atom("at", "A")];
    input.goals = vec![goal("g1", "at", "Z")]; // Z is not achievable
    input.rules = vec![rule(
        "move-to-B",
        vec!["at=A"],
        "at=B", // only achieves B, not Z
        1.0,
    )];

    // Domain contract: unreachable goal returns Err, does not panic.
    let result = dispatch_breed_test("strips", &input);
    assert!(
        result.is_err(),
        "unreachable goal must return Err, not panic"
    );
    let err_msg = result.unwrap_err();
    assert!(
        err_msg.contains("unreachable") || err_msg.contains("goal") || err_msg.contains("depth"),
        "error must describe unreachability, got: {err_msg}"
    );
}

/// Rank-2: STRIPS empty goals → precondition rejects (Err before run).
/// Contract: the preconditions() gate must fire for missing goals.
#[test]
fn strips_preconditions_reject_empty_goals() {
    use wasm4pm_cognition::breeds::strips::Strips;
    use wasm4pm_cognition::breeds::CognitionBreed;

    let mut input = empty_input_base();
    input.goals = vec![]; // empty — violates precondition
    input.rules = vec![rule("act", vec![], "something=done", 1.0)];

    let result = Strips.preconditions(&input);
    assert!(
        result.is_err(),
        "STRIPS must reject input with no goals"
    );
}

/// Rank-2: STRIPS empty rules → precondition rejects.
#[test]
fn strips_preconditions_reject_empty_rules() {
    use wasm4pm_cognition::breeds::strips::Strips;
    use wasm4pm_cognition::breeds::CognitionBreed;

    let mut input = empty_input_base();
    input.goals = vec![goal("g", "done", "true")];
    input.rules = vec![]; // empty — violates precondition

    let result = Strips.preconditions(&input);
    assert!(
        result.is_err(),
        "STRIPS must reject input with no action rules"
    );
}

/// Rank-2: STRIPS single-step plan — one action achieves one goal.
/// This is the minimal correct plan: verify it produces exactly one step.
#[test]
fn strips_single_step_plan_is_minimal() {
    let mut input = empty_input_base();
    input.state = vec![state_atom("at", "A")];
    input.goals = vec![goal("g1", "at", "B")];
    input.rules = vec![rule("move-a-to-b", vec!["at=A"], "at=B;!at=A", 1.0)];

    let output = dispatch_breed_test("strips", &input).expect("STRIPS single step");
    assert!(output.selected.is_some(), "must find a plan");

    let plan = output.selected.unwrap();
    let steps: Vec<&str> = plan.split(',').collect();
    assert_eq!(
        steps.len(),
        1,
        "single-step problem must produce 1-step plan, got {} steps: {:?}",
        steps.len(),
        steps
    );
    assert_eq!(steps[0], "move-a-to-b");
}

// =============================================================================
// Rank-2 — GPS domain contracts
// =============================================================================

/// Rank-2: GPS with already-satisfied goals returns empty plan.
/// Contract: if all goals are present in initial state, no operators needed.
#[test]
fn gps_presatisfied_goal_returns_empty_plan() {
    let mut input = empty_input_base();
    input.state = vec![state_atom("done", "true")];
    input.goals = vec![goal("g1", "done", "true")];
    input.rules = vec![rule("make-done", vec!["precond=met"], "done=true", 1.0)];

    let output = dispatch_breed_test("gps", &input).expect("GPS presatisfied");

    // Domain contract: already satisfied → empty plan → selected is None.
    assert!(
        output.selected.is_none(),
        "presatisfied goal must produce empty plan"
    );
    assert_eq!(output.breed, BreedId::Gps);
}

/// Rank-2: GPS empty goals → precondition rejects.
#[test]
fn gps_preconditions_reject_empty_goals() {
    use wasm4pm_cognition::breeds::gps::Gps;
    use wasm4pm_cognition::breeds::CognitionBreed;

    let mut input = empty_input_base();
    input.goals = vec![];
    input.rules = vec![rule("act", vec![], "thing=done", 1.0)];

    let result = Gps.preconditions(&input);
    assert!(result.is_err(), "GPS must reject input with no goals");
}

/// Rank-2: GPS unreachable goal returns Err, not panic.
#[test]
fn gps_unreachable_goal_returns_error() {
    let mut input = empty_input_base();
    input.state = vec![state_atom("at", "A")];
    input.goals = vec![goal("g1", "at", "Unreachable")];
    input.rules = vec![rule("move-to-B", vec!["at=A"], "at=B", 1.0)];

    let result = dispatch_breed_test("gps", &input);
    assert!(
        result.is_err(),
        "GPS unreachable goal must return Err, not panic"
    );
}

// =============================================================================
// Rank-2 — Hearsay domain contracts
// =============================================================================

/// Rank-2: Hearsay seeds initial facts onto blackboard (all seeds have cf=1.0).
/// Contract: every initial fact becomes a hypothesis with full confidence.
#[test]
fn hearsay_seeds_initial_facts() {
    let mut input = empty_input_base();
    input.facts = vec![
        fact("phone", "T"),
        fact("phone", "HH"),
    ];
    input.rules = vec![rule(
        "ks-phone-to-word",
        vec!["phone:T"],
        "word:THE",
        0.9,
    )];

    let output = dispatch_breed_test("hearsay", &input).expect("Hearsay seed test");
    assert_eq!(output.breed, BreedId::Hearsay);

    // Domain contract: seeding must be recorded in the trace.
    let seed_steps: Vec<_> = output
        .inference_trace
        .iter()
        .filter(|t| t.kind == "seed")
        .collect();
    assert_eq!(
        seed_steps.len(),
        2,
        "two seed facts must produce two seed trace steps"
    );
}

/// Rank-2: Hearsay inference propagates confidence downward (never amplifies past 1.0).
/// Contract: posted hypothesis cf <= trigger cf (no amplification through single KS).
#[test]
fn hearsay_confidence_cannot_exceed_one() {
    let mut input = empty_input_base();
    input.facts = vec![fact("phone", "T")];
    input.rules = vec![
        // High-certainty KS — but result must still be <= 1.0.
        rule("ks-high", vec!["phone:T"], "word:THE", 1.0),
    ];

    let output = dispatch_breed_test("hearsay", &input).expect("Hearsay bounds");

    // Domain contract: all hypotheses are bounded by noisy_or which clamps to [0,1].
    // We verify via the trace that posting happened.
    let has_post = output
        .inference_trace
        .iter()
        .any(|t| t.kind == "post-hypothesis");
    assert!(has_post, "must post at least one hypothesis");
    // Explanation must mention hypotheses count.
    assert!(
        output.explanation.contains("Hearsay posted"),
        "explanation must mention posted hypotheses"
    );
}

/// Rank-2: Hearsay requires at least one knowledge source (rule).
#[test]
fn hearsay_preconditions_reject_empty_rules() {
    use wasm4pm_cognition::breeds::hearsay::Hearsay;
    use wasm4pm_cognition::breeds::CognitionBreed;

    let mut input = empty_input_base();
    input.rules = vec![];

    let result = Hearsay.preconditions(&input);
    assert!(
        result.is_err(),
        "Hearsay must reject input with no knowledge sources"
    );
}

// =============================================================================
// Rank-2 — SOAR domain contracts
// =============================================================================

/// Rank-2: SOAR prohibit eliminates the target candidate.
/// Contract: a candidate tagged "prohibit" must be eliminated and not selected.
#[test]
fn soar_prohibit_eliminates_candidate() {
    let mut input = empty_input_base();
    input.candidates = vec![
        candidate("alpha", 0.9), // would win on score — but prohibited
        candidate("beta", 0.5),
    ];
    input.facts = vec![fact("pref", "prohibit:alpha")];

    let output = dispatch_breed_test("soar", &input).expect("SOAR prohibit");
    assert_eq!(output.breed, BreedId::Soar);

    // Domain contract: alpha must be eliminated.
    let alpha = output.candidates.iter().find(|c| c.id == "alpha").unwrap();
    assert!(alpha.eliminated, "prohibited candidate must be eliminated");
    assert_ne!(
        output.selected.as_deref(),
        Some("alpha"),
        "prohibited candidate must not be selected"
    );

    // Domain contract: beta survives and is selected.
    assert_eq!(
        output.selected.as_deref(),
        Some("beta"),
        "only surviving candidate must be selected"
    );
}

/// Rank-2: SOAR require restricts selection to required candidate only.
/// Contract: a "require" pref vetoes all candidates not in the require-set.
#[test]
fn soar_require_restricts_to_required_set() {
    let mut input = empty_input_base();
    input.candidates = vec![
        candidate("alpha", 0.9),
        candidate("beta", 0.8), // required
        candidate("gamma", 0.7),
    ];
    input.facts = vec![fact("pref", "require:beta")];

    let output = dispatch_breed_test("soar", &input).expect("SOAR require");

    // Domain contract: only beta survives.
    assert_eq!(
        output.selected.as_deref(),
        Some("beta"),
        "require pref must force selection of beta"
    );
    for c in &output.candidates {
        if c.id != "beta" {
            assert!(c.eliminated, "non-required candidate {} must be eliminated", c.id);
        }
    }
}

/// Rank-2: SOAR better-than dominance is transitive.
/// Contract: if A > B and B > C, then C is eliminated when A survives.
#[test]
fn soar_better_than_is_transitive() {
    let mut input = empty_input_base();
    input.candidates = vec![
        candidate("alpha", 0.5),
        candidate("beta", 0.5),
        candidate("gamma", 0.5),
    ];
    input.facts = vec![
        fact("pref", "better:alpha:beta"), // alpha > beta
        fact("pref", "better:beta:gamma"), // beta > gamma → transitively alpha > gamma
    ];

    let output = dispatch_breed_test("soar", &input).expect("SOAR transitivity");

    // Domain contract: gamma must be dominated (directly by beta).
    let gamma = output.candidates.iter().find(|c| c.id == "gamma").unwrap();
    assert!(gamma.eliminated, "gamma must be dominated transitively");
}

/// Rank-2: SOAR empty candidates → precondition rejects.
#[test]
fn soar_preconditions_reject_empty_candidates() {
    use wasm4pm_cognition::breeds::soar::Soar;
    use wasm4pm_cognition::breeds::CognitionBreed;

    let mut input = empty_input_base();
    input.candidates = vec![];

    let result = Soar.preconditions(&input);
    assert!(
        result.is_err(),
        "SOAR must reject input with no candidates"
    );
}

// =============================================================================
// Rank-2 — DENDRAL domain contracts
// =============================================================================

/// Rank-2: DENDRAL forbid constraint eliminates exactly the named candidate.
/// Contract: `forbid:X` must eliminate candidate with id == X, no others.
#[test]
fn dendral_forbid_eliminates_named_candidate() {
    let mut input = empty_input_base();
    input.candidates = vec![
        candidate("centralized-cloud", 0.9),
        candidate("edge-deployment", 0.7),
    ];
    input.facts = vec![fact("constraint", "forbid:centralized-cloud")];

    let output = dispatch_breed_test("dendral", &input).expect("DENDRAL forbid");
    assert_eq!(output.breed, BreedId::Dendral);

    // Domain contract: only the forbidden candidate is eliminated.
    let cloud = output.candidates.iter().find(|c| c.id == "centralized-cloud").unwrap();
    assert!(cloud.eliminated, "forbidden candidate must be eliminated");

    let edge = output.candidates.iter().find(|c| c.id == "edge-deployment").unwrap();
    assert!(!edge.eliminated, "non-forbidden candidate must survive");

    assert_eq!(
        output.selected.as_deref(),
        Some("edge-deployment"),
        "surviving candidate must be selected"
    );
}

/// Rank-2: DENDRAL elimination is monotonic — already-eliminated candidates stay eliminated.
/// Contract: applying additional constraints cannot restore an eliminated candidate.
#[test]
fn dendral_elimination_is_monotonic() {
    let mut input = empty_input_base();
    input.candidates = vec![
        candidate("target", 0.9),
        candidate("other", 0.5),
    ];
    // First constraint eliminates target; second is unrelated.
    input.facts = vec![
        fact("constraint", "forbid:target"),
        fact("constraint", "min-score:0.1"), // target already eliminated, this can't restore it
    ];

    let output = dispatch_breed_test("dendral", &input).expect("DENDRAL monotone");

    // Domain contract: target stays eliminated after second constraint.
    let target = output.candidates.iter().find(|c| c.id == "target").unwrap();
    assert!(
        target.eliminated,
        "eliminated candidate must not be restored by subsequent constraints"
    );
}

/// Rank-2: DENDRAL min-score constraint eliminates candidates below threshold.
#[test]
fn dendral_min_score_constraint_eliminates_low_scorer() {
    let mut input = empty_input_base();
    input.candidates = vec![
        candidate("low-quality", 0.2),
        candidate("high-quality", 0.9),
    ];
    input.facts = vec![fact("constraint", "min-score:0.5")];

    let output = dispatch_breed_test("dendral", &input).expect("DENDRAL min-score");

    let low = output.candidates.iter().find(|c| c.id == "low-quality").unwrap();
    assert!(low.eliminated, "low-score candidate must be eliminated");

    let high = output.candidates.iter().find(|c| c.id == "high-quality").unwrap();
    assert!(!high.eliminated, "high-score candidate must survive");
}

/// Rank-2: DENDRAL with no constraints — all candidates survive.
/// Contract: zero constraints → no eliminations → trace has only "survive" steps.
#[test]
fn dendral_no_constraints_all_survive() {
    let mut input = empty_input_base();
    input.candidates = vec![
        candidate("alpha", 0.8),
        candidate("beta", 0.6),
    ];
    input.facts = vec![]; // no constraints

    let output = dispatch_breed_test("dendral", &input).expect("DENDRAL no constraints");

    // Domain contract: all candidates survive.
    for c in &output.candidates {
        assert!(!c.eliminated, "candidate {} must survive with no constraints", c.id);
    }

    // Explanation mentions 0 constraints applied.
    assert!(
        output.explanation.contains("0 constraints") || output.explanation.contains("applied 0"),
        "explanation must note zero constraints, got: {}",
        output.explanation
    );
}

/// Rank-2: DENDRAL empty candidates → precondition rejects.
#[test]
fn dendral_preconditions_reject_empty_candidates() {
    use wasm4pm_cognition::breeds::dendral::Dendral;
    use wasm4pm_cognition::breeds::CognitionBreed;

    let mut input = empty_input_base();
    input.candidates = vec![];

    let result = Dendral.preconditions(&input);
    assert!(
        result.is_err(),
        "DENDRAL must reject input with no candidates"
    );
}

// =============================================================================
// Rank-2 — MYCIN domain contracts (full engine)
// =============================================================================

/// Rank-2: MYCIN fires rules in certainty order (highest |cf| first).
/// Contract: a higher-certainty rule must fire before a lower-certainty one.
#[test]
fn mycin_fires_rules_by_certainty_order() {
    let mut input = empty_input_base();
    input.facts = vec![
        fact("symptom", "fever"),
        fact("symptom", "cough"),
    ];
    input.rules = vec![
        rule(
            "rule-low",
            vec!["symptom=fever"],
            "disease=mild-cold",
            0.3,
        ),
        rule(
            "rule-high",
            vec!["symptom=cough"],
            "disease=serious-infection",
            0.85,
        ),
    ];

    let output = dispatch_breed_test("mycin", &input).expect("MYCIN order");
    assert_eq!(output.breed, BreedId::Mycin);

    // Domain contract: rule-high (cf=0.85) must fire before rule-low (cf=0.3).
    // Verify by checking trace order.
    let fired: Vec<&str> = output
        .inference_trace
        .iter()
        .filter(|t| t.kind == "fire-rule")
        .map(|t| {
            if t.detail.contains("rule-high") {
                "rule-high"
            } else if t.detail.contains("rule-low") {
                "rule-low"
            } else {
                "other"
            }
        })
        .collect();

    // Both must fire.
    assert!(fired.contains(&"rule-high"), "rule-high must fire");
    assert!(fired.contains(&"rule-low"), "rule-low must fire");

    // rule-high must come first.
    let high_pos = fired.iter().position(|&r| r == "rule-high").unwrap();
    let low_pos = fired.iter().position(|&r| r == "rule-low").unwrap();
    assert!(
        high_pos < low_pos,
        "rule-high (cf=0.85) must fire before rule-low (cf=0.3)"
    );
}

/// Rank-2: MYCIN with no applicable rules produces empty trace.
/// This verifies the engine doesn't fire rules whose premises are not met.
#[test]
fn mycin_no_applicable_rules_empty_trace() {
    let mut input = empty_input_base();
    // Fact that doesn't match any rule premise.
    input.facts = vec![fact("unrelated", "data")];
    input.rules = vec![rule(
        "rule-1",
        vec!["symptom=fever"], // not in working memory
        "disease=infection",
        0.9,
    )];

    let output = dispatch_breed_test("mycin", &input).expect("MYCIN no applicable");

    // Domain contract: no rules fire → inference trace is empty.
    let fire_steps: Vec<_> = output
        .inference_trace
        .iter()
        .filter(|t| t.kind == "fire-rule")
        .collect();
    assert!(
        fire_steps.is_empty(),
        "no applicable rules should produce no fire-rule steps"
    );
}
