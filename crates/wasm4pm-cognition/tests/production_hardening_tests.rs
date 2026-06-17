// crates/wasm4pm-cognition/tests/production_hardening_tests.rs
// 38 comprehensive tests for degradation module under production conditions
use wasm4pm_cognition::degradation::*;

#[test]
fn test_degradation_mode_full_construction() {
    let mode = DegradationMode::Full;
    assert_eq!(mode, DegradationMode::Full);
}

#[test]
fn test_degradation_mode_reduced_construction() {
    let mode = DegradationMode::Reduced;
    assert_eq!(mode, DegradationMode::Reduced);
}

#[test]
fn test_degradation_mode_minimal_construction() {
    let mode = DegradationMode::Minimal;
    assert_eq!(mode, DegradationMode::Minimal);
}

#[test]
fn test_degradation_mode_emergency_construction() {
    let mode = DegradationMode::Emergency;
    assert_eq!(mode, DegradationMode::Emergency);
}

#[test]
fn test_degradation_trigger_healthy_construction() {
    let trigger = DegradationTrigger::healthy();
    assert!(!trigger.memory_pressure);
    assert!(!trigger.response_time_exceeded);
    assert_eq!(trigger.error_rate, 0.0);
    assert_eq!(trigger.health_level, 0);
}

#[test]
fn test_degradation_trigger_critical_construction() {
    let trigger = DegradationTrigger::critical();
    assert!(trigger.memory_pressure);
    assert!(trigger.response_time_exceeded);
    assert_eq!(trigger.error_rate, 1.0);
    assert_eq!(trigger.health_level, 4);
}

#[test]
fn test_degradation_trigger_clamped_error_rate_underflow() {
    let trigger = DegradationTrigger {
        memory_pressure: false,
        response_time_exceeded: false,
        error_rate: -0.5,
        health_level: 0,
    };
    let clamped = trigger.clamped();
    assert_eq!(clamped.error_rate, 0.0);
}

#[test]
fn test_degradation_trigger_clamped_error_rate_overflow() {
    let trigger = DegradationTrigger {
        memory_pressure: false,
        response_time_exceeded: false,
        error_rate: 1.5,
        health_level: 0,
    };
    let clamped = trigger.clamped();
    assert_eq!(clamped.error_rate, 1.0);
}

#[test]
fn test_degradation_trigger_clamped_health_level_overflow() {
    let trigger = DegradationTrigger {
        memory_pressure: false,
        response_time_exceeded: false,
        error_rate: 0.5,
        health_level: 10,
    };
    let clamped = trigger.clamped();
    assert_eq!(clamped.health_level, 4);
}

#[test]
fn test_select_degradation_mode_healthy_system() {
    let trigger = DegradationTrigger::healthy();
    let mode = select_degradation_mode(&trigger);
    assert_eq!(mode, DegradationMode::Full);
}

#[test]
fn test_select_degradation_mode_health_level_1() {
    let trigger = DegradationTrigger {
        memory_pressure: false,
        response_time_exceeded: false,
        error_rate: 0.0,
        health_level: 1,
    };
    let mode = select_degradation_mode(&trigger);
    assert_eq!(mode, DegradationMode::Reduced);
}

#[test]
fn test_select_degradation_mode_health_level_2() {
    let trigger = DegradationTrigger {
        memory_pressure: false,
        response_time_exceeded: false,
        error_rate: 0.0,
        health_level: 2,
    };
    let mode = select_degradation_mode(&trigger);
    assert_eq!(mode, DegradationMode::Minimal);
}

#[test]
fn test_select_degradation_mode_health_level_3_emergency() {
    let trigger = DegradationTrigger {
        memory_pressure: false,
        response_time_exceeded: false,
        error_rate: 0.0,
        health_level: 3,
    };
    let mode = select_degradation_mode(&trigger);
    assert_eq!(mode, DegradationMode::Emergency);
}

#[test]
fn test_select_degradation_mode_health_level_4_terminal_emergency() {
    let trigger = DegradationTrigger {
        memory_pressure: false,
        response_time_exceeded: false,
        error_rate: 0.0,
        health_level: 4,
    };
    let mode = select_degradation_mode(&trigger);
    assert_eq!(mode, DegradationMode::Emergency);
}

