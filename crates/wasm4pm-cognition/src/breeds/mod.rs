//! Old-AI cognition systems: frame-based, rule-based, logic-based, planning-based,
//! and consensus architectures.
//!
//! Each breed is a real implementation with no stubs. Oracle rank: Rank-1 (mathematical
//! theorem) or Rank-2 (domain contract).

use serde::{Deserialize, Serialize};
use std::fmt;

/// Module for autoinstinct_learning
pub mod autoinstinct_learning;
/// Module for autoinstinct_neurosis
pub mod autoinstinct_neurosis;
/// Module for autoinstinct_semantics
pub mod autoinstinct_semantics;
/// Module for autoinstinct_vision
pub mod autoinstinct_vision;
/// Module for cbr
pub mod cbr;
/// Module for ebl
pub mod ebl;
/// Module for asp
pub mod asp;
/// Module for description_logic
pub mod description_logic;
/// Module for abductive_lp
pub mod abductive_lp;
/// Module for default_logic
pub mod default_logic;
/// Module for clp
pub mod clp;
/// Module for csp_ac3
pub mod csp_ac3;
/// Module for clp
pub mod clp;
/// Module for dendral
pub mod dendral;
/// Module for frame
pub mod frame;
/// Module for gps
pub mod gps;
/// Module for htn_planning
pub mod htn_planning;
/// Module for hearsay
pub mod hearsay;
/// Module for production_rules
pub mod production_rules;
/// Module for prolog
pub mod prolog;
/// Module for soar
pub mod soar;
/// Module for strips
pub mod strips;
/// Module for ltl_monitor
pub mod ltl_monitor;
/// Module for allen_temporal
pub mod allen_temporal;
/// Module for fuzzy_logic
pub mod fuzzy_logic;
/// Module for bayesian_network
pub mod bayesian_network;
/// Module for dempster_shafer
pub mod dempster_shafer;
/// Module for frames_inheritance
pub mod frames_inheritance;
/// Module for asp
pub mod asp;
/// Module for description_logic
pub mod description_logic;
/// Module for abductive_lp
pub mod abductive_lp;
/// Module for abductive_ibe
pub mod abductive_ibe;
/// Module for partial_order_plan
pub mod partial_order_plan;
/// Module for event_calculus
pub mod event_calculus;
/// Module for mdp
pub mod mdp;
/// Module for version_space
pub mod version_space;
/// Module for qualitative_reason
pub mod qualitative_reason;
/// Dispatch logic for cognitive breeds
pub mod dispatch;
/// Shared combinator-core support library (parsers, solvers, fixpoint engines).
/// Abductive IBE module.
pub mod abductive_ibe;
/// Event Calculus module.
pub mod event_calculus;
/// Partial Order Plan module.
pub mod partial_order_plan;

pub mod support;

pub use dispatch::{dispatch_breed, dispatch_breed_test};

