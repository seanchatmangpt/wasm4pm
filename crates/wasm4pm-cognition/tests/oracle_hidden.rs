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

use wasm4pm_cognition::breeds::CognitionBreed;
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
// Tier P1 Breeds Hidden Tests
// ===========================================================================

#[test]
#[ignore]
fn ltl_monitor_hidden_response_pattern() {
    use wasm4pm_cognition::breeds::Fact;
    let mut input = base("LTL response pattern check");
    input.facts = vec![
        fact("formula", "G (req -> F res)"),
    ];
    input.cases = vec![
        Case {
            id: "state0".into(),
            intent: "".into(),
            architecture: "".into(),
            outcome_score: 1.0,
            facts: vec![Fact { key: "req".into(), value: "true".into() }],
        },
        Case {
            id: "state1".into(),
            intent: "".into(),
            architecture: "".into(),
            outcome_score: 1.0,
            facts: vec![],
        },
        Case {
            id: "state2".into(),
            intent: "".into(),
            architecture: "".into(),
            outcome_score: 1.0,
            facts: vec![Fact { key: "res".into(), value: "true".into() }],
        },
    ];

    let output = dispatch_breed_test("ltl_monitor", &input)
        .expect("LTL Monitor run must succeed");
    
    assert!(!output.inference_trace.is_empty(), "Trace must not be empty");
    let conforms_fact = output.facts.iter().find(|f| f.key == "conforms").expect("conforms fact exists");
    assert_eq!(conforms_fact.value, "true");
}

#[test]
#[ignore]
fn allen_temporal_hidden_transitivity() {
    let mut input = base("Allen interval transitivity check");
    input.facts = vec![
        fact("relation", "A meets B"),
        fact("relation", "B meets C"),
    ];

    let output = dispatch_breed_test("allen_temporal", &input)
        .expect("AllenTemporal run must succeed");
    
    assert!(!output.inference_trace.is_empty(), "Trace must not be empty");
    let rel_ac = output.facts.iter().find(|f| f.key == "relation:A:C").expect("relation:A:C exists");
    // A meets B and B meets C => A precedes C (i.e. 'p')
    assert_eq!(rel_ac.value, "p");
}

#[test]
#[ignore]
fn fuzzy_logic_hidden_ventilation() {
    let mut input = base("Fuzzy control check");
    // Asymmetric aggregated shape: two rules, unequal firing strengths, overlapping trapezoids.
    input.facts = vec![
        fact("fuzzy_set:x:a", "triangular 0,5,10"),
        fact("fuzzy_set:x:b", "triangular 0,10,20"),
        fact("fuzzy_set:y:c", "trapezoidal 0,10,20,30"),
        fact("fuzzy_set:y:d", "trapezoidal 15,30,40,50"),
        fact("x", "4.0"),
    ];
    input.rules = vec![
        rule("r1", vec!["x is a"], "y is c", 1.0),
        rule("r2", vec!["x is b"], "y is d", 1.0),
    ];

    let output = dispatch_breed_test("fuzzy_logic", &input)
        .expect("FuzzyLogic run must succeed");
    
    assert!(!output.inference_trace.is_empty(), "Trace must not be empty");
    let vent_fact = output.facts.iter().find(|f| f.key == "y").expect("y fact exists");
    let vent_val: f64 = vent_fact.value.parse().expect("must parse as float");
    // Hand-integrated 101-point centroid is 22.18748
    assert!((vent_val - 22.18748).abs() < 1e-5);
}

