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

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ---------------------------------------------------------------------------
// Monotonic clock
// ---------------------------------------------------------------------------

/// Offset for manual clock advancement (testing).
static TIME_OFFSET_MS: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// Global serialization mutex for tests that mutate the shared `TIME_OFFSET_MS`.
///
/// libtest runs `#[test]` functions within the same binary on a thread-pool,
/// so two tests that both call `reset_clock()` + `advance_clock()` can
/// interleave and observe each other's mutations. This lock lets any test
/// (across any integration test file) opt into serialization with
/// `let _g = CLOCK_LOCK.lock().unwrap();` or `with_clock_lock(|| { ... })`.
///
/// Production code never acquires this lock — it's a test-only guard. The
/// underlying atomic remains the source of truth so non-test reads stay
/// lock-free.
pub static CLOCK_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

/// Acquire `CLOCK_LOCK` for the duration of `f`. Returns the closure's value.
///
/// Use in tests that mutate the monotonic clock to prevent races with
/// sibling tests:
///
/// ```ignore
/// with_clock_lock(|| {
///     reset_clock();
///     advance_clock(1_000);
///     // ...assertions...
/// });
/// ```
///
/// If the mutex is poisoned by a panicking sibling test, the guard is
/// recovered so subsequent tests still serialize correctly.
#[allow(dead_code)]
pub fn with_clock_lock<F, R>(f: F) -> R
where
    F: FnOnce() -> R,
{
    let _guard = CLOCK_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    f()
}

/// Return the current monotonic "instant" in milliseconds.
#[allow(dead_code)]
pub fn now_ms() -> u64 {
    let base = {
        #[cfg(target_arch = "wasm32")]
        {
            js_sys::Date::now() as u64
        }
        #[cfg(not(target_arch = "wasm32"))]
        {
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64
        }
    };
    base + TIME_OFFSET_MS.load(std::sync::atomic::Ordering::SeqCst)
}

/// Advance the monotonic clock by `delta_ms` milliseconds (for deterministic testing).
#[allow(dead_code)]
pub fn advance_clock(delta_ms: u64) {
    TIME_OFFSET_MS.fetch_add(delta_ms, std::sync::atomic::Ordering::SeqCst);
}

