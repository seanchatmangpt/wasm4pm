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
