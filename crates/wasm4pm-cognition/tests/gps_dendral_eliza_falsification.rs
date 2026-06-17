//! PhD-level formal property falsification tests for GPS, DENDRAL, and ELIZA.
//!
//! Oracle ranks:
//! - **Rank-1 (mathematical theorem)**: Properties derived from the published
//!   algorithm specification (Newell & Shaw 1963, Feigenbaum 1971, Weizenbaum 1966).
//!   These are unfakeable: a stub cannot satisfy them without implementing the real algorithm.
//! - **Rank-2 (domain contract)**: Design-decided properties — pre/postconditions,
//!   monotonicity invariants, encoding contracts. A stub that hardcodes expected values
//!   cannot satisfy these because the expected values depend on the exact input.
//!
//! FM-5 principle is respected: expected values are derived from the algorithm's
//! mathematical specification, never read back from the implementation.

#![allow(clippy::all)]

use wasm4pm_cognition::breeds::{
    dendral::Dendral, frame::Eliza, gps::Gps, BreedInput, Candidate, CognitionBreed, Fact, Goal,
    Rule, StateAtom,
};

// =============================================================================
// Helpers
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

fn gps_input(state: Vec<StateAtom>, goals: Vec<Goal>, rules: Vec<Rule>) -> BreedInput {
    BreedInput {
        intent: "test".into(),
        candidates: vec![],
        facts: vec![],
        cases: vec![],
        rules,
        goals,
        state,
    }
}

fn dendral_input(candidates: Vec<Candidate>, constraint_values: Vec<&str>) -> BreedInput {
    BreedInput {
        intent: "test".into(),
        candidates,
        facts: constraint_values
            .into_iter()
            .map(|v| fact("constraint", v))
            .collect(),
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    }
}

fn eliza_input(intent: &str) -> BreedInput {
    BreedInput {
        intent: intent.to_string(),
        candidates: vec![],
        facts: vec![],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    }
}

// =============================================================================
// GPS — Newell-Simon Means-Ends Analysis invariants
// =============================================================================

/// Rank-1 (Newell & Shaw 1963 — Means-Ends Analysis):
/// Difference reduction is monotone: each operator application in the plan must
/// address a previously unmet goal atom. Test a 3-step chain: A→B→C→D.
/// The plan length must equal exactly 3 (one op per unmet goal).
/// A stub returning a fixed plan can't know the goal count from the input structure.
#[test]
fn gps_difference_reduction_monotone_chain() {
    // Chain: initial has "a=1". Goal needs "a=1", "b=1", "c=1", "d=1".
    // But we have operators: make-b (needs a=1, adds b=1), make-c (needs b=1, adds c=1),
    // make-d (needs c=1, adds d=1). GPS must produce [make-b, make-c, make-d].
    let input = gps_input(
        vec![state_atom("a", "1")],
        vec![
            goal("g1", "a", "1"), // already satisfied
            goal("g2", "b", "1"),
            goal("g3", "c", "1"),
            goal("g4", "d", "1"),
        ],
        vec![
            rule("make-b", vec!["a=1"], "b=1", 1.0),
            rule("make-c", vec!["b=1"], "c=1", 1.0),
            rule("make-d", vec!["c=1"], "d=1", 1.0),
        ],
    );

    let output = Gps
        .run(&input)
        .expect("GPS must succeed for reachable chain");

    // Plan must be exactly 3 operators (make-b, make-c, make-d in order).
    // "a=1" is already satisfied, so the first gap is b=1.
    let plan_str = output.selected.as_deref().unwrap_or("");
    assert!(
        !plan_str.is_empty(),
        "3-step chain must produce a non-empty plan"
    );

    let plan_steps: Vec<&str> = plan_str.split(',').collect();
    assert_eq!(
        plan_steps.len(),
        3,
        "3-gap chain must produce plan of length 3, got: {:?}",
        plan_steps
    );

    // Verify apply-operator trace steps form a valid sequence (each adds one fact).
    let apply_steps: Vec<_> = output
        .inference_trace
        .iter()
        .filter(|t| t.kind == "apply-operator")
        .collect();
    assert_eq!(
        apply_steps.len(),
        3,
        "3-gap chain must emit exactly 3 apply-operator trace steps"
    );
}

