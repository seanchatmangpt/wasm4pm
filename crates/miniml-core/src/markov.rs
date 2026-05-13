use wasm_bindgen::prelude::*;
use crate::error::MlError;
use crate::matrix::Rng;

// ============================================================
// Structs
// ============================================================

/// A discrete Markov chain with transition matrix and initial distribution
#[wasm_bindgen]
pub struct MarkovChain {
    n_states: usize,
    transition_matrix: Vec<f64>, // row-major n_states x n_states
    initial_distribution: Vec<f64>,
}

#[wasm_bindgen]
impl MarkovChain {
    #[wasm_bindgen(getter, js_name = "nStates")]
    pub fn n_states(&self) -> usize { self.n_states }

    /// Create a Markov chain from a flat row-major transition matrix and initial distribution.
    #[wasm_bindgen(js_name = "fromMatrix")]
    pub fn from_matrix(transition_matrix: &[f64], n_states: usize, initial_distribution: &[f64]) -> Result<MarkovChain, JsValue> {
        markov_chain_impl(transition_matrix, n_states, initial_distribution)
            .map_err(|e| JsValue::from_str(&e.message))
    }

    /// Compute the steady-state distribution (power iteration).
    #[wasm_bindgen(js_name = "steadyState")]
    pub fn steady_state(&self, max_iter: usize, tol: f64) -> Result<Vec<f64>, JsValue> {
        compute_steady_state_impl(&self.transition_matrix, self.n_states, max_iter, tol)
            .map_err(|e| JsValue::from_str(&e.message))
    }

    /// Compute the n-step transition probability matrix.
    #[wasm_bindgen(js_name = "nStepProbability")]
    pub fn n_step_probability(&self, n_steps: usize) -> Result<Vec<f64>, JsValue> {
        n_step_probability_impl(&self.transition_matrix, self.n_states, n_steps)
            .map_err(|e| JsValue::from_str(&e.message))
    }

    /// Simulate a trajectory of the chain.
    #[wasm_bindgen(js_name = "simulate")]
    pub fn simulate(&self, initial_state: usize, n_steps: usize, seed: u64) -> Vec<usize> {
        simulate_chain_impl(&self.transition_matrix, self.n_states, initial_state, n_steps, seed)
    }
}

/// Hidden Markov Model
#[wasm_bindgen]
pub struct HMM {
    n_states: usize,
    n_observations: usize,
    initial_probs: Vec<f64>,    // n_states
    transition_probs: Vec<f64>, // n_states x n_states (row-major)
    emission_probs: Vec<f64>,   // n_states x n_observations (row-major)
}

#[wasm_bindgen]
impl HMM {
    #[wasm_bindgen(getter, js_name = "nStates")]
    pub fn n_states(&self) -> usize { self.n_states }

    #[wasm_bindgen(getter, js_name = "nObservations")]
    pub fn n_observations(&self) -> usize { self.n_observations }

    /// Create an HMM from parameters.
    #[wasm_bindgen(js_name = "fromParams")]
    pub fn from_params(
        initial_probs: &[f64],
        transition_probs: &[f64],
        emission_probs: &[f64],
        n_states: usize,
        n_observations: usize,
    ) -> Result<HMM, JsValue> {
        hmm_from_params_impl(initial_probs, transition_probs, emission_probs, n_states, n_observations)
            .map_err(|e| JsValue::from_str(&e.message))
    }

    /// Forward algorithm — compute P(observations | model).
    #[wasm_bindgen(js_name = "forward")]
    pub fn forward(&self, observations: &[usize]) -> Result<f64, JsValue> {
        let (_, log_likelihood) = hmm_forward_impl(
            &self.initial_probs, &self.transition_probs, &self.emission_probs,
            observations, self.n_states, self.n_observations
        ).map_err(|e| JsValue::from_str(&e.message))?;
        Ok(log_likelihood)
    }

    /// Viterbi algorithm — find most likely state sequence.
    #[wasm_bindgen(js_name = "viterbi")]
    pub fn viterbi(&self, observations: &[usize]) -> Result<Vec<usize>, JsValue> {
        hmm_viterbi_impl(
            &self.initial_probs, &self.transition_probs, &self.emission_probs,
            observations, self.n_states, self.n_observations
        ).map_err(|e| JsValue::from_str(&e.message))
    }

