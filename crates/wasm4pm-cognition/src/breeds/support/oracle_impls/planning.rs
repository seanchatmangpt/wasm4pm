//! [`BreedOracle`] implementations for the 12 planning / action / decision
//! breeds: strips, gps, htn_planning, partial_order_plan, contingent_plan,
//! event_calculus, situation_calculus, soar, act_r, rl_symbolic, pomdp,
//! markov_logic.
//!
//! All novel content uses fresh `uo_` prefixed names that appear in no
//! public fixture (defeats A1/A2). Refusal inputs are routed through the
//! same `dispatch_breed_test_id` path the harness uses, so each refusal is
//! one the breed's `run()` itself rejects (where the breed has a run-level
//! refusal at all).

use super::{base, candidate, case, fact, goal, rule, state_atom};
use crate::breeds::act_r::ActR;
use crate::breeds::contingent_plan::ContingentPlan;
use crate::breeds::event_calculus::EventCalculus;
use crate::breeds::gps::Gps;
use crate::breeds::htn_planning::HtnPlanning;
use crate::breeds::markov_logic::MarkovLogic;
use crate::breeds::partial_order_plan::PartialOrderPlan;
use crate::breeds::pomdp::Pomdp;
use crate::breeds::rl_symbolic::RlSymbolic;
use crate::breeds::situation_calculus::SituationCalculus;
use crate::breeds::soar::Soar;
use crate::breeds::strips::Strips;
use crate::breeds::support::oracle::{BreedAdversary, BreedOracle};
use crate::breeds::support::trace_query::TraceQuery;
use crate::breeds::{BreedId, BreedInput, BreedOutput, TraceStep};

// ───────────────────────────── STRIPS ──────────────────────────────────────

impl BreedOracle for Strips {
    fn breed_id() -> BreedId {
        BreedId::Strips
    }

    /// One-step haul: a crate at a dock must reach the loft.
    fn novel_input() -> BreedInput {
        let mut input = base("uo_haul crate from dock to loft");
        input.state = vec![state_atom("uo_crate_at", "uo_dock")];
        input.goals = vec![goal("uo_g1", "uo_crate_at", "uo_loft")];
        input.rules = vec![rule(
            "uo_haul_dock_to_loft",
            &["uo_crate_at=uo_dock"],
            "uo_crate_at=uo_loft",
            1.0,
        )];
        input
    }

    /// Achievable goal (one-step plan) vs pre-satisfied goal (empty plan):
    /// `selected` is `Some("uo_haul_dock_to_loft")` vs `Some("")`.
    fn boundary_pair() -> (BreedInput, BreedInput) {
        let a = Self::novel_input();
        let mut b = Self::novel_input();
        b.goals = vec![goal("uo_g1", "uo_crate_at", "uo_dock")];
        (a, b)
    }

    /// Goal no rule can conclude — IDFS exhausts depth, run() returns Err.
    fn refusal_input() -> BreedInput {
        let mut input = Self::novel_input();
        input.goals = vec![goal("uo_g1", "uo_crate_at", "uo_sky")];
        input
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_at_least("subgoal", 1)?;
        trace.require_at_least("execute", 1)?;
        Ok(())
    }

    fn assert_trace_values(trace: &TraceQuery<'_>) -> Result<(), String> {
        // The regressed subgoal must be the actual goal atom.
        let sub = trace
            .detail_of("subgoal")
            .ok_or_else(|| "missing subgoal step".to_string())?;
        if sub != "uo_crate_at=uo_loft" {
            return Err(format!(
                "subgoal must be 'uo_crate_at=uo_loft', got '{}'",
                sub
            ));
        }
        // Precondition check happened: the action was tried (applicability
        // gate passed) before being executed.
        let tried = trace
            .detail_of("try-action")
            .ok_or_else(|| "missing try-action step (precondition check)".to_string())?;
        if !tried.contains("uo_haul_dock_to_loft") {
            return Err(format!(
                "try-action must name uo_haul_dock_to_loft, got '{}'",
                tried
            ));
        }
        let detail = trace
            .detail_of("execute")
            .ok_or_else(|| "missing execute step".to_string())?;
        if detail.contains("uo_haul_dock_to_loft") {
            Ok(())
        } else {
            Err(format!(
                "execute step must name the haul action, got '{}'",
                detail
            ))
        }
    }
}

// ─────────────────────────────── GPS ───────────────────────────────────────

impl BreedOracle for Gps {
    fn breed_id() -> BreedId {
        BreedId::Gps
    }

    /// Smelting: raw ore plus a ready flux yields a cast ingot.
    fn novel_input() -> BreedInput {
        let mut input = base("uo_smelt ore into ingot");
        input.state = vec![
            state_atom("uo_ore", "uo_raw"),
            state_atom("uo_flux", "uo_ready"),
        ];
        input.goals = vec![goal("uo_g1", "uo_ingot", "uo_cast")];
        input.rules = vec![rule(
            "uo_smelt_ore",
            &["uo_ore=uo_raw", "uo_flux=uo_ready"],
            "uo_ingot=uo_cast",
            1.0,
        )];
        input
    }

    /// Achievable goal (plan contains the smelt operator) vs pre-satisfied
    /// goal (empty plan): `selected` differs.
    fn boundary_pair() -> (BreedInput, BreedInput) {
        let a = Self::novel_input();
        let mut b = Self::novel_input();
        b.goals = vec![goal("uo_g1", "uo_ore", "uo_raw")];
        (a, b)
    }

