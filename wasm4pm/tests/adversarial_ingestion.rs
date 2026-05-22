#![cfg(feature = "miniml")]
use wasm4pm::drift_manager::{StreamCircuitBreaker, TraceSnapshot, CircuitState};
use wasm4pm_types::import::xes::{XESParsingTraceStream, XESImportOptions};
use fake::Fake;
use proptest::prelude::*;

#[cfg(test)]
mod tests {
    use super::*;

    /// Contract: The Circuit Breaker must trip after exactly 3 consecutive SPC violations.
    /// Counterfactual: If we inject 3 massive outliers, the state MUST be Open.
    #[test]
    fn test_adversarial_drift_circuit_trip() {
        let mut cb = StreamCircuitBreaker::new(10);
        
        // 1. Establish baseline (10 events with small noise)
        for i in 0..10 {
            cb.check_drift(TraceSnapshot {
                timestamp_ms: i * 1000,
                event_count: 5,
                duration_ms: 100.0 + (i as f64), // Small variance
            }).unwrap();
        }
        assert_eq!(cb.state, CircuitState::Closed);

        // 2. Inject 3 consecutive Rule 1 violations (3-sigma outliers)
        for i in 11..14 {
            let _ = cb.check_drift(TraceSnapshot {
                timestamp_ms: i * 1000,
                event_count: 5,
                duration_ms: 10000.0, // 100x baseline
            });
        }

        // Post-condition: Circuit must be OPEN
        assert_eq!(cb.state, CircuitState::Open, "Circuit Breaker failed to trip after 3 outliers");
    }

    /// Contract: The parser must handle arbitrary attribute keys/values without panicking.
    /// Adversarial: Inject extremely long and "noisy" strings using 'fake'.
    #[test]
    fn test_adversarial_xes_parser_robustness() {
        use std::io::BufReader;
        use quick_xml::Reader;

        for _ in 0..10 {
            let key: String = (10..1000).fake();
            let val: String = (10..1000).fake();
            
            let xes_content = format!(
                r#"<log><trace><event><string key="{}" value="{}"/></event></trace></log>"#,
                key.replace("\"", "&quot;").replace("<", "&lt;").replace(">", "&gt;"), 
                val.replace("\"", "&quot;").replace("<", "&lt;").replace(">", "&gt;")
            );

            let reader = BufReader::new(xes_content.as_bytes());
            let parser = Reader::from_reader(Box::new(reader) as Box<dyn std::io::BufRead>);
            
            // Use XESParsingTraceStream::try_new
            let stream_result = XESParsingTraceStream::try_new(
                Box::new(parser),
                XESImportOptions::default()
            );
            
            if let Ok((mut stream, _)) = stream_result {
                for trace in &mut stream {
                    assert!(trace.events.len() > 0);
                }
            }
        }
    }

    /// Contract: Ontology Discovery rewards must remain bounded.
    /// Counterfactual: Creating an extremely dense "hairball" graph.
    #[test]
    fn test_adversarial_ocel_density_bounds() {
        use wasm4pm::oc_orchestrator::OntologyDiscoveryAgent;
        use wasm4pm_types::ocel::{OCEL, OCELObject, OCELRelationship};

        let mut agent = OntologyDiscoveryAgent::new();
        let mut objects = Vec::new();

        // Create 50 objects, each connected to every other object (K50 graph)
        for i in 0..50 {
            let mut relationships = Vec::new();
            for j in 0..50 {
                if i != j {
                    relationships.push(OCELRelationship {
                        object_id: format!("obj_{}", j),
                        qualifier: "adversarial_link".to_string(),
                    });
                }
            }
            objects.push(OCELObject {
                id: format!("obj_{}", i),
                object_type: "node".to_string(),
                attributes: Vec::new(),
                relationships,
            });
        }

        let adversarial_ocel = OCEL {
            event_types: Vec::new(),
            object_types: Vec::new(),
            events: Vec::new(),
            objects,
        };

        agent.analyze_ocel(&adversarial_ocel);
        let reward = agent.reward_subgraph_density(&adversarial_ocel);

        // Post-condition: Reward must be exactly 1.0 (capped) and not NaN or Infinity
        assert!(reward >= 0.0 && reward <= 1.0, "Reward {} out of bounds [0, 1]", reward);
    }

