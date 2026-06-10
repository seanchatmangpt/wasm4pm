use crate::ocel::{BreedLifecycleModel, LifecyclePhase};

/// ASP lifecycle: ground -> guess-reduct* -> answer-set
pub const ASP_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "asp",
    phases: &[
        LifecyclePhase {
            name: "ground",
            kinds: &["ground"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "guess-reduct",
            kinds: &["guess-candidate", "reduct", "least-model", "stable-accept", "stable-reject"],
            min_occurrences: 0,
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

/// Description Logic lifecycle: normalize -> saturate* -> fixpoint -> classify-verdict
pub const DESCRIPTION_LOGIC_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "description_logic",
    phases: &[
        LifecyclePhase {
            name: "normalize",
            kinds: &["normalize"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "saturate",
            kinds: &["apply-cr1", "apply-cr2", "apply-cr3", "apply-cr4"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "fixpoint",
            kinds: &["fixpoint"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "classify-verdict",
            kinds: &["classify-verdict"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};

/// Abductive LP lifecycle: load-abducibles -> search* -> minimal-set
pub const ABDUCTIVE_LP_MODEL: BreedLifecycleModel = BreedLifecycleModel {
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
            kinds: &["candidate-delta", "derive", "ic-check", "explain-accept", "explain-reject"],
            min_occurrences: 0,
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
