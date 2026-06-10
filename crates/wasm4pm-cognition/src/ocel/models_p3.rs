use crate::ocel::{BreedLifecycleModel, LifecyclePhase};

/// Situation Calculus Lifecycle Model
pub const SITUATION_CALCULUS_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "situation_calculus",
    phases: &[
        LifecyclePhase {
            name: "load",
            kinds: &["load-axioms"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "regress",
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

/// Circumscription Lifecycle Model
pub const CIRCUMSCRIPTION_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "circumscription",
    phases: &[
        LifecyclePhase {
            name: "load",
            kinds: &["load-defaults"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "enumerate",
            kinds: &["enumerate-model", "minimize"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "entail",
            kinds: &["entail"],
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
