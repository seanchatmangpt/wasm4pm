//! Hard admission contract for the cognition Divan matrix.
//!
//! Performance numbers are meaningless when an implementation can avoid real work. This test
//! therefore proves that every legally admitted cognition is benchmark-eligible through the
//! exact full dispatch path before any timing result is accepted.

use std::collections::BTreeSet;
use std::fs;
use std::path::PathBuf;

use wasm4pm_cognition::breeds::dispatch::{dispatch_breed_id, dispatch_breed_test_id};
use wasm4pm_cognition::breeds::{BreedId, BreedInput};

fn fixture_path(id: BreedId) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join("papers")
        .join(format!("{}.json", id))
}

fn fixture_input(id: BreedId) -> BreedInput {
    let path = fixture_path(id);
    let raw = fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("{}: benchmark fixture {} unavailable: {e}", id, path.display()));
    let json: serde_json::Value = serde_json::from_str(&raw)
        .unwrap_or_else(|e| panic!("{}: invalid benchmark fixture {}: {e}", id, path.display()));
    let mut inp = json["input"].clone();
    let obj = inp
        .as_object_mut()
        .unwrap_or_else(|| panic!("{}: fixture input must be an object", id));
    obj.entry("intent").or_insert(serde_json::json!(""));
    for key in ["candidates", "facts", "cases", "rules", "goals", "state"] {
        obj.entry(key).or_insert(serde_json::json!([]));
    }
    serde_json::from_value(inp)
        .unwrap_or_else(|e| panic!("{}: fixture cannot deserialize as BreedInput: {e}", id))
}

#[test]
fn divan_matrix_is_exactly_the_55_admitted_cognitions() {
    assert_eq!(
        BreedId::ALL.len(),
        55,
        "benchmark crown moved: update the explicit 55-cognition acceptance boundary"
    );
    let unique: BTreeSet<_> = BreedId::ALL.into_iter().collect();
    assert_eq!(unique.len(), 55, "BreedId::ALL contains duplicate cognition ids");
}

#[test]
fn every_admitted_cognition_has_real_benchmark_work_and_evidence() {
    for id in BreedId::ALL {
        let input = fixture_input(id);

        let raw = dispatch_breed_test_id(id, &input)
            .unwrap_or_else(|e| panic!("{}: raw cognition benchmark path failed: {e}", id));
        assert_eq!(raw.breed, id, "{}: raw output attributed to another breed", id);
        assert!(
            !raw.inference_trace.is_empty(),
            "{}: raw cognition did zero observable inference work",
            id
        );

        let full = dispatch_breed_id(id, &input)
            .unwrap_or_else(|e| panic!("{}: lawful benchmark path failed: {e}", id));
        assert_eq!(full.breed, id, "{}: full output attributed to another breed", id);
        assert!(
            !full.inference_trace.is_empty(),
            "{}: full cognition did zero observable inference work",
            id
        );
        assert!(full.ocel_log.is_some(), "{}: benchmark path emitted no OCEL evidence", id);
        assert!(
            full.inference_trace
                .windows(2)
                .all(|w| w[0].step < w[1].step),
            "{}: trace is not strictly monotonic",
            id
        );
    }
}
