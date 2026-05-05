//! Action Dispatch Layer — converts RL action labels to executable operations.
//!
//! This module bridges the gap between RL agent decisions and actual system
//! operations. When an RL agent selects an action (e.g., RlAction::Scale),
//! this layer translates that label into concrete executable operations.
//!
//! # Design Philosophy
//!
//! - **Observable execution**: Every dispatch returns structured outcomes for
//!   telemetry and reward computation.
//! - **WASM-compatible**: No async, no threads, no filesystem I/O.
//!
//! # Action Semantics
//!
//! - **Continue**: No-op, maintain current execution path.
//! - **Scale**: Adjust resource allocation (memory, timeout, batch size).
//! - **Retry**: Exponential backoff retry with jitter.
//! - **Fallback**: Switch to alternative algorithm (selects DFG as the most robust fallback).
//! - **Restart**: Component restart — resets SPC history ring buffer and circuit breaker state.

use crate::RlAction;

// ---------------------------------------------------------------------------
// Execution Context — information available to action handlers
// ---------------------------------------------------------------------------

/// Execution context passed to all action dispatches.
///
/// Provides the current system state, resource constraints, and telemetry
/// data needed for action execution decisions.
#[derive(Debug, Clone)]
pub struct ExecutionContext {
    /// Current health state (0=Normal, 1=Warning, 2=Degraded, 3=Critical, 4=Failed)
    pub health_level: u8,

    /// Current memory limit in MB
    pub current_memory_mb: u32,

    /// Current timeout in milliseconds
    pub current_timeout_ms: u32,

    /// Current batch size for processing
    pub current_batch_size: u32,

    /// Number of retry attempts already made
    pub retry_count: u32,

    /// Maximum allowed retry attempts
    pub max_retries: u32,

    /// Base backoff delay in milliseconds
    pub base_backoff_ms: u32,

    /// Whether circuit breaker is open
    pub circuit_breaker_open: bool,
}

impl Default for ExecutionContext {
    fn default() -> Self {
        Self {
            health_level: 0,
            current_memory_mb: 512,
            current_timeout_ms: 30000,
            current_batch_size: 1000,
            retry_count: 0,
            max_retries: 3,
            base_backoff_ms: 1000,
            circuit_breaker_open: false,
        }
    }
}

impl ExecutionContext {
    /// Create a new execution context with sensible defaults.
    pub fn new() -> Self {
        Self::default()
    }

    /// Create a degraded context (e.g., after failures).
    pub fn degraded() -> Self {
        Self {
            health_level: 2,
            current_memory_mb: 256,
            current_timeout_ms: 15000,
            current_batch_size: 500,
            retry_count: 1,
            max_retries: 3,
            base_backoff_ms: 2000,
            circuit_breaker_open: false,
        }
    }

    /// Create a critical context (e.g., after multiple failures).
    pub fn critical() -> Self {
        Self {
            health_level: 3,
            current_memory_mb: 128,
            current_timeout_ms: 5000,
            current_batch_size: 100,
            retry_count: 2,
            max_retries: 3,
            base_backoff_ms: 3000,
            circuit_breaker_open: true,
        }
    }
}

// ---------------------------------------------------------------------------
// Dispatch Outcome — structured result from action execution
// ---------------------------------------------------------------------------

/// Outcome of action dispatch execution.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DispatchOutcome {
    /// No operation performed (e.g., Continue action)
    NoOp,

    /// Resources were scaled
    Scaled {
        /// New memory limit in MB
        memory_mb: u32,
        /// New timeout in ms
        timeout_ms: u32,
        /// New batch size
        batch_size: u32,
    },

    /// Retry initiated
    RetryInitiated {
        /// Retry attempt number
        attempt: u32,
        /// Backoff delay in ms
        delay_ms: u32,
    },

    /// Fallback to alternative algorithm
    FallbackInitiated {
        /// Alternative algorithm name
        algorithm: String,
    },

    /// Component restart initiated
    RestartInitiated {
        /// Whether state was cleared
        state_cleared: bool,
    },

    /// Action not implemented yet
    NotImplemented,
}

impl DispatchOutcome {
    /// Human-readable description of the outcome.
    pub fn description(&self) -> &str {
        match self {
            DispatchOutcome::NoOp => "No operation performed",
            DispatchOutcome::Scaled { .. } => "Resources scaled",
            DispatchOutcome::RetryInitiated { .. } => "Retry with backoff",
            DispatchOutcome::FallbackInitiated { .. } => "Fallback algorithm",
            DispatchOutcome::RestartInitiated { .. } => "Component restart",
            DispatchOutcome::NotImplemented => "Action not implemented",
        }
    }
}