    /// Train HMM using Baum-Welch (EM algorithm).
    #[wasm_bindgen(js_name = "train")]
    pub fn train(observations: &[usize], n_states: usize, n_obs_symbols: usize, max_iter: usize, tol: f64, seed: u64) -> Result<HMM, JsValue> {
        hmm_train_baum_welch_impl(observations, n_states, n_obs_symbols, max_iter, tol, seed)
            .map_err(|e| JsValue::from_str(&e.message))
    }
}

/// Result of MCMC sampling (Metropolis-Hastings)
#[wasm_bindgen]
pub struct MCMCResult {
    samples: Vec<f64>,
    acceptance_rate: f64,
    posterior_mean: f64,
    posterior_std: f64,
    ci_lower: f64,
    ci_upper: f64,
}

#[wasm_bindgen]
impl MCMCResult {
    #[wasm_bindgen(getter)]
    pub fn samples(&self) -> Vec<f64> { self.samples.clone() }

    #[wasm_bindgen(getter, js_name = "acceptanceRate")]
    pub fn acceptance_rate(&self) -> f64 { self.acceptance_rate }

    #[wasm_bindgen(getter, js_name = "posteriorMean")]
    pub fn posterior_mean(&self) -> f64 { self.posterior_mean }

    #[wasm_bindgen(getter, js_name = "posteriorStd")]
    pub fn posterior_std(&self) -> f64 { self.posterior_std }

    #[wasm_bindgen(getter, js_name = "ciLower")]
    pub fn ci_lower(&self) -> f64 { self.ci_lower }

    #[wasm_bindgen(getter, js_name = "ciUpper")]
    pub fn ci_upper(&self) -> f64 { self.ci_upper }
}

// ============================================================
// Pure Rust implementations
// ============================================================

/// Create a Markov chain from a transition matrix and initial distribution.
pub fn markov_chain_impl(
    transition_matrix: &[f64],
    n_states: usize,
    initial_distribution: &[f64],
) -> Result<MarkovChain, MlError> {
    if n_states == 0 {
        return Err(MlError::new("n_states must be > 0"));
    }
    if transition_matrix.len() != n_states * n_states {
        return Err(MlError::new("transition_matrix must have n_states^2 elements"));
    }
    if initial_distribution.len() != n_states {
        return Err(MlError::new("initial_distribution must have n_states elements"));
    }

    // Validate rows sum to ~1.0
    for i in 0..n_states {
        let row_sum: f64 = (0..n_states).map(|j| transition_matrix[i * n_states + j]).sum();
        if (row_sum - 1.0).abs() > 0.01 {
            return Err(MlError::new(&format!("Row {} of transition matrix sums to {} (expected 1.0)", i, row_sum)));
        }
    }

    // Validate initial distribution sums to ~1.0
    let init_sum: f64 = initial_distribution.iter().sum();
    if (init_sum - 1.0).abs() > 0.01 {
        return Err(MlError::new(&format!("initial_distribution sums to {} (expected 1.0)", init_sum)));
    }

    Ok(MarkovChain {
        n_states,
        transition_matrix: transition_matrix.to_vec(),
        initial_distribution: initial_distribution.to_vec(),
    })
}

/// Compute the steady-state distribution using power iteration.
/// Returns the stationary distribution vector.
pub fn compute_steady_state_impl(
    transition_matrix: &[f64],
    n_states: usize,
    max_iter: usize,
    tol: f64,
) -> Result<Vec<f64>, MlError> {
    if n_states == 0 {
        return Err(MlError::new("n_states must be > 0"));
    }
    if transition_matrix.len() != n_states * n_states {
        return Err(MlError::new("transition_matrix must have n_states^2 elements"));
    }
    if max_iter == 0 {
        return Err(MlError::new("max_iter must be > 0"));
    }

    // Initialize with uniform distribution
    let mut state = vec![1.0 / n_states as f64; n_states];

    for _ in 0..max_iter {
        // Multiply: new_state = state * P (row-stochastic, so new_state[j] = sum_i state[i] * P[i][j])
        let mut new_state = vec![0.0; n_states];
        for j in 0..n_states {
            for i in 0..n_states {
                new_state[j] += state[i] * transition_matrix[i * n_states + j];
            }
        }

        // Normalize
        let sum: f64 = new_state.iter().sum();
        if sum > 0.0 {
            for v in new_state.iter_mut() {
                *v /= sum;
            }
        }

        // Check convergence (max absolute change)
        let max_diff = state.iter().zip(new_state.iter())
            .map(|(a, b)| (a - b).abs())
            .fold(0.0_f64, f64::max);

        state = new_state;
        if max_diff < tol {
            break;
        }
    }

    Ok(state)
}

