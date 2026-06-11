//! ACT-R — production/retrieval cycle with activation-based declarative memory
//! (Anderson & Lebiere 1998, *The Atomic Components of Thought*).
//!
//! Scenario: a tutoring system deciding which worked example to retrieve
//! for a student who is currently solving an algebra problem.
//!
//! Run: cargo run --example act_r

use wasm4pm_cognition::breeds::{
    dispatch::run_breed, BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom,
};
use wasm4pm_cognition::breeds::act_r::ActR;

fn main() {
    // Working memory: student is solving a linear-equation problem involving
    // one variable and has just encountered a subtraction step.
    let input = BreedInput {
        intent: "select-worked-example".to_string(),
        candidates: vec![],
        facts: vec![
            Fact { key: "task".to_string(),      value: "solve-equation".to_string() },
            Fact { key: "step".to_string(),       value: "subtraction".to_string() },
            Fact { key: "domain".to_string(),     value: "algebra".to_string() },
            // Retrieval threshold: only surface chunks with activation ≥ 0.5
            Fact { key: "actr:threshold".to_string(), value: "0.5".to_string() },
        ],
        // Declarative memory chunks — worked examples with base-level activations.
        cases: vec![
            Case {
                id: "example-linear-subtraction".to_string(),
                intent: "select-worked-example".to_string(),
                architecture: "algebra-tutor".to_string(),
                outcome_score: 0.85, // high base-level (frequently retrieved)
                facts: vec![
                    Fact { key: "domain".to_string(),   value: "algebra".to_string() },
                    Fact { key: "step".to_string(),     value: "subtraction".to_string() },
                    Fact { key: "concept".to_string(),  value: "linear-equation".to_string() },
                ],
            },
            Case {
                id: "example-quadratic-factoring".to_string(),
                intent: "select-worked-example".to_string(),
                architecture: "algebra-tutor".to_string(),
                outcome_score: 0.60,
                facts: vec![
                    Fact { key: "domain".to_string(),   value: "algebra".to_string() },
                    Fact { key: "step".to_string(),     value: "factoring".to_string() },
                    Fact { key: "concept".to_string(),  value: "quadratic".to_string() },
                ],
            },
            Case {
                id: "example-geometry-angles".to_string(),
                intent: "select-worked-example".to_string(),
                architecture: "geometry-tutor".to_string(),
                outcome_score: 0.40,
                facts: vec![
                    Fact { key: "domain".to_string(),  value: "geometry".to_string() },
                    Fact { key: "step".to_string(),    value: "angle-sum".to_string() },
                    Fact { key: "concept".to_string(), value: "triangle".to_string() },
                ],
            },
        ],
        // Productions: procedural knowledge rules.
        rules: vec![
            Rule {
                id: "p1-recognize-subtraction-goal".to_string(),
                premise: vec![
                    "task=solve-equation".to_string(),
                    "step=subtraction".to_string(),
                ],
                conclusion: "retrieve:step=subtraction".to_string(),
                certainty: 0.95,
            },
            Rule {
                id: "p2-confirm-domain".to_string(),
                premise: vec![
                    "domain=algebra".to_string(),
                    "retrieved=example-linear-subtraction".to_string(),
                ],
                conclusion: "action=present-example".to_string(),
                certainty: 0.80,
            },
            Rule {
                id: "p3-fallback-generic".to_string(),
                premise: vec![
                    "task=solve-equation".to_string(),
                    "retrieval=failure".to_string(),
                ],
                conclusion: "action=show-hint".to_string(),
                certainty: 0.50,
            },
        ],
        goals: vec![
            Goal {
                id: "g1".to_string(),
                predicate: "retrieve-example".to_string(),
                value: "step=subtraction".to_string(),
            },
        ],
        state: vec![
            StateAtom {
                predicate: "student-level".to_string(),
                value: "beginner".to_string(),
            },
        ],
    };

    let breed = ActR;
    match run_breed(&breed, &input) {
        Ok(output) => {
            let output_json = serde_json::to_string(&output).expect("serialize output");
            let output_hash = blake3::hash(output_json.as_bytes()).to_hex().to_string();
            println!("act_r ok — selected={:?}  hash={}", output.selected, &output_hash[..16]);
            println!("  {}", output.explanation);
            println!("  working-memory additions ({}):", output.facts.len());
            for f in &output.facts {
                println!("    {}={}", f.key, f.value);
            }
            println!("  trace steps: {}", output.inference_trace.len());
            for step in &output.inference_trace {
                println!("    [{}] {}: {}", step.step, step.kind, step.detail);
            }
        }
        Err(e) => {
            eprintln!("act_r error: {e}");
            std::process::exit(1);
        }
    }
}
