//! LinUCB contextual bandit — CPU baseline (ground truth for GPU parity).
//!
//! Implements the disjoint LinUCB algorithm from:
//!   Li et al., "A Contextual-Bandit Approach to Personalized News Article Recommendation" (WWW 2010)
//!
//! # Dimensions
//!
//! | Symbol | Shape | Meaning |
//! |--------|-------|---------|
//! | `x`    | [8]   | context feature vector (caller-normalized to [0,1]) |
//! | `W`    | [40×8] | per-action weight vectors |
//! | `b`    | [40]  | per-action intercepts |
//! | `A`    | [8×8] | shared covariance matrix, initially λI |
//! | `A_inv`| [8×8] | cached inverse of A (updated via Sherman-Morrison) |
//! | α      | scalar | exploration bonus (default √2 ≈ 1.414) |
//! | α_lr   | scalar | learning rate for W/b updates (default 0.1) |
//!
//! # Inference (deterministic, no RNG)
//!
//! For each action a in 0..40:
//!   Q̂_a(x) = w_a · x + b_a + α √(x^T A^{-1} x)
//! Select: a* = argmax_a Q̂_a(x)
//!
//! # Update
//!
//! Given reward r for taken action a*:
//!   δ = r - (w_{a*} · x + b_{a*})           (TD error, no exploration term)
//!   W[a*] += α_lr · δ · x
//!   b[a*] += α_lr · δ
//!   A     += x ⊗ x                           (outer product)
//!   A_inv updated via Sherman-Morrison        (O(n²), avoids LU each update)

/// Number of process mining actions (activities/transitions) supported.
pub const N_ACTIONS: usize = 40;

/// Feature vector dimensionality.
pub const N_FEATURES: usize = 8;

/// CPU LinUCB contextual bandit — the ground truth reference implementation.
///
/// All operations are deterministic and depend only on stored state.
/// Caller is responsible for feature normalization into [0, 1].
pub struct LinUCBAgent {
    /// Per-action weight matrix: w[a] ∈ ℝ^8, row-major storage [40 × 8].
    w: [[f32; N_FEATURES]; N_ACTIONS],

    /// Per-action intercept vector: b[a] ∈ ℝ, length 40.
    b: [f32; N_ACTIONS],

    /// Shared covariance matrix A ∈ ℝ^{8×8}, row-major.
    /// Initialized to λI; updated with x ⊗ x on each call to `update`.
    a: [[f32; N_FEATURES]; N_FEATURES],

    /// Cached inverse A^{-1} — kept consistent with `a` via Sherman-Morrison.
    a_inv: [[f32; N_FEATURES]; N_FEATURES],

    /// Regularization coefficient λ (default 1.0).
    pub lambda: f32,

    /// Exploration bonus α (default √2).
    pub alpha: f32,

    /// Learning rate for weight/intercept updates (default 0.1).
    pub alpha_lr: f32,

    /// Human-readable name for logging.
    pub name: String,
}

impl Default for LinUCBAgent {
    fn default() -> Self {
        Self::new()
    }
}

impl LinUCBAgent {
    /// Construct a fresh agent with default hyperparameters.
    ///
    /// A is initialized to λI (λ=1.0), W and b to zero.
    pub fn new() -> Self {
        let lambda = 1.0_f32;
        let alpha = 2.0_f32.sqrt(); // √2 ≈ 1.4142

        // Build identity matrix λI for A
        let mut a = [[0.0_f32; N_FEATURES]; N_FEATURES];
        #[allow(clippy::needless_range_loop)]
        for i in 0..N_FEATURES {
            a[i][i] = lambda;
        }

        // A^{-1} = (λI)^{-1} = (1/λ)I
        let mut a_inv = [[0.0_f32; N_FEATURES]; N_FEATURES];
        #[allow(clippy::needless_range_loop)]
        for i in 0..N_FEATURES {
            a_inv[i][i] = 1.0 / lambda;
        }

        Self {
            w: [[0.0; N_FEATURES]; N_ACTIONS],
            b: [0.0; N_ACTIONS],
            a,
            a_inv,
            lambda,
            alpha,
            alpha_lr: 0.1,
            name: "LinUCB-CPU".to_string(),
        }
    }

    /// Construct with explicit hyperparameters.
    pub fn with_params(lambda: f32, alpha: f32, alpha_lr: f32) -> Self {
        let mut agent = Self::new();
        agent.lambda = lambda;
        agent.alpha = alpha;
        agent.alpha_lr = alpha_lr;

        // Re-initialize A and A_inv with specified lambda
        let mut a = [[0.0_f32; N_FEATURES]; N_FEATURES];
        let mut a_inv = [[0.0_f32; N_FEATURES]; N_FEATURES];
        #[allow(clippy::needless_range_loop)]
        for i in 0..N_FEATURES {
            a[i][i] = lambda;
            a_inv[i][i] = 1.0 / lambda;
        }
        agent.a = a;
        agent.a_inv = a_inv;
        agent
    }

