/**
 * wasm4pm Type Definitions
 * Generated from schema verification
 */

export interface EventLog {
  traces: Trace[];
  attributes?: Record<string, unknown>;
}

export interface Trace {
  caseId: string;
  events: Event[];
  attributes?: Record<string, unknown>;
}

export interface Event {
  activity: string;
  timestamp?: Date | string;
  attributes?: Record<string, unknown>;
  resource?: string;
  cost?: number;
}

export interface PetriNet {
  places: string[];
  transitions: string[];
  arcs: Arc[];
  initialMarking?: Map<string, number>;
  finalMarkings?: Map<string, number>[];
}

export interface Arc {
  source: string;
  target: string;
  weight?: number;
}

export interface DFG {
  nodes: string[];
  edges: DFGEdge[];
  startActivities?: Map<string, number>;
  endActivities?: Map<string, number>;
}

export interface DFGEdge {
  source: string;
  target: string;
  frequency: number;
}

export interface ProcessModel {
  model: PetriNet | DFG;
  fitness: number;
  precision: number;
  simplicity: number;
  generalization: number;
}

export interface AlgorithmOptions {
  timeout?: number;
  maxIterations?: number;
  populationSize?: number;
  mutationRate?: number;
  crossoverRate?: number;
  [key: string]: unknown;
}

export interface AnalysisResult {
  model: ProcessModel;
  executionTime: number;
  tracesFitted: number;
  warnings?: string[];
}
