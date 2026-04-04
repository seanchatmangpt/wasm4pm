use process_mining_wasm::models::{AttributeValue, Event, EventLog, Trace};
use std::collections::HashMap;
use std::time::Instant;

fn create_sample_eventlog(num_cases: usize, events_per_case: usize) -> EventLog {
    let mut log = EventLog::new();
    let activities = vec!["Start", "A", "B", "C", "D", "End"];

    for case_id in 0..num_cases {
        let mut trace = Trace {
            attributes: HashMap::new(),
            events: Vec::new(),
        };
        trace.attributes.insert(
            "case_id".to_string(),
            AttributeValue::String(format!("{}", case_id)),
        );

        for event_idx in 0..events_per_case {
            let activity = activities[event_idx % activities.len()];
            let mut event_attrs = HashMap::new();
            event_attrs.insert(
                "concept:name".to_string(),
                AttributeValue::String(activity.to_string()),
            );
            event_attrs.insert(
                "timestamp".to_string(),
                AttributeValue::Date(format!("2024-01-01T{:02}:00:00Z", event_idx)),
            );

            trace.events.push(Event {
                attributes: event_attrs,
            });
        }

        log.traces.push(trace);
    }

    log
}

#[test]
#[ignore] // Run with: cargo test -- --ignored --nocapture benchmarks
fn benchmark_dfg_discovery() {
    println!("\n=== DFG Discovery Benchmark ===");

    let sizes = vec![100, 1000, 5000];
    let events_per_case = 20;

    for size in sizes {
        let log = create_sample_eventlog(size, events_per_case);

        let start = Instant::now();
        let activities = log.get_activities("concept:name");
        let relations = log.get_directly_follows("concept:name");
        let duration = start.elapsed();

        println!(
            "Cases: {}, Activities: {}, Relations: {}, Time: {:.2}ms",
            size,
            activities.len(),
            relations.len(),
            duration.as_secs_f64() * 1000.0
        );
    }
}

#[test]
#[ignore]
fn benchmark_json_serialization() {
    println!("\n=== JSON Serialization Benchmark ===");

    let log = create_sample_eventlog(1000, 20);

    let start = Instant::now();
    let json = serde_json::to_string(&log).expect("Serialization failed");
    let serialize_time = start.elapsed();

    println!(
        "Serialized size: {:.1}KB, Time: {:.2}ms",
        json.len() as f64 / 1024.0,
        serialize_time.as_secs_f64() * 1000.0
    );

    let start = Instant::now();
    let _log: EventLog = serde_json::from_str(&json).expect("Deserialization failed");
    let deserialize_time = start.elapsed();

    println!(
        "Deserialization time: {:.2}ms",
        deserialize_time.as_secs_f64() * 1000.0
    );
}

#[test]
#[ignore]
fn benchmark_memory_usage() {
    println!("\n=== Memory Usage Estimate ===");

    let log = create_sample_eventlog(1000, 20);
    let event_count = log.event_count();
    let case_count = log.case_count();

    println!("Cases: {}", case_count);
    println!("Events: {}", event_count);
    println!("Est. RAM: ~{} KB", (case_count * 4096 + event_count * 512) / 1024);
}
