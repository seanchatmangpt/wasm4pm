/**
 * pictl - Process Intelligence Control WebAssembly Client Library
 *
 * High-level TypeScript API for process mining in the browser.
 * Provides intuitive access to discovery, analysis, and conformance checking.
 */
import * as api from './api.js';
import type * as WasmModule from '../pkg/pictl.js';
import {
  EventLogHandleId,
  OCELHandleId,
  DFGHandleId,
  PetriNetHandleId,
  DeclareHandleId,
  TemporalProfileHandleId,
  NGramPredictorHandleId,
  StreamingDFGHandleId,
  StreamingConformanceHandleId,
  OCPetriNetHandleId,
} from './types.js';
/**
 * Structured error returned from WASM functions
 */
export interface PictlModuleError {
  code: string;
  message: string;
}
/**
 * Parse a WASM error response
 * WASM functions return JSON-stringified errors: {"code":"...", "message":"..."}
 */
export declare function parsePictlError(error: unknown): PictlModuleError;
/**
 * Main client for pictl operations
 * Handles initialization, data management, and algorithm execution
 */
export declare class ProcessMiningClient {
  private initialized;
  private wasmModule;
  private objects;
  /**
   * Initialize the WASM module
   */
  init(): Promise<void>;
  /**
   * Load an EventLog from JSON string
   */
  loadEventLogFromJSON(jsonContent: string): EventLogHandle;
  /**
   * Load an EventLog from XES string
   */
  loadEventLogFromXES(xesContent: string): EventLogHandle;
  /**
   * Load an OCEL from JSON string
   */
  loadOCELFromJSON(jsonContent: string): OCELHandle;
  /**
   * Load an OCEL from XML string
   */
  loadOCELFromXML(xmlContent: string): OCELHandle;
  /**
   * Discover a Temporal Profile from an EventLog
   */
  discoverTemporalProfile(
    log: EventLogHandle,
    options?: {
      activityKey?: string;
      timestampKey?: string;
    }
  ): TemporalProfileHandle;
  /**
   * Build an N-Gram Predictor from an EventLog
   */
  buildNGramPredictor(
    log: EventLogHandle,
    options?: {
      activityKey?: string;
      n?: number;
    }
  ): NGramPredictorHandle;
  /**
   * Build a Remaining Time Model from a completed EventLog.
   * Fits a Weibull survival model and per-bucket statistics.
   * @param log - handle to a loaded EventLog
   * @param activityKey - attribute holding the activity name (default: 'concept:name')
   * @param timestampKey - attribute holding the timestamp (default: 'time:timestamp')
   */
  buildRemainingTimeModel(
    log: EventLogHandle,
    options?: {
      activityKey?: string;
      timestampKey?: string;
    }
  ): RemainingTimeModelHandle;
  /**
   * Begin a Streaming DFG builder
   */
  beginStreamingDFG(): StreamingDFGHandle;
  /**
   * Begin a Streaming Conformance checker against a reference DFG
   */
  beginStreamingConformance(dfg: DFGHandle): StreamingConformanceHandle;
  /**
   * Get the capability registry metadata
   */
  getCapabilityRegistry(): any;
  /**
   * Run OC performance analysis on an OCEL
   */
  analyzeOCPerformance(ocel: OCELHandle): any;
  /**
   * Get the version of pictl
   */
  getVersion(): string;
}
/**
 * Handle to an EventLog stored in WASM memory
 */
