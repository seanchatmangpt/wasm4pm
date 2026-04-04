/**
 * wasm4pm - Process Mining WebAssembly Client Library
 *
 * High-level TypeScript API for process mining in the browser.
 * Provides intuitive access to discovery, analysis, and conformance checking.
 */

// Import types from the API definition
import * as api from './api';

/**
 * Main client for wasm4pm operations
 * Handles initialization, data management, and algorithm execution
 */
export class ProcessMiningClient {
  private initialized: boolean = false;
  private wasmModule: any = null;
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
      throw new Error(`Failed to initialize wasm4pm: ${error}`);
    }
  }

  /**
   * Load an EventLog from JSON string
   */
  loadEventLogFromJSON(jsonContent: string): EventLogHandle {
    if (!this.initialized) throw new Error('Client not initialized. Call init() first.');

    const handle = this.wasmModule.load_eventlog_from_json(jsonContent);
    return new EventLogHandle(handle, this.wasmModule);
  }

  /**
   * Load an EventLog from XES string
   */
  loadEventLogFromXES(xesContent: string): EventLogHandle {
    if (!this.initialized) throw new Error('Client not initialized. Call init() first.');

    const handle = this.wasmModule.load_eventlog_from_xes(xesContent);
    return new EventLogHandle(handle, this.wasmModule);
  }

  /**
   * Load an OCEL from JSON string
   */
  loadOCELFromJSON(jsonContent: string): OCELHandle {
    if (!this.initialized) throw new Error('Client not initialized. Call init() first.');

    const handle = this.wasmModule.load_ocel_from_json(jsonContent);
    return new OCELHandle(handle, this.wasmModule);
  }

  /**
   * Load an OCEL from XML string
   */
  loadOCELFromXML(xmlContent: string): OCELHandle {
    if (!this.initialized) throw new Error('Client not initialized. Call init() first.');

    const handle = this.wasmModule.load_ocel_from_xml(xmlContent);
    return new OCELHandle(handle, this.wasmModule);
  }

  /**
   * Get the version of wasm4pm
   */
  getVersion(): string {
    if (!this.initialized) throw new Error('Client not initialized. Call init() first.');
    return this.wasmModule.get_version();
  }
}

/**
 * Handle to an EventLog stored in WASM memory
 */
export class EventLogHandle {
  constructor(private handle: string, private wasmModule: any) {}

  /**
   * Get the handle ID
   */
  getId(): string {
    return this.handle;
  }

