// breed_ids.rs — RENDERED FROM ONTOLOGY by ggen (pack: wasm4pm-breeds-rust).
// This file is first-class source. To change a breed, edit the pack ontology
// (ggen/ontology/breeds.ttl) and re-run `ggen sync`.
//
// 55 cognition breeds.

/// Stable identifier for every cognition breed registered in the wasm4pm platform.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum BreedId {
    /// `abductive_ibe`
    AbductiveIbe,
    /// `abductive_lp`
    AbductiveLp,
    /// `act_r`
    ActR,
    /// `allen_temporal`
    AllenTemporal,
    /// `analogy_sme`
    AnalogySme,
    /// `asp`
    Asp,
    /// `autoinstinct_learning`
    AutoinstinctLearning,
    /// `autoinstinct_neurosis`
    AutoinstinctNeurosis,
    /// `autoinstinct_semantics`
    AutoinstinctSemantics,
    /// `autoinstinct_vision`
    AutoinstinctVision,
    /// `bayesian_network`
    BayesianNetwork,
    /// `belief_merging`
    BeliefMerging,
    /// `cbr`
    Cbr,
    /// `circumscription`
    Circumscription,
    /// `clp`
    Clp,
    /// `construction_grammar`
    ConstructionGrammar,
    /// `contingent_plan`
    ContingentPlan,
    /// `csp_ac3`
    CspAc3,
    /// `ctl_check`
    CtlCheck,
    /// `default_logic`
    DefaultLogic,
    /// `dempster_shafer`
    DempsterShafer,
    /// `dendral`
    Dendral,
    /// `description_logic`
    DescriptionLogic,
    /// `ebl`
    Ebl,
    /// `eliza`
    Eliza,
    /// `episodic_memory`
    EpisodicMemory,
    /// `event_calculus`
    EventCalculus,
    /// `frames_inheritance`
    FramesInheritance,
    /// `fuzzy_logic`
    FuzzyLogic,
    /// `gps`
    Gps,
    /// `hearsay`
    Hearsay,
    /// `htn_planning`
    HtnPlanning,
    /// `ilp`
    Ilp,
    /// `ltl_monitor`
    LtlMonitor,
    /// `markov_logic`
    MarkovLogic,
    /// `mdp`
    Mdp,
    /// `meta_reasoning`
    MetaReasoning,
    /// `morphological`
    Morphological,
    /// `mycin`
    Mycin,
    /// `naive_physics`
    NaivePhysics,
    /// `ocpm_route_discoverer`
    OcpmRouteDiscoverer,
    /// `partial_order_plan`
    PartialOrderPlan,
    /// `pomdp`
    Pomdp,
    /// `problog`
    Problog,
    /// `prolog`
    Prolog,
    /// `qualitative_reason`
    QualitativeReason,
    /// `rl_symbolic`
    RlSymbolic,
    /// `sat_cdcl`
    SatCdcl,
    /// `script_sam`
    ScriptSam,
    /// `situation_calculus`
    SituationCalculus,
    /// `soar`
    Soar,
    /// `strips`
    Strips,
    /// `tableaux`
    Tableaux,
    /// `triz`
    Triz,
    /// `version_space`
    VersionSpace,
}

