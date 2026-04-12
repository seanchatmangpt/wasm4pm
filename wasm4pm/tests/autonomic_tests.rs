//! Consolidated tests for the Closed Claw autonomic loop modules.
//!
//! Algorithm family: Autonomic Control Plane
//! Modules tested: guards, spc, self_healing, pattern_dispatch
//!
//! Extracted from embedded #[cfg(test)] blocks in each src/ module.

use pictl::guards::{
    ExecutionContext, Guard, GuardCompiler, GuardEvaluator, GuardType, ObservationBuffer,
    Predicate, ResourceState, ResourceType, StateFlags,
};
use pictl::pattern_dispatch::{
    PatternConfig, PatternDispatcher, PatternFactory, PatternFlags, PatternType, PatternValidator,
};
use pictl::self_healing::{
    advance_clock, reset_clock, CircuitBreaker, CircuitState, HealthCheck, HealthCheckConfig,
    HealthStatus, RetryPolicy, RetryState, SelfHealingError, SelfHealingManager,
};
use pictl::spc::{
    check_western_electric_rules, dpmo_to_sigma, inverse_normal_cdf, normal_cdf, spc_mean,
    spc_std_dev, CapabilityError, ChartData, ProcessCapability, ShiftDirection, SpecialCause,
    TrendDirection,
};

// ===========================================================================
// GUARDS TESTS (10 tests)
// ===========================================================================

mod guards_tests {
    use super::*;

    fn create_test_context() -> ExecutionContext {
        ExecutionContext {
            task_id: 42,
            timestamp: 1000,
            resources: ResourceState {
                cpu_available: 80,
                memory_available: 1024,
                io_capacity: 100,
                queue_depth: 10,
            },
            observations: ObservationBuffer {
                count: 5,
                observations: [0; 16],
            },
            state_flags: StateFlags::INITIALIZED.bits() | StateFlags::RUNNING.bits(),
        }
    }

    #[test]
    fn test_predicate_guard() {
        let context = create_test_context();

        let guard = Guard::predicate(Predicate::Equal, 0, 42);
        assert!(guard.evaluate(&context));

        let guard = Guard::predicate(Predicate::GreaterThan, 1, 500);
        assert!(guard.evaluate(&context));

        let guard = Guard::predicate(Predicate::LessThan, 1, 500);
        assert!(!guard.evaluate(&context));
    }

    #[test]
    fn test_resource_guard() {
        let context = create_test_context();

        let guard = Guard::resource(ResourceType::Cpu, 50);
        assert!(guard.evaluate(&context));

        let guard = Guard::resource(ResourceType::Memory, 2048);
        assert!(!guard.evaluate(&context));
    }

    #[test]
    fn test_compound_guards() {
        let context = create_test_context();

        let g1 = Guard::predicate(Predicate::Equal, 0, 42);
        let g2 = Guard::resource(ResourceType::Cpu, 50);

        let and_guard = Guard::and(vec![g1.clone(), g2.clone()]);
        assert!(and_guard.evaluate(&context));

        let g3 = Guard::resource(ResourceType::Memory, 2048);
        let or_guard = Guard::or(vec![g2, g3]);
        assert!(or_guard.evaluate(&context));

        let not_guard = Guard::not(g1);
        assert!(!not_guard.evaluate(&context));
    }

    #[test]
    fn test_state_guard() {
        let context = create_test_context();

        let guard = Guard::state(StateFlags::INITIALIZED | StateFlags::RUNNING);
        assert!(guard.evaluate(&context));

        let guard = Guard::state(StateFlags::COMPLETED);
        assert!(!guard.evaluate(&context));
    }

    #[test]
    fn test_state_flags_contains() {
        let flags = StateFlags::INITIALIZED | StateFlags::RUNNING;
        assert!(flags.contains(StateFlags::INITIALIZED));
        assert!(flags.contains(StateFlags::RUNNING));
        assert!(!flags.contains(StateFlags::COMPLETED));
    }

