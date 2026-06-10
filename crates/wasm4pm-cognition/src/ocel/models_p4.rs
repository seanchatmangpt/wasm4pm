use crate::ocel::{BreedLifecycleModel, LifecyclePhase};

/// Lifecycle model for the Meta-Reasoning breed.
pub static META_REASONING_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "meta_reasoning",
    phases: &[
        LifecyclePhase {
            name: "ingest",
            kinds: &["ingest-report"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "conflict",
            kinds: &["conflict-detected"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "vote",
            kinds: &["vote"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "resolve",
            kinds: &["resolve"],
            min_occurrences: 0,
            max_occurrences: 1,
        },
    ],
};
