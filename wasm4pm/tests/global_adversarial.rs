use wasm4pm::state::{get_or_init_state, StoredObject};
use wasm4pm::autoprocess::{AutoProcessAgent, CircuitState};
use wasm4pm_types::event_log::{EventLog, Trace, Event, AttributeValue, XESEditableAttribute};
use fake::Fake;
use proptest::prelude::*;

#[cfg(test)]
mod global_adversarial {
    use super::*;

    /// Contract: The global handle registry must be resistant to "Handle Guessing" and "Ghost Handles".
    /// Counterfactual: If an attacker guesses "obj_9999" before it's created, or tries to access "obj_0\u{0000}".
    #[test]
    fn test_global_handle_adversary() {
        let state = get_or_init_state();
        state.clear_all().unwrap();

        // 1. Guess future handle
        let guess = "obj_100";
        assert!(state.get_object(guess).unwrap().is_none());

        // 2. Poisoned null bytes or whitespace in handle
        let log = EventLog::new(vec![], Vec::new());
        let handle = state.store_object(StoredObject::EventLog(log.into())).unwrap();
        
        let poisoned = format!("{}\0", handle);
        assert!(state.get_object(&poisoned).unwrap().is_none());

        let whitespace = format!(" {} ", handle);
        assert!(state.get_object(&whitespace).unwrap().is_none());
    }

    /// Contract: The Autonomic MAPE-K loop must not allow "Feedback Loop Meltdown".
    /// Counterfactual: If the reward signal is pure noise (max variance), the circuit breaker MUST trip.
    #[test]
    fn test_global_mape_k_meltdown() {
        use wasm4pm::RlState;
        let mut agent = AutoProcessAgent::with_config(0.5, 0.9, 5, 100);
        
        let state = RlState {
            health_level: 2,
            event_rate_q: 4,
            activity_count_q: 3,
            spc_alert_level: 1,
            drift_status: 1,
            rework_ratio_q: 2,
            circuit_state: 0,
            cycle_phase: 1,
        };

        // Inject extreme reward oscillation (Poisoned Feedback)
        for i in 0..10 {
            let reward = if i % 2 == 0 { 1000.0 } else { -1000.0 };
            // Simulate a cycle where the action always "fails"
            agent.run_cycle(&state, &[0.0; 8], reward, &state, false, false, 0);
        }

        // Post-condition: After 5 failures (per config), circuit MUST be Open.
        assert_eq!(agent.circuit_state(), CircuitState::Open, "MAPE-K loop failed to trip circuit during feedback meltdown");
    }

    /// Contract: Feature interplay must not allow "Zombie States" in the registry.
    /// Counterfactual: Storing an object, then clear_all(), then trying to use the old handle.
    #[test]
    fn test_global_zombie_handles() {
        let state = get_or_init_state();
        let log = EventLog::new(vec![], Vec::new());
        let handle = state.store_object(StoredObject::EventLog(log.into())).unwrap();
        
        state.clear_all().unwrap();
        
        // Post-condition: Old handle must be invalid immediately
        let res = state.get_object(&handle).unwrap();
        assert!(res.is_none());
    }

    proptest! {
        /// Contract: Global registry handles arbitrary object sizes without corruption.
        #[test]
        fn test_registry_stress_contract(
            log_size in 0..500usize
        ) {
            let state = get_or_init_state();
            let mut events = Vec::new();
            for _ in 0..log_size {
                events.push(Event::new(Vec::new()));
            }
            let log = EventLog::new(vec![Trace::new("case".to_string(), events)], Vec::new());
            
            let handle = state.store_object(StoredObject::EventLog(log.into())).unwrap();
            assert!(state.get_object(&handle).unwrap().is_some());
            state.delete_object(&handle).unwrap();
        }
    }
}
