//! Dempster–Shafer — evidence combination for medical diagnosis.
//!
//! Scenario: Two independent diagnostic tests (Lab and Imaging) each provide
//! basic probability mass over three hypotheses: Flu, Cold, Healthy.
//! We combine them with Dempster's rule and query the belief/plausibility of Flu.
//!
//! Run: cargo run --example dempster_shafer

use wasm4pm_cognition::breeds::dempster_shafer::DempsterShafer;
use wasm4pm_cognition::breeds::{
    dispatch::run_breed, BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom,
};

fn main() {
    // Source 1: Lab test — strong evidence for Flu, some mass on Cold
    // Source 2: Imaging — moderate evidence for Flu, some for Healthy
    // Both sources leave residual mass on the full frame (ignorance).
    let input = BreedInput {
        intent: "diagnose-patient".to_string(),
        candidates: vec![],
        facts: vec![
            Fact {
                key: "patient".to_string(),
                value: "P-001".to_string(),
            },
            Fact {
                key: "symptom".to_string(),
                value: "fever".to_string(),
            },
            Fact {
                key: "symptom".to_string(),
                value: "cough".to_string(),
            },
        ],
        cases: vec![],
        // Rules encode basic probability assignments (BPA):
        //   rule id  = source name
        //   conclusion = comma-separated subset of hypotheses
        //   certainty  = mass assigned to that subset (sums ≤ 1; remainder → full frame)
        rules: vec![
            // Lab test: 0.6 mass on Flu, 0.3 mass on Cold  (0.1 residual → frame)
            Rule {
                id: "lab-test".to_string(),
                premise: vec![],
                conclusion: "Flu".to_string(),
                certainty: 0.6,
            },
            Rule {
                id: "lab-test".to_string(),
                premise: vec![],
                conclusion: "Cold".to_string(),
                certainty: 0.3,
            },
            // Imaging test: 0.7 mass on Flu, 0.2 mass on Healthy  (0.1 residual → frame)
            Rule {
                id: "imaging".to_string(),
                premise: vec![],
                conclusion: "Flu".to_string(),
                certainty: 0.7,
            },
            Rule {
                id: "imaging".to_string(),
                premise: vec![],
                conclusion: "Healthy".to_string(),
                certainty: 0.2,
            },
        ],
        goals: vec![Goal {
            id: "query".to_string(),
            predicate: "query".to_string(),
            value: "Flu".to_string(),
        }],
        state: vec![],
    };

    let breed = DempsterShafer;
    match run_breed(&breed, &input) {
        Ok(output) => {
            let output_json = serde_json::to_string(&output).expect("serialize output");
            let output_hash = blake3::hash(output_json.as_bytes()).to_hex().to_string();

            println!("dempster_shafer ok");
            println!("  selected : {:?}", output.selected);
            println!("  hash     : {}", &output_hash[..16]);
            println!("  {}", output.explanation);

            // Print the emitted belief/plausibility facts for easy inspection.
            for fact in output
                .facts
                .iter()
                .filter(|f| f.key.starts_with("belief:") || f.key.starts_with("plausibility:"))
            {
                println!("  {} = {}", fact.key, fact.value);
            }
        }
        Err(e) => {
            eprintln!("dempster_shafer error: {e}");
            std::process::exit(1);
        }
    }
}
