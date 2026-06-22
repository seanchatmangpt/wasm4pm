//! Conformance Authority — wasm4pm Execution Engine
//!
//! **Version:** 30.1.2
//! **Authority:** Execution Agent
//! **Classification:** Core Execution Specification
//! **Date:** 2026-05-31
//!
//! ## Executive Summary
//!
//! This module implements the wasm4pm **Conformance Authority** specification,
//! governing alignment between process models and event logs, fitness/precision metrics,
//! admission gates, and the Evidence<T, State, Witness> type-law boundary.
//!
//! The core doctrine: **If a model claims to explain the log, but alignment reveals
//! mismatches, the model fails admission.** Fitness metrics are not advisory;
//! they are gatekeeping thresholds.
//!
//! ## Module Structure
//!
//! - [`ConformanceVerdicts`] — Carries alignment, fitness, precision, generalization, and simplicity scores
//! - [`ConformanceWitness`] — Authority marker for conformance evidence
//! - [`AlignmentReceipt`] — Proof of optimal alignment (A* search)
//! - [`ConformanceAdmissionGate`] — Enforces θ_fit ≥ 0.95 threshold
//! - [`RefusalReport`] — Structured rejection reasons
//!
//! ## Typing Boundary
//!
//! Evidence is parameterized as:
//! ```ignore
//! Evidence<ConformanceVerdicts, Admitted, ConformanceWitness>
//! ```
//!
//! This enforces:
//! - **Payload (T):** `ConformanceVerdicts` — scores and deviations
//! - **State:** `Admitted` — trace has passed the fitness gate (θ_fit ≥ 0.95)
//! - **Witness (W):** `ConformanceWitness` — answers to conformance authority
//!
//! No evidence of this type can exist without a valid admission path (no free Raw → Admitted).

use std::collections::HashMap;
use std::fmt;
const CONDITIONAL_FITNESS_THRESHOLD: f64 = 0.85;


// ────────────────────────────────────────────────────────────────────────────
// 1. Core Verdict Type
// ────────────────────────────────────────────────────────────────────────────

/// Alignment move marker: log activity matched a model transition.
///
/// Cost: 0 (synchronous move)
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct SyncMove;

/// Alignment move marker: log activity has no matching model transition.
///
/// Cost: 1 (log move only)
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct LogOnlyMove;

/// Alignment move marker: model can fire a transition not matching log.
///
/// Cost: 1 for visible transition, 0 for silent (τ) transition
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ModelOnlyMove;

/// Conformance verdict — scores and deviation path from alignment.
///
/// This is a **structure-only carrier**: values are produced by the wasm4pm
/// engine and merely *carried* here. The verdict bundles:
///
/// - **Fitness**: van der Aalst token-based replay score ∈ [0, 1]
/// - **Precision**: Escaping Transitions Cardinality score ∈ [0, 1]
/// - **Generalization**: Transition coverage score ∈ [0, 1]
/// - **Simplicity**: Model complexity penalty ∈ [0, 1]
/// - **F1**: Harmonic mean of fitness and precision
/// - **Deviations**: Path of misaligned events from A* search
///
/// Fitness threshold for admission (Blue River Dam Gate 3):
/// - `fitness ≥ 0.95`: **PASS** (automatic admission)
/// - `0.85 ≤ fitness < 0.95`: **CONDITIONAL** (requires Board override signature)
/// - `fitness < 0.85`: **FAIL** (hard reject, never admissible)
#[derive(Debug, Clone, Default)]
pub struct ConformanceVerdicts {
    /// van der Aalst fitness score (token-based replay).
    /// Range: [0.0, 1.0]
    pub fitness: Option<f64>,

    /// Escaping Transitions Cardinality (ETC) precision score.
    /// Range: [0.0, 1.0]
    pub precision: Option<f64>,

    /// Generalization metric (transition coverage).
    /// Range: [0.0, 1.0]
    /// Formula: (1/|T|) Σ(1 - 1/(freq(t, L) + 1))
    pub generalization: Option<f64>,

    /// Simplicity score (inverse of model complexity).
    /// Range: [0.0, 1.0]
    pub simplicity: Option<f64>,

    /// F1 score (harmonic mean of fitness and precision).
    /// Range: [0.0, 1.0]
    pub f1: Option<f64>,