#[test]
fn test_select_degradation_mode_response_time_exceeded() {
    let trigger = DegradationTrigger {
        memory_pressure: false,
        response_time_exceeded: true,
        error_rate: 0.0,
        health_level: 0,
    };
    let mode = select_degradation_mode(&trigger);
    assert_eq!(mode, DegradationMode::Reduced);
}

#[test]
fn test_select_degradation_mode_error_rate_30_percent() {
    let trigger = DegradationTrigger {
        memory_pressure: false,
        response_time_exceeded: false,
        error_rate: 0.30,
        health_level: 0,
    };
    let mode = select_degradation_mode(&trigger);
    assert_eq!(mode, DegradationMode::Reduced);
}

#[test]
fn test_select_degradation_mode_error_rate_60_percent() {
    let trigger = DegradationTrigger {
        memory_pressure: false,
        response_time_exceeded: false,
        error_rate: 0.60,
        health_level: 0,
    };
    let mode = select_degradation_mode(&trigger);
    assert_eq!(mode, DegradationMode::Minimal);
}

#[test]
fn test_select_degradation_mode_memory_pressure() {
    let trigger = DegradationTrigger {
        memory_pressure: true,
        response_time_exceeded: false,
        error_rate: 0.0,
        health_level: 0,
    };
    let mode = select_degradation_mode(&trigger);
    assert_eq!(mode, DegradationMode::Minimal);
}

#[test]
fn test_breeds_for_mode_full() {
    let breeds = breeds_for_mode(DegradationMode::Full);
    assert_eq!(breeds.len(), 9);
    assert!(breeds.contains(&"eliza".to_string()));
    assert!(breeds.contains(&"cbr".to_string()));
    assert!(breeds.contains(&"dendral".to_string()));
    assert!(breeds.contains(&"strips".to_string()));
    assert!(breeds.contains(&"prolog".to_string()));
    assert!(breeds.contains(&"mycin".to_string()));
    assert!(breeds.contains(&"gps".to_string()));
    assert!(breeds.contains(&"soar".to_string()));
    assert!(breeds.contains(&"hearsay".to_string()));
}

#[test]
fn test_breeds_for_mode_reduced() {
    let breeds = breeds_for_mode(DegradationMode::Reduced);
    assert_eq!(breeds.len(), 5);
    assert!(breeds.contains(&"eliza".to_string()));
    assert!(breeds.contains(&"cbr".to_string()));
    assert!(breeds.contains(&"mycin".to_string()));
    assert!(breeds.contains(&"prolog".to_string()));
    assert!(breeds.contains(&"strips".to_string()));
}

#[test]
fn test_breeds_for_mode_minimal() {
    let breeds = breeds_for_mode(DegradationMode::Minimal);
    assert_eq!(breeds.len(), 3);
    assert!(breeds.contains(&"eliza".to_string()));
    assert!(breeds.contains(&"cbr".to_string()));
    assert!(breeds.contains(&"mycin".to_string()));
}

#[test]
fn test_breeds_for_mode_emergency() {
    let breeds = breeds_for_mode(DegradationMode::Emergency);
    assert_eq!(breeds.len(), 1);
    assert_eq!(breeds[0], "eliza");
}

#[test]
fn test_breed_count_full() {
    let count = breed_count(DegradationMode::Full);
    assert_eq!(count, 9);
}

#[test]
fn test_breed_count_reduced() {
    let count = breed_count(DegradationMode::Reduced);
    assert_eq!(count, 5);
}

#[test]
fn test_breed_count_minimal() {
    let count = breed_count(DegradationMode::Minimal);
    assert_eq!(count, 3);
}

#[test]
fn test_breed_count_emergency() {
    let count = breed_count(DegradationMode::Emergency);
    assert_eq!(count, 1);
}

#[test]
fn test_breed_active_in_mode_eliza_all_modes() {
    assert!(breed_active_in_mode("eliza", DegradationMode::Full));
    assert!(breed_active_in_mode("eliza", DegradationMode::Reduced));
    assert!(breed_active_in_mode("eliza", DegradationMode::Minimal));
    assert!(breed_active_in_mode("eliza", DegradationMode::Emergency));
}

