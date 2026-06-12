// Process intelligence algorithm registry — generated from wasm4pm pi ontology.
// Regenerate with: ggen sync
// Source: ggen/ontology/algorithms.ttl (pi:ProcessIntelligenceAlgorithm)
// 60 algorithms in category-then-ID order.

use serde::{Deserialize, Serialize};
use std::fmt;

/// All process intelligence algorithms admitted in wasm4pm.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub enum ProcessIntelligenceAlgorithm {
    /// Orchestrated multi-step agentic pipeline — chains discovery, conformance, and analytics algorithms in a reasoning loop, selecting next operation based on intermediate results.
    AgenticPipeline,
    /// Alignment-based conformance checking — synchronously replays each trace on the Petri net, computing optimal alignment cost using A* over the synchronous product automaton.
    Alignments,
    /// Structural complexity metrics (size, CFC, depth) — computes Control Flow Complexity, model size, connector degree distribution, and depth without replaying the log.
    ComplexityMetrics,
    /// ETConformance precision — measures how much of the model's behaviour is actually observed in the log using escaping-edges token-based precision.
    EtconformancePrecision,
    /// Van der Aalst generalization score — measures how well the model generalises beyond the observed log by penalising infrequently visited transitions.
    Generalization,
    /// A* shortest-path discovery over DFG — finds optimal path through the directly-follows graph using heuristic search, producing a Petri net model.
    AStar,
    /// Ant Colony Optimisation discovery — stochastic population-based search inspired by ant foraging, producing Petri net models with good fitness/precision balance.
    Aco,
    /// Alpha++ miner — extends the original Alpha algorithm to handle length-one and length-two loops, producing a Petri net from the directly-follows footprint matrix.
    AlphaPlusPlus,
    /// Declarative constraint mining using LTL-based temporal logic — discovers existence, response, and precedence constraints rather than a procedural model.
    Declare,
    /// Directly-Follows Graph — fastest baseline discovery, counting how often one activity directly follows another. Serves as input to most other discovery algorithms.
    Dfg,
    /// Genetic algorithm process model search — evolves a population of candidate Petri nets using fitness, precision, generalization and simplicity as multi-objective fitness functions.
    GeneticAlgorithm,
    /// Heuristics Miner — uses dependency measures to filter noise before constructing a causal net. Dependency threshold controls filtering aggressiveness.
    HeuristicMiner,
    /// Hierarchical DFG — extends the standard DFG with automatic detection and collapsing of recurring sub-process patterns.
    HierarchicalDfg,
    /// Hill-climbing local search — iteratively improves a candidate model by applying local operators, terminating at a local optimum.
    HillClimbing,
    /// ILP Miner — solves an integer linear programming problem to find a Petri net fitting the directly-follows relations; produces high-precision sound models.
    Ilp,
    /// Inductive Miner — recursively discovers a sound, block-structured process tree from the event log by detecting cut types (sequence, parallel, choice, loop).
    InductiveMiner,
    /// Prefix-tree (trie) representation — inserts all traces into a trie where each path from root to leaf represents a unique trace variant.
    LogToTrie,
    /// DFG with arc-weight optimisation pass — builds a standard DFG then applies pruning to remove statistically insignificant arcs.
    OptimizedDfg,
    /// Minimal skeleton DFG — retains only the highest-frequency directly-follows arcs to produce a sparse backbone of the process.
    ProcessSkeleton,
    /// Particle Swarm Optimisation discovery — maintains a swarm of candidate models whose positions evolve toward the global best according to social and cognitive acceleration.
    Pso,
    /// SIMD-accelerated streaming DFG — processes the event log in a single pass using SIMD vector intrinsics for maximum throughput on large logs.
    SimdStreamingDfg,
    /// Simulated Annealing stochastic search — probabilistically accepts worse candidate models according to a cooling schedule to escape local optima.
    SimulatedAnnealing,
    /// Auto-selects the best algorithm for the input characteristics — inspects log size, variant count, and noise level, then dispatches to the most appropriate discovery algorithm.
    SmartEngine,
    /// Streaming event log ingestion — processes events in arrival order without materialising the full log in memory; emits running DFG statistics.
    StreamingLog,
    /// Transition system from event log — constructs a finite-state automaton where states are abstractions of trace history and arcs are activity labels.
    TransitionSystem,
    /// Measures speedup potential across trace variants — identifies bottleneck activity pairs and quantifies theoretical throughput gain from parallelisation.
    AnalyzeProcessSpeedup,
    /// Complexity metrics per trace variant — computes length distribution, unique activity count, loop density, and entropy for each distinct variant in the log.
    AnalyzeVariantComplexity,
    /// Detects batch-execution patterns — identifies when a resource processes multiple cases simultaneously (sequential, concurrent, simultaneous, or interleaved batches).
    Batches,
    /// Causal dependency graph — applies causal inference to distinguish spurious correlations in the DFG from genuine causal dependencies between activities.
    CausalGraph,
    /// Activity-to-activity transition probability matrix — computes the n x n matrix of empirical transition probabilities between all activity pairs.
    ComputeActivityTransitionMatrix,
    /// Pairwise trace similarity matrix — computes edit-distance or Jaccard similarity for all trace pairs; used as input to clustering and variant analysis.
    ComputeTraceSimilarityMatrix,
    /// Correlation-based dependency miner — discovers dependencies from statistical correlation of activity occurrences without requiring case identifiers.
    CorrelationMiner,
    /// Social network: handover-of-work between resources — nodes are resources, arcs represent how frequently one resource hands a case to another.
    HandoverNetwork,
    /// Performance spectrum — segments all arc traversals in the DFG by time, producing a time-sliced frequency matrix for flow rate visualisation.
    PerformanceSpectrum,
    /// Social network: co-worker collaboration — arcs represent how frequently two resources work on the same case, regardless of handover direction.
    WorkingTogetherNetwork,
    /// Import BPMN 2.0 XML to process tree — parses a BPMN 2.0 XML document and converts flow elements to a block-structured process tree.
    BpmnImport,
    /// Import PNML to Petri net — parses a PNML XML document and reconstructs the place-transition structure for use as a conformance reference model.
    PnmlImport,
    /// Convert POWL model to process tree — translates a Partially Ordered Workflow Language model to a block-structured process tree.
    PowlToProcessTree,
    /// Export process model to YAWL format — serialises a discovered process model as a YAWL specification for import into YAWL-compatible workflow engines.
    YawlExport,
    /// AutoML classification — automatically selects and tunes a classifier (decision tree, random forest, gradient boosting) from process feature vectors.
    AutomlClassify,
    /// AutoML time-series forecasting — automatically selects and tunes a forecasting model for process throughput or case duration prediction.
    AutomlForecast,
    /// Anomaly detection — applies isolation forest or one-class SVM to process feature vectors to flag statistically anomalous traces or events.
    MlAnomaly,
    /// Supervised classification — trains a classifier on labeled process feature vectors and predicts labels for unseen cases.
    MlClassify,
    /// Unsupervised clustering — applies k-means or DBSCAN to process feature vectors to discover natural groupings of cases or traces.
    MlCluster,
    /// Time-series forecasting — trains a forecasting model on historical process metrics and produces forward projections.
    MlForecast,
    /// Principal Component Analysis — reduces dimensionality of process feature vectors, revealing principal axes of variation.
    MlPca,
    /// Regression — fits a regression model to predict a continuous target (e.g., case duration) from process feature vectors.
    MlRegress,
    /// Object-centric DFG across all object types — flattens the OCEL log into a unified DFG weighted by event frequency regardless of type.
    OcelDfg,
    /// Separate DFG per object type — produces one DFG for each object type in the OCEL log, enabling per-type flow analysis without cross-type interference.
    OcelDfgPerType,
    /// Encodes OCEL log to feature matrix — transforms the object-centric log into a numeric feature matrix suitable for downstream ML algorithms.
    OcelEncode,
    /// Object-centric Declare constraint discovery — mines LTL-based temporal constraints from the OCEL log, relating events across different object types.
    OcelOcDeclare,
    /// Object-centric log abstraction analytics — computes summary statistics: object interaction counts, event density, and type co-occurrence matrices.
    OcelOcla,
    /// Per-type flattened Petri nets — applies the Inductive Miner to each object-type-flattened sub-log to produce a sound Petri net per type.
    OcelPetriNet,
    /// Exponentially weighted moving average on case metrics — applies EWMA smoothing to process KPI time-series for trend-aware monitoring.
    ComputeEwma,
    /// Concept drift detection — applies statistical change-point tests (ADWIN, Page-Hinkley) to a sliding window to detect when the underlying process has changed.
    DetectDrift,
    /// Next-activity prediction from trace prefix — encodes the trace prefix as a feature vector and predicts the most likely next activity.
    PredictNextActivity,
    /// Case outcome prediction — predicts the final outcome of a running case from its prefix using a trained binary or multi-class classifier.
    PredictOutcome,
    /// Remaining time prediction from trace prefix — estimates time until case completion using a regression model trained on completed cases.
    PredictRemainingTime,
    /// Monte Carlo simulation from discovered model — samples synthetic traces from empirical transition probability distribution to estimate throughput time distributions.
    MonteCarloSimulation,
    /// Stochastic playout from Petri net — generates synthetic event logs by firing enabled transitions according to stochastic weights until all tokens reach the final marking.
    Playout,

}

