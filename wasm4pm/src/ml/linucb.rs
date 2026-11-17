//! LinUCB contextual bandit — CPU baseline (ground truth for GPU parity).
//!
//! Implements the **disjoint** LinUCB model from:
//!   Li et al., "A Contextual-Bandit Approach to Personalized News Article
//!   Recommendation" (WWW 2010), Algorithm 1.
//!
//! Each action `a` owns its own parameters:
//!
//! | Symbol | Shape   | Meaning                                        |
//! |--------|---------|------------------------------------------------|
//! | `x`    | [8]     | context feature vector (caller-normalized)     |
//! | `A_a`  | [8×8]   | per-action covariance, init λI                 |
//! | `b_a`  | [8]     | per-action reward vector, init 0               |
//! | `A_a⁻¹`| [8×8]   | cached inverse, Sherman-Morrison rank-1 update |
//! | `θ_a`  | [8]     | A_a⁻¹ b_a — per-action payoff estimate         |
//! | α      | scalar  | exploration coefficient (default √2)           |
//!
//! # Inference (deterministic, no RNG)
//!
//! For each action a:
//!   θ_a = A_a⁻¹ b_a
//!   p_{t,a} = θ_aᵀ x + α √(xᵀ A_a⁻¹ x)
//! Select: a* = argmax_a p_{t,a} (ties → lowest index)
//!
//! # Update
//!
//! Given reward r for taken action a*:
//!   A_{a*} += x ⊗ x
//!   b_{a*} += r · x
//!   A_{a*}⁻¹ updated via Sherman-Morrison (O(d²), no LU per update)

/// Number of RL agents (QLearning, SARSA, DoubleQLearning, ExpectedSARSA, REINFORCE).
pub const N_ACTIONS: usize = 5;

/// Feature vector dimensionality.
pub const N_FEATURES: usize = 8;

/// CPU disjoint LinUCB contextual bandit — the ground truth reference implementation.
///
/// All operations are deterministic and depend only on stored state.
/// Caller is responsible for feature normalization into [0, 1].
pub struct LinUCBAgent {
    /// Per-action covariance matrices A_a ∈ ℝ^{8×8}, row-major storage [5][8×8].
    /// Initialized to λI; updated with x ⊗ x on each call to `update`.
    a: [[[f32; N_FEATURES]; N_FEATURES]; N_ACTIONS],

    /// Cached per-action inverses A_a⁻¹ — kept consistent with `a` via Sherman-Morrison.
    a_inv: [[[f32; N_FEATURES]; N_FEATURES]; N_ACTIONS],

    /// Per-action reward vectors b_a ∈ ℝ^8.
    b: [[f32; N_FEATURES]; N_ACTIONS],

    /// Regularization coefficient λ (default 1.0) — A_a is initialized to λI.
    pub lambda: f32,

    /// Exploration coefficient α (default √2).
    pub alpha: f32,

    /// Retained for telemetry compatibility with the orchestrator's convergence
    /// span (`learning_rate` attribute). The disjoint closed-form update has no
    /// learning rate; this field does not affect the math.
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
    /// Each A_a is initialized to λI (λ=1.0), each b_a to zero.
    pub fn new() -> Self {
        Self::with_params(1.0, 2.0_f32.sqrt(), 0.1)
    }

    /// Construct with explicit hyperparameters.
    ///
    /// * `lambda` — ridge initialization for each A_a (A_a = λI).
    /// * `alpha`  — exploration coefficient in the UCB bonus.
    /// * `alpha_lr` — unused by the disjoint update (kept for telemetry compat).
    pub fn with_params(lambda: f32, alpha: f32, alpha_lr: f32) -> Self {
        let mut a = [[[0.0_f32; N_FEATURES]; N_FEATURES]; N_ACTIONS];
        let mut a_inv = [[[0.0_f32; N_FEATURES]; N_FEATURES]; N_ACTIONS];
        for act in 0..N_ACTIONS {
            #[allow(clippy::needless_range_loop)]
            for i in 0..N_FEATURES {
                a[act][i][i] = lambda;
                a_inv[act][i][i] = 1.0 / lambda;
            }
        }

        Self {
            a,
            a_inv,
            b: [[0.0; N_FEATURES]; N_ACTIONS],
            lambda,
            alpha,
            alpha_lr,
            name: "LinUCB-CPU".to_string(),
        }
    }

