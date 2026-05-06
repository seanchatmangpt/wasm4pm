//! Multi-Armed Bandit Algorithms (UCB1)
//!
//! Ported from wasm4pm prediction_resource.rs
//!
//! Provides reinforcement learning algorithms for sequential
//! decision-making under uncertainty.

use wasm_bindgen::prelude::*;

/// Bandit arm (action option)
#[derive(Clone, Debug)]
#[wasm_bindgen]
pub struct BanditArm {
    /// Arm name/identifier
    #[wasm_bindgen(getter_with_clone)]
    pub name: String,

    /// Total accumulated reward
    #[wasm_bindgen(getter_with_clone)]
    pub total_reward: f64,

    /// Number of times this arm was pulled
    #[wasm_bindgen(getter_with_clone)]
    pub pull_count: usize,
}

/// Bandit state for tracking multiple arms
#[derive(Clone, Debug)]
#[wasm_bindgen]
pub struct BanditState {
    /// All available arms
    #[wasm_bindgen(getter_with_clone)]
    pub arms: Vec<BanditArm>,

    /// Total number of pulls across all arms
    #[wasm_bindgen(getter_with_clone)]
    pub total_pulls: usize,
}

/// UCB1 selection result
#[derive(Clone, Debug)]
#[wasm_bindgen]
pub struct UCB1Selection {
    /// Selected arm name
    #[wasm_bindgen(getter_with_clone)]
    pub selected: String,

    /// Index of selected arm
    #[wasm_bindgen(getter_with_clone)]
    pub arm_index: usize,

    /// UCB score (mean + exploration bonus)
    #[wasm_bindgen(getter_with_clone)]
    pub ucb_score: f64,

    /// Mean reward of selected arm
    #[wasm_bindgen(getter_with_clone)]
    pub mean_reward: f64,

    /// Exploration bonus component
    #[wasm_bindgen(getter_with_clone)]
    pub exploration_bonus: f64,
}

impl BanditState {
    /// Create a new bandit with named arms
    pub fn new(arm_names: &[&str]) -> Self {
        let arms = arm_names
            .iter()
            .map(|&name| BanditArm {
                name: name.to_string(),
                total_reward: 0.0,
                pull_count: 0,
            })
            .collect();

        BanditState {
            arms,
            total_pulls: 0,
        }
    }

    /// Update an arm with observed reward
    pub fn update(&mut self, arm_name: &str, reward: f64) -> Result<(), String> {
        if let Some(arm) = self.arms.iter_mut().find(|a| a.name == arm_name) {
            arm.total_reward += reward;
            arm.pull_count += 1;
            self.total_pulls += 1;
            Ok(())
        } else {
            Err(format!("Arm '{}' not found", arm_name))
        }
    }

    /// Get arm by name
    pub fn get_arm(&self, name: &str) -> Option<&BanditArm> {
        self.arms.iter().find(|a| a.name == name)
    }
}

impl Default for BanditState {
    fn default() -> Self {
        Self::new(&[])
    }
}

