//! Criterion latency benchmarks for all 13 wasm4pm-cognition breeds.
//!
//! Measures the wall-clock cost of `CognitionBreed::run()` at the Rust
//! boundary (no WASM serialization overhead) with a representative
//! BreedInput that exercises each algorithm's core path.

use criterion::{black_box, criterion_group, criterion_main, Criterion};
use wasm4pm_cognition::breeds::{
    abductive_ibe::AbductiveIbe,
    abductive_lp::AbductiveLp,
    allen_temporal::AllenTemporal,
    asp::Asp,
    autoinstinct_learning::AutoinstinctLearning,
    autoinstinct_neurosis::AutoinstinctNeurosis,
    autoinstinct_semantics::AutoinstinctSemantics,
    autoinstinct_vision::AutoinstinctVision,
    bayesian_network::BayesianNetwork,
    belief_merging::BeliefMerging,
    cbr::Cbr,
    clp::Clp,
    csp_ac3::CspAc3,
    default_logic::DefaultLogic,
    dempster_shafer::DempsterShafer,
    dendral::Dendral,
    description_logic::DescriptionLogic,
    ebl::Ebl,
    event_calculus::EventCalculus,
    frame::Eliza,
    frames_inheritance::FramesInheritance,
    fuzzy_logic::FuzzyLogic,
    gps::Gps,
    hearsay::Hearsay,
    htn_planning::HtnPlanning,
    ltl_monitor::LtlMonitor,
    mdp::Mdp,
    partial_order_plan::PartialOrderPlan,
    production_rules::Mycin,
    prolog::Prolog,
    qualitative_reason::QualitativeReason,
    script_sam::ScriptSam,
    soar::Soar,
    strips::Strips,
    version_space::VersionSpace,
    BreedInput,
    Candidate,
    Case,
    CognitionBreed,
    Fact,
    Goal,
    Rule,
    StateAtom,
};

fn fact(key: &str, value: &str) -> Fact {
    Fact { key: key.into(), value: value.into() }
}

fn rule(id: &str, premise: Vec<&str>, conclusion: &str, certainty: f32) -> Rule {
    Rule {
        id: id.into(),
        premise: premise.into_iter().map(String::from).collect(),
        conclusion: conclusion.into(),
        certainty,
    }
}

