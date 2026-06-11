//! analogy_sme — Structure-Mapping Engine (Falkenhainer, Forbus & Gentner 1989).
//!
//! Demonstrates the solar-system / atom analogy: the sun attracts planets
//! just as the nucleus attracts electrons. SME should discover the
//! structural correspondence sun→nucleus, planet→electron and infer that
//! the nucleus is more-massive-than the electron.
//!
//! Run: cargo run --example analogy_sme

use wasm4pm_cognition::breeds::analogy_sme::AnalogySme;
use wasm4pm_cognition::breeds::{
    dispatch::run_breed, BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom,
};

fn main() {
    // Solar-system base domain (s-expressions).
    //   (attracts sun planet)         — relational structure
    //   (more-massive-than sun planet)
    //   (revolves-around planet sun)
    //
    // Atom target domain:
    //   (attracts nucleus electron)
    //   (revolves-around electron nucleus)
    //
    // Expected SME result:
    //   sun → nucleus, planet → electron
    //   candidate inference: (more-massive-than nucleus electron)
    let input = BreedInput {
        intent: "solar-atom-analogy".to_string(),
        candidates: vec![],
        facts: vec![
            // Base domain: solar system
            Fact {
                key: "base:0".to_string(),
                value: "(attracts sun planet)".to_string(),
            },
            Fact {
                key: "base:1".to_string(),
                value: "(more-massive-than sun planet)".to_string(),
            },
            Fact {
                key: "base:2".to_string(),
                value: "(revolves-around planet sun)".to_string(),
            },
            // Target domain: atom
            Fact {
                key: "target:0".to_string(),
                value: "(attracts nucleus electron)".to_string(),
            },
            Fact {
                key: "target:1".to_string(),
                value: "(revolves-around electron nucleus)".to_string(),
            },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let breed = AnalogySme;
    match run_breed(&breed, &input) {
        Ok(output) => {
            let output_json = serde_json::to_string(&output).expect("serialize output");
            let output_hash = blake3::hash(output_json.as_bytes()).to_hex().to_string();
            println!(
                "analogy_sme ok — selected={:?}  hash={}",
                output.selected,
                &output_hash[..16]
            );
            println!("  {}", output.explanation);
            for f in &output.facts {
                if f.key.starts_with("map:") || f.key.starts_with("inference:") {
                    println!("  {} = {}", f.key, f.value);
                }
            }
        }
        Err(e) => {
            eprintln!("analogy_sme error: {e}");
            std::process::exit(1);
        }
    }
}
