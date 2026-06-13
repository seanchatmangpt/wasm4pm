use std::fs;
use wasm4pm_cognition::breeds::BreedId;

#[test]
fn test_fixture_parity() {
    let registry_data =
        fs::read_to_string("breeds/registry.json").expect("failed to read registry.json");
    let registry: Vec<serde_json::Value> =
        serde_json::from_str(&registry_data).expect("failed to parse registry.json");

    for entry in registry {
        let breed_id = entry["breed_id"].as_str().expect("missing breed_id");
        let status = entry["status"].as_str().expect("missing status");

        // Fixtures are only required when the breed lands.
        if status != "UNSUPPORTED" {
            let rust_fixture = format!("tests/fixtures/papers/{}.json", breed_id);
            assert!(
                fs::metadata(&rust_fixture).is_ok(),
                "Missing Rust fixture for {}",
                breed_id
            );

            let ts_fixture = format!(
                "../../packages/cognition/src/__tests__/fixtures/papers/{}.json",
                breed_id
            );
            assert!(
                fs::metadata(&ts_fixture).is_ok(),
                "Missing TS fixture for {}",
                breed_id
            );
        }
    }
}

#[test]
fn test_breed_id_schema_parity() {
    // The TS BreedIdSchema consumes the ggen-generated PARTIAL_ALIVE_BREED_IDS
    // (breed-ids.ts); check the generated surface, which is the source of truth.
    let schema_file = "../../packages/cognition/src/breed-ids.ts";
    let schema_content = fs::read_to_string(schema_file).expect("failed to read breed-ids.ts");

    for breed in BreedId::ALL {
        let breed_str = breed.to_string();
        // The breed string should be in the schemas.ts file somewhere, e.g., 'mycin'
        let pattern = format!("'{}'", breed_str);
        let pattern2 = format!("\"{}\"", breed_str);
        assert!(
            schema_content.contains(&pattern) || schema_content.contains(&pattern2),
            "schemas.ts is missing BreedId variant: {}",
            breed_str
        );
    }
}
