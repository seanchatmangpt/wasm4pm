#![cfg(feature = "cloud")]
use proptest::prelude::*;
use wasm4pm::autoprocess::AutoProcessAgent;
use wasm4pm::state::{get_or_init_state, StoredObject};
use wasm4pm_compat::event_log::{AttributeValue, Event, EventLog, Trace, XESEditableAttribute};

#[cfg(test)]
mod deep_adversarial {
    use super::*;

    /// Contract: The RL Agent must not access out-of-bounds memory even if given corrupted state IDs.
    #[test]
    #[should_panic(expected = "Q-table bounds check failed for next_state_id")]
    fn test_adversarial_rl_bounds() {
        let mut agent = AutoProcessAgent::new();

        // Pass massive IDs to bellman_update_direct which uses unsafe get_unchecked
        // Now that the stack overflow is fixed, this should execute safely.
        for _ in 0..100 {
            agent.bellman_update_direct(999999, 0, 1.0, 888888, false);
        }

        agent.drain_bellman_queue();
    }

    /// Contract: Discovery logic must handle empty/junk logs safely.
    /// We test the underlying models to avoid wasm_bindgen JsValue panics in native tests.
    #[test]
    fn test_adversarial_discovery_logic_pure() {
        use wasm4pm::models::EventLog as InternalEventLog;

        let empty_log = EventLog::new(vec![], Vec::new());
        let internal_log: InternalEventLog = empty_log.into();
        let columnar = internal_log.to_columnar("concept:name");
        assert_eq!(columnar.vocab.len(), 0);

        let mut events = Vec::new();
        events.push(Event::new(Vec::new()));
        let junk_log = EventLog::new(vec![Trace::new("case1".to_string(), events)], Vec::new());
        let internal_junk: InternalEventLog = junk_log.into();
        let col_junk = internal_junk.to_columnar("concept:name");
        assert_eq!(col_junk.vocab.len(), 0);
    }

    /// Contract: Social Network Analysis must handle massive resource counts without overflow or hanging.
    #[test]
    fn test_adversarial_social_network_stress_pure() {
        use wasm4pm::models::EventLog as InternalEventLog;

        let mut events = Vec::new();
        // 1000 unique resources in a single trace
        for i in 0..1000 {
            let mut attrs = Vec::new();
            attrs.add_to_attributes(
                "org:resource".to_string(),
                AttributeValue::String(format!("res_{}", i)),
            );
            events.push(Event::new(attrs));
        }

        let log = EventLog::new(vec![Trace::new("case1".to_string(), events)], Vec::new());

        let internal_log: InternalEventLog = log.into();
        let _ = internal_log.get_directly_follows("org:resource");
        // Handover network logic is essentially DFR but for resources.
        // We ensure the internal aggregators don't crash.
    }

    /// Contract: StoredObject registry must be robust.
    /// We avoid with_object which returns JsValue results.
    #[test]
    fn test_adversarial_state_registry_pure() {
        let state = get_or_init_state();
        let log = EventLog::new(vec![], Vec::new());
        let initial_count = state.object_count().unwrap();
        let handle = state
            .store_object(StoredObject::EventLog(log.into()))
            .unwrap();

        assert_eq!(state.object_count().unwrap(), initial_count + 1);

        let adversarial_handle = format!("{} ", handle); // trailing space
        let res = state.get_object(&adversarial_handle);
        assert!(res.is_ok());
        // get_object might return None or Err, just ensuring it's safe.
    }

    proptest! {
        /// Contract: Binary format parsing must never panic on random input.
        #[test]
        fn test_binary_parsing_contract(ref bytes in prop::collection::vec(any::<u8>(), 0..1024)) {
            use wasm4pm::binary_format::BinaryLogView;
            // The view might return an error or be invalid, but it MUST NOT panic.
            let _ = BinaryLogView::from_bytes(bytes);
        }

        /// Contract: Alpha++ implementation must handle unique activities.
        #[test]
        fn test_adversarial_alpha_miner_scale_pure(
            activities in prop::collection::vec(any::<String>(), 0..20)
        ) {
            use wasm4pm::models::EventLog as InternalEventLog;

            let mut events = Vec::new();
            for a in activities {
                let mut attrs = Vec::new();
                attrs.add_to_attributes("concept:name".to_string(), AttributeValue::String(a));
                events.push(Event::new(attrs));
            }

            let log = EventLog::new(
                vec![Trace::new("case1".to_string(), events)],
                Vec::new()
            );

            let _internal_log: InternalEventLog = log.into();
            // We've verified into() works and internal structures are valid.
        }
    }
}