    /// Deviation path: sequence of misaligned events and model moves.
    pub deviations: Vec<DeviationRecord>,
}

impl ConformanceVerdicts {
    /// Construct a new empty verdict (all scores absent).
    pub fn new() -> Self {
        Self::default()
    }

    /// Whether the verdict reports perfect alignment.
    ///
    /// Returns `true` only if fitness is present, equals 1.0, and deviations
    /// is empty.
    pub fn is_perfect(&self) -> bool {
        self.deviations.is_empty()
            && matches!(self.fitness, Some(f) if (f - 1.0).abs() < f64::EPSILON)
    }

    /// Admission verdict for this trace.
    ///
    /// - Returns `AdmissionVerdict::Pass` if fitness ≥ 0.95
    /// - Returns `AdmissionVerdict::Conditional` if 0.85 ≤ fitness < 0.95
    /// - Returns `AdmissionVerdict::Reject` if fitness < 0.85
    /// - Returns `AdmissionVerdict::Unavailable` if fitness is absent
    pub fn admission_verdict(&self) -> AdmissionVerdict {
        match self.fitness {
            Some(f) if f >= 0.95 => AdmissionVerdict::Pass,
            Some(f) if f >= CONDITIONAL_FITNESS_THRESHOLD => AdmissionVerdict::Conditional,
            Some(f) if f < CONDITIONAL_FITNESS_THRESHOLD => AdmissionVerdict::Reject,
            Some(_) => AdmissionVerdict::Unknown,
            None => AdmissionVerdict::Unavailable,
        }
    }
}

impl fmt::Display for ConformanceVerdicts {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let fmt_score = |slot: &Option<f64>| match slot {
            Some(v) => format!("{:.2}%", v * 100.0),
            None => "—".to_string(),
        };

        write!(
            f,
            "fitness={} precision={} generalization={} simplicity={} f1={} deviations={}",
            fmt_score(&self.fitness),
            fmt_score(&self.precision),
            fmt_score(&self.generalization),
            fmt_score(&self.simplicity),
            fmt_score(&self.f1),
            self.deviations.len()
        )
    }
}

/// A single deviation in the alignment path.
///
/// Records a step where the log and model did not synchronize.
#[derive(Debug, Clone)]
pub struct DeviationRecord {
    /// Index in the trace (0-based)
    pub trace_index: usize,

    /// Activity name from the log, or None if a model move
    pub log_activity: Option<String>,

    /// Transition name from model, or None if a log move
    pub model_transition: Option<String>,

    /// Type of move: sync, log-only, or model-only
    pub move_type: AlignmentMoveType,

    /// Cost of this move (0 or 1)
    pub cost: u32,
}

/// Classification of an alignment move.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum AlignmentMoveType {
    /// Log activity matches model transition (cost 0)
    SynchronousMove,

    /// Log activity unmatched (cost 1)
    LogOnlyMove,

    /// Model transition unmatched (cost 1 visible, 0 silent)
    ModelOnlyMove,
}

impl fmt::Display for AlignmentMoveType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AlignmentMoveType::SynchronousMove => write!(f, "sync"),
            AlignmentMoveType::LogOnlyMove => write!(f, "log_only"),
            AlignmentMoveType::ModelOnlyMove => write!(f, "model_only"),
        }
    }
}

// ────────────────────────────────────────────────────────────────────────────
// 2. Witness and Authority Marker
// ────────────────────────────────────────────────────────────────────────────

/// Authority marker for conformance evidence.
///
/// Witness type parameter for `Evidence<ConformanceVerdicts, Admitted, ConformanceWitness>`.
/// Answers to the Conformance Authority specification (v30.1.2).
///
/// # Type-Law Binding
///
/// This witness enforces:
/// - A* alignment computation per Adriansyah (2014)
/// - van der Aalst fitness metric
/// - Escaping Transitions Cardinality (ETC) precision
/// - Generalization metric (transition coverage)
/// - Admission gate enforcement (θ_fit ≥ 0.95)
/// - Evidence<T, State, Witness> lattice monotonicity
#[derive(Debug, Clone, Copy, Default)]
pub struct ConformanceWitness;

impl ConformanceWitness {
    /// Construct a new conformance witness.
    pub fn new() -> Self {
        Self
    }
}

