//! # Self-Healing Automation (WASM-compatible)
//!
//! Ported from knhk/rust/knhk-autonomic/src/self_healing.rs
//!
//! **Covenant 7**: Continuous Improvement - Self-healing at machine speed
//!
//! This module implements automated recovery from common failures with:
//! - Circuit breakers for external dependencies
//! - Retry policies with exponential backoff
//! - Health check based auto-remediation
//! - Graceful degradation under failure
//!
//! ## WASM Adaptations
//!
//! - `std::time::Instant` replaced with monotonic step counter (`u64`)
//! - `std::time::Duration` replaced with millisecond-based `u64` values
//! - `tokio::time::sleep` replaced with step counter (caller-driven)
//! - `rand::random` replaced with `fastrand` (WASM-compatible)
//! - `async` methods removed (WASM is single-threaded)

use std::collections::HashMap;

// ---------------------------------------------------------------------------
// Monotonic clock stub
// ---------------------------------------------------------------------------

/// Global monotonic step counter. In a real WASM runtime this would be
/// `performance.now()` or a JS `Date.now()` bridge. For pure-Rust / test
/// usage we expose a simple atomic counter that the caller increments.
static STEP_COUNTER: std::sync::atomic::AtomicU64 =
    std::sync::atomic::AtomicU64::new(0);

/// Return the current monotonic "instant" (step count).
#[allow(dead_code)]
pub fn now_ms() -> u64 {
    // In browser WASM this could be `js_sys::Date::now()` — keeping it
    // pure-Rust so `cargo test --lib` still works without wasm-bindgen.
    STEP_COUNTER.load(std::sync::atomic::Ordering::SeqCst)
}

/// Advance the monotonic clock by `delta_ms` milliseconds.
/// This is the WASM-safe replacement for `tokio::time::sleep`.
#[allow(dead_code)]
pub fn advance_clock(delta_ms: u64) {
    STEP_COUNTER.fetch_add(delta_ms, std::sync::atomic::Ordering::SeqCst);
}

/// Reset the monotonic clock to zero (useful in tests).
#[allow(dead_code)]
pub fn reset_clock() {
    STEP_COUNTER.store(0, std::sync::atomic::Ordering::SeqCst);
}

// ---------------------------------------------------------------------------
// Error types (local, no cross-crate dependency)
// ---------------------------------------------------------------------------

/// Errors produced by the self-healing subsystem.
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub enum SelfHealingError {
    /// Named circuit breaker was not found.
    CircuitBreakerNotFound(String),
    /// Circuit is open and rejecting requests.
    CircuitOpen(String),
    /// The underlying operation failed.
    OperationFailed(String),
    /// All retry attempts exhausted.
    MaxRetriesExceeded { attempts: u32, error: String },
}

impl std::fmt::Display for SelfHealingError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::CircuitBreakerNotFound(name) => {
                write!(f, "circuit breaker not found: {}", name)
            }
            Self::CircuitOpen(name) => write!(f, "circuit open: {}", name),
            Self::OperationFailed(msg) => write!(f, "operation failed: {}", msg),
            Self::MaxRetriesExceeded { attempts, error } => {
                write!(f, "max retries exceeded ({}): {}", attempts, error)
            }
        }
    }
}

impl std::error::Error for SelfHealingError {}

// ---------------------------------------------------------------------------
// Circuit Breaker
// ---------------------------------------------------------------------------

/// Circuit breaker state.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(dead_code)]
pub enum CircuitState {
    /// Normal operation — requests flow through.
    Closed,
    /// Failing — reject requests.
    Open,
    /// Testing if recovery is possible.
    HalfOpen,
}

/// Circuit breaker configuration.
///
/// All durations are in **milliseconds** (WASM has no `std::time::Duration`).
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct CircuitBreakerConfig {
    /// Failure threshold before opening circuit.
    pub failure_threshold: u32,
    /// Success threshold to close circuit in half-open state.
    pub success_threshold: u32,
    /// Timeout (ms) before attempting half-open.
    pub open_timeout_ms: u64,
    /// Half-open timeout (ms) before returning to open.
    pub half_open_timeout_ms: u64,
}

impl Default for CircuitBreakerConfig {
    fn default() -> Self {
        Self {
            failure_threshold: 5,
            success_threshold: 2,
            open_timeout_ms: 60_000,
            half_open_timeout_ms: 30_000,
        }
    }
}

/// Circuit breaker for external dependency protection.
#[derive(Debug)]
#[allow(dead_code)]
pub struct CircuitBreaker {
    config: CircuitBreakerConfig,
    state: CircuitState,
    failure_count: u32,
    success_count: u32,
    /// Monotonic step at which the last state transition happened.
    last_state_change_ms: u64,
}

