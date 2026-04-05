/**
 * process_mining TypeScript API
 *
 * This file defines the complete TypeScript interface that mirrors the Rust library API exactly.
 * It serves as the API specification for JavaScript/WASM bindings.
 */

// ============================================================================
// CORE MODULE - Data Structures
// ============================================================================

/**
 * XES Attribute Value types
 */
export enum AttributeValueType {
  String = 'string',
  Int = 'int',
  Float = 'float',
  Date = 'date',
  Boolean = 'boolean',
  List = 'list',
  Container = 'container',
}

/**
 * An individual attribute in the event data
 */
export interface Attribute {
  key: string;
  value: AttributeValue;
  type: AttributeValueType;
}

/**
 * Different types of attribute values that can be stored
 */
export type AttributeValue =
  | { tag: 'String'; value: string }
  | { tag: 'Int'; value: number }
  | { tag: 'Float'; value: number }
  | { tag: 'Date'; value: string } // ISO 8601 format
  | { tag: 'Boolean'; value: boolean }
  | { tag: 'List'; value: AttributeValue[] }
  | { tag: 'Container'; value: Record<string, AttributeValue> };

/**
 * Attributes collection (typically a map/dict)
 */
export type Attributes = Record<string, AttributeValue>;

/**
 * An event within a trace
 */
export interface Event {
  attributes: Attributes;
}

/**
 * A trace (case) consisting of events
 */
export interface Trace {
  attributes: Attributes;
  events: Event[];
}

/**
 * XES Extension definition
 */
export interface EventLogExtension {
  name: string;
  prefix: string;
  uri: string;
}

/**
 * Event log classifier
 */
export interface EventLogClassifier {
  name: string;
  keys: string[];
}

/**
 * Global event attributes specification
 */
export interface GlobalEventAttributes {
  attributes: Attributes;
}

/**
 * Global trace attributes specification
 */
export interface GlobalTraceAttributes {
  attributes: Attributes;
}

/**
 * The main EventLog data structure - case-centric event log
 */
export interface EventLog {
  attributes: Attributes;
  extensions: EventLogExtension[];
  classifiers: EventLogClassifier[];
  globalTraceAttributes: GlobalTraceAttributes;
  globalEventAttributes: GlobalEventAttributes;
  traces: Trace[];
}

/**
 * OCEL Event Attribute definition
 */
export interface OCELEventAttribute {
  name: string;
  type: OCELAttributeType;
}

/**
 * OCEL Object Attribute definition
 */
export interface OCELObjectAttribute {
  name: string;
  type: OCELAttributeType;
}

/**
 * OCEL Type definition (for event types and object types)
 */
export interface OCELType {
  name: string;
  attributes?: OCELEventAttribute[] | OCELObjectAttribute[];
}

/**
 * OCEL Attribute value types
 */
export enum OCELAttributeType {
  String = 'string',
  Int = 'int',
  Float = 'float',
  Boolean = 'boolean',
  Timestamp = 'timestamp',
  Json = 'json',
}

/**
 * OCEL Attribute value
 */
export type OCELAttributeValue = string | number | boolean | string; // timestamp as ISO 8601

/**
 * OCEL Event
 */
export interface OCELEvent {
  id: string;
  type: string;
  timestamp: string; // ISO 8601
  attributes: Record<string, OCELAttributeValue>;
  objectIds: string[];
}

/**
 * OCEL Object
 */
export interface OCELObject {
  id: string;
  type: string;
  attributes: Record<string, OCELAttributeValue>;
}

/**
 * Relationship between events and objects
 */
export interface OCELRelationship {
  eventId: string;
  objectId: string;
}

/**
 * Object-Centric Event Log (OCEL)
 */
export interface OCEL {
  eventTypes: OCELType[];
  objectTypes: OCELType[];
  events: OCELEvent[];
  objects: OCELObject[];
  relationships?: OCELRelationship[];
}

// ============================================================================
// PROCESS MODELS - Petri Nets and DFGs
// ============================================================================

/**
 * Petri Net place
 */
export interface PetriNetPlace {
  id: string;
  label: string;
  marking?: number;
}

/**
 * Petri Net transition
 */
