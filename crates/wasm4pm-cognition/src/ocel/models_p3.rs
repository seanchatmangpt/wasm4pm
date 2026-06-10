use super::{BreedLifecycleModel, LifecyclePhase};

/// Lifecycle model for Analogy SME.
pub const ANALOGY_SME_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "analogy_sme",
    phases: &[
        LifecyclePhase { name: "parse-expr", kinds: &["parse-expr"], min_occurrences: 1, max_occurrences: 1 },
        LifecyclePhase { name: "match-and-merge", kinds: &["local-match", "merge-gmap"], min_occurrences: 0, max_occurrences: usize::MAX },
        LifecyclePhase { name: "candidate-inference", kinds: &["candidate-inference"], min_occurrences: 0, max_occurrences: usize::MAX },
        LifecyclePhase { name: "decision", kinds: &["decision"], min_occurrences: 1, max_occurrences: 1 },
    ],
};

/// Lifecycle model for ACT-R.
pub const ACT_R_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "act_r",
    phases: &[
        LifecyclePhase { name: "load-chunk", kinds: &["load-chunk"], min_occurrences: 0, max_occurrences: usize::MAX },
        LifecyclePhase { name: "cycle", kinds: &["match-production", "fire-production", "retrieval-request", "retrieve-chunk", "retrieval-failure"], min_occurrences: 0, max_occurrences: usize::MAX },
        LifecyclePhase { name: "decision", kinds: &["decision"], min_occurrences: 1, max_occurrences: 1 },
    ],
};