    /// Goal no operator concludes — means-ends recursion fails, run() Errs.
    fn refusal_input() -> BreedInput {
        let mut input = Self::novel_input();
        input.goals = vec![goal("uo_g1", "uo_gem", "uo_cut")];
        input
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_at_least("reduce-gap", 1)?;
        trace.require_at_least("apply-operator", 1)?;
        Ok(())
    }

    fn assert_trace_values(trace: &TraceQuery<'_>) -> Result<(), String> {
        // Means-ends analysis: the gap reduced must be the actual goal atom.
        let gap = trace
            .detail_of("reduce-gap")
            .ok_or_else(|| "missing reduce-gap step".to_string())?;
        if gap != "uo_ingot=uo_cast" {
            return Err(format!(
                "reduce-gap must target 'uo_ingot=uo_cast', got '{}'",
                gap
            ));
        }
        let detail = trace
            .detail_of("apply-operator")
            .ok_or_else(|| "missing apply-operator step".to_string())?;
        if detail.contains("uo_smelt_ore") {
            Ok(())
        } else {
            Err(format!(
                "apply-operator must name uo_smelt_ore, got '{}'",
                detail
            ))
        }
    }
}

// ─────────────────────────── HTN planning ──────────────────────────────────

impl BreedOracle for HtnPlanning {
    fn breed_id() -> BreedId {
        BreedId::HtnPlanning
    }

    /// Single task `uo_trek` decomposed by one method into one operator.
    fn novel_input() -> BreedInput {
        let mut input = base("uo_trek across the vale");
        input.state = vec![state_atom("uo_at", "uo_glen")];
        input.goals = vec![goal("uo_g1", "task", "uo_trek")];
        input.rules = vec![
            rule(
                "method:uo_trek:uo_onfoot",
                &["uo_at=uo_glen"],
                "op:uo_stride",
                1.0,
            ),
            rule("op:uo_stride", &[], "!uo_at=uo_glen;uo_at=uo_vale", 1.0),
            rule("op:uo_glide", &[], "!uo_at=uo_glen;uo_at=uo_vale", 1.0),
        ];
        input
    }

    /// Same task, but the method decomposes to a different operator →
    /// `selected` plan differs (`op:uo_stride` vs `op:uo_glide`).
    fn boundary_pair() -> (BreedInput, BreedInput) {
        let a = Self::novel_input();
        let mut b = Self::novel_input();
        b.rules[0] = rule(
            "method:uo_trek:uo_onfoot",
            &["uo_at=uo_glen"],
            "op:uo_glide",
            1.0,
        );
        (a, b)
    }

    /// Task with NO matching method — htn_seek exhausts and run() Errs.
    fn refusal_input() -> BreedInput {
        let mut input = base("uo_trek without methods");
        input.goals = vec![goal("uo_g1", "task", "uo_trek")];
        input.rules = vec![rule("op:uo_stride", &[], "uo_at=uo_vale", 1.0)];
        input
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_at_least("htn-decompose", 1)?;
        trace.require_count("htn-plan", 1)?;
        Ok(())
    }

    fn assert_trace_values(trace: &TraceQuery<'_>) -> Result<(), String> {
        // Decomposition must name the actual method for task uo_trek.
        let detail = trace
            .detail_of("htn-decompose")
            .ok_or_else(|| "missing htn-decompose step".to_string())?;
        if detail != "method:uo_trek:uo_onfoot" {
            return Err(format!(
                "htn-decompose must use method:uo_trek:uo_onfoot, got '{}'",
                detail
            ));
        }
        // The decomposed primitive operator must actually be applied.
        let applied = trace
            .detail_of("htn-apply")
            .ok_or_else(|| "missing htn-apply step".to_string())?;
        if applied != "op:uo_stride" {
            return Err(format!(
                "htn-apply must apply op:uo_stride, got '{}'",
                applied
            ));
        }
        let plan = trace
            .detail_of("htn-plan")
            .ok_or_else(|| "missing htn-plan step".to_string())?;
        if plan.contains("op:uo_stride") {
            Ok(())
        } else {
            Err(format!(
                "htn-plan must contain op:uo_stride, got '{}'",
                plan
            ))
        }
    }
}

// ──────────────────────── Partial-order planning ───────────────────────────

impl BreedOracle for PartialOrderPlan {
    fn breed_id() -> BreedId {
        BreedId::PartialOrderPlan
    }

    /// One operator `uo_rig` adds the single goal atom `uo_mast_up`.
    fn novel_input() -> BreedInput {
        let mut input = base("uo_rig the mast");
        input.facts = vec![
            fact("pop:op:uo_rig:pre", "uo_deck_clear"),
            fact("pop:op:uo_rig:add", "uo_mast_up"),
        ];
        input.state = vec![state_atom("uo_deck_clear", "true")];
        input.goals = vec![goal("uo_g1", "uo_mast_up", "true")];
        input
    }

    /// Goal needs the operator vs goal already provided by the initial state
    /// (`__start__`): plans `"uo_rig"` vs `""` differ.
    fn boundary_pair() -> (BreedInput, BreedInput) {
        let a = Self::novel_input();
        let mut b = Self::novel_input();
        b.state.push(state_atom("uo_mast_up", "true"));
        (a, b)
    }

    /// Operator set cannot produce the goal atom — run() Errs "no plan exists".
    fn refusal_input() -> BreedInput {
        let mut input = Self::novel_input();
        input.goals = vec![goal("uo_g1", "uo_anchor_down", "true")];
        input
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_first("pop-init")?;
        trace.require_count("pop-plan", 1)?;
        Ok(())
    }