    #[test]
    fn test_guard_evaluator_caching() {
        let mut evaluator = GuardEvaluator::new(100);
        let context = create_test_context();
        let guard = Guard::predicate(Predicate::Equal, 0, 42);

        let result = evaluator.evaluate_cached(1, &guard, &context);
        assert!(result);

        let result = evaluator.evaluate_cached(1, &guard, &context);
        assert!(result);

        evaluator.clear_expired(context.timestamp + 50);
        assert_eq!(evaluator.len(), 1);

        evaluator.clear_expired(context.timestamp + 200);
        assert_eq!(evaluator.len(), 0);
    }

    #[test]
    fn test_counter_guard() {
        let context = create_test_context();

        let guard = Guard::predicate(Predicate::GreaterThanOrEqual, 3, 3);
        assert!(guard.evaluate(&context));

        let guard = Guard::predicate(Predicate::LessThanOrEqual, 3, 5);
        assert!(guard.evaluate(&context));

        let guard = Guard::predicate(Predicate::Equal, 3, 10);
        assert!(!guard.evaluate(&context));
    }

    #[test]
    fn test_time_window_guard() {
        let context = create_test_context();

        let guard = Guard {
            guard_type: GuardType::TimeWindow,
            predicate: Predicate::Equal,
            operand_a: 500,
            operand_b: 1500,
            children: Vec::new(),
        };
        assert!(guard.evaluate(&context));

        let guard = Guard {
            guard_type: GuardType::TimeWindow,
            predicate: Predicate::Equal,
            operand_a: 2000,
            operand_b: 3000,
            children: Vec::new(),
        };
        assert!(!guard.evaluate(&context));
    }

    #[test]
    fn test_bit_set_clear_predicates() {
        let context = ExecutionContext {
            task_id: 0,
            timestamp: 0,
            resources: ResourceState {
                cpu_available: 0,
                memory_available: 0,
                io_capacity: 0,
                queue_depth: 0,
            },
            observations: ObservationBuffer::default(),
            state_flags: 0b1010,
        };

        let guard = Guard::predicate(Predicate::BitSet, 2, 0b0010);
        assert!(guard.evaluate(&context));

        let guard = Guard::predicate(Predicate::BitSet, 2, 0b0100);
        assert!(!guard.evaluate(&context));

        let guard = Guard::predicate(Predicate::BitClear, 2, 0b0100);
        assert!(guard.evaluate(&context));
    }

    #[test]
    fn test_guard_compiler() {
        let context = create_test_context();

        let guard = Guard::predicate(Predicate::Equal, 0, 42);
        let compiled = GuardCompiler::compile(&guard);
        assert!(compiled(&context));

        let guard = Guard::resource(ResourceType::Cpu, 50);
        let compiled = GuardCompiler::compile(&guard);
        assert!(compiled(&context));
    }
}

// ===========================================================================
// SPC TESTS (19 tests)
// ===========================================================================

mod spc_tests {
    use super::*;

    fn chart(value: f64, ucl: f64, cl: f64, lcl: f64) -> ChartData {
        ChartData {
            timestamp: String::new(),
            value,
            ucl,
            cl,
            lcl,
            subgroup_data: None,
        }
    }

    #[test]
    fn test_rule_1_out_of_control() {
        let mut data = vec![];
        for i in 0..8 {
            data.push(chart(5.0 + i as f64, 10.0, 5.0, 0.0));
        }
        data.push(chart(11.0, 10.0, 5.0, 0.0));

        let alerts = check_western_electric_rules(&data);
        assert_eq!(alerts.len(), 1);
        assert!(matches!(alerts[0], SpecialCause::OutOfControl { .. }));
    }

    #[test]
    fn test_rule_1_below_lcl() {
        let mut data = vec![];
        for _ in 0..8 {
            data.push(chart(5.0, 10.0, 5.0, 0.0));
        }
        data.push(chart(-1.0, 10.0, 5.0, 0.0));

        let alerts = check_western_electric_rules(&data);
        assert_eq!(alerts.len(), 1);
        assert!(matches!(alerts[0], SpecialCause::OutOfControl { .. }));
    }

    #[test]
    fn test_rule_2_shift_above() {
        let data: Vec<ChartData> = (0..9).map(|_| chart(6.0, 10.0, 5.0, 0.0)).collect();

        let alerts = check_western_electric_rules(&data);
        assert_eq!(alerts.len(), 1);
        assert!(matches!(
            alerts[0],
            SpecialCause::Shift {
                direction: ShiftDirection::Above,
                ..
            }
        ));
    }

