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
    let has_gentamicin = output
        .facts
        .iter()
        .any(|f| (f.key == "therapy" && f.value == "gentamicin") || f.value.contains("gentamicin"));
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

    let output =
        dispatch_breed_test("mycin", &input).expect("MYCIN fungal infection must not return Err");

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
        (f.key == "therapy" && f.value == "amphotericin") || f.value.contains("amphotericin")
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
        rule("R-depth1-A-to-B", vec!["signal=A"], "intermediate=B", 0.7),
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

    let output =
        dispatch_breed_test("mycin", &input).expect("MYCIN depth-4 chain must not return Err");

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
    let has_target_therapy = output
        .facts
        .iter()
        .any(|f| (f.key == "therapy" && f.value == "target") || f.value.contains("target"));
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
    let has_load_rule = output.inference_trace.iter().any(|t| t.kind == "load-rule");
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
    let has_load_rule = output.inference_trace.iter().any(|t| t.kind == "load-rule");
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

    let output =
        dispatch_breed_test("prolog", &input).expect("Prolog list membership must not return Err");

    // A3 adversary check.
    assert!(
        !output.inference_trace.is_empty(),
        "Prolog list membership: inference_trace must not be empty"
    );

    // load-rule must appear (the rule was processed).
    let has_load_rule = output.inference_trace.iter().any(|t| t.kind == "load-rule");
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
        rule("activate-sensor", vec!["power=off"], "power=on", 1.0),
        rule("calibrate-sensor", vec!["power=on"], "calibrated=true", 1.0),
        rule("scan-area", vec!["calibrated=true"], "scan=done", 1.0),
        rule("upload-report", vec!["scan=done"], "report=uploaded", 1.0),
    ];

    let output =
        dispatch_breed_test("strips", &input).expect("STRIPS four-step plan must not return Err");

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

// ===========================================================================
// SOAR hidden challenge test
// ===========================================================================

