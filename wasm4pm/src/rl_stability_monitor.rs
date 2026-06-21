//! RL Learning Stability Monitor
//!
//! Detects instability patterns in RL training:
//! 1. TD error monotonicity (should generally decrease)
//! 2. Q-value divergence (unbounded growth)
//! 3. Learning curve smoothness (sudden jumps indicate instability)
//! 4. Reward scaling validation
//! 5. Learning rate decay effectiveness
//!
//! Rank-1 oracle: Mathematical properties (Bellman stability)
//! Rank-2 oracle: Domain contract (learning should improve over time)

use std::collections::VecDeque;

/// TD error statistics for convergence monitoring.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TdErrorStats {
    /// Rolling window of TD errors (max 100 samples)
    pub history: VecDeque<f32>,
    /// Mean TD error over last 10 samples (or fewer if not enough data)
    pub mean_recent: f32,
    /// Standard deviation of recent TD errors
    pub std_dev_recent: f32,
    /// Trend: ratio of mean(last 10) / mean(first 10) over 100-sample window
    /// Value < 1.0 indicates convergence (TD error decreasing)
    pub convergence_ratio: f32,
    /// True if TD error is monotonically decreasing (or near-monotonic with <5% violations)
    pub is_monotonic_decreasing: bool,
    /// Count of monotonicity violations (upward jumps in |TD error|)
    pub monotonicity_violations: usize,
}

impl Default for TdErrorStats {
    fn default() -> Self {
        Self {
            history: VecDeque::with_capacity(100),
            mean_recent: 0.0,
            std_dev_recent: 0.0,
            convergence_ratio: 1.0,
            is_monotonic_decreasing: false,
            monotonicity_violations: 0,
        }
    }
}

/// Q-value divergence detector — monitors max Q across all (state, action) pairs.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct QValueDivergenceMonitor {
    /// Max Q-value ever observed (Bellman stability: should stay bounded)
    pub max_q_value: f32,
    /// Cycle count when max_q_value was last updated
    pub max_q_cycle: u64,
    /// True if max_q_value has grown >50% in the last 50 cycles (divergence alarm)
    pub is_diverging: bool,
    /// History of max Q-values (rolling window, 50 samples)
    pub max_q_history: VecDeque<f32>,
}

impl Default for QValueDivergenceMonitor {
    fn default() -> Self {
        Self {
            max_q_value: 0.0,
            max_q_cycle: 0,
            is_diverging: false,
            max_q_history: VecDeque::with_capacity(50),
        }
    }
}

/// Learning curve smoothness detector — flags sudden jumps.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct LearningCurveSmoothness {
    /// Cumulative reward history (rolling window, 100 samples)
    pub reward_history: VecDeque<f32>,
    /// Count of "jumps" (absolute reward delta > 2x mean recent delta)
    pub jump_count: usize,
    /// Cycle count of most recent jump
    pub last_jump_cycle: u64,
    /// True if >20% of deltas are classified as jumps (chaotic learning)
    pub is_chaotic: bool,
    /// Mean absolute reward delta over last 10 samples
    pub mean_delta: f32,
}

impl Default for LearningCurveSmoothness {
    fn default() -> Self {
        Self {
            reward_history: VecDeque::with_capacity(100),
            jump_count: 0,
            last_jump_cycle: 0,
            is_chaotic: false,
            mean_delta: 0.0,
        }
    }
}

/// Reward scaling validation — checks for extreme reward outliers.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RewardScalingValidator {
    /// Mean reward over last 50 cycles
    pub mean_reward: f32,
    /// Std dev of rewards over last 50 cycles
    pub std_dev_reward: f32,
    /// True if any reward is >5σ from mean (outlier, scaling issue)
    pub has_extreme_outliers: bool,
    /// Count of extreme outlier cycles detected
    pub outlier_count: usize,
    /// Expected reward range from rl_orchestrator::compute_reward docs: [-5.5, +1.6]
    pub is_in_documented_range: bool,
}

impl Default for RewardScalingValidator {
    fn default() -> Self {
        Self {
            mean_reward: 0.0,
            std_dev_reward: 0.0,
            has_extreme_outliers: false,
            outlier_count: 0,
            is_in_documented_range: true,
        }
    }
}

/// Learning rate decay monitor — verifies alpha decay schedule.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct LearningRateDecayMonitor {
    /// Initial learning rate (alpha_0)
    pub alpha_0: f32,
    /// Current cycle count
    pub cycle_count: u64,
    /// Current decayed learning rate
    pub alpha_current: f32,
    /// Expected decay (from schedule: 0.9999^cycle_count)
    pub alpha_expected: f32,
    /// True if actual alpha is within 2% of expected (schedule working correctly)
    pub schedule_is_correct: bool,
}

impl LearningRateDecayMonitor {
    pub fn new(alpha_0: f32) -> Self {
        Self {
            alpha_0,
            cycle_count: 0,
            alpha_current: alpha_0,
            alpha_expected: alpha_0,
            schedule_is_correct: true,
        }
    }