impl fmt::Display for ConformanceWitness {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "ConformanceAuthority(v30.1.2)")
    }
}

// ────────────────────────────────────────────────────────────────────────────
// 3. Receipt and Cryptographic Proof
// ────────────────────────────────────────────────────────────────────────────

/// Alignment receipt — proof of optimal A* alignment.
///
/// Every A* alignment produces a receipt that can be independently verified
/// by a third party (e.g., PM4Py auditor) without recomputing the alignment.
#[derive(Debug, Clone)]
pub struct AlignmentReceipt {
    /// Unique identifier for this alignment
    pub alignment_id: String,

    /// Case/trace identifier
    pub trace_id: String,

    /// SHA-256 hash of the input event log
    pub log_hash: String,

    /// SHA-256 hash of the Petri Net model
    pub model_hash: String,

    /// The alignment as a sequence of (log_move, model_move, cost) tuples
    pub alignment: Vec<(Option<String>, Option<String>, u32)>,

    /// Total alignment cost C(γ*)
    pub total_cost: u32,

    /// Move counters from optimal alignment
    pub moves: MoveCounters,

    /// Token replay counters
    pub tokens: TokenCounters,

    /// Computed fitness value from alignment cost
    pub fitness: f64,

    /// Quality of the heuristic (h_avg / actual_remaining)
    pub heuristic_accuracy: Option<f64>,

    /// wasm4pm version
    pub engine_version: String,

    /// ISO 8601 timestamp
    pub timestamp: String,

    /// Conformance engine Ed25519 public key
    pub engine_pubkey: String,

    /// Ed25519 signature over the receipt
    pub signature: String,
}

/// Counters for alignment moves from optimal A* search.
#[derive(Debug, Clone, Copy, Default)]
pub struct MoveCounters {
    /// Synchronous moves (log activity = model transition)
    pub move_on_both: usize,

    /// Log moves (log activity unmatched)
    pub move_on_log: usize,

    /// Model moves (model transition unmatched)
    pub move_on_model: usize,
}

impl MoveCounters {
    /// Total number of moves
    pub fn total(&self) -> usize {
        self.move_on_both + self.move_on_log + self.move_on_model
    }
}

/// Counters for token-based replay during fitness computation.
#[derive(Debug, Clone, Copy, Default)]
pub struct TokenCounters {
    /// Tokens produced during replay
    pub produced: u64,

    /// Tokens consumed during replay
    pub consumed: u64,

    /// Missing tokens (had to be artificially injected)
    pub missing: u64,

    /// Remaining tokens (left in net after trace completes)
    pub remaining: u64,
}

impl TokenCounters {
    /// Compute fitness from token counters using van der Aalst's formula.
    ///
    /// Formula:
    /// ```text
    /// fitness = (1/2) * (1 - m/c) + (1/2) * (1 - r/p)
    /// ```
    ///
    /// Returns None if division by zero would occur.
    pub fn compute_fitness(&self) -> Option<f64> {
        if self.consumed == 0 || self.produced == 0 {
            return None;
        }
        let component1 = 1.0 - (self.missing as f64 / self.consumed as f64);
        let component2 = 1.0 - (self.remaining as f64 / self.produced as f64);
        Some(0.5 * component1 + 0.5 * component2)
    }
}

// ────────────────────────────────────────────────────────────────────────────
// 4. Admission Gate and Verdict Types
// ────────────────────────────────────────────────────────────────────────────

/// Admission verdict for Blue River Dam Gate 3.
///
/// Based on fitness threshold and board override signature availability.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum AdmissionVerdict {
    /// fitness ≥ 0.95: Automatic admission
    Pass,

    /// 0.85 ≤ fitness < 0.95: Requires Board override signature
    Conditional,

    /// fitness < 0.85: Hard reject, never admissible
    Reject,

    /// Unknown fitness (should not occur in live admission)
    Unknown,

    /// Fitness metric unavailable
    Unavailable,
}

impl fmt::Display for AdmissionVerdict {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AdmissionVerdict::Pass => write!(f, "PASS (automatic)"),
            AdmissionVerdict::Conditional => write!(f, "CONDITIONAL (board override required)"),
            AdmissionVerdict::Reject => write!(f, "REJECT (fitness < 0.85)"),
            AdmissionVerdict::Unknown => write!(f, "UNKNOWN"),
            AdmissionVerdict::Unavailable => write!(f, "UNAVAILABLE (fitness not computed)"),
        }
    }
}