/// Compute the n-step transition probability matrix by repeated multiplication.
/// Returns a flat row-major n_states x n_states matrix.
pub fn n_step_probability_impl(
    transition_matrix: &[f64],
    n_states: usize,
    n_steps: usize,
) -> Result<Vec<f64>, MlError> {
    if n_states == 0 {
        return Err(MlError::new("n_states must be > 0"));
    }
    if transition_matrix.len() != n_states * n_states {
        return Err(MlError::new("transition_matrix must have n_states^2 elements"));
    }

    // Start with identity matrix
    let mut result = vec![0.0; n_states * n_states];
    for i in 0..n_states {
        result[i * n_states + i] = 1.0;
    }

    // Matrix exponentiation by squaring: result = P^n_steps
    let mut base = transition_matrix.to_vec();
    let mut steps = n_steps;

    while steps > 0 {
        if steps % 2 == 1 {
            result = mat_mul(&result, &base, n_states);
        }
        base = mat_mul(&base, &base, n_states);
        steps /= 2;
    }

    Ok(result)
}

/// Simulate a Markov chain trajectory.
pub fn simulate_chain_impl(
    transition_matrix: &[f64],
    n_states: usize,
    initial_state: usize,
    n_steps: usize,
    seed: u64,
) -> Vec<usize> {
    let mut rng = Rng::new(seed);
    let mut trajectory = Vec::with_capacity(n_steps);
    let mut current = initial_state;

    for _ in 0..n_steps {
        trajectory.push(current);
        let r = rng.next_f64();
        let mut cumsum = 0.0;
        for j in 0..n_states {
            cumsum += transition_matrix[current * n_states + j];
            if r <= cumsum {
                current = j;
                break;
            }
        }
    }

    trajectory
}

// ============================================================
// Hidden Markov Model implementations
// ============================================================

fn hmm_from_params_impl(
    initial_probs: &[f64],
    transition_probs: &[f64],
    emission_probs: &[f64],
    n_states: usize,
    n_observations: usize,
) -> Result<HMM, MlError> {
    if n_states == 0 || n_observations == 0 {
        return Err(MlError::new("n_states and n_observations must be > 0"));
    }
    if initial_probs.len() != n_states {
        return Err(MlError::new("initial_probs must have n_states elements"));
    }
    if transition_probs.len() != n_states * n_states {
        return Err(MlError::new("transition_probs must have n_states^2 elements"));
    }
    if emission_probs.len() != n_states * n_observations {
        return Err(MlError::new("emission_probs must have n_states * n_observations elements"));
    }

    Ok(HMM {
        n_states,
        n_observations,
        initial_probs: initial_probs.to_vec(),
        transition_probs: transition_probs.to_vec(),
        emission_probs: emission_probs.to_vec(),
    })
}

