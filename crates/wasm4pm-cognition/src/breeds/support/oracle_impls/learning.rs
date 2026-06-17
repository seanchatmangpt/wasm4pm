//! [`BreedOracle`] impls for the learning / memory / analogy breeds:
//! Cbr, Ilp, Ebl, VersionSpace, AnalogySme, EpisodicMemory, ScriptSam,
//! QualitativeReason, NaivePhysics, MetaReasoning.
//!
//! All novel content uses fresh `uo_*` names that appear in no public fixture.

use super::{base, case, fact, goal, rule};
use crate::breeds::support::oracle::{BreedAdversary, BreedOracle};
use crate::breeds::support::trace_query::TraceQuery;
use crate::breeds::{BreedId, BreedInput, BreedOutput, TraceStep};

use crate::breeds::analogy_sme::AnalogySme;
use crate::breeds::cbr::Cbr;
use crate::breeds::ebl::Ebl;
use crate::breeds::episodic_memory::EpisodicMemory;
use crate::breeds::ilp::Ilp;
use crate::breeds::meta_reasoning::MetaReasoning;
use crate::breeds::naive_physics::NaivePhysics;
use crate::breeds::qualitative_reason::QualitativeReason;
use crate::breeds::script_sam::ScriptSam;
use crate::breeds::version_space::VersionSpace;

// ── Shared value-assertion helpers ───────────────────────────────────────

/// Parse the f64 immediately following `marker` inside `detail`.
fn uo_num_after(detail: &str, marker: &str) -> Option<f64> {
    let idx = detail.find(marker)? + marker.len();
    let rest = &detail[idx..];
    let end = rest
        .find(|c: char| !(c.is_ascii_digit() || c == '.' || c == '-'))
        .unwrap_or(rest.len());
    rest[..end].parse().ok()
}

/// Build a hollow [`BreedOutput`] for an adversary from `(kind, detail)` steps.
fn uo_cheat_out(breed: BreedId, steps: &[(&str, &str)]) -> BreedOutput {
    BreedOutput {
        breed,
        candidates: vec![],
        facts: vec![],
        selected: None,
        explanation: "uo_cheat".to_string(),
        inference_trace: steps
            .iter()
            .enumerate()
            .map(|(i, (k, d))| TraceStep {
                step: i,
                kind: (*k).to_string(),
                detail: (*d).to_string(),
                depth: 0,
                objects: vec![],
            })
            .collect(),
        ocel_log: None,
        retained_cases: vec![],
    }
}

// ── Cbr ──────────────────────────────────────────────────────────────────

fn cbr_library_input(query_soil: &str) -> BreedInput {
    let mut input = base("uo_pick_irrigation_plan");
    input.cases = vec![
        case(
            "uo_case_loam",
            "uo_irrigation",
            "uo_arch_drip",
            0.9,
            vec![fact("uo_soil", "uo_loam"), fact("uo_slope", "uo_flat")],
        ),
        case(
            "uo_case_clay",
            "uo_irrigation",
            "uo_arch_furrow",
            0.8,
            vec![fact("uo_soil", "uo_clay"), fact("uo_slope", "uo_flat")],
        ),
    ];
    input.facts = vec![fact("uo_soil", query_soil), fact("uo_slope", "uo_flat")];
    input
}

impl BreedOracle for Cbr {
    fn breed_id() -> BreedId {
        BreedId::Cbr
    }

    fn novel_input() -> BreedInput {
        cbr_library_input("uo_loam")
    }

    fn boundary_pair() -> (BreedInput, BreedInput) {
        // Different query facts retrieve a different best case / architecture.
        (cbr_library_input("uo_loam"), cbr_library_input("uo_clay"))
    }

    fn refusal_input() -> BreedInput {
        // Empty case library — CBR cannot retrieve from nothing.
        let mut input = base("uo_pick_irrigation_plan");
        input.facts = vec![fact("uo_soil", "uo_loam")];
        input
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_non_empty_with_kinds(&[
            "build-index",
            "retrieve-candidates",
            "score-case",
        ])?;
        Ok(())
    }

    fn assert_trace_values(tq: &TraceQuery<'_>) -> Result<(), String> {
        // Distinguishing assertion: the retrieved (reused) case must be the
        // MAX-similarity case, not merely the first case in the library.
        let n = tq.count_of("score-case");
        if n == 0 {
            return Err("uo: no score-case steps".to_string());
        }
        let mut best: Option<(f64, &str)> = None;
        for i in 0..n {
            let d = tq
                .detail_kth("score-case", i)
                .ok_or("uo: missing score-case detail")?;
            let sim = uo_num_after(d, "sim=")
                .ok_or_else(|| format!("uo: score-case lacks sim= value: '{}'", d))?;
            let id = d.split_whitespace().next().unwrap_or("");
            if best.map_or(true, |(bs, _)| sim > bs) {
                best = Some((sim, id));
            }
        }
        let (best_sim, best_id) = best.unwrap();
        if best_sim < 0.999 {
            return Err(format!(
                "uo: exact-match query must score sim=1.000, max sim was {:.3}",
                best_sim
            ));
        }
        let reuse = tq
            .detail_of("reuse-adapt")
            .ok_or("uo: missing reuse-adapt step")?;
        if !reuse.starts_with(best_id) {
            return Err(format!(
                "uo: reused case '{}' is not the max-similarity case '{}'",
                reuse, best_id
            ));
        }
        Ok(())
    }
}