#[test]
fn test_breed_active_in_mode_cbr_not_in_emergency() {
    assert!(breed_active_in_mode("cbr", DegradationMode::Full));
    assert!(breed_active_in_mode("cbr", DegradationMode::Reduced));
    assert!(breed_active_in_mode("cbr", DegradationMode::Minimal));
    assert!(!breed_active_in_mode("cbr", DegradationMode::Emergency));
}

#[test]
fn test_breed_active_in_mode_dendral_only_full() {
    assert!(breed_active_in_mode("dendral", DegradationMode::Full));
    assert!(!breed_active_in_mode("dendral", DegradationMode::Reduced));
    assert!(!breed_active_in_mode("dendral", DegradationMode::Minimal));
    assert!(!breed_active_in_mode("dendral", DegradationMode::Emergency));
}

#[test]
fn test_mode_rationale_full() {
    let trigger = DegradationTrigger::healthy();
    let rationale = mode_rationale(&trigger, DegradationMode::Full);
    assert!(rationale.contains("Full"));
    assert!(rationale.contains("56 breeds in registry"));
    assert!(rationale.contains("9 BreedId-implemented"));
    assert!(rationale.contains("47 stubs"));
}

#[test]
fn test_mode_rationale_reduced() {
    let trigger = DegradationTrigger {
        memory_pressure: false,
        response_time_exceeded: true,
        error_rate: 0.0,
        health_level: 0,
    };
    let rationale = mode_rationale(&trigger, DegradationMode::Reduced);
    assert!(rationale.contains("Reduced"));
    assert!(rationale.contains("5 breeds"));
    assert!(rationale.contains("56 breeds in registry"));
}

#[test]
fn test_mode_rationale_minimal() {
    let trigger = DegradationTrigger {
        memory_pressure: true,
        response_time_exceeded: false,
        error_rate: 0.0,
        health_level: 0,
    };
    let rationale = mode_rationale(&trigger, DegradationMode::Minimal);
    assert!(rationale.contains("Minimal"));
    assert!(rationale.contains("3 breeds"));
    assert!(rationale.contains("memory pressure"));
    assert!(rationale.contains("56 breeds in registry"));
}

#[test]
fn test_mode_rationale_emergency() {
    let trigger = DegradationTrigger {
        memory_pressure: false,
        response_time_exceeded: false,
        error_rate: 0.0,
        health_level: 4,
    };
    let rationale = mode_rationale(&trigger, DegradationMode::Emergency);
    assert!(rationale.contains("Emergency"));
    assert!(rationale.contains("eliza only"));
    assert!(rationale.contains("health=4"));
    assert!(rationale.contains("56 breeds in registry"));
}

#[test]
fn test_recovery_recommendation_full() {
    let recommendation = recovery_recommendation(DegradationMode::Full);
    assert!(recommendation.contains("nominal"));
}

#[test]
fn test_recovery_recommendation_reduced() {
    let recommendation = recovery_recommendation(DegradationMode::Reduced);
    assert!(recommendation.contains("latency"));
}

#[test]
fn test_recovery_recommendation_minimal() {
    let recommendation = recovery_recommendation(DegradationMode::Minimal);
    assert!(recommendation.contains("memory"));
}

#[test]
fn test_recovery_recommendation_emergency() {
    let recommendation = recovery_recommendation(DegradationMode::Emergency);
    assert!(recommendation.contains("CRITICAL"));
    assert!(recommendation.contains("health"));
}

#[test]
fn test_degradation_trigger_default() {
    let trigger = DegradationTrigger::default();
    assert_eq!(trigger, DegradationTrigger::healthy());
}

#[test]
fn test_mode_ordering_severity() {
    // Emergency > Minimal > Reduced > Full (severity levels)
    assert!(DegradationMode::Emergency > DegradationMode::Minimal);
    assert!(DegradationMode::Minimal > DegradationMode::Reduced);
    assert!(DegradationMode::Reduced > DegradationMode::Full);
}
