//! Episodic memory — Tulving-style cue-based recall with temporal-proximity kernel.
//! Jaccard(cue, episode_snapshot) + 1/(1 + |Δt|) scores each episode; the
//! temporal kernel can flip the winner against pure content similarity.
//! Run: cargo run --example episodic_memory

use wasm4pm_cognition::breeds::{
    dispatch::run_breed, BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom,
};
use wasm4pm_cognition::breeds::episodic_memory::EpisodicMemory;

fn main() {
    // Scenario: a software engineer recalls a past debugging session.
    // Three episodes are encoded; the retrieval cue matches episode content
    // but the temporal kernel flips the winner for the most-recent match.
    //
    // Episodes (cases):
    //   "debug-2024-01"  t=100  — memory leak in allocator, found via valgrind
    //   "debug-2024-07"  t=200  — memory leak in allocator, found via heaptrack (same content, later)
    //   "debug-2024-11"  t=290  — null-pointer crash, unrelated content
    //
    // Cue: t=300, memory leak in allocator
    // Pure Jaccard would tie the first two; temporal kernel picks "debug-2024-07" (Δt=100 vs Δt=200).

    let input = BreedInput {
        intent: "recall-debugging-session".to_string(),
        candidates: vec![],
        facts: vec![
            // Episode encoding times (facts on the top-level BreedInput)
            Fact { key: "episode:debug-2024-01:t".to_string(), value: "100".to_string() },
            Fact { key: "episode:debug-2024-07:t".to_string(), value: "200".to_string() },
            Fact { key: "episode:debug-2024-11:t".to_string(), value: "290".to_string() },
            // Retrieval cue atoms
            Fact { key: "symptom".to_string(),  value: "memory-leak".to_string() },
            Fact { key: "component".to_string(), value: "allocator".to_string() },
            Fact { key: "tool".to_string(),      value: "valgrind".to_string() },
            // Current time
            Fact { key: "cue:t".to_string(), value: "300".to_string() },
        ],
        cases: vec![
            Case {
                id: "debug-2024-01".to_string(),
                intent: "recall-debugging-session".to_string(),
                architecture: "valgrind-trace".to_string(),
                outcome_score: 0.85,
                facts: vec![
                    Fact { key: "symptom".to_string(),   value: "memory-leak".to_string() },
                    Fact { key: "component".to_string(),  value: "allocator".to_string() },
                    Fact { key: "tool".to_string(),       value: "valgrind".to_string() },
                    Fact { key: "resolution".to_string(), value: "free-missing-ptr".to_string() },
                ],
            },
            Case {
                id: "debug-2024-07".to_string(),
                intent: "recall-debugging-session".to_string(),
                architecture: "heaptrack-trace".to_string(),
                outcome_score: 0.92,
                facts: vec![
                    Fact { key: "symptom".to_string(),   value: "memory-leak".to_string() },
                    Fact { key: "component".to_string(),  value: "allocator".to_string() },
                    Fact { key: "tool".to_string(),       value: "heaptrack".to_string() },
                    Fact { key: "resolution".to_string(), value: "arena-reset".to_string() },
                ],
            },
            Case {
                id: "debug-2024-11".to_string(),
                intent: "recall-debugging-session".to_string(),
                architecture: "gdb-trace".to_string(),
                outcome_score: 0.78,
                facts: vec![
                    Fact { key: "symptom".to_string(),   value: "null-pointer-crash".to_string() },
                    Fact { key: "component".to_string(),  value: "parser".to_string() },
                    Fact { key: "tool".to_string(),       value: "gdb".to_string() },
                    Fact { key: "resolution".to_string(), value: "null-check-guard".to_string() },
                ],
            },
        ],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let breed = EpisodicMemory;
    match run_breed(&breed, &input) {
        Ok(output) => {
            let output_json = serde_json::to_string(&output).expect("serialize output");
            let output_hash = blake3::hash(output_json.as_bytes()).to_hex().to_string();
            println!(
                "episodic_memory ok — recalled={:?}  hash={}",
                output.selected,
                &output_hash[..16]
            );
            println!("  {}", output.explanation);
            for f in &output.facts {
                if f.key.starts_with("score:") {
                    println!("  {}: {}", f.key, f.value);
                }
            }
        }
        Err(e) => {
            eprintln!("episodic_memory error: {e}");
            std::process::exit(1);
        }
    }
}