export declare class EventLogHandle {
  private handle;
  private wasmModule;
  constructor(handle: EventLogHandleId, wasmModule: typeof WasmModule);
  /**
   * Get the handle ID
   */
  getId(): EventLogHandleId;
  /**
   * Get basic statistics about the log
   */
  getStats(): api.EventLogStats;
  /**
   * Get number of traces (cases)
   */
  getTraceCount(): number;
  /**
   * Get total number of events
   */
  getEventCount(): number;
  /**
   * Get unique activities
   */
  getActivities(activityKey?: string): string[];
  /**
   * Get trace length statistics
   */
  getTraceLengthStats(activityKey?: string): {
    min: number;
    max: number;
    average: number;
    median: number;
    count: number;
  };
  /**
   * Get activity frequencies
   */
  getActivityFrequencies(activityKey?: string): Array<[string, number]>;
  /**
   * Get all attribute names used in the log
   */
  getAttributeNames(): string[];
  /**
   * Filter the log to keep only traces containing the specified activity
   */
  filterByActivity(activity: string, activityKey?: string): EventLogHandle;
  /**
   * Filter the log to keep only traces within the specified length range
   */
  filterByTraceLength(minLength: number, maxLength: number): EventLogHandle;
  /**
   * Discover a Directly-Follows Graph (DFG)
   */
  discoverDFG(options?: { activityKey?: string; minFrequency?: number }): DFGHandle;
  /**
   * Discover DECLARE constraints
   */
  discoverDECLARE(activityKey?: string): DeclareModelHandle;
  /**
   * Discover a Petri Net using Alpha++
   */
  discoverAlphaPlusPlus(options?: { activityKey?: string; minSupport?: number }): PetriNetHandle;
  /**
   * Discover optimal Petri Net using ILP constraint-based optimization
   */
  discoverILPPetriNet(activityKey?: string): PetriNetHandle;
  /**
   * Discover DFG using weighted fitness-simplicity optimization
   */
  discoverOptimizedDFG(options?: {
    activityKey?: string;
    fitnessWeight?: number;
    simplicityWeight?: number;
  }): DFGHandle;
  /**
   * Discover process model using Genetic Algorithm evolution
   */
  discoverGeneticAlgorithm(options?: {
    activityKey?: string;
    populationSize?: number;
    generations?: number;
  }): DFGHandle;
  /**
   * Discover process model using Particle Swarm Optimization
   */
  discoverPSOAlgorithm(options?: {
    activityKey?: string;
    swarmSize?: number;
    iterations?: number;
  }): DFGHandle;
  /**
   * A* Search-based discovery - informed heuristic search for optimal models
   */
  discoverAStar(options?: { activityKey?: string; maxIterations?: number }): DFGHandle;
  /**
   * Hill Climbing - greedy local optimization to maximal fitness
   */
  discoverHillClimbing(activityKey?: string): DFGHandle;
  /**
   * Analyze trace variants - extract unique process paths and frequencies
   */
  getTraceVariants(activityKey?: string): any;
  /**
   * Sequential Pattern Mining - find frequent activity sequences
   */
  mineSequentialPatterns(options?: {
    activityKey?: string;
    minSupport?: number;
    patternLength?: number;
  }): any;
  /**
   * Detect concept drift - identify where process behavior changes
   */
  detectConceptDrift(options?: { activityKey?: string; windowSize?: number }): any;
  /**
   * Cluster traces - group similar traces for variant analysis
   */
  clusterTraces(options?: { activityKey?: string; numClusters?: number }): any;
  /**
   * Analyze start/end activities - find entry and exit points in process
   */
  getStartEndActivities(activityKey?: string): any;
  /**
   * Activity co-occurrence - find activities that happen together in traces
   */
  getActivityCooccurrence(activityKey?: string): any;
  /**
   * Inductive Miner - recursive structure discovery with direct follows graph
   */
  discoverInductiveMiner(activityKey?: string): DFGHandle;
  /**
   * Ant Colony Optimization - pheromone-based distributed search
   */
  discoverAntColony(options?: {
    activityKey?: string;
    numAnts?: number;
    iterations?: number;
  }): DFGHandle;
  /**
   * Simulated Annealing - thermal search with cooling schedule
   */
  discoverSimulatedAnnealing(options?: {
    activityKey?: string;
    temperature?: number;
    coolingRate?: number;
  }): DFGHandle;
  /**
   * Extract Process Skeleton - minimal model keeping only frequent edges
   */
  extractProcessSkeleton(options?: { activityKey?: string; minFrequency?: number }): DFGHandle;
  /**
   * Analyze Activity Dependencies - identify predecessors and successors
   */
  getActivityDependencies(activityKey?: string): any;
  /**
   * Analyze Case Attributes - correlate case-level attributes with process
   */
  getCaseAttributeAnalysis(activityKey?: string): any;
  /**
   * Variant Complexity - measure Shannon entropy and variant diversity
   */
  getVariantComplexity(activityKey?: string): any;
  /**
   * Activity Transition Matrix - compute Markov chain transition probabilities
   */
  getTransitionMatrix(activityKey?: string): any;
  /**
   * Temporal Speedup Analysis - identify process acceleration/deceleration patterns
   */
  analyzeProcessSpeedup(options?: { timestampKey?: string; windowSize?: number }): any;
  /**
   * Trace Similarity Matrix - compute pairwise trace distance/similarity
   */
  getTraceSimilarityMatrix(activityKey?: string): any;
  /**
   * Temporal Bottlenecks - identify time-based performance bottlenecks
   */
  getTemporalBottlenecks(options?: { activityKey?: string; timestampKey?: string }): any;
  /**
   * Activity Ordering - extract mandatory predecessor ordering from traces
   */
  getActivityOrdering(activityKey?: string): any;
  /**
   * Generate dotted chart data for visualization
   */
  getDottedChart(activityKey?: string): any;
  /**
   * Calculate case durations
   */
  calculateCaseDurations(timestampKey?: string): any[];
  /**
   * Check if log has timestamp attributes
   */
  hasTimestamps(timestampKey?: string): boolean;
  /**
   * Check if log has activity attributes
   */
  hasActivities(activityKey?: string): boolean;
  /**
   * Export the log to JSON
   */
  toJSON(): string;
  /**
   * Export the log to XES format
   */
  toXES(): string;
  /**
   * Extract case-level features for predictive modeling
   */
  extractCaseFeatures(
    activityKey?: string,
    timestampKey?: string,
    config?: api.FeatureExtractionConfig
  ): Promise<api.FeatureVector[]>;
  /**
   * Extract prefix-level features for remaining time/outcome prediction
   */
  extractPrefixFeatures(
    activityKey?: string,
    timestampKey?: string,
    prefixLength?: number
  ): Promise<api.FeatureVector[]>;
  /**
   * Export extracted features as CSV
   */
  exportFeaturesAsCSV(
    activityKey?: string,
    timestampKey?: string,
    config?: api.FeatureExtractionConfig
  ): Promise<string>;
  /**
   * Check data quality of the event log
   */
  checkDataQuality(activityKey?: string, timestampKey?: string): Promise<api.DataQualityResult>;
  /**
   * Infer event log schema automatically
   */
  inferSchema(): Promise<api.SchemaInference>;
  /**
   * Analyze resource utilization
   */
  analyzeResourceUtilization(
    resourceKey?: string,
    timestampKey?: string
  ): Promise<api.ResourceUtilization[]>;
  /**
   * Analyze resource-activity interactions
   */
  analyzeResourceActivityMatrix(
    resourceKey?: string,
    activityKey?: string
  ): Promise<api.ResourceActivityMatrix>;
  /**
   * Identify resource bottlenecks
   */
  identifyResourceBottlenecks(
    resourceKey?: string,
    timestampKey?: string,
    activityKey?: string
  ): Promise<api.ResourceBottleneck[]>;
  /**
   * Cleanup: delete the log from WASM memory
   */
  delete(): void;
}
/**
 * Handle to an OCEL stored in WASM memory
 */