/// AC-GREEDY: reuses the first library case instead of the max-similarity one.
pub struct CheatCbr;
impl BreedAdversary for CheatCbr {
    type Target = Cbr;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        uo_cheat_out(
            BreedId::Cbr,
            &[
                ("build-index", "index built for 2 cases"),
                (
                    "retrieve-candidates",
                    "retrieved 2 candidates from 2 total cases",
                ),
                ("score-case", "uo_case_loam sim=0.100 score=0.090"),
                ("score-case", "uo_case_clay sim=0.900 score=0.720"),
                // Greedy: reuse the first case even though clay scored higher.
                ("reuse-adapt", "uo_case_loam adapted 0 facts"),
            ],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-GREEDY"
    }
}

// ── Ilp ──────────────────────────────────────────────────────────────────

fn ilp_input(bg_pred: &str) -> BreedInput {
    let mut input = base("uo_learn_glim_rule");
    input.facts = vec![
        fact("pos:uo_glim(uo_ax)", "true"),
        fact("neg:uo_glim(uo_bx)", "true"),
        fact(&format!("bg:{}(uo_ax)", bg_pred), "true"),
    ];
    input
}

impl BreedOracle for Ilp {
    fn breed_id() -> BreedId {
        BreedId::Ilp
    }

    fn novel_input() -> BreedInput {
        ilp_input("uo_haze")
    }

    fn boundary_pair() -> (BreedInput, BreedInput) {
        // Different background predicate yields a different induced clause.
        (ilp_input("uo_haze"), ilp_input("uo_mist"))
    }

    fn refusal_input() -> BreedInput {
        // Positive examples without any background knowledge.
        let mut input = base("uo_learn_glim_rule");
        input.facts = vec![fact("pos:uo_glim(uo_ax)", "true")];
        input
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_non_empty_with_kinds(&[
            "load-example",
            "score-gain",
            "add-literal",
            "emit-clause",
        ])?;
        Ok(())
    }

    fn assert_trace_values(tq: &TraceQuery<'_>) -> Result<(), String> {
        // Distinguishing assertion: the learned clause contains VARIABLES
        // (V0, V1, ...), not the training constants uo_ax / uo_bx.
        let d = tq
            .detail_of("emit-clause")
            .ok_or("uo: missing emit-clause step")?;
        if !d.contains("uo_glim(V") || !d.contains(":-") {
            return Err(format!(
                "uo: emit-clause is not a variabilized clause: '{}'",
                d
            ));
        }
        if d.contains("uo_ax") || d.contains("uo_bx") {
            return Err(format!(
                "uo: learned clause memorizes training constants: '{}'",
                d
            ));
        }
        let g = tq
            .detail_of("score-gain")
            .ok_or("uo: missing score-gain step")?;
        if uo_num_after(g, "gain=").is_none() {
            return Err(format!(
                "uo: score-gain has no numeric gain= value: '{}'",
                g
            ));
        }
        Ok(())
    }
}

/// AC-TABLE: emits a memorized ground clause over the training constants.
pub struct CheatIlp;
impl BreedAdversary for CheatIlp {
    type Target = Ilp;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        uo_cheat_out(
            BreedId::Ilp,
            &[
                ("load-example", "+uo_glim(uo_ax)"),
                ("load-example", "-uo_glim(uo_bx)"),
                ("score-gain", "uo_haze(uo_ax): t=1 p1=1 n1=0 gain=1.0000"),
                ("add-literal", "uo_haze(uo_ax) (gain=1.0000)"),
                // Table lookup: the "rule" is just the training fact.
                ("emit-clause", "uo_glim(uo_ax) :- uo_haze(uo_ax)"),
            ],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-TABLE"
    }
}

// ── Ebl ──────────────────────────────────────────────────────────────────

impl BreedOracle for Ebl {
    fn breed_id() -> BreedId {
        BreedId::Ebl
    }

    fn novel_input() -> BreedInput {
        let mut input = base("uo_learn_liftable");
        input.facts = vec![fact("uo_grip(uo_tool7)", "true")];
        input.rules = vec![rule("uo_r1", &["uo_grip(?x)"], "uo_liftable(?x)", 1.0)];
        input.goals = vec![goal("uo_g1", "uo_liftable(uo_tool7)", "true")];
        input
    }

    fn boundary_pair() -> (BreedInput, BreedInput) {
        let a = Self::novel_input();
        // Deeper domain theory (chained proof) operationalizes a different rule.
        let mut b = base("uo_learn_liftable");
        b.facts = vec![fact("uo_stem(uo_tool9)", "true")];
        b.rules = vec![
            rule("uo_r1", &["uo_stem(?y)"], "uo_grip(?y)", 1.0),
            rule("uo_r2", &["uo_grip(?x)"], "uo_liftable(?x)", 1.0),
        ];
        b.goals = vec![goal("uo_g1", "uo_liftable(uo_tool9)", "true")];
        (a, b)
    }

