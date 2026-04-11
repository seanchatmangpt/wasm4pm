/**
 * pictl - Process Intelligence Control WebAssembly Client Library
 *
 * High-level TypeScript API for process mining in the browser.
 * Provides intuitive access to discovery, analysis, and conformance checking.
 */

// Import types from the API definition
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
  FeatureMatrixHandleId,
  asEventLogHandleId,
  asOCELHandleId,
  asDFGHandleId,
  asPetriNetHandleId,
  asDeclareHandleId,
  asTemporalProfileHandleId,
  asNGramPredictorHandleId,
  asStreamingDFGHandleId,
  asStreamingConformanceHandleId,
  asOCPetriNetHandleId,
  asFeatureMatrixHandleId,
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
export function parsePictlError(error: unknown): PictlModuleError {
  if (typeof error === 'string') {
    try {
      const parsed = JSON.parse(error);
      if (parsed.code && parsed.message) {
        return { code: parsed.code, message: parsed.message };
      }
    } catch {
      // Not valid JSON, treat as generic error
    }
    return { code: 'UNKNOWN_ERROR', message: error };
  }

  if (error instanceof Error) {
    return { code: 'ERROR', message: error.message };
  }

  return { code: 'UNKNOWN_ERROR', message: String(error) };
}

/**
 * Main client for pictl operations
 * Handles initialization, data management, and algorithm execution
 */
export class ProcessMiningClient {
  private initialized: boolean = false;
  private wasmModule: typeof WasmModule | null = null;
  private objects: Map<string, any> = new Map();

  /**
   * Initialize the WASM module
   */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // This will be the compiled WASM module
      // The actual initialization depends on how wasm-pack builds the module
      if (typeof globalThis !== 'undefined' && (globalThis as any).wasm4pm) {
        this.wasmModule = (globalThis as any).wasm4pm;
      }