/// Representative P1 inputs exercising each algorithm core path.
fn p1_input(breed: &str) -> BreedInput {
    let mut input = BreedInput {
        intent: "bench".into(),
        candidates: vec![],
        facts: vec![],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };
    match breed {
        "ltl_monitor" => {
            input.facts = vec![
                fact("ltl:formula", "G (red -> !green)"),
                fact("trace:0", "red"),
                fact("trace:1", "green"),
                fact("trace:2", "red"),
                fact("trace:3", "green"),
            ];
        }
        "allen_temporal" => {
            input.facts = vec![
                fact("relation", "gamma,delta,p"),
                fact("relation", "delta,eps,m"),
                fact("relation", "eps,zeta,o"),
            ];
        }
        "fuzzy_logic" => {
            input.facts = vec![
                fact("fuzzy:zlorp:lo", "tri:0,0,6"),
                fact("fuzzy:zlorp:mid", "tri:2,5,8"),
                fact("fuzzy:gwib:out", "tri:0,50,100"),
                fact("fuzzy:input:zlorp", "3.7"),
            ];
            input.rules = vec![
                rule("r1", vec!["fuzzy:zlorp:mid"], "fuzzy:gwib:out", 1.0),
                rule("r2", vec!["fuzzy:zlorp:lo"], "fuzzy:gwib:out", 1.0),
            ];
        }
        "bayesian_network" => {
            input.facts = vec![
                fact("cpt:B", "0.001"),
                fact("cpt:E", "0.002"),
                fact("cpt:A|B,E", "0.001,0.29,0.94,0.95"),
                fact("cpt:J|A", "0.05,0.90"),
                fact("cpt:M|A", "0.01,0.70"),
                fact("evidence:J", "true"),
                fact("evidence:M", "true"),
            ];
            input.goals = vec![Goal { id: "g1".into(), predicate: "query".into(), value: "prob:B".into() }];
        }
        "csp_ac3" => {
            input.facts = vec![
                fact("csp-var", "V1:B,G,R"),
                fact("csp-var", "V2:B,G,R"),
                fact("csp-var", "V3:B,G,R"),
                fact("csp-var", "V4:B,G,R"),
                fact("csp-constraint", "V1!=V2"),
                fact("csp-constraint", "V1!=V3"),
                fact("csp-constraint", "V1!=V4"),
                fact("csp-constraint", "V2!=V3"),
                fact("csp-constraint", "V2!=V4"),
            ];
        }
        "default_logic" => {
            input.facts = vec![fact("obs:tweety", "penguin")];
            input.rules = vec![
                rule("r_isa", vec!["penguin"], "bird", 1.0),
                rule("r_penguin", vec!["penguin"], "not_flies", 1.0),
                rule("r_birds_fly", vec!["bird", "unless:not_flies"], "flies", 0.9),
            ];
        }
        "htn_planning" => {
            input.state = vec![
                StateAtom { predicate: "pkg".into(), value: "at_depot".into() },
                StateAtom { predicate: "truck".into(), value: "at_depot".into() },
            ];
            input.goals = vec![Goal { id: "g1".into(), predicate: "task".into(), value: "deliver".into() }];
            input.rules = vec![
                rule("method:deliver:by_truck", vec!["pkg=at_depot"], "op:load;op:drive;op:unload", 1.0),
                rule("op:load", vec!["pkg=at_depot", "truck=at_depot"], "!pkg=at_depot;pkg=in_truck", 1.0),
                rule("op:drive", vec!["truck=at_depot"], "!truck=at_depot;truck=at_dest", 1.0),
                rule("op:unload", vec!["pkg=in_truck", "truck=at_dest"], "!pkg=in_truck;pkg=at_dest", 1.0),
            ];
        }
        "dempster_shafer" => {
            input.rules = vec![
                rule("witnessA", vec![], "flim", 0.5),
                rule("witnessB", vec![], "flam", 0.75),
                rule("witnessC", vec![], "flim,flam", 0.5),
            ];
            input.goals = vec![Goal { id: "query".into(), predicate: "query".into(), value: "flim".into() }];
        }
        "frames_inheritance" => {
            input.intent = "resolve zilk color".into();
            input.facts = vec![
                fact("frame:zilk:isa", "welp"),
                fact("frame:welp:isa", "snorf"),
                fact("frame:snorf:slot:color:default", "blue"),
                fact("frame:welp:slot:color", "red"),
            ];
        }
        "ebl" => {
            input.facts = vec![
                fact("weight(krate1,light)", "true"),
                fact("weight(bench1,heavy)", "true"),
            ];
            input.rules = vec![
                rule("r1", vec!["lighter(?x,?y)"], "safe_to_stack(?x,?y)", 1.0),
                rule("r2", vec!["weight(?x,light)", "weight(?y,heavy)"], "lighter(?x,?y)", 1.0),
            ];
            input.goals = vec![Goal { id: "g1".into(), predicate: "safe_to_stack(krate1,bench1)".into(), value: "true".into() }];
        }
        _ => unreachable!("unknown P1 bench breed"),
    }
    input
}

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

    macro_rules! bench_p1_breed {
        ($group:expr, $name:expr, $breed:expr) => {
            let input = p1_input($name);
            $group.bench_function($name, |b| b.iter(|| $breed.run(black_box(&input))));
        };
    }

    bench_p1_breed!(group, "ltl_monitor", LtlMonitor);
    bench_p1_breed!(group, "allen_temporal", AllenTemporal);
    bench_p1_breed!(group, "fuzzy_logic", FuzzyLogic);
    bench_p1_breed!(group, "bayesian_network", BayesianNetwork);
    bench_p1_breed!(group, "csp_ac3", CspAc3);
    bench_p1_breed!(group, "default_logic", DefaultLogic);
    bench_p1_breed!(group, "htn_planning", HtnPlanning);
    bench_p1_breed!(group, "dempster_shafer", DempsterShafer);
    bench_p1_breed!(group, "frames_inheritance", FramesInheritance);
    bench_p1_breed!(group, "ebl", Ebl);

    group.finish();

    // P2 tier: each breed gets a representative input exercising its core path.
    let p2_base = || BreedInput {
        intent: "bench".into(),
        candidates: vec![],
        facts: vec![],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };
    let f = |key: &str, value: &str| Fact { key: key.into(), value: value.into() };
    let g = |id: &str, predicate: &str, value: &str| Goal {
        id: id.into(), predicate: predicate.into(), value: value.into(),
    };
    let r = |id: &str, premise: Vec<&str>, conclusion: &str| Rule {
        id: id.into(),
        premise: premise.into_iter().map(String::from).collect(),
        conclusion: conclusion.into(),
        certainty: 1.0,
    };

    macro_rules! bench_breed_input {
        ($group:expr, $name:expr, $breed:expr, $input:expr) => {
            let input = $input;
            $group.bench_function($name, |b| b.iter(|| $breed.run(black_box(&input))));
        };
    }

    let mut p2 = c.benchmark_group("breed_latency_p2");
    p2.sample_size(50);

    let mut asp_in = p2_base();
    asp_in.rules = vec![r("b1", vec!["not b"], "a"), r("b2", vec!["not a"], "b"), r("b3", vec!["a"], "c")];
    bench_breed_input!(p2, "asp", Asp, asp_in);

    let mut dl_in = p2_base();
    dl_in.facts = vec![
        f("dl:subclass:A", "B"), f("dl:subclass:B", "C"),
        f("dl:exists_rhs:A", "rr.D"), f("dl:exists_lhs:rr.D", "E"),
        f("dl:conj:C+E", "F"),
    ];
    dl_in.goals = vec![g("q", "dl:subsumes", "A:F")];
    bench_breed_input!(p2, "description_logic", DescriptionLogic, dl_in);

    let mut alp_in = p2_base();
    alp_in.facts = vec![f("alp:abducible:a", "true"), f("alp:abducible:b", "true"), f("alp:abducible:c", "true")];
    alp_in.rules = vec![r("r1", vec!["a"], "o"), r("r2", vec!["b"], "o")];
    alp_in.goals = vec![g("o", "alp:observe", "o")];
    bench_breed_input!(p2, "abductive_lp", AbductiveLp, alp_in);

    let mut ibe_in = p2_base();
    ibe_in.facts = vec![
        f("ibe:obs:o1", "true"), f("ibe:obs:o2", "true"),
        f("ibe:hyp:h1:covers", "o1,o2"), f("ibe:hyp:h1:cost", "3"),
        f("ibe:hyp:h2:covers", "o1"), f("ibe:hyp:h2:cost", "1"),
    ];
    bench_breed_input!(p2, "abductive_ibe", AbductiveIbe, ibe_in);

    let mut pop_in = p2_base();
    pop_in.facts = vec![
        f("pop:op:alpha:pre", "w"), f("pop:op:alpha:add", "t2"),
        f("pop:op:beta:add", "t1"), f("pop:op:beta:del", "w"),
    ];
    pop_in.state = vec![StateAtom { predicate: "w".into(), value: "true".into() }];
    pop_in.goals = vec![g("g1", "t1", "true"), g("g2", "t2", "true")];
    bench_breed_input!(p2, "partial_order_plan", PartialOrderPlan, pop_in);

    let mut ec_in = p2_base();
    ec_in.facts = vec![
        f("ec:happens:2", "on"), f("ec:happens:5", "off"), f("ec:happens:7", "on"),
        f("ec:initiates:on", "lit"), f("ec:terminates:off", "lit"),
    ];
    ec_in.goals = vec![g("q1", "ec:holdsat", "lit@4"), g("q2", "ec:holdsat", "lit@6")];
    bench_breed_input!(p2, "event_calculus", EventCalculus, ec_in);

    let mut mdp_in = p2_base();
    mdp_in.facts = vec![
        f("mdp:gamma", "0.9"),
        f("mdp:trans:s0:go", "s1:1.0"), f("mdp:trans:s0:stay", "s0:1.0"),
        f("mdp:reward:s0:stay", "0.1"),
        f("mdp:trans:s1:go", "goal:1.0"), f("mdp:reward:s1:go", "2.0"),
        f("mdp:trans:goal:stay", "goal:1.0"),
    ];
    bench_breed_input!(p2, "mdp", Mdp, mdp_in);

    let mut vs_in = p2_base();
    vs_in.facts = vec![
        f("vs:attrs", "sky,airtemp,humidity,wind,water,forecast"),
        f("vs:example:1", "Sunny,Warm,Normal,Strong,Warm,Same:+"),
        f("vs:example:2", "Sunny,Warm,High,Strong,Warm,Same:+"),
        f("vs:example:3", "Rainy,Cold,High,Strong,Warm,Change:-"),
        f("vs:example:4", "Sunny,Warm,High,Strong,Cool,Change:+"),
    ];
    bench_breed_input!(p2, "version_space", VersionSpace, vs_in);

    let mut bm_in = p2_base();
    bm_in.facts = vec![
        f("bm:atoms", "p,q"),
        f("bm:base:1", "p,q"), f("bm:base:2", "p,q"), f("bm:base:3", "-p,-q"),
        f("bm:ic", "true"),
    ];
    bench_breed_input!(p2, "belief_merging", BeliefMerging, bm_in);

    let mut qr_in = p2_base();
    qr_in.facts = vec![
        f("qr:confluence:valve", "+p,+a,-q"),
        f("qr:sign:p", "+"), f("qr:sign:a", "-"),
    ];
    bench_breed_input!(p2, "qualitative_reason", QualitativeReason, qr_in);

    let mut sam_in = p2_base();
    sam_in.facts = vec![
        f("sam:event:1", "enter:john"), f("sam:event:2", "order:john"),
        f("sam:event:3", "pay:john"), f("sam:event:4", "leave:john"),
    ];
    bench_breed_input!(p2, "script_sam", ScriptSam, sam_in);

    let mut clp_in = p2_base();
    clp_in.facts = vec![
        f("clp:var:x", "1..5"), f("clp:var:y", "1..5"), f("clp:var:z", "1..5"),
        f("clp:constraint:c1", "x<y"), f("clp:constraint:c2", "y<z"), f("clp:constraint:c3", "z<=3"),
    ];
    bench_breed_input!(p2, "clp", Clp, clp_in);

    p2.finish();
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