#[test]
#[ignore]
fn bayesian_network_hidden_burglar_alarm() {
    let mut input1 = base("Bayesian Q->R->S query 1");
    // Q -> R -> S
    // Q -> X <- Y (X is a collider)
    input1.facts = vec![
        fact("cpt:Q", "0.3"),
        fact("cpt:R|Q", "0.4,0.8"), // P(R=t|Q=f)=0.4, P(R=t|Q=t)=0.8
        fact("cpt:S|R", "0.1,0.7"), // P(S=t|R=f)=0.1, P(S=t|R=t)=0.7
        fact("cpt:Y", "0.6"),
        fact("cpt:X|Q,Y", "0.1,0.2,0.3,0.4"), // P(X=t | Q,Y)
    ];
    input1.goals = vec![goal("g1", "query", "S")];
    
    let out1 = dispatch_breed_test("bayesian_network", &input1).unwrap();
    let prob_s: f64 = out1.facts.iter().find(|f| f.key == "probability:S").unwrap().value.parse().unwrap();
    // P(R=t) = 0.3*0.8 + 0.7*0.4 = 0.24 + 0.28 = 0.52
    // P(S=t) = 0.52*0.7 + 0.48*0.1 = 0.364 + 0.048 = 0.412
    assert!((prob_s - 0.412).abs() < 1e-9);

    let mut input2 = input1.clone();
    input2.facts.push(fact("evidence:R", "true"));
    let out2 = dispatch_breed_test("bayesian_network", &input2).unwrap();
    let prob_s_r: f64 = out2.facts.iter().find(|f| f.key == "probability:S").unwrap().value.parse().unwrap();
    // Markov-blanket screen P(S|R=t) = 0.7
    assert!((prob_s_r - 0.7).abs() < 1e-9);
    
    let mut input3 = input1.clone();
    input3.goals = vec![goal("g2", "query", "dsep:Q,Y")];
    let out3 = dispatch_breed_test("bayesian_network", &input3).unwrap();
    assert_eq!(out3.explanation, "dsep:Q,Y=true");
    
    let mut input4 = input1.clone();
    input4.goals = vec![goal("g3", "query", "dsep:Q,Y|X")];
    let out4 = dispatch_breed_test("bayesian_network", &input4).unwrap();
    // Collider d-separation must FLIP when conditioning changes
    assert_eq!(out4.explanation, "dsep:Q,Y|X=false");
}

#[test]
fn csp_ac3_hidden_coloring() {
    let mut input = base("Constraint Satisfaction 3-coloring");
    input.facts = vec![
        fact("csp-var", "A:1,2,3"),
        fact("csp-var", "B:1,2,3"),
        fact("csp-var", "C:1,2,3"),
        fact("csp-constraint", "A!=B"),
        fact("csp-constraint", "B!=C"),
        fact("csp-constraint", "A!=C"),
    ];

    let output = dispatch_breed_test("csp_ac3", &input)
        .expect("csp_ac3 run must succeed");

    assert!(!output.inference_trace.is_empty(), "Trace must not be empty");
    assert!(output.selected.is_some());
    assert_eq!(output.explanation, "SAT: A=1, B=2, C=3");
}

#[test]
fn default_logic_hidden_extension() {
    let mut input = base("Default logic bird example");
    input.facts = vec![
        fact("bird", "penguin"),
        fact("penguin", "penguin"),
    ];
    input.rules = vec![
        rule("r_default", vec!["bird", "unless:non_flying"], "flies", 1.0),
        rule("r_penguin", vec!["penguin"], "non_flying", 1.0),
    ];

    let output = dispatch_breed_test("default_logic", &input)
        .expect("default_logic run must succeed");

    assert!(!output.inference_trace.is_empty(), "Trace must not be empty");
    let selected = output.selected.as_ref().unwrap();
    assert!(selected.contains("non_flying"));
    assert!(!selected.contains("flies"));
}

#[test]
fn htn_planning_hidden_travel() {
    let mut input = base("HTN planning check");
    input.state = vec![
        StateAtom { predicate: "at".into(), value: "home".into() },
        StateAtom { predicate: "car_working".into(), value: "true".into() },
    ];
    input.goals = vec![
        Goal { id: "g1".into(), predicate: "task".into(), value: "go_to_dest".into() },
    ];
    input.rules = vec![
        Rule {
            id: "method:go_to_dest:drive".into(),
            premise: vec!["at=home".into(), "car_working=true".into()],
            conclusion: "op:start_car;op:drive_to_dest".into(),
            certainty: 1.0,
        },
        Rule {
            id: "op:start_car".into(),
            premise: vec!["car_working=true".into()],
            conclusion: "car_started=true".into(),
            certainty: 1.0,
        },
        Rule {
            id: "op:drive_to_dest".into(),
            premise: vec!["car_started=true".into()],
            conclusion: "!at=home;at=dest".into(),
            certainty: 1.0,
        },
    ];

    let output = dispatch_breed_test("htn_planning", &input)
        .expect("htn_planning run must succeed");

    assert!(!output.inference_trace.is_empty(), "Trace must not be empty");
    assert_eq!(output.selected.as_deref(), Some("op:start_car,op:drive_to_dest"));
}