impl ProcessIntelligenceAlgorithm {
    /// Canonical snake_case algorithm ID matching TypeScript AlgorithmId.
    pub fn id(&self) -> &'static str {
        match self {
            Self::AgenticPipeline => "agentic_pipeline",
            Self::Alignments => "alignments",
            Self::ComplexityMetrics => "complexity_metrics",
            Self::EtconformancePrecision => "etconformance_precision",
            Self::Generalization => "generalization",
            Self::AStar => "a_star",
            Self::Aco => "aco",
            Self::AlphaPlusPlus => "alpha_plus_plus",
            Self::Declare => "declare",
            Self::Dfg => "dfg",
            Self::GeneticAlgorithm => "genetic_algorithm",
            Self::HeuristicMiner => "heuristic_miner",
            Self::HierarchicalDfg => "hierarchical_dfg",
            Self::HillClimbing => "hill_climbing",
            Self::Ilp => "ilp",
            Self::InductiveMiner => "inductive_miner",
            Self::LogToTrie => "log_to_trie",
            Self::OptimizedDfg => "optimized_dfg",
            Self::ProcessSkeleton => "process_skeleton",
            Self::Pso => "pso",
            Self::SimdStreamingDfg => "simd_streaming_dfg",
            Self::SimulatedAnnealing => "simulated_annealing",
            Self::SmartEngine => "smart_engine",
            Self::StreamingLog => "streaming_log",
            Self::TransitionSystem => "transition_system",
            Self::AnalyzeProcessSpeedup => "analyze_process_speedup",
            Self::AnalyzeVariantComplexity => "analyze_variant_complexity",
            Self::Batches => "batches",
            Self::CausalGraph => "causal_graph",
            Self::ComputeActivityTransitionMatrix => "compute_activity_transition_matrix",
            Self::ComputeTraceSimilarityMatrix => "compute_trace_similarity_matrix",
            Self::CorrelationMiner => "correlation_miner",
            Self::HandoverNetwork => "handover_network",
            Self::PerformanceSpectrum => "performance_spectrum",
            Self::WorkingTogetherNetwork => "working_together_network",
            Self::BpmnImport => "bpmn_import",
            Self::PnmlImport => "pnml_import",
            Self::PowlToProcessTree => "powl_to_process_tree",
            Self::YawlExport => "yawl_export",
            Self::AutomlClassify => "automl_classify",
            Self::AutomlForecast => "automl_forecast",
            Self::MlAnomaly => "ml_anomaly",
            Self::MlClassify => "ml_classify",
            Self::MlCluster => "ml_cluster",
            Self::MlForecast => "ml_forecast",
            Self::MlPca => "ml_pca",
            Self::MlRegress => "ml_regress",
            Self::OcelDfg => "ocel_dfg",
            Self::OcelDfgPerType => "ocel_dfg_per_type",
            Self::OcelEncode => "ocel_encode",
            Self::OcelOcDeclare => "ocel_oc_declare",
            Self::OcelOcla => "ocel_ocla",
            Self::OcelPetriNet => "ocel_petri_net",
            Self::ComputeEwma => "compute_ewma",
            Self::DetectDrift => "detect_drift",
            Self::PredictNextActivity => "predict_next_activity",
            Self::PredictOutcome => "predict_outcome",
            Self::PredictRemainingTime => "predict_remaining_time",
            Self::MonteCarloSimulation => "monte_carlo_simulation",
            Self::Playout => "playout",

        }
    }

    /// WASM export function name.
    pub fn wasm_export(&self) -> &'static str {
        match self {
            Self::AgenticPipeline => "run_agentic_pipeline",
            Self::Alignments => "compute_alignments",
            Self::ComplexityMetrics => "compute_complexity_metrics",
            Self::EtconformancePrecision => "compute_align_etconformance_precision",
            Self::Generalization => "generalization",
            Self::AStar => "discover_a_star",
            Self::Aco => "discover_aco",
            Self::AlphaPlusPlus => "discover_alpha_plus_plus",
            Self::Declare => "discover_declare",
            Self::Dfg => "discover_dfg",
            Self::GeneticAlgorithm => "discover_genetic_algorithm",
            Self::HeuristicMiner => "discover_heuristic_miner",
            Self::HierarchicalDfg => "discover_hierarchical_dfg",
            Self::HillClimbing => "discover_hill_climbing",
            Self::Ilp => "discover_ilp_petri_net",
            Self::InductiveMiner => "discover_inductive_miner",
            Self::LogToTrie => "discover_log_to_trie",
            Self::OptimizedDfg => "discover_dfg",
            Self::ProcessSkeleton => "discover_process_skeleton",
            Self::Pso => "discover_pso",
            Self::SimdStreamingDfg => "discover_dfg_simd",
            Self::SimulatedAnnealing => "discover_simulated_annealing",
            Self::SmartEngine => "discover_smart_engine",
            Self::StreamingLog => "discover_dfg",
            Self::TransitionSystem => "discover_transition_system",
            Self::AnalyzeProcessSpeedup => "analyze_process_speedup",
            Self::AnalyzeVariantComplexity => "analyze_variant_complexity",
            Self::Batches => "analyze_batches",
            Self::CausalGraph => "compute_causal_graph",
            Self::ComputeActivityTransitionMatrix => "compute_activity_transition_matrix",
            Self::ComputeTraceSimilarityMatrix => "compute_trace_similarity_matrix",
            Self::CorrelationMiner => "compute_correlation_miner",
            Self::HandoverNetwork => "compute_handover_network",
            Self::PerformanceSpectrum => "compute_performance_spectrum",
            Self::WorkingTogetherNetwork => "compute_working_together_network",
            Self::BpmnImport => "read_bpmn",
            Self::PnmlImport => "from_pnml_wasm",
            Self::PowlToProcessTree => "convert_powl_to_process_tree",
            Self::YawlExport => "export_yawl",
            Self::AutomlClassify => "automl_classify",
            Self::AutomlForecast => "automl_forecast",
            Self::MlAnomaly => "ml_anomaly",
            Self::MlClassify => "ml_classify",
            Self::MlCluster => "ml_cluster",
            Self::MlForecast => "ml_forecast",
            Self::MlPca => "ml_pca",
            Self::MlRegress => "ml_regress",
            Self::OcelDfg => "discover_ocel_dfg",
            Self::OcelDfgPerType => "discover_ocel_dfg_per_type",
            Self::OcelEncode => "encode_ocel",
            Self::OcelOcDeclare => "discover_ocel_oc_declare",
            Self::OcelOcla => "discover_ocel_ocla",
            Self::OcelPetriNet => "discover_ocel_petri_net",
            Self::ComputeEwma => "compute_ewma",
            Self::DetectDrift => "detect_drift",
            Self::PredictNextActivity => "predict_next_activity",
            Self::PredictOutcome => "predict_outcome",
            Self::PredictRemainingTime => "predict_case_duration",
            Self::MonteCarloSimulation => "monte_carlo_simulation",
            Self::Playout => "petri_net_playout",

        }
    }

    /// Functional category.
    pub fn category(&self) -> &'static str {
        match self {
            Self::AgenticPipeline => "agentic",
            Self::Alignments => "conformance",
            Self::ComplexityMetrics => "conformance",
            Self::EtconformancePrecision => "conformance",
            Self::Generalization => "conformance",
            Self::AStar => "discovery",
            Self::Aco => "discovery",
            Self::AlphaPlusPlus => "discovery",
            Self::Declare => "discovery",
            Self::Dfg => "discovery",
            Self::GeneticAlgorithm => "discovery",
            Self::HeuristicMiner => "discovery",
            Self::HierarchicalDfg => "discovery",
            Self::HillClimbing => "discovery",
            Self::Ilp => "discovery",
            Self::InductiveMiner => "discovery",
            Self::LogToTrie => "discovery",
            Self::OptimizedDfg => "discovery",
            Self::ProcessSkeleton => "discovery",
            Self::Pso => "discovery",
            Self::SimdStreamingDfg => "discovery",
            Self::SimulatedAnnealing => "discovery",
            Self::SmartEngine => "discovery",
            Self::StreamingLog => "discovery",
            Self::TransitionSystem => "discovery",
            Self::AnalyzeProcessSpeedup => "discovery_analytics",
            Self::AnalyzeVariantComplexity => "discovery_analytics",
            Self::Batches => "discovery_analytics",
            Self::CausalGraph => "discovery_analytics",
            Self::ComputeActivityTransitionMatrix => "discovery_analytics",
            Self::ComputeTraceSimilarityMatrix => "discovery_analytics",
            Self::CorrelationMiner => "discovery_analytics",
            Self::HandoverNetwork => "discovery_analytics",
            Self::PerformanceSpectrum => "discovery_analytics",
            Self::WorkingTogetherNetwork => "discovery_analytics",
            Self::BpmnImport => "import_export",
            Self::PnmlImport => "import_export",
            Self::PowlToProcessTree => "import_export",
            Self::YawlExport => "import_export",
            Self::AutomlClassify => "ml_analytics",
            Self::AutomlForecast => "ml_analytics",
            Self::MlAnomaly => "ml_analytics",
            Self::MlClassify => "ml_analytics",
            Self::MlCluster => "ml_analytics",
            Self::MlForecast => "ml_analytics",
            Self::MlPca => "ml_analytics",
            Self::MlRegress => "ml_analytics",
            Self::OcelDfg => "object_centric",
            Self::OcelDfgPerType => "object_centric",
            Self::OcelEncode => "object_centric",
            Self::OcelOcDeclare => "object_centric",
            Self::OcelOcla => "object_centric",
            Self::OcelPetriNet => "object_centric",
            Self::ComputeEwma => "prediction",
            Self::DetectDrift => "prediction",
            Self::PredictNextActivity => "prediction",
            Self::PredictOutcome => "prediction",
            Self::PredictRemainingTime => "prediction",
            Self::MonteCarloSimulation => "simulation",
            Self::Playout => "simulation",

        }
    }

    /// Resolve snake_case ID or CLI alias to a variant. Returns None for unknown input.
    pub fn from_id(input: &str) -> Option<Self> {
        Self::ALL.iter().copied().find(|a| a.id() == input)
    }

    /// All admitted algorithms in category-then-ID order.
    pub const ALL: [ProcessIntelligenceAlgorithm; 60] = [
        Self::AgenticPipeline,
        Self::Alignments,
        Self::ComplexityMetrics,
        Self::EtconformancePrecision,
        Self::Generalization,
        Self::AStar,
        Self::Aco,
        Self::AlphaPlusPlus,
        Self::Declare,
        Self::Dfg,
        Self::GeneticAlgorithm,
        Self::HeuristicMiner,
        Self::HierarchicalDfg,
        Self::HillClimbing,
        Self::Ilp,
        Self::InductiveMiner,
        Self::LogToTrie,
        Self::OptimizedDfg,
        Self::ProcessSkeleton,
        Self::Pso,
        Self::SimdStreamingDfg,
        Self::SimulatedAnnealing,
        Self::SmartEngine,
        Self::StreamingLog,
        Self::TransitionSystem,
        Self::AnalyzeProcessSpeedup,
        Self::AnalyzeVariantComplexity,
        Self::Batches,
        Self::CausalGraph,
        Self::ComputeActivityTransitionMatrix,
        Self::ComputeTraceSimilarityMatrix,
        Self::CorrelationMiner,
        Self::HandoverNetwork,
        Self::PerformanceSpectrum,
        Self::WorkingTogetherNetwork,
        Self::BpmnImport,
        Self::PnmlImport,
        Self::PowlToProcessTree,
        Self::YawlExport,
        Self::AutomlClassify,
        Self::AutomlForecast,
        Self::MlAnomaly,
        Self::MlClassify,
        Self::MlCluster,
        Self::MlForecast,
        Self::MlPca,
        Self::MlRegress,
        Self::OcelDfg,
        Self::OcelDfgPerType,
        Self::OcelEncode,
        Self::OcelOcDeclare,
        Self::OcelOcla,
        Self::OcelPetriNet,
        Self::ComputeEwma,
        Self::DetectDrift,
        Self::PredictNextActivity,
        Self::PredictOutcome,
        Self::PredictRemainingTime,
        Self::MonteCarloSimulation,
        Self::Playout,
    ];
}

impl fmt::Display for ProcessIntelligenceAlgorithm {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.id())
    }
}