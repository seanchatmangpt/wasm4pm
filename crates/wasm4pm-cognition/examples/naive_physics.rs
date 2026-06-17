//! Naive physics — Hayes-style commonsense axiom saturation.
//! Scene: a table on the floor, a vase on the table, water inside the vase.
//! Event: the table is removed. Expected predictions: table falls, vase falls,
//! water spills (ax-support → ax-unsupported-falls → ax-liquid-spill).
//!
//! Run: cargo run --example naive_physics

use wasm4pm_cognition::breeds::naive_physics::NaivePhysics;
use wasm4pm_cognition::breeds::{
    dispatch::run_breed, BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom,
};

fn main() {
    // Scene:
    //   floor  — ground
    //   table  — on floor
    //   vase   — on table
    //   water  — liquid in vase
    // Event: remove table (support of vase is gone, triggering cascade)
    let input = BreedInput {
        intent: "predict-falling-objects".to_string(),
        candidates: vec![],
        facts: vec![
            // ground declaration
            Fact {
                key: "np:ground:floor".to_string(),
                value: "true".to_string(),
            },
            // support chain
            Fact {
                key: "np:on:table".to_string(),
                value: "floor".to_string(),
            },
            Fact {
                key: "np:on:vase".to_string(),
                value: "table".to_string(),
            },
            // liquid containment
            Fact {
                key: "np:liquid:water".to_string(),
                value: "vase".to_string(),
            },
            // perturbation event: table is removed
            Fact {
                key: "np:remove:table".to_string(),
                value: "true".to_string(),
            },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let breed = NaivePhysics;
    match run_breed(&breed, &input) {
        Ok(output) => {
            let output_json = serde_json::to_string(&output).expect("serialize output");
            let output_hash = blake3::hash(output_json.as_bytes()).to_hex().to_string();
            println!(
                "naive_physics ok — selected={:?}  hash={}",
                output.selected,
                &output_hash[..16]
            );
            println!("  {}", output.explanation);
            for f in &output.facts {
                println!("  prediction: {} = {}", f.key, f.value);
            }
        }
        Err(e) => {
            eprintln!("naive_physics error: {e}");
            std::process::exit(1);
        }
    }
}