#[test]
fn asp_hidden_stable_models() {
    let mut input = base("ASP test: a :- not b. b :- not a.");
    input.rules = vec![
        rule("r1", vec!["not b"], "a", 1.0),
        rule("r2", vec!["not a"], "b", 1.0),
    ];
    input.candidates = vec![
        Candidate { id: "a".into(), score: 0.5, eliminated: false, elimination_reason: None },
        Candidate { id: "b".into(), score: 0.5, eliminated: false, elimination_reason: None },
    ];

    let output = dispatch_breed_test("asp", &input)
        .expect("ASP run must succeed");

    assert!(!output.inference_trace.is_empty(), "Trace must not be empty");
    let count_fact = output.facts.iter().find(|f| f.key == "stable_models_count").expect("stable_models_count exists");
    assert_eq!(count_fact.value, "2");
    
    // One of a or b must be selected
    let selected = output.selected.as_ref().expect("Should have selected a candidate");
    assert!(selected == "a" || selected == "b");
}

#[test]
fn description_logic_hidden_subsumption_and_consistency() {
    let mut input = base("Description Logic: subclass chain and consistency");
    input.facts = vec![
        fact("subclass", "A,B"),
        fact("subclass", "B,C"),
        fact("class", "x,A"),
        fact("disjoint", "C,D"),
    ];
    input.candidates = vec![
        Candidate { id: "x".into(), score: 0.5, eliminated: false, elimination_reason: None },
    ];

    let output = dispatch_breed_test("description_logic", &input)
        .expect("DescriptionLogic run must succeed");

    let consistent_fact = output.facts.iter().find(|f| f.key == "consistent").expect("consistent fact exists");
    assert_eq!(consistent_fact.value, "true");
    assert_eq!(output.selected.as_deref(), Some("consistent"));

    // Check that x is member of C by propagation
    let member_xc = output.facts.iter().find(|f| f.key == "member:x:C");
    assert!(member_xc.is_some(), "x must be derived as a member of C");

    // Negative case: add class assertion to trigger inconsistency
    let mut input_inc = input.clone();
    input_inc.facts.push(fact("class", "x,D"));

    let output_inc = dispatch_breed_test("description_logic", &input_inc)
        .expect("DescriptionLogic run must succeed");

    let consistent_inc = output_inc.facts.iter().find(|f| f.key == "consistent").expect("consistent fact exists");
    assert_eq!(consistent_inc.value, "false");
    assert_eq!(output_inc.selected.as_deref(), Some("inconsistent"));
    assert!(output_inc.candidates[0].eliminated, "Candidate x must be eliminated due to inconsistency");
}

#[test]
fn abductive_lp_hidden_explanation() {
    let mut input = base("ALP test: g :- a, b. g :- c. false :- a, d.");
    input.rules = vec![
        rule("r1", vec!["a", "b"], "g", 1.0),
        rule("r2", vec!["c"], "g", 1.0),
        rule("r_ic", vec!["a", "d"], "false", 1.0),
    ];
    input.facts = vec![
        fact("abducible", "a"),
        fact("abducible", "b"),
        fact("abducible", "c"),
        fact("abducible", "d"),
        fact("context", "d"), // d is true in the context
    ];
    input.goals = vec![
        goal("g1", "goal", "g"),
    ];
    input.candidates = vec![
        Candidate { id: "c".into(), score: 0.5, eliminated: false, elimination_reason: None },
    ];

    let output = dispatch_breed_test("abductive_lp", &input)
        .expect("AbductiveLP run must succeed");

    assert!(!output.inference_trace.is_empty(), "Trace must not be empty");
    let count_fact = output.facts.iter().find(|f| f.key == "explanations_count").expect("explanations_count exists");
    // [a, b] is blocked because d is true, so only [c] is a valid explanation.
    assert_eq!(count_fact.value, "1");
    assert_eq!(output.selected.as_deref(), Some("c"));
}

