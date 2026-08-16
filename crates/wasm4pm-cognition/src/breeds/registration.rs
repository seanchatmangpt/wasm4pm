breeds! {
    /// Abduction as Inference to the Best Explanation (Harman, 'The Inference to the Best Explanation', Philosophical Review 74(1), 1965; Thagard, 'The Best Explanation: Criteria for Theory Choice', Journal of Philosophy 75(2), 1978).
    AbductiveIbe = "abductive_ibe" => crate::breeds::abductive_ibe::AbductiveIbe;
    /// Abductive Logic Programming (Kakas, Kowalski & Toni, 'Abductive Logic Programming', Journal of Logic and Computation 2(6), 1992).
    AbductiveLp = "abductive_lp" => crate::breeds::abductive_lp::AbductiveLp;
    /// ACT-R production cycle with declarative retrieval by activation (Anderson & Lebiere 1998, *The Atomic Components of Thought*).
    ActR = "act_r" => crate::breeds::act_r::ActR;
    /// Allen interval algebra — Allen 1983 (CACM 26(11)).
    AllenTemporal = "allen_temporal" => crate::breeds::allen_temporal::AllenTemporal;
    /// Structure-Mapping Engine (Falkenhainer, Forbus & Gentner 1989).
    AnalogySme = "analogy_sme" => crate::breeds::analogy_sme::AnalogySme;
    /// ASP: Answer Set Programming via Gelfond–Lifschitz stable-model semantics (Gelfond & Lifschitz, 'The Stable Model Semantics for Logic Programming', ICLP/SLP 1988).
    Asp = "asp" => crate::breeds::asp::Asp;
    /// AutoinstinctLearning — STRIPS/HACKER bitwise heuristic planning (Winston 1975).
    AutoinstinctLearning = "autoinstinct_learning" => crate::breeds::autoinstinct_learning::AutoinstinctLearning;
    /// AutoinstinctNeurosis breed — Artificial Neurosis / Ideology Machine (Colby/Abelson lineage).
    AutoinstinctNeurosis = "autoinstinct_neurosis" => crate::breeds::autoinstinct_neurosis::AutoinstinctNeurosis;
    /// AutoInstinct Semantics breed — NLU via Schank Conceptual Dependency primitives.
    AutoinstinctSemantics = "autoinstinct_semantics" => crate::breeds::autoinstinct_semantics::AutoinstinctSemantics;
    /// AutoinstinctVision — Symbolic Blocks World perception breed.
    AutoinstinctVision = "autoinstinct_vision" => crate::breeds::autoinstinct_vision::AutoinstinctVision;
    /// Bayesian network inference — Pearl 1988.
    BayesianNetwork = "bayesian_network" => crate::breeds::bayesian_network::BayesianNetwork;
    /// Belief merging: distance-based IC merging operators Σ and GMax (Konieczny & Pino Pérez, 'Merging Information Under Constraints: A Logical Framework', Journal of Logic and Computation 12(5), 2002).
    BeliefMerging = "belief_merging" => crate::breeds::belief_merging::BeliefMerging;
    /// Case-Based Reasoning via Jaccard similarity with Discrimination Net Indexing (Schank 1983).
    Cbr = "cbr" => crate::breeds::cbr::Cbr;
    /// Predicate circumscription via minimal-model enumeration (McCarthy 1980).
    Circumscription = "circumscription" => crate::breeds::circumscription::Circumscription;
    /// CLP(FD): Constraint Logic Programming over finite integer domains (Jaffar & Lassez, 'Constraint Logic Programming', POPL 1987).
    Clp = "clp" => crate::breeds::clp::Clp;
    /// Goldberg Construction Grammar: argument-structure constructions carry meaning independently of the verb's lexical entry (Goldberg 1995, 'Constructions: A Construction Grammar Approach to Argument Structure').
    ConstructionGrammar = "construction_grammar" => crate::breeds::construction_grammar::ConstructionGrammar;
    /// Contingent planning: AND-OR search over belief states with sensing actions (Russell & Norvig, AIMA 3rd ed.
    ContingentPlan = "contingent_plan" => crate::breeds::contingent_plan::ContingentPlan;
    /// Constraint satisfaction via AC-3 + MAC backtracking — Mackworth 1977.
    CspAc3 = "csp_ac3" => crate::breeds::csp_ac3::CspAc3;
    /// CTL model checking by fixed-point labeling (Clarke, Emerson & Sistla 1986, 'Automatic verification of finite-state concurrent systems using temporal logic specifications', ACM TOPLAS 8(2)).
    CtlCheck = "ctl_check" => crate::breeds::ctl_check::CtlCheck;
    /// Default logic — Reiter 1980 (normal defaults with justifications).
    DefaultLogic = "default_logic" => crate::breeds::default_logic::DefaultLogic;
    /// Dempster–Shafer theory of evidence — Shafer 1976.
    DempsterShafer = "dempster_shafer" => crate::breeds::dempster_shafer::DempsterShafer;
    /// DENDRAL-style constraint enumeration (Feigenbaum 1971).
    Dendral = "dendral" => crate::breeds::dendral::Dendral;
    /// Description Logic: EL completion-rule classification (Baader, Brandt & Lutz, 'Pushing the EL Envelope', IJCAI 2005).
    DescriptionLogic = "description_logic" => crate::breeds::description_logic::DescriptionLogic;
    /// Explanation-based learning — Mitchell, Keller & Kedar-Cabelli 1986 (EBG).
    Ebl = "ebl" => crate::breeds::ebl::Ebl;
    /// ELIZA-style frame/pattern matching with pronoun reflection (Weizenbaum 1966).
    Eliza = "eliza" => crate::breeds::frame::Eliza;
    /// Episodic memory: cue-based recall with a temporal-proximity kernel (Tulving 1983, *Elements of Episodic Memory*; Nuxoll & Laird 2007, AAAI — episodic memory in Soar).
    EpisodicMemory = "episodic_memory" => crate::breeds::episodic_memory::EpisodicMemory;
    /// Event Calculus (Kowalski & Sergot, 'A Logic-based Calculus of Events', New Generation Computing 4(1), 1986) — discrete simplified event calculus.
    EventCalculus = "event_calculus" => crate::breeds::event_calculus::EventCalculus;
    /// Frame-based inheritance — Minsky 1974.
    FramesInheritance = "frames_inheritance" => crate::breeds::frames_inheritance::FramesInheritance;
    /// Mamdani fuzzy inference — Mamdani & Assilian 1975 (Zadeh 1965 sets).
    FuzzyLogic = "fuzzy_logic" => crate::breeds::fuzzy_logic::FuzzyLogic;
    /// GPS (General Problem Solver) — means-ends gap reduction (Newell & Shaw 1963).
    Gps = "gps" => crate::breeds::gps::Gps;
    /// Hearsay-II blackboard architecture with knowledge-source consensus fusion via noisy-OR (Erman & Lesser 1980).
    Hearsay = "hearsay" => crate::breeds::hearsay::Hearsay;
    /// HTN planning — SHOP2-style total-order decomposition (Nau et al.
    HtnPlanning = "htn_planning" => crate::breeds::htn_planning::HtnPlanning;
    /// FOIL: top-down induction of first-order Horn clauses by information gain (Quinlan 1990, 'Learning logical definitions from relations', Machine Learning 5).
    Ilp = "ilp" => crate::breeds::ilp::Ilp;
    /// LTL runtime monitor — Havelund & Roşu 2001 progression (formula rewriting).
    LtlMonitor = "ltl_monitor" => crate::breeds::ltl_monitor::LtlMonitor;
    /// Propositional Markov Logic Network MAP inference via MaxWalkSAT (Richardson & Domingos 2006, 'Markov logic networks', Machine Learning 62; MaxWalkSAT: Kautz, Selman & Jiang 1997).
    MarkovLogic = "markov_logic" => crate::breeds::markov_logic::MarkovLogic;
    /// MDP: value iteration to the Bellman fixed point (Bellman, 'Dynamic Programming', Princeton University Press, 1957).
    Mdp = "mdp" => crate::breeds::mdp::Mdp;
    /// Meta-reasoning: cross-breed conflict detection and confidence-weighted resolution (Cox & Raja 2011, 'Metareasoning: Thinking about Thinking', MIT Press — the meta-level monitors object-level reasoners and arbitrates).
    MetaReasoning = "meta_reasoning" => crate::breeds::meta_reasoning::MetaReasoning;
    /// Zwicky General Morphological Analysis with Cross-Consistency Assessment (Zwicky 1947, 'Morphology and nomenclature of jet engines', Aeronautical Engineering Review 6(6); Zwicky 1969, 'Discovery, Invention, Research Through the Morphological Approach'; Ritchey 2011, 'Wicked Problems — Social Messes', Springer, Chapter 2, DOI 10.1007/978-3-642-19653-9_2).
    Morphological = "morphological" => crate::breeds::morphological::Morphological;
    /// MYCIN-style forward-chaining rule engine with Shortliffe-Buchanan certainty-factor combination (Shortliffe 1976).
    Mycin = "mycin" => crate::breeds::production_rules::Mycin;
    /// Naive physics: hand-coded commonsense axiom saturation (Hayes 1979, 'The Naive Physics Manifesto'; Hayes 1985, 'Naive physics I: ontology for liquids').
    NaivePhysics = "naive_physics" => crate::breeds::naive_physics::NaivePhysics;
    /// Object-Centric Process Mining (OCPM) Route Discoverer Discovers individual object lifecycles from object-centric event logs.
    OcpmRouteDiscoverer = "ocpm_route_discoverer" => crate::breeds::ocpm_route_discoverer::OcpmRouteDiscoverer;
    /// SNLP partial-order planning (McAllester & Rosenblitt, 'Systematic Nonlinear Planning', AAAI 1991).
    PartialOrderPlan = "partial_order_plan" => crate::breeds::partial_order_plan::PartialOrderPlan;
    /// POMDP: exact Bayes belief update + bounded point-based value iteration (Kaelbling, Littman & Cassandra 1998, 'Planning and acting in partially observable stochastic domains', AIJ 101; PBVI: Pineau, Gordon & Thrun 2003).
    Pomdp = "pomdp" => crate::breeds::pomdp::Pomdp;
    /// ProbLog: probabilistic Horn logic by exact possible-worlds enumeration (De Raedt, Kimmig & Toivonen 2007, IJCAI).
    Problog = "problog" => crate::breeds::problog::Problog;
    /// Breed: Prolog — flat-term Robinson unification over positional ?N variables.
    Prolog = "prolog" => crate::breeds::prolog::Prolog;
    /// Qualitative reasoning: confluence propagation and envisionment (de Kleer & Brown, 'A Qualitative Physics Based on Confluences', Artificial Intelligence 24, 1984).
    QualitativeReason = "qualitative_reason" => crate::breeds::qualitative_reason::QualitativeReason;
    /// Tabular Q-learning over a symbolic MDP (Watkins & Dayan 1992, 'Q-learning', Machine Learning 8).
    RlSymbolic = "rl_symbolic" => crate::breeds::rl_symbolic::RlSymbolic;
    /// CDCL SAT solver with 1-UIP conflict-driven clause learning (Marques-Silva & Sakallah 1999, GRASP, IEEE Trans.
    SatCdcl = "sat_cdcl" => crate::breeds::sat_cdcl::SatCdcl;
    /// SAM: Script Applier Mechanism (Schank & Abelson, 'Scripts, Plans, Goals and Understanding', Lawrence Erlbaum, 1977).
    ScriptSam = "script_sam" => crate::breeds::script_sam::ScriptSam;
    /// Situation calculus with Reiter successor-state axioms (Reiter 1991).
    SituationCalculus = "situation_calculus" => crate::breeds::situation_calculus::SituationCalculus;
    /// SOAR-style preference-based operator selection with impasse detection and bounded subgoaling (Laird 1987).
    Soar = "soar" => crate::breeds::soar::Soar;
    /// STRIPS-style precondition-based planner with iterative deepening goal-regression search (Fikes & Nilsson 1971).
    Strips = "strips" => crate::breeds::strips::Strips;
    /// Smullyan signed analytic tableaux for propositional validity (Smullyan 1968, 'First-Order Logic', Part I).
    Tableaux = "tableaux" => crate::breeds::tableaux::Tableaux;
    /// Altshuller's TRIZ (Theory of Inventive Problem Solving) Contradiction Matrix and Inventive Principles.
    Triz = "triz" => crate::breeds::triz::Triz;
    /// Version-space candidate elimination (Mitchell, 'Generalization as Search', Artificial Intelligence 18(2), 1982).
    VersionSpace = "version_space" => crate::breeds::version_space::VersionSpace;
    /// Version-space candidate elimination (Mitchell, 'Generalization as Search', Artificial Intelligence 18(2), 1982).
    VersionSpace = "version_space" => crate::breeds::version_space::VersionSpace;
}

