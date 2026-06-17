//! [`BreedOracle`] implementations for the rule/fact reasoning breeds:
//! Mycin, Prolog, FuzzyLogic, DempsterShafer, CspAc3, DefaultLogic,
//! FramesInheritance, Asp, BayesianNetwork, Mdp.
//!
//! All novel content uses fresh `uo_*` names that appear in no public fixture
//! (defeats A1/A2). The universal harness routes inputs through
//! `dispatch_breed_test_id` (direct `CognitionBreed::run`, no OCEL gate), so
//! every `novel_input()` here is also verified to satisfy the breed's own
//! `preconditions` and `postconditions`.

use crate::breeds::asp::Asp;
use crate::breeds::bayesian_network::BayesianNetwork;
use crate::breeds::csp_ac3::CspAc3;
use crate::breeds::default_logic::DefaultLogic;
use crate::breeds::dempster_shafer::DempsterShafer;
use crate::breeds::frames_inheritance::FramesInheritance;
use crate::breeds::fuzzy_logic::FuzzyLogic;
use crate::breeds::mdp::Mdp;
use crate::breeds::production_rules::Mycin;
use crate::breeds::prolog::Prolog;
use crate::breeds::support::oracle::{BreedAdversary, BreedOracle};
use crate::breeds::support::trace_query::TraceQuery;
use crate::breeds::{BreedId, BreedInput, BreedOutput, TraceStep};

use super::{base, fact, goal, rule};

// ---------------------------------------------------------------------------
// Mycin — forward chaining with certainty factors
// ---------------------------------------------------------------------------

impl BreedOracle for Mycin {
    fn breed_id() -> BreedId {
        BreedId::Mycin
    }

    /// One fact (`uo_skin=uo_vrang`, CF 1.0) and one rule firing on it.
    fn novel_input() -> BreedInput {
        let mut input = base("uo_mycin diagnose");
        input.facts = vec![fact("uo_skin", "uo_vrang")];
        input.rules = vec![rule(
            "uo_r1",
            &["uo_skin=uo_vrang"],
            "uo_diag=uo_plomb",
            0.8,
        )];
        input
    }

    /// Chained rule: r1 certainty 0.7 propagates past the 0.2 CF threshold and
    /// fires r2; certainty 0.15 does not (r2's conclusion fact absent).
    fn boundary_pair() -> (BreedInput, BreedInput) {
        let mk = |c1: f32| {
            let mut input = base("uo_mycin diagnose");
            input.facts = vec![fact("uo_skin", "uo_vrang")];
            input.rules = vec![
                rule("uo_r1", &["uo_skin=uo_vrang"], "uo_diag=uo_plomb", c1),
                rule("uo_r2", &["uo_diag=uo_plomb"], "uo_sev=uo_hox", 0.9),
            ];
            input
        };
        (mk(0.7), mk(0.15))
    }

    /// Empty rules vec violates "MYCIN requires at least one rule".
    /// NOTE: Mycin::run() itself never returns Err — this refusal is enforced
    /// by `preconditions` (the lifecycle dispatch path).
    fn refusal_input() -> BreedInput {
        let mut input = base("uo_mycin diagnose");
        input.facts = vec![fact("uo_skin", "uo_vrang")];
        input.rules = vec![];
        input
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_at_least("fire-rule", 1)?;
        Ok(())
    }

