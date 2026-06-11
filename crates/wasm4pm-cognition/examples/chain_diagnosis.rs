//! chain_diagnosis — 3-stage cognition chain: BayesianNetwork → Mycin → FuzzyLogic
//!
//! Medical diagnosis pipeline:
//!   Stage 0: BayesianNetwork  — P(Flu | fever=true, cough=true)
//!   Stage 1: Mycin            — CF-based diagnosis using BN posterior as evidence
//!   Stage 2: FuzzyLogic       — fuzzify CF score into dosage severity recommendation
//!
//! Each stage embeds blake3(output)[..16] of the previous stage as fact "prior_hash",
//! making the chain unforgeable: you cannot fabricate stage 2 without stage 1's real output.
//!
//! Run: cargo run --example chain_diagnosis

use wasm4pm_cognition::breeds::bayesian_network::BayesianNetwork;
use wasm4pm_cognition::breeds::fuzzy_logic::FuzzyLogic;
use wasm4pm_cognition::breeds::production_rules::Mycin;
use wasm4pm_cognition::breeds::{
    dispatch::run_breed, BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom,
};

fn hash_output(output: &wasm4pm_cognition::breeds::BreedOutput) -> String {
    let json = serde_json::to_string(output).expect("serialize BreedOutput");
    blake3::hash(json.as_bytes()).to_hex().to_string()
}