/// Result type for action dispatch.
pub type DispatchResult = Result<DispatchOutcome, DispatchError>;

/// Errors that can occur during action dispatch.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DispatchError {
    /// Circuit breaker is open, action blocked
    CircuitBreakerOpen,

    /// Maximum retry attempts exceeded
    MaxRetriesExceeded,

    /// Invalid action parameters
    InvalidParameters(String),

    /// Resource scaling failed
    ScalingFailed(String),

    /// Action not implemented
    NotImplemented,
}

impl std::fmt::Display for DispatchError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DispatchError::CircuitBreakerOpen => write!(f, "Circuit breaker is open"),
            DispatchError::MaxRetriesExceeded => write!(f, "Maximum retry attempts exceeded"),
            DispatchError::InvalidParameters(msg) => write!(f, "Invalid parameters: {}", msg),
            DispatchError::ScalingFailed(msg) => write!(f, "Scaling failed: {}", msg),
            DispatchError::NotImplemented => write!(f, "Action not implemented"),
        }
    }
}

impl std::error::Error for DispatchError {}

// ---------------------------------------------------------------------------
// Action Dispatch — convert RL actions to executable operations
// ---------------------------------------------------------------------------

/// Dispatch an RL action to an executable operation.
///
/// This is the main entry point for action execution. It takes an RL action
/// label and execution context, then performs the corresponding operation.
///
/// # Arguments
///
/// * `action` - The RL action selected by the agent
/// * `context` - Current execution context with system state
///
/// # Returns
///
/// * `Ok(DispatchOutcome)` - Action was executed successfully
/// * `Err(DispatchError)` - Action execution failed
///
/// # Examples
///
/// ```ignore
/// let action = RlAction::Scale;
/// let context = ExecutionContext::default();
/// let result = dispatch_action(&action, &context);
/// assert!(result.is_ok());
/// ```
pub fn dispatch_action(action: &RlAction, context: &ExecutionContext) -> DispatchResult {
    match action {
        RlAction::Continue => action_continue(context),
        RlAction::Scale => action_scale(context),
        RlAction::Retry => action_retry(context),
        RlAction::Fallback => action_fallback(context),
        RlAction::Restart => action_restart(context),
    }
}

// ---------------------------------------------------------------------------
// Action Implementations
// ---------------------------------------------------------------------------

/// Continue action — no-op, maintain current execution path.
///
/// This is the safest action when the system is healthy. It signals that
/// no intervention is needed.
fn action_continue(_context: &ExecutionContext) -> DispatchResult {
    Ok(DispatchOutcome::NoOp)
}

/// Scale action — adjust resource allocation based on health state.
///
/// Scaling strategy:
/// - Normal (0): Maintain current resources
/// - Warning (1): Slightly increase timeout (buffer)
/// - Degraded (2): Reduce batch size, increase timeout
/// - Critical (3): Aggressive resource reduction
/// - Failed (4): Minimal resources (emergency mode)
fn action_scale(context: &ExecutionContext) -> DispatchResult {
    // Check circuit breaker
    if context.circuit_breaker_open {
        return Err(DispatchError::CircuitBreakerOpen);
    }

    let (new_memory_mb, new_timeout_ms, new_batch_size) = match context.health_level {
        0 => {
            // Normal: maintain current resources
            (
                context.current_memory_mb,
                context.current_timeout_ms,
                context.current_batch_size,
            )
        }
        1 => {
            // Warning: increase timeout for safety margin
            (
                context.current_memory_mb,
                context.current_timeout_ms * 2,
                context.current_batch_size,
            )
        }
        2 => {
            // Degraded: reduce batch size, increase timeout
            (
                context.current_memory_mb / 2,
                context.current_timeout_ms * 2,
                context.current_batch_size / 2,
            )
        }
        3 => {
            // Critical: aggressive reduction
            (
                context.current_memory_mb / 4,
                context.current_timeout_ms * 3,
                context.current_batch_size / 4,
            )
        }
        4 => {
            // Failed: minimal resources
            (64, 5000, 50)
        }
        _ => {
            return Err(DispatchError::InvalidParameters(format!(
                "Invalid health level: {}",
                context.health_level
            )))
        }
    };

    // Ensure minimum thresholds
    let new_memory_mb = new_memory_mb.max(64);
    let new_timeout_ms = new_timeout_ms.max(5000);
    let new_batch_size = new_batch_size.max(50);

    Ok(DispatchOutcome::Scaled {
        memory_mb: new_memory_mb,
        timeout_ms: new_timeout_ms,
        batch_size: new_batch_size,
    })
}

