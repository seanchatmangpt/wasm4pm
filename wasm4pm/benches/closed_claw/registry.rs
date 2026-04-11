//! Benchmark and dataset registry for the Closed Claw Constitution.

/// 6 canonical pipeline classes from the constitution.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum PipelineClass {
    DiscoveryCore,       // A
    ConformanceCore,     // B
    ObjectCentricCore,   // C
    SemanticProofLoop,   // D
    ManufacturingTruth,  // E
    MlAugmentedRuntime,  // F
}

impl PipelineClass {
    pub fn label(&self) -> &'static str {
        match self {
            Self::DiscoveryCore => "A: Discovery Core",
            Self::ConformanceCore => "B: Conformance Core",
            Self::ObjectCentricCore => "C: Object-Centric Core",
            Self::SemanticProofLoop => "D: Semantic Proof Loop",
            Self::ManufacturingTruth => "E: Manufacturing Truth",
            Self::MlAugmentedRuntime => "F: ML-Augmented Runtime",
        }
    }

    pub fn short_id(&self) -> char {
        match self {
            Self::DiscoveryCore => 'A',
            Self::ConformanceCore => 'B',
            Self::ObjectCentricCore => 'C',
            Self::SemanticProofLoop => 'D',
            Self::ManufacturingTruth => 'E',
            Self::MlAugmentedRuntime => 'F',
        }
    }
}

/// Which gates a pipeline must pass.
#[derive(Debug, Clone, Default)]
pub struct GateRequirements {
    pub determinism: bool, // G1
    pub receipt: bool,     // G2
    pub truth: bool,       // G3
    pub synchrony: bool,   // G4
    pub report: bool,      // G5
}

/// A registered dataset for benchmarking.
pub struct DatasetEntry {
    pub id: &'static str,
    pub name: &'static str,
    pub path: &'static str,
    pub format: DatasetFormat,
    pub num_cases: usize,
    pub num_events: usize,
    pub num_activities: usize,
}

#[derive(Debug, Clone, Copy)]
pub enum DatasetFormat {
    Xes,
    OcelJson,
    Pnml,
    Synthetic,
}

/// Standard benchmark sizes from the constitution.
pub const BENCH_SIZES: &[usize] = &[100, 1_000, 10_000, 50_000];
pub const BENCH_SIZES_SLOW: &[usize] = &[100, 500, 1_000];
pub const BENCH_SIZES_STREAMING: &[usize] = &[10_000, 50_000, 100_000];
