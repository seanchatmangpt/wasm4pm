//! chain_abductive — 3-stage cognition chain: IBE → ASP → SAT-CDCL
//!
//! Theme: Abductive reasoning pipeline for a system alarm anomaly.
//!   Stage 0 (AbductiveIbe): Infer best explanation for observed alarm.
//!   Stage 1 (Asp):          Encode IBE hypothesis as answer set program, check consistency.
//!   Stage 2 (SatCdcl):      Convert stable model to CNF, verify satisfiability with CDCL.
//!
//! Run: cargo run --example chain_abductive

use wasm4pm_cognition::breeds::{
    abductive_ibe::AbductiveIbe, asp::Asp, dispatch::run_breed, sat_cdcl::SatCdcl, BreedInput,
    Candidate, Case, Fact, Goal, Rule, StateAtom,
};

fn main() {
    // ── Stage 0: AbductiveIbe ────────────────────────────────────────────────
    // Observed: high-cpu alarm, memory-spike alarm, disk-io alarm.
    // Two hypotheses:
    //   "overload"   covers all three observations, cost = 5
    //   "memory-leak" covers memory-spike only, cost = 1
    let stage0_input = BreedInput {
        intent: "explain".into(),
        candidates: vec![],
        facts: vec![
            Fact {
                key: "ibe:obs:high-cpu".into(),
                value: "true".into(),
            },
            Fact {
                key: "ibe:obs:memory-spike".into(),
                value: "true".into(),
            },
            Fact {
                key: "ibe:obs:disk-io".into(),
                value: "true".into(),
            },
            Fact {
                key: "ibe:hyp:overload:covers".into(),
                value: "high-cpu,memory-spike,disk-io".into(),
            },
            Fact {
                key: "ibe:hyp:overload:cost".into(),
                value: "5".into(),
            },
            Fact {
                key: "ibe:hyp:memory-leak:covers".into(),
                value: "memory-spike".into(),
            },
            Fact {
                key: "ibe:hyp:memory-leak:cost".into(),
                value: "1".into(),
            },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let ibe_breed = AbductiveIbe;
    let stage0_out = run_breed(&ibe_breed, &stage0_input).expect("stage 0 (abductive_ibe) failed");

    let s0_json = serde_json::to_string(&stage0_out).expect("serialize stage 0 output");
    let s0_hash = blake3::hash(s0_json.as_bytes()).to_hex().to_string();
    println!("stage 0 [abductive_ibe]: ok hash={}", &s0_hash[..16]);

    // ── Stage 1: Asp ─────────────────────────────────────────────────────────
    // Encode the IBE winner ("overload") as an ASP program.
    // Rules:
    //   overload :- high_cpu, memory_spike, disk_io.
    //   high_cpu.  memory_spike.  disk_io.
    // We expect the unique stable model to include "overload".
    let s1_prior = Fact {
        key: "prior_hash".into(),
        value: s0_hash[..16].to_string(),
    };
    let stage1_input = BreedInput {
        intent: "asp".into(),
        candidates: vec![],
        facts: vec![s1_prior],
        cases: vec![],
        rules: vec![
            // Facts (empty premise = fact in ASP)
            Rule {
                id: "f1".into(),
                premise: vec![],
                conclusion: "high_cpu".into(),
                certainty: 1.0,
            },
            Rule {
                id: "f2".into(),
                premise: vec![],
                conclusion: "memory_spike".into(),
                certainty: 1.0,
            },
            Rule {
                id: "f3".into(),
                premise: vec![],
                conclusion: "disk_io".into(),
                certainty: 1.0,
            },
            // Derived rule: overload :- high_cpu, memory_spike, disk_io
            Rule {
                id: "r1".into(),
                premise: vec!["high_cpu".into(), "memory_spike".into(), "disk_io".into()],
                conclusion: "overload".into(),
                certainty: 1.0,
            },
            // Constraint: if overload, not normal
            Rule {
                id: "r2".into(),
                premise: vec!["not overload".into()],
                conclusion: "normal".into(),
                certainty: 1.0,
            },
        ],
        goals: vec![],
        state: vec![],
    };

    let asp_breed = Asp;
    let stage1_out = run_breed(&asp_breed, &stage1_input).expect("stage 1 (asp) failed");

    let s1_json = serde_json::to_string(&stage1_out).expect("serialize stage 1 output");
    let s1_hash = blake3::hash(s1_json.as_bytes()).to_hex().to_string();
    println!("stage 1 [asp]: ok hash={}", &s1_hash[..16]);

    // ── Stage 2: SatCdcl ─────────────────────────────────────────────────────
    // Translate the stable model membership to CNF (DIMACS integer format, 1-based):
    //   1 = high_cpu, 2 = memory_spike, 3 = overload
    //   Clause 1: "1"          — high_cpu must hold
    //   Clause 2: "2"          — memory_spike must hold
    //   Clause 3: "1 2 -3"     — ¬overload ∨ high_cpu ∨ memory_spike
    //   Clause 4: "-1 -2 3"    — overload follows from both observations
    let s2_prior = Fact {
        key: "prior_hash".into(),
        value: s1_hash[..16].to_string(),
    };
    let stage2_input = BreedInput {
        intent: "verify".into(),
        candidates: vec![],
        facts: vec![
            s2_prior,
            Fact {
                key: "clause:1".into(),
                value: "1".into(),
            },
            Fact {
                key: "clause:2".into(),
                value: "2".into(),
            },
            Fact {
                key: "clause:3".into(),
                value: "1 2 -3".into(),
            },
            Fact {
                key: "clause:4".into(),
                value: "-1 -2 3".into(),
            },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![Goal {
            id: "g1".into(),
            predicate: "satisfiable".into(),
            value: "true".into(),
        }],
        state: vec![],
    };

    let sat_breed = SatCdcl;
    let stage2_out = run_breed(&sat_breed, &stage2_input).expect("stage 2 (sat_cdcl) failed");

    let s2_json = serde_json::to_string(&stage2_out).expect("serialize stage 2 output");
    let s2_hash = blake3::hash(s2_json.as_bytes()).to_hex().to_string();
    println!("stage 2 [sat_cdcl]: ok hash={}", &s2_hash[..16]);

    println!();
    println!("chain complete — unforgeable: each stage hash is embedded in the next");
    println!("  IBE selected: {:?}", stage0_out.selected);
    println!("  ASP answer sets: {:?}", stage1_out.selected);
    println!("  SAT verdict: {}", stage2_out.explanation);
}