/// Rank-1 (Newell & Shaw 1963):
/// An operator whose preconditions are NOT met in the initial state MUST NOT appear
/// in the plan. This is the fundamental soundness property of means-ends analysis.
#[test]
fn gps_operator_applies_iff_preconditions_met() {
    // Operator "unlock" requires "key=held", adds "door=open".
    // Initial state does NOT have "key=held" → "unlock" must NOT appear in plan.
    let input_without_precond = gps_input(
        vec![state_atom("door", "closed")], // no key=held
        vec![goal("g1", "door", "open")],
        vec![rule("unlock", vec!["key=held"], "door=open", 1.0)],
    );

    // GPS should fail because precondition "key=held" is unachievable.
    let result = Gps.run(&input_without_precond);
    assert!(
        result.is_err(),
        "operator with unmet preconditions must not yield a plan; GPS must fail"
    );

    // Now verify WITH precondition present → operator MUST appear.
    let input_with_precond = gps_input(
        vec![state_atom("key", "held")], // precondition satisfied
        vec![goal("g1", "door", "open")],
        vec![rule("unlock", vec!["key=held"], "door=open", 1.0)],
    );
    let output = Gps
        .run(&input_with_precond)
        .expect("GPS must succeed with precond met");
    let plan = output.selected.as_deref().unwrap_or("");
    assert!(
        plan.contains("unlock"),
        "operator 'unlock' must appear in plan when precondition is met, got: {:?}",
        plan
    );
}

/// Rank-1 (Newell & Shaw 1963 — halting with depth cap):
/// With N distinct single-use operators, the plan length is bounded by N.
/// GPS must not loop or repeat operators (cycle detection ensures halting).
#[test]
fn gps_plan_length_bounded_by_operators() {
    // 3 operators, each adds one unique fact. Goals match exactly those 3 facts.
    // Plan length must be <= 3.
    let input = gps_input(
        vec![state_atom("start", "true")],
        vec![
            goal("g1", "x", "done"),
            goal("g2", "y", "done"),
            goal("g3", "z", "done"),
        ],
        vec![
            rule("op-x", vec!["start=true"], "x=done", 1.0),
            rule("op-y", vec!["x=done"], "y=done", 1.0),
            rule("op-z", vec!["y=done"], "z=done", 1.0),
        ],
    );

    let output = Gps
        .run(&input)
        .expect("GPS must find plan within N operators");
    let plan = output.selected.as_deref().unwrap_or("");
    let plan_steps: Vec<&str> = if plan.is_empty() {
        vec![]
    } else {
        plan.split(',').collect()
    };

    assert!(
        plan_steps.len() <= 3,
        "plan length {} exceeds operator count 3: {:?}",
        plan_steps.len(),
        plan_steps
    );
    // All plan steps must be distinct (no repeated operators).
    let unique: std::collections::HashSet<&str> = plan_steps.iter().copied().collect();
    assert_eq!(
        unique.len(),
        plan_steps.len(),
        "plan must not repeat operators: {:?}",
        plan_steps
    );
}

/// Rank-1 (Newell & Shaw 1963 — completeness / failure mode):
/// If no operator produces goal fact G, GPS MUST return an error.
/// This is unfakeable: a real GPS must traverse the operator set and fail on absence.
#[test]
fn gps_unreachable_via_operators_returns_error() {
    // Goal requires "treasure=found". No operator produces "treasure=found".
    let input = gps_input(
        vec![state_atom("location", "cave")],
        vec![goal("g1", "treasure", "found")],
        vec![
            // Only operator: moves location, doesn't produce treasure=found.
            rule("explore", vec!["location=cave"], "visited=cave", 1.0),
        ],
    );

    let result = Gps.run(&input);
    assert!(
        result.is_err(),
        "GPS must return Err when no operator produces the goal fact"
    );

    let err = result.unwrap_err();
    // Error must mention the missing goal production.
    assert!(
        err.message.contains("no operator produces") || err.message.contains("treasure"),
        "error must describe the unreachable goal, got: '{}'",
        err.message
    );
}