/// Hidden-SOAR-1: robotic assembly operator selection with conflicting preferences.
///
/// Three operators proposed: weld, paint, inspect.
/// Preference facts establish: paint is better-than weld (structural safety),
/// inspect is best (quality gate). An A1/A2 adversary that only knows
/// the "move blocks" example cannot resolve the paint→inspect preference chain.
#[test]
fn soar_hidden_robotic_assembly_operator_selection() {
    use wasm4pm_cognition::breeds::{Candidate, Fact};
    let input = wasm4pm_cognition::breeds::BreedInput {
        intent: "robotic assembly line operator selection".into(),
        candidates: vec![
            Candidate {
                id: "weld".into(),
                score: 0.5,
                eliminated: false,
                elimination_reason: None,
            },
            Candidate {
                id: "paint".into(),
                score: 0.6,
                eliminated: false,
                elimination_reason: None,
            },
            Candidate {
                id: "inspect".into(),
                score: 0.9,
                eliminated: false,
                elimination_reason: None,
            },
        ],
        facts: vec![
            Fact {
                key: "better:paint,weld".into(),
                value: "structural-safety".into(),
            },
            Fact {
                key: "best:inspect".into(),
                value: "quality-gate".into(),
            },
            Fact {
                key: "context".into(),
                value: "post-weld-stage".into(),
            },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let output =
        dispatch_breed_test("soar", &input).expect("SOAR robotic assembly must not return Err");

    assert!(
        !output.inference_trace.is_empty(),
        "SOAR robotic assembly: inference_trace must not be empty (A3 adversary check)"
    );
    // The best-tagged or highest-scored non-dominated operator must be selected.
    assert!(
        output.selected.is_some(),
        "SOAR robotic assembly: selected must be Some — an operator must be chosen"
    );
}

// ===========================================================================
// CBR hidden challenge test
// ===========================================================================

/// Hidden-CBR-1: pharmaceutical formulation retrieval with a novel active compound.
///
/// Case library contains three prior formulations. Query uses a novel compound
/// (metformin-XR) not present in any published CBR test. A2 memoizers that cache
/// only exact-match queries will fail to retrieve the closest matching case.
#[test]
fn cbr_hidden_pharmaceutical_formulation() {
    use wasm4pm_cognition::breeds::{Case, Fact};
    let input = wasm4pm_cognition::breeds::BreedInput {
        intent: "controlled-release oral tablet".into(),
        candidates: vec![],
        facts: vec![
            Fact {
                key: "compound".into(),
                value: "metformin-XR".into(),
            },
            Fact {
                key: "release-type".into(),
                value: "controlled".into(),
            },
            Fact {
                key: "dosage-form".into(),
                value: "tablet".into(),
            },
            Fact {
                key: "target-organ".into(),
                value: "gastrointestinal".into(),
            },
        ],
        cases: vec![
            Case {
                id: "C-001".into(),
                intent: "controlled-release oral tablet".into(),
                architecture: "hydroxypropyl-methylcellulose-matrix".into(),
                outcome_score: 0.87,
                facts: vec![
                    Fact {
                        key: "release-type".into(),
                        value: "controlled".into(),
                    },
                    Fact {
                        key: "dosage-form".into(),
                        value: "tablet".into(),
                    },
                ],
            },
            Case {
                id: "C-002".into(),
                intent: "immediate-release capsule".into(),
                architecture: "gelatine-capsule".into(),
                outcome_score: 0.72,
                facts: vec![
                    Fact {
                        key: "release-type".into(),
                        value: "immediate".into(),
                    },
                    Fact {
                        key: "dosage-form".into(),
                        value: "capsule".into(),
                    },
                ],
            },
            Case {
                id: "C-003".into(),
                intent: "enteric-coated tablet".into(),
                architecture: "eudragit-L100-coating".into(),
                outcome_score: 0.81,
                facts: vec![
                    Fact {
                        key: "release-type".into(),
                        value: "delayed".into(),
                    },
                    Fact {
                        key: "dosage-form".into(),
                        value: "tablet".into(),
                    },
                    Fact {
                        key: "target-organ".into(),
                        value: "gastrointestinal".into(),
                    },
                ],
            },
        ],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let output = dispatch_breed_test("cbr", &input)
        .expect("CBR pharmaceutical formulation must not return Err");

    assert!(
        !output.inference_trace.is_empty(),
        "CBR pharmaceutical: inference_trace must not be empty (A3 adversary check)"
    );
    // Must retrieve at least one case (C-001 or C-003 share facts with query).
    assert!(
        output.selected.is_some(),
        "CBR pharmaceutical: selected must be Some — a prior case must be retrieved"
    );
}

// ===========================================================================
// HEARSAY hidden challenge test
// ===========================================================================

/// Hidden-HEARSAY-1: DNA sequence recognition with multi-level hypotheses.
///
/// Three knowledge sources at different levels: phoneme-level (codon),
/// word-level (gene region), sentence-level (operon). Evidence posted on
/// the blackboard drives bottom-up activation. No published HEARSAY test
/// uses genetic sequence evidence.
#[test]
fn hearsay_hidden_dna_sequence_recognition() {
    use wasm4pm_cognition::breeds::{Candidate, Fact};
    let input = wasm4pm_cognition::breeds::BreedInput {
        intent: "recognize regulatory operon in sequence".into(),
        candidates: vec![
            Candidate {
                id: "codon-ATG".into(),
                score: 0.7,
                eliminated: false,
                elimination_reason: None,
            },
            Candidate {
                id: "promoter-TATA".into(),
                score: 0.65,
                eliminated: false,
                elimination_reason: None,
            },
            Candidate {
                id: "operon-lac".into(),
                score: 0.55,
                eliminated: false,
                elimination_reason: None,
            },
        ],
        facts: vec![
            Fact {
                key: "sequence-segment".into(),
                value: "ATGAAACCC".into(),
            },
            Fact {
                key: "upstream-motif".into(),
                value: "TATAAA".into(),
            },
            Fact {
                key: "gc-content".into(),
                value: "0.52".into(),
            },
            Fact {
                key: "context:domain".into(),
                value: "regulatory-region".into(),
            },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let output = dispatch_breed_test("hearsay", &input)
        .expect("HEARSAY DNA recognition must not return Err");

    assert!(
        !output.inference_trace.is_empty(),
        "HEARSAY DNA recognition: inference_trace must not be empty (A3 adversary check)"
    );
    assert!(
        output.selected.is_some(),
        "HEARSAY DNA recognition: selected must be Some — a consensus hypothesis must emerge"
    );
}

// ===========================================================================
// GPS hidden challenge test
// ===========================================================================

/// Hidden-GPS-1: chemical synthesis planning — three-step reduction pathway.
///
/// Initial state: precursor-A available, catalyst-B available.
/// Goals: synthesize compound-D (via A→C via reduction, C→D via cyclisation).
/// No published GPS test uses chemistry domain predicates.
#[test]
fn gps_hidden_chemical_synthesis_planning() {
    use wasm4pm_cognition::breeds::{Goal, Rule, StateAtom};
    let input = wasm4pm_cognition::breeds::BreedInput {
        intent: "chemical synthesis planning".into(),
        candidates: vec![],
        facts: vec![],
        cases: vec![],
        rules: vec![
            Rule {
                id: "reduce-A-to-C".into(),
                premise: vec![
                    "precursor-A=available".into(),
                    "catalyst-B=available".into(),
                ],
                conclusion: "compound-C=synthesized".into(),
                certainty: 1.0,
            },
            Rule {
                id: "cyclise-C-to-D".into(),
                premise: vec!["compound-C=synthesized".into()],
                conclusion: "compound-D=synthesized".into(),
                certainty: 1.0,
            },
        ],
        goals: vec![
            Goal {
                id: "g1".into(),
                predicate: "compound-C".into(),
                value: "synthesized".into(),
            },
            Goal {
                id: "g2".into(),
                predicate: "compound-D".into(),
                value: "synthesized".into(),
            },
        ],
        state: vec![
            StateAtom {
                predicate: "precursor-A".into(),
                value: "available".into(),
            },
            StateAtom {
                predicate: "catalyst-B".into(),
                value: "available".into(),
            },
        ],
    };

    let output =
        dispatch_breed_test("gps", &input).expect("GPS chemical synthesis must not return Err");

    assert!(
        !output.inference_trace.is_empty(),
        "GPS chemical synthesis: inference_trace must not be empty (A3 adversary check)"
    );
    let plan = output.selected.as_deref().unwrap_or("");
    assert!(
        !plan.is_empty(),
        "GPS chemical synthesis: plan must not be empty; selected={:?}",
        output.selected
    );
    assert!(
        plan.contains("reduce-A-to-C"),
        "GPS chemical synthesis: plan must include reduce-A-to-C; plan={plan}"
    );
}

// ===========================================================================
// DENDRAL hidden challenge test
// ===========================================================================

/// Hidden-DENDRAL-1: peptide mass spectrometry — novel amino acid sequence.
///
/// Candidates: three tetrapeptide sequences. Constraints from mass spectrum
/// rule out two sequences. No published DENDRAL test uses peptide candidates
/// with mass-spectrum constraints.
#[test]
fn dendral_hidden_peptide_hypothesis_filtering() {
    use wasm4pm_cognition::breeds::{Candidate, Fact};
    let input = wasm4pm_cognition::breeds::BreedInput {
        intent: "identify tetrapeptide from mass spectrum".into(),
        candidates: vec![
            Candidate {
                id: "ACGT".into(),
                score: 0.7,
                eliminated: false,
                elimination_reason: None,
            },
            Candidate {
                id: "WLKA".into(),
                score: 0.65,
                eliminated: false,
                elimination_reason: None,
            },
            Candidate {
                id: "MFVP".into(),
                score: 0.8,
                eliminated: false,
                elimination_reason: None,
            },
        ],
        facts: vec![
            Fact {
                key: "mass-peak".into(),
                value: "447.2".into(),
            },
            Fact {
                key: "fragment-ion".into(),
                value: "b2=201.1".into(),
            },
            Fact {
                key: "eliminate:ACGT".into(),
                value: "mass-mismatch-447".into(),
            },
            Fact {
                key: "eliminate:WLKA".into(),
                value: "b2-ion-mismatch".into(),
            },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let output =
        dispatch_breed_test("dendral", &input).expect("DENDRAL peptide must not return Err");

    assert!(
        !output.inference_trace.is_empty(),
        "DENDRAL peptide: inference_trace must not be empty (A3 adversary check)"
    );
    // At least one candidate must be retained or eliminated — the breed must run.
    let has_candidate_step = output.inference_trace.iter().any(|t| {
        t.kind.contains("candidate")
            || t.kind.contains("hypothesis")
            || t.kind.contains("retain")
            || t.kind.contains("elim")
    });
    assert!(
        has_candidate_step || output.selected.is_some(),
        "DENDRAL peptide: must produce candidate or hypothesis trace step"
    );
}

// ===========================================================================
// ELIZA hidden challenge test
// ===========================================================================

/// Hidden-ELIZA-1: novel therapy script with custom frames not in the default Rogerian set.
///
/// Custom frames are injected via facts (frame.pattern). The specific pattern
/// "i work * hours" does not appear in any published ELIZA oracle. A lookup
/// table of default-frame responses cannot match this custom frame.
#[test]
fn eliza_hidden_custom_frame_work_stress() {
    use wasm4pm_cognition::breeds::Fact;
    let input = wasm4pm_cognition::breeds::BreedInput {
        intent: "i work seventy hours every week".into(),
        candidates: vec![],
        facts: vec![
            Fact {
                key: "frame.pattern".into(),
                value: "i work * hours every week || Working ${1} hours every week — how does that affect your health?".into(),
            },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let output =
        dispatch_breed_test("eliza", &input).expect("ELIZA custom frame must not return Err");

    assert!(
        !output.inference_trace.is_empty(),
        "ELIZA custom frame: inference_trace must not be empty (A3 adversary check)"
    );
    // The custom frame must match and the response must reference slot content.
    assert!(
        output.selected.is_some(),
        "ELIZA custom frame: selected must be Some — custom pattern must match"
    );
    assert!(
        output.explanation.to_lowercase().contains("seventy")
            || output.explanation.contains("health"),
        "ELIZA custom frame: response must reference slot capture; got: {}",
        output.explanation
    );
}

// ===========================================================================
// AutoInstinct Vision hidden challenge test
// ===========================================================================

/// Hidden-Vision-1: medical imaging scene — chest X-ray with novel objects.
///
/// Objects: right-lung, left-lung, heart, trachea, carina.
/// Relations: spatial (above, overlaps, contains). No published vision test
/// uses anatomical medical imaging objects.
#[test]
fn autoinstinct_vision_hidden_chest_xray_scene() {
    use wasm4pm_cognition::breeds::Fact;
    let input = wasm4pm_cognition::breeds::BreedInput {
        intent: "chest radiograph scene analysis".into(),
        candidates: vec![],
        facts: vec![
            Fact {
                key: "object:right-lung".into(),
                value: "detected".into(),
            },
            Fact {
                key: "object:left-lung".into(),
                value: "detected".into(),
            },
            Fact {
                key: "object:heart".into(),
                value: "detected".into(),
            },
            Fact {
                key: "object:trachea".into(),
                value: "detected".into(),
            },
            Fact {
                key: "relation:trachea-above-carina".into(),
                value: "true".into(),
            },
            Fact {
                key: "relation:heart-overlaps-left-lung".into(),
                value: "partial".into(),
            },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let output = dispatch_breed_test("autoinstinct_vision", &input)
        .expect("Vision chest X-ray must not return Err");

    assert!(
        !output.inference_trace.is_empty(),
        "Vision chest X-ray: inference_trace must not be empty (A3 adversary check)"
    );
    assert!(
        output.selected.is_some() || !output.explanation.is_empty(),
        "Vision chest X-ray: must produce a scene description"
    );
}

// ===========================================================================
// AutoInstinct Semantics hidden challenge test
// ===========================================================================

/// Hidden-Semantics-1: legal sentence parsing — contract obligation clause.
///
/// Sentence uses legal domain terminology (indemnify, licensee, licensor).
/// No published semantics test uses legal contract language. CD-primitive
/// extraction must identify the causal-action primitive.
#[test]
fn autoinstinct_semantics_hidden_legal_contract_parsing() {
    let input = wasm4pm_cognition::breeds::BreedInput {
        intent: "the licensee must indemnify the licensor against third-party claims".into(),
        candidates: vec![],
        facts: vec![],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let output = dispatch_breed_test("autoinstinct_semantics", &input)
        .expect("Semantics legal sentence must not return Err");

    assert!(
        !output.inference_trace.is_empty(),
        "Semantics legal: inference_trace must not be empty (A3 adversary check)"
    );
    // The breed must parse tokens and extract at least one CD primitive.
    let has_parse_step = output.inference_trace.iter().any(|t| {
        t.kind.contains("token")
            || t.kind.contains("parse")
            || t.kind.contains("cd")
            || t.kind.contains("actor")
    });
    assert!(
        has_parse_step || output.selected.is_some(),
        "Semantics legal: must produce token parsing or CD extraction trace step"
    );
}

// ===========================================================================
// AutoInstinct Neurosis hidden challenge test
// ===========================================================================

/// Hidden-Neurosis-1: competing financial beliefs with high-anxiety conflict.
///
/// Beliefs: "invest-now=urgent" conflicts with "save-cash=urgent".
/// Both beliefs have high certainty, causing maximum anxiety.
/// No published neurosis test uses financial domain beliefs.
#[test]
fn autoinstinct_neurosis_hidden_financial_belief_conflict() {
    use wasm4pm_cognition::breeds::{Candidate, Fact};
    let input = wasm4pm_cognition::breeds::BreedInput {
        intent: "financial planning under uncertainty".into(),
        candidates: vec![
            Candidate {
                id: "invest-now".into(),
                score: 0.8,
                eliminated: false,
                elimination_reason: None,
            },
            Candidate {
                id: "save-cash".into(),
                score: 0.8,
                eliminated: false,
                elimination_reason: None,
            },
            Candidate {
                id: "diversify".into(),
                score: 0.6,
                eliminated: false,
                elimination_reason: None,
            },
        ],
        facts: vec![
            Fact {
                key: "belief:invest-now".into(),
                value: "urgent".into(),
            },
            Fact {
                key: "belief:save-cash".into(),
                value: "urgent".into(),
            },
            Fact {
                key: "conflict:invest-now,save-cash".into(),
                value: "true".into(),
            },
            Fact {
                key: "market-volatility".into(),
                value: "high".into(),
            },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let output = dispatch_breed_test("autoinstinct_neurosis", &input)
        .expect("Neurosis financial beliefs must not return Err");

    assert!(
        !output.inference_trace.is_empty(),
        "Neurosis financial: inference_trace must not be empty (A3 adversary check)"
    );
    // Conflict must be detected and a resolution proposed.
    let has_conflict_step = output.inference_trace.iter().any(|t| {
        t.kind.contains("conflict")
            || t.kind.contains("anxiety")
            || t.kind.contains("resolution")
            || t.kind.contains("belief")
    });
    assert!(
        has_conflict_step || output.selected.is_some(),
        "Neurosis financial: must produce conflict detection or resolution trace step"
    );
}

// ===========================================================================
// AutoInstinct Learning hidden challenge test
// ===========================================================================

/// Hidden-Learning-1: surgical skill curriculum — laparoscopic cholecystectomy.
///
/// Three prerequisite skills must be mastered before the target procedure.
/// Goals: master-trocar-insertion, master-tissue-dissection, master-clip-application.
/// No published learning test uses surgical domain goals.
#[test]
fn autoinstinct_learning_hidden_surgical_curriculum() {
    use wasm4pm_cognition::breeds::{Fact, Goal};
    let input = wasm4pm_cognition::breeds::BreedInput {
        intent: "laparoscopic cholecystectomy skill acquisition".into(),
        candidates: vec![],
        facts: vec![
            Fact {
                key: "current-skill:trocar-insertion".into(),
                value: "beginner".into(),
            },
            Fact {
                key: "current-skill:tissue-dissection".into(),
                value: "not-started".into(),
            },
            Fact {
                key: "current-skill:clip-application".into(),
                value: "not-started".into(),
            },
            Fact {
                key: "prereq:tissue-dissection,trocar-insertion".into(),
                value: "true".into(),
            },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![
            Goal {
                id: "g1".into(),
                predicate: "master-trocar-insertion".into(),
                value: "true".into(),
            },
            Goal {
                id: "g2".into(),
                predicate: "master-tissue-dissection".into(),
                value: "true".into(),
            },
            Goal {
                id: "g3".into(),
                predicate: "master-clip-application".into(),
                value: "true".into(),
            },
        ],
        state: vec![],
    };

    let output = dispatch_breed_test("autoinstinct_learning", &input)
        .expect("Learning surgical curriculum must not return Err");

    assert!(
        !output.inference_trace.is_empty(),
        "Learning surgical: inference_trace must not be empty (A3 adversary check)"
    );
    // Curriculum must be emitted — selected or explanation non-empty.
    assert!(
        output.selected.is_some() || !output.explanation.is_empty(),
        "Learning surgical: must emit a curriculum plan"
    );
}

// ===========================================================================
// P1 TIER — hidden oracles (fresh names, hand-derived values)
// ===========================================================================

// ---------------------------------------------------------------------------
// ltl_monitor
// ---------------------------------------------------------------------------

/// A1/A2: `G zorp` over a trace where zorp fails exactly at step 3 must be
/// violated with exactly 4 progression steps. Hand derivation: progression of
/// G zorp stays `G zorp` while zorp holds (steps 0..2) and collapses to False
/// at the first event without zorp (step 3).
#[test]
fn ltl_monitor_hidden_g_zorp_violated_at_step_3() {
    let mut input = base("monitor");
    input.facts = vec![
        fact("ltl:formula", "G zorp"),
        fact("trace:0", "zorp"),
        fact("trace:1", "zorp,frob"),
        fact("trace:2", "zorp"),
        fact("trace:3", "frob"),
        fact("trace:4", "zorp"),
    ];
    let out = dispatch_breed_test("ltl_monitor", &input).expect("ltl run");
    assert_eq!(out.selected.as_deref(), Some("false"), "G zorp must be violated");
    let progress = out.inference_trace.iter().filter(|t| t.kind == "ltl-progress").count();
    assert_eq!(progress, 4, "violation detected exactly at step 3 (4 progressions)");
    let init = out.inference_trace.iter().filter(|t| t.kind == "ltl-init").count();
    assert_eq!(init, 1, "exactly 1 ltl-init");
    assert!(!out.inference_trace.is_empty()); // A3
}

/// Finite-trace G semantics (Havelund–Roşu): a FULLY conforming trace must
/// satisfy `G zorp` — end-of-trace valuation of the residual `G zorp` is true.
#[test]
fn ltl_monitor_hidden_g_zorp_fully_conforming_is_satisfied() {
    let mut input = base("monitor");
    input.facts = vec![
        fact("ltl:formula", "G zorp"),
        fact("trace:0", "zorp"),
        fact("trace:1", "zorp"),
        fact("trace:2", "zorp"),
        fact("trace:3", "zorp"),
    ];
    let out = dispatch_breed_test("ltl_monitor", &input).expect("ltl run");
    assert_eq!(
        out.selected.as_deref(),
        Some("true"),
        "G p over a conforming finite trace is a good prefix and must be satisfied"
    );
    let progress = out.inference_trace.iter().filter(|t| t.kind == "ltl-progress").count();
    assert_eq!(progress, 4, "all 4 events progressed (no early verdict)");
}

/// A1/A2: `quux U blee` satisfied exactly at step 2 (blee first appears at
/// index 2; quux holds before). Hand derivation: progression returns True the
/// moment the right operand fires, so exactly 3 progressions occur.
#[test]
fn ltl_monitor_hidden_until_satisfied_at_step_2() {
    let mut input = base("monitor");
    input.facts = vec![
        fact("ltl:formula", "quux U blee"),
        fact("trace:0", "quux"),
        fact("trace:1", "quux"),
        fact("trace:2", "blee"),
        fact("trace:3", "quux"),
    ];
    let out = dispatch_breed_test("ltl_monitor", &input).expect("ltl run");
    assert_eq!(out.selected.as_deref(), Some("true"));
    let progress = out.inference_trace.iter().filter(|t| t.kind == "ltl-progress").count();
    assert_eq!(progress, 3, "satisfied exactly at step 2 (3 progressions)");
    assert!(!out.inference_trace.is_empty()); // A3
}

// ---------------------------------------------------------------------------
// allen_temporal
// ---------------------------------------------------------------------------

/// A1/A2: composition before∘meets = before on fresh names gamma/delta/eps.
/// gamma p delta and delta m eps imply (end_gamma < start_delta < end_delta =
/// start_eps) so gamma strictly precedes eps: derived relation is exactly {p},
/// and the inverse entry eps,gamma is exactly {pi} (after).
#[test]
fn allen_temporal_hidden_before_compose_meets() {
    let mut input = base("temporal");
    input.facts = vec![
        fact("relation", "gamma,delta,p"),
        fact("relation", "delta,eps,m"),
    ];
    let out = dispatch_breed_test("allen_temporal", &input).expect("allen run");
    let derived = |k: &str| {
        out.facts
            .iter()
            .find(|f| f.key == k)
            .unwrap_or_else(|| panic!("missing {}", k))
            .value
            .clone()
    };
    assert_eq!(derived("derived:gamma,eps"), "p", "before∘meets must be exactly before");
    assert_eq!(derived("derived:eps,gamma"), "pi", "inverse must be exactly after");
    assert!(out.inference_trace.iter().any(|t| t.kind == "allen-compose"));
    assert!(!out.inference_trace.is_empty()); // A3
}

/// Concrete-endpoint mode: intervals with explicit endpoints get exact basic
/// relations. wibblet=[1,3], snork=[3,5]: meets (e1 == s2).
#[test]
fn allen_temporal_hidden_concrete_endpoints() {
    let mut input = base("temporal");
    input.state = vec![
        state_atom("interval", "wibblet,1,3"),
        state_atom("interval", "snork,3,5"),
    ];
    let out = dispatch_breed_test("allen_temporal", &input).expect("allen run");
    let m = out
        .facts
        .iter()
        .find(|f| f.key == "derived:wibblet,snork")
        .expect("derived fact");
    assert_eq!(m.value, "m", "[1,3] meets [3,5]");
}

/// Inconsistent network must be refused: A before B, B before C, C before A.
#[test]
fn allen_temporal_hidden_cyclic_before_inconsistent() {
    let mut input = base("temporal");
    input.facts = vec![
        fact("relation", "flim,flam,p"),
        fact("relation", "flam,florp,p"),
        fact("relation", "florp,flim,p"),
    ];
    let res = dispatch_breed_test("allen_temporal", &input);
    assert!(res.is_err(), "cyclic strict precedence must be inconsistent");
}

// ---------------------------------------------------------------------------
// fuzzy_logic
// ---------------------------------------------------------------------------

/// A1/A2: fresh interpolation point — Tri(2,5,8) at 3.7 fires its rule with
/// strength (3.7-2)/(5-2) = 0.566666… ≈ 0.56667 (rounded to 1e-5).
#[test]
fn fuzzy_logic_hidden_tri_interpolation() {
    let mut input = base("fuzzy");
    input.facts = vec![
        fact("fuzzy:zlorp:mid", "tri:2,5,8"),
        fact("fuzzy:gwib:out", "tri:0,50,100"),
        fact("fuzzy:input:zlorp", "3.7"),
    ];
    input.rules = vec![rule("rz", vec!["fuzzy:zlorp:mid"], "fuzzy:gwib:out", 1.0)];
    let out = dispatch_breed_test("fuzzy_logic", &input).expect("fuzzy run");
    let fire = out
        .inference_trace
        .iter()
        .find(|t| t.kind == "fuzzy-fire" && t.detail.starts_with("rule rz"))
        .expect("rz fire step");
    let strength: f32 = fire
        .detail
        .rsplit(' ')
        .next()
        .unwrap()
        .parse()
        .expect("numeric strength");
    assert!(
        (strength - 0.56667).abs() < 1e-5,
        "Tri(2,5,8) at 3.7 must fire with mu=0.56667, got {}",
        strength
    );
    assert!(!out.inference_trace.is_empty()); // A3
}

/// t-norm boundary axioms: min(1, mu) = mu and min(0, mu) = 0 — a premise at
/// full membership leaves the strength unchanged; a premise at zero
/// membership zeroes the rule.
#[test]
fn fuzzy_logic_hidden_t_norm_boundaries() {
    let mut input = base("fuzzy");
    input.facts = vec![
        fact("fuzzy:zlorp:mid", "tri:2,5,8"),
        fact("fuzzy:zlorp:peak", "tri:0,3.7,8"),  // mu(3.7)=1.0
        fact("fuzzy:zlorp:far", "tri:10,12,14"), // mu(3.7)=0.0
        fact("fuzzy:gwib:out", "tri:0,50,100"),
        fact("fuzzy:input:zlorp", "3.7"),
    ];
    input.rules = vec![
        rule("r_one", vec!["fuzzy:zlorp:peak", "fuzzy:zlorp:mid"], "fuzzy:gwib:out", 1.0),
        rule("r_zero", vec!["fuzzy:zlorp:far", "fuzzy:zlorp:mid"], "fuzzy:gwib:out", 1.0),
    ];
    let out = dispatch_breed_test("fuzzy_logic", &input).expect("fuzzy run");
    let strength_of = |id: &str| -> f32 {
        out.inference_trace
            .iter()
            .find(|t| t.kind == "fuzzy-fire" && t.detail.starts_with(&format!("rule {}", id)))
            .unwrap_or_else(|| panic!("missing fire step for {}", id))
            .detail
            .rsplit(' ')
            .next()
            .unwrap()
            .parse()
            .unwrap()
    };
    assert!((strength_of("r_one") - 0.56667).abs() < 1e-5, "min(1,mu)=mu");
    assert_eq!(strength_of("r_zero"), 0.0, "min(0,mu)=0");
}

// ---------------------------------------------------------------------------
// bayesian_network
// ---------------------------------------------------------------------------

/// A1/A2: fresh chain Q→R→S. P(Q)=0.3, P(R|Q)=0.8 / P(R|¬Q)=0.2,
/// P(S|R)=0.7 / P(S|¬R)=0.1. Hand arithmetic: P(R) = .3·.8 + .7·.2 = 0.38;
/// P(S) = .38·.7 + .62·.1 = 0.328 exactly.
#[test]
fn bayesian_network_hidden_chain_prior() {
    let mut input = base("infer");
    input.facts = vec![
        fact("cpt:Q", "0.3"),
        fact("cpt:R|Q", "0.2,0.8"),
        fact("cpt:S|R", "0.1,0.7"),
    ];
    input.goals = vec![goal("g1", "query", "prob:S")];
    let out = dispatch_breed_test("bayesian_network", &input).expect("bn run");
    let verdict = out
        .inference_trace
        .iter()
        .find(|t| t.kind == "bn-verdict")
        .expect("verdict");
    let p: f64 = verdict.detail.split('=').nth(1).unwrap().parse().unwrap();
    assert!((p - 0.328).abs() < 1e-9, "P(S)=0.328 exact, got {}", p);
    assert!(!out.inference_trace.is_empty()); // A3
}

/// Markov-blanket screen: with evidence R=true, P(S|R=t) = 0.7 exactly —
/// Q is screened off by the chain's middle node.
#[test]
fn bayesian_network_hidden_markov_blanket() {
    let mut input = base("infer");
    input.facts = vec![
        fact("cpt:Q", "0.3"),
        fact("cpt:R|Q", "0.2,0.8"),
        fact("cpt:S|R", "0.1,0.7"),
        fact("evidence:R", "true"),
    ];
    input.goals = vec![goal("g1", "query", "prob:S")];
    let out = dispatch_breed_test("bayesian_network", &input).expect("bn run");
    let verdict = out
        .inference_trace
        .iter()
        .find(|t| t.kind == "bn-verdict")
        .expect("verdict");
    let p: f64 = verdict.detail.split('=').nth(1).unwrap().parse().unwrap();
    assert!((p - 0.7).abs() < 1e-9, "P(S|R=t)=0.7 exact, got {}", p);
}

/// Collider d-separation flip (Bayes-ball): in Q→S←R, Q ⫫ R unconditionally
/// but conditioning on the collider S OPENS the path.
#[test]
fn bayesian_network_hidden_collider_dsep_flip() {
    let mk = |query: &str| {
        let mut input = base("infer");
        input.facts = vec![
            fact("cpt:Q", "0.5"),
            fact("cpt:R", "0.5"),
            fact("cpt:S|Q,R", "0.1,0.6,0.7,0.9"),
        ];
        input.goals = vec![goal("g1", "query", query)];
        input
    };
    let out1 = dispatch_breed_test("bayesian_network", &mk("dsep:Q,R|")).expect("bn run");
    assert!(
        out1.explanation.ends_with("=true"),
        "Q and R d-separated with no evidence: {}",
        out1.explanation
    );
    let out2 = dispatch_breed_test("bayesian_network", &mk("dsep:Q,R|S")).expect("bn run");
    assert!(
        out2.explanation.ends_with("=false"),
        "conditioning on collider S must OPEN the path: {}",
        out2.explanation
    );
}

// ---------------------------------------------------------------------------
// csp_ac3
// ---------------------------------------------------------------------------

/// A1/A2: 3-coloring of K4 minus the (V3,V4) edge over lex domain {B,G,R}.
/// Hand derivation (MRV + lex value order + MAC): V1=B; MAC removes B from
/// V2,V3,V4; V2=G; MAC removes G from V3,V4 leaving {R}; V3=R, V4=R (no edge
/// between them). Exact lex-least assignment asserted.
#[test]
fn csp_ac3_hidden_k4_minus_edge_lex_least() {
    let mut input = base("solve");
    input.facts = vec![
        fact("csp-var", "V1:B,G,R"),
        fact("csp-var", "V2:B,G,R"),
        fact("csp-var", "V3:B,G,R"),
        fact("csp-var", "V4:B,G,R"),
        fact("csp-constraint", "V1!=V2"),
        fact("csp-constraint", "V1!=V3"),
        fact("csp-constraint", "V1!=V4"),
        fact("csp-constraint", "V2!=V3"),
        fact("csp-constraint", "V2!=V4"),
    ];
    let out = dispatch_breed_test("csp_ac3", &input).expect("csp run");
    assert_eq!(out.explanation, "SAT: V1=B, V2=G, V3=R, V4=R");
    assert!(out.inference_trace.iter().any(|t| t.kind == "csp-assign"));
    assert!(!out.inference_trace.is_empty()); // A3
}

/// K3 with 2 colors is UNSAT and the search must exhibit a domain-wipeout
/// revise step (MAC propagation after the first assignment empties a domain).
#[test]
fn csp_ac3_hidden_k3_two_colors_unsat_wipeout() {
    let mut input = base("solve");
    input.facts = vec![
        fact("csp-var", "W1:A,B"),
        fact("csp-var", "W2:A,B"),
        fact("csp-var", "W3:A,B"),
        fact("csp-constraint", "W1!=W2"),
        fact("csp-constraint", "W1!=W3"),
        fact("csp-constraint", "W2!=W3"),
    ];
    let out = dispatch_breed_test("csp_ac3", &input).expect("csp run");
    assert_eq!(out.explanation, "UNSAT");
    assert_eq!(out.selected.as_deref(), Some("unsat"));
    assert!(
        out.inference_trace.iter().any(|t| t.kind == "csp-revise"),
        "MAC must record domain-pruning revise steps before wipeout"
    );
}

// ---------------------------------------------------------------------------
// default_logic
// ---------------------------------------------------------------------------

/// A1/A2: gronk/wibble/dark_wibble taxonomy. The specific dark_wibble rule
/// derives not_glows BEFORE the default can fire, so the default
/// (wibble ∧ unless:dark_wibble ⊢ glows) is BLOCKED: extension contains
/// not_glows, not glows, and the trace carries a default-block step.
#[test]
fn default_logic_hidden_specificity_block() {
    let mut input = base("defaults");
    input.facts = vec![fact("obs:gronk", "gronk")];
    input.rules = vec![
        rule("r_isa", vec!["gronk"], "wibble", 1.0),
        rule("r_dark", vec!["gronk"], "dark_wibble", 1.0),
        rule("r_default", vec!["wibble", "unless:dark_wibble"], "glows", 0.9),
        rule("r_specific", vec!["dark_wibble"], "not_glows", 1.0),
    ];
    let out = dispatch_breed_test("default_logic", &input).expect("dl run");
    let ext = out.selected.expect("extension");
    assert!(ext.contains("not_glows"), "extension must contain not_glows: {}", ext);
    assert!(
        !ext.split(", ").any(|a| a == "glows"),
        "blocked default must NOT add glows: {}",
        ext
    );
    let block = out
        .inference_trace
        .iter()
        .find(|t| t.kind == "default-block")
        .expect("default-block step required");
    assert!(block.detail.contains("dark_wibble"));
    assert!(!out.inference_trace.is_empty()); // A3
}

/// Without the dark fact chain the default fires: extension contains glows.
#[test]
fn default_logic_hidden_default_fires_without_dark() {
    let mut input = base("defaults");
    input.facts = vec![fact("obs:gronk", "gronk")];
    input.rules = vec![
        rule("r_isa", vec!["gronk"], "wibble", 1.0),
        rule("r_default", vec!["wibble", "unless:dark_wibble"], "glows", 0.9),
        rule("r_specific", vec!["dark_wibble"], "not_glows", 1.0),
    ];
    let out = dispatch_breed_test("default_logic", &input).expect("dl run");
    let ext = out.selected.expect("extension");
    assert!(ext.split(", ").any(|a| a == "glows"), "default must fire: {}", ext);
    assert!(!ext.contains("not_glows"));
}

// ---------------------------------------------------------------------------
// htn_planning
// ---------------------------------------------------------------------------

/// A1/A2: method A (taxi) decomposes first but its second operator's
/// precondition fails (cash=low), forcing chronological backtracking to
/// method B (walk). Exact plan asserted plus the mandatory htn-backtrack step.
#[test]
fn htn_planning_hidden_forced_backtrack() {
    let mut input = base("travel");
    input.state = vec![
        state_atom("at", "shire"),
        state_atom("cash", "low"),
    ];
    input.goals = vec![goal("g1", "task", "journey")];
    input.rules = vec![
        rule("method:journey:coach", vec!["at=shire"], "op:hail_coach;op:pay_coach", 1.0),
        rule("method:journey:walk", vec!["at=shire"], "op:walk_road", 1.0),
        rule("op:hail_coach", vec![], "in=coach", 1.0),
        rule("op:pay_coach", vec!["in=coach", "cash=high"], "!in=coach;at=bree", 1.0),
        rule("op:walk_road", vec![], "!at=shire;at=bree", 1.0),
    ];
    let out = dispatch_breed_test("htn_planning", &input).expect("htn run");
    assert_eq!(out.selected.as_deref(), Some("op:walk_road"), "must backtrack to walk");
    assert!(
        out.inference_trace.iter().any(|t| t.kind == "htn-backtrack"),
        "htn-backtrack step required"
    );
    assert_eq!(
        out.inference_trace.iter().filter(|t| t.kind == "htn-plan").count(),
        1
    );
    assert!(!out.inference_trace.is_empty()); // A3
}

// ---------------------------------------------------------------------------
// dempster_shafer
// ---------------------------------------------------------------------------

/// Signature D-S property no Bayesian stub reproduces: a single source with
/// m(flim)=0.25, m(flam)=0.25 (ignorance 0.5 on the frame) yields
/// Bel(flim)+Bel(flam) = 0.5 < 1. (Masses chosen exactly representable in
/// f32 so the 1e-9 assertion is meaningful.)
#[test]
fn dempster_shafer_hidden_subadditive_belief() {
    let mk = |q: &str| {
        let mut input = base("belief");
        input.rules = vec![
            rule("src1", vec![], "flim", 0.25),
            rule("src1", vec![], "flam", 0.25),
        ];
        input.goals = vec![goal("query", "query", q)];
        input
    };
    let bel = |q: &str| -> f64 {
        let out = dispatch_breed_test("dempster_shafer", &mk(q)).expect("ds run");
        assert!(!out.inference_trace.is_empty()); // A3
        out.facts
            .iter()
            .find(|f| f.key == format!("belief:{}", q))
            .expect("belief fact")
            .value
            .parse()
            .unwrap()
    };
    let sum = bel("flim") + bel("flam");
    assert!((sum - 0.5).abs() < 1e-9, "Bel(flim)+Bel(flam) must be exactly 0.5");
    assert!(sum < 1.0, "belief is subadditive (not a probability measure)");
}

/// Two-source Dempster combination to 1e-9. Hand arithmetic with exactly
/// f32-representable masses: m1(flim)=0.5 (frame 0.5), m2(flam)=0.75
/// (frame 0.25): K = 0.5·0.75 = 0.375;
/// m(flim) = 0.5·0.25 / 0.625 = 0.125/0.625 = 0.2 exactly.
#[test]
fn dempster_shafer_hidden_two_source_combination() {
    let mut input = base("belief");
    input.rules = vec![
        rule("witnessA", vec![], "flim", 0.5),
        rule("witnessB", vec![], "flam", 0.75),
    ];
    input.goals = vec![goal("query", "query", "flim")];
    let out = dispatch_breed_test("dempster_shafer", &input).expect("ds run");
    let bel: f64 = out
        .facts
        .iter()
        .find(|f| f.key == "belief:flim")
        .expect("belief fact")
        .value
        .parse()
        .unwrap();
    let expected = 0.125_f64 / 0.625_f64; // = 0.2 exactly
    assert!(
        (bel - expected).abs() < 1e-9,
        "m(flim) = 0.125/0.625 = 0.2, got {}",
        bel
    );
    assert!(out.inference_trace.iter().any(|t| t.kind == "ds-combine"));
}

/// Total conflict K=1 must be a run error (Dempster's rule undefined).
#[test]
fn dempster_shafer_hidden_total_conflict_is_error() {
    let mut input = base("belief");
    input.rules = vec![
        rule("witnessA", vec![], "flim", 1.0),
        rule("witnessB", vec![], "flam", 1.0),
    ];
    input.goals = vec![goal("query", "query", "flim")];
    let res = dispatch_breed_test("dempster_shafer", &input);
    assert!(res.is_err());
    assert!(res.unwrap_err().contains("K=1"));
}

// ---------------------------------------------------------------------------
// frames_inheritance
// ---------------------------------------------------------------------------

/// A1/A2: zilk→welp→snorf chain. welp's OWN slot (red) overrides snorf's root
/// default (blue) by inferential distance, and the frame-walk step count must
/// equal the path length (2: zilk, welp) — defeating any flat-lookup stub.
#[test]
fn frames_inheritance_hidden_override_and_walk_length() {
    let mut input = base("resolve zilk color");
    input.facts = vec![
        fact("frame:zilk:isa", "welp"),
        fact("frame:welp:isa", "snorf"),
        fact("frame:snorf:slot:color:default", "blue"),
        fact("frame:welp:slot:color", "red"),
    ];
    let out = dispatch_breed_test("frames_inheritance", &input).expect("frames run");
    assert_eq!(out.selected.as_deref(), Some("red"), "welp override beats snorf default");
    let walks = out.inference_trace.iter().filter(|t| t.kind == "frame-walk").count();
    assert_eq!(walks, 2, "walk step count == path length (zilk, welp)");
    assert!(!out.inference_trace.is_empty()); // A3
}

/// isa cycle must be a run error.
#[test]
fn frames_inheritance_hidden_cycle_detected() {
    let mut input = base("resolve zilk color");
    input.facts = vec![
        fact("frame:zilk:isa", "welp"),
        fact("frame:welp:isa", "zilk"),
    ];
    let res = dispatch_breed_test("frames_inheritance", &input);
    assert!(res.is_err());
    assert!(res.unwrap_err().contains("cycle"));
}

// ---------------------------------------------------------------------------
// ebl
// ---------------------------------------------------------------------------

/// A1/A2 + the plan's unfakeable check: the learned rule, EXECUTED as a
/// domain rule through a second EBL inference run, must derive the conclusion
/// for a fresh object (obj2/obj9) never seen in training. Postcondition: the
/// learned rule contains >= 1 variable.
#[test]
fn ebl_hidden_learned_rule_transfers_to_fresh_objects() {
    let mut input = base("learn");
    input.facts = vec![
        fact("weight(krate1,light)", "true"),
        fact("weight(bench1,heavy)", "true"),
    ];
    input.rules = vec![
        rule("r1", vec!["lighter(?x,?y)"], "safe_to_stack(?x,?y)", 1.0),
        rule(
            "r2",
            vec!["weight(?x,light)", "weight(?y,heavy)"],
            "lighter(?x,?y)",
            1.0,
        ),
    ];
    input.goals = vec![goal("g1", "safe_to_stack(krate1,bench1)", "true")];
    let out = dispatch_breed_test("ebl", &input).expect("ebl run");
    let learned = out
        .facts
        .iter()
        .find(|f| f.key == "ebl:rule")
        .expect("ebl:rule fact")
        .value
        .clone();
    assert!(learned.contains('?'), "learned rule must contain a variable: {}", learned);
    assert!(!out.inference_trace.is_empty()); // A3
    assert!(out.inference_trace.iter().any(|t| t.kind == "ebl-generalize"));

    // Parse "p1, p2 => head" and EXECUTE it via a second inference run on
    // fresh objects (no string-replacement simulation).
    let (body, head) = learned.split_once(" => ").expect("rule shape");
    let premises: Vec<&str> = body.split(", ").collect();
    let learned_rule = Rule {
        id: "learned".into(),
        premise: premises.iter().map(|s| s.to_string()).collect(),
        conclusion: head.to_string(),
        certainty: 1.0,
    };
    let mut apply_input = base("apply");
    apply_input.facts = vec![
        fact("weight(obj2,light)", "true"),
        fact("weight(obj9,heavy)", "true"),
    ];
    apply_input.rules = vec![learned_rule];
    apply_input.goals = vec![goal("g2", "safe_to_stack(obj2,obj9)", "true")];
    let applied = dispatch_breed_test("ebl", &apply_input)
        .expect("learned rule must derive the conclusion for fresh obj2/obj9");
    assert!(applied
        .inference_trace
        .iter()
        .any(|t| t.kind == "ebl-explain" && t.detail.contains("learned")));
}

// ===========================================================================
// P2 tier — hidden oracle challenges (12 breeds).
//
// Inputs use fresh names appearing in no paper fixture or module unit test
// (defeats A1 lookup tables and A2 memoization); every test asserts a
// non-empty inference trace (A3 stub adversary). All runs route through
// breeds::dispatch::dispatch_breed, so the OCEL conformance gate applies.
// ===========================================================================

use wasm4pm_cognition::breeds::dispatch::dispatch_breed as p2_dispatch;

fn p2_assert_real_trace(out: &wasm4pm_cognition::breeds::BreedOutput) {
    assert!(
        !out.inference_trace.is_empty(),
        "A3: empty trace is a fraud signal"
    );
}

fn p2_fv<'a>(out: &'a wasm4pm_cognition::breeds::BreedOutput, key: &str) -> &'a str {
    out.facts
        .iter()
        .find(|f| f.key == key)
        .map(|f| f.value.as_str())
        .unwrap_or_else(|| panic!("missing fact '{}'", key))
}

/// Hidden-ASP-1: even loop {gleep :- not snork; snork :- not gleep} → exactly
/// 2 answer sets; odd loop {florp :- not florp} → exactly 0. Hand-derived
/// from the Gelfond–Lifschitz reduct definition.
#[test]
fn asp_hidden_even_and_odd_loops() {
    let mut input = base("hidden asp even loop");
    input.rules = vec![
        rule("h1", vec!["not snork"], "gleep", 1.0),
        rule("h2", vec!["not gleep"], "snork", 1.0),
    ];
    let out = p2_dispatch("asp", &input).expect("even loop run");
    p2_assert_real_trace(&out);
    assert_eq!(p2_fv(&out, "asp:answer_set_count"), "2");
    assert_eq!(p2_fv(&out, "asp:answer_set:0"), "gleep");
    assert_eq!(p2_fv(&out, "asp:answer_set:1"), "snork");

    let mut odd = base("hidden asp odd loop");
    odd.rules = vec![rule("h3", vec!["not florp"], "florp", 1.0)];
    let out_odd = p2_dispatch("asp", &odd).expect("odd loop run");
    p2_assert_real_trace(&out_odd);
    assert_eq!(p2_fv(&out_odd, "asp:answer_set_count"), "0");
    assert!(out_odd.selected.is_none());
}

/// Hidden-ASP-2: non-monotonic retraction — adding wug_abnormal removes
/// wug_flies from the unique answer set.
#[test]
fn asp_hidden_nonmonotonic_retraction() {
    let mut input = base("hidden asp retraction");
    input.rules = vec![
        rule("hf", vec![], "wug", 1.0),
        rule("hr", vec!["wug", "not wug_abnormal"], "wug_flies", 1.0),
    ];
    let out = p2_dispatch("asp", &input).expect("base run");
    assert_eq!(p2_fv(&out, "asp:answer_set:0"), "wug,wug_flies");

    input.rules.push(rule("ha", vec![], "wug_abnormal", 1.0));
    let out2 = p2_dispatch("asp", &input).expect("abnormal run");
    p2_assert_real_trace(&out2);
    assert_eq!(p2_fv(&out2, "asp:answer_set:0"), "wug,wug_abnormal");
}

/// Hidden-DL-1: subsumption derivable only through the role chain
/// Quib ⊑ ∃zap.Vrul, Vrul ⊑ Hode, ∃zap.Hode ⊑ Plon (CR3 then CR4);
/// precision: the reverse direction must NOT be derived.
#[test]
fn description_logic_hidden_role_chain() {
    let mut input = base("hidden dl role chain");
    input.facts = vec![
        fact("dl:exists_rhs:Quib", "zap.Vrul"),
        fact("dl:subclass:Vrul", "Hode"),
        fact("dl:exists_lhs:zap.Hode", "Plon"),
    ];
    input.goals = vec![
        goal("q1", "dl:subsumes", "Quib:Plon"),
        goal("q2", "dl:subsumes", "Plon:Quib"),
    ];
    let out = p2_dispatch("description_logic", &input).expect("DL hidden run");
    p2_assert_real_trace(&out);
    assert_eq!(p2_fv(&out, "dl:verdict:Quib:Plon"), "true");
    assert_eq!(p2_fv(&out, "dl:verdict:Plon:Quib"), "false");
    assert!(out.inference_trace.iter().any(|t| t.kind == "apply-cr3"));
    assert!(out.inference_trace.iter().any(|t| t.kind == "apply-cr4"));
}

/// Hidden-ALP-1: IC (brill ∧ glorp impossible) rejects the lexicographically
/// first singleton; the correct minimal explanation is {snag}. Supersets of
/// accepted sets are excluded by minimality.
#[test]
fn abductive_lp_hidden_ic_and_minimality() {
    let mut input = base("hidden alp ic");
    input.facts = vec![
        fact("alp:abducible:brill", "true"),
        fact("alp:abducible:snag", "true"),
        fact("alp:ic:nogood", "brill,glorp"),
    ];
    input.rules = vec![
        rule("hr1", vec!["brill"], "glorp", 1.0),
        rule("hr2", vec!["snag"], "glorp", 1.0),
    ];
    input.goals = vec![goal("o1", "alp:observe", "glorp")];
    let out = p2_dispatch("abductive_lp", &input).expect("ALP hidden run");
    p2_assert_real_trace(&out);
    assert_eq!(p2_fv(&out, "alp:explanation_count"), "1");
    assert_eq!(p2_fv(&out, "alp:explanation:0"), "{snag}");
    assert!(out
        .inference_trace
        .iter()
        .any(|t| t.kind == "ic-check" && t.detail.contains("violated")));
}

/// Hidden-IBE-1: closed-form arithmetic — omni covers 3 obs at cost 25
/// (3 − 2.5 = 0.5); thrift covers 2 at cost 2 (2 − 0.2 = 1.8). The cheaper
/// partial hypothesis wins; exact scores asserted in trace details.
#[test]
fn abductive_ibe_hidden_score_arithmetic() {
    let mut input = base("hidden ibe scores");
    input.facts = vec![
        fact("ibe:obs:k1", "true"),
        fact("ibe:obs:k2", "true"),
        fact("ibe:obs:k3", "true"),
        fact("ibe:hyp:omni:covers", "k1,k2,k3"),
        fact("ibe:hyp:omni:cost", "25"),
        fact("ibe:hyp:thrift:covers", "k1,k2"),
        fact("ibe:hyp:thrift:cost", "2"),
    ];
    let out = p2_dispatch("abductive_ibe", &input).expect("IBE hidden run");
    p2_assert_real_trace(&out);
    assert_eq!(out.selected.as_deref(), Some("thrift"));
    assert_eq!(p2_fv(&out, "ibe:score"), "1.8000");
    assert!(out
        .inference_trace
        .iter()
        .any(|t| t.kind == "score-hypothesis" && t.detail == "omni score=0.5000"));
    assert!(out
        .inference_trace
        .iter()
        .any(|t| t.kind == "score-hypothesis" && t.detail == "thrift score=1.8000"));
}

/// Hidden-POP-1: demotion would order the clobberer before Start, so
/// promotion is forced: krel (deletes w) must come after zonk (needs w).
#[test]
fn partial_order_plan_hidden_promotion_forced() {
    let mut input = base("hidden pop promotion");
    input.facts = vec![
        fact("pop:op:zonk:pre", "w"),
        fact("pop:op:zonk:add", "t2"),
        fact("pop:op:krel:add", "t1"),
        fact("pop:op:krel:del", "w"),
    ];
    input.state = vec![state_atom("w", "true")];
    input.goals = vec![goal("g1", "t1", "true"), goal("g2", "t2", "true")];
    let out = p2_dispatch("partial_order_plan", &input).expect("POP hidden run");
    p2_assert_real_trace(&out);
    assert_eq!(p2_fv(&out, "pop:plan"), "zonk;krel");
    assert!(out.inference_trace.iter().any(|t| t.kind == "pop-resolve"));
}

/// Hidden-EC-1: glow flicked on@2, off@5, on@7 — HoldsAt(glow,4)=T by
/// inertia, HoldsAt(glow,6)=F (clipped), HoldsAt(glow,9)=T (re-initiated).
#[test]
fn event_calculus_hidden_inertia_clipping() {
    let mut input = base("hidden ec lamp");
    input.facts = vec![
        fact("ec:happens:2", "flick_on"),
        fact("ec:happens:5", "flick_off"),
        fact("ec:happens:7", "flick_on"),
        fact("ec:initiates:flick_on", "glow"),
        fact("ec:terminates:flick_off", "glow"),
    ];
    input.goals = vec![
        goal("q1", "ec:holdsat", "glow@4"),
        goal("q2", "ec:holdsat", "glow@6"),
        goal("q3", "ec:holdsat", "glow@9"),
    ];
    let out = p2_dispatch("event_calculus", &input).expect("EC hidden run");
    p2_assert_real_trace(&out);
    assert_eq!(p2_fv(&out, "ec:verdict:glow@4"), "true");
    assert_eq!(p2_fv(&out, "ec:verdict:glow@6"), "false");
    assert_eq!(p2_fv(&out, "ec:verdict:glow@9"), "true");
    assert!(out
        .inference_trace
        .iter()
        .any(|t| t.kind == "ec-infer" && t.detail.contains("true")));
}

/// Hidden-MDP-1: self-loop den with R=1, γ=0.5 → V = R/(1−γ) = 2 exactly;
/// Bellman residual < 1e-4 at every state of a second two-action model.
#[test]
fn mdp_hidden_closed_form_and_residual() {
    let mut input = base("hidden mdp den");
    input.facts = vec![
        fact("mdp:gamma", "0.5"),
        fact("mdp:trans:den:rest", "den:1.0"),
        fact("mdp:reward:den:rest", "1.0"),
    ];
    let out = p2_dispatch("mdp", &input).expect("MDP hidden run");
    p2_assert_real_trace(&out);
    let v: f64 = p2_fv(&out, "mdp:value:den").parse().unwrap();
    assert!((v - 2.0).abs() < 1e-4, "V(den) = {} != 2", v);

    // Two-state choice model: hand-derived V(burrow)=max(0.2/(1-0.5)=0.4, 0+0.5*3)=1.5? no:
    // V(field)=3/(1-0.5*0)? field: dig→field r=0 self? Use: field self-loop r=1.5 → V=3;
    // burrow: stay r=0.2 → 0.2+0.5V(burrow)=0.4; hop→field r=0 → 0+0.5*3=1.5 → V(burrow)=1.5, policy hop.
    let mut input2 = base("hidden mdp residual");
    input2.facts = vec![
        fact("mdp:gamma", "0.5"),
        fact("mdp:trans:burrow:hop", "field:1.0"),
        fact("mdp:trans:burrow:stay", "burrow:1.0"),
        fact("mdp:reward:burrow:stay", "0.2"),
        fact("mdp:trans:field:graze", "field:1.0"),
        fact("mdp:reward:field:graze", "1.5"),
    ];
    let out2 = p2_dispatch("mdp", &input2).expect("MDP residual run");
    let vb: f64 = p2_fv(&out2, "mdp:value:burrow").parse().unwrap();
    let vf: f64 = p2_fv(&out2, "mdp:value:field").parse().unwrap();
    assert!((vf - 3.0).abs() < 1e-4, "V(field) = {} != 3", vf);
    assert!((vb - 1.5).abs() < 1e-4, "V(burrow) = {} != 1.5", vb);
    // Bellman residual check at every state.
    assert!(((1.5 + 0.5 * vf) - vf).abs() < 1e-4);
    assert!((f64::max(0.2 + 0.5 * vb, 0.5 * vf) - vb).abs() < 1e-4);
    assert_eq!(p2_fv(&out2, "mdp:policy:burrow"), "hop");
}

/// Hidden-VS-1: novel texture/weight/hue domain — intermediate |G| = 2 after
/// the first negative, then exact convergence S == G == <?,heavy,?>.
#[test]
fn version_space_hidden_convergence() {
    let mut input = base("hidden vs convergence");
    input.facts = vec![
        fact("vs:attrs", "texture,weight,hue"),
        fact("vs:example:1", "fuzzy,heavy,crimson:+"),
        fact("vs:example:2", "smooth,light,crimson:-"),
        fact("vs:example:3", "fuzzy,heavy,teal:+"),
        fact("vs:example:4", "fuzzy,light,teal:-"),
        fact("vs:example:5", "smooth,heavy,amber:+"),
    ];
    let out = p2_dispatch("version_space", &input).expect("VS hidden run");
    p2_assert_real_trace(&out);
    assert!(
        out.inference_trace
            .iter()
            .any(|t| t.kind == "vs-update" && t.detail.contains("|G|=2")),
        "intermediate |G|=2 must appear"
    );
    assert_eq!(p2_fv(&out, "vs:converged"), "true");
    assert_eq!(p2_fv(&out, "vs:s"), "?,heavy,?");
    assert_eq!(p2_fv(&out, "vs:g:0"), "?,heavy,?");
}

/// Hidden-BM-1: the majority opinion (u∧v ×2) is excluded by IC ¬u; the
/// merged belief is the minimal-distance IC-world (¬u,v) with hand-computed
/// distance vector (1,1,1).
#[test]
fn belief_merging_hidden_ic_overrides_majority() {
    let mut input = base("hidden bm ic");
    input.facts = vec![
        fact("bm:atoms", "u,v"),
        fact("bm:base:1", "u,v"),
        fact("bm:base:2", "u,v"),
        fact("bm:base:3", "-u,-v"),
        fact("bm:ic", "-u"),
        fact("bm:operator", "sum"),
    ];
    let out = p2_dispatch("belief_merging", &input).expect("BM hidden run");
    p2_assert_real_trace(&out);
    assert_eq!(p2_fv(&out, "bm:model_count"), "1");
    assert_eq!(p2_fv(&out, "bm:model:0"), "-u,v");
    assert!(out
        .inference_trace
        .iter()
        .any(|t| t.kind == "distance" && t.detail.contains("d=(1,1,1)")));
}

/// Hidden-QR-1: bathtub variant flin/flout/dvol — the ambiguous + ⊕ −
/// confluence must yield ALL THREE dvol branches (state-count assert), with
/// the dvol=0 quasi-equilibrium branch present.
#[test]
fn qualitative_reason_hidden_ambiguity_branches() {
    let mut input = base("hidden qr bathtub");
    input.facts = vec![
        fact("qr:confluence:tub", "+flin,-flout,-dvol"),
        fact("qr:sign:flin", "+"),
        fact("qr:sign:flout", "+"),
    ];
    let out = p2_dispatch("qualitative_reason", &input).expect("QR hidden run");
    p2_assert_real_trace(&out);
    assert_eq!(p2_fv(&out, "qr:state_count"), "3");
    assert!(out.inference_trace.iter().any(|t| t.kind == "branch-ambiguity"));
    for glyph in ["+", "0", "-"] {
        assert!(
            out.facts
                .iter()
                .any(|f| f.key.starts_with("qr:state:")
                    && f.value.contains(&format!("dvol:{}", glyph))),
            "missing dvol={} branch",
            glyph
        );
    }
}

/// Hidden-SAM-1: airport story observing only checkin + fly infers exactly
/// {security, board} with the bound filler — and NOT land (bounded inference).
#[test]
fn script_sam_hidden_bounded_inference() {
    let mut input = base("hidden sam airport");
    input.facts = vec![
        fact("sam:event:1", "checkin:nia"),
        fact("sam:event:2", "fly:nia"),
    ];
    let out = p2_dispatch("script_sam", &input).expect("SAM hidden run");
    p2_assert_real_trace(&out);
    assert_eq!(p2_fv(&out, "sam:script"), "airport");
    let inferred: Vec<&str> = out
        .facts
        .iter()
        .filter_map(|f| f.key.strip_prefix("sam:inferred:"))
        .collect();
    assert_eq!(inferred, vec!["security", "board"]);
    assert!(!inferred.contains(&"land"), "land must NOT be inferred");
    assert_eq!(p2_fv(&out, "sam:inferred:security"), "nia");
    assert_eq!(p2_fv(&out, "sam:role:passenger"), "nia");
}

/// Hidden-CLP-1: p<q<r≤3 over 1..5 — propagation alone forces p=1,q=2,r=3
/// with ZERO backtrack steps; exact domain reductions appear in the trace.
#[test]
fn clp_hidden_propagation_only() {
    let mut input = base("hidden clp chain");
    input.facts = vec![
        fact("clp:var:p", "1..5"),
        fact("clp:var:q", "1..5"),
        fact("clp:var:r", "1..5"),
        fact("clp:constraint:c1", "p<q"),
        fact("clp:constraint:c2", "q<r"),
        fact("clp:constraint:c3", "r<=3"),
    ];
    let out = p2_dispatch("clp", &input).expect("CLP hidden run");
    p2_assert_real_trace(&out);
    assert_eq!(out.selected.as_deref(), Some("p=1,q=2,r=3"));
    assert_eq!(p2_fv(&out, "clp:backtracks"), "0");
    assert!(out.inference_trace.iter().all(|t| t.kind != "backtrack"));
    assert!(out
        .inference_trace
        .iter()
        .any(|t| t.kind == "propagate" && t.detail == "r: {3,4,5} -> {3}"));
    assert!(out
        .inference_trace
        .iter()
        .any(|t| t.kind == "propagate" && t.detail.starts_with("p:") && t.detail.ends_with("{1}")));
}

// ===========================================================================
// P3 tier hidden challenge tests — fresh names never used in any public
// fixture; expected values hand-derived from each algorithm's specification.
// Every test asserts a non-empty inference_trace (A3 stub adversary).
// ===========================================================================

use wasm4pm_cognition::breeds::Case;

/// Hidden-SITCALC-1: a fluent untouched by a 3-action sequence persists at
/// the final situation AND has a frame-persist step naming it. Defeats A1/A2
/// (fresh fluents/actions) and any engine that recomputes instead of using
/// frame inertia (no frame-persist evidence).
#[test]
fn situation_calculus_hidden_frame_inertia() {
    let mut input = base("hidden sitcalc");
    input.facts = vec![
        fact("fluent:lamp_lit", "true"),
        fact("fluent:gate_open", "true"),
        fact("fluent:rune_etched", "true"),
        fact("action:close_gate:pre", "gate_open"),
        fact("action:close_gate:del", "gate_open"),
        fact("action:close_gate:add", "gate_shut"),
        fact("action:dim_lamp:pre", "lamp_lit"),
        fact("action:dim_lamp:del", "lamp_lit"),
        fact("action:dim_lamp:add", "lamp_dim"),
        fact("action:open_gate:pre", "gate_shut"),
        fact("action:open_gate:del", "gate_shut"),
        fact("action:open_gate:add", "gate_open"),
        fact("do:0", "close_gate"),
        fact("do:1", "dim_lamp"),
        fact("do:2", "open_gate"),
    ];
    let out = dispatch_breed_test("situation_calculus", &input).expect("run ok");
    assert!(!out.inference_trace.is_empty(), "A3: empty trace");
    // rune_etched untouched by all three actions: persists + named.
    assert!(
        out.facts.iter().any(|f| f.key == "holds:rune_etched"),
        "rune_etched must persist"
    );
    assert!(
        out.inference_trace
            .iter()
            .any(|t| t.kind == "frame-persist" && t.detail.contains("rune_etched")),
        "frame-persist step must name rune_etched"
    );
    // gate_open was touched (deleted then re-added): no frame-persist for it.
    assert!(
        !out.inference_trace
            .iter()
            .any(|t| t.kind == "frame-persist" && t.detail.contains("gate_open")),
        "touched fluent must not claim inertia"
    );
    assert!(out.facts.iter().any(|f| f.key == "holds:gate_open"));
    assert!(!out.facts.iter().any(|f| f.key == "holds:lamp_lit"));
    assert_eq!(
        out.inference_trace.iter().filter(|t| t.kind == "regress-step").count(),
        3
    );
}

/// Hidden-CIRC-1: naive forward chaining (ignoring not_-premises) would
/// derive flies_korv; circumscription must NOT entail it because dodo_korv
/// forces ab_bird_korv in every minimal model.
#[test]
fn circumscription_hidden_blocks_naive_chaining() {
    let mut input = base("hidden circumscription");
    input.facts = vec![fact("bird_korv", "true"), fact("dodo_korv", "true")];
    input.rules = vec![
        rule("h-fly", vec!["bird_korv", "not_ab_bird_korv"], "flies_korv", 1.0),
        rule("h-dodo", vec!["dodo_korv"], "ab_bird_korv", 1.0),
    ];
    input.goals = vec![goal("g1", "entail", "flies_korv")];
    let out = dispatch_breed_test("circumscription", &input).expect("run ok");
    assert!(!out.inference_trace.is_empty(), "A3: empty trace");
    // Naive monotone chaining (ignore not_) WOULD fire h-fly. Circumscription must not.
    assert!(
        out.facts
            .iter()
            .any(|f| f.key == "entailed:flies_korv" && f.value == "false"),
        "flies_korv must NOT be cautiously entailed"
    );
    // 1 ab atom → exactly 2 candidate enumerations.
    assert_eq!(
        out.inference_trace.iter().filter(|t| t.kind == "enumerate-model").count(),
        2
    );
}

/// Hidden-CIRC-2: minimize prune steps appear when a strictly larger
/// consistent ab-set is dominated by a smaller one.
#[test]
fn circumscription_hidden_minimize_prunes() {
    let mut input = base("hidden circumscription prune");
    input.facts = vec![fact("wug_a", "true")];
    input.rules = vec![
        // ab_self_x is self-supported when assumed: ab in S derives itself.
        rule("h-self", vec!["ab_self_x"], "ab_self_x", 1.0),
        rule("h-glow", vec!["wug_a", "not_ab_self_x"], "glows_a", 1.0),
    ];
    input.goals = vec![goal("g1", "entail", "glows_a")];
    let out = dispatch_breed_test("circumscription", &input).expect("run ok");
    // Both S={} and S={ab_self_x} are models; only S={} is minimal.
    assert!(
        out.inference_trace.iter().any(|t| t.kind == "minimize"),
        "the non-minimal model must be pruned with a minimize step"
    );
    assert!(
        out.facts
            .iter()
            .any(|f| f.key == "entailed:glows_a" && f.value == "true"),
        "glows_a holds in the unique minimal model"
    );
}

/// Hidden-SME-1: systematicity beats match count. Three shallow attribute
/// matches all pull gor→rix; the single deep causal chain pulls gor→lum.
/// The gmap must take the chain (score 5 > 1) and reject the shallow trio.
#[test]
fn analogy_sme_hidden_systematicity_beats_count() {
    let mut input = base("hidden sme");
    input.facts = vec![
        fact("base:0", "(cause (push gor tor) (move tor))"),
        fact("base:1", "(glow gor)"),
        fact("base:2", "(hum gor)"),
        fact("base:3", "(buzz gor)"),
        fact("target:0", "(cause (push lum rix) (move rix))"),
        fact("target:1", "(glow rix)"),
        fact("target:2", "(hum rix)"),
        fact("target:3", "(buzz rix)"),
    ];
    let out = dispatch_breed_test("analogy_sme", &input).expect("run ok");
    assert!(!out.inference_trace.is_empty(), "A3: empty trace");
    let map_gor = out
        .facts
        .iter()
        .find(|f| f.key == "map:gor")
        .expect("gor must be mapped");
    assert_eq!(
        map_gor.value, "lum",
        "deep relational chain must win over three shallow attribute matches"
    );
    assert!(
        out.facts.iter().any(|f| f.key == "map:tor" && f.value == "rix"),
        "tor must map to rix via the chain"
    );
}

/// Hidden-ACTR-1: two chunks match the retrieval pattern and differ only in
/// base-level activation — the higher-B chunk wins and the activation value
/// appears in the retrieve-chunk detail.
#[test]
fn act_r_hidden_base_activation_decides() {
    let mut input = base("hidden actr");
    input.facts = vec![fact("mode", "scan")];
    input.cases = vec![
        Case {
            id: "chunk-lo".into(),
            intent: "x".into(),
            architecture: "declarative-chunk".into(),
            outcome_score: 0.4,
            facts: vec![fact("zone", "omega")],
        },
        Case {
            id: "chunk-hi".into(),
            intent: "x".into(),
            architecture: "declarative-chunk".into(),
            outcome_score: 0.9,
            facts: vec![fact("zone", "omega")],
        },
    ];
    input.rules = vec![rule("p-scan", vec!["mode=scan"], "retrieve:zone=omega", 0.8)];
    let out = dispatch_breed_test("act_r", &input).expect("run ok");
    assert!(!out.inference_trace.is_empty(), "A3: empty trace");
    assert_eq!(out.selected.as_deref(), Some("chunk-hi"), "higher B must win");
    let retrieve = out
        .inference_trace
        .iter()
        .find(|t| t.kind == "retrieve-chunk")
        .expect("retrieve-chunk step required");
    assert!(retrieve.detail.contains("chunk-hi"));
    assert!(
        retrieve.detail.contains("A=0.9"),
        "activation value must be evidenced in the trace detail: {}",
        retrieve.detail
    );
}

/// Hidden-PROBLOG-1: novel probabilities, exact to 1e-6 by hand:
/// q :- a,b. q :- c. with 0.35::a, 0.6::b, 0.25::c
/// P(q) = P(c) + P(¬c)·P(a)·P(b) = 0.25 + 0.75·0.35·0.6 = 0.4075.
#[test]
fn problog_hidden_exact_novel_probability() {
    let mut input = base("hidden problog");
    input.facts = vec![
        fact("pfact:atom_a", "0.35"),
        fact("pfact:atom_b", "0.6"),
        fact("pfact:atom_c", "0.25"),
    ];
    input.rules = vec![
        rule("h-ab", vec!["atom_a", "atom_b"], "q_derived", 1.0),
        rule("h-c", vec!["atom_c"], "q_derived", 1.0),
    ];
    input.goals = vec![goal("g1", "query", "q_derived")];
    let out = dispatch_breed_test("problog", &input).expect("run ok");
    assert!(!out.inference_trace.is_empty(), "A3: empty trace");
    let p: f64 = out
        .facts
        .iter()
        .find(|f| f.key == "prob:q_derived")
        .expect("probability fact")
        .value
        .parse()
        .unwrap();
    assert!(
        (p - 0.4075).abs() < 1e-6,
        "hand-derived P = 0.4075, got {}",
        p
    );
    assert_eq!(
        out.inference_trace.iter().filter(|t| t.kind == "enumerate-world").count(),
        8
    );
}

/// Hidden-SAT-1: pigeonhole PHP(3,2) is UNSAT and requires ≥1 learn-clause;
/// every learned clause is independently re-validated as a resolvent of its
/// recorded antecedents (resolution certificate from=/pivots=).
#[test]
fn sat_cdcl_hidden_pigeonhole_with_resolvent_revalidation() {
    use wasm4pm_cognition::breeds::support::clauses::{Clause, Lit};

    let clause_specs: Vec<(&str, &str)> = vec![
        ("clause:00", "1 2"),
        ("clause:01", "3 4"),
        ("clause:02", "5 6"),
        ("clause:03", "-1 -3"),
        ("clause:04", "-1 -5"),
        ("clause:05", "-3 -5"),
        ("clause:06", "-2 -4"),
        ("clause:07", "-2 -6"),
        ("clause:08", "-4 -6"),
    ];
    let mut input = base("hidden sat pigeonhole");
    input.facts = clause_specs
        .iter()
        .map(|(k, v)| fact(k, v))
        .collect();
    let out = dispatch_breed_test("sat_cdcl", &input).expect("run ok");
    assert!(!out.inference_trace.is_empty(), "A3: empty trace");
    assert_eq!(out.selected.as_deref(), Some("UNSAT"), "PHP(3,2) is UNSAT");

    let parse_clause = |s: &str| -> Clause {
        Clause::new(
            s.split_whitespace()
                .map(|t| {
                    let n: i64 = t.parse().unwrap();
                    let var = (n.unsigned_abs() - 1) as u32;
                    if n > 0 { Lit::pos(var) } else { Lit::neg(var) }
                })
                .collect(),
        )
    };
    // Reconstruct the clause database exactly as the solver builds it.
    let mut db: Vec<Clause> = clause_specs.iter().map(|(_, v)| parse_clause(v)).collect();

    let learn_steps: Vec<&wasm4pm_cognition::breeds::TraceStep> = out
        .inference_trace
        .iter()
        .filter(|t| t.kind == "learn-clause")
        .collect();
    assert!(!learn_steps.is_empty(), "PHP(3,2) requires at least one learned clause");

    let extract = |detail: &str, key: &str| -> String {
        let start = detail.find(key).unwrap() + key.len();
        let end = detail[start..].find(']').unwrap() + start;
        detail[start..end].to_string()
    };
    for step in &learn_steps {
        let learned_str = extract(&step.detail, "learned=[");
        let from: Vec<usize> = extract(&step.detail, "from=[")
            .split(',')
            .filter(|s| !s.is_empty())
            .map(|s| s.parse().unwrap())
            .collect();
        let pivots: Vec<u32> = extract(&step.detail, "pivots=[")
            .split(',')
            .filter(|s| !s.is_empty())
            .map(|s| s.parse::<u32>().unwrap() - 1)
            .collect();
        let learned = parse_clause(&learned_str);
        assert_eq!(from.len(), pivots.len() + 1, "certificate arity");
        // Re-derive the resolvent from the certificate.
        let mut cur = db[from[0]].clone();
        for (idx, piv) in from[1..].iter().zip(pivots.iter()) {
            let other = &db[*idx];
            cur = cur
                .resolve(other, *piv)
                .or_else(|| other.resolve(&cur, *piv))
                .expect("certificate must be a valid resolution step");
        }
        assert_eq!(
            cur, learned,
            "learned clause must equal the re-derived resolvent"
        );
        db.push(learned);
    }
}

/// Hidden-EPISODIC-1: temporal kernel flips the winner against pure Jaccard.
/// ep-rich has Jaccard 1.0 but is old; ep-near has Jaccard 0.5 at Δt=0.
/// Pure Jaccard picks ep-rich (1.0 > 0.5); the temporal kernel makes
/// ep-near win: 0.5 + 1 = 1.5 > 1.0 + 1/99 ≈ 1.0101.
#[test]
fn episodic_memory_hidden_temporal_flip() {
    let mut input = base("hidden episodic");
    input.facts = vec![
        fact("flav", "umami"),
        fact("hue", "teal"),
        fact("cue:t", "99"),
        fact("episode:ep-rich:t", "1"),
        fact("episode:ep-near:t", "99"),
    ];
    input.cases = vec![
        Case {
            id: "ep-rich".into(),
            intent: "x".into(),
            architecture: "episode".into(),
            outcome_score: 0.5,
            facts: vec![fact("flav", "umami"), fact("hue", "teal")],
        },
        Case {
            id: "ep-near".into(),
            intent: "x".into(),
            architecture: "episode".into(),
            outcome_score: 0.5,
            facts: vec![fact("flav", "umami"), fact("hue", "mauve")],
        },
    ];
    let out = dispatch_breed_test("episodic_memory", &input).expect("run ok");
    assert!(!out.inference_trace.is_empty(), "A3: empty trace");
    // Pure-Jaccard scores: ep-rich = 1.0, ep-near = 1/3 — rich wins.
    // Kernel scores: ep-rich = 1.0 + 1/99; ep-near = 1/3 + 1.0 — near wins.
    assert_eq!(
        out.selected.as_deref(),
        Some("ep-near"),
        "temporal kernel must flip the winner vs pure Jaccard (CBR rebadge check)"
    );
}

/// Hidden-RL-1: 4-state chain with closed-form Q*. With γ = 0.9,
/// advance: wi → wi+1 (reward 1 only on w2→w3, terminal), back: wi → wi-1.
/// Q*(w2,advance)=1, Q*(w1,advance)=0.9, Q*(w0,advance)=0.81,
/// Q*(w0,back)=0.729, Q*(w1,back)=0.729, Q*(w2,back)=0.81.
/// Policy must be 'advance' everywhere, max|Q − Q*| < 0.05, and the
/// per-episode max-delta trend must be non-increasing (early >> late).
#[test]
fn rl_symbolic_hidden_four_state_chain_q_star() {
    let mut input = base("hidden rl");
    input.facts = vec![
        fact("mdp:gamma", "0.9"),
        fact("mdp:start", "w0"),
        fact("mdp:terminal:w3", "true"),
        fact("mdp:t:w0:advance", "w1"),
        fact("mdp:t:w1:advance", "w2"),
        fact("mdp:t:w2:advance", "w3"),
        fact("mdp:t:w0:back", "w0"),
        fact("mdp:t:w1:back", "w0"),
        fact("mdp:t:w2:back", "w1"),
        fact("mdp:r:w2:advance", "1.0"),
        fact("rl:episodes", "400"),
    ];
    let out = dispatch_breed_test("rl_symbolic", &input).expect("run ok");
    assert!(!out.inference_trace.is_empty(), "A3: empty trace");

    // Policy optimal everywhere.
    for s in ["w0", "w1", "w2"] {
        let p = out
            .facts
            .iter()
            .find(|f| f.key == format!("policy:{}", s))
            .unwrap_or_else(|| panic!("policy for {}", s));
        assert_eq!(p.value, "advance", "policy at {} must be optimal", s);
    }
    // Q within 0.05 of the hand-derived fixed point.
    let q_star = [
        ("q:w0:advance", 0.81),
        ("q:w1:advance", 0.9),
        ("q:w2:advance", 1.0),
        ("q:w0:back", 0.729),
        ("q:w1:back", 0.729),
        ("q:w2:back", 0.81),
    ];
    for (key, expect) in q_star {
        let v: f64 = out
            .facts
            .iter()
            .find(|f| f.key == key)
            .unwrap_or_else(|| panic!("missing {}", key))
            .value
            .parse()
            .unwrap();
        assert!(
            (v - expect).abs() < 0.05,
            "{}: |{} - {}| >= 0.05",
            key,
            v,
            expect
        );
    }
    // Episode max-delta trend: early mean must dominate late mean.
    let deltas: Vec<f64> = out
        .inference_trace
        .iter()
        .filter(|t| t.kind == "episode-end")
        .map(|t| {
            let i = t.detail.find("max-delta=").unwrap() + "max-delta=".len();
            t.detail[i..].parse::<f64>().unwrap()
        })
        .collect();
    assert_eq!(deltas.len(), 400);
    let early: f64 = deltas[..20].iter().sum::<f64>() / 20.0;
    let late: f64 = deltas[380..].iter().sum::<f64>() / 20.0;
    assert!(
        early > late,
        "TD updates must shrink: early mean {} <= late mean {}",
        early,
        late
    );
}

/// Hidden-CTL-1: EF p holds but AF p fails on a novel structure; the AF
/// counterexample (a lasso avoiding p) is re-validated edge-by-edge against
/// the declared transitions, and every state on it must lack p.
#[test]
fn ctl_check_hidden_ef_holds_af_fails_with_validated_counterexample() {
    let ts_facts = |formula: &str| {
        vec![
            fact("ts:init", "qa"),
            fact("ts:edge:qa", "qb,qc"),
            fact("ts:edge:qb", "qb"),
            fact("ts:edge:qc", "qc"),
            fact("ts:label:qb", "p"),
            fact("ctl:formula", formula),
        ]
    };
    // EF p holds at qa (path qa→qb).
    let mut input_ef = base("hidden ctl ef");
    input_ef.facts = ts_facts("E F p");
    let out_ef = dispatch_breed_test("ctl_check", &input_ef).expect("run ok");
    assert!(!out_ef.inference_trace.is_empty(), "A3: empty trace");
    assert_eq!(out_ef.selected.as_deref(), Some("holds"));

    // AF p fails at qa (path qa→qc→qc→… never reaches p).
    let mut input_af = base("hidden ctl af");
    input_af.facts = ts_facts("A F p");
    let out_af = dispatch_breed_test("ctl_check", &input_af).expect("run ok");
    assert_eq!(out_af.selected.as_deref(), Some("fails"));

    // Re-validate the counterexample independently.
    let declared_edges: Vec<(&str, &str)> =
        vec![("qa", "qb"), ("qa", "qc"), ("qb", "qb"), ("qc", "qc")];
    let p_states = ["qb"];
    let mut cex: Vec<(usize, String)> = out_af
        .facts
        .iter()
        .filter(|f| f.key.starts_with("cex:"))
        .map(|f| (f.key[4..].parse::<usize>().unwrap(), f.value.clone()))
        .collect();
    cex.sort();
    assert!(!cex.is_empty(), "a failing AF must carry a counterexample");
    let mut prev_target: Option<String> = None;
    for (_, edge) in &cex {
        let (s, t) = edge.split_once("->").expect("edge format s->t");
        assert!(
            declared_edges.contains(&(s, t)),
            "counterexample edge {} not in the declared transition relation",
            edge
        );
        assert!(!p_states.contains(&s), "state {} on the lasso satisfies p", s);
        assert!(!p_states.contains(&t), "state {} on the lasso satisfies p", t);
        if let Some(pt) = &prev_target {
            assert_eq!(pt, s, "counterexample path must be connected");
        }
        prev_target = Some(t.to_string());
    }
    assert_eq!(cex[0].1.split_once("->").unwrap().0, "qa", "path starts at init");
}

/// Hidden-ILP-1: the clause learned from family A classifies a disjoint
/// family B (constants never seen in training) — evaluated by an
/// independent in-test matcher over the learned rule text.
#[test]
fn ilp_hidden_learned_clause_transfers_to_family_b() {
    let mut input = base("hidden ilp");
    input.facts = vec![
        fact("bg:parent(nera,zoe)", "true"),
        fact("bg:parent(nera,kip)", "true"),
        fact("bg:parent(kip,ulla)", "true"),
        fact("bg:female(nera)", "true"),
        fact("bg:female(zoe)", "true"),
        fact("bg:female(ulla)", "true"),
        fact("pos:daughter(zoe,nera)", "true"),
        fact("pos:daughter(ulla,kip)", "true"),
        fact("neg:daughter(kip,nera)", "true"),
        fact("neg:daughter(nera,zoe)", "true"),
        fact("neg:daughter(ulla,nera)", "true"),
    ];
    let out = dispatch_breed_test("ilp", &input).expect("run ok");
    assert!(!out.inference_trace.is_empty(), "A3: empty trace");
    let rule_text = out
        .facts
        .iter()
        .find(|f| f.key == "ilp:rule:0")
        .expect("learned rule")
        .value
        .clone();

    // Independent evaluator over family B: rhod (male parent), mira (female child).
    let bg_b: Vec<&str> = vec!["parent(rhod,mira)", "female(mira)"];
    let classify = |x: &str, y: &str| -> bool {
        let body = rule_text.split(":-").nth(1).expect("body");
        body.split(", ").all(|lit| {
            let ground = lit.trim().replace("V0", x).replace("V1", y);
            bg_b.contains(&ground.as_str())
        })
    };
    assert!(
        classify("mira", "rhod"),
        "daughter(mira,rhod) must be classified positive by '{}'",
        rule_text
    );
    assert!(
        !classify("rhod", "mira"),
        "daughter(rhod,mira) must be classified negative by '{}'",
        rule_text
    );
}

/// Hidden-PHYS-1: 4-deep support/containment tower; removing the base must
/// produce exactly the transitive falls-closure (over-derivation fails too),
/// with the responsible axiom named for every derived atom.
#[test]
fn naive_physics_hidden_tower_exact_closure() {
    let mut input = base("hidden physics");
    input.facts = vec![
        fact("np:ground:slab", "true"),
        fact("np:on:krat", "slab"),
        fact("np:on:bolv", "krat"),
        fact("np:on:mim", "bolv"),
        fact("np:in:pearl", "mim"),
        fact("np:liquid:brine", "mim"),
        fact("np:remove:krat", "true"),
    ];
    let out = dispatch_breed_test("naive_physics", &input).expect("run ok");
    assert!(!out.inference_trace.is_empty(), "A3: empty trace");
    let falls: std::collections::BTreeSet<&str> = out
        .facts
        .iter()
        .filter(|f| f.key.starts_with("falls:"))
        .map(|f| &f.key[6..])
        .collect();
    let expected: std::collections::BTreeSet<&str> =
        ["bolv", "mim", "pearl"].into_iter().collect();
    assert_eq!(falls, expected, "exact transitive falls-closure required");
    assert!(
        out.facts.iter().any(|f| f.key == "spills:brine"),
        "liquid in falling container must spill"
    );
    // Axiom attribution per derived atom.
    for (obj, axiom) in [
        ("bolv", "ax-unsupported-falls"),
        ("mim", "ax-unsupported-falls"),
        ("pearl", "ax-containment-transport"),
    ] {
        assert!(
            out.inference_trace
                .iter()
                .any(|t| t.kind == "apply-axiom"
                    && t.detail.contains(axiom)
                    && t.detail.contains(&format!("'{}'", obj))),
            "{} must be derived by {}",
            obj,
            axiom
        );
    }
    assert!(
        out.inference_trace
            .iter()
            .any(|t| t.kind == "apply-axiom" && t.detail.contains("ax-liquid-spill")),
        "spill must name ax-liquid-spill"
    );
}

// ===========================================================================
// TABLEAUX hidden challenge tests
// ===========================================================================

/// Hidden-TABLEAUX-1: fresh-name K instance `zorp -> (wibble -> zorp)` is
/// valid and its proof must be alpha-only (ZERO beta-expand steps) — the
/// structural fingerprint a lookup table or stub cannot reproduce.
#[test]
fn tableaux_hidden_k_instance_alpha_only() {
    let mut input = base("prove fresh K instance");
    input.facts = vec![fact("tableaux:formula", "zorp -> (wibble -> zorp)")];
    let out = dispatch_breed_test("tableaux", &input).expect("must prove");
    assert!(!out.inference_trace.is_empty(), "A3: non-empty trace required");
    assert_eq!(out.selected.as_deref(), Some("valid"));
    assert_eq!(
        out.inference_trace.iter().filter(|t| t.kind == "beta-expand").count(),
        0,
        "K instance must close without branching"
    );
}

/// Hidden-TABLEAUX-2: `zorp -> wibble` is invalid; the emitted countermodel
/// is verified by an INDEPENDENT evaluator inside this test (recursive truth
/// evaluation over the countermodel valuation — not the breed's code path).
#[test]
fn tableaux_hidden_countermodel_independently_verified() {
    use std::collections::BTreeMap;
    use wasm4pm_cognition::breeds::support::formula::Formula;

    /// Independent propositional evaluator (test-local, not breed code).
    fn eval(f: &Formula, v: &BTreeMap<String, bool>) -> bool {
        match f {
            Formula::True => true,
            Formula::False => false,
            Formula::Atom(a) => *v.get(a).unwrap_or(&false),
            Formula::Not(a) => !eval(a, v),
            Formula::And(a, b) => eval(a, v) && eval(b, v),
            Formula::Or(a, b) => eval(a, v) || eval(b, v),
            Formula::Implies(a, b) => !eval(a, v) || eval(b, v),
            _ => panic!("non-propositional operator in countermodel check"),
        }
    }

    let src = "zorp -> wibble";
    let mut input = base("refute fresh implication");
    input.facts = vec![fact("tableaux:formula", src)];
    let out = dispatch_breed_test("tableaux", &input).expect("must run");
    assert!(!out.inference_trace.is_empty(), "A3: non-empty trace required");
    assert_eq!(out.selected.as_deref(), Some("invalid"));

    let mut valuation: BTreeMap<String, bool> = BTreeMap::new();
    for f in &out.facts {
        if let Some(atom) = f.key.strip_prefix("tableaux:countermodel:") {
            valuation.insert(atom.to_string(), f.value == "true");
        }
    }
    assert!(!valuation.is_empty(), "countermodel facts required for invalid verdict");
    let formula = Formula::parse(src).expect("parse");
    assert!(
        !eval(&formula, &valuation),
        "independent evaluator: countermodel must falsify the formula"
    );
}

// ===========================================================================
// CONSTRUCTION-GRAMMAR hidden challenge tests
// ===========================================================================

fn sneeze_facts() -> Vec<wasm4pm_cognition::breeds::Fact> {
    vec![
        fact("cxg:utterance", "he sneezed the napkin off the table"),
        fact("lex:he:pos", "pron"),
        fact("lex:sneezed:pos", "verb"),
        fact("lex:sneezed:valence", "intransitive"),
        fact("lex:the:pos", "det"),
        fact("lex:napkin:pos", "noun"),
        fact("lex:off:pos", "prep"),
        fact("lex:table:pos", "noun"),
    ]
}

/// Hidden-CXG-1 (Goldberg's signature): "sneezed the napkin off the table"
/// must receive the caused-motion meaning even though 'sneeze' is lexically
/// intransitive — the meaning CANNOT come from the verb's lexicon entry.
#[test]
fn construction_grammar_hidden_sneeze_coercion() {
    let mut input = base("goldberg sneeze");
    input.facts = sneeze_facts();
    let out = dispatch_breed_test("construction_grammar", &input).expect("must parse");
    assert!(!out.inference_trace.is_empty(), "A3: non-empty trace required");
    assert_eq!(out.selected.as_deref(), Some("caused-motion"));
    let meaning = out.facts.iter().find(|f| f.key == "cxg:meaning").unwrap();
    assert!(meaning.value.starts_with("CAUSE-MOVE"), "meaning: {}", meaning.value);
    let coerced = out.facts.iter().find(|f| f.key == "cxg:coerced").unwrap();
    assert_eq!(coerced.value, "true", "intransitive verb must be coerced by the construction");
    let obl = out.facts.iter().find(|f| f.key == "cxg:slot:obl").unwrap();
    assert_eq!(obl.value, "off the table");
}

/// Hidden-CXG-2: removing the oblique chunk changes the matched construction
/// (caused-motion → transitive) — proves matching is structural, not memoized.
#[test]
fn construction_grammar_hidden_removing_oblique_changes_match() {
    let mut input = base("goldberg sneeze truncated");
    input.facts = sneeze_facts();
    input.facts[0] = fact("cxg:utterance", "he sneezed the napkin");
    let out = dispatch_breed_test("construction_grammar", &input).expect("must parse");
    assert_eq!(out.selected.as_deref(), Some("transitive"));
    let meaning = out.facts.iter().find(|f| f.key == "cxg:meaning").unwrap();
    assert!(meaning.value.starts_with("ACT-ON"));
}

// ===========================================================================
// MARKOV-LOGIC hidden challenge tests
// ===========================================================================

/// Hidden-MLN-1: fresh-name weighted clauses; the test EXHAUSTIVELY
/// enumerates all 2^k assignments (k=3) with its own evaluator and asserts
/// the breed's `mln:cost` equals the exhaustive optimum. Also asserts the
/// double run is bit-identical (seeded SmallRng determinism).
#[test]
fn markov_logic_hidden_exhaustive_optimum_and_determinism() {
    // (atom, positive) literals per clause + weight; fresh atom names.
    let clauses: Vec<(f64, Vec<(&str, bool)>)> = vec![
        (2.5, vec![("grompf", false), ("zibble", true)]),
        (1.2, vec![("grompf", true), ("zibble", true)]),
        (0.7, vec![("zibble", false), ("quorx", false)]),
        (1.9, vec![("quorx", true), ("grompf", true)]),
    ];
    let atoms = ["grompf", "quorx", "zibble"];

    // Exhaustive 2^3 optimum (test-local evaluator).
    let mut optimum = f64::INFINITY;
    for mask in 0..(1u32 << atoms.len()) {
        let val = |a: &str| -> bool {
            let i = atoms.iter().position(|x| *x == a).unwrap();
            mask & (1 << i) != 0
        };
        let cost: f64 = clauses
            .iter()
            .filter(|(_, lits)| !lits.iter().any(|(a, pos)| val(a) == *pos))
            .map(|(w, _)| *w)
            .sum();
        if cost < optimum {
            optimum = cost;
        }
    }

    let mut input = base("fresh MLN MAP");
    input.facts = vec![
        fact("mln:clause:h1", "2.5|!grompf,zibble"),
        fact("mln:clause:h2", "1.2|grompf,zibble"),
        fact("mln:clause:h3", "0.7|!zibble,!quorx"),
        fact("mln:clause:h4", "1.9|quorx,grompf"),
    ];
    let out1 = dispatch_breed_test("markov_logic", &input).expect("run 1");
    let out2 = dispatch_breed_test("markov_logic", &input).expect("run 2");
    assert!(!out1.inference_trace.is_empty(), "A3: non-empty trace required");

    let cost_fact = out1.facts.iter().find(|f| f.key == "mln:cost").unwrap();
    let breed_cost: f64 = cost_fact.value.parse().unwrap();
    assert!(
        (breed_cost - optimum).abs() < 1e-9,
        "MaxWalkSAT cost {} must equal exhaustive optimum {}",
        breed_cost,
        optimum
    );

    // Bit-identical double run.
    assert_eq!(
        serde_json::to_string(&out1).unwrap(),
        serde_json::to_string(&out2).unwrap(),
        "seeded MaxWalkSAT must be bit-identical across runs"
    );
}

/// Hidden-MLN-2: evidence clamping changes the optimum (the clamped optimum
/// differs from the free optimum), hand-derived.
#[test]
fn markov_logic_hidden_evidence_clamp_changes_optimum() {
    let mut input = base("clamped MLN");
    input.facts = vec![
        // free optimum: flim=true satisfies both → cost 0
        fact("mln:clause:e1", "3.0|flim"),
        fact("mln:clause:e2", "1.5|flim,blee"),
        fact("evidence:flim", "false"),
    ];
    let out = dispatch_breed_test("markov_logic", &input).expect("run ok");
    // flim clamped false: e1 (weight 3.0) is unsatisfiable; e2 satisfied via blee.
    let cost = out.facts.iter().find(|f| f.key == "mln:cost").unwrap();
    assert_eq!(cost.value, "3.000000");
    let blee = out.facts.iter().find(|f| f.key == "mln:atom:blee").unwrap();
    assert_eq!(blee.value, "true");
}

// ===========================================================================
// POMDP hidden challenge tests
// ===========================================================================

fn tiger_input(steps: &[&str]) -> BreedInput {
    let mut input = base("tiger");
    let mut f = vec![
        fact("pomdp:states", "tiger-left,tiger-right"),
        fact("pomdp:actions", "listen,open-left,open-right"),
        fact("pomdp:observations", "hear-left,hear-right"),
        fact("pomdp:gamma", "0.95"),
        fact("pomdp:horizon", "3"),
        fact("pomdp:b0:tiger-left", "0.5"),
        fact("pomdp:b0:tiger-right", "0.5"),
        fact("pomdp:o:listen:tiger-left:hear-left", "0.85"),
        fact("pomdp:o:listen:tiger-left:hear-right", "0.15"),
        fact("pomdp:o:listen:tiger-right:hear-left", "0.15"),
        fact("pomdp:o:listen:tiger-right:hear-right", "0.85"),
    ];
    for s in ["tiger-left", "tiger-right"] {
        for sp in ["tiger-left", "tiger-right"] {
            f.push(fact(
                &format!("pomdp:t:listen:{}:{}", s, sp),
                if s == sp { "1.0" } else { "0.0" },
            ));
        }
        f.push(fact(&format!("pomdp:r:listen:{}", s), "-1.0"));
    }
    for a in ["open-left", "open-right"] {
        for s in ["tiger-left", "tiger-right"] {
            for sp in ["tiger-left", "tiger-right"] {
                f.push(fact(&format!("pomdp:t:{}:{}:{}", a, s, sp), "0.5"));
            }
            for ob in ["hear-left", "hear-right"] {
                f.push(fact(&format!("pomdp:o:{}:{}:{}", a, s, ob), "0.5"));
            }
        }
    }
    f.push(fact("pomdp:r:open-left:tiger-left", "-100.0"));
    f.push(fact("pomdp:r:open-left:tiger-right", "10.0"));
    f.push(fact("pomdp:r:open-right:tiger-left", "10.0"));
    f.push(fact("pomdp:r:open-right:tiger-right", "-100.0"));
    for (i, s) in steps.iter().enumerate() {
        f.push(fact(&format!("pomdp:step:{}", i), s));
    }
    input.facts = f;
    input
}

/// Hidden-POMDP-1: tiger posterior after one hear-left is EXACTLY 0.85
/// (0.85·0.5 / (0.85·0.5 + 0.15·0.5)); after two hear-left it is
/// 289/298 = 0.969799 to 6 dp (hand-derived Bayes arithmetic; the plan's
/// 0.969697 figure is a transcription slip — see the breed doc card).
#[test]
fn pomdp_hidden_tiger_posteriors_exact() {
    let out1 = dispatch_breed_test("pomdp", &tiger_input(&["listen|hear-left"])).expect("run 1");
    assert!(!out1.inference_trace.is_empty(), "A3: non-empty trace required");
    let b1 = out1.facts.iter().find(|f| f.key == "pomdp:belief:tiger-left").unwrap();
    assert_eq!(b1.value, "0.850000");

    let out2 = dispatch_breed_test(
        "pomdp",
        &tiger_input(&["listen|hear-left", "listen|hear-left"]),
    )
    .expect("run 2");
    let b2 = out2.facts.iter().find(|f| f.key == "pomdp:belief:tiger-left").unwrap();
    // 0.85²/(0.85²+0.15²) = 0.7225/0.745 = 0.96979865… → 0.969799 at 6 dp.
    let v: f64 = b2.value.parse().unwrap();
    assert!((v - 289.0 / 298.0).abs() < 1e-6, "got {}", v);
    assert_eq!(b2.value, "0.969799");
}

/// Hidden-POMDP-2: tampering with the O matrix must shift the posterior —
/// a memoized stub returning 0.85 regardless of the model is defeated.
#[test]
fn pomdp_hidden_tampered_o_matrix_shifts_posterior() {
    let mut input = tiger_input(&["listen|hear-left"]);
    for f in input.facts.iter_mut() {
        if f.key == "pomdp:o:listen:tiger-left:hear-left" {
            f.value = "0.6".into();
        }
        if f.key == "pomdp:o:listen:tiger-left:hear-right" {
            f.value = "0.4".into();
        }
    }
    let out = dispatch_breed_test("pomdp", &input).expect("run ok");
    let b = out.facts.iter().find(|f| f.key == "pomdp:belief:tiger-left").unwrap();
    // 0.6·0.5 / (0.6·0.5 + 0.15·0.5) = 0.8 — must differ from 0.85.
    assert_eq!(b.value, "0.800000");
}

// ===========================================================================
// CONTINGENT-PLANNING hidden challenge tests
// ===========================================================================

/// Test-local plan-tree replayer: parses the serialized s-expression and
/// executes it against a single concrete world.
mod cp_replay {
    use std::collections::BTreeMap;

    #[derive(Debug)]
    pub enum Node {
        Done,
        Act(String, Box<Node>),
        Sense(String, String, Box<Node>, Box<Node>),
    }

    pub fn parse(s: &str) -> (Node, &str) {
        let s = s.trim_start();
        let s = s.strip_prefix('(').expect("expected '('");
        if let Some(rest) = s.strip_prefix("done") {
            return (Node::Done, rest.trim_start().strip_prefix(')').unwrap());
        }
        if let Some(rest) = s.strip_prefix("act ") {
            let (name, rest) = rest.split_once(' ').unwrap();
            let (sub, rest) = parse(rest);
            return (
                Node::Act(name.to_string(), Box::new(sub)),
                rest.trim_start().strip_prefix(')').unwrap(),
            );
        }
        if let Some(rest) = s.strip_prefix("sense ") {
            let (name, rest) = rest.split_once(' ').unwrap();
            let (atom, rest) = rest.split_once(' ').unwrap();
            let (then_n, rest) = parse(rest);
            let (else_n, rest) = parse(rest);
            return (
                Node::Sense(
                    name.to_string(),
                    atom.to_string(),
                    Box::new(then_n),
                    Box::new(else_n),
                ),
                rest.trim_start().strip_prefix(')').unwrap(),
            );
        }
        panic!("bad plan node: {}", s);
    }

    pub type World = BTreeMap<String, bool>;
    pub type Action = (Vec<(String, bool)>, Vec<String>, Vec<String>); // pre/add/del

    pub fn replay(node: &Node, world: &mut World, actions: &BTreeMap<String, Action>) {
        match node {
            Node::Done => {}
            Node::Act(name, sub) => {
                let (pre, add, del) = actions.get(name).expect("unknown action in plan");
                for (a, v) in pre {
                    assert_eq!(
                        world.get(a).copied().unwrap_or(false),
                        *v,
                        "precondition of '{}' violated during replay",
                        name
                    );
                }
                for d in del {
                    world.insert(d.clone(), false);
                }
                for a in add {
                    world.insert(a.clone(), true);
                }
                replay(sub, world, actions);
            }
            Node::Sense(_, atom, then_n, else_n) => {
                if world.get(atom).copied().unwrap_or(false) {
                    replay(then_n, world, actions);
                } else {
                    replay(else_n, world, actions);
                }
            }
        }
    }
}

/// Hidden-CP-1: the vacuum plan must contain EXACTLY ONE Sense node, and the
/// test REPLAYS the serialized tree against EACH possible initial world,
/// asserting goal satisfaction in all of them.
#[test]
fn contingent_plan_hidden_replay_against_all_worlds() {
    use std::collections::BTreeMap;

    let mut input = base("vacuum");
    input.facts = vec![
        fact("cp:unknown", "dirt"),
        fact("cp:goal:dirt", "false"),
        fact("cp:act:suck:pre", "dirt"),
        fact("cp:act:suck:del", "dirt"),
        fact("cp:sense:check-dirt", "dirt"),
    ];
    let out = dispatch_breed_test("contingent_plan", &input).expect("must plan");
    assert!(!out.inference_trace.is_empty(), "A3: non-empty trace required");
    let tree = out.facts.iter().find(|f| f.key == "plan:tree").unwrap();
    assert_eq!(tree.value.matches("(sense ").count(), 1, "exactly one Sense node");

    let (plan, rest) = cp_replay::parse(&tree.value);
    assert!(rest.trim().is_empty(), "trailing garbage in plan tree");

    let mut actions: BTreeMap<String, cp_replay::Action> = BTreeMap::new();
    actions.insert(
        "suck".to_string(),
        (vec![("dirt".to_string(), true)], vec![], vec!["dirt".to_string()]),
    );

    // Replay against EACH initial world: dirt=true and dirt=false.
    for dirt in [true, false] {
        let mut world: cp_replay::World = BTreeMap::new();
        world.insert("dirt".to_string(), dirt);
        cp_replay::replay(&plan, &mut world, &actions);
        assert_eq!(
            world.get("dirt").copied().unwrap_or(false),
            false,
            "goal dirt=false must hold after replay from dirt={}",
            dirt
        );
    }
}

/// Hidden-CP-2: with no sensing action available, the breed must REFUSE
/// rather than emit a linear plan valid in only some worlds.
#[test]
fn contingent_plan_hidden_no_sensing_refuses() {
    let mut input = base("vacuum without sensor");
    input.facts = vec![
        fact("cp:unknown", "dirt"),
        fact("cp:goal:dirt", "false"),
        fact("cp:act:suck:pre", "dirt"),
        fact("cp:act:suck:del", "dirt"),
    ];
    assert!(dispatch_breed_test("contingent_plan", &input).is_err());
}

// ===========================================================================
// META-REASONING hidden challenge tests
// ===========================================================================

/// Hidden-META-1: an injected mycin-vs-prolog contradiction must produce a
/// conflict-detected step NAMING BOTH breeds.
#[test]
fn meta_reasoning_hidden_mycin_vs_prolog_conflict_named() {
    let mut input = base("arbitrate");
    input.facts = vec![
        fact("breed:mycin:conclusion", "therapy=gentamicin"),
        fact("breed:mycin:confidence", "0.8"),
        fact("breed:prolog:conclusion", "therapy=none"),
        fact("breed:prolog:confidence", "0.6"),
    ];
    let out = dispatch_breed_test("meta_reasoning", &input).expect("must arbitrate");
    assert!(!out.inference_trace.is_empty(), "A3: non-empty trace required");
    let conflict = out
        .inference_trace
        .iter()
        .find(|t| t.kind == "conflict-detected")
        .expect("conflict-detected step required");
    assert!(
        conflict.detail.contains("mycin") && conflict.detail.contains("prolog"),
        "conflict step must name both breeds: {}",
        conflict.detail
    );
    assert_eq!(out.selected.as_deref(), Some("therapy=gentamicin"));
}

/// Hidden-META-2 (negative control): identical conclusions with close
/// confidences must produce ZERO conflict steps.
#[test]
fn meta_reasoning_hidden_identical_conclusions_zero_conflicts() {
    let mut input = base("agreement");
    input.facts = vec![
        fact("breed:mycin:conclusion", "therapy=gentamicin"),
        fact("breed:mycin:confidence", "0.8"),
        fact("breed:prolog:conclusion", "therapy=gentamicin"),
        fact("breed:prolog:confidence", "0.7"),
    ];
    let out = dispatch_breed_test("meta_reasoning", &input).expect("must arbitrate");
    assert_eq!(
        out.inference_trace.iter().filter(|t| t.kind == "conflict-detected").count(),
        0,
        "identical conclusions must not be flagged"
    );
    let c = out.facts.iter().find(|f| f.key == "meta:conflicts").unwrap();
    assert_eq!(c.value, "0");
}