    fn assert_trace_values(trace: &TraceQuery<'_>) -> Result<(), String> {
        // A causal link for the goal atom must be recorded during refinement.
        let link_recorded = trace
            .as_slice()
            .iter()
            .any(|t| t.kind == "pop-resolve" && t.detail.contains("--uo_mast_up-->"));
        if !link_recorded {
            return Err("pop-resolve must record a causal link --uo_mast_up-->".to_string());
        }
        let init = trace
            .detail_of("pop-init")
            .ok_or_else(|| "missing pop-init step".to_string())?;
        if !init.contains("uo_mast_up") {
            return Err(format!(
                "pop-init must list goal uo_mast_up, got '{}'",
                init
            ));
        }
        let detail = trace
            .detail_of("pop-plan")
            .ok_or_else(|| "missing pop-plan step".to_string())?;
        if detail.contains("uo_rig") {
            Ok(())
        } else {
            Err(format!("pop-plan must include uo_rig, got '{}'", detail))
        }
    }
}

// ───────────────────────── Contingent planning ─────────────────────────────

impl BreedOracle for ContingentPlan {
    fn breed_id() -> BreedId {
        BreedId::ContingentPlan
    }

    /// Unknown grime atom: sense it, scrub it away in the true branch.
    fn novel_input() -> BreedInput {
        let mut input = base("uo_clean the hull");
        input.facts = vec![
            fact("cp:unknown", "uo_grime"),
            fact("cp:goal:uo_grime", "false"),
            fact("cp:act:uo_scrub:pre", "uo_grime"),
            fact("cp:act:uo_scrub:del", "uo_grime"),
            fact("cp:sense:uo_probe", "uo_grime"),
        ];
        input
    }

    /// Sensing plan over an unknown atom vs a fully-known initial state:
    /// conditional tree vs a single unconditional act — plan trees differ.
    fn boundary_pair() -> (BreedInput, BreedInput) {
        let a = Self::novel_input();
        let mut b = base("uo_clean the hull");
        b.facts = vec![
            fact("cp:init:uo_grime", "true"),
            fact("cp:goal:uo_grime", "false"),
            fact("cp:act:uo_scrub:pre", "uo_grime"),
            fact("cp:act:uo_scrub:del", "uo_grime"),
        ];
        (a, b)
    }

    /// No `cp:goal:` fact at all — parse_problem (called by run) refuses.
    fn refusal_input() -> BreedInput {
        let mut input = base("uo_clean with no goal");
        input.facts = vec![
            fact("cp:act:uo_scrub:pre", "uo_grime"),
            fact("cp:act:uo_scrub:del", "uo_grime"),
        ];
        input
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_at_least("or-expand", 1)?;
        trace.require_at_least("goal-reached", 1)?;
        trace.require_kind("plan-complete")?;
        Ok(())
    }

    fn assert_trace_values(trace: &TraceQuery<'_>) -> Result<(), String> {
        // Sensing must branch the belief into exactly 1 true-world / 1
        // false-world (2 outcomes of probing the unknown grime atom).
        let branch = trace
            .detail_of("sense-branch")
            .ok_or_else(|| "missing sense-branch step".to_string())?;
        if !(branch.contains("uo_probe") && branch.contains("1 true-world(s) / 1 false-world(s)")) {
            return Err(format!(
                "sense-branch must split uo_probe into 1/1 worlds, got '{}'",
                branch
            ));
        }
        trace.require_kind("and-join")?;
        let plan = trace
            .detail_of("plan-complete")
            .ok_or_else(|| "missing plan-complete step".to_string())?;
        if plan.contains("sense uo_probe uo_grime") && plan.contains("act uo_scrub") {
            Ok(())
        } else {
            Err(format!(
                "plan must sense uo_probe and scrub in the true branch, got '{}'",
                plan
            ))
        }
    }
}

// ─────────────────────────── Event calculus ────────────────────────────────

impl BreedOracle for EventCalculus {
    fn breed_id() -> BreedId {
        BreedId::EventCalculus
    }

    /// A spark at t=3 initiates a glow; query HoldsAt(uo_glow, 5) = true.
    fn novel_input() -> BreedInput {
        let mut input = base("uo_lantern narrative");
        input.facts = vec![
            fact("ec:happens:3", "uo_spark"),
            fact("ec:initiates:uo_spark", "uo_glow"),
        ];
        input.goals = vec![goal("uo_q1", "ec:holdsat", "uo_glow@5")];
        input
    }

    /// Query after the initiating event (true) vs before it (false):
    /// `ec:verdict:` facts differ.
    fn boundary_pair() -> (BreedInput, BreedInput) {
        let a = Self::novel_input();
        let mut b = Self::novel_input();
        b.goals = vec![goal("uo_q1", "ec:holdsat", "uo_glow@2")];
        (a, b)
    }

    /// Non-numeric event time — parse_narrative (called by run) refuses.
    fn refusal_input() -> BreedInput {
        let mut input = Self::novel_input();
        input.facts.push(fact("ec:happens:uo_dawn", "uo_spark"));
        input
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_first("ec-load")?;
        trace.require_at_least("ec-infer", 1)?;
        trace.require_last("ec-model")?;
        Ok(())
    }

    fn assert_trace_values(trace: &TraceQuery<'_>) -> Result<(), String> {
        // The clipping check over the exact interval [3,5) must be performed
        // and come out unclipped (inertia), and the verdict must be true.
        let clip_checked = trace
            .as_slice()
            .iter()
            .any(|t| t.kind == "ec-infer" && t.detail.contains("Clipped(3,uo_glow,5) = false"));
        if !clip_checked {
            return Err("ec-infer must check Clipped(3,uo_glow,5) = false (inertia)".to_string());
        }
        let verdict = trace
            .as_slice()
            .iter()
            .any(|t| t.kind == "ec-infer" && t.detail.contains("HoldsAt(uo_glow,5) = true"));
        if verdict {
            Ok(())
        } else {
            Err("ec-infer must conclude HoldsAt(uo_glow,5) = true".to_string())
        }
    }
}