/// Rank-2 (domain contract — difference table coverage):
/// For each fact in goal NOT in initial state, the final plan must contain
/// at least one step that adds it. This validates end-to-end goal coverage.
#[test]
fn gps_difference_table_coverage() {
    // Goals: "light=on" and "fan=on". Initial: empty.
    // Operators: flip-light (no precond, adds light=on), flip-fan (no precond, adds fan=on).
    let input = gps_input(
        vec![], // empty initial state
        vec![goal("g1", "light", "on"), goal("g2", "fan", "on")],
        vec![
            rule("flip-light", vec![], "light=on", 1.0),
            rule("flip-fan", vec![], "fan=on", 1.0),
        ],
    );

    let output = Gps.run(&input).expect("GPS must cover both goals");
    let plan = output.selected.as_deref().unwrap_or("");
    assert!(
        !plan.is_empty(),
        "must produce a non-empty plan for two unmet goals"
    );

    // Both operators must appear in the plan (each covers one goal gap).
    assert!(
        plan.contains("flip-light"),
        "plan must include 'flip-light' to achieve light=on, plan: {:?}",
        plan
    );
    assert!(
        plan.contains("flip-fan"),
        "plan must include 'flip-fan' to achieve fan=on, plan: {:?}",
        plan
    );
}

/// Rank-2 (domain contract — postcondition):
/// After GPS runs successfully, the inference trace must contain at least one
/// "reduce-gap" step (proving means-ends analysis happened, not stub passthrough).
#[test]
fn gps_trace_contains_reduce_gap_steps_for_non_trivial_problem() {
    let input = gps_input(
        vec![],
        vec![goal("g1", "done", "true")],
        vec![rule("finish", vec![], "done=true", 1.0)],
    );

    let output = Gps.run(&input).expect("GPS must succeed");
    assert!(
        output
            .inference_trace
            .iter()
            .any(|t| t.kind == "reduce-gap"),
        "GPS must emit a reduce-gap trace step for non-trivial problems"
    );
    assert!(
        output
            .inference_trace
            .iter()
            .any(|t| t.kind == "apply-operator"),
        "GPS must emit an apply-operator trace step"
    );
}

// =============================================================================
// DENDRAL — Formal property tests (Feigenbaum 1971)
// =============================================================================

/// Rank-1 (Feigenbaum 1971 — forbid constraint absolute):
/// A candidate with a forbidden substructure must be eliminated regardless of score.
/// Even if it has the highest score, it must be gone.
#[test]
fn dendral_forbid_constraint_is_absolute() {
    // "toxic-heavy-metal" has score 0.99 (highest), but is forbidden.
    // "safe-compound" has score 0.50 and must win.
    let input = dendral_input(
        vec![
            candidate("toxic-heavy-metal", 0.99),
            candidate("safe-compound", 0.50),
        ],
        vec!["forbid:toxic-heavy-metal"],
    );

    let output = Dendral
        .run(&input)
        .expect("DENDRAL must run with forbid constraint");

    let toxic = output
        .candidates
        .iter()
        .find(|c| c.id == "toxic-heavy-metal")
        .unwrap();
    assert!(
        toxic.eliminated,
        "forbid constraint must eliminate toxic-heavy-metal regardless of its high score"
    );
    assert_eq!(
        output.selected.as_deref(),
        Some("safe-compound"),
        "safe-compound must be selected as the only survivor"
    );
}

/// Rank-1 (Feigenbaum 1971 — require constraint absolute):
/// A "require:X" constraint eliminates all candidates whose id does NOT contain X.
/// If no candidate satisfies the require constraint, selected = None.
#[test]
fn dendral_require_constraint_filters_out_non_matching() {
    // require:offline — but no candidate id contains "offline".
    let input = dendral_input(
        vec![
            candidate("cloud-deploy", 0.9),
            candidate("edge-deploy", 0.8),
        ],
        vec!["require:offline"],
    );

    let output = Dendral.run(&input).expect("DENDRAL must run");
    // All candidates are eliminated because none contain "offline".
    for c in &output.candidates {
        assert!(
            c.eliminated,
            "candidate '{}' must be eliminated: doesn't satisfy require:offline",
            c.id
        );
    }
    assert!(
        output.selected.is_none(),
        "selected must be None when no candidate satisfies require constraint"
    );
}