    // -----------------------------------------------------------------------
    // Inference
    // -----------------------------------------------------------------------

    /// Compute p_{t,a} = θ_aᵀ x + α √(xᵀ A_a⁻¹ x) for a single action.
    #[inline(always)]
    fn p_value_for_action(&self, action: usize, x: &[f32; N_FEATURES]) -> f32 {
        let theta = mat_vec_mul(&self.a_inv[action], &self.b[action]);
        let linear = dot(&theta, x);
        let bonus = self.alpha * self.variance_for_action(action, x).sqrt();
        linear + bonus
    }

    /// Select the best action given the context `features`.
    ///
    /// Returns `(action_index, p_{t,a*})` where action_index ∈ 0..N_ACTIONS.
    /// Deterministic — no RNG; ties broken by lowest index.
    pub fn select(&self, features: &[f32; N_FEATURES]) -> (u32, f32) {
        let mut best_action = 0_u32;
        let mut best_p = f32::NEG_INFINITY;

        for a in 0..N_ACTIONS {
            let p = self.p_value_for_action(a, features);
            if p > best_p {
                best_p = p;
                best_action = a as u32;
            }
        }

        (best_action, best_p)
    }

    /// Return all p_{t,a} values for the given features (index = action).
    pub fn get_q_values(&self, features: &[f32; N_FEATURES]) -> [f32; N_ACTIONS] {
        let mut out = [0.0_f32; N_ACTIONS];
        for (a, slot) in out.iter_mut().enumerate() {
            *slot = self.p_value_for_action(a, features);
        }
        out
    }

    /// Compute xᵀ A_a⁻¹ x — the variance term for action `a` before the sqrt.
    ///
    /// Clamps to 0 for numerical safety.
    #[inline]
    pub fn variance_for_action(&self, action: usize, x: &[f32; N_FEATURES]) -> f32 {
        assert!(action < N_ACTIONS, "action {action} out of range");
        let v = mat_vec_mul(&self.a_inv[action], x);
        dot(x, &v).max(0.0)
    }

    /// Exploration bonus α √(xᵀ A_a⁻¹ x) for action `a` — distinct per action.
    #[inline]
    pub fn exploration_bonus(&self, action: usize, x: &[f32; N_FEATURES]) -> f32 {
        self.alpha * self.variance_for_action(action, x).sqrt()
    }

    // -----------------------------------------------------------------------
    // Update
    // -----------------------------------------------------------------------

    /// Update the model for `action` taken in context `features` with reward `r`.
    ///
    /// Disjoint LinUCB (Li et al. 2010, Algorithm 1, steps 8–10):
    ///   A_a += x ⊗ x
    ///   b_a += r · x
    ///   A_a⁻¹ updated via Sherman-Morrison rank-1:
    ///     A⁻¹ ← A⁻¹ − (A⁻¹x)(A⁻¹x)ᵀ / (1 + xᵀA⁻¹x)
    ///
    /// Only the taken action's A_a, b_a, A_a⁻¹ are touched.
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

        // Sherman-Morrison on A_a⁻¹ before A_a is mutated.
        // Let u = A_a⁻¹ x; A⁻¹ ← A⁻¹ − outer(u, u) / (1 + xᵀu)
        let u = mat_vec_mul(&self.a_inv[a], features);
        let denom = 1.0 + dot(features, &u);