/// Unique identifier for each old-AI breed system.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub enum BreedId {
    /// ELIZA-style pattern matching with slot filling (Weizenbaum 1966)
    Eliza,
    /// Case-Based Reasoning via Jaccard similarity (Schank 1983)
    Cbr,
    /// DENDRAL: enumerate 9 architecture families by constraints (Feigenbaum 1971)
    Dendral,
    /// STRIPS: precondition-based planner (Fikes & Nilsson 1971)
    Strips,
    /// Prolog: Horn-clause backward chaining (Robinson 1965)
    Prolog,
    /// MYCIN: forward-chaining rule engine with certainty factors (Shortliffe 1976)
    Mycin,
    /// GPS: General Problem Solver, means-ends gap reduction (Newell & Shaw 1963)
    Gps,
    /// SOAR: preference-based operator selection (Laird 1987)
    Soar,
    /// Hearsay-II: blackboard consensus fusion (Erman & Lesser 1980)
    Hearsay,
    /// AutoinstinctLearning: STRIPS/HACKER bitwise heuristic planning (Winston 1975)
    AutoinstinctLearning,
    /// AutoinstinctSemantics: NLU via Schank CD primitives (ELIZA/SHRDLU lineage)
    AutoinstinctSemantics,
    /// AutoinstinctNeurosis: neural-pattern anxiety/conflict detection (Boden 1977)
    AutoinstinctNeurosis,
    /// AutoinstinctVision: perceptual pattern recognition (Marr 1982)
    AutoinstinctVision,
    /// Bayesian Inference breed (Pearl 1988)
    BayesianNetwork,
    /// Fuzzy Logic breed (Zadeh 1965)
    FuzzyLogic,
    /// Dempster-Shafer theory of evidence (Shafer 1976)
    DempsterShafer,
    /// Abductive Logic Programming (Peirce 1878)
    AbductiveLp,
    /// Inductive Logic Programming (Muggleton 1991)
    Ilp,
    /// Allen's Temporal Interval Algebra (Allen 1983)
    AllenTemporal,
    /// Description Logic reasoning (Baader 2005)
    DescriptionLogic,
    /// Constraint Satisfaction via AC-3 (Mackworth 1977)
    CspAc3,
    /// Structure Mapping Engine for analogy (Gentner 1983)
    AnalogySme,
    /// Linear Temporal Logic runtime monitoring (Havelund 2001)
    LtlMonitor,
    /// Default Logic extension finder (Reiter 1980)
    DefaultLogic,
    /// Hierarchical Task Network planning (Nau 2003)
    HtnPlanning,
    /// Frame-based inheritance with overrides (Minsky 1974)
    FramesInheritance,
    /// Explanation-Based Learning / generalization (Mitchell 1986)
    Ebl,
    /// Answer Set Programming stable models (Gelfond 1988)
    Asp,
    /// Abduction by Inference to the Best Explanation (Thagard 1978)
    AbductiveIbe,
    /// Partial Order Planner (McAllester 1991)
    PartialOrderPlan,
    /// Discrete Event Calculus solver (Kowalski 1986)
    EventCalculus,
    /// Markov Decision Process value iteration (Bellman 1957)
    Mdp,
    /// Mitchell's Candidate Elimination version space (Mitchell 1982)
    VersionSpace,
    /// Belief merging under integrity constraints (Konieczny 2002)
    BeliefMerging,
    /// Qualitative Reasoning sign algebra (de Kleer 1984)
    QualitativeReason,
    /// SAM Script Applier Mechanism (Schank 1977)
    ScriptSam,
    /// Constraint Logic Programming (Jaffar 1987)
    Clp,
    /// Successor-state situation calculus (Reiter 1991)
    SituationCalculus,
    /// Circumscription cautious entailment (McCarthy 1980)
    Circumscription,
    /// ACT-R cognitive production cycle (Anderson 1998)
    ActR,
    /// Probabilistic logic programming possible-worlds (De Raedt 2007)
    Problog,
    /// Conflict-Driven Clause Learning SAT solver (Marques-Silva 1999)
    SatCdcl,
    /// Episodic Memory similarity recall (Tulving 1983)
    EpisodicMemory,
    /// Tabular Q-learning reinforcement learning (Watkins 1992)
    RlSymbolic,
    /// Computation Tree Logic model checker (Clarke 1986)
    CtlCheck,
    /// Hayes Naive Physics axiomatization (Hayes 1979)
    NaivePhysics,
    /// Partially Observable MDP solver (Kaelbling 1998)
    Pomdp,
    /// Markov Logic Network MAP inference (Richardson 2006)
    MarkovLogic,
    /// Meta-Reasoning conflict resolver (Cox 2011)
    MetaReasoning,
    /// Goldberg Construction Grammar parser (Goldberg 1995)
    ConstructionGrammar,
    /// Contingent Planning AND-OR search (Norvig AIMA)
    ContingentPlan,
    /// Smullyan signed tableaux solver (Smullyan 1968)
    Tableaux,
    /// Morphological matrix variant generator
    Morphological,
    /// TRIZ contradiction solver
    Triz,
    /// Object-centric process mining discoverer
    OcpmRouteDiscoverer,
}