export interface PetriNetTransition {
  id: string;
  label: string;
  isInvisible?: boolean;
}

/**
 * Arc in a Petri Net
 */
export interface PetriNetArc {
  from: string;
  to: string;
  weight?: number;
}

/**
 * Petri Net model
 */
export interface PetriNet {
  places: PetriNetPlace[];
  transitions: PetriNetTransition[];
  arcs: PetriNetArc[];
  initialMarking: Record<string, number>;
  finalMarkings: Record<string, number>[];
}

/**
 * Directly-Follows relation
 */
export interface DirectlyFollowsRelation {
  from: string;
  to: string;
  frequency: number;
}

/**
 * Directly-Follows Graph (DFG)
 */
export interface DirectlyFollowsGraph {
  nodes: Array<{
    id: string;
    label: string;
    frequency: number;
  }>;
  edges: DirectlyFollowsRelation[];
  startActivities: Record<string, number>;
  endActivities: Record<string, number>;
}

/**
 * Object-Centric DFG
 */
export interface ObjectCentricDirectlyFollowsGraph {
  objectTypeToDFG: Record<string, DirectlyFollowsGraph>;
}

// ============================================================================
// DISCOVERY MODULE - Process Discovery Algorithms
// ============================================================================

/**
 * Alpha++ algorithm configuration
 */
export interface AlphaPlusPlusConfig {
  infrequentThreshold?: number;
  maxLoopLength?: number;
}

/**
 * DFG discovery options
 */
export interface DFGOptions {
  classifier?: EventLogClassifier;
  minFrequency?: number;
}

/**
 * OC-DECLARE modes
 */
export enum O2OMode {
  Basic = 'basic',
  Extended = 'extended',
}

/**
 * OC-DECLARE reduction modes
 */
export enum OCDeclareReductionMode {
  Union = 'union',
  Intersection = 'intersection',
}

/**
 * OC-DECLARE discovery options
 */
export interface OCDeclareDiscoveryOptions {
  mode?: O2OMode;
  reductionMode?: OCDeclareReductionMode;
  supportThreshold?: number;
  confidenceThreshold?: number;
}

/**
 * DECLARE constraint
 */
export interface DeclareConstraint {
  template: string;
  activities: string[];
  support: number;
  confidence: number;
}

/**
 * DECLARE model
 */
export interface DeclareModel {
  constraints: DeclareConstraint[];
  activities: string[];
}

/**
 * OC-DECLARE constraint (Object-Centric DECLARE)
 */
export interface OCDeclareConstraint extends DeclareConstraint {
  objectType?: string;
}

/**
 * OC-DECLARE model
 */
export interface OCDeclareModel {
  constraints: OCDeclareConstraint[];
  activities: string[];
  objectTypes: string[];
}

// ============================================================================
// ANALYSIS MODULE - Event Data Analysis
// ============================================================================

/**
 * Dotted Chart axis options
 */
export enum DottedChartXAxis {
  CaseId = 'case_id',
  EventSequence = 'event_sequence',
  EventTimestamp = 'timestamp',
  CustomAttribute = 'custom_attribute',
}

export enum DottedChartYAxis {
  CaseId = 'case_id',
  Duration = 'duration',
  CustomAttribute = 'custom_attribute',
}

export enum DottedChartColorAxis {
  Activity = 'activity',
  Resource = 'resource',
  CustomAttribute = 'custom_attribute',
}

/**
 * Dotted Chart options
 */
export interface DottedChartOptions {
  xAxis: DottedChartXAxis;
  yAxis: DottedChartYAxis;
  colorAxis?: DottedChartColorAxis;
  xAxisAttribute?: string;
  yAxisAttribute?: string;
  colorAxisAttribute?: string;
}

/**
 * A point in the dotted chart
 */
export interface DottedChartPoint {
  x: number | string;
  y: number | string;
  color?: string;
  activity: string;
  caseId: string;
}

/**
 * Dotted chart visualization data
 */
export interface DottedChartData {
  points: DottedChartPoint[];
  activities: string[];
  resources: string[];
  timeRange?: {
    start: string; // ISO 8601
    end: string; // ISO 8601
  };
}