export declare class OCELHandle {
  private handle;
  private wasmModule;
  constructor(handle: OCELHandleId, wasmModule: typeof WasmModule);
  /**
   * Get the handle ID
   */
  getId(): OCELHandleId;
  /**
   * Get basic statistics about the OCEL
   */
  getStats(): {
    total_events: number;
    total_objects: number;
  };
  /**
   * Get the total number of events in the OCEL
   */
  getEventCount(): number;
  /**
   * Get the total number of objects in the OCEL
   */
  getObjectCount(): number;
  /**
   * Discover Object-Centric DFG
   */
  discoverOCDFG(options?: { minFrequency?: number }): DFGHandle;
  /**
   * Export to JSON
   */
  toJSON(): string;
  /**
   * List all object types in the OCEL
   */
  listObjectTypes(): Promise<string[]>;
  /**
   * Get statistics for each object type
   */
  getTypeStatistics(): Promise<Record<string, any>>;
  /**
   * Flatten OCEL to EventLog for a specific object type
   */
  flattenToEventLog(objectType: string): EventLogHandle;
  /**
   * Discover DFG for each object type
   */
  discoverDFGPerType(): Promise<Record<string, api.DirectlyFollowsGraph>>;
  /**
   * Cleanup: delete from WASM memory
   */
  delete(): void;
}
/**
 * Handle to a Directly-Follows Graph
 */