/// Forward algorithm with scaling to prevent underflow.
/// Returns (scaled forward probabilities at final step, log-likelihood).
pub fn hmm_forward_impl(
    initial: &[f64],
    transition: &[f64],
    emission: &[f64],
    observations: &[usize],
    n_states: usize,
    n_obs_symbols: usize,
) -> Result<(Vec<f64>, f64), MlError> {
    if observations.is_empty() {
        return Err(MlError::new("observations must not be empty"));
    }

    let t_len = observations.len();
    let mut alpha = vec![0.0; n_states];
    let mut scale = vec![0.0; t_len];

    // Initialization (t=0)
    let mut c = 0.0;
    for i in 0..n_states {
        alpha[i] = initial[i] * emission[i * n_obs_symbols + observations[0]];
        c += alpha[i];
    }
    if c == 0.0 {
        return Err(MlError::new("Zero probability at t=0 — check initial/emission probs"));
    }
    scale[0] = c;
    for v in alpha.iter_mut() {
        *v /= c;
    }

    // Induction
    for t in 1..t_len {
        let mut new_alpha = vec![0.0; n_states];
        c = 0.0;
        for j in 0..n_states {
            let mut sum = 0.0;
            for i in 0..n_states {
                sum += alpha[i] * transition[i * n_states + j];
            }
            new_alpha[j] = sum * emission[j * n_obs_symbols + observations[t]];
            c += new_alpha[j];
        }
        if c == 0.0 {
            return Err(MlError::new(&format!("Zero probability at t={}", t)));
        }
        scale[t] = c;
        for v in new_alpha.iter_mut() {
            *v /= c;
        }
        alpha = new_alpha;
    }

    // Log-likelihood = -sum(log(scale))
    let log_likelihood: f64 = scale.iter().map(|s| s.ln()).sum();

    Ok((alpha, -log_likelihood))
}

/// Backward algorithm with scaling.
pub fn hmm_backward_impl(
    initial: &[f64],
    transition: &[f64],
    emission: &[f64],
    observations: &[usize],
    n_states: usize,
    n_obs_symbols: usize,
) -> Result<Vec<f64>, MlError> {
    if observations.is_empty() {
        return Err(MlError::new("observations must not be empty"));
    }

    let t_len = observations.len();
    let mut scale = vec![0.0; t_len];

    // Compute forward scales for backward scaling
    let mut alpha = vec![0.0; n_states];
    let mut c = 0.0;
    for i in 0..n_states {
        alpha[i] = initial[i] * emission[i * n_obs_symbols + observations[0]];
        c += alpha[i];
    }
    if c == 0.0 { return Err(MlError::new("Zero probability")); }
    scale[0] = c;
    for v in alpha.iter_mut() { *v /= c; }

    for t in 1..t_len {
        let mut new_alpha = vec![0.0; n_states];
        c = 0.0;
        for j in 0..n_states {
            let mut sum = 0.0;
            for i in 0..n_states {
                sum += alpha[i] * transition[i * n_states + j];
            }
            new_alpha[j] = sum * emission[j * n_obs_symbols + observations[t]];
            c += new_alpha[j];
        }
        if c == 0.0 { return Err(MlError::new("Zero probability")); }
        scale[t] = c;
        for v in new_alpha.iter_mut() { *v /= c; }
        alpha = new_alpha;
    }

    // Backward pass
    let mut beta = vec![1.0; n_states];
    for v in beta.iter_mut() { *v /= scale[t_len - 1]; }

    for t in (0..t_len - 1).rev() {
        let mut new_beta = vec![0.0; n_states];
        for i in 0..n_states {
            let mut sum = 0.0;
            for j in 0..n_states {
                sum += transition[i * n_states + j] * emission[j * n_obs_symbols + observations[t + 1]] * beta[j];
            }
            new_beta[i] = sum / scale[t];
        }
        beta = new_beta;
    }

    Ok(beta)
}

/// Viterbi algorithm — find most likely state sequence.
pub fn hmm_viterbi_impl(
    initial: &[f64],
    transition: &[f64],
    emission: &[f64],
    observations: &[usize],
    n_states: usize,
    n_obs_symbols: usize,
) -> Result<Vec<usize>, MlError> {
    if observations.is_empty() {
        return Err(MlError::new("observations must not be empty"));
    }

    let t_len = observations.len();
    let neg_inf = f64::NEG_INFINITY;

    // Viterbi trellis: delta[t][i] = max prob of being in state i at time t
    let mut delta = vec![0.0; n_states];
    let mut psi = vec![vec![0usize; n_states]; t_len]; // backtrace

    // Initialization
    for i in 0..n_states {
        let p = initial[i] * emission[i * n_obs_symbols + observations[0]];
        delta[i] = if p > 0.0 { p.ln() } else { neg_inf };
    }

    // Recursion
    for t in 1..t_len {
        let mut new_delta = vec![neg_inf; n_states];
        for j in 0..n_states {
            let mut max_val = neg_inf;
            let mut max_idx = 0;
            for i in 0..n_states {
                let val = delta[i] + transition[i * n_states + j].ln().max(neg_inf)
                    + emission[j * n_obs_symbols + observations[t]].ln().max(neg_inf);
                if val > max_val {
                    max_val = val;
                    max_idx = i;
                }
            }
            new_delta[j] = max_val;
            psi[t][j] = max_idx;
        }
        delta = new_delta;
    }

    // Backtrace
    let mut path = vec![0usize; t_len];
    let mut max_val = neg_inf;
    for i in 0..n_states {
        if delta[i] > max_val {
            max_val = delta[i];
            path[t_len - 1] = i;
        }
    }

    for t in (0..t_len - 1).rev() {
        path[t] = psi[t + 1][path[t + 1]];
    }

    Ok(path)
}