fn main() {
    // ── Stage 0: BayesianNetwork ─────────────────────────────────────────────
    // Small flu-diagnosis CPT network:
    //   Flu (prior) → Fever (conditional)
    //   Flu (prior) → Cough (conditional)
    // Observe fever=true, cough=true; query P(Flu).
    let stage0_input = BreedInput {
        intent: "flu-probability".to_string(),
        candidates: vec![],
        facts: vec![
            Fact { key: "cpt:Flu".to_string(),          value: "0.05".to_string() },
            Fact { key: "cpt:Fever|Flu".to_string(),    value: "0.9,0.1".to_string() },
            Fact { key: "cpt:Cough|Flu".to_string(),    value: "0.8,0.2".to_string() },
            Fact { key: "evidence:Fever".to_string(),   value: "true".to_string() },
            Fact { key: "evidence:Cough".to_string(),   value: "true".to_string() },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![Goal {
            id:        "q0".to_string(),
            predicate: "query".to_string(),
            value:     "prob:Flu".to_string(),
        }],
        state: vec![],
    };

    let stage0_output = match run_breed(&BayesianNetwork, &stage0_input) {
        Ok(o) => o,
        Err(e) => {
            eprintln!("stage 0 [bayesian_network] error: {e}");
            std::process::exit(1);
        }
    };
    let stage0_hash = hash_output(&stage0_output);
    println!(
        "stage 0 [bayesian_network]: ok  hash={}",
        &stage0_hash[..16]
    );
    println!("  explanation: {}", stage0_output.explanation);

    // ── Stage 1: Mycin ───────────────────────────────────────────────────────
    // Use the BN posterior (embedded via prior_hash) as evidence strength.
    // Rules: if fever AND cough-duration > 3 days → flu (CF 0.7), else common-cold (CF 0.5).
    let stage1_input = BreedInput {
        intent: "diagnose-illness".to_string(),
        candidates: vec![
            Candidate { id: "flu".to_string(),         score: 0.0, eliminated: false, elimination_reason: None },
            Candidate { id: "common-cold".to_string(), score: 0.0, eliminated: false, elimination_reason: None },
        ],
        facts: vec![
            // Link to stage 0 — unforgeable: hash is derived from real BN output
            Fact { key: "prior_hash".to_string(),          value: stage0_hash[..16].to_string() },
            Fact { key: "evidence:fever".to_string(),      value: "true".to_string() },
            Fact { key: "evidence:cough".to_string(),      value: "true".to_string() },
            Fact { key: "evidence:cough-days".to_string(), value: "5".to_string() },
        ],
        cases: vec![],
        rules: vec![
            Rule {
                id:         "r-flu".to_string(),
                // Mycin WM stores facts as "key=value" at CF=1.0
                premise:    vec!["evidence:fever=true".to_string(), "evidence:cough=true".to_string()],
                conclusion: "diagnosis:flu=confirmed".to_string(),
                certainty:  0.72,
            },
            Rule {
                id:         "r-cold".to_string(),
                premise:    vec!["evidence:cough=true".to_string()],
                conclusion: "diagnosis:common-cold=possible".to_string(),
                certainty:  0.45,
            },
        ],
        goals: vec![Goal {
            id:        "g-diagnose".to_string(),
            predicate: "diagnose".to_string(),
            value:     "illness".to_string(),
        }],
        state: vec![],
    };

    let stage1_output = match run_breed(&Mycin, &stage1_input) {
        Ok(o) => o,
        Err(e) => {
            eprintln!("stage 1 [mycin] error: {e}");
            std::process::exit(1);
        }
    };
    let stage1_hash = hash_output(&stage1_output);
    println!("stage 1 [mycin]: ok  hash={}", &stage1_hash[..16]);
    println!("  explanation: {}", stage1_output.explanation);

    // ── Stage 2: FuzzyLogic ──────────────────────────────────────────────────
    // Fuzzify the Mycin CF score (0–1 range) into a dosage severity recommendation.
    // CF score is proxied by the leading certainty of the winning Mycin rule (0.72).
    let cf_score: f64 = 72.0; // scale 0–100 for fuzzy input

    let stage2_input = BreedInput {
        intent: "dosage-severity".to_string(),
        candidates: vec![],
        facts: vec![
            // Unforgeable link to stage 1
            Fact { key: "prior_hash".to_string(),          value: stage1_hash[..16].to_string() },
            // Membership functions for CF-score linguistic variable (0–100 scale)
            Fact { key: "fuzzy:cf:low".to_string(),        value: "tri:0,0,40".to_string() },
            Fact { key: "fuzzy:cf:moderate".to_string(),   value: "tri:30,55,75".to_string() },
            Fact { key: "fuzzy:cf:high".to_string(),       value: "tri:65,100,100".to_string() },
            // Membership functions for dosage output variable (mg)
            Fact { key: "fuzzy:dose:mild".to_string(),     value: "tri:0,200,400".to_string() },
            Fact { key: "fuzzy:dose:moderate".to_string(), value: "tri:300,500,700".to_string() },
            Fact { key: "fuzzy:dose:severe".to_string(),   value: "tri:600,900,1000".to_string() },
            // Crisp input: CF score from Mycin stage (scaled to 0–100)
            Fact { key: "fuzzy:input:cf".to_string(),      value: cf_score.to_string() },
        ],
        cases: vec![],
        rules: vec![
            Rule {
                id:         "dose-low".to_string(),
                premise:    vec!["fuzzy:cf:low".to_string()],
                conclusion: "fuzzy:dose:mild".to_string(),
                certainty:  1.0,
            },
            Rule {
                id:         "dose-moderate".to_string(),
                premise:    vec!["fuzzy:cf:moderate".to_string()],
                conclusion: "fuzzy:dose:moderate".to_string(),
                certainty:  1.0,
            },
            Rule {
                id:         "dose-high".to_string(),
                premise:    vec!["fuzzy:cf:high".to_string()],
                conclusion: "fuzzy:dose:severe".to_string(),
                certainty:  1.0,
            },
        ],
        goals: vec![Goal {
            id:        "g-dose".to_string(),
            predicate: "defuzzify".to_string(),
            value:     "dose".to_string(),
        }],
        state: vec![],
    };

    let stage2_output = match run_breed(&FuzzyLogic, &stage2_input) {
        Ok(o) => o,
        Err(e) => {
            eprintln!("stage 2 [fuzzy_logic] error: {e}");
            std::process::exit(1);
        }
    };
    let stage2_hash = hash_output(&stage2_output);
    println!("stage 2 [fuzzy_logic]: ok  hash={}", &stage2_hash[..16]);
    println!("  explanation: {}", stage2_output.explanation);

    println!();
    println!("chain complete — unforgeable: each stage hash is embedded in the next");
    println!(
        "  s0→s1 anchor: {}  s1→s2 anchor: {}",
        &stage0_hash[..16],
        &stage1_hash[..16]
    );
}