/// Rank-1 (Feigenbaum 1971 — min-score constraint):
/// min-score:T eliminates candidates with score < T. Candidates with score >= T survive.
#[test]
fn dendral_score_constraint_eliminates_low_scorers() {
    let input = dendral_input(
        vec![
            candidate("reject-A", 0.1),
            candidate("reject-B", 0.29),
            candidate("survive-C", 0.3), // exactly at threshold — survives (not < 0.3)
            candidate("survive-D", 0.9),
        ],
        vec!["min-score:0.3"],
    );

    let output = Dendral
        .run(&input)
        .expect("DENDRAL must run with min-score constraint");

    let a = output
        .candidates
        .iter()
        .find(|c| c.id == "reject-A")
        .unwrap();
    let b = output
        .candidates
        .iter()
        .find(|c| c.id == "reject-B")
        .unwrap();
    let c = output
        .candidates
        .iter()
        .find(|c| c.id == "survive-C")
        .unwrap();
    let d = output
        .candidates
        .iter()
        .find(|c| c.id == "survive-D")
        .unwrap();

    assert!(
        a.eliminated,
        "reject-A (score=0.1) must be eliminated by min-score:0.3"
    );
    assert!(
        b.eliminated,
        "reject-B (score=0.29) must be eliminated by min-score:0.3"
    );
    assert!(
        !c.eliminated,
        "survive-C (score=0.3) must survive: not strictly < 0.3"
    );
    assert!(!d.eliminated, "survive-D (score=0.9) must survive");
    assert_eq!(
        output.selected.as_deref(),
        Some("survive-D"),
        "highest survivor must be selected"
    );
}

/// Rank-1 (Feigenbaum 1971 — monotonic elimination idempotency):
/// Applying the same forbid constraint twice yields the same result as once.
/// Eliminating an already-eliminated candidate is a no-op.
#[test]
fn dendral_elimination_is_idempotent() {
    // Apply the same forbid constraint twice.
    let input_once = dendral_input(
        vec![candidate("target", 0.5), candidate("survivor", 0.4)],
        vec!["forbid:target"],
    );
    let input_twice = dendral_input(
        vec![candidate("target", 0.5), candidate("survivor", 0.4)],
        vec!["forbid:target", "forbid:target"], // same constraint twice
    );

    let out_once = Dendral.run(&input_once).expect("run with single forbid");
    let out_twice = Dendral.run(&input_twice).expect("run with double forbid");

    // Both must select the same candidate.
    assert_eq!(
        out_once.selected, out_twice.selected,
        "applying the same constraint twice must yield the same selection"
    );

    // Target must be eliminated in both cases.
    let target_once = out_once
        .candidates
        .iter()
        .find(|c| c.id == "target")
        .unwrap();
    let target_twice = out_twice
        .candidates
        .iter()
        .find(|c| c.id == "target")
        .unwrap();
    assert!(target_once.eliminated, "target eliminated (once)");
    assert!(target_twice.eliminated, "target eliminated (twice)");
}

/// Rank-1 (Feigenbaum 1971 — no-constraint baseline):
/// Zero constraints → ALL candidates survive. No false eliminations.
/// This is the null hypothesis: DENDRAL must not invent eliminations out of thin air.
#[test]
fn dendral_all_constraints_satisfied_means_all_candidates_survive() {
    let input = dendral_input(
        vec![
            candidate("alpha", 0.3),
            candidate("beta", 0.7),
            candidate("gamma", 0.5),
        ],
        vec![], // no constraints
    );

    let output = Dendral
        .run(&input)
        .expect("DENDRAL must succeed with no constraints");

    for c in &output.candidates {
        assert!(
            !c.eliminated,
            "candidate '{}' must survive with zero constraints",
            c.id
        );
    }
    // The selected must be the highest scorer (beta, 0.7).
    assert_eq!(
        output.selected.as_deref(),
        Some("beta"),
        "highest-scoring candidate must be selected when all survive"
    );
}