export declare class DFGHandle {
  private handle;
  private wasmModule;
  constructor(handle: DFGHandleId, wasmModule: typeof WasmModule);
  /**
   * Get the handle ID
   */
  getId(): DFGHandleId;
  /**
   * Get the DFG as JSON
   */
  toJSON(): api.DirectlyFollowsGraph;
  /**
   * Cleanup
   */
  delete(): void;
}
/**
 * Handle to a Petri Net
 */
export declare class PetriNetHandle {
  private handle;
  private wasmModule;
  constructor(handle: PetriNetHandleId, wasmModule: typeof WasmModule);
  /**
   * Get the handle ID
   */
  getId(): PetriNetHandleId;
  /**
   * Get the Petri Net as JSON
   */
  toJSON(): api.PetriNet;
  /**
   * Check conformance of an EventLog against this Petri Net
   */
  checkConformance(log: EventLogHandle, activityKey?: string): any;
  /**
   * Cleanup
   */
  delete(): void;
}
/**
 * Handle to a DECLARE model
 */
export declare class DeclareModelHandle {
  private handle;
  private wasmModule;
  constructor(handle: DeclareHandleId, wasmModule: typeof WasmModule);
  /**
   * Get the handle ID
   */
  getId(): DeclareHandleId;
  /**
   * Get the model as JSON
   */
  toJSON(): api.DeclareModel;
  /**
   * Cleanup
   */
  delete(): void;
}
/**
 * Handle to an Object-Centric Petri Net
 */
export declare class OCPetriNetHandle {
  private handle;
  private wasmModule;
  constructor(handle: OCPetriNetHandleId, wasmModule: typeof WasmModule);
  /**
   * Get the handle ID
   */
  getId(): OCPetriNetHandleId;
  /**
   * Get the OC Petri Net as JSON
   */
  toJSON(): api.OCPetriNet;
  /**
   * Export as PNML format (Petri Net Markup Language)
   */
  toPNML(): string;
  /**
   * Cleanup
   */
  delete(): void;
}
/**
 * Handle to a Temporal Profile stored in WASM memory
 */
export declare class TemporalProfileHandle {
  private handle;
  private wasmModule;
  constructor(handle: TemporalProfileHandleId, wasmModule: typeof WasmModule);
  getId(): TemporalProfileHandleId;
  /**
   * Check conformance of an EventLog against this temporal profile
   * @param log - EventLog to check
   * @param zeta - z-score threshold for deviation detection (default 2.0)
   */
  checkConformance(
    log: EventLogHandle,
    options?: {
      activityKey?: string;
      timestampKey?: string;
      zeta?: number;
    }
  ): any;
  delete(): void;
}
/**
 * Handle to an N-Gram Predictor stored in WASM memory
 */
export declare class NGramPredictorHandle {
  private handle;
  private wasmModule;
  constructor(handle: NGramPredictorHandleId, wasmModule: typeof WasmModule);
  getId(): NGramPredictorHandleId;
  /**
   * Predict the next activity given a prefix of activities (simple, returns raw value)
   * @param prefix - array of activity names forming the prefix
   */
  predictNextActivity(prefix: string[]): any;
  /**
   * Predict top-k next activities with probabilities, confidence, and entropy.
   * Returns `{ activities: string[], probabilities: number[], confidence: number, entropy: number }`
   * @param prefix - array of activity names forming the current prefix
   * @param k - number of top candidates to return
   */
  predictNextK(prefix: string[], k: number): any;
  /**
   * Beam-search future paths from the current prefix.
   * Returns an array of `{ sequence: string[], probability: number, length: number }`
   * sorted by descending probability.
   * @param prefix - array of activity names forming the current prefix
   * @param beamWidth - number of beams (candidate paths) to keep at each step
   * @param maxSteps - maximum number of future activities to project
   */
  predictBeamPaths(prefix: string[], beamWidth: number, maxSteps: number): any;
  /**
   * Score the likelihood of a complete trace (returns plain log-probability float).
   * @param activities - array of activity names in the trace
   */
  scoreTraceLikelihood(activities: string[]): any;
  /**
   * Score trace likelihood with structured output.
   * Returns `{ log_likelihood: number, normalized: number }`
   * @param activities - array of activity names in the trace
   */
  computeTraceLikelihood(activities: string[]): any;
  delete(): void;
}
/**
 * Handle to a Remaining Time Model stored in WASM memory.
 * Answers "When will this case complete?"
 *
 * Build with `ProcessMiningClient.buildRemainingTimeModel()`.
 */