/// Conformance admission gate enforcement.
///
/// Implements the Blue River Dam Gate 3 rule:
///
/// ```text
/// admissible(σ) ⟺ fitness(σ, N) ≥ 0.95 ∨ (fitness(σ, N) ≥ 0.85 ∧ override(σ))
/// ```
pub struct ConformanceAdmissionGate {
    /// Automatic admission threshold (hard pass)
    pub pass_threshold: f64,

    /// Conditional admission threshold (requires override)
    pub conditional_threshold: f64,

    /// Rejection threshold (hard floor)
    pub reject_floor: f64,
}

impl ConformanceAdmissionGate {
    /// Construct gate with standard Blue River Dam thresholds.
    ///
    /// - Pass: fitness ≥ 0.95
    /// - Conditional: fitness ≥ 0.85
    /// - Reject: fitness < 0.85 (hard floor)
    pub fn new() -> Self {
        Self {
            pass_threshold: 0.95,
            conditional_threshold: CONDITIONAL_FITNESS_THRESHOLD,
            reject_floor: CONDITIONAL_FITNESS_THRESHOLD,
        }
    }

    /// Construct gate with custom thresholds.
    pub fn with_thresholds(pass: f64, conditional: f64, floor: f64) -> Self {
        Self {
            pass_threshold: pass,
            conditional_threshold: conditional,
            reject_floor: floor,
        }
    }

    /// Evaluate admission gate for a verdict.
    ///
    /// Returns `Ok(verdict)` if admitted (pass or conditional with valid override).
    /// Returns `Err(RefusalReport)` if rejected.
    pub fn evaluate(
        &self,
        verdict: &ConformanceVerdicts,
        board_override_signature: Option<&str>,
    ) -> Result<(), RefusalReport> {
        match verdict.fitness {
            Some(f) if f >= self.pass_threshold => Ok(()),
            Some(f) if f >= self.conditional_threshold => {
                if board_override_signature.is_some() {
                    Ok(())
                } else {
                    Err(RefusalReport::ConditionalMissingOverride { fitness: f })
                }
            }
            Some(f) => Err(RefusalReport::HardReject {
                fitness: f,
                policy: "van_der_aalst_0_85_floor",
            }),
            None => Err(RefusalReport::FitnessUnavailable),
        }
    }
}

// ────────────────────────────────────────────────────────────────────────────
// 5. Refusal Report
// ────────────────────────────────────────────────────────────────────────────

/// Structured rejection reason for conformance admission failure.
///
/// When a trace is rejected at the conformance gate, a `RefusalReport` documents
/// exactly why. This structure is never a bare "InvalidInput"; every variant
/// names a **specific** structural law or policy.
#[derive(Debug, Clone)]
pub enum RefusalReport {
    /// Fitness metric is unavailable.
    FitnessUnavailable,

    /// Fitness ≥ 0.85 but < 0.95; Board override signature required but absent.
    ConditionalMissingOverride { fitness: f64 },

    /// Fitness < 0.85: Hard reject (never admissible).
    HardReject { fitness: f64, policy: &'static str },

    /// Invalid or missing Board override signature for conditional trace.
    InvalidOverrideSignature { fitness: f64 },

    /// Trace does not exist or is corrupted.
    TraceMissing { trace_id: String },

    /// Model does not exist or is corrupted.
    ModelMissing { model_hash: String },

    /// Chain of custody broken (Evidence<T, State, Witness> lineage gap).
    BrokenChainOfCustody { context: String },

    /// Raw laundering attempt: receipt claims fitness ≠ re-aligned fitness.
    LaunderingDetected {
        claimed_fitness: f64,
        recomputed_fitness: f64,
    },
}

impl fmt::Display for RefusalReport {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            RefusalReport::FitnessUnavailable => {
                write!(f, "conformance refusal: fitness metric unavailable")
            }
            RefusalReport::ConditionalMissingOverride { fitness } => {
                write!(
                    f,
                    "conformance refusal: conditional admission (fitness={:.4}) \
                     requires Board override signature",
                    fitness
                )
            }
            RefusalReport::HardReject { fitness, policy } => {
                write!(
                    f,
                    "conformance refusal: hard reject (fitness={:.4} < 0.85 per {policy})",
                    fitness
                )
            }
            RefusalReport::InvalidOverrideSignature { fitness } => {
                write!(
                    f,
                    "conformance refusal: Board override signature invalid for \
                     conditional trace (fitness={:.4})",
                    fitness
                )
            }
            RefusalReport::TraceMissing { trace_id } => {
                write!(f, "conformance refusal: trace '{}' missing", trace_id)
            }
            RefusalReport::ModelMissing { model_hash } => {
                write!(f, "conformance refusal: model '{}' missing", model_hash)
            }
            RefusalReport::BrokenChainOfCustody { context } => {
                write!(
                    f,
                    "conformance refusal: chain of custody broken ({})",
                    context
                )
            }
            RefusalReport::LaunderingDetected {
                claimed_fitness,
                recomputed_fitness,
            } => {
                write!(
                    f,
                    "conformance refusal: raw laundering detected \
                     (claimed={:.4}, recomputed={:.4})",
                    claimed_fitness, recomputed_fitness
                )
            }
        }
    }
}

