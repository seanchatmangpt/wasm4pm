//! Static per-breed lifecycle models — P3 tier (11 breeds).
//!
//! Each model is the declared L1 lifecycle DFA replayed by
//! `validate_ocel_alignment`. Interleaved-cycle breeds (act_r, sat_cdcl,
//! rl_symbolic) model the loop as one multi-kind phase (HEARSAY_MODEL
//! precedent in models_p0).

use super::{BreedLifecycleModel, LifecyclePhase};

/// situation_calculus: load-axioms → (regress-step | frame-persist)+ → decision
pub static SITUATION_CALCULUS_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "situation_calculus",
    phases: &[
        LifecyclePhase {
            name: "load",
            kinds: &["load-axioms"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "progress",
            kinds: &["regress-step", "frame-persist"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "decision",
            kinds: &["decision"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};

/// circumscription: load-defaults → (enumerate-model | minimize)+ → entail+ → decision
pub static CIRCUMSCRIPTION_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "circumscription",
    phases: &[
        LifecyclePhase {
            name: "load",
            kinds: &["load-defaults"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "minimize",
            kinds: &["enumerate-model", "minimize"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "entail",
            kinds: &["entail"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "decision",
            kinds: &["decision"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};

/// analogy_sme: parse-expr+ → (local-match | merge-gmap)+ → candidate-inference* → decision
pub static ANALOGY_SME_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "analogy_sme",
    phases: &[
        LifecyclePhase {
            name: "parse",
            kinds: &["parse-expr"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "map",
            kinds: &["local-match", "merge-gmap"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "infer",
            kinds: &["candidate-inference"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "decision",
            kinds: &["decision"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};

/// act_r: load-chunk* → interleaved production/retrieval cycle+ → decision
pub static ACT_R_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "act_r",
    phases: &[
        LifecyclePhase {
            name: "encode",
            kinds: &["load-chunk"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "cycle",
            kinds: &[
                "match-production",
                "fire-production",
                "retrieval-request",
                "retrieve-chunk",
                "retrieval-failure",
            ],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "decision",
            kinds: &["decision"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};

/// problog: load-pfact+ → (enumerate-world | sum-weight)+ → decision
pub static PROBLOG_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "problog",
    phases: &[
        LifecyclePhase {
            name: "load",
            kinds: &["load-pfact"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "enumerate",
            kinds: &["enumerate-world", "sum-weight"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "decision",
            kinds: &["decision"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};

/// sat_cdcl: load-clause+ → interleaved search cycle+ → decision
pub static SAT_CDCL_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "sat_cdcl",
    phases: &[
        LifecyclePhase {
            name: "load",
            kinds: &["load-clause"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "search",
            kinds: &[
                "decide",
                "propagate",
                "conflict",
                "learn-clause",
                "backjump",
            ],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "decision",
            kinds: &["decision"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};

/// episodic_memory: encode-episode+ → present-cue → score-episode+ → recall → decision
pub static EPISODIC_MEMORY_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "episodic_memory",
    phases: &[
        LifecyclePhase {
            name: "encode",
            kinds: &["encode-episode"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "cue",
            kinds: &["present-cue"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "score",
            kinds: &["score-episode"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "recall",
            kinds: &["recall"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "decision",
            kinds: &["decision"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};

/// rl_symbolic: load-mdp → interleaved episode loop+ → extract-policy+ → decision
pub static RL_SYMBOLIC_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "rl_symbolic",
    phases: &[
        LifecyclePhase {
            name: "load",
            kinds: &["load-mdp"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "learn",
            kinds: &["episode-start", "q-update", "episode-end"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "extract",
            kinds: &["extract-policy"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "decision",
            kinds: &["decision"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};

/// ctl_check: parse-formula → (label-states | fixpoint-iterate)+ → counterexample-step* → decision
pub static CTL_CHECK_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "ctl_check",
    phases: &[
        LifecyclePhase {
            name: "parse",
            kinds: &["parse-formula"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "label",
            kinds: &["label-states", "fixpoint-iterate"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "counterexample",
            kinds: &["counterexample-step"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "decision",
            kinds: &["decision"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};

/// ilp: load-example+ → FOIL loop+ → decision
pub static ILP_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "ilp",
    phases: &[
        LifecyclePhase {
            name: "load",
            kinds: &["load-example"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "induce",
            kinds: &[
                "propose-literal",
                "score-gain",
                "add-literal",
                "cover-remove",
                "emit-clause",
            ],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "decision",
            kinds: &["decision"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};

/// naive_physics: load-scene → apply-axiom+ → predict* → decision
pub static NAIVE_PHYSICS_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "naive_physics",
    phases: &[
        LifecyclePhase {
            name: "load",
            kinds: &["load-scene"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "saturate",
            kinds: &["apply-axiom"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "predict",
            kinds: &["predict"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "decision",
            kinds: &["decision"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};