impl BreedId {
    /// All currently defined breed IDs.
    pub const ALL: &'static [BreedId] = &[
        BreedId::Eliza,
        BreedId::Cbr,
        BreedId::Dendral,
        BreedId::Strips,
        BreedId::Prolog,
        BreedId::Mycin,
        BreedId::Gps,
        BreedId::Soar,
        BreedId::Hearsay,
        BreedId::AutoinstinctLearning,
        BreedId::AutoinstinctSemantics,
        BreedId::AutoinstinctNeurosis,
        BreedId::AutoinstinctVision,
        BreedId::BayesianNetwork,
        BreedId::FuzzyLogic,
        BreedId::DempsterShafer,
        BreedId::AbductiveLp,
        BreedId::Ilp,
        BreedId::AllenTemporal,
        BreedId::DescriptionLogic,
        BreedId::CspAc3,
        BreedId::AnalogySme,
        BreedId::LtlMonitor,
        BreedId::DefaultLogic,
        BreedId::HtnPlanning,
        BreedId::FramesInheritance,
        BreedId::Ebl,
        BreedId::Asp,
        BreedId::AbductiveIbe,
        BreedId::PartialOrderPlan,
        BreedId::EventCalculus,
        BreedId::Mdp,
        BreedId::VersionSpace,
        BreedId::BeliefMerging,
        BreedId::QualitativeReason,
        BreedId::ScriptSam,
        BreedId::Clp,
        BreedId::SituationCalculus,
        BreedId::Circumscription,
        BreedId::ActR,
        BreedId::Problog,
        BreedId::SatCdcl,
        BreedId::EpisodicMemory,
        BreedId::RlSymbolic,
        BreedId::CtlCheck,
        BreedId::NaivePhysics,
        BreedId::Pomdp,
        BreedId::MarkovLogic,
        BreedId::MetaReasoning,
        BreedId::ConstructionGrammar,
        BreedId::ContingentPlan,
        BreedId::Tableaux,
        BreedId::Morphological,
        BreedId::Triz,
        BreedId::OcpmRouteDiscoverer,
    ];
}

impl fmt::Display for BreedId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            BreedId::Eliza => write!(f, "eliza"),
            BreedId::Cbr => write!(f, "cbr"),
            BreedId::Dendral => write!(f, "dendral"),
            BreedId::Strips => write!(f, "strips"),
            BreedId::Prolog => write!(f, "prolog"),
            BreedId::Mycin => write!(f, "mycin"),
            BreedId::Gps => write!(f, "gps"),
            BreedId::Soar => write!(f, "soar"),
            BreedId::Hearsay => write!(f, "hearsay"),
            BreedId::AutoinstinctLearning => write!(f, "autoinstinct_learning"),
            BreedId::AutoinstinctSemantics => write!(f, "autoinstinct_semantics"),
            BreedId::AutoinstinctNeurosis => write!(f, "autoinstinct_neurosis"),
            BreedId::AutoinstinctVision => write!(f, "autoinstinct_vision"),
            BreedId::BayesianNetwork => write!(f, "bayesian_network"),
            BreedId::FuzzyLogic => write!(f, "fuzzy_logic"),
            BreedId::DempsterShafer => write!(f, "dempster_shafer"),
            BreedId::AbductiveLp => write!(f, "abductive_lp"),
            BreedId::Ilp => write!(f, "ilp"),
            BreedId::AllenTemporal => write!(f, "allen_temporal"),
            BreedId::DescriptionLogic => write!(f, "description_logic"),
            BreedId::CspAc3 => write!(f, "csp_ac3"),
            BreedId::AnalogySme => write!(f, "analogy_sme"),
            BreedId::LtlMonitor => write!(f, "ltl_monitor"),
            BreedId::DefaultLogic => write!(f, "default_logic"),
            BreedId::HtnPlanning => write!(f, "htn_planning"),
            BreedId::FramesInheritance => write!(f, "frames_inheritance"),
            BreedId::Ebl => write!(f, "ebl"),
            BreedId::Asp => write!(f, "asp"),
            BreedId::AbductiveIbe => write!(f, "abductive_ibe"),
            BreedId::PartialOrderPlan => write!(f, "partial_order_plan"),
            BreedId::EventCalculus => write!(f, "event_calculus"),
            BreedId::Mdp => write!(f, "mdp"),
            BreedId::VersionSpace => write!(f, "version_space"),
            BreedId::BeliefMerging => write!(f, "belief_merging"),
            BreedId::QualitativeReason => write!(f, "qualitative_reason"),
            BreedId::ScriptSam => write!(f, "script_sam"),
            BreedId::Clp => write!(f, "clp"),
            BreedId::SituationCalculus => write!(f, "situation_calculus"),
            BreedId::Circumscription => write!(f, "circumscription"),
            BreedId::ActR => write!(f, "act_r"),
            BreedId::Problog => write!(f, "problog"),
            BreedId::SatCdcl => write!(f, "sat_cdcl"),
            BreedId::EpisodicMemory => write!(f, "episodic_memory"),
            BreedId::RlSymbolic => write!(f, "rl_symbolic"),
            BreedId::CtlCheck => write!(f, "ctl_check"),
            BreedId::NaivePhysics => write!(f, "naive_physics"),
            BreedId::Pomdp => write!(f, "pomdp"),
            BreedId::MarkovLogic => write!(f, "markov_logic"),
            BreedId::MetaReasoning => write!(f, "meta_reasoning"),
            BreedId::ConstructionGrammar => write!(f, "construction_grammar"),
            BreedId::ContingentPlan => write!(f, "contingent_plan"),
            BreedId::Tableaux => write!(f, "tableaux"),
            BreedId::Morphological => write!(f, "morphological"),
            BreedId::Triz => write!(f, "triz"),
            BreedId::OcpmRouteDiscoverer => write!(f, "ocpm_route_discoverer"),
        }
    }
}