// ────────────────────────── Situation calculus ─────────────────────────────

impl BreedOracle for SituationCalculus {
    fn breed_id() -> BreedId {
        BreedId::SituationCalculus
    }

    /// Dousing a lit lamp; an untouched seal fluent persists by inertia.
    fn novel_input() -> BreedInput {
        let mut input = base("uo_douse the lamp");
        input.facts = vec![
            fact("fluent:uo_lamp_lit", "true"),
            fact("fluent:uo_seal_wax", "true"),
            fact("action:uo_douse:pre", "uo_lamp_lit"),
            fact("action:uo_douse:del", "uo_lamp_lit"),
            fact("action:uo_douse:add", "uo_lamp_dark"),
            fact("do:0", "uo_douse"),
        ];
        input
    }

    /// Different action executed from the same initial situation:
    /// final `holds:` facts differ (lamp doused vs seal polished).
    fn boundary_pair() -> (BreedInput, BreedInput) {
        let a = Self::novel_input();
        let mut b = Self::novel_input();
        b.facts.push(fact("action:uo_polish:pre", "uo_seal_wax"));
        b.facts.push(fact("action:uo_polish:add", "uo_seal_shine"));
        for f in b.facts.iter_mut() {
            if f.key == "do:0" {
                f.value = "uo_polish".to_string();
            }
        }
        (a, b)
    }

    /// No `do:<n>` action steps — preconditions (invoked inside run) refuse.
    fn refusal_input() -> BreedInput {
        let mut input = base("uo_douse with no actions");
        input.facts = vec![
            fact("fluent:uo_lamp_lit", "true"),
            fact("action:uo_douse:pre", "uo_lamp_lit"),
            fact("action:uo_douse:del", "uo_lamp_lit"),
        ];
        input
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_kind("load-axioms")?;
        trace.require_at_least("regress-step", 1)?;
        trace.require_kind("decision")?;
        Ok(())
    }

    fn assert_trace_values(trace: &TraceQuery<'_>) -> Result<(), String> {
        // Successor-state axiom must record BOTH the positive effect
        // (+uo_lamp_dark) and the negative effect (-uo_lamp_lit) of uo_douse.
        let regress = trace
            .detail_of("regress-step")
            .ok_or_else(|| "missing regress-step".to_string())?;
        if !(regress.contains("do(uo_douse, s0)")
            && regress.contains("+{uo_lamp_dark}")
            && regress.contains("-{uo_lamp_lit}"))
        {
            return Err(format!(
                "regress-step must record do(uo_douse, s0) with +uo_lamp_dark/-uo_lamp_lit, got '{}'",
                regress
            ));
        }
        let persists = trace
            .as_slice()
            .iter()
            .any(|t| t.kind == "frame-persist" && t.detail.contains("uo_seal_wax"));
        if persists {
            Ok(())
        } else {
            Err("frame-persist must name the untouched fluent uo_seal_wax".to_string())
        }
    }
}

// ─────────────────────────────── SOAR ──────────────────────────────────────

impl BreedOracle for Soar {
    fn breed_id() -> BreedId {
        BreedId::Soar
    }

    /// Two operator candidates; a `best:` preference singles out uo_clamp.
    fn novel_input() -> BreedInput {
        let mut input = base("uo_fixture operator selection");
        input.candidates = vec![candidate("uo_clamp", 0.4), candidate("uo_rivet", 0.7)];
        input.facts = vec![fact("pref", "best:uo_clamp")];
        input
    }

    /// Different `best:` preference → different selected operator.
    fn boundary_pair() -> (BreedInput, BreedInput) {
        let a = Self::novel_input();
        let mut b = Self::novel_input();
        b.facts = vec![fact("pref", "best:uo_rivet")];
        (a, b)
    }

    /// Empty operator-candidate set violates SOAR's precondition
    /// ("SOAR requires at least one operator candidate").
    fn refusal_input() -> BreedInput {
        base("uo_fixture with no operators")
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_non_empty()?;
        trace.require_count("evaluate-single", 1)?;
        Ok(())
    }

    fn assert_trace_values(trace: &TraceQuery<'_>) -> Result<(), String> {
        // The best: preference is decisive — uo_clamp must be selected
        // (NOT the higher-scored uo_rivet) and no impasse may occur.
        let detail = trace
            .detail_of("evaluate-single")
            .ok_or_else(|| "missing evaluate-single step".to_string())?;
        if detail != "uo_clamp" {
            return Err(format!(
                "evaluate-single must select best-preferred uo_clamp, got '{}'",
                detail
            ));
        }
        if trace.has_kind("impasse") {
            return Err("best: preference is decisive — no impasse expected".to_string());
        }
        Ok(())
    }
}

// ─────────────────────────────── ACT-R ─────────────────────────────────────

impl BreedOracle for ActR {
    fn breed_id() -> BreedId {
        BreedId::ActR
    }

    /// One production fires on the goal buffer and requests a declarative
    /// retrieval that matches the single stored chunk.
    fn novel_input() -> BreedInput {
        let mut input = base("uo_recall the amber slot");
        input.facts = vec![fact("uo_goal", "uo_fetch")];
        input.rules = vec![rule(
            "uo_p1",
            &["uo_goal=uo_fetch"],
            "retrieve:uo_slot=uo_amber",
            0.9,
        )];
        input.cases = vec![case(
            "uo_chunk_amber",
            "uo_recall",
            "chunk",
            0.7,
            vec![fact("uo_slot", "uo_amber")],
        )];
        input
    }

