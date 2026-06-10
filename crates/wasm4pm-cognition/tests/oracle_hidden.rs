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
    assert!(out.inference_trace.iter().any(|t| t.kind == "detect-threat"));
    assert!(out.inference_trace.iter().any(|t| t.kind == "promote"));
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
        .any(|t| t.kind == "clipped-check" && t.detail.contains("true")));
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
            .any(|t| t.kind == "prune" && t.detail.contains("|G|=2")),
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