/// Select an arm using UCB1 algorithm
///
/// UCB1 (Upper Confidence Bound) balances exploration and exploitation:
/// - Exploitation: Pull arms with high mean rewards
/// - Exploration: Try less-pulled arms
///
/// Formula: UCB = mean_reward + c * sqrt(ln(total_pulls) / pull_count)
///
/// # Arguments
/// * `state` - Current bandit state
/// * `exploration_factor` - Controls exploration (default: sqrt(2) ≈ 1.414)
///
/// # Returns
/// Selection result with chosen arm and scores
///
/// # Example
/// ```no_run
/// // Create bandit state with arms "A", "B", "C"
/// // Select arm using UCB1 algorithm
/// // Update state with observed reward
/// ```
pub fn select_ucb1(
    state: &BanditState,
    exploration_factor: f64,
) -> Result<UCB1Selection, String> {
    if state.arms.is_empty() {
        return Err("Bandit must have at least one arm".into());
    }

    // Forced exploration: pick first arm with zero pulls
    for (i, arm) in state.arms.iter().enumerate() {
        if arm.pull_count == 0 {
            return Ok(UCB1Selection {
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

    Ok(UCB1Selection {
        selected: state.arms[best_idx].name.clone(),
        arm_index: best_idx,
        ucb_score: best_ucb,
        mean_reward: best_mean,
        exploration_bonus: best_bonus,
    })
}

/// Intervention input for ranking
#[derive(Clone, Debug)]
pub struct InterventionInput {
    pub name: String,
    pub utility: f64,
}

/// Ranked intervention result
#[derive(Clone, Debug)]
pub struct RankedIntervention {
    pub name: String,
    pub score: f64,
    pub rank: usize,
}

/// Rank interventions using greedy UCB-like heuristic
///
/// # Arguments
/// * `interventions` - Interventions with utility scores
/// * `exploitation_weight` - 0-1: how much to favor highest utility
///
/// # Returns
/// Interventions ranked by score (descending)
pub fn rank_interventions(
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

    scored.sort_by(|a, b| {
        b.1.partial_cmp(&a.1)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

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

/// Queue delay estimation result
#[derive(Clone, Debug)]
#[wasm_bindgen]
pub struct QueueDelayResult {
    /// Expected wait time
    #[wasm_bindgen(getter_with_clone)]
    pub wait_time: f64,

    /// Server utilization (0-1)
    #[wasm_bindgen(getter_with_clone)]
    pub utilization: f64,

    /// Whether system is stable (utilization < 1)
    #[wasm_bindgen(getter_with_clone)]
    pub is_stable: bool,
}

/// Estimate queue delay using M/M/1 queueing model
///
/// # Arguments
/// * `arrival_rate` - Arrivals per time unit
/// * `service_rate` - Services per time unit
///
/// # Returns
/// Queue delay result
pub fn estimate_queue_delay(
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ucb1_forced_exploration() {
        let state = BanditState {
            arms: vec![
                BanditArm {
                    name: "A".to_string(),
                    total_reward: 5.0,
                    pull_count: 10,
                },
                BanditArm {
                    name: "B".to_string(),
                    total_reward: 0.0,
                    pull_count: 0,
                },
            ],
            total_pulls: 10,
        };
        let sel = select_ucb1(&state, 1.414).unwrap();
        assert_eq!(sel.selected, "B");
        assert!(sel.ucb_score.is_infinite());
    }

    #[test]
    fn test_ucb1_higher_mean_wins() {
        let state = BanditState {
            arms: vec![
                BanditArm {
                    name: "A".to_string(),
                    total_reward: 5.0,
                    pull_count: 10,
                },
                BanditArm {
                    name: "B".to_string(),
                    total_reward: 8.0,
                    pull_count: 10,
                },
            ],
            total_pulls: 20,
        };
        let sel = select_ucb1(&state, 1.414).unwrap();
        assert_eq!(sel.selected, "B");
        assert!(sel.ucb_score > sel.mean_reward);
    }

    #[test]
    fn test_ucb1_empty_arms() {
        let state = BanditState {
            arms: vec![],
            total_pulls: 0,
        };
        assert!(select_ucb1(&state, 1.0).is_err());
    }

    #[test]
    fn test_bandit_state_update() {
        let mut state = BanditState::new(&["A", "B"]);
        state.update("A", 1.0).unwrap();
        state.update("A", 0.5).unwrap();

        assert_eq!(state.total_pulls, 2);
        assert_eq!(state.arms[0].pull_count, 2);
        assert_eq!(state.arms[0].total_reward, 1.5);
    }

    #[test]
    fn test_rank_interventions() {
        let ivs = vec![
            InterventionInput {
                name: "Reassign".to_string(),
                utility: 0.9,
            },
            InterventionInput {
                name: "Escalate".to_string(),
                utility: 0.5,
            },
            InterventionInput {
                name: "Notify".to_string(),
                utility: 0.7,
            },
        ];
        let ranked = rank_interventions(&ivs, 0.8);
        assert_eq!(ranked.len(), 3);
        assert_eq!(ranked[0].rank, 1);
        assert_eq!(ranked[0].name, "Reassign");
    }

    #[test]
    fn test_queue_delay_stable() {
        let r = estimate_queue_delay(0.5, 1.0).unwrap();
        assert!(r.is_stable);
        assert!((r.utilization - 0.5).abs() < 1e-9);
        assert!((r.wait_time - 2.0).abs() < 1e-9);
    }

    #[test]
    fn test_queue_delay_unstable() {
        let r = estimate_queue_delay(2.0, 1.0).unwrap();
        assert!(!r.is_stable);
        assert!(r.wait_time.is_infinite());
    }

    #[test]
    fn test_queue_delay_invalid() {
        assert!(estimate_queue_delay(0.5, 0.0).is_err());
        assert!(estimate_queue_delay(-1.0, 1.0).is_err());
    }
}