  /**
   * Get basic statistics about the log
   */
  getStats(): api.EventLogStats {
    try {
      const json = this.wasmModule.analyze_event_statistics(this.handle);
      return JSON.parse(json);
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
    const json = this.wasmModule.get_activities(this.handle, activityKey);
    return JSON.parse(json);
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
    const json = this.wasmModule.get_trace_length_statistics(this.handle);
    return JSON.parse(json);
  }

  /**
   * Get activity frequencies
   */
  getActivityFrequencies(activityKey: string = 'concept:name'): Array<[string, number]> {
    const json = this.wasmModule.get_activity_frequencies(this.handle, activityKey);
    return JSON.parse(json);
  }

  /**
   * Get all attribute names used in the log
   */
  getAttributeNames(): string[] {
    const json = this.wasmModule.get_attribute_names(this.handle);
    return JSON.parse(json);
  }

  /**
   * Filter the log to keep only traces containing the specified activity
   */
  filterByActivity(activity: string, activityKey: string = 'concept:name'): EventLogHandle {
    const json = this.wasmModule.filter_log_by_activity(this.handle, activityKey, activity);
    const result = JSON.parse(json);
    return new EventLogHandle(result.handle, this.wasmModule);
  }

  /**
   * Filter the log to keep only traces within the specified length range
   */
  filterByTraceLength(minLength: number, maxLength: number): EventLogHandle {
    const json = this.wasmModule.filter_log_by_trace_length(this.handle, minLength, maxLength);
    const result = JSON.parse(json);
    return new EventLogHandle(result.handle, this.wasmModule);
  }

  /**
   * Discover a Directly-Follows Graph (DFG)
   */
  discoverDFG(
    options: { activityKey?: string; minFrequency?: number } = {}
  ): DFGHandle {
    const activityKey = options.activityKey || 'concept:name';
    const minFrequency = options.minFrequency || 1;

    const json = this.wasmModule.discover_dfg_filtered(this.handle, activityKey, minFrequency);
    const result = JSON.parse(json);
    return new DFGHandle(result.handle, this.wasmModule);
  }

  /**
   * Discover DECLARE constraints
   */
  discoverDECLARE(activityKey: string = 'concept:name'): DeclareModelHandle {
    const json = this.wasmModule.discover_declare(this.handle, activityKey);
    const result = JSON.parse(json);
    return new DeclareModelHandle(result.handle, this.wasmModule);
  }

  /**
   * Discover a Petri Net using Alpha++
   */
  discoverAlphaPlusPlus(
    options: { activityKey?: string; minSupport?: number } = {}
  ): PetriNetHandle {
    const activityKey = options.activityKey || 'concept:name';
    const minSupport = options.minSupport || 0.1;

    const json = this.wasmModule.discover_alpha_plus_plus(this.handle, activityKey, minSupport);
    const result = JSON.parse(json);
    return new PetriNetHandle(result.handle, this.wasmModule);
  }

  /**
   * Discover optimal Petri Net using ILP constraint-based optimization
   */
  discoverILPPetriNet(activityKey: string = 'concept:name'): PetriNetHandle {
    const json = this.wasmModule.discover_ilp_petri_net(this.handle, activityKey);
    const result = JSON.parse(json);
    return new PetriNetHandle(result.handle, this.wasmModule);
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

    const json = this.wasmModule.discover_optimized_dfg(
      this.handle,
      activityKey,
      fitnessWeight,
      simplicityWeight
    );
    const result = JSON.parse(json);
    return new DFGHandle(result.handle, this.wasmModule);
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

    const json = this.wasmModule.discover_genetic_algorithm(
      this.handle,
      activityKey,
      populationSize,
      generations
    );
    const result = JSON.parse(json);
    return new DFGHandle(result.handle, this.wasmModule);
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

    const json = this.wasmModule.discover_pso_algorithm(
      this.handle,
      activityKey,
      swarmSize,
      iterations
    );
    const result = JSON.parse(json);
    return new DFGHandle(result.handle, this.wasmModule);
  }

  /**
   * A* Search-based discovery - informed heuristic search for optimal models
   */
  discoverAStar(
    options: { activityKey?: string; maxIterations?: number } = {}
  ): DFGHandle {
    const activityKey = options.activityKey || 'concept:name';
    const maxIterations = options.maxIterations || 1000;

    const json = this.wasmModule.discover_astar(this.handle, activityKey, maxIterations);
    const result = JSON.parse(json);
    return new DFGHandle(result.handle, this.wasmModule);
  }

  /**
   * Hill Climbing - greedy local optimization to maximal fitness
   */
  discoverHillClimbing(activityKey: string = 'concept:name'): DFGHandle {
    const json = this.wasmModule.discover_hill_climbing(this.handle, activityKey);
    const result = JSON.parse(json);
    return new DFGHandle(result.handle, this.wasmModule);
  }

  /**
   * Analyze trace variants - extract unique process paths and frequencies
   */
  getTraceVariants(activityKey: string = 'concept:name'): any {
    const json = this.wasmModule.analyze_trace_variants(this.handle, activityKey);
    return JSON.parse(json);
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

    const json = this.wasmModule.mine_sequential_patterns(
      this.handle,
      activityKey,
      minSupport,
      patternLength
    );
    return JSON.parse(json);
  }

  /**
   * Detect concept drift - identify where process behavior changes
   */
  detectConceptDrift(
    options: { activityKey?: string; windowSize?: number } = {}
  ): any {
    const activityKey = options.activityKey || 'concept:name';
    const windowSize = options.windowSize || 50;

    const json = this.wasmModule.detect_concept_drift(this.handle, activityKey, windowSize);
    return JSON.parse(json);
  }

  /**
   * Cluster traces - group similar traces for variant analysis
   */
  clusterTraces(options: { activityKey?: string; numClusters?: number } = {}): any {
    const activityKey = options.activityKey || 'concept:name';
    const numClusters = options.numClusters || 5;

    const json = this.wasmModule.cluster_traces(this.handle, activityKey, numClusters);
    return JSON.parse(json);
  }

  /**
   * Analyze start/end activities - find entry and exit points in process
   */
  getStartEndActivities(activityKey: string = 'concept:name'): any {
    const json = this.wasmModule.analyze_start_end_activities(this.handle, activityKey);
    return JSON.parse(json);
  }

  /**
   * Activity co-occurrence - find activities that happen together in traces
   */
  getActivityCooccurrence(activityKey: string = 'concept:name'): any {
    const json = this.wasmModule.analyze_activity_cooccurrence(this.handle, activityKey);
    return JSON.parse(json);
  }

  /**
   * Inductive Miner - recursive structure discovery with direct follows graph
   */
  discoverInductiveMiner(activityKey: string = 'concept:name'): DFGHandle {
    const json = this.wasmModule.discover_inductive_miner(this.handle, activityKey);
    const result = JSON.parse(json);
    return new DFGHandle(result.handle, this.wasmModule);
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

    const json = this.wasmModule.discover_ant_colony(
      this.handle,
      activityKey,
      numAnts,
      iterations
    );
    const result = JSON.parse(json);
    return new DFGHandle(result.handle, this.wasmModule);
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

    const json = this.wasmModule.discover_simulated_annealing(
      this.handle,
      activityKey,
      temperature,
      coolingRate
    );
    const result = JSON.parse(json);
    return new DFGHandle(result.handle, this.wasmModule);
  }

  /**
   * Extract Process Skeleton - minimal model keeping only frequent edges
   */
  extractProcessSkeleton(
    options: { activityKey?: string; minFrequency?: number } = {}
  ): DFGHandle {
    const activityKey = options.activityKey || 'concept:name';
    const minFrequency = options.minFrequency || 2;

    const json = this.wasmModule.extract_process_skeleton(
      this.handle,
      activityKey,
      minFrequency
    );
    const result = JSON.parse(json);
    return new DFGHandle(result.handle, this.wasmModule);
  }

  /**
   * Analyze Activity Dependencies - identify predecessors and successors
   */
  getActivityDependencies(activityKey: string = 'concept:name'): any {
    const json = this.wasmModule.analyze_activity_dependencies(this.handle, activityKey);
    return JSON.parse(json);
  }

  /**
   * Analyze Case Attributes - correlate case-level attributes with process
   */
  getCaseAttributeAnalysis(activityKey: string = 'concept:name'): any {
    const json = this.wasmModule.analyze_case_attributes(this.handle, activityKey);
    return JSON.parse(json);
  }

  /**
   * Generate dotted chart data for visualization
   */
  getDottedChart(activityKey: string = 'concept:name'): any {
    const json = this.wasmModule.analyze_dotted_chart(this.handle);
    return JSON.parse(json);
  }

  /**
   * Calculate case durations
   */
  calculateCaseDurations(timestampKey: string = 'time:timestamp'): any[] {
    const json = this.wasmModule.calculate_trace_durations(this.handle, timestampKey);
    return JSON.parse(json);
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
  constructor(private handle: string, private wasmModule: any) {}

  /**
   * Get the handle ID
   */
  getId(): string {
    return this.handle;
  }

  /**
   * Get basic statistics about the OCEL
   */
  getStats(): { total_events: number; total_objects: number } {
    const json = this.wasmModule.analyze_ocel_statistics(this.handle);
    return JSON.parse(json);
  }

  /**
   * Get number of events
   */
  getEventCount(): number {
    return this.wasmModule.get_ocel_event_count(this.handle);
  }

  /**
   * Get number of objects
   */
  getObjectCount(): number {
    return this.wasmModule.get_ocel_object_count(this.handle);
  }

  /**
   * Discover Object-Centric DFG
   */
  discoverOCDFG(options: { minFrequency?: number } = {}): DFGHandle {
    const minFrequency = options.minFrequency || 1;
    const json = this.wasmModule.discover_ocel_dfg(this.handle);
    const result = JSON.parse(json);
    return new DFGHandle(result.handle, this.wasmModule);
  }

  /**
   * Export to JSON
   */
  toJSON(): string {
    return this.wasmModule.export_ocel_to_json(this.handle);
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
  constructor(private handle: string, private wasmModule: any) {}

  /**
   * Get the handle ID
   */
  getId(): string {
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
  constructor(private handle: string, private wasmModule: any) {}

  /**
   * Get the handle ID
   */
  getId(): string {
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
    const json = this.wasmModule.check_token_based_replay(log.getId(), this.handle, activityKey);
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
 * Handle to a DECLARE model
 */
export class DeclareModelHandle {
  constructor(private handle: string, private wasmModule: any) {}

  /**
   * Get the handle ID
   */
  getId(): string {
    return this.handle;
  }

  /**
   * Get the model as JSON
   */
  toJSON(): api.DeclareModel {
    const json = this.wasmModule.export_declare_model_to_json(this.handle);
    return JSON.parse(json);
  }

  /**
   * Cleanup
   */
  delete(): void {
    this.wasmModule.delete_object(this.handle);
  }
}

// Type definitions for client API
export interface EventLogStats {
  total_events: number;
  total_cases: number;
  avg_events_per_case: number;
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
