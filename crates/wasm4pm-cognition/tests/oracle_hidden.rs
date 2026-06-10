//! Hidden oracle challenge tests — T_hidden corpus.
//!
//! Purpose: defeat adversary classes A1 (finite lookup table over known inputs)
//! and A2 (memoized dictionary) by supplying inputs that do NOT appear in any
//! public test file.  Each test also carries an A3 adversary check: a simplified
//! (stub) algorithm would produce an empty inference_trace, so every test
//! asserts `inference_trace.is_empty() == false`.
//!
//! Oracle rank: Rank-3 (domain ground truth — inputs are novel; conclusions are
//! verified by manual derivation against the algorithm specification).
//!
//! Pure Rust — no wasm_bindgen, no mocking.

use wasm4pm_cognition::breeds::{
    dispatch_breed_test, BreedInput, Candidate, Fact, Goal, Rule, StateAtom,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn base(intent: &str) -> BreedInput {
    BreedInput {
        intent: intent.into(),
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

// ===========================================================================
// MYCIN hidden challenge tests
// ===========================================================================

/// Hidden-MYCIN-1: gram-negative sepsis pathway.
///
/// Rule chain:
///   R1: gram-negative + rod-shaped -> pseudomonas (CF 0.6)
///   R2: pseudomonas + immunocompromised -> gentamicin (CF 0.8)
///
/// A lookup table containing only published MYCIN examples (fever/staphylococcus)
/// cannot match this chain. A depth<=1 memoizer cannot derive the R2 conclusion
/// because it depends on R1's output ("pseudomonas") which is itself inferred.
#[test]
fn mycin_hidden_gram_negative_sepsis() {
    let mut input = base("gram-negative sepsis workup");
    input.facts = vec![
        fact("morphology", "gram-negative"),
        fact("shape", "rod-shaped"),
        fact("host-status", "immunocompromised"),
        fact("presentation", "suspected-bacteremia"),
        fact("temperature", "39.8"),
    ];
    input.rules = vec![
        rule(
            "R-gram-neg-rod-pseudomonas",
            vec!["morphology=gram-negative", "shape=rod-shaped"],
            "organism=pseudomonas",
            0.6,
        ),
        rule(
            "R-pseudomonas-immuno-gentamicin",
            vec!["organism=pseudomonas", "host-status=immunocompromised"],
            "therapy=gentamicin",
            0.8,
        ),
    ];

    let output = dispatch_breed_test("mycin", &input)
        .expect("MYCIN gram-negative sepsis must not return Err");

    // A3 adversary check: real forward-chaining must produce trace entries.
    assert!(
        !output.inference_trace.is_empty(),
        "MYCIN gram-negative sepsis: inference_trace must not be empty (A3 adversary check)"
    );

    // At least 2 rules must have fired (R1 then R2 via chained conclusion).
    let fired_count = output
        .inference_trace
        .iter()
        .filter(|t| t.kind == "fire-rule")
        .count();
    assert!(
        fired_count >= 2,
        "MYCIN gram-negative sepsis: expected >=2 fired rules, got {fired_count}"
    );

    // Ground-truth oracle: gentamicin must appear in derived facts.
    let has_gentamicin = output.facts.iter().any(|f| {
        (f.key == "therapy" && f.value == "gentamicin")
            || f.value.contains("gentamicin")
    });
    assert!(
        has_gentamicin,
        "MYCIN gram-negative sepsis: gentamicin must be a derived fact; facts={:?}",
        output.facts
    );
}

/// Hidden-MYCIN-2: fungal infection (cryptococcal meningitis) pathway.
///
/// Rule chain:
///   R1: india-ink-positive -> cryptococcus (CF 0.9)
///   R2: cryptococcus + meningitis -> amphotericin (CF 0.85)
///
/// These organism/therapy names do not appear in any published oracle input.
#[test]
fn mycin_hidden_fungal_infection() {
    let mut input = base("CNS fungal infection workup");
    input.facts = vec![
        fact("india-ink-test", "positive"),
        fact("cns-finding", "meningitis"),
        fact("csf-pressure", "elevated"),
    ];
    input.rules = vec![
        rule(
            "R-india-ink-cryptococcus",
            vec!["india-ink-test=positive"],
            "organism=cryptococcus",
            0.9,
        ),
        rule(
            "R-cryptococcus-meningitis-amphotericin",
            vec!["organism=cryptococcus", "cns-finding=meningitis"],
            "therapy=amphotericin",
            0.85,
        ),
    ];

    let output = dispatch_breed_test("mycin", &input)
        .expect("MYCIN fungal infection must not return Err");

    // A3 adversary check.
    assert!(
        !output.inference_trace.is_empty(),
        "MYCIN fungal infection: inference_trace must not be empty"
    );

    // Both rules must fire: R1 produces cryptococcus; R2 consumes it.
    let fired_count = output
        .inference_trace
        .iter()
        .filter(|t| t.kind == "fire-rule")
        .count();
    assert_eq!(
        fired_count, 2,
        "MYCIN fungal infection: expected exactly 2 fired rules, got {fired_count}"
    );

    // Ground-truth oracle: amphotericin is the terminal therapy recommendation.
    let has_amphotericin = output.facts.iter().any(|f| {
        (f.key == "therapy" && f.value == "amphotericin")
            || f.value.contains("amphotericin")
    });
    assert!(
        has_amphotericin,
        "MYCIN fungal infection: amphotericin must be a derived fact; facts={:?}",
        output.facts
    );
}

/// Hidden-MYCIN-3: depth-4 CF chain — defeats any lookup table with depth ≤ 3.
///
/// Rule chain (each rule's premise uses the PREVIOUS rule's conclusion):
///   R1: signal=A         -> intermediate=B (CF 0.7)
///   R2: intermediate=B   -> intermediate=C (CF 0.8)
///   R3: intermediate=C   -> intermediate=D (CF 0.9)
///   R4: intermediate=D   -> therapy=target (CF 0.95)
///
/// A lookup table that only caches chains of depth ≤ 3 will fail to reach
/// the depth-4 conclusion "therapy=target".
#[test]
fn mycin_hidden_cf_chain_depth_4() {
    let mut input = base("depth-4 CF chain challenge");
    input.facts = vec![fact("signal", "A")];
    input.rules = vec![
        rule(
            "R-depth1-A-to-B",
            vec!["signal=A"],
            "intermediate=B",
            0.7,
        ),
        rule(
            "R-depth2-B-to-C",
            vec!["intermediate=B"],
            "intermediate=C",
            0.8,
        ),
        rule(
            "R-depth3-C-to-D",
            vec!["intermediate=C"],
            "intermediate=D",
            0.9,
        ),
        rule(
            "R-depth4-D-to-therapy",
            vec!["intermediate=D"],
            "therapy=target",
            0.95,
        ),
    ];

    let output = dispatch_breed_test("mycin", &input)
        .expect("MYCIN depth-4 chain must not return Err");

    // A3 adversary check.
    assert!(
        !output.inference_trace.is_empty(),
        "MYCIN depth-4 chain: inference_trace must not be empty"
    );

    // All four rules must have fired.
    let fired_count = output
        .inference_trace
        .iter()
        .filter(|t| t.kind == "fire-rule")
        .count();
    assert_eq!(
        fired_count, 4,
        "MYCIN depth-4 chain: expected 4 fired rules, got {fired_count}"
    );

    // Ground-truth oracle: the depth-4 conclusion "therapy=target" must exist.
    let has_target_therapy = output.facts.iter().any(|f| {
        (f.key == "therapy" && f.value == "target")
            || f.value.contains("target")
    });
    assert!(
        has_target_therapy,
        "MYCIN depth-4 chain: therapy=target must be derived; facts={:?}",
        output.facts
    );
}

// ===========================================================================
// Prolog hidden challenge tests
// ===========================================================================

/// Hidden-Prolog-1: sibling derivation with 5 parent facts using ?N variables.
///
/// Program:
///   parent(tom, bob).   parent(tom, liz).
///   parent(bob, ann).   parent(bob, pat).
///   parent(liz, dan).
///   sibling(?0,?1) :- parent:?2,?0, parent:?2,?1   (where ?0 != ?1)
///
/// Query: sibling:ann,pat  (both have parent bob → derivable)
///
/// Facts encoded as `key="parent:child,common-parent"` using the Prolog breed's
/// `parse_key` format `"predicate:arg0,arg1"`.  Rules use `?N` variables to
/// trigger the forward-chain path.
#[test]
fn prolog_hidden_sibling_derivation() {
    let mut input = base("sibling:ann,pat");
    // Facts encoded as `key="parent:child,common-parent"` (pred:arg0,arg1).
    // parse_key("parent:bob,tom") → ("parent", ["bob", "tom"])
    input.facts = vec![
        fact("parent:bob,tom", "true"),
        fact("parent:liz,tom", "true"),
        fact("parent:ann,bob", "true"),
        fact("parent:pat,bob", "true"),
        fact("parent:dan,liz", "true"),
    ];
    // sibling(?0,?1) :- parent:?0,?2, parent:?1,?2
    // Conclusion: sibling:?0,?1 — derives (sibling, [ann, pat]) when ?0=ann, ?1=pat, ?2=bob.
    input.rules = vec![rule(
        "R-sibling-shared-parent",
        vec!["parent:?0,?2", "parent:?1,?2"],
        "sibling:?0,?1",
        1.0,
    )];
    // Goal encoded as predicate="sibling:ann,pat" (parse_key extracts pred="sibling", args=["ann","pat"]).
    input.goals = vec![goal("g1", "sibling:ann,pat", "true")];

    let output = dispatch_breed_test("prolog", &input)
        .expect("Prolog sibling derivation must not return Err");

    // A3 adversary check: real forward-chaining must produce trace entries.
    assert!(
        !output.inference_trace.is_empty(),
        "Prolog sibling derivation: inference_trace must not be empty"
    );

    // load-rule steps must exist (the rule was loaded).
    let has_load_rule = output
        .inference_trace
        .iter()
        .any(|t| t.kind == "load-rule");
    assert!(
        has_load_rule,
        "Prolog sibling derivation: trace must contain load-rule steps"
    );

    // Oracle: an Allow decision or infer step for sibling:ann,pat must appear.
    let allow_or_infer = output.inference_trace.iter().any(|t| {
        t.detail.to_lowercase().contains("allow")
            || (t.kind == "infer" && t.detail.contains("sibling"))
    });
    assert!(
        allow_or_infer,
        "Prolog sibling derivation: must derive sibling:ann,pat (Allow or infer trace step); \
         trace={:?}",
        output.inference_trace
    );
}

/// Hidden-Prolog-2: grandparent chain over 4 generations using ?N variables.
///
/// Program:
///   parent(alf, ben).  parent(ben, cal).
///   parent(cal, deb).  parent(deb, eve).
///   grandparent(?0,?2) :- parent:?0,?1, parent:?1,?2
///
/// Query: grandparent:alf,cal  (alf→ben→cal, 2-hop chain)
/// A depth-2 variable derivation is beyond any published Prolog oracle.
#[test]
fn prolog_hidden_grandparent_chain() {
    let mut input = base("grandparent:alf,cal");
    // parent(X,Y) = "X is parent of Y"
    // parse_key("parent:alf,ben") → ("parent", ["alf","ben"])
    input.facts = vec![
        fact("parent:alf,ben", "true"),
        fact("parent:ben,cal", "true"),
        fact("parent:cal,deb", "true"),
        fact("parent:deb,eve", "true"),
    ];
    // grandparent(?0,?2) :- parent(?0,?1), parent(?1,?2)
    input.rules = vec![rule(
        "R-grandparent",
        vec!["parent:?0,?1", "parent:?1,?2"],
        "grandparent:?0,?2",
        1.0,
    )];
    // Goal: grandparent:alf,cal → parse_key("grandparent:alf,cal") = ("grandparent", ["alf","cal"])
    input.goals = vec![goal("g1", "grandparent:alf,cal", "true")];

    let output = dispatch_breed_test("prolog", &input)
        .expect("Prolog grandparent chain must not return Err");

    // A3 adversary check.
    assert!(
        !output.inference_trace.is_empty(),
        "Prolog grandparent chain: inference_trace must not be empty"
    );

    // load-rule step must exist.
    let has_load_rule = output
        .inference_trace
        .iter()
        .any(|t| t.kind == "load-rule");
    assert!(
        has_load_rule,
        "Prolog grandparent chain: trace must contain load-rule step"
    );

    // Oracle: Allow decision or infer step for grandparent:alf,cal.
    let allow_or_infer = output.inference_trace.iter().any(|t| {
        t.detail.to_lowercase().contains("allow")
            || (t.kind == "infer" && t.detail.contains("grandparent"))
    });
    assert!(
        allow_or_infer,
        "Prolog grandparent chain: must derive grandparent:alf,cal; trace={:?}",
        output.inference_trace
    );
}

/// Hidden-Prolog-3: list membership over a 5-element list using ?N variables.
///
/// Program:
///   elem(list1, alpha).  elem(list1, beta).  elem(list1, gamma).
///   elem(list1, delta).  elem(list1, epsilon).
///   member(?0, ?1) :- elem:?1,?0     (i.e. member(X,L) :- elem(L,X))
///
/// Query: member:delta,list1  — 'delta' is in list1 (4th element, tests depth).
/// Five base facts plus one rule; any lookup table covering only 1–2-element
/// lists cannot satisfy this query without executing the rule.
#[test]
fn prolog_hidden_list_membership() {
    let mut input = base("member:delta,list1");
    // elem(list1, element): parse_key("elem:list1,alpha") = ("elem", ["list1","alpha"])
    input.facts = vec![
        fact("elem:list1,alpha", "true"),
        fact("elem:list1,beta", "true"),
        fact("elem:list1,gamma", "true"),
        fact("elem:list1,delta", "true"),
        fact("elem:list1,epsilon", "true"),
    ];
    // member(?0,?1) :- elem:?1,?0
    // When ?1=list1, ?0=delta → derives (member, ["delta","list1"])
    input.rules = vec![rule(
        "R-member-from-elem",
        vec!["elem:?1,?0"],
        "member:?0,?1",
        1.0,
    )];
    // Goal: member:delta,list1 → parse_key = ("member", ["delta","list1"])
    input.goals = vec![goal("g1", "member:delta,list1", "true")];

    let output = dispatch_breed_test("prolog", &input)
        .expect("Prolog list membership must not return Err");

    // A3 adversary check.
    assert!(
        !output.inference_trace.is_empty(),
        "Prolog list membership: inference_trace must not be empty"
    );

    // load-rule must appear (the rule was processed).
    let has_load_rule = output
        .inference_trace
        .iter()
        .any(|t| t.kind == "load-rule");
    assert!(
        has_load_rule,
        "Prolog list membership: trace must contain load-rule step"
    );

    // Oracle: Allow decision or infer step for member:delta,list1.
    let allow_or_infer = output.inference_trace.iter().any(|t| {
        t.detail.to_lowercase().contains("allow")
            || (t.kind == "infer" && t.detail.contains("member"))
    });
    assert!(
        allow_or_infer,
        "Prolog list membership: must derive member:delta,list1; trace={:?}",
        output.inference_trace
    );
}

// ===========================================================================
// STRIPS hidden challenge tests
// ===========================================================================

/// Hidden-STRIPS-1: two-robot delivery requiring coordination.
///
/// Locations: depot, warehouse, customer.
/// Robot-1 picks up pkg-A at depot (precond: robot1 at depot, pkg at depot).
/// Robot-2 delivers pkg-A to customer (precond: robot2 at warehouse, pkg held).
///
/// Two sequential goals (pickup then deliver) force 2 distinct operators.
/// A lookup table covering only single-operator single-location examples
/// cannot produce a valid two-step plan.
///
/// Encoding note: STRIPS IDFS iterates over goals in order and picks the
/// first unsatisfied one each recursion. Goals are listed in execution order
/// so the planner can satisfy them with one action each, sequentially.
#[test]
fn strips_hidden_two_robot_delivery() {
    let mut input = base("two-robot coordinated delivery");
    input.state = vec![
        state_atom("robot1-at", "depot"),
        state_atom("robot2-at", "warehouse"),
        state_atom("pkg-A-at", "depot"),
    ];
    // Two goals listed in the order they become achievable.
    // g1: robot1 picks up pkg-A (achievable from initial state).
    // g2: robot2 delivers pkg-A (achievable after g1's effect).
    input.goals = vec![
        goal("g1", "pkg-A-held-by", "robot1"),
        goal("g2", "pkg-A-delivered", "true"),
    ];
    input.rules = vec![
        // Step 1: robot1 picks up pkg-A at depot — preconditions satisfied in initial state.
        rule(
            "robot1-pickup-pkg-at-depot",
            vec!["robot1-at=depot", "pkg-A-at=depot"],
            "pkg-A-held-by=robot1",
            1.0,
        ),
        // Step 2: robot2 delivers — precondition "pkg-A-held-by=robot1" is added by step 1.
        rule(
            "robot2-deliver-pkg-to-customer",
            vec!["robot2-at=warehouse", "pkg-A-held-by=robot1"],
            "pkg-A-delivered=true",
            1.0,
        ),
    ];

    let output = dispatch_breed_test("strips", &input)
        .expect("STRIPS two-robot delivery must not return Err");

    // A3 adversary check.
    assert!(
        !output.inference_trace.is_empty(),
        "STRIPS two-robot delivery: inference_trace must not be empty"
    );

    // Oracle: a non-trivial plan was found (selected is Some and non-empty).
    let plan = output.selected.as_deref().unwrap_or("");
    assert!(
        !plan.is_empty(),
        "STRIPS two-robot delivery: plan must not be empty; selected={:?}",
        output.selected
    );

    // The plan must include both operators.
    assert!(
        plan.contains("robot1-pickup-pkg-at-depot"),
        "STRIPS two-robot delivery: plan must include robot1-pickup; plan={plan}"
    );
    assert!(
        plan.contains("robot2-deliver-pkg-to-customer"),
        "STRIPS two-robot delivery: plan must include robot2-deliver; plan={plan}"
    );
}

/// Hidden-STRIPS-2: refuel-before-delivery constraint.
///
/// A truck must refuel before it can deliver cargo.  Two goals are declared
/// in execution order so the IDFS planner satisfies them sequentially:
///   g1: fuel-level=full   (requires refuel-at-depot, applicable from initial state)
///   g2: cargo=delivered   (requires deliver-cargo, applicable after g1's effect)
///
/// No published oracle includes a fuel-level state atom.  A lookup table
/// that only knows fuel-free delivery scenarios cannot satisfy this plan.
#[test]
fn strips_hidden_refuel_constraint() {
    let mut input = base("truck refuel then deliver");
    input.state = vec![
        state_atom("truck-at", "depot"),
        state_atom("fuel-level", "empty"),
        state_atom("cargo", "loaded"),
    ];
    // Goals in execution order: refuel first, then deliver.
    input.goals = vec![
        goal("g1", "fuel-level", "full"),
        goal("g2", "cargo", "delivered"),
    ];
    input.rules = vec![
        // Step 1: refuel at depot — preconditions satisfied in initial state.
        rule(
            "refuel-at-depot",
            vec!["truck-at=depot", "fuel-level=empty"],
            "fuel-level=full",
            1.0,
        ),
        // Step 2: deliver cargo — precondition "fuel-level=full" is added by step 1.
        rule(
            "deliver-cargo",
            vec!["truck-at=depot", "fuel-level=full", "cargo=loaded"],
            "cargo=delivered",
            1.0,
        ),
    ];

    let output = dispatch_breed_test("strips", &input)
        .expect("STRIPS refuel constraint must not return Err");

    // A3 adversary check.
    assert!(
        !output.inference_trace.is_empty(),
        "STRIPS refuel constraint: inference_trace must not be empty"
    );

    // Oracle: the plan is non-empty.
    let plan = output.selected.as_deref().unwrap_or("");
    assert!(
        !plan.is_empty(),
        "STRIPS refuel constraint: plan must not be empty"
    );

    // The plan must include both operators.
    assert!(
        plan.contains("refuel-at-depot"),
        "STRIPS refuel constraint: plan must include refuel-at-depot; plan={plan}"
    );
    assert!(
        plan.contains("deliver-cargo"),
        "STRIPS refuel constraint: plan must include deliver-cargo; plan={plan}"
    );

    // Ordering check: refuel must precede deliver in the comma-separated plan string.
    let refuel_pos = plan.find("refuel-at-depot").unwrap_or(usize::MAX);
    let deliver_pos = plan.find("deliver-cargo").unwrap_or(0);
    assert!(
        refuel_pos < deliver_pos,
        "STRIPS refuel constraint: refuel-at-depot must precede deliver-cargo; plan={plan}"
    );
}

/// Hidden-STRIPS-3: four-step plan — exactly 4 operators required.
///
/// Four goals declared in execution order; each is achievable from the state
/// produced by the previous step.  A stub that returns a 1- or 2-step plan
/// fails the 4-goal oracle assertion.
///
/// Plan:
///   activate-sensor  (precond: power=off  → adds power=on)
///   calibrate-sensor (precond: power=on   → adds calibrated=true)
///   scan-area        (precond: calibrated=true → adds scan=done)
///   upload-report    (precond: scan=done  → adds report=uploaded)
#[test]
fn strips_hidden_four_step_plan() {
    let mut input = base("four-step sensor-to-report pipeline");
    input.state = vec![
        state_atom("power", "off"),
        state_atom("calibrated", "false"),
    ];
    // Four goals in execution order.
    input.goals = vec![
        goal("g1", "power", "on"),
        goal("g2", "calibrated", "true"),
        goal("g3", "scan", "done"),
        goal("g4", "report", "uploaded"),
    ];
    input.rules = vec![
        rule(
            "activate-sensor",
            vec!["power=off"],
            "power=on",
            1.0,
        ),
        rule(
            "calibrate-sensor",
            vec!["power=on"],
            "calibrated=true",
            1.0,
        ),
        rule(
            "scan-area",
            vec!["calibrated=true"],
            "scan=done",
            1.0,
        ),
        rule(
            "upload-report",
            vec!["scan=done"],
            "report=uploaded",
            1.0,
        ),
    ];

    let output = dispatch_breed_test("strips", &input)
        .expect("STRIPS four-step plan must not return Err");

    // A3 adversary check.
    assert!(
        !output.inference_trace.is_empty(),
        "STRIPS four-step plan: inference_trace must not be empty"
    );

    // Oracle: plan contains exactly 4 operators.
    let plan = output.selected.as_deref().unwrap_or("");
    assert!(
        !plan.is_empty(),
        "STRIPS four-step plan: plan must not be empty"
    );

    let step_count = plan.split(',').count();
    assert_eq!(
        step_count, 4,
        "STRIPS four-step plan: expected exactly 4 steps, got {step_count}; plan={plan}"
    );

    // Oracle: final operator must be upload-report.
    let last_step = plan.split(',').last().unwrap_or("").trim();
    assert_eq!(
        last_step, "upload-report",
        "STRIPS four-step plan: last step must be upload-report, got {last_step}"
    );
}