impl CircuitBreaker {
    /// Create new circuit breaker with default config.
    #[allow(dead_code)]
    pub fn new() -> Self {
        Self::with_config(CircuitBreakerConfig::default())
    }

    /// Create new circuit breaker with custom config.
    #[allow(dead_code)]
    pub fn with_config(config: CircuitBreakerConfig) -> Self {
        Self {
            config,
            state: CircuitState::Closed,
            failure_count: 0,
            success_count: 0,
            last_state_change_ms: now_ms(),
        }
    }

    /// Record a successful call.
    #[allow(dead_code)]
    pub fn record_success(&mut self) {
        match self.state {
            CircuitState::Closed => {
                // Reset failure count on success.
                self.failure_count = 0;
            }
            CircuitState::HalfOpen => {
                self.success_count += 1;
                if self.success_count >= self.config.success_threshold {
                    self.transition_to(CircuitState::Closed);
                }
            }
            CircuitState::Open => {
                // Should not happen — calls should be rejected in open state.
            }
        }
    }

    /// Record a failed call.
    #[allow(dead_code)]
    pub fn record_failure(&mut self) {
        self.failure_count += 1;

        match self.state {
            CircuitState::Closed => {
                if self.failure_count >= self.config.failure_threshold {
                    self.transition_to(CircuitState::Open);
                }
            }
            CircuitState::HalfOpen => {
                // Any failure in half-open returns to open.
                self.transition_to(CircuitState::Open);
            }
            CircuitState::Open => {
                // Already open, just update failure count.
            }
        }
    }

    /// Check if a call should be allowed.
    #[allow(dead_code)]
    pub fn allow_request(&mut self) -> bool {
        let current_ms = now_ms();

        match self.state {
            CircuitState::Closed => true,
            CircuitState::Open => {
                // Check if timeout has elapsed.
                if current_ms.saturating_sub(self.last_state_change_ms)
                    >= self.config.open_timeout_ms
                {
                    self.transition_to(CircuitState::HalfOpen);
                    true
                } else {
                    false
                }
            }
            CircuitState::HalfOpen => {
                // Check if half-open timeout has elapsed.
                if current_ms.saturating_sub(self.last_state_change_ms)
                    >= self.config.half_open_timeout_ms
                {
                    self.transition_to(CircuitState::Open);
                    false
                } else {
                    true
                }
            }
        }
    }

    /// Get current circuit state.
    #[allow(dead_code)]
    pub fn state(&self) -> CircuitState {
        self.state
    }

    /// Get failure count.
    #[allow(dead_code)]
    pub fn failure_count(&self) -> u32 {
        self.failure_count
    }

    /// Get success count.
    #[allow(dead_code)]
    pub fn success_count(&self) -> u32 {
        self.success_count
    }

    /// Transition to new state.
    fn transition_to(&mut self, new_state: CircuitState) {
        self.state = new_state;
        self.last_state_change_ms = now_ms();

        // Reset counters on state transition.
        match new_state {
            CircuitState::Closed => {
                self.failure_count = 0;
                self.success_count = 0;
            }
            CircuitState::Open => {
                self.success_count = 0;
            }
            CircuitState::HalfOpen => {
                self.success_count = 0;
            }
        }
    }
}

impl Default for CircuitBreaker {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Retry Policy
// ---------------------------------------------------------------------------

/// Retry policy configuration.
///
/// Durations stored as **milliseconds**.
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct RetryPolicy {
    /// Maximum number of retry attempts.
    pub max_attempts: u32,
    /// Initial backoff in milliseconds.
    pub initial_backoff_ms: u64,
    /// Backoff multiplier for exponential backoff.
    pub backoff_multiplier: f64,
    /// Maximum backoff in milliseconds.
    pub max_backoff_ms: u64,
    /// Whether to add jitter to backoff.
    pub jitter: bool,
}

impl Default for RetryPolicy {
    fn default() -> Self {
        Self {
            max_attempts: 3,
            initial_backoff_ms: 100,
            backoff_multiplier: 2.0,
            max_backoff_ms: 10_000,
            jitter: true,
        }
    }
}

/// Retry state tracker.
#[derive(Debug)]
#[allow(dead_code)]
pub struct RetryState {
    attempts: u32,
    current_backoff_ms: u64,
}

impl RetryState {
    /// Create new retry state with a given initial backoff (milliseconds).
    #[allow(dead_code)]
    pub fn new(initial_backoff_ms: u64) -> Self {
        Self {
            attempts: 0,
            current_backoff_ms: initial_backoff_ms,
        }
    }