/// Reset the monotonic clock to zero (useful in tests).
#[allow(dead_code)]
pub fn reset_clock() {
    TIME_OFFSET_MS.store(0, std::sync::atomic::Ordering::SeqCst);
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
///
/// Variants are ordered to match the numeric mapping used by `as_rl_circuit_state`:
/// Closed=0, HalfOpen=1, Open=2.  Adding `#[repr(u8)]` lets callers cast directly
/// (`self.state as u8`) instead of dispatching a match.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
#[allow(dead_code)]
pub enum CircuitState {
    /// Normal operation — requests flow through.
    Closed   = 0,
    /// Testing if recovery is possible.
    HalfOpen = 1,
    /// Failing — reject requests.
    Open     = 2,
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

/// JSON-deserializable circuit breaker configuration.
///
/// Provides serde-compatible config with sensible defaults.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CircuitBreakerConfigJson {
    #[serde(default = "default_failure_threshold")]
    pub failure_threshold: u32,

    #[serde(default = "default_success_threshold")]
    pub success_threshold: u32,

    #[serde(default = "default_open_timeout")]
    pub open_timeout_ms: u64,

    #[serde(default = "default_half_open_timeout")]
    pub half_open_timeout_ms: u64,
}

fn default_failure_threshold() -> u32 {
    5
}
fn default_success_threshold() -> u32 {
    2
}
fn default_open_timeout() -> u64 {
    60_000
}
fn default_half_open_timeout() -> u64 {
    30_000
}

impl From<CircuitBreakerConfigJson> for CircuitBreakerConfig {
    fn from(json: CircuitBreakerConfigJson) -> Self {
        Self {
            failure_threshold: json.failure_threshold,
            success_threshold: json.success_threshold,
            open_timeout_ms: json.open_timeout_ms,
            half_open_timeout_ms: json.half_open_timeout_ms,
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

    /// Create circuit breaker from JSON configuration string.
    ///
    /// # Arguments
    /// * `json` - JSON string with circuit breaker configuration
    ///
    /// # Returns
    /// * `Ok(CircuitBreaker)` - Parsed and initialized circuit breaker
    /// * `Err(String)` - JSON parsing error message
    #[allow(dead_code)]
    pub fn from_json(json: &str) -> Result<Self, String> {
        let config_json: CircuitBreakerConfigJson = serde_json::from_str(json)
            .map_err(|e| format!("Invalid circuit breaker config: {}", e))?;

        Ok(Self::with_config(config_json.into()))
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
        let elapsed = now_ms().saturating_sub(self.last_state_change_ms);
        // Per-state timeout thresholds; Closed never times out.
        let timeouts: [u64; 3] = [u64::MAX, self.config.half_open_timeout_ms, self.config.open_timeout_ms];
        let timed_out = elapsed >= timeouts[self.state as usize];

        let (next_state, allow) = match (self.state, timed_out) {
            (CircuitState::Open, true)     => (CircuitState::HalfOpen, true),
            (CircuitState::HalfOpen, true) => (CircuitState::Open, false),
            (s, _)                         => (s, s != CircuitState::Open),
        };
        if next_state != self.state {
            self.transition_to(next_state);
        }
        allow
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

    /// Get failure threshold from config.
    #[allow(dead_code)]
    pub fn failure_threshold(&self) -> u32 {
        self.config.failure_threshold
    }

    /// Get success threshold from config.
    #[allow(dead_code)]
    pub fn success_threshold(&self) -> u32 {
        self.config.success_threshold
    }

    /// Get open timeout from config.
    #[allow(dead_code)]
    pub fn open_timeout_ms(&self) -> u64 {
        self.config.open_timeout_ms
    }

    /// Get half-open timeout from config.
    #[allow(dead_code)]
    pub fn half_open_timeout_ms(&self) -> u64 {
        self.config.half_open_timeout_ms
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

    /// Convert circuit state to u8 (0=Closed, 1=HalfOpen, 2=Open)
    #[allow(dead_code)]
    #[inline(always)]
    pub fn as_rl_circuit_state(&self) -> u8 {
        self.state as u8
    }

    /// Check if circuit is allowing requests (read-only)
    #[allow(dead_code)]
    #[inline(always)]
    pub fn is_allowing(&self) -> bool {
        self.state as u8 != CircuitState::Open as u8
    }
}

impl Default for CircuitBreaker {
    fn default() -> Self {
        Self::new()
    }
}

/// JSON-serializable circuit breaker state for persistence.
///
/// Includes configuration and live state counters to restore the circuit
/// breaker to its exact state after CLI restart.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CircuitBreakerStateJson {
    /// Circuit breaker configuration
    pub config: CircuitBreakerConfigJson,
    /// Current state: 0=Closed, 1=HalfOpen, 2=Open (matches as_rl_circuit_state)
    pub state: u8,
    /// Current failure count
    pub failure_count: u32,
    /// Current success count
    pub success_count: u32,
    /// Monotonic time (ms) of last state change
    pub last_state_change_ms: u64,
}

impl CircuitBreaker {
    /// Serialize to JSON-compatible state.
    pub fn to_state_json(&self) -> CircuitBreakerStateJson {
        CircuitBreakerStateJson {
            config: CircuitBreakerConfigJson {
                failure_threshold: self.config.failure_threshold,
                success_threshold: self.config.success_threshold,
                open_timeout_ms: self.config.open_timeout_ms,
                half_open_timeout_ms: self.config.half_open_timeout_ms,
            },
            state: match self.state {
                CircuitState::Closed => 0,
                CircuitState::HalfOpen => 1,
                CircuitState::Open => 2,
            },
            failure_count: self.failure_count,
            success_count: self.success_count,
            last_state_change_ms: self.last_state_change_ms,
        }
    }

    /// Restore from JSON-serialized state.
    pub fn from_state_json(json_state: CircuitBreakerStateJson) -> Self {
        Self {
            config: json_state.config.into(),
            state: match json_state.state {
                0 => CircuitState::Closed,
                1 => CircuitState::HalfOpen,
                2 => CircuitState::Open,
                _ => CircuitState::Closed, // Default to safe state
            },
            failure_count: json_state.failure_count,
            success_count: json_state.success_count,
            last_state_change_ms: json_state.last_state_change_ms,
        }
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
            Some(last) => now_ms().saturating_sub(last) >= self.config.interval_ms,
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

    /// Returns simulated health state by reading cached status.
    ///
    /// SIMULATED: Does NOT perform live service probes. No HTTP GET, no TCP connect,
    /// no gRPC health check. For use in test scaffolding and autonomic loop simulation only.
    #[allow(dead_code)]
    pub fn simulated_health_state_check(&mut self) -> HashMap<String, HealthStatus> {
        let mut results = HashMap::new();

        for (name, check) in &mut self.health_checks {
            if check.is_due() {
                // SIMULATED: reads cached HealthCheck.status() — no live probe.
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

// ---------------------------------------------------------------------------
// Tests for CircuitBreaker JSON configuration
// ---------------------------------------------------------------------------

#[cfg(test)]
mod circuit_breaker_config_tests {
    use super::CircuitBreaker;

    #[test]
    fn test_circuit_breaker_from_json() {
        let json = r#"{
            "failure_threshold": 10,
            "success_threshold": 3,
            "open_timeout_ms": 120000,
            "half_open_timeout_ms": 60000
        }"#;

        let breaker = CircuitBreaker::from_json(json).unwrap();
        assert_eq!(breaker.failure_threshold(), 10);
        assert_eq!(breaker.success_threshold(), 3);
        assert_eq!(breaker.open_timeout_ms(), 120000);
        assert_eq!(breaker.half_open_timeout_ms(), 60000);
    }

    #[test]
    fn test_circuit_breaker_from_json_defaults() {
        let json = r#"{}"#;

        let breaker = CircuitBreaker::from_json(json).unwrap();
        assert_eq!(breaker.failure_threshold(), 5);
        assert_eq!(breaker.success_threshold(), 2);
        assert_eq!(breaker.open_timeout_ms(), 60000);
        assert_eq!(breaker.half_open_timeout_ms(), 30000);
    }

    #[test]
    fn test_circuit_breaker_from_json_invalid() {
        let json = r#"{"failure_threshold": "not a number"}"#;

        let result = CircuitBreaker::from_json(json);
        assert!(result.is_err());
    }

    #[test]
    fn test_circuit_breaker_json_serialization() {
        let breaker = CircuitBreaker::from_json(
            r#"{
            "failure_threshold": 7,
            "success_threshold": 4,
            "open_timeout_ms": 90000,
            "half_open_timeout_ms": 45000
        }"#,
        )
        .unwrap();

        // Verify getters return correct values
        assert_eq!(breaker.failure_threshold(), 7);
        assert_eq!(breaker.success_threshold(), 4);
        assert_eq!(breaker.open_timeout_ms(), 90000);
        assert_eq!(breaker.half_open_timeout_ms(), 45000);
    }

    #[test]
    fn test_circuit_breaker_partial_config() {
        let json = r#"{
            "failure_threshold": 15
        }"#;

        let breaker = CircuitBreaker::from_json(json).unwrap();
        assert_eq!(breaker.failure_threshold(), 15);
        assert_eq!(breaker.success_threshold(), 2); // default
        assert_eq!(breaker.open_timeout_ms(), 60000); // default
        assert_eq!(breaker.half_open_timeout_ms(), 30000); // default
    }
}