    fn assert_trace_values(trace: &TraceQuery<'_>) -> Result<(), String> {
        let detail = trace
            .detail_of("fire-rule")
            .ok_or_else(|| "missing fire-rule step".to_string())?;
        if !detail.contains("uo_r1") || !detail.contains("uo_diag=uo_plomb") {
            return Err(format!(
                "fire-rule detail must record rule uo_r1 concluding uo_diag=uo_plomb, got '{}'",
                detail
            ));
        }
        if !detail.contains("cf=0.800") {
            return Err(format!(
                "fire-rule detail must carry CF 0.800 (1.0 premise × 0.8 rule), got '{}'",
                detail
            ));
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Prolog — forward chaining over ?N-variable rules
// ---------------------------------------------------------------------------

impl BreedOracle for Prolog {
    fn breed_id() -> BreedId {
        BreedId::Prolog
    }

    /// Kernel-path query: flat 1-arity facts and a ground Horn rule, solved
    /// by the Prolog8 kernel (emits the OCEL-required query lifecycle).
    fn novel_input() -> BreedInput {
        let mut input = base("uo_par");
        input.facts = vec![fact("uo_par", "uo_ala")];
        input.rules = vec![rule("uo_r1", &["uo_par"], "uo_damp", 1.0)];
        input.goals = vec![goal("uo_q1", "uo_par", "uo_ala")];
        input
    }

    /// Derivable goal (Allow) vs underivable goal (Deny) — decisions differ.
    fn boundary_pair() -> (BreedInput, BreedInput) {
        let sat = Self::novel_input();
        let mut unsat = Self::novel_input();
        unsat.goals = vec![goal("uo_q1", "uo_par", "uo_zek")];
        (sat, unsat)
    }

    /// Fully empty input (no intent, goals, or rules) — precondition refuses.
    fn refusal_input() -> BreedInput {
        base("")
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_at_least("intern-fact", 1)?;
        trace.require_at_least("load-rule", 1)?;
        trace.require_at_least("kernel-query", 1)?;
        trace.require_at_least("decision", 1)?;
        Ok(())
    }

    fn assert_trace_values(trace: &TraceQuery<'_>) -> Result<(), String> {
        let decision = trace
            .detail_of("decision")
            .ok_or_else(|| "missing decision step".to_string())?;
        if !decision.contains("Allow") {
            return Err(format!(
                "kernel must Allow the uo_par(uo_ala) goal, got '{}'",
                decision
            ));
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// FuzzyLogic — Mamdani inference
// ---------------------------------------------------------------------------

fn fuzzy_input(crisp: &str) -> BreedInput {
    let mut input = base("uo_fuzzy ctrl");
    input.facts = vec![
        fact("fuzzy:uo_heat:uo_low", "tri:0,5,10"),
        fact("fuzzy:uo_heat:uo_high", "tri:5,10,15"),
        fact("fuzzy:uo_vent:uo_slow", "tri:0,2,10"),
        fact("fuzzy:uo_vent:uo_fast", "tri:10,15,20"),
        fact("fuzzy:input:uo_heat", crisp),
    ];
    input.rules = vec![
        rule(
            "uo_fr1",
            &["fuzzy:uo_heat:uo_low"],
            "fuzzy:uo_vent:uo_slow",
            1.0,
        ),
        rule(
            "uo_fr2",
            &["fuzzy:uo_heat:uo_high"],
            "fuzzy:uo_vent:uo_fast",
            1.0,
        ),
    ];
    input
}

impl BreedOracle for FuzzyLogic {
    fn breed_id() -> BreedId {
        BreedId::FuzzyLogic
    }

    /// Crisp uo_heat=4 fuzzifies into uo_low, fires uo_fr1, defuzzifies a
    /// fuzzy:output:uo_vent centroid.
    fn novel_input() -> BreedInput {
        fuzzy_input("4")
    }

    /// Crisp 2 (only uo_low fires, slow centroid) vs crisp 13 (only uo_high
    /// fires, fast centroid) — defuzzified output values differ.
    fn boundary_pair() -> (BreedInput, BreedInput) {
        (fuzzy_input("2"), fuzzy_input("13"))
    }

    /// No fuzzy:input:<var> fact — precondition refuses, and run() refuses
    /// too ("no rule fired").
    fn refusal_input() -> BreedInput {
        let mut input = fuzzy_input("4");
        input.facts.retain(|f| !f.key.starts_with("fuzzy:input:"));
        input
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_at_least("fuzzy-fuzzify", 1)?;
        trace.require_at_least("fuzzy-fire", 1)?;
        trace.require_at_least("fuzzy-aggregate", 1)?;
        trace.require_at_least("fuzzy-defuzz", 1)?;
        Ok(())
    }

    fn assert_trace_values(trace: &TraceQuery<'_>) -> Result<(), String> {
        let defuzz = trace
            .detail_of("fuzzy-defuzz")
            .ok_or_else(|| "missing fuzzy-defuzz step".to_string())?;
        if !defuzz.starts_with("uo_vent = ") {
            return Err(format!(
                "fuzzy-defuzz must report the uo_vent centroid, got '{}'",
                defuzz
            ));
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// DempsterShafer — evidence combination
// ---------------------------------------------------------------------------

impl BreedOracle for DempsterShafer {
    fn breed_id() -> BreedId {
        BreedId::DempsterShafer
    }

    /// Two sources: m1({uo_hyp1})=0.6, m2({uo_hyp1,uo_hyp2})=0.5; query
    /// Bel/Pl of {uo_hyp1}.
    fn novel_input() -> BreedInput {
        let mut input = base("uo_ds evidence");
        input.rules = vec![
            rule("uo_src1", &[], "uo_hyp1", 0.6),
            rule("uo_src2", &[], "uo_hyp1,uo_hyp2", 0.5),
        ];
        input.goals = vec![goal("uo_q1", "query", "uo_hyp1")];
        input
    }

    /// Single source mass 0.9 vs 0.2 on {uo_hyp1} — Bel/Pl values differ.
    fn boundary_pair() -> (BreedInput, BreedInput) {
        let mk = |mass: f32| {
            let mut input = base("uo_ds evidence");
            input.rules = vec![
                rule("uo_src1", &[], "uo_hyp1", mass),
                rule("uo_src2", &[], "uo_hyp2", 0.3),
            ];
            input.goals = vec![goal("uo_q1", "query", "uo_hyp1")];
            input
        };
        (mk(0.9), mk(0.2))
    }

    /// No rules (no BPAs) and no query goal — precondition refuses; run()
    /// also refuses ("missing query goal").
    fn refusal_input() -> BreedInput {
        base("uo_ds evidence")
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_at_least("ds-load-bpa", 1)?;
        trace.require_at_least("ds-combine", 1)?;
        trace.require_at_least("ds-belief", 1)?;
        Ok(())
    }

    fn assert_trace_values(trace: &TraceQuery<'_>) -> Result<(), String> {
        let belief = trace
            .detail_of("ds-belief")
            .ok_or_else(|| "missing ds-belief step".to_string())?;
        if !belief.contains("uo_hyp1") || !belief.contains("Bel=") || !belief.contains("Pl=") {
            return Err(format!(
                "ds-belief detail must report Bel/Pl for uo_hyp1, got '{}'",
                belief
            ));
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// CspAc3 — arc consistency + MAC
// ---------------------------------------------------------------------------

impl BreedOracle for CspAc3 {
    fn breed_id() -> BreedId {
        BreedId::CspAc3
    }

    /// Two 2-value variables with one != constraint — satisfiable.
    fn novel_input() -> BreedInput {
        let mut input = base("uo_csp solve");
        input.facts = vec![
            fact("csp-var", "uo_x:1,2"),
            fact("csp-var", "uo_y:1,2"),
            fact("csp-constraint", "uo_x!=uo_y"),
        ];
        input
    }

    /// Satisfiable (domains {1,2}) vs unsatisfiable (singleton equal domains
    /// under !=) — verdict sat vs unsat.
    fn boundary_pair() -> (BreedInput, BreedInput) {
        let sat = Self::novel_input();
        let mut unsat = base("uo_csp solve");
        unsat.facts = vec![
            fact("csp-var", "uo_x:1"),
            fact("csp-var", "uo_y:1"),
            fact("csp-constraint", "uo_x!=uo_y"),
        ];
        (sat, unsat)
    }

    /// Malformed csp-var (no `name:domain` separator) — precondition refuses;
    /// run() also returns Err("malformed csp-var").
    fn refusal_input() -> BreedInput {
        let mut input = base("uo_csp solve");
        input.facts = vec![fact("csp-var", "uo_broken")];
        input
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_at_least("csp-init", 1)?;
        trace.require_at_least("csp-verdict", 1)?;
        Ok(())
    }

    fn assert_trace_values(trace: &TraceQuery<'_>) -> Result<(), String> {
        let init = trace
            .detail_of("csp-init")
            .ok_or_else(|| "missing csp-init step".to_string())?;
        if !init.contains("vars=2") {
            return Err(format!("csp-init must record vars=2, got '{}'", init));
        }
        let verdict = trace
            .detail_of("csp-verdict")
            .ok_or_else(|| "missing csp-verdict step".to_string())?;
        if verdict != "satisfiable=true" {
            return Err(format!(
                "novel CSP is satisfiable; csp-verdict must be 'satisfiable=true', got '{}'",
                verdict
            ));
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// DefaultLogic — Reiter defaults with justification blocking
// ---------------------------------------------------------------------------

impl BreedOracle for DefaultLogic {
    fn breed_id() -> BreedId {
        BreedId::DefaultLogic
    }

    /// bird-flies default: uo_bird : uo_brokenwing absent / uo_flies.
    fn novel_input() -> BreedInput {
        let mut input = base("uo_default extend");
        input.facts = vec![fact("uo_f1", "uo_bird")];
        input.rules = vec![rule(
            "uo_d1",
            &["uo_bird", "unless:uo_brokenwing"],
            "uo_flies",
            0.9,
        )];
        input
    }

    /// Same default fired (extension contains uo_flies) vs blocked by an
    /// added uo_brokenwing fact (extension lacks uo_flies).
    fn boundary_pair() -> (BreedInput, BreedInput) {
        let fired = Self::novel_input();
        let mut blocked = Self::novel_input();
        blocked.facts.push(fact("uo_f2", "uo_brokenwing"));
        (fired, blocked)
    }

    /// Facts but no rules — precondition refuses; run() also refuses
    /// ("no default fired or was blocked").
    fn refusal_input() -> BreedInput {
        let mut input = base("uo_default extend");
        input.facts = vec![fact("uo_f1", "uo_bird")];
        input
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_at_least("default-load", 1)?;
        trace.require_at_least("default-fire", 1)?;
        trace.require_at_least("default-extension", 1)?;
        Ok(())
    }

    fn assert_trace_values(trace: &TraceQuery<'_>) -> Result<(), String> {
        let ext = trace
            .detail_of("default-extension")
            .ok_or_else(|| "missing default-extension step".to_string())?;
        if !ext.contains("uo_bird") || !ext.contains("uo_flies") {
            return Err(format!(
                "extension must contain uo_bird and derived uo_flies, got '{}'",
                ext
            ));
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// FramesInheritance — isa-chain slot resolution
// ---------------------------------------------------------------------------

impl BreedOracle for FramesInheritance {
    fn breed_id() -> BreedId {
        BreedId::FramesInheritance
    }

    /// uo_tweetzy isa uo_birdkind; uo_birdkind has own slot uo_motion=uo_fly.
    fn novel_input() -> BreedInput {
        let mut input = base("resolve uo_tweetzy uo_motion");
        input.facts = vec![
            fact("frame:uo_tweetzy:isa", "uo_birdkind"),
            fact("frame:uo_birdkind:slot:uo_motion", "uo_fly"),
        ];
        input
    }

    /// Inherited value (uo_fly from parent) vs own-slot override
    /// (uo_walk on uo_tweetzy itself) — selected differs.
    fn boundary_pair() -> (BreedInput, BreedInput) {
        let inherited = Self::novel_input();
        let mut overridden = Self::novel_input();
        overridden
            .facts
            .push(fact("frame:uo_tweetzy:slot:uo_motion", "uo_walk"));
        (inherited, overridden)
    }

    /// Malformed intent (not 'resolve <frame> <slot>') — precondition refuses;
    /// run() also returns Err on the same check.
    fn refusal_input() -> BreedInput {
        let mut input = base("uo_bogus");
        input.facts = vec![fact("frame:uo_tweetzy:isa", "uo_birdkind")];
        input
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_at_least("frame-load", 1)?;
        trace.require_at_least("frame-walk", 2)?;
        trace.require_at_least("frame-resolve", 1)?;
        Ok(())
    }

    fn assert_trace_values(trace: &TraceQuery<'_>) -> Result<(), String> {
        let resolve = trace
            .detail_of("frame-resolve")
            .ok_or_else(|| "missing frame-resolve step".to_string())?;
        if !resolve.contains("uo_fly") || !resolve.contains("uo_birdkind") {
            return Err(format!(
                "frame-resolve must report uo_fly found at uo_birdkind, got '{}'",
                resolve
            ));
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Asp — stable model enumeration (Gelfond–Lifschitz)
// ---------------------------------------------------------------------------

impl BreedOracle for Asp {
    fn breed_id() -> BreedId {
        BreedId::Asp
    }

    /// Program { uo_p. ; uo_q :- not uo_p. } — exactly one stable model {uo_p}.
    fn novel_input() -> BreedInput {
        let mut input = base("uo_asp solve");
        input.rules = vec![
            rule("uo_r1", &[], "uo_p", 1.0),
            rule("uo_r2", &["not uo_p"], "uo_q", 1.0),
        ];
        input
    }

    /// One stable model ({uo_p}) vs the even negation loop
    /// { uo_p :- not uo_q. ; uo_q :- not uo_p. } with two stable models —
    /// asp:answer_set_count differs.
    fn boundary_pair() -> (BreedInput, BreedInput) {
        let one = Self::novel_input();
        let mut two = base("uo_asp solve");
        two.rules = vec![
            rule("uo_r1", &["not uo_q"], "uo_p", 1.0),
            rule("uo_r2", &["not uo_p"], "uo_q", 1.0),
        ];
        (one, two)
    }

    /// NAF literal in a rule head is not allowed in normal programs.
    /// NOTE: Asp::run() itself never returns Err — this refusal is enforced
    /// by `preconditions` (the lifecycle dispatch path).
    fn refusal_input() -> BreedInput {
        let mut input = base("uo_asp solve");
        input.rules = vec![rule("uo_r1", &["uo_q"], "not uo_p", 1.0)];
        input
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_at_least("ground", 1)?;
        trace.require_at_least("guess-candidate", 1)?;
        trace.require_at_least("reduct", 1)?;
        trace.require_at_least("stable-accept", 1)?;
        trace.require_last("answer-set")?;
        Ok(())
    }

    fn assert_trace_values(trace: &TraceQuery<'_>) -> Result<(), String> {
        let accept = trace
            .detail_of("stable-accept")
            .ok_or_else(|| "missing stable-accept step".to_string())?;
        if !accept.contains("uo_p") || accept.contains("uo_q") {
            return Err(format!(
                "the unique stable model is {{uo_p}}, got '{}'",
                accept
            ));
        }
        let answer = trace
            .detail_of("answer-set")
            .ok_or_else(|| "missing answer-set step".to_string())?;
        if !answer.contains("1 answer set") {
            return Err(format!(
                "program has exactly 1 answer set, got '{}'",
                answer
            ));
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// BayesianNetwork — variable elimination
// ---------------------------------------------------------------------------

fn bn_input(prior: &str) -> BreedInput {
    let mut input = base("uo_bn infer");
    input.facts = vec![
        fact("cpt:uo_rain", prior),
        fact("cpt:uo_wet|uo_rain", "0.1,0.9"),
    ];
    input.goals = vec![goal("uo_q1", "query", "prob:uo_wet")];
    input
}

impl BreedOracle for BayesianNetwork {
    fn breed_id() -> BreedId {
        BreedId::BayesianNetwork
    }

    /// Two-node chain uo_rain → uo_wet, query P(uo_wet).
    fn novel_input() -> BreedInput {
        bn_input("0.3")
    }

    /// Prior P(uo_rain)=0.3 vs 0.9 — posterior P(uo_wet) differs
    /// (0.34 vs 0.82).
    fn boundary_pair() -> (BreedInput, BreedInput) {
        (bn_input("0.3"), bn_input("0.9"))
    }

    /// CPTs present but no query goal — precondition refuses; run() also
    /// returns Err("missing query goal").
    fn refusal_input() -> BreedInput {
        let mut input = bn_input("0.3");
        input.goals = vec![];
        input
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_at_least("bn-load-cpt", 2)?;
        trace.require_at_least("bn-eliminate", 1)?;
        trace.require_at_least("bn-verdict", 1)?;
        Ok(())
    }

    fn assert_trace_values(trace: &TraceQuery<'_>) -> Result<(), String> {
        let verdict = trace
            .detail_of("bn-verdict")
            .ok_or_else(|| "missing bn-verdict step".to_string())?;
        // P(wet) = 0.3*0.9 + 0.7*0.1 = 0.34 exactly.
        if !verdict.starts_with("prob:uo_wet=0.34") {
            return Err(format!(
                "bn-verdict must report P(uo_wet)=0.34, got '{}'",
                verdict
            ));
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Mdp — value iteration
// ---------------------------------------------------------------------------

fn mdp_input(gamma: &str) -> BreedInput {
    let mut input = base("uo_mdp solve");
    input.facts = vec![
        fact("mdp:gamma", gamma),
        fact("mdp:trans:uo_s1:uo_loop", "uo_s1:1.0"),
        fact("mdp:reward:uo_s1:uo_loop", "1.0"),
    ];
    input
}

impl BreedOracle for Mdp {
    fn breed_id() -> BreedId {
        BreedId::Mdp
    }

    /// Single self-loop state, R=1, γ=0.5 — closed form V(uo_s1)=2.
    fn novel_input() -> BreedInput {
        mdp_input("0.5")
    }

    /// γ=0.5 (V=2) vs γ=0.9 (V=10) — converged values differ.
    fn boundary_pair() -> (BreedInput, BreedInput) {
        (mdp_input("0.5"), mdp_input("0.9"))
    }

    /// Transition probabilities sum to 0.4 (not 1±1e-6) — precondition
    /// refuses, and run() re-validates the model and returns Err too.
    fn refusal_input() -> BreedInput {
        let mut input = base("uo_mdp solve");
        input.facts = vec![
            fact("mdp:gamma", "0.5"),
            fact("mdp:trans:uo_s1:uo_loop", "uo_s1:0.4"),
        ];
        input
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_first("mdp-init")?;
        trace.require_at_least("mdp-iterate", 1)?;
        trace.require_at_least("mdp-policy", 1)?;
        Ok(())
    }

    fn assert_trace_values(trace: &TraceQuery<'_>) -> Result<(), String> {
        let init = trace
            .detail_of("mdp-init")
            .ok_or_else(|| "missing mdp-init step".to_string())?;
        if !init.contains("1 states") || !init.contains("gamma=0.500000") {
            return Err(format!(
                "mdp-init must record 1 state and gamma=0.500000, got '{}'",
                init
            ));
        }
        let policy = trace
            .detail_of("mdp-policy")
            .ok_or_else(|| "missing mdp-policy step".to_string())?;
        if policy != "uo_s1 -> uo_loop" {
            return Err(format!(
                "greedy policy must map uo_s1 -> uo_loop, got '{}'",
                policy
            ));
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Per-breed adversaries (U6 meta-oracle) — each emits the right step KINDS
// (so weak kind-only oracles would accept) but hollow/wrong DETAILS that
// `assert_trace_values` must reject.
// ---------------------------------------------------------------------------

/// Build a plausible-looking but fraudulent BreedOutput from (kind, detail) pairs.
fn cheat_output(breed: BreedId, steps: &[(&str, &str)]) -> BreedOutput {
    BreedOutput {
        breed,
        candidates: vec![],
        facts: vec![],
        selected: None,
        explanation: "cheat".to_string(),
        inference_trace: steps
            .iter()
            .enumerate()
            .map(|(i, (kind, detail))| TraceStep {
                step: i,
                kind: (*kind).to_string(),
                detail: (*detail).to_string(),
                depth: 0,
                objects: vec![],
            })
            .collect(),
        ocel_log: None,
        retained_cases: vec![],
    }
}

/// AC-TABLE: returns a canned fire-rule step copied from a lookup table —
/// no rule id, no propagated certainty factor.
pub struct CheatMycin;
impl BreedAdversary for CheatMycin {
    type Target = Mycin;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        cheat_output(
            BreedId::Mycin,
            &[("fire-rule", "table lookup: uo_conclusion cached")],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-TABLE"
    }
}

/// AC-TABLE: emits the full kernel lifecycle kinds but the decision is a
/// canned table answer (Deny) instead of the real engine's Allow.
pub struct CheatProlog;
impl BreedAdversary for CheatProlog {
    type Target = Prolog;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        cheat_output(
            BreedId::Prolog,
            &[
                ("intern-fact", "uo_par/1"),
                ("load-rule", "uo_r1"),
                ("kernel-query", "uo_par(uo_ala)"),
                ("decision", "Deny (cached table answer)"),
            ],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-TABLE"
    }
}

/// AC-PARTIAL: fuzzifies and fires but skips real defuzzification, emitting a
/// raw membership instead of the `uo_vent = <centroid>` report.
pub struct CheatFuzzyLogic;
impl BreedAdversary for CheatFuzzyLogic {
    type Target = FuzzyLogic;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        cheat_output(
            BreedId::FuzzyLogic,
            &[
                ("fuzzy-fuzzify", "uo_heat=4"),
                ("fuzzy-fire", "uo_fr1"),
                ("fuzzy-aggregate", "1 set"),
                ("fuzzy-defuzz", "membership=1.0"),
            ],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-PARTIAL"
    }
}

/// AC-PARTIAL: loads BPAs but reports only the raw mass, never computing the
/// Bel/Pl interval for uo_hyp1.
pub struct CheatDempsterShafer;
impl BreedAdversary for CheatDempsterShafer {
    type Target = DempsterShafer;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        cheat_output(
            BreedId::DempsterShafer,
            &[
                ("ds-load-bpa", "uo_src1"),
                ("ds-combine", "2 sources"),
                ("ds-belief", "uo_hyp1 mass=0.6"),
            ],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-PARTIAL"
    }
}

/// AC-FLAT: initializes but skips arc propagation/search, punting with an
/// unknown verdict instead of proving satisfiable=true.
pub struct CheatCspAc3;
impl BreedAdversary for CheatCspAc3 {
    type Target = CspAc3;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        cheat_output(
            BreedId::CspAc3,
            &[
                ("csp-init", "vars=2 constraints=1"),
                ("csp-verdict", "satisfiable=unknown"),
            ],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-FLAT"
    }
}

/// AC-GREEDY: fires the default without building the extension over the
/// prerequisite facts — the reported extension lacks uo_bird.
pub struct CheatDefaultLogic;
impl BreedAdversary for CheatDefaultLogic {
    type Target = DefaultLogic;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        cheat_output(
            BreedId::DefaultLogic,
            &[
                ("default-load", "uo_d1"),
                ("default-fire", "uo_d1"),
                ("default-extension", "uo_flies"),
            ],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-GREEDY"
    }
}

/// AC-PARTIAL: walks the isa chain in form only — the resolve step omits the
/// provenance frame (uo_birdkind) where the slot was actually found.
pub struct CheatFramesInheritance;
impl BreedAdversary for CheatFramesInheritance {
    type Target = FramesInheritance;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        cheat_output(
            BreedId::FramesInheritance,
            &[
                ("frame-load", "2 frames"),
                ("frame-walk", "uo_tweetzy"),
                ("frame-walk", "parent"),
                ("frame-resolve", "uo_motion=uo_fly"),
            ],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-PARTIAL"
    }
}

/// AC-PARTIAL: skips the stability check and accepts a non-stable candidate
/// containing uo_q (blocked by `uo_q :- not uo_p` once uo_p holds).
pub struct CheatAsp;
impl BreedAdversary for CheatAsp {
    type Target = Asp;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        cheat_output(
            BreedId::Asp,
            &[
                ("ground", "2 rules"),
                ("guess-candidate", "{uo_p, uo_q}"),
                ("reduct", "2 rules"),
                ("stable-accept", "{uo_p, uo_q}"),
                ("answer-set", "1 answer set"),
            ],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-PARTIAL"
    }
}

/// AC-IGNORE: loads the CPTs but ignores the prior during elimination,
/// reporting the conditional 0.90 instead of the marginal 0.34.
pub struct CheatBayesianNetwork;
impl BreedAdversary for CheatBayesianNetwork {
    type Target = BayesianNetwork;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        cheat_output(
            BreedId::BayesianNetwork,
            &[
                ("bn-load-cpt", "cpt:uo_rain"),
                ("bn-load-cpt", "cpt:uo_wet|uo_rain"),
                ("bn-eliminate", "uo_rain"),
                ("bn-verdict", "prob:uo_wet=0.90"),
            ],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-IGNORE"
    }
}

/// AC-GREEDY: emits a one-shot greedy sweep that never honors the discount —
/// init records gamma=1.000000 instead of the input's 0.5.
pub struct CheatMdp;
impl BreedAdversary for CheatMdp {
    type Target = Mdp;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        cheat_output(
            BreedId::Mdp,
            &[
                ("mdp-init", "1 states, gamma=1.000000"),
                ("mdp-iterate", "iter=0 delta=0"),
                ("mdp-policy", "uo_s1 -> uo_loop"),
            ],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-GREEDY"
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use crate::breeds::dispatch::dispatch_breed_id;
    use crate::breeds::support::oracle::run_adversary_check;

    /// Run the real breed on its novel input and assert the Surface-3
    /// value-level assertions accept the genuine trace.
    fn assert_real_trace_ok<B: BreedOracle>() {
        let output = dispatch_breed_id(B::breed_id(), &B::novel_input())
            .unwrap_or_else(|e| panic!("{:?} novel_input run failed: {}", B::breed_id(), e));
        let tq = TraceQuery::new(&output.inference_trace);
        B::assert_trace_values(&tq).unwrap_or_else(|e| {
            panic!(
                "{:?} assert_trace_values rejected real trace: {}",
                B::breed_id(),
                e
            )
        });
    }

    macro_rules! oracle_pair_test {
        ($name:ident, $breed:ty, $cheat:ty) => {
            #[test]
            fn $name() {
                assert_real_trace_ok::<$breed>();
                let r = run_adversary_check::<$cheat>();
                assert!(
                    r.is_pass(),
                    "{} cheat was not rejected by the oracle",
                    <$cheat as BreedAdversary>::cheat_code()
                );
            }
        };
    }

    oracle_pair_test!(mycin_values_and_adversary, Mycin, CheatMycin);
    oracle_pair_test!(prolog_values_and_adversary, Prolog, CheatProlog);
    oracle_pair_test!(
        fuzzy_logic_values_and_adversary,
        FuzzyLogic,
        CheatFuzzyLogic
    );
    oracle_pair_test!(
        dempster_shafer_values_and_adversary,
        DempsterShafer,
        CheatDempsterShafer
    );
    oracle_pair_test!(csp_ac3_values_and_adversary, CspAc3, CheatCspAc3);
    oracle_pair_test!(
        default_logic_values_and_adversary,
        DefaultLogic,
        CheatDefaultLogic
    );
    oracle_pair_test!(
        frames_inheritance_values_and_adversary,
        FramesInheritance,
        CheatFramesInheritance
    );
    oracle_pair_test!(asp_values_and_adversary, Asp, CheatAsp);
    oracle_pair_test!(
        bayesian_network_values_and_adversary,
        BayesianNetwork,
        CheatBayesianNetwork
    );
    oracle_pair_test!(mdp_values_and_adversary, Mdp, CheatMdp);
}