    /// Same production cycle but the retrieval pattern targets a different
    /// chunk → retrieval steps and output facts differ.
    fn boundary_pair() -> (BreedInput, BreedInput) {
        let a = Self::novel_input();
        let mut b = Self::novel_input();
        b.rules = vec![rule(
            "uo_p1",
            &["uo_goal=uo_fetch"],
            "retrieve:uo_slot=uo_jade",
            0.9,
        )];
        b.cases = vec![case(
            "uo_chunk_jade",
            "uo_recall",
            "chunk",
            0.7,
            vec![fact("uo_slot", "uo_jade")],
        )];
        (a, b)
    }

    /// Empty production set — preconditions (invoked inside run) refuse.
    fn refusal_input() -> BreedInput {
        let mut input = base("uo_recall with no productions");
        input.facts = vec![fact("uo_goal", "uo_fetch")];
        input
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_at_least("fire-production", 1)?;
        trace.require_kind("retrieval-request")?;
        trace.require_kind("decision")?;
        Ok(())
    }

    fn assert_trace_values(trace: &TraceQuery<'_>) -> Result<(), String> {
        let detail = trace
            .detail_of("fire-production")
            .ok_or_else(|| "missing fire-production step".to_string())?;
        if !detail.contains("uo_p1") {
            return Err(format!("fire-production must fire uo_p1, got '{}'", detail));
        }
        // The retrieval request must carry the production's pattern, and the
        // activation-based retrieval must fetch the amber chunk at its
        // computed activation (B=0.7, zero spreading from WM, tau=0).
        let req = trace
            .detail_of("retrieval-request")
            .ok_or_else(|| "missing retrieval-request step".to_string())?;
        if !req.contains("uo_slot=uo_amber") {
            return Err(format!(
                "retrieval-request must carry uo_slot=uo_amber, got '{}'",
                req
            ));
        }
        let got = trace
            .detail_of("retrieve-chunk")
            .ok_or_else(|| "missing retrieve-chunk step (retrieval must succeed)".to_string())?;
        if got.contains("uo_chunk_amber") && got.contains("A=0.7000") {
            Ok(())
        } else {
            Err(format!(
                "retrieve-chunk must fetch uo_chunk_amber at A=0.7000, got '{}'",
                got
            ))
        }
    }
}

// ───────────────────────────── RL symbolic ─────────────────────────────────

impl BreedOracle for RlSymbolic {
    fn breed_id() -> BreedId {
        BreedId::RlSymbolic
    }

    /// Two-action gridlet: `uo_leap` reaches the terminal cache with reward 1,
    /// `uo_idle` self-loops with no reward.
    fn novel_input() -> BreedInput {
        let mut input = base("uo_forage policy");
        input.facts = vec![
            fact("mdp:gamma", "0.9"),
            fact("mdp:start", "uo_nest"),
            fact("mdp:terminal:uo_cache", "true"),
            fact("mdp:t:uo_nest:uo_leap", "uo_cache"),
            fact("mdp:t:uo_nest:uo_idle", "uo_nest"),
            fact("mdp:r:uo_nest:uo_leap", "1.0"),
            fact("rl:episodes", "50"),
        ];
        input
    }

    /// Reward sign on the leap action flipped → learned Q-values (and the
    /// extracted policy details) differ.
    fn boundary_pair() -> (BreedInput, BreedInput) {
        let a = Self::novel_input();
        let mut b = Self::novel_input();
        for f in b.facts.iter_mut() {
            if f.key == "mdp:r:uo_nest:uo_leap" {
                f.value = "-1.0".to_string();
            }
        }
        (a, b)
    }

    /// Divergent discount gamma = 1.0 — parse_model (called by run) refuses.
    fn refusal_input() -> BreedInput {
        let mut input = Self::novel_input();
        for f in input.facts.iter_mut() {
            if f.key == "mdp:gamma" {
                f.value = "1.0".to_string();
            }
        }
        input
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_at_least("episode-end", 1)?;
        trace.require_at_least("extract-policy", 1)?;
        Ok(())
    }

    fn assert_trace_values(trace: &TraceQuery<'_>) -> Result<(), String> {
        // Q-values must actually be updated from experience at uo_nest.
        let q_updated = trace
            .as_slice()
            .iter()
            .any(|t| t.kind == "q-update" && t.detail.contains("Q(uo_nest,"));
        if !q_updated {
            return Err("q-update must update Q(uo_nest, ...) from experience".to_string());
        }
        // Reward-driven learning: the extracted policy must prefer uo_leap
        // (reward 1.0) over the lexicographically-earlier zero-reward uo_idle.
        let policy_leaps = trace
            .as_slice()
            .iter()
            .any(|t| t.kind == "extract-policy" && t.detail.contains("pi(uo_nest) = uo_leap"));
        if policy_leaps {
            Ok(())
        } else {
            Err("extract-policy must learn pi(uo_nest) = uo_leap from the reward".to_string())
        }
    }
}

// ─────────────────────────────── POMDP ─────────────────────────────────────

impl BreedOracle for Pomdp {
    fn breed_id() -> BreedId {
        BreedId::Pomdp
    }