    #[test]
    fn test_rule_2_shift_below() {
        let data: Vec<ChartData> = (0..9).map(|_| chart(4.0, 10.0, 5.0, 0.0)).collect();

        let alerts = check_western_electric_rules(&data);
        assert_eq!(alerts.len(), 1);
        assert!(matches!(
            alerts[0],
            SpecialCause::Shift {
                direction: ShiftDirection::Below,
                ..
            }
        ));
    }

    #[test]
    fn test_rule_3_trend_increasing() {
        let mut data = vec![];
        for _i in 0..5 {
            data.push(chart(0.0, 10.0, 5.0, 0.0));
        }
        for i in 5..11 {
            data.push(chart(i as f64, 10.0, 5.0, 0.0));
        }

        let alerts = check_western_electric_rules(&data);
        assert!(alerts.iter().any(|a| matches!(
            a,
            SpecialCause::Trend {
                direction: TrendDirection::Increasing,
                ..
            }
        )));
    }

    #[test]
    fn test_rule_3_trend_decreasing() {
        let mut data = vec![];
        for _ in 0..5 {
            data.push(chart(10.0, 20.0, 10.0, 0.0));
        }
        for i in (0..6).rev() {
            data.push(chart(i as f64, 20.0, 10.0, 0.0));
        }

        let alerts = check_western_electric_rules(&data);
        assert!(alerts.iter().any(|a| matches!(
            a,
            SpecialCause::Trend {
                direction: TrendDirection::Decreasing,
                ..
            }
        )));
    }

    #[test]
    fn test_no_alerts_stable_process() {
        let values = [5.1, 4.9, 5.2, 4.8, 5.0, 4.9, 5.1, 4.8, 5.2];
        let data: Vec<ChartData> = values.iter().map(|&v| chart(v, 10.0, 5.0, 0.0)).collect();

        let alerts = check_western_electric_rules(&data);
        assert!(alerts.is_empty());
    }

    #[test]
    fn test_too_few_points() {
        let data: Vec<ChartData> = (0..5).map(|i| chart(i as f64, 10.0, 5.0, 0.0)).collect();
        let alerts = check_western_electric_rules(&data);
        assert!(alerts.is_empty());
    }

    #[test]
    fn test_capability_calculation() {
        let data = vec![5.0, 5.5, 6.0, 6.5, 7.0];
        let cap = ProcessCapability::calculate(&data, 8.0, 0.0).unwrap();

        assert!(cap.cp > 0.0, "cp should be positive, got {}", cap.cp);
        assert!(cap.cpk > 0.0, "cpk should be positive, got {}", cap.cpk);
        assert!(
            cap.sigma_level > 0.0,
            "sigma_level should be positive, got {} (dpmo={})",
            cap.sigma_level,
            cap.dpmo
        );
        assert_eq!(cap.usl, 8.0);
        assert_eq!(cap.lsl, 0.0);
    }