// ── P4 tier benchmarks (each breed exercises its core path on its paper
// fixture-sized input; POMDP note: the PRD allots 50–300µs for POMDP, the
// global ≤100µs budget is kept via the structural caps — see docs/breeds/pomdp.md).

fn p4_input(facts: Vec<(&str, &str)>) -> BreedInput {
    BreedInput {
        intent: "bench".into(),
        candidates: vec![],
        facts: facts
            .into_iter()
            .map(|(k, v)| Fact {
                key: k.into(),
                value: v.into(),
            })
            .collect(),
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    }
}

fn tiger_bench_input() -> BreedInput {
    let mut facts: Vec<(String, String)> = vec![
        ("pomdp:states".into(), "tiger-left,tiger-right".into()),
        ("pomdp:actions".into(), "listen,open-left,open-right".into()),
        ("pomdp:observations".into(), "hear-left,hear-right".into()),
        ("pomdp:gamma".into(), "0.95".into()),
        ("pomdp:horizon".into(), "3".into()),
        ("pomdp:b0:tiger-left".into(), "0.5".into()),
        ("pomdp:b0:tiger-right".into(), "0.5".into()),
        ("pomdp:o:listen:tiger-left:hear-left".into(), "0.85".into()),
        ("pomdp:o:listen:tiger-left:hear-right".into(), "0.15".into()),
        ("pomdp:o:listen:tiger-right:hear-left".into(), "0.15".into()),
        ("pomdp:o:listen:tiger-right:hear-right".into(), "0.85".into()),
        ("pomdp:step:0".into(), "listen|hear-left".into()),
    ];
    for s in ["tiger-left", "tiger-right"] {
        for sp in ["tiger-left", "tiger-right"] {
            facts.push((
                format!("pomdp:t:listen:{}:{}", s, sp),
                if s == sp { "1.0" } else { "0.0" }.into(),
            ));
        }
        facts.push((format!("pomdp:r:listen:{}", s), "-1.0".into()));
    }
    for a in ["open-left", "open-right"] {
        for s in ["tiger-left", "tiger-right"] {
            for sp in ["tiger-left", "tiger-right"] {
                facts.push((format!("pomdp:t:{}:{}:{}", a, s, sp), "0.5".into()));
            }
            for ob in ["hear-left", "hear-right"] {
                facts.push((format!("pomdp:o:{}:{}:{}", a, s, ob), "0.5".into()));
            }
        }
    }
    facts.push(("pomdp:r:open-left:tiger-left".into(), "-100.0".into()));
    facts.push(("pomdp:r:open-left:tiger-right".into(), "10.0".into()));
    facts.push(("pomdp:r:open-right:tiger-left".into(), "10.0".into()));
    facts.push(("pomdp:r:open-right:tiger-right".into(), "-100.0".into()));
    BreedInput {
        intent: "bench".into(),
        candidates: vec![],
        facts: facts
            .into_iter()
            .map(|(k, v)| Fact { key: k, value: v })
            .collect(),
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    }
}