    /// Two hidden market states (`uo_bull`/`uo_bear`); a noisy probe action
    /// and a commit action whose reward depends on the hidden state.
    fn novel_input() -> BreedInput {
        let mut input = base("uo_market commit decision");
        let mut facts = vec![
            fact("pomdp:states", "uo_bull,uo_bear"),
            fact("pomdp:actions", "uo_probe,uo_commit"),
            fact("pomdp:observations", "uo_tick,uo_dip"),
            fact("pomdp:gamma", "0.9"),
            fact("pomdp:horizon", "3"),
            fact("pomdp:b0:uo_bull", "0.5"),
            fact("pomdp:b0:uo_bear", "0.5"),
            fact("pomdp:step:0", "uo_probe|uo_tick"),
        ];
        for s in ["uo_bull", "uo_bear"] {
            for sp in ["uo_bull", "uo_bear"] {
                facts.push(fact(
                    &format!("pomdp:t:uo_probe:{}:{}", s, sp),
                    if s == sp { "1.0" } else { "0.0" },
                ));
                facts.push(fact(&format!("pomdp:t:uo_commit:{}:{}", s, sp), "0.5"));
            }
            facts.push(fact(&format!("pomdp:r:uo_probe:{}", s), "-1.0"));
            facts.push(fact(&format!("pomdp:o:uo_commit:{}:uo_tick", s), "0.5"));
            facts.push(fact(&format!("pomdp:o:uo_commit:{}:uo_dip", s), "0.5"));
        }
        facts.push(fact("pomdp:o:uo_probe:uo_bull:uo_tick", "0.9"));
        facts.push(fact("pomdp:o:uo_probe:uo_bull:uo_dip", "0.1"));
        facts.push(fact("pomdp:o:uo_probe:uo_bear:uo_tick", "0.1"));
        facts.push(fact("pomdp:o:uo_probe:uo_bear:uo_dip", "0.9"));
        facts.push(fact("pomdp:r:uo_commit:uo_bull", "5.0"));
        facts.push(fact("pomdp:r:uo_commit:uo_bear", "-5.0"));
        input.facts = facts;
        input
    }

    /// Commit rewards flipped in sign → different value function and a
    /// different V(b) / selected action.
    fn boundary_pair() -> (BreedInput, BreedInput) {
        let a = Self::novel_input();
        let mut b = Self::novel_input();
        for f in b.facts.iter_mut() {
            if f.key == "pomdp:r:uo_commit:uo_bull" {
                f.value = "-5.0".to_string();
            } else if f.key == "pomdp:r:uo_commit:uo_bear" {
                f.value = "5.0".to_string();
            }
        }
        (a, b)
    }

    /// Non-stochastic transition row (sums to 0.7) — parse_model (called by
    /// run) refuses the model.
    fn refusal_input() -> BreedInput {
        let mut input = Self::novel_input();
        for f in input.facts.iter_mut() {
            if f.key == "pomdp:t:uo_probe:uo_bull:uo_bull" {
                f.value = "0.7".to_string();
            }
        }
        input
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_kind("init-belief")?;
        trace.require_at_least("pbvi-backup", 1)?;
        trace.require_kind("select-action")?;
        Ok(())
    }

    fn assert_trace_values(trace: &TraceQuery<'_>) -> Result<(), String> {
        // Bayes update on the uo_tick observation must shift the belief from
        // the uniform prior (0.5/0.5) to 0.9 bull / 0.1 bear.
        let init = trace
            .detail_of("init-belief")
            .ok_or_else(|| "missing init-belief step".to_string())?;
        if !init.contains("uo_bull=0.500000") {
            return Err(format!("init-belief must start uniform, got '{}'", init));
        }
        let upd = trace
            .detail_of("belief-update")
            .ok_or_else(|| "missing belief-update step (observation ignored?)".to_string())?;
        if !(upd.contains("a=uo_probe o=uo_tick") && upd.contains("uo_bull=0.900000")) {
            return Err(format!(
                "belief-update must shift to uo_bull=0.900000 after uo_tick, got '{}'",
                upd
            ));
        }
        let detail = trace
            .detail_of("select-action")
            .ok_or_else(|| "missing select-action step".to_string())?;
        if detail.contains("uo_probe") || detail.contains("uo_commit") {
            Ok(())
        } else {
            Err(format!(
                "select-action must name a model action, got '{}'",
                detail
            ))
        }
    }
}

// ─────────────────────────── Markov logic ──────────────────────────────────

impl BreedOracle for MarkovLogic {
    fn breed_id() -> BreedId {
        BreedId::MarkovLogic
    }

    /// One weighted implication: rainfall → wet quay, with rainfall evidence.
    fn novel_input() -> BreedInput {
        let mut input = base("uo_quay wetness MAP");
        input.facts = vec![
            fact("mln:clause:uo_c1", "1.5|!uo_rainfall,uo_quay_wet"),
            fact("evidence:uo_rainfall", "true"),
        ];
        input
    }

    /// Evidence flipped true → false: the clamped assignment and resulting
    /// MAP state differ.
    fn boundary_pair() -> (BreedInput, BreedInput) {
        let a = Self::novel_input();
        let mut b = Self::novel_input();
        for f in b.facts.iter_mut() {
            if f.key == "evidence:uo_rainfall" {
                f.value = "false".to_string();
            }
        }
        (a, b)
    }

    /// Negative clause weight — parse_clauses (called by run) refuses.
    fn refusal_input() -> BreedInput {
        let mut input = Self::novel_input();
        input
            .facts
            .push(fact("mln:clause:uo_c2", "-2.0|uo_quay_wet"));
        input
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_kind("ground-clauses")?;
        trace.require_kind("clamp-evidence")?;
        trace.require_kind("init-assignment")?;
        trace.require_count("map-found", 1)?;
        Ok(())
    }

