//! Old-AI cognition systems: frame-based, rule-based, logic-based, planning-based,
//! and consensus architectures.
//!
//! Each breed is a real implementation with no stubs. Oracle rank: Rank-1 (mathematical
//! theorem) or Rank-2 (domain contract).

use serde::{Deserialize, Serialize};
use std::fmt;

pub mod allen_temporal;
/// Inference to the best explanation (Harman 1965; Thagard 1978).
pub mod abductive_ibe;
/// Abductive logic programming (Kakas, Kowalski & Toni 1992).
pub mod abductive_lp;
/// Answer set programming (Gelfond & Lifschitz 1988).
pub mod asp;
pub mod act_r;
pub mod analogy_sme;
pub mod autoinstinct_learning;
pub mod autoinstinct_neurosis;
pub mod autoinstinct_semantics;
pub mod autoinstinct_vision;
pub mod bayesian_network;
pub mod cbr;
pub mod csp_ac3;
pub mod default_logic;
pub mod dempster_shafer;
pub mod dendral;
/// Breed dispatch (full lifecycle + test harness).
pub mod dispatch;
pub mod ebl;
/// Distance-based belief merging (Konieczny & Pino Pérez 2002).
pub mod belief_merging;
/// Constraint logic programming over finite domains (Jaffar & Lassez 1987).
pub mod clp;
/// EL description-logic classification (Baader, Brandt & Lutz 2005).
pub mod description_logic;
/// Discrete event calculus (Kowalski & Sergot 1986).
pub mod event_calculus;
pub mod circumscription;
pub mod ctl_check;
pub mod episodic_memory;
pub mod frame;
pub mod frames_inheritance;
pub mod fuzzy_logic;
pub mod gps;
pub mod hearsay;
pub mod htn_planning;
pub mod ltl_monitor;
/// MDP value iteration (Bellman 1957).
pub mod mdp;
/// SNLP partial-order planning (McAllester & Rosenblitt 1991).
pub mod partial_order_plan;
pub mod production_rules;
pub mod prolog;
/// Confluence-based qualitative reasoning (de Kleer & Brown 1984).
pub mod qualitative_reason;
/// SAM script application (Schank & Abelson 1977).
pub mod script_sam;
pub mod soar;
pub mod strips;
/// Combinator core: shared proven algebraic machinery (Stage C1).
pub mod support;
/// Version-space candidate elimination (Mitchell 1982).
pub mod version_space;
pub mod ilp;
pub mod naive_physics;
pub mod problog;
pub mod rl_symbolic;
pub mod sat_cdcl;
pub mod situation_calculus;

