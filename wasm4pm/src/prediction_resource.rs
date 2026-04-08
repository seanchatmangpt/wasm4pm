use serde::{Deserialize, Serialize};
/// Resource & Intervention Prediction — answers "What action should be taken?"
///
/// Consolidates queueing theory (M/M/1 delay estimation) and intervention
/// ranking (greedy UCB-like heuristic, UCB1 bandit selection) into
/// WASM-exported functions for JavaScript/TypeScript consumers.
///
/// Core algorithms adapted from `prediction_additions` (queue delay, greedy
/// ranking) with a new UCB1 multi-armed bandit for stateful intervention
/// selection.
use wasm_bindgen::prelude::*;

use crate::error::{codes, wasm_err};

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueueDelayResult {
    pub wait_time: f64,
    pub utilization: f64,
    pub is_stable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InterventionInput {
    pub name: String,
    pub utility: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RankedIntervention {
    pub name: String,
    pub score: f64,
    pub rank: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BanditArm {
    pub name: String,
    pub total_reward: f64,
    pub pull_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BanditState {
    pub arms: Vec<BanditArm>,
    pub total_pulls: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SelectionResult {
    pub selected: String,
    pub arm_index: usize,
    pub ucb_score: f64,
    pub mean_reward: f64,
    pub exploration_bonus: f64,
}

// ---------------------------------------------------------------------------
// 1. M/M/1 Queue Delay — core logic
// ---------------------------------------------------------------------------

/// Compute M/M/1 queue delay.  Returns `Err` for invalid inputs.
pub fn compute_queue_delay(
    arrival_rate: f64,
    service_rate: f64,
) -> Result<QueueDelayResult, String> {
    if service_rate <= 0.0 {
        return Err("service_rate must be > 0".into());
    }
    if arrival_rate < 0.0 {
        return Err("arrival_rate must be >= 0".into());
    }

    let utilization = arrival_rate / service_rate;
    let is_stable = utilization < 1.0;
    let wait_time = if is_stable {
        let mean_service_time = 1.0 / service_rate;
        mean_service_time / (1.0 - utilization)
    } else {
        f64::INFINITY
    };

    Ok(QueueDelayResult {
        wait_time,
        utilization,
        is_stable,
    })
}

// ---------------------------------------------------------------------------
// 2. Greedy Intervention Ranking — core logic
// ---------------------------------------------------------------------------

/// Rank interventions by a greedy UCB-like heuristic.
pub fn compute_ranked_interventions(
    interventions: &[InterventionInput],
    exploitation_weight: f64,
) -> Vec<RankedIntervention> {
    if interventions.is_empty() {
        return vec![];
    }

    let ew = exploitation_weight.clamp(0.0, 1.0);

    let mut scored: Vec<(String, f64)> = interventions
        .iter()
        .enumerate()
        .map(|(i, iv)| {
            let exploration_bonus = (1.0 / (i as f64 + 1.0).sqrt()).min(1.0);
            let score = ew * iv.utility + (1.0 - ew) * exploration_bonus;
            (iv.name.clone(), score)
        })
        .collect();

    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    scored
        .into_iter()
        .enumerate()
        .map(|(i, (name, score))| RankedIntervention {
            name,
            score,
            rank: i + 1,
        })
        .collect()
}

// ---------------------------------------------------------------------------
// 3. UCB1 Bandit Intervention Selection — core logic
// ---------------------------------------------------------------------------

/// Select an intervention using UCB1.  Returns `Err` if arms are empty.
pub fn compute_ucb1_selection(
    state: &BanditState,
    exploration_factor: f64,
) -> Result<SelectionResult, String> {
    if state.arms.is_empty() {
        return Err("Bandit must have at least one arm".into());
    }

    // Forced exploration: pick first arm with zero pulls
    for (i, arm) in state.arms.iter().enumerate() {
        if arm.pull_count == 0 {
            return Ok(SelectionResult {
                selected: arm.name.clone(),
                arm_index: i,
                ucb_score: f64::INFINITY,
                mean_reward: 0.0,
                exploration_bonus: f64::INFINITY,
            });
        }
    }

    // UCB1: argmax( mean_reward + c * sqrt(ln(total_pulls) / pull_count) )
    let ln_total = (state.total_pulls as f64).ln();
    let c = if exploration_factor >= 0.0 {
        exploration_factor
    } else {
        std::f64::consts::SQRT_2
    };

    let mut best_idx = 0;
    let mut best_ucb = f64::NEG_INFINITY;
    let mut best_mean = 0.0;
    let mut best_bonus = 0.0;

    for (i, arm) in state.arms.iter().enumerate() {
        let mean = arm.total_reward / arm.pull_count as f64;
        let bonus = c * (ln_total / arm.pull_count as f64).sqrt();
        let ucb = mean + bonus;

        if ucb > best_ucb {
            best_ucb = ucb;
            best_idx = i;
            best_mean = mean;
            best_bonus = bonus;
        }
    }

    Ok(SelectionResult {
        selected: state.arms[best_idx].name.clone(),
        arm_index: best_idx,
        ucb_score: best_ucb,
        mean_reward: best_mean,
        exploration_bonus: best_bonus,
    })
}

// ---------------------------------------------------------------------------
// WASM exports
// ---------------------------------------------------------------------------

/// Estimate queue delay using the M/M/1 queueing model.
///
/// Returns JSON: `{ wait_time: number, utilization: number, is_stable: boolean }`
#[wasm_bindgen]
pub fn estimate_queue_delay(arrival_rate: f64, service_rate: f64) -> Result<JsValue, JsValue> {
    let result = compute_queue_delay(arrival_rate, service_rate)
        .map_err(|e| wasm_err(codes::INVALID_INPUT, e))?;
    serde_json::to_string(&result)
        .map(|s| JsValue::from_str(&s))
        .map_err(|e| wasm_err(codes::INTERNAL_ERROR, e))
}

/// Rank interventions using a greedy UCB-like heuristic.
///
/// - `interventions_json` — JSON array: `[{ "name": "...", "utility": 0.8 }, ...]`
/// - `exploitation_weight` — 0–1: how much to favour highest utility
///
/// Returns a JSON array of `{ name, score, rank }` sorted by descending score.
#[wasm_bindgen]
pub fn rank_interventions(
    interventions_json: &str,
    exploitation_weight: f64,
) -> Result<JsValue, JsValue> {
    let interventions: Vec<InterventionInput> =
        serde_json::from_str(interventions_json).map_err(|e| {
            wasm_err(
                codes::INVALID_JSON,
                format!("Invalid interventions JSON: {}", e),
            )
        })?;

    let ranked = compute_ranked_interventions(&interventions, exploitation_weight);

    serde_json::to_string(&ranked)
        .map(|s| JsValue::from_str(&s))
        .map_err(|e| wasm_err(codes::INTERNAL_ERROR, e))
}

/// Select an intervention using the UCB1 multi-armed bandit algorithm.
///
/// - `bandit_json` — JSON bandit state with `arms` and `total_pulls`
/// - `exploration_factor` — controls exploration vs exploitation (typically √2 ≈ 1.414)
///
/// Returns JSON: `{ selected, arm_index, ucb_score, mean_reward, exploration_bonus }`
#[wasm_bindgen]
pub fn select_intervention(bandit_json: &str, exploration_factor: f64) -> Result<JsValue, JsValue> {
    let state: BanditState = serde_json::from_str(bandit_json)
        .map_err(|e| wasm_err(codes::INVALID_JSON, format!("Invalid bandit JSON: {}", e)))?;

    let result = compute_ucb1_selection(&state, exploration_factor)
        .map_err(|e| wasm_err(codes::INVALID_INPUT, e))?;

    serde_json::to_string(&result)
        .map(|s| JsValue::from_str(&s))
        .map_err(|e| wasm_err(codes::INTERNAL_ERROR, e))
}

// ---------------------------------------------------------------------------
// Tests — exercise core logic (no JsValue dependency)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_queue_delay_stable() {
        // λ=0.5, μ=1.0 → ρ=0.5, W = 1/(μ(1-ρ)) = 2.0
        let r = compute_queue_delay(0.5, 1.0).unwrap();
        assert!(r.is_stable);
        assert!((r.utilization - 0.5).abs() < 1e-9);
        assert!((r.wait_time - 2.0).abs() < 1e-9);
    }

    #[test]
    fn test_queue_delay_unstable() {
        let r = compute_queue_delay(2.0, 1.0).unwrap();
        assert!(!r.is_stable);
        assert!(r.wait_time.is_infinite());
    }

    #[test]
    fn test_queue_delay_invalid() {
        assert!(compute_queue_delay(0.5, 0.0).is_err());
        assert!(compute_queue_delay(-1.0, 1.0).is_err());
    }

    #[test]
    fn test_rank_interventions_high_exploitation() {
        let ivs = vec![
            InterventionInput {
                name: "Reassign".into(),
                utility: 0.9,
            },
            InterventionInput {
                name: "Escalate".into(),
                utility: 0.5,
            },
            InterventionInput {
                name: "Notify".into(),
                utility: 0.7,
            },
        ];
        let ranked = compute_ranked_interventions(&ivs, 0.8);
        assert_eq!(ranked.len(), 3);
        assert_eq!(ranked[0].rank, 1);
        assert_eq!(ranked[0].name, "Reassign");
    }

    #[test]
    fn test_rank_interventions_empty() {
        let ranked = compute_ranked_interventions(&[], 0.5);
        assert!(ranked.is_empty());
    }

    #[test]
    fn test_ucb1_forced_exploration() {
        let state = BanditState {
            arms: vec![
                BanditArm {
                    name: "A".into(),
                    total_reward: 5.0,
                    pull_count: 10,
                },
                BanditArm {
                    name: "B".into(),
                    total_reward: 0.0,
                    pull_count: 0,
                },
            ],
            total_pulls: 10,
        };
        let sel = compute_ucb1_selection(&state, 1.414).unwrap();
        assert_eq!(sel.selected, "B");
        assert!(sel.ucb_score.is_infinite());
    }

    #[test]
    fn test_ucb1_higher_mean_wins() {
        let state = BanditState {
            arms: vec![
                BanditArm {
                    name: "A".into(),
                    total_reward: 5.0,
                    pull_count: 10,
                },
                BanditArm {
                    name: "B".into(),
                    total_reward: 8.0,
                    pull_count: 10,
                },
            ],
            total_pulls: 20,
        };
        let sel = compute_ucb1_selection(&state, 1.414).unwrap();
        assert_eq!(sel.selected, "B");
        assert!(sel.ucb_score > sel.mean_reward);
    }

    #[test]
    fn test_ucb1_empty_arms() {
        let state = BanditState {
            arms: vec![],
            total_pulls: 0,
        };
        assert!(compute_ucb1_selection(&state, 1.0).is_err());
    }
}