    /// Counterfactual: What if time flows backward in a trace?
    /// Contract: The drift manager must handle negative durations without crashing.
    #[test]
    fn test_adversarial_timestamp_paradox() {
        let mut cb = StreamCircuitBreaker::new(10);
        
        // Baseline
        for i in 0..10 {
            cb.check_drift(TraceSnapshot {
                timestamp_ms: i * 1000,
                event_count: 5,
                duration_ms: 100.0,
            }).unwrap();
        }

        // Paradox: negative duration
        let result = cb.check_drift(TraceSnapshot {
            timestamp_ms: 11000,
            event_count: 5,
            duration_ms: -5000.0, // Backward in time
        });

        // Post-condition: Should either error or handle it, but not panic.
        // Rule 1 violation (MAD based) likely trips because -5000 is an outlier.
        assert!(result.is_ok() || matches!(result, Err(wasm4pm::drift_manager::DriftError::SevereDriftDetected)));
    }

    /// Counterfactual: What if the knowledge base has conflicting/poisoned date formats?
    #[test]
    fn test_adversarial_poisoned_knowledge_base() {
        use wasm4pm_types::import::persistence::IngestionKnowledgeBase;
        use wasm4pm_types::import::timestamp_utils::parse_timestamp;

        let mut kb = IngestionKnowledgeBase::new();
        kb.learn_date_format("time:timestamp".to_string(), "INVALID_FORMAT_STRING".to_string());

        let result = parse_timestamp(
            "2023-01-01T10:00:00Z",
            kb.learned_date_formats.get("time:timestamp").map(|s| s.as_str()),
            false
        );

        // Post-condition: Should fallback to RFC3339 if custom format fails, ensuring robustness.
        assert!(result.is_ok(), "Parser should have fallen back to default RFC3339 despite poisoned custom format");
    }

    /// Counterfactual: malformed OCEL object mapping.
    #[test]
    fn test_adversarial_malformed_ocel_mapping() {
        use wasm4pm::oc_orchestrator::OntologyDiscoveryAgent;
        use wasm4pm_types::ocel::{OCEL, OCELObject};

        let mut agent = OntologyDiscoveryAgent::new();
        let objects = vec![
            OCELObject {
                id: "obj_1".to_string(),
                object_type: "UNKNOWN_TYPE".to_string(), // Type not in header
                attributes: Vec::new(),
                relationships: Vec::new(),
            }
        ];

        let adversarial_ocel = OCEL {
            event_types: Vec::new(),
            object_types: Vec::new(), // Empty header
            events: Vec::new(),
            objects,
        };

        agent.analyze_ocel(&adversarial_ocel);
        
        // Post-condition: Agent must record the type despite it being missing from header.
        assert!(agent.object_type_density.contains_key("UNKNOWN_TYPE"));
    }

    proptest! {
        /// Contract: Feature vector must always be finite and have consistent dimensionality.
        #[test]
        fn test_feature_extractor_contract(
            activities in prop::collection::vec(any::<String>(), 0..100),
            duration in 0.0..1000000.0f64
        ) {
            use miniml::StreamingFeatureExtractor;
            let mut extractor = StreamingFeatureExtractor::new();
            
            // Update twice to establish some baseline
            extractor.update_from_trace(&activities, duration);
            extractor.update_from_trace(&activities, duration + 10.0);

            let vec = extractor.extract_vector(&activities, duration);
            
            // Post-conditions
            assert_eq!(vec.len(), 2, "Feature vector must have 2 dimensions");
            for val in vec {
                assert!(val.is_finite(), "Feature value must be finite");
            }
        }
    }
}