    fn assert_trace_values(trace: &TraceQuery<'_>) -> Result<(), String> {
        let detail = trace
            .detail_of("clamp-evidence")
            .ok_or_else(|| "missing clamp-evidence step".to_string())?;
        if !detail.contains("uo_rainfall=true") {
            return Err(format!(
                "clamp-evidence must clamp uo_rainfall=true, got '{}'",
                detail
            ));
        }
        // The soft clause is violated by the all-false init (cost = weight
        // 1.5) and MAP search must drive the cost to exactly 0.
        let init = trace
            .detail_of("init-assignment")
            .ok_or_else(|| "missing init-assignment step".to_string())?;
        if !init.contains("cost=1.500000") {
            return Err(format!(
                "init-assignment must start at the soft-clause weight cost=1.500000, got '{}'",
                init
            ));
        }
        let map = trace
            .detail_of("map-found")
            .ok_or_else(|| "missing map-found step".to_string())?;
        if map.contains("cost=0.000000") {
            Ok(())
        } else {
            Err(format!("map-found must reach cost=0.000000, got '{}'", map))
        }
    }
}

// ═══════════════════════ Per-breed adversaries (U6) ════════════════════════
//
// Each `Cheat*` embodies its breed's predicted primary cheat mode from the
// Combined Breed Standing Table. They emit plausible-looking traces (the
// right step KINDS where cheap) with hollow or wrong VALUES, so that
// `assert_intermediate` or `assert_trace_values` must reject them.

/// Build a trace step with the given kind/detail (cheat scaffolding only).
fn uo_cheat_step(step: usize, kind: &str, detail: &str) -> TraceStep {
    TraceStep {
        step,
        kind: kind.to_string(),
        detail: detail.to_string(),
        depth: 0,
        objects: vec![],
    }
}

/// Plausible-looking hollow output for `breed` with the given trace.
fn uo_cheat_output(breed: BreedId, kinds_details: &[(&str, &str)]) -> BreedOutput {
    BreedOutput {
        breed,
        candidates: vec![],
        facts: vec![],
        selected: Some("uo_cheat".to_string()),
        explanation: "uo_cheat".to_string(),
        inference_trace: kinds_details
            .iter()
            .enumerate()
            .map(|(i, (k, d))| uo_cheat_step(i, k, d))
            .collect(),
        ocel_log: None,
        retained_cases: vec![],
    }
}

/// AC-FLAT: emits the right step kinds but a flat, contentless plan.
pub struct CheatStrips;
impl BreedAdversary for CheatStrips {
    type Target = Strips;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        uo_cheat_output(
            BreedId::Strips,
            &[
                ("subgoal", "uo_flat"),
                ("try-action", "uo_flat"),
                ("execute", "uo_flat"),
            ],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-FLAT"
    }
}

/// AC-FLAT: no real means-ends analysis — gap and operator are hollow.
pub struct CheatGps;
impl BreedAdversary for CheatGps {
    type Target = Gps;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        uo_cheat_output(
            BreedId::Gps,
            &[("reduce-gap", "uo_flat"), ("apply-operator", "uo_flat")],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-FLAT"
    }
}

/// AC-FLAT: claims a decomposition without using the actual method.
pub struct CheatHtnPlanning;
impl BreedAdversary for CheatHtnPlanning {
    type Target = HtnPlanning;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        uo_cheat_output(
            BreedId::HtnPlanning,
            &[("htn-decompose", "uo_flat"), ("htn-plan", "uo_flat")],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-FLAT"
    }
}

/// AC-FLAT: emits pop-init/pop-plan but records no causal links.
pub struct CheatPartialOrderPlan;
impl BreedAdversary for CheatPartialOrderPlan {
    type Target = PartialOrderPlan;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        uo_cheat_output(
            BreedId::PartialOrderPlan,
            &[("pop-init", "uo_flat"), ("pop-plan", "plan: [uo_rig]")],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-FLAT"
    }
}

/// AC-FLAT: a flat linear plan with no sensing branch over the unknown atom.
pub struct CheatContingentPlan;
impl BreedAdversary for CheatContingentPlan {
    type Target = ContingentPlan;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        uo_cheat_output(
            BreedId::ContingentPlan,
            &[
                ("or-expand", "action 'uo_scrub': applicable in all worlds"),
                ("goal-reached", "1 world(s) satisfy the goal"),
                ("plan-complete", "(act uo_scrub (done))"),
            ],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-FLAT"
    }
}

/// AC-IGNORE: ignores the narrative — never checks clipping intervals.
pub struct CheatEventCalculus;
impl BreedAdversary for CheatEventCalculus {
    type Target = EventCalculus;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        uo_cheat_output(
            BreedId::EventCalculus,
            &[
                ("ec-load", "0 events, 0 initially-fluents"),
                ("ec-infer", "uo_glow assumed true"),
                ("ec-model", "1 verdict(s)"),
            ],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-IGNORE"
    }
}

/// AC-FLAT: regress-step without real successor-state effects or frame inertia.
pub struct CheatSituationCalculus;
impl BreedAdversary for CheatSituationCalculus {
    type Target = SituationCalculus;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        uo_cheat_output(
            BreedId::SituationCalculus,
            &[
                ("load-axioms", "uo_flat"),
                ("regress-step", "do(uo_douse, s0) -> s1"),
                ("decision", "uo_flat"),
            ],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-FLAT"
    }
}