    fn refusal_input() -> BreedInput {
        // Training goal that no rule or fact can prove — explain phase fails.
        let mut input = base("uo_learn_liftable");
        input.facts = vec![fact("uo_grip(uo_tool7)", "true")];
        input.rules = vec![rule("uo_r1", &["uo_wing(?x)"], "uo_soars(?x)", 1.0)];
        input.goals = vec![goal("uo_g1", "uo_liftable(uo_tool7)", "true")];
        input
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_non_empty_with_kinds(&[
            "ebl-explain",
            "ebl-generalize",
            "ebl-operationalize",
        ])?;
        Ok(())
    }

    fn assert_trace_values(tq: &TraceQuery<'_>) -> Result<(), String> {
        // Distinguishing assertion: the operationalized rule is GENERALIZED —
        // it contains ?target variables, never the training constant uo_tool7.
        let d = tq
            .detail_of("ebl-operationalize")
            .ok_or("uo: missing ebl-operationalize step")?;
        if !d.contains("=>") || !d.contains("uo_grip(?") || !d.contains("uo_liftable(?") {
            return Err(format!(
                "uo: operationalized rule is not variabilized: '{}'",
                d
            ));
        }
        if d.contains("uo_tool7") {
            return Err(format!(
                "uo: rule retains the training constant uo_tool7: '{}'",
                d
            ));
        }
        let e = tq
            .detail_of("ebl-explain")
            .ok_or("uo: missing ebl-explain step")?;
        if !e.contains("uo_grip(uo_tool7)") && !e.contains("rule: uo_r1") {
            return Err(format!(
                "uo: explanation does not ground the proof: '{}'",
                e
            ));
        }
        Ok(())
    }
}

/// AC-TABLE: "generalizes" by replaying the training instance verbatim.
pub struct CheatEbl;
impl BreedAdversary for CheatEbl {
    type Target = Ebl;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        uo_cheat_out(
            BreedId::Ebl,
            &[
                ("ebl-explain", "rule: uo_r1"),
                ("ebl-explain", "fact: uo_grip(uo_tool7)"),
                ("ebl-generalize", "rule: uo_r1"),
                // Table lookup: rule still names the training constant.
                (
                    "ebl-operationalize",
                    "uo_grip(uo_tool7) => uo_liftable(uo_tool7)",
                ),
            ],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-TABLE"
    }
}

// ── VersionSpace ─────────────────────────────────────────────────────────

impl BreedOracle for VersionSpace {
    fn breed_id() -> BreedId {
        BreedId::VersionSpace
    }

    fn novel_input() -> BreedInput {
        let mut input = base("uo_learn_berry_concept");
        input.facts = vec![
            fact("vs:attrs", "uo_hue,uo_bulk"),
            fact("vs:example:1", "uo_red,uo_big:+"),
            fact("vs:example:2", "uo_blue,uo_big:-"),
        ];
        input
    }

    fn boundary_pair() -> (BreedInput, BreedInput) {
        let a = Self::novel_input();
        // Extra positive example generalizes S — vs:s differs.
        let mut b = Self::novel_input();
        b.facts.push(fact("vs:example:3", "uo_red,uo_small:+"));
        (a, b)
    }

    fn refusal_input() -> BreedInput {
        // No vs:attrs fact at all — unparseable concept space.
        let mut input = base("uo_learn_berry_concept");
        input.facts = vec![fact("vs:example:1", "uo_red,uo_big:+")];
        input
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_first("vs-init")?;
        trace.require_last("vs-verdict")?;
        trace.require_kind("vs-update")?;
        Ok(())
    }

    fn assert_trace_values(tq: &TraceQuery<'_>) -> Result<(), String> {
        // Distinguishing assertion: BOTH boundaries moved — S generalized to
        // the positive example AND G specialized against the negative one.
        let n = tq.count_of("vs-update");
        let mut s_updated = false;
        let mut g_specialized = false;
        for i in 0..n {
            let d = tq
                .detail_kth("vs-update", i)
                .ok_or("uo: missing vs-update detail")?;
            if d.contains("S := <uo_red,uo_big>") {
                s_updated = true;
            }
            if d.contains("-> <uo_red,?>") {
                g_specialized = true;
            }
        }
        if !s_updated {
            return Err("uo: no S-boundary update 'S := <uo_red,uo_big>' recorded".to_string());
        }
        if !g_specialized {
            return Err("uo: no G-boundary specialization '-> <uo_red,?>' recorded".to_string());
        }
        let v = tq
            .detail_of("vs-verdict")
            .ok_or("uo: missing vs-verdict step")?;
        if !v.contains("<uo_red,uo_big>") || !v.contains("G={<uo_red,?>}") {
            return Err(format!(
                "uo: verdict does not carry final boundaries: '{}'",
                v
            ));
        }
        Ok(())
    }
}

