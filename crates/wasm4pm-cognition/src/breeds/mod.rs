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
/// Breed dispatch: explicit string-match routing (greppable, audit-friendly).
pub mod dispatch;
/// Combinator core: shared, fully-validated algebraic machinery (Stage C1).
pub mod support;
pub mod autoinstinct_neurosis;
pub mod autoinstinct_semantics;
pub mod autoinstinct_vision;
pub mod bayesian_network;
pub mod cbr;
pub mod csp_ac3;
pub mod default_logic;
pub mod dempster_shafer;
pub mod construction_grammar;
pub mod contingent_plan;
pub mod dendral;
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
pub mod markov_logic;
pub mod meta_reasoning;
pub mod pomdp;
pub mod production_rules;
pub mod prolog;
/// Confluence-based qualitative reasoning (de Kleer & Brown 1984).
pub mod qualitative_reason;
/// SAM script application (Schank & Abelson 1977).
pub mod script_sam;
pub mod soar;
pub mod strips;
/// Version-space candidate elimination (Mitchell 1982).
pub mod version_space;
pub mod ilp;
pub mod naive_physics;
pub mod problog;
pub mod rl_symbolic;
pub mod sat_cdcl;
pub mod situation_calculus;

pub use dispatch::{dispatch_breed, run_breed};
pub mod tableaux;
/// Ten-rung certification ladder for cognition breeds.
pub mod standing;
/// Phantom-typed receipt chain for the oracle/audit layer.
pub mod oracle_chain;

