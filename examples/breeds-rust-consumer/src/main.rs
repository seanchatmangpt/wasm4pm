//! Working example — consuming the `wasm4pm-breeds-rust` ggen pack.
//!
//! `breed_ids.rs` and `breed_catalog.rs` were GENERATED from the breed ontology
//! by `ggen sync` (see ggen.toml). `breed_types.rs` is the fixed WASM contract,
//! copied from the pack's `static/`. Nothing here was hand-written per breed.
//!
//! Run: `ggen sync && cargo run`

mod breed_catalog;
mod breed_ids;
mod breed_types;

use breed_catalog::CATALOG;
use breed_ids::BreedId;
use breed_types::{BreedInput, CognitionRunInput, Fact, Rule};

fn main() {
    // 1. The generated catalog: every breed, with its paper citation.
    println!("wasm4pm cognition breeds: {} total\n", CATALOG.len());
    println!("First 5 (id · label · citation):");
    for info in CATALOG.iter().take(5) {
        let cite = info.citation.split('.').next().unwrap_or(info.citation);
        println!("  {:<22} {:<22} {cite}.", info.id, info.label);
    }

    // 2. The generated typed id enum — total over the ontology, no magic strings.
    println!("\nBreedId::ALL has {} variants", BreedId::ALL.len());
    let parsed = BreedId::from_str_id("mycin").expect("mycin is a known breed");
    println!("from_str_id(\"mycin\") = {parsed:?}  → as_str() = {:?}", parsed.as_str());
    assert_eq!(BreedId::from_str_id("not_a_breed"), None);

    // Round-trip every id through the enum — the generated surface is total.
    for info in CATALOG {
        let id = BreedId::from_str_id(info.id)
            .unwrap_or_else(|| panic!("catalog id {} must resolve to a BreedId", info.id));
        assert_eq!(id.as_str(), info.id);
    }
    println!("✓ all {} catalog ids round-trip through BreedId", CATALOG.len());

    // 3. Build a real MYCIN request using the fixed contract types, and show the
    //    cognition_run envelope a host would send to the WASM core. (The actual
    //    WASM call lives in your app; this example demonstrates the typed shape.)
    let request = CognitionRunInput {
        breed: parsed.as_str().to_string(),
        contract: BreedInput {
            intent: "diagnose bacteremia organism".to_string(),
            facts: vec![
                Fact { key: "gram-stain".into(), value: "gram-positive".into() },
                Fact { key: "morphology".into(), value: "coccus".into() },
                Fact { key: "growth-conformation".into(), value: "chains".into() },
            ],
            rules: vec![Rule {
                id: "RULE050".into(),
                premise: vec!["gram-positive".into(), "coccus".into(), "chains".into()],
                conclusion: "streptococcus".into(),
                certainty: 0.7,
            }],
            ..Default::default()
        },
        options: None,
    };
    println!("\ncognition_run request for `{}`:", request.breed);
    println!("{}", serde_json::to_string_pretty(&request).unwrap());
}