export declare class RemainingTimeModelHandle {
  private handle;
  private wasmModule;
  constructor(handle: string, wasmModule: typeof WasmModule);
  getId(): string;
  /**
   * Estimate remaining time for a running case given its activity prefix.
   * Returns `{ remaining_ms: number, confidence: number, method: string }`
   * @param prefix - array of activity names observed so far
   */
  predictCaseDuration(prefix: string[]): any;
  /**
   * Instantaneous hazard rate at a given elapsed time.
   * Returns `{ hazard_rate, survival_probability, cumulative_hazard, median_remaining_ms, shape, scale }`
   * @param elapsedMs - milliseconds elapsed since case start
   */
  predictHazardRate(elapsedMs: number): any;
  delete(): void;
}
/**
 * Handle to a Streaming DFG builder stored in WASM memory
 */
export declare class StreamingDFGHandle {
  private handle;
  private wasmModule;
  constructor(handle: StreamingDFGHandleId, wasmModule: typeof WasmModule);
  getId(): StreamingDFGHandleId;
  /**
   * Add a single event to the streaming DFG
   */
  addEvent(caseId: string, activity: string): any;
  /**
   * Add a batch of events as JSON array
   * @param eventsJson - JSON string of [{case_id, activity}, ...]
   */
  addBatch(eventsJson: string): any;
  /**
   * Close a trace (mark case as complete)
   */
  closeTrace(caseId: string): any;
  /**
   * Flush all open traces (close them without explicit close)
   */
  flushOpen(): any;
  /**
   * Take a snapshot of the current DFG state
   */
  snapshot(): any;
  /**
   * Finalize the streaming DFG and produce the final result
   */
  finalize(): any;
  /**
   * Get current statistics
   */
  stats(): any;
  delete(): void;
}
/**
 * Handle to a Streaming Conformance checker stored in WASM memory
 */
export declare class StreamingConformanceHandle {
  private handle;
  private wasmModule;
  constructor(handle: StreamingConformanceHandleId, wasmModule: typeof WasmModule);
  getId(): StreamingConformanceHandleId;
  /**
   * Add a single event for conformance checking
   */
  addEvent(caseId: string, activity: string): any;
  /**
   * Close a trace (mark case as complete)
   */
  closeTrace(caseId: string): any;
  /**
   * Get current conformance statistics
   */
  stats(): any;
  /**
   * Finalize and produce final conformance results
   */
  finalize(): any;
  delete(): void;
}
/**
 * Convenience function to load a file from the browser
 */
export declare function loadFileAsText(file: File): Promise<string>;
/**
 * Initialize the global WASM module reference
 */
export declare function initializePictlModule(wasmModule: any): void;
/**
 * Encode DFG as plain text representation
 */
export declare function encodeTextAsText(dfgHandle: DFGHandle): Promise<string>;
/**
 * Encode variants as text representation
 */
export declare function encodeVariantsAsText(
  logHandle: EventLogHandle,
  activityKey?: string,
  topN?: number
): Promise<string>;
/**
 * Encode event log as text summary
 */
export declare function encodeLogAsText(logHandle: EventLogHandle): Promise<string>;
/**
 * Encode Petri Net as text representation
 */
export declare function encodePetriNetAsText(petriNetHandle: PetriNetHandle): Promise<string>;
/**
 * Encode OCEL as text representation
 */
export declare function encodeOCELAsText(ocelHandle: OCELHandle): Promise<string>;
/**
 * Encode object-centric Petri Net as text representation
 */
export declare function encodeOCPetriNetAsText(ocpnHandle: OCPetriNetHandle): Promise<string>;
/**
 * Encode process model comparison as text
 */
