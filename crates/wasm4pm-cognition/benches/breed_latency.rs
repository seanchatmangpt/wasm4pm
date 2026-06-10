//! Criterion latency benchmarks for all 13 wasm4pm-cognition breeds.
//!
//! Measures the wall-clock cost of `CognitionBreed::run()` at the Rust
//! boundary (no WASM serialization overhead) with a representative
//! BreedInput that exercises each algorithm's core path.

use criterion::{black_box, criterion_group, criterion_main, Criterion};
use wasm4pm_cognition::breeds::{
    autoinstinct_learning::AutoinstinctLearning, autoinstinct_neurosis::AutoinstinctNeurosis,
    autoinstinct_semantics::AutoinstinctSemantics, autoinstinct_vision::AutoinstinctVision,
    cbr::Cbr, dendral::Dendral, frame::Eliza, gps::Gps, hearsay::Hearsay, production_rules::Mycin,
    prolog::Prolog, soar::Soar, strips::Strips, BreedInput, Candidate, Case, CognitionBreed, Fact,
    Goal, Rule, StateAtom,
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
            Fact {
                key: "requirement:offline".into(),
                value: "false".into(),
            },
            Fact {
                key: "scale:billion".into(),
                value: "true".into(),
            },
            Fact {
                key: "latency:critical".into(),
                value: "true".into(),
            },
            Fact {
                key: "budget:high".into(),
                value: "true".into(),
            },
        ],
        cases: vec![
            Case {
                id: "case-001".into(),
                intent: "high-throughput distributed system".into(),
                architecture: "centralized-cloud".into(),
                outcome_score: 0.88,
                facts: vec![
                    Fact {
                        key: "scale:billion".into(),
                        value: "true".into(),
                    },
                    Fact {
                        key: "latency:critical".into(),
                        value: "true".into(),
                    },
                ],
            },
            Case {
                id: "case-002".into(),
                intent: "offline-first edge deployment".into(),
                architecture: "edge-mesh".into(),
                outcome_score: 0.75,
                facts: vec![Fact {
                    key: "requirement:offline".into(),
                    value: "true".into(),
                }],
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
            Goal {
                id: "g1".into(),
                predicate: "performance".into(),
                value: "high".into(),
            },
            Goal {
                id: "g2".into(),
                predicate: "cost".into(),
                value: "controlled".into(),
            },
        ],
        state: vec![
            StateAtom {
                predicate: "service:online".into(),
                value: "true".into(),
            },
            StateAtom {
                predicate: "infra:provisioned".into(),
                value: "false".into(),
            },
        ],
    }
}