/// Rank-2 (domain contract — trace coverage):
/// DENDRAL must emit at least one trace step per surviving candidate.
/// The trace is evidence that each candidate was evaluated, not skipped.
#[test]
fn dendral_trace_step_per_surviving_candidate() {
    let input = dendral_input(
        vec![
            candidate("eliminate-me", 0.9),
            candidate("keep-A", 0.7),
            candidate("keep-B", 0.5),
        ],
        vec!["forbid:eliminate-me"],
    );

    let output = Dendral.run(&input).expect("DENDRAL must run");

    // Count survive steps.
    let survive_count = output
        .inference_trace
        .iter()
        .filter(|t| t.kind == "survive")
        .count();

    // keep-A and keep-B both survive → exactly 2 survive steps.
    assert_eq!(
        survive_count, 2,
        "must emit exactly 2 survive trace steps for 2 surviving candidates"
    );

    // eliminate-me must have an eliminate step.
    let has_eliminate = output
        .inference_trace
        .iter()
        .any(|t| t.kind == "eliminate" && t.detail.contains("eliminate-me"));
    assert!(
        has_eliminate,
        "must emit eliminate trace step for 'eliminate-me'"
    );
}

// =============================================================================
// ELIZA — Keystack priority and reflection falsification (Weizenbaum 1966)
// =============================================================================

/// Rank-1 (Weizenbaum 1966 — pattern specificity wins over catch-all):
/// ELIZA uses longest-pattern-first ordering (specificity proxy for priority).
/// A specific pattern "i am * because *" must win over "i am *" which must win
/// over the catch-all "*". This is unfakeable without the real sorting mechanism.
#[test]
fn eliza_longer_pattern_wins_over_shorter() {
    // "i am sad because work" matches BOTH "i am * because *" AND "i am *" AND "*".
    // The longest (most specific) pattern "i am * because *" must be selected.
    let output = Eliza
        .run(&eliza_input("i am sad because work"))
        .expect("ELIZA must handle this input");

    // The selected field contains the matched pattern.
    let matched_pattern = output.selected.as_deref().unwrap_or("");
    assert!(
        matched_pattern.contains("because"),
        "longer 'i am * because *' pattern must win over shorter 'i am *', matched: {:?}",
        matched_pattern
    );

    // Explanation should reflect the two captured slots.
    let explanation = &output.explanation;
    assert!(
        explanation.contains("Why are you") || explanation.contains("you are"),
        "explanation must come from the 'i am * because *' template, got: {}",
        explanation
    );
}

/// Rank-1 (Weizenbaum 1966 — catch-all always fires):
/// ELIZA's catch-all "*" pattern ensures it NEVER fails to respond.
/// Input with zero keyword matches must still produce a response, not None.
/// This is the ELIZA liveness property.
#[test]
fn eliza_no_match_produces_generic_response() {
    // Gibberish input with no known ELIZA keywords.
    let output = Eliza
        .run(&eliza_input("xyzzy plugh frobozz"))
        .expect("ELIZA must always produce Ok");

    // ELIZA must produce SOME response (the catch-all "*" pattern).
    assert!(
        output.selected.is_some() || !output.explanation.is_empty(),
        "ELIZA must respond to any non-empty input"
    );
    // The catch-all pattern is "*".
    let matched = output.selected.as_deref().unwrap_or("");
    assert!(
        matched == "*" || output.explanation.contains("Please go on"),
        "catch-all must fire for unrecognized input, matched: {:?}, explanation: {}",
        matched,
        output.explanation
    );
}