    #[test]
    fn test_empty_data() {
        let result = ProcessCapability::calculate(&[], 8.0, 0.0);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), CapabilityError::EmptyData);
    }

    #[test]
    fn test_invalid_limits() {
        let data = vec![5.0, 6.0];
        let result = ProcessCapability::calculate(&data, 2.0, 8.0);
        assert_eq!(result.unwrap_err(), CapabilityError::InvalidLimits);
    }

    #[test]
    fn test_zero_std_dev_within_limits() {
        let data = vec![5.0, 5.0, 5.0, 5.0, 5.0];
        let cap = ProcessCapability::calculate(&data, 10.0, 0.0).unwrap();

        assert_eq!(cap.cp, f64::INFINITY);
        assert_eq!(cap.cpk, f64::INFINITY);
        assert_eq!(cap.sigma_level, 6.0);
        assert_eq!(cap.dpmo, 0.0);
    }

    #[test]
    fn test_zero_std_dev_outside_limits() {
        let data = vec![15.0, 15.0, 15.0, 15.0, 15.0];
        let cap = ProcessCapability::calculate(&data, 10.0, 0.0).unwrap();

        assert_eq!(cap.cp, 0.0);
        assert_eq!(cap.cpk, 0.0);
        assert_eq!(cap.sigma_level, 0.0);
        assert_eq!(cap.dpmo, 1_000_000.0);
    }

    #[test]
    fn test_spc_mean() {
        assert_eq!(spc_mean(&[1.0, 2.0, 3.0, 4.0, 5.0]), 3.0);
        assert_eq!(spc_mean(&[]), 0.0);
    }

    #[test]
    fn test_spc_std_dev() {
        let data = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let sd = spc_std_dev(&data);
        assert!((sd - 1.5811388300841898).abs() < 1e-10);
        assert_eq!(spc_std_dev(&[42.0]), 0.0);
    }

    #[test]
    fn test_normal_cdf_symmetry() {
        let p_pos = normal_cdf(1.96);
        let p_neg = normal_cdf(-1.96);
        assert!((p_pos + p_neg - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_inverse_normal_cdf_roundtrip() {
        for p in [0.1, 0.5, 0.9] {
            let z = inverse_normal_cdf(p);
            let p_back = normal_cdf(z);
            assert!(
                (p - p_back).abs() < 1e-4,
                "roundtrip failed at p={}: got {} back (z={})",
                p,
                p_back,
                z
            );
        }
    }

    #[test]
    fn test_dpmo_to_sigma_boundaries() {
        assert_eq!(dpmo_to_sigma(0.0), 6.0);
        assert_eq!(dpmo_to_sigma(-1.0), 6.0);
        assert_eq!(dpmo_to_sigma(1_000_000.0), 0.0);
        assert_eq!(dpmo_to_sigma(2_000_000.0), 0.0);
    }

    #[test]
    fn test_capability_error_display() {
        let err = CapabilityError::EmptyData;
        assert!(!err.to_string().is_empty());

        let err2 = CapabilityError::InvalidLimits;
        assert!(!err2.to_string().is_empty());
    }
}

// ===========================================================================
// SELF-HEALING TESTS (20 tests)
// ===========================================================================

mod self_healing_tests {
    use super::*;

    fn setup() {
        reset_clock();
    }

    #[test]
    fn test_circuit_breaker_closed_to_open() {
        setup();

        let mut breaker = CircuitBreaker::new();

        for _ in 0..5 {
            assert_eq!(breaker.state(), CircuitState::Closed);
            breaker.record_failure();
        }

        assert_eq!(breaker.state(), CircuitState::Open);
    }

    #[test]
    fn test_circuit_breaker_open_blocks_requests() {
        setup();

        let mut breaker = CircuitBreaker::new();

        for _ in 0..5 {
            breaker.record_failure();
        }

        assert_eq!(breaker.state(), CircuitState::Open);
        assert!(!breaker.allow_request());
    }

    #[test]
    fn test_circuit_breaker_half_open_to_closed() {
        setup();

        let mut breaker = CircuitBreaker::new();

        for _ in 0..5 {
            breaker.record_failure();
        }

        assert_eq!(breaker.state(), CircuitState::Open);

        advance_clock(60_100);

        assert!(breaker.allow_request());
        assert_eq!(breaker.state(), CircuitState::HalfOpen);

        breaker.record_success();
        breaker.record_success();

        assert_eq!(breaker.state(), CircuitState::Closed);
    }

    #[test]
    fn test_circuit_breaker_half_open_failure_returns_to_open() {
        setup();

        let mut breaker = CircuitBreaker::new();

        for _ in 0..5 {
            breaker.record_failure();
        }
        assert_eq!(breaker.state(), CircuitState::Open);

        advance_clock(60_100);
        assert!(breaker.allow_request());
        assert_eq!(breaker.state(), CircuitState::HalfOpen);

        breaker.record_failure();
        assert_eq!(breaker.state(), CircuitState::Open);
    }

    #[test]
    fn test_retry_policy_exponential_backoff() {
        let policy = RetryPolicy {
            max_attempts: 5,
            initial_backoff_ms: 100,
            backoff_multiplier: 2.0,
            max_backoff_ms: 10_000,
            jitter: false,
        };

        let mut state = RetryState::new(policy.initial_backoff_ms);

        assert_eq!(state.next_attempt(&policy), Some(100));
        assert_eq!(state.next_attempt(&policy), Some(200));
        assert_eq!(state.next_attempt(&policy), Some(400));
        assert_eq!(state.next_attempt(&policy), Some(800));
    }

    #[test]
    fn test_retry_policy_max_attempts() {
        let policy = RetryPolicy {
            max_attempts: 3,
            ..Default::default()
        };

        let mut state = RetryState::new(policy.initial_backoff_ms);

        assert!(state.next_attempt(&policy).is_some());
        assert!(state.next_attempt(&policy).is_some());
        assert!(state.next_attempt(&policy).is_some());
        assert!(state.next_attempt(&policy).is_none());
    }

    #[test]
    fn test_retry_policy_max_backoff_cap() {
        let policy = RetryPolicy {
            max_attempts: 10,
            initial_backoff_ms: 100,
            backoff_multiplier: 10.0,
            max_backoff_ms: 1_000,
            jitter: false,
        };

        let mut state = RetryState::new(policy.initial_backoff_ms);

        for _ in 0..10 {
            let backoff = state.next_attempt(&policy).unwrap();
            assert!(backoff <= 1_000, "backoff {} exceeded max 1000", backoff);
        }
    }

    #[test]
    fn test_retry_policy_jitter_within_bounds() {
        let policy = RetryPolicy {
            max_attempts: 5,
            initial_backoff_ms: 1000,
            backoff_multiplier: 1.0,
            max_backoff_ms: 10_000,
            jitter: true,
        };

        let mut state = RetryState::new(policy.initial_backoff_ms);

        for _ in 0..5 {
            let backoff = state.next_attempt(&policy).unwrap();
            assert!(
                backoff >= 750 && backoff <= 1250,
                "jittered backoff {} outside [750, 1250]",
                backoff
            );
        }
    }

    #[test]
    fn test_health_check_healthy_threshold() {
        setup();

        let config = HealthCheckConfig {
            healthy_threshold: 2,
            ..Default::default()
        };

        let mut check = HealthCheck::with_config(config);

        check.record_result(true);
        assert_eq!(check.status(), HealthStatus::Healthy);

        check.record_result(true);
        assert_eq!(check.status(), HealthStatus::Healthy);
    }

    #[test]
    fn test_health_check_unhealthy_threshold() {
        setup();

        let config = HealthCheckConfig {
            unhealthy_threshold: 3,
            ..Default::default()
        };

        let mut check = HealthCheck::with_config(config);

        check.record_result(false);
        assert_eq!(check.status(), HealthStatus::Healthy);

        check.record_result(false);
        assert_eq!(check.status(), HealthStatus::Healthy);

        check.record_result(false);
        assert_eq!(check.status(), HealthStatus::Unhealthy);
    }

    #[test]
    fn test_health_check_recovery() {
        setup();

        let config = HealthCheckConfig {
            healthy_threshold: 2,
            unhealthy_threshold: 2,
            ..Default::default()
        };

        let mut check = HealthCheck::with_config(config);

        check.record_result(false);
        check.record_result(false);
        assert_eq!(check.status(), HealthStatus::Unhealthy);

        check.record_result(true);
        assert_eq!(check.status(), HealthStatus::Unhealthy);

        check.record_result(true);
        assert_eq!(check.status(), HealthStatus::Healthy);
    }

    #[test]
    fn test_health_check_is_due() {
        setup();

        let config = HealthCheckConfig {
            interval_ms: 100,
            ..Default::default()
        };

        let mut check = HealthCheck::with_config(config);

        assert!(check.is_due());

        check.record_result(true);
        assert!(!check.is_due());

        advance_clock(100);
        assert!(check.is_due());
    }

    #[test]
    fn test_health_check_time_until_next() {
        setup();

        let config = HealthCheckConfig {
            interval_ms: 1000,
            ..Default::default()
        };

        let check = HealthCheck::with_config(config);

        assert_eq!(check.time_until_next_check_ms(), None);

        let mut check = check;
        check.record_result(true);

        let remaining = check.time_until_next_check_ms().unwrap();
        assert!(remaining <= 1000 && remaining > 900);

        advance_clock(500);
        let remaining = check.time_until_next_check_ms().unwrap();
        assert!(remaining <= 500 && remaining > 400);
    }

    #[test]
    fn test_manager_execute_with_circuit_breaker_success() {
        setup();

        let mut manager = SelfHealingManager::new();
        manager.add_circuit_breaker("test_dep".to_string(), CircuitBreaker::new());

        let result: Result<i32, SelfHealingError> =
            manager.execute_with_circuit_breaker("test_dep", || Ok::<i32, SelfHealingError>(42));
        assert_eq!(result.unwrap(), 42);
    }

    #[test]
    fn test_manager_execute_with_circuit_breaker_failure() {
        setup();

        let mut manager = SelfHealingManager::new();
        manager.add_circuit_breaker("test_dep".to_string(), CircuitBreaker::new());

        let result: Result<i32, SelfHealingError> = manager
            .execute_with_circuit_breaker("test_dep", || {
                Err::<i32, SelfHealingError>(SelfHealingError::OperationFailed("boom".into()))
            });
        assert!(result.is_err());
    }

    #[test]
    fn test_manager_execute_with_circuit_breaker_open_rejects() {
        setup();

        let mut manager = SelfHealingManager::new();
        manager.add_circuit_breaker("test_dep".to_string(), CircuitBreaker::new());

        for _ in 0..5 {
            let _: Result<i32, SelfHealingError> = manager
                .execute_with_circuit_breaker("test_dep", || {
                    Err::<i32, SelfHealingError>(SelfHealingError::OperationFailed("fail".into()))
                });
        }

        let result: Result<i32, SelfHealingError> =
            manager.execute_with_circuit_breaker("test_dep", || Ok::<i32, SelfHealingError>(1));
        match result {
            Err(SelfHealingError::CircuitOpen(_)) => {}
            other => panic!("expected CircuitOpen, got {:?}", other),
        }
    }

    #[test]
    fn test_manager_execute_with_retry_succeeds_eventually() {
        setup();

        let mut manager = SelfHealingManager::new();
        let call_count = std::cell::Cell::new(0);

        let policy = RetryPolicy {
            max_attempts: 5,
            initial_backoff_ms: 10,
            backoff_multiplier: 2.0,
            max_backoff_ms: 100,
            jitter: false,
        };

        let result: Result<i32, SelfHealingError> = manager.execute_with_retry(&policy, || {
            let n = call_count.get();
            call_count.set(n + 1);
            if n < 2 {
                Err::<i32, SelfHealingError>(SelfHealingError::OperationFailed("transient".into()))
            } else {
                Ok::<i32, SelfHealingError>(42)
            }
        });

        assert_eq!(result.unwrap(), 42);
        assert_eq!(call_count.get(), 3);
    }

    #[test]
    fn test_manager_execute_with_retry_exhausted() {
        setup();

        let mut manager = SelfHealingManager::new();

        let policy = RetryPolicy {
            max_attempts: 3,
            initial_backoff_ms: 10,
            backoff_multiplier: 2.0,
            max_backoff_ms: 100,
            jitter: false,
        };

        let result: Result<i32, SelfHealingError> = manager.execute_with_retry(&policy, || {
            Err::<i32, SelfHealingError>(SelfHealingError::OperationFailed("permanent".into()))
        });

        match result {
            Err(SelfHealingError::MaxRetriesExceeded { attempts, .. }) => {
                assert_eq!(attempts, 4);
            }
            other => panic!("expected MaxRetriesExceeded, got {:?}", other),
        }
    }

    #[test]
    fn test_manager_run_health_checks() {
        setup();

        let mut manager = SelfHealingManager::new();
        manager.add_health_check("svc_a".to_string(), HealthCheck::new());

        let results = manager.run_health_checks();
        assert_eq!(results.get("svc_a"), Some(&HealthStatus::Healthy));
    }

    #[test]
    fn test_manager_circuit_breaker_not_found() {
        setup();

        let mut manager = SelfHealingManager::new();

        let result: Result<i32, SelfHealingError> =
            manager.execute_with_circuit_breaker("nonexistent", || Ok::<i32, SelfHealingError>(1));
        match result {
            Err(SelfHealingError::CircuitBreakerNotFound(_)) => {}
            other => panic!("expected CircuitBreakerNotFound, got {:?}", other),
        }
    }
}

// ===========================================================================
// PATTERN DISPATCH TESTS (9 tests)
// ===========================================================================

mod pattern_dispatch_tests {
    use super::*;

    #[test]
    fn test_pattern_dispatcher() {
        let dispatcher = PatternDispatcher::new();

        let mut ctx = PatternFactory::create(PatternType::Sequence, 1, PatternConfig::default());
        ctx.input_mask = 1;

        let result = dispatcher.dispatch(&ctx);
        assert!(result.success);
        assert_eq!(result.output_mask, 1);
        assert!(result.ticks_used <= 8);
    }

    #[test]
    fn test_parallel_split() {
        let dispatcher = PatternDispatcher::new();

        let mut ctx = PatternFactory::create(
            PatternType::ParallelSplit,
            2,
            PatternConfig {
                max_instances: 4,
                ..Default::default()
            },
        );
        ctx.input_mask = 1;

        let result = dispatcher.dispatch(&ctx);
        assert!(result.success);
        assert_eq!(result.output_mask, 0b1111);
    }

    #[test]
    fn test_synchronization() {
        let dispatcher = PatternDispatcher::new();

        let mut ctx = PatternFactory::create(
            PatternType::Synchronization,
            3,
            PatternConfig {
                join_threshold: 3,
                ..Default::default()
            },
        );
        ctx.input_mask = 0b111;

        let result = dispatcher.dispatch(&ctx);
        assert!(result.success);
        assert_eq!(result.output_mask, 1);
    }

    #[test]
    fn test_pattern_validation() {
        assert!(PatternValidator::validate_combination(
            PatternType::ParallelSplit,
            PatternType::Synchronization
        )
        .is_ok());

        for i in 1..=43u8 {
            let pt = PatternType::from_u8(i).expect("all 1-43 should convert");
            assert!(PatternValidator::check_permutation_matrix(pt));
        }
    }

    #[test]
    fn test_discriminator() {
        let dispatcher = PatternDispatcher::new();

        let ctx = PatternFactory::create(
            PatternType::StructuredDiscriminator,
            4,
            PatternConfig::default(),
        );

        let result = dispatcher.dispatch(&ctx);
        assert!(result.success);

        let result = dispatcher.dispatch(&ctx);
        assert!(!result.success);
    }

    #[test]
    fn test_exclusive_choice_deterministic() {
        let dispatcher = PatternDispatcher::new();

        let mut ctx =
            PatternFactory::create(PatternType::ExclusiveChoice, 10, PatternConfig::default());
        ctx.input_mask = 0b101;

        let result = dispatcher.dispatch(&ctx);
        assert!(result.success);
        assert_eq!(result.output_mask, 1);
    }

    #[test]
    fn test_all_43_patterns_registered() {
        let dispatcher = PatternDispatcher::new();
        for i in 1..=43u8 {
            let pt = PatternType::from_u8(i).expect("valid pattern type");
            assert!(
                dispatcher.validate_pattern(pt),
                "pattern {} should be valid",
                i
            );
        }
    }

    #[test]
    fn test_factory_validation_split() {
        let config = PatternConfig {
            max_instances: 0,
            ..Default::default()
        };
        assert!(PatternFactory::validate(PatternType::ParallelSplit, &config).is_err());

        let config = PatternConfig {
            max_instances: 65,
            ..Default::default()
        };
        assert!(PatternFactory::validate(PatternType::ParallelSplit, &config).is_err());

        let config = PatternConfig {
            max_instances: 4,
            ..Default::default()
        };
        assert!(PatternFactory::validate(PatternType::ParallelSplit, &config).is_ok());
    }

    #[test]
    fn test_factory_validation_recursion_must_be_cancellable() {
        let config = PatternConfig::default();
        assert!(PatternFactory::validate(PatternType::Recursion, &config).is_err());

        let config = PatternConfig {
            flags: PatternFlags::new(PatternFlags::CANCELLABLE),
            ..Default::default()
        };
        assert!(PatternFactory::validate(PatternType::Recursion, &config).is_ok());
    }
}