impl BreedId {
    /// The wire-level breed id string passed to `cognition_run`.
    pub fn as_str(&self) -> &'static str {
        match self {
            BreedId::AbductiveIbe => "abductive_ibe",
            BreedId::AbductiveLp => "abductive_lp",
            BreedId::ActR => "act_r",
            BreedId::AllenTemporal => "allen_temporal",
            BreedId::AnalogySme => "analogy_sme",
            BreedId::Asp => "asp",
            BreedId::AutoinstinctLearning => "autoinstinct_learning",
            BreedId::AutoinstinctNeurosis => "autoinstinct_neurosis",
            BreedId::AutoinstinctSemantics => "autoinstinct_semantics",
            BreedId::AutoinstinctVision => "autoinstinct_vision",
            BreedId::BayesianNetwork => "bayesian_network",
            BreedId::BeliefMerging => "belief_merging",
            BreedId::Cbr => "cbr",
            BreedId::Circumscription => "circumscription",
            BreedId::Clp => "clp",
            BreedId::ConstructionGrammar => "construction_grammar",
            BreedId::ContingentPlan => "contingent_plan",
            BreedId::CspAc3 => "csp_ac3",
            BreedId::CtlCheck => "ctl_check",
            BreedId::DefaultLogic => "default_logic",
            BreedId::DempsterShafer => "dempster_shafer",
            BreedId::Dendral => "dendral",
            BreedId::DescriptionLogic => "description_logic",
            BreedId::Ebl => "ebl",
            BreedId::Eliza => "eliza",
            BreedId::EpisodicMemory => "episodic_memory",
            BreedId::EventCalculus => "event_calculus",
            BreedId::FramesInheritance => "frames_inheritance",
            BreedId::FuzzyLogic => "fuzzy_logic",
            BreedId::Gps => "gps",
            BreedId::Hearsay => "hearsay",
            BreedId::HtnPlanning => "htn_planning",
            BreedId::Ilp => "ilp",
            BreedId::LtlMonitor => "ltl_monitor",
            BreedId::MarkovLogic => "markov_logic",
            BreedId::Mdp => "mdp",
            BreedId::MetaReasoning => "meta_reasoning",
            BreedId::Morphological => "morphological",
            BreedId::Mycin => "mycin",
            BreedId::NaivePhysics => "naive_physics",
            BreedId::OcpmRouteDiscoverer => "ocpm_route_discoverer",
            BreedId::PartialOrderPlan => "partial_order_plan",
            BreedId::Pomdp => "pomdp",
            BreedId::Problog => "problog",
            BreedId::Prolog => "prolog",
            BreedId::QualitativeReason => "qualitative_reason",
            BreedId::RlSymbolic => "rl_symbolic",
            BreedId::SatCdcl => "sat_cdcl",
            BreedId::ScriptSam => "script_sam",
            BreedId::SituationCalculus => "situation_calculus",
            BreedId::Soar => "soar",
            BreedId::Strips => "strips",
            BreedId::Tableaux => "tableaux",
            BreedId::Triz => "triz",
            BreedId::VersionSpace => "version_space",
        }
    }

    /// Parse a breed id string into its `BreedId` variant.
    pub fn from_str_id(s: &str) -> Option<Self> {
        match s {
            "abductive_ibe" => Some(BreedId::AbductiveIbe),
            "abductive_lp" => Some(BreedId::AbductiveLp),
            "act_r" => Some(BreedId::ActR),
            "allen_temporal" => Some(BreedId::AllenTemporal),
            "analogy_sme" => Some(BreedId::AnalogySme),
            "asp" => Some(BreedId::Asp),
            "autoinstinct_learning" => Some(BreedId::AutoinstinctLearning),
            "autoinstinct_neurosis" => Some(BreedId::AutoinstinctNeurosis),
            "autoinstinct_semantics" => Some(BreedId::AutoinstinctSemantics),
            "autoinstinct_vision" => Some(BreedId::AutoinstinctVision),
            "bayesian_network" => Some(BreedId::BayesianNetwork),
            "belief_merging" => Some(BreedId::BeliefMerging),
            "cbr" => Some(BreedId::Cbr),
            "circumscription" => Some(BreedId::Circumscription),
            "clp" => Some(BreedId::Clp),
            "construction_grammar" => Some(BreedId::ConstructionGrammar),
            "contingent_plan" => Some(BreedId::ContingentPlan),
            "csp_ac3" => Some(BreedId::CspAc3),
            "ctl_check" => Some(BreedId::CtlCheck),
            "default_logic" => Some(BreedId::DefaultLogic),
            "dempster_shafer" => Some(BreedId::DempsterShafer),
            "dendral" => Some(BreedId::Dendral),
            "description_logic" => Some(BreedId::DescriptionLogic),
            "ebl" => Some(BreedId::Ebl),
            "eliza" => Some(BreedId::Eliza),
            "episodic_memory" => Some(BreedId::EpisodicMemory),
            "event_calculus" => Some(BreedId::EventCalculus),
            "frames_inheritance" => Some(BreedId::FramesInheritance),
            "fuzzy_logic" => Some(BreedId::FuzzyLogic),
            "gps" => Some(BreedId::Gps),
            "hearsay" => Some(BreedId::Hearsay),
            "htn_planning" => Some(BreedId::HtnPlanning),
            "ilp" => Some(BreedId::Ilp),
            "ltl_monitor" => Some(BreedId::LtlMonitor),
            "markov_logic" => Some(BreedId::MarkovLogic),
            "mdp" => Some(BreedId::Mdp),
            "meta_reasoning" => Some(BreedId::MetaReasoning),
            "morphological" => Some(BreedId::Morphological),
            "mycin" => Some(BreedId::Mycin),
            "naive_physics" => Some(BreedId::NaivePhysics),
            "ocpm_route_discoverer" => Some(BreedId::OcpmRouteDiscoverer),
            "partial_order_plan" => Some(BreedId::PartialOrderPlan),
            "pomdp" => Some(BreedId::Pomdp),
            "problog" => Some(BreedId::Problog),
            "prolog" => Some(BreedId::Prolog),
            "qualitative_reason" => Some(BreedId::QualitativeReason),
            "rl_symbolic" => Some(BreedId::RlSymbolic),
            "sat_cdcl" => Some(BreedId::SatCdcl),
            "script_sam" => Some(BreedId::ScriptSam),
            "situation_calculus" => Some(BreedId::SituationCalculus),
            "soar" => Some(BreedId::Soar),
            "strips" => Some(BreedId::Strips),
            "tableaux" => Some(BreedId::Tableaux),
            "triz" => Some(BreedId::Triz),
            "version_space" => Some(BreedId::VersionSpace),
            _ => None,
        }
    }

    /// Every breed, in stable (id-sorted) order.
    pub const ALL: &'static [BreedId] = &[
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
        BreedId::Morphological,
        BreedId::Mycin,
        BreedId::NaivePhysics,
        BreedId::OcpmRouteDiscoverer,
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
        BreedId::Triz,
        BreedId::VersionSpace,
    ];
}