//! Autonomic bridge: connects RL health/SPC/circuit state to breed selection.
//!
//! The cognition registry holds 9 real breed implementations (each a dispatched
//! algorithm, no stubs). This module maps the RL orchestrator's health, SPC, and
//! circuit-breaker state onto a [`DegradationMode`] and the set of breeds that
//! should be dispatched, and computes RL reward signals from breed outputs
//! (including FM-5 fraud detection on empty inference traces).

use crate::breeds::{BreedId, BreedInput, BreedOutput, Fact};
use crate::degradation::{
    breeds_for_mode, mode_rationale, select_degradation_mode, DegradationTrigger,
};

// Re-export so callers using the autonomic bridge can name the mode directly.
pub use crate::degradation::DegradationMode;

/// RL/autonomic system state injected into breed selection.
#[derive(Debug, Clone)]
pub struct AutonomicContext {
    /// Current RL health level (0 = normal … 4 = failed).
    pub health_level: u8,
    /// SPC alert severity (0 = none … 3 = critical).
    pub spc_alert_level: u8,
    /// Circuit-breaker state (0 = closed, 1 = half-open, 2 = open).
    pub circuit_state: u8,
    /// Monotonic autonomic cycle counter.
    pub cycle_count: u64,
}

impl AutonomicContext {
    /// Construct a clamped context from raw RL signals.
    pub fn new(health: u8, spc: u8, circuit: u8, cycle: u64) -> Self {
        Self {
            health_level: health.min(4),
            spc_alert_level: spc.min(3),
            circuit_state: circuit.min(2),
            cycle_count: cycle,
        }
    }

    /// True when the circuit breaker is OPEN (state 2), blocking dispatch.
    pub fn circuit_blocked(&self) -> bool {
        self.circuit_state == 2
    }

    /// True when health is critical (level 3 or higher).
    pub fn is_critical(&self) -> bool {
        self.health_level >= 3
    }

    /// Render this context as a list of facts for breed input enrichment.
    pub fn to_facts(&self) -> Vec<Fact> {
        vec![
            Fact { key: "health_level".into(), value: self.health_level.to_string() },
            Fact { key: "spc_alert_level".into(), value: self.spc_alert_level.to_string() },
            Fact { key: "circuit_state".into(), value: self.circuit_state.to_string() },
            Fact { key: "cycle_count".into(), value: self.cycle_count.to_string() },
        ]
    }
}

impl Default for AutonomicContext {
    fn default() -> Self {
        Self::new(0, 0, 0, 0)
    }
}

/// RL reward signal produced by a breed's execution.
#[derive(Debug, Clone)]
pub struct BreedRewardSignal {
    /// Lowercase breed identifier (e.g. "dendral").
    pub breed_id: String,
    /// Base reward for producing a selection.
    pub base_reward: f32,
    /// Bonus scaled by the top candidate's confidence.
    pub confidence_bonus: f32,
    /// Bonus scaled by the number of eliminated candidates.
    pub elimination_bonus: f32,
    /// FM-5 fraud penalty (-2.0 when the inference trace is empty).
    pub fraud_penalty: f32,
    /// Net reward, clamped to [-2.0, 2.0].
    pub total_reward: f32,
}

/// Compute an RL reward signal for a breed output.
///
/// FM-5: an empty `inference_trace` incurs a -2.0 fraud penalty, because a
/// legitimate algorithm always records the steps it took.
pub fn compute_breed_reward(output: &BreedOutput) -> BreedRewardSignal {
    let base = if output.selected.is_some() { 0.3_f32 } else { 0.0_f32 };

    let top_score = output
        .candidates
        .iter()
        .map(|c| c.score)
        .fold(f32::NEG_INFINITY, f32::max);
    let confidence = if top_score.is_finite() && top_score > 0.0 {
        (top_score * 0.5).min(0.5)
    } else {
        0.0
    };

    let eliminated = output.candidates.iter().filter(|c| c.eliminated).count();
    let elim_bonus = (eliminated as f32 * 0.05_f32).min(0.3_f32);

    let fraud = if output.inference_trace.is_empty() { -2.0_f32 } else { 0.0_f32 };

    let total = (base + confidence + elim_bonus + fraud).clamp(-2.0, 2.0);

    BreedRewardSignal {
        breed_id: output.breed.to_string(),
        base_reward: base,
        confidence_bonus: confidence,
        elimination_bonus: elim_bonus,
        fraud_penalty: fraud,
        total_reward: total,
    }
}

/// Ordered set of breeds to dispatch, with the chosen degradation mode.
#[derive(Debug, Clone)]
pub struct DispatchPriority {
    /// Degradation mode selected for the current autonomic context.
    pub mode: DegradationMode,
    /// Breeds to dispatch, in priority order, for the selected mode.
    pub preferred_breeds: Vec<String>,
    /// Human-readable rationale for the selection.
    pub rationale: String,
}

/// Prioritize breeds based on autonomic context.
///
/// The registry holds 9 real breed implementations. Health, SPC, and circuit
/// state are mapped onto a degradation mode and the corresponding active breed
/// set:
/// - circuit OPEN → Emergency (eliza only)
/// - otherwise, health (bumped by SPC ≥ 2) selects the mode
pub fn prioritize_breeds(ctx: &AutonomicContext) -> DispatchPriority {
    // A blocked circuit forces Emergency regardless of health.
    let effective_health = if ctx.circuit_blocked() {
        ctx.health_level.max(4)
    } else {
        ctx.health_level
    };

    let trigger = DegradationTrigger {
        memory_pressure: false,
        response_time_exceeded: false,
        error_rate: 0.0,
        health_level: effective_health,
    };

    let base_mode = select_degradation_mode(&trigger);
    // Sustained SPC alerts tighten the mode to at least Minimal.
    let mode = if ctx.spc_alert_level >= 2 && base_mode < DegradationMode::Minimal {
        DegradationMode::Minimal
    } else {
        base_mode
    };

    DispatchPriority {
        mode,
        preferred_breeds: breeds_for_mode(mode),
        rationale: mode_rationale(&trigger, mode),
    }
}

/// Enrich a [`BreedInput`] with autonomic context facts.
pub fn enrich_input_with_context(mut input: BreedInput, ctx: &AutonomicContext) -> BreedInput {
    input.facts.extend(ctx.to_facts());
    input
}

/// Aggregate multiple reward signals into a single mean scalar.
pub fn aggregate_rewards(signals: &[BreedRewardSignal]) -> f32 {
    if signals.is_empty() {
        return 0.0;
    }
    let sum: f32 = signals.iter().map(|s| s.total_reward).sum();
    (sum / signals.len() as f32).clamp(-2.0, 2.0)
}

/// Convert a breed string name to a [`BreedId`] variant (case-insensitive).
///
/// All 9 implemented breeds are recognized; any other name returns `None`.
pub fn breed_id_from_str(s: &str) -> Option<BreedId> {
    match s.to_lowercase().as_str() {
        "eliza" => Some(BreedId::Eliza),
        "cbr" => Some(BreedId::Cbr),
        "dendral" => Some(BreedId::Dendral),
        "strips" => Some(BreedId::Strips),
        "prolog" => Some(BreedId::Prolog),
        "mycin" => Some(BreedId::Mycin),
        "gps" => Some(BreedId::Gps),
        "soar" => Some(BreedId::Soar),
        "hearsay" => Some(BreedId::Hearsay),
        _ => None,
    }
}
