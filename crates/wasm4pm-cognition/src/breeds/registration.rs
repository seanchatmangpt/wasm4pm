breeds! {
    /// 
    AbductiveIbe = "abductive_ibe" => crate::breeds::abductive_ibe::AbductiveIbe;
    /// 
    AbductiveLp = "abductive_lp" => crate::breeds::abductive_lp::AbductiveLp;
    /// 
    ActR = "act_r" => crate::breeds::act_r::ActR;
    /// 
    AllenTemporal = "allen_temporal" => crate::breeds::allen_temporal::AllenTemporal;
    /// 
    AnalogySme = "analogy_sme" => crate::breeds::analogy_sme::AnalogySme;
    /// 
    Asp = "asp" => crate::breeds::asp::Asp;
    /// 
    AutoinstinctLearning = "autoinstinct_learning" => crate::breeds::autoinstinct_learning::AutoinstinctLearning;
    /// 
    AutoinstinctNeurosis = "autoinstinct_neurosis" => crate::breeds::autoinstinct_neurosis::AutoinstinctNeurosis;
    /// 
    AutoinstinctSemantics = "autoinstinct_semantics" => crate::breeds::autoinstinct_semantics::AutoinstinctSemantics;
    /// 
    AutoinstinctVision = "autoinstinct_vision" => crate::breeds::autoinstinct_vision::AutoinstinctVision;
    /// 
    BayesianNetwork = "bayesian_network" => crate::breeds::bayesian_network::BayesianNetwork;
    /// 
    BeliefMerging = "belief_merging" => crate::breeds::belief_merging::BeliefMerging;
    /// 
    Cbr = "cbr" => crate::breeds::cbr::Cbr;
    /// 
    Circumscription = "circumscription" => crate::breeds::circumscription::Circumscription;
    /// 
    Clp = "clp" => crate::breeds::clp::Clp;
    /// 
    ConstructionGrammar = "construction_grammar" => crate::breeds::construction_grammar::ConstructionGrammar;
    /// 
    ContingentPlan = "contingent_plan" => crate::breeds::contingent_plan::ContingentPlan;
    /// 
    CspAc3 = "csp_ac3" => crate::breeds::csp_ac3::CspAc3;
    /// 
    CtlCheck = "ctl_check" => crate::breeds::ctl_check::CtlCheck;
    /// 
    DefaultLogic = "default_logic" => crate::breeds::default_logic::DefaultLogic;
    /// 
    DempsterShafer = "dempster_shafer" => crate::breeds::dempster_shafer::DempsterShafer;
    /// 
    Dendral = "dendral" => crate::breeds::dendral::Dendral;
    /// 
    DescriptionLogic = "description_logic" => crate::breeds::description_logic::DescriptionLogic;
    /// 
    Ebl = "ebl" => crate::breeds::ebl::Ebl;
    /// 
    Eliza = "eliza" => crate::breeds::frame::Eliza;
    /// 
    EpisodicMemory = "episodic_memory" => crate::breeds::episodic_memory::EpisodicMemory;
    /// 
    EventCalculus = "event_calculus" => crate::breeds::event_calculus::EventCalculus;
    /// 
    FramesInheritance = "frames_inheritance" => crate::breeds::frames_inheritance::FramesInheritance;
    /// 
    FuzzyLogic = "fuzzy_logic" => crate::breeds::fuzzy_logic::FuzzyLogic;
    /// 
    Gps = "gps" => crate::breeds::gps::Gps;
    /// 
    Hearsay = "hearsay" => crate::breeds::hearsay::Hearsay;
    /// 
    HtnPlanning = "htn_planning" => crate::breeds::htn_planning::HtnPlanning;
    /// 
    Ilp = "ilp" => crate::breeds::ilp::Ilp;
    /// 
    LtlMonitor = "ltl_monitor" => crate::breeds::ltl_monitor::LtlMonitor;
    /// 
    MarkovLogic = "markov_logic" => crate::breeds::markov_logic::MarkovLogic;
    /// 
    Mdp = "mdp" => crate::breeds::mdp::Mdp;
    /// 
    MetaReasoning = "meta_reasoning" => crate::breeds::meta_reasoning::MetaReasoning;
    /// 
    Morphological = "morphological" => crate::breeds::morphological::Morphological;
    /// 
    Mycin = "mycin" => crate::breeds::production_rules::Mycin;
    /// 
    NaivePhysics = "naive_physics" => crate::breeds::naive_physics::NaivePhysics;
    /// 
    OcpmRouteDiscoverer = "ocpm_route_discoverer" => crate::breeds::ocpm_route_discoverer::OcpmRouteDiscoverer;
    /// 
    PartialOrderPlan = "partial_order_plan" => crate::breeds::partial_order_plan::PartialOrderPlan;
    /// 
    Pomdp = "pomdp" => crate::breeds::pomdp::Pomdp;
    /// 
    Problog = "problog" => crate::breeds::problog::Problog;
    /// 
    Prolog = "prolog" => crate::breeds::prolog::Prolog;
    /// 
    QualitativeReason = "qualitative_reason" => crate::breeds::qualitative_reason::QualitativeReason;
    /// 
    RlSymbolic = "rl_symbolic" => crate::breeds::rl_symbolic::RlSymbolic;
    /// 
    SatCdcl = "sat_cdcl" => crate::breeds::sat_cdcl::SatCdcl;
    /// 
    ScriptSam = "script_sam" => crate::breeds::script_sam::ScriptSam;
    /// 
    SituationCalculus = "situation_calculus" => crate::breeds::situation_calculus::SituationCalculus;
    /// 
    Soar = "soar" => crate::breeds::soar::Soar;
    /// 
    Strips = "strips" => crate::breeds::strips::Strips;
    /// 
    Tableaux = "tableaux" => crate::breeds::tableaux::Tableaux;
    /// 
    Triz = "triz" => crate::breeds::triz::Triz;
    /// 
    VersionSpace = "version_space" => crate::breeds::version_space::VersionSpace;
}

impl BreedId {
    /// Legally-admitted PARTIAL_ALIVE subset — derived from evidence.ttl via
    /// the alive-gate CONSTRUCT (measured fitness 1.0 + OCEL admission).
    /// A breed enters this list only through an ocel/reports/ entry; the
    /// hand-flip path no longer exists.
    pub const ALL: [BreedId; 55] = [
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