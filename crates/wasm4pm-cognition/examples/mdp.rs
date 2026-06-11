//! MDP — value iteration to the Bellman fixed point (Bellman 1957).
//!
//! Scenario: robot navigation in a 3-room office.
//!   office → corridor  (move: p=0.9 success, p=0.1 stay)
//!   office → office    (wait: deterministic self-loop, small reward)
//!   corridor → goal    (move: deterministic)
//!   corridor → office  (back: deterministic)
//!   goal → goal        (absorbing terminal state)
//!
//! Discount γ = 0.9. Reward for reaching goal = 10.0; waiting in office = 0.1.
//!
//! Run: cargo run --example mdp

use wasm4pm_cognition::breeds::mdp::Mdp;
use wasm4pm_cognition::breeds::{
    dispatch::run_breed, BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom,
};

fn fact(key: &str, value: &str) -> Fact {
    Fact { key: key.to_string(), value: value.to_string() }
}

fn main() {
    let input = BreedInput {
        intent: "robot-navigation".to_string(),
        candidates: vec![],
        facts: vec![
            // Discount factor
            fact("mdp:gamma", "0.9"),

            // Transitions from "office"
            // move: 90% → corridor, 10% → stay in office
            fact("mdp:trans:office:move", "corridor:0.9;office:0.1"),
            // wait: stay in office with certainty
            fact("mdp:trans:office:wait", "office:1.0"),

            // Transitions from "corridor"
            // move: deterministically reach goal
            fact("mdp:trans:corridor:move", "goal:1.0"),
            // back: deterministically return to office
            fact("mdp:trans:corridor:back", "office:1.0"),

            // Absorbing goal state (terminal)
            fact("mdp:trans:goal:wait", "goal:1.0"),

            // Rewards
            fact("mdp:reward:office:wait", "0.1"),
            fact("mdp:reward:corridor:move", "10.0"),
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let breed = Mdp;
    match run_breed(&breed, &input) {
        Ok(output) => {
            let output_json = serde_json::to_string(&output).expect("serialize output");
            let output_hash = blake3::hash(output_json.as_bytes()).to_hex().to_string();

            println!("mdp ok — policy={:?}", output.selected);
            println!("  {}", output.explanation);
            println!("  output_hash={}", &output_hash[..16]);
            println!();

            // Print per-state values and optimal actions
            let mut values: Vec<_> = output.facts.iter()
                .filter(|f| f.key.starts_with("mdp:value:"))
                .collect();
            values.sort_by(|a, b| a.key.cmp(&b.key));

            let mut policies: Vec<_> = output.facts.iter()
                .filter(|f| f.key.starts_with("mdp:policy:"))
                .collect();
            policies.sort_by(|a, b| a.key.cmp(&b.key));

            println!("  State values (V*):");
            for f in &values {
                let state = f.key.strip_prefix("mdp:value:").unwrap_or(&f.key);
                println!("    {:<12} V = {}", state, f.value);
            }
            println!();
            println!("  Greedy policy π*:");
            for f in &policies {
                let state = f.key.strip_prefix("mdp:policy:").unwrap_or(&f.key);
                println!("    {:<12} → {}", state, f.value);
            }
        }
        Err(e) => {
            eprintln!("mdp error: {e}");
            std::process::exit(1);
        }
    }
}
