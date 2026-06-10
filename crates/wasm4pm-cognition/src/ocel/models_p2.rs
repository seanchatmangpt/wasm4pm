use crate::ocel::{BreedLifecycleModel, LifecyclePhase};

/// Lifecycle model for Constraint Logic Programming (CLP).
pub const CLP_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "clp",
    phases: &[
        LifecyclePhase {
            name: "post-and-propagate",
            kinds: &["post-constraint", "propagate"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "search",
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
