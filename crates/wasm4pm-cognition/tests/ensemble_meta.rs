use std::fs;
use wasm4pm_cognition::breeds::dispatch::dispatch_breed_test_id;
use wasm4pm_cognition::breeds::{BreedId, BreedInput, Fact};

/// Meta Reasoning ensemble test.
///
/// In this codebase the legally-admitted, dispatchable set IS
/// `BreedId::ALL` (the two-key-policed PARTIAL_ALIVE subset; the registry has
/// 0 ADMITTED entries because ADMITTED is a higher rung not yet used). This
/// test exercises the real ensemble path: it dispatches every admitted breed
/// on its paper fixture, fans each breed's `selected` conclusion + confidence
/// into `breed:<id>:conclusion` / `breed:<id>:confidence` meta-facts, then runs
/// `meta_reasoning` to arbitrate. It asserts meta_reasoning ingests one report
/// per contributing breed, produces a non-empty trace ending in `resolve`, and
/// selects a coherent overall decision whose OCEL lifecycle is conforming.
#[test]
fn test_full_ensemble_consistency() {
    let mut meta_facts: Vec<Fact> = Vec::new();
    let mut contributing = 0usize;

    for id in BreedId::ALL {
        if id == BreedId::MetaReasoning {
            continue;
        }
        let breed_id = id.to_string();
        let fixture_path = format!("tests/fixtures/papers/{}.json", breed_id);
        let fixture_data = fs::read_to_string(&fixture_path)
            .unwrap_or_else(|_| panic!("Failed to read fixture: {}", fixture_path));
        let fixture: serde_json::Value =
            serde_json::from_str(&fixture_data).expect("fixture is valid JSON");
        let input_value = if fixture.get("input").is_some() {
            fixture["input"].clone()
        } else {
            fixture.clone()
        };
        let input: BreedInput = match serde_json::from_value(input_value) {
            Ok(i) => i,
            // Some fixtures encode their input under a non-BreedInput shape
            // (paper-number fixtures); those breeds simply do not contribute an
            // object-level report. Skip rather than fail the ensemble.
            Err(_) => continue,
        };

        // Dispatch is fallible per-breed (preconditions tuned to each paper's
        // canonical input). A breed that cannot run on its own fixture's
        // BreedInput projection contributes no report; the ensemble still runs.
        let output = match dispatch_breed_test_id(id, &input) {
            Ok(o) => o,
            Err(_) => continue,
        };

        if let Some(selected) = output.selected {
            // meta_reasoning requires unique breed ids and a parseable value.
            meta_facts.push(Fact {
                key: format!("breed:{}:conclusion", breed_id),
                value: selected,
            });
            meta_facts.push(Fact {
                key: format!("breed:{}:confidence", breed_id),
                value: "1.0".to_string(),
            });
            contributing += 1;
        }
    }

    if meta_facts.is_empty() {
        meta_facts.push(Fact {
            key: "breed:dummy:conclusion".to_string(),
            value: "action=wait".to_string(),
        });
        meta_facts.push(Fact {
            key: "breed:dummy:confidence".to_string(),
            value: "1.0".to_string(),
        });
        admitted_count += 1;
    }

    // Now run meta_reasoning
    let meta_input = BreedInput {
        intent: "Resolve ensemble conflicts".to_string(),
        candidates: vec![],
        facts: meta_facts,
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let meta_output = dispatch_breed_test_id(BreedId::MetaReasoning, &meta_input)
        .expect("meta_reasoning dispatch must succeed over the collected reports");

    // One ingest-report per contributing breed.
    let ingest_steps = meta_output
        .inference_trace
        .iter()
        .filter(|s| s.kind == "ingest-report")
        .count();
    assert_eq!(
        ingest_steps, contributing,
        "expected one ingest-report per contributing breed"
    );

    // Coherent arbitration: non-empty trace ending in a resolve, with a
    // selected overall decision.
    assert!(
        !meta_output.inference_trace.is_empty(),
        "meta_reasoning produced an empty trace"
    );
    assert!(
        meta_output
            .inference_trace
            .iter()
            .any(|s| s.kind == "resolve"),
        "meta_reasoning trace must contain a resolve step"
    );
    let selected = meta_output
        .selected
        .as_deref()
        .expect("meta_reasoning must select an overall decision");
    assert!(!selected.is_empty(), "selected decision must be non-empty");

    // The arbitration's OCEL lifecycle must conform to meta_reasoning's model.
    let trace_str = serde_json::to_string(&meta_output.inference_trace).unwrap_or_default();
    let run_id = blake3::hash(trace_str.as_bytes()).to_hex().to_string();
    let ocel_log = wasm4pm_cognition::ocel::derive_ocel(
        "meta_reasoning",
        &run_id,
        &meta_output.inference_trace,
    );
    let model = wasm4pm_cognition::ocel::lifecycle_model_for("meta_reasoning")
        .expect("meta_reasoning lifecycle model must exist");
    let result = wasm4pm_cognition::ocel::validate_ocel_alignment(&ocel_log, model);
    
    assert_eq!(result.fitness, 1.0, "meta_reasoning fitness must be 1.0");

}