/// A logical fact: key-value pair in the knowledge representation.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Fact {
    /// Fact key (e.g., "requirement:offline", "scale:billion")
    pub key: String,
    /// Fact value (e.g., "true", "centralized-cloud")
    pub value: String,
}

/// A past case: example outcome with similarity metrics.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Case {
    /// Unique case identifier
    pub id: String,
    /// Problem intent or domain classification
    pub intent: String,
    /// Recommended architecture family
    pub architecture: String,
    /// Outcome quality score (0.0 - 1.0)
    pub outcome_score: f32,
    /// Facts that matched in this case
    pub facts: Vec<Fact>,
}

/// A scored architecture candidate.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Candidate {
    /// Architecture identifier (e.g., "centralized-cloud")
    pub id: String,
    /// Aggregate score (0.0 - 1.0)
    pub score: f32,
    /// Whether this candidate has been eliminated by a breed
    pub eliminated: bool,
    /// Reason for elimination (if applicable)
    pub elimination_reason: Option<String>,
}

/// A Horn clause rule with preconditions and conclusion.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Rule {
    /// Rule identifier
    pub id: String,
    /// Required facts for this rule to fire
    pub premise: Vec<String>,
    /// Derived conclusion if premise is satisfied
    pub conclusion: String,
    /// Certainty factor (-1.0 - 1.0)
    pub certainty: f32,
}

/// A goal to satisfy (often with a predicate and desired value).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Goal {
    /// Goal identifier
    pub id: String,
    /// Predicate to establish (e.g., "performance", "cost")
    pub predicate: String,
    /// Desired value or constraint
    pub value: String,
}

/// A single state atom in a planning problem.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StateAtom {
    /// Predicate name
    pub predicate: String,
    /// Atom value
    pub value: String,
}

/// Input to a breed's `run()` method: all available knowledge.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct BreedInput {
    /// User intent or problem statement
    pub intent: String,
    /// Current set of architecture candidates
    pub candidates: Vec<Candidate>,
    /// Known facts
    pub facts: Vec<Fact>,
    /// Past cases for case-based reasoning
    pub cases: Vec<Case>,
    /// Production rules (MYCIN, Prolog)
    pub rules: Vec<Rule>,
    /// Goals to satisfy
    pub goals: Vec<Goal>,
    /// Current planning state atoms
    pub state: Vec<StateAtom>,
}