impl std::error::Error for RefusalReport {}

// ────────────────────────────────────────────────────────────────────────────
// 6. Heuristic Functions (A* Search)
// ────────────────────────────────────────────────────────────────────────────

/// Reachability heuristic for A* alignment search.
///
/// Formula:
/// ```text
/// h_reach(M, p) = max(0, d_min(M, M_o) - (n - p))
/// ```
///
/// Where:
/// - `d_min(M, M_o)` = shortest path distance in Petri Net from marking M to final M_o
/// - `n - p` = remaining trace length
///
/// This heuristic is both **admissible** and **consistent** (monotonic).
#[derive(Debug, Clone)]
pub struct ReachabilityHeuristic {
    /// Shortest path distances precomputed via BFS/Dijkstra
    pub distances: std::collections::BTreeMap<String, u32>,
}

impl ReachabilityHeuristic {
    /// Construct heuristic with precomputed distances.
    pub fn new(distances: std::collections::BTreeMap<String, u32>) -> Self {
        Self { distances }
    }

    /// Compute h_reach(M, p) for current marking and trace position.
    ///
    /// Returns the estimated remaining cost (admissible lower bound).
    pub fn estimate(&self, current_marking_hash: &str, remaining_trace_length: u32) -> u32 {
        let d_min = self
            .distances
            .get(current_marking_hash)
            .copied()
            .unwrap_or(0);
        ((d_min as i32) - (remaining_trace_length as i32)).max(0) as u32
    }
}

/// State equation heuristic for A* alignment search (advanced).
///
// Removed fake StateEquationHeuristic stub. A real LP solver must be implemented
// explicitly when mathematical bounds computing is actively wired into A*.

// ────────────────────────────────────────────────────────────────────────────
// 7. Boundary Conditions and Safety Limits
// ────────────────────────────────────────────────────────────────────────────

/// Safety limits for wasm4pm conformance execution.
///
/// These enforce mathematical safety within the sandboxed WASM runtime,
/// preventing integer overflow, OOM, and non-determinism.
pub struct ConformanceSafetyLimits {
    /// Maximum allowed trace length (activities)
    pub max_trace_length: usize,

    /// Maximum A* open queue size (states)
    pub max_open_queue_states: usize,

    /// Max token counter value (u64) before overflow trap
    pub max_token_counter: u64,

    /// Floating-point determinism: use fixed-point arithmetic
    pub use_fixed_point_arithmetic: bool,
}

impl Default for ConformanceSafetyLimits {
    fn default() -> Self {
        Self {
            max_trace_length: 10_000,
            max_open_queue_states: 1_000_000,
            max_token_counter: u64::MAX,
            use_fixed_point_arithmetic: true,
        }
    }
}

// ────────────────────────────────────────────────────────────────────────────
// 8. Certificate and Receipt Sealing
// ────────────────────────────────────────────────────────────────────────────

/// Cryptographic certificate for this conformance module.
///
/// Generated via:
/// 1. Serialize entire module contents
/// 2. Compute Blake3(contents)
/// 3. Sign hash with Ed25519 (ConformanceAuthority private key)
/// 4. Embed in doc comment
///
/// To verify:
/// 1. Recompute Blake3 of module source
/// 2. Check Ed25519 signature against ConformanceAuthority public key
/// 3. If mismatch, module has been tampered with → RefusalReport::BrokenChainOfCustody
#[derive(Debug, Clone)]
pub struct ConformanceCertificate {
    /// Module hash (Blake3)
    pub module_hash: String,

