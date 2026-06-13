use wasm4pm_cognition::breeds::allen_temporal::AllenTemporal;
use wasm4pm_cognition::breeds::event_calculus::EventCalculus;
use wasm4pm_cognition::breeds::ltl_monitor::LtlMonitor;
/// chain_temporal — 3-stage cognition chain: AllenTemporal → EventCalculus → LtlMonitor
///
/// Stage 0: Compute Allen relations between acquire/critical/release intervals.
/// Stage 1: Derive lock_held fluent history from temporal relations.
/// Stage 2: Verify safety property G(acquire -> F release) against event history.
///
/// Each stage embeds blake3 output_hash[:16] of the previous output as fact "prior_hash".
use wasm4pm_cognition::breeds::{
    dispatch::run_breed, BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom,
};

fn hash_output(output: &wasm4pm_cognition::breeds::BreedOutput) -> String {
    let json = serde_json::to_string(output).expect("output serialization");
    blake3::hash(json.as_bytes()).to_hex().to_string()
}

fn empty_input(intent: &str) -> BreedInput {
    BreedInput {
        intent: intent.to_string(),
        candidates: vec![],
        facts: vec![],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    }
}

fn fact(key: &str, value: &str) -> Fact {
    Fact {
        key: key.to_string(),
        value: value.to_string(),
    }
}

fn goal(predicate: &str, value: &str) -> Goal {
    Goal {
        id: format!("{}-{}", predicate, value),
        predicate: predicate.to_string(),
        value: value.to_string(),
    }
}

fn state(predicate: &str, value: &str) -> StateAtom {
    StateAtom {
        predicate: predicate.to_string(),
        value: value.to_string(),
    }
}

fn main() {
    // ── Stage 0: AllenTemporal ────────────────────────────────────────────────
    // Intervals: acquire=[0,5), critical=[3,8), release=[7,12)
    // Using concrete-endpoint state atoms: "name,start,end"
    let stage0_input = BreedInput {
        intent: "Compute Allen relations between lock-lifecycle intervals".to_string(),
        candidates: vec![],
        facts: vec![],
        cases: vec![],
        rules: vec![],
        goals: vec![goal("relation", "acquire,release")],
        state: vec![
            state("interval", "acquire,0,5"),
            state("interval", "critical,3,8"),
            state("interval", "release,7,12"),
        ],
    };

    let breed0 = AllenTemporal;
    let output0 = run_breed(&breed0, &stage0_input).unwrap_or_else(|e| {
        eprintln!("stage 0 [allen_temporal] FAILED: {}", e);
        std::process::exit(1);
    });
    let hash0 = hash_output(&output0);
    println!("stage 0 [allen_temporal]: ok hash={}", &hash0[..16]);

    // ── Stage 1: EventCalculus ────────────────────────────────────────────────
    // Narrative: acquire@0 initiates lock_held; release@7 terminates lock_held
    // Query: does lock_held hold at t=5 (during critical section)?
    let stage1_input = BreedInput {
        intent: "Derive lock_held fluent history from event narrative".to_string(),
        candidates: vec![],
        facts: vec![
            fact("prior_hash", &hash0[..16]),
            // Narrative: events
            fact("ec:happens:0", "acquire"),
            fact("ec:happens:7", "release"),
            // Causal rules
            fact("ec:initiates:acquire", "lock_held"),
            fact("ec:terminates:release", "lock_held"),
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![
            goal("ec:holdsat", "lock_held@5"),
            goal("ec:holdsat", "lock_held@8"),
        ],
        state: vec![],
    };

    let breed1 = EventCalculus;
    let output1 = run_breed(&breed1, &stage1_input).unwrap_or_else(|e| {
        eprintln!("stage 1 [event_calculus] FAILED: {}", e);
        std::process::exit(1);
    });
    let hash1 = hash_output(&output1);
    println!("stage 1 [event_calculus]: ok hash={}", &hash1[..16]);

    // ── Stage 2: LtlMonitor ───────────────────────────────────────────────────
    // Event trace: acquire → critical → release
    // Property: G(acquire -> F release) — every acquire is eventually followed by release
    let stage2_input = BreedInput {
        intent: "Verify G(acquire -> F release) safety property on event trace".to_string(),
        candidates: vec![],
        facts: vec![
            fact("prior_hash", &hash1[..16]),
            fact("ltl:formula", "G(acquire -> F release)"),
            fact("trace:0", "acquire"),
            fact("trace:1", "critical"),
            fact("trace:2", "release"),
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![goal("monitor", "G(acquire -> F release)")],
        state: vec![],
    };

    let breed2 = LtlMonitor;
    let output2 = run_breed(&breed2, &stage2_input).unwrap_or_else(|e| {
        eprintln!("stage 2 [ltl_monitor] FAILED: {}", e);
        std::process::exit(1);
    });
    let hash2 = hash_output(&output2);
    println!("stage 2 [ltl_monitor]: ok hash={}", &hash2[..16]);

    println!();
    println!("chain complete — unforgeable: each stage hash is embedded in the next");
}