      this.initialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize pictl: ${error}`);
    }
  }

  /**
   * Load an EventLog from JSON string
   */
  loadEventLogFromJSON(jsonContent: string): EventLogHandle {
    if (!this.initialized) throw new Error('Client not initialized. Call init() first.');

    const handle = asEventLogHandleId(this.wasmModule!.load_eventlog_from_json(jsonContent));
    return new EventLogHandle(handle, this.wasmModule!);
  }

  /**
   * Load an EventLog from XES string
   */
  loadEventLogFromXES(xesContent: string): EventLogHandle {
    if (!this.initialized) throw new Error('Client not initialized. Call init() first.');

    const handle = asEventLogHandleId(this.wasmModule!.load_eventlog_from_xes(xesContent));
    return new EventLogHandle(handle, this.wasmModule!);
  }

  /**
   * Load an OCEL from JSON string
   */
  loadOCELFromJSON(jsonContent: string): OCELHandle {
    if (!this.initialized) throw new Error('Client not initialized. Call init() first.');

    const handle = asOCELHandleId(this.wasmModule!.load_ocel_from_json(jsonContent));
    return new OCELHandle(handle, this.wasmModule!);
  }

  /**
   * Load an OCEL from XML string
   */
  loadOCELFromXML(xmlContent: string): OCELHandle {
    if (!this.initialized) throw new Error('Client not initialized. Call init() first.');

    const handle = asOCELHandleId(this.wasmModule!.load_ocel_from_xml(xmlContent));
    return new OCELHandle(handle, this.wasmModule!);
  }

  /**
   * Discover a Temporal Profile from an EventLog
   */
  discoverTemporalProfile(
    log: EventLogHandle,
    options: { activityKey?: string; timestampKey?: string } = {}
  ): TemporalProfileHandle {
    if (!this.initialized) throw new Error('Client not initialized. Call init() first.');
    const activityKey = options.activityKey || 'concept:name';
    const timestampKey = options.timestampKey || 'time:timestamp';
    const handle = asTemporalProfileHandleId(
      this.wasmModule!.discover_temporal_profile(log.getId(), activityKey, timestampKey)
    );
    return new TemporalProfileHandle(handle, this.wasmModule!);
  }

  /**
   * Build an N-Gram Predictor from an EventLog
   */
  buildNGramPredictor(
    log: EventLogHandle,
    options: { activityKey?: string; n?: number } = {}
  ): NGramPredictorHandle {
    if (!this.initialized) throw new Error('Client not initialized. Call init() first.');
    const activityKey = options.activityKey || 'concept:name';
    const n = options.n || 3;
    const handle = asNGramPredictorHandleId(
      this.wasmModule!.build_ngram_predictor(log.getId(), activityKey, n)
    );
    return new NGramPredictorHandle(handle, this.wasmModule!);
  }

  /**
   * Build a Remaining Time Model from a completed EventLog.
   * Fits a Weibull survival model and per-bucket statistics.
   * @param log - handle to a loaded EventLog
   * @param activityKey - attribute holding the activity name (default: 'concept:name')
   * @param timestampKey - attribute holding the timestamp (default: 'time:timestamp')
   */
  buildRemainingTimeModel(
    log: EventLogHandle,
    options: { activityKey?: string; timestampKey?: string } = {}
  ): RemainingTimeModelHandle {
    if (!this.initialized) throw new Error('Client not initialized. Call init() first.');
    const activityKey = options.activityKey || 'concept:name';
    const timestampKey = options.timestampKey || 'time:timestamp';
    const handle = this.wasmModule!.build_remaining_time_model(
      log.getId(),
      activityKey,
      timestampKey
    );
    return new RemainingTimeModelHandle(handle as string, this.wasmModule!);
  }

  /**
   * Begin a Streaming DFG builder
   */
  beginStreamingDFG(): StreamingDFGHandle {
    if (!this.initialized) throw new Error('Client not initialized. Call init() first.');
    const handle = asStreamingDFGHandleId(this.wasmModule!.streaming_dfg_begin());
    return new StreamingDFGHandle(handle, this.wasmModule!);
  }

  /**
   * Begin a Streaming Conformance checker against a reference DFG
   */
  beginStreamingConformance(dfg: DFGHandle): StreamingConformanceHandle {
    if (!this.initialized) throw new Error('Client not initialized. Call init() first.');
    const handle = asStreamingConformanceHandleId(
      this.wasmModule!.streaming_conformance_begin(dfg.getId())
    );
    return new StreamingConformanceHandle(handle, this.wasmModule!);
  }

  /**
   * Get the capability registry metadata
   */
  getCapabilityRegistry(): any {
    if (!this.initialized) throw new Error('Client not initialized. Call init() first.');
    return this.wasmModule!.get_capability_registry();
  }

  /**
   * Run OC performance analysis on an OCEL
   */
  analyzeOCPerformance(ocel: OCELHandle): any {
    if (!this.initialized) throw new Error('Client not initialized. Call init() first.');
    return this.wasmModule!.oc_performance_analysis(ocel.getId());
  }

  /**
   * Get the version of pictl
   */
  getVersion(): string {
    if (!this.initialized) throw new Error('Client not initialized. Call init() first.');
    return this.wasmModule!.get_version();
  }
}

/**
 * Handle to an EventLog stored in WASM memory
 */
export class EventLogHandle {
  constructor(
    private handle: EventLogHandleId,
    private wasmModule: typeof WasmModule
  ) {}

  /**
   * Get the handle ID
   */
  getId(): EventLogHandleId {
    return this.handle;
  }

  /**
   * Get basic statistics about the log
   */
  getStats(): api.EventLogStats {
    try {
      return this.wasmModule.analyze_event_statistics(this.handle);
    } catch (error) {
      throw new Error(`Failed to get event log statistics: ${error}`);
    }
  }

  /**
   * Get number of traces (cases)
   */
  getTraceCount(): number {
    return this.wasmModule.get_trace_count(this.handle);
  }

  /**
   * Get total number of events
   */
  getEventCount(): number {
    return this.wasmModule.get_event_count(this.handle);
  }

  /**
   * Get unique activities
   */
  getActivities(activityKey: string = 'concept:name'): string[] {
    return this.wasmModule.get_activities(this.handle, activityKey);
  }

  /**
   * Get trace length statistics
   */
  getTraceLengthStats(activityKey: string = 'concept:name'): {
    min: number;
    max: number;
    average: number;
    median: number;
    count: number;
  } {
    return this.wasmModule.get_trace_length_statistics(this.handle);
  }

  /**
   * Get activity frequencies
   */
  getActivityFrequencies(activityKey: string = 'concept:name'): Array<[string, number]> {
    return this.wasmModule.get_activity_frequencies(this.handle, activityKey);
  }

  /**
   * Get all attribute names used in the log
   */
  getAttributeNames(): string[] {
    return this.wasmModule.get_attribute_names(this.handle);
  }

  /**
   * Filter the log to keep only traces containing the specified activity
   */
  filterByActivity(activity: string, activityKey: string = 'concept:name'): EventLogHandle {
    const result = this.wasmModule.filter_log_by_activity(this.handle, activityKey, activity);
    return new EventLogHandle(asEventLogHandleId(result.handle), this.wasmModule);
  }

  /**
   * Filter the log to keep only traces within the specified length range
   */
  filterByTraceLength(minLength: number, maxLength: number): EventLogHandle {
    const result = this.wasmModule.filter_log_by_trace_length(this.handle, minLength, maxLength);
    return new EventLogHandle(asEventLogHandleId(result.handle), this.wasmModule);
  }

  /**
   * Discover a Directly-Follows Graph (DFG)
   */
  discoverDFG(options: { activityKey?: string; minFrequency?: number } = {}): DFGHandle {
    const activityKey = options.activityKey || 'concept:name';
    const minFrequency = options.minFrequency || 1;

    const result = this.wasmModule.discover_dfg_filtered(this.handle, activityKey, minFrequency);
    return new DFGHandle(asDFGHandleId(result.handle), this.wasmModule);
  }

  /**
   * Discover DECLARE constraints
   */
  discoverDECLARE(activityKey: string = 'concept:name'): DeclareModelHandle {
    const result = this.wasmModule.discover_declare(this.handle, activityKey);
    return new DeclareModelHandle(asDeclareHandleId(result.handle), this.wasmModule);
  }

  /**
   * Discover a Petri Net using Alpha++
   */
  discoverAlphaPlusPlus(
    options: { activityKey?: string; minSupport?: number } = {}
  ): PetriNetHandle {
    const activityKey = options.activityKey || 'concept:name';
    const minSupport = options.minSupport || 0.1;

    const result = this.wasmModule.discover_alpha_plus_plus(this.handle, activityKey, minSupport);
    return new PetriNetHandle(asPetriNetHandleId(result.handle), this.wasmModule);
  }

  /**
   * Discover optimal Petri Net using ILP constraint-based optimization
   */
  discoverILPPetriNet(activityKey: string = 'concept:name'): PetriNetHandle {
    const result = this.wasmModule.discover_ilp_petri_net(this.handle, activityKey);
    return new PetriNetHandle(asPetriNetHandleId(result.handle), this.wasmModule);
  }

  /**
   * Discover DFG using weighted fitness-simplicity optimization
   */
  discoverOptimizedDFG(
    options: {
      activityKey?: string;
      fitnessWeight?: number;
      simplicityWeight?: number;
    } = {}
  ): DFGHandle {
    const activityKey = options.activityKey || 'concept:name';
    const fitnessWeight = options.fitnessWeight || 0.7;
    const simplicityWeight = options.simplicityWeight || 0.3;

    const result = this.wasmModule.discover_optimized_dfg(
      this.handle,
      activityKey,
      fitnessWeight,
      simplicityWeight
    );
    return new DFGHandle(asDFGHandleId(result.handle), this.wasmModule);
  }

  /**
   * Discover process model using Genetic Algorithm evolution
   */
  discoverGeneticAlgorithm(
    options: {
      activityKey?: string;
      populationSize?: number;
      generations?: number;
    } = {}
  ): DFGHandle {
    const activityKey = options.activityKey || 'concept:name';
    const populationSize = options.populationSize || 50;
    const generations = options.generations || 20;

    const result = this.wasmModule.discover_genetic_algorithm(
      this.handle,
      activityKey,
      populationSize,
      generations
    );
    return new DFGHandle(asDFGHandleId(result.handle), this.wasmModule);
  }

  /**
   * Discover process model using Particle Swarm Optimization
   */
  discoverPSOAlgorithm(
    options: {
      activityKey?: string;
      swarmSize?: number;
      iterations?: number;
    } = {}
  ): DFGHandle {
    const activityKey = options.activityKey || 'concept:name';
    const swarmSize = options.swarmSize || 30;
    const iterations = options.iterations || 50;

    const result = this.wasmModule.discover_pso_algorithm(
      this.handle,
      activityKey,
      swarmSize,
      iterations
    );
    return new DFGHandle(asDFGHandleId(result.handle), this.wasmModule);
  }

  /**
   * A* Search-based discovery - informed heuristic search for optimal models
   */
  discoverAStar(options: { activityKey?: string; maxIterations?: number } = {}): DFGHandle {
    const activityKey = options.activityKey || 'concept:name';
    const maxIterations = options.maxIterations || 1000;

    const result = this.wasmModule.discover_astar(this.handle, activityKey, maxIterations);
    return new DFGHandle(asDFGHandleId(result.handle), this.wasmModule);
  }

  /**
   * Hill Climbing - greedy local optimization to maximal fitness
   */
  discoverHillClimbing(activityKey: string = 'concept:name'): DFGHandle {
    const result = this.wasmModule.discover_hill_climbing(this.handle, activityKey);
    return new DFGHandle(asDFGHandleId(result.handle), this.wasmModule);
  }

  /**
   * Analyze trace variants - extract unique process paths and frequencies
   */
  getTraceVariants(activityKey: string = 'concept:name'): any {
    return this.wasmModule.analyze_trace_variants(this.handle, activityKey);
  }

  /**
   * Sequential Pattern Mining - find frequent activity sequences
   */
  mineSequentialPatterns(
    options: {
      activityKey?: string;
      minSupport?: number;
      patternLength?: number;
    } = {}
  ): any {
    const activityKey = options.activityKey || 'concept:name';
    const minSupport = options.minSupport || 0.01;
    const patternLength = options.patternLength || 3;

    return this.wasmModule.mine_sequential_patterns(
      this.handle,
      activityKey,
      minSupport,
      patternLength
    );
  }

  /**
   * Detect concept drift - identify where process behavior changes
   */
  detectConceptDrift(options: { activityKey?: string; windowSize?: number } = {}): any {
    const activityKey = options.activityKey || 'concept:name';
    const windowSize = options.windowSize || 50;

    return this.wasmModule.detect_concept_drift(this.handle, activityKey, windowSize);
  }

  /**
   * Cluster traces - group similar traces for variant analysis
   */
  clusterTraces(options: { activityKey?: string; numClusters?: number } = {}): any {
    const activityKey = options.activityKey || 'concept:name';
    const numClusters = options.numClusters || 5;

    return this.wasmModule.cluster_traces(this.handle, activityKey, numClusters);
  }

  /**
   * Analyze start/end activities - find entry and exit points in process
   */
  getStartEndActivities(activityKey: string = 'concept:name'): any {
    return this.wasmModule.analyze_start_end_activities(this.handle, activityKey);
  }

  /**
   * Activity co-occurrence - find activities that happen together in traces
   */
  getActivityCooccurrence(activityKey: string = 'concept:name'): any {
    return this.wasmModule.analyze_activity_cooccurrence(this.handle, activityKey);
  }

  /**
   * Inductive Miner - recursive structure discovery with direct follows graph
   */
  discoverInductiveMiner(activityKey: string = 'concept:name'): DFGHandle {
    const result = this.wasmModule.discover_inductive_miner(this.handle, activityKey);
    return new DFGHandle(asDFGHandleId(result.handle), this.wasmModule);
  }

  /**
   * Ant Colony Optimization - pheromone-based distributed search
   */
  discoverAntColony(
    options: { activityKey?: string; numAnts?: number; iterations?: number } = {}
  ): DFGHandle {
    const activityKey = options.activityKey || 'concept:name';
    const numAnts = options.numAnts || 20;
    const iterations = options.iterations || 10;

    const result = this.wasmModule.discover_ant_colony(
      this.handle,
      activityKey,
      numAnts,
      iterations
    );
    return new DFGHandle(asDFGHandleId(result.handle), this.wasmModule);
  }

  /**
   * Simulated Annealing - thermal search with cooling schedule
   */
  discoverSimulatedAnnealing(
    options: { activityKey?: string; temperature?: number; coolingRate?: number } = {}
  ): DFGHandle {
    const activityKey = options.activityKey || 'concept:name';
    const temperature = options.temperature || 100.0;
    const coolingRate = options.coolingRate || 0.95;

    const result = this.wasmModule.discover_simulated_annealing(
      this.handle,
      activityKey,
      temperature,
      coolingRate
    );
    return new DFGHandle(asDFGHandleId(result.handle), this.wasmModule);
  }

  /**
   * Extract Process Skeleton - minimal model keeping only frequent edges
   */
  extractProcessSkeleton(options: { activityKey?: string; minFrequency?: number } = {}): DFGHandle {
    const activityKey = options.activityKey || 'concept:name';
    const minFrequency = options.minFrequency || 2;

    const result = this.wasmModule.extract_process_skeleton(this.handle, activityKey, minFrequency);
    return new DFGHandle(asDFGHandleId(result.handle), this.wasmModule);
  }

  /**
   * Analyze Activity Dependencies - identify predecessors and successors
   */
  getActivityDependencies(activityKey: string = 'concept:name'): any {
    return this.wasmModule.analyze_activity_dependencies(this.handle, activityKey);
  }

  /**
   * Analyze Case Attributes - correlate case-level attributes with process
   */
  getCaseAttributeAnalysis(activityKey: string = 'concept:name'): any {
    return this.wasmModule.analyze_case_attributes(this.handle, activityKey);
  }

  /**
   * Variant Complexity - measure Shannon entropy and variant diversity
   */
  getVariantComplexity(activityKey: string = 'concept:name'): any {
    return this.wasmModule.analyze_variant_complexity(this.handle, activityKey);
  }

  /**
   * Activity Transition Matrix - compute Markov chain transition probabilities
   */
  getTransitionMatrix(activityKey: string = 'concept:name'): any {
    return this.wasmModule.compute_activity_transition_matrix(this.handle, activityKey);
  }

  /**
   * Temporal Speedup Analysis - identify process acceleration/deceleration patterns
   */
  analyzeProcessSpeedup(options: { timestampKey?: string; windowSize?: number } = {}): any {
    const timestampKey = options.timestampKey || 'time:timestamp';
    const windowSize = options.windowSize || 50;

    return this.wasmModule.analyze_process_speedup(this.handle, timestampKey, windowSize);
  }

  /**
   * Trace Similarity Matrix - compute pairwise trace distance/similarity
   */
  getTraceSimilarityMatrix(activityKey: string = 'concept:name'): any {
    return this.wasmModule.compute_trace_similarity_matrix(this.handle, activityKey);
  }

  /**
   * Temporal Bottlenecks - identify time-based performance bottlenecks
   */
  getTemporalBottlenecks(options: { activityKey?: string; timestampKey?: string } = {}): any {
    const activityKey = options.activityKey || 'concept:name';
    const timestampKey = options.timestampKey || 'time:timestamp';

    return this.wasmModule.analyze_temporal_bottlenecks(this.handle, activityKey, timestampKey);
  }

  /**
   * Activity Ordering - extract mandatory predecessor ordering from traces
   */
  getActivityOrdering(activityKey: string = 'concept:name'): any {
    return this.wasmModule.extract_activity_ordering(this.handle, activityKey);
  }

  /**
   * Generate dotted chart data for visualization
   */
  getDottedChart(activityKey: string = 'concept:name'): any {
    return this.wasmModule.analyze_dotted_chart(this.handle);
  }

  /**
   * Calculate case durations
   */
  calculateCaseDurations(timestampKey: string = 'time:timestamp'): any[] {
    return this.wasmModule.calculate_trace_durations(this.handle, timestampKey);
  }

  /**
   * Check if log has timestamp attributes
   */
  hasTimestamps(timestampKey: string = 'time:timestamp'): boolean {
    return this.wasmModule.validate_has_timestamps(this.handle, timestampKey);
  }

  /**
   * Check if log has activity attributes
   */
  hasActivities(activityKey: string = 'concept:name'): boolean {
    return this.wasmModule.validate_has_activities(this.handle, activityKey);
  }

  /**
   * Export the log to JSON
   */
  toJSON(): string {
    return this.wasmModule.export_eventlog_to_json(this.handle);
  }

  /**
   * Export the log to XES format
   */
  toXES(): string {
    return this.wasmModule.export_eventlog_to_xes(this.handle);
  }

  /**
   * Extract case-level features for predictive modeling
   */
  extractCaseFeatures(
    activityKey: string = 'concept:name',
    timestampKey: string = 'time:timestamp',
    config: api.FeatureExtractionConfig = { features: [], target: 'outcome' }
  ): Promise<api.FeatureVector[]> {
    try {
      const result = this.wasmModule.extract_case_features(
        this.handle,
        activityKey,
        timestampKey,
        JSON.stringify(config)
      );
      return Promise.resolve(JSON.parse(result));
    } catch (error) {
      return Promise.reject(new Error(`Failed to extract case features: ${error}`));
    }
  }

  /**
   * Extract prefix-level features for remaining time/outcome prediction
   */
  extractPrefixFeatures(
    activityKey: string = 'concept:name',
    timestampKey: string = 'time:timestamp',
    prefixLength: number = 5
  ): Promise<api.FeatureVector[]> {
    try {
      const result = this.wasmModule.extract_prefix_features(
        this.handle,
        activityKey,
        timestampKey,
        prefixLength
      );
      return Promise.resolve(JSON.parse(result));
    } catch (error) {
      return Promise.reject(new Error(`Failed to extract prefix features: ${error}`));
    }
  }

  /**
   * Export extracted features as CSV
   */
  exportFeaturesAsCSV(
    activityKey: string = 'concept:name',
    timestampKey: string = 'time:timestamp',
    config: api.FeatureExtractionConfig = { features: [], target: 'outcome' }
  ): Promise<string> {
    try {
      const featuresJson = this.wasmModule.export_features_json(
        this.handle,
        activityKey,
        timestampKey,
        JSON.stringify(config)
      );
      const result = this.wasmModule.export_features_csv(featuresJson);
      return Promise.resolve(result);
    } catch (error) {
      return Promise.reject(new Error(`Failed to export features as CSV: ${error}`));
    }
  }

  /**
   * Check data quality of the event log
   */
  checkDataQuality(
    activityKey: string = 'concept:name',
    timestampKey: string = 'time:timestamp'
  ): Promise<api.DataQualityResult> {
    try {
      const result = this.wasmModule.check_data_quality(this.handle, activityKey, timestampKey);
      return Promise.resolve(JSON.parse(result));
    } catch (error) {
      return Promise.reject(new Error(`Failed to check data quality: ${error}`));
    }
  }

  /**
   * Infer event log schema automatically
   */
  inferSchema(): Promise<api.SchemaInference> {
    try {
      const result = this.wasmModule.infer_eventlog_schema(this.handle);
      return Promise.resolve(JSON.parse(result));
    } catch (error) {
      return Promise.reject(new Error(`Failed to infer schema: ${error}`));
    }
  }

  /**
   * Analyze resource utilization
   */
  analyzeResourceUtilization(
    resourceKey: string = 'org:resource',
    timestampKey: string = 'time:timestamp'
  ): Promise<api.ResourceUtilization[]> {
    try {
      const result = this.wasmModule.analyze_resource_utilization(
        this.handle,
        resourceKey,
        timestampKey
      );
      return Promise.resolve(JSON.parse(result));
    } catch (error) {
      return Promise.reject(new Error(`Failed to analyze resource utilization: ${error}`));
    }
  }

  /**
   * Analyze resource-activity interactions
   */
  analyzeResourceActivityMatrix(
    resourceKey: string = 'org:resource',
    activityKey: string = 'concept:name'
  ): Promise<api.ResourceActivityMatrix> {
    try {
      const result = this.wasmModule.analyze_resource_activity_matrix(
        this.handle,
        resourceKey,
        activityKey
      );
      return Promise.resolve(JSON.parse(result));
    } catch (error) {
      return Promise.reject(new Error(`Failed to analyze resource-activity matrix: ${error}`));
    }
  }

  /**
   * Identify resource bottlenecks
   */
  identifyResourceBottlenecks(
    resourceKey: string = 'org:resource',
    timestampKey: string = 'time:timestamp',
    activityKey: string = 'concept:name'
  ): Promise<api.ResourceBottleneck[]> {
    try {
      const result = this.wasmModule.identify_resource_bottlenecks(
        this.handle,
        resourceKey,
        timestampKey,
        activityKey
      );
      return Promise.resolve(JSON.parse(result));
    } catch (error) {
      return Promise.reject(new Error(`Failed to identify resource bottlenecks: ${error}`));
    }
  }

  /**
   * Cleanup: delete the log from WASM memory
   */
  delete(): void {
    this.wasmModule.delete_object(this.handle);
  }
}

/**
 * Handle to an OCEL stored in WASM memory
 */
export class OCELHandle {
  constructor(
    private handle: OCELHandleId,
    private wasmModule: typeof WasmModule
  ) {}

  /**
   * Get the handle ID
   */
  getId(): OCELHandleId {
    return this.handle;
  }

  /**
   * Get basic statistics about the OCEL
   */
  getStats(): { total_events: number; total_objects: number } {
    return this.wasmModule.analyze_ocel_statistics(this.handle);
  }

  /**
   * Get the total number of events in the OCEL
   */
  getEventCount(): number {
    return this.wasmModule.get_ocel_event_count(this.handle);
  }

  /**
   * Get the total number of objects in the OCEL
   */
  getObjectCount(): number {
    return this.wasmModule.get_ocel_object_count(this.handle);
  }

  /**
   * Discover Object-Centric DFG
   */
  discoverOCDFG(options: { minFrequency?: number } = {}): DFGHandle {
    const minFrequency = options.minFrequency || 1;
    const result = this.wasmModule.discover_ocel_dfg(this.handle);
    return new DFGHandle(asDFGHandleId(result.handle), this.wasmModule);
  }

  /**
   * Export to JSON
   */
  toJSON(): string {
    return this.wasmModule.export_ocel_to_json(this.handle);
  }

  /**
   * List all object types in the OCEL
   */
  listObjectTypes(): Promise<string[]> {
    try {
      const result = this.wasmModule.list_ocel_object_types(this.handle);
      return Promise.resolve(JSON.parse(result));
    } catch (error) {
      return Promise.reject(new Error(`Failed to list object types: ${error}`));
    }
  }

  /**
   * Get statistics for each object type
   */
  getTypeStatistics(): Promise<Record<string, any>> {
    try {
      const result = this.wasmModule.get_ocel_type_statistics(this.handle);
      return Promise.resolve(JSON.parse(result));
    } catch (error) {
      return Promise.reject(new Error(`Failed to get type statistics: ${error}`));
    }
  }

  /**
   * Flatten OCEL to EventLog for a specific object type
   */
  flattenToEventLog(objectType: string): EventLogHandle {
    try {
      const result = this.wasmModule.flatten_ocel_to_eventlog(this.handle, objectType);
      return new EventLogHandle(asEventLogHandleId(result), this.wasmModule);
    } catch (error) {
      throw new Error(`Failed to flatten OCEL to EventLog: ${error}`);
    }
  }

  /**
   * Discover DFG for each object type
   */
  discoverDFGPerType(): Promise<Record<string, api.DirectlyFollowsGraph>> {
    try {
      const result = this.wasmModule.discover_ocel_dfg_per_type(this.handle);
      return Promise.resolve(JSON.parse(result));
    } catch (error) {
      return Promise.reject(new Error(`Failed to discover DFG per type: ${error}`));
    }
  }

  /**
   * Cleanup: delete from WASM memory
   */
  delete(): void {
    this.wasmModule.delete_object(this.handle);
  }
}

/**
 * Handle to a Directly-Follows Graph
 */
export class DFGHandle {
  constructor(
    private handle: DFGHandleId,
    private wasmModule: typeof WasmModule
  ) {}

  /**
   * Get the handle ID
   */
  getId(): DFGHandleId {
    return this.handle;
  }

  /**
   * Get the DFG as JSON
   */
  toJSON(): api.DirectlyFollowsGraph {
    const json = this.wasmModule.export_dfg_to_json(this.handle);
    return JSON.parse(json);
  }

  /**
   * Cleanup
   */
  delete(): void {
    this.wasmModule.delete_object(this.handle);
  }
}

/**
 * Handle to a Petri Net
 */
export class PetriNetHandle {
  constructor(
    private handle: PetriNetHandleId,
    private wasmModule: typeof WasmModule
  ) {}

  /**
   * Get the handle ID
   */
  getId(): PetriNetHandleId {
    return this.handle;
  }

  /**
   * Get the Petri Net as JSON
   */
  toJSON(): api.PetriNet {
    const json = this.wasmModule.export_petri_net_to_json(this.handle);
    return JSON.parse(json);
  }

  /**
   * Check conformance of an EventLog against this Petri Net
   */
  checkConformance(log: EventLogHandle, activityKey: string = 'concept:name'): any {
    return this.wasmModule.check_token_based_replay(log.getId(), this.handle, activityKey);
  }

  /**
   * Cleanup
   */
  delete(): void {
    this.wasmModule.delete_object(this.handle);
  }
}

/**
 * Handle to a DECLARE model
 */
export class DeclareModelHandle {
  constructor(
    private handle: DeclareHandleId,
    private wasmModule: typeof WasmModule
  ) {}

  /**
   * Get the handle ID
   */
  getId(): DeclareHandleId {
    return this.handle;
  }

  /**
   * Get the model as JSON
   */
  toJSON(): api.DeclareModel {
    // Phase 2A: export function not yet in WASM .d.ts; cast to preserve forward compat
    const exportFn = (this.wasmModule as any).export_declare_model_to_json as
      | ((handle: string) => string)
      | undefined;
    if (!exportFn)
      throw new Error('export_declare_model_to_json not available in current WASM build');
    const json = exportFn(this.handle);
    return JSON.parse(json);
  }

  /**
   * Cleanup
   */
  delete(): void {
    this.wasmModule.delete_object(this.handle);
  }
}

/**
 * Handle to an Object-Centric Petri Net
 */
export class OCPetriNetHandle {
  constructor(
    private handle: OCPetriNetHandleId,
    private wasmModule: typeof WasmModule
  ) {}

  /**
   * Get the handle ID
   */
  getId(): OCPetriNetHandleId {
    return this.handle;
  }

  /**
   * Get the OC Petri Net as JSON
   */
  toJSON(): api.OCPetriNet {
    // Phase 2A: export function not yet in WASM .d.ts; cast to preserve forward compat
    const exportFn = (this.wasmModule as any).export_oc_petri_net_to_json as
      | ((handle: string) => string)
      | undefined;
    if (!exportFn)
      throw new Error('export_oc_petri_net_to_json not available in current WASM build');
    const json = exportFn(this.handle);
    return JSON.parse(json);
  }

  /**
   * Export as PNML format (Petri Net Markup Language)
   */
  toPNML(): string {
    // Phase 2A: export function not yet in WASM .d.ts; cast to preserve forward compat
    const exportFn = (this.wasmModule as any).export_oc_petri_net_to_pnml as
      | ((handle: string) => string)
      | undefined;
    if (!exportFn)
      throw new Error('export_oc_petri_net_to_pnml not available in current WASM build');
    return exportFn(this.handle);
  }

  /**
   * Cleanup
   */
  delete(): void {
    this.wasmModule.delete_object(this.handle);
  }
}

/**
 * Handle to a Temporal Profile stored in WASM memory
 */
export class TemporalProfileHandle {
  constructor(
    private handle: TemporalProfileHandleId,
    private wasmModule: typeof WasmModule
  ) {}

  getId(): TemporalProfileHandleId {
    return this.handle;
  }

  /**
   * Check conformance of an EventLog against this temporal profile
   * @param log - EventLog to check
   * @param zeta - z-score threshold for deviation detection (default 2.0)
   */
  checkConformance(
    log: EventLogHandle,
    options: { activityKey?: string; timestampKey?: string; zeta?: number } = {}
  ): any {
    const activityKey = options.activityKey || 'concept:name';
    const timestampKey = options.timestampKey || 'time:timestamp';
    const zeta = options.zeta || 2.0;
    return this.wasmModule.check_temporal_conformance(
      log.getId(),
      this.handle,
      activityKey,
      timestampKey,
      zeta
    );
  }

  delete(): void {
    this.wasmModule.delete_object(this.handle);
  }
}

/**
 * Handle to an N-Gram Predictor stored in WASM memory
 */
export class NGramPredictorHandle {
  constructor(
    private handle: NGramPredictorHandleId,
    private wasmModule: typeof WasmModule
  ) {}

  getId(): NGramPredictorHandleId {
    return this.handle;
  }

  /**
   * Predict the next activity given a prefix of activities (simple, returns raw value)
   * @param prefix - array of activity names forming the prefix
   */
  predictNextActivity(prefix: string[]): any {
    return this.wasmModule.predict_next_activity(this.handle, JSON.stringify(prefix));
  }

  /**
   * Predict top-k next activities with probabilities, confidence, and entropy.
   * Returns `{ activities: string[], probabilities: number[], confidence: number, entropy: number }`
   * @param prefix - array of activity names forming the current prefix
   * @param k - number of top candidates to return
   */
  predictNextK(prefix: string[], k: number): any {
    return JSON.parse(this.wasmModule.predict_next_k(this.handle, JSON.stringify(prefix), k));
  }

  /**
   * Beam-search future paths from the current prefix.
   * Returns an array of `{ sequence: string[], probability: number, length: number }`
   * sorted by descending probability.
   * @param prefix - array of activity names forming the current prefix
   * @param beamWidth - number of beams (candidate paths) to keep at each step
   * @param maxSteps - maximum number of future activities to project
   */
  predictBeamPaths(prefix: string[], beamWidth: number, maxSteps: number): any {
    return JSON.parse(
      this.wasmModule.predict_beam_paths(this.handle, JSON.stringify(prefix), beamWidth, maxSteps)
    );
  }

  /**
   * Score the likelihood of a complete trace (returns plain log-probability float).
   * @param activities - array of activity names in the trace
   */
  scoreTraceLikelihood(activities: string[]): any {
    return this.wasmModule.score_trace_likelihood(this.handle, JSON.stringify(activities));
  }

  /**
   * Score trace likelihood with structured output.
   * Returns `{ log_likelihood: number, normalized: number }`
   * @param activities - array of activity names in the trace
   */
  computeTraceLikelihood(activities: string[]): any {
    return this.wasmModule.compute_trace_likelihood(this.handle, JSON.stringify(activities));
  }

  delete(): void {
    this.wasmModule.delete_object(this.handle);
  }
}

// ---------------------------------------------------------------------------
// RemainingTimeModelHandle
// ---------------------------------------------------------------------------

/**
 * Handle to a Remaining Time Model stored in WASM memory.
 * Answers "When will this case complete?"
 *
 * Build with `ProcessMiningClient.buildRemainingTimeModel()`.
 */
export class RemainingTimeModelHandle {
  constructor(
    private handle: string,
    private wasmModule: typeof WasmModule
  ) {}

  getId(): string {
    return this.handle;
  }

  /**
   * Estimate remaining time for a running case given its activity prefix.
   * Returns `{ remaining_ms: number, confidence: number, method: string }`
   * @param prefix - array of activity names observed so far
   */
  predictCaseDuration(prefix: string[]): any {
    return this.wasmModule.predict_case_duration(this.handle, JSON.stringify(prefix));
  }

  /**
   * Instantaneous hazard rate at a given elapsed time.
   * Returns `{ hazard_rate, survival_probability, cumulative_hazard, median_remaining_ms, shape, scale }`
   * @param elapsedMs - milliseconds elapsed since case start
   */
  predictHazardRate(elapsedMs: number): any {
    return this.wasmModule.predict_hazard_rate(this.handle, elapsedMs);
  }

  delete(): void {
    this.wasmModule.delete_object(this.handle);
  }
}

/**
 * Handle to a Streaming DFG builder stored in WASM memory
 */
export class StreamingDFGHandle {
  constructor(
    private handle: StreamingDFGHandleId,
    private wasmModule: typeof WasmModule
  ) {}

  getId(): StreamingDFGHandleId {
    return this.handle;
  }

  /**
   * Add a single event to the streaming DFG
   */
  addEvent(caseId: string, activity: string): any {
    return this.wasmModule.streaming_dfg_add_event(this.handle, caseId, activity);
  }

  /**
   * Add a batch of events as JSON array
   * @param eventsJson - JSON string of [{case_id, activity}, ...]
   */
  addBatch(eventsJson: string): any {
    return this.wasmModule.streaming_dfg_add_batch(this.handle, eventsJson);
  }

  /**
   * Close a trace (mark case as complete)
   */
  closeTrace(caseId: string): any {
    return this.wasmModule.streaming_dfg_close_trace(this.handle, caseId);
  }

  /**
   * Flush all open traces (close them without explicit close)
   */
  flushOpen(): any {
    return this.wasmModule.streaming_dfg_flush_open(this.handle);
  }

  /**
   * Take a snapshot of the current DFG state
   */
  snapshot(): any {
    return this.wasmModule.streaming_dfg_snapshot(this.handle);
  }

  /**
   * Finalize the streaming DFG and produce the final result
   */
  finalize(): any {
    return this.wasmModule.streaming_dfg_finalize(this.handle);
  }

  /**
   * Get current statistics
   */
  stats(): any {
    return this.wasmModule.streaming_dfg_stats(this.handle);
  }

  delete(): void {
    this.wasmModule.delete_object(this.handle);
  }
}

/**
 * Handle to a Streaming Conformance checker stored in WASM memory
 */
export class StreamingConformanceHandle {
  constructor(
    private handle: StreamingConformanceHandleId,
    private wasmModule: typeof WasmModule
  ) {}

  getId(): StreamingConformanceHandleId {
    return this.handle;
  }

  /**
   * Add a single event for conformance checking
   */
  addEvent(caseId: string, activity: string): any {
    return this.wasmModule.streaming_conformance_add_event(this.handle, caseId, activity);
  }

  /**
   * Close a trace (mark case as complete)
   */
  closeTrace(caseId: string): any {
    return this.wasmModule.streaming_conformance_close_trace(this.handle, caseId);
  }

  /**
   * Get current conformance statistics
   */
  stats(): any {
    return this.wasmModule.streaming_conformance_stats(this.handle);
  }

  /**
   * Finalize and produce final conformance results
   */
  finalize(): any {
    return this.wasmModule.streaming_conformance_finalize(this.handle);
  }

  delete(): void {
    this.wasmModule.delete_object(this.handle);
  }
}

/**
 * Convenience function to load a file from the browser
 */
export async function loadFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

// ============================================================================
// TEXT ENCODING FUNCTIONS
// ============================================================================

/**
 * Get a reference to the WASM module (for text encoding functions)
 */
let wasmModuleGlobal: any = null;

/**
 * Initialize the global WASM module reference
 */
export function initializePictlModule(wasmModule: any): void {
  wasmModuleGlobal = wasmModule;
}

/**
 * Encode DFG as plain text representation
 */
export async function encodeTextAsText(dfgHandle: DFGHandle): Promise<string> {
  if (!wasmModuleGlobal) {
    throw new Error('WASM module not initialized. Call initializePictlModule() first.');
  }
  try {
    return wasmModuleGlobal.encode_dfg_as_text(dfgHandle.getId());
  } catch (error) {
    throw new Error(`Failed to encode DFG as text: ${error}`);
  }
}

/**
 * Encode variants as text representation
 */
export async function encodeVariantsAsText(
  logHandle: EventLogHandle,
  activityKey: string = 'concept:name',
  topN: number = 10
): Promise<string> {
  if (!wasmModuleGlobal) {
    throw new Error('WASM module not initialized. Call initializePictlModule() first.');
  }
  try {
    return wasmModuleGlobal.encode_variants_as_text(logHandle.getId(), activityKey, topN);
  } catch (error) {
    throw new Error(`Failed to encode variants as text: ${error}`);
  }
}

/**
 * Encode event log as text summary
 */
export async function encodeLogAsText(logHandle: EventLogHandle): Promise<string> {
  if (!wasmModuleGlobal) {
    throw new Error('WASM module not initialized. Call initializePictlModule() first.');
  }
  try {
    return wasmModuleGlobal.encode_statistics_as_text(logHandle.getId());
  } catch (error) {
    throw new Error(`Failed to encode log as text: ${error}`);
  }
}

/**
 * Encode Petri Net as text representation
 */
export async function encodePetriNetAsText(petriNetHandle: PetriNetHandle): Promise<string> {
  if (!wasmModuleGlobal) {
    throw new Error('WASM module not initialized. Call initializePictlModule() first.');
  }
  try {
    return wasmModuleGlobal.encode_petri_net_as_text(petriNetHandle.getId());
  } catch (error) {
    throw new Error(`Failed to encode Petri Net as text: ${error}`);
  }
}

/**
 * Encode OCEL as text representation
 */
export async function encodeOCELAsText(ocelHandle: OCELHandle): Promise<string> {
  if (!wasmModuleGlobal) {
    throw new Error('WASM module not initialized. Call initializePictlModule() first.');
  }
  try {
    return wasmModuleGlobal.encode_ocel_as_text(ocelHandle.getId());
  } catch (error) {
    throw new Error(`Failed to encode OCEL as text: ${error}`);
  }
}

/**
 * Encode object-centric Petri Net as text representation
 */
export async function encodeOCPetriNetAsText(ocpnHandle: OCPetriNetHandle): Promise<string> {
  if (!wasmModuleGlobal) {
    throw new Error('WASM module not initialized. Call initializePictlModule() first.');
  }
  try {
    return wasmModuleGlobal.encode_oc_petri_net_as_text(ocpnHandle.getId());
  } catch (error) {
    throw new Error(`Failed to encode OC Petri Net as text: ${error}`);
  }
}

/**
 * Encode process model comparison as text
 */
export async function encodeModelComparisonAsText(
  model1Handle: DFGHandle | PetriNetHandle,
  model2Handle: DFGHandle | PetriNetHandle
): Promise<string> {
  if (!wasmModuleGlobal) {
    throw new Error('WASM module not initialized. Call initializePictlModule() first.');
  }
  try {
    const id1 = model1Handle instanceof DFGHandle ? model1Handle.getId() : model1Handle.getId();
    const id2 = model2Handle instanceof DFGHandle ? model2Handle.getId() : model2Handle.getId();
    return wasmModuleGlobal.encode_model_comparison_as_text(id1, id2);
  } catch (error) {
    throw new Error(`Failed to encode model comparison as text: ${error}`);
  }
}

// =============================================================================
// Van der Aalst Prediction API — standalone functions
// =============================================================================
// These wrap the six perspective modules introduced in Phase 4.
// They all require the global WASM module (call initializePictlModule() first).

// ---------------------------------------------------------------------------
// Outcome prediction (answers "Does this case complete normally?")
// ---------------------------------------------------------------------------

/**
 * Score how anomalous a trace is relative to a DFG model.
 * Returns `{ score: number [0–1], is_anomalous: boolean, threshold: number }`
 * @param dfgHandle - handle to a discovered DFG
 * @param trace - array of activity names
 */
export function scoreAnomaly(dfgHandle: DFGHandle, trace: string[]): any {
  if (!wasmModuleGlobal) throw new Error('WASM module not initialized');
  return wasmModuleGlobal.score_anomaly(dfgHandle.getId(), JSON.stringify(trace));
}

/**
 * Estimate the probability that a running case completes normally given its prefix.
 * Returns `{ coverage: number [0–1], matching_traces: number, normal_completions: number }`
 * @param logHandle - handle to a completed EventLog used as reference
 * @param prefix - activity prefix of the running case
 * @param activityKey - attribute key for the activity name
 */
export function computeBoundaryCoverage(
  logHandle: EventLogHandle,
  prefix: string[],
  activityKey: string = 'concept:name'
): any {
  if (!wasmModuleGlobal) throw new Error('WASM module not initialized');
  return wasmModuleGlobal.compute_boundary_coverage(
    logHandle.getId(),
    JSON.stringify(prefix),
    activityKey
  );
}

// ---------------------------------------------------------------------------
// Drift detection (answers "Has the process changed?")
// ---------------------------------------------------------------------------

/**
 * Detect where process behaviour shifts in an event log using a sliding window.
 * Returns `{ drifts_detected: number, drifts: [{position, distance, type}], window_size, method }`
 * @param logHandle - handle to an EventLog
 * @param activityKey - attribute key for the activity name
 * @param windowSize - number of traces per window (default 10)
 */
export function detectDrift(
  logHandle: EventLogHandle,
  activityKey: string = 'concept:name',
  windowSize: number = 10
): any {
  if (!wasmModuleGlobal) throw new Error('WASM module not initialized');
  return JSON.parse(wasmModuleGlobal.detect_drift(logHandle.getId(), activityKey, windowSize));
}

/**
 * Compute Exponential Moving Average over a numeric series.
 * Returns `{ smoothed: number[], trend: "rising"|"falling"|"stable", last_value: number }`
 * @param values - time-series of numeric values (e.g. throughput times)
 * @param alpha - smoothing factor in (0,1]; 0.3 is a good default
 */
export function computeEwma(values: number[], alpha: number = 0.3): any {
  if (!wasmModuleGlobal) throw new Error('WASM module not initialized');
  return JSON.parse(wasmModuleGlobal.compute_ewma(JSON.stringify(values), alpha));
}

// ---------------------------------------------------------------------------
// Feature extraction (answers "What describes this case?")
// ---------------------------------------------------------------------------

/**
 * Extract numeric features from a case prefix for ML or bandit models.
 * Returns `{ length, last_activity, unique_activities, rework_count, activity_frequency_entropy }`
 * @param prefix - array of activity names observed so far
 */
export function extractPrefixFeatures(prefix: string[]): any {
  if (!wasmModuleGlobal) throw new Error('WASM module not initialized');
  return wasmModuleGlobal.extract_prefix_features_wasm(JSON.stringify(prefix));
}

/**
 * Count consecutive repeated activities (loops/rework) in a trace.
 * Returns `{ rework_count, rework_ratio, repeated_pairs: string[] }`
 * @param trace - array of activity names
 */
export function computeReworkScore(trace: string[]): any {
  if (!wasmModuleGlobal) throw new Error('WASM module not initialized');
  return wasmModuleGlobal.compute_rework_score(JSON.stringify(trace));
}

/**
 * Build a transition probability graph (probabilistic DFG) from an event log.
 * Returns `{ edges: [{from, to, probability, count}], activities: string[] }`
 * @param logHandle - handle to an EventLog
 * @param activityKey - attribute key for the activity name
 */
export function buildTransitionProbabilities(
  logHandle: EventLogHandle,
  activityKey: string = 'concept:name'
): any {
  if (!wasmModuleGlobal) throw new Error('WASM module not initialized');
  return wasmModuleGlobal.build_transition_probabilities(logHandle.getId(), activityKey);
}

// ---------------------------------------------------------------------------
// Resource & intervention (answers "What should we do?")
// ---------------------------------------------------------------------------

/**
 * Estimate average wait time using the M/M/1 queueing model.
 * Returns `{ wait_time: number, utilization: number, is_stable: boolean }`
 * @param arrivalRate - events arriving per unit time
 * @param serviceRate - events processed per unit time
 */
export function estimateQueueDelay(arrivalRate: number, serviceRate: number): any {
  if (!wasmModuleGlobal) throw new Error('WASM module not initialized');
  return wasmModuleGlobal.estimate_queue_delay(arrivalRate, serviceRate);
}

/**
 * Rank intervention options using a greedy UCB-like heuristic.
 * Returns an array of `{ name, score, rank }` sorted by descending score.
 * @param interventions - array of `{ name: string, utility: number }` objects
 * @param exploitationWeight - 0–1; higher = favour top utility (default 0.7)
 */
export function rankInterventions(
  interventions: Array<{ name: string; utility: number }>,
  exploitationWeight: number = 0.7
): any {
  if (!wasmModuleGlobal) throw new Error('WASM module not initialized');
  return wasmModuleGlobal.rank_interventions(JSON.stringify(interventions), exploitationWeight);
}

/**
 * Select the next intervention using the UCB1 multi-armed bandit algorithm.
 * Returns `{ selected: string, arm_index, ucb_score, mean_reward, exploration_bonus }`
 * @param banditState - `{ arms: [{name, total_reward, pull_count}], total_pulls }`
 * @param explorationFactor - controls exploration vs exploitation (default √2 ≈ 1.414)
 */
export function selectIntervention(
  banditState: {
    arms: Array<{ name: string; total_reward: number; pull_count: number }>;
    total_pulls: number;
  },
  explorationFactor: number = Math.SQRT2
): any {
  if (!wasmModuleGlobal) throw new Error('WASM module not initialized');
  return wasmModuleGlobal.select_intervention(JSON.stringify(banditState), explorationFactor);
}