/// Train HMM using Baum-Welch (EM) algorithm.
pub fn hmm_train_baum_welch_impl(
    observations: &[usize],
    n_states: usize,
    n_obs_symbols: usize,
    max_iter: usize,
    tol: f64,
    seed: u64,
) -> Result<HMM, MlError> {
    if observations.is_empty() {
        return Err(MlError::new("observations must not be empty"));
    }
    if n_states == 0 || n_obs_symbols == 0 {
        return Err(MlError::new("n_states and n_obs_symbols must be > 0"));
    }

    let mut rng = Rng::new(seed);
    let t_len = observations.len();

    // Initialize parameters randomly but validly
    let mut initial = random_simplex(&mut rng, n_states);
    let mut transition = random_stochastic_matrix(&mut rng, n_states);
    let emission = random_stochastic_matrix(&mut rng, n_states);
    // Reshape emission to n_states x n_obs_symbols
    let mut emission_mat = vec![0.0; n_states * n_obs_symbols];
    for i in 0..n_states {
        for j in 0..n_obs_symbols {
            emission_mat[i * n_obs_symbols + j] = emission[i * n_states + j % n_states];
        }
    }

    let mut prev_ll = f64::NEG_INFINITY;

    for _iter in 0..max_iter {
        // E-step: forward-backward
        let (alpha, ll) = match hmm_forward_impl(&initial, &transition, &emission_mat, observations, n_states, n_obs_symbols) {
            Ok(r) => r,
            Err(_) => continue, // skip if zero probability
        };

        let beta = match hmm_backward_impl(&initial, &transition, &emission_mat, observations, n_states, n_obs_symbols) {
            Ok(r) => r,
            Err(_) => continue,
        };

        // Check convergence
        if (ll - prev_ll).abs() < tol {
            break;
        }
        prev_ll = ll;

        // Compute gamma: gamma[t][i] = P(state_i at time t | observations)
        let mut gamma = vec![vec![0.0; n_states]; t_len];
        for t in 0..t_len {
            let sum: f64 = (0..n_states).map(|i| alpha[i] * beta[i]).sum();
            if sum > 0.0 {
                for i in 0..n_states {
                    gamma[t][i] = alpha[i] * beta[i] / sum;
                }
            }
        }

        // Compute xi: xi[t][i][j] = P(state_i at t, state_j at t+1 | observations)
        let mut xi = vec![vec![0.0; n_states]; n_states];
        for t in 0..t_len.saturating_sub(1) {
            let obs_next = observations[t + 1];
            let mut denom = 0.0;
            for i in 0..n_states {
                for j in 0..n_states {
                    denom += alpha[i] * transition[i * n_states + j]
                        * emission_mat[j * n_obs_symbols + obs_next] * beta[j];
                }
            }
            if denom > 0.0 {
                for i in 0..n_states {
                    for j in 0..n_states {
                        xi[i][j] = alpha[i] * transition[i * n_states + j]
                            * emission_mat[j * n_obs_symbols + obs_next] * beta[j] / denom;
                    }
                }
            }
        }

        // M-step
        // Update initial probs
        for i in 0..n_states {
            initial[i] = gamma[0][i];
        }

        // Update transition probs
        for i in 0..n_states {
            let gamma_sum: f64 = (0..t_len.saturating_sub(1)).map(|t| gamma[t][i]).sum();
            for j in 0..n_states {
                let xi_sum: f64 = (0..t_len.saturating_sub(1)).map(|_| xi[i][j]).sum();
                transition[i * n_states + j] = if gamma_sum > 0.0 { xi_sum / gamma_sum } else { 0.0 };
            }
        }

        // Update emission probs
        for i in 0..n_states {
            let gamma_sum: f64 = (0..t_len).map(|t| gamma[t][i]).sum();
            for k in 0..n_obs_symbols {
                let numer: f64 = (0..t_len)
                    .filter(|&t| observations[t] == k)
                    .map(|t| gamma[t][i])
                    .sum();
                emission_mat[i * n_obs_symbols + k] = if gamma_sum > 0.0 { numer / gamma_sum } else { 1.0 / n_obs_symbols as f64 };
            }
        }
    }

    Ok(HMM {
        n_states,
        n_observations: n_obs_symbols,
        initial_probs: initial,
        transition_probs: transition,
        emission_probs: emission_mat,
    })
}

