/**
 * Artifact Type Definitions
 *
 * Concrete TypeScript interfaces for each artifact type that sinks handle.
 * These provide typed alternatives to the `unknown` artifact parameter in SinkAdapter.write().
 */

import { z } from 'zod';

/**
 * Receipt artifact — proof of execution
 */
export const ReceiptArtifactSchema = z.object({
  run_id: z.string(),
  timestamp: z.string(),
  algorithm: z.string(),
  input_file: z.string().optional(),
  status: z.enum(['success', 'failed', 'partial']),
  event_count: z.number().optional(),
  trace_count: z.number().optional(),
  duration_ms: z.number().optional(),
  error: z.string().optional(),
  schema_version: z.string().optional(),
  hashes: z.object({
    config: z.string().optional(),
    input: z.string().optional(),
    plan: z.string().optional(),
  }).optional(),
});

export type ReceiptArtifact = z.infer<typeof ReceiptArtifactSchema>;

/**
 * Model artifact — discovered process model
 */
export const ModelArtifactSchema = z.object({
  name: z.string(),
  type: z.enum(['dfg', 'petri_net', 'declare', 'tree']).optional(),
  petriNet: z.boolean().optional(),
  nodes: z.array(z.object({ id: z.string(), label: z.string().optional() })).optional(),
  edges: z.array(z.object({ source: z.string(), target: z.string(), weight: z.number().optional() })).optional(),
  places: z.array(z.object({ id: z.string(), tokens: z.number().optional() })).optional(),
  transitions: z.array(z.object({ id: z.string(), label: z.string().optional() })).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type ModelArtifact = z.infer<typeof ModelArtifactSchema>;

/**
 * Report artifact — HTML or Markdown analysis output
 */
export const ReportArtifactSchema = z.object({
  name: z.string(),
  format: z.enum(['html', 'markdown', 'json']),
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type ReportArtifact = z.infer<typeof ReportArtifactSchema>;

/**
 * Explain snapshot — captures plan reasoning at a point in time
 */
export const ExplainSnapshotArtifactSchema = z.object({
  timestamp: z.string(),
  step: z.number().optional(),
  explanation: z.string(),
  state: z.record(z.string(), z.unknown()).optional(),
});

export type ExplainSnapshotArtifact = z.infer<typeof ExplainSnapshotArtifactSchema>;

/**
 * Status snapshot — captures execution state at a point in time
 */
export const StatusSnapshotArtifactSchema = z.object({
  timestamp: z.string(),
  state: z.string(),
  progress: z.number().optional(),
  message: z.string().optional(),
  errors: z.array(z.object({ code: z.string(), message: z.string() })).optional(),
});

export type StatusSnapshotArtifact = z.infer<typeof StatusSnapshotArtifactSchema>;

/**
 * Union of all typed artifacts
 */
export type TypedArtifact =
  | ReceiptArtifact
  | ModelArtifact
  | ReportArtifact
  | ExplainSnapshotArtifact
  | StatusSnapshotArtifact;

/**
 * Map from ArtifactType to its typed interface
 */
export interface ArtifactTypeMap {
  receipt: ReceiptArtifact;
  model: ModelArtifact;
  report: ReportArtifact;
  explain_snapshot: ExplainSnapshotArtifact;
  status_snapshot: StatusSnapshotArtifact;
}

/**
 * Type guard: check if artifact matches expected receipt shape
 */
export function isReceiptArtifact(artifact: unknown): artifact is ReceiptArtifact {
  const a = artifact as Record<string, unknown>;
  return (
    typeof a === 'object' &&
    a !== null &&
    typeof a.run_id === 'string' &&
    typeof a.timestamp === 'string' &&
    typeof a.algorithm === 'string' &&
    typeof a.status === 'string'
  );
}

/**
 * Type guard: check if artifact matches expected model shape
 */
export function isModelArtifact(artifact: unknown): artifact is ModelArtifact {
  const a = artifact as Record<string, unknown>;
  return typeof a === 'object' && a !== null && typeof a.name === 'string';
}

/**
 * Type guard: check if artifact matches expected report shape
 */
export function isReportArtifact(artifact: unknown): artifact is ReportArtifact {
  const a = artifact as Record<string, unknown>;
  return (
    typeof a === 'object' &&
    a !== null &&
    typeof a.name === 'string' &&
    typeof a.format === 'string' &&
    typeof a.content === 'string'
  );
}