/// AC-PARTIAL: only updates the S boundary; G is never specialized.
pub struct CheatVersionSpace;
impl BreedAdversary for CheatVersionSpace {
    type Target = VersionSpace;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        uo_cheat_out(
            BreedId::VersionSpace,
            &[
                ("vs-init", "S=<0,0>, G={<?,?>}"),
                ("vs-update", "example 0 <uo_red,uo_big>"),
                ("vs-update", "S := <uo_red,uo_big>"),
                // Partial: negative example is consumed but G never moves.
                ("vs-update", "example 1 <uo_blue,uo_big>"),
                ("vs-verdict", "S=<uo_red,uo_big>, G={<?,?>}"),
            ],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-PARTIAL"
    }
}

// ── AnalogySme ───────────────────────────────────────────────────────────

fn sme_input(target_hub: &str) -> BreedInput {
    let mut input = base("uo_map_flow_analogy");
    input.facts = vec![
        fact(
            "base:0",
            "(uo_cause (uo_press uo_pump uo_pipe) (uo_flow uo_pipe))",
        ),
        fact("base:1", "(uo_hum uo_pump)"),
        fact(
            "target:0",
            &format!(
                "(uo_cause (uo_press uo_fan {h}) (uo_flow {h}))",
                h = target_hub
            ),
        ),
    ];
    input
}

impl BreedOracle for AnalogySme {
    fn breed_id() -> BreedId {
        BreedId::AnalogySme
    }

    fn novel_input() -> BreedInput {
        sme_input("uo_duct")
    }

    fn boundary_pair() -> (BreedInput, BreedInput) {
        // Different target entity changes the entity correspondences.
        (sme_input("uo_duct"), sme_input("uo_vent"))
    }

    fn refusal_input() -> BreedInput {
        // Base expressions with no target side at all.
        let mut input = base("uo_map_flow_analogy");
        input.facts = vec![fact("base:0", "(uo_hum uo_pump)")];
        input
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_non_empty_with_kinds(&["parse-expr", "local-match", "merge-gmap"])?;
        Ok(())
    }

    fn assert_trace_values(tq: &TraceQuery<'_>) -> Result<(), String> {
        // Distinguishing assertion: the winning mapping is the deep STRUCTURAL
        // match base:0 <-> target:0 (cause over press/flow, nesting depth >= 2),
        // so its systematicity score must reflect nested relations (>= 3).
        let n = tq.count_of("local-match");
        let mut found = false;
        for i in 0..n {
            let d = tq
                .detail_kth("local-match", i)
                .ok_or("uo: missing local-match detail")?;
            if d.contains("base:0 <-> target:0") {
                let s = uo_num_after(d, "systematicity=")
                    .ok_or_else(|| format!("uo: local-match lacks systematicity=: '{}'", d))?;
                if s < 3.0 {
                    return Err(format!(
                        "uo: structural match must score >= 3 (depth-2 nesting), got {}: '{}'",
                        s, d
                    ));
                }
                found = true;
            }
        }
        if !found {
            return Err("uo: no local-match for base:0 <-> target:0 recorded".to_string());
        }
        let m = tq
            .detail_of("merge-gmap")
            .ok_or("uo: missing merge-gmap step")?;
        if !m.contains("base:0 <-> target:0") {
            return Err(format!(
                "uo: gmap did not merge the structural match: '{}'",
                m
            ));
        }
        Ok(())
    }
}

/// AC-PARTIAL: matches only a shallow attribute expression, skipping the
/// deep causal structure.
pub struct CheatAnalogySme;
impl BreedAdversary for CheatAnalogySme {
    type Target = AnalogySme;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        uo_cheat_out(
            BreedId::AnalogySme,
            &[
                ("parse-expr", "base:1 = (uo_hum uo_pump)"),
                ("parse-expr", "target:0 = (uo_cause ...)"),
                // Partial: only a flat depth-1 attribute match.
                ("local-match", "base:1 <-> target:0 (systematicity=1)"),
                (
                    "merge-gmap",
                    "merged base:1 <-> target:0 (gmap score now 1)",
                ),
            ],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-PARTIAL"
    }
}

// ── EpisodicMemory ───────────────────────────────────────────────────────

fn episodic_input(cue_t: i64, dawn_scent: &str, dusk_scent: &str) -> BreedInput {
    let mut input = base("uo_recall_walk");
    input.cases = vec![
        case(
            "uo_ep_dawn",
            "uo_walk",
            "uo_arch_mem",
            0.7,
            vec![fact("uo_scent", dawn_scent)],
        ),
        case(
            "uo_ep_dusk",
            "uo_walk",
            "uo_arch_mem",
            0.7,
            vec![fact("uo_scent", dusk_scent)],
        ),
    ];
    input.facts = vec![
        fact("episode:uo_ep_dawn:t", "10"),
        fact("episode:uo_ep_dusk:t", "50"),
        fact("cue:t", &cue_t.to_string()),
        fact("uo_scent", dusk_scent),
    ];
    input
}

impl BreedOracle for EpisodicMemory {
    fn breed_id() -> BreedId {
        BreedId::EpisodicMemory
    }

    fn novel_input() -> BreedInput {
        episodic_input(48, "uo_pine", "uo_cedar")
    }