// ============================================================
// MCMC: Metropolis-Hastings
// ============================================================

/// Metropolis-Hastings MCMC sampler for a 1D target distribution.
///
/// `log_target_fn` should return the log of the (unnormalized) target density at x.
/// Uses a Gaussian random walk proposal.
pub fn metropolis_hastings_impl<F>(
    log_target_fn: F,
    proposal_sd: f64,
    n_samples: usize,
    burn_in: usize,
    seed: u64,
    initial: f64,
) -> Result<MCMCResult, MlError>
where
    F: Fn(f64) -> f64,
{
    if n_samples == 0 {
        return Err(MlError::new("n_samples must be > 0"));
    }
    if proposal_sd <= 0.0 {
        return Err(MlError::new("proposal_sd must be > 0"));
    }

    let mut rng = Rng::new(seed);
    let total = burn_in + n_samples;
    let mut samples = Vec::with_capacity(n_samples);
    let mut current = initial;
    let mut current_log_p = log_target_fn(current);
    let mut accepted = 0usize;

    for i in 0..total {
        // Propose: current + N(0, proposal_sd)
        let proposal = current + box_muller(&mut rng) * proposal_sd;
        let proposal_log_p = log_target_fn(proposal);

        // Accept/reject
        let log_alpha = proposal_log_p - current_log_p;
        if log_alpha > 0.0 || rng.next_f64() < log_alpha.exp() {
            current = proposal;
            current_log_p = proposal_log_p;
            if i >= burn_in {
                accepted += 1;
            }
        }

        if i >= burn_in {
            samples.push(current);
        }
    }

    // Compute posterior statistics
    let n = samples.len();
    let mean: f64 = samples.iter().sum::<f64>() / n as f64;
    let variance: f64 = samples.iter().map(|x| (x - mean) * (x - mean)).sum::<f64>() / (n as f64 - 1.0).max(1.0);
    let std = variance.sqrt();

    // 95% credible interval (percentile method)
    let mut sorted = samples.clone();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let ci_lower = sorted[(0.025 * n as f64) as usize];
    let ci_upper = sorted[(0.975 * n as f64) as usize];

    let acceptance_rate = accepted as f64 / n_samples as f64;

    Ok(MCMCResult {
        samples,
        acceptance_rate,
        posterior_mean: mean,
        posterior_std: std,
        ci_lower,
        ci_upper,
    })
}

// ============================================================
// Utility functions
// ============================================================

/// Matrix multiplication for n x n matrices (flat row-major).
fn mat_mul(a: &[f64], b: &[f64], n: usize) -> Vec<f64> {
    let mut result = vec![0.0; n * n];
    for i in 0..n {
        for k in 0..n {
            let a_ik = a[i * n + k];
            if a_ik == 0.0 { continue; }
            for j in 0..n {
                result[i * n + j] += a_ik * b[k * n + j];
            }
        }
    }
    result
}

/// Generate a random simplex (vector of non-negative values summing to 1).
fn random_simplex(rng: &mut Rng, n: usize) -> Vec<f64> {
    let mut vals: Vec<f64> = (0..n).map(|_| rng.next_f64()).collect();
    let sum: f64 = vals.iter().sum();
    if sum > 0.0 {
        for v in vals.iter_mut() { *v /= sum; }
    } else {
        vals = vec![1.0 / n as f64; n];
    }
    vals
}

