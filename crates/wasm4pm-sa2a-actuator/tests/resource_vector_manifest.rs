use std::collections::BTreeSet;
use std::fs;

use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct Vector {
    version: String,
    case: String,
    ordinal: u32,
    law: String,
    expected: String,
}

#[test]
fn all_resource_vectors_are_executable_manifest_inputs() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("resource_vectors");

    let mut ordinals = BTreeSet::new();
    let mut cases = BTreeSet::new();
    let mut count = 0;

    for entry in fs::read_dir(root).unwrap() {
        let path = entry.unwrap().path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }

        let vector: Vector = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();

        assert_eq!(vector.version, "sa2a/resource-vector/v1");
        assert!(!vector.case.is_empty());
        assert!(!vector.law.is_empty());
        assert!(matches!(vector.expected.as_str(), "admit" | "refuse"));
        assert!(ordinals.insert(vector.ordinal));
        assert!(cases.insert(vector.case));
        count += 1;
    }

    assert_eq!(count, 43);
    assert_eq!(ordinals, (1..=43).collect());
}
