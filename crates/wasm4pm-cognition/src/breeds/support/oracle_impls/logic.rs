//! [`BreedOracle`] impls for the logic / formal-reasoning breeds.
//!
//! All novel content uses fresh `uo_` names (or, for the numeric DIMACS
//! grammar of `sat_cdcl`, clause structures that appear in no fixture).

use super::{base, fact, goal, rule, state_atom};
use crate::breeds::abductive_ibe::AbductiveIbe;
use crate::breeds::abductive_lp::AbductiveLp;
use crate::breeds::allen_temporal::AllenTemporal;
use crate::breeds::belief_merging::BeliefMerging;
use crate::breeds::circumscription::Circumscription;
use crate::breeds::clp::Clp;
use crate::breeds::ctl_check::CtlCheck;
use crate::breeds::description_logic::DescriptionLogic;
use crate::breeds::ltl_monitor::LtlMonitor;
use crate::breeds::problog::Problog;
use crate::breeds::sat_cdcl::SatCdcl;
use crate::breeds::support::oracle::{BreedAdversary, BreedOracle};
use crate::breeds::support::trace_query::TraceQuery;
use crate::breeds::tableaux::Tableaux;
use crate::breeds::{BreedId, BreedInput, BreedOutput, TraceStep};

/// Build a hollow-but-plausible adversary output: right step kinds, wrong or
/// empty detail content. Used only by the `Cheat*` meta-oracle adversaries.
fn uo_cheat_output(breed: BreedId, steps: &[(&str, &str)]) -> BreedOutput {
    BreedOutput {
        breed,
        candidates: vec![],
        facts: vec![],
        selected: None,
        explanation: "uo_cheat".to_string(),
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

// ── SatCdcl ──────────────────────────────────────────────────────────────────

impl BreedOracle for SatCdcl {
    fn breed_id() -> BreedId {
        BreedId::SatCdcl
    }

    /// Novel 5-variable implication-chain clause structure (SAT).
    fn novel_input() -> BreedInput {
        let mut input = base("uo_sat_chain");
        input.facts.push(fact("clause:c0", "3 -4 5"));
        input.facts.push(fact("clause:c1", "-3 5"));
        input.facts.push(fact("clause:c2", "4 -5 3"));
        input
    }

    /// SAT 2-clause chain vs UNSAT full binary cube over vars 3,4.
    fn boundary_pair() -> (BreedInput, BreedInput) {
        let mut sat = base("uo_sat_side");
        sat.facts.push(fact("clause:c0", "3 -4"));
        sat.facts.push(fact("clause:c1", "4 5"));
        let mut unsat = base("uo_unsat_side");
        unsat.facts.push(fact("clause:c0", "3 4"));
        unsat.facts.push(fact("clause:c1", "3 -4"));
        unsat.facts.push(fact("clause:c2", "-3 4"));
        unsat.facts.push(fact("clause:c3", "-3 -4"));
        (sat, unsat)
    }

    /// Variable 99 exceeds the 64-variable cap.
    fn refusal_input() -> BreedInput {
        let mut input = base("uo_sat_refuse");
        input.facts.push(fact("clause:c0", "99 -3"));
        input
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_non_empty_with_kinds(&["load-clause"])?;
        trace.require_count("decision", 1)?;
        trace.require_last("decision")?;
        Ok(())
    }

    /// Values: loaded clause literals, real search work (decide + propagate
    /// with concrete forced literal), and a SAT verdict naming the clause DB.
    fn assert_trace_values(tq: &TraceQuery<'_>) -> Result<(), String> {
        if tq.detail_of("load-clause") != Some("c0: (3 -4 5)") {
            return Err(format!(
                "load-clause[0] detail must be 'c0: (3 -4 5)', got {:?}",
                tq.detail_of("load-clause")
            ));
        }
        tq.require_count("load-clause", 3)?;
        let decide = tq
            .first_of("decide")
            .ok_or("missing 'decide' step — no real search performed")?;
        if !decide.detail.contains("decide 1 = true @L1") {
            return Err(format!("decide[0] detail wrong: '{}'", decide.detail));
        }
        let prop = tq
            .detail_of("propagate")
            .ok_or("missing 'propagate' step — unit propagation skipped")?;
        if !prop.contains("forces 5") {
            return Err(format!("propagate detail must force literal 5, got '{}'", prop));
        }
        let dec = tq.detail_of("decision").ok_or("missing decision detail")?;
        if dec != "SAT (3 input clauses, 0 learned)" {
            return Err(format!("decision detail wrong: '{}'", dec));
        }
        Ok(())
    }
}

// ── Tableaux ─────────────────────────────────────────────────────────────────

impl BreedOracle for Tableaux {
    fn breed_id() -> BreedId {
        BreedId::Tableaux
    }

    /// K-axiom shape over fresh atoms — valid, alpha-only.
    fn novel_input() -> BreedInput {
        let mut input = base("uo_tableaux_prove");
        input
            .facts
            .push(fact("tableaux:formula", "uo_p -> (uo_q -> uo_p)"));
        input
    }

    /// Valid excluded middle vs invalid bare implication.
    fn boundary_pair() -> (BreedInput, BreedInput) {
        let mut valid = base("uo_tableaux_valid");
        valid.facts.push(fact("tableaux:formula", "uo_p | !uo_p"));
        let mut invalid = base("uo_tableaux_invalid");
        invalid.facts.push(fact("tableaux:formula", "uo_p -> uo_q"));
        (valid, invalid)
    }

    /// Temporal operator is outside the propositional fragment.
    fn refusal_input() -> BreedInput {
        let mut input = base("uo_tableaux_refuse");
        input.facts.push(fact("tableaux:formula", "G uo_p"));
        input
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_non_empty()?;
        trace.require_sequence(&["parse-formula", "sign-root", "verdict"])?;
        trace.require_kind("close-branch")?;
        Ok(())
    }

    /// Values: ≥2 expansion steps with real subformula content, clash on the
    /// actual atom, and a verdict matching the computed validity.
    fn assert_trace_values(tq: &TraceQuery<'_>) -> Result<(), String> {
        if tq.count_of("alpha-expand") + tq.count_of("beta-expand") < 2 {
            return Err("fewer than 2 expansion (alpha/beta) steps — tableau not built".into());
        }
        let a0 = tq.detail_of("alpha-expand").ok_or("missing alpha-expand")?;
        if !a0.contains("=> T uo_p, F (uo_q -> uo_p)") {
            return Err(format!("alpha-expand[0] detail wrong: '{}'", a0));
        }
        let cb = tq.detail_of("close-branch").ok_or("missing close-branch")?;
        if !cb.contains("clash on 'uo_p'") {
            return Err(format!("close-branch must clash on uo_p, got '{}'", cb));
        }
        if tq.detail_of("verdict") != Some("valid (all branches closed)") {
            return Err(format!("verdict detail wrong: {:?}", tq.detail_of("verdict")));
        }
        Ok(())
    }
}

// ── CtlCheck ─────────────────────────────────────────────────────────────────

impl BreedOracle for CtlCheck {
    fn breed_id() -> BreedId {
        BreedId::CtlCheck
    }

    /// Two-state total system where `A G uo_live` holds from the initial state.
    fn novel_input() -> BreedInput {
        let mut input = base("uo_ctl_check");
        input.facts.push(fact("ts:init", "uo_s0"));
        input.facts.push(fact("ts:edge:uo_s0", "uo_s1"));
        input.facts.push(fact("ts:edge:uo_s1", "uo_s0"));
        input.facts.push(fact("ts:label:uo_s0", "uo_live"));
        input.facts.push(fact("ts:label:uo_s1", "uo_live"));
        input.facts.push(fact("ctl:formula", "A G uo_live"));
        input
    }

    /// Same structure; one drops the label on uo_s1 so AG fails.
    fn boundary_pair() -> (BreedInput, BreedInput) {
        let holds = Self::novel_input();
        let mut fails = Self::novel_input();
        fails.facts.retain(|f| f.key != "ts:label:uo_s1");
        (holds, fails)
    }

    /// Transition relation not total: uo_s1 has no successor.
    fn refusal_input() -> BreedInput {
        let mut input = base("uo_ctl_refuse");
        input.facts.push(fact("ts:init", "uo_s0"));
        input.facts.push(fact("ts:edge:uo_s0", "uo_s1"));
        input.facts.push(fact("ctl:formula", "A G uo_live"));
        input
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_non_empty_with_kinds(&["parse-formula", "label-states"])?;
        trace.require_count("decision", 1)?;
        trace.require_last("decision")?;
        Ok(())
    }

    /// Values: labelling counts match the 2-state model and the verdict
    /// matches the computed truth (AG uo_live HOLDS from uo_s0).
    fn assert_trace_values(tq: &TraceQuery<'_>) -> Result<(), String> {
        let pf = tq.detail_of("parse-formula").ok_or("missing parse-formula")?;
        if !pf.contains("A G uo_live over 2 states (init=uo_s0)") {
            return Err(format!("parse-formula detail wrong: '{}'", pf));
        }
        if tq.detail_of("label-states") != Some("[uo_live] holds in 2 states") {
            return Err(format!(
                "label-states[0] must label uo_live in 2 states, got {:?}",
                tq.detail_of("label-states")
            ));
        }
        let last_label = tq.last_of("label-states").ok_or("missing label-states")?;
        if last_label.detail != "[A G uo_live] holds in 2 states" {
            return Err(format!("final labelling wrong: '{}'", last_label.detail));
        }
        let dec = tq.detail_of("decision").ok_or("missing decision detail")?;
        if dec != "A G uo_live HOLDS at init state uo_s0" {
            return Err(format!("decision must report HOLDS at uo_s0, got '{}'", dec));
        }
        Ok(())
    }
}

// ── LtlMonitor ───────────────────────────────────────────────────────────────

impl BreedOracle for LtlMonitor {
    fn breed_id() -> BreedId {
        BreedId::LtlMonitor
    }

    /// `G uo_ok` over a 3-event trace where uo_ok always holds — satisfied.
    fn novel_input() -> BreedInput {
        let mut input = base("uo_ltl_monitor");
        input.facts.push(fact("ltl:formula", "G uo_ok"));
        input.facts.push(fact("trace:0", "uo_ok"));
        input.facts.push(fact("trace:1", "uo_ok,uo_aux"));
        input.facts.push(fact("trace:2", "uo_ok"));
        input
    }

    /// Satisfied trace vs trace violating G at step 1.
    fn boundary_pair() -> (BreedInput, BreedInput) {
        let satisfied = Self::novel_input();
        let mut violated = base("uo_ltl_violate");
        violated.facts.push(fact("ltl:formula", "G uo_ok"));
        violated.facts.push(fact("trace:0", "uo_ok"));
        violated.facts.push(fact("trace:1", "uo_aux"));
        (satisfied, violated)
    }

    /// No trace:N events at all — refused (at least one event required).
    fn refusal_input() -> BreedInput {
        let mut input = base("uo_ltl_refuse");
        input.facts.push(fact("ltl:formula", "G uo_ok"));
        input
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_non_empty()?;
        trace.require_count("ltl-init", 1)?;
        trace.require_at_least("ltl-progress", 1)?;
        trace.require_last("ltl-verdict")?;
        Ok(())
    }

    /// Values: formula recorded at init, progression carries the live formula
    /// state per event (details differ across steps), verdict matches truth.
    fn assert_trace_values(tq: &TraceQuery<'_>) -> Result<(), String> {
        if tq.detail_of("ltl-init") != Some("G uo_ok") {
            return Err(format!("ltl-init detail wrong: {:?}", tq.detail_of("ltl-init")));
        }
        tq.require_count("ltl-progress", 3)?;
        let p0 = tq.detail_kth("ltl-progress", 0).ok_or("missing ltl-progress[0]")?;
        let p2 = tq.detail_kth("ltl-progress", 2).ok_or("missing ltl-progress[2]")?;
        if !p0.contains("trace:0 -> Always(Atom(\"uo_ok\"))") {
            return Err(format!("ltl-progress[0] detail wrong: '{}'", p0));
        }
        if !p2.starts_with("trace:2 ->") || p0 == p2 {
            return Err(format!("progression did not advance: '{}' vs '{}'", p0, p2));
        }
        if tq.detail_of("ltl-verdict") != Some("true") {
            return Err(format!(
                "ltl-verdict must be 'true' for G uo_ok, got {:?}",
                tq.detail_of("ltl-verdict")
            ));
        }
        Ok(())
    }
}

// ── DescriptionLogic ─────────────────────────────────────────────────────────

impl BreedOracle for DescriptionLogic {
    fn breed_id() -> BreedId {
        BreedId::DescriptionLogic
    }

    /// CR1 transitive chain: uo_Cat ⊑ uo_Mammal ⊑ uo_Animal, query uo_Cat:uo_Animal.
    fn novel_input() -> BreedInput {
        let mut input = base("uo_dl_classify");
        input.facts.push(fact("dl:subclass:uo_Cat", "uo_Mammal"));
        input.facts.push(fact("dl:subclass:uo_Mammal", "uo_Animal"));
        input
            .goals
            .push(goal("uo_q0", "dl:subsumes", "uo_Cat:uo_Animal"));
        input
    }

    /// Same TBox; forward query is entailed, reverse query is not.
    fn boundary_pair() -> (BreedInput, BreedInput) {
        let forward = Self::novel_input();
        let mut reverse = Self::novel_input();
        reverse.goals[0] = goal("uo_q0", "dl:subsumes", "uo_Animal:uo_Cat");
        (forward, reverse)
    }

    /// Malformed dl:conj key (no `+` separator) is refused.
    fn refusal_input() -> BreedInput {
        let mut input = base("uo_dl_refuse");
        input.facts.push(fact("dl:conj:uo_Cat", "uo_Animal"));
        input
            .goals
            .push(goal("uo_q0", "dl:subsumes", "uo_Cat:uo_Animal"));
        input
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_non_empty_with_kinds(&["normalize", "apply-cr1"])?;
        trace.require_sequence(&["normalize", "fixpoint", "classify-verdict"])?;
        Ok(())
    }

    /// Values: the transitive subsumption uo_Cat ⊑ uo_Animal must appear as a
    /// DERIVED CR1 composition (via uo_Mammal), not as a table lookup.
    fn assert_trace_values(tq: &TraceQuery<'_>) -> Result<(), String> {
        let nz = tq.detail_of("normalize").ok_or("missing normalize")?;
        if !nz.contains("3 concepts, 2 subclass") {
            return Err(format!("normalize detail wrong: '{}'", nz));
        }
        let derived = "uo_Cat ⊑ uo_Animal (via uo_Mammal ⊑ uo_Animal)";
        if !tq
            .as_slice()
            .iter()
            .any(|t| t.kind == "apply-cr1" && t.detail == derived)
        {
            return Err(format!("missing derived CR1 composition step '{}'", derived));
        }
        let fp = tq.detail_of("fixpoint").ok_or("missing fixpoint")?;
        if !fp.contains("6 subsumptions") {
            return Err(format!("fixpoint must saturate to 6 subsumptions, got '{}'", fp));
        }
        if tq.detail_of("classify-verdict") != Some("uo_Cat ⊑ uo_Animal : true") {
            return Err(format!(
                "classify-verdict wrong: {:?}",
                tq.detail_of("classify-verdict")
            ));
        }
        Ok(())
    }
}

// ── Circumscription ──────────────────────────────────────────────────────────

impl BreedOracle for Circumscription {
    fn breed_id() -> BreedId {
        BreedId::Circumscription
    }

    /// Default-flight pattern over fresh atoms: minimal model entails uo_glides.
    fn novel_input() -> BreedInput {
        let mut input = base("uo_circ_entail");
        input.facts.push(fact("uo_wing", "true"));
        input.rules.push(rule(
            "uo_r0",
            &["uo_wing", "not_ab_uo_wing"],
            "uo_glides",
            1.0,
        ));
        input.goals.push(goal("uo_g0", "entail", "uo_glides"));
        input
    }

    /// Default applies vs default blocked by an asserted abnormality rule.
    fn boundary_pair() -> (BreedInput, BreedInput) {
        let entailed = Self::novel_input();
        let mut blocked = Self::novel_input();
        blocked
            .rules
            .push(rule("uo_r1", &["uo_wing"], "ab_uo_wing", 1.0));
        (entailed, blocked)
    }

    /// Negation of a non-abnormality atom is refused.
    fn refusal_input() -> BreedInput {
        let mut input = base("uo_circ_refuse");
        input
            .rules
            .push(rule("uo_r0", &["not_uo_wing"], "uo_glides", 1.0));
        input.goals.push(goal("uo_g0", "entail", "uo_glides"));
        input
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_non_empty()?;
        trace.require_first("load-defaults")?;
        trace.require_at_least("enumerate-model", 2)?;
        trace.require_kind("entail")?;
        trace.require_last("decision")?;
        Ok(())
    }

    /// Values: the minimal model (empty abnormality set) is found, the larger
    /// model is pruned, and cautious entailment of uo_glides is recorded.
    fn assert_trace_values(tq: &TraceQuery<'_>) -> Result<(), String> {
        if tq.detail_of("enumerate-model") != Some("S={} -> model") {
            return Err(format!(
                "enumerate-model[0] must be the empty abnormality model, got {:?}",
                tq.detail_of("enumerate-model")
            ));
        }
        let mz = tq.detail_of("minimize").ok_or("missing minimize step")?;
        if !mz.contains("pruned S={ab_uo_wing}") {
            return Err(format!("minimize must prune ab_uo_wing model, got '{}'", mz));
        }
        if tq.detail_of("entail") != Some("uo_glides |= true in 1/1 minimal models -> true") {
            return Err(format!("entail detail wrong: {:?}", tq.detail_of("entail")));
        }
        let dec = tq.detail_of("decision").ok_or("missing decision")?;
        if !dec.contains("cautiously entailed: {uo_glides}") {
            return Err(format!("decision must entail uo_glides, got '{}'", dec));
        }
        Ok(())
    }
}

// ── BeliefMerging ────────────────────────────────────────────────────────────

impl BreedOracle for BeliefMerging {
    fn breed_id() -> BreedId {
        BreedId::BeliefMerging
    }

    /// Σ-merging of the 2-vs-1 profile over fresh atoms.
    fn novel_input() -> BreedInput {
        let mut input = base("uo_bm_merge");
        input.facts.push(fact("bm:atoms", "uo_p,uo_q"));
        input.facts.push(fact("bm:base:1", "uo_p,uo_q"));
        input.facts.push(fact("bm:base:2", "uo_p,uo_q"));
        input.facts.push(fact("bm:base:3", "-uo_p,-uo_q"));
        input.facts.push(fact("bm:ic", "true"));
        input.facts.push(fact("bm:operator", "sum"));
        input
    }

    /// Σ (majoritarian) vs GMax (egalitarian) disagree on this profile.
    fn boundary_pair() -> (BreedInput, BreedInput) {
        let sigma = Self::novel_input();
        let mut gmax = Self::novel_input();
        for f in &mut gmax.facts {
            if f.key == "bm:operator" {
                f.value = "gmax".to_string();
            }
        }
        (sigma, gmax)
    }

    /// Base mentions an atom missing from bm:atoms.
    fn refusal_input() -> BreedInput {
        let mut input = base("uo_bm_refuse");
        input.facts.push(fact("bm:atoms", "uo_p"));
        input.facts.push(fact("bm:base:1", "uo_p"));
        input.facts.push(fact("bm:base:2", "uo_unknown_atom"));
        input
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_non_empty()?;
        trace.require_first("enumerate-worlds")?;
        trace.require_at_least("distance", 4)?;
        trace.require_kind("select-min")?;
        trace.require_last("merged-belief")?;
        Ok(())
    }

    /// Values: per-world distance vectors are non-flat, Σ selection picks the
    /// majoritarian world, and the merged result is the consistent (uo_p,uo_q).
    fn assert_trace_values(tq: &TraceQuery<'_>) -> Result<(), String> {
        if tq.detail_of("enumerate-worlds") != Some("2 atoms -> 4 worlds, 3 bases") {
            return Err(format!(
                "enumerate-worlds detail wrong: {:?}",
                tq.detail_of("enumerate-worlds")
            ));
        }
        if !tq
            .as_slice()
            .iter()
            .any(|t| t.kind == "distance" && t.detail == "w=(uo_p,uo_q) d=(0,0,2)")
        {
            return Err("missing real distance vector 'w=(uo_p,uo_q) d=(0,0,2)'".into());
        }
        let sm = tq.detail_of("select-min").ok_or("missing select-min")?;
        if sm != "1 minimal world(s) under Σ" {
            return Err(format!("select-min detail wrong: '{}'", sm));
        }
        if tq.detail_of("merged-belief") != Some("[(uo_p,uo_q)]") {
            return Err(format!(
                "merged-belief must record consistent result [(uo_p,uo_q)], got {:?}",
                tq.detail_of("merged-belief")
            ));
        }
        Ok(())
    }
}

// ── AbductiveLp ──────────────────────────────────────────────────────────────

impl BreedOracle for AbductiveLp {
    fn breed_id() -> BreedId {
        BreedId::AbductiveLp
    }

    /// Single minimal explanation {uo_leak} of uo_alarm.
    fn novel_input() -> BreedInput {
        let mut input = base("uo_alp_explain");
        input.facts.push(fact("alp:abducible:uo_leak", "true"));
        input.facts.push(fact("alp:abducible:uo_surge", "true"));
        input
            .rules
            .push(rule("uo_r0", &["uo_leak"], "uo_alarm", 1.0));
        input.goals.push(goal("uo_o0", "alp:observe", "uo_alarm"));
        input
    }

    /// Unconstrained ({uo_leak}) vs IC blocking uo_leak (forces {uo_surge}).
    fn boundary_pair() -> (BreedInput, BreedInput) {
        let plain = Self::novel_input();
        let mut blocked = Self::novel_input();
        blocked
            .rules
            .push(rule("uo_r1", &["uo_surge"], "uo_alarm", 1.0));
        blocked.facts.push(fact("alp:ic:uo_i0", "uo_leak,uo_alarm"));
        (plain, blocked)
    }

    /// No alp:observe goal — nothing to explain, refused.
    fn refusal_input() -> BreedInput {
        let mut input = base("uo_alp_refuse");
        input.facts.push(fact("alp:abducible:uo_leak", "true"));
        input
            .rules
            .push(rule("uo_r0", &["uo_leak"], "uo_alarm", 1.0));
        input
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_non_empty()?;
        trace.require_first("load-abducibles")?;
        trace.require_kind("candidate-delta")?;
        trace.require_kind("explain-accept")?;
        trace.require_last("minimal-set")?;
        Ok(())
    }

    /// Values: the MINIMAL explanation {uo_leak} wins, the superset
    /// {uo_leak,uo_surge} is rejected as non-minimal, and the count matches.
    fn assert_trace_values(tq: &TraceQuery<'_>) -> Result<(), String> {
        let la = tq.detail_of("load-abducibles").ok_or("missing load-abducibles")?;
        if !la.contains("A={uo_leak,uo_surge}") || !la.contains("observe 'uo_alarm'") {
            return Err(format!("load-abducibles detail wrong: '{}'", la));
        }
        if tq.detail_of("explain-accept") != Some("Δ={uo_leak} explains 'uo_alarm'") {
            return Err(format!(
                "explain-accept must be the minimal Δ={{uo_leak}}, got {:?}",
                tq.detail_of("explain-accept")
            ));
        }
        if !tq
            .as_slice()
            .iter()
            .any(|t| t.kind == "explain-reject" && t.detail.contains("non-minimal (superset of accepted Δ)"))
        {
            return Err("missing non-minimal superset rejection step".into());
        }
        if tq.detail_of("minimal-set") != Some("1 minimal explanation(s)") {
            return Err(format!("minimal-set detail wrong: {:?}", tq.detail_of("minimal-set")));
        }
        Ok(())
    }
}

// ── AbductiveIbe ─────────────────────────────────────────────────────────────

impl BreedOracle for AbductiveIbe {
    fn breed_id() -> BreedId {
        BreedId::AbductiveIbe
    }

    /// Cheap partial hypothesis beats costly full-coverage one.
    fn novel_input() -> BreedInput {
        let mut input = base("uo_ibe_explain");
        input.facts.push(fact("ibe:obs:uo_o1", "true"));
        input.facts.push(fact("ibe:obs:uo_o2", "true"));
        input.facts.push(fact("ibe:obs:uo_o3", "true"));
        input
            .facts
            .push(fact("ibe:hyp:uo_grand:covers", "uo_o1,uo_o2,uo_o3"));
        input.facts.push(fact("ibe:hyp:uo_grand:cost", "25"));
        input
            .facts
            .push(fact("ibe:hyp:uo_lean:covers", "uo_o1,uo_o2"));
        input.facts.push(fact("ibe:hyp:uo_lean:cost", "2"));
        input
    }

    /// Flipping the cost structure flips the best explanation set.
    fn boundary_pair() -> (BreedInput, BreedInput) {
        let lean_wins = Self::novel_input();
        let mut grand_wins = Self::novel_input();
        for f in &mut grand_wins.facts {
            if f.key == "ibe:hyp:uo_grand:cost" {
                f.value = "1".to_string();
            }
        }
        (lean_wins, grand_wins)
    }

    /// Negative assumption cost is semantically invalid — refused.
    fn refusal_input() -> BreedInput {
        let mut input = base("uo_ibe_refuse");
        input.facts.push(fact("ibe:obs:uo_o1", "true"));
        input.facts.push(fact("ibe:hyp:uo_h1:covers", "uo_o1"));
        input.facts.push(fact("ibe:hyp:uo_h1:cost", "-3"));
        input
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_non_empty()?;
        trace.require_first("collect-observations")?;
        trace.require_at_least("score-hypothesis", 3)?;
        trace.require_kind("compare")?;
        trace.require_last("best-explanation")?;
        Ok(())
    }

    /// Values: hypotheses carry real numeric scores, the ranking comparison is
    /// recorded, and the cheap uo_lean hypothesis wins with its exact score.
    fn assert_trace_values(tq: &TraceQuery<'_>) -> Result<(), String> {
        if !tq
            .as_slice()
            .iter()
            .any(|t| t.kind == "score-hypothesis" && t.detail == "uo_grand score=0.5000")
        {
            return Err("missing 'uo_grand score=0.5000' score-hypothesis step".into());
        }
        if !tq
            .as_slice()
            .iter()
            .any(|t| t.kind == "score-hypothesis" && t.detail == "uo_lean score=1.8000")
        {
            return Err("missing 'uo_lean score=1.8000' score-hypothesis step".into());
        }
        let cmp = tq.last_of("compare").ok_or("missing compare")?;
        if !cmp.detail.contains("new best uo_lean (1.8000 beats uo_grand 0.5000)") {
            return Err(format!("compare must rank uo_lean over uo_grand, got '{}'", cmp.detail));
        }
        if tq.detail_of("best-explanation") != Some("uo_lean score=1.8000") {
            return Err(format!(
                "best-explanation must be uo_lean with score, got {:?}",
                tq.detail_of("best-explanation")
            ));
        }
        Ok(())
    }
}

// ── Problog ──────────────────────────────────────────────────────────────────

impl BreedOracle for Problog {
    fn breed_id() -> BreedId {
        BreedId::Problog
    }

    /// Noisy-or of two fresh probabilistic causes of uo_alarm.
    fn novel_input() -> BreedInput {
        let mut input = base("uo_problog_query");
        input.facts.push(fact("pfact:uo_burst", "0.3"));
        input.facts.push(fact("pfact:uo_quake", "0.2"));
        input
            .rules
            .push(rule("uo_r0", &["uo_burst"], "uo_alarm", 1.0));
        input
            .rules
            .push(rule("uo_r1", &["uo_quake"], "uo_alarm", 1.0));
        input.goals.push(goal("uo_g0", "query", "uo_alarm"));
        input
    }

    /// Different probability of the same cause yields different P(query).
    fn boundary_pair() -> (BreedInput, BreedInput) {
        let low = Self::novel_input();
        let mut high = Self::novel_input();
        for f in &mut high.facts {
            if f.key == "pfact:uo_burst" {
                f.value = "0.9".to_string();
            }
        }
        (low, high)
    }

    /// Probability outside [0,1] is refused.
    fn refusal_input() -> BreedInput {
        let mut input = base("uo_problog_refuse");
        input.facts.push(fact("pfact:uo_burst", "1.7"));
        input.goals.push(goal("uo_g0", "query", "uo_burst"));
        input
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_non_empty()?;
        trace.require_at_least("load-pfact", 2)?;
        // 2 pfacts → exactly 4 possible worlds enumerated.
        trace.require_count("enumerate-world", 4)?;
        trace.require_kind("sum-weight")?;
        trace.require_last("decision")?;
        Ok(())
    }

    /// Values: world weights and the exact noisy-or probability
    /// P = 0.3 + 0.2 - 0.06 = 0.44 (not a degenerate 0 / 0.5 / 1).
    fn assert_trace_values(tq: &TraceQuery<'_>) -> Result<(), String> {
        if tq.detail_of("load-pfact") != Some("0.300000::uo_burst") {
            return Err(format!("load-pfact[0] wrong: {:?}", tq.detail_of("load-pfact")));
        }
        if !tq
            .as_slice()
            .iter()
            .any(|t| t.kind == "enumerate-world"
                && t.detail == "world {uo_burst,uo_quake} w=0.060000 |= uo_alarm : true")
        {
            return Err("missing joint world {uo_burst,uo_quake} with weight 0.06".into());
        }
        let sw = tq.last_of("sum-weight").ok_or("missing sum-weight")?;
        if sw.detail != "+0.060000 -> P=0.440000" {
            return Err(format!("final sum-weight wrong: '{}'", sw.detail));
        }
        if tq.detail_of("decision") != Some("P(uo_alarm) = 0.440000 over 4 worlds") {
            return Err(format!(
                "decision must report exact P=0.440000, got {:?}",
                tq.detail_of("decision")
            ));
        }
        Ok(())
    }
}

// ── Clp ──────────────────────────────────────────────────────────────────────

impl BreedOracle for Clp {
    fn breed_id() -> BreedId {
        BreedId::Clp
    }

    /// Chain uo_x < uo_y <= 2 over 1..4: propagation forces uo_x=1, uo_y=2.
    fn novel_input() -> BreedInput {
        let mut input = base("uo_clp_solve");
        input.facts.push(fact("clp:var:uo_x", "1..4"));
        input.facts.push(fact("clp:var:uo_y", "1..4"));
        input.facts.push(fact("clp:constraint:uo_c0", "uo_x<uo_y"));
        input.facts.push(fact("clp:constraint:uo_c1", "uo_y<=2"));
        input
    }

    /// Solvable store vs domain-wipeout (inconsistent) store.
    fn boundary_pair() -> (BreedInput, BreedInput) {
        let solvable = Self::novel_input();
        let mut wipeout = base("uo_clp_wipeout");
        wipeout.facts.push(fact("clp:var:uo_x", "4..4"));
        wipeout.facts.push(fact("clp:var:uo_y", "1..3"));
        wipeout.facts.push(fact("clp:constraint:uo_c0", "uo_x<uo_y"));
        (solvable, wipeout)
    }

    /// Constraint over an undeclared variable is refused.
    fn refusal_input() -> BreedInput {
        let mut input = base("uo_clp_refuse");
        input.facts.push(fact("clp:var:uo_x", "1..3"));
        input
            .facts
            .push(fact("clp:constraint:uo_c0", "uo_x<uo_ghost"));
        input
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_non_empty()?;
        trace.require_first("post-constraint")?;
        trace.require_count("post-constraint", 2)?;
        trace.require_kind("propagate")?;
        trace.require_last("solution")?;
        Ok(())
    }

    /// Values: propagation actually NARROWS domains (uo_y to {2}, uo_x to {1})
    /// and the solution carries the forced assignment.
    fn assert_trace_values(tq: &TraceQuery<'_>) -> Result<(), String> {
        if tq.detail_of("post-constraint") != Some("uo_c0: uo_x<uo_y") {
            return Err(format!(
                "post-constraint[0] wrong: {:?}",
                tq.detail_of("post-constraint")
            ));
        }
        if !tq
            .as_slice()
            .iter()
            .any(|t| t.kind == "propagate" && t.detail == "uo_y: {2,3,4} -> {2}")
        {
            return Err("missing narrowing propagation 'uo_y: {2,3,4} -> {2}'".into());
        }
        if !tq
            .as_slice()
            .iter()
            .any(|t| t.kind == "propagate" && t.detail == "uo_x: {1,2,3} -> {1}")
        {
            return Err("missing narrowing propagation 'uo_x: {1,2,3} -> {1}'".into());
        }
        if tq.detail_of("solution") != Some("uo_x=1,uo_y=2") {
            return Err(format!(
                "solution must be the propagated assignment uo_x=1,uo_y=2, got {:?}",
                tq.detail_of("solution")
            ));
        }
        Ok(())
    }
}

// ── AllenTemporal ────────────────────────────────────────────────────────────

impl BreedOracle for AllenTemporal {
    fn breed_id() -> BreedId {
        BreedId::AllenTemporal
    }

    /// p∘p chain over fresh intervals: uo_a before uo_b before uo_c.
    fn novel_input() -> BreedInput {
        let mut input = base("uo_allen_chain");
        input.facts.push(fact("relation", "uo_a,uo_b,p"));
        input.facts.push(fact("relation", "uo_b,uo_c,p"));
        input
    }

    /// `uo_a p uo_b` vs `uo_a pi uo_b` derive opposite relation facts.
    fn boundary_pair() -> (BreedInput, BreedInput) {
        let mut before = base("uo_allen_before");
        before.facts.push(fact("relation", "uo_a,uo_b,p"));
        before
            .state
            .push(state_atom("interval", "uo_a,1,2"));
        before
            .state
            .push(state_atom("interval", "uo_b,3,4"));
        let mut after = base("uo_allen_after");
        after.facts.push(fact("relation", "uo_a,uo_b,pi"));
        after
            .state
            .push(state_atom("interval", "uo_a,3,4"));
        after
            .state
            .push(state_atom("interval", "uo_b,1,2"));
        (before, after)
    }

    /// Relation fact with no valid relation symbols is refused.
    fn refusal_input() -> BreedInput {
        let mut input = base("uo_allen_refuse");
        input
            .facts
            .push(fact("relation", "uo_a,uo_b,uo_notarel"));
        input
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_non_empty()?;
        trace.require_at_least("allen-load", 2)?;
        trace.require_kind("allen-compose")?;
        trace.require_count("allen-verdict", 1)?;
        trace.require_last("allen-verdict")?;
        Ok(())
    }

    /// Values: composition p∘p yields the derived inverse relation
    /// uo_c {pi} uo_a (a single relation, not the vacuous full set).
    fn assert_trace_values(tq: &TraceQuery<'_>) -> Result<(), String> {
        if tq.detail_of("allen-load") != Some("rel uo_a,uo_b,p") {
            return Err(format!("allen-load[0] wrong: {:?}", tq.detail_of("allen-load")));
        }
        tq.require_count("allen-load", 2)?;
        if tq.detail_of("allen-compose") != Some("uo_c via uo_b -> uo_a: pi") {
            return Err(format!(
                "allen-compose must derive uo_c pi uo_a via uo_b, got {:?}",
                tq.detail_of("allen-compose")
            ));
        }
        if tq.detail_of("allen-verdict") != Some("path-consistency-fixpoint") {
            return Err(format!(
                "allen-verdict wrong: {:?}",
                tq.detail_of("allen-verdict")
            ));
        }
        Ok(())
    }
}

// ── Meta-oracle adversaries (U6) ─────────────────────────────────────────────
//
// Each `Cheat*` embodies the breed's predicted primary cheat mode from the
// Combined Breed Standing Table. Outputs carry plausible step KINDS but
// hollow, wrong, or skipped-work details, so `assert_trace_values` rejects.

/// AC-PARTIAL: loads clauses then declares SAT without any decide/propagate.
pub struct CheatSatCdcl;
impl BreedAdversary for CheatSatCdcl {
    type Target = SatCdcl;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        uo_cheat_output(
            BreedId::SatCdcl,
            &[
                ("load-clause", "c0: (3 -4 5)"),
                ("load-clause", "c1: (-3 5)"),
                ("load-clause", "c2: (3 4 -5)"),
                ("decision", "SAT (3 input clauses, 0 learned)"),
            ],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-PARTIAL"
    }
}

/// AC-PARTIAL: closes the tableau without performing any expansion steps.
pub struct CheatTableaux;
impl BreedAdversary for CheatTableaux {
    type Target = Tableaux;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        uo_cheat_output(
            BreedId::Tableaux,
            &[
                ("parse-formula", "(uo_p -> (uo_q -> uo_p))"),
                ("sign-root", "F (uo_p -> (uo_q -> uo_p))"),
                ("close-branch", "clash on 'uo_p' (F uo_p)"),
                ("verdict", "valid (all branches closed)"),
            ],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-PARTIAL"
    }
}

/// AC-PARTIAL: skips fixpoint labelling and emits an unsupported verdict.
pub struct CheatCtlCheck;
impl BreedAdversary for CheatCtlCheck {
    type Target = CtlCheck;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        uo_cheat_output(
            BreedId::CtlCheck,
            &[
                ("parse-formula", "A G uo_live over 2 states (init=uo_s0)"),
                ("label-states", "uo_hollow"),
                ("decision", "A G uo_live FAILS at init state uo_s0"),
            ],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-PARTIAL"
    }
}

/// AC-ALWAYS: always answers "true" with a single hollow progression step.
pub struct CheatLtlMonitor;
impl BreedAdversary for CheatLtlMonitor {
    type Target = LtlMonitor;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        uo_cheat_output(
            BreedId::LtlMonitor,
            &[
                ("ltl-init", "G uo_ok"),
                ("ltl-progress", "uo_hollow"),
                ("ltl-verdict", "true"),
            ],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-ALWAYS"
    }
}

/// AC-TABLE: answers the subsumption query by table lookup of the asserted
/// axioms — never derives the transitive composition via uo_Mammal.
pub struct CheatDescriptionLogic;
impl BreedAdversary for CheatDescriptionLogic {
    type Target = DescriptionLogic;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        uo_cheat_output(
            BreedId::DescriptionLogic,
            &[
                ("normalize", "3 concepts, 2 subclass, 0 conj, 0 exists-rhs, 0 exists-lhs axioms"),
                ("apply-cr1", "uo_Cat ⊑ uo_Mammal (via uo_Cat ⊑ uo_Mammal)"),
                ("apply-cr1", "uo_Mammal ⊑ uo_Animal (via uo_Mammal ⊑ uo_Animal)"),
                ("fixpoint", "saturated: 5 subsumptions, 0 role edges"),
                ("classify-verdict", "uo_Cat ⊑ uo_Animal : true"),
            ],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-TABLE"
    }
}

/// AC-PARTIAL: enumerates hollow models and never computes the minimal model.
pub struct CheatCircumscription;
impl BreedAdversary for CheatCircumscription {
    type Target = Circumscription;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        uo_cheat_output(
            BreedId::Circumscription,
            &[
                ("load-defaults", "1 rules; abnormality atoms: {ab_uo_wing}"),
                ("enumerate-model", "uo_hollow"),
                ("enumerate-model", "uo_hollow"),
                ("entail", "uo_glides |= true in 1/1 minimal models -> true"),
                ("decision", "1 minimal models; cautiously entailed: {uo_glides}"),
            ],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-PARTIAL"
    }
}

/// AC-FLAT: emits flat all-zero distance vectors and an empty merged result.
pub struct CheatBeliefMerging;
impl BreedAdversary for CheatBeliefMerging {
    type Target = BeliefMerging;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        uo_cheat_output(
            BreedId::BeliefMerging,
            &[
                ("enumerate-worlds", "2 atoms -> 4 worlds, 3 bases"),
                ("distance", "w=(-uo_p,-uo_q) d=(0,0,0)"),
                ("distance", "w=(uo_p,-uo_q) d=(0,0,0)"),
                ("distance", "w=(-uo_p,uo_q) d=(0,0,0)"),
                ("distance", "w=(uo_p,uo_q) d=(0,0,0)"),
                ("select-min", "4 minimal world(s) under Σ"),
                ("merged-belief", "[]"),
            ],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-FLAT"
    }
}

/// AC-GREEDY: accepts the first superset it derives, skipping minimality.
pub struct CheatAbductiveLp;
impl BreedAdversary for CheatAbductiveLp {
    type Target = AbductiveLp;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        uo_cheat_output(
            BreedId::AbductiveLp,
            &[
                ("load-abducibles", "A={uo_leak,uo_surge}, 0 ICs, observe 'uo_alarm'"),
                ("candidate-delta", "Δ={uo_leak,uo_surge}"),
                ("explain-accept", "Δ={uo_leak,uo_surge} explains 'uo_alarm'"),
                ("minimal-set", "1 minimal explanation(s)"),
            ],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-GREEDY"
    }
}

/// AC-GREEDY: keeps the first-scored hypothesis without comparing the rest.
pub struct CheatAbductiveIbe;
impl BreedAdversary for CheatAbductiveIbe {
    type Target = AbductiveIbe;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        uo_cheat_output(
            BreedId::AbductiveIbe,
            &[
                ("collect-observations", "3 observations [uo_o1,uo_o2,uo_o3], 2 hypotheses"),
                ("score-hypothesis", "uo_grand score=0.5000"),
                ("compare", "new best uo_grand (0.5000)"),
                ("score-hypothesis", "uo_lean score=1.8000"),
                ("score-hypothesis", "uo_grand+uo_lean score=0.3000"),
                ("best-explanation", "uo_grand score=0.5000"),
            ],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-GREEDY"
    }
}

/// AC-PARTIAL: enumerates hollow worlds and reports a coin-flip probability.
pub struct CheatProblog;
impl BreedAdversary for CheatProblog {
    type Target = Problog;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        uo_cheat_output(
            BreedId::Problog,
            &[
                ("load-pfact", "0.300000::uo_burst"),
                ("load-pfact", "0.200000::uo_quake"),
                ("enumerate-world", "uo_hollow"),
                ("enumerate-world", "uo_hollow"),
                ("enumerate-world", "uo_hollow"),
                ("enumerate-world", "uo_hollow"),
                ("sum-weight", "+0.500000 -> P=0.500000"),
                ("decision", "P(uo_alarm) = 0.500000 over 4 worlds"),
            ],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-PARTIAL"
    }
}

/// AC-FLAT: posts constraints but propagation never narrows any domain.
pub struct CheatClp;
impl BreedAdversary for CheatClp {
    type Target = Clp;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        uo_cheat_output(
            BreedId::Clp,
            &[
                ("post-constraint", "uo_c0: uo_x<uo_y"),
                ("post-constraint", "uo_c1: uo_y<=2"),
                ("propagate", "uo_x: {1,2,3,4} -> {1,2,3,4}"),
                ("propagate", "uo_y: {1,2,3,4} -> {1,2,3,4}"),
                ("solution", "uo_x=1,uo_y=1"),
            ],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-FLAT"
    }
}

/// AC-PARTIAL: loads relations then emits the vacuous full relation set
/// instead of the composed {pi}.
pub struct CheatAllenTemporal;
impl BreedAdversary for CheatAllenTemporal {
    type Target = AllenTemporal;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        uo_cheat_output(
            BreedId::AllenTemporal,
            &[
                ("allen-load", "rel uo_a,uo_b,p"),
                ("allen-load", "rel uo_b,uo_c,p"),
                ("allen-compose", "uo_c via uo_b -> uo_a: p,pi,d,di,o,oi,m,mi,s,si,f,fi,e"),
                ("allen-verdict", "path-consistency-fixpoint"),
            ],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-PARTIAL"
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use crate::breeds::support::oracle::run_universal_anticheat;

    fn assert_green<B: BreedOracle>(name: &str) {
        for r in run_universal_anticheat::<B>() {
            assert!(r.is_pass(), "{}: {:?}", name, r);
        }
    }

    /// Run the real breed on its novel input and require the Surface-3 value
    /// assertions to pass on the genuine trace.
    fn assert_values_green<B: BreedOracle>(name: &str) {
        use crate::breeds::dispatch::dispatch_breed_id;
        let out = dispatch_breed_id(B::breed_id(), &B::novel_input())
            .unwrap_or_else(|e| panic!("{}: novel_input run failed: {}", name, e));
        let tq = TraceQuery::new(&out.inference_trace);
        if let Err(e) = B::assert_trace_values(&tq) {
            panic!("{}: assert_trace_values rejected the REAL trace: {}", name, e);
        }
    }

    fn assert_cheat_rejected<A: BreedAdversary>(name: &str) {
        use crate::breeds::support::oracle::run_adversary_check;
        let r = run_adversary_check::<A>();
        assert!(
            r.is_pass(),
            "{}: oracle failed to reject {} adversary: {:?}",
            name,
            A::cheat_code(),
            r
        );
    }

    #[test]
    fn logic_trace_values_pass_on_real_traces() {
        assert_values_green::<SatCdcl>("sat_cdcl");
        assert_values_green::<Tableaux>("tableaux");
        assert_values_green::<CtlCheck>("ctl_check");
        assert_values_green::<LtlMonitor>("ltl_monitor");
        assert_values_green::<DescriptionLogic>("description_logic");
        assert_values_green::<Circumscription>("circumscription");
        assert_values_green::<BeliefMerging>("belief_merging");
        assert_values_green::<AbductiveLp>("abductive_lp");
        assert_values_green::<AbductiveIbe>("abductive_ibe");
        assert_values_green::<Problog>("problog");
        assert_values_green::<Clp>("clp");
        assert_values_green::<AllenTemporal>("allen_temporal");
    }

    #[test]
    fn logic_adversaries_are_rejected_u6() {
        assert_cheat_rejected::<CheatSatCdcl>("sat_cdcl");
        assert_cheat_rejected::<CheatTableaux>("tableaux");
        assert_cheat_rejected::<CheatCtlCheck>("ctl_check");
        assert_cheat_rejected::<CheatLtlMonitor>("ltl_monitor");
        assert_cheat_rejected::<CheatDescriptionLogic>("description_logic");
        assert_cheat_rejected::<CheatCircumscription>("circumscription");
        assert_cheat_rejected::<CheatBeliefMerging>("belief_merging");
        assert_cheat_rejected::<CheatAbductiveLp>("abductive_lp");
        assert_cheat_rejected::<CheatAbductiveIbe>("abductive_ibe");
        assert_cheat_rejected::<CheatProblog>("problog");
        assert_cheat_rejected::<CheatClp>("clp");
        assert_cheat_rejected::<CheatAllenTemporal>("allen_temporal");
    }

    #[test]
    fn logic_oracles_pass_universal_anticheat() {
        assert_green::<SatCdcl>("sat_cdcl");
        assert_green::<Tableaux>("tableaux");
        assert_green::<CtlCheck>("ctl_check");
        assert_green::<LtlMonitor>("ltl_monitor");
        assert_green::<DescriptionLogic>("description_logic");
        assert_green::<Circumscription>("circumscription");
        assert_green::<BeliefMerging>("belief_merging");
        assert_green::<AbductiveLp>("abductive_lp");
        assert_green::<AbductiveIbe>("abductive_ibe");
        assert_green::<Problog>("problog");
        assert_green::<Clp>("clp");
        assert_green::<AllenTemporal>("allen_temporal");
    }
}