export declare function encodeModelComparisonAsText(
  model1Handle: DFGHandle | PetriNetHandle,
  model2Handle: DFGHandle | PetriNetHandle
): Promise<string>;
/**
 * Score how anomalous a trace is relative to a DFG model.
 * Returns `{ score: number [0–1], is_anomalous: boolean, threshold: number }`
 * @param dfgHandle - handle to a discovered DFG
 * @param trace - array of activity names
 */
export declare function scoreAnomaly(dfgHandle: DFGHandle, trace: string[]): any;
/**
 * Estimate the probability that a running case completes normally given its prefix.
 * Returns `{ coverage: number [0–1], matching_traces: number, normal_completions: number }`
 * @param logHandle - handle to a completed EventLog used as reference
 * @param prefix - activity prefix of the running case
 * @param activityKey - attribute key for the activity name
 */
export declare function computeBoundaryCoverage(
  logHandle: EventLogHandle,
  prefix: string[],
  activityKey?: string
): any;
/**
 * Detect where process behaviour shifts in an event log using a sliding window.
 * Returns `{ drifts_detected: number, drifts: [{position, distance, type}], window_size, method }`
 * @param logHandle - handle to an EventLog
 * @param activityKey - attribute key for the activity name
 * @param windowSize - number of traces per window (default 10)
 */
export declare function detectDrift(
  logHandle: EventLogHandle,
  activityKey?: string,
  windowSize?: number
): any;
/**
 * Compute Exponential Moving Average over a numeric series.
 * Returns `{ smoothed: number[], trend: "rising"|"falling"|"stable", last_value: number }`
 * @param values - time-series of numeric values (e.g. throughput times)
 * @param alpha - smoothing factor in (0,1]; 0.3 is a good default
 */
export declare function computeEwma(values: number[], alpha?: number): any;
/**
 * Extract numeric features from a case prefix for ML or bandit models.
 * Returns `{ length, last_activity, unique_activities, rework_count, activity_frequency_entropy }`
 * @param prefix - array of activity names observed so far
 */
export declare function extractPrefixFeatures(prefix: string[]): any;
/**
 * Count consecutive repeated activities (loops/rework) in a trace.
 * Returns `{ rework_count, rework_ratio, repeated_pairs: string[] }`
 * @param trace - array of activity names
 */
export declare function computeReworkScore(trace: string[]): any;
/**
 * Build a transition probability graph (probabilistic DFG) from an event log.
 * Returns `{ edges: [{from, to, probability, count}], activities: string[] }`
 * @param logHandle - handle to an EventLog
 * @param activityKey - attribute key for the activity name
 */
export declare function buildTransitionProbabilities(
  logHandle: EventLogHandle,
  activityKey?: string
): any;
/**
 * Estimate average wait time using the M/M/1 queueing model.
 * Returns `{ wait_time: number, utilization: number, is_stable: boolean }`
 * @param arrivalRate - events arriving per unit time
 * @param serviceRate - events processed per unit time
 */
export declare function estimateQueueDelay(arrivalRate: number, serviceRate: number): any;
/**
 * Rank intervention options using a greedy UCB-like heuristic.
 * Returns an array of `{ name, score, rank }` sorted by descending score.
 * @param interventions - array of `{ name: string, utility: number }` objects
 * @param exploitationWeight - 0–1; higher = favour top utility (default 0.7)
 */
export declare function rankInterventions(
  interventions: Array<{
    name: string;
    utility: number;
  }>,
  exploitationWeight?: number
): any;
/**
 * Select the next intervention using the UCB1 multi-armed bandit algorithm.
 * Returns `{ selected: string, arm_index, ucb_score, mean_reward, exploration_bonus }`
 * @param banditState - `{ arms: [{name, total_reward, pull_count}], total_pulls }`
 * @param explorationFactor - controls exploration vs exploitation (default √2 ≈ 1.414)
 */
export declare function selectIntervention(
  banditState: {
    arms: Array<{
      name: string;
      total_reward: number;
      pull_count: number;
    }>;
    total_pulls: number;
  },
  explorationFactor?: number
): any;
//# sourceMappingURL=client.d.ts.map