    /// Increment attempt count and calculate next backoff.
    ///
    /// Returns `Some(backoff_ms)` when a retry is allowed, or `None` when
    /// the policy is exhausted.
    ///
    /// First call returns `initial_backoff_ms`, subsequent calls multiply by
    /// `backoff_multiplier` (exponential backoff).
    #[allow(dead_code)]
    pub fn next_attempt(&mut self, policy: &RetryPolicy) -> Option<u64> {
        self.attempts += 1;

        if self.attempts > policy.max_attempts {
            return None;
        }

        // Start with current backoff, then prepare next one.
        let base_backoff = self.current_backoff_ms;

        // Prepare next backoff (exponential increase) for subsequent calls.
        let next_backoff = (self.current_backoff_ms as f64 * policy.backoff_multiplier) as u64;
        self.current_backoff_ms = next_backoff.min(policy.max_backoff_ms);

        // Apply jitter (+/-25 %) using fastrand (WASM-safe).
        let final_backoff = if policy.jitter {
            let jitter_range = (base_backoff as f64 * 0.25) as u64;
            let jitter_ms =
                (fastrand::u64(..) % (2 * jitter_range + 1)) as i64 - jitter_range as i64;
            let base_ms = base_backoff as i64;
            (base_ms + jitter_ms).max(0) as u64
        } else {
            base_backoff
        };

        Some(final_backoff)
    }

    /// Get current attempt count (1-indexed).
    #[allow(dead_code)]
    pub fn attempts(&self) -> u32 {
        self.attempts
    }
}

impl Default for RetryState {
    fn default() -> Self {
        Self::new(100) // match original hardcoded initial backoff
    }
}

// ---------------------------------------------------------------------------
// Health Check
// ---------------------------------------------------------------------------

/// Health check result.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(dead_code)]
pub enum HealthStatus {
    /// Service is healthy.
    Healthy,
    /// Service is degraded but functional.
    Degraded,
    /// Service is unhealthy.
    Unhealthy,
}

/// Health check configuration.
///
/// Durations stored as **milliseconds**.
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct HealthCheckConfig {
    /// Timeout for health check (ms).
    pub timeout_ms: u64,
    /// Interval between health checks (ms).
    pub interval_ms: u64,
    /// Number of consecutive failures before marking unhealthy.
    pub unhealthy_threshold: u32,
    /// Number of consecutive successes before marking healthy.
    pub healthy_threshold: u32,
}

impl Default for HealthCheckConfig {
    fn default() -> Self {
        Self {
            timeout_ms: 5_000,
            interval_ms: 30_000,
            unhealthy_threshold: 3,
            healthy_threshold: 2,
        }
    }
}

/// Health check for service monitoring.
#[derive(Debug)]
#[allow(dead_code)]
pub struct HealthCheck {
    config: HealthCheckConfig,
    status: HealthStatus,
    consecutive_failures: u32,
    consecutive_successes: u32,
    /// Monotonic step of the last check, or `None` if never checked.
    last_check_ms: Option<u64>,
}

impl HealthCheck {
    /// Create new health check with default config.
    #[allow(dead_code)]
    pub fn new() -> Self {
        Self::with_config(HealthCheckConfig::default())
    }

    /// Create new health check with custom config.
    #[allow(dead_code)]
    pub fn with_config(config: HealthCheckConfig) -> Self {
        Self {
            config,
            status: HealthStatus::Healthy,
            consecutive_failures: 0,
            consecutive_successes: 0,
            last_check_ms: None,
        }
    }

    /// Record health check result.
    #[allow(dead_code)]
    pub fn record_result(&mut self, is_healthy: bool) {
        self.last_check_ms = Some(now_ms());

        if is_healthy {
            self.consecutive_failures = 0;
            self.consecutive_successes += 1;

            if self.consecutive_successes >= self.config.healthy_threshold {
                self.status = HealthStatus::Healthy;
            }
        } else {
            self.consecutive_successes = 0;
            self.consecutive_failures += 1;

            if self.consecutive_failures >= self.config.unhealthy_threshold {
                self.status = HealthStatus::Unhealthy;
            }
        }
    }

    /// Get current health status.
    #[allow(dead_code)]
    pub fn status(&self) -> HealthStatus {
        self.status
    }

    /// Check if health check is due (never checked, or interval elapsed).
    #[allow(dead_code)]
    pub fn is_due(&self) -> bool {
        match self.last_check_ms {
            Some(last) => {
                now_ms().saturating_sub(last) >= self.config.interval_ms
            }
            None => true,
        }
    }