        // Guard against degenerate denominator (should not happen with λI init,
        // but protect against adversarial inputs).
        if denom.abs() > f32::EPSILON {
            for i in 0..N_FEATURES {
                for j in 0..N_FEATURES {
                    self.a_inv[a][i][j] -= (u[i] * u[j]) / denom;
                }
            }
        }

        // A_a += x ⊗ x
        for i in 0..N_FEATURES {
            for j in 0..N_FEATURES {
                self.a[a][i][j] += features[i] * features[j];
            }
        }

        // b_a += r · x
        for (bi, &xi) in self.b[a].iter_mut().zip(features.iter()) {
            *bi += reward * xi;
        }
    }

    // -----------------------------------------------------------------------
    // Accessors (for testing / serialisation)
    // -----------------------------------------------------------------------

    /// Return a copy of A_a (row-major) for `action`.
    pub fn covariance_matrix(&self, action: usize) -> [[f32; N_FEATURES]; N_FEATURES] {
        assert!(action < N_ACTIONS);
        self.a[action]
    }

    /// Return a copy of A_a⁻¹ for `action`.
    pub fn inverse_covariance(&self, action: usize) -> [[f32; N_FEATURES]; N_FEATURES] {
        assert!(action < N_ACTIONS);
        self.a_inv[action]
    }

    /// Return a copy of b_a for `action`.
    pub fn reward_vector(&self, action: usize) -> [f32; N_FEATURES] {
        assert!(action < N_ACTIONS);
        self.b[action]
    }

    /// Return θ_a = A_a⁻¹ b_a for `action`.
    pub fn theta(&self, action: usize) -> [f32; N_FEATURES] {
        assert!(action < N_ACTIONS);
        mat_vec_mul(&self.a_inv[action], &self.b[action])
    }

    /// Compute L2 norms of the payoff estimates θ_a = A_a⁻¹ b_a (convergence metric).
    /// Returns array of N_ACTIONS norms, one per action.
    pub fn weight_norms(&self) -> [f32; N_ACTIONS] {
        let mut norms = [0.0_f32; N_ACTIONS];
        for (norm, act) in norms.iter_mut().zip(0..N_ACTIONS) {
            let theta = self.theta(act);
            *norm = dot(&theta, &theta).sqrt();
        }
        norms
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
    // Helper: 8×8 matrix multiply
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
    // Test 2: fresh agent — all actions tied (θ_a = 0, identical A_a)
    // ------------------------------------------------------------------
    #[test]
    fn fresh_agent_uniform_q_values() {
        let agent = LinUCBAgent::new();
        let features = [0.5_f32; N_FEATURES];
        let qs = agent.get_q_values(&features);
        // All actions must have the same p value: θ_a = 0 and A_a = λI for all a
        let first = qs[0];
        for (i, &q) in qs.iter().enumerate() {
            assert!(
                (q - first).abs() < 1e-6,
                "action {i} has Q={q} != Q[0]={first} on fresh agent"
            );
        }
    }

    // ------------------------------------------------------------------
    // Test 3: select returns action in [0, N_ACTIONS)
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
    // Test 4: disjointness — update touches only the taken action
    // ------------------------------------------------------------------
    #[test]
    fn update_is_disjoint_per_action() {
        let mut agent = LinUCBAgent::new();
        let features = [0.5_f32; N_FEATURES];

        let a_before: Vec<_> = (0..N_ACTIONS).map(|a| agent.covariance_matrix(a)).collect();
        let b_before: Vec<_> = (0..N_ACTIONS).map(|a| agent.reward_vector(a)).collect();

        agent.update(&features, 3, 1.0);

        for a in 0..N_ACTIONS {
            if a == 3 {
                assert_ne!(
                    agent.covariance_matrix(3),
                    a_before[3],
                    "A_3 must change after update(action=3)"
                );
                assert_ne!(
                    agent.reward_vector(3),
                    b_before[3],
                    "b_3 must change after update(action=3)"
                );
            } else {
                assert_eq!(
                    agent.covariance_matrix(a),
                    a_before[a],
                    "A_{a} must be untouched when action=3"
                );
                assert_eq!(
                    agent.reward_vector(a),
                    b_before[a],
                    "b_{a} must be untouched when action=3"
                );
            }
        }
    }

    // ------------------------------------------------------------------
    // Test 5: per-action uncertainty differs under differing histories
    // ------------------------------------------------------------------
    #[test]
    fn per_action_uncertainty_differs() {
        let mut agent = LinUCBAgent::new();
        let ctx_a = [0.9, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7];
        let ctx_b = [0.1, 0.9, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7];

        // Give action 0 a long history; leave action 1 unobserved.
        for _ in 0..20 {
            agent.update(&ctx_a, 0, 1.0);
        }

        let bonus_0 = agent.exploration_bonus(0, &ctx_a);
        let bonus_1 = agent.exploration_bonus(1, &ctx_a);
        assert!(
            bonus_1 > bonus_0,
            "unobserved action 1 (bonus {bonus_1}) must carry more uncertainty \
             than action 0 with 20 observations (bonus {bonus_0})"
        );

        // Bonus is also context-dependent: for the heavily-observed action 0,
        // a different context with an unexplored direction yields a larger bonus.
        let bonus_0_ctx_b = agent.exploration_bonus(0, &ctx_b);
        assert!(
            bonus_0_ctx_b > bonus_0,
            "bonus in an unexplored context direction must exceed the \
             well-explored direction for the same action"
        );
    }

    // ------------------------------------------------------------------
    // Test 6: A_a inverses match direct inversion (random SPD input)
    // ------------------------------------------------------------------
    #[test]
    fn a_inv_matches_direct_inversion_on_random_spd() {
        // Small deterministic LCG so the test has no external rng dependency.
        let mut state: u64 = 0x9E3779B97F4A7C15;
        let mut next = || {
            state = state
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            ((state >> 33) as f32) / ((u32::MAX >> 1) as f32) - 1.0 // [-1, 1)
        };

        let mut agent = LinUCBAgent::new();
        // Feed each action 6 random contexts → each A_a is a random SPD matrix.
        for act in 0..N_ACTIONS {
            for _ in 0..6 {
                let x = [
                    next(), next(), next(), next(), next(), next(), next(), next(),
                ];
                // A_a = λI + Σ xxᵀ is SPD by construction for λ > 0.
                agent.update(&x, act as u32, next());
            }
        }

        // Verify A_a · A_a⁻¹ ≈ I for every action, per-action.
        for act in 0..N_ACTIONS {
            let prod = mat_mul_8(&agent.covariance_matrix(act), &agent.inverse_covariance(act));
            for i in 0..N_FEATURES {
                for j in 0..N_FEATURES {
                    let expected = f32::from(i == j);
                    assert!(
                        (prod[i][j] - expected).abs() < 1e-3,
                        "A_{act} · A_{act}⁻¹ [{i}][{j}] = {} (expected {expected})",
                        prod[i][j]
                    );
                }
            }
        }
    }

    // ------------------------------------------------------------------
    // Test 7: linear-payoff synthetic — converges to optimal action,
    //         sublinear regret vs a seeded random policy
    // ------------------------------------------------------------------
    #[test]
    fn linear_payoff_convergence_sublinear_regret() {
        // Linear payoffs for all 5 actions; optimal is action 1 for every context.
        // r_a = ⟨θ*_a, x⟩ ; gap Δ = 2·x1 > 0 for the fixed context below.
        let mut theta_star = [[0.0_f32; N_FEATURES]; N_ACTIONS];
        theta_star[0][0] = 1.0;
        theta_star[0][1] = -1.0;
        theta_star[1][0] = 1.0;
        theta_star[1][1] = 1.0;
        // Actions 2..4 get strictly suboptimal linear payoffs.
        for (i, t) in theta_star.iter_mut().enumerate().skip(2) {
            t[i] = -0.5;
        }
        let context = [0.5_f32, 1.0, 0.3, 0.2, 0.1, 0.4, 0.6, 0.8];

        let payoff = |a: usize, x: &[f32; N_FEATURES]| {
            (0..N_FEATURES).map(|i| theta_star[a][i] * x[i]).sum::<f32>()
        };
        let optimal = payoff(1, &context);

        // --- LinUCB run (deterministic) ---
        let mut agent = LinUCBAgent::new();
        let horizon = 2000;
        let mut linucb_regret = 0.0_f32;
        let mut wrong_action_tail = 0_usize;
        for t in 0..horizon {
            let (a, _) = agent.select(&context);
            let r = payoff(a as usize, &context);
            linucb_regret += optimal - r;
            if a != 1 && t >= horizon / 2 {
                wrong_action_tail += 1;
            }
            agent.update(&context, a, r);
        }

        // --- Random policy baseline (seeded LCG) ---
        let mut state: u64 = 42;
        let mut rand_action = move || {
            state = state
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            ((state >> 33) % 2) as usize
        };
        let mut random_regret = 0.0_f32;
        for _ in 0..horizon {
            let a = rand_action();
            random_regret += optimal - payoff(a, &context);
        }

        assert!(
            linucb_regret < random_regret,
            "LinUCB regret {linucb_regret} must beat random regret {random_regret}"
        );
        // Sublinear regret: total regret grows slower than the horizon.
        // With gap Δ = 2·x1 = 2, the optimal-play regret bound is O(log T);
        // allow generous slack: < T/10.
        assert!(
            linucb_regret < (horizon as f32) / 10.0,
            "regret {linucb_regret} must be sublinear in horizon {horizon}"
        );
        // Convergence: no wrong action in the second half of the run.
        assert_eq!(
            wrong_action_tail, 0,
            "LinUCB must commit to the optimal action in the second half"
        );
    }

    // ------------------------------------------------------------------
    // Test 8: zero features produce valid (finite) Q values
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
    // Test 9: convergence — repeated positive rewards shift argmax
    // ------------------------------------------------------------------
    #[test]
    fn convergence_toward_rewarded_action() {
        // Closed loop: action 3 pays 1.0, all others 0.0.
        let features = [0.1, 0.9, 0.2, 0.8, 0.3, 0.7, 0.4, 0.6];
        let payoff = |a: usize| if a == 3 { 1.0 } else { 0.0 };

        let mut agent = LinUCBAgent::new();
        for _ in 0..1000 {
            let (a, _) = agent.select(&features);
            agent.update(&features, a, payoff(a as usize));
        }
        let (best, _) = agent.select(&features);
        assert_eq!(
            best, 3,
            "after 1000 rounds where action 3 pays 1.0 and others 0.0, argmax should be 3, got {best}"
        );
    }

    // ------------------------------------------------------------------
    // Test 10: multiple distinct actions — argmax tracks per-context payoff
    // ------------------------------------------------------------------
    #[test]
    fn argmax_differentiates_between_rewarded_actions() {
        // Closed loop over two contexts: ctx_a pays via action 2, ctx_b via action 4.
        let ctx_a = [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
        let ctx_b = [0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
        let payoff = |ctx: &[f32; N_FEATURES], a: usize| match (ctx[0] > 0.5, a) {
            (true, 2) => 1.0,
            (false, 4) => 1.0,
            _ => 0.0,
        };

        let mut agent = LinUCBAgent::new();
        for _ in 0..500 {
            for (ctx, expect) in [(&ctx_a, 2u32), (&ctx_b, 4u32)] {
                let (a, _) = agent.select(ctx);
                agent.update(ctx, a, payoff(ctx, a as usize));
            }
        }

        let (best_a, _) = agent.select(&ctx_a);
        let (best_b, _) = agent.select(&ctx_b);

        assert_eq!(best_a, 2, "context A should select action 2, got {best_a}");
        assert_eq!(best_b, 4, "context B should select action 4, got {best_b}");
    }
}