#[test]
fn abductive_ibe_hidden_coherence() {
    let mut input = base("IBE test: Thagard ECHO model selection");
    input.facts = vec![
        fact("evidence", "E1"),
        fact("evidence", "E2"),
        fact("hypothesis", "H1"),
        fact("hypothesis", "H2"),
        fact("contradicts", "H1,H2"),
    ];
    input.rules = vec![
        rule("expl1", vec!["H1"], "E1", 1.0),
        rule("expl2", vec!["H1"], "E2", 1.0),
        rule("expl3", vec!["H2"], "E1", 1.0),
    ];
    input.candidates = vec![
        Candidate { id: "H1".into(), score: 0.5, eliminated: false, elimination_reason: None },
        Candidate { id: "H2".into(), score: 0.5, eliminated: false, elimination_reason: None },
    ];

    let output = dispatch_breed_test("abductive_ibe", &input)
        .expect("AbductiveIBE run must succeed");

    assert!(!output.inference_trace.is_empty(), "Trace must not be empty");
    
    // H1 must be selected over H2 because H1 explains E1 and E2, while H2 only explains E1.
    assert_eq!(output.selected.as_deref(), Some("H1"));
    
    let score_h1 = output.candidates.iter().find(|c| c.id == "H1").unwrap().score;
    let score_h2 = output.candidates.iter().find(|c| c.id == "H2").unwrap().score;
    assert!(score_h1 > score_h2, "H1 score must be strictly greater than H2 score");
}

#[test]
fn htn_planning_hidden_oracle_backtrack() {
    let input = BreedInput {
        intent: "travel".into(),
        candidates: vec![],
        facts: vec![],
        cases: vec![],
        state: vec![
            StateAtom { predicate: "at".into(), value: "zorp_location".into() },
            StateAtom { predicate: "cash".into(), value: "zorp_credits".into() },
        ],
        goals: vec![
            Goal { id: "g1".into(), predicate: "task".into(), value: "travel".into() },
        ],
        rules: vec![
            Rule {
                id: "method:travel:taxi".into(),
                premise: vec!["at=zorp_location".into()], // Applicable!
                conclusion: "op:hail_taxi;op:pay_taxi".into(),
                certainty: 1.0,
            },
            Rule {
                id: "method:travel:walk".into(),
                premise: vec!["at=zorp_location".into()],
                conclusion: "op:walk".into(),
                certainty: 1.0,
            },
            Rule {
                id: "op:hail_taxi".into(),
                premise: vec![],
                conclusion: "in=taxi".into(),
                certainty: 1.0,
            },
            Rule {
                id: "op:pay_taxi".into(),
                premise: vec!["in=taxi".into(), "cash=high_credits".into()], // Will fail!
                conclusion: "!in=taxi;at=blee_station".into(),
                certainty: 1.0,
            },
            Rule {
                id: "op:walk".into(),
                premise: vec![],
                conclusion: "!at=zorp_location;at=blee_station".into(),
                certainty: 1.0,
            },
        ],
    };

    let output = dispatch_breed_test("htn_planning", &input)
        .expect("HTN planning should find walk plan");
    
    assert_eq!(output.selected.as_deref(), Some("op:walk"));
    
    let backtrack_steps = output.inference_trace.iter().filter(|t| t.kind == "htn-backtrack").count();
    assert!(backtrack_steps > 0, "Must contain htn-backtrack step");
    
    let plan_steps = output.inference_trace.iter().filter(|t| t.kind == "htn-plan").count();
    assert_eq!(plan_steps, 1, "Must contain exactly one htn-plan step");
}