fn bench_p4_breeds(c: &mut Criterion) {
    use wasm4pm_cognition::breeds::{
        construction_grammar::ConstructionGrammar, contingent_plan::ContingentPlan,
        markov_logic::MarkovLogic, meta_reasoning::MetaReasoning, pomdp::Pomdp,
        tableaux::Tableaux,
    };

    macro_rules! bench_breed {
        ($group:expr, $name:expr, $breed:expr, $input:expr) => {
            let input = $input;
            $group.bench_function($name, |b| b.iter(|| $breed.run(black_box(&input))));
        };
    }

    let mut group = c.benchmark_group("breed_latency_p4");
    group.sample_size(50);

    bench_breed!(
        group,
        "tableaux",
        Tableaux,
        p4_input(vec![("tableaux:formula", "((a -> b) -> a) -> a")])
    );
    bench_breed!(
        group,
        "construction_grammar",
        ConstructionGrammar,
        p4_input(vec![
            ("cxg:utterance", "he sneezed the napkin off the table"),
            ("lex:he:pos", "pron"),
            ("lex:sneezed:pos", "verb"),
            ("lex:sneezed:valence", "intransitive"),
            ("lex:the:pos", "det"),
            ("lex:napkin:pos", "noun"),
            ("lex:off:pos", "prep"),
            ("lex:table:pos", "noun"),
        ])
    );
    bench_breed!(
        group,
        "markov_logic",
        MarkovLogic,
        p4_input(vec![
            ("mln:clause:c1", "1.5|!smokes_anna,cancer_anna"),
            ("mln:clause:c2", "1.5|!smokes_bob,cancer_bob"),
            ("mln:clause:c3", "1.1|!friends_ab,!smokes_anna,smokes_bob"),
            ("mln:clause:c4", "1.1|!friends_ab,!smokes_bob,smokes_anna"),
            ("evidence:smokes_anna", "true"),
            ("evidence:friends_ab", "true"),
        ])
    );
    bench_breed!(group, "pomdp", Pomdp, tiger_bench_input());
    bench_breed!(
        group,
        "contingent_plan",
        ContingentPlan,
        p4_input(vec![
            ("cp:unknown", "dirt"),
            ("cp:goal:dirt", "false"),
            ("cp:act:suck:pre", "dirt"),
            ("cp:act:suck:del", "dirt"),
            ("cp:sense:check-dirt", "dirt"),
        ])
    );
    bench_breed!(
        group,
        "meta_reasoning",
        MetaReasoning,
        p4_input(vec![
            ("breed:mycin:conclusion", "therapy=gentamicin"),
            ("breed:mycin:confidence", "0.8"),
            ("breed:prolog:conclusion", "therapy=none"),
            ("breed:prolog:confidence", "0.6"),
        ])
    );

    group.finish();
}


