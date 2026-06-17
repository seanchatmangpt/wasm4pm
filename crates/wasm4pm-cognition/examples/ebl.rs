//! EBL — Explanation-Based Learning (Mitchell, Keller & Kedar-Cabelli 1986).
//!
//! Three phases: Explain (SLD backward chaining), Generalize (EGGS goal
//! regression), Operationalize (emit learned rule with variables).
//!
//! Domain: "safe-to-drink" cup example — classic EBL textbook scenario.
//! Facts assert ground atoms for a specific training object (cup1).
//! Rules encode the domain theory.  The training goal is safe_to_drink(cup1).
//!
//! Run: cargo run --example ebl

use wasm4pm_cognition::breeds::{
    dispatch::run_breed, BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom,
};
use wasm4pm_cognition::breeds::ebl::Ebl;

fn main() {
    // Ground facts about the training object "cup1".
    // EBL reads fact keys as ground atoms (fact.key is the atom string).
    let input = BreedInput {
        intent: "learn-safe-to-drink".to_string(),
        candidates: vec![],
        facts: vec![
            // cup1 is a stable container with a liquid inside.
            Fact { key: "is_container(cup1)".to_string(),  value: "true".to_string() },
            Fact { key: "is_stable(cup1)".to_string(),     value: "true".to_string() },
            Fact { key: "has_liquid(cup1)".to_string(),    value: "true".to_string() },
            Fact { key: "liquid_is_potable(cup1)".to_string(), value: "true".to_string() },
        ],
        cases: vec![],
        // Domain theory: rules that encode how safe_to_drink is derived.
        // Rule variables use ?var syntax; conclusion is the head atom.
        rules: vec![
            Rule {
                id: "r1-drinkable-vessel".to_string(),
                premise: vec![
                    "is_container(?X)".to_string(),
                    "is_stable(?X)".to_string(),
                    "holds_potable_liquid(?X)".to_string(),
                ],
                conclusion: "safe_to_drink(?X)".to_string(),
                certainty: 1.0,
            },
            Rule {
                id: "r2-holds-potable".to_string(),
                premise: vec![
                    "has_liquid(?X)".to_string(),
                    "liquid_is_potable(?X)".to_string(),
                ],
                conclusion: "holds_potable_liquid(?X)".to_string(),
                certainty: 1.0,
            },
        ],
        // Training goal: prove safe_to_drink for the specific object cup1.
        goals: vec![
            Goal {
                id: "training-example".to_string(),
                predicate: "safe_to_drink(cup1)".to_string(),
                value: "true".to_string(),
            },
        ],
        state: vec![],
    };

    let breed = Ebl;
    match run_breed(&breed, &input) {
        Ok(output) => {
            let output_json = serde_json::to_string(&output).expect("serialize output");
            let output_hash = blake3::hash(output_json.as_bytes()).to_hex().to_string();
            println!("ebl ok — hash={}", &output_hash[..16]);
            println!("  {}", output.explanation);
            if let Some(ref rule) = output.selected {
                println!("  learned rule: {}", rule);
            }
            println!(
                "  trace steps: {}",
                output.inference_trace.len()
            );
        }
        Err(e) => {
            eprintln!("ebl error: {e}");
            std::process::exit(1);
        }
    }
}
