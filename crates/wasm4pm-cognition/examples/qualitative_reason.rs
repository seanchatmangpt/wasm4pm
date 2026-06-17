//! QualitativeReason — confluence propagation and envisionment (de Kleer & Brown 1984).
//!
//! Scenario: bathtub water-level dynamics.
//!   Confluence c1: [flow_in] − [flow_out] − [d_level] = 0
//!   Confluence c2: [d_level] − [d_pressure] = 0
//!   Known: flow_in = +, flow_out = +  (tap open, drain partially open — ambiguous net)
//!
//! Run: cargo run --example qualitative_reason

use wasm4pm_cognition::breeds::qualitative_reason::QualitativeReason;
use wasm4pm_cognition::breeds::{
    dispatch::run_breed, BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom,
};

fn main() {
    let input = BreedInput {
        intent: "bathtub-dynamics".to_string(),
        candidates: vec![],
        facts: vec![
            // c1: flow_in - flow_out - d_level = 0
            Fact {
                key: "qr:confluence:c1".to_string(),
                value: "+flow_in,-flow_out,-d_level".to_string(),
            },
            // c2: d_level - d_pressure = 0 (pressure tracks level)
            Fact {
                key: "qr:confluence:c2".to_string(),
                value: "+d_level,-d_pressure".to_string(),
            },
            // Known signs: tap open (in=+), drain partially open (out=+)
            Fact {
                key: "qr:sign:flow_in".to_string(),
                value: "+".to_string(),
            },
            Fact {
                key: "qr:sign:flow_out".to_string(),
                value: "+".to_string(),
            },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let breed = QualitativeReason;
    match run_breed(&breed, &input) {
        Ok(output) => {
            let output_json = serde_json::to_string(&output).expect("serialize output");
            let output_hash = blake3::hash(output_json.as_bytes()).to_hex().to_string();
            println!(
                "qualitative_reason ok — {} — hash={}",
                output.selected.as_deref().unwrap_or("none"),
                &output_hash[..16]
            );
            println!("  {}", output.explanation);
            println!();
            // Print each envisioned state and the equilibrium verdict
            for f in &output.facts {
                if f.key.starts_with("qr:state:") || f.key == "qr:equilibrium" || f.key == "qr:state_count" {
                    println!("  {} = {}", f.key, f.value);
                }
            }
        }
        Err(e) => {
            eprintln!("qualitative_reason error: {e}");
            std::process::exit(1);
        }
    }
}
