//! Static per-breed lifecycle models for the P2 tier (12 breeds).
//!
//! Each model is a forward-only phase DFA replayed by
//! `validate_ocel_alignment`. Interleaved algorithm loops are modeled as a
//! single multi-kind phase (Hearsay-II precedent). Trace kinds match the
//! P2 plan table exactly.

use super::{BreedLifecycleModel, LifecyclePhase};

/// ASP lifecycle: ground → {guess/reduct/least-model/accept/reject}+ → answer-set.
pub static ASP_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "asp",
    phases: &[
        LifecyclePhase {
            name: "ground",
            kinds: &["ground"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "search",
            kinds: &[
                "guess-candidate",
                "reduct",
                "least-model",
                "stable-accept",
                "stable-reject",
            ],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "answer-set",
            kinds: &["answer-set"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};

/// EL description-logic lifecycle: normalize → completion rules+ → fixpoint → verdict.
pub static DESCRIPTION_LOGIC_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "description_logic",
    phases: &[
        LifecyclePhase {
            name: "normalize",
            kinds: &["normalize"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "completion",
            kinds: &[
                "apply-cr1",
                "apply-cr2",
                "apply-cr3",
                "apply-cr4",
                "fixpoint",
            ],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "classify",
            kinds: &["classify-verdict"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
    ],
};

/// Abductive LP lifecycle (Kakas–Kowalski–Toni).
pub static ABDUCTIVE_LP_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "abductive_lp",
    phases: &[
        LifecyclePhase {
            name: "load-abducibles",
            kinds: &["load-abducibles"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "search",
            kinds: &[
                "candidate-delta",
                "derive",
                "ic-check",
                "explain-accept",
                "explain-reject",
            ],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "minimal-set",
            kinds: &["minimal-set"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};

/// IBE lifecycle: collect → score/compare+ → best-explanation.
pub static ABDUCTIVE_IBE_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "abductive_ibe",
    phases: &[
        LifecyclePhase {
            name: "collect-observations",
            kinds: &["collect-observations"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "score",
            kinds: &["score-hypothesis", "compare"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "best-explanation",
            kinds: &["best-explanation"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};

/// SNLP partial-order planning lifecycle.
pub static PARTIAL_ORDER_PLAN_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "partial_order_plan",
    phases: &[
        LifecyclePhase {
            name: "pop-init",
            kinds: &["pop-init"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "pop-resolve",
            kinds: &["pop-resolve"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "pop-plan",
            kinds: &["pop-plan"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};

/// Event calculus lifecycle.
pub static EVENT_CALCULUS_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "event_calculus",
    phases: &[
        LifecyclePhase {
            name: "ec-load",
            kinds: &["ec-load"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "ec-infer",
            kinds: &["ec-infer"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "ec-model",
            kinds: &["ec-model"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};

/// MDP value-iteration lifecycle.
pub static MDP_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "mdp",
    phases: &[
        LifecyclePhase {
            name: "mdp-init",
            kinds: &["mdp-init"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "mdp-iterate",
            kinds: &["mdp-iterate"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "mdp-policy",
            kinds: &["mdp-policy"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
    ],
};

/// Version-space candidate-elimination lifecycle.
pub static VERSION_SPACE_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "version_space",
    phases: &[
        LifecyclePhase {
            name: "vs-init",
            kinds: &["vs-init"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "vs-update",
            kinds: &["vs-update"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "vs-verdict",
            kinds: &["vs-verdict"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};

/// Belief-merging lifecycle (Σ / GMax distance-based operators).
pub static BELIEF_MERGING_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "belief_merging",
    phases: &[
        LifecyclePhase {
            name: "enumerate-worlds",
            kinds: &["enumerate-worlds"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "filter-ic",
            kinds: &["filter-ic"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "score",
            kinds: &["distance", "aggregate"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "select-min",
            kinds: &["select-min"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "merged-belief",
            kinds: &["merged-belief"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};

/// Qualitative-reasoning (confluence) lifecycle.
pub static QUALITATIVE_REASON_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "qualitative_reason",
    phases: &[
        LifecyclePhase {
            name: "load-model",
            kinds: &["load-model"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "propagate",
            kinds: &["propagate-confluence", "branch-ambiguity"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "envision",
            kinds: &["limit-analysis", "envision-state"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "equilibrium",
            kinds: &["equilibrium"],
            min_occurrences: 0,
            max_occurrences: 1,
        },
    ],
};

/// SAM script-application lifecycle.
pub static SCRIPT_SAM_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "script_sam",
    phases: &[
        LifecyclePhase {
            name: "select-script",
            kinds: &["select-script"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "align",
            kinds: &["align-event", "bind-role"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "infer-gap",
            kinds: &["infer-gap"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "summary",
            kinds: &["summary"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};

/// CLP(FD) lifecycle: post/propagate+ → label/propagate/backtrack* → verdict.
pub static CLP_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "clp",
    phases: &[
        LifecyclePhase {
            name: "post",
            kinds: &["post-constraint", "propagate"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "label",
            kinds: &["label", "propagate", "backtrack"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "verdict",
            kinds: &["solution", "inconsistent"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};