/// AC-GREEDY: ignores the best: preference and greedily picks the
/// highest-scored candidate (uo_rivet, 0.7) instead of uo_clamp.
pub struct CheatSoar;
impl BreedAdversary for CheatSoar {
    type Target = Soar;
    fn run_cheat(input: &BreedInput) -> BreedOutput {
        let greedy = input
            .candidates
            .iter()
            .max_by(|a, b| a.score.total_cmp(&b.score).then_with(|| b.id.cmp(&a.id)))
            .map(|c| c.id.clone())
            .unwrap_or_default();
        uo_cheat_output(BreedId::Soar, &[("evaluate-single", greedy.as_str())])
    }
    fn cheat_code() -> &'static str {
        "AC-GREEDY"
    }
}

/// AC-IGNORE: fires the production but ignores declarative memory — no
/// activation computation, no retrieve-chunk.
pub struct CheatActR;
impl BreedAdversary for CheatActR {
    type Target = ActR;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        uo_cheat_output(
            BreedId::ActR,
            &[
                ("fire-production", "fired 'uo_p1'"),
                ("retrieval-request", "pattern uo_slot=uo_amber"),
                ("decision", "1 productions fired; last retrieval: None"),
            ],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-IGNORE"
    }
}

/// AC-ALWAYS: always emits a fixed policy without ever updating Q from reward.
pub struct CheatRlSymbolic;
impl BreedAdversary for CheatRlSymbolic {
    type Target = RlSymbolic;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        uo_cheat_output(
            BreedId::RlSymbolic,
            &[
                ("episode-end", "episode 0 max-delta=0.000000"),
                ("extract-policy", "pi(uo_nest) = uo_idle (Q=0.0000)"),
            ],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-ALWAYS"
    }
}

/// AC-IGNORE: ignores the observation history — belief never updated.
pub struct CheatPomdp;
impl BreedAdversary for CheatPomdp {
    type Target = Pomdp;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        uo_cheat_output(
            BreedId::Pomdp,
            &[
                ("init-belief", "uo_bull=0.500000, uo_bear=0.500000"),
                ("pbvi-backup", "h=1 |Gamma|=1 V(b0)=0.000000"),
                (
                    "select-action",
                    "action=uo_commit V(b)=0.000000 (QMDP upper bound 0.000000)",
                ),
            ],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-IGNORE"
    }
}

/// AC-PARTIAL: grounds and clamps but skips the MAP search — the reported
/// cost stays at the violated soft-clause weight.
pub struct CheatMarkovLogic;
impl BreedAdversary for CheatMarkovLogic {
    type Target = MarkovLogic;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        uo_cheat_output(
            BreedId::MarkovLogic,
            &[
                ("ground-clauses", "1 clauses over 2 atoms"),
                ("clamp-evidence", "uo_rainfall=true"),
                (
                    "init-assignment",
                    "evidence-clamped, others false; cost=1.500000",
                ),
                ("map-found", "cost=1.500000 after 0 flips"),
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
    use crate::breeds::dispatch::dispatch_breed_id;
    use crate::breeds::support::oracle::{run_adversary_check, run_universal_anticheat};

    /// Real run via dispatch: `assert_trace_values` must accept the genuine
    /// trace; U6: the oracle must reject the breed's paired adversary.
    fn assert_values_and_adversary<A: BreedAdversary>(name: &str) {
        let input = <A::Target as BreedOracle>::novel_input();
        let output = dispatch_breed_id(<A::Target as BreedOracle>::breed_id(), &input)
            .unwrap_or_else(|e| panic!("{}: novel_input run failed: {}", name, e));
        let tq = TraceQuery::new(&output.inference_trace);
        if let Err(e) = <A::Target as BreedOracle>::assert_trace_values(&tq) {
            panic!(
                "{}: assert_trace_values rejected the REAL trace: {}",
                name, e
            );
        }
        let r = run_adversary_check::<A>();
        assert!(
            r.is_pass(),
            "{}: U6 failed — oracle accepted {} cheat",
            name,
            A::cheat_code()
        );
    }

    #[test]
    fn planning_trace_values_and_adversaries() {
        assert_values_and_adversary::<CheatStrips>("strips");
        assert_values_and_adversary::<CheatGps>("gps");
        assert_values_and_adversary::<CheatHtnPlanning>("htn_planning");
        assert_values_and_adversary::<CheatPartialOrderPlan>("partial_order_plan");
        assert_values_and_adversary::<CheatContingentPlan>("contingent_plan");
        assert_values_and_adversary::<CheatEventCalculus>("event_calculus");
        assert_values_and_adversary::<CheatSituationCalculus>("situation_calculus");
        assert_values_and_adversary::<CheatSoar>("soar");
        assert_values_and_adversary::<CheatActR>("act_r");
        assert_values_and_adversary::<CheatRlSymbolic>("rl_symbolic");
        assert_values_and_adversary::<CheatPomdp>("pomdp");
        assert_values_and_adversary::<CheatMarkovLogic>("markov_logic");
    }

    fn assert_green<B: BreedOracle>(name: &str) {
        for r in run_universal_anticheat::<B>() {
            assert!(r.is_pass(), "{}: {:?}", name, r);
        }
    }

    #[test]
    fn planning_oracles_green() {
        assert_green::<Strips>("strips");
        assert_green::<Gps>("gps");
        assert_green::<HtnPlanning>("htn_planning");
        assert_green::<PartialOrderPlan>("partial_order_plan");
        assert_green::<ContingentPlan>("contingent_plan");
        assert_green::<EventCalculus>("event_calculus");
        assert_green::<SituationCalculus>("situation_calculus");
        assert_green::<Soar>("soar");
        assert_green::<ActR>("act_r");
        assert_green::<RlSymbolic>("rl_symbolic");
        assert_green::<Pomdp>("pomdp");
        assert_green::<MarkovLogic>("markov_logic");
    }
}
