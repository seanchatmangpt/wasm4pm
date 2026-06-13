//! [`BreedOracle`] impls for the dialogue / perception / language breeds:
//! Eliza, Dendral, Hearsay, ConstructionGrammar, and the four Autoinstinct
//! breeds (Learning, Semantics, Neurosis, Vision).
//!
//! All novel content uses fresh `uo_` names (defeats A1/A2).

use super::{base, candidate, fact, goal, rule};
use crate::breeds::autoinstinct_learning::AutoinstinctLearning;
use crate::breeds::autoinstinct_neurosis::AutoinstinctNeurosis;
use crate::breeds::autoinstinct_semantics::AutoinstinctSemantics;
use crate::breeds::autoinstinct_vision::AutoinstinctVision;
use crate::breeds::construction_grammar::ConstructionGrammar;
use crate::breeds::dendral::Dendral;
use crate::breeds::frame::Eliza;
use crate::breeds::hearsay::Hearsay;
use crate::breeds::support::oracle::{BreedAdversary, BreedOracle};
use crate::breeds::support::trace_query::TraceQuery;
use crate::breeds::{BreedId, BreedInput, BreedOutput, TraceStep};

/// Build a plausible-looking cheat output: right step kinds, hollow or wrong
/// details. Used only by the `Cheat*` adversaries below (U6 meta-oracle).
fn cheat_output(breed: BreedId, steps: &[(&str, &str)]) -> BreedOutput {
    BreedOutput {
        breed,
        candidates: vec![],
        facts: vec![],
        selected: None,
        explanation: String::new(),
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

// ── Eliza ────────────────────────────────────────────────────────────────────

impl BreedOracle for Eliza {
    fn breed_id() -> BreedId {
        BreedId::Eliza
    }

    fn novel_input() -> BreedInput {
        // Matches the built-in "i am * because *" frame with fresh slot fillers.
        base("i am uo_flustrated because uo_grindle hums at me")
    }

    fn boundary_pair() -> (BreedInput, BreedInput) {
        // Different frames fire → different selected pattern + explanation.
        (
            base("i feel uo_brimblish today"),
            base("i need uo_brimblish today"),
        )
    }

    fn refusal_input() -> BreedInput {
        // Precondition: ELIZA requires a non-empty intent.
        base("")
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_non_empty_with_kinds(&["try-pattern", "match-pattern", "bind-slot"])?;
        let matched = trace
            .detail_of("match-pattern")
            .ok_or_else(|| "missing match-pattern detail".to_string())?;
        if matched != "i am * because *" {
            return Err(format!(
                "expected 'i am * because *' to match the novel input, got '{}'",
                matched
            ));
        }
        let slot = trace
            .detail_of("bind-slot")
            .ok_or_else(|| "missing bind-slot detail".to_string())?;
        if !slot.contains("uo_flustrated") {
            return Err(format!(
                "first slot must capture uo_flustrated, got '{}'",
                slot
            ));
        }
        Ok(())
    }

    fn assert_trace_values(tq: &TraceQuery<'_>) -> Result<(), String> {
        // Both wildcards of "i am * because *" must capture the actual novel
        // input content, positionally bound (run(): detail = "${i}=<capture>").
        if tq.count_of("bind-slot") != 2 {
            return Err(format!(
                "expected exactly 2 bind-slot steps for two wildcards, got {}",
                tq.count_of("bind-slot")
            ));
        }
        let s1 = tq
            .detail_kth("bind-slot", 0)
            .ok_or("missing bind-slot[0]")?;
        if s1 != "${1}=uo_flustrated" {
            return Err(format!("slot 1 must bind uo_flustrated, got '{}'", s1));
        }
        let s2 = tq
            .detail_kth("bind-slot", 1)
            .ok_or("missing bind-slot[1]")?;
        if s2 != "${2}=uo_grindle hums at me" {
            return Err(format!(
                "slot 2 must reflect captured wildcard 'uo_grindle hums at me', got '{}'",
                s2
            ));
        }
        // The matched pattern is the most specific (longest-first ordering).
        let matched = tq
            .detail_of("match-pattern")
            .ok_or("missing match-pattern")?;
        if matched != "i am * because *" {
            return Err(format!(
                "matched pattern must be 'i am * because *', got '{}'",
                matched
            ));
        }
        Ok(())
    }
}

/// AC-ALWAYS: canned Rogerian response — emits the right kinds with a fixed,
/// input-independent slot binding instead of the captured wildcard content.
pub struct CheatEliza;
impl BreedAdversary for CheatEliza {
    type Target = Eliza;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        cheat_output(
            BreedId::Eliza,
            &[
                ("try-pattern", "i am * because *"),
                ("match-pattern", "i am * because *"),
                ("bind-slot", "${1}=sad"),
                ("bind-slot", "${2}=life is hard"),
            ],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-ALWAYS"
    }
}

// ── Dendral ──────────────────────────────────────────────────────────────────

impl BreedOracle for Dendral {
    fn breed_id() -> BreedId {
        BreedId::Dendral
    }

    fn novel_input() -> BreedInput {
        let mut input = base("uo_enumerate_compounds");
        input.candidates = vec![candidate("uo_pylor", 0.9), candidate("uo_quenz", 0.4)];
        input.facts = vec![fact("constraint", "forbid:uo_pylor")];
        input
    }

    fn boundary_pair() -> (BreedInput, BreedInput) {
        // Different constraints eliminate different candidates → different selected.
        let mut a = base("uo_enumerate_compounds");
        a.candidates = vec![candidate("uo_pylor", 0.9), candidate("uo_quenz", 0.4)];
        a.facts = vec![fact("constraint", "forbid:uo_pylor")];
        let mut b = base("uo_enumerate_compounds");
        b.candidates = vec![candidate("uo_pylor", 0.9), candidate("uo_quenz", 0.4)];
        b.facts = vec![fact("constraint", "forbid:uo_quenz")];
        (a, b)
    }

    fn refusal_input() -> BreedInput {
        // Precondition: DENDRAL requires at least one candidate.
        base("uo_enumerate_compounds")
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_non_empty_with_kinds(&["eliminate", "survive"])?;
        let eliminated = trace
            .detail_of("eliminate")
            .ok_or_else(|| "missing eliminate detail".to_string())?;
        if !eliminated.contains("uo_pylor") {
            return Err(format!(
                "uo_pylor must be eliminated by forbid, got '{}'",
                eliminated
            ));
        }
        let survivor = trace
            .detail_of("survive")
            .ok_or_else(|| "missing survive detail".to_string())?;
        if !survivor.contains("uo_quenz") {
            return Err(format!("uo_quenz must survive, got '{}'", survivor));
        }
        Ok(())
    }

    fn assert_trace_values(tq: &TraceQuery<'_>) -> Result<(), String> {
        // Exactly one structure is eliminated, and the eliminate detail must
        // carry the full constraint provenance (run(): "{id} by {constraint}: {reason}").
        if tq.count_of("eliminate") != 1 {
            return Err(format!(
                "exactly 1 structure must be eliminated, got {}",
                tq.count_of("eliminate")
            ));
        }
        let elim = tq.detail_of("eliminate").ok_or("missing eliminate")?;
        if elim != "uo_pylor by forbid:uo_pylor: forbidden by constraint forbid:uo_pylor" {
            return Err(format!(
                "eliminate must name uo_pylor with the forbid constraint and reason, got '{}'",
                elim
            ));
        }
        if tq.count_of("survive") != 1 {
            return Err(format!(
                "exactly 1 structure must survive, got {}",
                tq.count_of("survive")
            ));
        }
        let surv = tq.detail_of("survive").ok_or("missing survive")?;
        if surv != "uo_quenz" {
            return Err(format!("survivor must be uo_quenz, got '{}'", surv));
        }
        Ok(())
    }
}

/// AC-TABLE: lookup table keyed on the intent — emits eliminate/survive kinds
/// with hollow details (no constraint provenance, wrong candidate ids).
pub struct CheatDendral;
impl BreedAdversary for CheatDendral {
    type Target = Dendral;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        cheat_output(
            BreedId::Dendral,
            &[
                ("eliminate", "table hit: candidate 0"),
                ("survive", "table hit: candidate 1"),
            ],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-TABLE"
    }
}

// ── Hearsay ──────────────────────────────────────────────────────────────────

impl BreedOracle for Hearsay {
    fn breed_id() -> BreedId {
        BreedId::Hearsay
    }

    fn novel_input() -> BreedInput {
        let mut input = base("uo_blackboard_fusion");
        input.facts = vec![fact("uo_phone", "UO_T")];
        input.rules = vec![rule(
            "uo_ks_word",
            &["uo_phone:UO_T"],
            "uo_word:UO_THRENT",
            0.8,
        )];
        input
    }

    fn boundary_pair() -> (BreedInput, BreedInput) {
        // Different KS conclusions → different posted hypothesis is selected.
        let mut a = base("uo_blackboard_fusion");
        a.facts = vec![fact("uo_phone", "UO_T")];
        a.rules = vec![rule("uo_ks_a", &["uo_phone:UO_T"], "uo_word:UO_AAVE", 0.8)];
        let mut b = base("uo_blackboard_fusion");
        b.facts = vec![fact("uo_phone", "UO_T")];
        b.rules = vec![rule("uo_ks_b", &["uo_phone:UO_T"], "uo_word:UO_BREVE", 0.8)];
        (a, b)
    }

    fn refusal_input() -> BreedInput {
        // Precondition: Hearsay requires at least one knowledge source (rule).
        let mut input = base("uo_blackboard_fusion");
        input.facts = vec![fact("uo_phone", "UO_T")];
        input
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_non_empty_with_kinds(&["seed", "enqueue-ksar", "post-hypothesis"])?;
        let seeded = trace
            .detail_of("seed")
            .ok_or_else(|| "missing seed detail".to_string())?;
        if seeded != "uo_phone:UO_T" {
            return Err(format!("seed must post uo_phone:UO_T, got '{}'", seeded));
        }
        let posted = trace
            .detail_of("post-hypothesis")
            .ok_or_else(|| "missing post-hypothesis detail".to_string())?;
        if !posted.contains("uo_word:UO_THRENT") {
            return Err(format!("KS must post uo_word:UO_THRENT, got '{}'", posted));
        }
        Ok(())
    }

    fn assert_trace_values(tq: &TraceQuery<'_>) -> Result<(), String> {
        // ≥2 knowledge-source activity steps with hypothesis content: the KSAR
        // enqueue and the firing that posts the hypothesis, both carrying the
        // computed rating (certainty 0.8 × seed cf 1.0 = 0.800).
        let ks_activity = tq.count_of("enqueue-ksar") + tq.count_of("post-hypothesis");
        if ks_activity < 2 {
            return Err(format!(
                "expected >=2 knowledge-source activity steps (enqueue+post), got {}",
                ks_activity
            ));
        }
        let enq = tq.detail_of("enqueue-ksar").ok_or("missing enqueue-ksar")?;
        if enq != "ks=uo_ks_word trigger=uo_phone:UO_T rating=0.800" {
            return Err(format!(
                "enqueue-ksar must carry KS id, trigger, and computed rating 0.800, got '{}'",
                enq
            ));
        }
        let posted = tq
            .detail_of("post-hypothesis")
            .ok_or("missing post-hypothesis")?;
        if posted != "uo_ks_word ⇒ uo_word:UO_THRENT (rating=0.800)" {
            return Err(format!(
                "post-hypothesis must show uo_ks_word posting uo_word:UO_THRENT at rating 0.800, got '{}'",
                posted
            ));
        }
        let seed = tq.detail_of("seed").ok_or("missing seed")?;
        if seed != "uo_phone:UO_T" {
            return Err(format!(
                "blackboard seed must be uo_phone:UO_T, got '{}'",
                seed
            ));
        }
        Ok(())
    }
}

/// AC-TABLE: cached blackboard transcript — right kinds, but the posted
/// hypothesis and ratings come from a table, not from the input KS.
pub struct CheatHearsay;
impl BreedAdversary for CheatHearsay {
    type Target = Hearsay;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        cheat_output(
            BreedId::Hearsay,
            &[
                ("seed", "phone:T"),
                ("enqueue-ksar", "ks=cached trigger=phone:T rating=1.000"),
                ("post-hypothesis", "cached ⇒ word:THE (rating=1.000)"),
            ],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-TABLE"
    }
}

// ── ConstructionGrammar ──────────────────────────────────────────────────────

fn cxg_lexicon(input: &mut BreedInput) {
    input.facts.push(fact("lex:the:pos", "det"));
    input.facts.push(fact("lex:uo_vrang:pos", "noun"));
    input.facts.push(fact("lex:uo_flarbed:pos", "verb"));
    input.facts.push(fact("lex:uo_scroll:pos", "noun"));
    input.facts.push(fact("lex:to:pos", "prep"));
    input.facts.push(fact("lex:uo_plomb:pos", "noun"));
}

impl BreedOracle for ConstructionGrammar {
    fn breed_id() -> BreedId {
        BreedId::ConstructionGrammar
    }

    fn novel_input() -> BreedInput {
        let mut input = base("uo_parse_utterance");
        input.facts = vec![fact(
            "cxg:utterance",
            "the uo_vrang uo_flarbed the uo_scroll",
        )];
        cxg_lexicon(&mut input);
        input
    }

    fn boundary_pair() -> (BreedInput, BreedInput) {
        // NP post-verb → transitive; NP PP post-verb → caused-motion.
        let mut a = base("uo_parse_utterance");
        a.facts = vec![fact(
            "cxg:utterance",
            "the uo_vrang uo_flarbed the uo_scroll",
        )];
        cxg_lexicon(&mut a);
        let mut b = base("uo_parse_utterance");
        b.facts = vec![fact(
            "cxg:utterance",
            "the uo_vrang uo_flarbed the uo_scroll to the uo_plomb",
        )];
        cxg_lexicon(&mut b);
        (a, b)
    }

    fn refusal_input() -> BreedInput {
        // Precondition: the cxg:utterance fact must be non-empty.
        let mut input = base("uo_parse_utterance");
        input.facts = vec![fact("cxg:utterance", "")];
        cxg_lexicon(&mut input);
        input
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_non_empty_with_kinds(&[
            "tokenize",
            "pos-tag",
            "chunk",
            "match-construction",
            "bind-slot",
            "fuse-meaning",
        ])?;
        let meaning = trace
            .detail_of("fuse-meaning")
            .ok_or_else(|| "missing fuse-meaning detail".to_string())?;
        if !meaning.contains("ACT-ON") || !meaning.contains("uo_vrang") {
            return Err(format!(
                "expected ACT-ON frame over subject uo_vrang, got '{}'",
                meaning
            ));
        }
        if !meaning.contains("transitive") {
            return Err(format!(
                "expected the transitive construction, got '{}'",
                meaning
            ));
        }
        Ok(())
    }

    fn assert_trace_values(tq: &TraceQuery<'_>) -> Result<(), String> {
        // The novel uo_ verb must be parsed BY the construction form: it shows
        // up POS-tagged as a verb, and the fused meaning names it as the verb
        // of the transitive frame with the actual NP fillers.
        let tok = tq.detail_of("tokenize").ok_or("missing tokenize")?;
        if tok != "the uo_vrang uo_flarbed the uo_scroll" {
            return Err(format!(
                "tokenize must reproduce the utterance, got '{}'",
                tok
            ));
        }
        if tq.count_of("pos-tag") != 5 {
            return Err(format!(
                "expected 5 pos-tag steps, got {}",
                tq.count_of("pos-tag")
            ));
        }
        let vtag = tq.detail_kth("pos-tag", 2).ok_or("missing pos-tag[2]")?;
        if vtag != "uo_flarbed/verb" {
            return Err(format!(
                "novel verb must tag as uo_flarbed/verb, got '{}'",
                vtag
            ));
        }
        let matched = tq
            .last_of("match-construction")
            .ok_or("missing match-construction")?;
        if matched.detail != "transitive: match" {
            return Err(format!(
                "transitive construction must match the NP post-verb shape, got '{}'",
                matched.detail
            ));
        }
        let subj = tq
            .detail_kth("bind-slot", 0)
            .ok_or("missing bind-slot[0]")?;
        if subj != "subj <- the uo_vrang" {
            return Err(format!(
                "subject slot must bind 'the uo_vrang', got '{}'",
                subj
            ));
        }
        let meaning = tq.detail_of("fuse-meaning").ok_or("missing fuse-meaning")?;
        if !meaning.contains("verb=uo_flarbed") || !meaning.contains("the uo_scroll") {
            return Err(format!(
                "fused meaning must name verb=uo_flarbed over object 'the uo_scroll', got '{}'",
                meaning
            ));
        }
        Ok(())
    }
}

/// AC-TABLE: canned parse of a stock sentence — all six kinds present but the
/// values come from a memorized table, not from the novel utterance.
pub struct CheatConstructionGrammar;
impl BreedAdversary for CheatConstructionGrammar {
    type Target = ConstructionGrammar;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        cheat_output(
            BreedId::ConstructionGrammar,
            &[
                ("tokenize", "the cat chased the mouse"),
                ("pos-tag", "the/det"),
                ("pos-tag", "cat/noun"),
                ("pos-tag", "chased/verb"),
                ("pos-tag", "the/det"),
                ("pos-tag", "mouse/noun"),
                ("chunk", "NP[the cat]"),
                ("chunk", "NP[the mouse]"),
                ("match-construction", "transitive: match"),
                ("bind-slot", "subj <- the cat"),
                ("bind-slot", "obj <- the mouse (arg 1)"),
                (
                    "fuse-meaning",
                    "ACT-ON(the cat, the mouse; verb=chased) via transitive",
                ),
            ],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-TABLE"
    }
}

// ── AutoinstinctLearning ─────────────────────────────────────────────────────

impl BreedOracle for AutoinstinctLearning {
    fn breed_id() -> BreedId {
        BreedId::AutoinstinctLearning
    }

    fn novel_input() -> BreedInput {
        let mut input = base("uo_plan_to_summit");
        input.goals = vec![
            goal("uo_g_alpha", "uo_reach", "uo_peak"),
            goal("uo_g_beta", "uo_reach", "uo_ridge"),
        ];
        input
    }

    fn boundary_pair() -> (BreedInput, BreedInput) {
        // 1 goal vs 3 goals → different plan lengths → different selected.
        let mut a = base("uo_plan_to_summit");
        a.goals = vec![goal("uo_g_alpha", "uo_reach", "uo_peak")];
        let mut b = base("uo_plan_to_summit");
        b.goals = vec![
            goal("uo_g_alpha", "uo_reach", "uo_peak"),
            goal("uo_g_beta", "uo_reach", "uo_ridge"),
            goal("uo_g_gamma", "uo_reach", "uo_col"),
        ];
        (a, b)
    }

    fn refusal_input() -> BreedInput {
        // Precondition: at least one goal to plan toward.
        base("uo_plan_to_summit")
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_non_empty()?;
        trace.require_at_least("plan-step", 2)?;
        let last = trace
            .last_of("plan-step")
            .ok_or_else(|| "missing plan-step".to_string())?;
        if !last.detail.contains("distance=0") {
            return Err(format!(
                "final plan-step must reach distance=0, got '{}'",
                last.detail
            ));
        }
        Ok(())
    }

    fn assert_trace_values(tq: &TraceQuery<'_>) -> Result<(), String> {
        // Core computation values: 2 goals → goal_mask 0b00000011, empty
        // initial state → heuristic distance must descend 2 → 1 → 0 with the
        // state bitmask accumulating bits (run(): "state=... distance=...").
        if tq.count_of("plan-step") != 3 {
            return Err(format!(
                "expected 3 plan-step states for a 2-goal plan, got {}",
                tq.count_of("plan-step")
            ));
        }
        let first = tq
            .detail_kth("plan-step", 0)
            .ok_or("missing plan-step[0]")?;
        if !first.contains("state=0b00000000") || !first.contains("distance=2") {
            return Err(format!(
                "initial plan-step must be empty state at distance=2, got '{}'",
                first
            ));
        }
        let mid = tq
            .detail_kth("plan-step", 1)
            .ok_or("missing plan-step[1]")?;
        if !mid.contains("distance=1") {
            return Err(format!(
                "middle plan-step must be at distance=1, got '{}'",
                mid
            ));
        }
        let last = tq
            .detail_kth("plan-step", 2)
            .ok_or("missing plan-step[2]")?;
        if !last.contains("state=0b00000011") || !last.contains("distance=0") {
            return Err(format!(
                "final plan-step must reach goal state 0b00000011 at distance=0, got '{}'",
                last
            ));
        }
        Ok(())
    }
}

/// AC-FLAT: emits the right number of plan-step kinds but with flat values —
/// every step already claims distance=0 with no state progression (no search
/// actually performed). Passes the kind/shape checks; the value check rejects.
pub struct CheatAutoinstinctLearning;
impl BreedAdversary for CheatAutoinstinctLearning {
    type Target = AutoinstinctLearning;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        cheat_output(
            BreedId::AutoinstinctLearning,
            &[
                (
                    "plan-step",
                    "state=0b00000011 distance=0 action toward goal: flip next missing bit",
                ),
                (
                    "plan-step",
                    "state=0b00000011 distance=0 action toward goal: flip next missing bit",
                ),
                (
                    "plan-step",
                    "state=0b00000011 distance=0 action toward goal: flip next missing bit",
                ),
            ],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-FLAT"
    }
}

// ── AutoinstinctSemantics ────────────────────────────────────────────────────

impl BreedOracle for AutoinstinctSemantics {
    fn breed_id() -> BreedId {
        BreedId::AutoinstinctSemantics
    }

    fn novel_input() -> BreedInput {
        // "actor verb object to recipient" — the verb must be in the built-in
        // lexicon (give → Atrans); all names are fresh uo_ tokens.
        base("Uo_vrang give uo_scroll to Uo_plomb")
    }

    fn boundary_pair() -> (BreedInput, BreedInput) {
        // give → Atrans vs go → Ptrans: different extracted CD primitive.
        (
            base("Uo_vrang give uo_scroll to Uo_plomb"),
            base("Uo_vrang go uo_grotto from Uo_plomb"),
        )
    }

    fn refusal_input() -> BreedInput {
        // Precondition: requires a non-empty intent sentence.
        base("")
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_non_empty_with_kinds(&["init-parser", "extract-act", "extract-recipient"])?;
        let act = trace
            .detail_of("extract-act")
            .ok_or_else(|| "missing extract-act detail".to_string())?;
        if !act.contains("Atrans") || !act.contains("Uo_vrang") || !act.contains("uo_scroll") {
            return Err(format!(
                "expected Atrans with actor Uo_vrang and object uo_scroll, got '{}'",
                act
            ));
        }
        let recipient = trace
            .detail_of("extract-recipient")
            .ok_or_else(|| "missing extract-recipient detail".to_string())?;
        if !recipient.contains("Uo_plomb") {
            return Err(format!("recipient must be Uo_plomb, got '{}'", recipient));
        }
        Ok(())
    }

    fn assert_trace_values(tq: &TraceQuery<'_>) -> Result<(), String> {
        // Extracted act/actor/object values must reflect the actual input
        // sentence (run(): "rule=... act=... actor=... object=...").
        let act = tq.detail_of("extract-act").ok_or("missing extract-act")?;
        if act != "rule=sem-ATRANS act=Atrans actor=Uo_vrang object=uo_scroll" {
            return Err(format!(
                "extract-act must carry actor=Uo_vrang and object=uo_scroll under Atrans, got '{}'",
                act
            ));
        }
        let rec = tq
            .detail_of("extract-recipient")
            .ok_or("missing extract-recipient")?;
        if rec != "to=Uo_plomb" {
            return Err(format!(
                "extract-recipient must be to=Uo_plomb, got '{}'",
                rec
            ));
        }
        let init = tq.detail_of("init-parser").ok_or("missing init-parser")?;
        if !init.contains("Uo_vrang give uo_scroll to Uo_plomb") {
            return Err(format!(
                "init-parser must echo the parsed intent, got '{}'",
                init
            ));
        }
        Ok(())
    }
}

/// AC-FLAT: emits the right kinds but with flat details — the CD primitive is
/// named with no extracted actor/object/recipient values from the input.
pub struct CheatAutoinstinctSemantics;
impl BreedAdversary for CheatAutoinstinctSemantics {
    type Target = AutoinstinctSemantics;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        cheat_output(
            BreedId::AutoinstinctSemantics,
            &[
                ("init-parser", "SemanticParser created"),
                ("extract-act", "act=Atrans"),
                ("extract-recipient", "to=recipient"),
            ],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-FLAT"
    }
}

// ── AutoinstinctNeurosis ─────────────────────────────────────────────────────

impl BreedOracle for AutoinstinctNeurosis {
    fn breed_id() -> BreedId {
        BreedId::AutoinstinctNeurosis
    }

    fn novel_input() -> BreedInput {
        let mut input = base("uo_affect_probe");
        input.facts = vec![fact("belief:uo_thrum", "0.8")];
        input
    }

    fn boundary_pair() -> (BreedInput, BreedInput) {
        // Same seeded conviction, conflicting vs agreeing stimulus strength →
        // different response label, elimination flag, and affect snapshot.
        let mut a = base("uo_affect_probe");
        a.facts = vec![fact("belief:uo_thrum", "1.0")];
        a.candidates = vec![candidate("uo_thrum", 0.0)];
        let mut b = base("uo_affect_probe");
        b.facts = vec![fact("belief:uo_thrum", "1.0")];
        b.candidates = vec![candidate("uo_thrum", 0.95)];
        (a, b)
    }

    fn refusal_input() -> BreedInput {
        // Precondition: at least one fact to seed the belief network.
        base("uo_affect_probe")
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_non_empty_with_kinds(&["seed-beliefs", "affect-snapshot"])?;
        let seeded = trace
            .detail_of("seed-beliefs")
            .ok_or_else(|| "missing seed-beliefs detail".to_string())?;
        if !seeded.contains("seeded 1 beliefs") {
            return Err(format!(
                "must seed exactly 1 belief from facts, got '{}'",
                seeded
            ));
        }
        // The default_stimulus is a novel concept → "curious" response and a
        // second belief node alongside the seeded uo_thrum conviction.
        trace.require_kind("curious")?;
        let snapshot = trace
            .detail_of("affect-snapshot")
            .ok_or_else(|| "missing affect-snapshot detail".to_string())?;
        if !snapshot.contains("beliefs=2") {
            return Err(format!(
                "final snapshot must report beliefs=2, got '{}'",
                snapshot
            ));
        }
        Ok(())
    }

    fn assert_trace_values(tq: &TraceQuery<'_>) -> Result<(), String> {
        // The response step must name the actual stimulus that conflicted with
        // nothing known (novel → curious) and carry the measured affect deltas
        // (run(): stimulus="..." strength=... Δfear=... Δanger=... Δmistrust=...).
        let seeded = tq.detail_of("seed-beliefs").ok_or("missing seed-beliefs")?;
        if seeded != "seeded 1 beliefs from facts" {
            return Err(format!(
                "seed-beliefs must report exactly the 1 belief:uo_thrum fact, got '{}'",
                seeded
            ));
        }
        let curious = tq
            .detail_of("curious")
            .ok_or("missing curious response step")?;
        if !curious.contains("stimulus=\"default_stimulus\"")
            || !curious.contains("strength=0.500")
            || !curious.contains("Δfear=")
        {
            return Err(format!(
                "curious step must name the conflicting stimulus and affect deltas, got '{}'",
                curious
            ));
        }
        let snap = tq
            .detail_of("affect-snapshot")
            .ok_or("missing affect-snapshot")?;
        if !snap.contains("beliefs=2") || !snap.contains("fear=") || !snap.contains("mistrust=") {
            return Err(format!(
                "affect-snapshot must carry final fear/mistrust values and beliefs=2, got '{}'",
                snap
            ));
        }
        Ok(())
    }
}

/// AC-ALWAYS: always reports a serene, work-free affect pass — seeds nothing,
/// never registers the stimulus, and snapshots an empty belief network.
pub struct CheatAutoinstinctNeurosis;
impl BreedAdversary for CheatAutoinstinctNeurosis {
    type Target = AutoinstinctNeurosis;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        cheat_output(
            BreedId::AutoinstinctNeurosis,
            &[
                ("seed-beliefs", "seeded 0 beliefs from facts"),
                ("calm", "all stimuli nominal"),
                (
                    "affect-snapshot",
                    "fear=0.000 anger=0.000 mistrust=0.000 beliefs=0",
                ),
            ],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-ALWAYS"
    }
}

// ── AutoinstinctVision ───────────────────────────────────────────────────────

impl BreedOracle for AutoinstinctVision {
    fn breed_id() -> BreedId {
        BreedId::AutoinstinctVision
    }

    fn novel_input() -> BreedInput {
        // UO_B sits on UO_A — UO_B is the clear object.
        let mut input = base("uo_scan_scene");
        input.facts = vec![
            fact("uo_cube", "UO_A"),
            fact("uo_prism", "UO_B"),
            fact("supported_by:UO_B", "UO_A"),
        ];
        input
    }

    fn boundary_pair() -> (BreedInput, BreedInput) {
        // Stacked vs unstacked scene → different support structure in the
        // trace and different observed facts in the output.
        let mut a = base("uo_scan_scene");
        a.facts = vec![
            fact("uo_cube", "UO_A"),
            fact("uo_prism", "UO_B"),
            fact("supported_by:UO_B", "UO_A"),
        ];
        let mut b = base("uo_scan_scene");
        b.facts = vec![fact("uo_cube", "UO_A"), fact("uo_prism", "UO_B")];
        (a, b)
    }

    fn refusal_input() -> BreedInput {
        // Precondition: at least one fact describing a scene object.
        base("uo_scan_scene")
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_non_empty_with_kinds(&["observe-object", "find-clear-object"])?;
        trace.require_count("observe-object", 2)?;
        let observed = trace
            .detail_of("observe-object")
            .ok_or_else(|| "missing observe-object detail".to_string())?;
        if !observed.contains("UO_A") || !observed.contains("uo_cube") {
            return Err(format!(
                "first observation must be UO_A as uo_cube, got '{}'",
                observed
            ));
        }
        let clear = trace
            .detail_of("find-clear-object")
            .ok_or_else(|| "missing find-clear-object detail".to_string())?;
        if !clear.contains("UO_B") {
            return Err(format!(
                "clear object must be UO_B (top of stack), got '{}'",
                clear
            ));
        }
        Ok(())
    }

    fn assert_trace_values(tq: &TraceQuery<'_>) -> Result<(), String> {
        // Core computation values: both scene objects observed with their
        // shapes AND support structure, and the clear-object search must
        // return the top of the stack (run() detail formats).
        let o1 = tq
            .detail_kth("observe-object", 0)
            .ok_or("missing observe-object[0]")?;
        if o1 != "observed UO_A as uo_cube (on table)" {
            return Err(format!(
                "first observation must be UO_A as uo_cube on the table, got '{}'",
                o1
            ));
        }
        let o2 = tq
            .detail_kth("observe-object", 1)
            .ok_or("missing observe-object[1]")?;
        if o2 != "observed UO_B as uo_prism (supported_by=UO_A)" {
            return Err(format!(
                "second observation must be UO_B as uo_prism supported by UO_A, got '{}'",
                o2
            ));
        }
        let clear = tq
            .detail_of("find-clear-object")
            .ok_or("missing find-clear-object")?;
        if clear != "clear object found: UO_B" {
            return Err(format!(
                "clear object must be exactly UO_B, got '{}'",
                clear
            ));
        }
        Ok(())
    }
}

/// AC-PARTIAL: does only part of the work — observes a single object, skips
/// the support relation, and declares the bottom block clear.
pub struct CheatAutoinstinctVision;
impl BreedAdversary for CheatAutoinstinctVision {
    type Target = AutoinstinctVision;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        cheat_output(
            BreedId::AutoinstinctVision,
            &[
                ("observe-object", "observed UO_A as uo_cube (on table)"),
                ("find-clear-object", "clear object found: UO_A"),
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
    use crate::breeds::support::oracle::run_adversary_check;

    fn assert_values_ok<B: BreedOracle>() {
        let output = dispatch_breed_id(B::breed_id(), &B::novel_input())
            .unwrap_or_else(|e| panic!("{:?} novel_input failed: {}", B::breed_id(), e));
        let tq = TraceQuery::new(&output.inference_trace);
        if let Err(e) = B::assert_trace_values(&tq) {
            panic!(
                "{:?} assert_trace_values rejected the real trace: {}",
                B::breed_id(),
                e
            );
        }
    }

    macro_rules! oracle_case {
        ($name:ident, $breed:ty, $cheat:ty) => {
            #[test]
            fn $name() {
                assert_values_ok::<$breed>();
                let r = run_adversary_check::<$cheat>();
                assert!(
                    r.is_pass(),
                    "U6 must reject {} cheat for {:?}",
                    <$cheat as BreedAdversary>::cheat_code(),
                    <$breed as BreedOracle>::breed_id()
                );
            }
        };
    }

    oracle_case!(eliza_values_and_adversary, Eliza, CheatEliza);
    oracle_case!(dendral_values_and_adversary, Dendral, CheatDendral);
    oracle_case!(hearsay_values_and_adversary, Hearsay, CheatHearsay);
    oracle_case!(
        construction_grammar_values_and_adversary,
        ConstructionGrammar,
        CheatConstructionGrammar
    );
    oracle_case!(
        autoinstinct_learning_values_and_adversary,
        AutoinstinctLearning,
        CheatAutoinstinctLearning
    );
    oracle_case!(
        autoinstinct_semantics_values_and_adversary,
        AutoinstinctSemantics,
        CheatAutoinstinctSemantics
    );
    oracle_case!(
        autoinstinct_neurosis_values_and_adversary,
        AutoinstinctNeurosis,
        CheatAutoinstinctNeurosis
    );
    oracle_case!(
        autoinstinct_vision_values_and_adversary,
        AutoinstinctVision,
        CheatAutoinstinctVision
    );
}