    fn boundary_pair() -> (BreedInput, BreedInput) {
        // Identical episode content; only the cue time differs, so the
        // temporal kernel flips the recalled episode (dawn vs dusk).
        (
            episodic_input(11, "uo_mossy", "uo_mossy"),
            episodic_input(49, "uo_mossy", "uo_mossy"),
        )
    }

    fn refusal_input() -> BreedInput {
        // No episodes at all.
        let mut input = base("uo_recall_walk");
        input.facts = vec![fact("cue:t", "48")];
        input
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_non_empty_with_kinds(&[
            "encode-episode",
            "present-cue",
            "score-episode",
            "recall",
        ])?;
        Ok(())
    }

    fn assert_trace_values(tq: &TraceQuery<'_>) -> Result<(), String> {
        // Distinguishing assertion: the recalled episode is the ARGMAX of the
        // Jaccard + temporal-kernel scoring rule, and each recorded score is
        // arithmetically consistent with its components (not recency-only).
        let n = tq.count_of("score-episode");
        if n < 2 {
            return Err(format!(
                "uo: expected >= 2 score-episode steps, found {}",
                n
            ));
        }
        let mut best: Option<(f64, String)> = None;
        for i in 0..n {
            let d = tq
                .detail_kth("score-episode", i)
                .ok_or("uo: missing score-episode detail")?;
            let j = uo_num_after(d, "jaccard=")
                .ok_or_else(|| format!("uo: score-episode lacks jaccard=: '{}'", d))?;
            let t = uo_num_after(d, "temporal=")
                .ok_or_else(|| format!("uo: score-episode lacks temporal=: '{}'", d))?;
            let s = uo_num_after(d, "score=")
                .ok_or_else(|| format!("uo: score-episode lacks score=: '{}'", d))?;
            if (j + t - s).abs() > 1e-3 {
                return Err(format!("uo: score != jaccard + temporal in '{}'", d));
            }
            let id = d
                .split('\'')
                .nth(1)
                .ok_or_else(|| format!("uo: no quoted episode id in '{}'", d))?;
            if best.as_ref().map_or(true, |(bs, _)| s > *bs) {
                best = Some((s, id.to_string()));
            }
        }
        let (_, best_id) = best.unwrap();
        let r = tq.detail_of("recall").ok_or("uo: missing recall step")?;
        if !r.contains(&format!("'{}'", best_id)) {
            return Err(format!(
                "uo: recalled episode is not the max-score episode '{}': '{}'",
                best_id, r
            ));
        }
        Ok(())
    }
}

/// AC-GREEDY: recalls the most recent episode while its own scores say
/// the other episode wins.
pub struct CheatEpisodicMemory;
impl BreedAdversary for CheatEpisodicMemory {
    type Target = EpisodicMemory;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        uo_cheat_out(
            BreedId::EpisodicMemory,
            &[
                (
                    "encode-episode",
                    "'uo_ep_dawn' t=10 (1 atoms, salience=0.70)",
                ),
                (
                    "encode-episode",
                    "'uo_ep_dusk' t=50 (1 atoms, salience=0.70)",
                ),
                ("present-cue", "cue t=48 with 1 atoms"),
                (
                    "score-episode",
                    "'uo_ep_dawn' jaccard=0.8000 temporal=0.1000 score=0.9000",
                ),
                (
                    "score-episode",
                    "'uo_ep_dusk' jaccard=0.1000 temporal=0.3333 score=0.4333",
                ),
                // Greedy: picks the most recent episode, ignoring the scores.
                ("recall", "recalled 'uo_ep_dusk' (score=0.4333)"),
                ("decision", "episode 'uo_ep_dusk' wins over 2 candidates"),
            ],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-GREEDY"
    }
}

// ── ScriptSam ────────────────────────────────────────────────────────────

impl BreedOracle for ScriptSam {
    fn breed_id() -> BreedId {
        BreedId::ScriptSam
    }

    fn novel_input() -> BreedInput {
        // Built-in airport script vocabulary; the actor is the novel content.
        let mut input = base("uo_understand_trip_story");
        input.facts = vec![
            fact("sam:event:1", "checkin:uo_pia"),
            fact("sam:event:2", "fly:uo_pia"),
        ];
        input
    }

    fn boundary_pair() -> (BreedInput, BreedInput) {
        let a = Self::novel_input();
        // Restaurant-vocabulary story selects a different script.
        let mut b = base("uo_understand_meal_story");
        b.facts = vec![
            fact("sam:event:1", "enter:uo_remo"),
            fact("sam:event:2", "pay:uo_remo"),
        ];
        (a, b)
    }

    fn refusal_input() -> BreedInput {
        // Event outside every known script vocabulary.
        let mut input = base("uo_understand_trip_story");
        input.facts = vec![fact("sam:event:1", "uo_levitate:uo_pia")];
        input
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_first("select-script")?;
        trace.require_kinds(&["align-event", "infer-gap"])?;
        trace.require_last("summary")?;
        Ok(())
    }