fn bench_breeds(c: &mut Criterion) {
    let input = make_input();

    macro_rules! bench_breed {
        ($group:expr, $name:expr, $breed:expr) => {
            $group.bench_function($name, |b| b.iter(|| $breed.run(black_box(&input))));
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

fn p3f(key: &str, value: &str) -> Fact {
    Fact { key: key.into(), value: value.into() }
}

/// P3 tier benchmarks: each breed gets a representative input that
/// exercises its core algorithmic path.
fn bench_p3_breeds(c: &mut Criterion) {
    use wasm4pm_cognition::breeds::{
        act_r::ActR, analogy_sme::AnalogySme, circumscription::Circumscription,
        ctl_check::CtlCheck, episodic_memory::EpisodicMemory, ilp::Ilp,
        naive_physics::NaivePhysics, problog::Problog, rl_symbolic::RlSymbolic,
        sat_cdcl::SatCdcl, situation_calculus::SituationCalculus,
    };

    let empty = BreedInput {
        intent: "p3 bench".into(),
        candidates: vec![],
        facts: vec![],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let mut sitcalc = empty.clone();
    sitcalc.facts = vec![
        p3f("fluent:door_open", "true"),
        p3f("fluent:mark_set", "true"),
        p3f("action:shut:pre", "door_open"),
        p3f("action:shut:del", "door_open"),
        p3f("action:shut:add", "door_shut"),
        p3f("do:0", "shut"),
    ];

    let mut circ = empty.clone();
    circ.facts = vec![p3f("bird_pip", "true"), p3f("ostrich_pip", "true")];
    circ.rules = vec![
        Rule { id: "r1".into(), premise: vec!["bird_pip".into(), "not_ab_pip".into()], conclusion: "flies_pip".into(), certainty: 1.0 },
        Rule { id: "r2".into(), premise: vec!["ostrich_pip".into()], conclusion: "ab_pip".into(), certainty: 1.0 },
    ];
    circ.goals = vec![Goal { id: "g1".into(), predicate: "entail".into(), value: "flies_pip".into() }];

    let mut sme = empty.clone();
    sme.facts = vec![
        p3f("base:0", "(cause (heat stove pot) (boil pot))"),
        p3f("target:0", "(cause (heat sun lake) (boil lake))"),
    ];

    let mut actr = empty.clone();
    actr.facts = vec![p3f("goal", "lookup")];
    actr.cases = vec![Case { id: "chunk-1".into(), intent: "x".into(), architecture: "chunk".into(), outcome_score: 0.7, facts: vec![p3f("slot", "val")] }];
    actr.rules = vec![Rule { id: "p1".into(), premise: vec!["goal=lookup".into()], conclusion: "retrieve:slot=val".into(), certainty: 0.9 }];

    let mut problog = empty.clone();
    problog.facts = vec![p3f("pfact:burglary", "0.1"), p3f("pfact:quake", "0.2")];
    problog.rules = vec![
        Rule { id: "r1".into(), premise: vec!["burglary".into()], conclusion: "alarm".into(), certainty: 1.0 },
        Rule { id: "r2".into(), premise: vec!["quake".into()], conclusion: "alarm".into(), certainty: 1.0 },
    ];
    problog.goals = vec![Goal { id: "g1".into(), predicate: "query".into(), value: "alarm".into() }];

    let mut sat = empty.clone();
    sat.facts = vec![
        p3f("clause:00", "1 2"),
        p3f("clause:01", "-1 2"),
        p3f("clause:02", "1 -2"),
        p3f("clause:03", "-1 -2"),
    ];

    let mut epi = empty.clone();
    epi.facts = vec![
        p3f("scene", "garden"),
        p3f("cue:t", "7"),
        p3f("episode:ep-a:t", "6"),
        p3f("episode:ep-b:t", "1"),
    ];
    epi.cases = vec![
        Case { id: "ep-a".into(), intent: "x".into(), architecture: "episode".into(), outcome_score: 0.5, facts: vec![p3f("scene", "garden")] },
        Case { id: "ep-b".into(), intent: "x".into(), architecture: "episode".into(), outcome_score: 0.5, facts: vec![p3f("scene", "garden")] },
    ];

    let mut rl = empty.clone();
    rl.facts = vec![
        p3f("mdp:gamma", "0.9"),
        p3f("mdp:start", "s0"),
        p3f("mdp:terminal:goal", "true"),
        p3f("mdp:t:s0:go", "goal"),
        p3f("mdp:t:s0:stay", "s0"),
        p3f("mdp:r:s0:go", "1.0"),
        p3f("rl:episodes", "50"),
    ];

    let mut ctl = empty.clone();
    ctl.facts = vec![
        p3f("ts:init", "a"),
        p3f("ts:edge:a", "b"),
        p3f("ts:edge:b", "a"),
        p3f("ts:label:b", "p"),
        p3f("ctl:formula", "A F p"),
    ];

    let mut ilp = empty.clone();
    ilp.facts = vec![
        p3f("bg:parent(ann,mary)", "true"),
        p3f("bg:parent(ann,tom)", "true"),
        p3f("bg:female(mary)", "true"),
        p3f("pos:daughter(mary,ann)", "true"),
        p3f("neg:daughter(tom,ann)", "true"),
    ];

    let mut phys = empty.clone();
    phys.facts = vec![
        p3f("np:ground:floor", "true"),
        p3f("np:on:box", "floor"),
        p3f("np:on:vase", "box"),
        p3f("np:remove:box", "true"),
    ];

    macro_rules! bench_breed {
        ($group:expr, $name:expr, $breed:expr, $input:expr) => {
            $group.bench_function($name, |b| b.iter(|| $breed.run(black_box(&$input))));
        };
    }

    let mut group = c.benchmark_group("breed_latency_p3");
    group.sample_size(50);
    bench_breed!(group, "situation_calculus", SituationCalculus, sitcalc);
    bench_breed!(group, "circumscription", Circumscription, circ);
    bench_breed!(group, "analogy_sme", AnalogySme, sme);
    bench_breed!(group, "act_r", ActR, actr);
    bench_breed!(group, "problog", Problog, problog);
    bench_breed!(group, "sat_cdcl", SatCdcl, sat);
    bench_breed!(group, "episodic_memory", EpisodicMemory, epi);
    bench_breed!(group, "rl_symbolic", RlSymbolic, rl);
    bench_breed!(group, "ctl_check", CtlCheck, ctl);
    bench_breed!(group, "ilp", Ilp, ilp);
    bench_breed!(group, "naive_physics", NaivePhysics, phys);
    group.finish();
}

criterion_group!(benches, bench_breeds, bench_p3_breeds);
criterion_main!(benches);