impl BreedId {
    /// Legally-admitted PARTIAL_ALIVE subset — derived from evidence.ttl via
    /// the alive-gate CONSTRUCT (measured fitness 1.0 + OCEL admission).
    /// A breed enters this list only through an ocel/reports/ entry; the
    /// hand-flip path no longer exists.
    pub const ALL: [BreedId; 116] = [
        BreedId::AbductiveIbe,
        BreedId::AbductiveIbe,
        BreedId::AbductiveLp,
        BreedId::AbductiveLp,
        BreedId::ActR,
        BreedId::ActR,
        BreedId::AllenTemporal,
        BreedId::AllenTemporal,
        BreedId::AnalogySme,
        BreedId::AnalogySme,
        BreedId::Asp,
        BreedId::Asp,
        BreedId::AutoinstinctLearning,
        BreedId::AutoinstinctLearning,
        BreedId::AutoinstinctLearning,
        BreedId::AutoinstinctLearning,
        BreedId::AutoinstinctNeurosis,
        BreedId::AutoinstinctNeurosis,
        BreedId::AutoinstinctNeurosis,
        BreedId::AutoinstinctNeurosis,
        BreedId::AutoinstinctSemantics,
        BreedId::AutoinstinctSemantics,
        BreedId::AutoinstinctVision,
        BreedId::AutoinstinctVision,
        BreedId::BayesianNetwork,
        BreedId::BayesianNetwork,
        BreedId::BeliefMerging,
        BreedId::BeliefMerging,
        BreedId::Cbr,
        BreedId::Cbr,
        BreedId::Circumscription,
        BreedId::Circumscription,
        BreedId::Clp,
        BreedId::Clp,
        BreedId::ConstructionGrammar,
        BreedId::ConstructionGrammar,
        BreedId::ContingentPlan,
        BreedId::ContingentPlan,
        BreedId::CspAc3,
        BreedId::CspAc3,
        BreedId::CtlCheck,
        BreedId::CtlCheck,
        BreedId::DefaultLogic,
        BreedId::DefaultLogic,
        BreedId::DempsterShafer,
        BreedId::DempsterShafer,
        BreedId::Dendral,
        BreedId::Dendral,
        BreedId::DescriptionLogic,
        BreedId::DescriptionLogic,
        BreedId::Ebl,
        BreedId::Ebl,
        BreedId::Eliza,
        BreedId::Eliza,
        BreedId::EpisodicMemory,
        BreedId::EpisodicMemory,
        BreedId::EventCalculus,
        BreedId::EventCalculus,
        BreedId::FramesInheritance,
        BreedId::FramesInheritance,
        BreedId::FuzzyLogic,
        BreedId::FuzzyLogic,
        BreedId::Gps,
        BreedId::Gps,
        BreedId::Gps,
        BreedId::Gps,
        BreedId::Hearsay,
        BreedId::Hearsay,
        BreedId::HtnPlanning,
        BreedId::HtnPlanning,
        BreedId::Ilp,
        BreedId::Ilp,
        BreedId::LtlMonitor,
        BreedId::LtlMonitor,
        BreedId::MarkovLogic,
        BreedId::MarkovLogic,
        BreedId::Mdp,
        BreedId::Mdp,
        BreedId::MetaReasoning,
        BreedId::MetaReasoning,
        BreedId::Morphological,
        BreedId::Morphological,
        BreedId::Mycin,
        BreedId::Mycin,
        BreedId::NaivePhysics,
        BreedId::NaivePhysics,
        BreedId::OcpmRouteDiscoverer,
        BreedId::OcpmRouteDiscoverer,
        BreedId::PartialOrderPlan,
        BreedId::PartialOrderPlan,
        BreedId::Pomdp,
        BreedId::Pomdp,
        BreedId::Problog,
        BreedId::Problog,
        BreedId::Prolog,
        BreedId::Prolog,
        BreedId::QualitativeReason,
        BreedId::QualitativeReason,
        BreedId::RlSymbolic,
        BreedId::RlSymbolic,
        BreedId::SatCdcl,
        BreedId::SatCdcl,
        BreedId::ScriptSam,
        BreedId::ScriptSam,
        BreedId::SituationCalculus,
        BreedId::SituationCalculus,
        BreedId::Soar,
        BreedId::Soar,
        BreedId::Strips,
        BreedId::Strips,
        BreedId::Tableaux,
        BreedId::Tableaux,
        BreedId::Triz,
        BreedId::Triz,
        BreedId::VersionSpace,
        BreedId::VersionSpace,
    ];
}