    fn assert_trace_values(tq: &TraceQuery<'_>) -> Result<(), String> {
        // Distinguishing assertion: the airport script is selected on real
        // overlap, the gap scenes between checkin and fly are inferred with
        // the bound actor, and the summary counts agree.
        let s = tq
            .detail_of("select-script")
            .ok_or("uo: missing select-script step")?;
        if !s.contains("'airport' (overlap 2/2") {
            return Err(format!("uo: wrong script or overlap: '{}'", s));
        }
        let gaps = tq.count_of("infer-gap");
        if gaps != 2 {
            return Err(format!(
                "uo: expected 2 inferred gap scenes, found {}",
                gaps
            ));
        }
        for scene in ["security", "board"] {
            let want = format!("scene '{}' inferred (filler: uo_pia)", scene);
            let ok = (0..gaps).any(|i| {
                tq.detail_kth("infer-gap", i)
                    .is_some_and(|d| d.contains(&want))
            });
            if !ok {
                return Err(format!("uo: missing inferred gap '{}'", want));
            }
        }
        let b = tq
            .detail_of("bind-role")
            .ok_or("uo: missing bind-role step")?;
        if !b.contains("passenger := uo_pia") {
            return Err(format!("uo: wrong role binding: '{}'", b));
        }
        let sum = tq.detail_of("summary").ok_or("uo: missing summary step")?;
        if !sum.contains("2 aligned, 2 inferred, 1 role binding") {
            return Err(format!("uo: summary counts inconsistent: '{}'", sum));
        }
        Ok(())
    }
}

/// AC-TABLE: replays a canned restaurant-script understanding regardless
/// of the observed events.
pub struct CheatScriptSam;
impl BreedAdversary for CheatScriptSam {
    type Target = ScriptSam;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        uo_cheat_out(
            BreedId::ScriptSam,
            &[
                ("select-script", "'restaurant' (overlap 2/2 events)"),
                ("align-event", "'enter' -> scene 0 of 'restaurant'"),
                ("bind-role", "diner := uo_pia"),
                ("align-event", "'pay' -> scene 3 of 'restaurant'"),
                ("infer-gap", "scene 'order' inferred (filler: uo_pia)"),
                ("infer-gap", "scene 'eat' inferred (filler: uo_pia)"),
                (
                    "summary",
                    "script 'restaurant': 2 aligned, 2 inferred, 1 role binding(s)",
                ),
            ],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-TABLE"
    }
}

// ── QualitativeReason ────────────────────────────────────────────────────

fn qr_input(uo_x_sign: &str) -> BreedInput {
    let mut input = base("uo_qualitative_tank");
    input.facts = vec![
        fact("qr:confluence:uo_c1", "+uo_x,-uo_y"),
        fact("qr:sign:uo_x", uo_x_sign),
    ];
    input
}

impl BreedOracle for QualitativeReason {
    fn breed_id() -> BreedId {
        BreedId::QualitativeReason
    }

    fn novel_input() -> BreedInput {
        // Ambiguous + ⊕ − confluence: envisionment branches into 3 states.
        let mut input = base("uo_qualitative_tank");
        input.facts = vec![
            fact("qr:confluence:uo_c1", "+uo_feed,-uo_drain,-uo_dlev"),
            fact("qr:sign:uo_feed", "+"),
            fact("qr:sign:uo_drain", "+"),
        ];
        input
    }

    fn boundary_pair() -> (BreedInput, BreedInput) {
        // Flipping the known sign forces the propagated sign to flip.
        (qr_input("+"), qr_input("-"))
    }

    fn refusal_input() -> BreedInput {
        // Over-constrained: a single positive term with a known + sign can
        // never sum to zero — no consistent qualitative state.
        let mut input = base("uo_qualitative_tank");
        input.facts = vec![
            fact("qr:confluence:uo_c1", "+uo_p"),
            fact("qr:sign:uo_p", "+"),
        ];
        input
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_first("load-model")?;
        trace.require_kinds(&["branch-ambiguity", "envision-state", "limit-analysis"])?;
        Ok(())
    }

    fn assert_trace_values(tq: &TraceQuery<'_>) -> Result<(), String> {
        // Distinguishing assertion: the + ⊕ − ambiguous confluence yields
        // MULTIPLE candidate states in the envisionment, each assigning the
        // unresolved variable uo_dlev.
        let b = tq
            .detail_of("branch-ambiguity")
            .ok_or("uo: missing branch-ambiguity step")?;
        if !b.contains("uo_c1") || !b.contains("ambiguous") {
            return Err(format!("uo: ambiguity not attributed to uo_c1: '{}'", b));
        }
        let n = tq.count_of("envision-state");
        if n < 2 {
            return Err(format!(
                "uo: ambiguous confluence must branch into >= 2 states, found {}",
                n
            ));
        }
        for i in 0..n {
            let d = tq
                .detail_kth("envision-state", i)
                .ok_or("uo: missing envision-state detail")?;
            if !d.contains("uo_dlev:") {
                return Err(format!(
                    "uo: state omits the branched variable uo_dlev: '{}'",
                    d
                ));
            }
        }
        Ok(())
    }
}

