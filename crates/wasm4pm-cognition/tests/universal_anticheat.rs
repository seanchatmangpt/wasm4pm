//! Universal anti-cheat harness (U1, U2, U2b, U3, U4, U5) for every breed.
//! Requires `--features breed-oracles`. Routed through `dispatch_breed_id`
//! (full lawful path: preconditions -> run -> postconditions -> OCEL gate).

use std::collections::BTreeSet;

use wasm4pm_cognition::breeds::support::oracle::{
    run_universal_anticheat, AntiCheatResult, BreedOracle,
};
use wasm4pm_cognition::breeds::BreedId;

use wasm4pm_cognition::breeds::abductive_ibe::AbductiveIbe;
use wasm4pm_cognition::breeds::abductive_lp::AbductiveLp;
use wasm4pm_cognition::breeds::act_r::ActR;
use wasm4pm_cognition::breeds::allen_temporal::AllenTemporal;
use wasm4pm_cognition::breeds::analogy_sme::AnalogySme;
use wasm4pm_cognition::breeds::asp::Asp;
use wasm4pm_cognition::breeds::autoinstinct_learning::AutoinstinctLearning;
use wasm4pm_cognition::breeds::autoinstinct_neurosis::AutoinstinctNeurosis;
use wasm4pm_cognition::breeds::autoinstinct_semantics::AutoinstinctSemantics;
use wasm4pm_cognition::breeds::autoinstinct_vision::AutoinstinctVision;
use wasm4pm_cognition::breeds::bayesian_network::BayesianNetwork;
use wasm4pm_cognition::breeds::belief_merging::BeliefMerging;
use wasm4pm_cognition::breeds::cbr::Cbr;
use wasm4pm_cognition::breeds::circumscription::Circumscription;
use wasm4pm_cognition::breeds::clp::Clp;
use wasm4pm_cognition::breeds::construction_grammar::ConstructionGrammar;
use wasm4pm_cognition::breeds::contingent_plan::ContingentPlan;
use wasm4pm_cognition::breeds::csp_ac3::CspAc3;
use wasm4pm_cognition::breeds::ctl_check::CtlCheck;
use wasm4pm_cognition::breeds::default_logic::DefaultLogic;
use wasm4pm_cognition::breeds::dempster_shafer::DempsterShafer;
use wasm4pm_cognition::breeds::dendral::Dendral;
use wasm4pm_cognition::breeds::description_logic::DescriptionLogic;
use wasm4pm_cognition::breeds::ebl::Ebl;
use wasm4pm_cognition::breeds::episodic_memory::EpisodicMemory;
use wasm4pm_cognition::breeds::event_calculus::EventCalculus;
use wasm4pm_cognition::breeds::frame::Eliza;
use wasm4pm_cognition::breeds::frames_inheritance::FramesInheritance;
use wasm4pm_cognition::breeds::fuzzy_logic::FuzzyLogic;
use wasm4pm_cognition::breeds::gps::Gps;
use wasm4pm_cognition::breeds::hearsay::Hearsay;
use wasm4pm_cognition::breeds::htn_planning::HtnPlanning;
use wasm4pm_cognition::breeds::ilp::Ilp;
use wasm4pm_cognition::breeds::ltl_monitor::LtlMonitor;
use wasm4pm_cognition::breeds::markov_logic::MarkovLogic;
use wasm4pm_cognition::breeds::mdp::Mdp;
use wasm4pm_cognition::breeds::meta_reasoning::MetaReasoning;
use wasm4pm_cognition::breeds::naive_physics::NaivePhysics;
use wasm4pm_cognition::breeds::partial_order_plan::PartialOrderPlan;
use wasm4pm_cognition::breeds::pomdp::Pomdp;
use wasm4pm_cognition::breeds::problog::Problog;
use wasm4pm_cognition::breeds::production_rules::Mycin;
use wasm4pm_cognition::breeds::prolog::Prolog;
use wasm4pm_cognition::breeds::qualitative_reason::QualitativeReason;
use wasm4pm_cognition::breeds::rl_symbolic::RlSymbolic;
use wasm4pm_cognition::breeds::sat_cdcl::SatCdcl;
use wasm4pm_cognition::breeds::script_sam::ScriptSam;
use wasm4pm_cognition::breeds::situation_calculus::SituationCalculus;
use wasm4pm_cognition::breeds::soar::Soar;
use wasm4pm_cognition::breeds::strips::Strips;
use wasm4pm_cognition::breeds::tableaux::Tableaux;
use wasm4pm_cognition::breeds::version_space::VersionSpace;