/// Declarative breed registration: one entry per line, string id literal
/// verbatim (greppable; integrator unions entries alphabetically per tier,
/// same merge profile as the former hand-written enum + match arms).
///
/// Generates four surfaces from a single declaration:
/// `BreedId` (with per-variant docs), `Display`, `from_str_id`, and the
/// `breed_instance` static routing table consumed by both dispatch fns.
///
/// Surfaces deliberately NOT generated here:
/// - `BreedId::ALL` — the legally-admitted PARTIAL_ALIVE subset (two-key
///   ceremony, policed by tests/registry_admission.rs).
/// - `ocel::lifecycle_model_for` — model absence is meaningful (gates OCEL
///   conformance); remains the one hand-edited Rust routing surface.
/// - `breeds/registry.json` and the TS `BreedIdSchema` — cross-language,
///   policed by registry_admission + fixture_parity.
macro_rules! breeds {
    ( $( $(#[$doc:meta])* $variant:ident = $id:literal => $path:path ; )+ ) => {
        /// Unique identifier for each old-AI breed system.
        #[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
        pub enum BreedId {
            $( $(#[$doc])* $variant, )+
        }

        impl fmt::Display for BreedId {
            fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                match self {
                    $( BreedId::$variant => f.write_str($id), )+
                }
            }
        }

        impl BreedId {
            /// Parse a breed id string into its enum variant. Returns None for
            /// unknown or not-yet-implemented ids (e.g. "ocpm_route_discoverer"
            /// is registered but unimplemented).
            pub fn from_str_id(s: &str) -> Option<Self> {
                match s {
                    $( $id => Some(Self::$variant), )+
                    _ => None,
                }
            }

            /// Number of registered (dispatchable) breeds — may exceed
            /// `ALL.len()` while a breed awaits registry admission.
            pub const REGISTERED_COUNT: usize = [$( $id ),+].len();
        }

        /// Static instance table: the single routing surface both
        /// `dispatch_breed_id` and `dispatch_breed_test_id` consume.
        /// Exhaustiveness is compiler-enforced by the match over `BreedId`.
        pub fn breed_instance(id: BreedId) -> &'static dyn CognitionBreed {
            match id {
                $( BreedId::$variant => &$path, )+
            }
        }
    };
}

breeds! {
    /// ELIZA-style pattern matching with slot filling (Weizenbaum 1966)
    Eliza = "eliza" => crate::breeds::frame::Eliza;
    /// Case-Based Reasoning via Jaccard similarity (Schank 1983)
    Cbr = "cbr" => crate::breeds::cbr::Cbr;
    /// DENDRAL: enumerate 9 architecture families by constraints (Feigenbaum 1971)
    Dendral = "dendral" => crate::breeds::dendral::Dendral;
    /// STRIPS: precondition-based planner (Fikes & Nilsson 1971)
    Strips = "strips" => crate::breeds::strips::Strips;
    /// Prolog: Horn-clause backward chaining (Robinson 1965)
    Prolog = "prolog" => crate::breeds::prolog::Prolog;
    /// MYCIN: forward-chaining rule engine with certainty factors (Shortliffe 1976)
    Mycin = "mycin" => crate::breeds::production_rules::Mycin;
    /// GPS: General Problem Solver, means-ends gap reduction (Newell & Shaw 1963)
    Gps = "gps" => crate::breeds::gps::Gps;
    /// SOAR: preference-based operator selection (Laird 1987)
    Soar = "soar" => crate::breeds::soar::Soar;
    /// Hearsay-II: blackboard consensus fusion (Erman & Lesser 1980)
    Hearsay = "hearsay" => crate::breeds::hearsay::Hearsay;
    /// AutoinstinctLearning: STRIPS/HACKER bitwise heuristic planning (Winston 1975)
    AutoinstinctLearning = "autoinstinct_learning" => crate::breeds::autoinstinct_learning::AutoinstinctLearning;
    /// AutoinstinctSemantics: NLU via Schank CD primitives (ELIZA/SHRDLU lineage)
    AutoinstinctSemantics = "autoinstinct_semantics" => crate::breeds::autoinstinct_semantics::AutoinstinctSemantics;
    /// AutoinstinctNeurosis: neural-pattern anxiety/conflict detection (Boden 1977)
    AutoinstinctNeurosis = "autoinstinct_neurosis" => crate::breeds::autoinstinct_neurosis::AutoinstinctNeurosis;
    /// AutoinstinctVision: perceptual pattern recognition (Marr 1982)
    AutoinstinctVision = "autoinstinct_vision" => crate::breeds::autoinstinct_vision::AutoinstinctVision;
    /// LTL runtime monitor via Havelund–Roşu progression (2001)
    LtlMonitor = "ltl_monitor" => crate::breeds::ltl_monitor::LtlMonitor;
    /// Allen interval algebra path consistency (Allen 1983)
    AllenTemporal = "allen_temporal" => crate::breeds::allen_temporal::AllenTemporal;
    /// Mamdani fuzzy inference (Mamdani & Assilian 1975)
    FuzzyLogic = "fuzzy_logic" => crate::breeds::fuzzy_logic::FuzzyLogic;
    /// Bayesian network: exact VE + d-separation (Pearl 1988)
    BayesianNetwork = "bayesian_network" => crate::breeds::bayesian_network::BayesianNetwork;
    /// CSP: AC-3 + MAC backtracking (Mackworth 1977)
    CspAc3 = "csp_ac3" => crate::breeds::csp_ac3::CspAc3;
    /// Reiter default logic (Reiter 1980)
    DefaultLogic = "default_logic" => crate::breeds::default_logic::DefaultLogic;
    /// SHOP2-style HTN planning (Nau et al. 2003)
    HtnPlanning = "htn_planning" => crate::breeds::htn_planning::HtnPlanning;
    /// Dempster–Shafer evidence combination (Shafer 1976)
    DempsterShafer = "dempster_shafer" => crate::breeds::dempster_shafer::DempsterShafer;
    /// Minsky frame inheritance (Minsky 1974)
    FramesInheritance = "frames_inheritance" => crate::breeds::frames_inheritance::FramesInheritance;
    /// Explanation-based learning (Mitchell et al. 1986)
    Ebl = "ebl" => crate::breeds::ebl::Ebl;
    /// ASP: Gelfond–Lifschitz stable-model semantics (Gelfond & Lifschitz 1988)
    Asp = "asp" => crate::breeds::asp::Asp;
    /// Description Logic: EL completion-rule classification (Baader, Brandt & Lutz 2005)
    DescriptionLogic = "description_logic" => crate::breeds::description_logic::DescriptionLogic;
    /// Abductive Logic Programming (Kakas, Kowalski & Toni 1992)
    AbductiveLp = "abductive_lp" => crate::breeds::abductive_lp::AbductiveLp;
    /// Abduction as Inference to the Best Explanation (Harman 1965; Thagard 1978)
    AbductiveIbe = "abductive_ibe" => crate::breeds::abductive_ibe::AbductiveIbe;
    /// SNLP partial-order planning (McAllester & Rosenblitt 1991)
    PartialOrderPlan = "partial_order_plan" => crate::breeds::partial_order_plan::PartialOrderPlan;
    /// Event Calculus (Kowalski & Sergot 1986)
    EventCalculus = "event_calculus" => crate::breeds::event_calculus::EventCalculus;
    /// MDP value iteration (Bellman 1957)
    Mdp = "mdp" => crate::breeds::mdp::Mdp;
    /// Version-space candidate elimination (Mitchell 1982)
    VersionSpace = "version_space" => crate::breeds::version_space::VersionSpace;
    /// Belief merging — Σ / GMax distance-based operators (Konieczny & Pino Pérez 2002)
    BeliefMerging = "belief_merging" => crate::breeds::belief_merging::BeliefMerging;
    /// Qualitative reasoning — confluences (de Kleer & Brown 1984)
    QualitativeReason = "qualitative_reason" => crate::breeds::qualitative_reason::QualitativeReason;
    /// SAM script application (Schank & Abelson 1977)
    ScriptSam = "script_sam" => crate::breeds::script_sam::ScriptSam;
    /// Constraint Logic Programming over finite domains (Jaffar & Lassez 1987)
    Clp = "clp" => crate::breeds::clp::Clp;
    /// Situation calculus with successor-state axioms (Reiter 1991)
    SituationCalculus = "situation_calculus" => crate::breeds::situation_calculus::SituationCalculus;
    /// Circumscription: minimal-model nonmonotonic entailment (McCarthy 1980)
    Circumscription = "circumscription" => crate::breeds::circumscription::Circumscription;
    /// SME: structure-mapping analogy engine (Falkenhainer, Forbus & Gentner 1989)
    AnalogySme = "analogy_sme" => crate::breeds::analogy_sme::AnalogySme;
    /// ACT-R production cycle with activation-based retrieval (Anderson & Lebiere 1998)
    ActR = "act_r" => crate::breeds::act_r::ActR;
    /// ProbLog: exact possible-worlds probabilistic Horn logic (De Raedt et al. 2007)
    Problog = "problog" => crate::breeds::problog::Problog;
    /// CDCL SAT with 1-UIP clause learning (Marques-Silva & Sakallah 1999)
    SatCdcl = "sat_cdcl" => crate::breeds::sat_cdcl::SatCdcl;
    /// Episodic memory with temporal-proximity recall (Tulving 1983; Nuxoll & Laird 2007)
    EpisodicMemory = "episodic_memory" => crate::breeds::episodic_memory::EpisodicMemory;
    /// Tabular Q-learning over a symbolic MDP (Watkins & Dayan 1992)
    RlSymbolic = "rl_symbolic" => crate::breeds::rl_symbolic::RlSymbolic;
    /// CTL model checking by fixed-point labeling (Clarke, Emerson & Sistla 1986)
    CtlCheck = "ctl_check" => crate::breeds::ctl_check::CtlCheck;
    /// FOIL inductive logic programming (Quinlan 1990)
    Ilp = "ilp" => crate::breeds::ilp::Ilp;
    /// Naive physics axiom saturation (Hayes 1979/1985)
    NaivePhysics = "naive_physics" => crate::breeds::naive_physics::NaivePhysics;
    /// Tableaux: Smullyan signed analytic tableaux for propositional validity (Smullyan 1968)
    Tableaux = "tableaux" => crate::breeds::tableaux::Tableaux;
    /// Construction Grammar: Goldberg argument-structure constructions (Goldberg 1995)
    ConstructionGrammar = "construction_grammar" => crate::breeds::construction_grammar::ConstructionGrammar;
    /// Markov Logic: propositional MLN MAP inference via MaxWalkSAT (Richardson & Domingos 2006)
    MarkovLogic = "markov_logic" => crate::breeds::markov_logic::MarkovLogic;
    /// POMDP: exact Bayes belief update + bounded PBVI (Kaelbling, Littman & Cassandra 1998)
    Pomdp = "pomdp" => crate::breeds::pomdp::Pomdp;
    /// Contingent Planning: AND-OR search over belief states with sensing (Russell & Norvig, AIMA §4.3.2)
    ContingentPlan = "contingent_plan" => crate::breeds::contingent_plan::ContingentPlan;
    /// Meta-Reasoning: cross-breed conflict detection + confidence-weighted vote (Cox & Raja 2011)
    MetaReasoning = "meta_reasoning" => crate::breeds::meta_reasoning::MetaReasoning;
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

impl BreedOutput {
    /// Standard-shape constructor: fills the fields every breed sets the
    /// same way (`candidates` passed through from input, no OCEL log yet,
    /// no retained cases). Breeds that mutate candidates or retain a case
    /// set those `pub` fields after construction.
    pub fn from_parts(
        breed: BreedId,
        input: &BreedInput,
        facts: Vec<Fact>,
        selected: Option<String>,
        explanation: String,
        inference_trace: Vec<TraceStep>,
    ) -> Self {
        Self {
            breed,
            candidates: input.candidates.clone(),
            facts,
            selected,
            explanation,
            inference_trace,
            ocel_log: None,
            retained_cases: vec![],
        }
    }
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

/// Structured error type for breed failures.
///
/// Use `CognitionError` in new breeds. `BreedError` remains as a type alias
/// for backward compatibility with the 52 existing breed implementations.
#[derive(Debug, Clone, thiserror::Error, serde::Serialize, serde::Deserialize)]
pub enum CognitionError {
    /// A required input fact or field was absent.
    #[error("{breed}: missing required input — {field}")]
    MissingInput {
        /// Breed name.
        breed: &'static str,
        /// Missing field or fact key.
        field: &'static str,
    },
    /// Precondition check rejected the input before execution.
    #[error("{breed}: precondition — {reason}")]
    PreconditionFailed {
        /// Breed name.
        breed: &'static str,
        /// Human-readable reason.
        reason: String,
    },
    /// Postcondition invariant was violated by the output.
    #[error("{breed}: postcondition violated — {invariant}")]
    PostconditionViolated {
        /// Breed name.
        breed: &'static str,
        /// Invariant name or description.
        invariant: &'static str,
    },
    /// Complexity cap exceeded (refusal, not truncation).
    #[error("{breed}: complexity cap — {detail}")]
    ComplexityCap {
        /// Breed name.
        breed: &'static str,
        /// Detail message.
        detail: String,
    },
    /// Breed string was not recognized.
    #[error("unsupported breed: {0}")]
    Unsupported(String),
}

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

    /// Human-readable capability list. Default: `[breed_id_string]`.
    /// Override when the breed exposes multiple named capabilities.
    fn capabilities(&self) -> Vec<String> {
        vec![format!("{}", self.id())]
    }

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

    /// Construct a `BreedError` tagged with this breed's id. Replaces the
    /// hand-rolled local `err` closure pattern. Takes `String` (not
    /// `impl Into<String>`) to keep the trait dyn-compatible.
    fn error(&self, message: String) -> BreedError {
        BreedError {
            breed: self.id(),
            message,
        }
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
    pub const ALL: [BreedId; 52] = [
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
        BreedId::Tableaux,
        BreedId::ConstructionGrammar,
        BreedId::MarkovLogic,
        BreedId::Pomdp,
        BreedId::ContingentPlan,
        BreedId::MetaReasoning,
    ];
}


#[cfg(test)]
mod registration_tests {
    use super::*;

    /// Every admitted breed must be a registered macro entry; the macro may
    /// temporarily register more breeds than are admitted (pre-admission
    /// window), never fewer.
    #[test]
    fn all_is_subset_of_macro_registration() {
        assert!(
            BreedId::ALL.len() <= BreedId::REGISTERED_COUNT,
            "ALL has {} entries but the breeds! macro registers only {} — \
             an admitted breed is missing its macro entry",
            BreedId::ALL.len(),
            BreedId::REGISTERED_COUNT
        );
    }

    /// Display ↔ from_str_id round-trip, and the breed_instance table routes
    /// each id to an instance reporting the same id (catches a mis-paired
    /// `Variant = "id" => path` macro entry).
    #[test]
    fn macro_surfaces_are_mutually_consistent() {
        for id in BreedId::ALL {
            let s = id.to_string();
            assert_eq!(
                BreedId::from_str_id(&s),
                Some(id),
                "from_str_id does not round-trip Display for {}",
                s
            );
            assert_eq!(
                breed_instance(id).id(),
                id,
                "breed_instance table routes {} to a breed reporting a different id",
                s
            );
        }
    }
}
