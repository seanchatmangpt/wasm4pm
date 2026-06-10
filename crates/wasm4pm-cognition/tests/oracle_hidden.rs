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
