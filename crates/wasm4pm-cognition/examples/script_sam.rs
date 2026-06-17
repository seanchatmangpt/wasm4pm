//! ScriptSam — Script Applier Mechanism (Schank & Abelson, 1977).
//!
//! Demonstrates the restaurant script: a story mentions entering, ordering,
//! paying, and leaving. The breed selects the "restaurant" script, aligns the
//! observed events, and infers the unobserved "eat" scene that must have
//! happened between "order" and "pay" (bounded gap inference).
//!
//! Run: cargo run --example script_sam

use wasm4pm_cognition::breeds::{
    dispatch::run_breed, BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom,
};
use wasm4pm_cognition::breeds::script_sam::ScriptSam;

fn main() {
    // Story: "John went to a restaurant. He ordered a meal. He paid the bill
    // and left." — the eating scene is implicit; SAM must infer it.
    let input = BreedInput {
        intent: "understand story".to_string(),
        candidates: vec![],
        facts: vec![
            Fact { key: "sam:event:1".to_string(), value: "enter:john".to_string() },
            Fact { key: "sam:event:2".to_string(), value: "order:john".to_string() },
            // "eat" is deliberately omitted — SAM should infer it as a gap filler.
            Fact { key: "sam:event:3".to_string(), value: "pay:john".to_string() },
            Fact { key: "sam:event:4".to_string(), value: "leave:john".to_string() },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let breed = ScriptSam;
    match run_breed(&breed, &input) {
        Ok(output) => {
            let output_json = serde_json::to_string(&output).expect("serialize output");
            let output_hash = blake3::hash(output_json.as_bytes()).to_hex().to_string();

            println!("script_sam ok — selected={:?}  hash={}", output.selected, &output_hash[..16]);
            println!("  {}", output.explanation);

            // Print inferred gap scenes.
            let inferred: Vec<&Fact> = output
                .facts
                .iter()
                .filter(|f| f.key.starts_with("sam:inferred:") && f.key != "sam:inferred_count")
                .collect();
            if inferred.is_empty() {
                println!("  no gap scenes inferred");
            } else {
                for f in &inferred {
                    println!("  inferred scene '{}' for actor '{}'",
                        f.key.strip_prefix("sam:inferred:").unwrap_or(&f.key),
                        f.value);
                }
            }

            // Print role bindings.
            for f in output.facts.iter().filter(|f| f.key.starts_with("sam:role:")) {
                let role = f.key.strip_prefix("sam:role:").unwrap_or(&f.key);
                println!("  role '{}' bound to actor '{}'", role, f.value);
            }
        }
        Err(e) => {
            eprintln!("script_sam error: {e}");
            std::process::exit(1);
        }
    }
}