/// Generate a random row-stochastic matrix.
fn random_stochastic_matrix(rng: &mut Rng, n: usize) -> Vec<f64> {
    let mut mat = vec![0.0; n * n];
    for i in 0..n {
        let row = random_simplex(rng, n);
        for j in 0..n {
            mat[i * n + j] = row[j];
        }
    }
    mat
}

/// Box-Muller transform for standard normal samples.
fn box_muller(rng: &mut Rng) -> f64 {
    let u1 = rng.next_f64().max(1e-30);
    let u2 = rng.next_f64();
    (-2.0 * u1.ln()).sqrt() * (2.0 * std::f64::consts::PI * u2).cos()
}

// ============================================================
// Tests
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_steady_state_uniform() {
        // 2-state chain with equal transition probability -> steady state is [0.5, 0.5]
        let tm = vec![0.5, 0.5, 0.5, 0.5];
        let ss = compute_steady_state_impl(&tm, 2, 1000, 1e-10).unwrap();
        assert!((ss[0] - 0.5).abs() < 0.01);
        assert!((ss[1] - 0.5).abs() < 0.01);
    }

    #[test]
    fn test_steady_state_asymmetric() {
        // 2-state chain: stay in 0 with prob 0.9, stay in 1 with prob 0.7
        // Steady state: pi[0] = 0.75, pi[1] = 0.25 (from pi*P = pi)
        let tm = vec![0.9, 0.1, 0.3, 0.7];
        let ss = compute_steady_state_impl(&tm, 2, 1000, 1e-10).unwrap();
        assert!((ss[0] - 0.75).abs() < 0.01, "ss[0] = {}, expected {}", ss[0], 0.75);
        assert!((ss[1] - 0.25).abs() < 0.01, "ss[1] = {}, expected {}", ss[1], 0.25);
    }

    #[test]
    fn test_n_step_identity() {
        // P^0 should be identity
        let tm = vec![0.9, 0.1, 0.3, 0.7];
        let result = n_step_probability_impl(&tm, 2, 0).unwrap();
        assert!((result[0] - 1.0).abs() < 1e-10);
        assert!((result[1]).abs() < 1e-10);
        assert!((result[2]).abs() < 1e-10);
        assert!((result[3] - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_n_step_one() {
        // P^1 should equal P
        let tm = vec![0.9, 0.1, 0.3, 0.7];
        let result = n_step_probability_impl(&tm, 2, 1).unwrap();
        for i in 0..4 {
            assert!((result[i] - tm[i]).abs() < 1e-10);
        }
    }

    #[test]
    fn test_n_step_converges_to_steady() {
        // P^100 should approximate steady state rows
        let tm = vec![0.9, 0.1, 0.3, 0.7];
        let result = n_step_probability_impl(&tm, 2, 100).unwrap();
        let ss = compute_steady_state_impl(&tm, 2, 1000, 1e-10).unwrap();
        // Each row of P^100 should be approximately the steady state
        for i in 0..2 {
            for j in 0..2 {
                assert!((result[i * 2 + j] - ss[j]).abs() < 0.01,
                    "P^100[{}][{}] = {}, expected ~{}", i, j, result[i * 2 + j], ss[j]);
            }
        }
    }

    #[test]
    fn test_simulate_chain_deterministic() {
        let tm = vec![0.0, 1.0, 1.0, 0.0]; // deterministic alternating
        let traj = simulate_chain_impl(&tm, 2, 0, 10, 42);
        assert_eq!(traj.len(), 10);
        // Starting at 0: 0, 1, 0, 1, 0, 1, ...
        for (i, &s) in traj.iter().enumerate() {
            assert_eq!(s, i % 2);
        }
    }

    #[test]
    fn test_simulate_chain_length() {
        let tm = vec![0.5, 0.5, 0.5, 0.5];
        let traj = simulate_chain_impl(&tm, 2, 0, 100, 42);
        assert_eq!(traj.len(), 100);
    }

    #[test]
    fn test_markov_chain_validation() {
        // Invalid: row doesn't sum to 1
        let bad_tm2 = vec![0.5, 0.5, 0.3, 0.3]; // sums to 1.0 and 0.6
        let result = markov_chain_impl(&bad_tm2, 2, &[0.5, 0.5]);
        assert!(result.is_err());
    }

    #[test]
    fn test_hmm_forward_simple() {
        // 2 states, 2 observation symbols
        // Always in state 0, always emit 0
        let initial = vec![1.0, 0.0];
        let transition = vec![1.0, 0.0, 0.0, 1.0];
        let emission = vec![1.0, 0.0, 0.0, 1.0];
        let obs = vec![0, 0, 0];

        let (_, ll) = hmm_forward_impl(&initial, &transition, &emission, &obs, 2, 2).unwrap();
        // log-likelihood should be 0 (probability = 1.0)
        assert!(ll.abs() < 1e-6, "log-likelihood should be ~0, got {}", ll);
    }

    #[test]
    fn test_hmm_viterbi_deterministic() {
        // Always state 0, always emit 0
        let initial = vec![1.0, 0.0];
        let transition = vec![1.0, 0.0, 0.0, 1.0];
        let emission = vec![1.0, 0.0, 0.0, 1.0];
        let obs = vec![0, 0, 0, 0, 0];

        let path = hmm_viterbi_impl(&initial, &transition, &emission, &obs, 2, 2).unwrap();
        assert_eq!(path.len(), 5);
        for &s in &path {
            assert_eq!(s, 0);
        }
    }

    #[test]
    fn test_hmm_backward_simple() {
        let initial = vec![1.0, 0.0];
        let transition = vec![1.0, 0.0, 0.0, 1.0];
        let emission = vec![1.0, 0.0, 0.0, 1.0];
        let obs = vec![0, 0, 0];

        let beta = hmm_backward_impl(&initial, &transition, &emission, &obs, 2, 2).unwrap();
        assert_eq!(beta.len(), 2);
    }

    #[test]
    fn test_metropolis_hastings_normal() {
        // Target: N(0, 1). Log density: -x^2/2 + const
        let log_normal = |x: f64| -x * x / 2.0;
        let result = metropolis_hastings_impl(log_normal, 1.0, 10000, 1000, 42, 0.0).unwrap();

        assert!((result.posterior_mean - 0.0).abs() < 0.15,
            "posterior mean should be ~0, got {}", result.posterior_mean);
        assert!((result.posterior_std - 1.0).abs() < 0.15,
            "posterior std should be ~1, got {}", result.posterior_std);
        assert!(result.acceptance_rate > 0.1 && result.acceptance_rate < 0.9,
            "acceptance rate should be reasonable, got {}", result.acceptance_rate);
        assert!(result.ci_lower < result.ci_upper);
    }

    #[test]
    fn test_metropolis_hastings_deterministic() {
        let log_normal = |x: f64| -x * x / 2.0;
        let r1 = metropolis_hastings_impl(log_normal, 1.0, 1000, 100, 42, 0.0).unwrap();
        let r2 = metropolis_hastings_impl(log_normal, 1.0, 1000, 100, 42, 0.0).unwrap();
        assert_eq!(r1.posterior_mean, r2.posterior_mean);
    }

    #[test]
    fn test_metropolis_hastings_errors() {
        let f = |x: f64| -x * x;
        assert!(metropolis_hastings_impl(f, 0.0, 100, 10, 42, 0.0).is_err());
        assert!(metropolis_hastings_impl(f, 1.0, 0, 10, 42, 0.0).is_err());
    }

    #[test]
    fn test_box_muller() {
        let mut rng = Rng::new(42);
        let mut sum = 0.0;
        let mut sum_sq = 0.0;
        let n = 10000;
        for _ in 0..n {
            let x = box_muller(&mut rng);
            sum += x;
            sum_sq += x * x;
        }
        let mean = sum / n as f64;
        let variance = sum_sq / n as f64 - mean * mean;
        // Mean should be ~0, variance ~1
        assert!(mean.abs() < 0.1, "Box-Muller mean should be ~0, got {}", mean);
        assert!((variance - 1.0).abs() < 0.1, "Box-Muller variance should be ~1, got {}", variance);
    }
}