/// AC-ALWAYS: always emits a single canned state, never branching on
/// the ambiguity.
pub struct CheatQualitativeReason;
impl BreedAdversary for CheatQualitativeReason {
    type Target = QualitativeReason;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        uo_cheat_out(
            BreedId::QualitativeReason,
            &[
                ("load-model", "3 variables, 1 confluences, 2 known signs"),
                ("branch-ambiguity", "resolved by default policy"),
                // Always the same single state, regardless of input.
                ("envision-state", "S0: all derivatives positive"),
                ("limit-analysis", "S0: no limit crossing"),
            ],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-ALWAYS"
    }
}

// ── NaivePhysics ─────────────────────────────────────────────────────────

fn np_scene(remove_shelf: bool) -> BreedInput {
    let mut input = base("uo_predict_kitchen_scene");
    input.facts = vec![
        fact("np:on:uo_cup", "uo_shelf"),
        fact("np:on:uo_shelf", "uo_floor"),
        fact("np:ground:uo_floor", "true"),
        fact("np:liquid:uo_brew", "uo_cup"),
    ];
    if remove_shelf {
        input.facts.push(fact("np:remove:uo_shelf", "true"));
    }
    input
}

impl BreedOracle for NaivePhysics {
    fn breed_id() -> BreedId {
        BreedId::NaivePhysics
    }

    fn novel_input() -> BreedInput {
        np_scene(true)
    }

    fn boundary_pair() -> (BreedInput, BreedInput) {
        // With the shelf removed the cup falls and the brew spills; with the
        // support intact nothing falls — predictions differ.
        (np_scene(true), np_scene(false))
    }

    fn refusal_input() -> BreedInput {
        // No np:* facts: there is no scene to reason about.
        base("uo_predict_kitchen_scene")
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_first("load-scene")?;
        trace.require_kinds(&["apply-axiom", "predict", "decision"])?;
        Ok(())
    }

    fn assert_trace_values(tq: &TraceQuery<'_>) -> Result<(), String> {
        // Distinguishing assertion: the decision counts are DERIVED from the
        // actual predictions (cup falls, brew spills after shelf removal),
        // not hardcoded numbers.
        let n = tq.count_of("predict");
        let mut falls = 0usize;
        let mut spills = 0usize;
        let mut saw_cup = false;
        let mut saw_brew = false;
        for i in 0..n {
            let d = tq
                .detail_kth("predict", i)
                .ok_or("uo: missing predict detail")?;
            if d.starts_with("falls:") {
                falls += 1;
                saw_cup |= d == "falls:uo_cup";
            }
            if d.starts_with("spills:") {
                spills += 1;
                saw_brew |= d == "spills:uo_brew";
            }
        }
        if !saw_cup {
            return Err("uo: missing prediction 'falls:uo_cup' after shelf removal".to_string());
        }
        if !saw_brew {
            return Err("uo: missing prediction 'spills:uo_brew' from the falling cup".to_string());
        }
        let dec = tq
            .detail_of("decision")
            .ok_or("uo: missing decision step")?;
        let want = format!("{} objects fall, {} liquids spill", falls, spills);
        if dec != want {
            return Err(format!(
                "uo: decision '{}' disagrees with predictions ('{}')",
                dec, want
            ));
        }
        let ax = tq.count_of("apply-axiom");
        let spill_ok = (0..ax).any(|i| {
            tq.detail_kth("apply-axiom", i)
                .is_some_and(|d| d.contains("ax-liquid-spill: 'uo_brew' spills from 'uo_cup'"))
        });
        if !spill_ok {
            return Err("uo: spill prediction not justified by ax-liquid-spill".to_string());
        }
        Ok(())
    }
}

/// AC-TABLE: returns a canned "nothing happens" scene analysis.
pub struct CheatNaivePhysics;
impl BreedAdversary for CheatNaivePhysics {
    type Target = NaivePhysics;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        uo_cheat_out(
            BreedId::NaivePhysics,
            &[
                (
                    "load-scene",
                    "3 objects, 2 support relations, 1 liquids, removed: {uo_shelf}",
                ),
                ("apply-axiom", "ax-support: 'uo_cup' is stable"),
                // Table answer: nothing falls, nothing spills.
                ("predict", "none"),
                ("decision", "0 objects fall, 0 liquids spill"),
            ],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-TABLE"
    }
}

// ── MetaReasoning ────────────────────────────────────────────────────────

fn meta_input(alpha_conf: &str, beta_conf: &str) -> BreedInput {
    let mut input = base("uo_arbitrate_route");
    input.facts = vec![
        fact("breed:uo_alpha:conclusion", "uo_route=uo_north"),
        fact("breed:uo_alpha:confidence", alpha_conf),
        fact("breed:uo_beta:conclusion", "uo_route=uo_south"),
        fact("breed:uo_beta:confidence", beta_conf),
    ];
    input
}

impl BreedOracle for MetaReasoning {
    fn breed_id() -> BreedId {
        BreedId::MetaReasoning
    }

    fn novel_input() -> BreedInput {
        // Two object-level reports conflicting on the same decision key.
        meta_input("0.8", "0.55")
    }

    fn boundary_pair() -> (BreedInput, BreedInput) {
        // Swapping the confidence weights flips the vote winner.
        (meta_input("0.9", "0.3"), meta_input("0.3", "0.9"))
    }