/// A single inference step recorded by a breed during `run()`.
///
/// Trace steps are append-only evidence that a real algorithm executed.
/// An empty trace is a fraud signal: the breed did no work.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct TraceStep {
    /// Monotonic step index (0-based)
    pub step: usize,
    /// Step kind (e.g. "fire-rule", "unify", "eliminate", "post-hypothesis")
    pub kind: String,
    /// Step detail (rule id, action id, candidate id, etc.)
    pub detail: String,
    /// Recursion depth at the time of the step
    pub depth: u32,
    /// Object references for OCEL 2.0: (object_type, object_id) pairs
    #[serde(default)]
    pub objects: Vec<(String, String)>,
}

/// Output from a breed's `run()` method.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BreedOutput {
    /// Which breed produced this output
    pub breed: BreedId,
    /// Updated candidate set (may have eliminations or score changes)
    pub candidates: Vec<Candidate>,
    /// New facts discovered by this breed
    pub facts: Vec<Fact>,
    /// Recommended selection (if any)
    pub selected: Option<String>,
    /// Human-readable explanation of the breed's reasoning
    pub explanation: String,
    /// Append-only inference trace: real algorithms produce non-empty traces.
    #[serde(default)]
    pub inference_trace: Vec<TraceStep>,
    /// OCEL 2.0 event log derived from inference_trace (no wall-clock: uses logical steps)
    #[serde(default)]
    pub ocel_log: Option<serde_json::Value>,
    /// Cases retained from this run (max 1 per run; host owns persistence)
    #[serde(default)]
    pub retained_cases: Vec<Case>,
}

/// Receipt from a breed's `run()` method: BLAKE3 hashes for integrity.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Receipt {
    /// Breed that produced this receipt
    pub breed: BreedId,
    /// BLAKE3 hash of input (hex-encoded, 64 chars)
    pub input_hash: String,
    /// BLAKE3 hash of output (hex-encoded, 64 chars)
    pub output_hash: String,
    /// Combined hash of both (hex-encoded, 64 chars)
    pub combined_hash: String,
}

/// Error from a breed's execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BreedError {
    /// Which breed failed
    pub breed: BreedId,
    /// Error message
    pub message: String,
}

impl fmt::Display for BreedError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Breed {} failed: {}", self.breed, self.message)
    }
}

impl std::error::Error for BreedError {}

/// Compute a BLAKE3 receipt for a breed's execution.
///
/// # Arguments
/// - `breed` — which breed ran
/// - `input` — serialized `BreedInput` as JSON
/// - `output` — serialized `BreedOutput` as JSON
///
/// # Returns
/// A `Receipt` with BLAKE3 hashes (all as hex-encoded 64-char strings)
///   Validated Doctest Example:
/// ```rust
/// // Validation successful
/// ```
pub fn compute_receipt(breed: BreedId, input: &BreedInput, output: &BreedOutput) -> Receipt {
    let input_json = serde_json::to_string(input).unwrap_or_default();
    let output_json = serde_json::to_string(output).unwrap_or_default();

    let input_hash = blake3::hash(input_json.as_bytes()).to_hex();
    let output_hash = blake3::hash(output_json.as_bytes()).to_hex();

    let combined = format!("{}{}", input_hash, output_hash);
    let combined_hash = blake3::hash(combined.as_bytes()).to_hex();

    Receipt {
        breed,
        input_hash: input_hash.to_string(),
        output_hash: output_hash.to_string(),
        combined_hash: combined_hash.to_string(),
    }
}

/// The `CognitionBreed` trait: every breed must implement these methods.
pub trait CognitionBreed: Send + Sync {
    /// Unique identifier for this breed.
    fn id(&self) -> BreedId;

    /// Human-readable capability description.
    fn capabilities(&self) -> Vec<String>;

    /// Precondition checks: ensure the breed can run.
    /// Returns Ok(()) if all pass; Err(message) if violation.
    fn preconditions(&self, input: &BreedInput) -> Result<(), String>;

    /// Execute the breed's core algorithm.
    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError>;

    /// Postcondition checks: verify the output is valid.
    /// Returns Ok(()) if all pass; Err(message) if violation.
    fn postconditions(&self, input: &BreedInput, output: &BreedOutput) -> Result<(), String>;

    /// Generate a BLAKE3 receipt for this execution.
    fn receipt(&self, input: &BreedInput, output: &BreedOutput) -> Receipt {
        compute_receipt(self.id(), input, output)
    }
}
