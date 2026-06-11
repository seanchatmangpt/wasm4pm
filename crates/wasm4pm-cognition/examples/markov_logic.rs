//! Markov Logic Network MAP inference via MaxWalkSAT.
//! Demonstrates a simple disease-diagnosis MLN: Rain → Wet, Wet → Slippery.
//! Run: cargo run --example markov_logic

use wasm4pm_cognition::breeds::{
    dispatch::run_breed, BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom,
};
use wasm4pm_cognition::breeds::markov_logic::MarkovLogic;

fn main() {
    // Weighted ground clauses encode a small MLN for a slippery-road scenario.
    // Format: mln:clause:<id> = "<weight>|<lit1>,<lit2>,..."
    //   literal "atom"  = positive
    //   literal "!atom" = negative
    //
    // Rules:
    //   Rain -> Wet        (~3.0)  "if it rains, the ground is wet"
    //   Wet  -> Slippery   (~2.5)  "if ground is wet, road is slippery"
    //   Sprinkler -> Wet   (~2.0)  "if sprinkler is on, ground is wet"
    //
    // Evidence: Rain = true, Sprinkler = false.
    // Expected MAP: Wet = true, Slippery = true.
    let input = BreedInput {
        intent: "diagnose-road-condition".to_string(),
        candidates: vec![],
        facts: vec![
            // Rain -> Wet  (i.e. !Rain v Wet)
            Fact { key: "mln:clause:r1".to_string(), value: "3.0|!rain,wet".to_string() },
            // Wet -> Slippery  (i.e. !Wet v Slippery)
            Fact { key: "mln:clause:r2".to_string(), value: "2.5|!wet,slippery".to_string() },
            // Sprinkler -> Wet  (i.e. !Sprinkler v Wet)
            Fact { key: "mln:clause:r3".to_string(), value: "2.0|!sprinkler,wet".to_string() },
            // Evidence: Rain is observed true
            Fact { key: "evidence:rain".to_string(), value: "true".to_string() },
            // Evidence: Sprinkler is observed false
            Fact { key: "evidence:sprinkler".to_string(), value: "false".to_string() },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let breed = MarkovLogic;
    match run_breed(&breed, &input) {
        Ok(output) => {
            let output_json = serde_json::to_string(&output).expect("serialize output");
            let output_hash = blake3::hash(output_json.as_bytes()).to_hex().to_string();
            println!(
                "markov_logic ok — selected={:?}  hash={}",
                output.selected,
                &output_hash[..16]
            );
            println!("  {}", output.explanation);
        }
        Err(e) => {
            eprintln!("markov_logic error: {e}");
            std::process::exit(1);
        }
    }
}