    fn refusal_input() -> BreedInput {
        // A single report cannot be arbitrated.
        let mut input = base("uo_arbitrate_route");
        input.facts = vec![
            fact("breed:uo_alpha:conclusion", "uo_route=uo_north"),
            fact("breed:uo_alpha:confidence", "0.8"),
        ];
        input
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_non_empty_with_kinds(&[
            "ingest-report",
            "conflict-detected",
            "vote",
            "resolve",
        ])?;
        Ok(())
    }

    fn assert_trace_values(tq: &TraceQuery<'_>) -> Result<(), String> {
        // Distinguishing assertion: the contradictory uo_alpha/uo_beta reports
        // on uo_route are detected as a value conflict, and the vote winner is
        // the higher-confidence conclusion with its real weights.
        let c = tq
            .detail_of("conflict-detected")
            .ok_or("uo: missing conflict-detected step")?;
        if !c.contains("uo_alpha vs uo_beta on 'uo_route'") || !c.contains("differing values") {
            return Err(format!(
                "uo: conflict not attributed to the report pair: '{}'",
                c
            ));
        }
        let v = tq.detail_of("vote").ok_or("uo: missing vote step")?;
        if !v.contains("uo_north=0.800000")
            || !v.contains("uo_south=0.550000")
            || !v.contains("-> winner uo_north=0.800000")
        {
            return Err(format!("uo: vote weights or winner are wrong: '{}'", v));
        }
        let r = tq.detail_of("resolve").ok_or("uo: missing resolve step")?;
        if !r.contains("selected uo_route=uo_north") {
            return Err(format!(
                "uo: resolution does not select uo_route=uo_north: '{}'",
                r
            ));
        }
        Ok(())
    }
}

/// AC-ALWAYS: always reports "no conflict" and the same canned resolution.
pub struct CheatMetaReasoning;
impl BreedAdversary for CheatMetaReasoning {
    type Target = MetaReasoning;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        uo_cheat_out(
            BreedId::MetaReasoning,
            &[
                (
                    "ingest-report",
                    "uo_alpha: uo_route=uo_north (confidence 0.800000)",
                ),
                (
                    "ingest-report",
                    "uo_beta: uo_route=uo_south (confidence 0.550000)",
                ),
                // Always the same verdict, no real conflict analysis or vote.
                ("conflict-detected", "none"),
                ("vote", "key 'uo_route': unanimous"),
                (
                    "resolve",
                    "0 conflict(s); 1 decision key(s); selected uo_route=uo_north",
                ),
            ],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-ALWAYS"
    }
}

// ── Self-verification tests ──────────────────────────────────────────────

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use crate::breeds::dispatch::dispatch_breed_id;
    use crate::breeds::support::oracle::run_adversary_check;

    fn uo_check_real<B: BreedOracle>() {
        let out = dispatch_breed_id(B::breed_id(), &B::novel_input())
            .expect("novel_input must run on the real breed");
        let tq = TraceQuery::new(&out.inference_trace);
        if let Err(e) = B::assert_trace_values(&tq) {
            panic!(
                "assert_trace_values rejected the REAL trace: {}\ntrace: {:#?}",
                e, out.inference_trace
            );
        }
    }

    #[test]
    fn uo_cbr_values_and_adversary() {
        uo_check_real::<Cbr>();
        assert!(run_adversary_check::<CheatCbr>().is_pass());
    }

    #[test]
    fn uo_ilp_values_and_adversary() {
        uo_check_real::<Ilp>();
        assert!(run_adversary_check::<CheatIlp>().is_pass());
    }

    #[test]
    fn uo_ebl_values_and_adversary() {
        uo_check_real::<Ebl>();
        assert!(run_adversary_check::<CheatEbl>().is_pass());
    }

    #[test]
    fn uo_version_space_values_and_adversary() {
        uo_check_real::<VersionSpace>();
        assert!(run_adversary_check::<CheatVersionSpace>().is_pass());
    }

    #[test]
    fn uo_analogy_sme_values_and_adversary() {
        uo_check_real::<AnalogySme>();
        assert!(run_adversary_check::<CheatAnalogySme>().is_pass());
    }

    #[test]
    fn uo_episodic_memory_values_and_adversary() {
        uo_check_real::<EpisodicMemory>();
        assert!(run_adversary_check::<CheatEpisodicMemory>().is_pass());
    }

    #[test]
    fn uo_script_sam_values_and_adversary() {
        uo_check_real::<ScriptSam>();
        assert!(run_adversary_check::<CheatScriptSam>().is_pass());
    }

    #[test]
    fn uo_qualitative_reason_values_and_adversary() {
        uo_check_real::<QualitativeReason>();
        assert!(run_adversary_check::<CheatQualitativeReason>().is_pass());
    }

    #[test]
    fn uo_naive_physics_values_and_adversary() {
        uo_check_real::<NaivePhysics>();
        assert!(run_adversary_check::<CheatNaivePhysics>().is_pass());
    }

    #[test]
    fn uo_meta_reasoning_values_and_adversary() {
        uo_check_real::<MetaReasoning>();
        assert!(run_adversary_check::<CheatMetaReasoning>().is_pass());
    }
}