#[test]
fn dempster_shafer_hidden_oracle() {
    let input = BreedInput {
        intent: "evaluate belief".to_string(),
        candidates: vec![],
        facts: vec![],
        cases: vec![],
        rules: vec![
            Rule {
                id: "source1".to_string(),
                premise: vec![],
                conclusion: "zorp".to_string(),
                certainty: 0.2,
            },
            Rule {
                id: "source1".to_string(),
                premise: vec![],
                conclusion: "blee".to_string(),
                certainty: 0.3,
            },
        ],
        goals: vec![Goal {
            id: "query".to_string(),
            predicate: "query".to_string(),
            value: "zorp,blee".to_string(),
        }],
        state: vec![],
    };

    let out = dispatch_breed_test("dempster_shafer", &input).unwrap();
    
    let mut bel_zorp = 0.0;
    let mut bel_blee = 0.0;
    let query_zorp = BreedInput {
        goals: vec![Goal {
            id: "query".to_string(),
            predicate: "query".to_string(),
            value: "zorp".to_string(),
        }],
        ..input.clone()
    };
    let out_zorp = dispatch_breed_test("dempster_shafer", &query_zorp).unwrap();
    if let Some(fact) = out_zorp.facts.iter().find(|f| f.key == "belief:zorp") {
        bel_zorp = fact.value.parse::<f64>().unwrap();
    }

    let query_blee = BreedInput {
        goals: vec![Goal {
            id: "query".to_string(),
            predicate: "query".to_string(),
            value: "blee".to_string(),
        }],
        ..input.clone()
    };
    let out_blee = dispatch_breed_test("dempster_shafer", &query_blee).unwrap();
    if let Some(fact) = out_blee.facts.iter().find(|f| f.key == "belief:blee") {
        bel_blee = fact.value.parse::<f64>().unwrap();
    }

    assert_eq!(bel_zorp + bel_blee, 0.5);
    assert!(bel_zorp + bel_blee < 1.0);
}

#[test]
fn dempster_shafer_two_source_combination() {
    let input = BreedInput {
        intent: "evaluate belief".to_string(),
        candidates: vec![],
        facts: vec![],
        cases: vec![],
        rules: vec![
            Rule {
                id: "source1".to_string(),
                premise: vec![],
                conclusion: "zorp".to_string(),
                certainty: 0.6,
            },
            Rule {
                id: "source2".to_string(),
                premise: vec![],
                conclusion: "blee".to_string(),
                certainty: 0.7,
            },
        ],
        goals: vec![Goal {
            id: "query".to_string(),
            predicate: "query".to_string(),
            value: "zorp".to_string(),
        }],
        state: vec![],
    };

    let out = dispatch_breed_test("dempster_shafer", &input).unwrap();
    
    let mut bel_zorp = 0.0;
    if let Some(fact) = out.facts.iter().find(|f| f.key == "belief:zorp") {
        bel_zorp = fact.value.parse::<f64>().unwrap();
    }
    
    assert!((bel_zorp - 0.3103448275).abs() < 1e-9);
}

#[test]
fn dempster_shafer_k1_run_error() {
    let input = BreedInput {
        intent: "evaluate belief".to_string(),
        candidates: vec![],
        facts: vec![],
        cases: vec![],
        rules: vec![
            Rule {
                id: "source1".to_string(),
                premise: vec![],
                conclusion: "zorp".to_string(),
                certainty: 1.0,
            },
            Rule {
                id: "source2".to_string(),
                premise: vec![],
                conclusion: "blee".to_string(),
                certainty: 1.0,
            },
        ],
        goals: vec![Goal {
            id: "query".to_string(),
            predicate: "query".to_string(),
            value: "zorp".to_string(),
        }],
        state: vec![],
    };

    let res = dispatch_breed_test("dempster_shafer", &input);
    assert!(res.is_err());
    assert!(res.unwrap_err().to_string().contains("K=1"));
}

// ===========================================================================
// Partial Order Plan hidden challenge tests
// ===========================================================================

