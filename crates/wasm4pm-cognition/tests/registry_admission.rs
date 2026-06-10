use std::fs;
use serde_json::Value;

#[test]
fn test_registry_admission_gate() {
    let registry_path = "breeds/registry.json";
    let registry_data = fs::read_to_string(registry_path).expect("failed to read registry.json");
    let registry: Vec<Value> = serde_json::from_str(&registry_data).expect("failed to parse registry.json");
    
    // We expect exactly 55 entries in the registry for now based on PRD count
    assert_eq!(registry.len(), 55, "Registry must contain exactly 55 entries");

    for entry in registry {
        let breed_id = entry["breed_id"].as_str().expect("missing breed_id");
        let status = entry["status"].as_str().expect("missing status");

        // When a breed is fully ADMITTED, it must satisfy fixture parity and dispatch.
        if status == "ADMITTED" {
            // Check Rust fixture
            let rust_fixture_path = format!("tests/fixtures/papers/{}.json", breed_id);
            assert!(fs::metadata(&rust_fixture_path).is_ok(), "Missing Rust fixture for ADMITTED breed {}", breed_id);

            // Check TS fixture
            let ts_fixture_path = format!("../../packages/cognition/src/__tests__/fixtures/papers/{}.json", breed_id);
            assert!(fs::metadata(&ts_fixture_path).is_ok(), "Missing TS fixture for ADMITTED breed {}", breed_id);
        }
    }
}