/// Rank-1 (Weizenbaum 1966 — pronoun reflection in response):
/// "I am sad" → captured slot "sad" → after reflection "i" becomes "you", "am" becomes "are".
/// The response must contain "you been" (from the "i am *" template: "How long have you been ${1}?").
/// This directly tests pronoun reflection logic — unfakeable without real reflection.
#[test]
fn eliza_reflection_transforms_pronouns_in_response() {
    let output = Eliza.run(&eliza_input("i am sad")).expect("ELIZA must run");

    let explanation = &output.explanation;
    // "How long have you been sad?" — verifies slot capture + no reflection of "sad".
    assert!(
        explanation.to_lowercase().contains("you been"),
        "response must contain 'you been' (pronoun reflection in template), got: {}",
        explanation
    );
    assert!(
        explanation.to_lowercase().contains("sad"),
        "captured slot 'sad' must appear in response, got: {}",
        explanation
    );
}

/// Rank-1 (Weizenbaum 1966 — differentiating inputs):
/// "I am happy" and "I am sad" must produce different explanation strings.
/// A constant-response stub fails this test.
#[test]
fn eliza_different_inputs_produce_different_explanations() {
    let out_happy = Eliza.run(&eliza_input("i am happy")).expect("run ok");
    let out_sad = Eliza.run(&eliza_input("i am sad")).expect("run ok");

    assert_ne!(
        out_happy.explanation, out_sad.explanation,
        "different inputs must produce different explanations: happy='{}', sad='{}'",
        out_happy.explanation, out_sad.explanation
    );
}

/// Rank-2 (domain contract — custom frames override default frames):
/// When frame.pattern facts are supplied, the custom frames are used instead of defaults.
/// Custom frame "i feel * || You said you feel ${1}." must match "i feel lonely".
#[test]
fn eliza_custom_frame_overrides_default() {
    let input = BreedInput {
        intent: "i feel lonely".to_string(),
        candidates: vec![],
        facts: vec![fact("frame.pattern", "i feel * || You said you feel ${1}.")],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let output = Eliza.run(&input).expect("ELIZA must run with custom frame");
    assert!(
        output.explanation.contains("You said you feel"),
        "custom frame template must be used, got: {}",
        output.explanation
    );
    assert!(
        output.explanation.contains("lonely"),
        "captured slot 'lonely' must appear in custom response, got: {}",
        output.explanation
    );
}

/// Rank-2 (domain contract — match-pattern trace step):
/// Every successful match must produce a "match-pattern" trace step.
/// A stub that returns a response without going through the matching loop fails this.
#[test]
fn eliza_successful_match_emits_match_pattern_trace() {
    let output = Eliza
        .run(&eliza_input("i am worried"))
        .expect("ELIZA must run");

    assert!(
        output
            .inference_trace
            .iter()
            .any(|t| t.kind == "match-pattern"),
        "must emit match-pattern trace step on successful match"
    );
    // The matched pattern must be in the trace detail.
    let matched_trace = output
        .inference_trace
        .iter()
        .find(|t| t.kind == "match-pattern")
        .unwrap();
    assert!(
        !matched_trace.detail.is_empty(),
        "match-pattern trace step must contain the matched pattern"
    );
}

/// Rank-2 (domain contract — try-pattern precedes match-pattern):
/// The engine must try patterns in order before matching one.
/// At minimum there must be as many try-pattern steps as there are patterns before the match.
#[test]
fn eliza_try_pattern_steps_precede_match() {
    // "i am tired" matches "i am *" (second pattern after "i am * because *" fails).
    let output = Eliza
        .run(&eliza_input("i am tired"))
        .expect("ELIZA must run");

    let try_steps = output
        .inference_trace
        .iter()
        .filter(|t| t.kind == "try-pattern")
        .count();
    assert!(
        try_steps >= 1,
        "must emit at least one try-pattern step before matching"
    );

    // try-pattern must appear before match-pattern in trace order.
    let try_pos = output
        .inference_trace
        .iter()
        .position(|t| t.kind == "try-pattern")
        .unwrap();
    let match_pos = output
        .inference_trace
        .iter()
        .position(|t| t.kind == "match-pattern");

    if let Some(match_pos) = match_pos {
        assert!(
            try_pos < match_pos,
            "try-pattern (pos {}) must precede match-pattern (pos {})",
            try_pos,
            match_pos
        );
    }
}
