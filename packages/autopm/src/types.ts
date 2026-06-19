/**
 * @wasm4pm/autopm - Shared types (source of truth)
 *
 * All other modules in this package import these; they are never redefined.
 */

export interface PipelineStage {
  kind: 'discover' | 'conform' | 'reason';
  algorithm?: string;
  breed?: string;
  params: Record<string, number | string | boolean>;
}

export interface PipelineGenome {
  stages: PipelineStage[];
}

export interface Objectives {
  quality: number; /* maximize, [0,1] */
  cost: number; /* minimize, ms-ish */
}

export interface LogCharacteristics {
  traceCount: number;
  eventCount: number;
  activityCount: number;
  avgTraceLength: number;
  maxTraceLength: number;
}

export interface Candidate {
  genome: PipelineGenome;
  objectives: Objectives;
  rank: number;
  receiptHash?: string;
}

export interface AutoPMResult {
  paretoFront: Candidate[];
  winner: Candidate;
  generations: number;
  seed: number;
  evaluated: number;
}
