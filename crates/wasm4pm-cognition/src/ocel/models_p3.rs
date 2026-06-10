
use crate::ocel::{BreedLifecycleModel, LifecyclePhase};

/// Static lifecycle model for CTL_CHECK
pub const CTL_CHECK_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "ctl_check",
    phases: &[
        LifecyclePhase {
            name: "init",
            kinds: &["parse-formula"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "iterate",
            kinds: &["label-states", "fixpoint-iterate"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "verify",
            kinds: &["counterexample-step"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "decide",
            kinds: &["decision"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};

/// ILP model definition
/// ILP lifecycle model
pub const ILP_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "ilp",
    phases: &[
        LifecyclePhase { name: "init", kinds: &["load-example"], min_occurrences: 1, max_occurrences: 1 },
        LifecyclePhase { name: "loop", kinds: &["propose-literal", "score-gain", "add-literal", "cover-remove", "emit-clause"], min_occurrences: 0, max_occurrences: usize::MAX },
        LifecyclePhase { name: "decide", kinds: &["decision"], min_occurrences: 1, max_occurrences: 1 },
    ],
};

/// Naive Physics lifecycle model
pub const NAIVE_PHYSICS_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "naive_physics",
    phases: &[
        LifecyclePhase { name: "init", kinds: &["load-scene"], min_occurrences: 1, max_occurrences: 1 },
        LifecyclePhase { name: "axioms", kinds: &["apply-axiom"], min_occurrences: 1, max_occurrences: usize::MAX },
        LifecyclePhase { name: "predict", kinds: &["predict"], min_occurrences: 0, max_occurrences: usize::MAX },
        LifecyclePhase { name: "decide", kinds: &["decision"], min_occurrences: 1, max_occurrences: 1 },
    ],
};