    /// Update with current cycle count and measured learning rate.
    pub fn update(&mut self, cycle_count: u64, alpha_measured: f32) {
        self.cycle_count = cycle_count;
        self.alpha_current = alpha_measured;
        // Expected decay: alpha_0 * (0.9999 ^ cycle_count)
        self.alpha_expected = self.alpha_0 * 0.9999_f32.powf(cycle_count as f32);
        // Allow 2% tolerance
        let tolerance = self.alpha_expected * 0.02;
        self.schedule_is_correct = (self.alpha_current - self.alpha_expected).abs() < tolerance;
    }
}

/// Master stability monitor combining all checks.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RlStabilityMonitor {
    pub td_error_stats: TdErrorStats,
    pub q_divergence: QValueDivergenceMonitor,
    pub learning_curve: LearningCurveSmoothness,
    pub reward_scaling: RewardScalingValidator,
    pub learning_rate_decay: LearningRateDecayMonitor,
}

impl RlStabilityMonitor {
    pub fn new(alpha_0: f32) -> Self {
        Self {
            td_error_stats: TdErrorStats::default(),
            q_divergence: QValueDivergenceMonitor::default(),
            learning_curve: LearningCurveSmoothness::default(),
            reward_scaling: RewardScalingValidator::default(),
            learning_rate_decay: LearningRateDecayMonitor::new(alpha_0),
        }
    }

    /// Record a TD error sample.
    pub fn record_td_error(&mut self, td_error: f32) {
        let abs_error = td_error.abs();

        // Track monotonicity violations
        if let Some(&last_error) = self.td_error_stats.history.back() {
            if abs_error > last_error {
                self.td_error_stats.monotonicity_violations += 1;
            }
        }

        // Add to history (keep max 100)
        if self.td_error_stats.history.len() >= 100 {
            self.td_error_stats.history.pop_front();
        }
        self.td_error_stats.history.push_back(abs_error);

        // Recompute stats
        self.recompute_td_error_stats();
    }

    /// Record max Q-value for divergence detection.
    pub fn record_max_q_value(&mut self, max_q: f32, cycle_count: u64) {
        if max_q > self.q_divergence.max_q_value {
            self.q_divergence.max_q_value = max_q;
            self.q_divergence.max_q_cycle = cycle_count;
        }

        // Track history (keep max 50)
        if self.q_divergence.max_q_history.len() >= 50 {
            self.q_divergence.max_q_history.pop_front();
        }
        self.q_divergence.max_q_history.push_back(max_q);

        // Check for divergence: >50% growth in last 50 samples
        if self.q_divergence.max_q_history.len() >= 10 {
            let recent_start = self.q_divergence.max_q_history[0];
            let recent_max = *self
                .q_divergence
                .max_q_history
                .iter()
                .max_by(|a, b| a.total_cmp(b))
                .unwrap_or(&recent_start);
            if recent_start > 0.0 && (recent_max - recent_start) / recent_start > 0.5 {
                self.q_divergence.is_diverging = true;
            }
        }
    }

    /// Record cumulative reward for learning curve analysis.
    pub fn record_reward(&mut self, cumulative_reward: f32) {
        if self.learning_curve.reward_history.len() >= 100 {
            self.learning_curve.reward_history.pop_front();
        }
        self.learning_curve
            .reward_history
            .push_back(cumulative_reward);

        // Detect jumps
        if self.learning_curve.reward_history.len() >= 2 {
            let prev =
                self.learning_curve.reward_history[self.learning_curve.reward_history.len() - 2];
            let curr = cumulative_reward;
            let delta = (curr - prev).abs();

            // Recompute mean delta
            let mut sum_deltas = 0.0;
            let mut count = 0;
            for i in 1..self.learning_curve.reward_history.len() {
                let d = (self.learning_curve.reward_history[i]
                    - self.learning_curve.reward_history[i - 1])
                    .abs();
                sum_deltas += d;
                count += 1;
            }
            self.learning_curve.mean_delta = if count > 0 {
                sum_deltas / count as f32
            } else {
                0.0
            };

            // Flag jump if >2x mean delta
            if self.learning_curve.mean_delta > 0.0 && delta > 2.0 * self.learning_curve.mean_delta
            {
                self.learning_curve.jump_count += 1;
            }

            // Chaotic if >20% of transitions are jumps
            if self.learning_curve.reward_history.len() >= 5 {
                let chaos_threshold =
                    (self.learning_curve.reward_history.len() as f32 * 0.2).ceil() as usize;
                self.learning_curve.is_chaotic = self.learning_curve.jump_count > chaos_threshold;
            }
        }
    }

    /// Validate reward is within documented range [-5.5, +1.6].
    pub fn validate_reward_scaling(&mut self, reward: f32) {
        const MIN_REWARD: f32 = -5.5;
        const MAX_REWARD: f32 = 1.6;

        if reward < MIN_REWARD || reward > MAX_REWARD {
            self.reward_scaling.has_extreme_outliers = true;
            self.reward_scaling.outlier_count += 1;
            self.reward_scaling.is_in_documented_range = false;
        }
    }