/**
 * Event timestamp histogram
 */
export interface EventTimestampHistogram {
  buckets: Array<{
    timestamp: string; // ISO 8601
    eventCount: number;
    caseCount: number;
  }>;
  totalEvents: number;
  timeSpan: {
    start: string;
    end: string;
  };
}

/**
 * Object attribute change
 */
export interface AttributeChange {
  timestamp: string;
  attribute: string;
  oldValue: OCELAttributeValue;
  newValue: OCELAttributeValue;
  changedByEvent: string;
}

/**
 * All attribute changes for an object
 */
export interface ObjectAttributeChanges {
  objectId: string;
  objectType: string;
  changes: AttributeChange[];
}

// ============================================================================
// OCEL 2.0 EXTENSIONS
// ============================================================================

/**
 * OCEL Event-Object Reference
 */
export interface OCELEventObjectRef {
  object_id: string;
  qualifier: string;
}

/**
 * OCEL Object Relation (linking objects to each other)
 */
export interface OCELObjectRelation {
  source_id: string;
  target_id: string;
  qualifier: string;
}

/**
 * OCEL Object Attribute Change history
 */
export interface OCELObjectAttributeChange {
  timestamp: string;
  attribute_name: string;
  value: OCELAttributeValue;
}

/**
 * OCEL 2.0 extension with object relations and attribute changes
 */
export interface OCEL2 extends OCEL {
  object_relations?: OCELObjectRelation[];
}

// ============================================================================
// OBJECT-CENTRIC PETRI NETS
// ============================================================================

/**
 * Object-Centric Petri Net Place
 */
export interface OCPetriNetPlace {
  id: string;
  label: string;
  object_type: string;
}

/**
 * Object-Centric Petri Net Transition
 */
export interface OCPetriNetTransition {
  id: string;
  label: string;
  is_silent: boolean;
}

/**
 * Object-Centric Petri Net Arc
 */
export interface OCPetriNetArc {
  source: string;
  target: string;
  object_type: string;
  is_variable: boolean;
}

/**
 * Object-Centric Petri Net model
 */
export interface OCPetriNet {
  places: OCPetriNetPlace[];
  transitions: OCPetriNetTransition[];
  arcs: OCPetriNetArc[];
  object_types: string[];
}

// ============================================================================
// FEATURE EXTRACTION
// ============================================================================

/**
 * Feature extraction configuration
 */
export interface FeatureExtractionConfig {
  features: string[];
  target: 'remaining_time' | 'outcome' | 'next_activity';
}

/**
 * Feature vector for a single case/prefix
 */
export interface FeatureVector {
  [key: string]: number | string;
}

// ============================================================================
// DATA QUALITY
// ============================================================================

/**
 * Data quality issue
 */
export interface DataQualityIssue {
  type: string;
  attribute?: string;
  trace_id?: string;
  event_count?: number;
  event_indices?: number[];
}

/**
 * Data quality assessment result
 */
export interface DataQualityResult {
  valid: boolean;
  issues: DataQualityIssue[];
  total_issues: number;
}

// ============================================================================
// SCHEMA INFERENCE
// ============================================================================

/**
 * Inferred schema from event log
 */
export interface SchemaInference {
  inferred_keys: {
    activity_key: string;
    timestamp_key: string;
    resource_key?: string;
    case_id_key?: string;
  };
  attribute_types: { [key: string]: string };
  confidence: number;
}

// ============================================================================
// RESOURCE ANALYSIS
// ============================================================================

/**
 * Resource utilization statistics
 */
export interface ResourceUtilization {
  resource_id: string;
  total_events: number;
  unique_activities: number;
  avg_workload: number;
  max_workload: number;
  idle_time: number;
}

/**
 * Resource-Activity interaction matrix
 */
export interface ResourceActivityMatrix {
  resources: string[];
  activities: string[];
  interactions: Record<string, Record<string, number>>;
}

/**
 * Resource bottleneck information
 */
export interface ResourceBottleneck {
  resource_id: string;
  activity: string;
  waiting_time: number;
  frequency: number;
  severity: number;
}

// ============================================================================
// CONFORMANCE MODULE - Model Checking
// ============================================================================