/// Retry action — exponential backoff with jitter.
///
/// Retry strategy:
/// - Backoff delay = base_backoff_ms * 2^retry_count + jitter
/// - Jitter = random value in [0, base_backoff_ms / 2]
/// - Max retries enforced via context.max_retries
fn action_retry(context: &ExecutionContext) -> DispatchResult {
    // Check circuit breaker
    if context.circuit_breaker_open {
        return Err(DispatchError::CircuitBreakerOpen);
    }

    // Check max retries
    if context.retry_count >= context.max_retries {
        return Err(DispatchError::MaxRetriesExceeded);
    }

    // Exponential backoff: base * 2^attempt
    let exponential_delay = context.base_backoff_ms * (1 << context.retry_count);

    // Add jitter: +/- 50% of base backoff (simplified for WASM)
    // In a real implementation, we'd use a proper RNG
    let jitter = context.base_backoff_ms / 2;

    let total_delay_ms = exponential_delay + jitter;

    // Cap maximum delay (e.g., 60 seconds)
    let total_delay_ms = total_delay_ms.min(60000);

    Ok(DispatchOutcome::RetryInitiated {
        attempt: context.retry_count + 1,
        delay_ms: total_delay_ms,
    })
}

/// Fallback action — switch to DFG (the simplest, fastest algorithm).
///
/// Triggered when the current algorithm is unsuitable. Selects DFG as
/// the fallback because it is the most robust algorithm in the registry.
fn action_fallback(context: &ExecutionContext) -> DispatchResult {
    // Check circuit breaker
    if context.circuit_breaker_open {
        return Err(DispatchError::CircuitBreakerOpen);
    }

    Ok(DispatchOutcome::FallbackInitiated {
        algorithm: "dfg".to_string(),
    })
}