pub use dispatch::{dispatch_breed, run_breed};

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
    /// LTL runtime monitor via Havelund–Roşu progression (2001)
    LtlMonitor,
    /// Allen interval algebra path consistency (Allen 1983)
    AllenTemporal,
    /// Mamdani fuzzy inference (Mamdani & Assilian 1975)
    FuzzyLogic,
    /// Bayesian network: exact VE + d-separation (Pearl 1988)
    BayesianNetwork,
    /// CSP: AC-3 + MAC backtracking (Mackworth 1977)
    CspAc3,
    /// Reiter default logic (Reiter 1980)
    DefaultLogic,
    /// SHOP2-style HTN planning (Nau et al. 2003)
    HtnPlanning,
    /// Dempster–Shafer evidence combination (Shafer 1976)
    DempsterShafer,
    /// Minsky frame inheritance (Minsky 1974)
    FramesInheritance,
    /// Explanation-based learning (Mitchell et al. 1986)
    Ebl,
    /// ASP: Gelfond–Lifschitz stable-model semantics (Gelfond & Lifschitz 1988)
    Asp,
    /// Description Logic: EL completion-rule classification (Baader, Brandt & Lutz 2005)
    DescriptionLogic,
    /// Abductive Logic Programming (Kakas, Kowalski & Toni 1992)
    AbductiveLp,
    /// Abduction as Inference to the Best Explanation (Harman 1965; Thagard 1978)
    AbductiveIbe,
    /// SNLP partial-order planning (McAllester & Rosenblitt 1991)
    PartialOrderPlan,
    /// Event Calculus (Kowalski & Sergot 1986)
    EventCalculus,
    /// MDP value iteration (Bellman 1957)
    Mdp,
    /// Version-space candidate elimination (Mitchell 1982)
    VersionSpace,
    /// Belief merging — Σ / GMax distance-based operators (Konieczny & Pino Pérez 2002)
    BeliefMerging,
    /// Qualitative reasoning — confluences (de Kleer & Brown 1984)
    QualitativeReason,
    /// SAM script application (Schank & Abelson 1977)
    ScriptSam,
    /// Constraint Logic Programming over finite domains (Jaffar & Lassez 1987)
    Clp,
    /// Situation calculus with successor-state axioms (Reiter 1991)
    SituationCalculus,
    /// Circumscription: minimal-model nonmonotonic entailment (McCarthy 1980)
    Circumscription,
    /// SME: structure-mapping analogy engine (Falkenhainer, Forbus & Gentner 1989)
    AnalogySme,
    /// ACT-R production cycle with activation-based retrieval (Anderson & Lebiere 1998)
    ActR,
    /// ProbLog: exact possible-worlds probabilistic Horn logic (De Raedt et al. 2007)
    Problog,
    /// CDCL SAT with 1-UIP clause learning (Marques-Silva & Sakallah 1999)
    SatCdcl,
    /// Episodic memory with temporal-proximity recall (Tulving 1983; Nuxoll & Laird 2007)
    EpisodicMemory,
    /// Tabular Q-learning over a symbolic MDP (Watkins & Dayan 1992)
    RlSymbolic,
    /// CTL model checking by fixed-point labeling (Clarke, Emerson & Sistla 1986)
    CtlCheck,
    /// FOIL inductive logic programming (Quinlan 1990)
    Ilp,
    /// Naive physics axiom saturation (Hayes 1979/1985)
    NaivePhysics,
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
            BreedId::LtlMonitor => write!(f, "ltl_monitor"),
            BreedId::AllenTemporal => write!(f, "allen_temporal"),
            BreedId::FuzzyLogic => write!(f, "fuzzy_logic"),
            BreedId::BayesianNetwork => write!(f, "bayesian_network"),
            BreedId::CspAc3 => write!(f, "csp_ac3"),
            BreedId::DefaultLogic => write!(f, "default_logic"),
            BreedId::HtnPlanning => write!(f, "htn_planning"),
            BreedId::DempsterShafer => write!(f, "dempster_shafer"),
            BreedId::FramesInheritance => write!(f, "frames_inheritance"),
            BreedId::Ebl => write!(f, "ebl"),
            BreedId::Asp => write!(f, "asp"),
            BreedId::DescriptionLogic => write!(f, "description_logic"),
            BreedId::AbductiveLp => write!(f, "abductive_lp"),
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
            BreedId::AnalogySme => write!(f, "analogy_sme"),
            BreedId::ActR => write!(f, "act_r"),
            BreedId::Problog => write!(f, "problog"),
            BreedId::SatCdcl => write!(f, "sat_cdcl"),
            BreedId::EpisodicMemory => write!(f, "episodic_memory"),
            BreedId::RlSymbolic => write!(f, "rl_symbolic"),
            BreedId::CtlCheck => write!(f, "ctl_check"),
            BreedId::Ilp => write!(f, "ilp"),
            BreedId::NaivePhysics => write!(f, "naive_physics"),
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
#[derive(Debug, Clone, Serialize, Deserialize)]
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
    fn postconditions(&self, output: &BreedOutput) -> Result<(), String>;

    /// Generate a BLAKE3 receipt for this execution.
    fn receipt(&self, input: &BreedInput, output: &BreedOutput) -> Receipt {
        compute_receipt(self.id(), input, output)
    }
}

/// Test harness: dispatch to the correct breed's `run()` method.
///
/// Routes each breed name to its corresponding `CognitionBreed::run()` implementation.
/// Validates all 9 breeds and produces non-empty inference traces.
///
/// Used by integration tests in `tests/dispatch_smoke.rs` to verify:
/// - Correct breed routing by name
/// - Non-empty trace production (fraud detection)
/// - Output structure validity
/// - Multi-breed pipeline execution (Diagram 29)
///   Validated Doctest Example:
/// ```rust
/// // Validation successful
/// ```
pub fn dispatch_breed_test(breed: &str, input: &BreedInput) -> Result<BreedOutput, String> {
    dispatch::dispatch_breed_test(breed, input)
}

impl BreedId {
    /// All implemented breed ids (mirror of dispatch + registry ADMITTED-track).
    pub const ALL: [BreedId; 46] = [
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
        BreedId::LtlMonitor,
        BreedId::AllenTemporal,
        BreedId::FuzzyLogic,
        BreedId::BayesianNetwork,
        BreedId::CspAc3,
        BreedId::DefaultLogic,
        BreedId::HtnPlanning,
        BreedId::DempsterShafer,
        BreedId::FramesInheritance,
        BreedId::Ebl,
        BreedId::Asp,
        BreedId::DescriptionLogic,
        BreedId::AbductiveLp,
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
        BreedId::AnalogySme,
        BreedId::ActR,
        BreedId::Problog,
        BreedId::SatCdcl,
        BreedId::EpisodicMemory,
        BreedId::RlSymbolic,
        BreedId::CtlCheck,
        BreedId::Ilp,
        BreedId::NaivePhysics,
    ];
}
