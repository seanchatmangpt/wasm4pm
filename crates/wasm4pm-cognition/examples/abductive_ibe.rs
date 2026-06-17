//! Abductive IBE — Inference to the Best Explanation (Harman 1965, Thagard 1978).
//!
//! Scenario: a patient presents with fever, cough, and fatigue.
//! Three competing diagnostic hypotheses are scored by how many symptoms
//! they explain (consilience) minus a simplicity penalty (0.1 × assumption cost).
//!
//! Run: cargo run --example abductive_ibe

use wasm4pm_cognition::breeds::abductive_ibe::AbductiveIbe;
use wasm4pm_cognition::breeds::{
    dispatch::run_breed, BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom,
};

fn main() {
    let input = BreedInput {
        intent: "explain".to_string(),
        candidates: vec![],
        facts: vec![
            // Observations — symptoms to be explained
            Fact {
                key: "ibe:obs:fever".to_string(),
                value: "true".to_string(),
            },
            Fact {
                key: "ibe:obs:cough".to_string(),
                value: "true".to_string(),
            },
            Fact {
                key: "ibe:obs:fatigue".to_string(),
                value: "true".to_string(),
            },
            // Hypothesis: influenza — explains all three symptoms, moderate assumption cost
            Fact {
                key: "ibe:hyp:influenza:covers".to_string(),
                value: "fever,cough,fatigue".to_string(),
            },
            Fact {
                key: "ibe:hyp:influenza:cost".to_string(),
                value: "3".to_string(),
            },
            // Hypothesis: common_cold — explains cough and fatigue only, low cost
            Fact {
                key: "ibe:hyp:common_cold:covers".to_string(),
                value: "cough,fatigue".to_string(),
            },
            Fact {
                key: "ibe:hyp:common_cold:cost".to_string(),
                value: "1".to_string(),
            },
            // Hypothesis: pneumonia — explains fever and fatigue, high cost (requires imaging)
            Fact {
                key: "ibe:hyp:pneumonia:covers".to_string(),
                value: "fever,fatigue".to_string(),
            },
            Fact {
                key: "ibe:hyp:pneumonia:cost".to_string(),
                value: "8".to_string(),
            },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let breed = AbductiveIbe;
    match run_breed(&breed, &input) {
        Ok(output) => {
            let output_json = serde_json::to_string(&output).expect("serialize BreedOutput");
            let output_hash = blake3::hash(output_json.as_bytes()).to_hex().to_string();
            println!(
                "abductive_ibe ok — selected={:?}  hash={}",
                output.selected,
                &output_hash[..16]
            );
            println!("  {}", output.explanation);
            for f in &output.facts {
                println!("  fact  {} = {}", f.key, f.value);
            }
            println!("  ranked candidates:");
            for c in &output.candidates {
                println!("    {:20}  score={:.4}", c.id, c.score);
            }
        }
        Err(e) => {
            eprintln!("abductive_ibe error: {e}");
            std::process::exit(1);
        }
    }
}
