// GENERATED — DO NOT EDIT — source: schema/domain.ttl
// Run `ggen sync` in lifecycle/ to regenerate.

use serde::{Deserialize, Serialize};

/// A discrete phase in the wasm4pm × unrdf development lifecycle.
///
/// The cycle is: Spec → Generate → Test → Deploy → Monitor → Improve → Spec.
/// A rework edge also exists: Test → Spec.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub enum LifecycleStage {

    /// Stage 1: Define the system in RDF ontology (source of truth).
    Spec,

    /// Stage 2: Run ggen sync (Rust) and unrdf sync (TypeScript) to precipitate code from the ontology.
    Generate,

    /// Stage 3: Execute tests, SHACL validation, and conformance checks against generated artifacts.
    Test,

    /// Stage 4: Publish WASM packages, Rust crates, and TypeScript libraries.
    Deploy,

    /// Stage 5: Collect OTel traces, convert to XES event logs, store in unrdf RDF graph.
    Monitor,

    /// Stage 6: Run wasm4pm DFG / AlphaMiner / InductiveMiner on event log; discover drift vs. intended process; produce improvement spec.
    Improve,

}

impl LifecycleStage {
    /// All stages in lifecycle order.
    pub const ALL: &'static [Self] = &[

        Self::Spec,

        Self::Generate,

        Self::Test,

        Self::Deploy,

        Self::Monitor,

        Self::Improve,

    ];

    /// OpenTelemetry span name for this stage.
    pub fn otel_span_name(&self) -> &'static str {
        match self {

            Self::Spec => "lifecycle.spec",

            Self::Generate => "lifecycle.generate",

            Self::Test => "lifecycle.test",

            Self::Deploy => "lifecycle.deploy",

            Self::Monitor => "lifecycle.monitor",

            Self::Improve => "lifecycle.improve",

        }
    }

    /// XES `concept:name` activity label for this stage.
    pub fn xes_activity(&self) -> &'static str {
        match self {

            Self::Spec => "Spec",

            Self::Generate => "Generate",

            Self::Test => "Test",

            Self::Deploy => "Deploy",

            Self::Monitor => "Monitor",

            Self::Improve => "Improve",

        }
    }

    /// Ordinal position in the declared lifecycle (1-based).
    pub fn order(&self) -> u32 {
        match self {

            Self::Spec => 1,

            Self::Generate => 2,

            Self::Test => 3,

            Self::Deploy => 4,

            Self::Monitor => 5,

            Self::Improve => 6,

        }
    }
}

impl std::fmt::Display for LifecycleStage {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.xes_activity())
    }
}