fn bench_p2_breeds(c: &mut Criterion) {
    // P2 tier: each breed gets a representative input exercising its core path.
    let p2_base = || BreedInput {
        intent: "bench".into(),
        candidates: vec![],
        facts: vec![],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };
    let f = |key: &str, value: &str| Fact { key: key.into(), value: value.into() };
    let g = |id: &str, predicate: &str, value: &str| Goal {
        id: id.into(), predicate: predicate.into(), value: value.into(),
    };
    let r = |id: &str, premise: Vec<&str>, conclusion: &str| Rule {
        id: id.into(),
        premise: premise.into_iter().map(String::from).collect(),
        conclusion: conclusion.into(),
        certainty: 1.0,
    };

    macro_rules! bench_breed_input {
        ($group:expr, $name:expr, $breed:expr, $input:expr) => {
            let input = $input;
            $group.bench_function($name, |b| b.iter(|| $breed.run(black_box(&input))));
        };
    }

    let mut p2 = c.benchmark_group("breed_latency_p2");
    p2.sample_size(50);

    let mut asp_in = p2_base();
    asp_in.rules = vec![r("b1", vec!["not b"], "a"), r("b2", vec!["not a"], "b"), r("b3", vec!["a"], "c")];
    bench_breed_input!(p2, "asp", Asp, asp_in);

    let mut dl_in = p2_base();
    dl_in.facts = vec![
        f("dl:subclass:A", "B"), f("dl:subclass:B", "C"),
        f("dl:exists_rhs:A", "rr.D"), f("dl:exists_lhs:rr.D", "E"),
        f("dl:conj:C+E", "F"),
    ];
    dl_in.goals = vec![g("q", "dl:subsumes", "A:F")];
    bench_breed_input!(p2, "description_logic", DescriptionLogic, dl_in);

    let mut alp_in = p2_base();
    alp_in.facts = vec![f("alp:abducible:a", "true"), f("alp:abducible:b", "true"), f("alp:abducible:c", "true")];
    alp_in.rules = vec![r("r1", vec!["a"], "o"), r("r2", vec!["b"], "o")];
    alp_in.goals = vec![g("o", "alp:observe", "o")];
    bench_breed_input!(p2, "abductive_lp", AbductiveLp, alp_in);

    let mut ibe_in = p2_base();
    ibe_in.facts = vec![
        f("ibe:obs:o1", "true"), f("ibe:obs:o2", "true"),
        f("ibe:hyp:h1:covers", "o1,o2"), f("ibe:hyp:h1:cost", "3"),
        f("ibe:hyp:h2:covers", "o1"), f("ibe:hyp:h2:cost", "1"),
    ];
    bench_breed_input!(p2, "abductive_ibe", AbductiveIbe, ibe_in);

    let mut pop_in = p2_base();
    pop_in.facts = vec![
        f("pop:op:alpha:pre", "w"), f("pop:op:alpha:add", "t2"),
        f("pop:op:beta:add", "t1"), f("pop:op:beta:del", "w"),
    ];
    pop_in.state = vec![StateAtom { predicate: "w".into(), value: "true".into() }];
    pop_in.goals = vec![g("g1", "t1", "true"), g("g2", "t2", "true")];
    bench_breed_input!(p2, "partial_order_plan", PartialOrderPlan, pop_in);

    let mut ec_in = p2_base();
    ec_in.facts = vec![
        f("ec:happens:2", "on"), f("ec:happens:5", "off"), f("ec:happens:7", "on"),
        f("ec:initiates:on", "lit"), f("ec:terminates:off", "lit"),
    ];
    ec_in.goals = vec![g("q1", "ec:holdsat", "lit@4"), g("q2", "ec:holdsat", "lit@6")];
    bench_breed_input!(p2, "event_calculus", EventCalculus, ec_in);

    let mut mdp_in = p2_base();
    mdp_in.facts = vec![
        f("mdp:gamma", "0.9"),
        f("mdp:trans:s0:go", "s1:1.0"), f("mdp:trans:s0:stay", "s0:1.0"),
        f("mdp:reward:s0:stay", "0.1"),
        f("mdp:trans:s1:go", "goal:1.0"), f("mdp:reward:s1:go", "2.0"),
        f("mdp:trans:goal:stay", "goal:1.0"),
    ];
    bench_breed_input!(p2, "mdp", Mdp, mdp_in);

    let mut vs_in = p2_base();
    vs_in.facts = vec![
        f("vs:attrs", "sky,airtemp,humidity,wind,water,forecast"),
        f("vs:example:1", "Sunny,Warm,Normal,Strong,Warm,Same:+"),
        f("vs:example:2", "Sunny,Warm,High,Strong,Warm,Same:+"),
        f("vs:example:3", "Rainy,Cold,High,Strong,Warm,Change:-"),
        f("vs:example:4", "Sunny,Warm,High,Strong,Cool,Change:+"),
    ];
    bench_breed_input!(p2, "version_space", VersionSpace, vs_in);

    let mut bm_in = p2_base();
    bm_in.facts = vec![
        f("bm:atoms", "p,q"),
        f("bm:base:1", "p,q"), f("bm:base:2", "p,q"), f("bm:base:3", "-p,-q"),
        f("bm:ic", "true"),
    ];
    bench_breed_input!(p2, "belief_merging", BeliefMerging, bm_in);

    let mut qr_in = p2_base();
    qr_in.facts = vec![
        f("qr:confluence:valve", "+p,+a,-q"),
        f("qr:sign:p", "+"), f("qr:sign:a", "-"),
    ];
    bench_breed_input!(p2, "qualitative_reason", QualitativeReason, qr_in);

    let mut sam_in = p2_base();
    sam_in.facts = vec![
        f("sam:event:1", "enter:john"), f("sam:event:2", "order:john"),
        f("sam:event:3", "pay:john"), f("sam:event:4", "leave:john"),
    ];
    bench_breed_input!(p2, "script_sam", ScriptSam, sam_in);

    let mut clp_in = p2_base();
    clp_in.facts = vec![
        f("clp:var:x", "1..5"), f("clp:var:y", "1..5"), f("clp:var:z", "1..5"),
        f("clp:constraint:c1", "x<y"), f("clp:constraint:c2", "y<z"), f("clp:constraint:c3", "z<=3"),
    ];
    bench_breed_input!(p2, "clp", Clp, clp_in);

    p2.finish();
}

criterion_group!(benches, bench_breeds, bench_p2_breeds, bench_p3_breeds, bench_p4_breeds);
criterion_main!(benches);
