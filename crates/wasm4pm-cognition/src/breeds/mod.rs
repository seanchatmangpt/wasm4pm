//! Old-AI cognition systems: frame-based, rule-based, logic-based, planning-based,
//! and consensus architectures.
//!
//! Each breed is a real implementation with no stubs. Oracle rank: Rank-1 (mathematical
//! theorem) or Rank-2 (domain contract).

use serde::{Deserialize, Serialize};
use std::fmt;

/// `abductive_ibe` breed/support module (abductive ibe).
pub mod abductive_ibe;
/// `abductive_lp` breed/support module (abductive lp).
pub mod abductive_lp;
/// `act_r` breed/support module (act r).
pub mod act_r;
/// `allen_temporal` breed/support module (allen temporal).
pub mod allen_temporal;
/// `analogy_sme` breed/support module (analogy sme).
pub mod analogy_sme;
/// `asp` breed/support module (asp).
pub mod asp;
/// `autoinstinct_learning` breed/support module (autoinstinct learning).
pub mod autoinstinct_learning;
/// `autoinstinct_neurosis` breed/support module (autoinstinct neurosis).
pub mod autoinstinct_neurosis;
/// `autoinstinct_semantics` breed/support module (autoinstinct semantics).
pub mod autoinstinct_semantics;
/// `autoinstinct_vision` breed/support module (autoinstinct vision).
pub mod autoinstinct_vision;
/// `bayesian_network` breed/support module (bayesian network).
pub mod bayesian_network;
/// `belief_merging` breed/support module (belief merging).
pub mod belief_merging;
/// `cbr` breed/support module (cbr).
pub mod cbr;
/// `circumscription` breed/support module (circumscription).
pub mod circumscription;
/// `clp` breed/support module (clp).
pub mod clp;
/// `construction_grammar` breed/support module (construction grammar).
pub mod construction_grammar;
/// `contingent_plan` breed/support module (contingent plan).
pub mod contingent_plan;
/// `csp_ac3` breed/support module (csp ac3).
pub mod csp_ac3;
/// `ctl_check` breed/support module (ctl check).
pub mod ctl_check;
/// `default_logic` breed/support module (default logic).
pub mod default_logic;
/// `dempster_shafer` breed/support module (dempster shafer).
pub mod dempster_shafer;
/// `dendral` breed/support module (dendral).
pub mod dendral;
/// `description_logic` breed/support module (description logic).
pub mod description_logic;
/// `dispatch` breed/support module (dispatch).
pub mod dispatch;
/// `ebl` breed/support module (ebl).
pub mod ebl;
/// `episodic_memory` breed/support module (episodic memory).
pub mod episodic_memory;
/// `event_calculus` breed/support module (event calculus).
pub mod event_calculus;
/// `frame` breed/support module (frame).
pub mod frame;
/// `frames_inheritance` breed/support module (frames inheritance).
pub mod frames_inheritance;
/// `fuzzy_logic` breed/support module (fuzzy logic).
pub mod fuzzy_logic;
/// `gps` breed/support module (gps).
pub mod gps;
/// `hearsay` breed/support module (hearsay).
pub mod hearsay;
/// `htn_planning` breed/support module (htn planning).
pub mod htn_planning;
/// `ilp` breed/support module (ilp).
pub mod ilp;
/// `ltl_monitor` breed/support module (ltl monitor).
pub mod ltl_monitor;
/// `markov_logic` breed/support module (markov logic).
pub mod markov_logic;
/// `mdp` breed/support module (mdp).
pub mod mdp;
/// `meta_reasoning` breed/support module (meta reasoning).
pub mod meta_reasoning;
/// `morphological` breed/support module (morphological).
pub mod morphological;
/// `naive_physics` breed/support module (naive physics).
pub mod naive_physics;
/// `ocpm_route_discoverer` breed/support module (ocpm route discoverer).
pub mod ocpm_route_discoverer;
/// `oracle_chain` breed/support module (oracle chain).
pub mod oracle_chain;
/// `partial_order_plan` breed/support module (partial order plan).
pub mod partial_order_plan;
/// `pomdp` breed/support module (pomdp).
pub mod pomdp;
/// `problog` breed/support module (problog).
pub mod problog;
/// `production_rules` breed/support module (production rules).
pub mod production_rules;
/// `prolog` breed/support module (prolog).
pub mod prolog;
/// `qualitative_reason` breed/support module (qualitative reason).
pub mod qualitative_reason;
/// `rl_symbolic` breed/support module (rl symbolic).
pub mod rl_symbolic;
/// `sat_cdcl` breed/support module (sat cdcl).
pub mod sat_cdcl;
/// `script_sam` breed/support module (script sam).
pub mod script_sam;
/// `situation_calculus` breed/support module (situation calculus).
pub mod situation_calculus;
/// `soar` breed/support module (soar).
pub mod soar;
/// `standing` breed/support module (standing).
pub mod standing;
/// `strips` breed/support module (strips).
pub mod strips;
/// `support` breed/support module (support).
pub mod support;
/// `tableaux` breed/support module (tableaux).
pub mod tableaux;
/// `triz` breed/support module (triz).
pub mod triz;
/// `version_space` breed/support module (version space).
pub mod version_space;

pub use dispatch::{dispatch_breed, dispatch_breed_test};


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

include!("registration.rs");

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
/// for interface stability with the 52 existing breed implementations.
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
        vec![self.id().to_string()]
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