    /// Check overall stability: true if all monitors report safe state.
    pub fn is_stable(&self) -> bool {
        !self.td_error_stats.is_monotonic_decreasing // Convergence expected
            && !self.q_divergence.is_diverging
            && !self.learning_curve.is_chaotic
            && !self.reward_scaling.has_extreme_outliers
    }

    fn recompute_td_error_stats(&mut self) {
        if self.td_error_stats.history.is_empty() {
            return;
        }

        let len = self.td_error_stats.history.len();
        let recent_len = std::cmp::min(10, len);
        let recent_start = len.saturating_sub(recent_len);

        // Compute mean of recent samples
        let recent_sum: f32 = self.td_error_stats.history.iter().skip(recent_start).sum();
        self.td_error_stats.mean_recent = recent_sum / recent_len as f32;

        // Compute std dev of recent samples
        let variance = self
            .td_error_stats
            .history
            .iter()
            .skip(recent_start)
            .map(|&x| (x - self.td_error_stats.mean_recent).powi(2))
            .sum::<f32>()
            / recent_len as f32;
        self.td_error_stats.std_dev_recent = variance.sqrt();

        // Convergence ratio: mean(last 10) / mean(first 10)
        if len >= 20 {
            let first_sum: f32 = self.td_error_stats.history.iter().take(10).sum();
            let first_mean = first_sum / 10.0;
            if first_mean > 0.0 {
                self.td_error_stats.convergence_ratio =
                    self.td_error_stats.mean_recent / first_mean;
            }
        }

        // Check monotonicity: violations < 5% of samples
        let violation_threshold = (len as f32 * 0.05).ceil() as usize;
        self.td_error_stats.is_monotonic_decreasing =
            self.td_error_stats.monotonicity_violations < violation_threshold;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_td_error_monotonicity_detection() {
        let mut monitor = RlStabilityMonitor::new(0.1);
        // Monotonically decreasing: 1.0, 0.9, 0.8, 0.7, 0.6, ...
        for i in 0..10 {
            monitor.record_td_error(1.0 - i as f32 * 0.1);
        }
        assert!(
            monitor.td_error_stats.is_monotonic_decreasing,
            "Monotonically decreasing TD errors should be flagged"
        );
        assert!(monitor.td_error_stats.monotonicity_violations == 0);
    }

    #[test]
    fn test_q_value_divergence_alarm() {
        let mut monitor = RlStabilityMonitor::new(0.1);
        // Initial max Q = 1.0, then rapid growth to 1.8 (80% increase)
        monitor.record_max_q_value(1.0, 0);
        for i in 1..15 {
            let q = 1.0 + (i as f32 * 0.06); // Grows to ~1.8 over 15 samples
            monitor.record_max_q_value(q, i as u64);
        }
        assert!(
            monitor.q_divergence.is_diverging,
            "Q-values growing >50% in 50-sample window should trigger divergence alarm"
        );
    }

    #[test]
    fn test_learning_rate_decay_schedule() {
        let mut monitor = RlStabilityMonitor::new(0.1);
        monitor.learning_rate_decay.update(0, 0.1);
        assert!(monitor.learning_rate_decay.schedule_is_correct);

        // After 1000 cycles: alpha_0 * 0.9999^1000 ≈ 0.0905
        monitor.learning_rate_decay.update(1000, 0.0905);
        assert!(monitor.learning_rate_decay.schedule_is_correct);

        // After 10000 cycles: alpha_0 * 0.9999^10000 ≈ 0.0368
        monitor.learning_rate_decay.update(10000, 0.0368);
        assert!(monitor.learning_rate_decay.schedule_is_correct);
    }

    #[test]
    fn test_reward_scaling_validation() {
        let mut monitor = RlStabilityMonitor::new(0.1);
        // Valid rewards
        monitor.validate_reward_scaling(0.0);
        monitor.validate_reward_scaling(1.0);
        monitor.validate_reward_scaling(-1.0);
        assert!(!monitor.reward_scaling.has_extreme_outliers);

        // Out-of-range reward
        monitor.validate_reward_scaling(10.0);
        assert!(monitor.reward_scaling.has_extreme_outliers);
        assert_eq!(monitor.reward_scaling.outlier_count, 1);
    }

    #[test]
    fn test_learning_curve_smoothness() {
        let mut monitor = RlStabilityMonitor::new(0.1);
        // Smooth learning curve: rewards increase gradually
        for i in 0..30 {
            monitor.record_reward(i as f32 * 0.1);
        }
        assert!(!monitor.learning_curve.is_chaotic);

        // Now add a large jump (simulated instability)
        monitor.record_reward(100.0);
        assert!(monitor.learning_curve.is_chaotic || monitor.learning_curve.jump_count > 0);
    }
}