    // -----------------------------------------------------------------------
    // Inference
    // -----------------------------------------------------------------------

    /// Compute the UCB score for a single action given features.
    ///
    /// Q̂_a(x) = w_a · x + b_a + α √(x^T A^{-1} x)
    ///
    /// The exploration term √(x^T A^{-1} x) is the same for all actions
    /// (shared A), so it is passed in pre-computed.
    #[inline(always)]
    fn q_value_for_action(&self, action: usize, x: &[f32; N_FEATURES], ucb_bonus: f32) -> f32 {
        let linear: f32 = dot(&self.w[action], x);
        linear + self.b[action] + ucb_bonus
    }

    /// Select the best action given the context `features`.
    ///
    /// Returns `(action_index, ucb_score)` where action_index ∈ 0..39.
    /// Deterministic — no RNG, pure function of stored state + input.
    pub fn select(&self, features: &[f32; N_FEATURES]) -> (u32, f32) {
        // Exploration term: α √(x^T A^{-1} x) — shared across all actions
        let ucb_bonus = self.alpha * self.compute_ucb_variance(features).max(0.0).sqrt();

        let mut best_action = 0_u32;
        let mut best_q = f32::NEG_INFINITY;

        for a in 0..N_ACTIONS {
            let q = self.q_value_for_action(a, features, ucb_bonus);
            if q > best_q {
                best_q = q;
                best_action = a as u32;
            }
        }

        (best_action, best_q)
    }

    /// Return all 40 Q̂ values for the given features.
    ///
    /// Intended for testing and debugging only.
    pub fn get_q_values(&self, features: &[f32; N_FEATURES]) -> [f32; N_ACTIONS] {
        let ucb_bonus = self.alpha * self.compute_ucb_variance(features).max(0.0).sqrt();
        let mut out = [0.0_f32; N_ACTIONS];
        for (a, slot) in out.iter_mut().enumerate() {
            *slot = self.q_value_for_action(a, features, ucb_bonus);
        }
        out
    }

    /// Compute x^T A^{-1} x — the variance term before taking sqrt.
    ///
    /// Returns a non-negative value. Clamps to 0 for numerical safety.
    #[inline]
    pub fn compute_ucb_variance(&self, x: &[f32; N_FEATURES]) -> f32 {
        // v = A_inv · x  (matrix-vector product)
        let v = mat_vec_mul(&self.a_inv, x);
        // x^T · v
        dot(x, &v).max(0.0)
    }

    // -----------------------------------------------------------------------
    // Update
    // -----------------------------------------------------------------------

    /// Update model weights and covariance after observing reward `r` for
    /// `action` taken in context `features`.
    ///
    /// Algorithm:
    ///   1. δ = r - (w[action] · x + b[action])   (TD error, no UCB term)
    ///   2. W[action] += α_lr · δ · x
    ///   3. b[action] += α_lr · δ
    ///   4. A += x ⊗ x
    ///   5. A_inv updated via Sherman-Morrison rank-1 formula
    ///
    /// Panics if `action` >= N_ACTIONS.
    pub fn update(&mut self, features: &[f32; N_FEATURES], action: u32, reward: f32) {
        let a = action as usize;
        assert!(
            a < N_ACTIONS,
            "action index {} out of range [0, {})",
            a,
            N_ACTIONS
        );

        // Step 1: TD error (no exploration bonus in the target)
        let prediction = dot(&self.w[a], features) + self.b[a];
        let delta = reward - prediction;

        // Step 2 & 3: gradient update on W and b
        let lr = self.alpha_lr;
        for (j, &fj) in features.iter().enumerate() {
            self.w[a][j] += lr * delta * fj;
        }
        self.b[a] += lr * delta;

        // Step 4 & 5: update A and A_inv via Sherman-Morrison
        // A' = A + x ⊗ x
        // A'^{-1} = A^{-1} - (A^{-1} x x^T A^{-1}) / (1 + x^T A^{-1} x)
        //
        // Let u = A^{-1} x
        // denominator = 1 + x^T u  (same as 1 + x^T A^{-1} x)
        let u = mat_vec_mul(&self.a_inv, features);
        let x_t_u = dot(features, &u);
        let denom = 1.0 + x_t_u;

        // Guard against degenerate denominator (should not happen with λI init
        // and non-zero features, but protect against adversarial inputs).
        if denom.abs() > f32::EPSILON {
            // A_inv -= outer(u, u) / denom
            for i in 0..N_FEATURES {
                for j in 0..N_FEATURES {
                    self.a_inv[i][j] -= (u[i] * u[j]) / denom;
                }
            }
        }

        // Update A (kept for auditability / re-inversion if needed)
        for i in 0..N_FEATURES {
            for j in 0..N_FEATURES {
                self.a[i][j] += features[i] * features[j];
            }
        }
    }