/**
 * Token replay result
 */
export interface TokenReplayResult {
  caseId: string;
  isConforming: boolean;
  traceFitness: number;
  tokensMissing: number;
  tokensRemaining: number;
  deviations: Array<{
    eventIndex: number;
    activity: string;
    type: 'missing_token' | 'remaining_token' | 'unexpected_transition';
  }>;
}

/**
 * Conformance checking result
 */
export interface ConformanceResult {
  caseFitness: TokenReplayResult[];
  avgFitness: number;
  conformingCases: number;
  totalCases: number;
}

// ============================================================================
// I/O TRAITS - Import/Export
// ============================================================================

/**
 * Supported file formats
 */
export enum FileFormat {
  XES = 'xes',
  XES_GZ = 'xes.gz',
  JSON = 'json',
  JSON_GZ = 'json.gz',
  XML = 'xml',
  XML_GZ = 'xml.gz',
  CSV = 'csv',
  SQLite = 'sqlite',
  DuckDB = 'duckdb',
}

/**
 * Import options for EventLog
 */
export interface EventLogImportOptions {
  format?: FileFormat;
  encoding?: string;
  charset?: string;
}

/**
 * Export options for EventLog
 */
export interface EventLogExportOptions {
  format?: FileFormat;
  prettyPrint?: boolean;
  includeExtensions?: boolean;
}

/**
 * Import options for OCEL
 */
export interface OCELImportOptions {
  format?: FileFormat;
}

/**
 * Export options for OCEL
 */
export interface OCELExportOptions {
  format?: FileFormat;
  prettyPrint?: boolean;
}

/**
 * Importable trait - types that can be imported from files
 */
export interface Importable<T, ImportErr, ImportOpts> {
  /**
   * Import from a file path
   */
  importFromPath(path: string, options?: ImportOpts): Promise<T | ImportErr>;

  /**
   * Import from string content
   */
  importFromString(
    content: string,
    format: FileFormat,
    options?: ImportOpts
  ): Promise<T | ImportErr>;

  /**
   * Import from byte array
   */
  importFromBytes(
    bytes: ArrayBuffer,
    format: FileFormat,
    options?: ImportOpts
  ): Promise<T | ImportErr>;
}

/**
 * Exportable trait - types that can be exported to files
 */
export interface Exportable<T, ExportErr, ExportOpts> {
  /**
   * Export to a file path
   */
  exportToPath(path: string, options?: ExportOpts): Promise<ExportErr | void>;

  /**
   * Export to string
   */
  exportToString(format: FileFormat, options?: ExportOpts): Promise<string | ExportErr>;

  /**
   * Export to bytes
   */
  exportToBytes(format: FileFormat, options?: ExportOpts): Promise<ArrayBuffer | ExportErr>;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

export enum EventLogIOErrorType {
  IOError = 'io_error',
  ParseError = 'parse_error',
  SerializationError = 'serialization_error',
}

export interface EventLogIOError {
  type: EventLogIOErrorType;
  message: string;
}

export enum OCELIOErrorType {
  IOError = 'io_error',
  ParseError = 'parse_error',
  SerializationError = 'serialization_error',
  ValidationError = 'validation_error',
}

export interface OCELIOError {
  type: OCELIOErrorType;
  message: string;
}

// ============================================================================
// BINDINGS MODULE - Dynamic Function Registry
// ============================================================================

/**
 * A registered function binding
 */
export interface FunctionBinding {
  name: string;
  description?: string;
  parameters: Record<
    string,
    {
      type: string;
      description?: string;
      required: boolean;
    }
  >;
  returnType: string;
  examples?: string[];
}

/**
 * Registry of all available bindings
 */
export interface BindingsRegistry {
  functions: FunctionBinding[];
  discovery: string[];
  analysis: string[];
  conformance: string[];
}

// ============================================================================
// MAIN API INTERFACE - The complete process_mining library API
// ============================================================================

/**
 * Complete process_mining library API
 */
export interface ProcessMiningAPI {
  // -------- Core Types --------
  EventLog: typeof EventLog;
  OCEL: typeof OCEL;
  PetriNet: typeof PetriNet;
  DirectlyFollowsGraph: typeof DirectlyFollowsGraph;
  Event: typeof Event;
  Trace: typeof Trace;
  Attribute: typeof Attribute;