fn assert_green<B: BreedOracle>(breed: &str) {
    let results = run_universal_anticheat::<B>();
    assert_eq!(
        results.len(),
        6,
        "{breed}: harness must return U1,U2,U2b,U3,U4,U5"
    );
    let fails: Vec<&AntiCheatResult> = results.iter().filter(|r| r.is_fail()).collect();
    assert!(fails.is_empty(), "{breed} anti-cheat failures: {fails:?}");
}

#[test]
fn u_abductive_ibe() {
    assert_green::<AbductiveIbe>("abductive_ibe");
}

#[test]
fn u_abductive_lp() {
    assert_green::<AbductiveLp>("abductive_lp");
}

#[test]
fn u_act_r() {
    assert_green::<ActR>("act_r");
}

#[test]
fn u_allen_temporal() {
    assert_green::<AllenTemporal>("allen_temporal");
}

#[test]
fn u_analogy_sme() {
    assert_green::<AnalogySme>("analogy_sme");
}

#[test]
fn u_asp() {
    assert_green::<Asp>("asp");
}

#[test]
fn u_autoinstinct_learning() {
    assert_green::<AutoinstinctLearning>("autoinstinct_learning");
}

#[test]
fn u_autoinstinct_neurosis() {
    assert_green::<AutoinstinctNeurosis>("autoinstinct_neurosis");
}

#[test]
fn u_autoinstinct_semantics() {
    assert_green::<AutoinstinctSemantics>("autoinstinct_semantics");
}

#[test]
fn u_autoinstinct_vision() {
    assert_green::<AutoinstinctVision>("autoinstinct_vision");
}

#[test]
fn u_bayesian_network() {
    assert_green::<BayesianNetwork>("bayesian_network");
}

#[test]
fn u_belief_merging() {
    assert_green::<BeliefMerging>("belief_merging");
}

#[test]
fn u_cbr() {
    assert_green::<Cbr>("cbr");
}

#[test]
fn u_circumscription() {
    assert_green::<Circumscription>("circumscription");
}

#[test]
fn u_clp() {
    assert_green::<Clp>("clp");
}

#[test]
fn u_construction_grammar() {
    assert_green::<ConstructionGrammar>("construction_grammar");
}

#[test]
fn u_contingent_plan() {
    assert_green::<ContingentPlan>("contingent_plan");
}

#[test]
fn u_csp_ac3() {
    assert_green::<CspAc3>("csp_ac3");
}

#[test]
fn u_ctl_check() {
    assert_green::<CtlCheck>("ctl_check");
}

#[test]
fn u_default_logic() {
    assert_green::<DefaultLogic>("default_logic");
}

#[test]
fn u_dempster_shafer() {
    assert_green::<DempsterShafer>("dempster_shafer");
}

#[test]
fn u_dendral() {
    assert_green::<Dendral>("dendral");
}

#[test]
fn u_description_logic() {
    assert_green::<DescriptionLogic>("description_logic");
}

#[test]
fn u_ebl() {
    assert_green::<Ebl>("ebl");
}

#[test]
fn u_eliza() {
    assert_green::<Eliza>("eliza");
}

#[test]
fn u_episodic_memory() {
    assert_green::<EpisodicMemory>("episodic_memory");
}

#[test]
fn u_event_calculus() {
    assert_green::<EventCalculus>("event_calculus");
}

#[test]
fn u_frames_inheritance() {
    assert_green::<FramesInheritance>("frames_inheritance");
}

#[test]
fn u_fuzzy_logic() {
    assert_green::<FuzzyLogic>("fuzzy_logic");
}

#[test]
fn u_gps() {
    assert_green::<Gps>("gps");
}

#[test]
fn u_hearsay() {
    assert_green::<Hearsay>("hearsay");
}

#[test]
fn u_htn_planning() {
    assert_green::<HtnPlanning>("htn_planning");
}

#[test]
fn u_ilp() {
    assert_green::<Ilp>("ilp");
}

#[test]
fn u_ltl_monitor() {
    assert_green::<LtlMonitor>("ltl_monitor");
}

#[test]
fn u_markov_logic() {
    assert_green::<MarkovLogic>("markov_logic");
}

#[test]
fn u_mdp() {
    assert_green::<Mdp>("mdp");
}

#[test]
fn u_meta_reasoning() {
    assert_green::<MetaReasoning>("meta_reasoning");
}

#[test]
fn u_mycin() {
    assert_green::<Mycin>("mycin");
}

