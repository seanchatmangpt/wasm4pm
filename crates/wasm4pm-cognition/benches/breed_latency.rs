//! Criterion latency benchmarks for all 13 wasm4pm-cognition breeds.
//!
//! Measures the wall-clock cost of `CognitionBreed::run()` at the Rust
//! boundary (no WASM serialization overhead) with a representative
//! BreedInput that exercises each algorithm's core path.

use criterion::{black_box, criterion_group, criterion_main, Criterion};
use wasm4pm_cognition::breeds::{
    autoinstinct_learning::AutoinstinctLearning,
    autoinstinct_neurosis::AutoinstinctNeurosis,
    autoinstinct_semantics::AutoinstinctSemantics,
    autoinstinct_vision::AutoinstinctVision,
    cbr::Cbr,
    dendral::Dendral,
    frame::Eliza,
    gps::Gps,
    hearsay::Hearsay,
    production_rules::Mycin,
    prolog::Prolog,
    soar::Soar,
    strips::Strips,
    BreedInput, Candidate, Case, CognitionBreed, Fact, Goal, Rule, StateAtom,
};

fn make_input() -> BreedInput {
    BreedInput {
        intent: "select architecture for high-throughput distributed system".into(),
        candidates: vec![
            Candidate {
                id: "centralized-cloud".into(),
                score: 0.7,
                eliminated: false,
                elimination_reason: None,
            },
            Candidate {
                id: "edge-mesh".into(),
                score: 0.6,
                eliminated: false,
                elimination_reason: None,
            },
            Candidate {
                id: "hybrid-fog".into(),
                score: 0.5,
                eliminated: false,
                elimination_reason: None,
            },
        ],
        facts: vec![
            Fact { key: "requirement:offline".into(), value: "false".into() },
            Fact { key: "scale:billion".into(), value: "true".into() },
            Fact { key: "latency:critical".into(), value: "true".into() },
            Fact { key: "budget:high".into(), value: "true".into() },
        ],
        cases: vec![
            Case {
                id: "case-001".into(),
                intent: "high-throughput distributed system".into(),
                architecture: "centralized-cloud".into(),
                outcome_score: 0.88,
                facts: vec![
                    Fact { key: "scale:billion".into(), value: "true".into() },
                    Fact { key: "latency:critical".into(), value: "true".into() },
                ],
            },
            Case {
                id: "case-002".into(),
                intent: "offline-first edge deployment".into(),
                architecture: "edge-mesh".into(),
                outcome_score: 0.75,
                facts: vec![
                    Fact { key: "requirement:offline".into(), value: "true".into() },
                ],
            },
        ],
        rules: vec![
            Rule {
                id: "r1".into(),
                premise: vec!["scale:billion".into(), "latency:critical".into()],
                conclusion: "recommend:centralized-cloud".into(),
                certainty: 0.85,
            },
            Rule {
                id: "r2".into(),
                premise: vec!["requirement:offline".into()],
                conclusion: "eliminate:centralized-cloud".into(),
                certainty: 0.95,
            },
            Rule {
                id: "r3".into(),
                premise: vec!["budget:high".into()],
                conclusion: "prefer:managed-service".into(),
                certainty: 0.70,
            },
        ],
        goals: vec![
            Goal { id: "g1".into(), predicate: "performance".into(), value: "high".into() },
            Goal { id: "g2".into(), predicate: "cost".into(), value: "controlled".into() },
        ],
        state: vec![
            StateAtom { predicate: "service:online".into(), value: "true".into() },
            StateAtom { predicate: "infra:provisioned".into(), value: "false".into() },
        ],
    }
}

fn bench_breeds(c: &mut Criterion) {
    let input = make_input();

    macro_rules! bench_breed {
        ($group:expr, $name:expr, $breed:expr) => {
            $group.bench_function($name, |b| {
                b.iter(|| $breed.run(black_box(&input)))
            });
        };
    }

    let mut group = c.benchmark_group("breed_latency");
    // Reduce sample size for speed; criterion defaults to 100 samples / 5s warmup
    group.sample_size(50);

    bench_breed!(group, "mycin", Mycin);
    bench_breed!(group, "strips", Strips);
    bench_breed!(group, "prolog", Prolog);
    bench_breed!(group, "eliza", Eliza);
    bench_breed!(group, "cbr", Cbr);
    bench_breed!(group, "dendral", Dendral);
    bench_breed!(group, "gps", Gps);
    bench_breed!(group, "soar", Soar);
    bench_breed!(group, "hearsay", Hearsay);
    bench_breed!(group, "autoinstinct_learning", AutoinstinctLearning);
    bench_breed!(group, "autoinstinct_semantics", AutoinstinctSemantics);
    bench_breed!(group, "autoinstinct_neurosis", AutoinstinctNeurosis);
    bench_breed!(group, "autoinstinct_vision", AutoinstinctVision);

    group.finish();
}

criterion_group!(benches, bench_breeds);
criterion_main!(benches);