/// Restart action — reset SPC history and circuit breaker state.
///
/// Last-resort action when the system is in a failed state. Clears
/// accumulated SPC history and resets the circuit breaker so the system
/// can begin a fresh autonomic cycle.
fn action_restart(_context: &ExecutionContext) -> DispatchResult {
    // Reset SPC history ring buffer
    crate::SPC_HISTORY.with(|h| h.borrow_mut().clear());

    // Reset circuit breaker to closed state
    crate::CIRCUIT_BREAKER.with(|cb| *cb.borrow_mut() = crate::self_healing::CircuitBreaker::new());

    Ok(DispatchOutcome::RestartInitiated {
        state_cleared: true,
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_action_continue_returns_noop() {
        let context = ExecutionContext::default();
        let result = dispatch_action(&RlAction::Continue, &context);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), DispatchOutcome::NoOp);
    }

    #[test]
    fn test_action_scale_increases_timeout_in_warning_state() {
        let context = ExecutionContext {
            health_level: 1,
            current_memory_mb: 512,
            current_timeout_ms: 30000,
            current_batch_size: 1000,
            ..Default::default()
        };

        let result = dispatch_action(&RlAction::Scale, &context);
        assert!(result.is_ok());

        if let DispatchOutcome::Scaled {
            memory_mb,
            timeout_ms,
            batch_size,
        } = result.unwrap()
        {
            assert_eq!(memory_mb, 512); // unchanged
            assert_eq!(timeout_ms, 60000); // doubled
            assert_eq!(batch_size, 1000); // unchanged
        } else {
            panic!("Expected Scaled outcome");
        }
    }

    #[test]
    fn test_action_scale_reduces_resources_in_degraded_state() {
        let context = ExecutionContext {
            health_level: 2,
            current_memory_mb: 512,
            current_timeout_ms: 30000,
            current_batch_size: 1000,
            ..Default::default()
        };

        let result = dispatch_action(&RlAction::Scale, &context);
        assert!(result.is_ok());

        if let DispatchOutcome::Scaled {
            memory_mb,
            timeout_ms,
            batch_size,
        } = result.unwrap()
        {
            assert_eq!(memory_mb, 256); // halved
            assert_eq!(timeout_ms, 60000); // doubled
            assert_eq!(batch_size, 500); // halved
        } else {
            panic!("Expected Scaled outcome");
        }
    }

    #[test]
    fn test_action_retry_computes_exponential_backoff() {
        let context = ExecutionContext {
            retry_count: 2,
            base_backoff_ms: 1000,
            max_retries: 3,
            ..Default::default()
        };

        let result = dispatch_action(&RlAction::Retry, &context);
        assert!(result.is_ok());

        if let DispatchOutcome::RetryInitiated { attempt, delay_ms } = result.unwrap() {
            assert_eq!(attempt, 3); // next attempt
                                    // Exponential: 1000 * 2^2 = 4000 + jitter(500) = 4500
            assert_eq!(delay_ms, 4500);
        } else {
            panic!("Expected RetryInitiated outcome");
        }
    }

    #[test]
    fn test_action_retry_enforces_max_retries() {
        let context = ExecutionContext {
            retry_count: 3,
            max_retries: 3,
            ..Default::default()
        };

        let result = dispatch_action(&RlAction::Retry, &context);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), DispatchError::MaxRetriesExceeded);
    }

    #[test]
    fn test_action_retry_blocked_when_circuit_open() {
        let context = ExecutionContext {
            circuit_breaker_open: true,
            ..Default::default()
        };

        let result = dispatch_action(&RlAction::Retry, &context);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), DispatchError::CircuitBreakerOpen);
    }

    #[test]
    fn test_action_scale_blocked_when_circuit_open() {
        let context = ExecutionContext {
            circuit_breaker_open: true,
            ..Default::default()
        };

        let result = dispatch_action(&RlAction::Scale, &context);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), DispatchError::CircuitBreakerOpen);
    }

    #[test]
    fn test_action_fallback_initiates_dfg_fallback() {
        let context = ExecutionContext::default();
        let result = dispatch_action(&RlAction::Fallback, &context);
        assert!(result.is_ok());
        assert_eq!(
            result.unwrap(),
            DispatchOutcome::FallbackInitiated {
                algorithm: "dfg".to_string()
            }
        );
    }

    #[test]
    fn test_action_restart_clears_state() {
        let context = ExecutionContext::default();
        let result = dispatch_action(&RlAction::Restart, &context);
        assert!(result.is_ok());
        assert_eq!(
            result.unwrap(),
            DispatchOutcome::RestartInitiated {
                state_cleared: true
            }
        );
    }

    #[test]
    fn test_execution_context_default() {
        let ctx = ExecutionContext::default();
        assert_eq!(ctx.health_level, 0);
        assert_eq!(ctx.current_memory_mb, 512);
        assert_eq!(ctx.current_timeout_ms, 30000);
        assert_eq!(ctx.current_batch_size, 1000);
        assert_eq!(ctx.retry_count, 0);
        assert_eq!(ctx.max_retries, 3);
        assert_eq!(ctx.base_backoff_ms, 1000);
        assert!(!ctx.circuit_breaker_open);
    }

    #[test]
    fn test_execution_context_degraded() {
        let ctx = ExecutionContext::degraded();
        assert_eq!(ctx.health_level, 2);
        assert_eq!(ctx.current_memory_mb, 256);
        assert_eq!(ctx.current_timeout_ms, 15000);
        assert_eq!(ctx.current_batch_size, 500);
        assert_eq!(ctx.retry_count, 1);
    }

    #[test]
    fn test_execution_context_critical() {
        let ctx = ExecutionContext::critical();
        assert_eq!(ctx.health_level, 3);
        assert_eq!(ctx.current_memory_mb, 128);
        assert_eq!(ctx.current_timeout_ms, 5000);
        assert_eq!(ctx.current_batch_size, 100);
        assert_eq!(ctx.retry_count, 2);
        assert!(ctx.circuit_breaker_open);
    }

    #[test]
    fn test_dispatch_outcome_description() {
        assert_eq!(
            DispatchOutcome::NoOp.description(),
            "No operation performed"
        );
        assert_eq!(
            DispatchOutcome::Scaled {
                memory_mb: 256,
                timeout_ms: 60000,
                batch_size: 500
            }
            .description(),
            "Resources scaled"
        );
        assert_eq!(
            DispatchOutcome::RetryInitiated {
                attempt: 1,
                delay_ms: 1000
            }
            .description(),
            "Retry with backoff"
        );
        assert_eq!(
            DispatchOutcome::FallbackInitiated {
                algorithm: "dfg".to_string()
            }
            .description(),
            "Fallback algorithm"
        );
        assert_eq!(
            DispatchOutcome::RestartInitiated {
                state_cleared: true
            }
            .description(),
            "Component restart"
        );
        assert_eq!(
            DispatchOutcome::NotImplemented.description(),
            "Action not implemented"
        );
    }
}