#[test]
fn u_naive_physics() {
    assert_green::<NaivePhysics>("naive_physics");
}

#[test]
fn u_partial_order_plan() {
    assert_green::<PartialOrderPlan>("partial_order_plan");
}

#[test]
fn u_pomdp() {
    assert_green::<Pomdp>("pomdp");
}

#[test]
fn u_problog() {
    assert_green::<Problog>("problog");
}

#[test]
fn u_prolog() {
    assert_green::<Prolog>("prolog");
}

#[test]
fn u_qualitative_reason() {
    assert_green::<QualitativeReason>("qualitative_reason");
}

#[test]
fn u_rl_symbolic() {
    assert_green::<RlSymbolic>("rl_symbolic");
}

#[test]
fn u_sat_cdcl() {
    assert_green::<SatCdcl>("sat_cdcl");
}

#[test]
fn u_script_sam() {
    assert_green::<ScriptSam>("script_sam");
}

#[test]
fn u_situation_calculus() {
    assert_green::<SituationCalculus>("situation_calculus");
}

#[test]
fn u_soar() {
    assert_green::<Soar>("soar");
}

#[test]
fn u_strips() {
    assert_green::<Strips>("strips");
}

#[test]
fn u_tableaux() {
    assert_green::<Tableaux>("tableaux");
}

#[test]
fn u_version_space() {
    assert_green::<VersionSpace>("version_space");
}

/// A 53rd breed cannot ship without an oracle: this file must cover BreedId::ALL.
#[test]
fn oracle_coverage_is_complete() {
    let covered: BTreeSet<BreedId> = [
        BreedId::AbductiveIbe,
        BreedId::AbductiveLp,
        BreedId::ActR,
        BreedId::AllenTemporal,
        BreedId::AnalogySme,
        BreedId::Asp,
        BreedId::AutoinstinctLearning,
        BreedId::AutoinstinctNeurosis,
        BreedId::AutoinstinctSemantics,
        BreedId::AutoinstinctVision,
        BreedId::BayesianNetwork,
        BreedId::BeliefMerging,
        BreedId::Cbr,
        BreedId::Circumscription,
        BreedId::Clp,
        BreedId::ConstructionGrammar,
        BreedId::ContingentPlan,
        BreedId::CspAc3,
        BreedId::CtlCheck,
        BreedId::DefaultLogic,
        BreedId::DempsterShafer,
        BreedId::Dendral,
        BreedId::DescriptionLogic,
        BreedId::Ebl,
        BreedId::Eliza,
        BreedId::EpisodicMemory,
        BreedId::EventCalculus,
        BreedId::FramesInheritance,
        BreedId::FuzzyLogic,
        BreedId::Gps,
        BreedId::Hearsay,
        BreedId::HtnPlanning,
        BreedId::Ilp,
        BreedId::LtlMonitor,
        BreedId::MarkovLogic,
        BreedId::Mdp,
        BreedId::MetaReasoning,
        BreedId::Mycin,
        BreedId::NaivePhysics,
        BreedId::PartialOrderPlan,
        BreedId::Pomdp,
        BreedId::Problog,
        BreedId::Prolog,
        BreedId::QualitativeReason,
        BreedId::RlSymbolic,
        BreedId::SatCdcl,
        BreedId::ScriptSam,
        BreedId::SituationCalculus,
        BreedId::Soar,
        BreedId::Strips,
        BreedId::Tableaux,
        BreedId::VersionSpace,
    ]
    .into_iter()
    .collect();
    let all: BTreeSet<BreedId> = BreedId::ALL.into_iter().collect();
    assert_eq!(
        covered, all,
        "every BreedId::ALL entry needs a universal_anticheat test"
    );
}