    /// Get milliseconds until next check is due.
    #[allow(dead_code)]
    pub fn time_until_next_check_ms(&self) -> Option<u64> {
        self.last_check_ms.map(|last| {
            self.config
                .interval_ms
                .saturating_sub(now_ms().saturating_sub(last))
        })
    }
}

impl Default for HealthCheck {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Self-Healing Manager
// ---------------------------------------------------------------------------

/// Self-healing manager — coordinates circuit breakers and health checks.
#[derive(Debug)]
#[allow(dead_code)]
pub struct SelfHealingManager {
    circuit_breakers: HashMap<String, CircuitBreaker>,
    health_checks: HashMap<String, HealthCheck>,
}

impl SelfHealingManager {
    /// Create new self-healing manager.
    #[allow(dead_code)]
    pub fn new() -> Self {
        Self {
            circuit_breakers: HashMap::new(),
            health_checks: HashMap::new(),
        }
    }

    /// Add circuit breaker for a dependency.
    #[allow(dead_code)]
    pub fn add_circuit_breaker(&mut self, name: String, breaker: CircuitBreaker) {
        self.circuit_breakers.insert(name, breaker);
    }

    /// Add health check for a service.
    #[allow(dead_code)]
    pub fn add_health_check(&mut self, name: String, check: HealthCheck) {
        self.health_checks.insert(name, check);
    }

    /// Get mutable reference to a circuit breaker by name.
    #[allow(dead_code)]
    pub fn circuit_breaker(&mut self, name: &str) -> Option<&mut CircuitBreaker> {
        self.circuit_breakers.get_mut(name)
    }

    /// Get mutable reference to a health check by name.
    #[allow(dead_code)]
    pub fn health_check(&mut self, name: &str) -> Option<&mut HealthCheck> {
        self.health_checks.get_mut(name)
    }

    /// Execute operation with circuit breaker protection (synchronous, WASM-compatible).
    #[allow(dead_code)]
    pub fn execute_with_circuit_breaker<F, T, E>(
        &mut self,
        name: &str,
        operation: F,
    ) -> std::result::Result<T, SelfHealingError>
    where
        F: FnOnce() -> std::result::Result<T, E>,
        E: std::error::Error + 'static,
    {
        let breaker = self
            .circuit_breakers
            .get_mut(name)
            .ok_or_else(|| SelfHealingError::CircuitBreakerNotFound(name.to_string()))?;

        // Check if circuit allows request.
        if !breaker.allow_request() {
            return Err(SelfHealingError::CircuitOpen(name.to_string()));
        }

        // Execute operation.
        match operation() {
            Ok(result) => {
                breaker.record_success();
                Ok(result)
            }
            Err(err) => {
                breaker.record_failure();
                Err(SelfHealingError::OperationFailed(err.to_string()))
            }
        }
    }

    /// Execute operation with retry policy (synchronous, caller advances clock).
    ///
    /// The caller is responsible for advancing the monotonic clock between
    /// retries by calling `advance_clock(backoff_ms)`. This replaces
    /// `tokio::time::sleep` which is unavailable in WASM.
    #[allow(dead_code)]
    pub fn execute_with_retry<F, T, E>(
        &mut self,
        policy: &RetryPolicy,
        mut operation: F,
    ) -> std::result::Result<T, SelfHealingError>
    where
        F: FnMut() -> std::result::Result<T, E>,
        E: std::error::Error + 'static,
    {
        let mut retry_state = RetryState::new(policy.initial_backoff_ms);

        loop {
            match operation() {
                Ok(result) => return Ok(result),
                Err(err) => match retry_state.next_attempt(policy) {
                    Some(backoff_ms) => {
                        // Caller must call advance_clock(backoff_ms) before
                        // the next attempt if they want time-based logic to
                        // work. We advance here for correctness.
                        advance_clock(backoff_ms);
                        continue;
                    }
                    None => {
                        return Err(SelfHealingError::MaxRetriesExceeded {
                            attempts: retry_state.attempts(),
                            error: err.to_string(),
                        });
                    }
                },
            }
        }
    }

    /// Run health checks for all registered services.
    ///
    /// Returns a map of service name to current health status.
    #[allow(dead_code)]
    pub fn run_health_checks(&mut self) -> HashMap<String, HealthStatus> {
        let mut results = HashMap::new();

        for (name, check) in &mut self.health_checks {
            if check.is_due() {
                // Simulate health check (in real implementation, would ping service).
                let is_healthy = check.status() != HealthStatus::Unhealthy;
                check.record_result(is_healthy);
            }
            results.insert(name.clone(), check.status());
        }

        results
    }
}

impl Default for SelfHealingManager {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Tests consolidated in tests/autonomic_tests.rs (self_healing_tests module)