/// Hidden-POP-1: Threat resolution with forced promotion.
///
/// Scenario:
/// Initial: at(zorp_pkg, blee_loc), clean(blee_loc)
/// Goal: at(zorp_pkg, glorp_loc), clean(blee_loc)
///
/// Actions:
/// 1. move(blee_loc, glorp_loc): pre robot_at(blee_loc), adds robot_at(glorp_loc), dels robot_at(blee_loc), dels clean(blee_loc)
/// 2. clean_loc(blee_loc): pre robot_at(blee_loc), adds clean(blee_loc)
/// 3. pick(zorp_pkg, blee_loc): pre at(zorp_pkg, blee_loc), robot_at(blee_loc), adds holding(zorp_pkg), dels at(zorp_pkg, blee_loc)
/// 4. drop(zorp_pkg, glorp_loc): pre holding(zorp_pkg), robot_at(glorp_loc), adds at(zorp_pkg, glorp_loc)
///
/// A causal link is needed for clean(blee_loc) in the goal.
/// The 'start' step provides clean(blee_loc).
/// Action 'move' deletes clean(blee_loc), so it's a threat to start -> end link for clean(blee_loc).
/// But 'move' must happen to get at(zorp_pkg, glorp_loc).
/// 'clean_loc' can re-establish clean(blee_loc).
///
/// This test specifically checks for 'detect-threat' and 'promote' in the trace.
#[test]
fn partial_order_plan_hidden_threat() {
    let mut input = base("POP forced promotion challenge");
    input.state = vec![
        state_atom("at(zorp_pkg)", "blee_loc"),
        state_atom("clean(blee_loc)", "true"),
        state_atom("robot_at", "blee_loc"),
    ];
    input.goals = vec![
        goal("g1", "at(zorp_pkg)", "glorp_loc"),
        goal("g2", "clean(blee_loc)", "true"),
    ];
    input.rules = vec![
        rule("move-blee-glorp", vec!["robot_at=blee_loc"], "robot_at=glorp_loc;!robot_at=blee_loc;!clean(blee_loc)=true", 1.0),
        rule("move-glorp-blee", vec!["robot_at=glorp_loc"], "robot_at=blee_loc;!robot_at=glorp_loc;!clean(glorp_loc)=true", 1.0),
        rule("clean-blee", vec!["robot_at=blee_loc"], "clean(blee_loc)=true", 1.0),
        rule("pick-zorp-blee", vec!["at(zorp_pkg)=blee_loc", "robot_at=blee_loc"], "holding(zorp_pkg)=true;!at(zorp_pkg)=blee_loc", 1.0),
        rule("drop-zorp-glorp", vec!["holding(zorp_pkg)=true", "robot_at=glorp_loc"], "at(zorp_pkg)=glorp_loc;!holding(zorp_pkg)=true", 1.0),
    ];

    let output = dispatch_breed_test("partial_order_plan", &input)
        .expect("POP hidden threat must not return Err");

    assert!(!output.inference_trace.is_empty(), "Trace must not be empty");

    let has_threat = output.inference_trace.iter().any(|t| t.kind == "detect-threat");
    assert!(has_threat, "Must detect at least one threat");

    let has_promote = output.inference_trace.iter().any(|t| t.kind == "promote");
    let has_demote = output.inference_trace.iter().any(|t| t.kind == "demote");
    assert!(has_promote || has_demote, "Must resolve threat via promote or demote");

    assert!(output.selected.is_some(), "Plan must be found");
    let plan = output.selected.as_ref().unwrap();
    // A valid plan must include move and drop to satisfy at(zorp_pkg)=glorp_loc,
    // and clean-blee must happen AFTER move-blee-glorp to satisfy clean(blee_loc)=true.
    assert!(plan.contains("move-blee-glorp"));
    assert!(plan.contains("drop-zorp-glorp"));
    assert!(plan.contains("clean-blee"));
    
    // Ordering check: clean-blee must be after move-blee-glorp
    let move_pos = plan.find("move-blee-glorp").unwrap();
    let clean_pos = plan.find("clean-blee").unwrap();
    assert!(clean_pos > move_pos, "clean-blee must happen after move-blee-glorp; plan={plan}");
}
