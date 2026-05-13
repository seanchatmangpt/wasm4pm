// GENERATED — DO NOT EDIT — source: schema/domain.ttl
// Run `ggen sync` in lifecycle/ to regenerate.

use crate::stages::LifecycleStage;

/// A valid directed transition between two lifecycle stages.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StageTransition {
    pub label: &'static str,
    pub from: LifecycleStage,
    pub to: LifecycleStage,
    /// Guard condition that must hold before the transition fires.
    pub guard: &'static str,
}

/// All declared lifecycle transitions (from RDF ontology).
pub const TRANSITIONS: &[StageTransition] = &[

    StageTransition {
        label: "Deploy → Monitor",
        from:  LifecycleStage::Deploy,
        to:    LifecycleStage::Monitor,
        guard: "artifacts_published",
    },

    StageTransition {
        label: "Generate → Test",
        from:  LifecycleStage::Generate,
        to:    LifecycleStage::Test,
        guard: "artifacts_emitted",
    },

    StageTransition {
        label: "Improve → Spec",
        from:  LifecycleStage::Improve,
        to:    LifecycleStage::Spec,
        guard: "improvements_identified",
    },

    StageTransition {
        label: "Monitor → Improve",
        from:  LifecycleStage::Monitor,
        to:    LifecycleStage::Improve,
        guard: "event_log_populated",
    },

    StageTransition {
        label: "Spec → Generate",
        from:  LifecycleStage::Spec,
        to:    LifecycleStage::Generate,
        guard: "ontology_validates",
    },

    StageTransition {
        label: "Test → Deploy",
        from:  LifecycleStage::Test,
        to:    LifecycleStage::Deploy,
        guard: "all_tests_pass",
    },

    StageTransition {
        label: "Test → Spec",
        from:  LifecycleStage::Test,
        to:    LifecycleStage::Spec,
        guard: "tests_fail_rework_needed",
    },

];

/// Returns all valid successor stages for `from`.
pub fn successors(from: LifecycleStage) -> Vec<LifecycleStage> {
    TRANSITIONS
        .iter()
        .filter(|t| t.from == from)
        .map(|t| t.to)
        .collect()
}

/// Returns `true` if the transition `from → to` is declared in the ontology.
pub fn is_valid(from: LifecycleStage, to: LifecycleStage) -> bool {
    TRANSITIONS.iter().any(|t| t.from == from && t.to == to)
}