    // -----------------------------------------------------------------------
    // Accessors (for testing / serialisation)
    // -----------------------------------------------------------------------

    /// Return a copy of row `action` in W.
    pub fn weight_vector(&self, action: usize) -> [f32; N_FEATURES] {
        assert!(action < N_ACTIONS);
        self.w[action]
    }

    /// Return the intercept for `action`.
    pub fn intercept(&self, action: usize) -> f32 {
        assert!(action < N_ACTIONS);
        self.b[action]
    }

    /// Return a copy of the full A matrix (row-major).
    pub fn covariance_matrix(&self) -> [[f32; N_FEATURES]; N_FEATURES] {
        self.a
    }

    /// Return a copy of A^{-1}.
    pub fn inverse_covariance(&self) -> [[f32; N_FEATURES]; N_FEATURES] {
        self.a_inv
    }
}

// ---------------------------------------------------------------------------
// Pure numeric helpers (no heap allocation, inlineable)
// ---------------------------------------------------------------------------

/// Dot product of two fixed-size feature vectors.
#[inline(always)]
fn dot(a: &[f32; N_FEATURES], b: &[f32; N_FEATURES]) -> f32 {
    let mut s = 0.0_f32;
    for i in 0..N_FEATURES {
        s += a[i] * b[i];
    }
    s
}