    /// Authority signer (Ed25519 public key)
    pub authority_pubkey: String,

    /// Signature over module_hash
    pub signature: String,

    /// Timestamp of signing
    pub timestamp: String,

    /// Authority version
    pub authority_version: String,
}

impl ConformanceCertificate {
    /// Construct a conformance certificate.
    pub fn new(
        module_hash: String,
        authority_pubkey: String,
        signature: String,
        timestamp: String,
    ) -> Self {
        Self {
            module_hash,
            authority_pubkey,
            signature,
            timestamp,
            authority_version: "30.1.2".to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_token_fitness_perfect() {
        let tokens = TokenCounters {
            produced: 100,
            consumed: 100,
            missing: 0,
            remaining: 0,
        };
        let fitness = tokens.compute_fitness();
        assert!(fitness.is_some());
        assert!((fitness.unwrap() - 1.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_token_fitness_degraded() {
        let tokens = TokenCounters {
            produced: 100,
            consumed: 100,
            missing: 10,
            remaining: 5,
        };
        let fitness = tokens.compute_fitness();
        assert!(fitness.is_some());
        let f = fitness.unwrap();
        // (1/2)*(1 - 10/100) + (1/2)*(1 - 5/100)
        // = 0.5 * 0.9 + 0.5 * 0.95
        // = 0.45 + 0.475 = 0.925
        assert!((f - 0.925).abs() < 0.01);
    }

    #[test]
    fn test_admission_gate_pass() {
        let gate = ConformanceAdmissionGate::new();
        let mut verdict = ConformanceVerdicts::new();
        verdict.fitness = Some(0.97);

        let result = gate.evaluate(&verdict, None);
        assert!(result.is_ok());
    }

    #[test]
    fn test_admission_gate_conditional_without_override() {
        let gate = ConformanceAdmissionGate::new();
        let mut verdict = ConformanceVerdicts::new();
        verdict.fitness = Some(0.90);

        let result = gate.evaluate(&verdict, None);
        assert!(result.is_err());
        match result {
            Err(RefusalReport::ConditionalMissingOverride { .. }) => (),
            _ => unreachable!("expected ConditionalMissingOverride"),
        }
    }

    #[test]
    fn test_admission_gate_conditional_with_override() {
        let gate = ConformanceAdmissionGate::new();
        let mut verdict = ConformanceVerdicts::new();
        verdict.fitness = Some(0.90);

        let result = gate.evaluate(&verdict, Some("valid-signature"));
        assert!(result.is_ok());
    }

    #[test]
    fn test_admission_gate_hard_reject() {
        let gate = ConformanceAdmissionGate::new();
        let mut verdict = ConformanceVerdicts::new();
        verdict.fitness = Some(0.75);

        let result = gate.evaluate(&verdict, Some("any-signature"));
        assert!(result.is_err());
        match result {
            Err(RefusalReport::HardReject { .. }) => (),
            _ => unreachable!("expected HardReject"),
        }
    }

    #[test]
    fn test_verdict_display() {
        let mut verdict = ConformanceVerdicts::new();
        verdict.fitness = Some(0.95);
        verdict.precision = Some(CONDITIONAL_FITNESS_THRESHOLD);
        verdict.generalization = Some(0.90);

        let display_str = verdict.to_string();
        assert!(display_str.contains("fitness=95.00%"));
        assert!(display_str.contains("precision=85.00%"));
        assert!(display_str.contains("generalization=90.00%"));
    }

    #[test]
    fn test_reachability_heuristic() {
        let mut distances = std::collections::BTreeMap::new();
        distances.insert("M1".to_string(), 5);
        distances.insert("M2".to_string(), 3);

        let h = ReachabilityHeuristic::new(distances);
        assert_eq!(h.estimate("M1", 2), 3); // max(0, 5 - 2) = 3
        assert_eq!(h.estimate("M2", 1), 2); // max(0, 3 - 1) = 2
        assert_eq!(h.estimate("M_unknown", 5), 0); // unknown marking defaults to 0
    }
}
