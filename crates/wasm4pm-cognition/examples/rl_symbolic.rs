//! rl_symbolic — Tabular Q-learning over a symbolic MDP (Watkins & Dayan 1992).
//!
//! Models a simple grid-world: an agent navigates from `s0` (top-left) to
//! `goal` (bottom-right) via states s0→s1→s2→goal or s0→s3→goal, with a
//! positive reward only upon reaching `goal`.
//!
//! Run: cargo run --example rl_symbolic

use wasm4pm_cognition::breeds::rl_symbolic::RlSymbolic;
use wasm4pm_cognition::breeds::{
    dispatch::run_breed, BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom,
};

fn main() {
    let input = BreedInput {
        intent: "navigate-to-goal".to_string(),
        candidates: vec![],
        facts: vec![
            // MDP parameters
            Fact {
                key: "mdp:gamma".to_string(),
                value: "0.9".to_string(),
            },
            Fact {
                key: "mdp:start".to_string(),
                value: "s0".to_string(),
            },
            Fact {
                key: "rl:episodes".to_string(),
                value: "300".to_string(),
            },
            // Terminal state (episode ends here)
            Fact {
                key: "mdp:terminal:goal".to_string(),
                value: "goal".to_string(),
            },
            // Transitions: mdp:t:<state>:<action> = "<next_state>" (deterministic)
            Fact {
                key: "mdp:t:s0:right".to_string(),
                value: "s1".to_string(),
            },
            Fact {
                key: "mdp:t:s0:down".to_string(),
                value: "s3".to_string(),
            },
            Fact {
                key: "mdp:t:s1:right".to_string(),
                value: "s2".to_string(),
            },
            Fact {
                key: "mdp:t:s2:down".to_string(),
                value: "goal".to_string(),
            },
            Fact {
                key: "mdp:t:s3:right".to_string(),
                value: "goal".to_string(),
            },
            // Rewards: reaching goal from any action that enters it
            Fact {
                key: "mdp:r:s2:down".to_string(),
                value: "1.0".to_string(),
            },
            Fact {
                key: "mdp:r:s3:right".to_string(),
                value: "1.0".to_string(),
            },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![Goal {
            id: "reach-goal".to_string(),
            predicate: "policy".to_string(),
            value: "s0".to_string(),
        }],
        state: vec![StateAtom {
            predicate: "position".to_string(),
            value: "s0".to_string(),
        }],
    };

    let breed = RlSymbolic;
    match run_breed(&breed, &input) {
        Ok(output) => {
            let output_json = serde_json::to_string(&output).expect("serialize output");
            let output_hash = blake3::hash(output_json.as_bytes()).to_hex().to_string();
            println!(
                "rl_symbolic ok — best_action_from_start={:?}  hash={}",
                output.selected,
                &output_hash[..16]
            );
            println!("  {}", output.explanation);
            // Print the extracted greedy policy for each state
            for fact in &output.facts {
                if fact.key.starts_with("policy:") {
                    println!("  {}: {}", fact.key, fact.value);
                }
            }
        }
        Err(e) => {
            eprintln!("rl_symbolic error: {e}");
            std::process::exit(1);
        }
    }
}