  // -------- Discovery --------
  discovery: {
    /**
     * Discover a Petri Net using the Alpha++ algorithm
     */
    alphaPlusPlusPetriNet(log: EventLog, options?: AlphaPlusPlusConfig): Promise<PetriNet | Error>;

    /**
     * Discover a Directly-Follows Graph
     */
    discoverDFG(log: EventLog, options?: DFGOptions): Promise<DirectlyFollowsGraph | Error>;

    /**
     * Discover an Object-Centric DFG
     */
    discoverOCDFG(
      ocel: OCEL,
      options?: DFGOptions
    ): Promise<ObjectCentricDirectlyFollowsGraph | Error>;

    /**
     * Discover DECLARE constraints
     */
    discoverDECLARE(log: EventLog): Promise<DeclareModel | Error>;

    /**
     * Discover Object-Centric DECLARE constraints
     */
    discoverOCDECLARE(
      ocel: OCEL,
      options?: OCDeclareDiscoveryOptions
    ): Promise<OCDeclareModel | Error>;

    /**
     * Discover optimal Petri Net using ILP constraint-based optimization
     */
    discoverILPPetriNet(
      log: EventLog,
      options?: {
        activityKey?: string;
      }
    ): Promise<PetriNet | Error>;

    /**
     * Discover DFG using weighted fitness-simplicity optimization
     */
    discoverOptimizedDFG(
      log: EventLog,
      options?: {
        activityKey?: string;
        fitnessWeight?: number;
        simplicityWeight?: number;
      }
    ): Promise<DirectlyFollowsGraph | Error>;

    /**
     * Discover process model using Genetic Algorithm evolution
     */
    discoverGeneticAlgorithm(
      log: EventLog,
      options?: {
        activityKey?: string;
        populationSize?: number;
        generations?: number;
      }
    ): Promise<DirectlyFollowsGraph | Error>;

    /**
     * Discover process model using Particle Swarm Optimization
     */
    discoverPSOAlgorithm(
      log: EventLog,
      options?: {
        activityKey?: string;
        swarmSize?: number;
        iterations?: number;
      }
    ): Promise<DirectlyFollowsGraph | Error>;
  };

  // -------- Analysis --------
  analysis: {
    /**
     * Generate dotted chart data
     */
    getDottedChart(log: EventLog, options?: DottedChartOptions): Promise<DottedChartData | Error>;

    /**
     * Get event timestamp histogram
     */
    getEventTimestamps(
      log: EventLog,
      bucketSize?: number
    ): Promise<EventTimestampHistogram | Error>;

    /**
     * Get object attribute changes
     */
    getObjectAttributeChanges(
      ocel: OCEL,
      objectId?: string
    ): Promise<ObjectAttributeChanges[] | Error>;
  };

  // -------- Conformance --------
  conformance: {
    /**
     * Check conformance using token-based replay
     */
    checkTokenBasedReplay(log: EventLog, petriNet: PetriNet): Promise<ConformanceResult | Error>;
  };

  // -------- I/O --------
  io: {
    /**
     * Load an EventLog
     */
    loadEventLog(path: string, options?: EventLogImportOptions): Promise<EventLog | Error>;

    /**
     * Save an EventLog
     */
    saveEventLog(
      log: EventLog,
      path: string,
      options?: EventLogExportOptions
    ): Promise<void | Error>;

    /**
     * Load OCEL
     */
    loadOCEL(path: string, options?: OCELImportOptions): Promise<OCEL | Error>;

    /**
     * Save OCEL
     */
    saveOCEL(ocel: OCEL, path: string, options?: OCELExportOptions): Promise<void | Error>;
  };

  // -------- Bindings Registry --------
  bindings: {
    /**
     * Get registry of all available function bindings
     */
    getRegistry(): Promise<BindingsRegistry | Error>;

    /**
     * Call a registered function dynamically
     */
    callFunction(name: string, params: Record<string, unknown>): Promise<unknown | Error>;
  };
}