/// Matrix-vector product: M · v → result vector.
#[inline]
fn mat_vec_mul(m: &[[f32; N_FEATURES]; N_FEATURES], v: &[f32; N_FEATURES]) -> [f32; N_FEATURES] {
    let mut out = [0.0_f32; N_FEATURES];
    for i in 0..N_FEATURES {
        for j in 0..N_FEATURES {
            out[i] += m[i][j] * v[j];
        }
    }
    out
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // ------------------------------------------------------------------
    // Test 1: deterministic select — same features, same result
    // ------------------------------------------------------------------
    #[test]
    fn select_is_deterministic() {
        let agent = LinUCBAgent::new();
        let features = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
        let (a1, q1) = agent.select(&features);
        let (a2, q2) = agent.select(&features);
        assert_eq!(a1, a2, "action must be deterministic");
        assert!((q1 - q2).abs() < 1e-6, "Q-score must be deterministic");
    }

    // ------------------------------------------------------------------
    // Test 2: fresh agent — all actions have equal weight, uniform Q̂
    // ------------------------------------------------------------------
    #[test]
    fn fresh_agent_uniform_q_values() {
        let agent = LinUCBAgent::new();
        let features = [0.5_f32; N_FEATURES];
        let qs = agent.get_q_values(&features);
        // All actions must have the same Q̂ since W=0, b=0 and A_inv=(1/λ)I
        let first = qs[0];
        for (i, &q) in qs.iter().enumerate() {
            assert!(
                (q - first).abs() < 1e-6,
                "action {i} has Q={q} != Q[0]={first} on fresh agent"
            );
        }
    }

    // ------------------------------------------------------------------
    // Test 3: select returns action in [0, 39]
    // ------------------------------------------------------------------
    #[test]
    fn select_returns_valid_action_index() {
        let agent = LinUCBAgent::new();
        let features = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7];
        let (action, _) = agent.select(&features);
        assert!(
            (action as usize) < N_ACTIONS,
            "action {action} out of [0, {N_ACTIONS})"
        );
    }

    // ------------------------------------------------------------------
    // Test 4: Q values are unbounded (no clamping)
    // ------------------------------------------------------------------
    #[test]
    fn q_values_are_unbounded() {
        let mut agent = LinUCBAgent::new();
        let features = [1.0_f32; N_FEATURES];
        // Drive W[0] weights very high via repeated positive rewards
        for _ in 0..200 {
            agent.update(&features, 0, 100.0);
        }
        let qs = agent.get_q_values(&features);
        assert!(
            qs[0] > 1.0,
            "Q[0] should be large after positive reward reinforcement: got {}",
            qs[0]
        );
        // No clamping — value can exceed 1.0 freely
    }

    // ------------------------------------------------------------------
    // Test 5: update changes weights for chosen action only
    // ------------------------------------------------------------------
    #[test]
    fn update_modifies_only_chosen_action_weights() {
        let mut agent = LinUCBAgent::new();
        let features = [0.5_f32; N_FEATURES];

        // Snapshot weights for all other actions
        let weights_before: Vec<[f32; N_FEATURES]> =
            (0..N_ACTIONS).map(|a| agent.weight_vector(a)).collect();

        agent.update(&features, 3, 1.0);

        // Action 3 must have changed
        let w3_after = agent.weight_vector(3);
        assert!(
            w3_after != weights_before[3],
            "W[3] should change after update(action=3)"
        );

        // All other actions must be unchanged
        for a in 0..N_ACTIONS {
            if a == 3 {
                continue;
            }
            assert_eq!(
                agent.weight_vector(a),
                weights_before[a],
                "W[{a}] should not change when action=3 was selected"
            );
        }
    }

    // ------------------------------------------------------------------
    // Test 6: zero features produce valid (finite) Q values
    // ------------------------------------------------------------------
    #[test]
    fn zero_features_produce_finite_q_values() {
        let agent = LinUCBAgent::new();
        let features = [0.0_f32; N_FEATURES];
        let qs = agent.get_q_values(&features);
        for (i, &q) in qs.iter().enumerate() {
            assert!(
                q.is_finite(),
                "Q[{i}] must be finite for zero features, got {q}"
            );
        }
    }

    // ------------------------------------------------------------------
    // Test 7: zero reward update doesn't corrupt weights
    // ------------------------------------------------------------------
    #[test]
    fn zero_reward_leaves_weights_unchanged() {
        let mut agent = LinUCBAgent::new();
        let features = [0.3_f32; N_FEATURES];
        // Weights start at zero; update with reward=0 should not move them
        agent.update(&features, 5, 0.0);
        let w5 = agent.weight_vector(5);
        // With W=0 and reward=0, δ = 0 - 0 = 0 → no change
        for (j, &wj) in w5.iter().enumerate() {
            assert!(wj.abs() < 1e-7, "W[5][{j}] = {wj} after zero-reward update");
        }
    }

    // ------------------------------------------------------------------
    // Test 8: Sherman-Morrison — A_inv stays consistent with A
    // ------------------------------------------------------------------
    #[test]
    fn a_inv_is_consistent_with_a_after_updates() {
        let mut agent = LinUCBAgent::new();
        let features = [0.1, 0.2, 0.3, 0.4, 0.0, 0.6, 0.7, 0.8];
        for _ in 0..5 {
            agent.update(&features, 0, 1.0);
        }

        // Verify A * A_inv ≈ I
        let a = agent.covariance_matrix();
        let a_inv = agent.inverse_covariance();
        let product = mat_mul_8(&a, &a_inv);
        for i in 0..N_FEATURES {
            for j in 0..N_FEATURES {
                let expected = if i == j { 1.0 } else { 0.0 };
                assert!(
                    (product[i][j] - expected).abs() < 1e-3,
                    "A * A_inv [{i}][{j}] = {} (expected {expected})",
                    product[i][j]
                );
            }
        }
    }

    // ------------------------------------------------------------------
    // Test 9: convergence — repeated positive rewards shift argmax
    // ------------------------------------------------------------------
    #[test]
    fn convergence_toward_rewarded_action() {
        let mut agent = LinUCBAgent::new();
        // Unique features so action 7 gets meaningful gradient
        let features = [0.1, 0.9, 0.2, 0.8, 0.3, 0.7, 0.4, 0.6];
        // Reward only action 7 repeatedly
        for _ in 0..500 {
            agent.update(&features, 7, 1.0);
        }
        let (best, _) = agent.select(&features);
        assert_eq!(
            best, 7,
            "after 500 positive rewards for action 7, argmax should be 7, got {best}"
        );
    }

    // ------------------------------------------------------------------
    // Test 10: multiple distinct actions — argmax tracks last heavily rewarded
    // ------------------------------------------------------------------
    #[test]
    fn argmax_differentiates_between_rewarded_actions() {
        let mut agent = LinUCBAgent::new();

        // Context A → action 2 is rewarded
        let ctx_a = [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
        // Context B → action 15 is rewarded
        let ctx_b = [0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];

        for _ in 0..300 {
            agent.update(&ctx_a, 2, 1.0);
            agent.update(&ctx_b, 15, 1.0);
        }

        let (best_a, _) = agent.select(&ctx_a);
        let (best_b, _) = agent.select(&ctx_b);

        assert_eq!(best_a, 2, "context A should select action 2, got {best_a}");
        assert_eq!(
            best_b, 15,
            "context B should select action 15, got {best_b}"
        );
    }

    // ------------------------------------------------------------------
    // Helper: 8×8 matrix multiply for test 8
    // ------------------------------------------------------------------
    fn mat_mul_8(
        a: &[[f32; N_FEATURES]; N_FEATURES],
        b: &[[f32; N_FEATURES]; N_FEATURES],
    ) -> [[f32; N_FEATURES]; N_FEATURES] {
        let mut out = [[0.0_f32; N_FEATURES]; N_FEATURES];
        for i in 0..N_FEATURES {
            for k in 0..N_FEATURES {
                for j in 0..N_FEATURES {
                    out[i][j] += a[i][k] * b[k][j];
                }
            }
        }
        out
    }
}