/// U6 meta-oracle: every breed's oracle must reject its own adversary
/// (intentionally wrong implementation). An oracle that passes its
/// adversary is vacuous — the periodic table is only finished when all
/// 52 cheats are provably killed.
#[test]
fn u6_every_adversary_is_killed() {
    use wasm4pm_cognition::breeds::support::oracle::run_adversary_check;
    use wasm4pm_cognition::breeds::support::oracle_impls::{
        dialogue::*, learning::*, logic::*, planning::*, rule_fact::*,
    };

    let results = [
        ("abductive_ibe", run_adversary_check::<CheatAbductiveIbe>()),
        ("abductive_lp", run_adversary_check::<CheatAbductiveLp>()),
        ("act_r", run_adversary_check::<CheatActR>()),
        (
            "allen_temporal",
            run_adversary_check::<CheatAllenTemporal>(),
        ),
        ("analogy_sme", run_adversary_check::<CheatAnalogySme>()),
        ("asp", run_adversary_check::<CheatAsp>()),
        (
            "autoinstinct_learning",
            run_adversary_check::<CheatAutoinstinctLearning>(),
        ),
        (
            "autoinstinct_neurosis",
            run_adversary_check::<CheatAutoinstinctNeurosis>(),
        ),
        (
            "autoinstinct_semantics",
            run_adversary_check::<CheatAutoinstinctSemantics>(),
        ),
        (
            "autoinstinct_vision",
            run_adversary_check::<CheatAutoinstinctVision>(),
        ),
        (
            "bayesian_network",
            run_adversary_check::<CheatBayesianNetwork>(),
        ),
        (
            "belief_merging",
            run_adversary_check::<CheatBeliefMerging>(),
        ),
        ("cbr", run_adversary_check::<CheatCbr>()),
        (
            "circumscription",
            run_adversary_check::<CheatCircumscription>(),
        ),
        ("clp", run_adversary_check::<CheatClp>()),
        (
            "construction_grammar",
            run_adversary_check::<CheatConstructionGrammar>(),
        ),
        (
            "contingent_plan",
            run_adversary_check::<CheatContingentPlan>(),
        ),
        ("csp_ac3", run_adversary_check::<CheatCspAc3>()),
        ("ctl_check", run_adversary_check::<CheatCtlCheck>()),
        ("default_logic", run_adversary_check::<CheatDefaultLogic>()),
        (
            "dempster_shafer",
            run_adversary_check::<CheatDempsterShafer>(),
        ),
        ("dendral", run_adversary_check::<CheatDendral>()),
        (
            "description_logic",
            run_adversary_check::<CheatDescriptionLogic>(),
        ),
        ("ebl", run_adversary_check::<CheatEbl>()),
        ("eliza", run_adversary_check::<CheatEliza>()),
        (
            "episodic_memory",
            run_adversary_check::<CheatEpisodicMemory>(),
        ),
        (
            "event_calculus",
            run_adversary_check::<CheatEventCalculus>(),
        ),
        (
            "frames_inheritance",
            run_adversary_check::<CheatFramesInheritance>(),
        ),
        ("fuzzy_logic", run_adversary_check::<CheatFuzzyLogic>()),
        ("gps", run_adversary_check::<CheatGps>()),
        ("hearsay", run_adversary_check::<CheatHearsay>()),
        ("htn_planning", run_adversary_check::<CheatHtnPlanning>()),
        ("ilp", run_adversary_check::<CheatIlp>()),
        ("ltl_monitor", run_adversary_check::<CheatLtlMonitor>()),
        ("markov_logic", run_adversary_check::<CheatMarkovLogic>()),
        ("mdp", run_adversary_check::<CheatMdp>()),
        (
            "meta_reasoning",
            run_adversary_check::<CheatMetaReasoning>(),
        ),
        ("mycin", run_adversary_check::<CheatMycin>()),
        ("naive_physics", run_adversary_check::<CheatNaivePhysics>()),
        (
            "partial_order_plan",
            run_adversary_check::<CheatPartialOrderPlan>(),
        ),
        ("pomdp", run_adversary_check::<CheatPomdp>()),
        ("problog", run_adversary_check::<CheatProblog>()),
        ("prolog", run_adversary_check::<CheatProlog>()),
        (
            "qualitative_reason",
            run_adversary_check::<CheatQualitativeReason>(),
        ),
        ("rl_symbolic", run_adversary_check::<CheatRlSymbolic>()),
        ("sat_cdcl", run_adversary_check::<CheatSatCdcl>()),
        ("script_sam", run_adversary_check::<CheatScriptSam>()),
        (
            "situation_calculus",
            run_adversary_check::<CheatSituationCalculus>(),
        ),
        ("soar", run_adversary_check::<CheatSoar>()),
        ("strips", run_adversary_check::<CheatStrips>()),
        ("tableaux", run_adversary_check::<CheatTableaux>()),
        ("version_space", run_adversary_check::<CheatVersionSpace>()),
    ];

    let weak: Vec<&str> = results
        .iter()
        .filter(|(_, r)| r.is_fail())
        .map(|(b, _)| *b)
        .collect();
    assert!(
        weak.is_empty(),
        "vacuous oracles (did not kill adversary): {weak:?}"
    );
    assert_eq!(
        results.len(),
        BreedId::ALL.len(),
        "adversary coverage incomplete"
    );
}
